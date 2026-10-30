'use client'
// worker ui
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Gauge, AlertTriangle } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'
import {
  saveMeterProgress,
  type WorkerJobOrder,
} from '@/lib/actions/job-assignment/worker-job-order.actions'

type Action = 'complete' | 'cancel'

// Job types where the worker only ever *completes* a job order by entering
// a meter serial number — there's no cancel branch to pick, so we skip the
// Completed/Cancelled selector entirely and go straight to the serial field.
// (These are the job_type_code values that actually exist in the schema —
// note there's no separate "RERECONNECTION" type.)
const SERIAL_ONLY_JOB_TYPE_CODES = ['METER_INSTALLATION', 'METER_REPLACEMENT', 'RECONNECTION']

export interface UpdateRequestDialogProps {
  request:     WorkerJobOrder
  helperNote?: string
  onUpdated?:  () => void | Promise<void>
  children:    React.ReactNode
}

const OPTIONS: { value: Action; label: string }[] = [
  { value: 'complete', label: 'Completed' },
  { value: 'cancel',   label: 'Cancelled' },
]

export function UpdateRequestDialog({
  request,
  helperNote,
  onUpdated,
  children,
}: UpdateRequestDialogProps) {
  const isSerialOnly = SERIAL_ONLY_JOB_TYPE_CODES.includes(request.job_type_code)
  const isReplacing = request.meter_status_name === 'Replacing'

  const [open,     setOpen]     = useState(false)
  const [action,   setAction]   = useState<Action | null>(isSerialOnly ? 'complete' : null)
  const [serialNo, setSerialNo] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const resetState = () => {
    setAction(isSerialOnly ? 'complete' : null)
    setSerialNo('')
  }

  const handleOpenChange = (next: boolean) => {
    if (isSaving) return
    setOpen(next)
    if (!next) resetState()
  }

  // A serial number is required for installation/replacement, and for a
  // reconnection ONLY when the meter is flagged "Replacing". A reconnection
  // on an Active (or otherwise non-replacing) meter needs no serial.
  const requireSerial =
    request.job_type_code === 'METER_INSTALLATION' ||
    request.job_type_code === 'METER_REPLACEMENT' ||
    (request.job_type_code === 'RECONNECTION' && isReplacing)

  const canSave = isSerialOnly
    ? !requireSerial || serialNo.trim().length > 0
    : action !== null

  const handleSave = async () => {
    const resolvedAction: Action | null = isSerialOnly ? 'complete' : action
    if (!resolvedAction) return
    if (requireSerial && !serialNo.trim()) {
      toast.error('Meter serial number is required')
      return
    }

    setIsSaving(true)
    try {
      const result = await saveMeterProgress({
        completedRequests: [
          {
            requestId: request.assignment_order_id,
            serialNo:  requireSerial ? serialNo.trim() : undefined,
            action: resolvedAction,
          },
        ],
      })

      if (result.status === 'error') {
        toast.error(result.message ?? 'Failed to update job order')
        return
      }

      toast.success(resolvedAction === 'complete' ? 'Marked as completed' : 'Marked as cancelled')
      await onUpdated?.()
      setOpen(false)
      resetState()
    } catch {
      toast.error('Failed to update job order')
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
            <Gauge className="h-3 w-3 text-slate-400" />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Update Job Order
            </p>
          </div>
          <DialogTitle className="text-[19px] font-bold text-slate-900 leading-tight">
            {request.consumer_name !== '—' ? request.consumer_name : 'Meter Account'}
          </DialogTitle>
          {request.meter_serial_no && (
            <p className="text-[13px] text-slate-500 mt-1">{request.meter_serial_no}</p>
          )}
          {isReplacing && (
            <div className="flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-md bg-orange-50 border border-orange-200">
              <AlertTriangle className="h-3.5 w-3.5 text-orange-600" />
              <span className="text-[11px] font-medium text-orange-700">Meter flagged for replacement</span>
            </div>
          )}
        </div>

        <div className="px-6 pb-6 space-y-5">
          {/* Completed/Cancelled picker — only for types that actually have
              a cancel branch (e.g. disconnection). Installation, replacement,
              and reconnection just need a serial number (when applicable). */}
          {!isSerialOnly && (
            <div className="space-y-2.5">
              {OPTIONS.map(({ value, label }) => {
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
                    <span className="text-[14px] font-medium text-slate-800">{label}</span>
                  </button>
                )
              })}
            </div>
          )}

          {requireSerial && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Meter Serial Number
              </p>
              <Input
                id="serial-no"
                value={serialNo}
                onChange={(e) => setSerialNo(e.target.value)}
                placeholder="e.g. MTR-00219483"
                className="h-11 rounded-md text-sm border-slate-200 focus-visible:ring-2 focus-visible:ring-violet-100 focus-visible:border-violet-400"
                autoFocus
              />
              {helperNote && (
                <p className="text-[10px] text-slate-400">{helperNote}</p>
              )}
              {isReplacing && (
                <p className="text-[10px] text-orange-600">
                  ⚠ Enter the new meter serial number that will replace the current meter.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="px-6 pb-6 flex items-center justify-end gap-2.5">
          <Button
            variant="outline"
            disabled={isSaving}
            onClick={() => handleOpenChange(false)}
            className="h-11 px-5 rounded-md text-[14px] font-medium border-slate-200 text-slate-600"
          >
            Cancel
          </Button>
          <Button
            disabled={!canSave || isSaving}
            onClick={handleSave}
            className="h-11 px-5 rounded-md text-[14px] font-semibold gap-2 bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-40"
          >
            {isSaving && <Spinner />}
            {isSerialOnly ? 'Save progress' : 'Save update'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
