import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { finalizeLogin } from '@/lib/auth/finalize-login'

type Payload =
  | { ok: true; redirectPath: string }
  | { ok: false; message: string }

/**
 * Resolves the public base URL (e.g. https://www.meedo-alubijid-waterworks.com).
 * Behind a load balancer / reverse proxy, request.url can show an internal
 * host like localhost:3000, so prefer the forwarded host in production.
 */
function getBaseUrl(request: Request): string {
  const { origin } = new URL(request.url)

  // Local dev: no proxy in between
  if (process.env.NODE_ENV === 'development') return origin

  // x-forwarded-* can be a comma-separated list; the first value is the original client-facing one
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()

  if (forwardedHost) return `${forwardedProto || 'https'}://${forwardedHost}`

  return origin
}

/**
 * Returns a tiny HTML page that:
 *  1. broadcasts the result to the login tab (BroadcastChannel is same-origin
 *     and not affected by Google's Cross-Origin-Opener-Policy), and
 *  2. closes the popup.
 * If the page was NOT opened as a popup (window.close() is ignored), it
 * falls back to a normal redirect built from the base URL, so the plain
 * redirect flow still works and never lands on localhost.
 */
function respond(payload: Payload, baseUrl: string) {
  // Only allow same-site relative paths
  const safePayload: Payload =
    payload.ok && !payload.redirectPath.startsWith('/')
      ? { ok: true, redirectPath: '/' }
      : payload

  const json = JSON.stringify(safePayload).replace(/</g, '\\u003c')
  const base = JSON.stringify(baseUrl).replace(/</g, '\\u003c')

  const html = `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Signing in…</title></head>
  <body style="font-family: system-ui, sans-serif; text-align: center; padding-top: 3rem; color: #475569;">
    <p>Signing you in…</p>
    <script>
      (function () {
        var data = ${json};
        var base = ${base};
        try {
          var ch = new BroadcastChannel('google-auth');
          ch.postMessage(data);
          ch.close();
        } catch (e) {}
        window.close();
        // Still open => not a popup. Fall back to a normal redirect to the base URL.
        setTimeout(function () {
          window.location.replace(
            data.ok
              ? base + data.redirectPath
              : base + '/login?error=' + encodeURIComponent(data.message)
          );
        }, 400);
      })();
    </script>
  </body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const baseUrl = getBaseUrl(request)

  const fail = (message: string) => respond({ ok: false, message }, baseUrl)

  // Google (or Supabase) reported a problem, e.g. the user cancelled.
  if (searchParams.get('error')) {
    return fail(searchParams.get('error_description') ?? 'Google sign-in was cancelled.')
  }

  const code = searchParams.get('code')
  if (!code) return fail('Google sign-in failed. Please try again.')

  const supabase = await createClient()

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError) return fail('Google sign-in failed. Please try again.')

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('Google sign-in failed. Please try again.')

  const result = await finalizeLogin(user.id)

  if (!result.ok) {
    await supabase.auth.signOut()
    return fail(result.message)
  }

  return respond({ ok: true, redirectPath: result.redirectPath }, baseUrl)
}