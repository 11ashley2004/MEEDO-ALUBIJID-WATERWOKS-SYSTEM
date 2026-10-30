// lib/actions/billing/consumer-billing.actions.ts

'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================================================
// Types
// ============================================================================

export interface ConsumerBillingRecord {
  billing_id:             string
  consumer_id:            string
  meter_account_id:       string
  reading_period_id:      string
  period_start:           string
  period_end:             string
  due_date:               string
  current_billing:        number
  previous_balance:       number
  penalty_amount:         number
  total_billing:          number
  remaining_balance:      number
  meter_charge:           number
  was_overdue:            boolean
  previous_penalty_total: number
  billing_status:         { billing_status_id: string; billing_status_name: string }
  meter_account: {
    meter_account_id: string
    meter_serial_no: string | null
    consumer?: {
      consumer_id: string
      contract_no: string
      account_name: string
      email: string | null
      contact_number: string | null
    }
    classification: { classification_id: string; classification_name: string }
    zone: {
      zone_id: string
      zone_name: string
      barangay: { barangay_id: string; barangay_name: string }
    }
  }
  consumption: {
    consumption_id: string
    previous_reading: number
    present_reading: number
    consumption: number
    reading_id: string | null
  }
  breakdowns: Array<{
    community_charge_id: string
    block_order: number
    min_consumption: number
    max_consumption: number | null
    rate_per_unit: number
    units_used: number
    subtotal: number
    reached: boolean
  }>
  reading?: {
    reading_date: string
  }
  connection?: {
    connection_no: string
  }
  consumer?: {
    consumer_id: string
    contract_no: string
    account_name: string
    email: string | null
    contact_number: string | null
  }
}

export interface BillingViewData extends ConsumerBillingRecord {
  consumer: {
    consumer_id: string
    contract_no: string
    account_name: string
    email: string | null
    contact_number: string | null
  }
}

export interface PaymentTransaction {
  payment_id:     string
  billing_id:     string
  amount_paid:    number
  receipt_number: string
  payment_date:   string
  received_by:    string
}

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

// ============================================================================
// GET ALL — all billings for the authenticated consumer
// ============================================================================

export async function getAllConsumerBillings(): Promise<{
  status: 'success' | 'error' | 'unauthenticated'
  data?: ConsumerBillingRecord[]
  message?: string
}> {
  const supabase = await createClient()

  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return { status: 'unauthenticated', message: 'No active session found.' }
    }

    // ── Consumer identity (Contract No. for list display) ───────────────────
    const { data: consumerRow, error: consumerErr } = await supabase
      .from('consumers')
      .select('consumer_id, contract_no, account_name, email, contact_number')
      .eq('consumer_id', user.id)
      .single()

    if (consumerErr || !consumerRow) {
      console.error('[getAllConsumerBillings] Consumer lookup:', consumerErr)
      return { status: 'error', message: 'Failed to fetch consumer profile.' }
    }

    // ── Get all meter accounts for this consumer ──────────────────────────────
    const { data: meterAccounts, error: maErr } = await supabase
      .from('meter_accounts')
      .select('meter_account_id')
      .eq('consumer_id', user.id)

    if (maErr) {
      console.error('[getAllConsumerBillings] Meter accounts error:', maErr)
      return { status: 'error', message: 'Failed to fetch meter accounts.' }
    }

    if (!meterAccounts?.length) {
      return { status: 'success', data: [] }
    }

    const meterAccountIds = meterAccounts.map(ma => ma.meter_account_id)

    // Same SECURITY DEFINER RPC as admin/clerk view — ensures previous_balance
    // and penalty_amount match after imports (including first reading periods).
    const rpcRows: any[] = []
    for (const meterAccountId of meterAccountIds) {
      const { data, error: rpcErr } = await supabase.rpc('get_billing_records', {
        p_reading_period_id: null,
        p_meter_account_id: meterAccountId,
        p_billing_id: null,
      })
      if (rpcErr) {
        console.error('[getAllConsumerBillings] RPC error:', rpcErr)
        return { status: 'error', message: 'Failed to fetch billing records.' }
      }
      if (Array.isArray(data)) rpcRows.push(...data)
    }

    if (!rpcRows.length) {
      return { status: 'success', data: [] }
    }

    const consumerInfo = {
      consumer_id: consumerRow.consumer_id,
      contract_no: consumerRow.contract_no,
      account_name: consumerRow.account_name,
      email: consumerRow.email,
      contact_number: consumerRow.contact_number,
    }

    const results: ConsumerBillingRecord[] = rpcRows.map((row: any) => {
      const previousBalance = Number(row.previous_balance ?? 0)
      const penaltyAmount = Number(row.penalty_amount ?? 0)
      const meterCharge = Number(row.meter_charge ?? 0)
      const consumption = row.consumption ?? {}
      const meterAccount = row.meter_account ?? {}
      const classification = meterAccount.classification ?? {}
      const zone = meterAccount.zone ?? {}
      const barangay = zone.barangay ?? {}
      const billingStatus = row.billing_status ?? {}

      const rawSerial = meterAccount.meter_serial_no ?? row.meter_serial_no ?? null
      const meterSerialNo =
        rawSerial && !String(rawSerial).startsWith('PENDING-') ? rawSerial : null

      const breakdownsList: ConsumerBillingRecord['breakdowns'] = (
        Array.isArray(row.breakdowns) ? row.breakdowns : []
      ).map((tier: any, idx: number) => ({
        community_charge_id: tier.community_charge_id,
        block_order: Number(tier.block_order ?? idx + 1),
        min_consumption: Number(tier.min_consumption ?? 0),
        max_consumption: tier.max_consumption != null ? Number(tier.max_consumption) : null,
        rate_per_unit: Number(tier.rate_per_unit ?? 0),
        units_used: Number(tier.units_used ?? 0),
        subtotal: Number(tier.subtotal ?? 0),
        reached: Boolean(tier.reached),
      }))

      return {
        billing_id: row.billing_id,
        consumer_id: row.consumer_id || consumerRow.consumer_id,
        meter_account_id: meterAccount.meter_account_id || '',
        reading_period_id: row.reading_period_id,
        period_start: row.period_start || '',
        period_end: row.period_end || '',
        due_date: row.due_date || '',
        current_billing: Number(row.current_billing ?? 0),
        previous_balance: previousBalance,
        penalty_amount: penaltyAmount,
        total_billing: Number(row.total_billing ?? 0),
        remaining_balance: Number(row.remaining_balance ?? 0),
        meter_charge: meterCharge,
        was_overdue: previousBalance > 0,
        previous_penalty_total: penaltyAmount,
        billing_status: {
          billing_status_id: billingStatus.billing_status_id || '',
          billing_status_name: billingStatus.billing_status_name || 'unpaid',
        },
        meter_account: {
          meter_account_id: meterAccount.meter_account_id || '',
          meter_serial_no: meterSerialNo,
          consumer: consumerInfo,
          classification: {
            classification_id: classification.classification_id || '',
            classification_name: classification.classification_name || '',
          },
          zone: {
            zone_id: zone.zone_id || '',
            zone_name: zone.zone_name || '',
            barangay: {
              barangay_id: barangay.barangay_id || '',
              barangay_name: barangay.barangay_name || '',
            },
          },
        },
        consumer: consumerInfo,
        consumption: {
          consumption_id: consumption.consumption_id || '',
          previous_reading: Number(consumption.previous_reading ?? 0),
          present_reading: Number(consumption.present_reading ?? 0),
          consumption: Number(consumption.consumption ?? 0),
          reading_id: consumption.reading_id ?? null,
        },
        breakdowns: breakdownsList,
        reading: {
          reading_date: row.reading_date || '',
        },
        connection: {
          connection_no: '',
        },
      }
    })

    results.sort((a, b) => {
      const aStart = a.period_start || ''
      const bStart = b.period_start || ''
      if (aStart !== bStart) return bStart.localeCompare(aStart)
      return b.billing_id.localeCompare(a.billing_id)
    })

    // Existing unpaid bills never fire Realtime — evaluate when consumer opens Billing
    try {
      const { evaluateConsumerOpenBillingsForDisconnectionNotify } = await import(
        '@/lib/actions/disconnection-notice/billing-disconnection-notify.actions'
      )
      const notifyScan = await evaluateConsumerOpenBillingsForDisconnectionNotify(
        consumerRow.consumer_id,
      )
      console.log('[getAllConsumerBillings] disconnection notify scan', notifyScan)
    } catch (notifyErr) {
      console.error('[getAllConsumerBillings] disconnection notify scan failed', notifyErr)
    }

    return { status: 'success', data: results }

  } catch (error) {
    console.error('[getAllConsumerBillings]', error)
    return { status: 'error', message: 'Failed to fetch billing records.' }
  }
}

// ============================================================================
// GET BY ID — single billing record (for view dialog)
// ============================================================================

export async function getConsumerBillingById(billingId: string): Promise<{
  status: 'success' | 'error' | 'unauthenticated'
  data?: BillingViewData
  message?: string
}> {
  const supabase = await createClient()

  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return { status: 'unauthenticated', message: 'No active session found.' }
    }

    // Same SECURITY DEFINER RPC used by admin/clerk so previous_balance
    // (and other billing amounts) match after imports.
    const { data, error } = await supabase.rpc('get_billing_records', {
      p_reading_period_id: null,
      p_meter_account_id: null,
      p_billing_id: billingId,
    })

    if (error) {
      console.error('[getConsumerBillingById] RPC error:', error)
      return { status: 'error', message: 'Failed to fetch billing record.' }
    }

    const row = (data ?? [])[0] as any
    if (!row) {
      return { status: 'error', message: 'Billing record not found.' }
    }

    const ownerId =
      row.consumer_id ??
      row.meter_account?.consumer?.consumer_id ??
      null

    if (!ownerId || ownerId !== user.id) {
      return { status: 'error', message: 'Unauthorized.' }
    }

    const previousBalance = Number(row.previous_balance ?? 0)
    const penaltyAmount = Number(row.penalty_amount ?? 0)
    const meterCharge = Number(row.meter_charge ?? 0)
    const consumption = row.consumption ?? {}
    const meterAccount = row.meter_account ?? {}
    const consumerFromRpc = meterAccount.consumer ?? {}
    const classification = meterAccount.classification ?? {}
    const zone = meterAccount.zone ?? {}
    const barangay = zone.barangay ?? {}
    const billingStatus = row.billing_status ?? {}

    const consumerInfo = {
      consumer_id: consumerFromRpc.consumer_id || ownerId,
      contract_no: consumerFromRpc.contract_no || '',
      account_name: consumerFromRpc.account_name || '',
      email: consumerFromRpc.email ?? null,
      contact_number: consumerFromRpc.contact_number ?? null,
    }

    const rawSerial = meterAccount.meter_serial_no ?? row.meter_serial_no ?? null
    const meterSerialNo =
      rawSerial && !String(rawSerial).startsWith('PENDING-') ? rawSerial : null

    const breakdownsList: ConsumerBillingRecord['breakdowns'] = (
      Array.isArray(row.breakdowns) ? row.breakdowns : []
    ).map((tier: any, idx: number) => ({
      community_charge_id: tier.community_charge_id,
      block_order: Number(tier.block_order ?? idx + 1),
      min_consumption: Number(tier.min_consumption ?? 0),
      max_consumption: tier.max_consumption != null ? Number(tier.max_consumption) : null,
      rate_per_unit: Number(tier.rate_per_unit ?? 0),
      units_used: Number(tier.units_used ?? 0),
      subtotal: Number(tier.subtotal ?? 0),
      reached: Boolean(tier.reached),
    }))

    const result: BillingViewData = {
      billing_id: row.billing_id,
      consumer_id: ownerId,
      meter_account_id: meterAccount.meter_account_id || '',
      reading_period_id: row.reading_period_id,
      period_start: row.period_start || '',
      period_end: row.period_end || '',
      due_date: row.due_date || '',
      current_billing: Number(row.current_billing ?? 0),
      previous_balance: previousBalance,
      penalty_amount: penaltyAmount,
      total_billing: Number(row.total_billing ?? 0),
      remaining_balance: Number(row.remaining_balance ?? 0),
      meter_charge: meterCharge,
      was_overdue: previousBalance > 0,
      previous_penalty_total: penaltyAmount,
      billing_status: {
        billing_status_id: billingStatus.billing_status_id || '',
        billing_status_name: billingStatus.billing_status_name || 'unpaid',
      },
      meter_account: {
        meter_account_id: meterAccount.meter_account_id || '',
        meter_serial_no: meterSerialNo,
        consumer: consumerInfo,
        classification: {
          classification_id: classification.classification_id || '',
          classification_name: classification.classification_name || '',
        },
        zone: {
          zone_id: zone.zone_id || '',
          zone_name: zone.zone_name || '',
          barangay: {
            barangay_id: barangay.barangay_id || '',
            barangay_name: barangay.barangay_name || '',
          },
        },
      },
      consumption: {
        consumption_id: consumption.consumption_id || '',
        previous_reading: Number(consumption.previous_reading ?? 0),
        present_reading: Number(consumption.present_reading ?? 0),
        consumption: Number(consumption.consumption ?? 0),
        reading_id: consumption.reading_id ?? null,
      },
      breakdowns: breakdownsList,
      reading: {
        reading_date: row.reading_date || '',
      },
      connection: {
        connection_no: '',
      },
      consumer: consumerInfo,
    }

    return { status: 'success', data: result }
  } catch (error) {
    console.error('[getConsumerBillingById]', error)
    return { status: 'error', message: 'Failed to fetch billing record.' }
  }
}

// ============================================================================
// GET PAYMENTS BY BILLING ID
// ============================================================================

export async function getPaymentsByBillingId(billingId: string): Promise<{
  status: 'success' | 'error'
  data?: PaymentTransaction[]
  message?: string
}> {
  const supabase = await createClient()

  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return { status: 'error', message: 'No active session found.' }
    }

    // Verify billing belongs to this consumer
    const { data: billing, error: billingCheckErr } = await supabase
      .from('billing')
      .select('consumer_id')
      .eq('billing_id', billingId)
      .single()

    if (billingCheckErr || !billing) {
      return { status: 'error', message: 'Billing record not found.' }
    }

    if (billing.consumer_id !== user.id) {
      return { status: 'error', message: 'Unauthorized.' }
    }

    const { data: payments, error: paymentErr } = await supabase
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

    if (paymentErr) {
      console.error('[getPaymentsByBillingId]', paymentErr)
      return { status: 'error', message: 'Failed to load payment records.' }
    }

    const results: PaymentTransaction[] = (payments ?? []).map((row: any) => {
      const paymentData = unwrap(row.payment) as any
      const userData = unwrap(paymentData?.users) as any

      return {
        payment_id: paymentData?.payment_id || '',
        billing_id: row.billing_id,
        amount_paid: Number(row.amount_paid),
        receipt_number: paymentData?.receipt_number || '',
        payment_date: paymentData?.payment_date || '',
        received_by: userData
          ? `${userData.first_name} ${userData.last_name}`
          : 'Unknown',
      }
    })

    return { status: 'success', data: results }
  } catch (error) {
    console.error('[getPaymentsByBillingId]', error)
    return { status: 'error', message: 'Failed to load payment records.' }
  }
}