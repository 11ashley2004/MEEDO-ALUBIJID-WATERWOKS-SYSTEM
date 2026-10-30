'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================================================
// Types
// ============================================================================

export interface MeterCharge {
  block: string
  units: number
  rate: number
  subtotal: number
}

export interface BillingRecord {
  billing_id: string
  period_start: string
  period_end: string
  due_date: string
  current_billing: number
  previous_balance: number
  total_billing: number
  amount_due: number
  billing_status: string
  reading_period_id: string
  meter_installment_charge: number
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
  payments: {
    billing_payment_id: string
    amount_paid: number
    receipt_number: string
    payment_date: string
    processed_by_name: string
  }[]
  amount_paid_total: number
  meter_charges?: MeterCharge[]
}

export interface PaymentResult {
  billing_payment_id: string
  receipt_number: string
  amount_paid: number
  is_fully_paid: boolean
  new_status: string
  remaining_balance: number
  processed_by_name: string
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

// Format: "First M. Last" (e.g., "Rorry B. Example") — same convention as connection fee receipts
function getFullNameWithInitial(firstName: string, lastName: string, middleName?: string | null): string {
  let fullName = firstName || ''

  if (middleName && middleName.length > 0) {
    const initial = middleName.charAt(0).toUpperCase()
    fullName += ` ${initial}.`
  }

  if (lastName) {
    fullName += ` ${lastName}`
  }

  return fullName.trim()
}

// Batch-fetch user full names for a set of user IDs, keyed by user_id
async function getUserNamesMap(supabase: any, userIds: string[]): Promise<Record<string, string>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))]
  if (uniqueIds.length === 0) return {}

  const { data: users, error } = await supabase
    .from('users')
    .select('user_id, first_name, last_name, middle_name')
    .in('user_id', uniqueIds)

  if (error || !users) return {}

  return users.reduce((acc: Record<string, string>, user: any) => {
    acc[user.user_id] = getFullNameWithInitial(
      user.first_name || '',
      user.last_name || '',
      user.middle_name || null
    )
    return acc
  }, {})
}

async function getBillingStatusId(supabase: any, statusName: string): Promise<string> {
  const { data, error } = await supabase
    .from('billing_status')
    .select('billing_status_id')
    .ilike('billing_status_name', statusName)
    .single()
  if (error || !data) throw new Error(`Billing status "${statusName}" not found`)
  return data.billing_status_id
}

async function getPaymentTypeId(supabase: any, typeName: string): Promise<string> {
  const { data, error } = await supabase
    .from('payment_type')
    .select('payment_type_id')
    .ilike('payment_type_name', typeName)
    .single()
  if (error || !data) throw new Error(`Payment type "${typeName}" not found`)
  return data.payment_type_id
}

// ============================================================================
// GET — Meter charges for a billing
// ============================================================================

async function getMeterChargesForBilling(supabase: any, billingId: string): Promise<MeterCharge[]> {
  try {
    const { data: billingData } = await supabase
      .from('billing')
      .select('consumption_id')
      .eq('billing_id', billingId)
      .single()

    if (!billingData?.consumption_id) return []

    const { data: breakdowns } = await supabase
      .from('billing_community_breakdowns')
      .select(`
        block_order,
        units_used,
        rate_per_unit,
        subtotal,
        community_charges:community_charge_id (
          min_consumption,
          max_consumption
        )
      `)
      .eq('consumption_id', billingData.consumption_id)
      .order('block_order', { ascending: true })

    if (!breakdowns) return []

    return breakdowns.map((breakdown: any) => {
      const charge = breakdown.community_charges
      const blockLabel = charge?.max_consumption 
        ? `${charge.min_consumption}-${charge.max_consumption}`
        : `${charge?.min_consumption}+`
      
      return {
        block: blockLabel,
        units: Number(breakdown.units_used),
        rate: Number(breakdown.rate_per_unit),
        subtotal: Number(breakdown.subtotal),
      }
    })
  } catch (err) {
    console.error('[getMeterChargesForBilling]', err)
    return []
  }
}

// ============================================================================
// GET — Meter installment charge for a billing
// ============================================================================

async function getMeterInstallmentChargeForBilling(
  supabase: any, 
  billingId: string,
  meterAccountId: string
): Promise<number> {
  try {
    const { data: charges } = await supabase
      .from('meter_installment_charges')
      .select('amount')
      .eq('billing_id', billingId)

    if (!charges || charges.length === 0) return 0

    return charges.reduce((sum: number, charge: any) => sum + Number(charge.amount), 0)
  } catch (err) {
    console.error('[getMeterInstallmentChargeForBilling]', err)
    return 0
  }
}

// ============================================================================
// GET — Current billing per meter account (latest bill for each account)
// ============================================================================

const BILLING_LIST_SELECT = `
  billing_id,
  current_billing,
  previous_balance,
  total_billing,
  remaining_balance,
  reading_period_id,
  created_at,
  reading_periods:reading_period_id (
    period_start,
    period_end,
    due_date
  ),
  billing_status:billing_status_id (
    billing_status_name
  ),
  meter_account:meter_account_id (
    meter_account_id,
    meters (
      meter_serial_no,
      created_at
    ),
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
`

function mapBillingRow(
  billing: any,
  payments: BillingRecord['payments'],
  meterCharges: MeterCharge[],
  meterInstallmentCharge: number,
): BillingRecord {
  const billingStatus = unwrap(billing.billing_status)
  const meterAccount = unwrap(billing.meter_account)
  const consumer = unwrap(meterAccount?.consumer)
  const zone = unwrap(meterAccount?.zone)
  const barangay = unwrap(zone?.barangay)
  const classification = unwrap(meterAccount?.classification)
  const periodInfo = unwrap(billing.reading_periods)
  const amountPaidTotal = payments.reduce((sum, p) => sum + p.amount_paid, 0)

  return {
    billing_id: billing.billing_id,
    period_start: periodInfo?.period_start || '',
    period_end: periodInfo?.period_end || '',
    due_date: periodInfo?.due_date || '',
    current_billing: Number(billing.current_billing),
    previous_balance: Number(billing.previous_balance),
    total_billing: Number(billing.total_billing),
    amount_due: Number(billing.remaining_balance),
    billing_status: billingStatus?.billing_status_name ?? 'unpaid',
    reading_period_id: billing.reading_period_id,
    meter_installment_charge: meterInstallmentCharge,
    meter_account: {
      meter_account_id: meterAccount?.meter_account_id ?? '',
      meter_serial_no: latestMeterSerialFromMeters(meterAccount?.meters),
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
    payments: [...payments].sort(
      (a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime(),
    ),
    amount_paid_total: amountPaidTotal,
    meter_charges: meterCharges,
  }
}

export async function getAllBillingsForLatestReadingOrder(): Promise<{
  status: string
  data?: BillingRecord[]
  reading_order?: { reading_period_id: string; period_start: string; period_end: string } | null
  message?: string
}> {
  const supabase = await createClient()

  try {
    // Latest bill id per meter account (newest created_at wins)
    const { data: billingIndex, error: indexErr } = await supabase
      .from('billing')
      .select('billing_id, meter_account_id, created_at')
      .order('created_at', { ascending: false })

    if (indexErr) throw indexErr
    if (!billingIndex?.length) {
      return { status: 'success', data: [], reading_order: null }
    }

    const latestBillingIdByAccount = new Map<string, string>()
    for (const row of billingIndex) {
      if (!row.meter_account_id) continue
      if (!latestBillingIdByAccount.has(row.meter_account_id)) {
        latestBillingIdByAccount.set(row.meter_account_id, row.billing_id)
      }
    }

    const billingIds = Array.from(latestBillingIdByAccount.values())
    if (billingIds.length === 0) {
      return { status: 'success', data: [], reading_order: null }
    }

    const { data: billings, error } = await supabase
      .from('billing')
      .select(BILLING_LIST_SELECT)
      .in('billing_id', billingIds)
      .order('created_at', { ascending: false })

    if (error) throw error
    if (!billings?.length) {
      return { status: 'success', data: [], reading_order: null }
    }

    const { data: allPayments } = await supabase
      .from('billing_payments')
      .select(`
        billing_payment_id,
        amount_paid,
        billing_id,
        payment:payment_id (
          receipt_number,
          payment_date,
          recieved_by
        )
      `)
      .in('billing_id', billingIds)

    const recievedByIds = (allPayments ?? []).map((p: any) => p.payment?.recieved_by).filter(Boolean)
    const userNamesMap = await getUserNamesMap(supabase, recievedByIds)

    const paymentsByBilling = new Map<string, BillingRecord['payments']>()
    allPayments?.forEach((payment: any) => {
      const paymentData = payment.payment
      const recievedBy = paymentData?.recieved_by ?? null
      const paymentRecord = {
        billing_payment_id: payment.billing_payment_id,
        amount_paid: Number(payment.amount_paid),
        receipt_number: paymentData?.receipt_number ?? '',
        payment_date: paymentData?.payment_date ?? '',
        processed_by_name: recievedBy ? (userNamesMap[recievedBy] ?? '') : '',
      }
      if (!paymentsByBilling.has(payment.billing_id)) {
        paymentsByBilling.set(payment.billing_id, [])
      }
      paymentsByBilling.get(payment.billing_id)!.push(paymentRecord)
    })

    const results: BillingRecord[] = await Promise.all(
      billings.map(async (billing: any) => {
        const meterAccount = unwrap(billing.meter_account)
        const [meterCharges, meterInstallmentCharge] = await Promise.all([
          getMeterChargesForBilling(supabase, billing.billing_id),
          getMeterInstallmentChargeForBilling(supabase, billing.billing_id, meterAccount?.meter_account_id),
        ])
        return mapBillingRow(
          billing,
          paymentsByBilling.get(billing.billing_id) || [],
          meterCharges,
          meterInstallmentCharge,
        )
      }),
    )

    // Stable list: consumer name, then serial
    results.sort((a, b) => {
      const nameCmp = a.meter_account.consumer.account_name.localeCompare(
        b.meter_account.consumer.account_name,
      )
      if (nameCmp !== 0) return nameCmp
      return (a.meter_account.meter_serial_no ?? '').localeCompare(b.meter_account.meter_serial_no ?? '')
    })

    return { status: 'success', data: results, reading_order: null }
  } catch (err: any) {
    console.error('[getAllBillingsForLatestReadingOrder]', err)
    return { status: 'error', message: err?.message ?? 'Failed to load billings' }
  }
}

// ============================================================================
// GET — Single billing by ID for print
// ============================================================================

export async function getBillingForPrint(billingId: string): Promise<{
  status: string
  data?: BillingRecord
  message?: string
}> {
  const supabase = await createClient()

  try {
    const { data: billing, error } = await supabase
      .from('billing')
      .select(BILLING_LIST_SELECT)
      .eq('billing_id', billingId)
      .single()

    if (error || !billing) {
      return { status: 'error', message: 'Billing record not found' }
    }

    const { data: payments } = await supabase
      .from('billing_payments')
      .select(`
        billing_payment_id,
        amount_paid,
        payment:payment_id (
          receipt_number,
          payment_date,
          recieved_by
        )
      `)
      .eq('billing_id', billingId)

    const recievedByIds = (payments ?? []).map((p: any) => p.payment?.recieved_by).filter(Boolean)
    const userNamesMap = await getUserNamesMap(supabase, recievedByIds)

    const meterAccount = unwrap((billing as any).meter_account)

    const paymentList = (payments ?? []).map((p: any) => {
      const paymentData = p.payment
      const recievedBy = paymentData?.recieved_by ?? null
      return {
        billing_payment_id: p.billing_payment_id,
        amount_paid: Number(p.amount_paid),
        receipt_number: paymentData?.receipt_number ?? '',
        payment_date: paymentData?.payment_date ?? '',
        processed_by_name: recievedBy ? (userNamesMap[recievedBy] ?? '') : '',
      }
    })

    const [meterCharges, meterInstallmentCharge] = await Promise.all([
      getMeterChargesForBilling(supabase, billingId),
      getMeterInstallmentChargeForBilling(supabase, billingId, meterAccount?.meter_account_id),
    ])

    const result = mapBillingRow(billing, paymentList, meterCharges, meterInstallmentCharge)

    return { status: 'success', data: result }
  } catch (err: any) {
    console.error('[getBillingForPrint]', err)
    return { status: 'error', message: err?.message ?? 'Failed to fetch billing for print' }
  }
}

// ============================================================================
// POST — Process payment
// ============================================================================

export async function processPayment(payload: {
  billing_id: string
  amount_paid: number
}): Promise<{
  status: string
  data?: PaymentResult
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

    const { data: billing, error: billErr } = await supabase
      .from('billing')
      .select(`
        billing_id,
        total_billing,
        remaining_balance,
        billing_status_id,
        billing_status:billing_status_id ( billing_status_name )
      `)
      .eq('billing_id', payload.billing_id)
      .single()

    if (billErr || !billing) {
      return { status: 'error', message: 'Billing record not found' }
    }

    const statusName = (
      unwrap((billing as any).billing_status)?.billing_status_name ?? ''
    ).toLowerCase().trim()

    if (statusName === 'forwarded') {
      return {
        status: 'error',
        message: 'This bill was forwarded to a newer billing period. Collect against the current bill instead.',
      }
    }

    if (statusName === 'paid') {
      return { status: 'error', message: 'This bill has already been fully paid' }
    }

    const currentRemaining = Number(billing.remaining_balance)

    if (currentRemaining <= 0) {
      return { status: 'error', message: 'This bill has already been fully paid' }
    }

    if (payload.amount_paid > currentRemaining + 0.01) {
      return {
        status: 'error',
        message: `Amount exceeds remaining balance of ₱${currentRemaining.toFixed(2)}`,
      }
    }

    const billingPaymentTypeId = await getPaymentTypeId(supabase, 'billing')

    let receiptNumber = generateReceiptNumber()
    const { data: existingReceipt } = await supabase
      .from('payments')
      .select('payment_id')
      .eq('receipt_number', receiptNumber)
      .maybeSingle()
    if (existingReceipt) receiptNumber = generateReceiptNumber()

    const { data: paymentRow, error: paymentErr } = await supabase
      .from('payments')
      .insert({
        receipt_number: receiptNumber,
        payment_type_id: billingPaymentTypeId,
        payment_date: new Date().toISOString().split('T')[0],
        recieved_by: authUser.id,
      })
      .select('payment_id, receipt_number')
      .single()

    if (paymentErr || !paymentRow) {
      console.error('[processPayment] payment insert error:', paymentErr)
      throw paymentErr ?? new Error('Failed to create payment record')
    }

    const { data: billingPaymentRow, error: insertErr } = await supabase
      .from('billing_payments')
      .insert({
        billing_id: payload.billing_id,
        payment_id: paymentRow.payment_id,
        amount_paid: payload.amount_paid,
      })
      .select('billing_payment_id')
      .single()

    if (insertErr || !billingPaymentRow) {
      console.error('[processPayment] billing_payments insert error:', insertErr)
      throw insertErr ?? new Error('Failed to link billing payment')
    }

    const newRemaining = parseFloat((currentRemaining - payload.amount_paid).toFixed(2))
    const isFullyPaid = newRemaining <= 0.01
    const newStatusName = isFullyPaid ? 'paid' : 'partial'
    const newStatusId = await getBillingStatusId(supabase, newStatusName)

    const { error: updateErr } = await supabase
      .from('billing')
      .update({
        remaining_balance: isFullyPaid ? 0 : newRemaining,
        billing_status_id: newStatusId,
        updated_at: new Date().toISOString(),
      })
      .eq('billing_id', payload.billing_id)

    if (updateErr) {
      console.error('[processPayment] billing update error:', updateErr)
      throw updateErr
    }

    // ── Fetch the actual name of the treasurer/staff who processed this payment ──
    let processedByName = ''
    const { data: userRow, error: userErr } = await supabase
      .from('users')
      .select('first_name, last_name, middle_name')
      .eq('user_id', authUser.id)
      .single()

    if (!userErr && userRow) {
      processedByName = getFullNameWithInitial(
        userRow.first_name || '',
        userRow.last_name || '',
        userRow.middle_name || null
      )
    }

    return {
      status: 'success',
      data: {
        billing_payment_id: billingPaymentRow.billing_payment_id,
        receipt_number: paymentRow.receipt_number,
        amount_paid: payload.amount_paid,
        is_fully_paid: isFullyPaid,
        new_status: newStatusName,
        remaining_balance: isFullyPaid ? 0 : newRemaining,
        processed_by_name: processedByName,
      },
    }
  } catch (err: any) {
    console.error('[processPayment]', err)
    return { status: 'error', message: err?.message ?? 'Failed to process payment' }
  }
}