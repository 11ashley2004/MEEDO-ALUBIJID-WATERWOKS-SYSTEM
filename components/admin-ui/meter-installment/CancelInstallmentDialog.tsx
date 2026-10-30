'use client'

import { useState } from 'react'
import { Ban, AlertTriangle } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

import { cancelMeterInstallment } from '@/lib/actions/meter-installment/meter-installment.actions'

export interface CancelInstallmentDialogProps {
  installmentId: string | null
  meterSerialNo?: string
  consumerName?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  // Called after a successful cancellation so the parent list can refresh.
  onCancelled?: () => void
}

export function CancelInstallmentDialog({
  installmentId,
  meterSerialNo,
  consumerName,
  open,
  onOpenChange,
  onCancelled,
}: CancelInstallmentDialogProps) {
  const [isCancelling, setIsCancelling] = useState(false)

  const handleOpenChange = (next: boolean) => {
    if (isCancelling) return
    onOpenChange(next)
  }

  const handleConfirm = async () => {
    if (!installmentId) return

    setIsCancelling(true)
    try {
      const result = await cancelMeterInstallment(installmentId)

      if (result.status === 'success') {
        toast.success(result.message || 'Installment plan cancelled')
        onOpenChange(false)
        onCancelled?.()
      } else {
        toast.error(result.message || 'Failed to cancel installment plan')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsCancelling(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-full sm:max-w-sm p-0 gap-0 border border-slate-200 bg-white rounded-md overflow-hidden">

        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-5">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-md bg-rose-50 border border-rose-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-[18px] w-[18px] text-rose-500" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <DialogTitle className="text-[16px] font-bold text-slate-900 leading-tight">
                Cancel Installment Plan?
              </DialogTitle>
              <DialogDescription className="text-[12.5px] text-slate-500 mt-1">
                {meterSerialNo ? (
                  <>
                    This will cancel the installment plan for{' '}
                    <span className="font-semibold text-slate-700">
                      {consumerName ? `${consumerName} · ` : ''}{meterSerialNo}
                    </span>
                    . This action cannot be undone.
                  </>
                ) : (
                  'This will cancel the installment plan. This action cannot be undone.'
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Footer */}
        <DialogFooter className="px-6 pb-6 flex items-center justify-end gap-2.5">
          <Button
            variant="outline"
            disabled={isCancelling}
            onClick={() => onOpenChange(false)}
            className="h-10 px-4 rounded-md text-[13.5px] font-medium border-slate-200 text-slate-600"
          >
            Keep Plan
          </Button>
          <Button
            disabled={isCancelling}
            onClick={handleConfirm}
            className="h-10 px-4 rounded-md text-[13.5px] font-semibold gap-2 bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-40"
          >
            {isCancelling ? (
              <Spinner />
            ) : (
              <Ban className="h-3.5 w-3.5" />
            )}
            Cancel Plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}