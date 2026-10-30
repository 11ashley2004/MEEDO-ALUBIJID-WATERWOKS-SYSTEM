'use server'

import { createClient } from '@/lib/supabase/server'

export interface UserProfile {
  user_id:        string
  account_name:   string
  first_name:     string | null   // staff only
  middle_name:    string | null   // staff only
  last_name:      string | null   // staff only
  email:          string
  contact_number: string | null
  profile_image:  string | null
  is_active:      boolean
  last_active:    string | null
  created_at:     string
  role:           { role_name: string } | null
  userType:       'staff' | 'consumer'
}


export async function getUserProfile(): Promise<UserProfile | null> {
  const supabase = await createClient()

  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !authUser) return null

  // ── Staff ──────────────────────────────────────────────────────────────────
  const { data: staffData, error: staffError } = await supabase
    .from('users')
    .select(`
      user_id,
      first_name,
      last_name,
      middle_name,
      email,
      contact_number,
      profile_image,
      is_active,
      last_active,
      created_at,
      role:roles ( role_name )
    `)
    .eq('user_id', authUser.id)
    .single()

  if (staffData && !staffError) {
    return {
      user_id:        staffData.user_id,
      account_name:   `${staffData.first_name} ${staffData.last_name}`.trim(),
      first_name:     staffData.first_name ?? null,
      middle_name:    staffData.middle_name ?? null,
      last_name:      staffData.last_name ?? null,
      email:          staffData.email,
      contact_number: staffData.contact_number ?? null,
      profile_image:  staffData.profile_image ?? null,
      is_active:      staffData.is_active,
      last_active:    staffData.last_active ?? null,
      created_at:     staffData.created_at,
      role: Array.isArray(staffData.role)
        ? (staffData.role[0] ?? null)
        : (staffData.role as { role_name: string } | null),
      userType: 'staff',
    }
  }

  // ── Consumer ───────────────────────────────────────────────────────────────
  const { data: consumerData, error: consumerError } = await supabase
    .from('consumers')
    .select(`
      consumer_id,
      account_name,
      email,
      contact_number,
      is_active,
      last_active,
      created_at
    `)
    .eq('consumer_id', authUser.id)
    .single()

  if (consumerData && !consumerError) {
    return {
      user_id:        consumerData.consumer_id,
      account_name:   consumerData.account_name,
      first_name:     null,
      middle_name:    null,
      last_name:      null,
      email:          consumerData.email,
      contact_number: consumerData.contact_number ?? null,
      profile_image:  null, // consumers table has no profile_image column
      is_active:      consumerData.is_active,
      last_active:    consumerData.last_active ?? null,
      created_at:     consumerData.created_at,
      role:           { role_name: 'consumer' },
      userType:       'consumer',
    }
  }

  if (consumerError) {
    console.error('[getUserProfile] consumer query error:', consumerError)
  }

  return null
}