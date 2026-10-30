'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, AlertTriangle, Check, ChevronsUpDown, Receipt, X, RefreshCcw, Plug } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Sheet, SheetClose, SheetContent,
  SheetDescription, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import {
  Command, CommandEmpty, CommandGroup,
  CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

import {
  searchPaymentsForAdjustment,
  getPaymentByIdForAdjustment,
  submitPaymentAdjustment,
  type PaymentAdjustmentPreview,
  type PaymentSource,
} from '@/lib/actions/adjustment/payment.adjustment.actions'
import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  payment_id: z.string().min(1, 'Please select a payment.'),
  adjusted_amount: z.string().min(1, 'Corrected amount is required.'),
  reason: z.string().max(500, 'Reason must not exceed 500 characters.').optional(),
})
type FormValues = z.infer<typeof schema>

interface CreatePaymentAdjustmentFormProps {
  onSuccess?: () => void
  children: React.ReactNode
}

interface ComboOption {
  value: string
  label: string
  source: PaymentSource
  receiptNumber: string
  consumerName: string
  amountPaid: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const peso = (n: number) =>
  new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

function FormFieldError({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <p className="flex items-center gap-1.5 text-[11px] text-rose-500 mt-1.5">
      <AlertTriangle className="h-3 w-3 shrink-0" />{message}
    </p>
  )
}

const fieldClassName = (err?: boolean) =>
  'w-full h-11 px-3.5 rounded-lg text-[13px] text-slate-700 bg-white border outline-none transition-all duration-150 placeholder:text-slate-300 shadow-sm ' +
  (err
    ? 'border-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-100'
    : 'border-slate-200 hover:border-violet-300 focus:border-violet-400 focus:ring-2 focus:ring-violet-100')

const SOURCE_META: Record<PaymentSource, { label: string; icon: typeof Receipt; badgeClass: string }> = {
  billing: {
    label: 'Billing',
    icon: Receipt,
    badgeClass: 'bg-violet-50 text-violet-600 border-violet-200',
  },
  reconnection: {
    label: 'Reconnection',
    icon: RefreshCcw,
    badgeClass: 'bg-sky-50 text-sky-600 border-sky-200',
  },
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CreatePaymentAdjustmentForm({ onSuccess, children }: CreatePaymentAdjustmentFormProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [preview, setPreview] = useState<PaymentAdjustmentPreview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [amountError, setAmountError] = useState<string | null>(null)

  // Only start showing/validating the amount error after the user has tried to submit once.
  const [submitAttempted, setSubmitAttempted] = useState(false)

  // Combobox state
  const [comboOpen, setComboOpen] = useState(false)
  const [comboSearch, setComboSearch] = useState('')
  const [comboOptions, setComboOptions] = useState<ComboOption[]>([])
  const [comboLoading, setComboLoading] = useState(false)
  const [selectedOption, setSelectedOption] = useState<ComboOption | null>(null)

  const debouncedSearch = useDebouncedSearch(comboSearch)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { payment_id: '', adjusted_amount: '', reason: '' },
  })

  const adjustedRaw = form.watch('adjusted_amount')
  const adjustedNum = parseFloat(adjustedRaw)

  function resetForm() {
    form.reset()
    setPreview(null)
    setAmountError(null)
    setSubmitAttempted(false)
    setComboSearch('')
    setComboOptions([])
    setSelectedOption(null)
  }

  // Reset on close
  useEffect(() => {
    if (!isOpen) resetForm()
  }, [isOpen])

  // Search payments with debounce (billing + reconnection, latest transaction per meter account only)
  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setComboOptions([]); return }
    setComboLoading(true)
    try {
      const results = await searchPaymentsForAdjustment(q)
      setComboOptions(results.map((r) => ({
        value: r.payment_id,
        source: r.source,
        label: `${r.receipt_number} — ${r.consumer_name} — ₱${peso(r.amount_paid)}`,
        receiptNumber: r.receipt_number,
        consumerName: r.consumer_name,
        amountPaid: r.amount_paid,
      })))
    } catch {
      toast.error('Failed to search payments')
    } finally {
      setComboLoading(false)
    }
  }, [])

  useEffect(() => {
    handleSearch(debouncedSearch)
  }, [debouncedSearch, handleSearch])

  // On payment select
  async function handlePaymentSelect(option: ComboOption) {
    setSelectedOption(option)
    setComboOpen(false)
    form.setValue('payment_id', option.value, { shouldValidate: true })
    form.setValue('adjusted_amount', '', { shouldValidate: false })
    setPreview(null)
    setAmountError(null)
    setSubmitAttempted(false)

    setLoadingPreview(true)
    try {
      const res = await getPaymentByIdForAdjustment(option.value, option.source)
      if (res.status === 'success' && res.data) {
        setPreview(res.data)
        form.setValue('adjusted_amount', String(res.data.amount_paid), { shouldValidate: false })
      } else {
        toast.error(res.message ?? 'Failed to load payment details')
        clearPayment()
      }
    } catch {
      toast.error('Failed to load payment details')
    } finally {
      setLoadingPreview(false)
    }
  }

  const clearPayment = useCallback(() => {
    setSelectedOption(null)
    setComboSearch('')
    setComboOptions([])
    form.setValue('payment_id', '', { shouldValidate: false })
    form.setValue('adjusted_amount', '', { shouldValidate: false })
    setPreview(null)
    setAmountError(null)
    setSubmitAttempted(false)
  }, [form])

  function validateAmount(value: string, p: PaymentAdjustmentPreview): string | null {
    const num = parseFloat(value)
    if (!value || isNaN(num) || num <= 0) {
      const msg = 'Enter a valid amount greater than zero.'
      setAmountError(msg); return msg
    }
    if (Math.abs(num - p.amount_paid) < 0.01) {
      const msg = 'Corrected amount is the same as the original. No adjustment needed.'
      setAmountError(msg); return msg
    }
    if (num > p.total_amount) {
      const msg = `Cannot exceed the total amount of ₱${peso(p.total_amount)}.`
      setAmountError(msg); return msg
    }
    setAmountError(null); return null
  }

  // Re-validate live, but only once the user has attempted a submit —
  // so the "same as original" message never appears unprompted.
  useEffect(() => {
    if (!preview || !submitAttempted) return
    validateAmount(adjustedRaw, preview)
  }, [adjustedRaw, preview, submitAttempted])

  const onSubmit = async (values: FormValues) => {
    if (!preview) return

    setSubmitAttempted(true)
    const amtErr = validateAmount(values.adjusted_amount, preview)
    if (amtErr) {
      toast.error(amtErr)
      return
    }

    setIsSubmitting(true)
    try {
      const res = await submitPaymentAdjustment({
        payment_id: values.payment_id,
        source: preview.source,
        original_amount: preview.amount_paid,
        adjusted_amount: parseFloat(values.adjusted_amount),
        reason: values.reason?.trim() || '',
      })
      if (res.status === 'success') {
        toast.success('Adjustment request submitted successfully.')
        setIsOpen(false)
        onSuccess?.()
      } else {
        toast.error(res.message ?? 'Failed to submit adjustment.')
      }
    } catch {
      toast.error('An unexpected error occurred.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const diff = preview ? adjustedNum - preview.amount_paid : 0
  const newRemaining = preview ? Number(preview.remaining_balance) - diff : 0
  const canPreview = preview && adjustedRaw.trim() !== '' && !isNaN(adjustedNum) && adjustedNum > 0
  const reasonValue = form.watch('reason') || ''
  const sourceMeta = preview ? SOURCE_META[preview.source] : null
  const SourceIcon = sourceMeta?.icon ?? Receipt

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(o) => {
        setIsOpen(o)
        if (!o) resetForm()
      }}
    >
       
      <SheetTrigger asChild>
        {children}
      </SheetTrigger>

      <SheetContent className="w-full sm:max-w-lg flex flex-col h-full p-0 gap-0 border-l border-slate-200 bg-white">

        {/* Header — matches installation form */}
        <div className="px-7 pt-6 pb-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="h-10 w-10 rounded-lg bg-violet-600 flex items-center justify-center shrink-0 shadow-sm shadow-violet-200">
              <Receipt className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-[15px] font-bold text-slate-900 leading-tight">
                Request Payment Adjustment
              </SheetTitle>
              <SheetDescription className="text-[12px] text-slate-500 mt-1 leading-snug">
                Correction requires admin approval before it's applied
              </SheetDescription>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-slate-50/60 px-7 py-6 space-y-6">
          <form id="create-adjustment-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

            {/* Select Payment */}
            <div className="space-y-2.5 relative z-50">
              <Label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                <Plug className="h-3 w-3 text-violet-500" />
                Payment <span className="text-red-500">*</span>
              </Label>

              <div className="relative">
                <Popover open={comboOpen} onOpenChange={setComboOpen} modal={false}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={comboOpen}
                      className={cn(
                        'w-full justify-between h-11 px-3.5 rounded-lg text-[13px] border bg-white font-normal shadow-sm',
                        selectedOption
                          ? 'border-violet-300 bg-violet-50/60 text-slate-700 pr-9'
                          : 'border-slate-200 hover:border-violet-300 text-slate-400',
                        form.formState.errors.payment_id && !selectedOption && 'border-rose-300',
                      )}
                    >
                      <span className="flex items-center gap-2 min-w-0 truncate">
                        {selectedOption && (
                          <span className="h-5 w-5 rounded-md bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                            {(() => { const Icon = SOURCE_META[selectedOption.source].icon; return <Icon className="h-3 w-3" /> })()}
                          </span>
                        )}
                        <span className="truncate">
                          {selectedOption?.label || 'Search by receipt number, consumer…'}
                        </span>
                      </span>
                      {!selectedOption && (
                        <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-2" />
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[var(--radix-popover-trigger-width)] p-0 bg-white border border-slate-200 rounded-lg shadow-lg"
                    align="start"
                    sideOffset={6}
                    collisionPadding={12}
                    avoidCollisions
                    side="bottom"
                  >
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Type receipt number…"
                        value={comboSearch}
                        onValueChange={setComboSearch}
                        className="h-10 text-[13px]"
                      />
                      <CommandList className="max-h-64">
                        {comboLoading ? (
                          <div className="flex items-center justify-center gap-2 py-5 text-[12px] text-slate-400">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                          </div>
                        ) : comboOptions.length === 0 ? (
                          <CommandEmpty className="text-[12px] text-slate-400 py-5 text-center px-4">
                            {comboSearch ? 'No eligible payments found.' : 'Type to search payments.'}
                          </CommandEmpty>
                        ) : (
                          <CommandGroup>
                            {comboOptions.map((opt) => {
                              const meta = SOURCE_META[opt.source]
                              const Icon = meta.icon
                              return (
                                <CommandItem
                                  key={`${opt.source}-${opt.value}`}
                                  value={opt.value}
                                  onSelect={() => handlePaymentSelect(opt)}
                                  className="text-[13px] cursor-pointer py-2.5 px-3 gap-2.5"
                                >
                                  <div className="h-7 w-7 rounded-md bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                                    <Icon className="h-3.5 w-3.5" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                      <p className="font-medium text-slate-700 truncate">{opt.receiptNumber}</p>
                                      <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0 h-4 shrink-0', meta.badgeClass)}>
                                        {meta.label}
                                      </Badge>
                                    </div>
                                    <p className="text-[11px] text-slate-400 truncate">
                                      {opt.consumerName} · ₱{peso(opt.amountPaid)}
                                    </p>
                                  </div>
                                  <Check className={cn(
                                    'h-3.5 w-3.5 shrink-0',
                                    form.watch('payment_id') === opt.value ? 'opacity-100 text-violet-600' : 'opacity-0',
                                  )} />
                                </CommandItem>
                              )
                            })}
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {selectedOption && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      clearPayment()
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 transition-colors p-0.5"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <FormFieldError message={form.formState.errors.payment_id?.message} />
            </div>

            {/* Loading preview */}
            {loadingPreview && (
              <div className="space-y-3">
                <Skeleton className="h-24 w-full rounded-lg" />
                <Skeleton className="h-11 w-full rounded-lg" />
              </div>
            )}

            {/* Selected summary — mirrors the installation form's "Selected Account" panel */}
            {preview && !loadingPreview && (
              <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-violet-600">
                    <SourceIcon className="h-3 w-3" /> Selected Payment
                  </div>
                  {sourceMeta && (
                    <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0 h-4', sourceMeta.badgeClass)}>
                      {sourceMeta.label}
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-y-1.5 text-[12.5px]">
                  <span className="text-slate-500">Receipt No.</span>
                  <span className="font-mono font-medium text-slate-700 text-right">{preview.receipt_number}</span>
                  <span className="text-slate-500">Consumer</span>
                  <span className="font-medium text-slate-700 text-right truncate">{preview.consumer_name}</span>
                  <span className="text-slate-500">Serial No.</span>
                  <span className="font-mono font-medium text-slate-700 text-right">{preview.meter_serial_no}</span>
                  <span className="text-slate-500">{preview.source === 'billing' ? 'Reading Period' : 'Reference'}</span>
                  <span className="font-medium text-slate-700 text-right truncate">{preview.period_label}</span>
                  <span className="text-slate-500">Original Amount</span>
                  <span className="font-mono font-semibold text-slate-800 text-right">₱{peso(preview.amount_paid)}</span>
                </div>
              </div>
            )}

            <Separator />

            {/* Corrected Amount */}
            <div className="space-y-2.5">
              <Label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                Corrected Amount <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[13px]">₱</span>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  disabled={!preview}
                  className={cn(fieldClassName(!!amountError), 'pl-7')}
                  {...form.register('adjusted_amount')}
                />
              </div>
              <FormFieldError message={amountError} />
            </div>

            {/* Diff Preview */}
            {canPreview && (
              <div className={cn(
                'p-4 rounded-lg border',
                diff > 0
                  ? 'bg-violet-50 border-violet-200'
                  : diff < 0
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-slate-50 border-slate-200',
              )}>
                <p className={cn(
                  'text-[10px] font-bold uppercase tracking-widest mb-2.5',
                  diff > 0 ? 'text-violet-700' : diff < 0 ? 'text-amber-700' : 'text-slate-500',
                )}>
                  Effect Preview
                </p>
                <div className="space-y-1.5 text-[12.5px]">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Difference</span>
                    <span className={cn(
                      'font-mono font-semibold',
                      diff > 0 ? 'text-violet-700' : diff < 0 ? 'text-amber-700' : 'text-slate-500',
                    )}>
                      {diff > 0 ? '+' : ''}₱{peso(Math.abs(diff))}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-slate-100">
                    <span className="text-slate-600">New Remaining Balance</span>
                    <span className={cn(
                      'font-mono font-semibold',
                      newRemaining <= 0.01 ? 'text-emerald-700' : 'text-rose-600',
                    )}>
                      {newRemaining <= 0.01 ? '₱0.00 (Fully Paid)' : `₱${peso(newRemaining)}`}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Reason (optional) */}
            <div className="space-y-2.5">
              <Label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                Reason
              </Label>
              <textarea
                rows={3}
                placeholder="Optional: describe why this payment needs to be corrected…"
                className="w-full px-3.5 py-3 rounded-lg text-[13px] text-slate-700 bg-white border border-slate-200 outline-none transition-all duration-150 placeholder:text-slate-300 resize-none shadow-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-100 hover:border-violet-300"
                {...form.register('reason')}
              />
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-slate-400">Optional</span>
                <span className={cn(
                  'text-[10px]',
                  reasonValue.length > 100 ? 'text-amber-600' : 'text-slate-400',
                )}>
                  {reasonValue.length}/500 characters
                </span>
              </div>
            </div>

          </form>
        </div>

        {/* Footer — matches installation form */}
        <div className="px-7 py-4 border-t border-slate-100 bg-white shrink-0">
          <div className="flex items-center justify-between gap-3">
            <SheetClose asChild>
              <Button
                type="button"
                variant="outline"
                className="rounded-md h-10 px-5 text-[13px] border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-600"
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </SheetClose>
            <Button
              type="submit"
              form="create-adjustment-form"
              disabled={isSubmitting || !preview}
              className="rounded-md h-10 px-5 text-[13px] bg-violet-600 hover:bg-violet-700 text-white font-semibold gap-2"
            >
              {isSubmitting
                ? <><Spinner /> Submitting…</>
                : <><Receipt className="h-3.5 w-3.5" /> Submit Request</>
              }
            </Button>
          </div>
        </div>

      </SheetContent>
    </Sheet>
  )
}