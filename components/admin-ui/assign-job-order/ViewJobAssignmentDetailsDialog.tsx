'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import {
  Loader2, UserRound, Users2, CalendarClock, MapPin, ClipboardList, PackageCheck,
  Gauge, RefreshCcw, AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { UpdateRequestDialog } from '@/components/admin-ui/assign-job-order/update-request-dialog'

import {
  getJobAssignments,
  type JobAssignmentListItem,
  type JobAssignmentJobOrder,
} from '@/lib/actions/job-assignment/job-assignment.actions'

interface ViewJobAssignmentDetailsDialogProps {
  jobAssignmentId: string | null
  onOpenChange: (open: boolean) => void
  onStatusChanged?: () => void
}

export type TripStatus = 'Scheduled' | 'On Progress' | 'Completed' | 'Cancelled'

// Same rule as the list page, so the badge never disagrees with the table.
export function overallStatus(orders: JobAssignmentJobOrder[]): TripStatus {
  if (orders.length === 0) return 'Scheduled'
  const active = orders.filter((o) => o.status_code !== 'CANCELLED')
  if (active.length === 0) return 'Cancelled'
  if (active.every((o) => o.status_code === 'COMPLETED')) return 'Completed'
  if (active.some((o) => o.status_code === 'ONPROGRESS' || o.status_code === 'COMPLETED')) return 'On Progress'
  return 'Scheduled'
}

const lineStatusStyles: Record<string, string> = {
  SCHEDULED: 'bg-amber-100 text-amber-700',
  ONPROGRESS: 'bg-purple-100 text-purple-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-rose-100 text-rose-700',
}
const lineStatusLabel: Record<string, string> = {
  SCHEDULED: 'Pending',
  ONPROGRESS: 'In Progress',
  COMPLETED: 'Done',
  CANCELLED: 'Cancelled',
}

function initials(fullName: string) {
  return fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
}

function jobOrderSubtitle(jo: JobAssignmentJobOrder): string {
  if (jo.process_type === 'Service Report') {
    return [jo.meter_serial_no ?? jo.zone_name ?? 'Zone-wide', jo.issue_name].filter(Boolean).join(' · ')
  }
  return `${jo.meter_serial_no ?? '—'} — ${jo.consumer_name ?? '—'}`
}

function JobOrderCard({
  jo, scheduledAt, onUpdated,
}: { jo: JobAssignmentJobOrder; scheduledAt: string | null; onUpdated: () => void | Promise<void> }) {
  const isPending = jo.status_code === 'SCHEDULED' || jo.status_code === 'ONPROGRESS'
  const isFlaggedForReplacement = jo.job_type_code === 'RECONNECTION' && jo.meter_status_name === 'Replacing'

  return (
    <div
      className={cn(
        'rounded-md border p-4 transition-colors',
        jo.status_code === 'COMPLETED' ? 'border-emerald-200 bg-emerald-50/40'
          : jo.status_code === 'CANCELLED' ? 'border-rose-200 bg-rose-50/40'
          : 'border-slate-200 bg-white',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-8 w-8 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center shrink-0">
            <Gauge className="h-4 w-4 text-violet-500" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12.5px] font-mono font-bold text-slate-700">{jo.job_order_no ?? '—'}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">{jo.job_type_name}</span>
              {isFlaggedForReplacement && isPending && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-700 border border-orange-200">
                  <AlertTriangle className="h-2.5 w-2.5" /> Replacing
                </span>
              )}
            </div>
            <p className="text-[12px] text-slate-500 mt-0.5 truncate">{jobOrderSubtitle(jo)}</p>
            <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
              <MapPin className="h-2.5 w-2.5" /> {jo.barangay_name}
            </p>
            {jo.status_code === 'COMPLETED' && jo.completion_date && (
              <p className="text-[11px] text-emerald-600 mt-0.5">
                Completed {format(new Date(jo.completion_date), 'MMM d, yyyy')}
              </p>
            )}
          </div>
        </div>

        <span className={cn('text-[10px] font-semibold px-2.5 py-1 rounded-md whitespace-nowrap shrink-0', lineStatusStyles[jo.status_code] ?? 'bg-slate-100 text-slate-600')}>
          {lineStatusLabel[jo.status_code] ?? jo.status_code}
        </span>
      </div>

      {isPending && (
        <div className="mt-3">
          <UpdateRequestDialog
            asAdmin
            request={{
              assignment_order_id: jo.assignment_order_id,
              job_type_code: jo.job_type_code ?? '',
              consumer_name: jo.consumer_name ?? '—',
              meter_serial_no: jo.meter_serial_no,
              meter_status_name: jo.meter_status_name ?? null,
            }}
            scheduledAt={scheduledAt}
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
        </div>
      )}
    </div>
  )
}

export function ViewJobAssignmentDetailsDialog({
  jobAssignmentId, onOpenChange, onStatusChanged,
}: ViewJobAssignmentDetailsDialogProps) {
  const [assignment, setAssignment] = useState<JobAssignmentListItem | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const open = !!jobAssignmentId

  const load = useCallback(async (showSpinner: boolean) => {
    if (!jobAssignmentId) return
    if (showSpinner) setIsLoading(true)
    try {
      const all = await getJobAssignments()
      setAssignment(all.find((a) => a.job_assignment_id === jobAssignmentId) ?? null)
    } catch {
      toast.error('Failed to load assignment details')
    } finally {
      if (showSpinner) setIsLoading(false)
    }
  }, [jobAssignmentId])

  useEffect(() => {
    if (!jobAssignmentId) { setAssignment(null); return }
    load(true)
  }, [jobAssignmentId, load])

  // After an update: refresh this dialog silently, then refresh the table behind it.
  const handleUpdated = useCallback(async () => {
    await load(false)
    onStatusChanged?.()
  }, [load, onStatusChanged])

  const status = useMemo(() => (assignment ? overallStatus(assignment.job_orders) : 'Scheduled'), [assignment])

  const completedCount = assignment?.job_orders.filter((o) => o.status_code === 'COMPLETED').length ?? 0
  const activeCount = assignment ? assignment.job_orders.filter((o) => o.status_code !== 'CANCELLED').length : 0
  const progressPct = activeCount > 0 ? Math.round((completedCount / activeCount) * 100) : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl p-0 gap-0 overflow-hidden bg-white border border-slate-200 rounded-md">
        <DialogTitle className="sr-only">Job Assignment Details</DialogTitle>

        {isLoading && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
          </div>
        )}

        {!isLoading && !assignment && (
          <div className="flex flex-col items-center justify-center py-24 gap-2">
            <p className="text-sm font-semibold text-slate-600">Assignment not found</p>
            <p className="text-xs text-slate-400">It may have been removed.</p>
          </div>
        )}

        {!isLoading && assignment && (
          <>
            <div className="relative px-7 pt-6 pb-5 bg-gradient-to-br from-violet-600 via-violet-600 to-violet-700 text-white overflow-hidden">
              <div className="absolute -right-6 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
              <div className="absolute -right-2 bottom-0 h-24 w-24 rounded-full bg-white/10 blur-xl" />

              <div className="relative flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-11 w-11 rounded-md bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center text-[13px] font-bold shrink-0">
                    {initials(assignment.assigned_to_name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold leading-tight truncate">{assignment.assigned_to_name}</p>
                    <p className="text-[11.5px] text-violet-100 flex items-center gap-1 mt-0.5">
                      <UserRound className="h-3 w-3" /> Assigned by {assignment.assign_by_name}
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold border shrink-0 bg-white/15 backdrop-blur-sm border-white/25 text-white">
                  {status}
                </span>
              </div>

              <div className="relative grid grid-cols-2 gap-3 mt-5">
                <div className="rounded-md bg-white/10 backdrop-blur-sm border border-white/15 px-3 py-2.5">
                  <p className="text-[9.5px] font-bold uppercase tracking-widest text-violet-100 flex items-center gap-1">
                    <CalendarClock className="h-2.5 w-2.5" /> Scheduled
                  </p>
                  <p className="text-[12.5px] font-semibold mt-1">
                    {assignment.scheduled_at
                      ? new Date(assignment.scheduled_at).toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })
                      : '—'}
                  </p>
                </div>
                <div className="rounded-md bg-white/10 backdrop-blur-sm border border-white/15 px-3 py-2.5">
                  <p className="text-[9.5px] font-bold uppercase tracking-widest text-violet-100 flex items-center gap-1">
                    <Users2 className="h-2.5 w-2.5" /> Helpers
                  </p>
                  <p className="text-[12.5px] font-semibold mt-1 truncate">
                    {assignment.helpers.length > 0 ? assignment.helpers.map((h) => h.full_name).join(', ') : 'None'}
                  </p>
                </div>
              </div>

              <div className="relative mt-4">
                <div className="flex items-center justify-between text-[10.5px] text-violet-100 mb-1.5">
                  <span className="font-medium">Progress</span>
                  <span className="font-semibold">{completedCount}/{activeCount} job order{activeCount !== 1 ? 's' : ''} done</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/15 overflow-hidden">
                  <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${progressPct}%` }} />
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 px-6 pt-4 pb-2">
                <ClipboardList className="h-3.5 w-3.5 text-violet-500" />
                <p className="text-[10.5px] font-bold uppercase tracking-widest text-slate-500">
                  Job Orders ({assignment.job_orders.length})
                </p>
              </div>

              <div className="max-h-[360px] overflow-y-auto bg-slate-50/60 border-t border-slate-100 p-4 space-y-3">
                {assignment.job_orders.length === 0 && (
                  <p className="text-[12px] text-slate-400 text-center py-8">No job orders on this assignment</p>
                )}
                {assignment.job_orders.map((jo) => (
                  <JobOrderCard
                    key={jo.assignment_order_id}
                    jo={jo}
                    scheduledAt={assignment.scheduled_at}
                    onUpdated={handleUpdated}
                  />
                ))}
              </div>
            </div>

            <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
                <PackageCheck className="h-3 w-3" />
                {assignment.started_at
                  ? `Started ${format(new Date(assignment.started_at), 'MMM d, h:mm a')}`
                  : 'Not started yet'}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-md text-[12px] border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-600"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}