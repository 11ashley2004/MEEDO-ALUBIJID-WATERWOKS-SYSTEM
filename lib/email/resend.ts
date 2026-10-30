import { Resend } from 'resend'

let client: Resend | null = null

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY is not set — emails will be skipped')
    return null
  }
  if (!client) client = new Resend(apiKey)
  return client
}

export function getEmailFromAddress(): string {
  return process.env.RESEND_FROM_EMAIL?.trim() || 'Meedo Waterworks <beth.t@example.com>'
}

/** Absolute app origin from env only — no localhost fallback (avoids production conflicts). */
export function getAppBaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (!raw) {
    console.warn('[email] NEXT_PUBLIC_APP_URL is not set — email links will be omitted')
    return null
  }
  return raw.replace(/\/$/, '')
}

export interface SendEmailParams {
  to: string | string[]
  subject: string
  html: string
  text?: string
}

export async function sendEmail(
  params: SendEmailParams,
): Promise<{ ok: boolean; error?: string }> {
  const resend = getResend()
  if (!resend) {
    return { ok: false, error: 'Resend is not configured' }
  }

  const { data, error } = await resend.emails.send({
    from: getEmailFromAddress(),
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  })

  if (error) {
    console.error('[email] send failed:', error)
    return { ok: false, error: error.message }
  }

  if (!data?.id) {
    return { ok: false, error: 'No message id returned from Resend' }
  }

  return { ok: true }
}
