// lib/actions/payment/transaction.actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TransactionRecord {
  payment_id: string
  receipt_number: string
  payment_type_id: string
  payment_type_name: string
  payment_date: string
  amount: number
  payor_name: string
  collected_by: {
    user_id: string
    first_name: string
    last_name: string
  }
  created_at: string
}

export interface TransactionResponse {
  status: 'success' | 'error'
  data?: TransactionRecord[]
  message?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function unwrap<T>(val: T | T[] | null | undefined): T | null {
  if (val == null) return null
  return Array.isArray(val) ? (val[0] ?? null) : val
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

interface PaymentDetail {
  amount: number
  payor_name: string
}

// Looks up the amount AND the consumer (payor) name for each payment.
// Each payment_id lives in exactly one of the three payment tables, so the
// results can safely share one map.
//
//   billing_payments          -> billing -> consumers
//   connection_fee_payments   -> meter_accounts -> consumers
//   reconnection_payments     -> reconnections -> disconnections -> meter_accounts -> consumers
async function fetchPaymentDetails(
  supabase: SupabaseClient,
  paymentIds: string[],
): Promise<Map<string, PaymentDetail>> {
  const details = new Map<string, PaymentDetail>()
  if (paymentIds.length === 0) return details

  const [billingRes, connectionFeeRes, reconnectionRes] = await Promise.all([
    supabase
      .from('billing_payments')
      .select(`
        payment_id,
        amount_paid,
        billing:billing_id (
          consumers:consumer_id ( account_name )
        )
      `)
      .in('payment_id', paymentIds),

    supabase
      .from('connection_fee_payments')
      .select(`
        payment_id,
        amount_paid,
        meter_accounts:meter_account_id (
          consumers:consumer_id ( account_name )
        )
      `)
      .in('payment_id', paymentIds),

    supabase
      .from('reconnection_payments')
      .select(`
        payment_id,
        amount_paid,
        reconnections:reconnection_id (
          disconnections:disconnection_id (
            meter_accounts:meter_account_id (
              consumers:consumer_id ( account_name )
            )
          )
        )
      `)
      .in('payment_id', paymentIds),
  ])

  if (billingRes.error) console.error('[fetchPaymentDetails] billing:', billingRes.error)
  if (connectionFeeRes.error) console.error('[fetchPaymentDetails] connection fee:', connectionFeeRes.error)
  if (reconnectionRes.error) console.error('[fetchPaymentDetails] reconnection:', reconnectionRes.error)

  for (const row of (billingRes.data ?? []) as any[]) {
    const billing = unwrap(row.billing)
    const consumer = unwrap(billing?.consumers) as any
    details.set(row.payment_id, {
      amount: Number(row.amount_paid) || 0,
      payor_name: consumer?.account_name ?? '',
    })
  }

  for (const row of (connectionFeeRes.data ?? []) as any[]) {
    const meterAccount = unwrap(row.meter_accounts) as any
    const consumer = unwrap(meterAccount?.consumers) as any
    details.set(row.payment_id, {
      amount: Number(row.amount_paid) || 0,
      payor_name: consumer?.account_name ?? '',
    })
  }

  for (const row of (reconnectionRes.data ?? []) as any[]) {
    const reconnection = unwrap(row.reconnections) as any
    const disconnection = unwrap(reconnection?.disconnections) as any
    const meterAccount = unwrap(disconnection?.meter_accounts) as any
    const consumer = unwrap(meterAccount?.consumers) as any
    details.set(row.payment_id, {
      amount: Number(row.amount_paid) || 0,
      payor_name: consumer?.account_name ?? '',
    })
  }

  return details
}

function buildTransactionRecord(payment: any, detail: PaymentDetail | undefined): TransactionRecord {
  const paymentType = unwrap(payment.payment_type) as any
  const collector = unwrap(payment.collected_by) as any

  return {
    payment_id: payment.payment_id,
    receipt_number: payment.receipt_number,
    payment_type_id: paymentType?.payment_type_id || '',
    payment_type_name: paymentType?.payment_type_name || 'unknown',
    payment_date: payment.payment_date,
    amount: detail?.amount ?? 0,
    payor_name: detail?.payor_name ?? '',
    collected_by: {
      user_id: collector?.user_id || '',
      first_name: collector?.first_name || '',
      last_name: collector?.last_name || '',
    },
    created_at: payment.created_at,
  }
}

const PAYMENT_SELECT = `
  payment_id,
  receipt_number,
  payment_type_id,
  payment_date,
  created_at,
  payment_type:payment_type_id (
    payment_type_id,
    payment_type_name,
    description
  ),
  collected_by:recieved_by (
    user_id,
    first_name,
    last_name
  )
`

// ─── GET — All Transactions ──────────────────────────────────────────────────

export async function getAllTransactions(): Promise<TransactionResponse> {
  const supabase = await createClient()

  try {
    const { data: payments, error } = await supabase
      .from('payments')
      .select(PAYMENT_SELECT)
      .order('created_at', { ascending: false })

    if (error) throw error

    if (!payments || payments.length === 0) {
      return { status: 'success', data: [] }
    }

    const details = await fetchPaymentDetails(
      supabase,
      payments.map((p: any) => p.payment_id),
    )

    const results = payments.map((payment: any) =>
      buildTransactionRecord(payment, details.get(payment.payment_id)),
    )

    // Filter out payments with zero amount (shouldn't happen, but just in case)
    const filteredResults = results.filter((r) => r.amount > 0)

    return { status: 'success', data: filteredResults }
  } catch (err: any) {
    console.error('[getAllTransactions]', err)
    return { status: 'error', message: err?.message ?? 'Failed to load transactions' }
  }
}

// ─── GET — Transactions by Type ──────────────────────────────────────────────

export async function getTransactionsByType(
  paymentTypeName: string,
): Promise<TransactionResponse> {
  const supabase = await createClient()

  try {
    // First get the payment type ID
    const { data: paymentType } = await supabase
      .from('payment_type')
      .select('payment_type_id')
      .ilike('payment_type_name', paymentTypeName)
      .single()

    if (!paymentType) {
      return { status: 'error', message: `Payment type "${paymentTypeName}" not found` }
    }

    // Then get all payments of that type
    const { data: payments, error } = await supabase
      .from('payments')
      .select(PAYMENT_SELECT)
      .eq('payment_type_id', paymentType.payment_type_id)
      .order('created_at', { ascending: false })

    if (error) throw error

    if (!payments || payments.length === 0) {
      return { status: 'success', data: [] }
    }

    const details = await fetchPaymentDetails(
      supabase,
      payments.map((p: any) => p.payment_id),
    )

    const results = payments.map((payment: any) =>
      buildTransactionRecord(payment, details.get(payment.payment_id)),
    )

    const filteredResults = results.filter((r) => r.amount > 0)

    return { status: 'success', data: filteredResults }
  } catch (err: any) {
    console.error('[getTransactionsByType]', err)
    return { status: 'error', message: err?.message ?? 'Failed to load transactions' }
  }
}