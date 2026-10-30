import { createServerClient } from '@supabase/ssr'
import config from '@/config/config'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/auth', '/forgot-password', '/set-password']

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    config.env.supabase.supabaseUrl!,
    config.env.supabase.supabaseKey!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  supabaseResponse.headers.set('x-pathname', request.nextUrl.pathname)

  const { data } = await supabase.auth.getClaims()
  const user = data?.claims

  const isPublic      = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p))
  const isSetPassword = request.nextUrl.pathname.startsWith('/set-password')

  if (!user) {
    // /set-password is public for the pre-verify case: no session exists
    // until verifySetupOtp() succeeds, so an unauthenticated visitor still
    // needs to reach this page to enter their OTP in the first place.
    // Once a session exists, the needsPasswordSetup block below is what
    // actually gates the page — this branch just lets step 1 load.
    if (isPublic) return supabaseResponse
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Real gate: once a session exists (post-verifySetupOtp), this is the
  // only thing distinguishing "verified but still on temp password" from
  // "fully set up." Mirrors AuthContext.fetchAccountInfo() on mobile.
  const needsPasswordSetup = await getNeedsPasswordSetup(supabase, user.sub as string)

  if (needsPasswordSetup === null) {
    await supabase.auth.signOut()
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (needsPasswordSetup && !isSetPassword) {
    const url = request.nextUrl.clone()
    url.pathname = '/set-password'
    return NextResponse.redirect(url)
  }

  if (!needsPasswordSetup && isSetPassword) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

async function getNeedsPasswordSetup(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
): Promise<boolean | null> {
  const { data: staff } = await supabase
    .from('users')
    .select('is_default_password')
    .eq('user_id', userId)
    .maybeSingle()
  if (staff) return staff.is_default_password

  const { data: consumer } = await supabase
    .from('consumers')
    .select('is_default_password')
    .eq('consumer_id', userId)
    .maybeSingle()
  if (consumer) return consumer.is_default_password

  return null
}