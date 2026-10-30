'use client'

import { useEffect, useState } from 'react'
import { Eye, MapPin, Receipt, ReceiptText, Calendar, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
 getReconnectionDetails,
 type ReconnectionDetails,
} from '@/lib/actions/reconnection/reconnection.actions'
import { toast } from 'sonner'

const peso = (n: number) => n.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })
const formatDate = (d: string | null) =>
 d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'

const statusStyles: Record<string, string> = {
 'Pending': 'bg-amber-50 text-amber-700 border-amber-200',
 'Reconnected': 'bg-emerald-50 text-emerald-700 border-emerald-200',
 'Cancelled': 'bg-slate-100 text-slate-500 border-slate-200',
}
const paymentStatusStyles: Record<string, string> = {
 'unpaid': 'bg-rose-50 text-rose-700 border-rose-200',
 'partial': 'bg-amber-50 text-amber-700 border-amber-200',
 'paid': 'bg-emerald-50 text-emerald-700 border-emerald-200',
 'forwarded': 'bg-violet-50 text-violet-700 border-violet-200',
}

export interface ViewReconnectionDetailsDialogProps {
 reconnectionId: string | null
 onOpenChange: (open: boolean) => void
}

export function ViewReconnectionDetailsDialog({
 reconnectionId,
 onOpenChange,
}: ViewReconnectionDetailsDialogProps) {
 const [loading, setLoading] = useState(false)
 const [details, setDetails] = useState<ReconnectionDetails | null>(null)

 const open = !!reconnectionId

 useEffect(() => {
 if (!reconnectionId) {
 setDetails(null)
 return
 }
 let cancelled = false
 setLoading(true)
 getReconnectionDetails(reconnectionId).then((res) => {
 if (cancelled) return
 if (res.success && res.data) {
 setDetails(res.data)
 } else {
 toast.error(res.error ?? 'Failed to load details')
 onOpenChange(false)
 }
 setLoading(false)
 })
 return () => { cancelled = true }
 }, [reconnectionId]) // eslint-disable-line react-hooks/exhaustive-deps

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="w-full sm:max-w-md p-0 gap-0 border border-slate-200 bg-white rounded-md overflow-hidden max-h-[85vh] flex flex-col">
 {/* Header */}
 <div className="relative px-6 pt-7 pb-6 bg-gradient-to-br from-violet-600 via-violet-600 to-purple-700 overflow-hidden">
 <div className="absolute -top-10 -right-10 h-32 w-32 rounded-md bg-white/10" />
 <div className="absolute -bottom-14 -left-6 h-28 w-28 rounded-md bg-white/5" />

 <div className="relative flex items-center gap-1.5 mb-2">
 <Eye className="h-3 w-3 text-violet-200" />
 <p className="text-[10px] font-bold text-violet-200 uppercase tracking-widest">
 Reconnection Details
 </p>
 </div>
 <DialogTitle className="relative text-[20px] font-bold text-white leading-tight font-mono tracking-tight">
 {loading ? '—' : details?.reconnection_no ?? '—'}
 </DialogTitle>
 {details && (
 <span
 className={cn(
 'relative inline-flex items-center gap-1.5 px-2.5 py-1 mt-3 rounded-md text-[10px] font-semibold border bg-white/95 backdrop-blur-sm',
 details.reconnection_status_name === 'Reconnected' && 'text-emerald-700 border-emerald-200',
 details.reconnection_status_name === 'Pending' && 'text-amber-700 border-amber-200',
 details.reconnection_status_name === 'Cancelled' && 'text-slate-500 border-slate-200',
 )}
 >
 <span className="h-1.5 w-1.5 rounded-md bg-current" />
 {details.reconnection_status_name}
 </span>
 )}
 </div>

 {/* Body */}
 <div className="px-6 py-5 space-y-5 overflow-y-auto bg-gradient-to-b from-violet-50/40 to-white">
 {loading && (
 <div className="space-y-3">
 {[...Array(4)].map((_, i) => (
 <div key={i} className="h-4 w-full bg-violet-100/70 animate-pulse rounded-md" />
 ))}
 </div>
 )}

 {!loading && details && (
 <>
 {/* Consumer */}
 <div className="rounded-md border border-violet-100 bg-white p-4">
 <p className="text-[9px] font-bold uppercase tracking-widest text-violet-500 mb-1.5">Consumer</p>
 <p className="text-[14px] font-semibold text-slate-800">{details.consumer_name}</p>
 <p className="text-[11px] font-mono text-slate-500 mt-0.5">{details.meter_serial_no}</p>
 <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 mt-1.5">
 <MapPin className="h-2.5 w-2.5 shrink-0 text-violet-400" />
 {details.zone_name}, {details.barangay_name}
 </span>
 </div>

 {/* Meta grid */}
 <div className="grid grid-cols-2 gap-2.5">
 <div className="rounded-md border border-violet-100 bg-white p-3">
 <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-violet-500 mb-1">
 <Calendar className="h-2.5 w-2.5" /> Requested
 </p>
 <p className="text-[12px] font-medium text-slate-700">{formatDate(details.requested_date)}</p>
 </div>
 <div className="rounded-md border border-violet-100 bg-white p-3">
 <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-violet-500 mb-1">
 <Zap className="h-2.5 w-2.5" /> Disconnected
 </p>
 <p className="text-[12px] font-medium text-slate-700">{formatDate(details.disconnected_at)}</p>
 </div>
 <div className="rounded-md border border-violet-100 bg-white p-3">
 <p className="text-[9px] font-bold uppercase tracking-widest text-violet-500 mb-1">Type</p>
 <p className="text-[12px] font-medium text-slate-700">{details.is_voluntary ? 'Voluntary' : 'Involuntary'}</p>
 </div>
 <div className="rounded-md border border-violet-100 bg-white p-3">
 <p className="text-[9px] font-bold uppercase tracking-widest text-violet-500 mb-1">Created</p>
 <p className="text-[12px] font-medium text-slate-700">{formatDate(details.created_at)}</p>
 </div>
 </div>

 {/* Charges */}
 <div>
 <p className="text-[9px] font-bold uppercase tracking-widest text-violet-500 mb-2">Charges</p>
 <div className="rounded-md border border-violet-100 bg-white divide-y divide-violet-50 overflow-hidden">
 <div className="flex items-center justify-between px-4 py-2.5">
 <span className="text-[12px] text-slate-600">Outstanding balance</span>
 <span className="text-[12px] font-medium text-slate-700">{peso(details.outstanding_balance)}</span>
 </div>
 {details.charges.map((c) => (
 <div key={c.reconnection_charge_id} className="flex items-center justify-between px-4 py-2.5">
 <span className="text-[12px] text-slate-600">{c.charge_name}</span>
 <span className="text-[12px] font-medium text-slate-700">{peso(c.amount)}</span>
 </div>
 ))}
 <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-50 to-purple-50">
 <span className="text-[12px] font-semibold text-violet-900">Total</span>
 <span className="text-[13px] font-bold text-violet-900">{peso(details.total_amount)}</span>
 </div>
 </div>
 </div>

 {/* Payment status + remaining */}
 <div className="flex items-center justify-between rounded-md border border-violet-100 bg-white p-4">
 <div>
 <p className="text-[9px] font-bold uppercase tracking-widest text-violet-500 mb-1.5">Payment Status</p>
 <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold border', paymentStatusStyles[details.payment_status_name] ?? 'bg-slate-50 text-slate-400 border-slate-200')}>
 {details.payment_status_name.charAt(0).toUpperCase() + details.payment_status_name.slice(1)}
 </span>
 </div>
 <div className="text-right">
 <p className="text-[9px] font-bold uppercase tracking-widest text-violet-500 mb-1.5">Remaining</p>
 <p className="text-[15px] font-bold text-violet-900">{peso(details.remaining_balance)}</p>
 </div>
 </div>

 {/* Payment history */}
 <div>
 <p className="text-[9px] font-bold uppercase tracking-widest text-violet-500 mb-2">Payment History</p>
 {details.payments.length === 0 ? (
 <div className="flex items-center gap-2 px-4 py-4 rounded-md border border-dashed border-violet-200 bg-violet-50/40 text-[11px] text-violet-400">
 <ReceiptText className="h-3.5 w-3.5" /> No payments recorded yet
 </div>
 ) : (
 <div className="rounded-md border border-violet-100 bg-white divide-y divide-violet-50 overflow-hidden">
 {details.payments.map((p) => (
 <div key={p.reconnection_payment_id} className="flex items-center justify-between px-4 py-2.5">
 <div className="flex items-center gap-2.5">
 <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-50">
 <Receipt className="h-3.5 w-3.5 text-violet-500" />
 </div>
 <div>
 <p className="text-[11.5px] font-mono font-medium text-slate-700">{p.receipt_number}</p>
 <p className="text-[10px] text-slate-400">{formatDate(p.payment_date)}</p>
 </div>
 </div>
 <span className="text-[12px] font-semibold text-emerald-600">{peso(p.amount_paid)}</span>
 </div>
 ))}
 </div>
 )}
 </div>
 </>
 )}
 </div>
 </DialogContent>
 </Dialog>
 )
}