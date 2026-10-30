'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Loader2, Mail, ArrowLeft, ShieldCheck, KeyRound,
  Eye, EyeOff, AlertCircle,
} from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { Turnstile, TurnstileInstance } from '@marsidev/react-turnstile'
import { AuthPageShell } from '@/components/auth/auth-layout'
import Link from 'next/link'
import { PASSWORD_RULES } from  '@/lib/validation/forgot-pass/password-rules'
import {
  sendForgotPasswordOtp,
  resendForgotPasswordOtp,
  verifyForgotPasswordOtp,
  resetPassword,
  type RecoveryTokens,
} from '@/lib/actions/forgot-password.actions'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const emailSchema = z.object({
  email: z.string().email('Enter a valid email address'),
})

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
    path:    ['confirm'],
  })

type EmailValues    = z.infer<typeof emailSchema>
type PasswordValues = z.infer<typeof passwordSchema>

// ─── Strength levels — same 5-step scale as the Expo screen ───────────────────

const STRENGTH_LEVELS = [
  { label: 'Very weak', color: '#ef4444' },
  { label: 'Weak',      color: '#f97316' },
  { label: 'Fair',      color: '#eab308' },
  { label: 'Good',      color: '#84cc16' },
  { label: 'Strong',    color: '#22c55e' },
]

// ─── Per-step page copy (mobile header + desktop card title) ─────────────────

const STEP_COPY: Record<1 | 2 | 3, { title: string; subtitle: string }> = {
  1: { title: 'Reset password',    subtitle: "Enter your email and we'll send a 6-digit reset code." },
  2: { title: 'Check your email',  subtitle: 'We sent a reset code to your email.' },
  3: { title: 'Set new password',  subtitle: 'Create a strong password to secure your account.' },
}

// ─── Shared input class (same as LoginForm) ───────────────────────────────────

const inputCls = cn(
  'h-11 rounded-md bg-white border-2 focus:border-3 border-slate-200',
  'text-slate-800 placeholder:text-slate-300',
  'focus:border-purple-400 focus:ring-0 focus-visible:ring-0 focus-visible:border-purple-400',
  'hover:border-slate-300 transition-colors disabled:opacity-50',
)

// ─── Primary button class (bordered, purple theme) ────────────────────────────

const primaryBtnCls = cn(
  'h-11 w-full font-semibold rounded-md text-sm',
  'bg-purple-700 text-white border-purple-400/40',
  'hover:bg-purple-600 hover:border-purple-300/50',
  'disabled:bg-purple-200 disabled:text-purple-400 disabled:border-purple-200',
  'transition-colors shadow-sm',
)

// ─── Step pill indicator ──────────────────────────────────────────────────────

function StepDots({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center gap-2">
      {[1, 2, 3].map((s) => (
        <div
          key={s}
          className={cn(
            'h-1 rounded-md transition-all duration-300',
            step === s   ? 'w-6 bg-purple-600'
            : step > s   ? 'w-3 bg-purple-300'
            :               'w-3 bg-slate-200',
          )}
        />
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ForgotPasswordPage() {
  const router = useRouter()

  const [step,        setStep]        = useState<1 | 2 | 3>(1)
  const [loading,     setLoading]     = useState(false)
  const [redirecting, setRedirecting] = useState(false)

  // Step 1
  const [captchaToken, setCaptchaToken] = useState<string | undefined>(undefined)
  const turnstileRef = useRef<TurnstileInstance>(null)

  // Step 2
  const [otp,          setOtp]          = useState('')
  const [otpLoading,   setOtpLoading]   = useState(false)
  const [resending,    setResending]    = useState(false)
  const [limitReached, setLimitReached] = useState(false)

  // Shared
  const [email,       setEmail]       = useState('')
  const [maskedEmail, setMaskedEmail] = useState('')

  const [tokens, setTokens] = useState<RecoveryTokens | null>(null)

  // Step 3
  const [showPass,    setShowPass]    = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const emailForm = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: '' },
  })

  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '', confirm: '' },
  })

  const watchPassword = passwordForm.watch('password') ?? ''

  // ── Strength meter derived state ──────────────────────────────────────────
  const passedRules   = PASSWORD_RULES.filter((rule) => rule.test(watchPassword))
  const missingRules  = PASSWORD_RULES.filter((rule) => !rule.test(watchPassword))
  const strengthIndex = watchPassword.length === 0 ? -1 : Math.min(passedRules.length, STRENGTH_LEVELS.length) - 1
  const strength       = strengthIndex >= 0 ? STRENGTH_LEVELS[strengthIndex] : null
  const filledSegments  = watchPassword.length === 0 ? 0 : passedRules.length

  const resetCaptcha = () => {
    turnstileRef.current?.reset()
    setCaptchaToken(undefined)
  }

  const goToStep1 = () => {
    setStep(1)
    setOtp('')
    setTokens(null)
    setLimitReached(false)
  }

  // ── Step 1 ────────────────────────────────────────────────────────────────

  const onEmailSubmit = async (values: EmailValues) => {
    if (!captchaToken) { toast.error('Please complete the CAPTCHA verification.'); return }
    setLoading(true)
    try {
      const result = await sendForgotPasswordOtp(values.email, captchaToken)

      if (result.status === 'error') {
        toast.error(result.message)
        resetCaptcha()
        return
      }

      setEmail(values.email.trim().toLowerCase())
      const [local, domain] = values.email.split('@')
      setMaskedEmail(`${local[0]}***@${domain}`)
      setLimitReached(false)
      setOtp('')
      setTokens(null)
      toast.success('Reset code sent! Check your email inbox.')
      setStep(2)
    } catch {
      toast.error('An unexpected error occurred. Please try again.')
      resetCaptcha()
    } finally {
      setLoading(false)
    }
  }

  // ── Step 2 ────────────────────────────────────────────────────────────────

  const onOtpVerify = async (submittedOtp?: string) => {
    const code = submittedOtp ?? otp
    if (code.length < 6) { toast.error('Enter the complete 6-digit code.'); return }
    if (!email)          { toast.error('Session expired. Please start again.'); goToStep1(); return }
    setOtpLoading(true)
    try {
      const result = await verifyForgotPasswordOtp(email, code)
      if (result.status === 'error' || !result.tokens) {
        toast.error(result.status === 'error' ? result.message : 'Something went wrong. Please try again.')
        setOtp('')
        return
      }
      setTokens(result.tokens)
      toast.success('Code verified! Set your new password.')
      setStep(3)
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setOtpLoading(false)
    }
  }

  // Auto-verify as soon as all 6 digits are entered
  useEffect(() => {
    if (otp.length === 6 && !otpLoading) {
      onOtpVerify(otp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp])

  const onResend = async () => {
    if (!email || limitReached) return
    setResending(true)
    try {
      const result = await resendForgotPasswordOtp(email)
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

  // ── Step 3 ────────────────────────────────────────────────────────────────

  const onPasswordSubmit = async (values: PasswordValues) => {
    if (!email || !tokens) {
      toast.error('Session expired. Please start again.')
      goToStep1()
      return
    }
    setLoading(true)
    try {
      const result = await resetPassword(values.password, tokens)
      if (result.status === 'error') {
        toast.error(result.message)
        if (result.message.toLowerCase().includes('session expired')) {
          goToStep1()
        }
        return
      }
      setRedirecting(true)
      toast.success('Password reset successfully! Please log in.')
      router.replace('/login')
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Redirecting ───────────────────────────────────────────────────────────

  if (redirecting) {
    return (
      <div className="min-h-svh flex flex-col items-center justify-center gap-3 bg-slate-50">
        <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
        <p className="text-sm text-slate-500">Redirecting to login…</p>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const stepCopy = STEP_COPY[step]
  const subtitle =
    step === 2 && maskedEmail
      ? `We sent a reset code to ${maskedEmail}.`
      : stepCopy.subtitle

  return (
    <AuthPageShell>
      <div className="flex flex-col gap-5">

        {/* Header — shown on all breakpoints since AuthPageShell doesn't
            receive title props anymore. */}
        <div className="mb-1 flex flex-col gap-1">
          <div className="mb-1 flex items-center justify-between">
            <h1 className="text-2xl font-bold leading-tight text-slate-800">
              {stepCopy.title}
            </h1>
            <StepDots step={step} />
          </div>
          <p className="text-sm text-slate-400">{subtitle}</p>
        </div>

        <div className="h-px w-full bg-slate-200" />

        {/* ── Step 1: Email ──────────────────────────────────────────────── */}
        {step === 1 && (
          <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="flex flex-col gap-5">
            <Controller
              name="email"
              control={emailForm.control}
              render={({ field, fieldState }) => (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="fp-email" className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Email Address
                  </Label>
                  <Input
                    {...field}
                    id="fp-email"
                    type="email"
                    placeholder="you@meedo.com"
                    disabled={loading}
                    autoComplete="email"
                    className={inputCls}
                  />
                  {fieldState.error && <p className="text-xs text-red-500">{fieldState.error.message}</p>}
                </div>
              )}
            />
             
            <div className="w-full overflow-hidden rounded-md">
               <Turnstile
                ref={turnstileRef}
                 options={{ size: 'flexible' }}
                siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE!}
                onSuccess={(token) => setCaptchaToken(token)}
                onExpire={() => setCaptchaToken(undefined)}
                onError={() => { setCaptchaToken(undefined); resetCaptcha() }}
              />
            </div>

            <div className='rounded-md border border-gray-300 p-1'>
              <Button
                type="submit"
                disabled={loading}
                className={primaryBtnCls}
              >
                {loading
                  ? <><Spinner className="mr-2" />Sending…</>
                  : <><Mail className="mr-2 h-4 w-4" />Send Reset Code</>
                }
              </Button>
            </div>

            <p className="text-center text-xs text-slate-400">
              Remember your password?{' '}
              <Link href="/login" className="text-purple-500 underline-offset-4 transition-colors hover:text-purple-700 hover:underline">
                Back to login
              </Link>
            </p>
          </form>
        )}

        {/* ── Step 2: OTP ─────────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col items-center gap-3">
              <InputOTP maxLength={6} value={otp} onChange={(v) => setOtp(v.trim())} disabled={otpLoading}>
                <InputOTPGroup className="gap-2">
                  {[0,1,2,3,4,5].map((i) => (
                    <InputOTPSlot
                      key={i}
                      index={i}
                      className="!h-12 !w-11 !rounded-md !border !border-violet-300 !bg-white text-lg font-bold text-slate-800 transition-colors data-[active=true]:!border-violet-600 data-[active=true]:!ring-2 data-[active=true]:!ring-violet-200"
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              <p className="text-xs text-slate-400">Enter the 6-digit reset code</p>
            </div>

            <div className='rounded-md border border-gray-300 p-1'>
              <Button
                onClick={() => onOtpVerify()}
                disabled={otpLoading || otp.length < 6}
                className={primaryBtnCls}
              >
                {otpLoading
                  ? <><Spinner className="mr-2" />Verifying…</>
                  : <><ShieldCheck className="mr-2 h-4 w-4" />Verify Code</>
                }
              </Button>
            </div>

            {/* Resend */}
            <div className="flex flex-col items-center gap-2">
              {limitReached ? (
                <div className="flex w-full items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
                  <AlertCircle className="mt-0.5 w-3.5 h-3.5 flex-shrink-0" />
                  <span>Too many resend attempts. Please wait a while before trying again, or go back and start over.</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-1.5 text-sm">
                  <span className="text-slate-400">Didn&apos;t receive a code?</span>
                  <button
                    onClick={onResend}
                    disabled={resending}
                    className="font-medium text-purple-500 underline-offset-4 transition-colors hover:text-purple-700 hover:underline disabled:opacity-50"
                  >
                    {resending
                      ? <span className="flex items-center gap-1"><Spinner />Resending…</span>
                      : 'Resend code'
                    }
                  </button>
                </div>
              )}
            </div>

            <p className="text-center text-xs text-slate-400">
              <button
                type="button"
                onClick={goToStep1}
                className="inline-flex items-center gap-1 text-purple-500 underline-offset-4 transition-colors hover:text-purple-700 hover:underline"
              >
                <ArrowLeft className="w-3 h-3" /> Back
              </button>
            </p>
          </div>
        )}

        {/* ── Step 3: New password ──────────────────────────────────────── */}
        {step === 3 && (
          <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="flex flex-col gap-5">
            <Controller
              name="password"
              control={passwordForm.control}
              render={({ field, fieldState }) => (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="fp-password" className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                    New Password
                  </Label>
                  <div className="relative">
                    <Input
                      {...field}
                      id="fp-password"
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

            {/* Strength meter */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Password strength
                </span>
                {strength ? (
                  <span className="text-xs font-bold" style={{ color: strength.color }}>
                    {strength.label}
                  </span>
                ) : null}
              </div>

              <div className="mb-3 flex gap-1.5">
                {PASSWORD_RULES.map((rule, i) => (
                  <div
                    key={rule.label}
                    className="h-1.5 flex-1 rounded-full transition-colors"
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
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-500"
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
              control={passwordForm.control}
              render={({ field, fieldState }) => (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="fp-confirm" className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Confirm Password
                  </Label>
                  <div className="relative">
                    <Input
                      {...field}
                      id="fp-confirm"
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

            <div className='rounded-md border border-gray-300 p-1'>
              <Button
                type="submit"
                disabled={loading}
                className={primaryBtnCls}
              >
                {loading
                  ? <><Spinner className="mr-2" />Saving…</>
                  : <><KeyRound className="mr-2 h-4 w-4" />Reset Password</>
                }
              </Button>
            </div>

            <p className="text-center text-xs text-slate-400">
              <Link
                href="/login"
                className="inline-flex items-center gap-1 text-purple-500 underline-offset-4 transition-colors hover:text-purple-700 hover:underline"
              >
                <ArrowLeft className="w-3 h-3" /> Cancel and return to login
              </Link>
            </p>
          </form>
        )}

      </div>
    </AuthPageShell>
  )
}