'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================================================
// Types
// ============================================================================

export interface BillingBreakdownRow {
  community_charge_id: string
  block_order:         number
  min_consumption:     number
  max_consumption:     number | null
  rate_per_unit:       number
  units_used:          number
  subtotal:            number
  reached:             boolean
}

export interface Consumer {
  consumer_id:    string
  account_name:   string
  email:          string | null
  contact_number: string | null
}

export interface Barangay {
  barangay_id:   string
  barangay_name: string
}

export interface Zone {
  zone_id:   string
  zone_name: string
  barangay:  Barangay
}

export interface Classification {
  classification_id:   string
  classification_name: string
}

export interface MeterAccount {
  meter_account_id:   string
  meter_serial_no: string | null
  // REMOVED: meter_type
  consumer:           Consumer
  zone:               Zone
  classification:     Classification
}

export interface BillingStatus {
  billing_status_id:   string
  billing_status_name: string
}

export interface Consumption {
  consumption_id:      string
  previous_reading:    number
  present_reading:     number
  consumption:         number
  billed_consumption?: number
  reading_id:          string | null
}

export interface MeterIssueStatus {
  issue_type_name: string
  issue_code: 'DM' | 'SM' | 'WAM' | null
}

export interface BillingRecord {
  billing_id:        string
  consumer_id:       string
  reading_period_id: string
  period_start:      string
  period_end:        string
  due_date:          string
  current_billing:   number
  previous_balance:  number
  penalty_amount:    number
  total_billing:     number
  remaining_balance: number
  meter_charge:      number
  is_non_metered:    boolean  // Kept for display but derived from meter reading status
  billing_status:    BillingStatus
  meter_account:     MeterAccount
  consumption:       Consumption
  breakdowns:        BillingBreakdownRow[]
  meter_serial_no:   string | null
  meter_issue_status: MeterIssueStatus | null
}

export interface BillingTableRow {
  billing_id:       string
  consumer_name:    string
  address:          string
  meter_serial_no: string | null
  // REMOVED: meter_type
  classification:   string
  due_date:         string
  previous_reading: number
  present_reading:  number
  consumption:      number
  billed_consumption: number
  current_billing:  number
  total_billing:    number
}

export interface FilterOption {
  id:   string
  name: string
}

export interface CurrentPeriodMeta {
  reading_period_id: string
  period_start:      string
  period_end:        string
  period_label:      string
  due_date:          string
}

export interface PaymentTransaction {
  payment_id:     string
  billing_id:     string
  amount_paid:    number
  receipt_number: string
  payment_date:   string
  received_by:    string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

const unwrap = <T>(val: T | T[] | null): T | null => {
  if (val == null) return null
  return Array.isArray(val) ? (val[0] ?? null) : val
}

function periodLabel(periodStart: string): string {
  return new Date(periodStart).toLocaleDateString('en-PH', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

// ─── Resolve current billing period ──────────────────────────────────────────

export async function getCurrentBillingPeriod(): Promise<CurrentPeriodMeta | null> {
  const supabase = await createClient()

  try {
    const { data: billingData, error: billingError } = await supabase
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

    if (billingError) throw billingError

    if (billingData?.reading_period_id) {
      const periodData = unwrap<any>(billingData.reading_periods)
      if (periodData) {
        return {
          reading_period_id: billingData.reading_period_id,
          period_start: periodData.period_start,
          period_end: periodData.period_end,
          period_label: periodLabel(periodData.period_start),
          due_date: periodData.due_date,
        }
      }
    }

    const { data: periodData, error: periodError } = await supabase
      .from('reading_periods')
      .select('reading_period_id, period_start, period_end, due_date')
      .order('period_start', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (periodError) throw periodError

    if (periodData) {
      return {
        reading_period_id: periodData.reading_period_id,
        period_start: periodData.period_start,
        period_end: periodData.period_end,
        period_label: periodLabel(periodData.period_start),
        due_date: periodData.due_date,
      }
    }

    return null
  } catch (err) {
    console.error('[getCurrentBillingPeriod]', err)
    return null
  }
}

// ─── Get reading periods with billing data ────────────────────────────────────

export async function getAvailableReadingPeriods() {
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

    const uniquePeriods = new Map()
    for (const item of data ?? []) {
      if (!uniquePeriods.has(item.reading_period_id)) {
        const periodData = unwrap<any>(item.reading_periods)
        if (periodData) {
          uniquePeriods.set(item.reading_period_id, {
            reading_period_id: item.reading_period_id,
            period_start: periodData.period_start,
            period_end: periodData.period_end,
            period_label: periodLabel(periodData.period_start),
            due_date: periodData.due_date,
          })
        }
      }
    }

    if (uniquePeriods.size === 0) {
      const { data: allPeriods } = await supabase
        .from('reading_periods')
        .select('reading_period_id, period_start, period_end, due_date')
        .order('period_start', { ascending: false })

      for (const period of allPeriods ?? []) {
        uniquePeriods.set(period.reading_period_id, {
          reading_period_id: period.reading_period_id,
          period_start: period.period_start,
          period_end: period.period_end,
          period_label: periodLabel(period.period_start),
          due_date: period.due_date,
        })
      }
    }

    return {
      status: 'success',
      data: Array.from(uniquePeriods.values()),
    }
  } catch (err) {
    console.error('[getAvailableReadingPeriods]', err)
    return { status: 'error', message: 'Failed to load reading periods', data: [] }
  }
}

// ─── Filter options ───────────────────────────────────────────────────────────

export async function getBillingFilterOptions() {
  const supabase = await createClient()

  try {
    const [barangaysRes, classificationsRes, statusesRes] = await Promise.all([
      supabase.from('barangay').select('barangay_id, barangay_name').eq('is_active', true).order('barangay_name'),
      supabase.from('classifications').select('classification_id, classification_name').order('classification_name'),
      supabase.from('billing_status').select('billing_status_id, billing_status_name').order('billing_status_name'),
    ])

    if (barangaysRes.error)       throw barangaysRes.error
    if (classificationsRes.error) throw classificationsRes.error
    if (statusesRes.error)        throw statusesRes.error

    return {
      status: 'success',
      data: {
        barangays:       (barangaysRes.data ?? []).map((b) => ({ id: b.barangay_id,        name: b.barangay_name })),
        classifications: (classificationsRes.data ?? []).map((c) => ({ id: c.classification_id, name: c.classification_name })),
        statuses:        (statusesRes.data ?? []).map((s) => ({ id: s.billing_status_id,   name: s.billing_status_name })),
      },
    }
  } catch (err) {
    console.error('[getBillingFilterOptions]', err)
    return { status: 'error', message: 'Failed to load filter options' }
  }
}

// ─── Get billings by period ───────────────────────────────────────────────────

export async function getBillingsByPeriod(readingPeriodId: string) {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('billing')
      .select(`
        billing_id,
        current_billing,
        total_billing,
        reading_periods:reading_period_id (
          due_date
        ),
        consumption:consumption_id (
          previous_reading,
          present_reading,
          consumption,
          billed_consumption
        ),
        meter_account:meter_account_id (
          meter_account_id,
          meters ( meter_serial_no, created_at ),
          consumer:consumer_id (
            account_name
          ),
          zone:zone_id (
            zone_name,
            barangay:barangay_id (
              barangay_name
            )
          ),
          classification:classification_id (
            classification_name
          )
        )
      `)
      .eq('reading_period_id', readingPeriodId)
      .order('created_at', { ascending: false })

    if (error) throw error

    const rows: BillingTableRow[] = (data ?? []).map((row) => {
      const meterAccount   = unwrap<any>(row.meter_account)
      const consumer       = unwrap<any>(meterAccount?.consumer)
      const zone           = unwrap<any>(meterAccount?.zone)
      const barangay       = unwrap<any>(zone?.barangay)
      const classification = unwrap<any>(meterAccount?.classification)
      const periodData     = unwrap<any>(row.reading_periods)
      const consumption    = unwrap<any>((row as any).consumption)

      const fullName = consumer?.account_name ?? 'Unknown'
      const address = zone && barangay
        ? `${barangay.barangay_name} ${zone.zone_name}`
        : 'Unknown'

      const actualConsumption = Number(consumption?.consumption ?? 0)
      const billedConsumption = Number(
        consumption?.billed_consumption ?? consumption?.consumption ?? 0,
      )

      return {
        billing_id:          row.billing_id,
        consumer_name:       fullName,
        address,
        meter_serial_no:     latestMeterSerialFromMeters(meterAccount?.meters) ?? '',
        classification:      classification?.classification_name ?? '',
        due_date:            periodData?.due_date ?? '',
        previous_reading:    Number(consumption?.previous_reading ?? 0),
        present_reading:     Number(consumption?.present_reading ?? 0),
        consumption:         actualConsumption,
        billed_consumption:  billedConsumption,
        current_billing:     row.current_billing,
        total_billing:       row.total_billing,
      }
    })

    return { status: 'success', data: rows }
  } catch (err) {
    console.error('[getBillingsByPeriod]', err)
    return { status: 'error', message: 'Failed to load billing table' }
  }
}

// ─── Get billings by meter account ───────────────────────────────────────────────

export async function getBillingsByMeterAccount(meterAccountId: string) {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase.rpc('get_billing_records', {
      p_reading_period_id: null,
      p_meter_account_id: meterAccountId,
      p_billing_id: null,
    })

    if (error) throw error

    const rows = (data ?? []) as any[]
    if (!rows.length) return { status: 'success', data: [] }

    const records = rows.map((row) => ({
      billing_id: row.billing_id,
      consumer_id: row.consumer_id,
      consumer: row.meter_account?.consumer ?? null,
      reading_period_id: row.reading_period_id,
      period_start: row.period_start || '',
      period_end: row.period_end || '',
      due_date: row.due_date || '',
      current_billing: row.current_billing,
      previous_balance: row.previous_balance ?? 0,
      penalty_amount: Number(row.penalty_amount ?? 0),
      total_billing: row.total_billing,
      remaining_balance: row.remaining_balance ?? 0,
      meter_charge: row.meter_charge ?? 0,
      billing_status: row.billing_status,
      consumption: {
        consumption_id: row.consumption.consumption_id,
        previous_reading: row.consumption.previous_reading,
        present_reading: row.consumption.present_reading,
        consumption: row.consumption.consumption,
      },
    }))

    return { status: 'success', data: records }
  } catch (err) {
    console.error('[getBillingsByMeterAccount]', err)
    return { status: 'error', message: 'Failed to fetch billing records', data: [] }
  }
}

// ─── Get billing by ID ────────────────────────────────────────────────────────

export async function getBillingById(billingId: string) {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase.rpc('get_billing_records', {
      p_reading_period_id: null,
      p_meter_account_id: null,
      p_billing_id: billingId,
    })

    if (error) throw error

    const row = (data ?? [])[0]
    if (!row) return { status: 'error', message: 'Billing record not found' }

    const statusCode = row.reading_status?.status_code ?? ''
    let meterIssueStatus: MeterIssueStatus | null = null
    let issueCode: 'DM' | 'SM' | 'WAM' | null = null
    if (statusCode === 'DEFECTIVE') issueCode = 'DM'
    else if (statusCode === 'STOLEN') issueCode = 'SM'
    else if (statusCode === 'LEAK_AFTER_METER') issueCode = 'WAM'
    if (issueCode) meterIssueStatus = { issue_type_name: statusCode, issue_code: issueCode }

    const record: BillingRecord = {
      billing_id: row.billing_id,
      consumer_id: row.consumer_id,
      reading_period_id: row.reading_period_id,
      period_start: row.period_start,
      period_end: row.period_end,
      due_date: row.due_date,
      current_billing: row.current_billing,
      previous_balance: row.previous_balance ?? 0,
      penalty_amount: Number(row.penalty_amount ?? 0),
      total_billing: row.total_billing,
      remaining_balance: row.remaining_balance ?? 0,
      meter_charge: row.meter_charge ?? 0,
      is_non_metered: row.is_non_metered,
      billing_status: row.billing_status,
      meter_account: row.meter_account,
      consumption: row.consumption,
      breakdowns: row.breakdowns ?? [],
      meter_serial_no: row.meter_serial_no,
      meter_issue_status: meterIssueStatus,
    }

    return { status: 'success', data: record }
  } catch (err) {
    console.error('[getBillingById]', err)
    return { status: 'error', message: 'Failed to load billing record' }
  }
}

// ─── Get all billings for print ───────────────────────────────────────────────

export async function getAllBillingsForPrint() {
  const supabase = await createClient()

  try {
    const period = await getCurrentBillingPeriod()
    if (!period) return { status: 'success', data: [] }

    const { data, error } = await supabase
      .from('billing')
      .select(`
        billing_id,
        meter_account_id,
        consumer_id,
        reading_period_id,
        current_billing,
        previous_balance,
        penalty_amount,
        total_billing,
        remaining_balance,
        created_at,
        reading_periods:reading_period_id (
          period_start,
          period_end,
          due_date
        ),
        billing_status:billing_status_id (
          billing_status_id,
          billing_status_name
        ),
        meter_account:meter_account_id (
          meter_account_id,
          zone:zone_id (
            zone_id,
            zone_name,
            barangay:barangay_id (
              barangay_id,
              barangay_name
            )
          ),
          classification:classification_id (
            classification_id,
            classification_name
          )
        ),
        consumption:consumption_id (
          consumption_id,
          previous_reading,
          present_reading,
          consumption,
          reading_id
        )
      `)
      .eq('reading_period_id', period.reading_period_id)
      .order('created_at', { ascending: false })

    if (error) throw error
    if (!data?.length) return { status: 'success', data: [] }

    const allBillingIds = data.map((r: any) => r.billing_id)

    const { data: allMeterCharges } = await supabase
      .from('meter_installment_charges')
      .select('billing_id, amount')
      .in('billing_id', allBillingIds)

    const meterChargeMap = new Map<string, number>()
    for (const mc of allMeterCharges ?? []) {
      meterChargeMap.set(mc.billing_id, (meterChargeMap.get(mc.billing_id) ?? 0) + Number(mc.amount))
    }

    const uniqueConsumerIds = [...new Set(data.map((r: any) => r.consumer_id))]
    const { data: allConsumers } = await supabase
      .from('consumers')
      .select('consumer_id, account_name')
      .in('consumer_id', uniqueConsumerIds)

    const consumerMap = new Map<string, any>(
      (allConsumers ?? []).map((c) => [c.consumer_id, c])
    )

    const consumptionIds = data
      .map((r: any) => unwrap<any>(r.consumption)?.consumption_id)
      .filter(Boolean)

    const { data: allBreakdowns } = await supabase
      .from('billing_community_breakdowns')
      .select('consumption_id, community_charge_id, units_used, subtotal')
      .in('consumption_id', consumptionIds)

    const breakdownsByConsumption = new Map<string, any[]>()
    for (const b of allBreakdowns ?? []) {
      const arr = breakdownsByConsumption.get(b.consumption_id) ?? []
      arr.push(b)
      breakdownsByConsumption.set(b.consumption_id, arr)
    }

    const classificationIds = [
      ...new Set(
        data
          .map((r: any) => unwrap<any>(unwrap<any>(r.meter_account)?.classification)?.classification_id)
          .filter(Boolean)
      ),
    ]

    const { data: allTiers } = await supabase
      .from('community_charges')
      .select('classification_id, community_charge_id, min_consumption, max_consumption, multiplier')
      .in('classification_id', classificationIds)
      .order('min_consumption', { ascending: true })

    const tiersByClassification = new Map<string, any[]>()
    for (const t of allTiers ?? []) {
      const arr = tiersByClassification.get(t.classification_id) ?? []
      arr.push(t)
      tiersByClassification.set(t.classification_id, arr)
    }

    const meterAccountIds = data.map((r: any) => r.meter_account_id).filter(Boolean)
    const { data: allMeters } = await supabase
      .from('meters')
      .select('meter_account_id, meter_serial_no')
      .in('meter_account_id', meterAccountIds)

    const meterMap = new Map<string, any>(
      (allMeters ?? []).map((m) => [m.meter_account_id, m])
    )

    const readingPeriodIds = data.map((r: any) => r.reading_period_id).filter(Boolean)
    const { data: allMeterReadings } = await supabase
      .from('meter_readings')
      .select(`
        meter_account_id,
        reading_period_id,
        reading_status:reading_status_id (
          status_code
        )
      `)
      .in('meter_account_id', meterAccountIds)
      .in('reading_period_id', readingPeriodIds)

    const readingStatusMap = new Map<string, string>()
    for (const mr of allMeterReadings ?? []) {
      const key = `${mr.meter_account_id}_${mr.reading_period_id}`
      const status = unwrap<any>(mr.reading_status)
      readingStatusMap.set(key, status?.status_code || '')
    }

    const records: BillingRecord[] = []

    for (const row of data) {
      const billingStatus = unwrap<any>(row.billing_status)
      const meterAccount  = unwrap<any>(row.meter_account)
      const consumption   = unwrap<any>(row.consumption)
      const periodData    = unwrap<any>(row.reading_periods)

      if (!billingStatus || !meterAccount || !consumption) continue

      const zone           = unwrap<any>(meterAccount.zone)
      const classification = unwrap<any>(meterAccount.classification)

      if (!zone || !classification) continue

      const barangay     = unwrap<any>(zone.barangay)
      const consumerData = consumerMap.get(row.consumer_id)
      if (!consumerData) continue

      const tiers  = tiersByClassification.get(classification.classification_id) ?? []
      const bdRows = breakdownsByConsumption.get(consumption.consumption_id)     ?? []

      const breakdowns: BillingBreakdownRow[] = tiers.map((tier: any, idx: number) => {
        const matched = bdRows.find((b: any) => b.community_charge_id === tier.community_charge_id)
        return {
          community_charge_id: tier.community_charge_id,
          block_order:         idx + 1,
          min_consumption:     tier.min_consumption,
          max_consumption:     tier.max_consumption,
          rate_per_unit:       tier.multiplier,
          units_used:          matched?.units_used ?? 0,
          subtotal:            matched?.subtotal   ?? 0,
          reached:             !!matched,
        }
      })

      const meter = meterMap.get(row.meter_account_id)
      const meterSerialNo = meter?.meter_serial_no || null
      
      const readingKey = `${row.meter_account_id}_${row.reading_period_id}`
      const statusCode = readingStatusMap.get(readingKey) || ''
      
      let meterIssueStatus: MeterIssueStatus | null = null
      let issueCode: 'DM' | 'SM' | 'WAM' | null = null
      if (statusCode === 'DEFECTIVE') {
        issueCode = 'DM'
      } else if (statusCode === 'STOLEN') {
        issueCode = 'SM'
      } else if (statusCode === 'LEAK_AFTER_METER') {
        issueCode = 'WAM'
      }
      
      if (issueCode) {
        meterIssueStatus = {
          issue_type_name: statusCode,
          issue_code: issueCode,
        }
      }

      // Determine if non-metered based on consumption
      const isNonMetered = !consumption.reading_id

      records.push({
        billing_id:        row.billing_id,
        consumer_id:       row.consumer_id,
        reading_period_id: row.reading_period_id,
        period_start:      periodData?.period_start || '',
        period_end:        periodData?.period_end || '',
        due_date:          periodData?.due_date || '',
        current_billing:   row.current_billing,
        previous_balance:  row.previous_balance  ?? 0,
        penalty_amount:    Number(row.penalty_amount ?? 0),
        total_billing:     row.total_billing,
        remaining_balance: row.remaining_balance ?? 0,
        meter_charge:      meterChargeMap.get(row.billing_id) ?? 0,
        is_non_metered:    isNonMetered,

        billing_status: {
          billing_status_id:   billingStatus.billing_status_id,
          billing_status_name: billingStatus.billing_status_name,
        },

        meter_account: {
          meter_account_id:   meterAccount.meter_account_id,
          meter_serial_no:   meterSerialNo,
          // REMOVED: meter_type
          consumer: {
            consumer_id: consumerData.consumer_id,
            account_name: consumerData.account_name,
            email: null,
            contact_number: null,
          },
          zone: {
            zone_id:   zone.zone_id,
            zone_name: zone.zone_name,
            barangay: {
              barangay_id:   barangay?.barangay_id   ?? '',
              barangay_name: barangay?.barangay_name ?? '',
            },
          },
          classification: {
            classification_id:   classification.classification_id,
            classification_name: classification.classification_name,
          },
        },

        consumption: {
          consumption_id:   consumption.consumption_id,
          previous_reading: consumption.previous_reading,
          present_reading:  consumption.present_reading,
          consumption:      consumption.consumption,
          reading_id:       consumption.reading_id ?? null,
        },

        breakdowns,
        meter_serial_no: meterSerialNo,
        meter_issue_status: meterIssueStatus,
      })
    }

    return { status: 'success', data: records }
  } catch (err) {
    console.error('[getAllBillingsForPrint]', err)
    return { status: 'error', message: 'Failed to load billing records' }
  }
}

// ─── Get payments by billing ID ───────────────────────────────────────────────

export async function getPaymentsByBillingId(billingId: string) {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('billing_payments')
      .select(`
        billing_payment_id,
        billing_id,
        amount_paid,
        payment:payment_id (
          payment_id,
          receipt_number,
          payment_date,
          recieved_by,
          users:recieved_by (
            first_name,
            last_name
          )
        )
      `)
      .eq('billing_id', billingId)
      .order('created_at', { ascending: true })

    if (error) throw error

    const payments: PaymentTransaction[] = (data ?? []).map((row: any) => {
      const paymentData = unwrap<any>(row.payment)
      const userData    = unwrap<any>(paymentData?.users)

      return {
        payment_id:     paymentData?.payment_id     ?? '',
        billing_id:     row.billing_id,
        amount_paid:    Number(row.amount_paid),
        receipt_number: paymentData?.receipt_number ?? '',
        payment_date:   paymentData?.payment_date   ?? '',
        received_by:    userData
          ? `${userData.first_name} ${userData.last_name}`
          : 'Unknown',
      }
    })

    return { status: 'success', data: payments }
  } catch (err) {
    console.error('[getPaymentsByBillingId]', err)
    return { status: 'error', data: [] as PaymentTransaction[], message: 'Failed to load payment records' }
  }
}