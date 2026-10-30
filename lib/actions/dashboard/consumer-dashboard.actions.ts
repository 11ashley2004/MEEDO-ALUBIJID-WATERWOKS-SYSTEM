// lib/actions/dashboard/consumer-dashboard.actions.ts

'use server'

import { createClient } from '@/lib/supabase/server'
import { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConsumerDashboardStats {
  outstandingBalance:     number
  totalBilling:           number
  latestConsumption:      number | null
  latestConsumptionDate:  string | null
  activeConnectionsCount: number
  consumerName:           string
  currentPeriodLabel:     string | null
}

export interface ConsumerRecentPayment {
  receipt_id:     string
  receipt_number: string
  payment_type:   string
  amount:         number
  payment_date:   string
  meter_serial_no: string | null
}

export interface MonthlyConsumption {
  month:  string
  period: string
  [meterSerialNo: string]: number | string
}

// ─── Helper ───────────────────────────────────────────────────────────────────

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

function unwrap<T>(val: T | T[] | null | undefined): T | null {
  if (val == null) return null
  return Array.isArray(val) ? (val[0] ?? null) : val
}

function formatPeriodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

async function getMeterStatusIdsByNames(
  supabase: SupabaseClient,
  names: string[],
): Promise<string[]> {
  const { data } = await supabase
    .from('meter_status')
    .select('meter_status_id')
    .in('meter_status_name', names)
  return (data ?? []).map(d => d.meter_status_id)
}

// ============================================================================
// GET — Dashboard Stats
// ============================================================================

export async function getConsumerDashboardStats(): Promise<{
  status: 'success' | 'error' | 'unauthenticated'
  data?: ConsumerDashboardStats
  message?: string
}> {
  const supabase = await createClient()

  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return { status: 'unauthenticated', message: 'No active session.' }

    const consumerId = user.id

    // Consumer name
    const { data: consumer } = await supabase
      .from('consumers')
      .select('account_name')
      .eq('consumer_id', consumerId)
      .single()

    // All meter accounts belonging to this consumer
    const { data: meterAccounts } = await supabase
      .from('meter_accounts')
      .select('meter_account_id')
      .eq('consumer_id', consumerId)

    const meterAccountIds = (meterAccounts ?? []).map(m => m.meter_account_id)

    // "Active Meter Accounts" card: same status set used on the meter
    // reader pages (Active / Defective / Stolen / Waterleak_After_Meter)
    const relevantStatusIds = await getMeterStatusIdsByNames(supabase, [
      'Active',
      'Defective',
      'Stolen',
      'Waterleak_After_Meter',
    ])

    let activeConnectionsCount = 0
    if (meterAccountIds.length > 0 && relevantStatusIds.length > 0) {
      const { data: relevantMeters } = await supabase
        .from('meters')
        .select('meter_account_id')
        .in('meter_account_id', meterAccountIds)
        .in('meter_status_id', relevantStatusIds)

      activeConnectionsCount = new Set(
        (relevantMeters ?? []).map((m: any) => m.meter_account_id)
      ).size
    }

    const emptyResult: ConsumerDashboardStats = {
      outstandingBalance:     0,
      totalBilling:           0,
      latestConsumption:      null,
      latestConsumptionDate:  null,
      activeConnectionsCount: 0,
      consumerName:           consumer?.account_name || 'Consumer',
      currentPeriodLabel:     null,
    }

    if (!meterAccountIds.length) return { status: 'success', data: emptyResult }

    // All billings with reading period
    const { data: billings } = await supabase
      .from('billing')
      .select(`
        billing_id,
        meter_account_id,
        consumption_id,
        total_billing,
        remaining_balance,
        reading_periods:reading_period_id (
          reading_period_id,
          period_start,
          period_end,
          due_date
        )
      `)
      .in('meter_account_id', meterAccountIds)
      .order('created_at', { ascending: false })

    const allBillings = billings ?? []
    if (!allBillings.length) {
      return { status: 'success', data: { ...emptyResult, activeConnectionsCount } }
    }

    // Find latest reading period across all meter accounts
    let latestPeriod = ''
    for (const b of allBillings) {
      const periodData = unwrap((b as any).reading_periods) as any
      const periodStart = periodData?.period_start ?? ''
      if (periodStart > latestPeriod) latestPeriod = periodStart
    }

    // Filter billings belonging to the latest period
    const currentPeriodBillings = allBillings.filter(b => {
      const periodData = unwrap((b as any).reading_periods) as any
      return periodData?.period_start === latestPeriod
    })

    const outstandingBalance = currentPeriodBillings.reduce(
      (sum, b) => sum + Number((b as any).remaining_balance ?? 0), 0
    )

    const totalBilling = currentPeriodBillings.reduce(
      (sum, b) => sum + Number(b.total_billing ?? 0), 0
    )

    // Latest consumption
    let latestConsumption: number | null = null
    let latestConsumptionDate: string | null = null

    const currentPeriodConsumptionIds = currentPeriodBillings
      .map(b => (b as any).consumption_id)
      .filter(Boolean)

    if (currentPeriodConsumptionIds.length > 0) {
      const { data: wcRows } = await supabase
        .from('water_consumptions')
        .select('consumption, created_at')
        .in('consumption_id', currentPeriodConsumptionIds)

      if (wcRows?.length) {
        latestConsumption = wcRows.reduce(
          (sum, row) => sum + Number(row.consumption ?? 0), 0
        )
        latestConsumptionDate = wcRows
          .map(r => r.created_at)
          .sort()
          .at(-1) ?? null
      }
    }

    // Check each meter account's current billing vs disconnection_rules; notify if met
    try {
      const { evaluateConsumerOpenBillingsForDisconnectionNotify } = await import(
        '@/lib/actions/disconnection-notice/billing-disconnection-notify.actions'
      )
      const notifyScan = await evaluateConsumerOpenBillingsForDisconnectionNotify(consumerId)
      console.log('[getConsumerDashboardStats] disconnection notify scan', notifyScan)
    } catch (notifyErr) {
      console.error('[getConsumerDashboardStats] disconnection notify scan failed', notifyErr)
    }

    return {
      status: 'success',
      data: {
        outstandingBalance,
        totalBilling,
        latestConsumption,
        latestConsumptionDate,
        activeConnectionsCount,
        consumerName: consumer?.account_name || 'Consumer',
        currentPeriodLabel: latestPeriod ? formatPeriodLabel(latestPeriod) : null,
      },
    }
  } catch (err) {
    console.error('[getConsumerDashboardStats]', err)
    return { status: 'error', message: 'Failed to load dashboard stats.' }
  }
}

// ============================================================================
// GET — Recent Payments (from billing, connection_fee_payments, reconnection_payments)
// ============================================================================

export async function getConsumerRecentPayments(limit = 5): Promise<{
  status: 'success' | 'error' | 'unauthenticated'
  data?: ConsumerRecentPayment[]
  message?: string
}> {
  const supabase = await createClient()

  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return { status: 'unauthenticated', message: 'No active session.' }

    const consumerId = user.id

    // ─── 1. Get all meter accounts for this consumer ──────────────────────────
    const { data: meterAccounts } = await supabase
      .from('meter_accounts')
      .select('meter_account_id, meters ( meter_serial_no, installation_date, created_at )')
      .eq('consumer_id', consumerId)

    if (!meterAccounts?.length) return { status: 'success', data: [] }

    const meterAccountIds = meterAccounts.map(m => m.meter_account_id)
    const meterSerialNoMap = new Map(meterAccounts.map(m => [m.meter_account_id, latestMeterSerialFromMeters((m as any).meters)]))

    // ─── 2. Get billing payments ──────────────────────────────────────────────
    const { data: billingPayments } = await supabase
      .from('billing_payments')
      .select(`
        payment_id,
        amount_paid,
        created_at,
        billing:billing_id (
          meter_account_id
        )
      `)
      .in('billing.meter_account_id', meterAccountIds)

    // ─── 3. Get connection fee payments ──────────────────────────────────────
    // connection_fee_payments has meter_account_id directly
    const { data: connectionFeePayments } = await supabase
      .from('connection_fee_payments')
      .select(`
        payment_id,
        amount_paid,
        created_at,
        meter_account_id
      `)
      .in('meter_account_id', meterAccountIds)

    // ─── 4. Get reconnection payments ─────────────────────────────────────────
    const { data: reconnectionPayments } = await supabase
      .from('reconnection_payments')
      .select(`
        payment_id,
        amount_paid,
        created_at,
        reconnection:reconnection_id (
          disconnection:disconnection_id (
            meter_account_id
          )
        )
      `)

    // ─── 5. Build payment info map ────────────────────────────────────────────
    const paymentInfoMap = new Map<string, { amount: number; type: string; meter_account_id: string; created_at: string }>()

    // Process billing payments
    billingPayments?.forEach((bp: any) => {
      const billing = unwrap(bp.billing) as any
      const meterAccountId = billing?.meter_account_id
      if (meterAccountId && meterSerialNoMap.has(meterAccountId)) {
        paymentInfoMap.set(bp.payment_id, {
          amount: bp.amount_paid,
          type: 'billing',
          meter_account_id: meterAccountId,
          created_at: bp.created_at,
        })
      }
    })

    // Process connection fee payments - direct meter_account_id
    connectionFeePayments?.forEach((cfp: any) => {
      const meterAccountId = cfp.meter_account_id
      if (meterAccountId && meterSerialNoMap.has(meterAccountId)) {
        paymentInfoMap.set(cfp.payment_id, {
          amount: cfp.amount_paid,
          type: 'connection_fee',
          meter_account_id: meterAccountId,
          created_at: cfp.created_at,
        })
      }
    })

    // Process reconnection payments
    reconnectionPayments?.forEach((rp: any) => {
      const reconnection = unwrap(rp.reconnection) as any
      const disconnection = unwrap(reconnection?.disconnection) as any
      const meterAccountId = disconnection?.meter_account_id
      if (meterAccountId && meterSerialNoMap.has(meterAccountId)) {
        paymentInfoMap.set(rp.payment_id, {
          amount: rp.amount_paid,
          type: 'reconnection',
          meter_account_id: meterAccountId,
          created_at: rp.created_at,
        })
      }
    })

    if (paymentInfoMap.size === 0) return { status: 'success', data: [] }

    // ─── 6. Get receipt details from payments table ──────────────────────────
    const paymentIds = Array.from(paymentInfoMap.keys())
    const { data: payments } = await supabase
      .from('payments')
      .select('payment_id, receipt_number, payment_date')
      .in('payment_id', paymentIds)
      .order('payment_date', { ascending: false })
      .limit(limit)

    if (!payments?.length) return { status: 'success', data: [] }

    const results: ConsumerRecentPayment[] = []

    for (const payment of payments) {
      const info = paymentInfoMap.get(payment.payment_id)
      if (!info) continue

      const meterSerialNo = meterSerialNoMap.get(info.meter_account_id)
      if (!meterSerialNo) continue

      results.push({
        receipt_id: payment.payment_id,
        receipt_number: payment.receipt_number,
        payment_type: info.type,
        amount: info.amount,
        payment_date: payment.payment_date,
        meter_serial_no: meterSerialNo,
      })
    }

    return { status: 'success', data: results.slice(0, limit) }
  } catch (err) {
    console.error('[getConsumerRecentPayments]', err)
    return { status: 'error', message: 'Failed to load recent payments.' }
  }
}

// ============================================================================
// GET — Monthly Consumption
// ============================================================================

export async function getMonthlyConsumption(): Promise<{
  status: 'success' | 'error' | 'unauthenticated'
  data?: MonthlyConsumption[]
  message?: string
}> {
  const supabase = await createClient()

  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return { status: 'unauthenticated', message: 'No active session.' }

    const consumerId = user.id

    const { data: meterAccounts } = await supabase
      .from('meter_accounts')
      .select('meter_account_id, meters ( meter_serial_no, installation_date, created_at )')
      .eq('consumer_id', consumerId)
      .order('meter_account_id', { ascending: true })

    if (!meterAccounts?.length) return { status: 'success', data: [] }

    const meterAccountIds = meterAccounts.map(m => m.meter_account_id)
    const meterSerialNos = meterAccounts.map(m => latestMeterSerialFromMeters((m as any).meters) ?? m.meter_account_id)
    const meterSerialMap = new Map(meterAccounts.map(m => [m.meter_account_id, latestMeterSerialFromMeters((m as any).meters) ?? m.meter_account_id]))

    const { data: billings } = await supabase
      .from('billing')
      .select(`
        meter_account_id,
        consumption:consumption_id ( consumption ),
        reading_periods:reading_period_id ( period_start )
      `)
      .in('meter_account_id', meterAccountIds)
      .order('created_at', { ascending: false })

    if (!billings?.length) return { status: 'success', data: [] }

    const matrix = new Map<string, Map<string, number>>()

    for (const b of billings) {
      const periodData = unwrap((b as any).reading_periods) as any
      const consumption = unwrap((b as any).consumption) as any
      const periodStart = periodData?.period_start
      const units = Number(consumption?.consumption ?? 0)
      const meterNo = meterSerialMap.get(b.meter_account_id)

      if (!periodStart || !meterNo) continue
      if (!matrix.has(periodStart)) matrix.set(periodStart, new Map())
      const existing = matrix.get(periodStart)!.get(meterNo) ?? 0
      matrix.get(periodStart)!.set(meterNo, existing + units)
    }

    const sortedPeriods = Array.from(matrix.keys()).sort().slice(-8)

    const results: MonthlyConsumption[] = sortedPeriods.map(periodStart => {
      const row: MonthlyConsumption = { month: formatPeriodLabel(periodStart), period: periodStart }
      const periodData = matrix.get(periodStart) || new Map()
      for (const meterNo of meterSerialNos) {
        row[meterNo] = periodData.get(meterNo) ?? 0
      }
      return row
    })

    return { status: 'success', data: results }
  } catch (err) {
    console.error('[getMonthlyConsumption]', err)
    return { status: 'error', message: 'Failed to load consumption history.' }
  }
}