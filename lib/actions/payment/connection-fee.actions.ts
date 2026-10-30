'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================================================
// Types
// ============================================================================

export interface ConnectionFeeInvoiceRecord {
  invoice_id: string
  connection_id: string
  consumer_id: string
  classification_id: string
  application_fee: number
  connection_fee: number
  total_amount: number
  is_paid: boolean
  created_at: string
  connection: {
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
}

export interface ConnectionFeePaymentResult {
  receipt_number: string
  payment_type: string
  amount_paid: number
}

// ============================================================================
// Helpers
// ============================================================================

function generateReceiptNumber(): string {
  const year = new Date().getFullYear()
  const random = Math.floor(10000 + Math.random() * 90000)
  return `OR-${year}-${random}`
}

async function generateUniqueReceiptNumber(supabase: any): Promise<string> {
  let receiptNumber = generateReceiptNumber()
  let isUnique = false
  let attempts = 0
  
  while (!isUnique && attempts < 5) {
    const { data: existing } = await supabase
      .from('receipts')
      .select('receipt_number')
      .eq('receipt_number', receiptNumber)
      .single()
    
    if (!existing) {
      isUnique = true
    } else {
      receiptNumber = generateReceiptNumber()
      attempts++
    }
  }
  
  return receiptNumber
}

// ============================================================================
// GET — Unpaid connection fee invoices
// ============================================================================

export async function getUnpaidConnectionFeeInvoices(): Promise<{
  status: 'success' | 'error'
  data?: ConnectionFeeInvoiceRecord[]
  message?: string
}> {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('connection_fee_invoices')
      .select(`
        invoice_id,
        connection_id,
        consumer_id,
        classification_id,
        application_fee,
        connection_fee,
        total_amount,
        is_paid,
        created_at,
        connection:connection_id (
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
      .eq('is_paid', false)
      .order('created_at', { ascending: false })

    if (error) throw error

    const records: ConnectionFeeInvoiceRecord[] = (data || []).map((row: any) => {
      const connection = row.connection?.[0] ?? row.connection
      const consumer = connection?.consumer?.[0] ?? connection?.consumer
      const zone = connection?.zone?.[0] ?? connection?.zone
      const barangay = zone?.barangay?.[0] ?? zone?.barangay
      const classification = connection?.classification?.[0] ?? connection?.classification

      return {
        invoice_id: row.invoice_id,
        connection_id: row.connection_id,
        consumer_id: row.consumer_id,
        classification_id: row.classification_id,
        application_fee: Number(row.application_fee),
        connection_fee: Number(row.connection_fee),
        total_amount: Number(row.total_amount),
        is_paid: row.is_paid,
        created_at: row.created_at,
        connection: {
          connection_no: connection?.connection_no || '',
          consumer: {
            consumer_id: consumer?.consumer_id || '',
            first_name: consumer?.first_name || '',
            last_name: consumer?.last_name || '',
            middle_name: consumer?.middle_name || null,
            contact_number: consumer?.contact_number || null,
          },
          zone: {
            zone_id: zone?.zone_id || '',
            zone_name: zone?.zone_name || '',
            barangay: {
              barangay_id: barangay?.barangay_id || '',
              barangay_name: barangay?.barangay_name || '',
            },
          },
          classification: {
            classification_id: classification?.classification_id || '',
            classification_name: classification?.classification_name || '',
          },
        },
      }
    })

    return { status: 'success', data: records }
  } catch (err: any) {
    console.error('[getUnpaidConnectionFeeInvoices]', err)
    return { status: 'error', message: 'Failed to load invoices' }
  }
}

// ============================================================================
// POST — Process connection fee payment
// ============================================================================

// export async function processConnectionFeePayment(payload: {
//   invoice_id: string
//   connection_id: string
//   consumer_id: string
//   classification_id: string
//   total_amount: number
// }): Promise<{
//   status: 'success' | 'error'
//   data?: ConnectionFeePaymentResult
//   message?: string
// }> {
//   const supabase = await createClient()

//   try {
//     // ── 1. Authentication ──────────────────────────────────────────────
//     const { data: { user }, error: authError } = await supabase.auth.getUser()
//     if (authError || !user) {
//       return { status: 'error', message: 'Not authenticated' }
//     }

//     // ── 2. Get invoice ─────────────────────────────────────────────────
//     const { data: invoice, error: invoiceError } = await supabase
//       .from('connection_fee_invoices')
//       .select('*')
//       .eq('invoice_id', payload.invoice_id)
//       .single()

//     if (invoiceError || !invoice) {
//       return { status: 'error', message: 'Invoice not found' }
//     }

//     // ── 3. Check if already paid ───────────────────────────────────────
//     if (invoice.is_paid) {
//       return { status: 'error', message: 'Invoice already paid' }
//     }

//     // ── 4. Get payment type ID ─────────────────────────────────────────
//     const { data: paymentType } = await supabase
//       .from('payment_type')
//       .select('payment_type_id')
//       .eq('payment_type_name', 'connection_fee')
//       .single()

//     if (!paymentType) {
//       return { status: 'error', message: 'Payment type not found' }
//     }

//     // ── 5. Generate unique receipt number ─────────────────────────────
//     const receiptNumber = await generateUniqueReceiptNumber(supabase)

//     // ── 6. Create receipt ──────────────────────────────────────────────
//     const { data: receipt, error: receiptError } = await supabase
//       .from('receipts')
//       .insert({
//         receipt_number: receiptNumber,
//         payment_type_id: paymentType.payment_type_id,
//         amount: payload.total_amount,
//         payment_date: new Date().toISOString().split('T')[0],
//         recorded_by: user.id,
//       })
//       .select()
//       .single()

//     if (receiptError || !receipt) {
//       return { status: 'error', message: 'Failed to create receipt' }
//     }

//     // ── 7. Create connection fee payment ───────────────────────────────
//     const { error: paymentError } = await supabase
//       .from('connection_fee_payments')
//       .insert({
//         connection_id: payload.connection_id,
//         invoice_id: payload.invoice_id,
//         receipt_id: receipt.receipt_id,
//       })

//     if (paymentError) {
//       // Rollback receipt
//       await supabase.from('receipts').delete().eq('receipt_id', receipt.receipt_id)
//       return { status: 'error', message: 'Failed to record payment' }
//     }

//     // ── 8. Update invoice ──────────────────────────────────────────────
//     const { error: updateError } = await supabase
//       .from('connection_fee_invoices')
//       .update({ 
//         is_paid: true,
//         updated_at: new Date().toISOString()
//       })
//       .eq('invoice_id', payload.invoice_id)
//       .eq('is_paid', false)

//     if (updateError) {
//       // Rollback everything
//       await supabase.from('connection_fee_payments').delete().eq('invoice_id', payload.invoice_id)
//       await supabase.from('receipts').delete().eq('receipt_id', receipt.receipt_id)
//       return { status: 'error', message: 'Failed to update invoice' }
//     }

//     return {
//       status: 'success',
//       data: {
//         receipt_number: receipt.receipt_number,
//         payment_type: 'connection_fee',
//         amount_paid: payload.total_amount,
//       }
//     }
//   } catch (err: any) {
//     console.error('[processConnectionFeePayment]', err)
//     return { status: 'error', message: err?.message ?? 'Payment failed' }
//   }
// }

// ============================================================================
// POST — Process connection fee payment
// ============================================================================

export async function processConnectionFeePayment(payload: {
  invoice_id: string
  connection_id: string
  consumer_id: string
  classification_id: string
  total_amount: number
}): Promise<{
  status: 'success' | 'error'
  data?: ConnectionFeePaymentResult
  message?: string
}> {
  const supabase = await createClient()

  try {
    // ── 1. Authentication ──────────────────────────────────────────────
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { status: 'error', message: 'Not authenticated' }
    }

    // ── 2. Get invoice ─────────────────────────────────────────────────
    const { data: invoice, error: invoiceError } = await supabase
      .from('connection_fee_invoices')
      .select('*')
      .eq('invoice_id', payload.invoice_id)
      .single()

    if (invoiceError || !invoice) {
      return { status: 'error', message: 'Invoice not found' }
    }

    // ── 3. Check if already paid ───────────────────────────────────────
    if (invoice.is_paid) {
      return { status: 'error', message: 'Invoice already paid' }
    }

    // ── 4. Get payment type ID ─────────────────────────────────────────
    const { data: paymentType } = await supabase
      .from('payment_type')
      .select('payment_type_id')
      .eq('payment_type_name', 'connection_fee')
      .single()

    if (!paymentType) {
      return { status: 'error', message: 'Payment type not found' }
    }

    // ── 5. Generate unique receipt number ─────────────────────────────
    const receiptNumber = await generateUniqueReceiptNumber(supabase)

    // ── 6. Create receipt ──────────────────────────────────────────────
    const { data: receipt, error: receiptError } = await supabase
      .from('receipts')
      .insert({
        receipt_number: receiptNumber,
        payment_type_id: paymentType.payment_type_id,
        amount: payload.total_amount,
        payment_date: new Date().toISOString().split('T')[0],
        recorded_by: user.id,
      })
      .select()
      .single()

    if (receiptError || !receipt) {
      return { status: 'error', message: 'Failed to create receipt' }
    }

    // ── 7. Create connection fee payment ───────────────────────────────
    const { error: paymentError } = await supabase
      .from('connection_fee_payments')
      .insert({
        connection_id: payload.connection_id,
        invoice_id: payload.invoice_id,
        receipt_id: receipt.receipt_id,
      })

    if (paymentError) {
      // Rollback receipt
      await supabase.from('receipts').delete().eq('receipt_id', receipt.receipt_id)
      return { status: 'error', message: 'Failed to record payment' }
    }

    // ── 8. Update invoice ──────────────────────────────────────────────
    const { error: updateError } = await supabase
      .from('connection_fee_invoices')
      .update({ 
        is_paid: true,
        updated_at: new Date().toISOString()
      })
      .eq('invoice_id', payload.invoice_id)
      .eq('is_paid', false)

    if (updateError) {
      // Rollback everything
      await supabase.from('connection_fee_payments').delete().eq('invoice_id', payload.invoice_id)
      await supabase.from('receipts').delete().eq('receipt_id', receipt.receipt_id)
      return { status: 'error', message: 'Failed to update invoice' }
    }

    // ── 9. Update service connection status to CONNECTED ────────────────
    // Get the CONNECTED status ID
    const { data: connectedStatus, error: statusError } = await supabase
      .from('connection_status')
      .select('connection_status_id')
      .eq('connection_status_name', 'Connected')
      .single()

    if (statusError || !connectedStatus) {
      console.error('Failed to find CONNECTED status:', statusError)
      // Don't rollback payment, but log error
      // Connection remains PENDING, admin will need to manually update
    } else {
      // Update the service connection status
      const { error: connectionUpdateError } = await supabase
        .from('service_connections')
        .update({ 
          connection_status_id: connectedStatus.connection_status_id,
          updated_at: new Date().toISOString()
        })
        .eq('connection_id', payload.connection_id)

      if (connectionUpdateError) {
        console.error('Failed to update connection status:', connectionUpdateError)
        // Don't rollback payment, just log error
      }
    }

    return {
      status: 'success',
      data: {
        receipt_number: receipt.receipt_number,
        payment_type: 'connection_fee',
        amount_paid: payload.total_amount,
      }
    }
  } catch (err: any) {
    console.error('[processConnectionFeePayment]', err)
    return { status: 'error', message: err?.message ?? 'Payment failed' }
  }
}