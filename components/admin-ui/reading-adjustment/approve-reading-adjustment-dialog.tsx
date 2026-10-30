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
import { CheckCircle2 } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'
import { approveReadingAdjustmentRequest } from '@/lib/actions/meter-reading/meter-reading-adjustment.actions'

interface ApproveReadingAdjustmentDialogProps {
  adjustmentId: string
  children: React.ReactNode
  onSuccess?: () => void
}

export function ApproveReadingAdjustmentDialog({
  adjustmentId,
  children,
  onSuccess,
}: ApproveReadingAdjustmentDialogProps) {
  const [open, setOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleApprove = async () => {
    setIsSubmitting(true)
    try {
      const res = await approveReadingAdjustmentRequest(adjustmentId)
      if (res.status === 'success') {
        toast.success('Reading adjustment approved successfully')
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

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {children}
      </AlertDialogTrigger>

      <AlertDialogContent className="sm:max-w-sm rounded-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-emerald-100 border border-emerald-200 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <AlertDialogTitle className="text-[14px] font-bold text-slate-900">
                Approve Reading Adjustment?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[11px] text-slate-500 mt-0.5">
                This will update the meter reading and recalculate consumption.
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        <AlertDialogFooter className="gap-2.5">
          <AlertDialogCancel disabled={isSubmitting} className="!rounded-md h-9 text-[13px]">
            Cancel
          </AlertDialogCancel>
          <Button
            onClick={handleApprove}
            disabled={isSubmitting}
            className="rounded-md h-9 text-[13px] bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 font-medium"
          >
            {isSubmitting
              ? <><Spinner /> Processing...</>
              : 'Approve'
            }
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}