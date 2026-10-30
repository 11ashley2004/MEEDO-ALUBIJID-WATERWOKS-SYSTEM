'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Loader2, Eye, EyeOff, KeyRound,
  Mail, ShieldCheck, AlertCircle, ArrowLeft,
} from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { AuthPageShell } from '@/components/auth/auth-layout'
import {
  resendSetupOtp,
  verifySetupOtp,
  setSetupPassword,
  getCurrentSetupEmail,
} from '@/lib/actions/first-login'
import { logout } from '@/lib/actions/auth'
import { PASSWORD_RULES } from '@/lib/validation/forgot-pass/password-rules'

const passwordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Z]/, 'One uppercase letter')
      .regex(/[0-9]/, 'One number')
      .regex(/[^a-zA-Z0-9]/, 'One special character'),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  })

type PasswordValues = z.infer<typeof passwordSchema>

const STRENGTH_LEVELS = [
  { label: 'Very weak', color: '#ef4444' },
  { label: 'Weak',      color: '#f97316' },
  { label: 'Fair',      color: '#eab308' },
  { label: 'Good',      color: '#84cc16' },
  { label: 'Strong',    color: '#22c55e' },
]

const inputCls = cn(
  'h-11 rounded-md bg-white border-2 focus:border-3 border-slate-200',
  'text-slate-800 placeholder:text-slate-300',
  'focus:border-purple-400 focus:ring-0 focus-visible:ring-0 focus-visible:border-purple-400',
  'hover:border-slate-300 transition-colors disabled:opacity-50',
)

const primaryBtnCls = cn(
  'h-11 w-full font-semibold rounded-md text-sm',
  'bg-purple-700 text-white border-purple-400/40',
  'hover:bg-purple-600 hover:border-purple-300/50',
  'disabled:bg-purple-200 disabled:text-purple-400 disabled:border-purple-200',
  'transition-colors shadow-sm',
)

function StepDots({ step }: { step: 1 | 2 }) {
  return (
    <div className="flex items-center gap-2">
      {[1, 2].map((s) => (
        <div
          key={s}
          className={cn(
            'h-1 rounded-md transition-all duration-300',
            step === s ? 'w-6 bg-purple-600' : step > s ? 'w-3 bg-purple-300' : 'w-3 bg-slate-200',
          )}
        />
      ))}
    </div>
  )
}

export default function SetPasswordPage() {
  const router = useRouter()

  const [ready, setReady] = useState(false)
  const [step, setStep] = useState<'otp' | 'password'>('otp')
  const [redirecting, setRedirecting] = useState(false)

  const [email, setEmail] = useState('')

  // Step 1 — OTP
  const [otp, setOtp] = useState('')
  const [otpLoading, setOtpLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [limitReached, setLimitReached] = useState(false)

  // Step 2 — password
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '', confirm: '' },
  })
  const watchPassword = form.watch('password') ?? ''

  const passedRules = PASSWORD_RULES.filter((rule) => rule.test(watchPassword))
  const missingRules = PASSWORD_RULES.filter((rule) => !rule.test(watchPassword))
  const strengthIndex = watchPassword.length === 0 ? -1 : Math.min(passedRules.length, STRENGTH_LEVELS.length) - 1
  const strength = strengthIndex >= 0 ? STRENGTH_LEVELS[strengthIndex] : null
  const filledSegments = watchPassword.length === 0 ? 0 : passedRules.length

  useEffect(() => {
    async function init() {
      // Read the query param manually (client-only) instead of
      // useSearchParams(), so this page can stay fully static and doesn't
      // need a Suspense boundary at prerender time.
      const paramEmail = new URLSearchParams(window.location.search).get('email')

      if (paramEmail) {
        setEmail(paramEmail.trim().toLowerCase())
        setStep('otp')
        setReady(true)
        return
      }

      // No param — arrived either via login's 'password_required' redirect
      // (email already verified this session, just no real password set
      // yet) or via middleware's needsPasswordSetup redirect. Either way,
      // a session existing here means the email is already confirmed —
      // signIn() only ever produces a session for a confirmed email, and
      // an unconfirmed one is always routed through the OTP step first
      // (see the "email not confirmed" branch in signIn()). So there's
      // nothing left to re-verify: skip straight to the password step
      // instead of forcing a fresh OTP.
      const sessionEmail = await getCurrentSetupEmail()
      if (sessionEmail) {
        setEmail(sessionEmail)
        setStep('password')
        setReady(true)
        return
      }

      router.replace('/login')
    }
    init()
  }, [])

  const goToStep1 = () => {
    setStep('otp')
    setOtp('')
    setLimitReached(false)
  }

  // ── Step 1: verify OTP ─────────────────────────────────────────────────

  async function onOtpVerify() {
    if (otp.length < 6) { toast.error('Enter the complete 6-digit code.'); return }
    if (!email) { toast.error('Session expired. Please log in again.'); router.replace('/login'); return }
    setOtpLoading(true)
    try {
      const result = await verifySetupOtp(email, otp.trim())
      if (result.status === 'error') {
        toast.error(result.message)
        setOtp('')
        return
      }
      toast.success('Email verified! Please set your new password.')
      setStep('password')
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setOtpLoading(false)
    }
  }

  // Auto-verify as soon as all 6 digits are entered
  useEffect(() => {
    if (otp.length === 6 && !otpLoading && step === 'otp') {
      onOtpVerify()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp])

  async function onResend() {
    if (limitReached || !email) return
    setResending(true)
    try {
      const result = await resendSetupOtp(email)
      if (result.status === 'error') {
        toast.error(result.message)
        if (result.limitReached) setLimitReached(true)
        return
      }
      setOtp('')
      toast.success('New code sent. Check your email inbox.')
    } catch {
      toast.error('Failed to resend code.')
    } finally {
      setResending(false)
    }
  }

  // ── Step 2: set password ───────────────────────────────────────────────

  async function onPasswordSubmit(values: PasswordValues) {
    setLoading(true)
    try {
      const result = await setSetupPassword(values.password)

      if (result.status === 'error') {
        toast.error(result.message)
        if (result.message.toLowerCase().includes('session expired')) {
          goToStep1()
        }
        return
      }

      setRedirecting(true)
      toast.success('Password set! Please log in with your new password.')
      router.replace('/login')
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Cancel actually clears the session — so if someone cancels here
  // (whether they arrived via a fresh OTP verify or via an
  // already-verified session that skipped straight to step 2), an
  // abandoned session with is_default_password: true still sits in the
  // browser and could otherwise let a later visit land right back on this
  // page automatically. Signing out means their next login attempt goes
  // through signIn() again, which — per the comment in init() above — will
  // still recognize the email as verified and send them straight back to
  // step 2, not through OTP again.
  async function handleCancel() {
    await logout()
    router.replace('/login')
  }

  if (redirecting) {
    return (
      <div className="min-h-svh flex flex-col items-center justify-center gap-3 bg-slate-50">
        <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
        <p className="text-sm text-slate-500">Redirecting to login…</p>
      </div>
    )
  }

  return (
    <AuthPageShell>
      {!ready ? (
        <div className="flex flex-col gap-5">
          <Skeleton className="w-11 h-11 rounded-xl" />
          <Skeleton className="h-7 w-48 rounded-md" />
          <Skeleton className="h-4 w-64 rounded-md" />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-11 rounded-md" />
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1 mb-1">
            <div className="flex items-center justify-between mb-1">
              <h1 className="text-2xl font-bold text-slate-800 leading-tight">
                {step === 'otp' ? 'Verify your email' : 'Set your password'}
              </h1>
              <StepDots step={step === 'otp' ? 1 : 2} />
            </div>
            <p className="text-slate-400 text-sm">
              {step === 'otp'
                ? `We sent a 6-digit code to ${email || 'your email'}.`
                : 'Create a strong password to secure your account.'}
            </p>
          </div>

          <div className="h-px bg-slate-200 w-full" />

          {step === 'otp' && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col items-center gap-3">
                <InputOTP maxLength={6} value={otp} onChange={(v) => setOtp(v.trim())} disabled={otpLoading}>
                  <InputOTPGroup className="gap-2">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <InputOTPSlot
                        key={i}
                        index={i}
                        className="!w-11 !h-12 !rounded-md !border !border-violet-300 !bg-white text-slate-800 font-bold text-lg transition-colors data-[active=true]:!border-violet-600 data-[active=true]:!ring-2 data-[active=true]:!ring-violet-200"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
                <p className="text-xs text-slate-400 flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5" /> Enter the 6-digit reset code
                </p>
              </div>

              <div className="border border-gray-300 rounded-md p-1">
                <Button onClick={onOtpVerify} disabled={otpLoading || otp.length < 6} className={primaryBtnCls}>
                  {otpLoading
                    ? <><Spinner className="mr-2" />Verifying…</>
                    : <><ShieldCheck className="mr-2 h-4 w-4" />Verify Code</>}
                </Button>
              </div>

              <div className="flex flex-col items-center gap-2">
                {limitReached ? (
                  <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2.5 w-full">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>Too many resend attempts. Please wait a while, or log in again to get a new code.</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-1.5 text-sm">
                    <span className="text-slate-400">Didn&apos;t receive a code?</span>
                    <button
                      onClick={onResend}
                      disabled={resending}
                      className="text-purple-500 font-medium hover:text-purple-700 hover:underline underline-offset-4 transition-colors disabled:opacity-50"
                    >
                      {resending
                        ? <span className="flex items-center gap-1"><Spinner />Resending…</span>
                        : 'Resend code'}
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleCancel}
                className="inline-flex items-center justify-center gap-1 text-center text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                <ArrowLeft className="w-3 h-3" /> Cancel and return to login
              </button>
            </div>
          )}

          {step === 'password' && (
            <form onSubmit={form.handleSubmit(onPasswordSubmit)} className="flex flex-col gap-5">
              <Controller
                name="password"
                control={form.control}
                render={({ field, fieldState }) => (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="password" className="text-slate-600 text-xs font-semibold uppercase tracking-wider">
                      New Password
                    </Label>
                    <div className="relative">
                      <Input
                        {...field}
                        id="password"
                        type={showPass ? 'text' : 'password'}
                        placeholder="Enter new password"
                        disabled={loading}
                        className={cn(inputCls, 'pr-10')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass(!showPass)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-7 h-7 rounded-md border-2 border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300 transition-colors"
                        tabIndex={-1}
                      >
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {fieldState.error && <p className="text-xs text-red-500">{fieldState.error.message}</p>}
                  </div>
                )}
              />

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Password strength
                  </span>
                  {strength ? (
                    <span className="text-xs font-bold" style={{ color: strength.color }}>
                      {strength.label}
                    </span>
                  ) : null}
                </div>

                <div className="flex gap-1.5 mb-3">
                  {PASSWORD_RULES.map((rule, i) => (
                    <div
                      key={rule.label}
                      className="flex-1 h-1.5 rounded-full transition-colors"
                      style={{ backgroundColor: i < filledSegments && strength ? strength.color : '#e2e8f0' }}
                    />
                  ))}
                </div>

                {watchPassword.length > 0 ? (
                  missingRules.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {missingRules.map((rule) => (
                        <span
                          key={rule.label}
                          className="bg-white border border-slate-200 rounded-full px-3 py-1 text-[11px] font-medium text-slate-500"
                        >
                          {rule.label}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] font-medium text-emerald-600">All requirements met</p>
                  )
                ) : null}
              </div>

              <Controller
                name="confirm"
                control={form.control}
                render={({ field, fieldState }) => (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="confirm" className="text-slate-600 text-xs font-semibold uppercase tracking-wider">
                      Confirm Password
                    </Label>
                    <div className="relative">
                      <Input
                        {...field}
                        id="confirm"
                        type={showConfirm ? 'text' : 'password'}
                        placeholder="Re-enter new password"
                        disabled={loading}
                        className={cn(inputCls, 'pr-10')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm(!showConfirm)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-7 h-7 rounded-md border-2 border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300 transition-colors"
                        tabIndex={-1}
                      >
                        {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {fieldState.error && <p className="text-xs text-red-500">{fieldState.error.message}</p>}
                  </div>
                )}
              />

              <div className="border border-gray-300 rounded-md p-1">
                <Button type="submit" disabled={loading} className={primaryBtnCls}>
                  {loading
                    ? <><Spinner className="mr-2" />Saving password…</>
                    : <><KeyRound className="mr-2 h-4 w-4" />Set Password</>}
                </Button>
              </div>

              <button
                type="button"
                onClick={handleCancel}
                disabled={loading}
                className="text-center text-xs text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
              >
                Cancel and return to login
              </button>
            </form>
          )}
        </div>
      )}
    </AuthPageShell>
  )
}