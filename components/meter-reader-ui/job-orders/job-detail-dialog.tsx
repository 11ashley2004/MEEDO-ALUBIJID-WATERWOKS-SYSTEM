// // worker ui

'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import { Wrench, Building2, CalendarDays, Gauge, Users, CheckCircle2, XCircle, RefreshCcw, AlertTriangle, Clock } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'
import {
  saveMeterProgress,
  type WorkerJobAssignment, type WorkerJobOrder,
} from '@/lib/actions/job-assignment/worker-job-order.actions'
import { UpdateRequestDialog } from '@/components/meter-reader-ui/job-orders/update-request-dialog'
import { format } from 'date-fns'

const formatDateTime = (d: string) => format(new Date(d), 'MMM dd, yyyy · h:mm a')

// Job types that always need a modal:
//  - METER_INSTALLATION / METER_REPLACEMENT → need a serial number
//  - DISCONNECTION → needs a Completed/Cancelled choice
// RECONNECTION only needs a modal when the meter is flagged "Replacing"
// (a new serial is required). Otherwise it completes directly.
// Everything else (LEAK_REPAIR, GENERAL_MAINTENANCE, READING_ADJUSTMENT, and
// any other Service-Report-derived job type) has nothing to enter — clicking
// Update should just mark it completed right away.
const MODAL_JOB_TYPE_CODES = ['METER_INSTALLATION', 'METER_REPLACEMENT', 'DISCONNECTION']

// Per-job-order status pill (SCHEDULED/ONPROGRESS/COMPLETED/CANCELLED on
// job_assignment_orders) — distinct from the trip-level status shown in
// the table, since a single trip can mix resolved and unresolved lines.
function getLineStatus(job: WorkerJobOrder): { label: string; color: string; icon: React.ReactNode } {
  switch (job.status_code) {
    case 'COMPLETED':
      return { label: 'Done', color: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 className="h-3.5 w-3.5" /> }
    case 'CANCELLED':
      return { label: 'Cancelled', color: 'bg-rose-100 text-rose-700', icon: <XCircle className="h-3.5 w-3.5" /> }
    case 'ONPROGRESS':
      return { label: 'In Progress', color: 'bg-purple-100 text-purple-700', icon: <Clock className="h-3.5 w-3.5" /> }
    default:
      return { label: 'Pending', color: 'bg-amber-100 text-amber-700', icon: <Gauge className="h-3.5 w-3.5" /> }
  }
}

export interface JobDetailDialogProps {
  assignment: WorkerJobAssignment
  onUpdated?: () => void
  children:   React.ReactNode
}

// Plain "mark completed" button for job types with nothing to fill in —
// no dialog, just save progress straight away.
function DirectCompleteButton({ job, onUpdated }: { job: WorkerJobOrder; onUpdated?: () => void | Promise<void> }) {
  const [isSaving, setIsSaving] = useState(false)

  const handleComplete = async () => {
    setIsSaving(true)
    try {
      const result = await saveMeterProgress({
        completedRequests: [{ requestId: job.assignment_order_id, action: 'complete' }],
      })
      if (result.status === 'error') {
        toast.error(result.message ?? 'Failed to update job order')
        return
      }
      toast.success('Marked as completed')
      await onUpdated?.()
    } catch {
      toast.error('Failed to update job order')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isSaving}
      onClick={handleComplete}
      className="h-8 w-full rounded-md text-[12px] gap-1.5 border-violet-200 text-violet-700 hover:bg-violet-50 font-semibold disabled:opacity-60"
    >
      {isSaving ? <Spinner /> : <RefreshCcw className="h-3.5 w-3.5" />}
      {isSaving ? 'Saving…' : 'Update'}
    </Button>
  )
}

// One card per job order (meter account) on the trip. Reuses
// UpdateRequestDialog unchanged — it already operates on a single
// WorkerJobOrder, so completing/cancelling one line here is exactly
// what flips the parent trip's aggregate status once all lines resolve.
function JobOrderCard({ job, onUpdated }: { job: WorkerJobOrder; onUpdated?: () => void }) {
  const status = getLineStatus(job)
  const isPending = job.status_code === 'SCHEDULED' || job.status_code === 'ONPROGRESS'
  const isFlaggedForReplacement = job.job_type_code === 'RECONNECTION' && job.meter_status_name === 'Replacing'
  // Reconnection on an Active (non-replacing) meter completes directly,
  // no serial number needed — modal only when the meter is being replaced.
  // Leak After Meter / other service-report jobs complete with Save progress only.
  const needsModal = MODAL_JOB_TYPE_CODES.includes(job.job_type_code) || isFlaggedForReplacement

  return (
    <div
      className={cn(
        'rounded-md border p-4 transition-colors',
        status.label === 'Done'
          ? 'border-emerald-200 bg-emerald-50/40'
          : status.label === 'Cancelled'
          ? 'border-rose-200 bg-rose-50/40'
          : 'border-slate-200 bg-white',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={cn(
            'h-8 w-8 rounded-md flex items-center justify-center shrink-0',
            status.label === 'Done'
              ? 'bg-emerald-100 text-emerald-700'
              : status.label === 'Cancelled'
              ? 'bg-rose-100 text-rose-700'
              : 'bg-slate-100 text-slate-500',
          )}>
            <Gauge className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-500 truncate">
              {job.job_type_name}
            </p>
            <p className="text-[14px] font-semibold text-slate-800 truncate mt-0.5">
              {job.is_service_report
                ? (job.issue_name ?? 'Service Report')
                : (job.consumer_name !== '—' ? job.consumer_name : 'No consumer')}
            </p>
            <div className="flex items-center gap-2.5 mt-1 flex-wrap">
              {job.is_service_report ? (
                <>
                  {job.zone_name && (
                    <span className="text-[11px] text-slate-400">{job.zone_name}</span>
                  )}
                  {job.reported_by_name && (
                    <span className="text-[11px] text-slate-400">· reported by {job.reported_by_name}</span>
                  )}
                  {job.meter_serial_no && (
                    <span className="text-[11px] font-mono text-slate-400">{job.meter_serial_no}</span>
                  )}
                </>
              ) : (
                <>
                  {job.meter_serial_no && (
                    <span className="text-[11px] font-mono text-slate-400">{job.meter_serial_no}</span>
                  )}
                  {job.meter_serial_no && (
                    <span className="flex items-center gap-1 text-[11px] text-slate-400">
                      <Gauge className="h-3 w-3" /> {job.meter_serial_no}
                    </span>
                  )}
                </>
              )}
              {isFlaggedForReplacement && isPending && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-700 border border-orange-200">
                  <AlertTriangle className="h-2.5 w-2.5" /> Replacing
                </span>
              )}
            </div>
          </div>
        </div>

        <span className={cn(
          'text-[10px] font-semibold px-2.5 py-1 rounded-md inline-flex items-center gap-1 whitespace-nowrap shrink-0',
          status.color,
        )}>
          {status.icon}
          {status.label}
        </span>
      </div>

      {isPending && job.is_leader && (
        <div className="mt-3">
          {needsModal ? (
            <UpdateRequestDialog
              request={job}
              helperNote={
                isFlaggedForReplacement
                  ? 'This meter is flagged for replacement — enter the new meter serial to complete it.'
                  : undefined
              }
              onUpdated={onUpdated}
            >
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-full rounded-md text-[12px] gap-1.5 border-violet-200 text-violet-700 hover:bg-violet-50 font-semibold"
              >
                <RefreshCcw className="h-3.5 w-3.5" /> Update
              </Button>
            </UpdateRequestDialog>
          ) : (
            <DirectCompleteButton job={job} onUpdated={onUpdated} />
          )}
        </div>
      )}
    </div>
  )
}

export function JobDetailDialog({ assignment, onUpdated, children }: JobDetailDialogProps) {
  const total = assignment.job_orders.length
  const resolvedCount = assignment.job_orders.filter(
    (jo) => jo.status_code === 'COMPLETED' || jo.status_code === 'CANCELLED',
  ).length

  const headerTitle = total > 1
    ? `Trip · ${total} job orders`
    : assignment.job_orders[0]?.job_type_name ?? 'Job Assignment'

  const headerSubtitle = total > 1
    ? `${resolvedCount}/${total} resolved`
    : assignment.job_orders[0]?.job_order_no ?? null

  return (
    <Sheet>
      <SheetTrigger asChild>{children}</SheetTrigger>

      <SheetContent className="w-full sm:max-w-lg flex flex-col h-full p-0 gap-0 border-l border-slate-200 bg-white">

        <div className="px-6 pt-6 pb-5 border-b border-slate-100 shrink-0">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-md bg-violet-600 flex items-center justify-center shrink-0">
              <Wrench className="h-[18px] w-[18px] text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-[16px] font-bold text-slate-900 leading-tight">
                {headerTitle}
              </SheetTitle>
              {headerSubtitle && (
                <p className="text-[12px] text-slate-400 mt-0.5 font-mono">{headerSubtitle}</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50/60 px-6 py-6 space-y-6">
          <div className="grid grid-cols-2 gap-3">
            {assignment.barangay_name && (
              <div className="rounded-md border border-slate-200 bg-white px-3.5 py-3">
                <span className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1.5">
                  <Building2 className="h-3.5 w-3.5" />
                  Barangay
                </span>
                <p className="text-[13px] font-semibold text-slate-800 truncate">{assignment.barangay_name}</p>
              </div>
            )}

            {assignment.scheduled_at && (
              <div className="rounded-md border border-slate-200 bg-white px-3.5 py-3">
                <span className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1.5">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Scheduled
                </span>
                <p className="text-[13px] font-semibold text-slate-800">{formatDateTime(assignment.scheduled_at)}</p>
              </div>
            )}

            <div className="rounded-md border border-slate-200 bg-white px-3.5 py-3">
              <span className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1.5">
                <Users className="h-3.5 w-3.5" />
                Role
              </span>
              <span className={cn(
                'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold',
                assignment.is_leader
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-slate-100 text-slate-600 border border-slate-200',
              )}>
                {assignment.is_leader ? 'Leader' : 'Helper'}
              </span>
            </div>

            <div className="rounded-md border border-slate-200 bg-white px-3.5 py-3">
              <span className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1.5">
                <Gauge className="h-3.5 w-3.5" />
                Progress
              </span>
              <p className="text-[13px] font-semibold text-slate-800">{resolvedCount}/{total} resolved</p>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mb-3">
              <Gauge className="h-3.5 w-3.5" />
              {total > 1 ? 'Job Orders' : 'Meter Account'}
            </p>

            {total === 0 && (
              <p className="text-[12px] text-slate-400 text-center py-8">No job orders.</p>
            )}

            <div className="space-y-3">
              {assignment.job_orders.map((job) => (
                <JobOrderCard key={job.assignment_order_id} job={job} onUpdated={onUpdated} />
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end bg-white shrink-0">
          <SheetClose asChild>
            <Button
              variant="outline"
              className="rounded-md h-10 px-5 text-[13.5px] font-semibold border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-600"
            >
              Close
            </Button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  )
}