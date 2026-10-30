// components/treasurer-ui/payment-billing/pay-bill-dialog.tsx

'use client'

import { useState, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  CreditCard, Receipt, Loader2, CheckCircle2, AlertCircle,
  Droplet, Home, Building2, Factory,
} from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import {
  getBillingForPrint,
  processPayment,
  type BillingRecord,
  type MeterCharge,
} from '@/lib/actions/payment/billing-payment.actions'
import { printReceipt } from './print-receipt'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatPeso = (amount: number) => {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(amount)
}

const formatDate = (dateString: string) => {
  if (!dateString) return '—'
  return new Date(dateString).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const formatPeriod = (periodStart: string) => {
  if (!periodStart) return '—'
  return new Date(periodStart).toLocaleDateString('en-PH', {
    month: 'long',
    year: 'numeric',
  })
}

// Get classification icon
const getClassificationIcon = (classificationName: string) => {
  const name = classificationName.toLowerCase()
  if (name.includes('residential')) return <Home className="h-3.5 w-3.5" />
  if (name.includes('commercial')) return <Building2 className="h-3.5 w-3.5" />
  if (name.includes('industrial')) return <Factory className="h-3.5 w-3.5" />
  return <Droplet className="h-3.5 w-3.5" />
}

// ─── Pay Bill Dialog Props ────────────────────────────────────────────────────

interface PayBillDialogProps {
  billingId: string
  children: React.ReactNode
  onSuccess?: () => void
}

// ─── Main Dialog Component ────────────────────────────────────────────────────

export function PayBillDialog({ 
  billingId, 
  children, 
  onSuccess,
}: PayBillDialogProps) {
  const [open, setOpen] = useState(false)
  const [bill, setBill] = useState<BillingRecord | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [amountInput, setAmountInput] = useState('')
  const [amountError, setAmountError] = useState('')

  const fetchBill = async () => {
    setIsLoading(true)
    try {
      const result = await getBillingForPrint(billingId)
      if (result.status === 'success' && result.data) {
        setBill(result.data)
        setAmountInput('')
        setAmountError('')
      } else {
        toast.error(result.message ?? 'Failed to load billing details')
        setOpen(false)
      }
    } catch {
      toast.error('Failed to load billing details')
      setOpen(false)
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenChange = async (newOpen: boolean) => {
    if (newOpen) {
      await fetchBill()
    } else {
      setAmountInput('')
      setAmountError('')
      setBill(null)
    }
    setOpen(newOpen)
  }

  const setPartialAmount = (pct: number) => {
    if (!bill) return
    setAmountInput((bill.amount_due * pct).toFixed(2))
    setAmountError('')
  }

  const handleConfirm = async () => {
    if (!bill) return
    const amount = parseFloat(amountInput)
    if (!amountInput.trim() || isNaN(amount) || amount <= 0) {
      setAmountError('Please enter a valid amount.')
      return
    }
    if (amount > bill.amount_due + 0.01) {
      setAmountError(`Cannot exceed amount due of ${formatPeso(bill.amount_due)}.`)
      return
    }
    setAmountError('')
    setIsSubmitting(true)

    try {
      const result = await processPayment({
        billing_id: billingId,
        amount_paid: amount,
      })

      if (result.status === 'success' && result.data) {
        toast.success('Payment processed successfully', {
          description: `Receipt #: ${result.data.receipt_number}`,
        })
        
        // Fetch the updated bill data for the receipt
        const updatedBill = await getBillingForPrint(billingId)
        
        // Close the dialog
        setOpen(false)
        
        // Call onSuccess to refresh the table
        onSuccess?.()
        
        if (updatedBill.status === 'success' && updatedBill.data) {
          // Print the receipt with the updated data and processed by name
          printReceipt({
            bill: updatedBill.data,
            billingPaymentId: result.data.billing_payment_id,
            receiptNumber: result.data.receipt_number,
            amountPaid: result.data.amount_paid,
            paymentDate: new Date().toISOString(),
            remainingBalance: result.data.remaining_balance,
            processedByName: result.data.processed_by_name, // Pass the actual name
          })
        } else {
          // If we can't fetch the updated bill, still print with what we have
          printReceipt({
            bill: bill,
            billingPaymentId: result.data.billing_payment_id,
            receiptNumber: result.data.receipt_number,
            amountPaid: result.data.amount_paid,
            paymentDate: new Date().toISOString(),
            remainingBalance: result.data.remaining_balance,
            processedByName: result.data.processed_by_name, // Pass the actual name
          })
        }
      } else {
        toast.error(result.message ?? 'Failed to process payment')
      }
    } catch {
      toast.error('Failed to process payment')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!bill && !isLoading && open) {
    return null
  }

  const parsedAmount = parseFloat(amountInput)
  const validAmount = !isNaN(parsedAmount) && parsedAmount > 0
  const isFullPayment = validAmount && bill && parsedAmount >= bill.amount_due - 0.01

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="w-full sm:max-w-md flex flex-col p-0 gap-0 border-l border-slate-200 bg-white rounded-md max-h-[90vh]">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
          </div>
        ) : bill ? (
          <>
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-slate-100">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-md bg-violet-100 border border-violet-200 flex items-center justify-center shrink-0">
                  <CreditCard className="h-4 w-4 text-violet-600" />
                </div>
                <div>
                  <DialogTitle className="text-[14px] font-bold text-slate-900 leading-tight">
                    Make Payment
                  </DialogTitle>
                  <DialogDescription className="text-[11px] text-slate-500 mt-0.5">
                    Enter the amount to pay. Partial payments are allowed.
                  </DialogDescription>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {/* Consumer info */}
              <div className="bg-slate-50 rounded-md p-3 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <Receipt className="h-3.5 w-3.5 text-violet-500" />
                  <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">
                    Consumer Information
                  </span>
                  <div className="flex items-center gap-1 ml-auto text-[10px] text-slate-500">
                    {getClassificationIcon(bill.meter_account.classification.classification_name)}
                    <span>{bill.meter_account.classification.classification_name}</span>
                  </div>
                </div>
                <div className="space-y-0">
                  <div className="flex items-center justify-between py-2 border-b border-slate-100">
                    <span className="text-[11px] text-slate-500">S/N</span>
                    <span className="text-[12px] font-mono font-medium text-slate-700">
                      {bill.meter_account.meter_serial_no}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-[11px] text-slate-500">Consumer</span>
                    <span className="text-[12px] font-medium text-slate-700">
                      {bill.meter_account.consumer.account_name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-t border-slate-100">
                    <span className="text-[11px] text-slate-500">Billing Period</span>
                    <span className="text-[12px] text-slate-700">
                      {formatPeriod(bill.period_start)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-t border-slate-100">
                    <span className="text-[11px] text-slate-500">Due Date</span>
                    <span className="text-[12px] text-slate-700">
                      {formatDate(bill.due_date)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Financial summary - simplified */}
              <div className="bg-slate-50 rounded-md p-3 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <Droplet className="h-3.5 w-3.5 text-violet-500" />
                  <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">
                    Payment Summary
                  </span>
                </div>
                <div className="space-y-0">
                  <div className="flex items-center justify-between py-2 border-b border-slate-100">
                    <span className="text-[11px] text-slate-500">Total Bill</span>
                    <span className="text-[12px] font-semibold text-slate-800">{formatPeso(bill.total_billing)}</span>
                  </div>
                  {bill.amount_paid_total > 0 && (
                    <div className="flex items-center justify-between py-2 border-b border-slate-100">
                      <span className="text-[11px] text-slate-500">Payments Made</span>
                      <span className="text-[12px] text-emerald-700">− {formatPeso(bill.amount_paid_total)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between py-2 font-semibold">
                    <span className="text-[12px] text-slate-700">Amount Due</span>
                    <span className="text-[14px] font-bold text-rose-600">
                      {formatPeso(bill.amount_due)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Amount input */}
              <div className="space-y-1.5">
                <Label htmlFor="pay-amount" className="text-[12px] font-semibold text-slate-700">
                  Amount to Pay <span className="text-rose-500">*</span>
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₱</span>
                  <Input
                    id="pay-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={amountInput}
                    onChange={(e) => { setAmountInput(e.target.value); setAmountError('') }}
                    className={cn(
                      'pl-7 rounded-md text-[13px]',
                      amountError ? 'border-rose-500 focus-visible:ring-rose-500' : 'border-slate-200 focus-visible:ring-violet-500'
                    )}
                    autoFocus
                  />
                </div>
                {amountError && (
                  <p className="text-[11px] text-rose-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {amountError}
                  </p>
                )}

                {/* Quick-fill buttons */}
                <div className="flex gap-2 pt-1 flex-wrap">
                  <Button
                    type="button" variant="outline" size="sm"
                    className="text-[11px] h-7 rounded-md border-slate-200 hover:border-violet-300 hover:bg-violet-50"
                    onClick={() => { setAmountInput(bill.amount_due.toFixed(2)); setAmountError('') }}
                  >
                    Full ({formatPeso(bill.amount_due)})
                  </Button>
                  {bill.amount_due > 100 && (
                    <>
                      <Button 
                        type="button" variant="outline" size="sm" 
                        className="text-[11px] h-7 rounded-md border-slate-200 hover:border-violet-300 hover:bg-violet-50" 
                        onClick={() => setPartialAmount(0.75)}
                      >
                        75%
                      </Button>
                      <Button 
                        type="button" variant="outline" size="sm" 
                        className="text-[11px] h-7 rounded-md border-slate-200 hover:border-violet-300 hover:bg-violet-50" 
                        onClick={() => setPartialAmount(0.50)}
                      >
                        50%
                      </Button>
                    </>
                  )}
                </div>

                {/* Outcome preview */}
                {validAmount && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    {isFullPayment
                      ? <span className="text-emerald-700 font-medium">✓ This will fully settle the bill</span>
                      : (
                        <span>
                          Remaining after payment:{' '}
                          <strong className="text-slate-700">{formatPeso(bill.amount_due - parsedAmount)}</strong>
                        </span>
                      )}
                  </p>
                )}
              </div>
            </div>

            <Separator />

            {/* Footer */}
            <div className="px-6 py-4 flex items-center justify-end gap-2.5 bg-slate-50/60">
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isSubmitting}
                className="rounded-md h-9 text-[13px] border-slate-200 hover:bg-slate-100"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={isSubmitting || !validAmount}
                className="rounded-md h-9 text-[13px] bg-violet-600 hover:bg-violet-700 text-white gap-1.5 font-medium shadow-sm shadow-violet-200"
              >
                {isSubmitting
                  ? <><Spinner /> Processing…</>
                  : <><CheckCircle2 className="h-3.5 w-3.5" /> Confirm Payment</>
                }
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}