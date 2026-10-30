'use client'

import { useEffect, useState } from 'react'
import {
  ClipboardList, MapPin, User, Calendar, CheckCircle2,
  Gauge, AlertCircle, Hash, Wrench, MessageSquareWarning,
  UserCheck, // NEW icon for assigned worker
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { getJobOrderDetails, type JobOrderDetails, type ProcessType } from '@/lib/actions/job-order/job-order.actions'


const processStyles: Record<ProcessType, string> = {
  Installation: 'bg-violet-50 text-violet-700 border-violet-200',
  Reconnection: 'bg-sky-50 text-sky-700 border-sky-200',
  Disconnection: 'bg-orange-50 text-orange-700 border-orange-200',
  'Service Report': 'bg-teal-50 text-teal-700 border-teal-200',
  Other: 'bg-slate-50 text-slate-600 border-slate-200',
}

const statusStyles: Record<string, string> = {
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
  Assigned: 'bg-blue-50 text-blue-700 border-blue-200',
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Cancelled: 'bg-slate-50 text-slate-400 border-slate-200',
}
const statusDotStyles: Record<string, string> = {
  Pending: 'bg-amber-500',
  Assigned: 'bg-blue-500',
  Completed: 'bg-emerald-500',
  Cancelled: 'bg-slate-300',
}

function DetailRow({
  icon: Icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ElementType
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="inline-flex items-center gap-2 text-[12px] text-slate-400 font-medium">
        <Icon className="h-3.5 w-3.5 text-slate-300 shrink-0" />
        {label}
      </span>
      <span className={cn(
        'text-[12.5px] font-semibold text-slate-700 text-right truncate max-w-[60%]',
        mono && 'font-mono',
      )}>
        {value}
      </span>
    </div>
  )
}

function DetailsSkeleton() {
  return (
    <div className="space-y-4 py-2 animate-pulse">
      <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-4 space-y-2">
        <div className="h-3 w-28 bg-slate-200/70 rounded-full" />
        <div className="h-5 w-40 bg-slate-200/70 rounded-full" />
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-2.5">
            <div className="h-3 w-20 bg-slate-100 rounded-full" />
            <div className="h-3 w-28 bg-slate-100 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function ViewJobOrderDetailsDialog({
  jobOrderId,
  onOpenChange,
}: {
  jobOrderId: string | null
  onOpenChange: (open: boolean) => void
}) {
  const [details, setDetails] = useState<JobOrderDetails | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    if (!jobOrderId) { setDetails(null); setHasError(false); return }
    setIsLoading(true)
    setHasError(false)
    getJobOrderDetails(jobOrderId)
      .then((res) => {
        if (!res) setHasError(true)
        setDetails(res)
      })
      .catch(() => setHasError(true))
      .finally(() => setIsLoading(false))
  }, [jobOrderId])

  const isServiceReport = details?.process_type === 'Service Report'
  const hasMeterAccount = details?.meter_serial_no && details.meter_serial_no !== '—'
  const isAssigned = details?.assigned_to_name && details.assigned_to_name !== '—'

  return (
    <Dialog open={!!jobOrderId} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white rounded-lg p-0 overflow-hidden gap-0">

        {/* Header band */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100 bg-gradient-to-br from-violet-50 to-white">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-violet-600 flex items-center justify-center shrink-0 shadow-sm shadow-violet-200">
              <ClipboardList className="h-4.5 w-4.5 text-white" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-[15px] font-bold text-slate-900 leading-tight">
                Job Order Details
              </DialogTitle>
              {details && (
                <p className="text-[11.5px] font-mono text-slate-500 mt-0.5">
                  {details.job_order_no ?? '—'}
                </p>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 py-4">
          {isLoading && <DetailsSkeleton />}

          {!isLoading && hasError && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <div className="h-10 w-10 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center">
                <AlertCircle className="h-4.5 w-4.5 text-rose-400" />
              </div>
              <p className="text-sm font-semibold text-slate-600">Couldn't load this job order</p>
              <p className="text-xs text-slate-400">It may have been removed or you lost access.</p>
            </div>
          )}

          {!isLoading && !hasError && details && (
            <div className="space-y-4">

              {/* Type + status pills */}
              <div className="flex items-center gap-2">
                <span className={cn('inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold border', processStyles[details.process_type])}>
                  {details.process_type}
                </span>
                <span className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold border',
                  statusStyles[details.job_status_name] ?? 'bg-slate-50 text-slate-400 border-slate-200',
                )}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', statusDotStyles[details.job_status_name] ?? 'bg-slate-300')} />
                  {details.job_status_name}
                </span>
              </div>

              {/* Service report card — issue + who reported it */}
              {isServiceReport && (
                <div className="rounded-lg border border-teal-100 bg-teal-50/50 px-4 py-3">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-teal-500 mb-1.5">
                    <MessageSquareWarning className="h-3 w-3" /> Reported Issue
                  </div>
                  <p className="text-[13px] font-bold text-slate-800">
                    {details.issue_name ?? '—'}
                  </p>
                  <p className="text-[12px] text-slate-500 mt-0.5">
                    Reported by {details.reported_by_name ?? '—'}
                  </p>
                  {!hasMeterAccount && (
                    <p className="text-[11px] text-teal-600 mt-1.5 flex items-center gap-1">
                      <Wrench className="h-3 w-3" /> Zone-wide report — no single meter account
                    </p>
                  )}
                </div>
              )}

              {/* Meter account summary card — shown whenever there's an
                  actual meter account (all process types except zone-level
                  service reports) */}
              {hasMeterAccount && (
                <div className="rounded-lg border border-violet-100 bg-violet-50/50 px-4 py-3">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-violet-500 mb-1.5">
                    <Gauge className="h-3 w-3" /> Meter Account
                  </div>
                  <p className="text-[13px] font-mono font-bold text-slate-800">{details.meter_serial_no}</p>
                  <p className="text-[12px] text-slate-500 mt-0.5">
                    {isServiceReport ? details.zone_name : details.consumer_name}
                  </p>
                </div>
              )}

              {/* Detail rows */}
              <div className="divide-y divide-slate-100">
                <DetailRow icon={MapPin} label="Barangay" value={details.barangay_name} />
                <DetailRow
                  icon={User}
                  label={isServiceReport ? 'Reported By' : 'Requested By'}
                  value={isServiceReport ? (details.reported_by_name ?? '—') : details.created_by_name}
                />
                {isAssigned && (
                  <DetailRow
                    icon={UserCheck}
                    label="Assigned To"
                    value={details.assigned_to_name}
                  />
                )}
                <DetailRow
                  icon={Calendar}
                  label="Requested"
                  value={details.request_date ? new Date(details.request_date).toLocaleString() : '—'}
                />
                {details.completion_date && (
                  <DetailRow
                    icon={CheckCircle2}
                    label="Completed"
                    value={new Date(details.completion_date).toLocaleString()}
                  />
                )}
                <DetailRow icon={Hash} label="Job Type" value={details.job_type_name} />
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}