'use client'

import {
  ClipboardList, Plug, MapPin, User, CalendarClock, Wrench,
  Hash, FileText, Briefcase, ShieldCheck, XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ServiceReport } from '@/lib/actions/service-report/service-report.actions'

function statusBadgeClasses(statusName: string, resolvedAt: string | null) {
  const s = statusName?.toLowerCase() || 'pending'
  if (s === 'approved' && resolvedAt) return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  switch (s) {
    case 'approved': return 'bg-sky-50 text-sky-700 border-sky-200'
    case 'pending': return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'rejected': return 'bg-rose-50 text-rose-700 border-rose-200'
    case 'cancel': return 'bg-slate-100 text-slate-500 border-slate-200'
    default: return 'bg-slate-50 text-slate-500 border-slate-200'
  }
}

function statusLabel(statusName: string, resolvedAt: string | null) {
  const s = statusName?.toLowerCase() || 'pending'
  if (s === 'approved' && resolvedAt) return 'Resolved'
  if (s === 'cancel') return 'Cancelled'
  return statusName ? statusName[0].toUpperCase() + statusName.slice(1) : 'Unknown'
}

function fmtDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function Field({
  icon: Icon, label, value, mono,
}: { icon: any; label: string; value: React.ReactNode; mono?: boolean }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3">
      <div className="h-8 w-8 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="h-3.5 w-3.5 text-violet-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
        <p className={cn('text-[13px] text-slate-700 font-medium break-words', mono && 'font-mono')}>{value}</p>
      </div>
    </div>
  )
}

export default function AdminViewServiceReportDialog({
  report, open, onOpenChange, onApprove, onReject,
}: {
  report: ServiceReport | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onApprove: (r: ServiceReport) => void
  onReject: (r: ServiceReport) => void
}) {
  if (!report) return null

  const isMeterTarget = !!report.meter_account_id
  const isPending = report.report_status_name.toLowerCase() === 'pending'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-white rounded-lg p-0 gap-0 overflow-hidden">

        {/* Header */}
        <div className="px-7 pt-6 pb-5 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <div className="h-10 w-10 rounded-lg bg-violet-600 flex items-center justify-center shrink-0 shadow-sm shadow-violet-200">
                  <ClipboardList className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-[15px] font-bold text-slate-900 leading-tight">
                    {report.issue_name}
                  </DialogTitle>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                    {report.reference_no || report.report_id}
                  </p>
                </div>
              </div>
              <Badge
                variant="outline"
                className={cn('gap-1.5 rounded-md shrink-0', statusBadgeClasses(report.report_status_name, report.resolved_at))}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                {statusLabel(report.report_status_name, report.resolved_at)}
              </Badge>
            </div>
          </DialogHeader>
        </div>

        {/* Body */}
        <div className="px-7 py-6 space-y-5 max-h-[60vh] overflow-y-auto bg-slate-50/60">

          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
            {isMeterTarget ? (
              <Field
                icon={Plug}
                label="Serial No."
                mono
                value={
                  <>
                    {report.meter_serial_no}
                    <span className="block text-[11px] text-slate-400 font-sans font-normal mt-0.5">
                      {report.consumer_name}
                    </span>
                  </>
                }
              />
            ) : (
              <Field
                icon={MapPin}
                label="Zone"
                value={
                  <>
                    {report.zone_name}
                    <span className="block text-[11px] text-slate-400 font-normal mt-0.5">
                      {report.barangay_name}
                    </span>
                  </>
                }
              />
            )}
            <Field icon={User} label="Reported By" value={report.report_by_name} />
            <Field icon={CalendarClock} label="Reported On" value={fmtDate(report.created_at)} />
          </div>

          {report.report_description && (
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <Field icon={FileText} label="Description" value={report.report_description} />
            </div>
          )}

          {report.affects_billing && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 text-[12px] text-amber-800 flex items-center gap-2">
              <Hash className="h-3.5 w-3.5 shrink-0" />
              This issue type affects billing — review carefully before approving.
            </div>
          )}

          {(report.approved_by_name || report.approved_at) && (
            <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
              <Field icon={ShieldCheck} label="Approved By" value={report.approved_by_name} />
              <Field icon={CalendarClock} label="Approved On" value={fmtDate(report.approved_at)} />
            </div>
          )}

          {report.job_order_id && (
            <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
              <Field icon={Briefcase} label="Job Order No." value={report.job_order_no} mono />
              <Field icon={Hash} label="Job Order Status" value={report.job_status_name} />
            </div>
          )}

        </div>

        {/* Footer — review actions */}
        {isPending && (
          <DialogFooter className="gap-2 px-7 py-4 border-t border-slate-100 bg-white">
            <Button
              variant="outline"
              className="rounded-md h-9 text-[13px] border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300 gap-2"
              onClick={() => onReject(report)}
            >
              <XCircle className="h-3.5 w-3.5" />
              Reject
            </Button>
            <Button
              className="rounded-md h-9 text-[13px] bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-2"
              onClick={() => onApprove(report)}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Approve
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}