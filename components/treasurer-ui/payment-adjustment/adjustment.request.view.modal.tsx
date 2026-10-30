'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { DialogTrigger } from '@/components/ui/dialog'
import {
  AlertTriangle, CheckCircle2, Clock, Receipt, User, MapPin,
  Calendar, CircleDollarSign, CreditCard, FileText, Eye,
  Loader2, Building2, Home, Factory, Droplet,
} from 'lucide-react'
import {
  getAdjustmentRequestById,
  type AdjustmentRequestDetail,
} from '@/lib/actions/adjustment/payment.adjustment.actions'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatPeso = (amount: number) => {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(amount)
}

const formatDate = (dateString: string) => {
  if (!dateString) return '—'
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const formatDateTime = (dateString: string) => {
  if (!dateString) return '—'
  return new Date(dateString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatPeriod = (period: string) => {
  if (!period) return '—'
  const [y, m] = period.split('-').map(Number)
  const date = new Date(y, m - 1)
  const lastDay = new Date(y, m, 0).getDate()
  return `${date.toLocaleDateString('en-US', { month: 'long' })} 1–${lastDay}, ${y}`
}

function getStatusConfig(status: string) {
  switch (status.toLowerCase()) {
    case 'approved':
      return {
        icon: CheckCircle2,
        className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        dot: 'bg-emerald-500',
      }
    case 'rejected':
      return {
        icon: AlertTriangle,
        className: 'bg-rose-50 text-rose-700 border-rose-200',
        dot: 'bg-rose-500',
      }
    default:
      return {
        icon: Clock,
        className: 'bg-amber-50 text-amber-700 border-amber-200',
        dot: 'bg-amber-500',
      }
  }
}

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-b-0">
      <span className="text-[11px] text-slate-500">{label}</span>
      <span className={cn('text-[12px] font-medium text-slate-800', mono && 'font-mono')}>
        {value || '—'}
      </span>
    </div>
  )
}

function AmountRow({
  label, amount, sub, bold, accent,
}: {
  label: string
  amount: number
  sub?: string
  bold?: boolean
  accent?: 'red' | 'green'
}) {
  const color = accent === 'red'
    ? 'text-rose-600'
    : accent === 'green'
      ? 'text-emerald-700'
      : ''
  return (
    <div className="flex items-baseline justify-between py-2 border-b border-slate-100 last:border-b-0">
      <div className="min-w-0">
        <span className={cn('text-[12px]', bold ? 'font-semibold text-slate-800' : 'text-slate-600')}>
          {label}
        </span>
        {sub && <span className="ml-1.5 text-[10px] text-slate-400">{sub}</span>}
      </div>
      <span className={cn('text-[13px] tabular-nums shrink-0', bold && 'font-bold', color)}>
        {formatPeso(amount)}
      </span>
    </div>
  )
}

// ─── Props ─────────────────────────────────────────────────────────────────────

interface AdjustmentRequestViewModalProps {
  adjustmentId: string
  onSuccess?: () => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AdjustmentRequestViewModal({
  adjustmentId,
  onSuccess,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  children,
}: AdjustmentRequestViewModalProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [record, setRecord] = useState<AdjustmentRequestDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('details')

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen
  const setIsOpen = controlledOnOpenChange || setInternalOpen

  const fetchRecord = async () => {
    setLoading(true)
    try {
      const res = await getAdjustmentRequestById(adjustmentId)
      if (res.status === 'success' && res.data) {
        setRecord(res.data)
      } else {
        toast.error(res.message ?? 'Failed to load adjustment details')
        setIsOpen(false)
      }
    } catch {
      toast.error('Failed to load adjustment details')
      setIsOpen(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen && adjustmentId) {
      fetchRecord()
    } else {
      setRecord(null)
      setActiveTab('details')
    }
  }, [adjustmentId, isOpen])

  const statusConfig = record ? getStatusConfig(record.adjustment_status) : { icon: Clock, className: '', dot: '' }
  const StatusIcon = statusConfig.icon

  // Get consumer name from account_name
  const consumerName = record?.consumer.account_name || ''

  const diff = record ? record.adjusted_amount - record.original_amount : 0
  const newRemaining = record ? record.billing.remaining_balance - diff : 0

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}

      <DialogContent className="w-full sm:max-w-3xl flex flex-col p-0 gap-0 border-l border-slate-200 bg-white rounded-md max-h-[90vh]">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-md bg-violet-100 border border-violet-200 flex items-center justify-center shrink-0">
                <Receipt className="h-4 w-4 text-violet-600" />
              </div>
              <div>
                <DialogTitle className="text-[14px] font-bold text-slate-900 leading-tight">
                  Payment Adjustment Request
                </DialogTitle>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Receipt #{record?.payment.receipt_number}
                </p>
              </div>
            </div>
            {record && (
              <span className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold border shrink-0',
                statusConfig.className
              )}>
                <StatusIcon className="h-3 w-3" />
                {record.adjustment_status}
              </span>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
          </div>
        ) : record ? (
          <>
            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
              <TabsList className="w-full justify-start rounded-none border-b border-slate-100 bg-slate-50/40 px-6 h-auto shrink-0 gap-0">
                <TabsTrigger
                  value="details"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-violet-600 data-[state=active]:text-violet-700 gap-2 text-[12px] font-medium rounded-none px-4 py-2.5"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Request Details
                </TabsTrigger>
                <TabsTrigger
                  value="billing"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-violet-600 data-[state=active]:text-violet-700 gap-2 text-[12px] font-medium rounded-none px-4 py-2.5"
                >
                  <CircleDollarSign className="h-3.5 w-3.5" />
                  Billing Info
                </TabsTrigger>
              </TabsList>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto min-h-0">
                <TabsContent value="details" className="m-0 p-6">
                  <div className="space-y-4">
                    {/* Consumer & Meter Account */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="bg-slate-50 rounded-md p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <User className="h-3.5 w-3.5 text-violet-500" />
                          <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Consumer</span>
                        </div>
                        <div className="space-y-0">
                          <InfoRow label="Account Name" value={consumerName} />
                          <InfoRow label="Classification" value={record.meter_account.classification_name} />
                        </div>
                      </div>

                      <div className="bg-slate-50 rounded-md p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <MapPin className="h-3.5 w-3.5 text-violet-500" />
                          <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Location</span>
                        </div>
                        <div className="space-y-0">
                          <InfoRow label="Barangay" value={record.meter_account.barangay_name} />
                          <InfoRow label="Zone" value={record.meter_account.zone_name} />
                          <InfoRow label="Serial No." value={record.meter_account.meter_serial_no} mono />
                        </div>
                      </div>
                    </div>

                    {/* Payment Details */}
                    <div className="bg-slate-50 rounded-md p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <CreditCard className="h-3.5 w-3.5 text-violet-500" />
                        <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Payment Details</span>
                      </div>
                      <div className="space-y-0">
                        <InfoRow label="Receipt Number" value={record.payment.receipt_number} mono />
                        <InfoRow label="Payment Date" value={formatDate(record.payment.payment_date)} />
                        <InfoRow label="Recorded By" value={record.payment.recorded_by.first_name + ' ' + record.payment.recorded_by.last_name} />
                        <InfoRow label="Original Amount" value={formatPeso(record.original_amount)} />
                      </div>
                    </div>

                    {/* Adjustment Details */}
                    <div className="bg-slate-50 rounded-md p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-violet-500" />
                        <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Adjustment Details</span>
                      </div>
                      <div className="space-y-0">
                        <InfoRow label="Original Amount" value={formatPeso(record.original_amount)} />
                        <InfoRow label="Requested Amount" value={formatPeso(record.adjusted_amount)} />
                        <InfoRow label="Difference" value={`${diff > 0 ? '+' : ''}${formatPeso(Math.abs(diff))}`} />
                        <InfoRow label="New Remaining Balance" value={formatPeso(Math.max(0, newRemaining))} />
                      </div>
                      {record.reason && (
                        <div className="mt-3 pt-2 border-t border-slate-200">
                          <p className="text-[10px] font-bold text-violet-600 uppercase tracking-wider mb-2">Reason</p>
                          <p className="text-[12px] text-slate-700 bg-white rounded-md p-2 border border-slate-200">
                            {record.reason}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Request Info */}
                    <div className="bg-slate-50 rounded-md p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="h-3.5 w-3.5 text-violet-500" />
                        <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Request Information</span>
                      </div>
                      <div className="space-y-0">
                        <InfoRow label="Requested By" value={`${record.requested_by.first_name} ${record.requested_by.last_name}`} />
                        <InfoRow label="Requested At" value={formatDateTime(record.requested_at)} />
                        {record.approved_by && (
                          <>
                            <InfoRow label="Processed By" value={`${record.approved_by.first_name} ${record.approved_by.last_name}`} />
                            <InfoRow label="Processed At" value={formatDateTime(record.approved_at || '')} />
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="billing" className="m-0 p-6">
                  <div className="space-y-4">
                    {/* Billing Period */}
                    <div className="bg-slate-50 rounded-md p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="h-3.5 w-3.5 text-violet-500" />
                        <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Billing Period</span>
                      </div>
                      <div className="space-y-0">
                        <InfoRow label="Period" value={formatPeriod(record.billing.reading_period)} />
                        <InfoRow label="Due Date" value={formatDate(record.billing.due_date)} />
                        <InfoRow label="Billing Status" value={record.billing.billing_status} />
                      </div>
                    </div>

                    {/* Financial Summary */}
                    <div className="bg-slate-50 rounded-md p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <CircleDollarSign className="h-3.5 w-3.5 text-violet-500" />
                        <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Financial Summary</span>
                      </div>
                      <div className="space-y-0">
                        <AmountRow label="Current Bill" amount={record.billing.current_billing} />
                        {record.billing.previous_balance > 0 && (
                          <AmountRow label="Previous Balance" amount={record.billing.previous_balance} accent="red" />
                        )}
                        <AmountRow label="Total Bill" amount={record.billing.total_billing} bold />
                        <AmountRow label="Amount Paid" amount={record.original_amount} accent="green" />
                        <div className="my-2 border-t border-slate-200" />
                        <AmountRow
                          label="Remaining Balance"
                          amount={record.billing.remaining_balance}
                          bold
                          accent={record.billing.remaining_balance > 0 ? 'red' : 'green'}
                        />
                        {diff !== 0 && (
                          <>
                            <Separator className="my-2" />
                            <div className={cn(
                              'rounded-md p-2 mt-1 text-center',
                              diff > 0 ? 'bg-violet-50' : 'bg-amber-50',
                            )}>
                              <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">After Adjustment</p>
                              <p className="text-[13px] font-bold mt-1">
                                {formatPeso(Math.max(0, newRemaining))}
                              </p>
                              {newRemaining <= 0 && (
                                <p className="text-[10px] text-emerald-600 mt-1">✓ Billing will be fully paid</p>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </div>
            </Tabs>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end">
              <Button
                variant="outline"
                onClick={() => setIsOpen(false)}
                className="rounded-md h-9 text-[13px] border-slate-200"
              >
                Close
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}