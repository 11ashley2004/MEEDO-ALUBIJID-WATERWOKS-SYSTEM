'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertTriangle, Droplets, Gauge, MapPin, User, Calendar, Hash, Layers,
  CircleDollarSign, ClipboardList, CreditCard, Receipt, CheckCircle2, Loader2, FileText, Eye,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getBillingById, getPaymentsByBillingId, type PaymentTransaction } from '@/lib/actions/billing/billing.actions'
import { toast } from 'sonner'

function peso(n: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n)
}

function formatDate(d: string): string {
  if (!d) return '—'
  const date = new Date(d)
  const adjusted = d.length === 10
    ? new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    : date
  return adjusted.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function formatPeriod(periodStart: string): string {
  if (!periodStart) return '—'
  const [y, m] = periodStart.split('-').map(Number)
  const date = new Date(y, m - 1)
  const last = new Date(y, m, 0).getDate()
  return `${date.toLocaleDateString('en-US', { month: 'long' })} 1–${last}, ${y}`
}

function getStatusConfig(status: string) {
  switch (status.toLowerCase()) {
    case 'paid':      return { className: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' }
    case 'partial':   return { className: 'bg-sky-50 text-sky-700 border-sky-200', dot: 'bg-sky-500' }
    case 'forwarded': return { className: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'bg-violet-500' }
    default:          return { className: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' }
  }
}

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-slate-100 last:border-b-0">
      <span className="text-[11px] text-slate-500 shrink-0">{label}</span>
      <span className={cn('text-[12px] font-medium text-slate-800 text-right break-all', mono && 'font-mono')}>{value}</span>
    </div>
  )
}

function AmountRow({
  label, amount, sub, bold, accent,
}: {
  label: string; amount: number; sub?: string; bold?: boolean; accent?: 'red' | 'green'
}) {
  const color = accent === 'red'
    ? 'text-rose-600'
    : accent === 'green'
      ? 'text-emerald-700'
      : ''
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-slate-100 last:border-b-0">
      <div className="min-w-0">
        <span className={cn('text-[12px]', bold ? 'font-semibold text-slate-800' : 'text-slate-600')}>{label}</span>
        {sub && <span className="ml-1.5 text-[10px] text-slate-400">{sub}</span>}
      </div>
      <span className={cn('text-[13px] tabular-nums shrink-0', bold && 'font-bold', color)}>
        {peso(amount)}
      </span>
    </div>
  )
}

interface BillingViewDialogProps {
  billingId: string
  onSuccess?: () => void
  children: React.ReactNode
}

export function BillingViewDialog({ billingId, onSuccess, children }: BillingViewDialogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [record, setRecord] = useState<any>(null)
  const [payments, setPayments] = useState<PaymentTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('details')
  const [paymentCount, setPaymentCount] = useState<number | null>(null)

  // Fetch data when dialog opens
  useEffect(() => {
    if (!isOpen || !billingId) {
      setRecord(null)
      setPayments([])
      setPaymentCount(null)
      setActiveTab('details')
      return
    }

    const fetchData = async () => {
      setLoading(true)
      try {
        const billingRes = await getBillingById(billingId)
        if (billingRes.status === 'success' && billingRes.data) {
          setRecord(billingRes.data)
        } else {
          toast.error('Failed to load billing details')
          setIsOpen(false)
          return
        }

        const paymentsRes = await getPaymentsByBillingId(billingId)
        if (paymentsRes.status === 'success') {
          setPayments(paymentsRes.data ?? [])
          setPaymentCount(paymentsRes.data?.length ?? 0)
        }
      } catch (error) {
        console.error('Error fetching billing data:', error)
        toast.error('Failed to load billing data')
        setIsOpen(false)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [billingId, isOpen])

  const totalPaid = payments.reduce((sum, p) => sum + p.amount_paid, 0)
  const isFullyPaid = record?.remaining_balance === 0
  const statusCfg = record ? getStatusConfig(record.billing_status.billing_status_name) : { className: '', dot: '' }
  const fullName = record?.meter_account?.consumer?.account_name || ''

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>

      <DialogContent className="p-0 gap-0 sm:max-w-3xl w-full flex flex-col max-h-[90vh] overflow-hidden rounded-md border border-slate-200 bg-white">

        {/* Header — fixed, solid violet with a border to match the rest of the app */}
        <div className="relative px-6 pt-6 pb-5 bg-violet-700 border-b border-violet-800 shrink-0 overflow-hidden">
          <div className="absolute -top-10 -right-10 h-32 w-32 rounded-md border border-white/10" />
          <div className="absolute -bottom-14 -left-6 h-28 w-28 rounded-md border border-white/5" />

          <div className="relative flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-md bg-violet-800 border border-white/20 flex items-center justify-center shrink-0">
                <Receipt className="h-4 w-4 text-white" />
              </div>
              <div>
                <DialogTitle className="text-[14px] font-bold text-white leading-tight">
                  {loading ? 'Loading...' : fullName}
                </DialogTitle>
                {!loading && record && (
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <p className="text-[11px] text-violet-200 font-mono">
                      {record.meter_serial_no || record.meter_account.meter_serial_no || '—'}
                    </p>
                    {record.meter_issue_status && (
                      <span 
                        className={cn(
                          'inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold',
                          record.meter_issue_status.issue_code === 'DM' && 'bg-amber-500/20 text-amber-200 border border-amber-500/30',
                          record.meter_issue_status.issue_code === 'SM' && 'bg-red-500/20 text-red-200 border border-red-500/30',
                          record.meter_issue_status.issue_code === 'WAM' && 'bg-sky-500/20 text-sky-200 border border-sky-500/30'
                        )}
                        title={record.meter_issue_status.issue_type_name}
                      >
                        ({record.meter_issue_status.issue_code})
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
            {!loading && record && (
              <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                {/* REMOVED: Metered/Non-Metered badge - no longer needed */}
                <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold border bg-white', statusCfg.className)}>
                  <span className={cn('h-1.5 w-1.5 rounded-md', statusCfg.dot)} />
                  {record.billing_status.billing_status_name}
                </span>
                {record.was_overdue && record.penalty_amount > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-white text-rose-700 border border-rose-200">
                    <AlertTriangle className="h-3 w-3" /> Overdue
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">

          {/* Tab bar */}
          <TabsList className="w-full justify-start rounded-none border-b border-slate-100 bg-violet-50/40 px-6 h-auto shrink-0 gap-0">
            <TabsTrigger
              value="details"
              className="data-[state=active]:border-b-2 data-[state=active]:border-violet-600 data-[state=active]:text-violet-700 gap-2 text-[12px] font-medium rounded-none px-4 py-2.5"
            >
              <FileText className="h-3.5 w-3.5" />
              Bill Details
            </TabsTrigger>
            <TabsTrigger
              value="transactions"
              className="data-[state=active]:border-b-2 data-[state=active]:border-violet-600 data-[state=active]:text-violet-700 gap-2 text-[12px] font-medium rounded-none px-4 py-2.5"
            >
              <CreditCard className="h-3.5 w-3.5" />
              Transactions
              {paymentCount !== null && paymentCount > 0 && (
                <span className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-md bg-violet-100 text-violet-700 text-[10px] font-bold ml-1">
                  {paymentCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Scrollable content area */}
          <div className="flex-1 overflow-y-auto min-h-0 bg-white">
            <TabsContent value="details" className="m-0 p-6">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
                </div>
              ) : record && (
                <BillDetailsContent record={record} />
              )}
            </TabsContent>

            <TabsContent value="transactions" className="m-0 p-6">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
                </div>
              ) : record && (
                <TransactionsContent
                  payments={payments}
                  totalBilling={record.total_billing}
                  remainingBalance={record.remaining_balance}
                  totalPaid={totalPaid}
                  isFullyPaid={isFullyPaid}
                />
              )}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function BillDetailsContent({ record }: { record: any }) {
  const cons = record.consumption
  const meterAccount = record.meter_account
  const zone = meterAccount.zone
  const periodStart = record.period_start || ''
  const dueDate = record.due_date || ''

  const fullName = meterAccount.consumer.account_name || ''

  const penaltyAmount = record.penalty_amount || 0

  return (
    <div className="space-y-5">

      {/* Consumer + Location */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-slate-50 rounded-md border border-slate-100 overflow-hidden">
          <div className="px-4 py-2.5 bg-violet-50 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-violet-500" />
              <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Consumer</span>
            </div>
          </div>
          <div className="p-3 space-y-0">
            <InfoRow label="Account Name" value={fullName} />
            <InfoRow
              label="Serial No."
              value={record.meter_serial_no || meterAccount.meter_serial_no || '—'}
              mono
            />
            {record.meter_issue_status && (
              <InfoRow 
                label="Meter Status" 
                value={
                  <span className={cn(
                    'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold',
                    record.meter_issue_status.issue_code === 'DM' && 'bg-amber-100 text-amber-700',
                    record.meter_issue_status.issue_code === 'SM' && 'bg-red-100 text-red-700',
                    record.meter_issue_status.issue_code === 'WAM' && 'bg-sky-100 text-sky-700'
                  )}>
                    {record.meter_issue_status.issue_type_name}
                  </span>
                } 
              />
            )}
            <InfoRow label="Classification" value={meterAccount.classification.classification_name} />
          </div>
        </div>

        <div className="bg-slate-50 rounded-md border border-slate-100 overflow-hidden">
          <div className="px-4 py-2.5 bg-violet-50 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-violet-500" />
              <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Location</span>
            </div>
          </div>
          <div className="p-3 space-y-0">
            <InfoRow label="Barangay" value={zone.barangay.barangay_name} />
            <InfoRow label="Zone" value={`Zone ${zone.zone_name}`} />
          </div>
        </div>
      </div>

      {/* Billing Period */}
      <div className="bg-slate-50 rounded-md border border-slate-100 overflow-hidden">
        <div className="px-4 py-2.5 bg-violet-50 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-violet-500" />
            <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Billing Period</span>
          </div>
        </div>
        <div className="p-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <InfoRow label="Period" value={periodStart ? formatPeriod(periodStart) : '—'} />
            <InfoRow label="Due Date" value={dueDate ? formatDate(dueDate) : '—'} />
            {record.reading && (
              <InfoRow label="Read Date" value={formatDate(record.reading.reading_date)} />
            )}
          </div>
        </div>
      </div>

      {/* Consumption */}
      <div className="bg-slate-50 rounded-md border border-slate-100 overflow-hidden">
        <div className="px-4 py-2.5 bg-violet-50 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Hash className="h-3.5 w-3.5 text-violet-500" />
            <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Consumption</span>
          </div>
        </div>
        <div className="p-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: 'Previous (m³)', value: cons.previous_reading.toFixed(2) },
              { label: 'Present (m³)',  value: cons.present_reading.toFixed(2) },
              { label: 'Consumed (m³)', value: cons.consumption.toFixed(2) },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-md bg-white border border-slate-200 px-3 py-2.5 text-center">
                <p className="text-[10px] text-slate-400 mb-1">{label}</p>
                <p className="text-[13px] font-bold tabular-nums font-mono text-slate-800">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Rate Breakdown */}
      <div className="bg-slate-50 rounded-md border border-slate-100 overflow-hidden">
        <div className="px-4 py-2.5 bg-violet-50 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Layers className="h-3.5 w-3.5 text-violet-500" />
            <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Rate Breakdown</span>
          </div>
        </div>
        <div className="p-3">
          <div className="overflow-x-auto rounded-md border border-slate-100">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Bracket</th>
                  <th className="text-center px-3 py-2 font-semibold text-slate-600">Units (m³)</th>
                  <th className="text-center px-3 py-2 font-semibold text-slate-600">Rate</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-600">Amount</th>
                </tr>
              </thead>
              <tbody>
                {record.breakdowns.map((tier: any) => {
                  const label = tier.max_consumption === null
                    ? `${tier.min_consumption} m³ and above`
                    : `${tier.min_consumption} – ${tier.max_consumption} m³`
                  return (
                    <tr key={tier.community_charge_id} className={cn('border-t border-slate-100', !tier.reached && 'opacity-40')}>
                      <td className="px-3 py-1.5 text-slate-600">{label}</td>
                      <td className="px-3 py-1.5 text-center tabular-nums font-mono text-slate-600">
                        {tier.reached ? tier.units_used.toFixed(2) : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-center tabular-nums font-mono text-slate-600">{peso(tier.rate_per_unit)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-mono font-medium text-slate-800">
                        {tier.reached ? peso(tier.subtotal) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Amount Summary */}
      <div className="bg-slate-50 rounded-md border border-slate-100 overflow-hidden">
        <div className="px-4 py-2.5 bg-violet-50 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <CircleDollarSign className="h-3.5 w-3.5 text-violet-500" />
            <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Amount Summary</span>
          </div>
        </div>
        <div className="p-3">
          <div className="space-y-0">
            <AmountRow label="Current Bill" amount={record.current_billing} />
            {record.meter_charge > 0 && (
              <AmountRow label="Meter Installment" amount={record.meter_charge} sub="(monthly charge)" />
            )}
            {record.previous_balance > 0 && (
              <AmountRow label="Overdue Account" amount={record.previous_balance} sub="(previous unpaid)" accent="red" />
            )}
            {record.penalty_amount > 0 && (
              <AmountRow label="Penalty (2%)" amount={record.penalty_amount} sub="(overdue charge)" accent="red" />
            )}
            <div className="my-2 border-t border-slate-200" />
            <AmountRow label="Total Bill" amount={record.total_billing} bold />
            <AmountRow
              label="Remaining Balance"
              amount={record.remaining_balance}
              bold
              accent={record.remaining_balance > 0 ? 'red' : 'green'}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function TransactionsContent({
  payments,
  totalBilling,
  remainingBalance,
  totalPaid,
  isFullyPaid,
}: {
  payments: PaymentTransaction[]
  totalBilling: number
  remainingBalance: number
  totalPaid: number
  isFullyPaid: boolean
}) {
  if (payments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="h-12 w-12 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center">
          <Receipt className="h-5 w-5 text-slate-400" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-600">No payments recorded</p>
          <p className="text-xs text-slate-400 mt-0.5">This bill has not been paid yet.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-md border border-slate-200 p-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Total Billing</p>
          <p className="text-[15px] font-bold tabular-nums text-slate-800">{peso(totalBilling)}</p>
        </div>
        <div className="bg-emerald-50 rounded-md border border-emerald-200 p-3">
          <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider mb-1">Amount Paid</p>
          <p className="text-[15px] font-bold tabular-nums text-emerald-700">{peso(totalPaid)}</p>
        </div>
        <div className={cn(
          'rounded-md border p-3',
          isFullyPaid ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
        )}>
          <p className={cn(
            'text-[10px] font-semibold uppercase tracking-wider mb-1',
            isFullyPaid ? 'text-emerald-700' : 'text-amber-700'
          )}>
            Balance
          </p>
          <p className={cn(
            'text-[15px] font-bold tabular-nums',
            isFullyPaid ? 'text-emerald-700' : 'text-amber-700'
          )}>
            {isFullyPaid ? (
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />0
              </span>
            ) : (
              peso(remainingBalance)
            )}
          </p>
        </div>
      </div>

      {/* Payment list */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2.5">
          {payments.length} Payment{payments.length !== 1 ? 's' : ''}
        </p>
        <div className="space-y-2">
          {payments.map((p, idx) => (
            <div
              key={p.payment_id}
              className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-4 py-3 hover:bg-violet-50/40 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 rounded-md bg-violet-100 border border-violet-200 flex items-center justify-center shrink-0">
                  <span className="text-[11px] font-bold text-violet-700">{idx + 1}</span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-semibold text-slate-800">{peso(p.amount_paid)}</span>
                    <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md">
                      {p.receipt_number}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">{formatDate(p.payment_date)}</p>
                  <p className="text-[10px] text-slate-400">
                    Received by <span className="font-medium text-slate-600">{p.received_by}</span>
                  </p>
                </div>
              </div>
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 opacity-70" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}