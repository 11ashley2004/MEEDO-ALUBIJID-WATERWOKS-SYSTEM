'use client'

import { useState } from 'react'
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
import { XCircle } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'
import { rejectReadingAdjustmentRequest } from '@/lib/actions/meter-reading/meter-reading-adjustment.actions'

interface RejectReadingAdjustmentDialogProps {
  adjustmentId: string
  children: React.ReactNode
  onSuccess?: () => void
}

export function RejectReadingAdjustmentDialog({
  adjustmentId,
  children,
  onSuccess,
}: RejectReadingAdjustmentDialogProps) {
  const [open, setOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleReject = async () => {
    setIsSubmitting(true)
    try {
      const res = await rejectReadingAdjustmentRequest(adjustmentId)
      if (res.status === 'success') {
        toast.success('Reading adjustment request rejected')
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

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {children}
      </AlertDialogTrigger>

      <AlertDialogContent className="sm:max-w-sm rounded-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-rose-100 border border-rose-200 flex items-center justify-center shrink-0">
              <XCircle className="h-4 w-4 text-rose-600" />
            </div>
            <div>
              <AlertDialogTitle className="text-[14px] font-bold text-slate-900">
                Reject Reading Adjustment?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[11px] text-slate-500 mt-0.5">
                The original meter reading will remain unchanged.
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        <AlertDialogFooter className="gap-2.5">
          <AlertDialogCancel disabled={isSubmitting} className="!rounded-md h-9 text-[13px]">
            Cancel
          </AlertDialogCancel>
          <Button
            onClick={handleReject}
            disabled={isSubmitting}
            variant="outline"
            className="rounded-md h-9 text-[13px] text-rose-600 hover:text-rose-700 border-rose-200 hover:border-rose-300 gap-1.5 font-medium"
          >
            {isSubmitting
              ? <><Spinner /> Processing...</>
              : 'Reject'
            }
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}