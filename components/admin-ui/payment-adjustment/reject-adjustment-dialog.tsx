'use client'

import { useState, useEffect } from 'react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { XCircle, Loader2, AlertTriangle } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  rejectAdjustmentRequest,
  getAdjustmentRequestById,
  type AdjustmentRequestDetail,
} from '@/lib/actions/adjustment/payment.adjustment.actions'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const peso = (n: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n)

// ─── Props ────────────────────────────────────────────────────────────────────
interface RejectAdjustmentDialogProps {
  adjustmentId: string
  children: React.ReactNode
  onSuccess?: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────
export function RejectAdjustmentDialog({
  adjustmentId,
  children,
  onSuccess,
}: RejectAdjustmentDialogProps) {
  const [open, setOpen] = useState(false)
  const [record, setRecord] = useState<AdjustmentRequestDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchRecord = async () => {
    setIsLoading(true)
    try {
      const res = await getAdjustmentRequestById(adjustmentId)
      if (res.status === 'success' && res.data) {
        setRecord(res.data)
      } else {
        toast.error(res.message ?? 'Failed to load adjustment details')
        setOpen(false)
      }
    } catch {
      toast.error('Failed to load adjustment details')
      setOpen(false)
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenChange = async (newOpen: boolean) => {
    if (newOpen) {
      await fetchRecord()
    } else {
      setRecord(null)
    }
    setOpen(newOpen)
  }

  const handleReject = async () => {
    if (!record) return
    
    setIsSubmitting(true)
    try {
      const res = await rejectAdjustmentRequest(adjustmentId)
      if (res.status === 'success') {
        toast.success('Adjustment request rejected')
        setOpen(false)
        onSuccess?.()
      } else {
        toast.error(res.message ?? 'Failed to reject request')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!record && !isLoading && open) {
    return null
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        {children}
      </AlertDialogTrigger>

      <AlertDialogContent className="w-full sm:max-w-md flex flex-col p-0 gap-0 border-l border-slate-200 bg-white rounded-md max-h-[90vh]">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
          </div>
        ) : record ? (
          <>
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-slate-100">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-md bg-rose-100 border border-rose-200 flex items-center justify-center shrink-0">
                  <XCircle className="h-4 w-4 text-rose-600" />
                </div>
                <div>
                  <AlertDialogTitle className="text-[14px] font-bold text-slate-900 leading-tight">
                    Reject Adjustment Request
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-[11px] text-slate-500 mt-0.5">
                    Review the correction below before rejecting. This action cannot be undone.
                  </AlertDialogDescription>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {/* Warning banner */}
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-md bg-rose-50 border border-rose-200">
                <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[12px] font-semibold text-rose-800">Warning</p>
                  <p className="text-[11px] text-rose-700 mt-0.5">
                    Rejecting this request will leave the original payment record unchanged.
                    This action cannot be undone.
                  </p>
                </div>
              </div>

              {/* Summary card */}
              <div className="bg-slate-50 rounded-md p-3 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">Adjustment Summary</span>
                </div>
                <div className="space-y-0">
                  <div className="flex items-center justify-between py-2 border-b border-slate-100">
                    <span className="text-[11px] text-slate-500">Receipt No.</span>
                    <span className="text-[12px] font-mono font-medium text-slate-700">{record.payment.receipt_number}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-slate-100">
                    <span className="text-[11px] text-slate-500">Consumer</span>
                    <span className="text-[12px] font-medium text-slate-700">{record.consumer.account_name}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-slate-100">
                    <span className="text-[11px] text-slate-500">Serial No.</span>
                    <span className="text-[12px] font-mono text-slate-600">{record.meter_account.meter_serial_no}</span>
                  </div>
                  <Separator className="my-1" />
                  <div className="flex items-center justify-between py-2 border-b border-slate-100">
                    <span className="text-[11px] text-slate-500">Original Amount</span>
                    <span className="text-[12px] text-slate-600">{peso(record.original_amount)}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-[11px] text-slate-500">Requested Adjustment</span>
                    <span className="text-[12px] line-through text-slate-500">{peso(record.adjusted_amount)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 flex items-center justify-end gap-2.5 bg-slate-50/60 border-t border-slate-100">
              <AlertDialogCancel disabled={isSubmitting} className="rounded-md h-9 text-[13px] border-slate-200">
                Cancel
              </AlertDialogCancel>
              <Button
                onClick={handleReject}
                disabled={isSubmitting}
                className="rounded-md h-9 text-[13px] bg-rose-600 hover:bg-rose-700 text-white gap-1.5 font-medium shadow-sm shadow-rose-200"
              >
                {isSubmitting
                  ? <><Spinner /> Processing...</>
                  : <><XCircle className="h-3.5 w-3.5" /> Reject Request</>
                }
              </Button>
            </div>
          </>
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  )
}