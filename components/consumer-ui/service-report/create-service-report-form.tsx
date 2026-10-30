'use client'

import { useState, useEffect, useMemo } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Loader2, Check, ChevronsUpDown, ClipboardList, Plus, Gauge, MapPin, AlertTriangle,
  ImagePlus, X,
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
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'

import {
  getMyMeterAccounts,
  getConsumerServiceIssueTypes,
  getBarangays,
  searchZones,
  createConsumerServiceReport,
  type ConsumerMeterAccountOption,
  type IssueTypeOption,
  type BarangayOption,
  type ZoneOption,
} from '@/lib/actions/service-report/service-report.actions'

// meter_account_id is used for account-scoped issues, zone_id for zone-wide issues
// (e.g. a mainline leak) — exactly one of the two is required, decided by the
// selected issue type's target_type.
const schema = z
  .object({
    issue_type_id: z.string().uuid('Please select an issue type'),
    meter_account_id: z.string().uuid().optional().or(z.literal('')),
    zone_id: z.string().uuid().optional().or(z.literal('')),
    report_description: z.string().max(2000, 'Description is too long').optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.meter_account_id && !val.zone_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Please make a selection',
        path: ['meter_account_id'],
      })
    }
  })

type FormData = z.infer<typeof schema>

interface Props {
  onSuccess?: () => void
}

export default function ConsumerServiceReportForm({ onSuccess }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // `loadingMeta` drives the spinner. `metaLoaded` flips true only after a
  // *successful* Promise.all — never on failure. The "no meter account"
  // warning is gated on `metaLoaded` so a failed lookup no longer lies
  // about the consumer having no accounts.
  const [loadingMeta, setLoadingMeta] = useState(false)
  const [metaLoaded, setMetaLoaded] = useState(false)
  const [metaError, setMetaError] = useState<string | null>(null)

  const [myAccounts, setMyAccounts] = useState<ConsumerMeterAccountOption[]>([])
  const [issueTypes, setIssueTypes] = useState<IssueTypeOption[]>([])

  // Issue type combobox
  const [issueTypeOpen, setIssueTypeOpen] = useState(false)

  // Meter account combobox (account-scoped issues)
  const [maOpen, setMaOpen] = useState(false)

  // Barangay → Zone cascade (zone-wide issues, e.g. mainline leak)
  const [barangays, setBarangays] = useState<BarangayOption[]>([])
  const [barangayOpen, setBarangayOpen] = useState(false)
  const [selectedBarangay, setSelectedBarangay] = useState<BarangayOption | null>(null)

  const [zoneQuery, setZoneQuery] = useState('')
  const [zoneOpen, setZoneOpen] = useState(false)
  const [zoneResults, setZoneResults] = useState<ZoneOption[]>([])
  const [zoneSearching, setZoneSearching] = useState(false)
  const [selectedZone, setSelectedZone] = useState<ZoneOption | null>(null)
  const debouncedZoneQuery = useDebouncedSearch(zoneQuery)

  // Evidence photos (optional, up to 3)
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([])
  const [evidencePreviews, setEvidencePreviews] = useState<string[]>([])
  const [evidenceError, setEvidenceError] = useState<string | null>(null)

  const {
    control, handleSubmit, reset, setValue, watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      issue_type_id: '', meter_account_id: '', zone_id: '', report_description: '',
    },
  })

  function clearEvidence() {
    evidencePreviews.forEach((url) => URL.revokeObjectURL(url))
    setEvidenceFiles([])
    setEvidencePreviews([])
    setEvidenceError(null)
  }

  function handleEvidenceChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!picked.length) return

    const next: File[] = [...evidenceFiles]
    const nextPreviews: string[] = [...evidencePreviews]
    let err: string | null = null

    for (const file of picked) {
      if (next.length >= 3) {
        err = 'You can attach up to 3 photos.'
        break
      }
      if (file.size > 5 * 1024 * 1024) {
        err = 'Each photo must be 5 MB or less.'
        continue
      }
      if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
        err = 'Only PNG, JPG, or WEBP images are allowed.'
        continue
      }
      next.push(file)
      nextPreviews.push(URL.createObjectURL(file))
    }

    setEvidenceFiles(next)
    setEvidencePreviews(nextPreviews)
    setEvidenceError(err)
  }

  function removeEvidenceAt(index: number) {
    URL.revokeObjectURL(evidencePreviews[index]!)
    setEvidenceFiles((prev) => prev.filter((_, i) => i !== index))
    setEvidencePreviews((prev) => prev.filter((_, i) => i !== index))
    setEvidenceError(null)
  }

  const selectedIssueTypeId = watch('issue_type_id')
  const selectedIssueType = useMemo(
    () => issueTypes.find((it) => it.issue_type_id === selectedIssueTypeId) ?? null,
    [issueTypes, selectedIssueTypeId],
  )
  const targetMode = selectedIssueType?.target_type ?? null
  const isZoneIssue = targetMode === 'zone'

  const selectedMeterAccountId = watch('meter_account_id')
  const selectedMeterAccount = useMemo(
    () => myAccounts.find((m) => m.meter_account_id === selectedMeterAccountId) ?? null,
    [myAccounts, selectedMeterAccountId],
  )

  // ── Load meta on open ──
  // Both `metaLoaded` and `loadingMeta` are reset at the start so a re-open
  // always re-fetches. On failure, `metaLoaded` stays false and `metaError`
  // is set — the warning will not fire, and the consumer sees the error.
  useEffect(() => {
    if (!isOpen) return

    setLoadingMeta(true)
    setMetaLoaded(false)
    setMetaError(null)

    Promise.all([
      getMyMeterAccounts(),
      getConsumerServiceIssueTypes(),
      getBarangays(),
    ])
      .then(([accounts, issues, brgys]) => {
        setMyAccounts(accounts)
        setIssueTypes(issues)
        setBarangays(brgys)
        // Auto-select if the consumer only has one reportable account
        if (accounts.length === 1) {
          setValue('meter_account_id', accounts[0].meter_account_id)
        }
        setMetaLoaded(true)
      })
      .catch((err) => {
        setMetaError(err?.message || 'Failed to load your account details')
        toast.error('Failed to load your account details')
      })
      .finally(() => setLoadingMeta(false))
  }, [isOpen, setValue])

  // Clear whichever target the current issue type doesn't use, whenever it changes.
  useEffect(() => {
    if (targetMode === 'zone') {
      setValue('meter_account_id', '')
    } else if (targetMode === 'account') {
      setValue('zone_id', '')
      setSelectedZone(null)
      setSelectedBarangay(null)
      setZoneQuery('')
      if (myAccounts.length === 1) {
        setValue('meter_account_id', myAccounts[0].meter_account_id)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetMode, setValue])

  // Zone search — only once a barangay is picked
  useEffect(() => {
    if (!isOpen || targetMode !== 'zone' || !selectedBarangay) {
      setZoneResults([])
      return
    }
    setZoneSearching(true)
    searchZones(debouncedZoneQuery, selectedBarangay.barangay_id)
      .then(setZoneResults)
      .catch(() => toast.error('Zone search failed'))
      .finally(() => setZoneSearching(false))
  }, [isOpen, targetMode, selectedBarangay, debouncedZoneQuery])

  function resetForm() {
    reset({
      issue_type_id: '', meter_account_id: '', zone_id: '', report_description: '',
    })
    setSelectedZone(null)
    setSelectedBarangay(null)
    setZoneQuery('')
    setMetaError(null)
    setMetaLoaded(false)
    clearEvidence()
  }

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true)
    try {
      const res = await createConsumerServiceReport({
        issue_type_id: data.issue_type_id,
        meter_account_id: targetMode === 'account' ? (data.meter_account_id || undefined) : undefined,
        zone_id: targetMode === 'zone' ? (data.zone_id || undefined) : undefined,
        report_description: data.report_description?.trim() || undefined,
        evidence: evidenceFiles.length ? evidenceFiles : undefined,
      })

      if (res.status === 'success') {
        toast.success(res.message || 'Service report submitted')
        setIsOpen(false)
        resetForm()
        onSuccess?.()
      } else {
        toast.error(res.message || 'Failed to submit service report')
      }
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Warning only fires when the load SUCCEEDED and returned zero accounts.
  // If meta load failed, `metaError` renders instead and this stays hidden.
  const noMeterAccounts = metaLoaded && myAccounts.length === 0

  const submitDisabled =
    isSubmitting ||
    loadingMeta ||
    (targetMode === 'account' && (noMeterAccounts || !!metaError))

  return (
    <Sheet open={isOpen} onOpenChange={(o) => { setIsOpen(o); if (!o) resetForm() }}>
      <SheetTrigger asChild>
        <Button className="h-9 gap-2 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-semibold shadow-sm">
          <Plus className="h-4 w-4" />
          Report an Issue
        </Button>
      </SheetTrigger>

      <SheetContent className="w-full sm:max-w-md flex flex-col h-full p-0 gap-0 border-l border-slate-200 bg-white">

        {/* Header */}
        <div className="px-7 pt-6 pb-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="h-10 w-10 rounded-lg bg-violet-600 flex items-center justify-center shrink-0 shadow-sm shadow-violet-200">
              <ClipboardList className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-[15px] font-bold text-slate-900 leading-tight">
                Report an Issue
              </SheetTitle>
              <p className="text-xs text-slate-400 mt-0.5">
                For your meter, or a wider issue like a mainline leak in your area
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-slate-50/60 px-7 py-6 space-y-6">

          {loadingMeta && (
            <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading your account…
            </div>
          )}

          {!loadingMeta && (
            <>
              {/* Issue type combobox */}
              <div className="space-y-2.5 relative z-40">
                <Label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  <ClipboardList className="h-3 w-3 text-violet-500" />
                  Issue Type <span className="text-red-500">*</span>
                </Label>
                <Controller
                  control={control}
                  name="issue_type_id"
                  render={({ field }) => (
                    <div>
                      <Popover open={issueTypeOpen} onOpenChange={setIssueTypeOpen} modal={false}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            className={cn(
                              'w-full justify-between h-11 px-3.5 rounded-lg text-[13px] border bg-white font-normal shadow-sm',
                              errors.issue_type_id ? 'border-rose-300' : 'border-slate-200 hover:border-violet-300',
                              field.value ? 'text-slate-700' : 'text-slate-400',
                            )}
                          >
                            <span className="truncate">
                              {selectedIssueType?.issue_name || 'What\u2019s going on?'}
                            </span>
                            <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-2" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-[var(--radix-popover-trigger-width)] p-0 bg-white border border-slate-200 rounded-lg shadow-lg"
                          align="start" sideOffset={6} collisionPadding={12} avoidCollisions side="bottom"
                        >
                          <Command>
                            <CommandInput placeholder="Search issue type…" className="h-10 text-[13px]" />
                            <CommandList className="max-h-64">
                              <CommandEmpty className="text-[12px] text-slate-400 py-5 text-center px-4">
                                No issue types found
                              </CommandEmpty>
                              <CommandGroup>
                                {issueTypes.map((it) => (
                                  <CommandItem
                                    key={it.issue_type_id}
                                    value={it.issue_name}
                                    onSelect={() => {
                                      field.onChange(it.issue_type_id)
                                      setIssueTypeOpen(false)
                                    }}
                                    className="cursor-pointer text-[13px] py-2.5 gap-2.5"
                                  >
                                    <div className="h-7 w-7 rounded-md bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                                      <ClipboardList className="h-3.5 w-3.5" />
                                    </div>
                                    <p className="font-medium text-slate-700 truncate flex-1">{it.issue_name}</p>
                                    {it.target_type === 'zone' && (
                                      <span className="text-[9px] font-bold uppercase tracking-wide text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded shrink-0">
                                        Zone-wide
                                      </span>
                                    )}
                                    {field.value === it.issue_type_id && (
                                      <Check className="h-3.5 w-3.5 text-violet-500 ml-auto shrink-0" />
                                    )}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      {errors.issue_type_id && (
                        <p className="text-[11px] text-rose-500 mt-1.5">{errors.issue_type_id.message}</p>
                      )}
                    </div>
                  )}
                />
              </div>

              {/* Meter account — account-scoped issues */}
              {targetMode === 'account' && (
                <div className="space-y-2.5 relative z-30">
                  <Label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    <Gauge className="h-3 w-3 text-violet-500" />
                    Meter Account <span className="text-red-500">*</span>
                  </Label>

                  {/* Meta load failed — show that, not the "no accounts" warning */}
                  {metaError ? (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 flex items-start gap-2.5">
                      <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-xs text-rose-700 font-medium">
                          Couldn&apos;t load your account details.
                        </p>
                        <p className="text-[11px] text-rose-600 mt-0.5">{metaError}</p>
                      </div>
                    </div>
                  ) : noMeterAccounts ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-2.5">
                      <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-700">
                        No active meter account is registered under your name yet, so there&apos;s nothing to file this report against.
                      </p>
                    </div>
                  ) : myAccounts.length === 1 ? (
                    <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5">
                      <Gauge className="h-4 w-4 text-slate-400 shrink-0" />
                      <span className="text-[13px] font-mono font-medium text-slate-700">
                        {myAccounts[0].meter_serial_no}
                      </span>
                      <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                        Your account
                      </span>
                    </div>
                  ) : (
                    <Controller
                      control={control}
                      name="meter_account_id"
                      render={({ field }) => (
                        <div>
                          <Popover open={maOpen} onOpenChange={setMaOpen} modal={false}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                className={cn(
                                  'w-full justify-between h-11 px-3.5 rounded-lg text-[13px] border bg-white font-normal shadow-sm',
                                  errors.meter_account_id ? 'border-rose-300' : 'border-slate-200 hover:border-violet-300',
                                  field.value ? 'text-slate-700' : 'text-slate-400',
                                )}
                              >
                                <span className="truncate">
                                  {selectedMeterAccount?.meter_serial_no || 'Select meter by serial no.…'}
                                </span>
                                <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-2" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent
                              className="w-[var(--radix-popover-trigger-width)] p-0 bg-white border border-slate-200 rounded-lg shadow-lg"
                              align="start" sideOffset={6} collisionPadding={12} avoidCollisions side="bottom"
                            >
                              <Command>
                                <CommandInput placeholder="Search your meter accounts…" className="h-10 text-[13px]" />
                                <CommandList className="max-h-64">
                                  <CommandEmpty className="text-[12px] text-slate-400 py-5 text-center px-4">
                                    No meter accounts found
                                  </CommandEmpty>
                                  <CommandGroup>
                                    {myAccounts.map((m) => (
                                      <CommandItem
                                        key={m.meter_account_id}
                                        value={m.meter_serial_no ?? m.meter_account_id}
                                        onSelect={() => {
                                          field.onChange(m.meter_account_id)
                                          setMaOpen(false)
                                        }}
                                        className="cursor-pointer text-[13px] py-2.5 gap-2.5"
                                      >
                                        <div className="h-7 w-7 rounded-md bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                                          <Gauge className="h-3.5 w-3.5" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <p className="font-medium text-slate-700 truncate">{m.meter_serial_no}</p>
                                          <p className="text-[11px] text-slate-400 truncate">
                                            {m.zone_name}, {m.barangay_name}
                                          </p>
                                        </div>
                                        {field.value === m.meter_account_id && (
                                          <Check className="h-3.5 w-3.5 text-violet-500 ml-auto shrink-0" />
                                        )}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                          {errors.meter_account_id && (
                            <p className="text-[11px] text-rose-500 mt-1.5">{errors.meter_account_id.message}</p>
                          )}
                        </div>
                      )}
                    />
                  )}
                  {myAccounts.length === 1 && errors.meter_account_id && (
                    <p className="text-[11px] text-rose-500">{errors.meter_account_id.message}</p>
                  )}

                  {selectedMeterAccount && (
                    <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 text-[12px] text-slate-600 flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                      {selectedMeterAccount.zone_name}, {selectedMeterAccount.barangay_name}
                    </div>
                  )}
                </div>
              )}

              {/* Barangay → Zone cascade for zone-wide issues */}
              {isZoneIssue && (
                <div className="space-y-5">
                  <div className="space-y-2.5 relative z-30">
                    <Label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                      <MapPin className="h-3 w-3 text-violet-500" />
                      Barangay <span className="text-red-500">*</span>
                    </Label>
                    <Popover open={barangayOpen} onOpenChange={setBarangayOpen} modal={false}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className={cn(
                            'w-full justify-between h-11 px-3.5 rounded-lg text-[13px] border bg-white font-normal shadow-sm',
                            'border-slate-200 hover:border-violet-300',
                            selectedBarangay ? 'text-slate-700' : 'text-slate-400',
                          )}
                        >
                          <span className="truncate">
                            {selectedBarangay?.barangay_name || 'Search barangay…'}
                          </span>
                          <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-2" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-[var(--radix-popover-trigger-width)] p-0 bg-white border border-slate-200 rounded-lg shadow-lg"
                        align="start" sideOffset={6} collisionPadding={12} avoidCollisions side="bottom"
                      >
                        <Command>
                          <CommandInput placeholder="Search barangay…" className="h-10 text-[13px]" />
                          <CommandList className="max-h-64">
                            <CommandEmpty className="text-[12px] text-slate-400 py-5 text-center px-4">
                              No barangays found
                            </CommandEmpty>
                            <CommandGroup>
                              {barangays.map((b) => (
                                <CommandItem
                                  key={b.barangay_id}
                                  value={b.barangay_name}
                                  onSelect={() => {
                                    setSelectedBarangay(b)
                                    setValue('zone_id', '')
                                    setSelectedZone(null)
                                    setBarangayOpen(false)
                                  }}
                                  className="cursor-pointer text-[13px] py-2.5 gap-2.5"
                                >
                                  <div className="h-7 w-7 rounded-md bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                                    <MapPin className="h-3.5 w-3.5" />
                                  </div>
                                  <p className="font-medium text-slate-700 truncate flex-1">{b.barangay_name}</p>
                                  {selectedBarangay?.barangay_id === b.barangay_id && (
                                    <Check className="h-3.5 w-3.5 text-violet-500 ml-auto shrink-0" />
                                  )}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2.5 relative z-20">
                    <Label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                      Zone <span className="text-red-500">*</span>
                    </Label>
                    <Controller
                      control={control}
                      name="zone_id"
                      render={({ field }) => (
                        <div>
                          <Popover open={zoneOpen} onOpenChange={setZoneOpen} modal={false}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                disabled={!selectedBarangay}
                                className={cn(
                                  'w-full justify-between h-11 px-3.5 rounded-lg text-[13px] border bg-white font-normal shadow-sm disabled:opacity-60',
                                  errors.zone_id ? 'border-rose-300' : 'border-slate-200 hover:border-violet-300',
                                  field.value ? 'text-slate-700' : 'text-slate-400',
                                )}
                              >
                                <span className="truncate">
                                  {selectedZone?.label || (selectedBarangay ? 'Search zone name…' : 'Select a barangay first')}
                                </span>
                                <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-2" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent
                              className="w-[var(--radix-popover-trigger-width)] p-0 bg-white border border-slate-200 rounded-lg shadow-lg"
                              align="start" sideOffset={6} collisionPadding={12} avoidCollisions side="bottom"
                            >
                              <Command shouldFilter={false}>
                                <CommandInput
                                  placeholder="Search zone name…"
                                  value={zoneQuery}
                                  onValueChange={setZoneQuery}
                                  className="h-10 text-[13px]"
                                />
                                <CommandList className="max-h-64">
                                  {zoneSearching && (
                                    <div className="flex items-center justify-center gap-2 py-5 text-[12px] text-slate-400">
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                                    </div>
                                  )}
                                  {!zoneSearching && zoneResults.length === 0 && (
                                    <CommandEmpty className="text-[12px] text-slate-400 py-5 text-center px-4">
                                      No zones found in this barangay
                                    </CommandEmpty>
                                  )}
                                  {!zoneSearching && zoneResults.length > 0 && (
                                    <CommandGroup>
                                      {zoneResults.map((z) => (
                                        <CommandItem
                                          key={z.zone_id}
                                          value={z.zone_id}
                                          onSelect={() => {
                                            field.onChange(z.zone_id)
                                            setSelectedZone(z)
                                            setZoneOpen(false)
                                          }}
                                          className="cursor-pointer text-[13px] py-2.5 gap-2.5"
                                        >
                                          <div className="h-7 w-7 rounded-md bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                                            <MapPin className="h-3.5 w-3.5" />
                                          </div>
                                          <p className="font-medium text-slate-700 truncate flex-1">{z.zone_name}</p>
                                          {field.value === z.zone_id && (
                                            <Check className="h-3.5 w-3.5 text-violet-500 ml-auto shrink-0" />
                                          )}
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  )}
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                          {errors.zone_id && (
                            <p className="text-[11px] text-rose-500 mt-1.5">{errors.zone_id.message}</p>
                          )}
                        </div>
                      )}
                    />
                  </div>
                </div>
              )}

              {/* Description */}
              <div className="space-y-2.5">
                <Label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Description <span className="text-slate-400 normal-case font-normal">(optional)</span>
                </Label>
                <Controller
                  control={control}
                  name="report_description"
                  render={({ field }) => (
                    <Textarea
                      {...field}
                      placeholder="Tell us what happened — e.g. when you noticed it, what it looked like…"
                      className="rounded-lg text-[13px] bg-white border-slate-200 min-h-[96px]"
                    />
                  )}
                />
                {errors.report_description && (
                  <p className="text-[11px] text-rose-500">{errors.report_description.message}</p>
                )}
              </div>

              {/* Evidence photos */}
              <div className="space-y-2.5">
                <Label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  <ImagePlus className="h-3 w-3 text-violet-500" />
                  Evidence Photos{' '}
                  <span className="text-slate-400 normal-case font-normal">(optional, up to 3)</span>
                </Label>
                <label
                  className={cn(
                    'flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed bg-white px-4 py-5 cursor-pointer transition-colors',
                    evidenceError
                      ? 'border-rose-300 hover:border-rose-400'
                      : 'border-slate-200 hover:border-violet-300',
                  )}
                >
                  <ImagePlus className="h-5 w-5 text-slate-400" />
                  <span className="text-[12px] text-slate-600 font-medium">
                    {evidenceFiles.length ? 'Add another photo' : 'Upload photo evidence'}
                  </span>
                  <span className="text-[10px] text-slate-400">PNG, JPG or WEBP — max 5 MB each</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    className="hidden"
                    onChange={handleEvidenceChange}
                    disabled={evidenceFiles.length >= 3}
                  />
                </label>
                {evidenceError && (
                  <p className="text-[11px] text-rose-500">{evidenceError}</p>
                )}
                {evidencePreviews.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {evidencePreviews.map((src, i) => (
                      <div
                        key={src}
                        className="relative rounded-md overflow-hidden border border-slate-200 bg-slate-50 aspect-square"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt={`Evidence ${i + 1}`} className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeEvidenceAt(i)}
                          className="absolute top-1 right-1 h-6 w-6 rounded-full bg-slate-900/60 text-white flex items-center justify-center hover:bg-slate-900/80"
                          aria-label="Remove photo"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
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
              className="rounded-md h-10 px-5 text-[13px] bg-violet-600 hover:bg-violet-700 text-white font-semibold gap-2"
              disabled={submitDisabled}
              onClick={handleSubmit(onSubmit)}
            >
              {isSubmitting ? (
                <><Spinner /> Submitting…</>
              ) : (
                <><ClipboardList className="h-3.5 w-3.5" /> Submit Report</>
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}