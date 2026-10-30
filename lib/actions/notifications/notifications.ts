'use server'

import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@/lib/supabase/serverClient'
import config from '@/config/config'

// A recipient is either a staff user OR a consumer — never both on the same row.
type Recipient =
  | { userId: string; consumerId?: never }
  | { consumerId: string; userId?: never }

function notificationWriteClient() {
  // Prefer service role so staff/meter-reader sessions can notify a consumer.
  if (config.env.supabase.supabaseServerRoleKey) {
    return createServerClient()
  }
  return null
}

export async function createNotification(
  recipient: Recipient,
  eventCode: string,
  metadata: Record<string, any> = {},
  meterAccountId?: string | null,
  referenceId?: string | null
): Promise<{ ok: boolean; notificationId?: string; error?: string }> {
  const admin = notificationWriteClient()
  const supabase = admin ?? (await createClient())

  // Idempotent for disconnection notices keyed by billing reference_id
  if (
    eventCode === 'NOTICE_OF_DISCONNECTION' &&
    referenceId &&
    recipient.consumerId
  ) {
    const { data: existingRows } = await supabase
      .from('user_notifications')
      .select('notification_id')
      .eq('event_code', 'NOTICE_OF_DISCONNECTION')
      .eq('reference_id', referenceId)
      .eq('consumer_id', recipient.consumerId)
      .order('created_at', { ascending: false })
      .limit(1)

    const existing = existingRows?.[0]
    if (existing?.notification_id) {
      console.log('[disconnection-notify] createNotification skip duplicate', {
        notificationId: existing.notification_id,
        referenceId,
        consumerId: recipient.consumerId,
      })
      return { ok: true, notificationId: existing.notification_id }
    }
  }

  const row = {
    user_id: recipient.userId ?? null,
    consumer_id: recipient.consumerId ?? null,
    meter_account_id: meterAccountId ?? null,
    event_code: eventCode,
    metadata,
    reference_id: referenceId ?? null,
    created_at: new Date().toISOString(),
  }

  if (eventCode === 'NOTICE_OF_DISCONNECTION') {
    console.log('[disconnection-notify] createNotification insert', {
      ...row,
      via: admin ? 'service_role' : 'user_session',
    })
  }

  const { data, error } = await supabase
    .from('user_notifications')
    .insert(row)
    .select('notification_id, consumer_id, user_id, event_code, reference_id')
    .maybeSingle()

  if (error) {
    console.error('[disconnection-notify] createNotification FAILED', {
      eventCode,
      recipient,
      meterAccountId,
      referenceId,
      via: admin ? 'service_role' : 'user_session',
      error,
    })
    return { ok: false, error: error.message }
  }

  if (eventCode === 'NOTICE_OF_DISCONNECTION') {
    console.log('[disconnection-notify] createNotification OK', data)
  }

  return { ok: true, notificationId: data?.notification_id }
}

// Bulk version — same shape, for when more than one person needs to see it
// (e.g. every admin + consultant, or a mix of staff and the consumer on the
// account). Insert-only, one query, no per-row awaits.
export async function createNotifications(
  recipients: Recipient[],
  eventCode: string,
  metadata: Record<string, any> = {},
  meterAccountId?: string | null,
  referenceId?: string | null
) {
  const supabase = await createClient()

  // De-dupe by whichever id is set, so the same user/consumer never gets
  // two rows for one event.
  const seen = new Set<string>()
  const uniqueRecipients = recipients.filter((r) => {
    const key = r.userId ? `u:${r.userId}` : r.consumerId ? `c:${r.consumerId}` : null
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })

  if (!uniqueRecipients.length) return

  const rows = uniqueRecipients.map((r) => ({
    user_id: r.userId ?? null,
    consumer_id: r.consumerId ?? null,
    meter_account_id: meterAccountId ?? null,
    event_code: eventCode,
    metadata,
    reference_id: referenceId ?? null,
    created_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('user_notifications')
    .insert(rows)

  if (error) {
    console.error('Failed to create notifications:', error)
  }
}

export async function getUserIdsByRole(roleNames: string[]): Promise<string[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('users')
    .select('user_id, role:role_id!inner ( role_name )')
    .in('role.role_name', roleNames)

  if (error) {
    console.error('Failed to fetch users by role:', error)
    return []
  }

  return (data ?? []).map((u: any) => u.user_id)
}