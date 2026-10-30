'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================================================
// Types — Meter Account Unpaid Days & Delinquency Aging
// ============================================================================

export type AgingBucket = '0-30' | '31-60' | '61-90' | '90+'

export interface DelinquencyKpis {
  totalUnpaidAccounts: number
  totalOverdueBalance: number
  averageUnpaidDays: number
  highRiskAccounts: number
}

export interface AgingDistributionRow {
  bucket: AgingBucket
  label: string
  count: number
  balance: number
}

export interface UnpaidDaysTrendRow {
  monthKey: string
  month: string
  averageUnpaidDays: number
  delinquentAccounts: number
}

export interface ZoneAgingRow {
  zone: string
  barangay: string
  label: string
  '0-30': number
  '31-60': number
  '61-90': number
  '90+': number
  total: number
}

export interface DelinquentAccountRow {
  meter_account_id: string
  billing_id: string
  contract_no: string
  consumer_name: string
  zone_name: string
  barangay_name: string
  unpaid_days: number
  outstanding_balance: number
  aging_bucket: AgingBucket
  due_date: string | null
}

export interface DelinquencyAnalytics {
  kpis: DelinquencyKpis
  agingDistribution: AgingDistributionRow[]
  unpaidDaysTrend: UnpaidDaysTrendRow[]
  zoneAging: ZoneAgingRow[]
  accounts: DelinquentAccountRow[]
  filters: {
    barangays: string[]
    zones: string[]
  }
}

const BUCKET_META: { bucket: AgingBucket; label: string; min: number; max: number | null }[] = [
  { bucket: '0-30', label: 'Current (0–30)', min: 0, max: 30 },
  { bucket: '31-60', label: '31–60 days', min: 31, max: 60 },
  { bucket: '61-90', label: '61–90 days', min: 61, max: 90 },
  { bucket: '90+', label: '90+ days', min: 91, max: null },
]

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

/** Display format XX-XXXX-XXXXX (private — 'use server' files may only export async actions) */
function formatContractNoDisplay(raw: string | null | undefined): string {
  if (!raw?.trim()) return '—'
  const t = raw.trim()
  if (/^\d{2}-\d{4}-\d{5}$/.test(t)) return t
  const digits = t.replace(/\D/g, '')
  if (digits.length >= 11) {
    const d = digits.slice(-11)
    return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 11)}`
  }
  return t
}

function agingBucket(days: number): AgingBucket {
  if (days <= 30) return '0-30'
  if (days <= 60) return '31-60'
  if (days <= 90) return '61-90'
  return '90+'
}

function phTodayYmd(asOf = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(asOf)
}

function daysBetween(fromIsoDate: string, to: Date): number {
  const due = fromIsoDate.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return 0
  const today = phTodayYmd(to)
  if (due >= today) return 0
  const dueMs = Date.parse(`${due}T12:00:00Z`)
  const todayMs = Date.parse(`${today}T12:00:00Z`)
  if (Number.isNaN(dueMs) || Number.isNaN(todayMs)) return 0
  return Math.max(0, Math.floor((todayMs - dueMs) / 86_400_000))
}

function monthLabel(d: Date): string {
  return d.toLocaleString('en-US', { month: 'short', year: 'numeric' })
}

function endOfMonth(year: number, monthIndex0: number): Date {
  return new Date(year, monthIndex0 + 1, 0, 23, 59, 59, 999)
}

// ============================================================================
// Latest billing per meter account (current bill)
// ============================================================================

async function getLatestBillingRows(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: index, error: indexErr } = await supabase
    .from('billing')
    .select('billing_id, meter_account_id, created_at')
    .order('created_at', { ascending: false })

  if (indexErr) throw indexErr
  if (!index?.length) return [] as any[]

  const latestIdByAccount = new Map<string, string>()
  for (const row of index) {
    if (!row.meter_account_id) continue
    if (!latestIdByAccount.has(row.meter_account_id)) {
      latestIdByAccount.set(row.meter_account_id, row.billing_id)
    }
  }

  const billingIds = Array.from(latestIdByAccount.values())
  if (!billingIds.length) return []

  const { data: billings, error } = await supabase
    .from('billing')
    .select(`
      billing_id,
      meter_account_id,
      remaining_balance,
      created_at,
      reading_period_id,
      reading_periods:reading_period_id ( period_start, period_end, due_date ),
      billing_status:billing_status_id ( billing_status_name ),
      meter_account:meter_account_id (
        meter_account_id,
        consumer:consumer_id ( account_name, contract_no ),
        zone:zone_id (
          zone_name,
          barangay:barangay_id ( barangay_name )
        )
      )
    `)
    .in('billing_id', billingIds)

  if (error) throw error
  return billings ?? []
}

function buildDelinquentAccounts(billings: any[], asOf = new Date()): DelinquentAccountRow[] {
  const rows: DelinquentAccountRow[] = []

  for (const b of billings) {
    const status = unwrap(b.billing_status)?.billing_status_name?.toLowerCase() ?? ''
    const remaining = Number(b.remaining_balance) || 0
    // Fully unpaid only — partial is treated as a valid payment
    if (status !== 'unpaid' || remaining <= 0) continue

    const period = unwrap(b.reading_periods) as {
      period_start?: string
      period_end?: string
      due_date?: string
    } | null

    const due = period?.due_date || period?.period_end || null
    // Not overdue yet if due date is in the future
    if (due) {
      const dueDay = due.slice(0, 10)
      const today = asOf.toISOString().slice(0, 10)
      if (dueDay > today) continue
    } else {
      continue
    }

    const unpaidDays = daysBetween(due, asOf)
    const ma = unwrap(b.meter_account) as any
    const consumer = unwrap(ma?.consumer) as any
    const zone = unwrap(ma?.zone) as any
    const barangay = unwrap(zone?.barangay) as any

    rows.push({
      meter_account_id: b.meter_account_id,
      billing_id: b.billing_id,
      contract_no: formatContractNoDisplay(consumer?.contract_no),
      consumer_name: consumer?.account_name ?? 'Unknown',
      zone_name: zone?.zone_name ?? '—',
      barangay_name: barangay?.barangay_name ?? '—',
      unpaid_days: unpaidDays,
      outstanding_balance: Math.round(remaining * 100) / 100,
      aging_bucket: agingBucket(unpaidDays),
      due_date: due.slice(0, 10),
    })
  }

  rows.sort((a, b) => b.unpaid_days - a.unpaid_days || b.outstanding_balance - a.outstanding_balance)
  return rows
}

function buildAnalytics(accounts: DelinquentAccountRow[], asOf = new Date()): DelinquencyAnalytics {
  const totalUnpaidAccounts = accounts.length
  const totalOverdueBalance =
    Math.round(accounts.reduce((s, a) => s + a.outstanding_balance, 0) * 100) / 100
  const averageUnpaidDays =
    totalUnpaidAccounts === 0
      ? 0
      : Math.round(
          (accounts.reduce((s, a) => s + a.unpaid_days, 0) / totalUnpaidAccounts) * 10,
        ) / 10
  const highRiskAccounts = accounts.filter((a) => a.unpaid_days >= 90).length

  const agingDistribution: AgingDistributionRow[] = BUCKET_META.map((m) => {
    const inBucket = accounts.filter((a) => a.aging_bucket === m.bucket)
    return {
      bucket: m.bucket,
      label: m.label,
      count: inBucket.length,
      balance: Math.round(inBucket.reduce((s, a) => s + a.outstanding_balance, 0) * 100) / 100,
    }
  })

  // Last 6 months trend (retrospective from current delinquent set)
  const unpaidDaysTrend: UnpaidDaysTrendRow[] = []
  {
    let y = asOf.getFullYear()
    let m = asOf.getMonth()
    const months: { y: number; m: number }[] = []
    for (let i = 0; i < 6; i++) {
      months.unshift({ y, m })
      m -= 1
      if (m < 0) {
        m = 11
        y -= 1
      }
    }

    for (const { y: yy, m: mm } of months) {
      const end = endOfMonth(yy, mm)
      const endStr = end.toISOString().slice(0, 10)
      const snapshot = accounts
        .filter((a) => a.due_date && a.due_date <= endStr)
        .map((a) => ({
          ...a,
          unpaid_days: daysBetween(a.due_date!, end),
        }))
      const delinquentAccounts = snapshot.length
      const averageUnpaidDays =
        delinquentAccounts === 0
          ? 0
          : Math.round(
              (snapshot.reduce((s, a) => s + a.unpaid_days, 0) / delinquentAccounts) * 10,
            ) / 10

      unpaidDaysTrend.push({
        monthKey: `${yy}-${String(mm + 1).padStart(2, '0')}`,
        month: monthLabel(new Date(yy, mm, 1)),
        averageUnpaidDays,
        delinquentAccounts,
      })
    }
  }

  // Zone / barangay stacked aging
  const zoneMap = new Map<string, ZoneAgingRow>()
  for (const a of accounts) {
    const key = `${a.barangay_name}||${a.zone_name}`
    if (!zoneMap.has(key)) {
      zoneMap.set(key, {
        zone: a.zone_name,
        barangay: a.barangay_name,
        label: a.barangay_name !== '—' ? a.barangay_name : a.zone_name,
        '0-30': 0,
        '31-60': 0,
        '61-90': 0,
        '90+': 0,
        total: 0,
      })
    }
    const row = zoneMap.get(key)!
    row[a.aging_bucket] += 1
    row.total += 1
  }

  const zoneAging = Array.from(zoneMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 12)

  const barangays = Array.from(new Set(accounts.map((a) => a.barangay_name).filter((n) => n && n !== '—'))).sort()
  const zones = Array.from(new Set(accounts.map((a) => a.zone_name).filter((n) => n && n !== '—'))).sort()

  return {
    kpis: {
      totalUnpaidAccounts,
      totalOverdueBalance,
      averageUnpaidDays,
      highRiskAccounts,
    },
    agingDistribution,
    unpaidDaysTrend,
    zoneAging,
    accounts,
    filters: { barangays, zones },
  }
}

// ============================================================================
// GET — Full delinquency analytics payload (Supabase)
// ============================================================================

export async function getClerkDelinquencyAnalytics(): Promise<{
  status: 'success' | 'error'
  data?: DelinquencyAnalytics
  message?: string
}> {
  const supabase = await createClient()

  try {
    const billings = await getLatestBillingRows(supabase)
    const accounts = buildDelinquentAccounts(billings)
    return { status: 'success', data: buildAnalytics(accounts) }
  } catch (err) {
    console.error('[getClerkDelinquencyAnalytics]', err)
    return { status: 'error', message: 'Failed to load delinquency analytics' }
  }
}
