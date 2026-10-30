// lib/actions/payment/report.actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'

// ─── Types ────────────────────────────────────────────────────────────────────

export type RevenueStreamType = 'billing' | 'connection_fee' | 'reconnection'

export interface RevenueStreamSummary {
  type: RevenueStreamType
  label: string
  total: number
  count: number
}

export interface DailyBreakdownEntry {
  date: string
  billing: number
  connection_fee: number
  reconnection: number
  total: number
}

export interface MonthlyReportData {
  month: string         // "2026-07"
  monthLabel: string    // "July 2026"
  streams: RevenueStreamSummary[]
  grandTotal: number
  totalTransactions: number
  dailyBreakdown: DailyBreakdownEntry[]
}

export interface MonthlyReportResponse {
  status: 'success' | 'error'
  data?: MonthlyReportData
  message?: string
}

export interface AvailableMonth {
  value: string  // "2026-07"
  label: string  // "July 2026"
}

export interface AvailableMonthsResponse {
  status: 'success' | 'error'
  data?: AvailableMonth[]
  message?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function unwrap<T>(val: T | T[] | null | undefined): T | null {
  if (val == null) return null
  return Array.isArray(val) ? (val[0] ?? null) : val
}

function emptyReport(month: string, monthLabel: string): MonthlyReportData {
  return {
    month,
    monthLabel,
    streams: [
      { type: 'billing', label: 'Billing', total: 0, count: 0 },
      { type: 'connection_fee', label: 'Connection Fee', total: 0, count: 0 },
      { type: 'reconnection', label: 'Reconnection', total: 0, count: 0 },
    ],
    grandTotal: 0,
    totalTransactions: 0,
    dailyBreakdown: [],
  }
}

// ─── GET — Available Report Months ───────────────────────────────────────────
// Only returns months from the earliest recorded transaction through the
// current month — never fabricates months that have no data behind them.

export async function getAvailableReportMonths(): Promise<AvailableMonthsResponse> {
  const supabase = await createClient()

  try {
    const { data: earliest, error } = await supabase
      .from('payments')
      .select('payment_date')
      .order('payment_date', { ascending: true })
      .limit(1)
      .single()

    if (error || !earliest) {
      return { status: 'success', data: [] }
    }

    const startDate = new Date(earliest.payment_date)
    const now = new Date()

    const months: AvailableMonth[] = []
    const cursor = new Date(now.getFullYear(), now.getMonth(), 1)
    const floor = new Date(startDate.getFullYear(), startDate.getMonth(), 1)

    while (cursor >= floor) {
      months.push({
        value: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
        label: cursor.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      })
      cursor.setMonth(cursor.getMonth() - 1)
    }

    return { status: 'success', data: months }
  } catch (err: any) {
    console.error('[getAvailableReportMonths]', err)
    return { status: 'error', message: err?.message ?? 'Failed to load available months' }
  }
}

// ─── GET — Monthly Revenue Report ────────────────────────────────────────────

export async function getMonthlyRevenueReport(month: string): Promise<MonthlyReportResponse> {
  const supabase = await createClient()

  try {
    const [year, mo] = month.split('-').map(Number)
    const monthLabel = new Date(year, mo - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
    const startDate = new Date(Date.UTC(year, mo - 1, 1)).toISOString().slice(0, 10)
    const endDate = new Date(Date.UTC(year, mo, 0)).toISOString().slice(0, 10)

    const { data: payments, error } = await supabase
      .from('payments')
      .select(`
        payment_id,
        payment_date,
        payment_type:payment_type_id ( payment_type_name )
      `)
      .gte('payment_date', startDate)
      .lte('payment_date', endDate)

    if (error) throw error

    if (!payments || payments.length === 0) {
      return { status: 'success', data: emptyReport(month, monthLabel) }
    }

    const paymentIds = payments.map((p) => p.payment_id)

    const [{ data: billing }, { data: connectionFee }, { data: reconnection }] = await Promise.all([
      supabase.from('billing_payments').select('payment_id, amount_paid').in('payment_id', paymentIds),
      supabase.from('connection_fee_payments').select('payment_id, amount_paid').in('payment_id', paymentIds),
      supabase.from('reconnection_payments').select('payment_id, amount_paid').in('payment_id', paymentIds),
    ])

    const amountMap = new Map<string, number>()
    billing?.forEach((b: any) => amountMap.set(b.payment_id, Number(b.amount_paid)))
    connectionFee?.forEach((c: any) => amountMap.set(c.payment_id, Number(c.amount_paid)))
    reconnection?.forEach((r: any) => amountMap.set(r.payment_id, Number(r.amount_paid)))

    const totals: Record<RevenueStreamType, number> = { billing: 0, connection_fee: 0, reconnection: 0 }
    const counts: Record<RevenueStreamType, number> = { billing: 0, connection_fee: 0, reconnection: 0 }
    const dailyMap = new Map<string, { billing: number; connection_fee: number; reconnection: number }>()

    payments.forEach((p: any) => {
      const paymentType = unwrap(p.payment_type)
      const typeName = paymentType?.payment_type_name?.toLowerCase() || ''
      const amount = amountMap.get(p.payment_id) || 0
      if (amount <= 0) return

      let key: RevenueStreamType | null = null
      if (typeName.includes('billing')) key = 'billing'
      else if (typeName.includes('connection_fee') || typeName.includes('connection fee')) key = 'connection_fee'
      else if (typeName.includes('reconnection')) key = 'reconnection'
      if (!key) return

      totals[key] += amount
      counts[key] += 1

      // Only dates with at least one real transaction ever get an entry here —
      // this map is never pre-seeded with the full calendar, so the daily
      // breakdown naturally excludes empty days.
      if (!dailyMap.has(p.payment_date)) {
        dailyMap.set(p.payment_date, { billing: 0, connection_fee: 0, reconnection: 0 })
      }
      dailyMap.get(p.payment_date)![key] += amount
    })

    const dailyBreakdown: DailyBreakdownEntry[] = Array.from(dailyMap.entries())
      .map(([date, v]) => ({ date, ...v, total: v.billing + v.connection_fee + v.reconnection }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const grandTotal = totals.billing + totals.connection_fee + totals.reconnection
    const totalTransactions = counts.billing + counts.connection_fee + counts.reconnection

    return {
      status: 'success',
      data: {
        month,
        monthLabel,
        streams: [
          { type: 'billing', label: 'Billing', total: totals.billing, count: counts.billing },
          { type: 'connection_fee', label: 'Connection Fee', total: totals.connection_fee, count: counts.connection_fee },
          { type: 'reconnection', label: 'Reconnection', total: totals.reconnection, count: counts.reconnection },
        ],
        grandTotal,
        totalTransactions,
        dailyBreakdown,
      },
    }
  } catch (err: any) {
    console.error('[getMonthlyRevenueReport]', err)
    return { status: 'error', message: err?.message ?? 'Failed to generate report' }
  }
}