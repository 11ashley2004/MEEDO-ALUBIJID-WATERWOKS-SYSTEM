'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { CreditCard, CheckCircle2, AlertCircle, Zap } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { processReconnectionPayment } from '@/lib/actions/payment/reconnection-payment.actions'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatPeso = (amount: number) => {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(amount)
}

// ─── Reconnection Fee Pay Dialog Props ───────────────────────────────────────

interface ReconnectionFeePayDialogProps {
  reconnectionId: string
  reconnectionNo: string
  remainingBalance: number
  paymentStatus: string // Expecting exact database values: 'unpaid', 'partial', 'paid'
  onSuccess: () => void
  children: React.ReactNode
}

// ─── Main Dialog Component ────────────────────────────────────────────────────

export function ReconnectionFeePayDialog({
  reconnectionId,
  reconnectionNo,
  remainingBalance,
  paymentStatus,
  onSuccess,
  children,
}: ReconnectionFeePayDialogProps) {
  const [open, setOpen] = useState(false)
  const [amountInput, setAmountInput] = useState('')
  const [amountError, setAmountError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setAmountInput('')
      setAmountError('')
    }
    setOpen(newOpen)
  }

  const setPartialAmount = (pct: number) => {
    setAmountInput((remainingBalance * pct).toFixed(2))
    setAmountError('')
  }

  const handleConfirm = async () => {
    const amount = parseFloat(amountInput)
    if (!amountInput.trim() || isNaN(amount) || amount <= 0) {
      setAmountError('Please enter a valid amount.')
      return
    }
    if (amount > remainingBalance + 0.01) {
      setAmountError(`Cannot exceed remaining balance of ${formatPeso(remainingBalance)}.`);
      return
    }
    setAmountError('')
    setIsSubmitting(true)

    try {
      const result = await processReconnectionPayment({
        reconnection_id: reconnectionId,
        amount_paid: amount,
      })

      if (result.status === 'success') {
        toast.success('Payment processed successfully', {
          description: `Receipt #: ${result.data?.receipt_number}`,
        })
        setOpen(false)
        onSuccess()
      } else {
        toast.error(result.message ?? 'Failed to process payment')
      }
    } catch {
      toast.error('Failed to process payment')
    } finally {
      setIsSubmitting(false)
    }
  }

  const parsedAmount = parseFloat(amountInput)
  const validAmount = !isNaN(parsedAmount) && parsedAmount > 0
  const isFullPayment = validAmount && parsedAmount >= remainingBalance - 0.01

  // Formatting state variants locally for styling based on raw billing/payment status names
  const normalizedStatus = paymentStatus.toLowerCase()
  const isPartial = normalizedStatus === 'partial'
  const isPaid = normalizedStatus === 'paid'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="w-full sm:max-w-md flex flex-col p-0 gap-0 border-l border-slate-200 bg-white rounded-md max-h-[90vh]">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-md bg-violet-100 border border-violet-200 flex items-center justify-center shrink-0">
              <CreditCard className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <DialogTitle className="text-[14px] font-bold text-slate-900 leading-tight">
                Pay Reconnection Fee
              </DialogTitle>
              <DialogDescription className="text-[11px] text-slate-500 mt-0.5">
                Reconnection # <span className="font-medium text-slate-700">{reconnectionNo}</span>
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Reconnection info */}
          <div className="bg-slate-50 rounded-md p-3 space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-3.5 w-3.5 text-violet-500" />
              <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">
                Reconnection Details
              </span>
            </div>
            <div className="space-y-0">
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-[11px] text-slate-500">Reconnection #</span>
                <span className="text-[12px] font-mono font-medium text-slate-700">
                  {reconnectionNo}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-[11px] text-slate-500">Amount Due</span>
                <span className="text-[12px] font-medium text-rose-600">
                  {formatPeso(remainingBalance)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-[11px] text-slate-500">Payment Status</span>
                <span 
                  className={cn(
                    "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border",
                    isPaid && "bg-emerald-50 text-emerald-700 border-emerald-200",
                    isPartial && "bg-sky-50 text-sky-700 border-sky-200",
                    !isPaid && !isPartial && "bg-amber-50 text-amber-700 border-amber-200"
                  )}
                >
                  <AlertCircle className="h-2.5 w-2.5" />
                  {paymentStatus}
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
                onClick={() => { setAmountInput(remainingBalance.toFixed(2)); setAmountError('') }}
              >
                Full ({formatPeso(remainingBalance)})
              </Button>
              {remainingBalance > 100 && (
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
                  ? <span className="text-emerald-700 font-medium">✓ This will fully settle the reconnection fee</span>
                  : (
                    <span>
                      Remaining after payment:{' '}
                      <strong className="text-slate-700">{formatPeso(remainingBalance - parsedAmount)}</strong>
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
      </DialogContent>
    </Dialog>
  )
}