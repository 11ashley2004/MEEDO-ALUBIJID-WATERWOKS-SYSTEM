// Suggested path: lib/actions/audit-log/audit-log.actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'

export type AuditLogRecord = {
  log_id: string
  user_id: string
  action: string
  description: string | null
  target_table: string | null
  target_id: string | null
  created_at: string
  user_name: string
  user_email: string | null
}

type ActionResult<T> =
  | { status: 'success'; data: T; message?: string }
  | { status: 'error'; message: string; data: T }

export async function createAuditLog(
  userId: string,
  action: string,
  description: string,
  targetTable: string,
  targetId: string,
) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('audit_logs')
    .insert({
      user_id: userId,
      action,
      description,
      target_table: targetTable,
      target_id: targetId,
      created_at: new Date().toISOString(),
    })

  if (error) {
    console.error('Failed to create audit log:', error)
  }
}

export async function getUserAuditLogs(userId: string) {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .select(`
        *,
        users:user_id (
          first_name,
          last_name,
          email
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error

    return {
      status: 'success',
      data: data || [],
    }
  } catch (error) {
    console.error('Error fetching user audit logs:', error)
    return {
      status: 'error',
      message: 'Failed to fetch audit logs',
      data: [],
    }
  }
}

/**
 * All audit logs across all users, for the admin-wide log page.
 * Optionally scoped to a date range — pass ISO date strings (yyyy-mm-dd is fine,
 * Postgres will coerce). Leave both undefined to fetch everything.
 *
 * NOTE: no server-side pagination here — this pulls everything matching the
 * date range and paginates client-side, matching the pattern used elsewhere
 * in this app. If your audit_logs table grows large, swap this for
 * `.range(from, to)` + a separate count query instead.
 */
export async function getAllAuditLogs(params?: {
  from?: string
  to?: string
}): Promise<ActionResult<AuditLogRecord[]>> {
  const supabase = await createClient()

  try {
    let query = supabase
      .from('audit_logs')
      .select(`
        *,
        users:user_id (
          first_name,
          last_name,
          email
        )
      `)
      .order('created_at', { ascending: false })

    if (params?.from) query = query.gte('created_at', params.from)
    if (params?.to) query = query.lte('created_at', params.to)

    const { data, error } = await query
    if (error) throw error

    const merged: AuditLogRecord[] = (data ?? []).map((row: any) => ({
      log_id: row.log_id,
      user_id: row.user_id,
      action: row.action,
      description: row.description,
      target_table: row.target_table,
      target_id: row.target_id,
      created_at: row.created_at,
      user_name: row.users
        ? `${row.users.first_name ?? ''} ${row.users.last_name ?? ''}`.trim() || 'Unknown'
        : 'Unknown',
      user_email: row.users?.email ?? null,
    }))

    return { status: 'success', data: merged }
  } catch (error) {
    console.error('Error fetching audit logs:', error)
    return { status: 'error', message: 'Failed to fetch audit logs', data: [] }
  }
}