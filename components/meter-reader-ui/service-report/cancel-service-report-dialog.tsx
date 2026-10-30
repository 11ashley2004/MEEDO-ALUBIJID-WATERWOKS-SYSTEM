'use client'

import { useState } from 'react'
import { Ban } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { cancelServiceReport, type ServiceReport } from '@/lib/actions/service-report/service-report.actions'

export default function CancelServiceReportDialog({
  report, open, onOpenChange, onDone,
}: {
  report: ServiceReport | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onDone: () => void
}) {
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!report) return
    setSubmitting(true)
    try {
      const res = await cancelServiceReport(report.report_id)
      if (res.status === 'success') {
        toast.success(res.message || 'Service report cancelled')
        onOpenChange(false)
        onDone()
      } else {
        toast.error(res.message || 'Failed to cancel service report')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm bg-white rounded-lg p-0 gap-0 overflow-hidden">
        <div className="px-6 pt-6 pb-5">
          <DialogHeader>
            <div className="flex items-center gap-3.5 mb-1">
              <div className="h-10 w-10 rounded-lg bg-rose-100 flex items-center justify-center shrink-0">
                <Ban className="h-4.5 w-4.5 text-rose-600" />
              </div>
              <DialogTitle className="text-[15px] font-bold text-slate-900 leading-tight">
                Cancel Service Report
              </DialogTitle>
            </div>
          </DialogHeader>
          <p className="text-[12.5px] text-slate-500 mt-2">
            Are you sure you want to cancel the{' '}
            <span className="font-semibold text-slate-700">{report?.issue_name}</span> report?
          </p>
        </div>
        <DialogFooter className="gap-2 px-6 pb-6 pt-1">
          <DialogClose asChild>
            <Button variant="outline" className="rounded-md h-9 text-[13px]" disabled={submitting}>
              Back
            </Button>
          </DialogClose>
          <Button
            className="rounded-md h-9 text-[13px] bg-rose-600 hover:bg-rose-700 text-white font-semibold gap-2"
            disabled={submitting}
            onClick={handleSubmit}
          >
            {submitting ? <><Spinner /> Cancelling…</> : 'Cancel Report'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}