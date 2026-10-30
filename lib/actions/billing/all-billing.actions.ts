'use server'

import { createClient } from '@/lib/supabase/server'

// ─── Helper ──────────────────────────────────────────────────────────────────

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


// ─── Shared Types ────────────────────────────────────────────────────────────

export interface FilterOption {
  id:   string
  name: string
}

export interface BillingRecord {
  billing_id:         string
  consumer_id:        string
  reading_period_id:  string
  period_start:       string
  period_end:         string
  due_date:           string
  current_billing:    number
  previous_balance:   number
  penalty_amount:     number
  total_billing:      number
  remaining_balance:  number
  meter_charge:       number
  is_non_metered:     boolean
  meter_serial_no:    string | null

  // When the actual meter reading was taken (from meter_readings.reading_date)
  reading_date:       string | null

  // Staff member who took the reading (from meter_readings.meter_reader_id -> users)
  meter_reader: {
    user_id: string
    name:    string
  } | null

  reading_status: {
    reading_status_id: string
    status_code:       string
  } | null

  billing_status: {
    billing_status_id:   string
    billing_status_name: string
  }

  meter_account: {
    meter_account_id: string
    meter_serial_no: string | null
    consumer: {
      consumer_id:     string
      contract_no?: string
      account_name:    string
      email:           string | null
      contact_number:  string | null
    }
    zone: {
      zone_id:   string
      zone_name: string
      barangay: {
        barangay_id:   string
        barangay_name: string
      }
    }
    classification: {
      classification_id:   string
      classification_name: string
    }
  }

  consumption: {
    consumption_id:      string
    previous_reading:    number
    present_reading:     number
    consumption:         number
    billed_consumption:  number
    reading_id:          string | null
  }

  breakdowns: Array<{
    community_charge_id: string
    block_order:         number
    min_consumption:      number
    max_consumption:      number | null
    rate_per_unit:        number
    units_used:           number
    subtotal:             number
    reached:              boolean
  }>
}

// ============================================================
// getAllReadingPeriods - Directly from billing table
// ============================================================

export interface ReadingPeriodOption {
  reading_period_id: string   // UUID
  period_start:      string   // e.g. "2025-01-01"
  label:             string   // e.g. "January 2025"
}

export async function getAllReadingPeriods(): Promise<ReadingPeriodOption[]> {
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

    if (error) throw error

    const uniquePeriods = new Map<string, { period_start: string; period_end: string; due_date: string }>()

    for (const item of data ?? []) {
      if (!uniquePeriods.has(item.reading_period_id)) {
        const periodData = unwrap<any>(item.reading_periods)
        if (periodData) {
          uniquePeriods.set(item.reading_period_id, {
            period_start: periodData.period_start,
            period_end: periodData.period_end,
            due_date: periodData.due_date,
          })
        }
      }
    }

    return Array.from(uniquePeriods.entries()).map(([id, period]) => {
      const [y, m] = period.period_start.split('-').map(Number)
      const label = new Date(y, m - 1).toLocaleDateString('en-US', {
        month: 'long', year: 'numeric',
      })
      return {
        reading_period_id: id,
        period_start: period.period_start,
        label,
      }
    })
  } catch (err) {
    console.error('[getAllReadingPeriods]', err)
    return []
  }
}

// ============================================================
// getReadingPeriodsSummary - periods + aggregate totals
// ============================================================

export interface ReadingPeriodSummary {
  reading_period_id: string
  period_start:      string
  period_end:        string
  due_date:          string
  label:             string
  total_accounts:    number
  total_billed:      number
  total_collected:   number
  total_remaining:   number
  /** SUM(water_consumptions.consumption) for the period */
  total_consumption: number
  /** SUM(water_consumptions.billed_consumption) for the period */
  total_billed_consumption: number
}

export async function getReadingPeriodsSummary(): Promise<ReadingPeriodSummary[]> {
  const supabase = await createClient()
  try {
    const map = new Map<string, {
      period_start: string
      period_end: string
      due_date: string
      total_accounts: number
      total_billed: number
      total_remaining: number
      total_consumption: number
      total_billed_consumption: number
    }>()

    const pageSize = 1000
    let from = 0
    for (;;) {
      const { data, error } = await supabase
        .from('billing')
        .select(`
          reading_period_id,
          total_billing,
          remaining_balance,
          reading_periods:reading_period_id (
            period_start,
            period_end,
            due_date
          ),
          consumption:consumption_id (
            consumption,
            billed_consumption
          )
        `)
        .range(from, from + pageSize - 1)

      if (error) throw error
      if (!data?.length) break

      for (const row of data) {
        const period = unwrap<any>(row.reading_periods)
        if (!period) continue
        const wc = unwrap<any>((row as any).consumption)

        const entry = map.get(row.reading_period_id) ?? {
          period_start: period.period_start,
          period_end: period.period_end,
          due_date: period.due_date,
          total_accounts: 0,
          total_billed: 0,
          total_remaining: 0,
          total_consumption: 0,
          total_billed_consumption: 0,
        }

        entry.total_accounts += 1
        entry.total_billed += Number(row.total_billing)
        entry.total_remaining += Number(row.remaining_balance)
        entry.total_consumption += Number(wc?.consumption ?? 0)
        entry.total_billed_consumption += Number(wc?.billed_consumption ?? 0)

        map.set(row.reading_period_id, entry)
      }

      if (data.length < pageSize) break
      from += pageSize
    }

    return Array.from(map.entries())
      .map(([id, v]) => {
        const [y, m] = v.period_start.split('-').map(Number)
        const label = new Date(y, m - 1).toLocaleDateString('en-US', {
          month: 'long', year: 'numeric',
        })
        return {
          reading_period_id: id,
          period_start: v.period_start,
          period_end: v.period_end,
          due_date: v.due_date,
          label,
          total_accounts: v.total_accounts,
          total_billed: v.total_billed,
          total_collected: v.total_billed - v.total_remaining,
          total_remaining: v.total_remaining,
          total_consumption: Math.round(v.total_consumption * 100) / 100,
          total_billed_consumption: Math.round(v.total_billed_consumption * 100) / 100,
        }
      })
      .sort((a, b) => b.period_start.localeCompare(a.period_start))
  } catch (err) {
    console.error('[getReadingPeriodsSummary]', err)
    return []
  }
}

// ============================================================
// getBillingFilterOptions - barangays, classifications, statuses
// ============================================================

export async function getBillingFilterOptions(): Promise<{
  status: 'success' | 'error'
  data?: {
    barangays:       FilterOption[]
    classifications: FilterOption[]
    statuses:        FilterOption[]
  }
  message?: string
}> {
  const supabase = await createClient()
  try {
    const [barangayRes, classificationRes, statusRes] = await Promise.all([
      supabase
        .from('barangay')
        .select('barangay_id, barangay_name')
        .eq('is_active', true)
        .order('barangay_name', { ascending: true }),
      supabase
        .from('classifications')
        .select('classification_id, classification_name')
        .order('classification_name', { ascending: true }),
      supabase
        .from('billing_status')
        .select('billing_status_id, billing_status_name')
        .order('billing_status_name', { ascending: true }),
    ])

    if (barangayRes.error) throw barangayRes.error
    if (classificationRes.error) throw classificationRes.error
    if (statusRes.error) throw statusRes.error

    return {
      status: 'success',
      data: {
        barangays: (barangayRes.data ?? []).map((b) => ({
          id: b.barangay_id,
          name: b.barangay_name,
        })),
        classifications: (classificationRes.data ?? []).map((c) => ({
          id: c.classification_id,
          name: c.classification_name,
        })),
        statuses: (statusRes.data ?? []).map((s) => ({
          id: s.billing_status_id,
          name: s.billing_status_name,
        })),
      },
    }
  } catch (err) {
    console.error('[getBillingFilterOptions]', err)
    return { status: 'error', message: 'Failed to load filter options' }
  }
}

// ============================================================
// fetchBillingRecords - shared implementation
//
// Now backed by a single Postgres RPC (get_billing_records) that does
// every join server-side and returns JSONB shaped exactly like
// BillingRecord[]. Replaces the old 8-step batched client-side fetch,
// which could blow past the URL header limit on large periods
// (see get_billing_records.sql).
// ============================================================

async function fetchBillingRecords(filter: {
  readingPeriodId?: string
  meterAccountId?: string
}) {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase.rpc('get_billing_records', {
      p_reading_period_id: filter.readingPeriodId ?? null,
      p_meter_account_id:  filter.meterAccountId ?? null,
    })

    if (error) throw error

    const records = (data ?? []) as BillingRecord[]

    // Ensure billed_consumption is present (older RPC builds may omit it).
    const missingBilled = records.some(
      (r) => r.consumption && r.consumption.billed_consumption == null,
    )
    if (missingBilled) {
      const ids = [
        ...new Set(
          records
            .map((r) => r.consumption?.consumption_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ]
      const billedById = new Map<string, number>()
      const chunkSize = 200
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize)
        const { data: wcRows } = await supabase
          .from('water_consumptions')
          .select('consumption_id, billed_consumption')
          .in('consumption_id', chunk)
        for (const row of wcRows ?? []) {
          billedById.set(row.consumption_id, Number(row.billed_consumption ?? 0))
        }
      }
      for (const r of records) {
        if (!r.consumption) continue
        if (r.consumption.billed_consumption == null) {
          r.consumption.billed_consumption =
            billedById.get(r.consumption.consumption_id)
            ?? Number(r.consumption.consumption ?? 0)
        }
      }
    }

    // RPC already orders by period_start DESC, created_at DESC — this
    // keeps behavior explicit and identical to the previous implementation.
    records.sort((a, b) => b.period_start.localeCompare(a.period_start))

    return { status: 'success' as const, data: records }
  } catch (err) {
    console.error('[fetchBillingRecords]', err)
    return { status: 'error' as const, message: 'Failed to load billing records' }
  }
}

// ============================================================
// getAllBillingsAcrossPeriods - filtered by reading period
// ============================================================

export async function getAllBillingsAcrossPeriods(readingPeriodId?: string) {
  return fetchBillingRecords({ readingPeriodId })
}

// ============================================================
// getBillingsByMeterAccount - filtered by a single meter account
// ============================================================

export async function getBillingsByMeterAccount(meterAccountId: string) {
  return fetchBillingRecords({ meterAccountId })
}