'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Gauge } from 'lucide-react'

export type MeterStatusAction = 'activate' | 'replace'

export interface UpdateMeterStatusDialogProps {
  currentSerial:     string
  currentStatusName: string
  // Whatever the parent form currently has staged — reopening the modal
  // should reflect the in-progress choice, not reset it silently.
  initialAction:     MeterStatusAction | null
  // Fired only when the user hits Confirm. Nothing is saved to the database
  // here — the parent form holds this as staged state until the whole
  // reconnection is submitted.
  onConfirm:         (action: MeterStatusAction) => void
  children:          React.ReactNode
}

const OPTIONS: { value: MeterStatusAction; label: string; description: string }[] = [
  { value: 'activate', label: 'Activate', description: 'Mark this meter as Active' },
  { value: 'replace',  label: 'Replace',  description: 'Mark this meter as Replacing' },
]

export function UpdateMeterStatusDialog({
  currentSerial,
  currentStatusName,
  initialAction,
  onConfirm,
  children,
}: UpdateMeterStatusDialogProps) {
  const [open, setOpen] = useState(false)
  const [action, setAction] = useState<MeterStatusAction | null>(initialAction)

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) setAction(initialAction)
  }

  const handleSave = () => {
    if (!action) return
    onConfirm(action)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>

      <DialogContent className="w-full sm:max-w-sm p-0 gap-0 border border-slate-200 bg-white rounded-md overflow-hidden">

        {/* Header */}
        <div className="px-6 pt-6 pb-5">
          <div className="flex items-center gap-2 mb-1.5">
            <Gauge className="h-3 w-3 text-slate-400" />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Update Meter Status
            </p>
          </div>
          <DialogTitle className="text-[19px] font-bold text-slate-900 leading-tight">
            {currentSerial || 'Meter'}
          </DialogTitle>
          <p className="text-[13px] text-slate-500 mt-1">
            Current status: {currentStatusName || '—'}
          </p>
        </div>

        {/* Body */}
        <div className="px-6 pb-6 space-y-5">
          <div className="space-y-2.5">
            {OPTIONS.map(({ value, label, description }) => {
              const selected = action === value
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAction(value)}
                  className={cn(
                    'w-full flex items-center gap-3 rounded-md border px-4 py-3.5 text-left transition-colors',
                    selected
                      ? 'border-slate-900 bg-slate-50'
                      : 'border-slate-200 hover:border-slate-300',
                  )}
                >
                  <span
                    className={cn(
                      'h-4.5 w-4.5 rounded-full border flex items-center justify-center shrink-0',
                      selected ? 'border-slate-900' : 'border-slate-300',
                    )}
                  >
                    {selected && <span className="h-2.5 w-2.5 rounded-full bg-slate-900" />}
                  </span>
                  <span className="flex flex-col">
                    <span className="text-[14px] font-medium text-slate-800">{label}</span>
                    <span className="text-[11px] text-slate-400">{description}</span>
                  </span>
                </button>
              )
            })}
          </div>

          <p className="text-[11px] text-slate-400">
            This change is applied only when you submit the reconnection.
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex items-center justify-end gap-2.5">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            className="h-11 px-5 rounded-md text-[14px] font-medium border-slate-200 text-slate-600"
          >
            Cancel
          </Button>
          <Button
            disabled={!action}
            onClick={handleSave}
            className="h-11 px-5 rounded-md text-[14px] font-semibold bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-40"
          >
            Confirm
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}