// lib/actions/dashboard/treasurer-dashboard.actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================================================
// Types
// ============================================================================

export interface TreasurerStats {
  /** Remaining on unpaid/partial current bills (latest per meter account). */
  needToCollectThisMonth: number
  /** Payments applied to those current meter-account bills. */
  collectedThisMonth: number
  /** Sum of total_billing on current bills (latest per meter account). */
  totalBillingAmount: number
  /** Meter accounts with unpaid/partial current bills. */
  outstandingAccounts: number
  /** Distinct meter accounts that paid against their current bill. */
  paidAccountsThisMonth: number
  /** Label from the latest current-bill reading period. */
  periodLabel: string
  readingPeriodId?: string | null
}

export interface CollectionExportRow {
  meter_account_id: string
  meter_serial_no: string | null
  contract_no: string | null
  consumer_name: string
  zone_name: string
  barangay_name: string
  amount: number
  remaining_balance?: number
  total_billing?: number
  billing_status?: string
  receipt_number?: string
  payment_date?: string
  period_label?: string
}

export interface MonthlyCollection {
  monthKey: string
  month: string
  /** Outstanding remaining on bills for that reading period. */
  needToCollect: number
  /** Payments applied to billings of that reading period. */
  collected: number
  /** Total billing (sum of total_billing) for that reading period. */
  overallTotal: number
}

export interface RecentPayment {
  receipt_id: string
  receipt_number: string
  payment_type: string
  amount: number
  payment_date: string
  recorded_by: string
  consumer_name: string
  meter_serial_no: string | null
}

function unwrap<T>(val: T | T[] | null | undefined): T | null {
  if (val == null) return null
  return Array.isArray(val) ? (val[0] ?? null) : val
}

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

function periodLabelFromStart(periodStart: string | null | undefined): string {
  if (!periodStart) return '—'
  const d = new Date(periodStart)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

/** Latest reading period that has at least one billing row. */
async function getFocusReadingPeriod(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: latestBilling } = await supabase
    .from('billing')
    .select('reading_period_id, reading_periods:reading_period_id ( period_start, period_end )')
    .not('reading_period_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestBilling?.reading_period_id) {
    const period = unwrap((latestBilling as any).reading_periods) as {
      period_start?: string
      period_end?: string
    } | null
    return {
      readingPeriodId: latestBilling.reading_period_id as string,
      periodStart: period?.period_start ?? null,
      periodLabel: periodLabelFromStart(period?.period_start),
    }
  }

  const { data: rp } = await supabase
    .from('reading_periods')
    .select('reading_period_id, period_start')
    .order('period_start', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!rp) return null
  return {
    readingPeriodId: rp.reading_period_id as string,
    periodStart: rp.period_start as string | null,
    periodLabel: periodLabelFromStart(rp.period_start),
  }
}

// ============================================================================
// Current billings (latest row per meter account)
// ============================================================================

async function getCurrentBillingRows(supabase: Awaited<ReturnType<typeof createClient>>) {
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
      total_billing,
      remaining_balance,
      created_at,
      reading_period_id,
      reading_periods:reading_period_id ( period_start, period_end, due_date ),
      billing_status:billing_status_id ( billing_status_name ),
      meter_account:meter_account_id (
        meter_account_id,
        meters ( meter_serial_no, created_at ),
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

// ============================================================================
// GET — Core treasurer stats from each meter account's latest (current) bill
// ============================================================================

export async function getTreasurerStats(): Promise<{
  status: 'success' | 'error'
  data?: TreasurerStats
  message?: string
}> {
  const supabase = await createClient()

  try {
    const currentBillings = await getCurrentBillingRows(supabase)

    let needToCollectThisMonth = 0
    let totalBillingAmount = 0
    let outstandingAccounts = 0
    const currentBillingIds: string[] = []
    let periodLabel = 'Current bills'
    let readingPeriodId: string | null = null

    // Prefer label from the most common / latest current-bill reading period
    let latestPeriodStart = ''
    for (const b of currentBillings) {
      currentBillingIds.push(b.billing_id)
      totalBillingAmount += Number(b.total_billing) || 0

      const status = unwrap(b.billing_status)?.billing_status_name?.toLowerCase() ?? ''
      const remaining = Number(b.remaining_balance) || 0
      if ((status === 'unpaid' || status === 'partial') && remaining > 0) {
        needToCollectThisMonth += remaining
        outstandingAccounts += 1
      }

      const period = unwrap(b.reading_periods) as { period_start?: string } | null
      const ps = period?.period_start ?? ''
      if (ps && ps >= latestPeriodStart) {
        latestPeriodStart = ps
        readingPeriodId = b.reading_period_id ?? null
        periodLabel = periodLabelFromStart(ps)
      }
    }

    let collectedThisMonth = 0
    const paidAccounts = new Set<string>()

    if (currentBillingIds.length) {
      const { data: billingPayments, error: payErr } = await supabase
        .from('billing_payments')
        .select('amount_paid, billing_id')
        .in('billing_id', currentBillingIds)

      if (payErr) throw payErr

      const accountByBilling = new Map(
        currentBillings.map((b) => [b.billing_id, b.meter_account_id]),
      )

      for (const p of billingPayments ?? []) {
        collectedThisMonth += Number(p.amount_paid) || 0
        const maId = accountByBilling.get(p.billing_id)
        if (maId) paidAccounts.add(maId)
      }
    }

    return {
      status: 'success',
      data: {
        needToCollectThisMonth: Math.round(needToCollectThisMonth * 100) / 100,
        collectedThisMonth: Math.round(collectedThisMonth * 100) / 100,
        totalBillingAmount: Math.round(totalBillingAmount * 100) / 100,
        outstandingAccounts,
        paidAccountsThisMonth: paidAccounts.size,
        periodLabel,
        readingPeriodId,
      },
    }
  } catch (err) {
    console.error('getTreasurerStats:', err)
    return { status: 'error', message: 'Failed to load treasurer stats' }
  }
}

// ============================================================================
// GET — Export rows from current meter-account bills (outstanding OR collected)
// ============================================================================

export async function getTreasurerCollectionExport(
  kind: 'outstanding' | 'collected',
): Promise<{
  status: 'success' | 'error'
  data?: CollectionExportRow[]
  message?: string
  periodLabel?: string
}> {
  const supabase = await createClient()

  try {
    const currentBillings = await getCurrentBillingRows(supabase)
    let periodLabel = 'Current bills'
    let latestPeriodStart = ''
    for (const b of currentBillings) {
      const period = unwrap(b.reading_periods) as { period_start?: string } | null
      const ps = period?.period_start ?? ''
      if (ps && ps >= latestPeriodStart) {
        latestPeriodStart = ps
        periodLabel = periodLabelFromStart(ps)
      }
    }

    if (kind === 'outstanding') {
      const rows: CollectionExportRow[] = []
      for (const b of currentBillings) {
        const status = unwrap(b.billing_status)?.billing_status_name?.toLowerCase() ?? ''
        const remaining = Number(b.remaining_balance) || 0
        if (!(status === 'unpaid' || status === 'partial') || remaining <= 0) continue

        const ma = unwrap(b.meter_account)
        const consumer = unwrap(ma?.consumer)
        const zone = unwrap(ma?.zone)
        const barangay = unwrap(zone?.barangay)
        const period = unwrap(b.reading_periods)

        rows.push({
          meter_account_id: ma?.meter_account_id ?? b.meter_account_id,
          meter_serial_no: latestMeterSerialFromMeters(ma?.meters),
          contract_no: consumer?.contract_no ?? null,
          consumer_name: consumer?.account_name ?? '—',
          zone_name: zone?.zone_name ?? '—',
          barangay_name: barangay?.barangay_name ?? '—',
          amount: remaining,
          remaining_balance: remaining,
          total_billing: Number(b.total_billing) || 0,
          billing_status: unwrap(b.billing_status)?.billing_status_name ?? status,
          period_label: periodLabelFromStart(period?.period_start) || periodLabel,
        })
      }

      rows.sort((a, b) => a.consumer_name.localeCompare(b.consumer_name))
      return { status: 'success', data: rows, periodLabel }
    }

    // Collected against current (latest) meter-account bills only
    const currentIds = new Set(currentBillings.map((b) => b.billing_id))
    const { data: billingPayments, error: payErr } = await supabase
      .from('billing_payments')
      .select(`
        billing_payment_id,
        amount_paid,
        billing_id,
        payment:payment_id ( payment_date, receipt_number ),
        billing:billing_id (
          remaining_balance,
          total_billing,
          reading_periods:reading_period_id ( period_start ),
          billing_status:billing_status_id ( billing_status_name ),
          meter_account:meter_account_id (
            meter_account_id,
            meters ( meter_serial_no, created_at ),
            consumer:consumer_id ( account_name, contract_no ),
            zone:zone_id (
              zone_name,
              barangay:barangay_id ( barangay_name )
            )
          )
        )
      `)
      .in('billing_id', Array.from(currentIds))
      .order('created_at', { ascending: false })

    if (payErr) throw payErr

    const rows: CollectionExportRow[] = []
    for (const p of billingPayments ?? []) {
      if (!currentIds.has(p.billing_id)) continue

      const billing = unwrap((p as any).billing)
      const payment = unwrap((p as any).payment)
      const payDate = (payment?.payment_date as string | undefined)?.slice(0, 10) ?? null
      const ma = unwrap(billing?.meter_account)
      const consumer = unwrap(ma?.consumer)
      const zone = unwrap(ma?.zone)
      const barangay = unwrap(zone?.barangay)
      const period = unwrap(billing?.reading_periods)

      rows.push({
        meter_account_id: ma?.meter_account_id ?? '',
        meter_serial_no: latestMeterSerialFromMeters(ma?.meters),
        contract_no: consumer?.contract_no ?? null,
        consumer_name: consumer?.account_name ?? '—',
        zone_name: zone?.zone_name ?? '—',
        barangay_name: barangay?.barangay_name ?? '—',
        amount: Number(p.amount_paid) || 0,
        remaining_balance: Number(billing?.remaining_balance) || 0,
        total_billing: Number(billing?.total_billing) || 0,
        billing_status: unwrap(billing?.billing_status)?.billing_status_name ?? '',
        receipt_number: payment?.receipt_number ?? '',
        payment_date: payDate ?? undefined,
        period_label: periodLabelFromStart(period?.period_start) || periodLabel,
      })
    }

    rows.sort((a, b) => {
      const d = (b.payment_date ?? '').localeCompare(a.payment_date ?? '')
      if (d !== 0) return d
      return a.consumer_name.localeCompare(b.consumer_name)
    })

    return { status: 'success', data: rows, periodLabel }
  } catch (err) {
    console.error('getTreasurerCollectionExport:', err)
    return { status: 'error', message: 'Failed to load collection export data' }
  }
}

// ============================================================================
// GET — Chart by reading period: collected vs not collected (max 5 periods)
// ============================================================================

export async function getMonthlyCollections(opts?: {
  /** Max months to return (default 5). */
  limit?: number
  /** Inclusive end month `YYYY-MM`. Defaults to latest reading-period month. */
  endMonth?: string | null
}): Promise<{
  status: 'success' | 'error'
  data?: MonthlyCollection[]
  message?: string
  firstMonth?: string | null
  lastMonth?: string | null
  totals?: {
    needToCollect: number
    collected: number
    overallTotal: number
  }
}> {
  const supabase = await createClient()
  const limit = Math.min(Math.max(opts?.limit ?? 5, 1), 5)

  try {
    const [{ data: billings, error: billErr }, { data: billingPayments, error: payErr }] =
      await Promise.all([
        supabase
          .from('billing')
          .select(`
            billing_id,
            remaining_balance,
            total_billing,
            reading_period_id,
            reading_periods:reading_period_id ( period_start ),
            billing_status:billing_status_id ( billing_status_name )
          `),
        supabase
          .from('billing_payments')
          .select(`
            amount_paid,
            billing_id,
            billing:billing_id (
              reading_period_id,
              reading_periods:reading_period_id ( period_start )
            )
          `),
      ])

    if (billErr) throw billErr
    if (payErr) throw payErr

    const periodKeyByBillingId = new Map<string, string>()
    const needByMonth: Record<string, number> = {}
    const collectedByMonth: Record<string, number> = {}
    const totalBillingByMonth: Record<string, number> = {}

    for (const b of billings ?? []) {
      const periodStart = unwrap((b as any).reading_periods)?.period_start as string | undefined
      const key = periodStart?.slice(0, 7)
      if (!key || !b.billing_id) continue
      periodKeyByBillingId.set(b.billing_id, key)

      totalBillingByMonth[key] =
        (totalBillingByMonth[key] ?? 0) + (Number(b.total_billing) || 0)

      const status = unwrap((b as any).billing_status)?.billing_status_name?.toLowerCase() ?? ''
      const remaining = Number(b.remaining_balance) || 0
      if ((status === 'unpaid' || status === 'partial') && remaining > 0) {
        needByMonth[key] = (needByMonth[key] ?? 0) + remaining
      }
    }

    for (const r of billingPayments ?? []) {
      const billing = unwrap((r as any).billing)
      const fromJoin = unwrap(billing?.reading_periods)?.period_start as string | undefined
      const key =
        fromJoin?.slice(0, 7) ||
        (r.billing_id ? periodKeyByBillingId.get(r.billing_id) : undefined)
      if (!key) continue
      collectedByMonth[key] = (collectedByMonth[key] ?? 0) + (Number(r.amount_paid) || 0)
    }

    const allKeys = Array.from(
      new Set([
        ...Object.keys(collectedByMonth),
        ...Object.keys(needByMonth),
        ...Object.keys(totalBillingByMonth),
      ]),
    ).sort()

    if (allKeys.length === 0) {
      return {
        status: 'success',
        data: [],
        firstMonth: null,
        lastMonth: null,
        totals: { needToCollect: 0, collected: 0, overallTotal: 0 },
      }
    }

    const firstMonth = allKeys[0]
    const lastAvailable = allKeys[allKeys.length - 1]
    const endMonth =
      opts?.endMonth && /^\d{4}-\d{2}$/.test(opts.endMonth)
        ? opts.endMonth
        : lastAvailable

    const contiguous: string[] = []
    {
      let [y, m] = firstMonth.split('-').map(Number)
      const [ey, em] = endMonth.split('-').map(Number)
      if (ey < y || (ey === y && em < m)) {
        return {
          status: 'success',
          data: [],
          firstMonth,
          lastMonth: lastAvailable,
          totals: {
            needToCollect: Math.round((needByMonth[lastAvailable] ?? 0) * 100) / 100,
            collected: 0,
            overallTotal: Math.round((totalBillingByMonth[lastAvailable] ?? 0) * 100) / 100,
          },
        }
      }
      while (y < ey || (y === ey && m <= em)) {
        contiguous.push(`${y}-${String(m).padStart(2, '0')}`)
        m += 1
        if (m > 12) {
          m = 1
          y += 1
        }
        if (contiguous.length > 120) break
      }
    }

    const windowKeys = contiguous.slice(-limit)

    let windowCollected = 0
    let windowNeed = 0
    const result: MonthlyCollection[] = windowKeys.map((key) => {
      const collected = Math.round((collectedByMonth[key] ?? 0) * 100) / 100
      const needToCollect = Math.round((needByMonth[key] ?? 0) * 100) / 100
      const overallTotal = Math.round((totalBillingByMonth[key] ?? 0) * 100) / 100
      windowCollected += collected
      windowNeed += needToCollect
      const [y, m] = key.split('-').map(Number)
      return {
        monthKey: key,
        month: new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' }),
        needToCollect,
        collected,
        overallTotal,
      }
    })

    const focus = await getFocusReadingPeriod(supabase)
    const focusKey = focus?.periodStart?.slice(0, 7)
    const focusNeed = focusKey
      ? Math.round((needByMonth[focusKey] ?? 0) * 100) / 100
      : Math.round(windowNeed * 100) / 100
    const focusCollected = focusKey
      ? Math.round((collectedByMonth[focusKey] ?? 0) * 100) / 100
      : Math.round(windowCollected * 100) / 100
    const focusTotalBilling = focusKey
      ? Math.round((totalBillingByMonth[focusKey] ?? 0) * 100) / 100
      : Math.round(
          result.reduce((a, r) => a + r.overallTotal, 0) * 100,
        ) / 100

    return {
      status: 'success',
      data: result,
      firstMonth,
      lastMonth: lastAvailable,
      totals: {
        needToCollect: focusNeed,
        collected: focusCollected,
        overallTotal: focusTotalBilling,
      },
    }
  } catch (err) {
    console.error('getMonthlyCollections:', err)
    return { status: 'error', message: 'Failed to load monthly collections' }
  }
}

// ============================================================================
// GET — Recent billing payments
// ============================================================================

export async function getRecentPayments(limit = 5): Promise<{
  status: 'success' | 'error'
  data?: RecentPayment[]
  message?: string
}> {
  const supabase = await createClient()

  try {
    const { data: billingRows, error } = await supabase
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
          meter_account:meter_account_id (
            meters ( meter_serial_no, created_at ),
            consumer:consumer_id ( account_name )
          )
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit * 3)

    if (error) throw error

    const userIds = (billingRows ?? [])
      .map((row: any) => unwrap(row.payment)?.recieved_by)
      .filter(Boolean) as string[]

    let userNames: Record<string, string> = {}
    if (userIds.length) {
      const { data: users } = await supabase
        .from('users')
        .select('user_id, first_name, last_name')
        .in('user_id', userIds)
      userNames = (users ?? []).reduce((acc, user) => {
        acc[user.user_id] = `${user.first_name} ${user.last_name}`
        return acc
      }, {} as Record<string, string>)
    }

    const results: RecentPayment[] = (billingRows ?? []).map((row: any) => {
      const payment = unwrap(row.payment)
      const billing = unwrap(row.billing)
      const meterAccount = unwrap(billing?.meter_account)
      const consumer = unwrap(meterAccount?.consumer)
      const userId = payment?.recieved_by as string | undefined

      return {
        receipt_id: row.billing_payment_id,
        receipt_number: payment?.receipt_number ?? '—',
        payment_type: 'billing',
        amount: Number(row.amount_paid) || 0,
        payment_date: payment?.payment_date ?? row.created_at?.slice(0, 10) ?? '',
        recorded_by: userId && userNames[userId] ? userNames[userId] : 'Cashier',
        consumer_name: consumer?.account_name ?? '—',
        meter_serial_no: latestMeterSerialFromMeters(meterAccount?.meters),
      }
    })

    results.sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime())
    return { status: 'success', data: results.slice(0, limit) }
  } catch (err) {
    console.error('getRecentPayments:', err)
    return { status: 'error', message: 'Failed to load recent payments' }
  }
}
