'use server'

import { createClient } from '@/lib/supabase/server'
import { ROLES, UserRole } from '@/lib/constants/roles'

type UserWithRole = {
  roles: {
    role_name: string
  } | null
}

// ─── STAFF ────────────────────────────────────────────────────────────────────

export async function verifyUserIsActive(userId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('users')
    .select('is_active')
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    return {
      ok: false,
      message: 'Unable to verify account status. Please contact support.',
    }
  }

  if (!data.is_active) {
    return {
      ok: false,
      message:
        'Your account has been deactivated. Please contact an administrator.',
    }
  }

  return { ok: true }
}

export async function getUserRole(userId: string): Promise<UserRole | null> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('users')
    .select('roles(role_name)')
    .eq('user_id', userId)
    .single()

  const typedData = data as UserWithRole | null
  const roleName = typedData?.roles?.role_name?.toLowerCase()

  if (roleName && Object.values(ROLES).includes(roleName as UserRole)) {
    return roleName as UserRole
  }

  return null
}

export async function checkUserRole(
  userId: string,
  allowedRoles: UserRole[],
) {
  const userRole = await getUserRole(userId)

  if (!userRole || !allowedRoles.includes(userRole)) {
    return {
      ok: false,
      message: 'You do not have permission to access this resource.',
    }
  }

  return { ok: true }
}

// ─── CONSUMER ─────────────────────────────────────────────────────────────────

export async function verifyConsumerIsActive(consumerId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('consumers')
    .select('is_active')
    .eq('consumer_id', consumerId)
    .single()

  if (error || !data) {
    return {
      ok: false,
      message: 'Unable to verify account status. Please contact support.',
    }
  }

  if (!data.is_active) {
    return {
      ok: false,
      message: 'Your account has been deactivated. Please contact support.',
    }
  }

  return { ok: true }
}