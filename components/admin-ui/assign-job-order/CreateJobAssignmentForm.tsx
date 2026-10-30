'use client'

import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import {
  Loader2, Check, ChevronsUpDown, Plus, ClipboardList,
  MapPin, UserRound, Users, CalendarClock, PackageCheck, Calendar as CalendarIcon,
  X, HardHat,
} from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

import {
  Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'

import {
  getAssignableBarangays,
  getAssignableJobOrders,
  getFieldWorkers,
  createJobAssignment,
  type AssignableBarangay,
  type AssignableJobOrder,
  type FieldWorker,
} from '@/lib/actions/job-assignment/job-assignment.actions'

const schema = z.object({
  barangay_id: z.string().min(1, 'Please select a barangay'),
  job_order_ids: z.array(z.string()).min(1, 'Select at least one job order'),
  assigned_to: z.string().min(1, 'Please select a field worker'),
  helper_ids: z.array(z.string()),
  scheduled_at: z.string().min(1, 'Please pick a schedule date'),
})

type FormData = z.infer<typeof schema>

interface CreateJobAssignmentFormProps {
  onSuccess?: () => void
}

const pad2 = (n: number) => String(n).padStart(2, '0')

function applySchedule(date: Date | undefined, onChange: (v: string) => void) {
  if (!date) { onChange(''); return }
  onChange(`${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T12:00:00+08:00`)
}

function initials(fullName: string) {
  return fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
}

function jobOrderSubtitle(jo: AssignableJobOrder) {
  return jo.process_type === 'Service Report'
    ? `${jo.zone_name ?? 'Zone-wide'}${jo.issue_name ? ` · ${jo.issue_name}` : ''}`
    : `${jo.meter_serial_no ?? '—'} — ${jo.consumer_name ?? '—'}`
}

export default function CreateJobAssignmentForm({ onSuccess }: CreateJobAssignmentFormProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [barangays, setBarangays] = useState<AssignableBarangay[]>([])
  const [jobOrders, setJobOrders] = useState<AssignableJobOrder[]>([])
  const [jobOrdersLoading, setJobOrdersLoading] = useState(false)
  const [jobOrderOpen, setJobOrderOpen] = useState(false)

  const [workers, setWorkers] = useState<FieldWorker[]>([])
  const [workerOpen, setWorkerOpen] = useState(false)
  const [selectedWorkerLabel, setSelectedWorkerLabel] = useState('')

  const [helperOpen, setHelperOpen] = useState(false)

  const [barangayOpen, setBarangayOpen] = useState(false)
  const [selectedBarangayLabel, setSelectedBarangayLabel] = useState('')

  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(undefined)

  const {
    control, handleSubmit, watch, setValue, reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { barangay_id: '', job_order_ids: [], assigned_to: '', helper_ids: [], scheduled_at: '' },
  })

  const barangayId = watch('barangay_id')
  const selectedJobOrderIds = watch('job_order_ids')
  const assignedTo = watch('assigned_to')
  const helperIds = watch('helper_ids')
  const scheduledAt = watch('scheduled_at')

  useEffect(() => {
    if (!isOpen) return
    Promise.all([getAssignableBarangays(), getFieldWorkers()])
      .then(([b, w]) => { setBarangays(b); setWorkers(w) })
      .catch(() => toast.error('Failed to load form data'))
  }, [isOpen])

  useEffect(() => {
    if (!barangayId) { setJobOrders([]); return }
    setJobOrdersLoading(true)
    setValue('job_order_ids', [])
    getAssignableJobOrders(barangayId)
      .then(setJobOrders)
      .catch(() => toast.error('Failed to load job orders for this barangay'))
      .finally(() => setJobOrdersLoading(false))
  }, [barangayId, setValue])

  // A worker can't also be their own helper — if they get picked as the
  // assignee after already being ticked as a helper, drop them from the list.
  useEffect(() => {
    if (!assignedTo) return
    const current = helperIds ?? []
    if (current.includes(assignedTo)) {
      setValue('helper_ids', current.filter((id) => id !== assignedTo), { shouldValidate: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignedTo])

  function resetForm() {
    reset({ barangay_id: '', job_order_ids: [], assigned_to: '', helper_ids: [], scheduled_at: '' })
    setSelectedWorkerLabel('')
    setSelectedBarangayLabel('')
    setJobOrders([])
    setScheduleDate(undefined)
  }

  function toggleJobOrder(id: string, checked: boolean) {
    const current = selectedJobOrderIds ?? []
    setValue(
      'job_order_ids',
      checked ? [...current, id] : current.filter((x) => x !== id),
      { shouldValidate: true },
    )
  }

  function toggleSelectAll(checked: boolean) {
    setValue('job_order_ids', checked ? jobOrders.map((jo) => jo.job_order_id) : [], { shouldValidate: true })
  }

  function removeJobOrder(id: string) {
    setValue('job_order_ids', (selectedJobOrderIds ?? []).filter((x) => x !== id), { shouldValidate: true })
  }

  function toggleHelper(id: string, checked: boolean) {
    const current = helperIds ?? []
    setValue(
      'helper_ids',
      checked ? [...current, id] : current.filter((x) => x !== id),
      { shouldValidate: true },
    )
  }

  function removeHelper(id: string) {
    setValue('helper_ids', (helperIds ?? []).filter((x) => x !== id), { shouldValidate: true })
  }

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true)
    try {
      const res = await createJobAssignment({
        barangay_id: data.barangay_id,
        job_order_ids: data.job_order_ids,
        assigned_to: data.assigned_to,
        helper_ids: data.helper_ids ?? [],
        scheduled_at: data.scheduled_at,
      })

      if (res.status === 'success') {
        toast.success(res.message || 'Job orders assigned')
        setIsOpen(false)
        resetForm()
        onSuccess?.()
      } else {
        toast.error(res.message || 'Failed to create assignment')
      }
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  const allSelected = jobOrders.length > 0 && selectedJobOrderIds?.length === jobOrders.length
  const helperCandidates = workers.filter((w) => w.user_id !== assignedTo)
  const selectedHelpers = workers.filter((w) => helperIds?.includes(w.user_id))
  const selectedJobOrders = jobOrders.filter((jo) => selectedJobOrderIds?.includes(jo.job_order_id))

  const jobOrderTriggerLabel = !barangayId
    ? 'Pick a barangay first…'
    : jobOrdersLoading
      ? 'Loading job orders…'
      : selectedJobOrderIds?.length
        ? `${selectedJobOrderIds.length} job order${selectedJobOrderIds.length !== 1 ? 's' : ''} selected`
        : 'Select job orders…'

  // Date-only label for the schedule trigger + footer recap.
  const scheduleLabel = scheduledAt
    ? format(new Date(scheduledAt), 'MMM d, yyyy')
    : scheduleDate
      ? format(scheduleDate, 'MMM d, yyyy')
      : null

  const triggerClass = (hasValue: boolean, hasError: boolean) =>
    cn(
      'w-full justify-between h-11 px-3.5 rounded-md text-[13px] border bg-white font-normal',
      'transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed',
      hasError
        ? 'border-rose-300'
        : hasValue
          ? 'border-violet-300 bg-violet-50/40 hover:border-violet-400'
          : 'border-slate-200 hover:border-violet-300',
    )

  const iconBoxClass = (hasValue: boolean) =>
    cn(
      'h-6 w-6 rounded-md flex items-center justify-center shrink-0 transition-colors',
      hasValue ? 'bg-violet-100 text-violet-600' : 'bg-slate-100 text-slate-400',
    )

  return (
    <Sheet open={isOpen} onOpenChange={(o) => { setIsOpen(o); if (!o) resetForm() }}>
      <SheetTrigger asChild>
        <Button className="h-9 gap-2 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-semibold border border-violet-700">
          <Plus className="h-4 w-4" />
          Assign Job Orders
        </Button>
      </SheetTrigger>

      <SheetContent className="w-full sm:max-w-lg flex flex-col h-full p-0 gap-0 border-l border-slate-200 bg-white">

        {/* Header */}
        <div className="px-7 pt-6 pb-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="h-10 w-10 rounded-md bg-violet-600 border border-violet-700 flex items-center justify-center shrink-0">
              <PackageCheck className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-[15px] font-bold text-slate-900 leading-tight">
                Bulk Assign Job Orders
              </SheetTitle>
              <p className="text-[12px] text-slate-500 mt-1 leading-snug">
                Group pending job orders and schedule a field crew
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-slate-50/60 px-7 py-6 space-y-6">

          {/* Step 1 — Barangay */}
          <div className="space-y-2.5 relative z-50">
            <Label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              <MapPin className="h-3 w-3 text-violet-500" />
              Barangay <span className="text-red-500">*</span>
            </Label>
            <Controller
              control={control}
              name="barangay_id"
              render={({ field }) => (
                <div>
                  <Popover open={barangayOpen} onOpenChange={setBarangayOpen} modal={false}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className={cn(triggerClass(!!field.value, !!errors.barangay_id), !field.value && 'text-slate-400')}
                      >
                        <span className="flex items-center gap-2.5 truncate">
                          <span className={iconBoxClass(!!field.value)}>
                            <MapPin className="h-3 w-3" />
                          </span>
                          <span className="truncate">{selectedBarangayLabel || 'Select a barangay…'}</span>
                        </span>
                        <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-2" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[var(--radix-popover-trigger-width)] p-0 bg-white border border-slate-200 rounded-md"
                      align="start" sideOffset={6} collisionPadding={12} avoidCollisions side="bottom"
                    >
                      <Command>
                        <CommandInput placeholder="Search barangay…" className="h-10 text-[13px]" />
                        <CommandList className="max-h-64">
                          <CommandEmpty className="text-[12px] text-slate-400 py-5 text-center">
                            {barangays.length === 0 ? 'No barangays with assignable job orders' : 'No barangay found'}
                          </CommandEmpty>
                          <CommandGroup>
                            {barangays.map((b) => (
                              <CommandItem
                                key={b.barangay_id}
                                value={b.barangay_name}
                                onSelect={() => {
                                  field.onChange(b.barangay_id)
                                  setSelectedBarangayLabel(b.barangay_name)
                                  setBarangayOpen(false)
                                }}
                                className={cn(
                                  'cursor-pointer text-[13px] py-2.5 gap-2.5 rounded-md',
                                  field.value === b.barangay_id && 'bg-violet-50',
                                )}
                              >
                                <div className="h-7 w-7 rounded-md bg-violet-100 text-violet-600 border border-violet-200 flex items-center justify-center shrink-0">
                                  <MapPin className="h-3.5 w-3.5" />
                                </div>
                                <p className="font-medium text-slate-700 truncate">{b.barangay_name}</p>
                                {field.value === b.barangay_id && <Check className="h-3.5 w-3.5 text-violet-500 ml-auto shrink-0" />}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {errors.barangay_id && (
                    <p className="text-[11px] text-rose-500 mt-1.5 flex items-center gap-1">
                      <span className="h-1 w-1 rounded-full bg-rose-400" /> {errors.barangay_id.message}
                    </p>
                  )}
                </div>
              )}
            />
          </div>

          {/* Step 2 — Job orders */}
          <div className="space-y-2.5 relative z-30">
            <Label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              <ClipboardList className="h-3 w-3 text-violet-500" />
              Job Orders <span className="text-red-500">*</span>
            </Label>

            <Popover open={jobOrderOpen} onOpenChange={setJobOrderOpen} modal={false}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  disabled={!barangayId || jobOrdersLoading}
                  className={cn(triggerClass(!!selectedJobOrderIds?.length, !!errors.job_order_ids), !selectedJobOrderIds?.length && 'text-slate-400')}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <span className={iconBoxClass(!!selectedJobOrderIds?.length)}>
                      {jobOrdersLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ClipboardList className="h-3 w-3" />}
                    </span>
                    <span className="truncate">{jobOrderTriggerLabel}</span>
                  </span>
                  <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-2" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[var(--radix-popover-trigger-width)] p-0 bg-white border border-slate-200 rounded-md"
                align="start" sideOffset={6} collisionPadding={12} avoidCollisions side="bottom"
              >
                <Command shouldFilter={false}>
                  <CommandInput placeholder="Search job orders…" className="h-10 text-[13px]" />
                  <CommandList className="max-h-64">
                    <CommandEmpty className="text-[12px] text-slate-400 py-5 text-center">
                      {jobOrders.length === 0 ? 'No assignable (Pending) job orders in this barangay' : 'No job order found'}
                    </CommandEmpty>
                    {jobOrders.length > 0 && (
                      <>
                        <div className="px-2 pt-1.5 pb-1">
                          <label className="flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[12px] text-slate-500 font-medium cursor-pointer hover:bg-slate-50">
                            <Checkbox checked={allSelected} onCheckedChange={(v) => toggleSelectAll(!!v)} />
                            Select all ({jobOrders.length})
                          </label>
                        </div>
                        <CommandGroup>
                          {jobOrders.map((jo) => {
                            const checked = selectedJobOrderIds?.includes(jo.job_order_id) ?? false
                            return (
                              <CommandItem
                                key={jo.job_order_id}
                                value={jo.job_order_id}
                                onSelect={() => toggleJobOrder(jo.job_order_id, !checked)}
                                className={cn(
                                  'cursor-pointer text-[13px] py-2.5 gap-2.5 items-start rounded-md',
                                  checked && 'bg-violet-50',
                                )}
                              >
                                <Checkbox checked={checked} className="mt-0.5 shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[12px] font-mono font-bold text-slate-700">{jo.job_order_no ?? '—'}</span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium shrink-0">
                                      {jo.job_type_name}
                                    </span>
                                  </div>
                                  <p className="text-[11.5px] text-slate-500 mt-0.5 truncate">
                                    {jobOrderSubtitle(jo)}
                                  </p>
                                </div>
                              </CommandItem>
                            )
                          })}
                        </CommandGroup>
                      </>
                    )}
                  </CommandList>
                </Command>
                <div className="flex justify-between items-center gap-2 px-3 py-2.5 border-t border-slate-100">
                  <span className="text-[11px] text-slate-400">
                    {selectedJobOrderIds?.length ? `${selectedJobOrderIds.length} selected` : 'None selected'}
                  </span>
                  <Button
                    size="sm"
                    className="h-8 rounded-md text-[12px] bg-violet-600 hover:bg-violet-700 text-white"
                    onClick={() => setJobOrderOpen(false)}
                  >
                    Done
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            {errors.job_order_ids && (
              <p className="text-[11px] text-rose-500 mt-1.5 flex items-center gap-1">
                <span className="h-1 w-1 rounded-full bg-rose-400" /> {errors.job_order_ids.message}
              </p>
            )}

            {selectedJobOrders.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {selectedJobOrders.map((jo) => (
                  <span
                    key={jo.job_order_id}
                    className="inline-flex items-center gap-1.5 pl-2 pr-1.5 py-1 rounded-md bg-violet-50 border border-violet-200 text-[11.5px] font-mono font-semibold text-violet-700"
                  >
                    {jo.job_order_no ?? '—'}
                    <button
                      type="button"
                      onClick={() => removeJobOrder(jo.job_order_id)}
                      className="rounded-md hover:bg-violet-100 p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Step 3 — Crew */}
          <div className="space-y-2.5">
            <Label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              <HardHat className="h-3 w-3 text-violet-500" />
              Field Crew <span className="text-red-500">*</span>
            </Label>

            <div className="rounded-md border border-slate-200 bg-white overflow-hidden p-4 space-y-3.5">

              {/* Assign To */}
              <div className="space-y-1.5 relative z-20">
                <Controller
                  control={control}
                  name="assigned_to"
                  render={({ field }) => (
                    <div>
                      <Popover open={workerOpen} onOpenChange={setWorkerOpen} modal={false}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            className={cn(triggerClass(!!field.value, !!errors.assigned_to), !field.value && 'text-slate-400')}
                          >
                            <span className="flex items-center gap-2.5 truncate">
                              <span className={iconBoxClass(!!field.value)}>
                                <UserRound className="h-3 w-3" />
                              </span>
                              <span className="truncate">{selectedWorkerLabel || 'Assign to field worker…'}</span>
                            </span>
                            <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-2" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-[var(--radix-popover-trigger-width)] p-0 bg-white border border-slate-200 rounded-md"
                          align="start" sideOffset={6} collisionPadding={12} avoidCollisions side="bottom"
                        >
                          <Command shouldFilter>
                            <CommandInput placeholder="Search field workers…" className="h-10 text-[13px]" />
                            <CommandList className="max-h-56">
                              <CommandEmpty className="text-[12px] text-slate-400 py-5 text-center">
                                No field workers found
                              </CommandEmpty>
                              <CommandGroup>
                                {workers.map((w) => (
                                  <CommandItem
                                    key={w.user_id}
                                    value={w.full_name}
                                    onSelect={() => {
                                      field.onChange(w.user_id)
                                      setSelectedWorkerLabel(w.full_name)
                                      setWorkerOpen(false)
                                    }}
                                    className={cn(
                                      'cursor-pointer text-[13px] py-2.5 gap-2.5 rounded-md',
                                      field.value === w.user_id && 'bg-violet-50',
                                    )}
                                  >
                                    <div className="h-7 w-7 rounded-md bg-violet-100 text-violet-600 border border-violet-200 flex items-center justify-center text-[10px] font-bold shrink-0">
                                      {initials(w.full_name)}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-medium text-slate-700 truncate">{w.full_name}</p>
                                      <p className="text-[10.5px] text-slate-400 truncate">{w.role_name}</p>
                                    </div>
                                    {field.value === w.user_id && <Check className="h-3.5 w-3.5 text-violet-500 ml-auto shrink-0" />}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      {errors.assigned_to && (
                        <p className="text-[10.5px] text-rose-500 mt-1.5">{errors.assigned_to.message}</p>
                      )}
                    </div>
                  )}
                />
              </div>

              {/* Helpers */}
              <div className="space-y-1.5 relative z-10">
                <Popover open={helperOpen} onOpenChange={setHelperOpen} modal={false}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className={cn(triggerClass(!!helperIds?.length, false), !helperIds?.length && 'text-slate-400')}
                    >
                      <span className="flex items-center gap-2.5 truncate">
                        <span className={iconBoxClass(!!helperIds?.length)}>
                          <Users className="h-3 w-3" />
                        </span>
                        <span className="truncate">
                          {helperIds?.length ? `${helperIds.length} helper${helperIds.length !== 1 ? 's' : ''} selected` : 'Add helpers (optional)…'}
                        </span>
                      </span>
                      <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-2" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[var(--radix-popover-trigger-width)] p-0 bg-white border border-slate-200 rounded-md"
                    align="start" sideOffset={6} collisionPadding={12} avoidCollisions side="bottom"
                  >
                    <Command shouldFilter>
                      <CommandInput placeholder="Search helpers…" className="h-10 text-[13px]" />
                      <CommandList className="max-h-56">
                        <CommandEmpty className="text-[12px] text-slate-400 py-5 text-center">
                          No field workers found
                        </CommandEmpty>
                        <CommandGroup>
                          {helperCandidates.map((w) => {
                            const checked = helperIds?.includes(w.user_id) ?? false
                            return (
                              <CommandItem
                                key={w.user_id}
                                value={w.full_name}
                                onSelect={() => toggleHelper(w.user_id, !checked)}
                                className={cn('cursor-pointer text-[13px] py-2.5 gap-2.5 rounded-md', checked && 'bg-violet-50')}
                              >
                                <Checkbox checked={checked} className="shrink-0" />
                                <div className="h-7 w-7 rounded-md bg-violet-100 text-violet-600 border border-violet-200 flex items-center justify-center text-[10px] font-bold shrink-0">
                                  {initials(w.full_name)}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-medium text-slate-700 truncate">{w.full_name}</p>
                                  <p className="text-[10.5px] text-slate-400 truncate">{w.role_name}</p>
                                </div>
                              </CommandItem>
                            )
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                    <div className="flex justify-end gap-2 px-3 py-2.5 border-t border-slate-100">
                      <Button
                        size="sm"
                        className="h-8 rounded-md text-[12px] bg-violet-600 hover:bg-violet-700 text-white"
                        onClick={() => setHelperOpen(false)}
                      >
                        Done
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>

                {selectedHelpers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {selectedHelpers.map((w) => (
                      <span
                        key={w.user_id}
                        className="inline-flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded-md bg-violet-50 border border-violet-200 text-[11.5px] text-violet-700 font-medium"
                      >
                        <span className="h-5 w-5 rounded-md bg-violet-100 text-violet-600 flex items-center justify-center text-[9px] font-bold">
                          {initials(w.full_name)}
                        </span>
                        {w.full_name}
                        <button
                          type="button"
                          onClick={() => removeHelper(w.user_id)}
                          className="rounded-md hover:bg-violet-100 p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Step 4 — Schedule (date only) */}
          <div className="space-y-2.5">
            <Label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              <CalendarClock className="h-3 w-3 text-violet-500" />
              Scheduled Date <span className="text-red-500">*</span>
            </Label>
            <Controller
              control={control}
              name="scheduled_at"
              render={({ field }) => (
                <div>
                  <Popover open={scheduleOpen} onOpenChange={setScheduleOpen} modal={false}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(triggerClass(!!field.value, !!errors.scheduled_at), !field.value && 'text-slate-400')}
                      >
                        <span className="flex items-center gap-2.5 truncate">
                          <span className={iconBoxClass(!!field.value)}>
                            <CalendarIcon className="h-3 w-3" />
                          </span>
                          <span className="truncate">
                            {scheduleLabel ?? 'Pick a date…'}
                          </span>
                        </span>
                        <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-2" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-auto p-0 bg-white border border-slate-200 rounded-md"
                      align="start" sideOffset={6} collisionPadding={12} avoidCollisions side="bottom"
                    >
                      <div className="flex items-center justify-between px-4 pt-3 pb-1">
                        <span className="text-[10.5px] font-bold uppercase tracking-widest text-violet-500">
                          Pick a date
                        </span>
                        {scheduleDate && (
                          <span className="text-[11px] text-slate-400">
                            {format(scheduleDate, 'MMM d, yyyy')}
                          </span>
                        )}
                      </div>
                      <Calendar
                        mode="single"
                        selected={scheduleDate}
                        onSelect={(d) => {
                          setScheduleDate(d)
                          applySchedule(d, field.onChange)
                        }}
                        disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                        className="rounded-md"
                      />
                      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-t border-slate-100">
                        <span className="text-[11px] text-slate-400">
                          {scheduleLabel ? `Selected: ${scheduleLabel}` : 'Pick a date'}
                        </span>
                        <Button
                          size="sm"
                          className="h-8 rounded-md text-[12px] bg-violet-600 hover:bg-violet-700 text-white"
                          onClick={() => setScheduleOpen(false)}
                          disabled={!field.value}
                        >
                          Done
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                  {errors.scheduled_at && (
                    <p className="text-[11px] text-rose-500 mt-1.5 flex items-center gap-1">
                      <span className="h-1 w-1 rounded-full bg-rose-400" /> {errors.scheduled_at.message}
                    </p>
                  )}
                </div>
              )}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-7 py-4 border-t border-slate-100 bg-white shrink-0 space-y-2.5">
          {(selectedJobOrderIds?.length || scheduleLabel) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
              {!!selectedJobOrderIds?.length && (
                <span>{selectedJobOrderIds.length} job order{selectedJobOrderIds.length !== 1 ? 's' : ''}</span>
              )}
              {!!selectedJobOrderIds?.length && scheduleLabel && <span className="text-slate-200">|</span>}
              {scheduleLabel && <span>{scheduleLabel}</span>}
            </div>
          )}
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
              className="rounded-md h-10 px-5 text-[13px] bg-violet-600 hover:bg-violet-700 text-white font-semibold border border-violet-700 gap-2"
              disabled={isSubmitting}
              onClick={handleSubmit(onSubmit)}
            >
              {isSubmitting ? (
                <><Spinner /> Assigning…</>
              ) : (
                <><PackageCheck className="h-3.5 w-3.5" /> Assign {selectedJobOrderIds?.length || ''} Job Order{selectedJobOrderIds?.length !== 1 ? 's' : ''}</>
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}