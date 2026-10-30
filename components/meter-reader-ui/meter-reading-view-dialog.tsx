'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  User, MapPin, Gauge, Calendar, Hash, TrendingUp, Clock,
  CheckCircle2, AlertTriangle, Building2, Wrench,
} from 'lucide-react'
import { getReadingConsumerByMeterAccount } from '@/lib/actions/meter-reading/meter-reading.actions'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MeterReadingViewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  readingPeriodId: string
  meterAccountId: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const numFmt = new Intl.NumberFormat('en-PH')
const dateFmt = new Intl.DateTimeFormat('en-US', {
  year: 'numeric', month: 'long', day: 'numeric',
})
const timeFmt = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit', minute: '2-digit', hour12: true,
})

function fmtNum(n: number) { return numFmt.format(n) }
function fmtDate(iso: string) { return dateFmt.format(new Date(iso)) }
function fmtTime(iso: string) { return timeFmt.format(new Date(iso)) }

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-b-0">
      <span className="text-[11px] text-slate-500">{label}</span>
      <span className={cn('text-[12px] font-medium text-slate-800 text-right', mono && 'font-mono')}>{value}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: boolean | null }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
        <Clock className="h-3 w-3" />
        Pending
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
      <CheckCircle2 className="h-3 w-3" />
      Recorded
    </span>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MeterReadingViewDialog({
  open,
  onOpenChange,
  readingPeriodId,
  meterAccountId,
}: MeterReadingViewDialogProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    if (!open || !readingPeriodId || !meterAccountId) return

    const fetchData = async () => {
      setIsLoading(true)
      try {
        const result = await getReadingConsumerByMeterAccount(meterAccountId, readingPeriodId)
        if (result) {
          setData(result)
        } else {
          toast.error('Failed to load reading data')
          onOpenChange(false)
        }
      } catch {
        toast.error('An unexpected error occurred')
        onOpenChange(false)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [open, readingPeriodId, meterAccountId, onOpenChange])

  const consumerName = data?.account_name || ''

  const consumption = data?.present_reading !== null && data?.present_reading !== undefined
    ? data.present_reading - data.previous_reading
    : null

  const isRecorded = data?.reading_status_code === 'RECORDED'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-md flex flex-col p-0 gap-0 border-l border-slate-200 bg-white rounded-md max-h-[90vh]">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-md bg-violet-100 border border-violet-200 flex items-center justify-center shrink-0">
                <Gauge className="h-4 w-4 text-violet-600" />
              </div>
              <div>
                <DialogTitle className="text-[14px] font-bold text-slate-900 leading-tight">
                  Meter Reading Details
                </DialogTitle>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {data?.meter_serial_no || 'Loading...'}
                </p>
              </div>
            </div>
            {data && <StatusBadge status={data.reading_status_code === 'RECORDED'} />}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {isLoading ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
            </div>
          ) : data ? (
            <>
              {/* Consumer Info */}
              <div className="bg-slate-50 rounded-md p-3">
                <div className="flex items-center gap-2 mb-2">
                  <User className="h-3.5 w-3.5 text-violet-500" />
                  <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Consumer</span>
                </div>
                <div className="space-y-0">
                  <InfoRow label="Name" value={consumerName} />
                  <InfoRow label="Serial No." value={data.meter_serial_no} mono />
                  <InfoRow label="Classification" value={data.classification_name} />
                </div>
              </div>

              {/* Location Info */}
              <div className="bg-slate-50 rounded-md p-3">
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="h-3.5 w-3.5 text-violet-500" />
                  <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Location</span>
                </div>
                <div className="space-y-0">
                  <InfoRow label="Barangay" value={data.barangay_name} />
                  <InfoRow label="Zone" value={`Zone ${data.zone_name}`} />
                </div>
              </div>

              {/* Meter Info */}
              <div className="bg-slate-50 rounded-md p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Wrench className="h-3.5 w-3.5 text-violet-500" />
                  <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Meter</span>
                </div>
                <div className="space-y-0">
                  <InfoRow 
                    label="Meter Serial No." 
                    value={data.meter_serial_no || '—'} 
                    mono 
                  />
                  {data.meter_id && (
                    <InfoRow label="Meter ID" value={data.meter_id} mono />
                  )}
                </div>
              </div>

              <Separator />

              {/* Reading Values */}
              <div className="bg-slate-50 rounded-md p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Gauge className="h-3.5 w-3.5 text-violet-500" />
                  <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Reading Values</span>
                </div>
                <div className="space-y-0">
                  <InfoRow label="Previous Reading" value={`${fmtNum(data.previous_reading)} m³`} />
                  <InfoRow 
                    label="Present Reading" 
                    value={data.present_reading !== null ? `${fmtNum(data.present_reading)} m³` : '—'}
                    mono={data.present_reading !== null}
                  />
                  {consumption !== null && (
                    <div className="flex items-center justify-between py-2 border-b border-slate-100">
                      <span className="text-[11px] text-slate-500">Consumption</span>
                      <div className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3 text-emerald-500" />
                        <span className="text-[12px] font-semibold text-emerald-700">
                          {fmtNum(consumption)} m³
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Reading Date */}
              {data.reading_date && (
                <div className="bg-slate-50 rounded-md p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="h-3.5 w-3.5 text-violet-500" />
                    <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Recorded On</span>
                  </div>
                  <div className="space-y-0">
                    <InfoRow label="Date" value={fmtDate(data.reading_date)} />
                    <InfoRow label="Time" value={fmtTime(data.reading_date)} />
                  </div>
                </div>
              )}

              {/* Period Info */}
              {data.period_start && data.period_end && (
                <div className="bg-slate-50 rounded-md p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="h-3.5 w-3.5 text-violet-500" />
                    <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Reading Period</span>
                  </div>
                  <div className="space-y-0">
                    <InfoRow 
                      label="Period Start" 
                      value={fmtDate(data.period_start)} 
                    />
                    <InfoRow 
                      label="Period End" 
                      value={fmtDate(data.period_end)} 
                    />
                    {data.due_date && (
                      <InfoRow 
                        label="Due Date" 
                        value={fmtDate(data.due_date)} 
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Adjustment Status */}
              {!isRecorded && data.present_reading !== null && (
                <div className="bg-amber-50 rounded-md p-3 border border-amber-200">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                    <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider">Pending Adjustment</span>
                  </div>
                  <p className="text-[11px] text-amber-700 mt-1.5">
                    A adjustment request has been submitted for this reading. It is awaiting admin approval.
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-slate-500">Failed to load reading data</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-md h-9 text-[13px] border-slate-200"
          >
            Close
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  )
}