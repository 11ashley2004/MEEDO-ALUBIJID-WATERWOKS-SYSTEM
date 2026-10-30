'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================================================
// Types
// ============================================================================

export interface ReconnectionChargeItem {
  charge_type_id: string
  charge_name: string
  amount: number
}

export interface ReconnectionLatestPayment {
  receipt_number: string
  amount_paid: number
  payment_date: string
}

export interface ReconnectionFeeRecord {
  reconnection_id: string
  reconnection_no: string
  disconnection_id: string
  outstanding_balance: number
  total_amount: number
  remaining_balance: number
  amount_paid_total: number
  payment_status: string
  reconnection_status: string
  created_at: string
  meter_account: {
    meter_account_id: string
    meter_serial_no: string | null
    consumer: {
      consumer_id: string
      account_name: string
      contact_number: string | null
    }
    zone: {
      zone_id: string
      zone_name: string
      barangay: {
        barangay_id: string
        barangay_name: string
      }
    }
    classification: {
      classification_id: string
      classification_name: string
    }
  }
  charges: ReconnectionChargeItem[]
  latest_payment: ReconnectionLatestPayment | null
}

export interface ReconnectionPaymentResult {
  reconnection_payment_id: string
  receipt_number: string
  amount_paid: number
  is_fully_paid: boolean
  new_payment_status: string
  remaining_balance: number
}

// ============================================================================
// Helpers

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
  if (val == null) return null
  return Array.isArray(val) ? (val[0] ?? null) : val
}

function generateReceiptNumber(): string {
  const year = new Date().getFullYear()
  const random = Math.floor(10000 + Math.random() * 90000)
  return `OR-${year}-${random}`
}

const roundToCents = (num: number): number => Math.round(num * 100) / 100

async function getBillingStatusId(supabase: any, statusName: string): Promise<string> {
  const { data, error } = await supabase
    .from('billing_status')
    .select('billing_status_id')
    .ilike('billing_status_name', statusName)
    .single()
  if (error || !data) throw new Error(`Billing status "${statusName}" not found`)
  return data.billing_status_id
}

// Same as above, but returns null instead of throwing (for optional statuses)
async function getBillingStatusIdOrNull(supabase: any, statusName: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('billing_status')
    .select('billing_status_id')
    .ilike('billing_status_name', statusName)
    .maybeSingle()
  if (error || !data) return null
  return data.billing_status_id
}

async function getPaymentTypeId(supabase: any, typeName: string): Promise<string> {
  const { data, error } = await supabase
    .from('payment_type')
    .select('payment_type_id')
    .ilike('payment_type_name', typeName)
    .single()
  if (error || !data) {
    throw new Error(
      `Payment type "${typeName}" not found. Seed it first with: ` +
      `INSERT INTO public.payment_type (payment_type_name, description) VALUES ('${typeName}', 'Payment for service reconnection fee');`,
    )
  }
  return data.payment_type_id
}

async function getChargesForReconnection(
  supabase: any,
  reconnectionId: string,
): Promise<ReconnectionChargeItem[]> {
  try {
    const { data: charges } = await supabase
      .from('reconnection_charges')
      .select(`
        amount,
        charge_type:charge_type_id (
          charge_type_id,
          charge_name
        )
      `)
      .eq('reconnection_id', reconnectionId)

    if (!charges) return []

    return charges.map((c: any) => {
      const chargeType = unwrap(c.charge_type)
      return {
        charge_type_id: chargeType?.charge_type_id ?? '',
        charge_name: chargeType?.charge_name ?? 'Charge',
        amount: Number(c.amount),
      }
    })
  } catch (err) {
    console.error('[getChargesForReconnection]', err)
    return []
  }
}

// Returns the most recent payment (receipt no., amount, date) per reconnection.
async function getLatestPayments(
  supabase: any,
  reconnectionIds: string[],
): Promise<Map<string, ReconnectionLatestPayment>> {
  const map = new Map<string, ReconnectionLatestPayment>()
  if (reconnectionIds.length === 0) return map

  const { data, error } = await supabase
    .from('reconnection_payments')
    .select(`
      reconnection_id,
      amount_paid,
      created_at,
      payment:payment_id (
        receipt_number,
        payment_date
      )
    `)
    .in('reconnection_id', reconnectionIds)
    .order('created_at', { ascending: false })

  if (error || !data) {
    console.error('[getLatestPayments]', error)
    return map
  }

  // Rows are newest-first, so the first one seen per reconnection is the latest
  for (const row of data as any[]) {
    if (map.has(row.reconnection_id)) continue
    const payment = unwrap(row.payment) as any
    if (!payment) continue
    map.set(row.reconnection_id, {
      receipt_number: payment.receipt_number,
      amount_paid: Number(row.amount_paid),
      payment_date: payment.payment_date,
    })
  }
  return map
}

// ============================================================================
// GET — All reconnection fee records (Unpaid, Partial, Paid, Forwarded)
// ============================================================================

export async function getAllPendingReconnectionFees(): Promise<{
  status: string
  data?: ReconnectionFeeRecord[]
  message?: string
}> {
  const supabase = await createClient()

  try {
    // 1. Resolve payment status IDs. 'unpaid' and 'partial' are required;
    //    'paid' and 'forwarded' are optional so the page can show receipts
    //    and forwarded records without breaking if a status isn't seeded.
    const unpaidStatusId = await getBillingStatusId(supabase, 'unpaid')
    const partialStatusId = await getBillingStatusId(supabase, 'partial')
    const paidStatusId = await getBillingStatusIdOrNull(supabase, 'paid')
    const forwardedStatusId = await getBillingStatusIdOrNull(supabase, 'forwarded')

    const statusIds = [
      unpaidStatusId,
      partialStatusId,
      ...(paidStatusId ? [paidStatusId] : []),
      ...(forwardedStatusId ? [forwardedStatusId] : []),
    ]

    // 2. Fetch the reconnections
    const { data: reconnections, error } = await supabase
      .from('reconnections')
      .select(`
        reconnection_id,
        reconnection_no,
        disconnection_id,
        outstanding_balance,
        total_amount,
        remaining_balance,
        created_at,
        payment_status:payment_status_id (
          billing_status_name
        ),
        reconnection_status:reconnection_status_id (
          status_name
        ),
        disconnection:disconnection_id (
          meter_account:meter_account_id (
            meter_account_id,
            consumer:consumer_id (
              consumer_id,
              account_name,
              contact_number
            ),
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
          )
        )
      `)
      .in('payment_status_id', statusIds)
      .order('created_at', { ascending: false })

    if (error) throw error

    if (!reconnections || reconnections.length === 0) {
      return { status: 'success', data: [] }
    }

    const reconnectionIds = reconnections.map((r: any) => r.reconnection_id)

    // 3. Batched queries to avoid N+1 problems
    // (A) Sum of any prior payments
    const { data: allPayments } = await supabase
      .from('reconnection_payments')
      .select('reconnection_id, amount_paid')
      .in('reconnection_id', reconnectionIds)

    const paidByReconnection = new Map<string, number>()
    allPayments?.forEach((p: any) => {
      paidByReconnection.set(
        p.reconnection_id,
        (paidByReconnection.get(p.reconnection_id) ?? 0) + Number(p.amount_paid),
      )
    })

    // (B) All related reconnection charges
    const { data: allCharges } = await supabase
      .from('reconnection_charges')
      .select(`
        reconnection_id,
        amount,
        charge_type:charge_type_id (
          charge_type_id,
          charge_name
        )
      `)
      .in('reconnection_id', reconnectionIds)

    const chargesMap = new Map<string, ReconnectionChargeItem[]>()
    allCharges?.forEach((c: any) => {
      const chargeType = unwrap(c.charge_type)
      const item: ReconnectionChargeItem = {
        charge_type_id: chargeType?.charge_type_id ?? '',
        charge_name: chargeType?.charge_name ?? 'Charge',
        amount: Number(c.amount),
      }
      const existing = chargesMap.get(c.reconnection_id) ?? []
      chargesMap.set(c.reconnection_id, [...existing, item])
    })

    // (C) Latest payment per reconnection (used for receipt printing)
    const latestPaymentMap = await getLatestPayments(supabase, reconnectionIds)

    // 4. Map the flat results in-memory
    const results: ReconnectionFeeRecord[] = reconnections.map((r: any) => {
      const paymentStatus = unwrap(r.payment_status) as any
      const reconnectionStatus = unwrap(r.reconnection_status) as any
      const disconnection = unwrap(r.disconnection) as any
      const meterAccount = unwrap(disconnection?.meter_account) as any
      const consumer = unwrap(meterAccount?.consumer) as any
      const zone = unwrap(meterAccount?.zone) as any
      const barangay = unwrap(zone?.barangay) as any
      const classification = unwrap(meterAccount?.classification) as any

      return {
        reconnection_id: r.reconnection_id,
        reconnection_no: r.reconnection_no,
        disconnection_id: r.disconnection_id,
        outstanding_balance: Number(r.outstanding_balance),
        total_amount: Number(r.total_amount),
        remaining_balance: Number(r.remaining_balance),
        amount_paid_total: paidByReconnection.get(r.reconnection_id) ?? 0,
        payment_status: paymentStatus?.billing_status_name ?? 'unpaid',
        reconnection_status: reconnectionStatus?.status_name ?? 'Pending Reconnection',
        created_at: r.created_at,
        meter_account: {
          meter_account_id: meterAccount?.meter_account_id ?? '',
          meter_serial_no: meterAccount?.meter_serial_no ?? '',
          consumer: {
            consumer_id: consumer?.consumer_id ?? '',
            account_name: consumer?.account_name ?? '',
            contact_number: consumer?.contact_number ?? null,
          },
          zone: {
            zone_id: zone?.zone_id ?? '',
            zone_name: zone?.zone_name ?? '',
            barangay: {
              barangay_id: barangay?.barangay_id ?? '',
              barangay_name: barangay?.barangay_name ?? '',
            },
          },
          classification: {
            classification_id: classification?.classification_id ?? '',
            classification_name: classification?.classification_name ?? '',
          },
        },
        charges: chargesMap.get(r.reconnection_id) ?? [],
        latest_payment: latestPaymentMap.get(r.reconnection_id) ?? null,
      }
    })

    return { status: 'success', data: results }
  } catch (err: any) {
    console.error('[getAllPendingReconnectionFees]', err)
    return { status: 'error', message: err?.message ?? 'Failed to load reconnection fees' }
  }
}

// ============================================================================
// GET — Single reconnection fee record by ID
// ============================================================================

export async function getReconnectionFeeById(reconnectionId: string): Promise<{
  status: string
  data?: ReconnectionFeeRecord
  message?: string
}> {
  const supabase = await createClient()

  try {
    const { data: reconnection, error } = await supabase
      .from('reconnections')
      .select(`
        reconnection_id,
        reconnection_no,
        disconnection_id,
        outstanding_balance,
        total_amount,
        remaining_balance,
        created_at,
        payment_status:payment_status_id (
          billing_status_name
        ),
        reconnection_status:reconnection_status_id (
          status_name
        ),
        disconnection:disconnection_id (
          meter_account:meter_account_id (
            meter_account_id,
            consumer:consumer_id (
              consumer_id,
              account_name,
              contact_number
            ),
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
          )
        )
      `)
      .eq('reconnection_id', reconnectionId)
      .single()

    if (error || !reconnection) {
      return { status: 'error', message: 'Reconnection record not found' }
    }

    const paymentStatus = unwrap(reconnection.payment_status) as any
    const reconnectionStatus = unwrap(reconnection.reconnection_status) as any
    const disconnection = unwrap(reconnection.disconnection) as any
    const meterAccount = unwrap(disconnection?.meter_account) as any
    const consumer = unwrap(meterAccount?.consumer) as any
    const zone = unwrap(meterAccount?.zone) as any
    const barangay = unwrap(zone?.barangay) as any
    const classification = unwrap(meterAccount?.classification) as any

    // Get total paid for this reconnection
    const { data: payments } = await supabase
      .from('reconnection_payments')
      .select('amount_paid')
      .eq('reconnection_id', reconnectionId)

    const amountPaidTotal =
      payments?.reduce((sum: number, p: any) => sum + Number(p.amount_paid), 0) ?? 0

    const charges = await getChargesForReconnection(supabase, reconnectionId)
    const latestPayment =
      (await getLatestPayments(supabase, [reconnectionId])).get(reconnectionId) ?? null

    const result: ReconnectionFeeRecord = {
      reconnection_id: reconnection.reconnection_id,
      reconnection_no: reconnection.reconnection_no,
      disconnection_id: reconnection.disconnection_id,
      outstanding_balance: Number(reconnection.outstanding_balance),
      total_amount: Number(reconnection.total_amount),
      remaining_balance: Number(reconnection.remaining_balance),
      amount_paid_total: amountPaidTotal,
      payment_status: paymentStatus?.billing_status_name ?? 'unpaid',
      reconnection_status: reconnectionStatus?.status_name ?? 'Pending Reconnection',
      created_at: reconnection.created_at,
      meter_account: {
        meter_account_id: meterAccount?.meter_account_id ?? '',
        meter_serial_no: meterAccount?.meter_serial_no ?? '',
        consumer: {
          consumer_id: consumer?.consumer_id ?? '',
          account_name: consumer?.account_name ?? '',
          contact_number: consumer?.contact_number ?? null,
        },
        zone: {
          zone_id: zone?.zone_id ?? '',
          zone_name: zone?.zone_name ?? '',
          barangay: {
            barangay_id: barangay?.barangay_id ?? '',
            barangay_name: barangay?.barangay_name ?? '',
          },
        },
        classification: {
          classification_id: classification?.classification_id ?? '',
          classification_name: classification?.classification_name ?? '',
        },
      },
      charges,
      latest_payment: latestPayment,
    }

    return { status: 'success', data: result }
  } catch (err: any) {
    console.error('[getReconnectionFeeById]', err)
    return { status: 'error', message: err?.message ?? 'Failed to load reconnection fee' }
  }
}

// ============================================================================
// Forwarded installment finalization
// ============================================================================

async function getInstallmentStatusIdByName(supabase: any, statusCode: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('installment_status')
    .select('installment_status_id')
    .eq('status_code', statusCode)
    .single()

  if (error || !data) return null
  return data.installment_status_id
}

async function getForwardedInstallmentIds(supabase: any, reconnectionId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('reconnection_charges')
    .select('source_installment_id')
    .eq('reconnection_id', reconnectionId)
    .not('source_installment_id', 'is', null)

  if (error || !data) return []
  return data.map((r: any) => r.source_installment_id).filter(Boolean)
}

// Call whenever a reconnection payment is recorded — paid OR partial.
// If this reconnection carries a forwarded installment balance (from a
// prior disconnection), close it out: mark it COMPLETED and zero its
// remaining_balance. Guarded to only touch installments still sitting in
// FORWARDED, so it's safe to call repeatedly and never re-finalizes one
// that's already COMPLETED or was reverted elsewhere.
async function finalizeForwardedInstallments(supabase: any, reconnectionId: string) {
  const ids = await getForwardedInstallmentIds(supabase, reconnectionId)
  if (ids.length === 0) return

  const completedStatusId = await getInstallmentStatusIdByName(supabase, 'COMPLETED')
  const forwardedStatusId = await getInstallmentStatusIdByName(supabase, 'FORWARDED')

  if (!completedStatusId) {
    console.error('[finalizeForwardedInstallments] Installment status "COMPLETED" is not configured')
    return
  }
  if (!forwardedStatusId) {
    console.error('[finalizeForwardedInstallments] Installment status "FORWARDED" is not configured')
    return
  }

  const { error } = await supabase
    .from('meter_installments')
    .update({
      status_id: completedStatusId,
      remaining_balance: 0,
      updated_at: new Date().toISOString(),
    })
    .in('installment_id', ids)
    .eq('status_id', forwardedStatusId)

  if (error) {
    console.error('[finalizeForwardedInstallments] Error finalizing forwarded installment(s):', error)
  }
}

// ============================================================================
// POST — Process reconnection fee payment
// ============================================================================

export async function processReconnectionPayment(payload: {
  reconnection_id: string
  amount_paid: number
}): Promise<{
  status: string
  data?: ReconnectionPaymentResult
  message?: string
}> {
  const supabase = await createClient()

  try {
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
    if (authError || !authUser) {
      return { status: 'error', message: 'User not authenticated' }
    }

    if (payload.amount_paid <= 0) {
      return { status: 'error', message: 'Amount must be greater than zero' }
    }

    // ── 1. Fetch reconnection record ─────────────────────────
    const { data: reconnection, error: recErr } = await supabase
      .from('reconnections')
      .select('reconnection_id, remaining_balance, payment_status_id')
      .eq('reconnection_id', payload.reconnection_id)
      .single()

    if (recErr || !reconnection) {
      return { status: 'error', message: 'Reconnection record not found' }
    }

    const currentRemaining = Number(reconnection.remaining_balance)

    if (currentRemaining <= 0) {
      return { status: 'error', message: 'This reconnection fee has already been fully paid' }
    }

    if (payload.amount_paid > currentRemaining + 0.01) {
      return {
        status: 'error',
        message: `Amount exceeds remaining balance of ₱${currentRemaining.toFixed(2)}`,
      }
    }

    // ── 2. Resolve payment_type_id for 'reconnection' ────────
    const reconnectionPaymentTypeId = await getPaymentTypeId(supabase, 'reconnection')

    // ── 3. Generate unique receipt number safely (with safe limits) ──
    let receiptNumber = ''
    let isUnique = false
    let retries = 0

    while (!isUnique && retries < 5) {
      receiptNumber = generateReceiptNumber()
      const { data: existingReceipt } = await supabase
        .from('payments')
        .select('payment_id')
        .eq('receipt_number', receiptNumber)
        .maybeSingle()

      if (!existingReceipt) {
        isUnique = true
      } else {
        retries++
      }
    }

    if (!isUnique) {
      return { status: 'error', message: 'System was unable to generate a unique receipt identifier. Please try again.' }
    }

    // ── 4. Insert into payments table ────────────────────────
    const { data: paymentRow, error: paymentErr } = await supabase
      .from('payments')
      .insert({
        receipt_number: receiptNumber,
        payment_type_id: reconnectionPaymentTypeId,
        payment_date: new Date().toISOString().split('T')[0],
        recieved_by: authUser.id,
      })
      .select('payment_id, receipt_number')
      .single()

    if (paymentErr || !paymentRow) {
      console.error('[processReconnectionPayment] payment insert error:', paymentErr)
      throw paymentErr ?? new Error('Failed to create payment record')
    }

    // ── 5. Insert into reconnection_payments (supports partial) ─
    const { data: reconnectionPaymentRow, error: insertErr } = await supabase
      .from('reconnection_payments')
      .insert({
        reconnection_id: payload.reconnection_id,
        payment_id: paymentRow.payment_id,
        amount_paid: payload.amount_paid,
      })
      .select('reconnection_payment_id')
      .single()

    if (insertErr || !reconnectionPaymentRow) {
      console.error('[processReconnectionPayment] reconnection_payments insert error:', insertErr)
      throw insertErr ?? new Error('Failed to link reconnection payment')
    }

    // ── 6. Update reconnection balance + billing status ONLY ─────
    const newRemaining = roundToCents(currentRemaining - payload.amount_paid)
    const isFullyPaid = newRemaining <= 0.01
    const newPaymentStatusName = isFullyPaid ? 'paid' : 'partial'
    const newPaymentStatusId = await getBillingStatusId(supabase, newPaymentStatusName)

    // Match on the current remaining_balance to protect against concurrent updates
    const { error: updateErr } = await supabase
      .from('reconnections')
      .update({
        remaining_balance: isFullyPaid ? 0 : newRemaining,
        payment_status_id: newPaymentStatusId,
        updated_at: new Date().toISOString(),
      })
      .eq('reconnection_id', payload.reconnection_id)
      .eq('remaining_balance', currentRemaining)

    if (updateErr) {
      console.error('[processReconnectionPayment] reconnection update error:', updateErr)
      throw new Error('A balance mismatch was detected. The record may have been updated elsewhere. Please refresh.')
    }

    await finalizeForwardedInstallments(supabase, payload.reconnection_id)

    return {
      status: 'success',
      data: {
        reconnection_payment_id: reconnectionPaymentRow.reconnection_payment_id,
        receipt_number: paymentRow.receipt_number,
        amount_paid: payload.amount_paid,
        is_fully_paid: isFullyPaid,
        new_payment_status: newPaymentStatusName,
        remaining_balance: isFullyPaid ? 0 : newRemaining,
      },
    }
  } catch (err: any) {
    console.error('[processReconnectionPayment]', err)
    return { status: 'error', message: err?.message ?? 'Failed to process reconnection payment' }
  }
}