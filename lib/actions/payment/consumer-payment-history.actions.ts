// lib/actions/payment/consumer-payment-history.actions.ts

'use server'

import { createClient } from '@/lib/supabase/server'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConsumerPaymentRecord {
  receipt_id: string
  receipt_number: string
  payment_type: string
  amount: number
  payment_date: string
  processed_by: {
    user_id: string
    first_name: string
    last_name: string
  } | null
  meter_account: {
    meter_account_id: string
    meter_serial_no: string | null
    classification_name: string
    zone_name: string
    barangay_name: string
  } | null
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

// ─── Action ───────────────────────────────────────────────────────────────────

export async function getConsumerPaymentHistory(): Promise<{
  status: 'success' | 'error' | 'unauthenticated'
  data?: ConsumerPaymentRecord[]
  message?: string
}> {
  const supabase = await createClient()

  try {
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return { status: 'unauthenticated', message: 'No active session found.' }
    }

    const consumerId = user.id

    // ── Step 1: Get all meter_accounts for this consumer ────────────────────────
    const { data: meterAccounts, error: maErr } = await supabase
      .from('meter_accounts')
      .select(`
        meter_account_id,
        meters ( meter_serial_no, created_at ),
        classification:classification_id (
          classification_id,
          classification_name
        ),
        zone:zone_id (
          zone_id,
          zone_name,
          barangay:barangay_id (
            barangay_id,
            barangay_name
          )
        )
      `)
      .eq('consumer_id', consumerId)

    if (maErr) {
      console.error('[getConsumerPaymentHistory] Meter accounts error:', maErr)
      return { status: 'error', message: 'Failed to fetch meter accounts.' }
    }

    if (!meterAccounts?.length) {
      return { status: 'success', data: [] }
    }

    // Build meter account map
    const meterAccountMap = new Map<string, ConsumerPaymentRecord['meter_account']>()
    const meterAccountIds = meterAccounts.map(ma => ma.meter_account_id)

    for (const ma of meterAccounts) {
      const classification = unwrap(ma.classification)
      const zone = unwrap(ma.zone)
      const barangay = unwrap(zone?.barangay)
      
      meterAccountMap.set(ma.meter_account_id, {
        meter_account_id: ma.meter_account_id,
        meter_serial_no: latestMeterSerialFromMeters(ma.meters),
        classification_name: classification?.classification_name ?? '',
        zone_name: zone?.zone_name ?? '',
        barangay_name: barangay?.barangay_name ?? '',
      })
    }

    // ── Step 2: Get payment IDs from billing_payments ──────────────────────────
    const billingPaymentIds: string[] = []
    const billingAmounts = new Map<string, number>()
    const billingMeterAccounts = new Map<string, string>()

    const { data: billingPayments } = await supabase
      .from('billing_payments')
      .select(`
        payment_id,
        amount_paid,
        billing:billing_id (
          meter_account_id
        )
      `)
      .in('billing.meter_account_id', meterAccountIds)

    for (const bp of billingPayments ?? []) {
      const billing = unwrap(bp.billing)
      if (billing?.meter_account_id && meterAccountMap.has(billing.meter_account_id)) {
        billingPaymentIds.push(bp.payment_id)
        billingAmounts.set(bp.payment_id, Number(bp.amount_paid))
        billingMeterAccounts.set(bp.payment_id, billing.meter_account_id)
      }
    }

    // ── Step 3: Get payment IDs from connection_fee_payments ──────────────────
    // FIX: connection_fee_payments has meter_account_id directly, not application_id
    const connectionFeePaymentIds: string[] = []
    const connectionFeeAmounts = new Map<string, number>()
    const connectionFeeMeterAccounts = new Map<string, string>()

    const { data: connectionFeePayments } = await supabase
      .from('connection_fee_payments')
      .select(`
        payment_id,
        amount_paid,
        meter_account_id,
        created_at
      `)
      .in('meter_account_id', meterAccountIds)

    for (const cfp of connectionFeePayments ?? []) {
      const meterAccountId = cfp.meter_account_id
      if (meterAccountId && meterAccountMap.has(meterAccountId)) {
        connectionFeePaymentIds.push(cfp.payment_id)
        connectionFeeAmounts.set(cfp.payment_id, Number(cfp.amount_paid))
        connectionFeeMeterAccounts.set(cfp.payment_id, meterAccountId)
      }
    }

    // ── Step 4: Get payment IDs from reconnection_payments ────────────────────
    const reconnectionPaymentIds: string[] = []
    const reconnectionAmounts = new Map<string, number>()
    const reconnectionMeterAccounts = new Map<string, string>()

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

    for (const rp of reconnectionPayments ?? []) {
      const reconnection = unwrap(rp.reconnection)
      const disconnection = unwrap(reconnection?.disconnection)
      if (disconnection?.meter_account_id && meterAccountMap.has(disconnection.meter_account_id)) {
        reconnectionPaymentIds.push(rp.payment_id)
        reconnectionAmounts.set(rp.payment_id, Number(rp.amount_paid))
        reconnectionMeterAccounts.set(rp.payment_id, disconnection.meter_account_id)
      }
    }

    // Combine all payment IDs
    const allPaymentIds = [
      ...billingPaymentIds,
      ...connectionFeePaymentIds,
      ...reconnectionPaymentIds,
    ]

    if (allPaymentIds.length === 0) {
      return { status: 'success', data: [] }
    }

    // ── Step 5: Get payment details from the payments table ────────────────────
    const { data: payments, error: paymentErr } = await supabase
      .from('payments')
      .select(`
        payment_id,
        receipt_number,
        payment_date,
        payment_type_id,
        created_at,
        payment_type:payment_type_id (
          payment_type_id,
          payment_type_name
        ),
        collected_by:recieved_by (
          user_id,
          first_name,
          last_name
        )
      `)
      .in('payment_id', allPaymentIds)
      .order('payment_date', { ascending: false })

    if (paymentErr) {
      console.error('[getConsumerPaymentHistory] Payments error:', paymentErr)
      return { status: 'error', message: 'Failed to fetch payment details.' }
    }

    if (!payments?.length) {
      return { status: 'success', data: [] }
    }

    // ── Step 6: Get payment type names ──────────────────────────────────────────
    const paymentTypeIds = [...new Set(payments.map(p => p.payment_type_id))]
    const { data: paymentTypes } = await supabase
      .from('payment_type')
      .select('payment_type_id, payment_type_name')
      .in('payment_type_id', paymentTypeIds)

    const paymentTypeMap = new Map<string, string>()
    for (const pt of paymentTypes ?? []) {
      paymentTypeMap.set(pt.payment_type_id, pt.payment_type_name)
    }

    // ── Step 7: Assemble results ──────────────────────────────────────────────
    const results: ConsumerPaymentRecord[] = []

    for (const payment of payments) {
      let amount = 0
      let meterAccountId = ''
      let paymentType = ''

      // Determine which payment source this belongs to
      if (billingAmounts.has(payment.payment_id)) {
        amount = billingAmounts.get(payment.payment_id) || 0
        meterAccountId = billingMeterAccounts.get(payment.payment_id) || ''
        paymentType = 'billing'
      } else if (connectionFeeAmounts.has(payment.payment_id)) {
        amount = connectionFeeAmounts.get(payment.payment_id) || 0
        meterAccountId = connectionFeeMeterAccounts.get(payment.payment_id) || ''
        paymentType = 'connection fee'
      } else if (reconnectionAmounts.has(payment.payment_id)) {
        amount = reconnectionAmounts.get(payment.payment_id) || 0
        meterAccountId = reconnectionMeterAccounts.get(payment.payment_id) || ''
        paymentType = 'reconnection'
      }

      if (amount <= 0 || !meterAccountId) continue

      const meterAccount = meterAccountMap.get(meterAccountId)
      if (!meterAccount) continue

      const collector = unwrap(payment.collected_by)

      // Use the actual payment type name from the payment_type table
      const actualPaymentType = paymentTypeMap.get(payment.payment_type_id) || paymentType

      results.push({
        receipt_id: payment.payment_id,
        receipt_number: payment.receipt_number,
        payment_type: actualPaymentType,
        amount: amount,
        payment_date: payment.payment_date,
        processed_by: collector
          ? {
              user_id: collector.user_id,
              first_name: collector.first_name,
              last_name: collector.last_name,
            }
          : null,
        meter_account: meterAccount,
      })
    }

    return { status: 'success', data: results }

  } catch (err) {
    console.error('[getConsumerPaymentHistory]', err)
    return { status: 'error', message: 'An unexpected error occurred.' }
  }
}