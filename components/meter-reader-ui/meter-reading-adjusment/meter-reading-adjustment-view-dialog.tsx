'use client'

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  Clock, CheckCircle2, XCircle, Ban, Gauge, User,
  CalendarDays, Hash, ImageIcon, ExternalLink, FileText,
} from 'lucide-react'
import type { MyAdjustmentRecord } from '@/lib/actions/meter-reading/meter-reading-adjustment.actions'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MeterReadingAdjustmentViewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  adjustment: MyAdjustmentRecord | null
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  string,
  { badge: string; icon: React.ReactNode; label: string }
> = {
  pending: {
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: <Clock className="h-3 w-3" />,
    label: 'Pending',
  },
  approved: {
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: <CheckCircle2 className="h-3 w-3" />,
    label: 'Approved',
  },
  rejected: {
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    icon: <XCircle className="h-3 w-3" />,
    label: 'Rejected',
  },
  cancelled: {
    badge: 'bg-slate-100 text-slate-500 border-slate-200',
    icon: <Ban className="h-3 w-3" />,
    label: 'Cancelled',
  },
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const numFmt = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 })

const dateTimeFmt = new Intl.DateTimeFormat('en-US', {
  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
})

const dateFmt = new Intl.DateTimeFormat('en-US', {
  year: 'numeric', month: 'short', day: 'numeric',
})

function fmtNum(n: number): string { return numFmt.format(n) }

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : dateTimeFmt.format(d)
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : dateFmt.format(d)
}

function formatPeriod(adjustment: MyAdjustmentRecord): string {
  const start = fmtDate(adjustment.reading_period_start)
  const end = fmtDate(adjustment.reading_period_end)
  if (start === '—' && end === '—') return '—'
  if (start === end) return start
  return `${start} — ${end}`
}

// ─── Small building blocks ────────────────────────────────────────────────────

function SectionCard({
  icon,
  title,
  children,
  className,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('rounded-lg border border-slate-100 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden', className)}>
      <div className="flex items-center gap-2 px-3.5 pt-3 pb-1">
        <span className="text-violet-500">{icon}</span>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{title}</span>
      </div>
      <div className="px-3.5 pb-2">{children}</div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 border-b border-slate-50 last:border-b-0">
      <span className="text-[11px] text-slate-400 shrink-0">{label}</span>
      <span className="text-[12px] font-medium text-slate-800 text-right">{value}</span>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MeterReadingAdjustmentViewDialog({
  open,
  onOpenChange,
  adjustment,
}: MeterReadingAdjustmentViewDialogProps) {
  if (!adjustment) return null

  const status = adjustment.status_name?.toLowerCase() || 'pending'
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending

  const diff = adjustment.adjusted_reading - adjustment.original_reading
  const isIncrease = diff > 0

  const proofUrl = adjustment.proof_signed_url ?? adjustment.proof_image_url

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-xl flex flex-col p-0 gap-0 border border-slate-200 bg-slate-50/50 rounded-xl max-h-[90vh] overflow-hidden">

        {/* ── Header ── */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 bg-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-violet-100 border border-violet-200 flex items-center justify-center shrink-0">
                <Gauge className="h-4.5 w-4.5 text-violet-600" />
              </div>
              <div>
                <DialogTitle className="text-[14px] font-bold text-slate-900 leading-tight">
                  Adjustment Request
                </DialogTitle>
                <div className="flex items-center gap-1.5 mt-1">
                  <Hash className="h-3 w-3 text-slate-400" />
                  <span className="text-[11px] font-mono text-slate-500">{adjustment.meter_serial_no}</span>
                </div>
              </div>
            </div>
            <span className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold border shrink-0',
              cfg.badge,
            )}>
              {cfg.icon}
              {cfg.label}
            </span>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-3">

          {/* Consumer */}
          <SectionCard icon={<User className="h-3.5 w-3.5" />} title="Consumer">
            <InfoRow label="Name" value={adjustment.consumer_name} />
            <InfoRow label="Serial No." value={<span className="font-mono">{adjustment.meter_serial_no}</span>} />
          </SectionCard>

          {/* Billing Period */}
          <SectionCard icon={<CalendarDays className="h-3.5 w-3.5" />} title="Billing Period">
            <InfoRow label="Period" value={formatPeriod(adjustment)} />
            <InfoRow label="Due Date" value={fmtDate(adjustment.reading_period_due_date)} />
          </SectionCard>

          {/* Reading Values — highlight the adjustment itself */}
          <SectionCard icon={<Gauge className="h-3.5 w-3.5" />} title="Reading Values">
            <div className="grid grid-cols-2 gap-2 py-2">
              {/* Original */}
              <div className="rounded-md bg-slate-50 border border-slate-100 px-3 py-2">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Original</p>
                <p className="text-[15px] font-mono font-semibold text-slate-600 mt-0.5">
                  {fmtNum(adjustment.original_reading)}
                  <span className="text-[10px] font-sans font-normal text-slate-400 ml-1">m³</span>
                </p>
              </div>
              {/* Adjusted */}
              <div className="rounded-md bg-violet-50 border border-violet-100 px-3 py-2">
                <p className="text-[9px] font-bold text-violet-500 uppercase tracking-widest">Adjusted</p>
                <p className="text-[15px] font-mono font-semibold text-violet-700 mt-0.5">
                  {fmtNum(adjustment.adjusted_reading)}
                  <span className="text-[10px] font-sans font-normal text-violet-400 ml-1">m³</span>
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between pb-1">
              <span className="text-[11px] text-slate-400">Difference</span>
              <span className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold',
                isIncrease ? 'bg-emerald-50 text-emerald-700' : diff < 0 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500',
              )}>
                {isIncrease ? '+' : ''}{fmtNum(diff)} m³
              </span>
            </div>
          </SectionCard>

          {/* Proof Image */}
          <SectionCard icon={<ImageIcon className="h-3.5 w-3.5" />} title="Proof Image">
            {proofUrl ? (
              <a
                href={proofUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative block mt-1 mb-1.5 rounded-lg overflow-hidden border border-slate-200 bg-slate-50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={proofUrl}
                  alt="Proof of adjusted meter reading"
                  className="w-full max-h-52 object-contain transition-transform duration-300 group-hover:scale-[1.02]"
                />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-slate-900/60 to-transparent py-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ExternalLink className="h-3 w-3 text-white" />
                  <span className="text-[10px] font-medium text-white">View full size</span>
                </div>
              </a>
            ) : (
              <div className="mt-1 mb-1.5 rounded-lg border border-dashed border-slate-200 bg-slate-50 py-6 flex flex-col items-center gap-1.5">
                <ImageIcon className="h-4 w-4 text-slate-300" />
                <p className="text-[11px] text-slate-400">No proof image attached</p>
              </div>
            )}
            <p className="text-[10px] text-slate-400 pb-1">
              Photo of the meter supporting this adjustment request.
            </p>
          </SectionCard>

          {/* Reason */}
          {adjustment.reason && (
            <SectionCard icon={<FileText className="h-3.5 w-3.5" />} title="Reason">
              <p className="text-[12px] text-slate-700 leading-relaxed py-1.5 whitespace-pre-wrap break-words">
                {adjustment.reason}
              </p>
            </SectionCard>
          )}

          {/* Request Info */}
          <SectionCard icon={<Clock className="h-3.5 w-3.5" />} title="Request">
            <InfoRow label="Requested On" value={fmtDateTime(adjustment.requested_date)} />
          </SectionCard>

          {/* Approval / Review Info */}
          {status !== 'pending' && (
            <div className={cn(
              'rounded-lg border overflow-hidden',
              status === 'approved' && 'border-emerald-100 bg-emerald-50/60',
              status === 'rejected' && 'border-rose-100 bg-rose-50/60',
              status === 'cancelled' && 'border-slate-200 bg-slate-100/60',
            )}>
              <div className="flex items-center gap-2 px-3.5 pt-3 pb-1">
                <span className={cn(
                  status === 'approved' && 'text-emerald-600',
                  status === 'rejected' && 'text-rose-600',
                  status === 'cancelled' && 'text-slate-500',
                )}>
                  {cfg.icon}
                </span>
                <span className={cn(
                  'text-[10px] font-bold uppercase tracking-widest',
                  status === 'approved' && 'text-emerald-600',
                  status === 'rejected' && 'text-rose-600',
                  status === 'cancelled' && 'text-slate-500',
                )}>
                  {status === 'cancelled' ? 'Cancelled' : status === 'approved' ? 'Approved' : 'Rejected'}
                </span>
              </div>
              <div className="px-3.5 pb-2">
                <InfoRow label={status === 'cancelled' ? 'Cancelled On' : 'Processed On'} value={fmtDateTime(adjustment.approved_at)} />
              </div>
            </div>
          )}

        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-slate-100 bg-white flex items-center justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-lg h-9 text-[13px] border-slate-200 hover:bg-slate-50"
          >
            Close
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  )
}