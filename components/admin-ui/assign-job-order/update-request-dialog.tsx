'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Loader2, Gauge, AlertTriangle } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'
import {
  saveMeterProgress,
  saveJobProgressAsAdmin,
  getAssignmentOrderRequirements,
  type AssignmentOrderRequirements,
} from '@/lib/actions/job-assignment/worker-job-order.actions'

type Action = 'complete' | 'cancel'

const HAS_CANCEL_BRANCH_CODES = ['DISCONNECTION']

export interface UpdatableJobOrder {
  assignment_order_id: string
  job_type_code?: string | null
  consumer_name?: string | null
  meter_serial_no?: string | null
  meter_status_name?: string | null
}

const toManilaYMD = (d: Date | string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(d))

const todayManilaYMD = () => toManilaYMD(new Date())

function validateCompletionDate(
  completedDate: string | null | undefined,
  scheduledAt: string | null,
  asAdmin = false,
): string | null {
  if (!completedDate) return 'Completion date is required'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(completedDate)) return 'Invalid completion date'

  if (asAdmin) {
    if (completedDate < todayManilaYMD()) return "Completion date can't be in the past"
    return null
  }

  if (scheduledAt) {
    const scheduledYMD = toManilaYMD(scheduledAt)
    if (completedDate < scheduledYMD) {
      return `Completion date can't be before the scheduled date (${scheduledYMD})`
    }
  }
  if (completedDate > todayManilaYMD()) return "Completion date can't be in the future"
  return null
}

export interface UpdateRequestDialogProps {
  request: UpdatableJobOrder
  scheduledAt: string | null
  asAdmin?: boolean
  helperNote?: string
  onUpdated?: () => void | Promise<void>
  children: React.ReactNode
}

const OPTIONS: { value: Action; label: string }[] = [
  { value: 'complete', label: 'Completed' },
  { value: 'cancel', label: 'Cancelled' },
]

export function UpdateRequestDialog({
  request, scheduledAt, asAdmin = false, helperNote, onUpdated, children,
}: UpdateRequestDialogProps) {
  const consumerName = request.consumer_name ?? '—'
  const meterSerialNo = request.meter_serial_no ?? null

  const today = todayManilaYMD()
  const scheduledYMD = scheduledAt ? toManilaYMD(scheduledAt) : undefined

  const minDate = asAdmin ? today : scheduledYMD
  const maxDate = asAdmin ? undefined : today

  const defaultDate = (() => {
    if (!validateCompletionDate(today, scheduledAt, asAdmin)) return today
    return minDate ?? ''
  })()

  const [open, setOpen] = useState(false)

  // Job type + meter status are resolved from the server when the dialog
  // opens. The admin job-assignment list doesn't reliably carry them, and
  // they decide which inputs appear (serial number, Completed/Cancelled
  // picker). Props are only the fallback if the lookup fails.
  const [resolved, setResolved] = useState<AssignmentOrderRequirements | null>(null)
  const [isLoadingReq, setIsLoadingReq] = useState(false)

  const jobTypeCode = resolved?.job_type_code || request.job_type_code || ''
  const meterStatusName = resolved ? resolved.meter_status_name : (request.meter_status_name ?? null)

  const hasCancelBranch = HAS_CANCEL_BRANCH_CODES.includes(jobTypeCode)
  const isReplacing = meterStatusName === 'Replacing'

  const [action, setAction] = useState<Action | null>(
    HAS_CANCEL_BRANCH_CODES.includes(request.job_type_code ?? '') ? null : 'complete',
  )
  const [serialNo, setSerialNo] = useState('')
  const [completedDate, setCompletedDate] = useState(defaultDate)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setIsLoadingReq(true)

    getAssignmentOrderRequirements(request.assignment_order_id)
      .then((r) => {
        if (cancelled || !r) return
        setResolved(r)
        // Re-seed the action now that the real job type is known
        // (DISCONNECTION needs the user to pick Completed / Cancelled).
        setAction(HAS_CANCEL_BRANCH_CODES.includes(r.job_type_code) ? null : 'complete')
      })
      .catch(() => { /* fall back to props */ })
      .finally(() => { if (!cancelled) setIsLoadingReq(false) })

    return () => { cancelled = true }
  }, [open, request.assignment_order_id])

  const resetState = () => {
    setAction(hasCancelBranch ? null : 'complete')
    setSerialNo('')
    setCompletedDate(defaultDate)
  }

  const handleOpenChange = (next: boolean) => {
    if (isSaving) return
    setOpen(next)
    if (!next) resetState()
  }

  const requireSerial =
    jobTypeCode === 'METER_INSTALLATION' ||
    jobTypeCode === 'METER_REPLACEMENT' ||
    (jobTypeCode === 'RECONNECTION' && isReplacing)

  const isCompleting = action === 'complete'

  const dateError = isCompleting
    ? validateCompletionDate(completedDate, scheduledAt, asAdmin)
    : null

  const canSave =
    !isLoadingReq &&
    action !== null &&
    (!isCompleting || (!dateError && (!requireSerial || serialNo.trim().length > 0)))

  const handleSave = async () => {
    if (!action) return
    if (isCompleting) {
      if (dateError) { toast.error(dateError); return }
      if (requireSerial && !serialNo.trim()) { toast.error('Meter serial number is required'); return }
    }

    setIsSaving(true)
    try {
      const save = asAdmin ? saveJobProgressAsAdmin : saveMeterProgress
      const result = await save({
        completedRequests: [{
          requestId: request.assignment_order_id,
          serialNo: isCompleting && serialNo.trim() ? serialNo.trim() : undefined,
          action,
          completedDate: isCompleting ? completedDate : undefined,
        }],
      })

      if (result.status === 'error') {
        toast.error(result.message ?? 'Failed to update job order')
        return
      }

      toast.success(isCompleting ? 'Marked as completed' : 'Marked as cancelled')
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
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Update Job Order</p>
          </div>
          <DialogTitle className="text-[19px] font-bold text-slate-900 leading-tight">
            {consumerName !== '—' ? consumerName : 'Meter Account'}
          </DialogTitle>
          {meterSerialNo && (
            <p className="text-[13px] text-slate-500 mt-1">{meterSerialNo}</p>
          )}
          {isReplacing && (
            <div className="flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-md bg-orange-50 border border-orange-200">
              <AlertTriangle className="h-3.5 w-3.5 text-orange-600" />
              <span className="text-[11px] font-medium text-orange-700">Meter flagged for replacement</span>
            </div>
          )}
        </div>

        <div className="px-6 pb-6 space-y-5">
          {isLoadingReq && (
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Checking job order details…
            </div>
          )}

          {hasCancelBranch && (
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
                      selected ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300',
                    )}
                  >
                    <span className={cn('h-4.5 w-4.5 rounded-full border flex items-center justify-center shrink-0', selected ? 'border-slate-900' : 'border-slate-300')}>
                      {selected && <span className="h-2.5 w-2.5 rounded-full bg-slate-900" />}
                    </span>
                    <span className="text-[14px] font-medium text-slate-800">{label}</span>
                  </button>
                )
              })}
            </div>
          )}

          {isCompleting && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date Completed</p>
              <Input
                type="date"
                value={completedDate}
                min={minDate}
                max={maxDate}
                onChange={(e) => setCompletedDate(e.target.value)}
                className={cn(
                  'h-11 rounded-md text-sm border-slate-200 focus-visible:ring-2 focus-visible:ring-violet-100 focus-visible:border-violet-400',
                  dateError && completedDate && 'border-rose-300 focus-visible:ring-rose-100 focus-visible:border-rose-400',
                )}
              />
              {scheduledYMD && (
                <p className="text-[10px] text-slate-400">
                  Scheduled for {scheduledYMD}
                  {asAdmin ? ' — past dates are not allowed.' : ' — must be on or after this date.'}
                </p>
              )}
              {dateError && (
                <p className="text-[11px] text-rose-600">{dateError}</p>
              )}
            </div>
          )}

          {isCompleting && requireSerial && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Meter Serial Number
              </p>
              <Input
                value={serialNo}
                onChange={(e) => setSerialNo(e.target.value)}
                placeholder="e.g. MTR-00219483"
                className="h-11 rounded-md text-sm border-slate-200 focus-visible:ring-2 focus-visible:ring-violet-100 focus-visible:border-violet-400"
              />
              {helperNote && <p className="text-[10px] text-slate-400">{helperNote}</p>}
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
            Save progress
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}