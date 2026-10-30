'use client'

import { useEffect, useState } from 'react'
import { Hash } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { updateMeterSerialNo, type MeterAccount } from '@/lib/actions/meter-account/meter-accounts'

export default function EditSerialNoDialog({
  account, open, onOpenChange, onDone,
}: {
  account: MeterAccount | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onDone: () => void
}) {
  const [serial, setSerial] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) setSerial('')
  }, [open])

  const canSubmit = serial.trim().length > 0 && !submitting

  const handleSubmit = async () => {
    if (!account?.meter_id || !canSubmit) return
    setSubmitting(true)
    try {
      const res = await updateMeterSerialNo(account.meter_id, serial)
      if (res.status === 'success') {
        toast.success(res.message || 'Serial number saved')
        onOpenChange(false)
        onDone()
      } else {
        toast.error(res.message || 'Failed to save serial number')
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
              <div className="h-10 w-10 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                <Hash className="h-4.5 w-4.5 text-violet-600" />
              </div>
              <DialogTitle className="text-[15px] font-bold text-slate-900 leading-tight">
                Add Serial Number
              </DialogTitle>
            </div>
          </DialogHeader>
          <p className="text-[12.5px] text-slate-500 mt-2">
            Enter the serial number for the meter of{' '}
            <span className="font-semibold text-slate-700">{account?.consumer_name}</span>
            {account?.contract_no ? (
              <> (<span className="font-mono font-semibold text-slate-700">{account.contract_no}</span>)</>
            ) : null}
            .
          </p>
          <Input
            autoFocus
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
            placeholder="Meter serial no."
            maxLength={100}
            disabled={submitting}
            className="mt-4 h-9 rounded-md text-[13px] font-mono border-slate-200 focus-visible:ring-0 focus-visible:border-violet-400"
          />
        </div>
        <DialogFooter className="gap-2 px-6 pb-6 pt-1">
          <DialogClose asChild>
            <Button variant="outline" className="rounded-md h-9 text-[13px]" disabled={submitting}>
              Back
            </Button>
          </DialogClose>
          <Button
            className="rounded-md h-9 text-[13px] bg-violet-600 hover:bg-violet-700 text-white font-semibold gap-2"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {submitting ? <><Spinner /> Saving…</> : 'Save Serial No.'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}