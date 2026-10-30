'use server'

import { createClient } from '@/lib/supabase/server'
import { createAuditLog } from '../audit.action'
import { revalidatePath } from 'next/cache'
import { createNotification, createNotifications, getUserIdsByRole } from '../notifications/notifications'

// ============================================================================
// Types
// ============================================================================

export type PaymentSource = 'billing' | 'reconnection'

export interface AdjustmentRequestTableRow {
  adjustment_id: string
  receipt_number: string
  consumer_name: string
  meter_serial_no: string | null
  payment_type: PaymentSource
  original_amount: number
  adjusted_amount: number
  adjustment_status: string
  requested_at: string
  requested_by: {
    user_id: string
    first_name: string
    last_name: string
  }
}

export interface AdjustmentRequestDetail {
  adjustment_id: string
  payment_id: string
  payment_source: PaymentSource
  original_amount: number
  adjusted_amount: number
  reason: string | null
  adjustment_status: string
  requested_at: string
  approved_at: string | null
  requested_by: {
    user_id: string
    first_name: string
    last_name: string
    middle_name: string | null
  }
  approved_by: {
    user_id: string
    first_name: string
    last_name: string
    middle_name: string | null
  } | null
  payment: {
    payment_id: string
    amount_paid: number
    receipt_number: string
    payment_date: string
    recorded_by: {
      first_name: string
      last_name: string
    }
  }
  billing: {
    billing_id: string
    current_billing: number
    previous_balance: number
    total_billing: number
    remaining_balance: number
    due_date: string
    billing_status: string
    reading_period: string
    period_start: string
    period_end: string
  }
  consumer: {
    consumer_id: string
    account_name: string
  }
  meter_account: {
    meter_account_id: string
    meter_serial_no: string | null
    zone_name: string
    barangay_name: string
    classification_name: string
  }
}

export interface PaymentAdjustmentPreview {
  payment_id: string
  source: PaymentSource
  receipt_number: string
  amount_paid: number
  total_amount: number
  remaining_balance: number
  consumer_name: string
  meter_serial_no: string | null
  period_label: string
  period_start?: string
  period_end?: string
  payment_type?: string
  is_current_period?: boolean
  is_latest?: boolean
}

interface LatestTransactionInfo {
  source: PaymentSource
  payment_id: string
  created_at: string
}

// ============================================================================
// Helpers

function latestMeterSerialFromMeters(meters: unknown): string | null {
  const list = Array.isArray(meters) ? meters : meters ? [meters] : []
  if (!list.length) return null
  let best: any = list[0]
  for (const m of list) {
    const bt = best?.created_at ? new Date(best.created_at).getTime() : 0
    const mt = m?.created_at ? new Date(m.created_at).getTime() : 0
    if (mt >= bt) best = m
  }
  return best?.meter_serial_no ?? null
}
// ============================================================================

function formatPeso(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function unwrap<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

async function fetchLatestMeterSerial(
  supabase: Awaited<ReturnType<typeof createClient>>,
  meterAccountId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('meters')
    .select('meter_serial_no, created_at')
    .eq('meter_account_id', meterAccountId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.meter_serial_no ?? null
}

async function isValidPaymentTypeForAdjustment(paymentTypeId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('payment_type')
    .select('payment_type_name')
    .eq('payment_type_id', paymentTypeId)
    .single()

  const validTypes = ['billing', 'reconnection']
  return data ? validTypes.includes(data.payment_type_name.toLowerCase()) : false
}

async function getCurrentReadingPeriodId(): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reading_periods')
    .select('reading_period_id')
    .order('period_start', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[getCurrentReadingPeriodId] error:', error)
    return null
  }

  return data?.reading_period_id ?? null
}

// ----------------------------------------------------------------------------
// Returns true if a NEWER reading period already has a billing row for the
// meter account, compared to the period of the paid bill.
//
// We do NOT filter on embedded reading_periods.period_start via PostgREST —
// those filters on joined resources are silently dropped in some versions.
// Instead, we pull every billing row for the account (with its period_start)
// and compare in JS.
// ----------------------------------------------------------------------------
async function hasNewerBillingPeriodForMeterAccount(
  meterAccountId: string,
  paidReadingPeriodId: string,
): Promise<boolean> {
  const supabase = await createClient()

  const { data: paidPeriod, error: paidErr } = await supabase
    .from('reading_periods')
    .select('reading_period_id, period_start')
    .eq('reading_period_id', paidReadingPeriodId)
    .maybeSingle()

  if (paidErr || !paidPeriod?.period_start) {
    console.warn('[hasNewerBillingPeriodForMeterAccount] paid period not found', {
      meterAccountId,
      paidReadingPeriodId,
      paidErr,
    })
    return false
  }

  const { data: billings, error: billingsErr } = await supabase
    .from('billing')
    .select(`
      billing_id,
      reading_period_id,
      created_at,
      reading_periods:reading_period_id ( reading_period_id, period_start )
    `)
    .eq('meter_account_id', meterAccountId)

  if (billingsErr) {
    console.error('[hasNewerBillingPeriodForMeterAccount] billing query error:', billingsErr)
    return false
  }

  const paidStart = paidPeriod.period_start

  return (billings ?? []).some((b: any) => {
    const rp = unwrap(b.reading_periods)
    const start = (rp as any)?.period_start
    return typeof start === 'string' && start > paidStart
  })
}

// ----------------------------------------------------------------------------
// Returns true if a billing row exists for this meter account with a
// created_at newer than the reconnection payment being adjusted.
// ----------------------------------------------------------------------------
async function hasAnyNewerBillingForMeterAccount(
  meterAccountId: string,
  reconnectionPaymentId: string,
): Promise<boolean> {
  const supabase = await createClient()

  const { data: payment } = await supabase
    .from('reconnection_payments')
    .select('created_at')
    .eq('reconnection_payment_id', reconnectionPaymentId)
    .maybeSingle()

  if (!payment?.created_at) {
    console.warn('[hasAnyNewerBillingForMeterAccount] reconnection payment created_at missing', {
      reconnectionPaymentId,
    })
    return false
  }

  const { data: newestBilling } = await supabase
    .from('billing')
    .select('billing_id, created_at')
    .eq('meter_account_id', meterAccountId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (
    !!newestBilling &&
    new Date(newestBilling.created_at).getTime() >
      new Date(payment.created_at).getTime()
  )
}

// ----------------------------------------------------------------------------
// Returns true if a newer reconnection_payments row exists for this meter
// account than the one being adjusted.
// ----------------------------------------------------------------------------
async function hasAnyNewerReconnectionForMeterAccount(
  meterAccountId: string,
  reconnectionPaymentId: string,
): Promise<boolean> {
  const supabase = await createClient()

  const { data: payment } = await supabase
    .from('reconnection_payments')
    .select('created_at')
    .eq('reconnection_payment_id', reconnectionPaymentId)
    .maybeSingle()

  if (!payment?.created_at) return false

  const { data: newerPayments } = await supabase
    .from('reconnection_payments')
    .select(`
      reconnection_payment_id,
      created_at,
      reconnection:reconnection_id!inner (
        disconnection:disconnection_id!inner ( meter_account_id )
      )
    `)
    .eq('reconnection.disconnection.meter_account_id', meterAccountId)
    .gt('created_at', payment.created_at)
    .limit(1)

  return !!(newerPayments && newerPayments.length > 0)
}

async function getLatestTransactionForMeterAccount(
  meterAccountId: string,
): Promise<LatestTransactionInfo | null> {
  const supabase = await createClient()

  const [{ data: latestBilling }, { data: latestReconnection }] = await Promise.all([
    supabase
      .from('billing_payments')
      .select(`
        billing_payment_id,
        created_at,
        billing:billing_id!inner ( meter_account_id )
      `)
      .eq('billing.meter_account_id', meterAccountId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('reconnection_payments')
      .select(`
        reconnection_payment_id,
        created_at,
        reconnection:reconnection_id!inner (
          disconnection:disconnection_id!inner ( meter_account_id )
        )
      `)
      .eq('reconnection.disconnection.meter_account_id', meterAccountId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const candidates: LatestTransactionInfo[] = []

  if (latestBilling) {
    candidates.push({
      source: 'billing',
      payment_id: latestBilling.billing_payment_id,
      created_at: latestBilling.created_at,
    })
  }
  if (latestReconnection) {
    candidates.push({
      source: 'reconnection',
      payment_id: latestReconnection.reconnection_payment_id,
      created_at: latestReconnection.created_at,
    })
  }

  if (candidates.length === 0) return null

  return candidates.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0]
}

async function resolveMeterAccountForPayment(
  paymentId: string,
  source: PaymentSource,
): Promise<{ meter_account_id: string; meter_serial_no: string | null } | null> {
  const supabase = await createClient()

  if (source === 'billing') {
    const { data, error } = await supabase
      .from('billing_payments')
      .select(`
        billing:billing_id (
          meter_account:meter_account_id ( meter_account_id )
        )
      `)
      .eq('billing_payment_id', paymentId)
      .maybeSingle()

    if (error) {
      console.error('[resolveMeterAccountForPayment:billing] error', { paymentId, error })
      return null
    }

    const billing = unwrap(data?.billing)
    const meterAccount = unwrap(billing?.meter_account)

    if (!meterAccount) {
      console.warn('[resolveMeterAccountForPayment:billing] no meter account resolved', {
        paymentId,
        rawData: data,
      })
      return null
    }

    const serial = await fetchLatestMeterSerial(supabase, meterAccount.meter_account_id)
    return {
      meter_account_id: meterAccount.meter_account_id,
      meter_serial_no: serial,
    }
  }

  const { data, error } = await supabase
    .from('reconnection_payments')
    .select(`
      reconnection:reconnection_id (
        disconnection:disconnection_id (
          meter_account:meter_account_id ( meter_account_id )
        )
      )
    `)
    .eq('reconnection_payment_id', paymentId)
    .maybeSingle()

  if (error) {
    console.error('[resolveMeterAccountForPayment:reconnection] error', { paymentId, error })
    return null
  }

  const reconnection = unwrap(data?.reconnection)
  const disconnection = unwrap(reconnection?.disconnection)
  const meterAccount = unwrap(disconnection?.meter_account)

  if (!meterAccount) return null
  const serial = await fetchLatestMeterSerial(supabase, meterAccount.meter_account_id)
  return { meter_account_id: meterAccount.meter_account_id, meter_serial_no: serial }
}

async function isLatestTransactionForPayment(
  paymentId: string,
  source: PaymentSource,
): Promise<{ isLatest: boolean; meterAccountId?: string; meterSerialNo?: string }> {
  const meterAccount = await resolveMeterAccountForPayment(paymentId, source)
  if (!meterAccount) return { isLatest: false }

  const latest = await getLatestTransactionForMeterAccount(meterAccount.meter_account_id)
  if (!latest) {
    return {
      isLatest: false,
      meterAccountId: meterAccount.meter_account_id,
      meterSerialNo: meterAccount.meter_serial_no ?? undefined,
    }
  }

  return {
    isLatest: latest.source === source && latest.payment_id === paymentId,
    meterAccountId: meterAccount.meter_account_id,
    meterSerialNo: meterAccount.meter_serial_no ?? undefined,
  }
}

function rejectionMessage(reason?: 'newer_billing'): string {
  if (reason === 'newer_billing') {
    return 'This payment can no longer be adjusted — a newer billing has already been recorded for this meter account.'
  }
  return 'Only the latest transaction for this meter account can be adjusted.'
}

// ============================================================================
// GET — Search payments for adjustment form
// ============================================================================

export async function searchPaymentsForAdjustment(query: string): Promise<PaymentAdjustmentPreview[]> {
  const supabase = await createClient()

  try {
    const { data: pendingStatus } = await supabase
      .from('bulk_status')
      .select('status_id')
      .ilike('status_name', 'pending')
      .single()

    const { data: blockedRows } = pendingStatus
      ? await supabase
          .from('payment_adjustments')
          .select('billing_payment_id, reconnection_payment_id')
          .eq('adjustment_status_id', pendingStatus.status_id)
      : { data: [] }

    const blockedBillingIds = new Set((blockedRows ?? []).map((r: any) => r.billing_payment_id).filter(Boolean))
    const blockedReconnectionIds = new Set((blockedRows ?? []).map((r: any) => r.reconnection_payment_id).filter(Boolean))

    const currentPeriodId = await getCurrentReadingPeriodId()
    const q = query.trim().toLowerCase()

    const { data: billingRows, error: billingErr } = await supabase
      .from('billing_payments')
      .select(`
        billing_payment_id,
        amount_paid,
        created_at,
        payment:payment_id ( receipt_number, payment_date ),
        billing:billing_id (
          billing_id,
          total_billing,
          remaining_balance,
          reading_period_id,
          reading_periods:reading_period_id ( period_start, period_end, due_date ),
          meter_account:meter_account_id (
            meter_account_id,
            meters ( meter_serial_no, installation_date, created_at ),
            consumer:consumer_id ( account_name )
          )
        )
      `)
      .order('created_at', { ascending: false })
      .limit(200)

    if (billingErr) console.error('[searchPaymentsForAdjustment] billing query error:', billingErr)

    const { data: reconnectionRows, error: reconnErr } = await supabase
      .from('reconnection_payments')
      .select(`
        reconnection_payment_id,
        amount_paid,
        created_at,
        payment:payment_id ( receipt_number, payment_date ),
        reconnection:reconnection_id (
          reconnection_no,
          total_amount,
          remaining_balance,
          disconnection:disconnection_id (
            meter_account:meter_account_id (
              meter_account_id,
              meters ( meter_serial_no, installation_date, created_at ),
              consumer:consumer_id ( account_name )
            )
          )
        )
      `)
      .order('created_at', { ascending: false })
      .limit(200)

    if (reconnErr) console.error('[searchPaymentsForAdjustment] reconnection query error:', reconnErr)

    const latestByMeterAccount = new Map<string, { source: PaymentSource; id: string; created_at: string }>()

    const registerCandidate = (meterAccountId: string, source: PaymentSource, id: string, createdAt: string) => {
      const existing = latestByMeterAccount.get(meterAccountId)
      if (!existing || new Date(createdAt).getTime() > new Date(existing.created_at).getTime()) {
        latestByMeterAccount.set(meterAccountId, { source, id, created_at: createdAt })
      }
    }

    for (const row of billingRows ?? []) {
      const billing = unwrap(row.billing)
      const meterAccount = unwrap(billing?.meter_account)
      if (meterAccount?.meter_account_id) {
        registerCandidate(meterAccount.meter_account_id, 'billing', row.billing_payment_id, row.created_at)
      }
    }
    for (const row of reconnectionRows ?? []) {
      const reconnection = unwrap(row.reconnection)
      const disconnection = unwrap((reconnection as any)?.disconnection)
      const meterAccount = unwrap(disconnection?.meter_account)
      if (meterAccount?.meter_account_id) {
        registerCandidate(meterAccount.meter_account_id, 'reconnection', row.reconnection_payment_id, row.created_at)
      }
    }

    const results: PaymentAdjustmentPreview[] = []

    for (const row of billingRows ?? []) {
      if (blockedBillingIds.has(row.billing_payment_id)) continue

      const payment = unwrap(row.payment)
      const billing = unwrap(row.billing)
      const readingPeriods = unwrap(billing?.reading_periods)
      const meterAccount = unwrap(billing?.meter_account)
      const consumer = unwrap(meterAccount?.consumer)
      const meterSerialNo = latestMeterSerialFromMeters(meterAccount?.meters) ?? ''
      if (!meterSerialNo) continue

      const latest = latestByMeterAccount.get(meterAccount.meter_account_id)
      const isLatest = latest?.source === 'billing' && latest.id === row.billing_payment_id
      if (!isLatest) continue

      const receiptNo = payment?.receipt_number ?? ''
      const consumerName = consumer?.account_name ?? ''
      if (q && !receiptNo.toLowerCase().includes(q) && !meterSerialNo.toLowerCase().includes(q) && !consumerName.toLowerCase().includes(q)) {
        continue
      }

      const periodDisplay = readingPeriods
        ? `${new Date(readingPeriods.period_start).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} - ${new Date(readingPeriods.period_end).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
        : ''

      results.push({
        payment_id: row.billing_payment_id,
        source: 'billing',
        receipt_number: receiptNo,
        amount_paid: Number(row.amount_paid),
        total_amount: Number(billing?.total_billing ?? 0),
        remaining_balance: Number(billing?.remaining_balance ?? 0),
        consumer_name: consumerName,
        meter_serial_no: meterSerialNo,
        period_label: periodDisplay,
        period_start: readingPeriods?.period_start,
        period_end: readingPeriods?.period_end,
        payment_type: 'billing',
        is_current_period: currentPeriodId ? billing?.reading_period_id === currentPeriodId : false,
        is_latest: true,
      })
    }

    for (const row of reconnectionRows ?? []) {
      if (blockedReconnectionIds.has(row.reconnection_payment_id)) continue

      const payment = unwrap(row.payment)
      const reconnection = unwrap(row.reconnection)
      const disconnection = unwrap((reconnection as any)?.disconnection)
      const meterAccount = unwrap(disconnection?.meter_account)
      const consumer = unwrap(meterAccount?.consumer)
      const meterSerialNo = latestMeterSerialFromMeters(meterAccount?.meters) ?? ''
      if (!meterSerialNo) continue

      const latest = latestByMeterAccount.get(meterAccount.meter_account_id)
      const isLatest = latest?.source === 'reconnection' && latest.id === row.reconnection_payment_id
      if (!isLatest) continue

      const receiptNo = payment?.receipt_number ?? ''
      const consumerName = consumer?.account_name ?? ''
      if (q && !receiptNo.toLowerCase().includes(q) && !meterSerialNo.toLowerCase().includes(q) && !consumerName.toLowerCase().includes(q)) {
        continue
      }

      results.push({
        payment_id: row.reconnection_payment_id,
        source: 'reconnection',
        receipt_number: receiptNo,
        amount_paid: Number(row.amount_paid),
        total_amount: Number((reconnection as any)?.total_amount ?? 0),
        remaining_balance: Number((reconnection as any)?.remaining_balance ?? 0),
        consumer_name: consumerName,
        meter_serial_no: meterSerialNo,
        period_label: `Reconnection #${(reconnection as any)?.reconnection_no ?? ''}`,
        payment_type: 'reconnection',
        is_current_period: undefined,
        is_latest: true,
      })
    }

    results.sort((a, b) => 0)
    return results.slice(0, 20)
  } catch (err: any) {
    console.error('[searchPaymentsForAdjustment]', err)
    return []
  }
}

// ============================================================================
// GET — Payment by ID + source, for adjustment form preview
// ============================================================================

export async function getPaymentByIdForAdjustment(
  paymentId: string,
  source: PaymentSource,
): Promise<{ status: 'success' | 'error'; data?: PaymentAdjustmentPreview; message?: string }> {
  const supabase = await createClient()

  try {
    const latestCheck = await isLatestTransactionForPayment(paymentId, source)
    if (!latestCheck.isLatest) {
      return {
        status: 'error',
        message: 'Only the latest transaction for this meter account can be adjusted.',
      }
    }

    if (source === 'billing') {
      const { data, error } = await supabase
        .from('billing_payments')
        .select(`
          billing_payment_id,
          amount_paid,
          payment:payment_id ( receipt_number, payment_date, payment_type_id ),
          billing:billing_id (
            billing_id,
            total_billing,
            remaining_balance,
            reading_period_id,
            reading_periods:reading_period_id ( period_start, period_end, due_date ),
            meter_account:meter_account_id (
              meter_account_id,
              meters ( meter_serial_no, installation_date, created_at ),
              consumer:consumer_id ( account_name )
            )
          )
        `)
        .eq('billing_payment_id', paymentId)
        .single()

      if (error || !data) return { status: 'error', message: 'Payment not found' }

      const payment = unwrap(data.payment)
      const isValid = payment?.payment_type_id ? await isValidPaymentTypeForAdjustment(payment.payment_type_id) : false
      if (!isValid) return { status: 'error', message: 'Only billing and reconnection payments can be adjusted' }

      const billing = unwrap(data.billing)
      const readingPeriods = unwrap(billing?.reading_periods)
      const meterAccount = unwrap(billing?.meter_account)
      const consumer = unwrap(meterAccount?.consumer)

      const currentPeriodId = await getCurrentReadingPeriodId()
      const isCurrentPeriod = currentPeriodId ? billing?.reading_period_id === currentPeriodId : false
      if (!isCurrentPeriod) {
        const periodDisplay = readingPeriods
          ? `${new Date(readingPeriods.period_start).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} - ${new Date(readingPeriods.period_end).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
          : 'unknown period'
        return {
          status: 'error',
          message: `Only payments from the current reading period can be adjusted. This payment is from ${periodDisplay}.`,
        }
      }

      const periodDisplay = readingPeriods
        ? `${new Date(readingPeriods.period_start).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} - ${new Date(readingPeriods.period_end).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
        : ''

      return {
        status: 'success',
        data: {
          payment_id: data.billing_payment_id,
          source: 'billing',
          receipt_number: payment?.receipt_number ?? '',
          amount_paid: Number(data.amount_paid),
          total_amount: Number(billing?.total_billing ?? 0),
          remaining_balance: Number(billing?.remaining_balance ?? 0),
          consumer_name: consumer?.account_name ?? '—',
          meter_serial_no: latestMeterSerialFromMeters(meterAccount?.meters) ?? '—',
          period_label: periodDisplay,
          period_start: readingPeriods?.period_start,
          period_end: readingPeriods?.period_end,
          payment_type: 'billing',
          is_current_period: true,
          is_latest: true,
        },
      }
    }

    const { data, error } = await supabase
      .from('reconnection_payments')
      .select(`
        reconnection_payment_id,
        amount_paid,
        payment:payment_id ( receipt_number, payment_date, payment_type_id ),
        reconnection:reconnection_id (
          reconnection_no,
          total_amount,
          remaining_balance,
          disconnection:disconnection_id (
            meter_account:meter_account_id (
              meter_account_id,
              meters ( meter_serial_no, installation_date, created_at ),
              consumer:consumer_id ( account_name )
            )
          )
        )
      `)
      .eq('reconnection_payment_id', paymentId)
      .single()

    if (error || !data) return { status: 'error', message: 'Payment not found' }

    const payment = unwrap(data.payment)
    const isValid = payment?.payment_type_id ? await isValidPaymentTypeForAdjustment(payment.payment_type_id) : false
    if (!isValid) return { status: 'error', message: 'Only billing and reconnection payments can be adjusted' }

    const reconnection = unwrap(data.reconnection)
    const disconnection = unwrap((reconnection as any)?.disconnection)
    const meterAccount = unwrap(disconnection?.meter_account)
    const consumer = unwrap(meterAccount?.consumer)

    return {
      status: 'success',
      data: {
        payment_id: data.reconnection_payment_id,
        source: 'reconnection',
        receipt_number: payment?.receipt_number ?? '',
        amount_paid: Number(data.amount_paid),
        total_amount: Number((reconnection as any)?.total_amount ?? 0),
        remaining_balance: Number((reconnection as any)?.remaining_balance ?? 0),
        consumer_name: consumer?.account_name ?? '—',
        meter_serial_no: latestMeterSerialFromMeters(meterAccount?.meters) ?? '—',
        period_label: `Reconnection #${(reconnection as any)?.reconnection_no ?? ''}`,
        payment_type: 'reconnection',
        is_current_period: undefined,
        is_latest: true,
      },
    }
  } catch (err: any) {
    console.error('[getPaymentByIdForAdjustment]', err)
    return { status: 'error', message: err?.message ?? 'Failed to fetch payment' }
  }
}

// ============================================================================
// CREATE — Submit payment adjustment request (billing or reconnection)
// ============================================================================

export async function submitPaymentAdjustment(payload: {
  payment_id: string
  source: PaymentSource
  original_amount: number
  adjusted_amount: number
  reason: string
}): Promise<{ status: 'success' | 'error'; message?: string }> {
  const supabase = await createClient()

  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return { status: 'error', message: 'User not authenticated' }

    const latestCheck = await isLatestTransactionForPayment(payload.payment_id, payload.source)
    if (!latestCheck.isLatest) {
      return {
        status: 'error',
        message: 'Only the latest transaction for this meter account can be adjusted.',
      }
    }

    // ── BILLING source ───────────────────────────────────────────────────
    if (payload.source === 'billing') {
      const currentPeriodId = await getCurrentReadingPeriodId()

      const { data: bp, error: bpErr } = await supabase
        .from('billing_payments')
        .select(`
          billing_payment_id,
          billing:billing_id (
            billing_id,
            reading_period_id,
            meter_account_id,
            reading_periods:reading_period_id ( reading_period_id, period_start )
          )
        `)
        .eq('billing_payment_id', payload.payment_id)
        .maybeSingle()

      if (bpErr) {
        console.error('[submitPaymentAdjustment] failed to load billing payment', {
          payment_id: payload.payment_id,
          bpErr,
        })
        return { status: 'error', message: 'Failed to validate payment. Please try again.' }
      }

      const billing = unwrap(bp?.billing)
      const billingReadingPeriodId = billing?.reading_period_id ?? null
      const billingMeterAccountId = billing?.meter_account_id ?? null

      if (!billingReadingPeriodId) {
        return { status: 'error', message: 'Cannot determine the reading period of this payment.' }
      }

      if (!currentPeriodId || billingReadingPeriodId !== currentPeriodId) {
        return { status: 'error', message: 'Only payments from the current reading period can be adjusted.' }
      }

      const meterAccountIdForGuard = billingMeterAccountId ?? latestCheck.meterAccountId

      if (!meterAccountIdForGuard) {
        console.error('[submitPaymentAdjustment] billing — no meter account for guard', {
          payment_id: payload.payment_id,
        })
        return {
          status: 'error',
          message: 'Failed to validate meter account for this payment. Please try again.',
        }
      }

      const hasNewer = await hasNewerBillingPeriodForMeterAccount(
        meterAccountIdForGuard,
        billingReadingPeriodId,
      )

      if (hasNewer) {
        return { status: 'error', message: rejectionMessage('newer_billing') }
      }
    }

    // ── RECONNECTION source ──────────────────────────────────────────────
    if (payload.source === 'reconnection') {
      const meterAccountIdForGuard = latestCheck.meterAccountId

      if (!meterAccountIdForGuard) {
        console.error('[submitPaymentAdjustment] reconnection — no meter account for guard', {
          payment_id: payload.payment_id,
        })
        return {
          status: 'error',
          message: 'Failed to validate meter account for this payment. Please try again.',
        }
      }

      const hasNewerBilling = await hasAnyNewerBillingForMeterAccount(
        meterAccountIdForGuard,
        payload.payment_id,
      )
      const hasNewerReconnection = await hasAnyNewerReconnectionForMeterAccount(
        meterAccountIdForGuard,
        payload.payment_id,
      )

      if (hasNewerBilling || hasNewerReconnection) {
        return { status: 'error', message: rejectionMessage('newer_billing') }
      }
    }

    // ── INSERT ───────────────────────────────────────────────────────────
    const { data: pendingStatus } = await supabase
      .from('bulk_status')
      .select('status_id')
      .ilike('status_name', 'pending')
      .single()

    if (!pendingStatus) return { status: 'error', message: 'Status "pending" not found' }

    const { data: insertedAdjustment, error } = await supabase
      .from('payment_adjustments')
      .insert({
        billing_payment_id: payload.source === 'billing' ? payload.payment_id : null,
        reconnection_payment_id: payload.source === 'reconnection' ? payload.payment_id : null,
        requested_by: user.id,
        original_amount: payload.original_amount,
        adjusted_amount: payload.adjusted_amount,
        reason: payload.reason,
        adjustment_status_id: pendingStatus.status_id,
      })
      .select('adjustment_id')
      .single()

    if (error) throw error

    await createAuditLog(
      user.id,
      'SUBMIT_ADJUSTMENT',
      `Submitted ${payload.source} payment adjustment request. Payment ${payload.payment_id}: ${formatPeso(payload.original_amount)} → ${formatPeso(payload.adjusted_amount)}.`,
      'payment_adjustments',
      payload.payment_id,
    )

    const { data: requesterProfile } = await supabase
      .from('users')
      .select('first_name, last_name')
      .eq('user_id', user.id)
      .single()

    if (latestCheck.meterAccountId) {
      const adminIds = await getUserIdsByRole(['admin'])

      await createNotifications(
        adminIds.map((id) => ({ userId: id })),
        'PAYMENT_ADJUSTMENT_PENDING',
        {
          meter_serial_no: latestCheck.meterSerialNo ?? '',
          requester_name: requesterProfile ? `${requesterProfile.first_name} ${requesterProfile.last_name}` : 'A treasurer',
          amount: payload.adjusted_amount,
        },
        latestCheck.meterAccountId,
        insertedAdjustment?.adjustment_id ?? payload.payment_id,
      )
    }

    revalidatePath('/treasurer/adjustments')
    return { status: 'success', message: 'Adjustment request submitted successfully' }
  } catch (err: any) {
    console.error('[submitPaymentAdjustment]', err)
    return { status: 'error', message: err?.message ?? 'Failed to submit adjustment' }
  }
}

// ============================================================================
// UPDATE — Approve adjustment request (billing or reconnection)
// ============================================================================

export async function approveAdjustmentRequest(adjustmentId: string): Promise<{ status: 'success' | 'error'; message?: string }> {
  const supabase = await createClient()

  const STALE_MESSAGE =
    'This adjustment can no longer be approved — a newer billing has already been recorded for this meter account. Please reject the request instead.'

  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return { status: 'error', message: 'User not authenticated' }

    const { data: adjustment, error: fetchErr } = await supabase
      .from('payment_adjustments')
      .select('adjustment_id, billing_payment_id, reconnection_payment_id, original_amount, adjusted_amount, adjustment_status_id, requested_by')
      .eq('adjustment_id', adjustmentId)
      .single()

    if (fetchErr || !adjustment) return { status: 'error', message: 'Adjustment not found' }

    const { data: currentStatus } = await supabase
      .from('bulk_status')
      .select('status_name')
      .eq('status_id', adjustment.adjustment_status_id)
      .single()

    if (currentStatus?.status_name?.toLowerCase() !== 'pending') {
      return { status: 'error', message: 'This adjustment has already been processed' }
    }

    const { data: approvedStatus } = await supabase
      .from('bulk_status')
      .select('status_id')
      .ilike('status_name', 'approved')
      .single()
    if (!approvedStatus) return { status: 'error', message: 'Status "approved" not found' }

    const diff = Number(adjustment.adjusted_amount) - Number(adjustment.original_amount)
    let meterAccount: { meter_account_id: string; meter_serial_no: string | null } | null = null
    let statusMessage = ''

    if (adjustment.billing_payment_id) {
      const { data: billingPayment, error: payErr } = await supabase
        .from('billing_payments')
        .select('billing_payment_id, billing_id, amount_paid')
        .eq('billing_payment_id', adjustment.billing_payment_id)
        .single()
      if (payErr || !billingPayment) return { status: 'error', message: 'Payment record not found' }

      const { data: billing, error: billErr } = await supabase
        .from('billing')
        .select(`
          billing_id, total_billing, remaining_balance, billing_status_id, reading_period_id,
          meter_account:meter_account_id ( meter_account_id )
        `)
        .eq('billing_id', billingPayment.billing_id)
        .single()
      if (billErr || !billing) return { status: 'error', message: 'Billing record not found' }

      const billingMeterAccount = unwrap(billing.meter_account)
      meterAccount = billingMeterAccount?.meter_account_id
        ? {
            meter_account_id: billingMeterAccount.meter_account_id,
            meter_serial_no: await fetchLatestMeterSerial(supabase, billingMeterAccount.meter_account_id),
          }
        : null

      // ── GUARD: a newer billing period exists for this meter account ──
      if (!meterAccount?.meter_account_id || !billing.reading_period_id) {
        return { status: 'error', message: 'Failed to validate meter account for this payment. Please try again.' }
      }
      const hasNewerBilling = await hasNewerBillingPeriodForMeterAccount(
        meterAccount.meter_account_id,
        billing.reading_period_id,
      )
      if (hasNewerBilling) {
        return { status: 'error', message: STALE_MESSAGE }
      }

      const newRemainingBalance = Number(billing.remaining_balance) - diff

      const { data: paidStatus } = await supabase.from('billing_status').select('billing_status_id').ilike('billing_status_name', 'paid').single()
      const { data: partialStatus } = await supabase.from('billing_status').select('billing_status_id').ilike('billing_status_name', 'partial').single()

      let newBillingStatusId = billing.billing_status_id
      if (newRemainingBalance <= 0) newBillingStatusId = paidStatus?.billing_status_id ?? billing.billing_status_id
      else if (newRemainingBalance < billing.total_billing) newBillingStatusId = partialStatus?.billing_status_id ?? billing.billing_status_id

      const { error: payUpdateErr } = await supabase
        .from('billing_payments')
        .update({ amount_paid: adjustment.adjusted_amount })
        .eq('billing_payment_id', adjustment.billing_payment_id)
      if (payUpdateErr) throw payUpdateErr

      const { error: billUpdateErr } = await supabase
        .from('billing')
        .update({
          remaining_balance: Math.max(0, newRemainingBalance),
          billing_status_id: newBillingStatusId,
          updated_at: new Date().toISOString(),
        })
        .eq('billing_id', billingPayment.billing_id)
      if (billUpdateErr) throw billUpdateErr

      statusMessage = newRemainingBalance <= 0
        ? ' and billing is now fully paid'
        : newRemainingBalance < billing.total_billing
          ? ' and billing status updated to partial'
          : ''
    } else if (adjustment.reconnection_payment_id) {
      const { data: reconnPayment, error: payErr } = await supabase
        .from('reconnection_payments')
        .select('reconnection_payment_id, reconnection_id, amount_paid')
        .eq('reconnection_payment_id', adjustment.reconnection_payment_id)
        .single()
      if (payErr || !reconnPayment) return { status: 'error', message: 'Payment record not found' }

      const { data: reconnection, error: reconnErr } = await supabase
        .from('reconnections')
        .select(`
          reconnection_id, total_amount, remaining_balance, payment_status_id,
          disconnection:disconnection_id (
            meter_account:meter_account_id ( meter_account_id )
          )
        `)
        .eq('reconnection_id', reconnPayment.reconnection_id)
        .single()
      if (reconnErr || !reconnection) return { status: 'error', message: 'Reconnection record not found' }

      const disconnection = unwrap((reconnection as any).disconnection)
      const reconnMeterAccount = unwrap(disconnection?.meter_account)
      meterAccount = reconnMeterAccount?.meter_account_id
        ? {
            meter_account_id: reconnMeterAccount.meter_account_id,
            meter_serial_no: await fetchLatestMeterSerial(supabase, reconnMeterAccount.meter_account_id),
          }
        : null

      // ── GUARD: a newer billing or reconnection payment exists for this meter account ──
      if (!meterAccount?.meter_account_id) {
        return { status: 'error', message: 'Failed to validate meter account for this payment. Please try again.' }
      }
      const hasNewerBilling = await hasAnyNewerBillingForMeterAccount(
        meterAccount.meter_account_id,
        adjustment.reconnection_payment_id,
      )
      const hasNewerReconnection = await hasAnyNewerReconnectionForMeterAccount(
        meterAccount.meter_account_id,
        adjustment.reconnection_payment_id,
      )
      if (hasNewerBilling || hasNewerReconnection) {
        return { status: 'error', message: STALE_MESSAGE }
      }

      const newRemainingBalance = Number(reconnection.remaining_balance) - diff

      const { data: paidStatus } = await supabase.from('billing_status').select('billing_status_id').ilike('billing_status_name', 'paid').single()
      const { data: partialStatus } = await supabase.from('billing_status').select('billing_status_id').ilike('billing_status_name', 'partial').single()

      let newPaymentStatusId = reconnection.payment_status_id
      if (newRemainingBalance <= 0) newPaymentStatusId = paidStatus?.billing_status_id ?? reconnection.payment_status_id
      else if (newRemainingBalance < reconnection.total_amount) newPaymentStatusId = partialStatus?.billing_status_id ?? reconnection.payment_status_id

      const { error: payUpdateErr } = await supabase
        .from('reconnection_payments')
        .update({ amount_paid: adjustment.adjusted_amount })
        .eq('reconnection_payment_id', adjustment.reconnection_payment_id)
      if (payUpdateErr) throw payUpdateErr

      const { error: reconnUpdateErr } = await supabase
        .from('reconnections')
        .update({
          remaining_balance: Math.max(0, newRemainingBalance),
          payment_status_id: newPaymentStatusId,
          updated_at: new Date().toISOString(),
        })
        .eq('reconnection_id', reconnPayment.reconnection_id)
      if (reconnUpdateErr) throw reconnUpdateErr

      statusMessage = newRemainingBalance <= 0
        ? ' and the reconnection balance is now fully paid'
        : newRemainingBalance < reconnection.total_amount
          ? ' and reconnection payment status updated to partial'
          : ''
    } else {
      return { status: 'error', message: 'Adjustment has no linked payment' }
    }

    const { error: adjUpdateErr } = await supabase
      .from('payment_adjustments')
      .update({ adjustment_status_id: approvedStatus.status_id, approved_by: user.id, approved_at: new Date().toISOString() })
      .eq('adjustment_id', adjustmentId)
    if (adjUpdateErr) throw adjUpdateErr

    await createAuditLog(
      user.id,
      'APPROVE_ADJUSTMENT',
      `Approved payment adjustment. Payment changed from ${formatPeso(Number(adjustment.original_amount))} to ${formatPeso(Number(adjustment.adjusted_amount))}.`,
      'payment_adjustments',
      adjustmentId,
    )

    if (meterAccount?.meter_account_id) {
      const staffIds = await getUserIdsByRole(['admin', 'consultant'])

      await createNotifications(
        [{ userId: adjustment.requested_by }, ...staffIds.map((id) => ({ userId: id }))],
        'PAYMENT_ADJUSTMENT_APPROVED',
        {
          meter_serial_no: meterAccount.meter_serial_no,
          amount: Number(adjustment.adjusted_amount),
          status: 'approved',
        },
        meterAccount.meter_account_id,
        adjustmentId,
      )
    }

    revalidatePath('/admin/adjustments')
    revalidatePath('/treasurer/adjustments')

    return { status: 'success', message: `Adjustment approved successfully${statusMessage}` }
  } catch (err: any) {
    console.error('[approveAdjustmentRequest]', err)
    return { status: 'error', message: err?.message ?? 'Failed to approve adjustment' }
  }
}

// ============================================================================
// UPDATE — Reject adjustment request (billing or reconnection)
// ============================================================================

export async function rejectAdjustmentRequest(adjustmentId: string): Promise<{ status: 'success' | 'error'; message?: string }> {
  const supabase = await createClient()

  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return { status: 'error', message: 'User not authenticated' }

    const { data: adjustment, error: fetchErr } = await supabase
      .from('payment_adjustments')
      .select('adjustment_id, adjustment_status_id, adjusted_amount, requested_by, billing_payment_id, reconnection_payment_id')
      .eq('adjustment_id', adjustmentId)
      .single()

    if (fetchErr || !adjustment) return { status: 'error', message: 'Adjustment not found' }

    const { data: currentStatus } = await supabase
      .from('bulk_status')
      .select('status_name')
      .eq('status_id', adjustment.adjustment_status_id)
      .single()

    if (currentStatus?.status_name?.toLowerCase() !== 'pending') {
      return { status: 'error', message: 'This adjustment has already been processed' }
    }

    const { data: rejectedStatus } = await supabase
      .from('bulk_status')
      .select('status_id')
      .ilike('status_name', 'rejected')
      .single()
    if (!rejectedStatus) return { status: 'error', message: 'Status "rejected" not found' }

    const { error: updateErr } = await supabase
      .from('payment_adjustments')
      .update({ adjustment_status_id: rejectedStatus.status_id, approved_by: user.id, approved_at: new Date().toISOString() })
      .eq('adjustment_id', adjustmentId)
    if (updateErr) throw updateErr

    await createAuditLog(user.id, 'REJECT_ADJUSTMENT', 'Rejected payment adjustment request.', 'payment_adjustments', adjustmentId)

    let meterAccount: { meter_account_id: string; meter_serial_no: string | null } | null = null

    if (adjustment.billing_payment_id) {
      meterAccount = await resolveMeterAccountForPayment(adjustment.billing_payment_id, 'billing')
    } else if (adjustment.reconnection_payment_id) {
      meterAccount = await resolveMeterAccountForPayment(adjustment.reconnection_payment_id, 'reconnection')
    }

    if (meterAccount?.meter_account_id) {
      const staffIds = await getUserIdsByRole(['admin', 'consultant'])

      await createNotifications(
        [{ userId: adjustment.requested_by }, ...staffIds.map((id) => ({ userId: id }))],
        'PAYMENT_ADJUSTMENT_REJECTED',
        {
          meter_serial_no: meterAccount.meter_serial_no,
          amount: Number(adjustment.adjusted_amount),
          status: 'rejected',
        },
        meterAccount.meter_account_id,
        adjustmentId,
      )
    }

    revalidatePath('/admin/adjustments')
    revalidatePath('/treasurer/adjustments')

    return { status: 'success', message: 'Adjustment request rejected successfully' }
  } catch (err: any) {
    console.error('[rejectAdjustmentRequest]', err)
    return { status: 'error', message: err?.message ?? 'Failed to reject adjustment' }
  }
}

// ============================================================================
// GET — All adjustment requests (table view, billing + reconnection)
// ============================================================================

async function hydrateAdjustmentRows(rows: any[]): Promise<AdjustmentRequestTableRow[]> {
  const supabase = await createClient()

  const { data: statuses } = await supabase.from('bulk_status').select('status_id, status_name')

  const userIds = [...new Set(rows.flatMap((r) => [r.requested_by, r.approved_by]).filter(Boolean))]
  const { data: users } = userIds.length
    ? await supabase.from('users').select('user_id, first_name, last_name').in('user_id', userIds)
    : { data: [] }
  const userMap = new Map(users?.map((u: any) => [u.user_id, u]) ?? [])

  const billingIds = rows.map((r) => r.billing_payment_id).filter(Boolean)
  const reconnectionIds = rows.map((r) => r.reconnection_payment_id).filter(Boolean)

  const { data: billingPayments } = billingIds.length
    ? await supabase
        .from('billing_payments')
        .select(`
          billing_payment_id,
          payment:payment_id ( receipt_number ),
          billing:billing_id (
            meter_account:meter_account_id (
              consumer:consumer_id ( account_name )
            )
          )
        `)
        .in('billing_payment_id', billingIds)
    : { data: [] }

  const { data: reconnectionPayments } = reconnectionIds.length
    ? await supabase
        .from('reconnection_payments')
        .select(`
          reconnection_payment_id,
          payment:payment_id ( receipt_number ),
          reconnection:reconnection_id (
            disconnection:disconnection_id (
              meter_account:meter_account_id (
                consumer:consumer_id ( account_name )
              )
            )
          )
        `)
        .in('reconnection_payment_id', reconnectionIds)
    : { data: [] }

  const bpMap = new Map(billingPayments?.map((bp: any) => [bp.billing_payment_id, bp]) ?? [])
  const rpMap = new Map(reconnectionPayments?.map((rp: any) => [rp.reconnection_payment_id, rp]) ?? [])

  return rows.map((row: any): AdjustmentRequestTableRow => {
    const statusName = statuses?.find((s: any) => s.status_id === row.adjustment_status_id)?.status_name ?? 'pending'
    const requestedByUser = userMap.get(row.requested_by)

    let receiptNumber = '—'
    let consumerName = '—'
    let meterSerialNo = '—'
    let paymentType: PaymentSource = 'billing'

    if (row.billing_payment_id) {
      const bp = bpMap.get(row.billing_payment_id)
      const payment = unwrap(bp?.payment)
      const billing = unwrap(bp?.billing)
      const meterAccount = unwrap(billing?.meter_account)
      const consumer = unwrap(meterAccount?.consumer)
      receiptNumber = payment?.receipt_number ?? '—'
      consumerName = consumer?.account_name ?? '—'
      meterSerialNo = meterAccount?.meter_serial_no ?? '—'
      paymentType = 'billing'
    } else if (row.reconnection_payment_id) {
      const rp = rpMap.get(row.reconnection_payment_id)
      const payment = unwrap(rp?.payment)
      const reconnection = unwrap((rp as any)?.reconnection)
      const disconnection = unwrap(reconnection?.disconnection)
      const meterAccount = unwrap(disconnection?.meter_account)
      const consumer = unwrap(meterAccount?.consumer)
      receiptNumber = payment?.receipt_number ?? '—'
      consumerName = consumer?.account_name ?? '—'
      meterSerialNo = meterAccount?.meter_serial_no ?? '—'
      paymentType = 'reconnection'
    }

    return {
      adjustment_id: row.adjustment_id,
      receipt_number: receiptNumber,
      consumer_name: consumerName,
      meter_serial_no: meterSerialNo,
      payment_type: paymentType,
      original_amount: Number(row.original_amount),
      adjusted_amount: Number(row.adjusted_amount),
      adjustment_status: statusName,
      requested_at: row.requested_at,
      requested_by: requestedByUser
        ? { user_id: requestedByUser.user_id, first_name: requestedByUser.first_name, last_name: requestedByUser.last_name }
        : { user_id: '', first_name: '', last_name: '' },
    }
  })
}

export async function getAllAdjustmentRequests(): Promise<{ status: 'success' | 'error'; data?: AdjustmentRequestTableRow[]; message?: string }> {
  const supabase = await createClient()

  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return { status: 'error', message: 'User not authenticated' }

    const { data, error } = await supabase
      .from('payment_adjustments')
      .select('adjustment_id, billing_payment_id, reconnection_payment_id, original_amount, adjusted_amount, reason, requested_at, approved_at, adjustment_status_id, requested_by, approved_by')
      .order('requested_at', { ascending: false })

    if (error) throw error

    const results = await hydrateAdjustmentRows(data ?? [])
    return { status: 'success', data: results }
  } catch (err: any) {
    console.error('[getAllAdjustmentRequests]', err)
    return { status: 'error', message: err?.message ?? 'Failed to load adjustment requests' }
  }
}

// ============================================================================
// GET — Pending adjustment requests
// ============================================================================

export async function getPendingAdjustmentRequests(): Promise<{ status: 'success' | 'error'; data?: AdjustmentRequestTableRow[]; message?: string }> {
  const supabase = await createClient()

  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return { status: 'error', message: 'User not authenticated' }

    const { data: pendingStatus } = await supabase.from('bulk_status').select('status_id').ilike('status_name', 'pending').single()
    if (!pendingStatus) return { status: 'error', message: 'Pending status not found' }

    const { data, error } = await supabase
      .from('payment_adjustments')
      .select('adjustment_id, billing_payment_id, reconnection_payment_id, original_amount, adjusted_amount, requested_at, adjustment_status_id, requested_by')
      .eq('adjustment_status_id', pendingStatus.status_id)
      .order('requested_at', { ascending: false })

    if (error) throw error

    const results = await hydrateAdjustmentRows(data ?? [])
    return { status: 'success', data: results }
  } catch (err: any) {
    console.error('[getPendingAdjustmentRequests]', err)
    return { status: 'error', message: err?.message ?? 'Failed to load pending requests' }
  }
}

// ============================================================================
// GET — Single adjustment request by ID (detailed view, billing or reconnection)
// ============================================================================

export async function getAdjustmentRequestById(adjustmentId: string): Promise<{ status: 'success' | 'error'; data?: AdjustmentRequestDetail; message?: string }> {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('payment_adjustments')
      .select('adjustment_id, billing_payment_id, reconnection_payment_id, original_amount, adjusted_amount, reason, requested_at, approved_at, adjustment_status_id, requested_by, approved_by')
      .eq('adjustment_id', adjustmentId)
      .single()

    if (error || !data) {
      console.error('[getAdjustmentRequestById] payment_adjustments query error:', error)
      return { status: 'error', message: 'Adjustment request not found' }
    }

    const userIds = [data.requested_by, data.approved_by].filter(Boolean)
    const { data: users } = await supabase.from('users').select('user_id, first_name, last_name, middle_name').in('user_id', userIds)
    const userMap = new Map(users?.map((u: any) => [u.user_id, u]) ?? [])

    const { data: statusData } = await supabase.from('bulk_status').select('status_name').eq('status_id', data.adjustment_status_id).single()

    const requestedBy = userMap.get(data.requested_by)
    const approvedBy = data.approved_by ? userMap.get(data.approved_by) : null

    const requestedByOut = requestedBy
      ? { user_id: requestedBy.user_id, first_name: requestedBy.first_name, last_name: requestedBy.last_name, middle_name: requestedBy.middle_name ?? null }
      : { user_id: '', first_name: '', last_name: '', middle_name: null }
    const approvedByOut = approvedBy
      ? { user_id: approvedBy.user_id, first_name: approvedBy.first_name, last_name: approvedBy.last_name, middle_name: approvedBy.middle_name ?? null }
      : null

    if (data.billing_payment_id) {
      const { data: billingPayment, error: bpErr } = await supabase
        .from('billing_payments')
        .select(`
          billing_payment_id, amount_paid, payment_id,
          payment:payment_id (
            receipt_number, payment_date, recieved_by,
            recorded_by_user:recieved_by ( first_name, last_name )
          ),
          billing:billing_id (
            billing_id, current_billing, previous_balance, total_billing, remaining_balance, reading_period_id,
            reading_periods:reading_period_id ( period_start, period_end, due_date ),
            billing_status:billing_status_id ( billing_status_name ),
            meter_account:meter_account_id (
              meter_account_id,
              meters ( meter_serial_no, installation_date, created_at ),
              zone:zone_id ( zone_name, barangay:barangay_id ( barangay_name ) ),
              classification:classification_id ( classification_name ),
              consumer:consumer_id ( consumer_id, account_name )
            )
          )
        `)
        .eq('billing_payment_id', data.billing_payment_id)
        .maybeSingle()

      if (bpErr || !billingPayment) return { status: 'error', message: 'Billing payment not found' }

      const paymentData = unwrap(billingPayment.payment)
      const billing = unwrap(billingPayment.billing)
      const readingPeriods = unwrap(billing?.reading_periods)
      const meterAccount = unwrap(billing?.meter_account)
      const zone = unwrap(meterAccount?.zone)
      const barangay = unwrap(zone?.barangay)
      const classification = unwrap(meterAccount?.classification)
      const consumer = unwrap(meterAccount?.consumer)
      const billingStatus = unwrap(billing?.billing_status)
      const recordedByRaw = paymentData?.recorded_by_user ? unwrap(paymentData.recorded_by_user) : null

      const periodDisplay = readingPeriods
        ? `${new Date(readingPeriods.period_start).toLocaleDateString('en-US', { month: 'long' })} ${new Date(readingPeriods.period_start).getFullYear()} - ${new Date(readingPeriods.period_end).toLocaleDateString('en-US', { month: 'long' })} ${new Date(readingPeriods.period_end).getFullYear()}`
        : ''

      return {
        status: 'success',
        data: {
          adjustment_id: data.adjustment_id,
          payment_id: data.billing_payment_id,
          payment_source: 'billing',
          original_amount: Number(data.original_amount),
          adjusted_amount: Number(data.adjusted_amount),
          reason: data.reason ?? null,
          adjustment_status: statusData?.status_name ?? 'pending',
          requested_at: data.requested_at,
          approved_at: data.approved_at ?? null,
          requested_by: requestedByOut,
          approved_by: approvedByOut,
          payment: {
            payment_id: billingPayment?.payment_id ?? '',
            amount_paid: Number(billingPayment?.amount_paid ?? 0),
            receipt_number: paymentData?.receipt_number ?? '',
            payment_date: paymentData?.payment_date ?? '',
            recorded_by: recordedByRaw ? { first_name: recordedByRaw.first_name, last_name: recordedByRaw.last_name } : { first_name: '', last_name: '' },
          },
          billing: {
            billing_id: billing?.billing_id ?? '',
            current_billing: Number(billing?.current_billing ?? 0),
            previous_balance: Number(billing?.previous_balance ?? 0),
            total_billing: Number(billing?.total_billing ?? 0),
            remaining_balance: Number(billing?.remaining_balance ?? 0),
            due_date: readingPeriods?.due_date ?? '',
            billing_status: billingStatus?.billing_status_name ?? '',
            reading_period: periodDisplay,
            period_start: readingPeriods?.period_start ?? '',
            period_end: readingPeriods?.period_end ?? '',
          },
          consumer: consumer ? { consumer_id: consumer.consumer_id, account_name: consumer.account_name } : { consumer_id: '', account_name: '' },
          meter_account: {
            meter_account_id: meterAccount?.meter_account_id ?? '',
            meter_serial_no: latestMeterSerialFromMeters(meterAccount?.meters) ?? '',
            zone_name: zone?.zone_name ?? '',
            barangay_name: barangay?.barangay_name ?? '',
            classification_name: classification?.classification_name ?? '',
          },
        },
      }
    }

    if (data.reconnection_payment_id) {
      const { data: reconnPayment, error: rpErr } = await supabase
        .from('reconnection_payments')
        .select(`
          reconnection_payment_id, amount_paid, payment_id,
          payment:payment_id (
            receipt_number, payment_date, recieved_by,
            recorded_by_user:recieved_by ( first_name, last_name )
          ),
          reconnection:reconnection_id (
            reconnection_id, reconnection_no, total_amount, remaining_balance, outstanding_balance,
            payment_status:payment_status_id ( billing_status_name ),
            disconnection:disconnection_id (
              meter_account:meter_account_id (
                meter_account_id,
                meters ( meter_serial_no, installation_date, created_at ),
                zone:zone_id ( zone_name, barangay:barangay_id ( barangay_name ) ),
                classification:classification_id ( classification_name ),
                consumer:consumer_id ( consumer_id, account_name )
              )
            )
          )
        `)
        .eq('reconnection_payment_id', data.reconnection_payment_id)
        .maybeSingle()

      if (rpErr || !reconnPayment) return { status: 'error', message: 'Reconnection payment not found' }

      const paymentData = unwrap(reconnPayment.payment)
      const reconnection = unwrap((reconnPayment as any).reconnection)
      const disconnection = unwrap(reconnection?.disconnection)
      const meterAccount = unwrap(disconnection?.meter_account)
      const zone = unwrap(meterAccount?.zone)
      const barangay = unwrap(zone?.barangay)
      const classification = unwrap(meterAccount?.classification)
      const consumer = unwrap(meterAccount?.consumer)
      const paymentStatus = unwrap(reconnection?.payment_status)
      const recordedByRaw = paymentData?.recorded_by_user ? unwrap(paymentData.recorded_by_user) : null

      return {
        status: 'success',
        data: {
          adjustment_id: data.adjustment_id,
          payment_id: data.reconnection_payment_id,
          payment_source: 'reconnection',
          original_amount: Number(data.original_amount),
          adjusted_amount: Number(data.adjusted_amount),
          reason: data.reason ?? null,
          adjustment_status: statusData?.status_name ?? 'pending',
          requested_at: data.requested_at,
          approved_at: data.approved_at ?? null,
          requested_by: requestedByOut,
          approved_by: approvedByOut,
          payment: {
            payment_id: reconnPayment?.payment_id ?? '',
            amount_paid: Number(reconnPayment?.amount_paid ?? 0),
            receipt_number: paymentData?.receipt_number ?? '',
            payment_date: paymentData?.payment_date ?? '',
            recorded_by: recordedByRaw ? { first_name: recordedByRaw.first_name, last_name: recordedByRaw.last_name } : { first_name: '', last_name: '' },
          },
          billing: {
            billing_id: reconnection?.reconnection_id ?? '',
            current_billing: 0,
            previous_balance: Number(reconnection?.outstanding_balance ?? 0),
            total_billing: Number(reconnection?.total_amount ?? 0),
            remaining_balance: Number(reconnection?.remaining_balance ?? 0),
            due_date: '',
            billing_status: paymentStatus?.billing_status_name ?? '',
            reading_period: `Reconnection #${reconnection?.reconnection_no ?? ''}`,
            period_start: '',
            period_end: '',
          },
          consumer: consumer ? { consumer_id: consumer.consumer_id, account_name: consumer.account_name } : { consumer_id: '', account_name: '' },
          meter_account: {
            meter_account_id: meterAccount?.meter_account_id ?? '',
            meter_serial_no: latestMeterSerialFromMeters(meterAccount?.meters) ?? '',
            zone_name: zone?.zone_name ?? '',
            barangay_name: barangay?.barangay_name ?? '',
            classification_name: classification?.classification_name ?? '',
          },
        },
      }
    }

    return { status: 'error', message: 'Adjustment has no linked payment' }
  } catch (err: any) {
    console.error('[getAdjustmentRequestById]', err)
    return { status: 'error', message: err?.message ?? 'Failed to load adjustment request' }
  }
}

// ============================================================================
// UPDATE — Cancel adjustment request
// ============================================================================

export async function cancelAdjustmentRequest(
  adjustmentId: string,
): Promise<{ status: 'success' | 'error'; message?: string }> {
  const supabase = await createClient()

  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return { status: 'error', message: 'User not authenticated' }

    const { data: adjustment, error: fetchErr } = await supabase
      .from('payment_adjustments')
      .select('adjustment_id, requested_by, adjustment_status_id, adjusted_amount, billing_payment_id, reconnection_payment_id')
      .eq('adjustment_id', adjustmentId)
      .single()

    if (fetchErr || !adjustment) return { status: 'error', message: 'Adjustment not found' }

    if (adjustment.requested_by !== user.id) {
      return { status: 'error', message: 'You can only cancel your own adjustment requests' }
    }

    const { data: currentStatus } = await supabase
      .from('bulk_status')
      .select('status_name')
      .eq('status_id', adjustment.adjustment_status_id)
      .single()

    if (currentStatus?.status_name?.toLowerCase() !== 'pending') {
      return { status: 'error', message: 'Only pending requests can be cancelled' }
    }

    const { data: cancelledStatus } = await supabase
      .from('bulk_status')
      .select('status_id')
      .ilike('status_name', 'cancelled')
      .maybeSingle()

    if (!cancelledStatus) {
      return { status: 'error', message: '"Cancelled" status is not configured. Please contact an admin.' }
    }

    const { error: updateErr } = await supabase
      .from('payment_adjustments')
      .update({ adjustment_status_id: cancelledStatus.status_id })
      .eq('adjustment_id', adjustmentId)

    if (updateErr) throw updateErr

    await createAuditLog(
      user.id,
      'CANCEL_ADJUSTMENT',
      'Cancelled a payment adjustment request.',
      'payment_adjustments',
      adjustmentId,
    )

    let meterAccount: { meter_account_id: string; meter_serial_no: string | null } | null = null

    if (adjustment.billing_payment_id) {
      meterAccount = await resolveMeterAccountForPayment(adjustment.billing_payment_id, 'billing')
    } else if (adjustment.reconnection_payment_id) {
      meterAccount = await resolveMeterAccountForPayment(adjustment.reconnection_payment_id, 'reconnection')
    }

    if (meterAccount?.meter_account_id) {
      const staffIds = await getUserIdsByRole(['admin', 'consultant'])

      await createNotifications(
        staffIds.map((id) => ({ userId: id })),
        'PAYMENT_ADJUSTMENT_CANCELLED',
        {
          meter_serial_no: meterAccount.meter_serial_no,
          amount: Number(adjustment.adjusted_amount),
          status: 'cancelled',
        },
        meterAccount.meter_account_id,
        adjustmentId,
      )
    }

    revalidatePath('/admin/adjustments')
    revalidatePath('/treasurer/adjustments')

    return { status: 'success', message: 'Adjustment request cancelled' }
  } catch (err: any) {
    console.error('[cancelAdjustmentRequest]', err)
    return { status: 'error', message: err?.message ?? 'Failed to cancel adjustment' }
  }
}