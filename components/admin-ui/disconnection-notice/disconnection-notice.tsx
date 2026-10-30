'use client'

import { format } from 'date-fns'
import { AlertTriangle, CheckCircle2, FileText, Search, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge }     from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { EligibleConnection, NoticeOfDisconnection } from '@/lib/types/disconnection-notice.types'

// ============================================================
// HELPERS
// ============================================================

function fmt(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function getRuleBadge(rule: 1 | 2 | 3 | null) {
  if (rule === 1) return <Badge className="bg-violet-100 text-violet-800 hover:bg-violet-100 text-[10px] px-2">Rule 1</Badge>
  if (rule === 2) return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 text-[10px] px-2">Rule 2</Badge>
  if (rule === 3) return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 text-[10px] px-2">Rule 3</Badge>
  return <span className="text-muted-foreground text-xs">—</span>
}

function getStatusBadge(status: NoticeOfDisconnection['status']) {
  const map = {
    pending:   'bg-amber-100 text-amber-800',
    issued:    'bg-violet-100 text-violet-800',
    executed:  'bg-emerald-100 text-emerald-800',
    cancelled: 'bg-red-100 text-red-800',
  }
  return (
    <Badge className={cn('text-[10px] px-2 hover:opacity-100', map[status])}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  )
}

// ============================================================
// STEPPER (shared)
// ============================================================

const STEP_LABELS = [
  { label: 'Select Rules & Criteria', sub: 'Find eligible connections' },
  { label: 'Review & Confirm',         sub: 'Review the list' },
  { label: 'Generate Notices',         sub: 'Create disconnection notices' },
]

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-0 mb-6">
      {STEP_LABELS.map((s, i) => {
        const num    = i + 1
        const active = step === num
        const done   = step > num
        return (
          <div key={i} className="flex items-center flex-1">
            <div className="flex items-center gap-2.5 shrink-0">
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium border-2 transition-colors',
                done   && 'bg-violet-600 border-violet-600 text-white',
                active && 'bg-violet-600 border-violet-600 text-white',
                !done && !active && 'bg-background border-border text-muted-foreground',
              )}>
                {done ? '✓' : num}
              </div>
              <div>
                <p className={cn('text-xs font-medium', active ? 'text-foreground' : 'text-muted-foreground')}>
                  {s.label}
                </p>
                <p className="text-[10px] text-muted-foreground">{s.sub}</p>
              </div>
            </div>
            {i < 2 && <div className="flex-1 h-px bg-border mx-3" />}
          </div>
        )
      })}
    </div>
  )
}

// ============================================================
// REVIEW STEP (Step 2)
// ============================================================

export function ReviewStep({
  selected,
  onBack,
  onConfirm,
}: {
  selected: EligibleConnection[]
  onBack: () => void
  onConfirm: () => void
}) {
  const totalAmt = selected.reduce((s, c) => s + c.total_outstanding, 0)

  return (
    <div className="space-y-4">
      <Stepper step={2} />

      <div className="border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">
              Review Selected Connections
              <span className="text-muted-foreground font-normal ml-1">({selected.length})</span>
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Review the list below before generating notices. Go back to adjust selection.
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-muted-foreground">Total Outstanding</p>
            <p className="text-base font-semibold text-red-600">{fmt(totalAmt)}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                <TableHead className="text-[10px] font-semibold uppercase tracking-wide w-10">#</TableHead>
                <TableHead className="text-[10px] font-semibold uppercase tracking-wide">Service Connection</TableHead>
                <TableHead className="text-[10px] font-semibold uppercase tracking-wide">Customer Name</TableHead>
                <TableHead className="text-[10px] font-semibold uppercase tracking-wide">Zone / Barangay</TableHead>
                <TableHead className="text-[10px] font-semibold uppercase tracking-wide text-right">Outstanding (₱)</TableHead>
                <TableHead className="text-[10px] font-semibold uppercase tracking-wide text-center">Months Unpaid</TableHead>
                <TableHead className="text-[10px] font-semibold uppercase tracking-wide">Rule</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {selected.map((c, i) => (
                <TableRow key={c.connection_id}>
                  <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="text-xs font-medium text-violet-700">{c.connection_no}</TableCell>
                  <TableCell className="text-xs">{c.consumer_name}</TableCell>
                  <TableCell>
                    <p className="text-xs">{c.zone_name}</p>
                    <p className="text-[11px] text-muted-foreground">{c.barangay_name}</p>
                  </TableCell>
                  <TableCell className="text-xs font-medium text-right text-red-600">
                    {fmt(c.total_outstanding)}
                  </TableCell>
                  <TableCell className="text-xs text-center">{c.months_unpaid}</TableCell>
                  <TableCell>{getRuleBadge(c.rule_matched)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Warning */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-3 items-start">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-[12px] text-amber-800 leading-relaxed">
          <span className="font-semibold">Please confirm before proceeding.</span>{' '}
          Generating notices will create official disconnection notices for all{' '}
          <span className="font-semibold">{selected.length}</span> selected connection{selected.length !== 1 ? 's' : ''},
          with a total outstanding amount of{' '}
          <span className="font-semibold text-red-700">{fmt(totalAmt)}</span>.
          This action cannot be undone.
        </p>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" size="sm" onClick={onBack} className="h-8 text-xs">
          ← Back
        </Button>
        <Button
          size="sm"
          onClick={onConfirm}
          className="h-8 text-xs bg-violet-600 hover:bg-violet-700"
        >
          Confirm & Generate Notices →
        </Button>
      </div>
    </div>
  )
}

// ============================================================
// GENERATE STEP (Step 3)
// ============================================================

export function GenerateStep({
  selected,
  noticeNo,
  onGenerate,
  onReset,
  onViewAll,
}: {
  selected: EligibleConnection[]
  noticeNo: string
  onGenerate: () => Promise<void>
  onReset: () => void
  onViewAll: () => void
}) {
  const totalAmt = selected.reduce((s, c) => s + c.total_outstanding, 0)
  const isGenerated = !!noticeNo

  return (
    <div className="space-y-4">
      <Stepper step={3} />

      <div className="border border-border rounded-lg overflow-hidden">
        <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
          {isGenerated ? (
            <>
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                <CheckCircle2 className="h-7 w-7 text-emerald-600" />
              </div>
              <p className="text-base font-semibold mb-1">Notices Generated Successfully</p>
              <p className="text-xs text-muted-foreground mb-1">
                Notice No: <span className="font-medium text-foreground">{noticeNo}</span>
              </p>
              <p className="text-xs text-muted-foreground mb-6">
                {selected.length} notice{selected.length !== 1 ? 's' : ''} created
                {' · '}Total: <span className="font-medium text-red-600">{fmt(totalAmt)}</span>
              </p>
              <div className="flex gap-3">
                <Button variant="outline" size="sm" onClick={onReset} className="h-8 text-xs">
                  Generate Another
                </Button>
                <Button
                  size="sm"
                  onClick={onViewAll}
                  className="h-8 text-xs bg-violet-600 hover:bg-violet-700"
                >
                  View All Notices
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="w-14 h-14 rounded-full bg-violet-100 flex items-center justify-center mb-4">
                <FileText className="h-7 w-7 text-violet-600" />
              </div>
              <p className="text-base font-semibold mb-2">Ready to Generate</p>
              <p className="text-xs text-muted-foreground max-w-sm leading-relaxed mb-6">
                <span className="font-medium text-foreground">{selected.length}</span> disconnection
                notices will be created for a total outstanding of{' '}
                <span className="font-medium text-red-600">{fmt(totalAmt)}</span>.
                Each notice will be issued a unique notice number.
              </p>
              <Button
                size="sm"
                onClick={onGenerate}
                className="h-9 px-6 text-xs bg-violet-600 hover:bg-violet-700"
              >
                Generate {selected.length} Notice{selected.length !== 1 ? 's' : ''}
              </Button>
              <button
                onClick={onReset}
                className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Go back
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// NOTICE LIST TAB
// ============================================================

export function NoticeListTab({
  notices,
  isLoading,
  onGenerateNew,
}: {
  notices: NoticeOfDisconnection[]
  isLoading: boolean
  onGenerateNew: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Existing Disconnection Notices</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            View and manage generated disconnection notices
          </p>
        </div>
        <Button
          size="sm"
          onClick={onGenerateNew}
          className="h-8 text-xs bg-violet-600 hover:bg-violet-700"
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Generate New Notice
        </Button>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/20 hover:bg-muted/20">
              <TableHead className="text-[10px] font-semibold uppercase tracking-wide">Notice No.</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wide">Generated</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wide">Generated By</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wide text-center">Total Accounts</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wide text-right">Total Outstanding</TableHead>
              <TableHead className="text-[10px] font-semibold uppercase tracking-wide">Status</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && [...Array(4)].map((_, i) => (
              <TableRow key={i}>
                {[32, 28, 28, 16, 24, 16, 16].map((w, j) => (
                  <TableCell key={j}>
                    <div className={`h-3.5 w-${w} bg-muted animate-pulse rounded`} />
                  </TableCell>
                ))}
              </TableRow>
            ))}

            {!isLoading && notices.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-48 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <FileText className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">No notices generated yet.</p>
                    <Button
                      variant="outline" size="sm"
                      onClick={onGenerateNew}
                      className="h-7 text-xs"
                    >
                      Generate your first notice
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!isLoading && notices.map(n => (
              <TableRow key={n.notice_id} className="hover:bg-violet-50/30 dark:hover:bg-violet-950/10">
                <TableCell className="text-xs font-medium text-violet-700">{n.notice_no}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {format(new Date(n.generated_at), 'MMM dd, yyyy')}
                </TableCell>
                <TableCell className="text-xs">{n.generated_by}</TableCell>
                <TableCell className="text-xs text-center">{n.total_accounts}</TableCell>
                <TableCell className="text-xs font-medium text-right text-red-600">
                  {fmt(n.total_outstanding)}
                </TableCell>
                <TableCell>{getStatusBadge(n.status)}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" className="h-7 text-xs px-2.5 text-violet-700 hover:text-violet-900">
                    <Search className="h-3 w-3 mr-1" /> View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}