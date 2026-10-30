// lib/actions/dashboard/dashboard.actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================================================
// Types
// ============================================================================

export interface DashboardStats {
  activeConnections: number
  totalDisconnections: number
  totalZones: number
  totalBarangays: number
  /** SUM(water_consumptions.consumption) — all rows */
  totalConsumption: number
  /** SUM(water_consumptions.billed_consumption) — all rows */
  totalBilledConsumption: number
  periodLabel: string
}

export interface PeriodConsumptionRow {
  month: string
  consumption: number
  billedConsumption: number
}

export interface GeoConsumptionRow {
  id: string
  label: string
  consumption: number
  billedConsumption: number
}

export interface MonthlyOverdue {
  month: string
  year: number
  monthIndex: number
  count: number
}

export interface MonthlyBillingStatus {
  month: string
  year: number
  monthIndex: number
  unpaid: number
  partial: number
  paid: number
  forwarded: number
}

export type PaymentKind = 'billing' | 'connection_fee' | 'reconnection'

export interface RecentPayment {
  id: string
  receipt_number: string
  consumer_name: string
  amount: number
  payment_date: string
  kind: PaymentKind
}

export interface MonthlyRevenue {
  month: string
  amount: number
}

// ============================================================================
// Helper - Get the latest N *distinct* reading periods (by period_start),
// oldest → newest, so charts read left-to-right ending at the latest month.
// Also carries each period's due_date (overdue is validated against this,
// not against a column on `billing`).
// ============================================================================

async function getAvailableReadingPeriods(
  supabase: any,
  limit: number = 5,
): Promise<{ reading_period_id: string; year: number; month: number; due_date: string | null }[]> {
  const { data, error } = await supabase
    .from('reading_periods')
    .select('reading_period_id, period_start, due_date')
    .order('period_start', { ascending: false })
    .limit(limit)

  if (error || !data) {
    console.error('getAvailableReadingPeriods:', error)
    return []
  }

  return data
    .map((rp: any) => {
      const d = new Date(rp.period_start)
      return {
        reading_period_id: rp.reading_period_id,
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        due_date: rp.due_date ?? null,
      }
    })
    .sort((a: any, b: any) => (a.year !== b.year ? a.year - b.year : a.month - b.month))
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  })
}

// ============================================================================
// GET - Stat cards (Using Meter Status instead of Account Status)
// ============================================================================

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = await createClient()

  // Get "Active" meter status ID
  const { data: activeMeterStatus } = await supabase
    .from('meter_status')
    .select('meter_status_id')
    .eq('meter_status_name', 'Active')
    .maybeSingle()

  // Get all meter accounts that have an Active meter
  let activeMeterAccountIds: string[] = []
  if (activeMeterStatus) {
    const { data: activeMeters } = await supabase
      .from('meters')
      .select('meter_account_id')
      .eq('meter_status_id', activeMeterStatus.meter_status_id)

    activeMeterAccountIds = [...new Set((activeMeters ?? []).map((m: any) => m.meter_account_id))]
  }

  // Get "Inactive" or "Disconnected" meter status IDs (for disconnection count)
  const { data: inactiveStatuses } = await supabase
    .from('meter_status')
    .select('meter_status_id')
    .in('meter_status_name', ['Inactive', 'Disconnected'])

  const inactiveIds = (inactiveStatuses ?? []).map((s: any) => s.meter_status_id)
  let inactiveMeterAccountIds: string[] = []
  if (inactiveIds.length > 0) {
    const { data: inactiveMeters } = await supabase
      .from('meters')
      .select('meter_account_id')
      .in('meter_status_id', inactiveIds)

    inactiveMeterAccountIds = [...new Set((inactiveMeters ?? []).map((m: any) => m.meter_account_id))]
  }

  const [
    { count: zonesCount },
    { count: barangaysCount },
  ] = await Promise.all([
    supabase
      .from('zone')
      .select('zone_id', { count: 'exact', head: true })
      .eq('is_active', true),

    supabase
      .from('barangay')
      .select('barangay_id', { count: 'exact', head: true })
      .eq('is_active', true),
  ])

  // Sum every water_consumptions row (all reading periods) — not via billing.
  // Paginate past PostgREST's default 1000-row page size.
  let totalConsumption = 0
  let totalBilledConsumption = 0
  const pageSize = 1000
  let from = 0
  for (;;) {
    const { data: wcRows, error: wcErr } = await supabase
      .from('water_consumptions')
      .select('consumption, billed_consumption')
      .range(from, from + pageSize - 1)

    if (wcErr) {
      console.error('getDashboardStats water_consumptions:', wcErr)
      break
    }
    if (!wcRows?.length) break

    for (const row of wcRows) {
      totalConsumption += Number(row.consumption ?? 0)
      totalBilledConsumption += Number(row.billed_consumption ?? 0)
    }

    if (wcRows.length < pageSize) break
    from += pageSize
  }
  totalConsumption = Math.round(totalConsumption * 100) / 100
  totalBilledConsumption = Math.round(totalBilledConsumption * 100) / 100

  return {
    activeConnections:     activeMeterAccountIds.length,
    totalDisconnections:   inactiveMeterAccountIds.length,
    totalZones:            zonesCount        ?? 0,
    totalBarangays:        barangaysCount    ?? 0,
    totalConsumption,
    totalBilledConsumption,
    periodLabel: 'All reading periods',
  }
}

// ============================================================================
// GET - Source vs billed consumption by reading period (last N periods)
// ============================================================================

export async function getMonthlyConsumptionTrend(
  limit: number = 12,
): Promise<PeriodConsumptionRow[]> {
  const supabase = await createClient()
  const periods = await getAvailableReadingPeriods(supabase, limit)
  if (periods.length === 0) return []

  const periodIds = periods.map((p) => p.reading_period_id)
  const { data, error } = await supabase
    .from('billing')
    .select(`
      reading_period_id,
      consumption:consumption_id (
        consumption,
        billed_consumption
      )
    `)
    .in('reading_period_id', periodIds)

  if (error) {
    console.error('getMonthlyConsumptionTrend:', error)
    return periods.map(({ year, month }) => ({
      month: monthLabel(year, month),
      consumption: 0,
      billedConsumption: 0,
    }))
  }

  const grouped = new Map<string, { consumption: number; billedConsumption: number }>()
  for (const p of periods) {
    grouped.set(p.reading_period_id, { consumption: 0, billedConsumption: 0 })
  }

  for (const row of data ?? []) {
    const key = (row as any).reading_period_id as string
    const entry = grouped.get(key)
    if (!entry) continue
    const wc = Array.isArray((row as any).consumption)
      ? (row as any).consumption[0]
      : (row as any).consumption
    entry.consumption += Number(wc?.consumption ?? 0)
    entry.billedConsumption += Number(wc?.billed_consumption ?? 0)
  }

  return periods.map(({ reading_period_id, year, month }) => {
    const g = grouped.get(reading_period_id) ?? { consumption: 0, billedConsumption: 0 }
    return {
      month: monthLabel(year, month),
      consumption: Math.round(g.consumption * 100) / 100,
      billedConsumption: Math.round(g.billedConsumption * 100) / 100,
    }
  })
}

// ============================================================================
// GET - Source vs billed consumption by barangay or zone (latest period)
// ============================================================================

export async function getConsumptionByArea(
  mode: 'barangay' | 'zone' = 'barangay',
): Promise<GeoConsumptionRow[]> {
  const supabase = await createClient()
  const periods = await getAvailableReadingPeriods(supabase, 1)
  const latestPeriod = periods[0]
  if (!latestPeriod) return []

  const { data, error } = await supabase
    .from('billing')
    .select(`
      consumption:consumption_id (
        consumption,
        billed_consumption
      ),
      meter_account:meter_account_id (
        zone:zone_id (
          zone_id,
          zone_name,
          barangay:barangay_id (
            barangay_id,
            barangay_name
          )
        )
      )
    `)
    .eq('reading_period_id', latestPeriod.reading_period_id)

  if (error) {
    console.error('getConsumptionByArea:', error)
    return []
  }

  const map = new Map<string, GeoConsumptionRow>()

  for (const row of data ?? []) {
    const wc = Array.isArray((row as any).consumption)
      ? (row as any).consumption[0]
      : (row as any).consumption
    const cons = Number(wc?.consumption ?? 0)
    const billed = Number(wc?.billed_consumption ?? 0)
    const zone = Array.isArray((row as any).meter_account)
      ? (row as any).meter_account[0]?.zone
      : (row as any).meter_account?.zone
    const zoneObj = Array.isArray(zone) ? zone[0] : zone
    const barangay = Array.isArray(zoneObj?.barangay)
      ? zoneObj.barangay[0]
      : zoneObj?.barangay

    let id: string
    let label: string
    if (mode === 'zone') {
      id = zoneObj?.zone_id ?? 'unknown'
      label = zoneObj?.zone_name ?? 'Unknown'
    } else {
      id = barangay?.barangay_id ?? 'unknown'
      label = barangay?.barangay_name ?? 'Unknown'
    }

    const existing = map.get(id)
    if (existing) {
      existing.consumption = Math.round((existing.consumption + cons) * 100) / 100
      existing.billedConsumption =
        Math.round((existing.billedConsumption + billed) * 100) / 100
    } else {
      map.set(id, {
        id,
        label,
        consumption: Math.round(cons * 100) / 100,
        billedConsumption: Math.round(billed * 100) / 100,
      })
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => b.billedConsumption - a.billedConsumption,
  )
}

// ============================================================================
// GET - Monthly overdue count, last 5 distinct reading periods.
// "Overdue" = the reading period's due_date has already passed AND the bill
// is not fully paid. due_date lives on reading_periods, not on billing.
// ============================================================================

export async function getMonthlyOverdueBilling(limit: number = 5): Promise<MonthlyOverdue[]> {
  const supabase = await createClient()

  const periods = await getAvailableReadingPeriods(supabase, limit)
  if (periods.length === 0) return []

  const periodIds = periods.map((p) => p.reading_period_id)

  const { data: paidStatus } = await supabase
    .from('billing_status')
    .select('billing_status_id')
    .eq('billing_status_name', 'paid')
    .maybeSingle()

  let query = supabase
    .from('billing')
    .select('billing_id, billing_status_id, reading_period_id')
    .in('reading_period_id', periodIds)

  if (paidStatus) {
    query = query.neq('billing_status_id', paidStatus.billing_status_id) // exclude fully paid bills
  }

  const { data, error } = await query

  if (error) {
    console.error('getMonthlyOverdueBilling:', error)
    return periods.map(({ year, month }) => ({
      month: monthLabel(year, month),
      year,
      monthIndex: month,
      count: 0,
    }))
  }

  const todayStr = new Date().toISOString().slice(0, 10)

  // Only periods whose due_date has already passed count toward "overdue".
  const overduePeriodIds = new Set(
    periods
      .filter((p) => p.due_date && p.due_date < todayStr)
      .map((p) => p.reading_period_id),
  )

  const periodIdToYm = new Map(periods.map((p) => [p.reading_period_id, `${p.year}-${p.month}`]))
  const grouped: Record<string, number> = {}
  ;(data || []).forEach((row: any) => {
    if (!overduePeriodIds.has(row.reading_period_id)) return // this period isn't past due yet
    const key = periodIdToYm.get(row.reading_period_id)
    if (!key) return
    grouped[key] = (grouped[key] ?? 0) + 1
  })

  return periods.map(({ year, month }) => ({
    month: monthLabel(year, month),
    year,
    monthIndex: month,
    count: grouped[`${year}-${month}`] ?? 0,
  }))
}

// ============================================================================
// GET - Monthly billing status, last 5 distinct reading periods.
// ============================================================================

const EMPTY_BILLING_STATUS_COUNTS = {
  unpaid: 0,
  partial: 0,
  paid: 0,
  forwarded: 0,
} as const

export async function getMonthlyBillingStatus(limit: number = 5): Promise<MonthlyBillingStatus[]> {
  const supabase = await createClient()

  const periods = await getAvailableReadingPeriods(supabase, limit)
  if (periods.length === 0) return []

  const periodIds = periods.map((p) => p.reading_period_id)

  const { data: statuses } = await supabase
    .from('billing_status')
    .select('billing_status_id, billing_status_name')
    .in('billing_status_name', ['unpaid', 'partial', 'paid', 'forwarded'])

  const statusMap = new Map(
    statuses?.map((s: any) => [s.billing_status_name.toLowerCase(), s.billing_status_id]) ?? [],
  )

  const { data, error } = await supabase
    .from('billing')
    .select('billing_id, billing_status_id, reading_period_id')
    .in('reading_period_id', periodIds)

  if (error) {
    console.error('getMonthlyBillingStatus:', error)
    return periods.map(({ year, month }) => ({
      month: monthLabel(year, month),
      year,
      monthIndex: month,
      ...EMPTY_BILLING_STATUS_COUNTS,
    }))
  }

  const periodIdToYm = new Map(periods.map((p) => [p.reading_period_id, `${p.year}-${p.month}`]))
  const grouped: Record<string, {
    unpaid: number
    partial: number
    paid: number
    forwarded: number
  }> = {}

  ;(data || []).forEach((row: any) => {
    const key = periodIdToYm.get(row.reading_period_id)
    if (!key) return
    if (!grouped[key]) grouped[key] = { ...EMPTY_BILLING_STATUS_COUNTS }

    const statusId = row.billing_status_id
    if (statusId === statusMap.get('unpaid')) grouped[key].unpaid++
    else if (statusId === statusMap.get('partial')) grouped[key].partial++
    else if (statusId === statusMap.get('paid')) grouped[key].paid++
    else if (statusId === statusMap.get('forwarded')) grouped[key].forwarded++
  })

  return periods.map(({ year, month }) => ({
    month: monthLabel(year, month),
    year,
    monthIndex: month,
    ...(grouped[`${year}-${month}`] ?? { ...EMPTY_BILLING_STATUS_COUNTS }),
  }))
}

// ============================================================================
// GET - Recent payments - ALL types
// ============================================================================

export async function getRecentPayments(): Promise<RecentPayment[]> {
  const supabase = await createClient()

  const [
    { data: billingRows },
    { data: connFeeRows },
    { data: reconRows },
  ] = await Promise.all([

    supabase
      .from('billing_payments')
      .select(`
        billing_payment_id,
        amount_paid,
        created_at,
        payment:payment_id (
          receipt_number,
          payment_date,
          recieved_by
        ),
        billing:billing_id (
          consumer:consumer_id (
            account_name
          )
        )
      `)
      .order('created_at', { ascending: false })
      .limit(5),

    supabase
      .from('connection_fee_payments')
      .select(`
        connection_fee_payment_id,
        amount_paid,
        created_at,
        payment:payment_id (
          receipt_number,
          payment_date,
          recieved_by
        ),
        meter_account:meter_account_id (
          consumer:consumer_id (
            account_name
          )
        )
      `)
      .order('created_at', { ascending: false })
      .limit(5),

    supabase
      .from('reconnection_payments')
      .select(`
        reconnection_payment_id,
        amount_paid,
        created_at,
        payment:payment_id (
          receipt_number,
          payment_date,
          recieved_by
        ),
        reconnection:reconnection_id (
          disconnection:disconnection_id (
            meter_account:meter_account_id (
              consumer:consumer_id (
                account_name
              )
            )
          )
        )
      `)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const results: RecentPayment[] = []

  ;(billingRows || []).forEach((row: any) => {
    const payment = Array.isArray(row.payment) ? row.payment[0] : row.payment
    const billing = Array.isArray(row.billing) ? row.billing[0] : row.billing
    const consumer = Array.isArray(billing?.consumer) ? billing.consumer[0] : billing?.consumer

    results.push({
      id: row.billing_payment_id,
      receipt_number: payment?.receipt_number ?? '-',
      consumer_name: consumer?.account_name ?? 'Unknown',
      amount: row.amount_paid ?? 0,
      payment_date: payment?.payment_date ?? row.created_at ?? '',
      kind: 'billing',
    })
  })

  ;(connFeeRows || []).forEach((row: any) => {
    const payment = Array.isArray(row.payment) ? row.payment[0] : row.payment
    const meterAccount = Array.isArray(row.meter_account) ? row.meter_account[0] : row.meter_account
    const consumer = Array.isArray(meterAccount?.consumer) ? meterAccount.consumer[0] : meterAccount?.consumer

    results.push({
      id: row.connection_fee_payment_id,
      receipt_number: payment?.receipt_number ?? '-',
      consumer_name: consumer?.account_name ?? 'Unknown',
      amount: row.amount_paid ?? 0,
      payment_date: payment?.payment_date ?? row.created_at ?? '',
      kind: 'connection_fee',
    })
  })

  ;(reconRows || []).forEach((row: any) => {
    const payment = Array.isArray(row.payment) ? row.payment[0] : row.payment
    const reconnection = Array.isArray(row.reconnection) ? row.reconnection[0] : row.reconnection
    const disconnection = Array.isArray(reconnection?.disconnection) ? reconnection.disconnection[0] : reconnection?.disconnection
    const meterAccount = Array.isArray(disconnection?.meter_account) ? disconnection.meter_account[0] : disconnection?.meter_account
    const consumer = Array.isArray(meterAccount?.consumer) ? meterAccount.consumer[0] : meterAccount?.consumer

    results.push({
      id: row.reconnection_payment_id,
      receipt_number: payment?.receipt_number ?? '-',
      consumer_name: consumer?.account_name ?? 'Unknown',
      amount: row.amount_paid ?? 0,
      payment_date: payment?.payment_date ?? row.created_at ?? '',
      kind: 'reconnection',
    })
  })

  results.sort((a, b) => {
    const da = a.payment_date ? new Date(a.payment_date).getTime() : 0
    const db = b.payment_date ? new Date(b.payment_date).getTime() : 0
    return db - da
  })

  return results.slice(0, 5)
}

// ============================================================================
// GET - Monthly revenue (total). Only returns months that actually have at
// least one transaction - no zero-padded/manufactured months.
// ============================================================================

export async function getMonthlyRevenue(limit: number = 6): Promise<MonthlyRevenue[]> {
  const supabase = await createClient()

  const [billingPayments, connFeePayments, reconPayments] = await Promise.all([
    supabase.from('billing_payments').select('amount_paid, created_at'),
    supabase.from('connection_fee_payments').select('amount_paid, created_at'),
    supabase.from('reconnection_payments').select('amount_paid, created_at'),
  ])

  const map: Record<string, number> = {}
  const addToMap = (rows: any[] | null) => {
    ;(rows ?? []).forEach((r) => {
      const key = (r.created_at as string)?.slice(0, 7) // 'YYYY-MM'
      if (key) map[key] = (map[key] ?? 0) + (Number(r.amount_paid) || 0)
    })
  }
  addToMap(billingPayments.data)
  addToMap(connFeePayments.data)
  addToMap(reconPayments.data)

  // Only keys with actual transaction data, oldest → newest, capped to the
  // most recent `limit` months that have data.
  const sortedKeys = Object.keys(map).sort()
  const latestKeys = sortedKeys.slice(-limit)

  return latestKeys.map((key) => {
    const [y, m] = key.split('-').map(Number)
    return {
      month: new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' }),
      amount: map[key],
    }
  })
}