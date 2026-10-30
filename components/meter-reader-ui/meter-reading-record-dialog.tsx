'use client'

import { useState, useEffect } from 'react'
import { AlertCircle, CheckCircle2, Gauge, TrendingUp } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { submitMeterReading, getReadingConsumerByMeterAccount } from '@/lib/actions/meter-reading/meter-reading.actions'
import { cn } from '@/lib/utils'

const fmt = {
  date: (iso: string) => new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }),
  num:  (n: number)   => n.toLocaleString('en-PH'),
}

export interface MeterReadingRecordDialogProps {
  meterAccountId:   string
  readingPeriodId:  string
  onSuccess?:       () => void
  children:         React.ReactNode
  isPeriodActive?:  boolean
}

export function MeterReadingRecordDialog({
  meterAccountId,
  readingPeriodId,
  onSuccess,
  children,
  isPeriodActive = true,
}: MeterReadingRecordDialogProps) {
  const [isOpen,       setIsOpen]       = useState(false)
  const [isLoading,    setIsLoading]    = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [consumer,     setConsumer]     = useState<any>(null)
  const [presentReading, setPresentReading] = useState('')
  const [inputError,   setInputError]   = useState('')

  useEffect(() => {
    if (!isOpen || !meterAccountId) return
    const fetch = async () => {
      setIsLoading(true)
      try {
        const data = await getReadingConsumerByMeterAccount(meterAccountId, readingPeriodId)
        setConsumer(data)
        setPresentReading(data?.present_reading?.toString() ?? '')
      } catch {
        toast.error('Failed to load consumer data')
        setIsOpen(false)
      } finally {
        setIsLoading(false)
      }
    }
    fetch()
  }, [isOpen, meterAccountId, readingPeriodId])

  useEffect(() => {
    if (!isOpen) { setConsumer(null); setPresentReading(''); setInputError('') }
  }, [isOpen])

  const handleSubmit = async () => {
    if (!consumer) return
    if (!isPeriodActive) { toast.error('Reading window is not open'); return }
    if (!presentReading.trim()) { setInputError('Please enter a reading value.'); return }
    const num = parseFloat(presentReading)
    if (isNaN(num) || num < 0) { setInputError('Reading must be a positive number.'); return }

    setIsSubmitting(true)
    try {
      const result = await submitMeterReading({ 
        meter_account_id: meterAccountId, 
        present_reading: num, 
        reading_period_id: readingPeriodId,
      })
      console.log("Result: ", result)
      if (result.status === 'success') {
        const d = result.data as any
        toast.success('Reading recorded')
        setIsOpen(false)
        onSuccess?.()
      } else {
        toast.error(result.message ?? 'Failed to submit reading')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  const estimatedConsumption =
    presentReading && !isNaN(parseFloat(presentReading)) && consumer
      ? Math.max(0, parseFloat(presentReading) - consumer.previous_reading)
      : null

  const isRecorded = consumer?.reading_status_code === 'RECORDED'
  const isDisabled = !isPeriodActive

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>

      <DialogContent className="w-full sm:max-w-md flex flex-col p-0 gap-0 border-l border-slate-200 bg-white rounded-md">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-violet-100 border border-violet-200 flex items-center justify-center shrink-0">
              <Gauge className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <DialogTitle className="text-[14px] font-bold text-slate-900 leading-tight">
                {isRecorded ? 'View Reading' : 'Record Reading'}
              </DialogTitle>
              <DialogDescription className="text-[11px] text-slate-400 mt-0.5">
                {consumer?.period_start
                  ? `Period: ${new Date(consumer.period_start).toLocaleDateString('en-PH', { year: 'numeric', month: 'long' })}`
                  : 'Enter the present meter reading'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <Skeleton className="h-24 w-full rounded-md" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        ) : consumer && (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

            {!isPeriodActive && consumer?.period_start && (
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-md bg-amber-50 border border-amber-200">
                <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[12px] font-semibold text-amber-800">Reading Window Not Open</p>
                  <p className="text-[11px] text-amber-700 mt-0.5">
                    Opens on the first Monday of each month.
                  </p>
                </div>
              </div>
            )}

            {/* Consumer info */}
            <div className="p-3 rounded-md bg-slate-50 border border-slate-100 space-y-2 text-[12px]">
              <div className="flex justify-between">
                <span className="text-slate-500">Consumer</span>
                <span className="font-medium text-slate-800">{consumer.account_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Serial No.</span>
                <span className="font-mono font-medium text-slate-700">{consumer.meter_serial_no}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Zone</span>
                <span className="text-slate-700">{consumer.zone_name} – {consumer.barangay_name}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 mt-1">
                <span className="text-slate-500">Previous Reading</span>
                <span className="font-semibold tabular-nums text-slate-800">{fmt.num(consumer.previous_reading)} m³</span>
              </div>
              {isRecorded && consumer.present_reading !== null && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Recorded</span>
                  <span className="font-medium tabular-nums text-emerald-700">
                    {fmt.num(consumer.present_reading)} m³
                    {consumer.reading_date && (
                      <span className="text-slate-400 font-normal ml-1 text-[10px]">({fmt.date(consumer.reading_date)})</span>
                    )}
                  </span>
                </div>
              )}
            </div>

            {/* Input — hidden once already recorded */}
            {!isRecorded && (
              <div className="space-y-1.5">
                <Label htmlFor="present-reading" className="text-[11px] font-semibold text-slate-700">
                  Present Reading <span className="text-rose-400">*</span>
                </Label>
                <input
                  id="present-reading"
                  type="number"
                  min={consumer.previous_reading}
                  step="0.01"
                  placeholder={`Must be ≥ ${fmt.num(consumer.previous_reading)}`}
                  value={presentReading}
                  onChange={(e) => { setPresentReading(e.target.value); if (inputError) setInputError('') }}
                  disabled={isDisabled}
                  className={cn(
                    'w-full h-9 px-3 rounded-md text-[13px] text-slate-700 bg-white border outline-none transition-all duration-150',
                    inputError
                      ? 'border-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-100'
                      : 'border-slate-200 hover:border-violet-300 focus:border-violet-400 focus:ring-2 focus:ring-violet-100',
                    isDisabled && 'bg-slate-50 text-slate-400 cursor-not-allowed',
                  )}
                  autoFocus={!isDisabled}
                />
                {inputError && (
                  <p className="text-[11px] text-rose-500 flex items-center gap-1 mt-1">
                    <AlertCircle className="h-3 w-3" />{inputError}
                  </p>
                )}
                {estimatedConsumption !== null && !isDisabled && (
                  <p className="text-[11px] text-emerald-600 flex items-center gap-1 mt-1">
                    <TrendingUp className="h-3 w-3" />
                    Estimated: <span className="font-semibold ml-0.5">{estimatedConsumption.toFixed(2)} m³</span>
                  </p>
                )}
                <p className="text-[10px] text-slate-400 mt-1.5">Saves as <span className="font-medium">RECORDED</span></p>
              </div>
            )}
          </div>
        )}

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2.5 bg-slate-50/60">
          <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isSubmitting}
            className="rounded-md h-9 text-[13px] border-slate-200">
            Cancel
          </Button>
          {!isRecorded && (
            <Button onClick={handleSubmit} disabled={isSubmitting || isLoading || isDisabled}
              className="rounded-md h-9 text-[13px] bg-violet-600 hover:bg-violet-700 text-white gap-1.5 font-medium shadow-sm shadow-violet-200">
              {isSubmitting
                ? <><Spinner /> Saving…</>
                : <><CheckCircle2 className="h-3.5 w-3.5" /> Save Reading</>}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}