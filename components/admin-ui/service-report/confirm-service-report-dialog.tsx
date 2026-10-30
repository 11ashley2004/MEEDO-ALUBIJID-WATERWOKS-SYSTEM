'use client'

import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { confirmServiceReportCompletion } from '@/lib/actions/service-report/service-report-workflow.actions'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  reportId: string
  referenceNo?: string | null
  issueName?: string | null
  onSuccess?: () => void
}

export default function ConfirmServiceReportDialog({
  open,
  onOpenChange,
  reportId,
  referenceNo,
  issueName,
  onSuccess,
}: Props) {
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    setLoading(true)
    const res = await confirmServiceReportCompletion(reportId)
    setLoading(false)
    if (res.status === 'error') {
      toast.error(res.message ?? 'Failed to confirm completion')
      return
    }
    toast.success(res.message ?? 'Completion confirmed')
    onOpenChange(false)
    onSuccess?.()
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-md sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-5 w-5 text-purple-600" />
            Confirm completion
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-relaxed">
            Confirm that field work for{' '}
            <span className="font-semibold text-foreground">
              {referenceNo ?? 'this report'}
            </span>
            {issueName ? ` (${issueName})` : ''} is complete. This closes the
            service report and notifies the consumer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-md" disabled={loading}>
            Cancel
          </AlertDialogCancel>
          <Button
            className="rounded-md bg-purple-600 hover:bg-purple-700"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? (
              <>
                <Spinner className="mr-1.5" />
                Confirming…
              </>
            ) : (
              'Confirm completion'
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
