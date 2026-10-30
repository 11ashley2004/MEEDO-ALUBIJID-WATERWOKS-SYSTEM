'use client'

import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Loader2, Check, ChevronsUpDown, Plug, Plus,
  User, Wallet, Gauge, MapPin, Tag,
} from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'

import {
  Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import {
  searchConsumersForConnection,
  getAllBarangays,
  getZonesByBarangay,
  getAllClassifications,
  createMeterAccountBatch,
  type Barangay,
  type Zone,
  type Classification,
  type ConsumerResult,
} from '@/lib/actions/meter-account/meter-accounts'

const schema = z.object({
  consumer_id:       z.string().min(1, 'Please select a consumer'),
  barangay_id:       z.string().min(1, 'Required'),
  zone_id:           z.string().min(1, 'Required'),
  classification_id: z.string().min(1, 'Required'),
})

type FormData = z.infer<typeof schema>
const peso = (n: number) => n.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })

interface CreateMeterAccountFormProps {
  onSuccess?: () => void
}

export default function CreateMeterAccountForm({ onSuccess }: CreateMeterAccountFormProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [barangays, setBarangays] = useState<Barangay[]>([])
  const [classifications, setClassifications] = useState<Classification[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [zonesLoading, setZonesLoading] = useState(false)

  const [consumerQuery, setConsumerQuery] = useState('')
  const [consumerOpen, setConsumerOpen] = useState(false)
  const [consumerResults, setConsumerResults] = useState<ConsumerResult[]>([])
  const [consumerSearching, setConsumerSearching] = useState(false)
  const [selectedConsumerLabel, setSelectedConsumerLabel] = useState('')
  const debouncedQuery = useDebouncedSearch(consumerQuery)

  const {
    control, handleSubmit, watch, setValue, reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      consumer_id: '',
      barangay_id: '',
      zone_id: '',
      classification_id: '',
    },
  })

  const barangayId = watch('barangay_id')
  const classificationId = watch('classification_id')

  useEffect(() => {
    if (!isOpen) return
    Promise.all([getAllBarangays(), getAllClassifications()])
      .then(([b, c]) => { setBarangays(b); setClassifications(c) })
      .catch(() => toast.error('Failed to load form data'))
  }, [isOpen])

  useEffect(() => {
    if (!debouncedQuery.trim()) { setConsumerResults([]); return }
    setConsumerSearching(true)
    searchConsumersForConnection(debouncedQuery)
      .then(setConsumerResults)
      .catch(() => toast.error('Search failed'))
      .finally(() => setConsumerSearching(false))
  }, [debouncedQuery])

  function resetForm() {
    reset({ consumer_id: '', barangay_id: '', zone_id: '', classification_id: '' })
    setSelectedConsumerLabel('')
    setConsumerQuery('')
    setZones([])
  }

  async function loadZones(barangayId: string) {
    setZonesLoading(true)
    try {
      const z = await getZonesByBarangay(barangayId)
      setZones(z)
    } catch {
      toast.error('Failed to load zones')
    } finally {
      setZonesLoading(false)
    }
  }

  const cls = classifications.find((c) => c.classification_id === classificationId)
  const total = cls?.connection_fee ?? 0

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true)
    try {
      // One meter_accounts row — total_connection_fee, payment_status
      // (defaults false) and paid_at are set server-side.
      const res = await createMeterAccountBatch({
        consumer_id: data.consumer_id,
        meter_accounts: [{
          barangay_id: data.barangay_id,
          zone_id: data.zone_id,
          classification_id: data.classification_id,
        }],
      })

      if (res.status === 'success') {
        toast.success(res.message || 'Meter account created')
        setIsOpen(false)
        resetForm()
        onSuccess?.()
      } else {
        toast.error(res.message || 'Failed to create meter account')
      }
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputClass = (hasError: boolean) =>
    cn(
      'h-9 w-full rounded-md text-[12px] bg-white px-2.5 transition-colors',
      hasError
        ? 'border-rose-300 focus-visible:ring-rose-200'
        : 'border-slate-200 hover:border-violet-300 focus-visible:border-violet-400 focus-visible:ring-violet-100',
    )

  return (
    <Sheet open={isOpen} onOpenChange={(o) => { setIsOpen(o); if (!o) resetForm() }}>
      <SheetTrigger asChild>
        <Button className="h-9 gap-2 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-semibold border border-violet-700">
          <Plus className="h-4 w-4" />
          Create Meter Account
        </Button>
      </SheetTrigger>

      <SheetContent className="w-full sm:max-w-md flex flex-col h-full p-0 gap-0 border-l border-slate-200 bg-white">

        {/* Header */}
        <div className="px-7 pt-6 pb-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="h-10 w-10 rounded-md bg-violet-600 border border-violet-700 flex items-center justify-center shrink-0 shadow-sm">
              <Gauge className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-[15px] font-bold text-slate-900 leading-tight">
                New Meter Account
              </SheetTitle>
              <p className="text-xs font-medium text-foreground/80 mt-1 leading-snug">
                Register a new meter account for a consumer
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-slate-50/60 px-7 py-6 space-y-6">

          {/* Step 1 — Consumer */}
          <div className="space-y-2.5 relative z-50">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5 text-xs font-bold text-foreground uppercase tracking-wider">
                <User className="h-3.5 w-3.5 text-primary" />
                Consumer <span className="text-destructive">*</span>
              </Label>
              <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                Step 1
              </span>
            </div>
            <Controller
              control={control}
              name="consumer_id"
              render={({ field }) => (
                <div>
                  <Popover open={consumerOpen} onOpenChange={setConsumerOpen} modal={false}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className={cn(
                          'w-full justify-between h-11 px-3.5 !rounded-md text-sm border bg-background font-normal transition-colors',
                          errors.consumer_id
                            ? 'border-destructive'
                            : field.value
                              ? 'border-primary text-foreground'
                              : 'border-input text-foreground',
                        )}
                      >
                        {field.value && (
                          <span className="h-7 w-7 rounded-md bg-primary/15 text-primary border border-primary/30 flex items-center justify-center text-[11px] font-bold shrink-0 mr-2.5">
                            {selectedConsumerLabel.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </span>
                        )}
                        <span className={cn('truncate flex-1 text-left', field.value ? 'text-foreground font-medium' : 'text-foreground/70')}>
                          {selectedConsumerLabel || 'Select a consumer'}
                        </span>
                        <ChevronsUpDown className="h-4 w-4 text-foreground/70 shrink-0 ml-2" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[var(--radix-popover-trigger-width)] overflow-hidden p-0 gap-0 bg-popover text-popover-foreground border border-border rounded-md shadow-lg"
                      align="start" sideOffset={6} collisionPadding={12} avoidCollisions side="bottom"
                    >
                      <Command shouldFilter={false} className="bg-popover text-popover-foreground">
                        <CommandInput
                          placeholder="Search by contract number or name"
                          value={consumerQuery}
                          onValueChange={setConsumerQuery}
                        />
                        <CommandList className="max-h-60">
                          {consumerSearching && (
                            <div className="flex items-center justify-center gap-2 py-6 text-sm font-medium text-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
                            </div>
                          )}
                          {!consumerSearching && consumerQuery && consumerResults.length === 0 && (
                            <CommandEmpty className="text-sm font-medium text-foreground py-6 text-center">
                              No consumers found
                            </CommandEmpty>
                          )}
                          {!consumerSearching && !consumerQuery && (
                            <div className="py-6 text-center text-sm font-medium text-foreground">
                              Type a contract number or name to search
                            </div>
                          )}
                          {!consumerSearching && consumerResults.length > 0 && (
                            <CommandGroup>
                              {consumerResults.map((c) => (
                                <CommandItem
                                  key={c.consumer_id}
                                  value={c.consumer_id}
                                  onSelect={() => {
                                    field.onChange(c.consumer_id)
                                    setSelectedConsumerLabel(c.label)
                                    setConsumerOpen(false)
                                  }}
                                  className={cn(
                                    'cursor-pointer text-sm py-3 gap-3 rounded-md text-foreground',
                                    field.value === c.consumer_id && 'bg-accent text-accent-foreground',
                                  )}
                                >
                                  <div className="h-8 w-8 rounded-md bg-primary/15 text-primary border border-primary/30 flex items-center justify-center text-xs font-bold shrink-0">
                                    {c.account_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-foreground truncate">{c.account_name}</p>
                                    <p className="text-xs font-medium text-foreground/80 truncate">{c.contract_no}</p>
                                  </div>
                                  {field.value === c.consumer_id && <Check className="h-4 w-4 text-primary ml-auto" />}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {errors.consumer_id && (
                    <p className="text-[11px] text-rose-500 mt-1.5 flex items-center gap-1">
                      <span className="h-1 w-1 rounded-full bg-rose-400" /> {errors.consumer_id.message}
                    </p>
                  )}
                </div>
              )}
            />
          </div>

          {/* Step 2 — Meter account details */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5 text-xs font-bold text-foreground uppercase tracking-wider">
                <Gauge className="h-3.5 w-3.5 text-primary" />
                Meter Account Details <span className="text-destructive">*</span>
              </Label>
              <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                Step 2
              </span>
            </div>

            <div className="rounded-md border border-slate-200 bg-white overflow-hidden shadow-sm">
              <div className="p-4 space-y-3.5">

                {/* Row 1: Barangay + Zone */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1 text-xs font-semibold text-foreground uppercase tracking-wide">
                      <MapPin className="h-3.5 w-3.5 text-primary" /> Barangay
                    </Label>
                    <Controller
                      control={control}
                      name="barangay_id"
                      render={({ field: bField }) => (
                        <Select
                          value={bField.value}
                          onValueChange={(v) => {
                            bField.onChange(v)
                            setValue('zone_id', '')
                            loadZones(v)
                          }}
                        >
                          <SelectTrigger className={inputClass(!!errors.barangay_id)}>
                            <SelectValue placeholder="Select barangay" />
                          </SelectTrigger>
                          <SelectContent className="bg-white border border-slate-200 rounded-md">
                            {barangays.map((b) => (
                              <SelectItem key={b.barangay_id} value={b.barangay_id} className="text-[12px]">
                                {b.barangay_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {errors.barangay_id && (
                      <p className="text-[10.5px] text-rose-500">{errors.barangay_id.message}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-foreground uppercase tracking-wide">
                      Zone
                    </Label>
                    <Controller
                      control={control}
                      name="zone_id"
                      render={({ field: zField }) => (
                        <Select value={zField.value} onValueChange={zField.onChange} disabled={!barangayId}>
                          <SelectTrigger className={cn(
                            inputClass(!!errors.zone_id),
                            !barangayId && 'opacity-60',
                          )}>
                            {zonesLoading ? (
                              <span className="flex items-center gap-1.5 text-slate-400">
                                <Loader2 className="h-3 w-3 animate-spin" /> Loading
                              </span>
                            ) : (
                              <SelectValue placeholder={barangayId ? 'Select zone' : 'Pick barangay first'} />
                            )}
                          </SelectTrigger>
                          <SelectContent className="bg-white border border-slate-200 rounded-md">
                            {zones.map((z) => (
                              <SelectItem key={z.zone_id} value={z.zone_id} className="text-[12px]">
                                {z.zone_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {errors.zone_id && (
                      <p className="text-[10.5px] text-rose-500">{errors.zone_id.message}</p>
                    )}
                  </div>
                </div>

                {/* Row 2: Classification */}
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1 text-xs font-semibold text-foreground uppercase tracking-wide">
                    <Tag className="h-3.5 w-3.5 text-primary" /> Classification
                  </Label>
                  <Controller
                    control={control}
                    name="classification_id"
                    render={({ field: cField }) => (
                      <Select value={cField.value} onValueChange={cField.onChange}>
                        <SelectTrigger className={inputClass(!!errors.classification_id)}>
                          <SelectValue placeholder="Select classification" />
                        </SelectTrigger>
                        <SelectContent className="bg-white border border-slate-200 rounded-md">
                          {classifications.map((c) => (
                            <SelectItem key={c.classification_id} value={c.classification_id} className="text-[12px]">
                              {c.classification_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.classification_id && (
                    <p className="text-[10.5px] text-rose-500">{errors.classification_id.message}</p>
                  )}
                </div>

              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-md border border-violet-200 bg-violet-50/50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-violet-600 uppercase tracking-wider">
                <Wallet className="h-3.5 w-3.5" /> Connection Fee
              </span>
              {cls ? (
                <span className="text-sm font-medium text-foreground">
                  {cls.classification_name}
                </span>
              ) : (
                <span className="text-sm font-medium text-foreground/80">Select a classification</span>
              )}
            </div>
            <div className="flex items-center justify-between bg-violet-600 border-t border-violet-700 px-4 py-3.5">
              <span className="text-[12px] font-semibold text-violet-100">Total due</span>
              <span className="text-[17px] font-bold text-white tabular-nums">{peso(total)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-7 py-4 border-t border-slate-100 bg-white shrink-0">
          <div className="flex items-center justify-between gap-3">
            <SheetClose asChild>
              <Button
                variant="outline"
                className="rounded-md h-10 px-5 text-[13px] border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-600"
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </SheetClose>
            <Button
              type="button"
              className="rounded-md h-10 px-5 text-[13px] bg-violet-600 hover:bg-violet-700 text-white font-semibold border border-violet-700 gap-2 shadow-sm"
              disabled={isSubmitting}
              onClick={handleSubmit(onSubmit)}
            >
              {isSubmitting ? (
                <><Spinner /> Creating…</>
              ) : (
                <><Plug className="h-3.5 w-3.5" /> Create account</>
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}