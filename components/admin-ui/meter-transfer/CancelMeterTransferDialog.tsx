'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'

import {
  Dialog, DialogContent, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cancelMeterTransfer } from '@/lib/actions/meter-transfers/meter-transfer.actions'

export interface CancelMeterTransferDialogProps {
  transferId: string
  meterSerialNo: string
  onDone?: () => void | Promise<void>
  children: React.ReactNode
}

export function CancelMeterTransferDialog({
  transferId, meterSerialNo, onDone, children,
}: CancelMeterTransferDialogProps) {
  const [open, setOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const handleOpenChange = (next: boolean) => {
    if (isSaving) return
    setOpen(next)
  }

  const handleCancel = async () => {
    setIsSaving(true)
    try {
      const result = await cancelMeterTransfer(transferId, null)
      if (result.status === 'error') {
        toast.error(result.message ?? 'Failed to cancel transfer')
        return
      }
      toast.success('Transfer cancelled')
      await onDone?.()
      setOpen(false)
    } catch {
      toast.error('Failed to cancel transfer')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>

      <DialogContent className="w-full sm:max-w-sm p-0 gap-0 border border-slate-200 bg-white rounded-md overflow-hidden">
        <div className="px-6 pt-6 pb-5">
          <div className="flex items-center gap-2 mb-1.5">
            <AlertTriangle className="h-3 w-3 text-rose-500" />
            <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">Cancel Transfer</p>
          </div>
          <DialogTitle className="text-[19px] font-bold text-slate-900 leading-tight">
            Cancel relocation for {meterSerialNo}?
          </DialogTitle>
        </div>

        <div className="px-6 pb-6 flex items-center justify-end gap-2.5">
          <Button
            variant="outline"
            disabled={isSaving}
            onClick={() => handleOpenChange(false)}
            className="h-11 px-5 rounded-md text-[14px] font-medium border-slate-200 text-slate-600"
          >
            Keep transfer
          </Button>
          <Button
            disabled={isSaving}
            onClick={handleCancel}
            className="h-11 px-5 rounded-md text-[14px] font-semibold gap-2 bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-40"
          >
            {isSaving && <Spinner />}
            Cancel transfer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}