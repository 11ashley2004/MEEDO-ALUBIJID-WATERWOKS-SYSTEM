'use client'
// admin
import { useState, useEffect, useMemo } from 'react'
import { AlertTriangle, Gauge, ImagePlus, X } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Sheet, SheetClose, SheetContent,
  SheetDescription, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { submitMeterReadingAdjustment } from '@/lib/actions/meter-reading/meter-reading-adjustment.actions'
import { getReadingConsumerByMeterAccount } from '@/lib/actions/meter-reading/meter-reading.actions'

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  adjusted_reading: z.string().min(1, 'Please enter the adjusted reading.'),
  reason:           z.string().max(500, 'Reason must not exceed 500 characters.').optional(),
})
type FormValues = z.infer<typeof schema>

// ─── Proof validation (optional for admin — only checked if a file is chosen) ─

const PROOF_MAX_SIZE   = 1 * 1024 * 1024 // 1MB
const PROOF_MIME_TYPES = ['image/png', 'image/jpeg']

function validateProof(file: File | null): string | null {
  if (!file) return null // optional — no file is fine
  if (file.size > PROOF_MAX_SIZE) return 'Proof image must be 1 MB or less.'
  if (!PROOF_MIME_TYPES.includes(file.type)) return 'Only PNG and JPG images are allowed.'
  return null
}

// ─── Props ────────────────────────────────────────────────────────────────────
//
// Supports two usage modes:
//
// 1. Uncontrolled (standalone trigger) — pass `children`, the component
//    manages its own open state via an internal SheetTrigger. Fine when
//    the trigger isn't nested inside something like a DropdownMenuItem.
//
// 2. Controlled — pass `open` + `onOpenChange` (no `children` needed).
//    The parent owns the open state entirely. Use this when the "open"
//    action has to be triggered from somewhere Radix doesn't like nesting
//    a Sheet/Dialog trigger inside — e.g. a DropdownMenuItem, where the
//    dropdown's own close/focus-return logic can race with or swallow
//    the trigger click. The parent just flips a boolean; no DOM refs,
//    no synthetic clicks, no timing games.

interface MeterReadingAdjustmentFormProps {
  readingPeriodId:  string
  meterAccountId:   string
  onSuccess?:       () => void
  children?:        React.ReactNode
  open?:            boolean
  onOpenChange?:    (open: boolean) => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const numFmt  = new Intl.NumberFormat('en-PH')
const dateFmt = new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })

function fmtNum(n: number)    { return numFmt.format(n) }
function fmtDate(iso: string) { return dateFmt.format(new Date(iso)) }

function validateReadingValue(
  value:          string,
  meter:          any,
  originalReading: number | null,
): string | null {
  const num = parseFloat(value)
  if (!value || isNaN(num) || num < 0)
    return 'Enter a valid non-negative reading.'
  if (num < meter.previous_reading)
    return `Reading cannot be less than the previous reading (${fmtNum(meter.previous_reading)} m³).`
  return null
}

function FormFieldLabel({ label, required, optional }: { label: string; required?: boolean; optional?: boolean }) {
  return (
    <label className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
      {label}
      {required && <span className="text-rose-400 text-[11px] leading-none">*</span>}
      {optional && <span className="text-slate-300 normal-case tracking-normal font-medium">(optional)</span>}
    </label>
  )
}

function FormFieldError({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <p className="flex items-center gap-1 text-[10.5px] text-rose-500 mt-1">
      <AlertTriangle className="h-3 w-3 shrink-0" />{message}
    </p>
  )
}

const fieldClassName = (err?: boolean) =>
  'w-full h-9 px-3 rounded-md text-[13px] text-slate-700 bg-white border outline-none transition-all duration-150 placeholder:text-slate-300 ' +
  (err
    ? 'border-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-100'
    : 'border-slate-200 hover:border-violet-300 focus:border-violet-400 focus:ring-2 focus:ring-violet-100')

const textareaClassName = (err?: boolean) =>
  'w-full px-3 py-2 rounded-md text-[13px] text-slate-700 bg-white border outline-none transition-all duration-150 placeholder:text-slate-300 resize-none ' +
  (err
    ? 'border-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-100'
    : 'border-slate-200 hover:border-violet-300 focus:border-violet-400 focus:ring-2 focus:ring-violet-100')

// ─── Component ────────────────────────────────────────────────────────────────

export default function MeterReadingAdjustmentForm({
  readingPeriodId,
  meterAccountId,
  onSuccess,
  children,
  open,
  onOpenChange,
}: MeterReadingAdjustmentFormProps) {
  const isControlled = open !== undefined

  const [internalOpen, setInternalOpen] = useState(false)
  const isOpen  = isControlled ? open! : internalOpen
  const setOpen = isControlled ? (onOpenChange ?? (() => {})) : setInternalOpen

  const [isLoading,     setIsLoading]     = useState(true)
  const [isSubmitting,  setIsSubmitting]  = useState(false)
  const [meter,         setMeter]         = useState<any>(null)
  const [readingError,  setReadingError]  = useState<string | null>(null)

  // Proof image state (optional for admin)
  const [proofFile,    setProofFile]    = useState<File | null>(null)
  const [proofPreview, setProofPreview] = useState<string | null>(null)
  const [proofError,   setProofError]   = useState<string | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { adjusted_reading: '', reason: '' },
  })

  const newReadingRaw = form.watch('adjusted_reading')
  const newReadingNum = parseFloat(newReadingRaw)
  const reasonValue = form.watch('reason') || ''

  const originalReading: number | null = meter?.present_reading ?? null

  // Fetch on open
  useEffect(() => {
    if (!isOpen || !readingPeriodId || !meterAccountId) return
    const fetchData = async () => {
      setIsLoading(true)
      try {
        const meterData = await getReadingConsumerByMeterAccount(meterAccountId, readingPeriodId)
        if (meterData) {
          setMeter(meterData)
          if (meterData.present_reading !== null) {
            form.reset({ adjusted_reading: String(meterData.present_reading), reason: '' })
          }
        } else {
          toast.error('Failed to load meter data')
          setOpen(false)
        }
      } catch {
        toast.error('Failed to load data')
        setOpen(false)
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, readingPeriodId, meterAccountId])

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setMeter(null)
      setReadingError(null)
      setProofFile(null)
      setProofError(null)
      if (proofPreview) URL.revokeObjectURL(proofPreview)
      setProofPreview(null)
      form.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Live validation for reading
  useEffect(() => {
    if (!meter || !newReadingRaw) { setReadingError(null); return }
    setReadingError(validateReadingValue(newReadingRaw, meter, originalReading))
  }, [newReadingRaw, meter, originalReading])

  // Consumption preview
  const consumptionPreview = useMemo(() => {
    if (!meter) return null
    const oldConsumption = originalReading !== null
      ? Math.max(0, originalReading - meter.previous_reading) : null
    const newConsumption = !isNaN(newReadingNum) && !readingError
      ? Math.max(0, newReadingNum - meter.previous_reading) : null
    const diff = oldConsumption !== null && newConsumption !== null
      ? newConsumption - oldConsumption : null
    const isVisible = !!newReadingRaw && !isNaN(newReadingNum) && !readingError && newReadingNum !== originalReading
    return { oldConsumption, newConsumption, diff, isVisible }
  }, [meter, originalReading, newReadingNum, newReadingRaw, readingError])

  // ── Proof handlers (optional) ───────────────────────────────────────────

  const handleProofChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    setProofFile(file)
    setProofError(validateProof(file))
    if (proofPreview) URL.revokeObjectURL(proofPreview)
    setProofPreview(file ? URL.createObjectURL(file) : null)
  }

  const clearProof = () => {
    setProofFile(null)
    setProofError(null) // optional — clearing is always valid
    if (proofPreview) URL.revokeObjectURL(proofPreview)
    setProofPreview(null)
  }

  // ── Submit ──────────────────────────────────────────────────────────────

  const onSubmit = async (values: FormValues) => {
    if (!meter) return

    const err = validateReadingValue(values.adjusted_reading, meter, originalReading)
    if (err) { setReadingError(err); return }

    // Only block submit if a file WAS selected and it's invalid — not for missing proof
    const proofErr = validateProof(proofFile)
    if (proofErr) { setProofError(proofErr); return }

    setIsSubmitting(true)
    try {
      if (meter.reading_id) {
        const res = await submitMeterReadingAdjustment({
          reading_id:        meter.reading_id,
          original_reading:  meter.present_reading ?? 0,
          adjusted_reading:  parseFloat(values.adjusted_reading),
          reason:            values.reason || '',
          proof:             proofFile ?? undefined, // ← optional
        })
        if (res.status === 'success') {
          toast.success('Adjustment request submitted.', {
            description: 'An admin must approve it before the reading is updated.',
          })
          setOpen(false)
          onSuccess?.()
        } else {
          toast.error(res.message ?? 'Failed to submit adjustment.')
          return
        }
      } else {
        toast.error('No reading ID found.')
        return
      }
    } catch {
      toast.error('An unexpected error occurred.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const fileInputClassName = (err?: boolean) =>
    cn(
      'w-full text-[12px] text-slate-600 rounded-md border transition-all duration-150',
      'file:mr-3 file:h-9 file:px-3 file:border-0 file:rounded-l-md file:cursor-pointer',
      'file:text-[12px] file:font-medium file:bg-violet-50 file:text-violet-700',
      'hover:file:bg-violet-100',
      err
        ? 'border-rose-300 hover:border-rose-400'
        : 'border-slate-200 hover:border-violet-300',
    )

  return (
    <Sheet open={isOpen} onOpenChange={setOpen}>
      {children && <SheetTrigger asChild>{children}</SheetTrigger>}

      <SheetContent className="w-full sm:max-w-md flex flex-col h-full p-0 gap-0 border-l border-slate-200 bg-white rounded-md">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-violet-100 border border-violet-200 flex items-center justify-center shrink-0">
              <Gauge className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <SheetTitle className="text-[14px] font-bold text-slate-900 leading-tight">
                Request Reading Adjustment
              </SheetTitle>
              <SheetDescription className="text-[11px] text-slate-400 mt-0.5">
                Correction requires admin approval before applying
              </SheetDescription>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <div className="space-y-5">
              <Skeleton className="h-9 w-full rounded-md" />
              <Skeleton className="h-9 w-full rounded-md" />
              <Skeleton className="h-9 w-full rounded-md" />
              <Skeleton className="h-20 w-full rounded-md" />
            </div>
          ) : meter ? (
            <form
              id="reading-adjustment-form"
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-5"
            >

              {/* Meter Account Info (read-only) */}
              <div className="bg-slate-50 rounded-md p-3 space-y-2">
                <p className="text-[10px] font-bold text-violet-600 uppercase tracking-widest">
                  Meter Account
                </p>
                <div className="flex justify-between text-[12px]">
                  <span className="text-slate-500">Contract No.</span>
                  <span className="font-mono font-medium text-slate-700">{meter.meter_serial_no}</span>
                </div>
                <div className="flex justify-between text-[12px]">
                  <span className="text-slate-500">Consumer</span>
                  <span className="font-medium text-slate-700">{meter.account_name}</span>
                </div>
              </div>

              {/* Previous Reading (read-only) */}
              <div>
                <FormFieldLabel label="Previous Reading" />
                <Input
                  readOnly
                  value={`${fmtNum(meter.previous_reading)} m³`}
                  className="w-full h-9 px-3 rounded-md text-[13px] bg-slate-50 text-slate-500 border-slate-200 cursor-default"
                />
              </div>

              {/* Original Reading (read-only) */}
              <div>
                <FormFieldLabel label="Original Reading" />
                <Input
                  readOnly
                  value={originalReading !== null ? `${fmtNum(originalReading)} m³` : '—'}
                  className="w-full h-9 px-3 rounded-md text-[13px] bg-slate-50 text-slate-500 border-slate-200 cursor-default"
                />
                {meter.reading_date && (
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    Recorded on {fmtDate(meter.reading_date)}
                  </p>
                )}
              </div>

              <Separator />

              {/* Adjusted Reading */}
              <div>
                <FormFieldLabel label="Adjusted Reading" required />
                <Input
                  type="number"
                  min={meter.previous_reading}
                  step="0.01"
                  placeholder={`Must be ≥ ${fmtNum(meter.previous_reading)}`}
                  className={fieldClassName(!!readingError)}
                  {...form.register('adjusted_reading')}
                />
                <FormFieldError message={readingError} />
              </div>

              {/* Consumption Preview */}
              {consumptionPreview?.isVisible &&
                consumptionPreview.newConsumption !== null &&
                consumptionPreview.diff !== null && (
                <div className={cn(
                  'p-3 rounded-md border',
                  consumptionPreview.diff >= 0
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-amber-50 border-amber-200',
                )}>
                  <p className={cn(
                    'text-[10px] font-semibold uppercase tracking-wider mb-2',
                    consumptionPreview.diff >= 0 ? 'text-emerald-700' : 'text-amber-700',
                  )}>
                    Consumption Preview
                  </p>
                  <div className="space-y-1 text-[12px]">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Previous Consumption</span>
                      <span className="font-mono text-slate-800">{fmtNum(consumptionPreview.oldConsumption!)} m³</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">New Consumption</span>
                      <span className="font-mono font-semibold text-slate-800">{fmtNum(consumptionPreview.newConsumption)} m³</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-slate-100">
                      <span className="text-slate-600">Change</span>
                      <span className={cn(
                        'font-mono font-semibold',
                        consumptionPreview.diff > 0 ? 'text-emerald-700' : 'text-amber-700',
                      )}>
                        {consumptionPreview.diff > 0 ? '+' : ''}{fmtNum(consumptionPreview.diff)} m³
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Proof Image (optional — admin can skip) */}
              <div>
                <FormFieldLabel label="Proof Image" optional />
                <div className="relative">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleProofChange}
                    className={fileInputClassName(!!proofError)}
                  />
                  {!proofFile && (
                    <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center gap-1.5 text-slate-400">
                      <ImagePlus className="h-3.5 w-3.5" />
                      <span className="text-[11px]">Choose image</span>
                    </div>
                  )}
                </div>
                <FormFieldError message={proofError} />
                <p className="text-[10px] text-slate-400 mt-1">
                  Optional: a photo of the meter showing the correct reading. PNG, JPG or WEBP — max 5 MB.
                </p>

                {proofPreview && (
                  <div className="mt-2 relative rounded-md overflow-hidden border border-slate-200 bg-slate-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={proofPreview}
                      alt="Proof preview"
                      className="w-full max-h-48 object-contain"
                    />
                    <button
                      type="button"
                      onClick={clearProof}
                      className="absolute top-2 right-2 h-6 w-6 rounded-full bg-slate-900/60 text-white flex items-center justify-center hover:bg-slate-900/80 transition-colors"
                      aria-label="Remove proof image"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <div className="px-3 py-2 border-t border-slate-100 bg-white">
                      <p className="text-[11px] text-slate-600 truncate">{proofFile?.name}</p>
                      <p className="text-[10px] text-slate-400">
                        {proofFile ? `${(proofFile.size / 1024).toFixed(1)} KB` : ''}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Reason (optional) */}
              <div>
                <FormFieldLabel label="Reason" />
                <textarea
                  rows={3}
                  placeholder="Optional: Describe why this reading needs to be corrected..."
                  className={textareaClassName(!!form.formState.errors.reason)}
                  {...form.register('reason')}
                />
                {form.formState.errors.reason && (
                  <FormFieldError message={form.formState.errors.reason.message} />
                )}
                <div className="flex justify-between items-center mt-1">
                  <span className="text-[10px] text-slate-400">Optional</span>
                  <span className={cn(
                    'text-[10px]',
                    reasonValue.length > 100 ? 'text-amber-600' : 'text-slate-400',
                  )}>
                    {reasonValue.length}/500 characters
                    {reasonValue.length > 100 && ' (Getting long)'}
                  </span>
                </div>
              </div>

            </form>
          ) : (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-slate-500">Failed to load meter data</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2.5 bg-slate-50/60">
          <SheetClose asChild>
            <Button
              type="button"
              variant="outline"
              className="rounded-md h-9 text-[13px] border-slate-200"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </SheetClose>
          <Button
            type="submit"
            form="reading-adjustment-form"
            disabled={isSubmitting || !meter || !!readingError || !!proofError || isLoading}
            className="rounded-md h-9 text-[13px] bg-violet-600 hover:bg-violet-700 text-white gap-1.5 font-medium shadow-sm shadow-violet-200"
          >
            {isSubmitting
              ? <><Spinner /> Submitting...</>
              : <><Gauge className="h-3.5 w-3.5" /> Submit Request</>
            }
          </Button>
        </div>

      </SheetContent>
    </Sheet>
  )
}