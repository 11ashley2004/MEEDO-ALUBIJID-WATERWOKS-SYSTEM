'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@/lib/supabase/serverClient'
import { ROLES, UserRole, ROLE_ROUTES } from '@/lib/constants/roles'
import { verifyUserIsActive, verifyConsumerIsActive } from './gaurd.actions'
import { updateUserLastLogin } from './users/user.actions'
import { updateConsumerLastActive } from './consumer/consumer.actions'
import { sendSetupOtp } from '@/lib/actions/first-login'

// Email-scoped: tight. This is "how many times has THIS account been guessed."
const LOGIN_LIMIT_EMAIL = { maxAttempts: 10, windowMinutes: 10, baseBlockMinutes: 10, maxBlockMinutes: 1440 }

// IP-scoped: looser. This exists to catch one IP spraying many different
// emails (credential stuffing), which the email-scoped check alone can't
// see — each individual email stays under its own limit. Kept loose
// because offices, campuses, and carrier NAT legitimately put many real
// users behind one IP.
const LOGIN_LIMIT_IP = { maxAttempts: 30, windowMinutes: 10, baseBlockMinutes: 10, maxBlockMinutes: 1440 }

const LOGIN_ACTION = 'login_failed' as const

type UserRecord = {
  user_id: string
  role_id: string
  roles: { role_id: string; role_name: string } | null
}

type ConsumerRecord = {
  consumer_id: string
  account_name: string
  email: string
  is_active: boolean
}

// ─── IP resolution ──────────────────────────────────────────────────────────
// Client-supplied IPs can't be trusted, so this is pulled from request
// headers set by your edge/proxy layer, not from formData. Adjust the
// header precedence to match whatever sits in front of this app (Vercel,
// nginx, Cloudflare, etc). Falls back to a constant bucket if nothing is
// present so the IP check degrades to "no-op" rather than throwing.
async function getClientIp(): Promise<string> {
  const h = await headers()
  const forwardedFor = h.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  const realIp = h.get('x-real-ip')
  if (realIp) return realIp.trim()
  return 'unknown'
}

// ─── Login rate limit — reuses the same rate_limits table + RPC as OTP ────
// Called BEFORE attempting sign-in, not after failure — this counts every
// attempt (success or fail), which is standard for login throttling since
// an attacker doesn't know in advance which guess will succeed.
//
// Runs BOTH an email-scoped and an IP-scoped check against the same
// `login_attempt` action. The `(scope, identifier, action)` uniqueness on
// rate_limits means these land as two independent rows —
// ('email', 'a@b.com', login_attempt) and ('ip', '1.2.3.4', login_attempt)
// — so they don't collide or share counters. Denied if either says no.
async function checkLoginRateLimit(
  email: string,
  ip: string,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const supabase = createServerClient()

  const [emailResult, ipResult] = await Promise.all([
    supabase.rpc('check_and_increment_rate_limit', {
      p_scope: 'email',
      p_identifier: email.toLowerCase().trim(),
      p_action_name: LOGIN_ACTION,
      p_max_attempts: LOGIN_LIMIT_EMAIL.maxAttempts,
      p_window_minutes: LOGIN_LIMIT_EMAIL.windowMinutes,
      p_base_block_minutes: LOGIN_LIMIT_EMAIL.baseBlockMinutes,
      p_max_block_minutes: LOGIN_LIMIT_EMAIL.maxBlockMinutes,
    }),
    // Skip the IP check entirely if we couldn't resolve one — don't want
    // a header-parsing gap to silently rate-limit everyone under 'unknown'.
    ip === 'unknown'
      ? Promise.resolve({ data: [{ allowed: true, retry_after_seconds: 0 }], error: null })
      : supabase.rpc('check_and_increment_rate_limit', {
          p_scope: 'ip',
          p_identifier: ip,
          p_action_name: LOGIN_ACTION,
          p_max_attempts: LOGIN_LIMIT_IP.maxAttempts,
          p_window_minutes: LOGIN_LIMIT_IP.windowMinutes,
          p_base_block_minutes: LOGIN_LIMIT_IP.baseBlockMinutes,
          p_max_block_minutes: LOGIN_LIMIT_IP.maxBlockMinutes,
        }),
  ])

  if (emailResult.error) {
    console.error('Login rate limit check failed (email scope):', emailResult.error)
    return { allowed: false, retryAfterSeconds: 60 }
  }
  if (ipResult.error) {
    console.error('Login rate limit check failed (ip scope):', ipResult.error)
    return { allowed: false, retryAfterSeconds: 60 }
  }

  const emailRow = emailResult.data[0]
  const ipRow = ipResult.data[0]

  if (!emailRow.allowed) return { allowed: false, retryAfterSeconds: emailRow.retry_after_seconds }
  if (!ipRow.allowed) return { allowed: false, retryAfterSeconds: ipRow.retry_after_seconds }
  return { allowed: true, retryAfterSeconds: 0 }
}

// Clears both counters on a successful login so a user who fumbles their
// password a couple times isn't left with a partially-used budget hanging
// over them. Deletes the rows outright rather than zeroing attempts — same
// end state, and the RPC's own upsert-on-fresh-window logic will just
// re-create the row cleanly on their next attempt if there is one.
//
// Only the email row is cleared for the requesting user; the IP row is
// intentionally left alone. Clearing it on any successful login from a
// shared IP (office, campus, NAT) would wipe out attempt history that's
// actually attributable to other people behind that same IP.
async function clearLoginRateLimit(email: string) {
  const supabase = createServerClient()
  const { data: action } = await supabase
    .from('rate_limit_actions')
    .select('rate_limit_action_id')
    .eq('action_name', LOGIN_ACTION)
    .maybeSingle()

  if (!action) return

  await supabase
    .from('rate_limits')
    .delete()
    .eq('scope', 'email')
    .eq('identifier', email.toLowerCase().trim())
    .eq('rate_limit_action_id', action.rate_limit_action_id)
}

function formatLoginRetryMessage(seconds: number): string {
  const minutes = Math.ceil(seconds / 60)
  if (minutes <= 1) return 'Too many failed login attempts. Please try again in a minute.'
  if (minutes < 60) return `Too many failed login attempts. Please try again in ${minutes} minutes.`
  const hours = Math.ceil(minutes / 60)
  return hours <= 1
    ? 'Too many failed login attempts. Please try again in about an hour.'
    : `Too many failed login attempts. Please try again in about ${hours} hours.`
}

// ─── signIn ───────────────────────────────────────────────────────────────────

export async function signIn(formData: {
  email: string
  password: string
  captchaToken?: string
}) {
  const supabase = await createClient()

  // ── Rate limit: check + increment BEFORE attempting sign-in ──────────────
  const ip = await getClientIp()
  const rateCheck = await checkLoginRateLimit(formData.email, ip)
  if (!rateCheck.allowed) {
    return { status: 'error', message: formatLoginRetryMessage(rateCheck.retryAfterSeconds) }
  }

  const { data: existing } = await supabase.auth.getSession()
  if (existing?.session) await supabase.auth.signOut()

  const { data, error } = await supabase.auth.signInWithPassword({
    email:    formData.email,
    password: formData.password,
    options:  { captchaToken: formData.captchaToken },
  })

  if (error || !data.session) {
    // Accounts created with email_confirm: false and never confirmed —
    // still on the admin-set temp password — get rejected outright by
    // Supabase here rather than succeeding into a session. There's no
    // is_default_password/is_email_verified check left to make that
    // distinction after the fact, because Supabase never lets an
    // unconfirmed account reach this point with a session at all.
    if (error?.message?.toLowerCase().includes('email not confirmed')) {
      const email = formData.email.trim().toLowerCase()
      const otpResult = await sendSetupOtp(email)

      if (otpResult.status === 'error') {
        return { status: 'error', message: otpResult.message }
      }

      return {
        status:   'otp_required',
        message:  'Please verify your email to finish setting up your account.',
        email,
        userType: otpResult.userType,
      }
    }

    return { status: 'error', message: error?.message || 'Authentication failed' }
  }

  const userId = data.session.user.id

  // ── STAFF ─────────────────────────────────────────────────────────────────
  const { data: staffData, error: staffError } = await supabase
    .from('users')
    .select('user_id, role_id, is_default_password, roles:role_id(role_id, role_name)')
    .eq('user_id', userId)
    .single()

  if (staffData && !staffError) {
    const statusCheck = await verifyUserIsActive(userId)
    if (!statusCheck.ok) {
      await supabase.auth.signOut()
      return { status: 'error', message: statusCheck.message }
    }

    // Correct password, active account, and — by definition, since
    // signInWithPassword() above only succeeds for a confirmed email —
    // the email is already verified. is_default_password is the real
    // source of truth for "has this account actually finished setup."
    // That means there's nothing left to re-verify: keep this session
    // open and send them straight to the password step instead of
    // signing out and firing another OTP. A fresh OTP is only needed the
    // FIRST time (handled above, in the "email not confirmed" branch).
    if (staffData.is_default_password) {
      return {
        status:   'password_required',
        message:  'Please set your password to finish setting up your account.',
        email:    formData.email.trim().toLowerCase(),
        userType: 'staff' as const,
      }
    }

    await updateUserLastLogin(userId)

    // Successful login — clear the rate limit counter
    await clearLoginRateLimit(formData.email)
    const redirectPath = await getUserRedirectPath(userId)
    return { status: 'success', message: 'Login successful', redirectPath }
  }

  // ── CONSUMER ──────────────────────────────────────────────────────────────
  const { data: consumerData, error: consumerError } = await supabase
    .from('consumers')
    .select('consumer_id, account_name, email, is_active, is_default_password')
    .eq('consumer_id', userId)
    .single()

  if (consumerData && !consumerError) {
    const consumer = consumerData as unknown as ConsumerRecord & { is_default_password: boolean }

    const statusCheck = await verifyConsumerIsActive(consumer.consumer_id)
    if (!statusCheck.ok) {
      await supabase.auth.signOut()
      return { status: 'error', message: statusCheck.message }
    }

    // Same check as the staff branch above — see comment there.
    if (consumer.is_default_password) {
      return {
        status:   'password_required',
        message:  'Please set your password to finish setting up your account.',
        email:    formData.email.trim().toLowerCase(),
        userType: 'consumer' as const,
      }
    }

    await updateConsumerLastActive(consumer.consumer_id)

    // Successful login — clear the rate limit counter
    await clearLoginRateLimit(formData.email)
    return { status: 'success', message: 'Login successful', redirectPath: '/' }
  }

  await supabase.auth.signOut()
  return { status: 'error', message: 'User account not found. Please contact support.' }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getUserRedirectPath(userId: string): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('users')
    .select('user_id, role_id, roles:role_id(role_id, role_name)')
    .eq('user_id', userId)
    .single()

  if (error || !data) return '/login'
  const userData      = data as unknown as UserRecord
  const roleName      = userData?.roles?.role_name
  if (!roleName)      return '/login'
  const lowerCaseRole = roleName.toLowerCase()
  return lowerCaseRole in ROLE_ROUTES ? ROLE_ROUTES[lowerCaseRole as UserRole] : '/login'
}

export async function getUserSession() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return { status: 'unauthenticated' as const, user: null, role: null }
  }

  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('user_id, role_id, roles:role_id(role_id, role_name)')
    .eq('user_id', user.id)
    .single()

  if (userData && !userError) {
    const staffUser = userData as unknown as UserRecord
    const roleName  = staffUser?.roles?.role_name
    const validRole: UserRole | null =
      roleName && Object.values(ROLES).includes(roleName.toLowerCase() as UserRole)
        ? (roleName.toLowerCase() as UserRole)
        : null
    return { status: 'authenticated' as const, user, role: validRole }
  }

  const { data: consumerData, error: consumerError } = await supabase
    .from('consumers')
    .select('consumer_id, account_name, email')
    .eq('consumer_id', user.id)
    .single()

  if (consumerData && !consumerError) {
    return {
      status: 'authenticated' as const,
      user: {
        ...user,
        id: consumerData.consumer_id,
        user_metadata: { ...user.user_metadata, account_name: consumerData.account_name },
      },
      role: ROLES.CONSUMER,
    }
  }

  return { status: 'authenticated' as const, user, role: null }
}

export async function logout() {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut()
  if (error) return { status: 'error', message: error.message }
  return { status: 'success' }
}