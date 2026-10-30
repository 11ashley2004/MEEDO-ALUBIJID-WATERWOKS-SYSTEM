import { DateFormatPH } from '@/lib/helper/date.utils'
import { getBaseRoute, type UserRole } from '@/lib/constants/roles'
import { getAppBaseUrl, sendEmail } from '@/lib/email/resend'

export interface JobAssignmentEmailRecipient {
  email: string
  first_name: string
  last_name: string
  role_name: string
  is_lead: boolean
}

export interface JobAssignmentEmailContext {
  job_order_count: number
  scheduled_at: string
  barangay_name: string | null
  job_assignment_id: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function jobOrdersUrl(roleName: string): string | null {
  const origin = getAppBaseUrl()
  if (!origin) return null
  const base = getBaseRoute(roleName as UserRole)
  // Meter readers and plumbers use singular "job-order"
  if (roleName === 'meter-reader' || roleName === 'plumber') {
    return `${origin}${base}/job-order`
  }
  return `${origin}${base}/job-orders`
}

function fullName(r: JobAssignmentEmailRecipient): string {
  return [r.first_name, r.last_name].filter(Boolean).join(' ') || 'there'
}

function buildSubject(ctx: JobAssignmentEmailContext, isLead: boolean): string {
  const count = ctx.job_order_count
  const noun = count === 1 ? 'job order' : 'job orders'
  const role = isLead ? 'assigned' : 'added as a helper on'
  return `You've been ${role} ${count} ${noun}`
}

function buildHtml(
  recipient: JobAssignmentEmailRecipient,
  ctx: JobAssignmentEmailContext,
): string {
  const name = escapeHtml(fullName(recipient))
  const scheduled = escapeHtml(DateFormatPH(ctx.scheduled_at))
  const barangay = ctx.barangay_name ? escapeHtml(ctx.barangay_name) : null
  const count = ctx.job_order_count
  const noun = count === 1 ? 'job order' : 'job orders'
  const roleLabel = recipient.is_lead ? 'lead worker' : 'helper'
  const ctaUrl = jobOrdersUrl(recipient.role_name)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>New job assignment</title>
</head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="background:#0369a1;padding:24px 28px;">
              <p style="margin:0;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;color:#bae6fd;">Meedo Waterworks</p>
              <h1 style="margin:8px 0 0;font-size:22px;line-height:1.3;color:#ffffff;font-weight:600;">New job assignment</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Hi ${name},</p>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#334155;">
                You have been assigned as <strong>${roleLabel}</strong> on
                <strong>${count}</strong> ${noun}${barangay ? ` in <strong>${barangay}</strong>` : ''}.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;margin:0 0 24px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;">Scheduled</p>
                    <p style="margin:0;font-size:16px;font-weight:600;color:#0f172a;">${scheduled}</p>
                    ${
                      barangay
                        ? `<p style="margin:14px 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;">Barangay</p>
                    <p style="margin:0;font-size:15px;color:#0f172a;">${barangay}</p>`
                        : ''
                    }
                    <p style="margin:14px 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;">Job orders</p>
                    <p style="margin:0;font-size:15px;color:#0f172a;">${count}</p>
                  </td>
                </tr>
              </table>
              ${
                ctaUrl
                  ? `<table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:8px;background:#0369a1;">
                    <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:12px 20px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">
                      Open job orders
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#64748b;">
                If the button doesn’t work, open this link:<br />
                <a href="${escapeHtml(ctaUrl)}" style="color:#0369a1;word-break:break-all;">${escapeHtml(ctaUrl)}</a>
              </p>`
                  : `<p style="margin:0;font-size:13px;line-height:1.5;color:#64748b;">
                Sign in to Meedo Waterworks to view your job orders.
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

function buildText(
  recipient: JobAssignmentEmailRecipient,
  ctx: JobAssignmentEmailContext,
): string {
  const name = fullName(recipient)
  const scheduled = DateFormatPH(ctx.scheduled_at)
  const count = ctx.job_order_count
  const noun = count === 1 ? 'job order' : 'job orders'
  const roleLabel = recipient.is_lead ? 'lead worker' : 'helper'
  const barangay = ctx.barangay_name ? ` in ${ctx.barangay_name}` : ''
  const ctaUrl = jobOrdersUrl(recipient.role_name)

  return [
    `Hi ${name},`,
    '',
    `You have been assigned as ${roleLabel} on ${count} ${noun}${barangay}.`,
    `Scheduled: ${scheduled}`,
    ctx.barangay_name ? `Barangay: ${ctx.barangay_name}` : null,
    `Job orders: ${count}`,
    '',
    ctaUrl ? `Open your job orders: ${ctaUrl}` : 'Sign in to Meedo Waterworks to view your job orders.',
    '',
    '— Meedo Waterworks',
  ]
    .filter((line) => line !== null)
    .join('\n')
}

/**
 * Sends assignment emails to the lead worker and helpers.
 * Failures are logged and do not throw — assignment creation must not fail on email.
 */
export async function sendJobAssignmentEmails(
  recipients: JobAssignmentEmailRecipient[],
  ctx: JobAssignmentEmailContext,
): Promise<void> {
  const withEmail = recipients.filter((r) => r.email?.trim())
  if (withEmail.length === 0) {
    console.warn('[email] No recipient emails for job assignment', ctx.job_assignment_id)
    return
  }

  await Promise.allSettled(
    withEmail.map(async (recipient) => {
      const result = await sendEmail({
        to: recipient.email.trim(),
        subject: buildSubject(ctx, recipient.is_lead),
        html: buildHtml(recipient, ctx),
        text: buildText(recipient, ctx),
      })
      if (!result.ok) {
        console.error(
          `[email] Failed to notify ${recipient.email} for assignment ${ctx.job_assignment_id}:`,
          result.error,
        )
      }
    }),
  )
}
