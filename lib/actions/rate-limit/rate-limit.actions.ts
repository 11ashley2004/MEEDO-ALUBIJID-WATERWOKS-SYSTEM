// Suggested path: lib/actions/rate-limit/rate-limit.actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ─────────────────────────────────────────────────────────────────────────
// NOTE ON SCHEMA MISMATCH
// Your `rate_limits.rate_limit_status_id` FK points at
// `public.rate_limit_statuses` (plural). Your original CREATE TABLE defined
// the table as singular `rate_limit_status`. This file queries the plural
// name to match what you're currently using — double check your actual DB
// has the table under that name, or Postgres will have rejected the FK.
//
// Real seed data (confirmed):
//   unrestricted  → manually exempted by an admin; always allowed, never counted
//   default       → normal rules; auto lockouts via `blocked_until` still apply
//   blocked       → manually blocked by an admin; denied until `override_expires_at`
//                    passes, or forever if that's null
//
// There is no "active" status — "unblocked"/"normal" is represented by the
// `default` row. `isCurrentlyBlocked()` below encodes the three-way logic;
// `unblockRateLimit` always resolves a row back to `default`.
// ─────────────────────────────────────────────────────────────────────────

export type RateLimitRecord = {
  rate_limit_id: string
  scope: string
  identifier: string
  rate_limit_action_id: string
  action_name: string
  attempts: number
  window_start: string
  blocked_until: string | null
  lockout_count: number
  rate_limit_status_id: string
  status_name: string
  override_note: string | null
  override_by: string | null
  override_by_name: string | null
  override_at: string | null
  override_expires_at: string | null
  updated_at: string
}

type ActionResult<T> =
  | { status: 'success'; data: T; message?: string }
  | { status: 'error'; message: string; data?: undefined }

export async function getAllRateLimits(): Promise<ActionResult<RateLimitRecord[]>> {
  const supabase = await createClient()

  const { data: rateLimits, error } = await supabase
    .from('rate_limits')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) return { status: 'error', message: error.message }
  if (!rateLimits || rateLimits.length === 0) return { status: 'success', data: [] }

  const actionIds = [...new Set(rateLimits.map((r) => r.rate_limit_action_id).filter(Boolean))]
  const statusIds = [...new Set(rateLimits.map((r) => r.rate_limit_status_id).filter(Boolean))]
  const overrideByIds = [...new Set(rateLimits.map((r) => r.override_by).filter(Boolean))]

  const [actionsRes, statusesRes, usersRes] = await Promise.all([
    actionIds.length
      ? supabase.from('rate_limit_actions').select('rate_limit_action_id, action_name').in('rate_limit_action_id', actionIds)
      : Promise.resolve({ data: [] as { rate_limit_action_id: string; action_name: string }[], error: null }),
    statusIds.length
      ? supabase.from('rate_limit_statuses').select('rate_limit_status_id, status_name').in('rate_limit_status_id', statusIds)
      : Promise.resolve({ data: [] as { rate_limit_status_id: string; status_name: string }[], error: null }),
    overrideByIds.length
      ? supabase.from('users').select('user_id, first_name, last_name').in('user_id', overrideByIds)
      : Promise.resolve({ data: [] as { user_id: string; first_name: string; last_name: string }[], error: null }),
  ])

  if (actionsRes.error) return { status: 'error', message: actionsRes.error.message }
  if (statusesRes.error) return { status: 'error', message: statusesRes.error.message }
  if (usersRes.error) return { status: 'error', message: usersRes.error.message }

  const actionMap = new Map((actionsRes.data ?? []).map((a) => [a.rate_limit_action_id, a.action_name]))
  const statusMap = new Map((statusesRes.data ?? []).map((s) => [s.rate_limit_status_id, s.status_name]))
  const userMap = new Map((usersRes.data ?? []).map((u) => [u.user_id, `${u.first_name} ${u.last_name}`.trim()]))

  const merged: RateLimitRecord[] = rateLimits.map((r) => ({
    rate_limit_id: r.rate_limit_id,
    scope: r.scope,
    identifier: r.identifier,
    rate_limit_action_id: r.rate_limit_action_id,
    action_name: actionMap.get(r.rate_limit_action_id) ?? 'Unknown',
    attempts: r.attempts,
    window_start: r.window_start,
    blocked_until: r.blocked_until,
    lockout_count: r.lockout_count,
    rate_limit_status_id: r.rate_limit_status_id,
    status_name: statusMap.get(r.rate_limit_status_id) ?? 'Unknown',
    override_note: r.override_note,
    override_by: r.override_by,
    override_by_name: r.override_by ? userMap.get(r.override_by) ?? null : null,
    override_at: r.override_at,
    override_expires_at: r.override_expires_at,
    updated_at: r.updated_at,
  }))

  return { status: 'success', data: merged }
}

/**
 * Unblocks a single rate_limits row.
 *
 * FIX: previously this only cleared `blocked_until` and flipped the status
 * to "default" — it left `attempts` and `window_start` untouched. Since
 * `check_and_increment_rate_limit` only resets those counters when the
 * window naturally expires (or when it detects an auto-block that "just
 * expired" via blocked_until), an admin unblock done mid-window looked
 * fine in the UI but left `attempts` sitting at (or over) the max. The
 * very next attempt would hit `v_row.attempts + 1 > p_max_attempts` again
 * and re-lock the user almost immediately.
 *
 * Resetting `attempts` to 0 and `window_start` to now gives the user a
 * genuinely clean window, matching what the admin sees on screen.
 * `lockout_count` is intentionally left alone so a repeat offender still
 * gets an escalated block duration if they trip the limit again — clear
 * it too if you'd rather fully forgive prior lockouts on unblock.
 *
 * Adjust the `.ilike('status_name', 'default')` lookup below to match
 * whatever you actually seed into `rate_limit_statuses`.
 */
export async function unblockRateLimit(
  rateLimitId: string,
  note: string,
): Promise<ActionResult<null>> {
  const supabase = await createClient()

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) return { status: 'error', message: 'You must be signed in to do this.' }

  const { data: defaultStatus, error: statusError } = await supabase
    .from('rate_limit_statuses')
    .select('rate_limit_status_id')
    .ilike('status_name', 'default')
    .maybeSingle()

  if (statusError) return { status: 'error', message: statusError.message }
  if (!defaultStatus) {
    return {
      status: 'error',
      message: 'Could not find a "default" rate-limit status row — check your rate_limit_statuses seed data.',
    }
  }

  const now = new Date().toISOString()

  const { error } = await supabase
    .from('rate_limits')
    .update({
      attempts: 0,
      window_start: now,
      blocked_until: null,
      rate_limit_status_id: defaultStatus.rate_limit_status_id,
      override_by: authUser.id,
      override_at: now,
      override_note: note.trim() || null,
      override_expires_at: null,
      updated_at: now,
      // lockout_count intentionally untouched — see doc comment above
    })
    .eq('rate_limit_id', rateLimitId)

  if (error) return { status: 'error', message: error.message }

  revalidatePath('/admin/rate-limits')
  return { status: 'success', data: null, message: 'Unblocked successfully' }
}