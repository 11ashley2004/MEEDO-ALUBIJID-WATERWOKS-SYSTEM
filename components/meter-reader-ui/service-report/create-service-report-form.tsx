'use client'

import { useState, useEffect, useMemo } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Loader2, Check, ChevronsUpDown, ClipboardList, Plus, Plug, MapPin,
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
  getServiceIssueTypes,
  getBarangays,
  searchMeterAccounts,
  searchZones,
  createServiceReport,
  type IssueTypeOption,
  type MeterAccountOption,
  type BarangayOption,
  type ZoneOption,
} from '@/lib/actions/service-report/service-report.actions'

// ── Validation (mirrors the server-side zod schema) ──────────────────────────

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

interface CreateServiceReportFormProps {
  onSuccess?: () => void
}

export default function CreateServiceReportForm({ onSuccess }: CreateServiceReportFormProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Issue type combobox
  const [issueTypes, setIssueTypes] = useState<IssueTypeOption[]>([])
  const [issueTypesLoading, setIssueTypesLoading] = useState(false)
  const [issueTypeOpen, setIssueTypeOpen] = useState(false)

  // Meter account combobox (account-type issues)
  const [maQuery, setMaQuery] = useState('')
  const [maOpen, setMaOpen] = useState(false)
  const [maResults, setMaResults] = useState<MeterAccountOption[]>([])
  const [maSearching, setMaSearching] = useState(false)
  const [selectedMeterAccount, setSelectedMeterAccount] = useState<MeterAccountOption | null>(null)
  const debouncedMaQuery = useDebouncedSearch(maQuery)

  // Barangay combobox → zone combobox cascade (zone-type issues)
  const [barangays, setBarangays] = useState<BarangayOption[]>([])
  const [barangaysLoading, setBarangaysLoading] = useState(false)
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
    control, handleSubmit, reset, watch, setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      issue_type_id: '',
      meter_account_id: '',
      zone_id: '',
      report_description: '',
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

  // The issue type itself decides the target — no manual toggle.
  const targetMode = selectedIssueType?.target_type ?? null

  // Load issue types + barangays once the sheet opens
  useEffect(() => {
    if (!isOpen) return
    setIssueTypesLoading(true)
    getServiceIssueTypes()
      .then(setIssueTypes)
      .catch(() => toast.error('Failed to load issue types'))
      .finally(() => setIssueTypesLoading(false))

    setBarangaysLoading(true)
    getBarangays()
      .then(setBarangays)
      .catch(() => toast.error('Failed to load barangays'))
      .finally(() => setBarangaysLoading(false))
  }, [isOpen])

  // Clear the other target's value whenever the issue type (and thus mode) changes
  useEffect(() => {
    setValue('meter_account_id', '')
    setValue('zone_id', '')
    setSelectedMeterAccount(null)
    setSelectedZone(null)
    setSelectedBarangay(null)
    setMaQuery('')
    setZoneQuery('')
  }, [targetMode, setValue])

  // Meter account search
  useEffect(() => {
    if (!isOpen || targetMode !== 'account') return
    setMaSearching(true)
    searchMeterAccounts(debouncedMaQuery)
      .then(setMaResults)
      .catch(() => toast.error('Meter account search failed'))
      .finally(() => setMaSearching(false))
  }, [isOpen, targetMode, debouncedMaQuery])

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
      issue_type_id: '',
      meter_account_id: '',
      zone_id: '',
      report_description: '',
    })
    setSelectedMeterAccount(null)
    setSelectedZone(null)
    setSelectedBarangay(null)
    setMaQuery('')
    setZoneQuery('')
    clearEvidence()
  }

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true)
    try {
      const res = await createServiceReport({
        issue_type_id: data.issue_type_id,
        meter_account_id: targetMode === 'account' ? data.meter_account_id || null : null,
        zone_id: targetMode === 'zone' ? data.zone_id || null : null,
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

  return (
    <Sheet open={isOpen} onOpenChange={(o) => { setIsOpen(o); if (!o) resetForm() }}>
      <SheetTrigger asChild>
        <Button className="h-9 gap-2 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-semibold shadow-sm">
          <Plus className="h-4 w-4" />
          File Service Report
        </Button>
      </SheetTrigger>

      <SheetContent className="w-full sm:max-w-lg flex flex-col h-full p-0 gap-0 border-l border-slate-200 bg-white">

        {/* Header */}
        <div className="px-7 pt-6 pb-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="h-10 w-10 rounded-lg bg-violet-600 flex items-center justify-center shrink-0 shadow-sm shadow-violet-200">
              <ClipboardList className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-[15px] font-bold text-slate-900 leading-tight">
                New Service Report
              </SheetTitle>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-slate-50/60 px-7 py-6 space-y-6">

          {/* Issue type combobox */}
          <div className="space-y-2.5 relative z-50">
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
                          {selectedIssueType?.issue_name
                            || (issueTypesLoading ? 'Loading issue types…' : 'Search issue type…')}
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
                          {issueTypesLoading && (
                            <div className="flex items-center justify-center gap-2 py-5 text-[12px] text-slate-400">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                            </div>
                          )}
                          {!issueTypesLoading && (
                            <CommandEmpty className="text-[12px] text-slate-400 py-5 text-center px-4">
                              No issue types found
                            </CommandEmpty>
                          )}
                          {!issueTypesLoading && (
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
                                  {field.value === it.issue_type_id && (
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
                  {errors.issue_type_id && (
                    <p className="text-[11px] text-rose-500 mt-1.5">{errors.issue_type_id.message}</p>
                  )}
                </div>
              )}
            />
          </div>

          {/* Meter account (account-type issues) */}
          {targetMode === 'account' && (
            <div className="space-y-2.5 relative z-40">
              <Label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                <Plug className="h-3 w-3 text-violet-500" />
                Meter Account <span className="text-red-500">*</span>
              </Label>
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
                            {selectedMeterAccount?.label || 'Search serial no. or name…'}
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
                            placeholder="Search serial no. or name…"
                            value={maQuery}
                            onValueChange={setMaQuery}
                            className="h-10 text-[13px]"
                          />
                          <CommandList className="max-h-64">
                            {maSearching && (
                              <div className="flex items-center justify-center gap-2 py-5 text-[12px] text-slate-400">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                              </div>
                            )}
                            {!maSearching && maResults.length === 0 && (
                              <CommandEmpty className="text-[12px] text-slate-400 py-5 text-center px-4">
                                No meter accounts found
                              </CommandEmpty>
                            )}
                            {!maSearching && maResults.length > 0 && (
                              <CommandGroup>
                                {maResults.map((m) => (
                                  <CommandItem
                                    key={m.meter_account_id}
                                    value={m.meter_account_id}
                                    onSelect={() => {
                                      field.onChange(m.meter_account_id)
                                      setSelectedMeterAccount(m)
                                      setMaOpen(false)
                                    }}
                                    className="cursor-pointer text-[13px] py-2.5 gap-2.5"
                                  >
                                    <div className="h-7 w-7 rounded-md bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                                      <Plug className="h-3.5 w-3.5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="font-medium text-slate-700 truncate">{m.meter_serial_no || '—'}</p>
                                      <p className="text-[11px] text-slate-400 truncate">{m.consumer_name}</p>
                                    </div>
                                    {field.value === m.meter_account_id && (
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
                    {errors.meter_account_id && (
                      <p className="text-[11px] text-rose-500 mt-1.5">{errors.meter_account_id.message}</p>
                    )}
                  </div>
                )}
              />
              {selectedMeterAccount && (
                <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3.5 text-[12px] text-slate-600 flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                  {selectedMeterAccount.zone_name}, {selectedMeterAccount.barangay_name}
                </div>
              )}
            </div>
          )}

          {/* Barangay combobox → Zone combobox (zone-type issues) */}
          {targetMode === 'zone' && (
            <div className="space-y-5">
              <div className="space-y-2.5 relative z-40">
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
                        {selectedBarangay?.barangay_name
                          || (barangaysLoading ? 'Loading barangays…' : 'Search barangay…')}
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
                        {barangaysLoading && (
                          <div className="flex items-center justify-center gap-2 py-5 text-[12px] text-slate-400">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                          </div>
                        )}
                        {!barangaysLoading && (
                          <CommandEmpty className="text-[12px] text-slate-400 py-5 text-center px-4">
                            No barangays found
                          </CommandEmpty>
                        )}
                        {!barangaysLoading && (
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
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2.5 relative z-30">
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
                  placeholder="Describe what was observed or reported…"
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
              disabled={isSubmitting}
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