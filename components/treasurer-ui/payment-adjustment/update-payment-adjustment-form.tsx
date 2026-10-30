'use client'

import { useState, useEffect } from 'react'
import { Loader2, AlertTriangle, Receipt, FilePenLine } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Sheet, SheetClose, SheetContent,
  SheetDescription, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

import {
  getAdjustmentRequestById,
  submitPaymentAdjustment,
  type AdjustmentRequestDetail,
} from '@/lib/actions/adjustment/payment.adjustment.actions'

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  adjusted_amount: z.string().min(1, 'Corrected amount is required.'),
  reason: z.string().min(10, 'Reason must be at least 10 characters.'),
})
type FormValues = z.infer<typeof schema>

interface UpdatePaymentAdjustmentFormProps {
  adjustmentId: string
  onSuccess?: () => void
  children: React.ReactNode
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const peso = (n: number) =>
  new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const formatPeriod = (p: string) => {
  const [y, m] = p.slice(0, 7).split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return `${new Date(y, m - 1).toLocaleDateString('en-US', { month: 'long' })} 1–${lastDay}, ${y}`
}

// ─── Component ────────────────────────────────────────────────────────────────

export function UpdatePaymentAdjustmentForm({ adjustmentId, onSuccess, children }: UpdatePaymentAdjustmentFormProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [record, setRecord] = useState<AdjustmentRequestDetail | null>(null)
  const [amountError, setAmountError] = useState<string | null>(null)

  // Only start showing/validating the amount error after the user has tried to submit once.
  const [submitAttempted, setSubmitAttempted] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { adjusted_amount: '', reason: '' },
  })

  const adjustedRaw = form.watch('adjusted_amount')
  const adjustedNum = parseFloat(adjustedRaw)

  // Fetch record when sheet opens
  useEffect(() => {
    if (!isOpen || !adjustmentId) {
      setRecord(null)
      form.reset()
      setAmountError(null)
      setSubmitAttempted(false)
      return
    }

    const fetchRecord = async () => {
      setIsLoading(true)
      try {
        const res = await getAdjustmentRequestById(adjustmentId)
        if (res.status === 'success' && res.data) {
          setRecord(res.data)
          form.setValue('adjusted_amount', String(res.data.adjusted_amount))
          form.setValue('reason', res.data.reason || '')
        } else {
          toast.error('Failed to load adjustment details')
          setIsOpen(false)
        }
      } catch {
        toast.error('Failed to load adjustment details')
        setIsOpen(false)
      } finally {
        setIsLoading(false)
      }
    }

    fetchRecord()
  }, [adjustmentId, isOpen, form])

  function validateAmount(value: string): string | null {
    const num = parseFloat(value)
    if (!value || isNaN(num) || num <= 0) {
      const msg = 'Enter a valid amount greater than zero.'
      setAmountError(msg)
      return msg
    }
    if (Math.abs(num - record!.original_amount) < 0.01) {
      const msg = 'Corrected amount is the same as the original. No adjustment needed.'
      setAmountError(msg)
      return msg
    }
    if (num > record!.billing.total_billing) {
      const msg = `Cannot exceed the total bill of ₱${peso(record!.billing.total_billing)}.`
      setAmountError(msg)
      return msg
    }
    setAmountError(null)
    return null
  }

  // Re-validate live, but only once the user has attempted a submit —
  // so the "same as original" message never appears unprompted on open.
  useEffect(() => {
    if (!record || !submitAttempted) return
    validateAmount(adjustedRaw)
  }, [adjustedRaw, record, submitAttempted])

  const onSubmit = async (values: FormValues) => {
    if (!record) return

    setSubmitAttempted(true)
    const amtErr = validateAmount(values.adjusted_amount)
    if (amtErr) {
      toast.error(amtErr)
      return
    }

    setIsSubmitting(true)
    try {
      const res = await submitPaymentAdjustment({
        payment_id: record.payment_id,
        source: record.payment_source,
        original_amount: record.original_amount,
        adjusted_amount: adjustedNum,
        reason: values.reason.trim(),
      })
      if (res.status === 'success') {
        toast.success('Adjustment request updated successfully.')
        setIsOpen(false)
        onSuccess?.()
      } else {
        toast.error(res.message ?? 'Failed to update adjustment.')
      }
    } catch {
      toast.error('An unexpected error occurred.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const diff = record ? adjustedNum - record.original_amount : 0
  const newRemaining = record ? Number(record.billing.remaining_balance) - diff : 0
  const canPreview = record && adjustedRaw.trim() !== '' && !isNaN(adjustedNum) && adjustedNum > 0
  const isPending = record?.adjustment_status?.toLowerCase() === 'pending'

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        {children}
      </SheetTrigger>

      <SheetContent className="w-full sm:max-w-md flex flex-col h-full p-0 gap-0 border-l border-slate-200 bg-white rounded-md">
        {/* Hidden title for accessibility */}
        <SheetTitle className="sr-only">Update Payment Adjustment Request</SheetTitle>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
          </div>
        ) : record ? (
          <>
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-md bg-violet-600 flex items-center justify-center shrink-0">
                  <FilePenLine className="h-[18px] w-[18px] text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-[14px] font-bold text-slate-900 leading-tight">
                    Update Payment Adjustment
                  </p>
                  <SheetDescription className="text-[11px] text-slate-500 mt-0.5">
                    Modify your pending adjustment request
                  </SheetDescription>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto bg-slate-50/60 px-6 py-6">
              <form id="update-adjustment-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Warning for non-pending */}
                {!isPending && (
                  <div className="flex items-start gap-2.5 px-4 py-3 rounded-md bg-white border border-slate-200">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[12px] font-semibold text-slate-700">Cannot Modify</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        This adjustment has already been {record.adjustment_status}. Only pending requests can be modified.
                      </p>
                    </div>
                  </div>
                )}

                {/* Original Payment Details */}
                <div className="bg-white rounded-md border border-slate-200 p-3.5 space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Receipt className="h-3.5 w-3.5 text-violet-500" />
                    <span className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Original Payment</span>
                  </div>
                  <div className="space-y-0">
                    <div className="flex items-center justify-between py-2 border-b border-slate-100">
                      <span className="text-[11px] text-slate-500">Receipt #</span>
                      <span className="text-[12px] font-mono font-medium text-slate-700">{record.payment.receipt_number}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-slate-100">
                      <span className="text-[11px] text-slate-500">Consumer</span>
                      <span className="text-[12px] font-medium text-slate-700">{record.consumer.account_name}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-slate-100">
                      <span className="text-[11px] text-slate-500">S/N</span>
                      <span className="text-[12px] font-mono text-slate-600">{record.meter_account.meter_serial_no}</span>
                    </div>
                    {record.billing.reading_period && (
                      <div className="flex items-center justify-between py-2 border-b border-slate-100">
                        <span className="text-[11px] text-slate-500">Period</span>
                        <span className="text-[12px] text-slate-600">{record.billing.reading_period}</span>
                      </div>
                    )}
                    <Separator className="my-1" />
                    <div className="flex items-center justify-between py-2">
                      <span className="text-[11px] text-slate-500">Original Amount Paid</span>
                      <span className="text-[12px] font-medium text-emerald-700">{peso(record.original_amount)}</span>
                    </div>
                  </div>
                </div>

                {/* Correction Fields */}
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                      Corrected Amount <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[12.5px]">₱</span>
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="0.00"
                        disabled={!isPending}
                        className={cn(
                          'pl-7 h-10 rounded-md text-[12.5px]',
                          amountError && 'border-rose-500 focus-visible:ring-rose-500'
                        )}
                        {...form.register('adjusted_amount')}
                      />
                    </div>
                    {amountError && (
                      <p className="text-[10.5px] text-rose-600 flex items-center gap-1 mt-1">
                        <AlertTriangle className="h-3 w-3 shrink-0" /> {amountError}
                      </p>
                    )}
                  </div>

                  {/* Diff Preview */}
                  {canPreview && isPending && (
                    <div className={cn(
                      'rounded-md border px-3 py-2.5 space-y-1.5',
                      diff > 0
                        ? 'bg-violet-50 border-violet-200'
                        : diff < 0
                        ? 'bg-amber-50 border-amber-200'
                        : 'bg-slate-50 border-slate-200'
                    )}>
                      <p className={cn(
                        'text-[10px] font-bold uppercase tracking-wide',
                        diff > 0 ? 'text-violet-600' : diff < 0 ? 'text-amber-600' : 'text-slate-500'
                      )}>
                        Effect Preview
                      </p>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-500">Difference</span>
                        <span className={cn(
                          'font-semibold',
                          diff > 0 ? 'text-violet-700' : diff < 0 ? 'text-amber-700' : 'text-slate-500'
                        )}>
                          {diff > 0 ? '+' : ''}₱{peso(Math.abs(diff))}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-500">New Remaining Balance</span>
                        <span className={cn(
                          'font-semibold',
                          newRemaining <= 0.01 ? 'text-emerald-700' : 'text-rose-600'
                        )}>
                          {newRemaining <= 0.01 ? '₱0.00 (Fully Paid)' : `₱${peso(newRemaining)}`}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Reason */}
                  <div className="space-y-2">
                    <Label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                      Reason for Adjustment <span className="text-red-500">*</span>
                    </Label>
                    <Textarea
                      rows={3}
                      placeholder="Explain why this payment needs to be corrected..."
                      disabled={!isPending}
                      className={cn(
                        'text-[12.5px] resize-none rounded-md',
                        form.formState.errors.reason && 'border-rose-500'
                      )}
                      {...form.register('reason')}
                    />
                    <div className="flex justify-between">
                      {form.formState.errors.reason ? (
                        <p className="text-[10.5px] text-rose-600">{form.formState.errors.reason.message}</p>
                      ) : (
                        <span />
                      )}
                      <span className="text-[10px] text-slate-400">{form.watch('reason')?.length || 0} characters</span>
                    </div>
                  </div>
                </div>
              </form>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-white shrink-0">
              <div className="flex items-center justify-between gap-3">
                <SheetClose asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-md h-9 text-[13px] border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-600"
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                </SheetClose>
                {isPending && (
                  <Button
                    type="submit"
                    form="update-adjustment-form"
                    disabled={isSubmitting}
                    className="rounded-md h-9 text-[13px] bg-violet-600 hover:bg-violet-700 text-white gap-1.5 font-semibold shadow-sm shadow-violet-200"
                  >
                    {isSubmitting
                      ? <><Spinner /> Updating...</>
                      : <><FilePenLine className="h-3.5 w-3.5" /> Update Request</>
                    }
                  </Button>
                )}
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}