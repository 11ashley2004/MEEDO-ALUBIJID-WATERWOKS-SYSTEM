'use client'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { signIn, logout } from '@/lib/actions/auth'
import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  LoginFormValues,
  loginFormSchema,
} from '@/lib/validation/auth.validation'
import { Eye, EyeOff, Mail, Lock } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { useRouter } from 'next/navigation'
import { Turnstile, TurnstileInstance } from '@marsidev/react-turnstile'
import Link from 'next/link'
import { LegalModal, LegalDoc } from '@/components/auth/legal-modal'
// Browser Supabase client (adjust the path if yours differs)
import { createClient as createBrowserClient } from '@/lib/supabase/client'

// text-base on mobile keeps iOS from zooming into the field on focus
const inputBase = cn(
  'h-12 sm:h-11 rounded-md bg-white border-2 border-slate-200 pl-10',
  'text-base sm:text-sm text-slate-800 placeholder:text-slate-300',
  'focus:border-purple-400 focus:ring-0 focus-visible:ring-0 focus-visible:border-purple-400',
  'hover:border-slate-300 transition-colors disabled:opacity-50',
)

const labelBase = 'text-slate-600 text-xs font-semibold uppercase tracking-wider'

const linkBtn =
  'font-medium text-purple-600 underline-offset-4 hover:text-purple-800 hover:underline'

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<'form'>) {
  const [loading,      setLoading]      = useState(false)
  const [redirecting,  setRedirecting]  = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | undefined>(undefined)
  const [showCaptcha,  setShowCaptcha]  = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [legalOpen,    setLegalOpen]    = useState(false)
  const [legalDoc,     setLegalDoc]     = useState<LegalDoc>('terms')
  const [googleLoading, setGoogleLoading] = useState(false)

  const turnstileRef = useRef<TurnstileInstance>(null)
  // Remembers which action the user clicked while the CAPTCHA is running
  const pendingRef   = useRef<'email' | 'google' | null>(null)
  const router       = useRouter()

  useEffect(() => { logout() }, [])

  // Show errors passed back by /auth/callback (e.g. Google email has no account).
  // Read from window.location so this page doesn't need a Suspense boundary.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const err = params.get('error')
    if (err) {
      toast.error(err)
      params.delete('error')
      const qs = params.toString()
      window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''))
    }
  }, [])

  // Receives the result from the Google popup (sent by /auth/callback).
  // BroadcastChannel is used instead of window.opener because Google's
  // Cross-Origin-Opener-Policy can sever the opener link.
  useEffect(() => {
    const channel = new BroadcastChannel('google-auth')
    channel.onmessage = (e) => {
      const data = e.data as { ok: boolean; redirectPath?: string; message?: string }
      setGoogleLoading(false)
      if (data?.ok && data.redirectPath) {
        setRedirecting(true)
        router.push(data.redirectPath)
        router.refresh()
      } else {
        toast.error(data?.message ?? 'Google sign-in failed. Please try again.')
      }
    }
    return () => channel.close()
  }, [router])

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
  })

  const isBusy = loading || redirecting || showCaptcha

  const resetCaptcha = () => {
    turnstileRef.current?.reset()
    setCaptchaToken(undefined)
    setShowCaptcha(false)
  }

  const openLegal = (doc: LegalDoc) => {
    setLegalDoc(doc)
    setLegalOpen(true)
  }
  const closeLegal = useCallback(() => setLegalOpen(false), [])

  // Reveal the widget and start the challenge
  const requestCaptcha = (action: 'email' | 'google') => {
    pendingRef.current = action
    setShowCaptcha(true)
    turnstileRef.current?.reset()
    turnstileRef.current?.execute()
  }

  const handleCaptchaSuccess = (token: string) => {
    setCaptchaToken(token)
    const pending = pendingRef.current
    pendingRef.current = null
    setShowCaptcha(false)

    if (pending === 'email') {
      // Re-run validation + submit with the fresh token
      form.handleSubmit((values) => runSignIn(values, token))()
    } else if (pending === 'google') {
      // Browsers only allow popups shortly after a user click.
      // If the challenge took too long, ask for one more click (token is kept).
      if (navigator.userActivation?.isActive) {
        runGoogleSignIn()
      } else {
        toast.info('Verified. Click "Continue with Google" to continue.')
      }
    }
  }

  function signInWithGoogle() {
    if (!captchaToken) {
      requestCaptcha('google')
      return
    }
    runGoogleSignIn()
  }

  async function runGoogleSignIn() {
    // Open the popup synchronously (inside the click) so browsers don't
    // block it, then point it at Google once we have the OAuth URL.
    const w = 480
    const h = 640
    const left = Math.max(0, window.screenX + (window.outerWidth - w) / 2)
    const top = Math.max(0, window.screenY + (window.outerHeight - h) / 2)
    const popup = window.open(
      'about:blank',
      'google-signin',
      `width=${w},height=${h},left=${left},top=${top},popup=yes`,
    )

    if (!popup) {
      toast.error('Popup was blocked. Please allow popups for this site and try again.')
      return
    }

    setGoogleLoading(true)
    try {
      const supabase = createBrowserClient()
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          skipBrowserRedirect: true, // we open the URL in the popup ourselves
          queryParams: { prompt: 'select_account' },
        },
      })

      if (error || !data?.url) {
        popup.close()
        toast.error(error?.message ?? 'Could not start Google sign-in. Please try again.')
        setGoogleLoading(false)
        return
      }

      popup.location.href = data.url
      popup.focus()

      // If the user closes the popup (X) without finishing, stop the spinner.
      // The short delay lets a result message that is already in flight
      // arrive first, so a successful login isn't mistaken for a cancel.
      const timer = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(timer)
          window.setTimeout(() => setGoogleLoading(false), 1000)
        }
      }, 500)
    } catch {
      popup.close()
      toast.error('Could not start Google sign-in. Please try again.')
      setGoogleLoading(false)
    }
  }

  async function onSubmit(values: LoginFormValues) {
    if (!captchaToken) {
      requestCaptcha('email')
      return
    }
    await runSignIn(values, captchaToken)
  }

  async function runSignIn(values: LoginFormValues, token: string) {
    setLoading(true)
    try {
      const result = await signIn({ ...values, captchaToken: token })

      if (result.status === 'error') {
        toast.error(result.message)
        resetCaptcha()
        return
      }

      if (result.status === 'otp_required') {
        toast.info('A verification code has been sent to your email.')

        if (!result.email) {
          toast.error('Something went wrong. Please try logging in again.')
          resetCaptcha()
          return
        }

        setRedirecting(true)
        router.push(`/set-password?email=${encodeURIComponent(result.email)}`)
        return
      }

      if (result.status === 'password_required') {
        toast.info(result.message)

        setRedirecting(true)
        router.push('/set-password')
        return
      }

      if (result.status === 'success' && result.redirectPath) {
        setRedirecting(true)
        toast.success(result.message)
        router.push(result.redirectPath)
      }
    } catch {
      toast.error('An unexpected error occurred. Please try again.')
      resetCaptcha()
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <form
        className={cn('flex flex-col gap-5', className)}
        onSubmit={form.handleSubmit(onSubmit)}
        {...props}
      >
        {/* Title — desktop only; mobile shows it in the purple header */}
        <div className="hidden flex-col gap-1 lg:flex">
          <h1 className="text-2xl font-bold leading-tight text-slate-800">Welcome back</h1>
          <p className="text-sm text-slate-500">Sign in to access the management system</p>
        </div>

        <div className="hidden h-px w-full bg-slate-200 lg:block" />

        {/* Email */}
        <Controller
          name="email"
          control={form.control}
          render={({ field, fieldState }) => (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" className={labelBase}>
                Email Address
              </Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  {...field}
                  id="email"
                  type="email"
                  inputMode="email"
                  placeholder="you@meedo.com"
                  disabled={isBusy}
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-invalid={!!fieldState.error}
                  className={cn(inputBase, fieldState.error && 'border-red-300 focus:border-red-400')}
                />
              </div>
              {fieldState.error && (
                <p role="alert" className="text-xs text-red-500">{fieldState.error.message}</p>
              )}
            </div>
          )}
        />

        {/* Password */}
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className={labelBase}>
                  Password
                </Label>
                <Link
                  href="/forgot-password"
                  className="-my-2 py-2 text-xs font-medium text-purple-600 underline-offset-4 transition-colors hover:text-purple-800 hover:underline"
                  tabIndex={-1}
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  {...field}
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  disabled={isBusy}
                  autoComplete="current-password"
                  aria-invalid={!!fieldState.error}
                  className={cn(inputBase, 'pr-12', fieldState.error && 'border-red-300 focus:border-red-400')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-7 h-7 rounded-md border-2 border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {fieldState.error && (
                <p role="alert" className="text-xs text-red-500">{fieldState.error.message}</p>
              )}
            </div>
          )}
        />

        {/* CAPTCHA: collapsed until the user tries to sign in.
            h-0 + overflow-hidden (not display:none) so the widget can still
            measure its width; -mt-5 cancels the flex gap while collapsed. */}
        <div
          className={cn(
            'w-full overflow-hidden rounded-md transition-all',
            showCaptcha ? 'h-auto' : 'h-0 -mt-5',
          )}
        >
          <Turnstile
            ref={turnstileRef}
            siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE!}
            options={{ size: 'flexible', execution: 'execute', appearance: 'always' }}
            onSuccess={handleCaptchaSuccess}
            onExpire={() => setCaptchaToken(undefined)}
            onError={() => {
              pendingRef.current = null
              resetCaptcha()
              toast.error('CAPTCHA error. Please try the verification again.')
            }}
          />
        </div>

        {/* Submit */}
        <div className="rounded-md border border-gray-300 p-1">
          <Button
            type="submit"
            disabled={isBusy}
            className={cn(
              'h-12 sm:h-11 w-full rounded-md text-sm font-semibold',
              'border bg-purple-700 text-white border-purple-400/40',
              'hover:bg-purple-600 hover:border-purple-300/50',
              'disabled:bg-purple-200 disabled:text-purple-400 disabled:border-purple-200',
              'transition-colors shadow-sm',
            )}
          >
            {isBusy && <Spinner className="mr-2" />}
            {showCaptcha ? 'Verifying…' : isBusy ? 'Signing in…' : 'Sign In'}
          </Button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3" role="separator" aria-label="or">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-xs text-slate-400">or</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        {/* Google */}
        <Button
          type="button"
          variant="outline"
          disabled={isBusy}
          onClick={signInWithGoogle}
          className={cn(
            'h-12 sm:h-11 w-full rounded-md text-sm font-semibold',
            'border-2 border-slate-200 bg-white text-slate-700',
            'hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800',
            'disabled:opacity-50 transition-colors',
          )}
        >
          {googleLoading
            ? <Spinner className="mr-2" />
            : <GoogleIcon className="mr-2 h-4 w-4" />}
          {googleLoading ? 'Waiting for Google…' : 'Continue with Google'}
        </Button>

        {/* Legal + footer */}
        <div className="flex flex-col gap-2 text-center text-xs leading-5 text-slate-500">
          <p>
            By signing in, you agree to our{' '}
            <button type="button" onClick={() => openLegal('terms')} className={linkBtn}>
              Terms of Service
            </button>{' '}
            and{' '}
            <button type="button" onClick={() => openLegal('privacy')} className={linkBtn}>
              Privacy Policy
            </button>
            .
          </p>
          <p className="text-slate-400">Authorized MEEDO Waterworks personnel only</p>
        </div>
      </form>

      <LegalModal doc={legalDoc} open={legalOpen} onClose={closeLegal} />
    </>
  )
}