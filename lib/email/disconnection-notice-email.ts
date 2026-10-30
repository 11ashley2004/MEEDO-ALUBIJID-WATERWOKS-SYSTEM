import { getAppBaseUrl, sendEmail } from '@/lib/email/resend'

export interface DisconnectionNoticeEmailParams {
  to: string
  consumer_name: string
  meter_serial_no: string
  balance: number
  months_unpaid: number
  notice_no?: string | null
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatPeso(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function buildHtml(params: DisconnectionNoticeEmailParams): string {
  const name = escapeHtml(params.consumer_name || 'Valued customer')
  const serial = escapeHtml(params.meter_serial_no || '—')
  const balance = escapeHtml(formatPeso(params.balance))
  const months = params.months_unpaid
  const monthsLabel = `${months} unpaid month${months !== 1 ? 's' : ''}`
  const noticeNo = params.notice_no?.trim()
    ? escapeHtml(params.notice_no.trim())
    : null
  const origin = getAppBaseUrl()
  const ctaUrl = origin ? `${origin}/billing` : null

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Notice of disconnection</title>
</head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="background:#be123c;padding:24px 28px;">
              <p style="margin:0;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;color:#fecdd3;">Meedo Waterworks</p>
              <h1 style="margin:8px 0 0;font-size:22px;line-height:1.3;color:#ffffff;font-weight:600;">Notice of disconnection</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Hi ${name},</p>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#334155;">
                Your water service account is at risk of disconnection due to unpaid balances.
                Please settle your outstanding bill as soon as possible to avoid interruption of service.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff1f2;border-radius:8px;border:1px solid #fecdd3;margin:0 0 24px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:#9f1239;">Meter</p>
                    <p style="margin:0;font-size:16px;font-weight:600;color:#0f172a;">${serial}</p>
                    <p style="margin:14px 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:#9f1239;">Outstanding balance</p>
                    <p style="margin:0;font-size:16px;font-weight:600;color:#be123c;">${balance}</p>
                    <p style="margin:14px 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:#9f1239;">Arrears</p>
                    <p style="margin:0;font-size:15px;color:#0f172a;">${escapeHtml(monthsLabel)}</p>
                    ${
                      noticeNo
                        ? `<p style="margin:14px 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:#9f1239;">Notice no.</p>
                    <p style="margin:0;font-size:15px;color:#0f172a;">${noticeNo}</p>`
                        : ''
                    }
                  </td>
                </tr>
              </table>
              ${
                ctaUrl
                  ? `<table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:8px;background:#be123c;">
                    <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:12px 20px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">
                      View billing
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#64748b;">
                If the button doesn’t work, open this link:<br />
                <a href="${escapeHtml(ctaUrl)}" style="color:#be123c;word-break:break-all;">${escapeHtml(ctaUrl)}</a>
              </p>`
                  : `<p style="margin:0;font-size:13px;line-height:1.5;color:#64748b;">
                Sign in to Meedo Waterworks to view your billing.
              </p>`
              }
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 24px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                This is an automated message from Meedo Waterworks. Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function buildText(params: DisconnectionNoticeEmailParams): string {
  const name = params.consumer_name || 'Valued customer'
  const serial = params.meter_serial_no || '—'
  const balance = formatPeso(params.balance)
  const months = params.months_unpaid
  const origin = getAppBaseUrl()
  const ctaUrl = origin ? `${origin}/billing` : null

  return [
    `Hi ${name},`,
    '',
    'Your water service account is at risk of disconnection due to unpaid balances.',
    'Please settle your outstanding bill as soon as possible to avoid interruption of service.',
    '',
    `Meter: ${serial}`,
    `Outstanding balance: ${balance}`,
    `Arrears: ${months} unpaid month${months !== 1 ? 's' : ''}`,
    params.notice_no?.trim() ? `Notice no.: ${params.notice_no.trim()}` : null,
    '',
    ctaUrl ? `View your billing: ${ctaUrl}` : 'Sign in to Meedo Waterworks to view your billing.',
    '',
    '— Meedo Waterworks',
  ]
    .filter((line) => line !== null)
    .join('\n')
}

/**
 * Email the consumer about a NOTICE_OF_DISCONNECTION.
 * Failures are logged and do not throw.
 */
export async function sendDisconnectionNoticeEmail(
  params: DisconnectionNoticeEmailParams,
): Promise<void> {
  const to = params.to?.trim()
  if (!to) {
    console.warn('[email] No consumer email for disconnection notice')
    return
  }

  const result = await sendEmail({
    to,
    subject: 'Notice of disconnection — Meedo Waterworks',
    html: buildHtml(params),
    text: buildText(params),
  })

  if (!result.ok) {
    console.error(`[email] Failed to send disconnection notice to ${to}:`, result.error)
  }
}
