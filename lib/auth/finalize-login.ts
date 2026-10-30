import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { ROLE_ROUTES, UserRole } from '@/lib/constants/roles'
import { verifyUserIsActive, verifyConsumerIsActive } from '@/lib/actions/gaurd.actions'
import { updateUserLastLogin } from '@/lib/actions/users/user.actions'
import { updateConsumerLastActive } from '@/lib/actions/consumer/consumer.actions'

export type FinalizeLoginResult =
  | { ok: true; redirectPath: string }
  | { ok: false; message: string }

type StaffRow = {
  user_id: string
  is_default_password: boolean
  roles: { role_id: string; role_name: string } | null
}

/**
 * Runs the same post-authentication checks that signIn() does for the
 * password flow, but for a session that was created by OAuth (Google).
 *
 * A Google account that doesn't match an existing `users` or `consumers`
 * row is rejected. The caller is responsible for signing the session out
 * when `ok` is false.
 */
export async function finalizeLogin(userId: string): Promise<FinalizeLoginResult> {
  const supabase = await createClient()

  // ── STAFF ─────────────────────────────────────────────────────────────────
  const { data: staffData } = await supabase
    .from('users')
    .select('user_id, is_default_password, roles:role_id(role_id, role_name)')
    .eq('user_id', userId)
    .maybeSingle()

  if (staffData) {
    const staff = staffData as unknown as StaffRow

    const statusCheck = await verifyUserIsActive(userId)
    if (!statusCheck.ok) {
      return { ok: false, message: statusCheck.message ?? 'This account is not active. Please contact support.' }
    }

    if (staff.is_default_password) {
      return { ok: true, redirectPath: '/set-password' }
    }

    const roleName = staff.roles?.role_name?.toLowerCase()
    if (!roleName || !(roleName in ROLE_ROUTES)) {
      return { ok: false, message: 'Your account has no valid role. Please contact support.' }
    }

    await updateUserLastLogin(userId)
    return { ok: true, redirectPath: ROLE_ROUTES[roleName as UserRole] }
  }

  // ── CONSUMER ──────────────────────────────────────────────────────────────
  const { data: consumerData } = await supabase
    .from('consumers')
    .select('consumer_id, is_default_password')
    .eq('consumer_id', userId)
    .maybeSingle()

  if (consumerData) {
    const statusCheck = await verifyConsumerIsActive(consumerData.consumer_id)
    if (!statusCheck.ok) {
      return { ok: false, message: statusCheck.message ?? 'This account is not active. Please contact support.' }
    }

    if (consumerData.is_default_password) {
      return { ok: true, redirectPath: '/set-password' }
    }

    await updateConsumerLastActive(consumerData.consumer_id)
    return { ok: true, redirectPath: '/' }
  }

  return {
    ok: false,
    message: 'No MEEDO account matches this Google email. Please contact the office.',
  }
}