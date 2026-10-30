'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ============================================================
// TYPES
// ============================================================

export interface UserNotificationPreference {
  preference_id: string | null // null when the user has no row yet
  user_id: string
  toast_enabled: boolean
}

interface ActionResult<T> {
  status: 'success' | 'error'
  message?: string
  data?: T
}

// ============================================================
// USER — the signed-in user's own toast preference
// ============================================================

export async function getUserNotificationPreference(): Promise<
  ActionResult<UserNotificationPreference>
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { status: 'error', message: 'Not authenticated' }
  }

  const { data: prefRow, error: prefErr } = await supabase
    .from('user_notification_preferences')
    .select('preference_id, user_id, toast_enabled')
    .eq('user_id', user.id)
    .maybeSingle()

  if (prefErr) {
    console.error('[getUserNotificationPreference] pref fetch failed', prefErr)
    return { status: 'error', message: 'Failed to load notification preference' }
  }

  const preference: UserNotificationPreference = {
    preference_id: prefRow?.preference_id ?? null,
    user_id: user.id,
    // No row yet → default to toasts enabled.
    toast_enabled: prefRow?.toast_enabled ?? true,
  }

  return { status: 'success', data: preference }
}

export async function updateUserNotificationPreference(
  toastEnabled: boolean,
): Promise<ActionResult<null>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { status: 'error', message: 'Not authenticated' }
  }

  const { error } = await supabase
    .from('user_notification_preferences')
    .upsert(
      {
        user_id: user.id,
        toast_enabled: toastEnabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )

  if (error) {
    console.error('[updateUserNotificationPreference] failed', error)
    return { status: 'error', message: 'Failed to save your notification preference' }
  }

  revalidatePath('/', 'layout')
  return { status: 'success', message: 'Notification preference saved' }
}