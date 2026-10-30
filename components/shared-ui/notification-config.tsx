import {
  ClipboardList, CreditCard, Wrench, CheckCircle2, XCircle, Ban, Flag, Bell,
} from 'lucide-react'
import type { UserNotificationRecord } from '@/lib/actions/notifications/notifications.actions'

export interface NotificationDisplay {
  icon:       React.ElementType
  /** Full classes for the icon's colored box — flat fill + border, no gradient. */
  iconWrap:   string
  iconColor:  string
  title:      string
  body:       string
}

function fmtCurrency(amount: unknown): string {
  const n = typeof amount === 'number' ? amount : parseFloat(String(amount ?? 0))
  return isNaN(n) ? '₱0.00' : `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDateTime(v: unknown): string {
  if (!v) return ''
  const d = new Date(String(v))
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/**
 * Maps a notification's event_code + metadata to what the dropdown renders.
 * Add a case here whenever a new event_code is introduced anywhere a
 * createNotification / createNotifications call fires (notifications.ts,
 * meter-reading-adjustment.actions.ts, job-assignment.actions.ts,
 * worker-job-order.actions.ts, service-report.actions.ts, etc.)
 *
 * NOTE: this is the single source of truth for dropdown copy right now.
 * The `notification_templates` DB table is NOT read by the UI — editing
 * that table has no visible effect until/unless this function is
 * refactored to fetch + interpolate from it instead.
 */
export function getNotificationDisplay(n: UserNotificationRecord): NotificationDisplay {
  const m = n.metadata ?? {}

  switch (n.event_code) {
    case 'METER_READING_ADJUSTED_PENDING':
      return {
        icon: ClipboardList,
        iconWrap: 'bg-amber-50 border border-amber-200',
        iconColor: 'text-amber-600',
        title: 'Reading adjustment pending',
        body: `${m.meter_serial_no ?? 'Account'} · requested by ${m.reader_name ?? 'a meter reader'}`,
      }
    case 'METER_READING_ADJUSTED_APPROVED':
      return {
        icon: CheckCircle2,
        iconWrap: 'bg-emerald-50 border border-emerald-200',
        iconColor: 'text-emerald-600',
        title: 'Reading adjustment approved',
        body: m.new_reading != null
          ? `${m.meter_serial_no ?? 'Account'} updated to ${m.new_reading}`
          : `${m.meter_serial_no ?? 'Account'} has been updated`,
      }
    case 'METER_READING_ADJUSTED_REJECTED':
      return {
        icon: XCircle,
        iconWrap: 'bg-red-50 border border-red-200',
        iconColor: 'text-red-500',
        title: 'Reading adjustment rejected',
        body: `${m.meter_serial_no ?? 'Account'} · no changes were applied`,
      }
    case 'METER_READING_ADJUSTED_CANCELLED':
      return {
        icon: Ban,
        iconWrap: 'bg-slate-100 border border-slate-200',
        iconColor: 'text-slate-500',
        title: 'Reading adjustment cancelled',
        body: `${m.meter_serial_no ?? 'Account'} · request withdrawn by the requester`,
      }

    case 'PAYMENT_ADJUSTMENT_PENDING':
      return {
        icon: CreditCard,
        iconWrap: 'bg-amber-50 border border-amber-200',
        iconColor: 'text-amber-600',
        title: 'Payment adjustment pending',
        body: `${fmtCurrency(m.amount)} · ${m.meter_serial_no ?? 'Account'}${m.requester_name ? ` · ${m.requester_name}` : ''}`,
      }
    case 'PAYMENT_ADJUSTMENT_APPROVED':
      return {
        icon: CheckCircle2,
        iconWrap: 'bg-emerald-50 border border-emerald-200',
        iconColor: 'text-emerald-600',
        title: 'Payment adjustment approve',
        body: `${fmtCurrency(m.amount)} · ${m.meter_serial_no ?? 'Account'}`,
      }
    case 'PAYMENT_ADJUSTMENT_REJECTED':
      return {
        icon: XCircle,
        iconWrap: 'bg-red-50 border border-red-200',
        iconColor: 'text-red-500',
        title: 'Payment adjustment rejected',
        body: `${fmtCurrency(m.amount)} · ${m.meter_serial_no ?? 'Account'}`,
      }
    case 'PAYMENT_ADJUSTMENT_CANCELLED':
      return {
        icon: Ban,
        iconWrap: 'bg-slate-100 border border-slate-200',
        iconColor: 'text-slate-500',
        title: 'Payment adjustment cancelled',
        body: `${fmtCurrency(m.amount)} · ${m.meter_serial_no ?? 'Account'} · request withdrawn`,
      }

    case 'NEW_JOB_ASSIGNMENT':
      return {
        icon: Wrench,
        iconWrap: 'bg-blue-50 border border-blue-200',
        iconColor: 'text-blue-600',
        title: 'New job assignment',
        body: `${m.job_order_count ?? 1} job order${m.job_order_count !== 1 ? 's' : ''}${m.scheduled_at ? ` · ${fmtDateTime(m.scheduled_at)}` : ''}`,
      }
    case 'JOB_ASSIGNMENT_UPDATED':
      return {
        icon: Wrench,
        iconWrap: 'bg-violet-50 border border-violet-200',
        iconColor: 'text-violet-600',
        title: 'Job assignment updated',
        body: `${m.job_order_no ?? 'Job order'}${m.scheduled_at ? ` · ${fmtDateTime(m.scheduled_at)}` : ''}`,
      }

    case 'JOB_ORDER_COMPLETED':
      return {
        icon: CheckCircle2,
        iconWrap: 'bg-emerald-50 border border-emerald-200',
        iconColor: 'text-emerald-600',
        title: 'Job order completed',
        body: `${m.job_order_no ?? 'Job order'}${m.job_type_name ? ` · ${m.job_type_name}` : ''}`,
      }

    case 'SERVICE_REPORT_PENDING':
    case 'SERVICE_REPORT_NEW':
    case 'SERVICE_REPORT_RECEIVED':
      return {
        icon: Flag,
        iconWrap: 'bg-amber-50 border border-amber-200',
        iconColor: 'text-amber-600',
        title: 'Service report received',
        body: m.issue_name
          ? `${m.issue_name}${m.reference_no ? ` · ${m.reference_no}` : ''}`
          : 'A new service report was filed',
      }
    case 'SERVICE_REPORT_JOB_SCHEDULED':
      return {
        icon: CheckCircle2,
        iconWrap: 'bg-sky-50 border border-sky-200',
        iconColor: 'text-sky-600',
        title: 'Job scheduled',
        body: m.reference_no
          ? `Crew scheduled for ${m.reference_no}`
          : 'A crew has been scheduled for your report',
      }
    case 'SERVICE_REPORT_WORK_COMPLETED':
    case 'SERVICE_REPORT_FIELD_RESULT':
      return {
        icon: CheckCircle2,
        iconWrap: 'bg-violet-50 border border-violet-200',
        iconColor: 'text-violet-600',
        title: 'Field work completed',
        body: m.reference_no
          ? `Work finished on ${m.reference_no}`
          : 'Field work on a service report was completed',
      }
    case 'SERVICE_REPORT_CONFIRMED':
      return {
        icon: CheckCircle2,
        iconWrap: 'bg-emerald-50 border border-emerald-200',
        iconColor: 'text-emerald-600',
        title: 'Report completed',
        body: m.reference_no
          ? `${m.reference_no} confirmed complete`
          : 'Your service report was confirmed complete',
      }
    case 'SERVICE_REPORT_BILL_ADJUSTED':
      return {
        icon: Flag,
        iconWrap: 'bg-amber-50 border border-amber-200',
        iconColor: 'text-amber-700',
        title: 'Bill adjusted',
        body: m.adjusted_amount != null
          ? `${m.reference_no ?? 'Report'} · adjusted to ${fmtCurrency(m.adjusted_amount)}`
          : m.reference_no ?? 'A bill adjustment was encoded for your report',
      }
    case 'LEAK_CONFIRMED_BILL_ADJUST':
      return {
        icon: Flag,
        iconWrap: 'bg-amber-50 border border-amber-200',
        iconColor: 'text-amber-700',
        title: 'Leak confirmed — adjust bill',
        body: m.reference_no
          ? `Leak confirmed on ${m.reference_no}`
          : 'A leak report is ready for bill adjustment',
      }
    case 'SERVICE_REPORT_CANCELLED':
      return {
        icon: Ban,
        iconWrap: 'bg-slate-100 border border-slate-200',
        iconColor: 'text-slate-500',
        title: 'Service report cancelled',
        body: m.reason ? `${m.issue_name ?? 'Report'} · ${m.reason}` : `${m.issue_name ?? 'Report'} · no changes were applied`,
      }

    case 'NOTICE_OF_DISCONNECTION':
      return {
        icon: Flag,
        iconWrap: 'bg-rose-50 border border-rose-200',
        iconColor: 'text-rose-600',
        title: 'Notice of disconnection',
        body: [
          m.meter_serial_no ?? 'Account',
          m.balance != null ? fmtCurrency(m.balance) : null,
          m.months_unpaid != null ? `${m.months_unpaid} unpaid mo.` : null,
          m.notice_no ? `Notice ${m.notice_no}` : null,
        ].filter(Boolean).join(' · '),
      }
    case 'SERVICE_DISCONNECTED':
      return {
        icon: Ban,
        iconWrap: 'bg-red-50 border border-red-200',
        iconColor: 'text-red-600',
        title: 'Service disconnected',
        body: m.meter_serial_no
          ? `${m.meter_serial_no} · water service has been disconnected`
          : 'Your water service has been disconnected',
      }

    default:
      return {
        icon: Bell,
        iconWrap: 'bg-slate-100 border border-slate-200',
        iconColor: 'text-slate-500',
        title: n.event_code.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()),
        body: m.meter_serial_no ?? '',
      }
  }
}

import { UserRole, ROLES, getBaseRoute } from '@/lib/constants/roles'

// ============================================================
// ROUTE RESOLUTION — where a notification should take the user
// ============================================================

// Segment names differ per role in your nav config — adjust these
// maps if you rename routes later (kept in sync with nav.ts).
const READING_ADJUSTMENT_SEGMENT: Partial<Record<UserRole, string>> = {
  [ROLES.ADMIN]:        'adjustments',
  [ROLES.CLERK]:        'adjustments',
  [ROLES.CONSULTANT]:   'adjustments',
  [ROLES.METER_READER]: 'reading-adjustment',
}

const JOB_ORDER_SEGMENT: Partial<Record<UserRole, string>> = {
  [ROLES.ADMIN]:        'job-orders',
  [ROLES.CLERK]:        'request-job-orders',  // FIXED: clerk goes to request-job-orders
  [ROLES.CONSULTANT]:   'job-orders',
  [ROLES.METER_READER]: 'job-order',
  [ROLES.PLUMBER]:      'job-order',
}

// NOTE: adjust this segment map to match your actual service-report routes
// per role — filling in a reasonable guess ('service-reports') for staff
// roles and leaving consumer to fall through to the base route below.
const SERVICE_REPORT_SEGMENT: Partial<Record<UserRole, string>> = {
  [ROLES.ADMIN]:        'service-reports',
  [ROLES.CLERK]:        'leak-bill-adjustments',
  [ROLES.CONSULTANT]:   'service-reports',
  [ROLES.CONSUMER]:     'service-reports',
}

/**
 * Resolves where clicking a notification should navigate to, given the
 * current user's role. Always routes to the feature's list page — no
 * per-record deep link — falling back to the notifications list page
 * for unknown event codes.
 */
export function getNotificationHref(n: UserNotificationRecord, role: UserRole | null): string {
  const baseRoute = getBaseRoute(role)

  switch (n.event_code) {
    case 'PAYMENT_ADJUSTMENT_PENDING':
    case 'PAYMENT_ADJUSTMENT_APPROVED':
    case 'PAYMENT_ADJUSTMENT_REJECTED':
    case 'PAYMENT_ADJUSTMENT_CANCELLED':
    case 'METER_READING_ADJUSTED_PENDING':
    case 'METER_READING_ADJUSTED_APPROVED':
    case 'METER_READING_ADJUSTED_REJECTED':
    case 'METER_READING_ADJUSTED_CANCELLED': {
      const segment = (role && READING_ADJUSTMENT_SEGMENT[role]) ?? 'adjustments'
      return `${baseRoute}/${segment}`
    }

    case 'NEW_JOB_ASSIGNMENT':
    case 'JOB_ASSIGNMENT_UPDATED':
    case 'JOB_ORDER_COMPLETED': {
      const segment = (role && JOB_ORDER_SEGMENT[role]) ?? 'job-orders'
      return `${baseRoute}/${segment}`
    }

    case 'SERVICE_REPORT_PENDING':
    case 'SERVICE_REPORT_NEW':
    case 'SERVICE_REPORT_RECEIVED':
    case 'SERVICE_REPORT_JOB_SCHEDULED':
    case 'SERVICE_REPORT_WORK_COMPLETED':
    case 'SERVICE_REPORT_FIELD_RESULT':
    case 'SERVICE_REPORT_CONFIRMED':
    case 'SERVICE_REPORT_BILL_ADJUSTED':
    case 'SERVICE_REPORT_CANCELLED':
    case 'LEAK_CONFIRMED_BILL_ADJUST': {
      const segment = (role && SERVICE_REPORT_SEGMENT[role]) ?? 'service-reports'
      return role === ROLES.CONSUMER
        ? `/${segment}`
        : `${baseRoute}/${segment}`
    }

    case 'NOTICE_OF_DISCONNECTION':
    case 'SERVICE_DISCONNECTED':
      return role === ROLES.CONSUMER ? '/billing' : `${baseRoute}/notifications`

    default:
      return `${baseRoute}/notifications`
  }
}