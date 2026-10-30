'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import {
  Wrench, CreditCard, CalendarDays, CheckCircle2,
  TrendingDown, AlertCircle, Clock, Edit,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  getMeterInstallmentByMeterAccount,
  type MeterInstallmentDetail,
} from '@/lib/actions/meter-installment/meter-installment.actions'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (d: string) => format(new Date(d), 'MMM dd, yyyy')
const peso = (n: number | null | undefined) =>
  n !== null && n !== undefined
    ? `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
    : '—'

// ─── Props ────────────────────────────────────────────────────────────────────

interface MeterInstallmentModalProps {
  open: boolean
  meterAccountId: string
  meterSerialNo: string
  onClose: () => void
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ModalSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-16 w-full rounded-md" />
      <Skeleton className="h-4 w-full rounded-md" />
      <div className="grid grid-cols-2 gap-2.5">
        <Skeleton className="h-[80px] rounded-md" />
        <Skeleton className="h-[80px] rounded-md" />
        <Skeleton className="h-[80px] rounded-md" />
        <Skeleton className="h-[80px] rounded-md" />
      </div>
      <Skeleton className="h-[160px] w-full rounded-md" />
    </div>
  )
}

// ─── Stat Cell ────────────────────────────────────────────────────────────────

function StatCell({
  icon,
  label,
  value,
  sub,
  valueClass,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  valueClass?: string
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-md px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-slate-400 mb-1.5">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
      </div>
      <p className={cn('text-[17px] font-bold', valueClass ?? 'text-slate-800')}>{value}</p>
      <p className="text-[11px] text-slate-400 mt-1">{sub}</p>
    </div>
  )
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function MeterInstallmentModal({
  open,
  meterAccountId,
  meterSerialNo,
  onClose,
}: MeterInstallmentModalProps) {
  const [installment, setInstallment] = useState<MeterInstallmentDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)

  const fetchInstallment = async () => {
    if (!meterAccountId) return
    setIsLoading(true)
    try {
      const res = await getMeterInstallmentByMeterAccount(meterAccountId)
      if (res.status === 'success') {
        setInstallment(res.data)
      } else {
        toast.error(res.message)
      }
    } catch {
      toast.error('Failed to load installment details')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!open || !meterAccountId) return
    setInstallment(null)
    fetchInstallment()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, meterAccountId])

  const isActive = installment?.status_code === 'ACTIVE'
  const isCompleted = installment?.status_code === 'COMPLETED'
  const isCancelled = installment?.status_code === 'CANCELLED'
  const isPending = installment?.status_code === 'PENDING'

  // Determine status display
  const getStatusDisplay = () => {
    if (isCompleted) {
      return {
        label: 'Completed',
        icon: <CheckCircle2 className="h-3.5 w-3.5" />,
        className: 'bg-emerald-50 text-emerald-700 border-emerald-200'
      }
    }
    if (isActive) {
      return {
        label: 'Active',
        icon: <Clock className="h-3.5 w-3.5" />,
        className: 'bg-violet-50 text-violet-700 border-violet-200'
      }
    }
    if (isPending) {
      return {
        label: 'Pending',
        icon: <Clock className="h-3.5 w-3.5" />,
        className: 'bg-amber-50 text-amber-700 border-amber-200'
      }
    }
    if (isCancelled) {
      return {
        label: 'Cancelled',
        icon: <AlertCircle className="h-3.5 w-3.5" />,
        className: 'bg-rose-50 text-rose-700 border-rose-200'
      }
    }
    return {
      label: installment?.status_code || 'Unknown',
      icon: <AlertCircle className="h-3.5 w-3.5" />,
      className: 'bg-slate-50 text-slate-500 border-slate-200'
    }
  }

  const statusDisplay = getStatusDisplay()
  const showEditButton = isActive || isPending

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
        <DialogContent className="sm:max-w-xl rounded-md p-0 gap-0 overflow-hidden">

          {/* ── Header ─────────────────────────────────────────────────────── */}
          <DialogHeader className="px-5 pt-5 pb-4 border-b border-slate-100">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-md bg-violet-100 border border-violet-200 flex items-center justify-center shrink-0">
                  <Wrench className="h-4 w-4 text-violet-600" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-[15px] font-bold text-slate-900 leading-tight">
                    Meter installment plan
                  </DialogTitle>
                  <DialogDescription className="text-[12px] text-slate-400 mt-0.5 truncate">
                    {meterSerialNo}
                  </DialogDescription>
                </div>
              </div>

              {/* Status badge + Edit button - grouped together */}
              {!isLoading && installment && (
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn(
                    'inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold border whitespace-nowrap',
                    statusDisplay.className,
                  )}>
                    {statusDisplay.icon}
                    {statusDisplay.label}
                  </span>
                </div>
              )}
            </div>
          </DialogHeader>

          {/* ── Body ───────────────────────────────────────────────────────── */}
          <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">

            {isLoading && <ModalSkeleton />}

            {!isLoading && !installment && (
              <div className="py-10 text-center">
                <AlertCircle className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-500">No installment data found</p>
                <p className="text-xs text-slate-400 mt-1">
                  This meter account has no active or past installment plan.
                </p>
              </div>
            )}

            {!isLoading && installment && (
              <>

                {/* Stats grid - larger text */}
                <div className="grid grid-cols-2 gap-2.5">
                  <StatCell
                    icon={<CreditCard className="h-4 w-4" />}
                    label="Total cost"
                    value={peso(installment.total_cost)}
                    sub="Original meter price"
                  />
                  <StatCell
                    icon={<CalendarDays className="h-4 w-4" />}
                    label="Monthly amount"
                    value={peso(installment.monthly_amount)}
                    sub="Charged per billing cycle"
                    valueClass="text-violet-700"
                  />
                  <StatCell
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    label="Amount paid"
                    value={peso(installment.amount_paid)}
                    sub={`${installment.months_paid} payment${installment.months_paid !== 1 ? 's' : ''} made`}
                    valueClass="text-emerald-700"
                  />
                  <StatCell
                    icon={<TrendingDown className="h-4 w-4" />}
                    label="Remaining balance"
                    value={peso(installment.remaining_balance)}
                    sub={isCompleted ? 'Fully settled' : `${installment.months_remaining} months left`}
                    valueClass={isCompleted ? 'text-emerald-700' : 'text-amber-700'}
                  />
                </div>

                {/* Schedule details - larger text */}
                <div className="border border-slate-200 rounded-md overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                      Schedule details
                    </p>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {[
                      { label: 'Start date',        value: fmt(installment.created_at) },
                      { label: 'Total months',       value: `${installment.total_months} months` },
                      {
                        label: 'Est. completion',
                        value: installment.estimated_completion_date
                          ? fmt(installment.estimated_completion_date)
                          : '—',
                      },
                    ].map((row, i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-3">
                        <span className="text-[12px] text-slate-500">{row.label}</span>
                        <span className="text-[12px] font-semibold text-slate-700 font-mono">
                          {row.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Payment history - larger text */}
                {installment.charges.length > 0 && (
                  <div className="border border-slate-200 rounded-md overflow-hidden">
                    <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                        Payment history
                      </p>
                    </div>
                    <div className="divide-y divide-slate-100 max-h-[200px] overflow-y-auto">
                      {installment.charges.map((charge, i) => {
                        // FIXED: Handle billing_period display properly
                        let periodDisplay = ''
                        if (charge.billing_period) {
                          // billing_period is already a formatted string like "Jan 2026 - Feb 2026"
                          periodDisplay = charge.billing_period
                        } else if (charge.created_at) {
                          // Fallback to created_at date
                          periodDisplay = format(new Date(charge.created_at), 'MMMM yyyy')
                        }

                        return (
                          <div
                            key={charge.charge_id}
                            className="flex items-center justify-between px-4 py-3"
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-violet-100 text-violet-700 text-[11px] font-bold shrink-0">
                                {i + 1}
                              </span>
                              <div>
                                <p className="text-[12px] font-semibold text-slate-700">
                                  {periodDisplay || 'Payment'}
                                </p>
                                {charge.billing_status && (
                                  <p className="text-[11px] text-slate-400">{charge.billing_status}</p>
                                )}
                              </div>
                            </div>
                            <span className="text-[13px] font-bold text-slate-700 font-mono">
                              {peso(charge.amount)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Fully paid notice */}
                {isActive && installment.remaining_balance <= 0 && (
                  <div className="flex items-center gap-2.5 px-4 py-3 rounded-md bg-emerald-50 border border-emerald-200">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <p className="text-[12px] text-emerald-700 font-medium">
                      Balance is fully paid. Plan can be marked as completed.
                    </p>
                  </div>
                )}

                {/* Cancelled notice */}
                {isCancelled && (
                  <div className="flex items-center gap-2.5 px-4 py-3 rounded-md bg-rose-50 border border-rose-200">
                    <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
                    <p className="text-[12px] text-rose-700 font-medium">
                      This installment plan has been cancelled.
                    </p>
                  </div>
                )}

                {/* Pending notice */}
                {isPending && (
                  <div className="flex items-center gap-2.5 px-4 py-3 rounded-md bg-amber-50 border border-amber-200">
                    <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                    <p className="text-[12px] text-amber-700 font-medium">
                      This installment plan is pending and has not started yet.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Footer ─────────────────────────────────────────────────────── */}
          <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/60 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="h-9 text-[13px] rounded-md border-slate-200 px-5"
            >
              Close
            </Button>
          </div>

        </DialogContent>
      </Dialog>
    </>
  )
}