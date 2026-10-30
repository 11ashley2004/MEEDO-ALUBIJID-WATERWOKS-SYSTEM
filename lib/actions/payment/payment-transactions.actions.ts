'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================================================
// Types
// ============================================================================

export interface PaymentTransactionRecord {
  receipt_id: string
  receipt_number: string
  payment_type: string
  amount: number
  payment_date: string
  recorded_by: {
    user_id: string
    first_name: string
    last_name: string
  }
  // Connection info
  connection: {
    connection_id: string
    connection_no: string
    consumer: {
      consumer_id: string
      first_name: string
      last_name: string
      middle_name: string | null
      contact_number: string | null
    }
    zone: {
      zone_id: string
      zone_name: string
      barangay: { barangay_id: string; barangay_name: string }
    }
    classification: {
      classification_id: string
      classification_name: string
    }
  } | null
}

export interface TransactionFilterOptions {
  zones: { id: string; name: string }[]
  classifications: { id: string; name: string }[]
  barangays: { id: string; name: string }[]
  paymentTypes: { id: string; name: string }[]
}

// ============================================================================
// Helpers
// ============================================================================

function unwrap<T>(val: T | T[] | null | undefined): T | null {
  if (val == null) return null
  return Array.isArray(val) ? (val[0] ?? null) : val
}

// ============================================================================
// GET — All payment transactions (billing + connection_fee + reconnection)
// Base table: receipts (single source of truth for all payment types)
// ============================================================================

export async function getAllPaymentTransactions(): Promise<{
  status: string
  data?: PaymentTransactionRecord[]
  message?: string
}> {
  const supabase = await createClient()

  try {
    // Fetch all receipts with payment type info and recorded by user
    const { data: receipts, error } = await supabase
      .from('receipts')
      .select(`
        receipt_id,
        receipt_number,
        payment_type:payment_type_id (
          payment_type_id,
          payment_type_name
        ),
        amount,
        payment_date,
        recorded_by:recorded_by (
          user_id,
          first_name,
          last_name
        )
      `)
      .order('payment_date', { ascending: false })

    if (error) throw error

    if (!receipts || receipts.length === 0) {
      return { status: 'success', data: [] }
    }

    // Get all receipt IDs
    const receiptIds = receipts.map((r: any) => r.receipt_id)

    // Fetch billing payments (only for connection info)
    const { data: billingPayments } = await supabase
      .from('billing_payments')
      .select(`
        receipt_id,
        billing:billing_id (
          connection:connection_id (
            connection_id,
            connection_no,
            consumer:consumer_id (
              consumer_id,
              first_name,
              last_name,
              middle_name,
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
      .in('receipt_id', receiptIds)

    // Fetch connection fee payments
    const { data: connectionFeePayments } = await supabase
      .from('connection_fee_payments')
      .select(`
        receipt_id,
        connection:connection_id (
          connection_id,
          connection_no,
          consumer:consumer_id (
            consumer_id,
            first_name,
            last_name,
            middle_name,
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
      `)
      .in('receipt_id', receiptIds)

    // Fetch reconnection payments
    const { data: reconnectionPayments } = await supabase
      .from('reconnection_payments')
      .select(`
        receipt_id,
        connection:connection_id (
          connection_id,
          connection_no,
          consumer:consumer_id (
            consumer_id,
            first_name,
            last_name,
            middle_name,
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
      `)
      .in('receipt_id', receiptIds)

    // Create maps for quick lookup
    const billingMap = new Map()
    billingPayments?.forEach((bp: any) => {
      billingMap.set(bp.receipt_id, bp)
    })

    const connectionFeeMap = new Map()
    connectionFeePayments?.forEach((cfp: any) => {
      connectionFeeMap.set(cfp.receipt_id, cfp)
    })

    const reconnectionMap = new Map()
    reconnectionPayments?.forEach((rp: any) => {
      reconnectionMap.set(rp.receipt_id, rp)
    })

    // Build results
    const results: PaymentTransactionRecord[] = []

    for (const receipt of receipts ?? []) {
      const paymentType = unwrap(receipt.payment_type)
      const paymentTypeName = paymentType?.payment_type_name?.toLowerCase() ?? 'unknown'
      const recordedBy = unwrap(receipt.recorded_by)

      if (!recordedBy) continue

      let connection = null

      // Handle based on payment type
      if (paymentTypeName === 'billing') {
        const billingPayment = billingMap.get(receipt.receipt_id)
        if (billingPayment) {
          const billingData = unwrap(billingPayment.billing)
          const connectionData = unwrap(billingData?.connection)

          if (connectionData) {
            const consumer = unwrap(connectionData.consumer)
            const zone = unwrap(connectionData.zone)
            const barangay = unwrap(zone?.barangay)
            const classification = unwrap(connectionData.classification)

            connection = {
              connection_id: connectionData.connection_id,
              connection_no: connectionData.connection_no,
              consumer: consumer ? {
                consumer_id: consumer.consumer_id,
                first_name: consumer.first_name,
                last_name: consumer.last_name,
                middle_name: consumer.middle_name ?? null,
                contact_number: consumer.contact_number ?? null,
              } : { consumer_id: '', first_name: '', last_name: '', middle_name: null, contact_number: null },
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
            }
          }
        }
      } else if (paymentTypeName === 'connection_fee') {
        const feePayment = connectionFeeMap.get(receipt.receipt_id)
        if (feePayment) {
          const connectionData = unwrap(feePayment.connection)
          if (connectionData) {
            const consumer = unwrap(connectionData.consumer)
            const zone = unwrap(connectionData.zone)
            const barangay = unwrap(zone?.barangay)
            const classification = unwrap(connectionData.classification)

            connection = {
              connection_id: connectionData.connection_id,
              connection_no: connectionData.connection_no,
              consumer: consumer ? {
                consumer_id: consumer.consumer_id,
                first_name: consumer.first_name,
                last_name: consumer.last_name,
                middle_name: consumer.middle_name ?? null,
                contact_number: consumer.contact_number ?? null,
              } : { consumer_id: '', first_name: '', last_name: '', middle_name: null, contact_number: null },
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
            }
          }
        }
      } else if (paymentTypeName === 'reconnection') {
        const reconPayment = reconnectionMap.get(receipt.receipt_id)
        if (reconPayment) {
          const connectionData = unwrap(reconPayment.connection)
          if (connectionData) {
            const consumer = unwrap(connectionData.consumer)
            const zone = unwrap(connectionData.zone)
            const barangay = unwrap(zone?.barangay)
            const classification = unwrap(connectionData.classification)

            connection = {
              connection_id: connectionData.connection_id,
              connection_no: connectionData.connection_no,
              consumer: consumer ? {
                consumer_id: consumer.consumer_id,
                first_name: consumer.first_name,
                last_name: consumer.last_name,
                middle_name: consumer.middle_name ?? null,
                contact_number: consumer.contact_number ?? null,
              } : { consumer_id: '', first_name: '', last_name: '', middle_name: null, contact_number: null },
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
            }
          }
        }
      }

      results.push({
        receipt_id: receipt.receipt_id,
        receipt_number: receipt.receipt_number,
        payment_type: paymentType?.payment_type_name ?? 'unknown',
        amount: Number(receipt.amount),
        payment_date: receipt.payment_date,
        recorded_by: {
          user_id: recordedBy.user_id,
          first_name: recordedBy.first_name,
          last_name: recordedBy.last_name,
        },
        connection,
      })
    }

    return { status: 'success', data: results }
  } catch (err: any) {
    console.error('[getAllPaymentTransactions]', err)
    return { status: 'error', message: err?.message ?? 'Failed to load transactions' }
  }
}

// ============================================================================
// GET — Transaction filter options
// ============================================================================

export async function getTransactionFilterOptions(): Promise<{
  status: string
  data?: TransactionFilterOptions
  message?: string
}> {
  const supabase = await createClient()

  try {
    const [zonesRes, classRes, barangayRes, paymentTypeRes] = await Promise.all([
      supabase.from('zone').select('zone_id, zone_name').eq('is_active', true).order('zone_name'),
      supabase.from('classifications').select('classification_id, classification_name').order('classification_name'),
      supabase.from('barangay').select('barangay_id, barangay_name').eq('is_active', true).order('barangay_name'),
      supabase.from('payment_type').select('payment_type_id, payment_type_name').order('payment_type_name'),
    ])

    return {
      status: 'success',
      data: {
        zones: (zonesRes.data ?? []).map((z: any) => ({ id: z.zone_id, name: z.zone_name })),
        classifications: (classRes.data ?? []).map((c: any) => ({ id: c.classification_id, name: c.classification_name })),
        barangays: (barangayRes.data ?? []).map((b: any) => ({ id: b.barangay_id, name: b.barangay_name })),
        paymentTypes: (paymentTypeRes.data ?? []).map((t: any) => ({ id: t.payment_type_id, name: t.payment_type_name })),
      },
    }
  } catch (err: any) {
    console.error('[getTransactionFilterOptions]', err)
    return { status: 'error', message: 'Failed to load filter options' }
  }
}