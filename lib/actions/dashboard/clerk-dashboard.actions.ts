'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================================================
// Types
// ============================================================================

export type AgingBucket = '0' | '1-30' | '31-60' | '61-90' | '90+'

export interface ClerkDashboardFilters {
  readingPeriodId?: string | null
  barangayId?: string | null
  zoneId?: string | null
  classificationId?: string | null
}

export interface FilterOption {
  id: string
  name: string
  barangayId?: string
  /** Present for reading-period options (ISO period_start) */
  periodStart?: string
}

export interface ClerkDashboardKpis {
  /** SUM(water_consumptions.consumption) — labeled MEEDO Water Source Consumption */
  totalConsumption: number
  /** SUM(water_consumptions.billed_consumption) — labeled Consumer Usage (Billed) */
  totalBilledConsumption: number
  varianceM3: number
  variancePct: number
  totalBilledAmount: number
  totalCollected: number
  totalOutstanding: number
  collectionEfficiency: number
  unpaidAccounts: number
  averageUnpaidDays: number
  periodLabel: string
}

export interface PeriodConsumptionRow {
  reading_period_id: string
  monthKey: string
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

export interface BillingStatusBreakdown {
  paid: number
  partial: number
  unpaid: number
}

export interface PeriodAmountRow {
  reading_period_id: string
  monthKey: string
  month: string
  billed: number
  collected: number
}

export interface AgingDistributionRow {
  bucket: AgingBucket
  label: string
  count: number
}

export interface ZoneOutstandingRow {
  zone: string
  barangay: string
  label: string
  outstanding: number
}

export interface ClassificationConsumptionRow {
  classification: string
  billedConsumption: number
}

export interface UnpaidAccountRow {
  meter_account_id: string
  contract_no: string
  account_name: string
  zone_name: string
  barangay_name: string
  classification_name: string
  oldest_unpaid_period: string
  due_date: string | null
  unpaid_days: number
  months_unpaid: number
  outstanding_balance: number
  aging_bucket: AgingBucket
  has_notice: boolean
  is_disconnected: boolean
}

export interface ClerkDashboardData {
  kpis: ClerkDashboardKpis
  consumptionByPeriod: PeriodConsumptionRow[]
  consumptionByBarangay: GeoConsumptionRow[]
  consumptionByZone: GeoConsumptionRow[]
  billingStatus: BillingStatusBreakdown
  billedVsCollected: PeriodAmountRow[]
  agingDistribution: AgingDistributionRow[]
  outstandingByZone: ZoneOutstandingRow[]
  billedByClassification: ClassificationConsumptionRow[]
  unpaidAccounts: UnpaidAccountRow[]
  filters: {
    readingPeriods: FilterOption[]
    barangays: FilterOption[]
    zones: FilterOption[]
    classifications: FilterOption[]
  }
  focusPeriodId: string | null
}

const AGING_META: { bucket: AgingBucket; label: string; min: number; max: number | null }[] = [
  { bucket: '0', label: '0 days', min: 0, max: 0 },
  { bucket: '1-30', label: '1–30 days', min: 1, max: 30 },
  { bucket: '31-60', label: '31–60 days', min: 31, max: 60 },
  { bucket: '61-90', label: '61–90 days', min: 61, max: 90 },
  { bucket: '90+', label: '90+ days', min: 91, max: null },
]

function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

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
  if (days <= 0) return '0'
  if (days <= 30) return '1-30'
  if (days <= 60) return '31-60'
  if (days <= 90) return '61-90'
  return '90+'
}

/** YYYY-MM-DD in Asia/Manila (billing due dates are calendar dates, not UTC instants). */
function phTodayYmd(asOf = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(asOf)
}

/** Whole calendar days past due (0 if due today or in the future). */
function daysPastDue(dueIsoDate: string, asOf = new Date()): number {
  const due = dueIsoDate.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return 0
  const today = phTodayYmd(asOf)
  if (due >= today) return 0
  const dueMs = Date.parse(`${due}T12:00:00Z`)
  const todayMs = Date.parse(`${today}T12:00:00Z`)
  if (Number.isNaN(dueMs) || Number.isNaN(todayMs)) return 0
  return Math.max(0, Math.floor((todayMs - dueMs) / 86_400_000))
}

/** @deprecated use daysPastDue — kept for any remaining call sites */
function daysBetween(fromIsoDate: string, to: Date): number {
  return daysPastDue(fromIsoDate, to)
}

function periodLabelFromStart(periodStart: string | null | undefined): string {
  if (!periodStart) return '—'
  const d = new Date(periodStart)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', { month: 'short', year: 'numeric' })
}

function monthKeyFromStart(periodStart: string): string {
  return periodStart.slice(0, 7)
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function statusName(b: any): string {
  return (unwrap(b.billing_status)?.billing_status_name ?? '').toLowerCase().trim()
}

function billStatusName(
  b: any,
  statusNameById?: Map<string, string>,
): string {
  const fromMap = b?.billing_status_id
    ? statusNameById?.get(b.billing_status_id)
    : undefined
  return (fromMap ?? statusName(b)).toLowerCase().trim()
}

function isFullyUnpaidBill(
  b: any,
  statusNameById?: Map<string, string>,
): boolean {
  return (
    billStatusName(b, statusNameById) === 'unpaid' &&
    Number(b.remaining_balance ?? 0) > 0
  )
}

function billDueDate(b: any): string | null {
  const period = unwrap(b.reading_periods) as {
    due_date?: string | null
    period_end?: string | null
  } | null
  const raw = period?.due_date || period?.period_end || null
  if (!raw) return null
  const ymd = String(raw).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null
}

function matchesGeoClass(
  b: any,
  filters: ClerkDashboardFilters,
): boolean {
  const ma = unwrap(b.meter_account) as any
  if (!ma) return false

  if (filters.classificationId) {
    const cls = unwrap(ma.classification)
    if (cls?.classification_id !== filters.classificationId) return false
  }

  const zone = unwrap(ma.zone) as any
  if (filters.zoneId && zone?.zone_id !== filters.zoneId) return false

  if (filters.barangayId) {
    const barangay = unwrap(zone?.barangay) as any
    if (barangay?.barangay_id !== filters.barangayId) return false
  }

  return true
}

/**
 * Consecutive fully-unpaid months only.
 * Partial and paid are treated as valid payment and stop the streak.
 */
function countArrearsMonths(
  accountBillings: any[],
  statusNameById: Map<string, string>,
): number {
  let months = 0
  let expectCarry = false
  for (const bill of accountBillings) {
    const status = billStatusName(bill, statusNameById)
    const remaining = Number(bill.remaining_balance ?? 0)
    const prev = Number(bill.previous_balance ?? 0)

    if (months === 0) {
      if (status === 'unpaid' && remaining > 0) {
        months = 1
        expectCarry = prev > 0
        continue
      }
      return 0
    }

    if (status === 'unpaid' && remaining > 0) {
      months += 1
      expectCarry = prev > 0
    } else if (expectCarry && (status === 'paid' || status === 'forwarded')) {
      months += 1
      expectCarry = prev > 0
    } else {
      // partial / paid (non-carry) / other — valid settlement, stop streak
      break
    }
  }
  return months
}

const BILLING_SELECT = `
  billing_id,
  meter_account_id,
  reading_period_id,
  billing_status_id,
  current_billing,
  total_billing,
  remaining_balance,
  previous_balance,
  created_at,
  consumption:consumption_id (
    consumption,
    billed_consumption
  ),
  reading_periods:reading_period_id (
    reading_period_id,
    period_start,
    period_end,
    due_date
  ),
  billing_status:billing_status_id ( billing_status_name ),
  meter_account:meter_account_id (
    meter_account_id,
    classification_id,
    classification:classification_id (
      classification_id,
      classification_name
    ),
    consumer:consumer_id ( account_name, contract_no ),
    zone:zone_id (
      zone_id,
      zone_name,
      barangay_id,
      barangay:barangay_id ( barangay_id, barangay_name )
    ),
    meters (
      meter_status_id,
      created_at,
      meter_status:meter_status_id ( meter_status_name )
    )
  )
`

// ============================================================================
// GET — Filter option lists
// ============================================================================

export async function getClerkDashboardFilterOptions(): Promise<{
  status: 'success' | 'error'
  data?: {
    readingPeriods: FilterOption[]
    barangays: FilterOption[]
    zones: FilterOption[]
    classifications: FilterOption[]
  }
  message?: string
}> {
  const supabase = await createClient()

  try {
    const [periodsRes, barangayRes, zoneRes, classRes] = await Promise.all([
      supabase
        .from('reading_periods')
        .select('reading_period_id, period_start')
        .order('period_start', { ascending: false })
        .limit(36),
      supabase
        .from('barangay')
        .select('barangay_id, barangay_name')
        .eq('is_active', true)
        .order('barangay_name'),
      supabase
        .from('zone')
        .select('zone_id, zone_name, barangay_id')
        .eq('is_active', true)
        .order('zone_name'),
      supabase
        .from('classifications')
        .select('classification_id, classification_name')
        .order('classification_name'),
    ])

    if (periodsRes.error) throw periodsRes.error
    if (barangayRes.error) throw barangayRes.error
    if (zoneRes.error) throw zoneRes.error
    if (classRes.error) throw classRes.error

    return {
      status: 'success',
      data: {
        readingPeriods: (periodsRes.data ?? []).map((p) => ({
          id: p.reading_period_id,
          name: periodLabelFromStart(p.period_start),
          periodStart: p.period_start as string,
        })),
        barangays: (barangayRes.data ?? []).map((b) => ({
          id: b.barangay_id,
          name: b.barangay_name,
        })),
        zones: (zoneRes.data ?? []).map((z) => ({
          id: z.zone_id,
          name: z.zone_name,
          barangayId: z.barangay_id,
        })),
        classifications: (classRes.data ?? []).map((c) => ({
          id: c.classification_id,
          name: c.classification_name,
        })),
      },
    }
  } catch (err) {
    console.error('[getClerkDashboardFilterOptions]', err)
    return { status: 'error', message: 'Failed to load filter options' }
  }
}

// ============================================================================
// GET — Full clerk dashboard payload
// ============================================================================

export async function getClerkDashboardData(
  filters: ClerkDashboardFilters = {},
): Promise<{
  status: 'success' | 'error'
  data?: ClerkDashboardData
  message?: string
}> {
  const supabase = await createClient()
  const asOf = new Date()

  try {
    const [
      { data: billings, error: billErr },
      { data: payments, error: payErr },
      { data: noticeRows, error: noticeErr },
      { data: statusRows, error: statusErr },
      filterOpts,
    ] = await Promise.all([
      supabase.from('billing').select(BILLING_SELECT),
      supabase.from('billing_payments').select('billing_id, amount_paid'),
      supabase.from('notice_meter_accounts').select('meter_account_id'),
      supabase.from('billing_status').select('billing_status_id, billing_status_name'),
      getClerkDashboardFilterOptions(),
    ])

    if (billErr) throw billErr
    if (payErr) throw payErr
    if (noticeErr) throw noticeErr
    if (statusErr) throw statusErr

    const allBillings = billings ?? []
    const collectedByBilling = new Map<string, number>()
    for (const p of payments ?? []) {
      collectedByBilling.set(
        p.billing_id,
        (collectedByBilling.get(p.billing_id) ?? 0) + (Number(p.amount_paid) || 0),
      )
    }

    const noticeSet = new Set(
      (noticeRows ?? []).map((n) => n.meter_account_id as string).filter(Boolean),
    )

    const statusNameById = new Map<string, string>()
    for (const s of statusRows ?? []) {
      statusNameById.set(
        s.billing_status_id,
        (s.billing_status_name ?? '').toLowerCase().trim(),
      )
    }

    const filterData = filterOpts.status === 'success' && filterOpts.data
      ? filterOpts.data
      : { readingPeriods: [], barangays: [], zones: [], classifications: [] }

    // Focus period = selected filter, else latest period that already has billings
    // (new empty reading periods with no meter-reading / billing records are skipped)
    let focusPeriodId = filters.readingPeriodId ?? null
    if (!focusPeriodId) {
      let latestStart = ''
      for (const b of allBillings) {
        const ps = unwrap(b.reading_periods)?.period_start as string | undefined
        if (ps && ps >= latestStart) {
          latestStart = ps
          focusPeriodId = b.reading_period_id
        }
      }
    }

    const focusPeriod = allBillings
      .map((b) => unwrap(b.reading_periods) as any)
      .find((p) => p?.reading_period_id === focusPeriodId)
    const periodLabel = periodLabelFromStart(focusPeriod?.period_start) || 'Current period'

    // Geo/class-filtered billings (all periods)
    const geoFiltered = allBillings.filter((b) => matchesGeoClass(b, filters))

    // Focus-period + geo/class for m³ KPI cards / period charts
    const focusBillings = geoFiltered.filter((b) => b.reading_period_id === focusPeriodId)

    // Money KPIs: when no reading-period filter is selected, include every
    // consumer billing row (all periods) — not only the current period.
    // When a period is selected, scope money KPIs to that period.
    const moneyBillings = filters.readingPeriodId ? focusBillings : geoFiltered

    // ── KPIs ──────────────────────────────────────────────────────────────
    let totalConsumption = 0
    let totalBilledConsumption = 0
    let totalBilledAmount = 0
    let totalCollected = 0
    let totalOutstanding = 0

    for (const b of focusBillings) {
      const wc = unwrap(b.consumption) as any
      totalConsumption += Number(wc?.consumption ?? 0)
      totalBilledConsumption += Number(wc?.billed_consumption ?? 0)
    }

    for (const b of moneyBillings) {
      // current_billing = this period's consumer charge (excludes carried
      // previous_balance, so summing across periods does not double-count)
      totalBilledAmount += Number(b.current_billing ?? 0)
      totalCollected += collectedByBilling.get(b.billing_id) ?? 0
      const st = statusName(b)
      const rem = Number(b.remaining_balance ?? 0)
      if ((st === 'unpaid' || st === 'partial') && rem > 0) {
        totalOutstanding += rem
      }
    }

    totalConsumption = round2(totalConsumption)
    totalBilledConsumption = round2(totalBilledConsumption)
    totalBilledAmount = round2(totalBilledAmount)
    totalCollected = round2(totalCollected)
    totalOutstanding = round2(totalOutstanding)

    const varianceM3 = round2(totalConsumption - totalBilledConsumption)
    const variancePct =
      totalConsumption === 0
        ? 0
        : round2((varianceM3 / totalConsumption) * 100)
    const collectionEfficiency =
      totalBilledAmount === 0
        ? 0
        : round2((totalCollected / totalBilledAmount) * 100)

    // ── Chart 1 & 4: last 12 periods with actual billing/reading records ───
    const periodMeta = new Map<string, { start: string; label: string }>()
    for (const b of allBillings) {
      const p = unwrap(b.reading_periods) as any
      if (!p?.period_start || !b.reading_period_id) continue
      if (!periodMeta.has(b.reading_period_id)) {
        periodMeta.set(b.reading_period_id, {
          start: p.period_start,
          label: periodLabelFromStart(p.period_start),
        })
      }
    }

    const focusStart = focusPeriod?.period_start
      ?? Array.from(periodMeta.values()).sort((a, b) => b.start.localeCompare(a.start))[0]?.start
      ?? ''

    const periodsAsc = Array.from(periodMeta.entries())
      .filter(([, m]) => !focusStart || m.start <= focusStart)
      .sort((a, b) => a[1].start.localeCompare(b[1].start))
      .slice(-12)

    const periodIdSet = new Set(periodsAsc.map(([id]) => id))

    const consumptionByPeriodMap = new Map<string, PeriodConsumptionRow>()
    const amountByPeriodMap = new Map<string, PeriodAmountRow>()
    for (const [id, meta] of periodsAsc) {
      consumptionByPeriodMap.set(id, {
        reading_period_id: id,
        monthKey: monthKeyFromStart(meta.start),
        month: meta.label,
        consumption: 0,
        billedConsumption: 0,
      })
      amountByPeriodMap.set(id, {
        reading_period_id: id,
        monthKey: monthKeyFromStart(meta.start),
        month: meta.label,
        billed: 0,
        collected: 0,
      })
    }

    for (const b of geoFiltered) {
      if (!periodIdSet.has(b.reading_period_id)) continue
      const wc = unwrap(b.consumption) as any
      const cRow = consumptionByPeriodMap.get(b.reading_period_id)
      if (cRow) {
        cRow.consumption = round2(cRow.consumption + Number(wc?.consumption ?? 0))
        cRow.billedConsumption = round2(
          cRow.billedConsumption + Number(wc?.billed_consumption ?? 0),
        )
      }
      const aRow = amountByPeriodMap.get(b.reading_period_id)
      if (aRow) {
        aRow.billed = round2(aRow.billed + Number(b.total_billing ?? 0))
        aRow.collected = round2(
          aRow.collected + (collectedByBilling.get(b.billing_id) ?? 0),
        )
      }
    }

    const consumptionByPeriod = periodsAsc.map(([id]) => consumptionByPeriodMap.get(id)!)
    const billedVsCollected = periodsAsc.map(([id]) => amountByPeriodMap.get(id)!)

    // ── Chart 2: by barangay / zone (focus period) ─────────────────────────
    const byBarangay = new Map<string, GeoConsumptionRow>()
    const byZone = new Map<string, GeoConsumptionRow>()
    for (const b of focusBillings) {
      const ma = unwrap(b.meter_account) as any
      const zone = unwrap(ma?.zone) as any
      const barangay = unwrap(zone?.barangay) as any
      const wc = unwrap(b.consumption) as any
      const cons = Number(wc?.consumption ?? 0)
      const billed = Number(wc?.billed_consumption ?? 0)

      const bId = barangay?.barangay_id ?? 'unknown'
      const bLabel = barangay?.barangay_name ?? '—'
      if (!byBarangay.has(bId)) {
        byBarangay.set(bId, { id: bId, label: bLabel, consumption: 0, billedConsumption: 0 })
      }
      const br = byBarangay.get(bId)!
      br.consumption = round2(br.consumption + cons)
      br.billedConsumption = round2(br.billedConsumption + billed)

      const zId = zone?.zone_id ?? 'unknown'
      const zLabel = zone?.zone_name ?? '—'
      if (!byZone.has(zId)) {
        byZone.set(zId, { id: zId, label: zLabel, consumption: 0, billedConsumption: 0 })
      }
      const zr = byZone.get(zId)!
      zr.consumption = round2(zr.consumption + cons)
      zr.billedConsumption = round2(zr.billedConsumption + billed)
    }

    const consumptionByBarangay = Array.from(byBarangay.values())
      .sort((a, b) => b.billedConsumption - a.billedConsumption)
    const consumptionByZone = Array.from(byZone.values())
      .sort((a, b) => b.billedConsumption - a.billedConsumption)

    // ── Chart 3: billing status (focus period) ─────────────────────────────
    const billingStatus: BillingStatusBreakdown = { paid: 0, partial: 0, unpaid: 0 }
    for (const b of focusBillings) {
      const st = statusName(b)
      if (st === 'paid') billingStatus.paid += 1
      else if (st === 'partial') billingStatus.partial += 1
      else if (st === 'unpaid') billingStatus.unpaid += 1
      // "forwarded" = balance carried to a newer bill; not counted as paid
    }

    // ── Chart 7: billed consumption by classification (focus period) ──────
    const byClass = new Map<string, number>()
    for (const b of focusBillings) {
      const ma = unwrap(b.meter_account) as any
      const cls = unwrap(ma?.classification) as any
      const name = cls?.classification_name ?? 'Unclassified'
      const wc = unwrap(b.consumption) as any
      byClass.set(name, (byClass.get(name) ?? 0) + Number(wc?.billed_consumption ?? 0))
    }
    const billedByClassification: ClassificationConsumptionRow[] = Array.from(byClass.entries())
      .map(([classification, billedConsumption]) => ({
        classification,
        billedConsumption: round2(billedConsumption),
      }))
      .sort((a, b) => b.billedConsumption - a.billedConsumption)

    // ── Unpaid accounts table + aging + zone outstanding ──────────────────
    // Group all billings by meter account for arrears / oldest unpaid
    const billingsByAccount = new Map<string, any[]>()
    for (const b of allBillings) {
      if (!b.meter_account_id) continue
      const arr = billingsByAccount.get(b.meter_account_id) ?? []
      arr.push(b)
      billingsByAccount.set(b.meter_account_id, arr)
    }
    for (const [, arr] of billingsByAccount) {
      arr.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
    }

    // Unpaid-days table: any meter account with at least one fully unpaid bill
    // (partial/paid excluded). Days counted from oldest unpaid due date (PH calendar).
    const unpaidAccounts: UnpaidAccountRow[] = []
    const agingCounts: Record<AgingBucket, number> = {
      '0': 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0,
    }
    const zoneOutstandingMap = new Map<string, ZoneOutstandingRow>()

    for (const [meterAccountId, accountBillings] of billingsByAccount) {
      const latest = accountBillings[0]
      if (!matchesGeoClass(latest, filters)) continue

      const unpaidBills = accountBillings.filter((b) =>
        isFullyUnpaidBill(b, statusNameById),
      )
      if (unpaidBills.length === 0) continue

      // Period filter: only include if that period's bill itself is fully unpaid
      let displayBill = unpaidBills[0]
      if (filters.readingPeriodId) {
        const periodUnpaid = unpaidBills.find(
          (b) => b.reading_period_id === filters.readingPeriodId,
        )
        if (!periodUnpaid) continue
        displayBill = periodUnpaid
      } else {
        // Newest unpaid bill for outstanding display
        displayBill = [...unpaidBills].sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )[0]
      }

      const openBills = [...unpaidBills].sort((a, b) => {
        const as = unwrap(a.reading_periods)?.period_start ?? ''
        const bs = unwrap(b.reading_periods)?.period_start ?? ''
        return String(as).localeCompare(String(bs))
      })

      const oldest = openBills[0] ?? displayBill
      const oldestPeriod = unwrap(oldest.reading_periods) as any
      const due = billDueDate(oldest)
      if (!due) continue

      const unpaidDays = daysPastDue(due, asOf)
      const bucket = agingBucket(unpaidDays)
      const monthsUnpaid = countArrearsMonths(accountBillings, statusNameById)
      const remaining = Number(displayBill.remaining_balance ?? 0)

      const ma = unwrap(displayBill.meter_account) as any
      const consumer = unwrap(ma?.consumer) as any
      const zone = unwrap(ma?.zone) as any
      const barangay = unwrap(zone?.barangay) as any
      const cls = unwrap(ma?.classification) as any

      const meters = Array.isArray(ma?.meters) ? ma.meters : ma?.meters ? [ma.meters] : []
      let latestMeter: any = meters[0]
      for (const m of meters) {
        const bt = latestMeter?.created_at ? new Date(latestMeter.created_at).getTime() : 0
        const mt = m?.created_at ? new Date(m.created_at).getTime() : 0
        if (mt >= bt) latestMeter = m
      }
      const meterStatus = (
        unwrap(latestMeter?.meter_status)?.meter_status_name ?? ''
      ).toLowerCase()
      const isDisconnected =
        meterStatus === 'disconnected' || meterStatus === 'inactive'

      unpaidAccounts.push({
        meter_account_id: meterAccountId,
        contract_no: formatContractNoDisplay(consumer?.contract_no),
        account_name: consumer?.account_name ?? 'Unknown',
        zone_name: zone?.zone_name ?? '—',
        barangay_name: barangay?.barangay_name ?? '—',
        classification_name: cls?.classification_name ?? '—',
        oldest_unpaid_period: periodLabelFromStart(oldestPeriod?.period_start),
        due_date: due,
        unpaid_days: unpaidDays,
        months_unpaid: monthsUnpaid,
        outstanding_balance: round2(remaining),
        aging_bucket: bucket,
        has_notice: noticeSet.has(meterAccountId),
        is_disconnected: isDisconnected,
      })

      agingCounts[bucket] += 1

      const zKey = `${barangay?.barangay_name ?? '—'}||${zone?.zone_name ?? '—'}`
      if (!zoneOutstandingMap.has(zKey)) {
        zoneOutstandingMap.set(zKey, {
          zone: zone?.zone_name ?? '—',
          barangay: barangay?.barangay_name ?? '—',
          label: zone?.zone_name ?? barangay?.barangay_name ?? '—',
          outstanding: 0,
        })
      }
      const zr = zoneOutstandingMap.get(zKey)!
      zr.outstanding = round2(zr.outstanding + remaining)
    }

    unpaidAccounts.sort(
      (a, b) =>
        b.unpaid_days - a.unpaid_days ||
        b.outstanding_balance - a.outstanding_balance,
    )

    const averageUnpaidDays =
      unpaidAccounts.length === 0
        ? 0
        : round2(
            unpaidAccounts.reduce((s, a) => s + a.unpaid_days, 0) /
              unpaidAccounts.length,
          )

    const agingDistribution: AgingDistributionRow[] = AGING_META.map((m) => ({
      bucket: m.bucket,
      label: m.label,
      count: agingCounts[m.bucket],
    }))

    const outstandingByZone = Array.from(zoneOutstandingMap.values())
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 10)

    return {
      status: 'success',
      data: {
        kpis: {
          totalConsumption,
          totalBilledConsumption,
          varianceM3,
          variancePct,
          totalBilledAmount,
          totalCollected,
          totalOutstanding,
          collectionEfficiency,
          unpaidAccounts: unpaidAccounts.length,
          averageUnpaidDays,
          periodLabel,
        },
        consumptionByPeriod,
        consumptionByBarangay,
        consumptionByZone,
        billingStatus,
        billedVsCollected,
        agingDistribution,
        outstandingByZone,
        billedByClassification,
        unpaidAccounts,
        filters: filterData,
        focusPeriodId,
      },
    }
  } catch (err) {
    console.error('[getClerkDashboardData]', err)
    return { status: 'error', message: 'Failed to load clerk dashboard' }
  }
}
