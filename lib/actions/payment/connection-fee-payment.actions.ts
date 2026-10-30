// lib/actions/payment/connection-fee-payment.actions.ts

'use server'

import { createClient } from '@/lib/supabase/server'
import { createAuditLog } from '../audit.action'

// ============================================================================
// Types
// ============================================================================

export interface UnpaidMeterAccount {
  meter_account_id: string
  meter_serial_no: string | null
  consumer_id: string
  consumer_name: string
  barangay_id: string
  barangay_name: string
  zone_id: string
  zone_name: string
  classification_name: string
  total_connection_fee: number
  created_at: string
}

export interface PaidMeterAccount {
  meter_account_id: string
  meter_serial_no: string | null
  consumer_id: string
  consumer_name: string
  barangay_id: string
  barangay_name: string
  zone_id: string
  zone_name: string
  classification_name: string
  total_connection_fee: number
  paid_at: string
  receipt_number: string
  amount_paid: number
  created_at: string
  processed_by_name: string
}

export interface MeterAccountFeePaymentPayload {
  meter_account_id: string
  amount_paid: number
}

export interface MeterAccountFeePaymentResponse {
  status: 'success' | 'error'
  message?: string
  data?: {
    payment_id: string
    receipt_number: string
    connection_fee_payment_id: string
  }
}

export interface BarangayOption {
  barangay_id: string
  barangay_name: string
}

export interface ZoneOption {
  zone_id: string
  zone_name: string
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

function getFullNameWithInitial(firstName: string, lastName: string, middleName?: string | null): string {
  let fullName = firstName || ''
  if (middleName && middleName.length > 0) {
    fullName += ` ${middleName.charAt(0).toUpperCase()}.`
  }
  if (lastName) fullName += ` ${lastName}`
  return fullName.trim()
}

const getFirst = (val: unknown): any => (Array.isArray(val) ? val[0] ?? null : val ?? null)

const METER_ACCOUNT_FEE_SELECT = `
  meter_account_id,
  consumer_id,
  total_connection_fee,
  payment_status,
  paid_at,
  created_at,
  consumers:consumer_id ( account_name ),
  zone:zone_id (
    zone_id, zone_name, barangay_id,
    barangay:barangay_id ( barangay_id, barangay_name )
  ),
  classifications:classification_id ( classification_name )
`

// ============================================================================
// GET — Unpaid meter accounts
// ============================================================================

export async function getUnpaidMeterAccounts(): Promise<UnpaidMeterAccount[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('meter_accounts')
    .select(METER_ACCOUNT_FEE_SELECT)
    .eq('payment_status', false)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[getUnpaidMeterAccounts]', error)
    throw new Error('Failed to fetch unpaid meter accounts')
  }

  return (data ?? []).map((row: any) => {
    const consumer = getFirst(row.consumers)
    const zone = getFirst(row.zone)
    const barangay = getFirst(zone?.barangay)
    const classification = getFirst(row.classifications)

    return {
      meter_account_id: row.meter_account_id,
      meter_serial_no: latestMeterSerialFromMeters(row.meters),
      consumer_id: row.consumer_id,
      consumer_name: consumer?.account_name ?? '—',
      barangay_id: barangay?.barangay_id ?? '',
      barangay_name: barangay?.barangay_name ?? '—',
      zone_id: zone?.zone_id ?? '',
      zone_name: zone?.zone_name ?? '—',
      classification_name: classification?.classification_name ?? '—',
      total_connection_fee: Number(row.total_connection_fee ?? 0),
      created_at: row.created_at,
    }
  })
}

// ============================================================================
// GET — Unpaid meter accounts by consumer (for consumer portal)
// ============================================================================

export async function getUnpaidMeterAccountsByConsumer(consumerId: string): Promise<UnpaidMeterAccount[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('meter_accounts')
    .select(METER_ACCOUNT_FEE_SELECT)
    .eq('payment_status', false)
    .eq('consumer_id', consumerId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[getUnpaidMeterAccountsByConsumer]', error)
    throw new Error('Failed to fetch unpaid meter accounts')
  }

  return (data ?? []).map((row: any) => {
    const consumer = getFirst(row.consumers)
    const zone = getFirst(row.zone)
    const barangay = getFirst(zone?.barangay)
    const classification = getFirst(row.classifications)

    return {
      meter_account_id: row.meter_account_id,
      meter_serial_no: latestMeterSerialFromMeters(row.meters),
      consumer_id: row.consumer_id,
      consumer_name: consumer?.account_name ?? '—',
      barangay_id: barangay?.barangay_id ?? '',
      barangay_name: barangay?.barangay_name ?? '—',
      zone_id: zone?.zone_id ?? '',
      zone_name: zone?.zone_name ?? '—',
      classification_name: classification?.classification_name ?? '—',
      total_connection_fee: Number(row.total_connection_fee ?? 0),
      created_at: row.created_at,
    }
  })
}

// ============================================================================
// GET — Paid meter accounts (with their payment/receipt info)
// ============================================================================

export async function getPaidMeterAccounts(): Promise<PaidMeterAccount[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('meter_accounts')
    .select(`
      ${METER_ACCOUNT_FEE_SELECT},
      connection_fee_payments (
        amount_paid,
        payment:payment_id ( receipt_number, recieved_by )
      )
    `)
    .eq('payment_status', true)
    .order('paid_at', { ascending: false })

  if (error) {
    console.error('[getPaidMeterAccounts]', error)
    throw new Error('Failed to fetch paid meter accounts')
  }

  const rows = data ?? []

  const userIds = [...new Set(
    rows
      .map((row: any) => getFirst(row.connection_fee_payments)?.payment && getFirst(getFirst(row.connection_fee_payments)?.payment)?.recieved_by)
      .filter(Boolean)
  )]

  let userNames: Record<string, { first_name: string; last_name: string; middle_name: string | null }> = {}
  if (userIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('user_id, first_name, last_name, middle_name')
      .in('user_id', userIds as string[])

    userNames = (users ?? []).reduce((acc, u) => {
      acc[u.user_id] = { first_name: u.first_name || '', last_name: u.last_name || '', middle_name: u.middle_name || null }
      return acc
    }, {} as Record<string, { first_name: string; last_name: string; middle_name: string | null }>)
  }

  return rows.map((row: any) => {
    const consumer = getFirst(row.consumers)
    const zone = getFirst(row.zone)
    const barangay = getFirst(zone?.barangay)
    const classification = getFirst(row.classifications)
    const feePayment = getFirst(row.connection_fee_payments) ?? {}
    const payment = getFirst(feePayment.payment) ?? {}
    const recievedBy = payment?.recieved_by ?? null

    let processedByName = ''
    if (recievedBy && userNames[recievedBy]) {
      const u = userNames[recievedBy]
      processedByName = getFullNameWithInitial(u.first_name, u.last_name, u.middle_name)
    }

    return {
      meter_account_id: row.meter_account_id,
      meter_serial_no: latestMeterSerialFromMeters(row.meters),
      consumer_id: row.consumer_id,
      consumer_name: consumer?.account_name ?? '—',
      barangay_id: barangay?.barangay_id ?? '',
      barangay_name: barangay?.barangay_name ?? '—',
      zone_id: zone?.zone_id ?? '',
      zone_name: zone?.zone_name ?? '—',
      classification_name: classification?.classification_name ?? '—',
      total_connection_fee: Number(row.total_connection_fee ?? 0),
      paid_at: row.paid_at,
      receipt_number: payment?.receipt_number ?? '—',
      amount_paid: Number(feePayment?.amount_paid ?? 0),
      created_at: row.created_at,
      processed_by_name: processedByName,
    }
  })
}

// ============================================================================
// GET — Paid meter account by ID
// ============================================================================

export async function getPaidMeterAccountById(meterAccountId: string): Promise<PaidMeterAccount | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('meter_accounts')
    .select(`
      ${METER_ACCOUNT_FEE_SELECT},
      connection_fee_payments (
        amount_paid,
        payment:payment_id ( receipt_number, recieved_by )
      )
    `)
    .eq('meter_account_id', meterAccountId)
    .eq('payment_status', true)
    .single()

  if (error || !data) return null

  const row = data as any
  const consumer = getFirst(row.consumers)
  const zone = getFirst(row.zone)
  const barangay = getFirst(zone?.barangay)
  const classification = getFirst(row.classifications)
  const feePayment = getFirst(row.connection_fee_payments) ?? {}
  const payment = getFirst(feePayment.payment) ?? {}
  const recievedBy = payment?.recieved_by ?? null

  let processedByName = ''
  if (recievedBy) {
    const { data: user } = await supabase
      .from('users')
      .select('first_name, last_name, middle_name')
      .eq('user_id', recievedBy)
      .single()
    if (user) processedByName = getFullNameWithInitial(user.first_name || '', user.last_name || '', user.middle_name || null)
  }

  return {
    meter_account_id: row.meter_account_id,
    meter_serial_no: latestMeterSerialFromMeters(row.meters),
    consumer_id: row.consumer_id,
    consumer_name: consumer?.account_name ?? '—',
    barangay_id: barangay?.barangay_id ?? '',
    barangay_name: barangay?.barangay_name ?? '—',
    zone_id: zone?.zone_id ?? '',
    zone_name: zone?.zone_name ?? '—',
    classification_name: classification?.classification_name ?? '—',
    total_connection_fee: Number(row.total_connection_fee ?? 0),
    paid_at: row.paid_at,
    receipt_number: payment?.receipt_number ?? '—',
    amount_paid: Number(feePayment?.amount_paid ?? 0),
    created_at: row.created_at,
    processed_by_name: processedByName,
  }
}

// ============================================================================
// GET — Barangays / Zones for filter (unchanged)
// ============================================================================

export async function getBarangaysForFeePayment(): Promise<BarangayOption[]> {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from('barangay')
      .select('barangay_id, barangay_name')
      .eq('is_active', true)
      .order('barangay_name', { ascending: true })
    if (error) throw error
    return data ?? []
  } catch (err) {
    console.error('[getBarangaysForFeePayment]', err)
    return []
  }
}

export async function getZonesForFeePayment(barangayId: string): Promise<ZoneOption[]> {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from('zone')
      .select('zone_id, zone_name')
      .eq('barangay_id', barangayId)
      .eq('is_active', true)
      .order('zone_name', { ascending: true })
    if (error) throw error
    return data ?? []
  } catch (err) {
    console.error('[getZonesForFeePayment]', err)
    return []
  }
}

// ============================================================================
// CREATE — Record meter account connection fee payment
// ============================================================================

export async function recordMeterAccountFeePayment(
  payload: MeterAccountFeePaymentPayload
): Promise<MeterAccountFeePaymentResponse> {
  const supabase = await createClient()

  try {
    const { data: { user: actor } } = await supabase.auth.getUser()
    if (!actor) return { status: 'error', message: 'Unauthorized' }

    // ── 1. Get payment type ID for connection_fee ───────────────────────────
    const { data: paymentType, error: typeError } = await supabase
      .from('payment_type')
      .select('payment_type_id')
      .ilike('payment_type_name', 'connection_fee')
      .single()

    if (typeError || !paymentType) {
      return { status: 'error', message: 'Payment type "connection_fee" not found' }
    }

    // ── 2. Verify the meter account exists and is unpaid ─────────────────────
    const { data: meterAccount, error: maError } = await supabase
      .from('meter_accounts')
      .select('total_connection_fee, payment_status, consumer_id')
      .eq('meter_account_id', payload.meter_account_id)
      .single()

    if (maError || !meterAccount) {
      return { status: 'error', message: 'Meter account not found' }
    }

    if (meterAccount.payment_status) {
      return { status: 'error', message: 'This connection fee has already been paid' }
    }

    if (payload.amount_paid !== Number(meterAccount.total_connection_fee)) {
      return { status: 'error', message: 'Partial payments are not allowed. Please pay the full amount.' }
    }

    // ── 3. Insert into payments table (receipt_number auto-generated) ────────
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert({
        payment_type_id: paymentType.payment_type_id,
        recieved_by: actor.id,
      })
      .select('payment_id, receipt_number')
      .single()

    if (paymentError) {
      console.error('[recordMeterAccountFeePayment] payment insert:', paymentError)
      return { status: 'error', message: paymentError.message }
    }

    // ── 4. Insert into connection_fee_payments ────────────────────────────────
    const { data: connectionFeePayment, error: cfpError } = await supabase
      .from('connection_fee_payments')
      .insert({
        meter_account_id: payload.meter_account_id,
        payment_id: payment.payment_id,
        amount_paid: payload.amount_paid,
      })
      .select('connection_fee_payment_id')
      .single()

    if (cfpError) {
      console.error('[recordMeterAccountFeePayment] connection_fee_payments insert:', cfpError)
      await supabase.from('payments').delete().eq('payment_id', payment.payment_id)
      return { status: 'error', message: cfpError.message }
    }

    // ── 5. Mark meter account as paid ──────────────────────────────────────────
    const { error: updateError } = await supabase
      .from('meter_accounts')
      .update({
        payment_status: true,
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('meter_account_id', payload.meter_account_id)

    if (updateError) {
      console.error('[recordMeterAccountFeePayment] update error:', updateError)
      await supabase.from('connection_fee_payments').delete().eq('connection_fee_payment_id', connectionFeePayment.connection_fee_payment_id)
      await supabase.from('payments').delete().eq('payment_id', payment.payment_id)
      return { status: 'error', message: updateError.message }
    }

    // ── 6. Audit log ────────────────────────────────────────────────────────────
    await createAuditLog(
      actor.id,
      'PAYMENT',
      `Recorded connection fee payment of ₱${payload.amount_paid.toFixed(2)} for receipt ${payment.receipt_number}`,
      'meter_accounts',
      payload.meter_account_id
    )

    return {
      status: 'success',
      message: `Payment recorded successfully. Receipt #: ${payment.receipt_number}`,
      data: {
        payment_id: payment.payment_id,
        receipt_number: payment.receipt_number,
        connection_fee_payment_id: connectionFeePayment.connection_fee_payment_id,
      },
    }
  } catch (err) {
    console.error('[recordMeterAccountFeePayment]', err)
    return { status: 'error', message: 'Failed to record payment' }
  }
}