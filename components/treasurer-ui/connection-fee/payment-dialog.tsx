// components/admin-ui/connection-fee-payment/payment-dialog.tsx

'use client'

import { useState } from 'react'
import { CheckCircle2, Receipt } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { format } from 'date-fns'
import {
  recordMeterAccountFeePayment,
  type UnpaidMeterAccount,
} from '@/lib/actions/payment/connection-fee-payment.actions'

function formatPeso(n: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(n)
}

function formatDate(d: string): string {
  return format(new Date(d), 'MMM dd, yyyy')
}

interface PaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  account: UnpaidMeterAccount | null
  onSuccess: () => void
}

export function PaymentDialog({ open, onOpenChange, account, onSuccess }: PaymentDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!account) return

    setIsSubmitting(true)
    try {
      const res = await recordMeterAccountFeePayment({
        meter_account_id: account.meter_account_id,
        amount_paid: account.total_connection_fee,
      })

      if (res.status === 'success') {
        toast.success(res.message)
        onOpenChange(false)
        onSuccess()
      } else {
        toast.error(res.message ?? 'Failed to record payment')
      }
    } catch {
      toast.error('Failed to record payment')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!account) return null

  const getClassificationStyle = (name: string) => {
    if (name === 'Residential') return 'bg-sky-50 text-sky-700 border-sky-200'
    if (name === 'Commercial') return 'bg-amber-50 text-amber-700 border-amber-200'
    return 'bg-rose-50 text-rose-700 border-rose-200'
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-lg border border-slate-200 p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-white">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center">
              <Receipt className="h-3.5 w-3.5 text-emerald-600" />
            </div>
            <DialogTitle className="text-sm font-semibold text-slate-800">
              Confirm Payment
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-500 mt-1.5">
            Review details for meter S/N{account.meter_serial_no}
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Consumer Details */}
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 space-y-2">
            <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest mb-2">
              Consumer Information
            </p>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Name:</span>
              <span className="font-medium text-slate-700">{account.consumer_name}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Barangay / Zone:</span>
              <span className="font-medium text-slate-700">{account.barangay_name} — {account.zone_name}</span>
            </div>
          </div>

          {/* Meter Account Details */}
          <div className="rounded-lg border border-slate-100 overflow-hidden">
            <div className="bg-slate-50 px-3 py-2 border-b border-slate-100">
              <p className="text-[9px] font-bold text-violet-600 uppercase tracking-widest">
                Meter Account
              </p>
            </div>
            <div className="px-3 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <p className="text-xs font-medium text-slate-700 font-mono">
                  {account.meter_serial_no}
                </p>
                <span className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-semibold border',
                  getClassificationStyle(account.classification_name)
                )}>
                  {account.classification_name}
                </span>
              </div>
              <span className="text-xs font-mono font-medium text-slate-600">
                {formatPeso(account.total_connection_fee)}
              </span>
            </div>
          </div>

          {/* Total */}
          <div className="rounded-lg border border-slate-100 overflow-hidden">
            <div className="bg-slate-50 px-3 py-2 border-b border-slate-100">
              <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">
                Amount Due
              </p>
            </div>
            <div className="p-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-slate-700">Total Amount</span>
                <span className="text-base font-bold text-emerald-600 font-mono">
                  {formatPeso(account.total_connection_fee)}
                </span>
              </div>
            </div>
          </div>

          {/* Meta */}
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <div className="flex justify-between text-[10px]">
              <span className="text-slate-400">S/N</span>
              <span className="font-mono text-slate-500">{account.meter_serial_no}</span>
            </div>
            <div className="flex justify-between text-[10px] mt-1">
              <span className="text-slate-400">Created Date</span>
              <span className="text-slate-500">{formatDate(account.created_at)}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="px-5 py-3 bg-slate-50/50 border-t border-slate-100">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-8 rounded-md text-xs border-slate-200"
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="h-8 rounded-md text-xs bg-emerald-600 hover:bg-emerald-700 border border-emerald-700 gap-1.5"
          >
            {isSubmitting ? <Spinner /> : <CheckCircle2 className="h-3 w-3" />}
            Pay {formatPeso(account.total_connection_fee)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}