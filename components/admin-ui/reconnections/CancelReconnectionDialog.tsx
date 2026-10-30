'use client'

import { useState } from 'react'
import { AlertTriangle, Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { updateReconnectionStatus } from '@/lib/actions/reconnection/reconnection.actions'
import { toast } from 'sonner'

export interface CancelTarget {
  reconnection_id: string
  reconnection_no: string
}

export interface CancelReconnectionDialogProps {
  target: CancelTarget | null
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

// Controlled dialog, same reasoning as the View dialog: it's rendered once
// at the page level, not nested inside a DropdownMenuItem, so it never
// races the dropdown's own portal/unmount.
export function CancelReconnectionDialog({
  target,
  onOpenChange,
  onSuccess,
}: CancelReconnectionDialogProps) {
  const [submitting, setSubmitting] = useState(false)
  const open = !!target

  const handleConfirm = async () => {
    if (!target) return
    setSubmitting(true)
    try {
      const res = await updateReconnectionStatus(target.reconnection_id, 'Cancelled')
      if (res.status === 'success') {
        toast.success(`Reconnection ${target.reconnection_no} cancelled`)
        onOpenChange(false)
        onSuccess?.()
      } else {
        toast.error(res.message ?? 'Failed to cancel reconnection')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="w-full sm:max-w-sm p-0 gap-0 border border-slate-200 bg-white rounded-md overflow-hidden">
        <div className="px-6 pt-6 pb-5">
          <div className="flex items-center gap-2 mb-1.5">
            <Ban className="h-3 w-3 text-rose-400" />
            <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest">
              Cancel Reconnection
            </p>
          </div>
          <DialogTitle className="text-[19px] font-bold text-slate-900 leading-tight font-mono">
            {target?.reconnection_no}
          </DialogTitle>
        </div>

        <div className="px-6 pb-6 space-y-4">
          <div className="flex items-start gap-2.5 rounded-md border border-rose-100 bg-rose-50 px-3.5 py-3">
            <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-[12.5px] text-rose-700 leading-relaxed">
              This will cancel the reconnection request. This action cannot be undone,
              and the consumer will need a new reconnection request if service is needed later.
            </p>
          </div>
        </div>

        <div className="px-6 pb-6 flex items-center justify-end gap-2.5">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="h-11 px-5 rounded-md text-[14px] font-medium border-slate-200 text-slate-600"
          >
            Keep it
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={submitting}
            className="h-11 px-5 rounded-md text-[14px] font-semibold bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-40"
          >
            {submitting ? 'Cancelling…' : 'Cancel Reconnection'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}