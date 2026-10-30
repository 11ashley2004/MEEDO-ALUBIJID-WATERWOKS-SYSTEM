// components/consumer-portal/billing/BillingViewDialog.tsx

'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { Badge }     from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Button }    from '@/components/ui/button'
import {
  AlertTriangle, Droplets, Gauge, MapPin, User, Calendar, Hash, Layers,
  CircleDollarSign, ClipboardList, CreditCard, Receipt, CheckCircle2,
  Loader2, FileText, Wrench, Download, AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { 
  getConsumerBillingById, 
  getPaymentsByBillingId,
  type ConsumerBillingRecord, 
  type PaymentTransaction 
} from '@/lib/actions/billing/consumer-billing.actions'
import { toast } from 'sonner'

// ─── Formatters ───────────────────────────────────────────────────────────────

function peso(n: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n)
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

function fmtPeriod(period: string) {
  const [y, m] = period.split('-').map(Number)
  const date   = new Date(y, m - 1)
  const last   = new Date(y, m, 0).getDate()
  return `${date.toLocaleDateString('en-US', { month: 'long' })} 1–${last}, ${y}`
}

function getStatusConfig(status: string) {
  switch (status.toLowerCase()) {
    case 'paid':      return { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' }
    case 'partial':   return { cls: 'bg-sky-50 text-sky-700 border-sky-200', dot: 'bg-sky-500' }
    case 'forwarded': return { cls: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'bg-violet-500' }
    default:        return { cls: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' }
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <span className={cn('text-xs font-medium text-right text-slate-700', mono && 'font-mono')}>{value}</span>
    </div>
  )
}

function SectionLabel({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-2.5">
      <Icon className="h-3.5 w-3.5 text-violet-500" />
      <span className="text-[11px] font-semibold uppercase tracking-widest text-violet-600">{title}</span>
    </div>
  )
}

function AmountRow({
  label, amount, sub, bold, accent,
}: {
  label: string; amount: number; sub?: string; bold?: boolean; accent?: 'red' | 'green'
}) {
  const color = accent === 'red'
    ? 'text-red-600'
    : accent === 'green'
      ? 'text-emerald-700'
      : ''
  return (
    <div className="flex items-baseline justify-between py-1">
      <div>
        <span className={cn('text-sm', bold ? 'font-semibold text-slate-800' : 'text-slate-600')}>{label}</span>
        {sub && <span className="ml-1.5 text-xs text-slate-400">{sub}</span>}
      </div>
      <span className={cn('text-sm tabular-nums', bold && 'font-bold', color)}>{peso(amount)}</span>
    </div>
  )
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

type TabKey = 'details' | 'transactions'

function TabBar({ active, onChange, paymentCount }: {
  active: TabKey; onChange: (t: TabKey) => void; paymentCount: number | null
}) {
  return (
    <div className="flex border-b border-slate-100 bg-slate-50/40 px-6">
      {([
        { key: 'details',      label: 'Bill Details', icon: FileText   },
        { key: 'transactions', label: 'Transactions', icon: CreditCard },
      ] as { key: TabKey; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={cn(
            'relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px',
            active === key
              ? 'border-violet-600 text-violet-700'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
          {key === 'transactions' && paymentCount !== null && paymentCount > 0 && (
            <span className={cn(
              'inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-full text-[10px] font-bold leading-none',
              active === 'transactions' ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-500',
            )}>
              {paymentCount}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

// ─── Bill Details Tab ─────────────────────────────────────────────────────────

function BillDetailsTab({ record, onDownload }: { record: ConsumerBillingRecord; onDownload: () => void }) {
  const cons   = record.consumption
  const zone   = record.meter_account?.zone
  const period = record.period_start

  const previousBalance = Number(record.previous_balance ?? 0)
  const penaltyAmount = Number(record.penalty_amount ?? 0)
  const meterCharge = Number(record.meter_charge ?? 0)
  const hasMeterCharge = meterCharge > 0
  const hasPrevBal = previousBalance > 0
  const hasPenalty = penaltyAmount > 0

  return (
    <div className="space-y-4 px-6 py-5">
      {/* Consumer & Location Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-md border border-slate-200 bg-slate-50/30">
          <div className="px-4 py-2.5 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white">
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-violet-500" />
              <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Consumer</span>
            </div>
          </div>
          <div className="p-3">
            <InfoRow label="Account Name" value={record.consumer?.account_name || 'N/A'} />
            <InfoRow label="Classification" value={record.meter_account?.classification?.classification_name || 'N/A'} />
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50/30">
          <div className="px-4 py-2.5 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white">
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-violet-500" />
              <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Location</span>
            </div>
          </div>
          <div className="p-3">
            <InfoRow label="Barangay" value={zone?.barangay?.barangay_name || 'N/A'} />
            <InfoRow label="Zone" value={zone ? `Zone ${zone.zone_name}` : 'N/A'} />
          </div>
        </div>
      </div>

      {/* Billing Period */}
      <div className="rounded-md border border-slate-200 bg-slate-50/30">
        <div className="px-4 py-2.5 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white">
          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-violet-500" />
            <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Billing Period</span>
          </div>
        </div>
        <div className="p-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <InfoRow label="Period" value={period ? fmtPeriod(period) : '—'} />
            <InfoRow label="Due Date" value={fmtDate(record.due_date)} />
            {record.reading?.reading_date && (
              <InfoRow label="Read Date" value={fmtDate(record.reading.reading_date)} />
            )}
          </div>
        </div>
      </div>

      {/* Consumption */}
      <div className="rounded-md border border-slate-200 bg-slate-50/30">
        <div className="px-4 py-2.5 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white">
          <div className="flex items-center gap-2">
            <Hash className="h-3.5 w-3.5 text-violet-500" />
            <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Consumption</span>
          </div>
        </div>
        <div className="p-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: 'Previous (m³)', value: cons.previous_reading.toFixed(2) },
              { label: 'Present (m³)',  value: cons.present_reading.toFixed(2)  },
              { label: 'Consumed (m³)', value: cons.consumption.toFixed(2)      },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-md border border-slate-200 bg-white px-3 py-2.5 text-center">
                <p className="text-[10px] text-slate-400 mb-1">{label}</p>
                <p className="text-sm font-bold tabular-nums font-mono text-slate-800">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Rate Breakdown */}
      <div className="rounded-md border border-slate-200 bg-slate-50/30 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white">
          <div className="flex items-center gap-2">
            <Layers className="h-3.5 w-3.5 text-violet-500" />
            <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Rate Breakdown</span>
          </div>
        </div>
        <div className="p-3">
          <div className="overflow-x-auto rounded-md">
            <table className="w-full text-xs">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Bracket</th>
                  <th className="text-center px-3 py-2 font-semibold text-slate-600">Units (m³)</th>
                  <th className="text-center px-3 py-2 font-semibold text-slate-600">Rate</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-600">Amount</th>
                </tr>
              </thead>
              <tbody>
                {record.breakdowns.map((tier) => {
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
      <div className="rounded-md border border-slate-200 bg-slate-50/30">
        <div className="px-4 py-2.5 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white">
          <div className="flex items-center gap-2">
            <CircleDollarSign className="h-3.5 w-3.5 text-violet-500" />
            <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Amount Summary</span>
          </div>
        </div>
        <div className="p-3">
          <div className="space-y-0">
            <AmountRow label="Current Bill" amount={record.current_billing} />

            {hasMeterCharge && (
              <div className="flex items-baseline justify-between py-1">
                <div className="flex items-center gap-2">
                  <Wrench className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="text-sm text-slate-600">Meter installment</span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
                    Active
                  </span>
                </div>
                <span className="text-sm tabular-nums text-slate-700">{peso(meterCharge)}</span>
              </div>
            )}

            {hasPrevBal && (
              <AmountRow
                label="Overdue Account"
                sub="(previous unpaid)"
                amount={previousBalance}
                accent="red"
              />
            )}

            {hasPenalty && (
              <AmountRow label="Penalty (2%)" sub="(overdue charge)" amount={penaltyAmount} accent="red" />
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

      {/* Penalty History */}
      {record.was_overdue && hasPenalty && (
        <div className="rounded-md border border-slate-200 bg-slate-50/30 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-3.5 w-3.5 text-violet-500" />
              <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Penalty History</span>
            </div>
          </div>
          <div className="p-3">
            <p className="text-xs text-slate-500 mb-2 leading-relaxed">
              A 2% penalty is applied on the overdue account each billing month until the balance is fully settled.
            </p>
            <div className="rounded-md border border-slate-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-slate-600">Description</th>
                    <th className="text-right px-3 py-2 font-semibold text-slate-600">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-slate-100">
                    <td className="px-3 py-1.5 text-slate-600">Total accumulated penalties</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-mono font-semibold text-red-600">
                      {peso(record.penalty_amount)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <Button
        variant="outline"
        className="w-full mt-2 gap-2 rounded-md border-slate-300 bg-white hover:bg-violet-50 hover:text-violet-600 hover:border-violet-300"
        onClick={onDownload}
      >
        <Download className="h-4 w-4" />
        Download water bill
      </Button>
    </div>
  )
}

// ─── Transactions Tab ─────────────────────────────────────────────────────────

function TransactionsTab({ billingId, totalBilling, remainingBalance, onCountReady }: {
  billingId:        string
  totalBilling:     number
  remainingBalance: number
  onCountReady:     (n: number) => void
}) {
  const [payments, setPayments] = useState<PaymentTransaction[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(false)

  useEffect(() => {
    setLoading(true); setError(false)
    getPaymentsByBillingId(billingId)
      .then((res) => {
        if (res.status === 'success') {
          setPayments(res.data ?? [])
          onCountReady(res.data?.length ?? 0)
        } else { setError(true) }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [billingId, onCountReady])

  const totalPaid   = payments.reduce((s, p) => s + p.amount_paid, 0)
  const isFullyPaid = remainingBalance === 0

  if (loading) return (
    <div className="flex flex-col items-center justify-center gap-2 py-20 text-slate-500">
      <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
      <span className="text-xs">Loading transactions…</span>
    </div>
  )
  if (error) return (
    <div className="flex flex-col items-center justify-center py-16 gap-2">
      <p className="text-sm font-medium text-red-600">Failed to load payment records</p>
      <p className="text-xs text-slate-500">Please try again later.</p>
    </div>
  )
  if (payments.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="rounded-md bg-slate-100 p-4">
        <Receipt className="h-6 w-6 text-slate-400" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-slate-600">No payments recorded</p>
        <p className="text-xs text-slate-400 mt-0.5">This bill has not been paid yet.</p>
      </div>
    </div>
  )

  return (
    <div className="px-6 py-5 space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md border border-slate-200 bg-slate-50/30 px-4 py-3">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Billing</p>
          <p className="text-base font-bold tabular-nums text-slate-800">{peso(totalBilling)}</p>
        </div>
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider mb-1">Amount Paid</p>
          <p className="text-base font-bold tabular-nums text-emerald-700">{peso(totalPaid)}</p>
        </div>
        <div className={cn(
          'rounded-md border px-4 py-3',
          isFullyPaid
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-amber-50 border-amber-200',
        )}>
          <p className={cn(
            'text-[10px] font-semibold uppercase tracking-wider mb-1',
            isFullyPaid ? 'text-emerald-700' : 'text-amber-700'
          )}>
            Balance
          </p>
          <p className={cn(
            'text-base font-bold tabular-nums',
            isFullyPaid ? 'text-emerald-700' : 'text-amber-700'
          )}>
            {isFullyPaid
              ? <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Settled</span>
              : peso(remainingBalance)
            }
          </p>
        </div>
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-3">
          {payments.length} Payment{payments.length !== 1 ? 's' : ''}
        </p>
        <div className="space-y-2">
          {payments.map((p, idx) => (
            <div
              key={p.payment_id}
              className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-4 py-3 hover:bg-violet-50/30 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 rounded-md bg-violet-100 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-violet-700">{idx + 1}</span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-800">{peso(p.amount_paid)}</span>
                    <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                      {p.receipt_number}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{fmtDateTime(p.payment_date)}</p>
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

// ─── Dialog content (loaded state) ───────────────────────────────────────────

function BillingDialogContent({ billingId, onDownload }: { billingId: string; onDownload: (id: string) => void }) {
  const [record,       setRecord]       = useState<ConsumerBillingRecord | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(false)
  const [activeTab,    setActiveTab]    = useState<TabKey>('details')
  const [paymentCount, setPaymentCount] = useState<number | null>(null)

  useEffect(() => {
    setLoading(true); setError(false); setRecord(null)
    setActiveTab('details'); setPaymentCount(null)

    getConsumerBillingById(billingId)
      .then((res) => {
        if (res.status === 'success' && res.data) {
          setRecord(res.data)
        } else {
          setError(true)
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [billingId])

  const handleCountReady = useCallback((n: number) => setPaymentCount(n), [])

  const handleDownloadClick = useCallback(() => {
    if (record) {
      onDownload(record.billing_id)
    }
  }, [record, onDownload])

  if (loading) return (
    <div className="flex flex-col items-center justify-center gap-2 py-24 text-slate-500">
      <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
      <span className="text-xs">Loading billing record…</span>
    </div>
  )

  if (error || !record) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <div className="rounded-md bg-red-50 p-4">
        <AlertCircle className="h-6 w-6 text-red-500" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-slate-600">Failed to load billing record</p>
        <p className="text-xs text-slate-400 mt-0.5">Please try again later.</p>
      </div>
    </div>
  )

  const status     = record.billing_status.billing_status_name
  const scfg       = getStatusConfig(status)

  return (
    <>
      {/* Header */}
      <DialogHeader className="px-6 pt-5 pb-4 border-b border-slate-100 bg-slate-50/30 shrink-0">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <DialogTitle className="text-base font-semibold leading-tight text-slate-800">
              {record.consumer?.account_name || 'Consumer'}
            </DialogTitle>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">
              {record.meter_account?.meter_serial_no || 'N/A'}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className={cn('text-[11px] gap-1.5 rounded-md', scfg.cls)}>
              <span className={cn('h-1.5 w-1.5 rounded-full', scfg.dot)} />
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Badge>
          </div>
        </div>
      </DialogHeader>

      {/* Tab bar */}
      <TabBar active={activeTab} onChange={setActiveTab} paymentCount={paymentCount} />

      {/* Body */}
      <div className="overflow-y-auto flex-1">
        {activeTab === 'details' && (
          <BillDetailsTab record={record} onDownload={handleDownloadClick} />
        )}
        {activeTab === 'transactions' && (
          <TransactionsTab
            billingId={record.billing_id}
            totalBilling={record.total_billing}
            remainingBalance={record.remaining_balance}
            onCountReady={handleCountReady}
          />
        )}
      </div>
    </>
  )
}

// ─── Public component ─────────────────────────────────────────────────────────

interface BillingViewDialogProps {
  billingId: string
  children:  React.ReactNode
  onDownload?: (billingId: string) => void
}

export function BillingViewDialog({ billingId, children, onDownload }: BillingViewDialogProps) {
  const [open, setOpen] = useState(false)

  const handleDownload = useCallback((id: string) => {
    if (onDownload) {
      onDownload(id)
    }
  }, [onDownload])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="p-0 gap-0 sm:max-w-3xl flex flex-col max-h-[90vh] rounded-md border-l border-slate-200 bg-white">
        <VisuallyHidden>
          <DialogTitle>Billing Details</DialogTitle>
        </VisuallyHidden>
        {open && <BillingDialogContent billingId={billingId} onDownload={handleDownload} />}
      </DialogContent>
    </Dialog>
  )
}