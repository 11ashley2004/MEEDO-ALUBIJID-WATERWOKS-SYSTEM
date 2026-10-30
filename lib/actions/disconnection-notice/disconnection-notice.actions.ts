'use server'

import { createClient } from '@/lib/supabase/server'
import { createAuditLog } from '../audit.action'

// ============================================================================
// Types
// ============================================================================

export interface DisconnectionRule {
  rule_id: string
  min_balance: number
  min_unpaid_months: number
  created_at: string
}

export interface EligibleMeterAccount {
  meter_account_id: string
  meter_serial_no: string | null
  consumer_name: string
  zone_name: string
  barangay_id: string
  barangay_name: string
  outstanding_balance: number
  unpaid_months: number
  billing_id: string
}

export interface NoticeOfDisconnection {
  notice_id: string
  notice_no: string
  rule_id: string | null
  reading_period_id: string | null
  generated_by: string | null
  total_accounts: number
  generated_at: string
  generated_by_name?: string
  rule?: DisconnectionRule | null
  status?: string
  period_start?: string
  period_end?: string
  due_date?: string
}

export interface NoticeMeterAccount {
  notice_meter_account_id: string
  notice_id: string
  meter_account_id: string
  billing_id: string
  balance_snapshot: number | null
  months_unpaid: number | null
  created_at: string
  meter_serial_no?: string | null
  consumer_name?: string
  zone_name?: string
  barangay_name?: string
  classification_name?: string
  // REMOVED: meter_type
  billing_status?: string
}

export interface ReadingPeriodOption {
  reading_period_id: string
  period_start: string
  period_end: string
  due_date: string
  label: string
}

// ============================================================================
// Helper

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

function unwrap<T>(val: T | T[] | null | undefined): T | null {
  if (!val) return null
  return Array.isArray(val) ? (val[0] ?? null) : val
}

// ============================================================================
// GET — Current reading period (latest from billing)
// ============================================================================

export async function getCurrentReadingPeriod(): Promise<{
  status: 'success' | 'error'
  data?: ReadingPeriodOption | null
  message?: string
}> {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from('billing')
      .select(`
        reading_period_id,
        reading_periods:reading_period_id (
          period_start,
          period_end,
          due_date
        )
      `)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    if (!data?.reading_period_id) return { status: 'success', data: null }

    const periodData = unwrap(data.reading_periods)
    if (!periodData) return { status: 'success', data: null }

    return {
      status: 'success',
      data: {
        reading_period_id: data.reading_period_id,
        period_start: periodData.period_start,
        period_end: periodData.period_end,
        due_date: periodData.due_date,
        label: new Date(periodData.period_start).toLocaleDateString('en-US', {
          month: 'long',
          year: 'numeric',
        }),
      }
    }
  } catch (error) {
    console.error('Error fetching current reading period:', error)
    return { status: 'error', message: 'Failed to fetch current reading period' }
  }
}

// ============================================================================
// GET — All reading periods (for dropdown)
// ============================================================================

export async function getAllReadingPeriodsForDisconnection(): Promise<{
  status: 'success' | 'error'
  data?: ReadingPeriodOption[]
  message?: string
}> {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from('reading_periods')
      .select('reading_period_id, period_start, period_end, due_date')
      .order('period_start', { ascending: false })

    if (error) throw error

    const mapped = (data || []).map((period: any) => ({
      reading_period_id: period.reading_period_id,
      period_start: period.period_start,
      period_end: period.period_end,
      due_date: period.due_date,
      label: new Date(period.period_start).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      }),
    }))

    return { status: 'success', data: mapped }
  } catch (error) {
    console.error('Error fetching reading periods:', error)
    return { status: 'error', message: 'Failed to fetch reading periods' }
  }
}

// ============================================================================
// GET — Existing notice for a reading period (if any)
// ============================================================================

export async function getNoticeByReadingPeriod(readingPeriodId: string): Promise<{
  status: 'success' | 'error'
  data?: NoticeOfDisconnection | null
  message?: string
}> {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from('notice_of_disconnection')
      .select(`
        notice_id,
        notice_no,
        rule_id,
        reading_period_id,
        generated_by,
        total_accounts,
        generated_at,
        rule:rule_id ( rule_id, min_balance, min_unpaid_months, created_at ),
        generator:generated_by ( first_name, last_name ),
        reading_period:reading_period_id (
          period_start,
          period_end,
          due_date
        )
      `)
      .eq('reading_period_id', readingPeriodId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    if (!data) return { status: 'success', data: null }

    const generator = unwrap(data.generator)
    const rule = unwrap(data.rule)
    const periodData = unwrap(data.reading_period)

    return {
      status: 'success',
      data: {
        notice_id: data.notice_id,
        notice_no: data.notice_no,
        rule_id: data.rule_id,
        reading_period_id: data.reading_period_id,
        generated_by: data.generated_by,
        total_accounts: data.total_accounts,
        generated_at: data.generated_at,
        generated_by_name: generator
          ? `${generator.first_name} ${generator.last_name}`
          : 'System',
        rule: rule ?? null,
        period_start: periodData?.period_start || '',
        period_end: periodData?.period_end || '',
        due_date: periodData?.due_date || '',
      },
    }
  } catch (error) {
    console.error('Error fetching notice by reading period:', error)
    return { status: 'error', message: 'Failed to fetch notice for this reading period' }
  }
}

// ============================================================================
// GET — meter_account_ids already in a notice (to exclude from eligible list)
// ============================================================================

export async function getMeterAccountIdsInNotice(noticeId: string): Promise<string[]> {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from('notice_meter_accounts')
      .select('meter_account_id')
      .eq('notice_id', noticeId)

    if (error) throw error
    return (data ?? []).map((r: any) => r.meter_account_id)
  } catch {
    return []
  }
}

// ============================================================================
// GET — Disconnection rule (single rule)
// ============================================================================

export async function getDisconnectionRule(): Promise<{
  status: 'success' | 'error'
  data?: DisconnectionRule | null
  message?: string
}> {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from('disconnection_rules')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return { status: 'success', data }
  } catch (error) {
    console.error('Error fetching disconnection rule:', error)
    return { status: 'error', message: 'Failed to fetch disconnection rule' }
  }
}

// ============================================================================
// GET — Eligible meter accounts for disconnection notice
// Now uses meter_status to determine active/connected accounts
// ============================================================================


export async function getEligibleMeterAccounts(options?: {
  excludeMeterAccountIds?: string[]
  readingPeriodId?: string // kept for backward compatibility, no longer used for filtering
}): Promise<{
  status: 'success' | 'error'
  data?: EligibleMeterAccount[]
  rule?: DisconnectionRule | null
  message?: string
}> {
  const supabase = await createClient()

  try {
    // ── 1. Get rule ───────────────────────────────────────────────────────
    const { data: rule, error: ruleError } = await supabase
      .from('disconnection_rules')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (ruleError) throw ruleError
    if (!rule) return { status: 'success', data: [], rule: null }

    // ── 2. Get eligible meter status IDs ──────────────────────────────────
    // Active + Defective + Stolen + Waterleak_After_Meter
    // (excluded: Pending, Disconnected, Removed, Replacing)
    const ELIGIBLE_METER_STATUSES = [
      'Active',
      'Defective',
      'Stolen',
      'Waterleak_After_Meter',
    ]

    const { data: eligibleStatuses, error: statusError } = await supabase
      .from('meter_status')
      .select('meter_status_id')
      .in('meter_status_name', ELIGIBLE_METER_STATUSES)

    if (statusError) throw statusError

    const eligibleStatusIds = (eligibleStatuses ?? []).map((s: any) => s.meter_status_id)

    if (eligibleStatusIds.length === 0) {
      return { status: 'success', data: [], rule }
    }

    // ── 3. Get meter accounts whose meter has an eligible status ──────────
    const { data: meters, error: meterError } = await supabase
      .from('meters')
      .select(`
        meter_account_id,
        meter_serial_no,
        meter_accounts:meter_account_id (
          meter_account_id,
          consumer:consumer_id ( account_name ),
          zone:zone_id (
            zone_id,
            zone_name,
            barangay:barangay_id ( barangay_id, barangay_name )
          )
        )
      `)
      .in('meter_status_id', eligibleStatusIds)

    if (meterError) throw meterError
    if (!meters || meters.length === 0) return { status: 'success', data: [], rule }

    const meterAccountIds = Array.from(
      new Set(meters.map((m: any) => m.meter_account_id).filter(Boolean))
    ) as string[]

    if (meterAccountIds.length === 0) return { status: 'success', data: [], rule }

    // ── 4. Billing statuses (needed for arrears-month walk with carry-over) ─
    const { data: statusRows } = await supabase
      .from('billing_status')
      .select('billing_status_id, billing_status_name')

    const statusNameById = new Map<string, string>(
      (statusRows ?? []).map((s) => [
        s.billing_status_id,
        String(s.billing_status_name ?? '').toLowerCase(),
      ]),
    )

    // ── 5. Get billing records for ALL active accounts ────────────────────
    const { data: billings, error: billError } = await supabase
      .from('billing')
      .select(`
        billing_id,
        meter_account_id,
        remaining_balance,
        previous_balance,
        created_at,
        billing_status_id,
        reading_period_id
      `)
      .in('meter_account_id', meterAccountIds)

    if (billError) throw billError

    // ── 6. Group by meter_account_id, sort DESC by created_at ─────────────
    const billingsByMeterAccount: Record<string, any[]> = {}
    for (const b of billings || []) {
      const mid = b.meter_account_id
      if (!billingsByMeterAccount[mid]) billingsByMeterAccount[mid] = []
      billingsByMeterAccount[mid].push(b)
    }

    for (const mid of Object.keys(billingsByMeterAccount)) {
      billingsByMeterAccount[mid].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    }

    const countArrearsMonths = (accountBillings: any[]): number => {
      let months = 0
      let expectCarry = false
      for (const bill of accountBillings) {
        const status = statusNameById.get(bill.billing_status_id) ?? ''
        const remaining = Number(bill.remaining_balance ?? 0)
        const prev = Number(bill.previous_balance ?? 0)

        if (months === 0) {
          if ((status === 'unpaid' || status === 'partial') && remaining > 0) {
            months = 1
            expectCarry = prev > 0
            continue
          }
          return 0
        }

        if (status === 'unpaid' || status === 'partial') {
          months += 1
          expectCarry = prev > 0
        } else if (expectCarry && (status === 'paid' || status === 'forwarded')) {
          months += 1
          expectCarry = prev > 0
        } else {
          break
        }
      }
      return months
    }

    // ── 7. Build exclusion set (accounts already in the current notice) ───
    const excludeSet = new Set(options?.excludeMeterAccountIds ?? [])

    // ── 8. Compute per-account metrics ────────────────────────────────────
    const eligible: EligibleMeterAccount[] = []

    const meterMap = new Map<string, any>()
    for (const m of meters) {
      const ma = unwrap((m as any).meter_accounts)
      if (ma) {
        meterMap.set((m as any).meter_account_id, {
          ...ma,
          meter_serial_no: (m as any).meter_serial_no ?? null,
        })
      }
    }

    for (const meterAccountId of meterAccountIds) {
      if (excludeSet.has(meterAccountId)) continue

      const ma = meterMap.get(meterAccountId)
      if (!ma) continue

      const consumer = unwrap(ma.consumer) as any
      const zone = unwrap(ma.zone) as any
      const barangay = unwrap(zone?.barangay) as any

      const accountBillings = billingsByMeterAccount[meterAccountId] || []
      if (accountBillings.length === 0) continue

      // Latest billing (its remaining_balance already includes carried-over balance)
      const latestBilling = accountBillings[0]
      const outstandingBalance = Number(latestBilling.remaining_balance ?? 0)
      const latestStatus = statusNameById.get(latestBilling.billing_status_id) ?? ''
      if (
        !(latestStatus === 'unpaid' || latestStatus === 'partial') ||
        outstandingBalance <= 0
      ) {
        continue
      }

      // Carry-over closes prior bills as paid — count those in the arrears streak
      const unpaidMonths = countArrearsMonths(accountBillings)

      const minBalance = Number(rule.min_balance ?? 0)
      const minMonths = Number(rule.min_unpaid_months ?? 0)
      const meetsBalance = minBalance > 0 && outstandingBalance >= minBalance
      const meetsMonths = minMonths > 0 && unpaidMonths >= minMonths

      // Either threshold is enough (balance OR unpaid months)
      if (!meetsBalance && !meetsMonths) continue

      eligible.push({
        meter_account_id: meterAccountId,
        meter_serial_no: ma.meter_serial_no || '',
        consumer_name: consumer?.account_name || 'Unknown Consumer',
        zone_name: zone?.zone_name ?? '',
        barangay_id: barangay?.barangay_id ?? '',
        barangay_name: barangay?.barangay_name ?? '',
        outstanding_balance: outstandingBalance,
        unpaid_months: unpaidMonths,
        billing_id: latestBilling.billing_id,
      })
    }

    // ── 9. Sort alphabetically by consumer name ───────────────────────────
    eligible.sort((a, b) => a.consumer_name.localeCompare(b.consumer_name))

    return { status: 'success', data: eligible, rule }
  } catch (error) {
    console.error('Error fetching eligible meter accounts:', error)
    return { status: 'error', message: 'Failed to fetch eligible meter accounts' }
  }
}

// ============================================================================
// GET — All notices of disconnection (list page)
// ============================================================================

export async function getNoticesOfDisconnection(): Promise<{
  status: 'success' | 'error'
  data?: NoticeOfDisconnection[]
  message?: string
}> {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('notice_of_disconnection')
      .select(`
        notice_id,
        notice_no,
        rule_id,
        reading_period_id,
        generated_by,
        total_accounts,
        generated_at,
        rule:rule_id ( rule_id, min_balance, min_unpaid_months, created_at ),
        generator:generated_by ( first_name, last_name ),
        reading_period:reading_period_id (
          period_start,
          period_end,
          due_date
        )
      `)
      .order('generated_at', { ascending: false })

    if (error) throw error

    const mapped = (data || []).map((n: any) => {
      const generator = unwrap(n.generator)
      const rule = unwrap(n.rule)
      const periodData = unwrap(n.reading_period)
      return {
        notice_id: n.notice_id,
        notice_no: n.notice_no,
        rule_id: n.rule_id,
        reading_period_id: n.reading_period_id,
        generated_by: n.generated_by,
        total_accounts: n.total_accounts,
        generated_at: n.generated_at,
        generated_by_name: generator
          ? `${generator.first_name} ${generator.last_name}`
          : 'System',
        rule: rule ?? null,
        period_start: periodData?.period_start || '',
        period_end: periodData?.period_end || '',
        due_date: periodData?.due_date || '',
      }
    })

    return { status: 'success', data: mapped }
  } catch (error) {
    console.error('Error fetching notices:', error)
    return { status: 'error', message: 'Failed to fetch notices of disconnection' }
  }
}

// ============================================================================
// GET — Single notice + its meter accounts (view page)
// ============================================================================

export async function getNoticeById(noticeId: string): Promise<{
  status: 'success' | 'error'
  data?: {
    notice: NoticeOfDisconnection
    connections: NoticeMeterAccount[]
  }
  message?: string
}> {
  const supabase = await createClient()

  try {
    const { data: noticeRaw, error: noticeError } = await supabase
      .from('notice_of_disconnection')
      .select(`
        notice_id,
        notice_no,
        rule_id,
        reading_period_id,
        generated_by,
        total_accounts,
        generated_at,
        rule:rule_id ( rule_id, min_balance, min_unpaid_months, created_at ),
        generator:generated_by ( first_name, last_name ),
        reading_period:reading_period_id (
          period_start,
          period_end,
          due_date
        )
      `)
      .eq('notice_id', noticeId)
      .single()

    if (noticeError) throw noticeError

    const generator = unwrap(noticeRaw.generator)
    const rule = unwrap(noticeRaw.rule)
    const periodData = unwrap(noticeRaw.reading_period)

    const notice: NoticeOfDisconnection = {
      notice_id: noticeRaw.notice_id,
      notice_no: noticeRaw.notice_no,
      rule_id: noticeRaw.rule_id,
      reading_period_id: noticeRaw.reading_period_id,
      generated_by: noticeRaw.generated_by,
      total_accounts: noticeRaw.total_accounts,
      generated_at: noticeRaw.generated_at,
      generated_by_name: generator
        ? `${generator.first_name} ${generator.last_name}`
        : 'System',
      rule: rule ?? null,
      period_start: periodData?.period_start || '',
      period_end: periodData?.period_end || '',
      due_date: periodData?.due_date || '',
    }

    const { data: scRaw, error: scError } = await supabase
      .from('notice_meter_accounts')
      .select(`
        notice_meter_account_id,
        notice_id,
        meter_account_id,
        billing_id,
        balance_snapshot,
        months_unpaid,
        created_at,
        meter_account:meter_account_id (
          consumer:consumer_id ( account_name ),
          zone:zone_id (
            zone_name,
            barangay:barangay_id ( barangay_name )
          ),
          classification:classification_id ( classification_name )
        ),
        billing:billing_id (
          billing_status:billing_status_id (
            billing_status_name
          )
        )
      `)
      .eq('notice_id', noticeId)
      .order('account_name', { referencedTable: 'meter_account.consumer', ascending: true })

    if (scError) throw scError

    const connections: NoticeMeterAccount[] = (scRaw || []).map((sc: any) => {
      const ma = unwrap(sc.meter_account)
      const consumer = unwrap(ma?.consumer)
      const zone = unwrap(ma?.zone)
      const barangay = unwrap(zone?.barangay)
      const classification = unwrap(ma?.classification)
      const billing = unwrap(sc.billing)
      const billingStatus = unwrap(billing?.billing_status)

      const consumerName = consumer?.account_name || 'Unknown Consumer'

      return {
        notice_meter_account_id: sc.notice_meter_account_id,
        notice_id: sc.notice_id,
        meter_account_id: sc.meter_account_id,
        billing_id: sc.billing_id,
        balance_snapshot: sc.balance_snapshot,
        months_unpaid: sc.months_unpaid,
        created_at: sc.created_at,
        meter_serial_no: ma?.meter_serial_no ?? '',
        consumer_name: consumerName,
        zone_name: zone?.zone_name ?? '',
        barangay_name: barangay?.barangay_name ?? '',
        classification_name: classification?.classification_name ?? '',
        billing_status: billingStatus?.billing_status_name ?? 'unknown',
      }
    })

    // Fallback safety net in case the referencedTable order isn't honored by PostgREST
    connections.sort((a, b) => (a.consumer_name ?? '').localeCompare(b.consumer_name ?? ''))

    return { status: 'success', data: { notice, connections } }
  } catch (error) {
    console.error('Error fetching notice by id:', error)
    return { status: 'error', message: 'Failed to fetch notice details' }
  }
}

// ============================================================================
// CREATE — Notice of Disconnection
// ============================================================================

export async function createNoticeOfDisconnection(payload: {
  rule_id: string
  reading_period_id: string
  selected_connections: Array<{
    meter_account_id: string
    billing_id: string
    balance_snapshot: number
    months_unpaid: number
  }>
}): Promise<{ status: 'success' | 'error'; data?: any; message?: string }> {
  const supabase = await createClient()

  try {
    const { data: { user: actorUser } } = await supabase.auth.getUser()
    if (!actorUser) return { status: 'error', message: 'Unauthorized' }

    // Validate: no existing notice for this reading period
    const existing = await getNoticeByReadingPeriod(payload.reading_period_id)
    if (existing.status === 'success' && existing.data) {
      return {
        status: 'error',
        message: `A notice (${existing.data.notice_no}) already exists for this reading period. Use "Add Connections" instead.`,
      }
    }

    const totalAccounts = payload.selected_connections.length

    // Insert without notice_no - the database trigger will generate it
    const { data: notice, error: noticeError } = await supabase
      .from('notice_of_disconnection')
      .insert({
        rule_id: payload.rule_id,
        reading_period_id: payload.reading_period_id,
        generated_by: actorUser.id,
        total_accounts: totalAccounts,
      })
      .select()
      .single()

    if (noticeError) throw noticeError

    const rows = payload.selected_connections.map((sc) => ({
      notice_id: notice.notice_id,
      meter_account_id: sc.meter_account_id,
      billing_id: sc.billing_id,
      balance_snapshot: sc.balance_snapshot,
      months_unpaid: sc.months_unpaid,
    }))

    const { error: scError } = await supabase
      .from('notice_meter_accounts')
      .insert(rows)

    if (scError) throw scError

    // Notify consumers in Next.js (DB notify trigger removed)
    const { evaluateBillingDisconnectionNotify } = await import(
      '@/lib/actions/disconnection-notice/billing-disconnection-notify.actions'
    )
    await Promise.allSettled(
      payload.selected_connections.map((sc) =>
        evaluateBillingDisconnectionNotify(sc.billing_id),
      ),
    )

    await createAuditLog(
      actorUser.id,
      'CREATE',
      `Created Notice of Disconnection ${notice.notice_no} with ${totalAccounts} account(s)`,
      'notice_of_disconnection',
      notice.notice_id,
    )

    return {
      status: 'success',
      data: notice,
      message: `Notice of Disconnection ${notice.notice_no} created successfully`,
    }
  } catch (error) {
    console.error('Error creating notice of disconnection:', error)
    return { status: 'error', message: 'Failed to create notice of disconnection' }
  }
}

// ============================================================================
// ADD CONNECTIONS — Append more meter accounts to an existing notice
// ============================================================================

export async function addConnectionsToNotice(payload: {
  notice_id: string
  selected_connections: Array<{
    meter_account_id: string
    billing_id: string
    balance_snapshot: number
    months_unpaid: number
  }>
}): Promise<{ status: 'success' | 'error'; message?: string }> {
  const supabase = await createClient()

  try {
    const { data: { user: actorUser } } = await supabase.auth.getUser()
    if (!actorUser) return { status: 'error', message: 'Unauthorized' }

    if (payload.selected_connections.length === 0) {
      return { status: 'error', message: 'No connections selected.' }
    }

    // 1. Guard: make sure none of these meter_account_ids are already in the notice
    const { data: existing } = await supabase
      .from('notice_meter_accounts')
      .select('meter_account_id')
      .eq('notice_id', payload.notice_id)
      .in('meter_account_id', payload.selected_connections.map((c) => c.meter_account_id))

    if (existing && existing.length > 0) {
      return {
        status: 'error',
        message: `${existing.length} account(s) are already in this notice.`,
      }
    }

    // 2. Insert only the new connections
    const rows = payload.selected_connections.map((sc) => ({
      notice_id: payload.notice_id,
      meter_account_id: sc.meter_account_id,
      billing_id: sc.billing_id,
      balance_snapshot: sc.balance_snapshot,
      months_unpaid: sc.months_unpaid,
    }))

    const { error: insertErr } = await supabase
      .from('notice_meter_accounts')
      .insert(rows)

    if (insertErr) throw insertErr

    const { evaluateBillingDisconnectionNotify } = await import(
      '@/lib/actions/disconnection-notice/billing-disconnection-notify.actions'
    )
    await Promise.allSettled(
      payload.selected_connections.map((sc) =>
        evaluateBillingDisconnectionNotify(sc.billing_id),
      ),
    )

    // 3. Update total_accounts — COUNT all connections (existing + new)
    const { count: newTotal, error: countError } = await supabase
      .from('notice_meter_accounts')
      .select('*', { count: 'exact', head: true })
      .eq('notice_id', payload.notice_id)

    if (countError) throw countError

    // 4. Update the notice with the new total
    const { error: updateError } = await supabase
      .from('notice_of_disconnection')
      .update({ total_accounts: newTotal ?? 0 })
      .eq('notice_id', payload.notice_id)

    if (updateError) throw updateError

    // 5. Audit log
    await createAuditLog(
      actorUser.id,
      'UPDATE',
      `Added ${payload.selected_connections.length} account(s) to notice ${payload.notice_id}. New total: ${newTotal} accounts`,
      'notice_of_disconnection',
      payload.notice_id,
    )

    return {
      status: 'success',
      message: `${payload.selected_connections.length} account(s) added. Total accounts now: ${newTotal}`,
    }
  } catch (error) {
    console.error('Error adding connections to notice:', error)
    return { status: 'error', message: 'Failed to add connections to notice' }
  }
}

// ============================================================================
// GET — Notice with connections by ID (for reuse in Excel/Print)
// ============================================================================

export async function getNoticeWithConnectionsById(noticeId: string): Promise<{
  status: 'success' | 'error'
  data?: {
    notice: NoticeOfDisconnection
    connections: NoticeMeterAccount[]
    totalBalance: number
  }
  message?: string
}> {
  const supabase = await createClient()

  try {
    // Get notice
    const { data: noticeRaw, error: noticeError } = await supabase
      .from('notice_of_disconnection')
      .select(`
        notice_id,
        notice_no,
        rule_id,
        reading_period_id,
        generated_by,
        total_accounts,
        generated_at,
        rule:rule_id ( rule_id, min_balance, min_unpaid_months, created_at ),
        generator:generated_by ( first_name, last_name ),
        reading_period:reading_period_id (
          period_start,
          period_end,
          due_date
        )
      `)
      .eq('notice_id', noticeId)
      .single()

    if (noticeError) throw noticeError

    const generator = unwrap(noticeRaw.generator)
    const rule = unwrap(noticeRaw.rule)
    const periodData = unwrap(noticeRaw.reading_period)

    const notice: NoticeOfDisconnection = {
      notice_id: noticeRaw.notice_id,
      notice_no: noticeRaw.notice_no,
      rule_id: noticeRaw.rule_id,
      reading_period_id: noticeRaw.reading_period_id,
      generated_by: noticeRaw.generated_by,
      total_accounts: noticeRaw.total_accounts,
      generated_at: noticeRaw.generated_at,
      generated_by_name: generator
        ? `${generator.first_name} ${generator.last_name}`
        : 'System',
      rule: rule ?? null,
      period_start: periodData?.period_start || '',
      period_end: periodData?.period_end || '',
      due_date: periodData?.due_date || '',
    }

    // Get connections
    const { data: scRaw, error: scError } = await supabase
      .from('notice_meter_accounts')
      .select(`
        notice_meter_account_id,
        notice_id,
        meter_account_id,
        billing_id,
        balance_snapshot,
        months_unpaid,
        created_at,
        meter_account:meter_account_id (
          consumer:consumer_id ( account_name ),
          zone:zone_id (
            zone_name,
            barangay:barangay_id ( barangay_name )
          ),
          classification:classification_id ( classification_name )
        ),
        billing:billing_id (
          billing_status:billing_status_id (
            billing_status_name
          )
        )
      `)
      .eq('notice_id', noticeId)
      .order('account_name', { referencedTable: 'meter_account.consumer', ascending: true })

    if (scError) throw scError

    const connections: NoticeMeterAccount[] = (scRaw || []).map((sc: any) => {
      const ma = unwrap(sc.meter_account)
      const consumer = unwrap(ma?.consumer)
      const zone = unwrap(ma?.zone)
      const barangay = unwrap(zone?.barangay)
      const classification = unwrap(ma?.classification)
      const billing = unwrap(sc.billing)
      const billingStatus = unwrap(billing?.billing_status)

      const consumerName = consumer?.account_name || 'Unknown Consumer'

      return {
        notice_meter_account_id: sc.notice_meter_account_id,
        notice_id: sc.notice_id,
        meter_account_id: sc.meter_account_id,
        billing_id: sc.billing_id,
        balance_snapshot: sc.balance_snapshot,
        months_unpaid: sc.months_unpaid,
        created_at: sc.created_at,
        meter_serial_no: ma?.meter_serial_no ?? '',
        consumer_name: consumerName,
        zone_name: zone?.zone_name ?? '',
        barangay_name: barangay?.barangay_name ?? '',
        classification_name: classification?.classification_name ?? '',
        billing_status: billingStatus?.billing_status_name ?? 'unknown',
      }
    })

    // Fallback safety net in case the referencedTable order isn't honored by PostgREST
    connections.sort((a, b) => (a.consumer_name ?? '').localeCompare(b.consumer_name ?? ''))

    const totalBalance = connections.reduce((sum, c) => sum + (c.balance_snapshot ?? 0), 0)

    return {
      status: 'success',
      data: { notice, connections, totalBalance },
    }
  } catch (error) {
    console.error('Error fetching notice with connections:', error)
    return { status: 'error', message: 'Failed to fetch notice details' }
  }
}

// ============================================================================
// GET — Billing details for notice connections (for print/export)
// ============================================================================

export async function getNoticeConnectionBillingDetails(
  noticeMeterAccountIds: string[]
): Promise<{
  status: 'success' | 'error'
  data?: Record<string, {
    current_billing: number
    previous_balance: number
    penalty_amount: number
    meter_charge: number
    total_billing: number
    remaining_balance: number
  }>
  message?: string
}> {
  const supabase = await createClient()

  try {
    // First get the notice_meter_account records with their billing_id
    const { data: noticeAccounts, error: noticeError } = await supabase
      .from('notice_meter_accounts')
      .select(`
        notice_meter_account_id,
        meter_account_id,
        billing_id,
        balance_snapshot
      `)
      .in('notice_meter_account_id', noticeMeterAccountIds)

    if (noticeError) throw noticeError
    if (!noticeAccounts || noticeAccounts.length === 0) {
      return { status: 'success', data: {} }
    }

    // Get all the billing IDs from the notice
    const billingIds = noticeAccounts.map((n: any) => n.billing_id)

    // Get the specific billing records
    const { data: billings, error: billError } = await supabase
      .from('billing')
      .select(`
        billing_id,
        meter_account_id,
        current_billing,
        remaining_balance,
        previous_balance,
        penalty_amount,
        total_billing
      `)
      .in('billing_id', billingIds)

    if (billError) throw billError

    // Create a map of billing_id to billing data
    const billingMap: Record<string, any> = {}
    for (const b of billings || []) {
      billingMap[b.billing_id] = b
    }

    // Create a map of meter_account_id to billing data
    const result: Record<string, any> = {}

    for (const na of noticeAccounts || []) {
      const billing = billingMap[na.billing_id]
      if (!billing) {
        // Fallback: use balance_snapshot from notice
        result[na.meter_account_id] = {
          current_billing: 0,
          previous_balance: na.balance_snapshot ?? 0,
          penalty_amount: 0,
          meter_charge: 0,
          total_billing: na.balance_snapshot ?? 0,
          remaining_balance: na.balance_snapshot ?? 0,
        }
        continue
      }

      // Get meter installment charges for this specific billing
      const { data: meterCharges } = await supabase
        .from('meter_installment_charges')
        .select('amount')
        .eq('billing_id', billing.billing_id)

      const meterCharge = meterCharges?.reduce((sum: number, c: any) => sum + c.amount, 0) ?? 0

      result[na.meter_account_id] = {
        current_billing: billing.current_billing ?? 0,
        previous_balance: billing.previous_balance ?? 0,
        penalty_amount: billing.penalty_amount ?? 0,
        meter_charge: meterCharge,
        total_billing: billing.total_billing ?? 0,
        remaining_balance: billing.remaining_balance ?? 0,
      }
    }

    return { status: 'success', data: result }
  } catch (error) {
    console.error('Error fetching notice billing details:', error)
    return { status: 'error', message: 'Failed to fetch billing details' }
  }
}

// ============================================================================
// GET — Barangays / Zones for filter dropdowns
// ============================================================================

export async function getBarangaysForDisconnectionFilter(): Promise<
  Array<{ barangay_id: string; barangay_name: string }>
> {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from('barangay')
      .select('barangay_id, barangay_name')
      .eq('is_active', true)
      .order('barangay_name', { ascending: true })
    if (error) throw error
    return data || []
  } catch {
    return []
  }
}

export async function getZonesForDisconnectionFilter(
  barangayId: string
): Promise<Array<{ zone_id: string; zone_name: string }>> {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from('zone')
      .select('zone_id, zone_name')
      .eq('barangay_id', barangayId)
      .eq('is_active', true)
      .order('zone_name', { ascending: true })
    if (error) throw error
    return data || []
  } catch {
    return []
  }
}

// ============================================================================
// NOTIFY — Selected eligible consumers (no notice_of_disconnection created)
// ============================================================================

export async function notifyDisconnectionWarnings(
  selected_connections: Array<{
    meter_account_id: string
    billing_id: string
    balance_snapshot: number
    months_unpaid: number
  }>,
): Promise<{
  status: 'success' | 'error'
  message?: string
  data?: { notified: number; skipped: number }
}> {
  const supabase = await createClient()

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { status: 'error', message: 'Unauthorized' }

    if (!selected_connections.length) {
      return { status: 'error', message: 'Select at least one account' }
    }

    const { evaluateBillingDisconnectionNotify } = await import(
      '@/lib/actions/disconnection-notice/billing-disconnection-notify.actions'
    )

    let notified = 0
    let skipped = 0
    for (const sc of selected_connections) {
      const res = await evaluateBillingDisconnectionNotify(sc.billing_id)
      if (res.status === 'success' && res.notified) notified += 1
      else skipped += 1
    }

    if (notified > 0) {
      await createAuditLog(
        user.id,
        'CREATE',
        `Notified ${notified} consumer(s) of disconnection warning`,
        'user_notifications',
        user.id,
      )
    }

    return {
      status: 'success',
      message:
        notified > 0
          ? `Notified ${notified} consumer(s)`
          : 'Selected consumers were already notified or not eligible',
      data: { notified, skipped },
    }
  } catch (error) {
    console.error('[notifyDisconnectionWarnings]', error)
    return { status: 'error', message: 'Failed to notify consumers' }
  }
}

// ============================================================================
// AUTO — Notify all accounts meeting disconnection rules (Next.js, no DB trigger)
// ============================================================================

export async function autoGenerateDisconnectionNotices(options?: {
  readingPeriodId?: string
}): Promise<{
  status: 'success' | 'error'
  message?: string
  data?: {
    added: number
    skipped: number
    notice_id: string | null
    notice_no: string | null
    reading_period_id: string | null
    created_notice?: boolean
  }
}> {
  const supabase = await createClient()

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { status: 'error', message: 'Unauthorized' }

    const eligibleRes = await getEligibleMeterAccounts({
      readingPeriodId: options?.readingPeriodId,
    })

    if (eligibleRes.status !== 'success') {
      return {
        status: 'error',
        message: eligibleRes.message || 'Failed to load eligible accounts',
      }
    }

    const accounts = eligibleRes.data ?? []
    const { evaluateBillingDisconnectionNotify } = await import(
      '@/lib/actions/disconnection-notice/billing-disconnection-notify.actions'
    )

    let notified = 0
    let skipped = 0
    let noticeId: string | null = null
    let noticeNo: string | null = null
    for (const a of accounts) {
      const res = await evaluateBillingDisconnectionNotify(a.billing_id)
      if (res.notice_id) noticeId = res.notice_id
      if (res.notice_no) noticeNo = res.notice_no
      if (res.status === 'success' && res.notified) notified += 1
      else skipped += 1
    }

    if (notified > 0 || noticeId) {
      await createAuditLog(
        user.id,
        'CREATE',
        noticeNo
          ? `Auto-generated notice ${noticeNo}; notified ${notified} consumer(s)`
          : `Auto-notified ${notified} consumer(s) of disconnection warning`,
        noticeId ? 'notice_of_disconnection' : 'user_notifications',
        noticeId ?? user.id,
      )
    }

    return {
      status: 'success',
      message:
        notified > 0
          ? noticeNo
            ? `Notice ${noticeNo}: notified ${notified} consumer(s)`
            : `Notified ${notified} consumer(s)`
          : accounts.length === 0
            ? 'No eligible accounts to notify'
            : noticeNo
              ? `Notice ${noticeNo} updated; consumers already notified`
              : 'Eligible consumers already notified',
      data: {
        added: notified,
        skipped,
        notice_id: noticeId,
        notice_no: noticeNo,
        reading_period_id: options?.readingPeriodId ?? null,
        created_notice: Boolean(noticeId),
      },
    }
  } catch (error) {
    console.error('[autoGenerateDisconnectionNotices]', error)
    return { status: 'error', message: 'Failed to notify eligible consumers' }
  }
}