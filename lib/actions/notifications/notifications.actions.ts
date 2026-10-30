'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ============================================================
// TYPES
// ============================================================

export interface UserNotificationRecord {
  notification_id:  string
  user_id:           string | null
  consumer_id:       string | null
  meter_account_id:  string | null
  event_code:        string
  metadata:          Record<string, any>
  is_read:           boolean
  read_at:           string | null
  toast_shown_at:    string | null
  reference_id:      string | null
  created_at:        string
}

interface ActionResult<T> {
  status:  'success' | 'error'
  message?: string
  data?:    T
}

// ============================================================
// AUTH HELPER — Supabase Auth → consumers / users
// ============================================================

type NotificationOwner =
  | { kind: 'consumer'; consumerId: string }
  | { kind: 'staff'; userId: string }

/**
 * Resolve the notification owner from Supabase Auth:
 * 1) auth.getUser().id
 * 2) if that id exists in `consumers.consumer_id` → consumer
 *    (NOTICE_OF_DISCONNECTION rows are stored on consumer_id)
 * 3) else if it exists in `users.user_id` → staff
 */
async function resolveNotificationOwner(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<NotificationOwner | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id) return null

  const { data: consumer } = await supabase
    .from('consumers')
    .select('consumer_id')
    .eq('consumer_id', user.id)
    .maybeSingle()

  if (consumer?.consumer_id) {
    return { kind: 'consumer', consumerId: consumer.consumer_id }
  }

  const { data: staff } = await supabase
    .from('users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (staff?.user_id) {
    return { kind: 'staff', userId: staff.user_id }
  }

  return null
}

// ============================================================
// FETCH
// ============================================================

/**
 * Returns the current user's (staff or consumer) most recent notifications
 * plus their unread count.
 *
 * Consumers: Supabase Auth id → `consumers.consumer_id` → filter
 * `user_notifications.consumer_id` (includes NOTICE_OF_DISCONNECTION).
 */
export async function getUserNotifications(
  limit = 20,
): Promise<ActionResult<{ notifications: UserNotificationRecord[]; unread_count: number }>> {
  const supabase = await createClient()

  const owner = await resolveNotificationOwner(supabase)
  if (!owner) {
    console.log('[disconnection-notify] getUserNotifications: no owner (auth missing or not in consumers/users)')
    return { status: 'error', message: 'Not authenticated' }
  }

  console.log('[disconnection-notify] getUserNotifications owner', owner)

  // Do NOT evaluate disconnection here — this runs on every 30s notification
  // poll and was creating duplicate NOTICE_OF_DISCONNECTION rows / toast spam.
  // Evaluation stays on billing load, meter reading, realtime, and staff auto-generate.

  let listQuery = supabase
    .from('user_notifications')
    .select('notification_id, user_id, consumer_id, meter_account_id, event_code, metadata, is_read, read_at, toast_shown_at, reference_id, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  let countQuery = supabase
    .from('user_notifications')
    .select('notification_id', { count: 'exact', head: true })
    .eq('is_read', false)

  if (owner.kind === 'consumer') {
    listQuery = listQuery.eq('consumer_id', owner.consumerId)
    countQuery = countQuery.eq('consumer_id', owner.consumerId)
  } else {
    listQuery = listQuery.eq('user_id', owner.userId)
    countQuery = countQuery.eq('user_id', owner.userId)
  }

  const [{ data: rows, error: rowsErr }, { count: unreadCount, error: countErr }] =
    await Promise.all([listQuery, countQuery])

  if (rowsErr) {
    console.error('[getUserNotifications] fetch failed', rowsErr)
    return { status: 'error', message: 'Failed to load notifications' }
  }

  const disconnectNotices = (rows ?? []).filter(
    (r) => r.event_code === 'NOTICE_OF_DISCONNECTION',
  )
  console.log('[disconnection-notify] getUserNotifications result', {
    owner,
    total: rows?.length ?? 0,
    unreadCount: unreadCount ?? 0,
    noticeOfDisconnectionCount: disconnectNotices.length,
    noticeIds: disconnectNotices.map((r) => ({
      notification_id: r.notification_id,
      consumer_id: r.consumer_id,
      reference_id: r.reference_id,
      is_read: r.is_read,
    })),
  })
  if (countErr) {
    console.error('[getUserNotifications] count failed', countErr)
  }

  return {
    status: 'success',
    data: {
      notifications: rows ?? [],
      unread_count:  unreadCount ?? 0,
    },
  }
}

// ============================================================
// MARK READ
// ============================================================

export async function markNotificationRead(
  notificationId: string,
): Promise<ActionResult<null>> {
  const supabase = await createClient()

  const owner = await resolveNotificationOwner(supabase)
  if (!owner) {
    return { status: 'error', message: 'Not authenticated' }
  }

  let query = supabase
    .from('user_notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('notification_id', notificationId)

  query =
    owner.kind === 'consumer'
      ? query.eq('consumer_id', owner.consumerId)
      : query.eq('user_id', owner.userId)

  const { error } = await query

  if (error) {
    console.error('[markNotificationRead] update failed', error)
    return { status: 'error', message: 'Failed to update notification' }
  }

  revalidatePath('/', 'layout')
  return { status: 'success' }
}

export async function markAllNotificationsRead(): Promise<ActionResult<null>> {
  const supabase = await createClient()

  const owner = await resolveNotificationOwner(supabase)
  if (!owner) {
    return { status: 'error', message: 'Not authenticated' }
  }

  let query = supabase
    .from('user_notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('is_read', false)

  query =
    owner.kind === 'consumer'
      ? query.eq('consumer_id', owner.consumerId)
      : query.eq('user_id', owner.userId)

  const { error } = await query

  if (error) {
    console.error('[markAllNotificationsRead] update failed', error)
    return { status: 'error', message: 'Failed to update notifications' }
  }

  revalidatePath('/', 'layout')
  return { status: 'success' }
}

// ============================================================
// MARK TOAST SHOWN
// ============================================================

/**
 * Records that a toast alert has already been shown for this
 * notification. Scoped via Supabase Auth → consumers/users id.
 */
export async function markNotificationToastShown(
  notificationId: string,
): Promise<ActionResult<null>> {
  const supabase = await createClient()

  const owner = await resolveNotificationOwner(supabase)
  if (!owner) {
    return { status: 'error', message: 'Not authenticated' }
  }

  let query = supabase
    .from('user_notifications')
    .update({ toast_shown_at: new Date().toISOString() })
    .eq('notification_id', notificationId)
    .is('toast_shown_at', null)

  query =
    owner.kind === 'consumer'
      ? query.eq('consumer_id', owner.consumerId)
      : query.eq('user_id', owner.userId)

  // Prefer returning the row so a silent RLS no-op is visible
  const { data, error } = await query.select('notification_id').maybeSingle()

  if (error) {
    console.error('[markNotificationToastShown] update failed', error)
    return { status: 'error', message: 'Failed to update notification' }
  }

  if (!data?.notification_id) {
    // Already marked, or RLS blocked the update — try service role once
    try {
      const config = (await import('@/config/config')).default
      if (config.env.supabase.supabaseServerRoleKey) {
        const { createServerClient } = await import('@/lib/supabase/serverClient')
        const admin = createServerClient()
        let adminQ = admin
          .from('user_notifications')
          .update({ toast_shown_at: new Date().toISOString() })
          .eq('notification_id', notificationId)
          .is('toast_shown_at', null)

        adminQ =
          owner.kind === 'consumer'
            ? adminQ.eq('consumer_id', owner.consumerId)
            : adminQ.eq('user_id', owner.userId)

        const { error: adminErr } = await adminQ
        if (adminErr) {
          console.error('[markNotificationToastShown] service-role update failed', adminErr)
          return { status: 'error', message: 'Failed to update notification' }
        }
      }
    } catch (err) {
      console.error('[markNotificationToastShown] service-role fallback failed', err)
    }
  }

  return { status: 'success' }
}
