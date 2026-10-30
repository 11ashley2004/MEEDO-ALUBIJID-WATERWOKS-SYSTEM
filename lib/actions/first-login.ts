'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/serverClient'
import { headers } from 'next/headers'
import { isPasswordValid } from '@/lib/validation/forgot-pass/password-rules'
import config from '@/config/config'

function createEphemeralClient() {
  return createSupabaseClient(
    config.env.supabase.supabaseUrl!,
    config.env.supabase.supabaseKey!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  )
}

const IP_LIMIT = {
  maxAttempts: 10,
  windowMinutes: 60,
  baseBlockMinutes: 10,
  maxBlockMinutes: 1440,
}
const EMAIL_LIMIT = {
  maxAttempts: 3,
  windowMinutes: 60,
  baseBlockMinutes: 30,
  maxBlockMinutes: 1440,
}
const OTP_ACTION = 'account_setup_otp' as const

export type SetupResult =
  | { status: 'success' }
  | { status: 'error'; message: string; limitReached?: boolean }

const ERROR_PATTERNS: [pattern: string, message: string][] = [
  ['rate limit', 'Too many requests. Please wait a bit before trying again.'],
  ['email rate limit', 'Too many requests. Please wait a bit before trying again.'],
  ['already confirmed', 'This account is already verified. Please sign in.'],
  ['invalid otp', 'Invalid or expired code. Please try again.'],
  ['token has expired', 'This code has expired. Please request a new one.'],
  ['expired', 'This code has expired. Please request a new one.'],
  ['invalid', 'Invalid or expired code. Please try again.'],
  ['network', 'Network error. Please check your connection and try again.'],
  ['fetch', 'Network error. Please check your connection and try again.'],
  ['weak password', 'Please choose a stronger password.'],
]

function getErrorMessage(raw: string): string {
  if (!raw) return 'Something went wrong. Please try again.'
  const lower = raw.toLowerCase()
  return ERROR_PATTERNS.find(([pattern]) => lower.includes(pattern))?.[1] ?? raw
}

type RateLimitResult = { allowed: boolean; retryAfterSeconds: number }
type RateLimitConfig = typeof IP_LIMIT

async function checkRateLimit(
  scope: 'ip' | 'email',
  identifier: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const supabase = createServerClient()
  const { data, error } = await supabase.rpc('check_and_increment_rate_limit', {
    p_scope: scope,
    p_identifier: identifier,
    p_action_name: OTP_ACTION,
    p_max_attempts: config.maxAttempts,
    p_window_minutes: config.windowMinutes,
    p_base_block_minutes: config.baseBlockMinutes,
    p_max_block_minutes: config.maxBlockMinutes,
  })
  if (error) {
    console.error('Rate limit check failed:', error)
    return { allowed: false, retryAfterSeconds: 60 }
  }
  const row = data[0]
  return { allowed: row.allowed, retryAfterSeconds: row.retry_after_seconds }
}

async function checkIpAndEmailRateLimit(ip: string, email: string): Promise<RateLimitResult> {
  const ipCheck = await checkRateLimit('ip', ip, IP_LIMIT)
  if (!ipCheck.allowed) return ipCheck

  const emailCheck = await checkRateLimit('email', email, EMAIL_LIMIT)
  if (!emailCheck.allowed) return emailCheck

  return { allowed: true, retryAfterSeconds: 0 }
}

async function getClientIp(): Promise<string> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}

function formatRetryMessage(seconds: number): string {
  const minutes = Math.ceil(seconds / 60)
  if (minutes <= 1) return 'Too many requests. Please try again in a minute.'
  if (minutes < 60) return `Too many requests. Please try again in ${minutes} minutes.`
  const hours = Math.ceil(minutes / 60)
  return hours <= 1
    ? 'Too many requests. Please try again in about an hour.'
    : `Too many requests. Please try again in about ${hours} hours.`
}

type Account = { id: string; userType: 'staff' | 'consumer'; isActive: boolean; isDefaultPassword?: boolean } | null

async function findAccountByEmail(email: string): Promise<Account> {
  const supabase = createServerClient()

  const { data: staff, error: staffError } = await supabase
    .from('users')
    .select('user_id, is_active, is_default_password')
    .eq('email', email)
    .maybeSingle()

  if (staffError) console.error('Staff email lookup error:', staffError)
  if (staff) return { id: staff.user_id, userType: 'staff', isActive: staff.is_active, isDefaultPassword: staff.is_default_password }

  const { data: consumer, error: consumerError } = await supabase
    .from('consumers')
    .select('consumer_id, is_active, is_default_password')
    .eq('email', email)
    .maybeSingle()

  if (consumerError) console.error('Consumer email lookup error:', consumerError)
  if (consumer) return { id: consumer.consumer_id, userType: 'consumer', isActive: consumer.is_active, isDefaultPassword: consumer.is_default_password }

  return null
}

// ─── Step 1: send/resend the signup confirmation code ──────────────────────

export async function sendSetupOtp(rawEmail: string): Promise<SetupResult & { userType?: 'staff' | 'consumer' }> {
  const email = rawEmail.trim().toLowerCase()

  const ip = await getClientIp()
  const rateCheck = await checkIpAndEmailRateLimit(ip, email)
  if (!rateCheck.allowed) {
    return { status: 'error', message: formatRetryMessage(rateCheck.retryAfterSeconds), limitReached: true }
  }

  const account = await findAccountByEmail(email)
  if (!account) {
    return { status: 'error', message: 'Account not found.' }
  }
  if (!account.isActive) {
    return {
      status: 'error',
      message: account.userType === 'staff'
        ? 'This account is deactivated. Contact your administrator.'
        : 'This account is deactivated. Please contact support.',
    }
  }

  // Use the admin client to explicitly resend/generate a fresh signup code
  const admin = createServerClient()
  const { error } = await admin.auth.resend({
    type: 'signup',
    email,
  })

  if (error) {
    console.error('signup resend failed:', error)
    return { status: 'error', message: getErrorMessage(error.message) }
  }

  return { status: 'success', userType: account.userType }
}

export async function resendSetupOtp(rawEmail: string): Promise<SetupResult> {
  return sendSetupOtp(rawEmail)
}

// ─── Step 2: verify the 6-digit code ────────────────────────────────────────

export async function verifySetupOtp(rawEmail: string, rawToken: string): Promise<SetupResult> {
  const email = rawEmail.trim().toLowerCase()
  const token = rawToken.trim()

  if (token.length < 6) {
    return { status: 'error', message: 'Enter the complete 6-digit code.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'signup' })

  if (error || !data.session) {
    console.error('verifyOtp (signup) failed:', error)
    return { status: 'error', message: getErrorMessage(error?.message ?? '') }
  }

  // Session is left open so setSetupPassword() can identify the current user.
  return { status: 'success' }
}

export async function getCurrentSetupEmail(): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  return data.user?.email ?? null
}

// ─── Step 3: set the real password ──────────────────────────────────────────

export async function setSetupPassword(newPassword: string): Promise<SetupResult> {
  if (!isPasswordValid(newPassword)) {
    return { status: 'error', message: 'Password does not meet the requirements below.' }
  }

  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData.user?.email) {
    console.error('getUser (signup) failed:', userError)
    return { status: 'error', message: 'Session expired. Please verify your email again.' }
  }

  const account = await findAccountByEmail(userData.user.email)
  if (account && !account.isActive) {
    return { status: 'error', message: 'This account has been deactivated.' }
  }

  // Update password in Supabase Auth
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) {
    console.error('updateUser (signup password) failed:', error)
    return { status: 'error', message: getErrorMessage(error.message) }
  }

  const admin = createServerClient()

  // 1. Confirm the email explicitly now that the password has been updated
  const { error: confirmError } = await admin.auth.admin.updateUserById(userData.user.id, {
    email_confirm: true,
  })
  if (confirmError) {
    console.error('Failed to confirm email after password set:', confirmError)
  }

  // 2. Mark is_default_password as false in your custom table
  if (account) {
    const table = account.userType === 'staff' ? 'users' : 'consumers'
    const idCol = account.userType === 'staff' ? 'user_id' : 'consumer_id'
    await admin
      .from(table)
      .update({ is_default_password: false, updated_at: new Date().toISOString() })
      .eq(idCol, account.id)
  }

  // 3. Clear session so the user logs in fresh with their new password
  await supabase.auth.signOut()

  return { status: 'success' }
}