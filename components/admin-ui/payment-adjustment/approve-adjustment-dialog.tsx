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
import { CheckCircle2, Loader2, TrendingUp, TrendingDown } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { 
  approveAdjustmentRequest,
  getAdjustmentRequestById,
  type AdjustmentRequestDetail,
} from '@/lib/actions/adjustment/payment.adjustment.actions'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const peso = (n: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n)

function DiffChip({ original, corrected }: { original: number; corrected: number }) {
  const diff = corrected - original
  if (Math.abs(diff) < 0.01) return <span className="text-slate-400 text-[11px]">no change</span>
  const up = diff > 0
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[11px] font-semibold', up ? 'text-emerald-700' : 'text-rose-600')}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? '+' : ''}{peso(diff)}
    </span>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface ApproveAdjustmentDialogProps {
  adjustmentId: string
  children: React.ReactNode
  onSuccess?: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────
export function ApproveAdjustmentDialog({
  adjustmentId,
  children,
  onSuccess,
}: ApproveAdjustmentDialogProps) {
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

  const handleApprove = async () => {
    if (!record) return
    
    setIsSubmitting(true)
    try {
      const res = await approveAdjustmentRequest(adjustmentId)
      if (res.status === 'success') {
        toast.success('Adjustment request approved successfully')
        setOpen(false)
        onSuccess?.()
      } else {
        toast.error(res.message ?? 'Failed to approve request')
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
                <div className="h-9 w-9 rounded-md bg-emerald-100 border border-emerald-200 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <AlertDialogTitle className="text-[14px] font-bold text-slate-900 leading-tight">
                    Approve Adjustment Request
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-[11px] text-slate-500 mt-0.5">
                    Review the correction below before approving. This action will update the recorded payment amount and cannot be undone.
                  </AlertDialogDescription>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {/* Summary card */}
              <div className="bg-slate-50 rounded-md p-3 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Adjustment Summary</span>
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
                  <div className="flex items-center justify-between py-2 border-b border-slate-100">
                    <span className="text-[11px] text-slate-500">Adjusted Amount</span>
                    <span className="text-[12px] font-semibold text-emerald-700">{peso(record.adjusted_amount)}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-[11px] text-slate-500">Difference</span>
                    <DiffChip original={record.original_amount} corrected={record.adjusted_amount} />
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
                onClick={handleApprove}
                disabled={isSubmitting}
                className="rounded-md h-9 text-[13px] bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 font-medium shadow-sm shadow-emerald-200"
              >
                {isSubmitting
                  ? <><Spinner /> Processing...</>
                  : <><CheckCircle2 className="h-3.5 w-3.5" /> Approve Request</>
                }
              </Button>
            </div>
          </>
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  )
}