'use server'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/serverClient'
import { headers } from 'next/headers'
import { isPasswordValid } from '@/lib/validation/forgot-pass/password-rules'
import config from '@/config/config'

// ─── Ephemeral client — persistSession: false means supabase-js never

function createEphemeralClient() {
  return createSupabaseClient(
    config.env.supabase.supabaseUrl!,
    config.env.supabase.supabaseKey!,
    {
      auth: {
        persistSession:    false,
        autoRefreshToken:  false,
        detectSessionInUrl: false,
      },
    },
  )
}

export type RecoveryTokens = { accessToken: string; refreshToken: string }

// ─── Rate limit tuning (kept as defense-in-depth on top of Supabase's own
// built-in per-email cooldown, ~60s between sends by default) ──────────────

const IP_LIMIT = {
  maxAttempts:      10,
  windowMinutes:    60,
  baseBlockMinutes: 10,
  maxBlockMinutes:  1440,
}
const EMAIL_LIMIT = {
  maxAttempts:      3,
  windowMinutes:    60,
  baseBlockMinutes: 30,
  maxBlockMinutes:  1440,
}
const OTP_ACTION = 'password_reset_otp' as const
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type ForgotPasswordResult =
  | { status: 'success' }
  | { status: 'error'; message: string; limitReached?: boolean }

// ─── Turnstile verification (unchanged) ───────────────────────────────────

async function verifyTurnstile(token: string): Promise<boolean> {
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret:   process.env.TURNSTILE_SECRET_KEY!,
        response: token,
      }),
    })
    const data = await res.json()
    return data.success === true
  } catch (err) {
    console.error('Turnstile verification failed:', err)
    return false
  }
}

// ─── Rate limit helper (unchanged logic, still IP + email scoped) ─────────

type RateLimitResult = { allowed: boolean; retryAfterSeconds: number }
type RateLimitConfig = typeof IP_LIMIT

async function checkRateLimit(
  scope:      'ip' | 'email',
  identifier: string,
  config:     RateLimitConfig,
): Promise<RateLimitResult> {
  const supabase = createServerClient()
  const { data, error } = await supabase.rpc('check_and_increment_rate_limit', {
    p_scope:              scope,
    p_identifier:         identifier,
    p_action_name:        OTP_ACTION,
    p_max_attempts:       config.maxAttempts,
    p_window_minutes:     config.windowMinutes,
    p_base_block_minutes: config.baseBlockMinutes,
    p_max_block_minutes:  config.maxBlockMinutes,
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

// ─── Supabase auth error → user-facing message ─────────────────────────────

const ERROR_PATTERNS: [pattern: string, message: string][] = [
  ['rate limit',        'Too many requests. Please wait a bit before trying again.'],
  ['email rate limit',  'Too many requests. Please wait a bit before trying again.'],
  ['invalid otp',       'Invalid or expired code. Please try again.'],
  ['token has expired', 'This code has expired. Please request a new one.'],
  ['expired',           'This code has expired. Please request a new one.'],
  ['invalid',           'Invalid or expired code. Please try again.'],
  ['network',           'Network error. Please check your connection and try again.'],
  ['fetch',             'Network error. Please check your connection and try again.'],
  ['same password',     'New password must be different from your current password.'],
  ['weak password',     'Please choose a stronger password.'],
]

function getErrorMessage(raw: string): string {
  if (!raw) return 'Something went wrong. Please try again.'
  const lower = raw.toLowerCase()
  const match = ERROR_PATTERNS.find(([pattern]) => lower.includes(pattern))
  return match?.[1] ?? raw
}

// ─── Account lookup across the two user tables ─────────────────────────────
// Supabase Auth itself doesn't distinguish staff vs consumer — that's app
// data — so we still look the email up to (a) mask/validate it up front and
// (b) know the account is active before letting the flow proceed.
// NOTE: account.id here is the SAME uuid as the Supabase auth.users id
// (users/consumers rows are keyed by the auth user id), which is what lets
// resetPassword() update the right row without ever needing a session.

type Account = { id: string; userType: 'staff' | 'consumer'; name: string; isActive: boolean } | null

async function findAccountByEmail(email: string): Promise<Account> {
  const supabase = createServerClient()

  const { data: staff, error: staffError } = await supabase
    .from('users')
    .select('user_id, first_name, is_active')
    .eq('email', email)
    .maybeSingle()

  if (staffError) console.error('Staff email lookup error:', staffError)
  if (staff) return { id: staff.user_id, userType: 'staff', name: staff.first_name, isActive: staff.is_active }

  const { data: consumer, error: consumerError } = await supabase
    .from('consumers')
    .select('consumer_id, account_name, is_active')
    .eq('email', email)
    .maybeSingle()

  if (consumerError) console.error('Consumer email lookup error:', consumerError)
  if (consumer) return { id: consumer.consumer_id, userType: 'consumer', name: consumer.account_name, isActive: consumer.is_active }

  return null
}

// ─── Step 1: send the reset code ────────────────────────────────────────────

export async function sendForgotPasswordOtp(
  rawEmail:     string,
  captchaToken: string,
): Promise<ForgotPasswordResult & { userType?: 'staff' | 'consumer' }> {
  if (!captchaToken || !(await verifyTurnstile(captchaToken))) {
    return { status: 'error', message: 'CAPTCHA verification failed. Please try again.' }
  }

  const email = rawEmail.trim().toLowerCase()
  if (!EMAIL_REGEX.test(email)) {
    return { status: 'error', message: 'Invalid email address.' }
  }

  const ip = await getClientIp()
  const rateCheck = await checkIpAndEmailRateLimit(ip, email)
  if (!rateCheck.allowed) {
    return { status: 'error', message: formatRetryMessage(rateCheck.retryAfterSeconds) }
  }

  const account = await findAccountByEmail(email)
  if (!account) {
    return { status: 'error', message: 'No account found with that email address.' }
  }
  if (!account.isActive) {
    return {
      status:  'error',
      message: account.userType === 'staff'
        ? 'This account is deactivated. Contact your administrator.'
        : 'This account is deactivated. Please contact support.',
    }
  }

  const supabase = createEphemeralClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email)

  if (error) {
    console.error('resetPasswordForEmail failed:', error)
    return { status: 'error', message: getErrorMessage(error.message) }
  }

  return { status: 'success', userType: account.userType }
}

// ─── Resend — same underlying call, no CAPTCHA re-check (email already
// validated to exist in step 1); still rate-limited. ───────────────────────

export async function resendForgotPasswordOtp(rawEmail: string): Promise<ForgotPasswordResult> {
  const email = rawEmail.trim().toLowerCase()

  const ip = await getClientIp()
  const rateCheck = await checkIpAndEmailRateLimit(ip, email)
  if (!rateCheck.allowed) {
    return { status: 'error', message: formatRetryMessage(rateCheck.retryAfterSeconds), limitReached: true }
  }

  const supabase = createEphemeralClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email)

  if (error) {
    console.error('resend resetPasswordForEmail failed:', error)
    return { status: 'error', message: getErrorMessage(error.message) }
  }

  return { status: 'success' }
}

// ─── Step 2: verify the 6-digit code ────────────────────────────────────────
// Runs on the ephemeral client — verifyOtp() still has to create a session
// (Supabase requires one for the eventual updateUser() call), but because
// this client has persistSession: false, that session is never written
// anywhere. Its tokens are handed straight back to the caller as plain
// data and must be carried by the client (in React state only) into
// resetPassword() below.

export async function verifyForgotPasswordOtp(
  rawEmail: string,
  rawToken: string,
): Promise<ForgotPasswordResult & { tokens?: RecoveryTokens }> {
  const email = rawEmail.trim().toLowerCase()
  const token = rawToken.trim()

  if (token.length < 6) {
    return { status: 'error', message: 'Enter the complete 6-digit code.' }
  }

  const supabase = createEphemeralClient()
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' })

  if (error || !data.session) {
    console.error('verifyOtp failed:', error)
    return { status: 'error', message: getErrorMessage(error?.message ?? '') }
  }

  return {
    status: 'success',
    tokens: {
      accessToken:  data.session.access_token,
      refreshToken: data.session.refresh_token,
    },
  }
}

// ─── Step 3: set the new password ───────────────────────────────────────────
// A brand-new ephemeral client re-hydrates the recovery session in memory
// via setSession(tokens) — this contacts Supabase to validate the tokens
// but stores nothing — then calls updateUser(). The client instance is
// discarded when this function returns; there is nothing left to sign out
// of, because nothing was ever persisted.

export async function resetPassword(
  newPassword: string,
  tokens:      RecoveryTokens,
): Promise<ForgotPasswordResult> {
  if (!isPasswordValid(newPassword)) {
    return { status: 'error', message: 'Password does not meet the requirements below.' }
  }
  if (!tokens?.accessToken || !tokens?.refreshToken) {
    return { status: 'error', message: 'Session expired. Please start again.' }
  }

  const supabase = createEphemeralClient()

  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token:  tokens.accessToken,
    refresh_token: tokens.refreshToken,
  })

  if (sessionError || !sessionData.user?.email) {
    console.error('setSession failed:', sessionError)
    return { status: 'error', message: 'Session expired. Please start again.' }
  }

  const account = await findAccountByEmail(sessionData.user.email)
  if (account && !account.isActive) {
    return { status: 'error', message: 'This account has been deactivated.' }
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) {
    console.error('updateUser (password) failed:', error)
    return { status: 'error', message: getErrorMessage(error.message) }
  }

  // is_default_password is being dropped from users/consumers, so the
  // post-reset update no longer touches it — just bump updated_at.
  if (account) {
    const admin = createServerClient()
    const table = account.userType === 'staff' ? 'users' : 'consumers'
    const idCol = account.userType === 'staff' ? 'user_id' : 'consumer_id'
    await admin
      .from(table)
      .update({ updated_at: new Date().toISOString() })
      .eq(idCol, account.id)
  }

  return { status: 'success' }
}