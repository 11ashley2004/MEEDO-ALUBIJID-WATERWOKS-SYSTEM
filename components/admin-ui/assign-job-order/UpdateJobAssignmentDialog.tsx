'use client'

import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { Check, ChevronsUpDown, UserRound, Users, CalendarClock, Calendar as CalendarIcon, X, PenSquare } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

import {
  Sheet, SheetContent, SheetTitle,
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
  getFieldWorkers,
  updateJobAssignment,
  type FieldWorker,
  type JobAssignmentListItem,
} from '@/lib/actions/job-assignment/job-assignment.actions'

const schema = z.object({
  assigned_to: z.string().min(1, 'Please select a field worker'),
  helper_ids: z.array(z.string()),
  scheduled_at: z.string().min(1, 'Please pick a schedule date'),
})

type FormData = z.infer<typeof schema>

interface UpdateJobAssignmentDialogProps {
  assignment: JobAssignmentListItem | null
  onOpenChange: (open: boolean) => void
  onUpdated?: () => void
}

const pad2 = (n: number) => String(n).padStart(2, '0')

// Build an ISO string with an explicit +08:00 (Manila) offset.
// Date-only, matching CreateJobAssignmentForm: schedule is fixed to midnight.
function applySchedule(date: Date | undefined, onChange: (v: string) => void) {
  if (!date) { onChange(''); return }
  const local = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` +
    `T00:00:00+08:00`
  onChange(local)
}

function initials(fullName: string) {
  return fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
}

export function UpdateJobAssignmentDialog({ assignment, onOpenChange, onUpdated }: UpdateJobAssignmentDialogProps) {
  const isOpen = !!assignment
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [workers, setWorkers] = useState<FieldWorker[]>([])
  const [workerOpen, setWorkerOpen] = useState(false)
  const [selectedWorkerLabel, setSelectedWorkerLabel] = useState('')

  const [helperOpen, setHelperOpen] = useState(false)

  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(undefined)

  const {
    control, handleSubmit, watch, setValue, reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { assigned_to: '', helper_ids: [], scheduled_at: '' },
  })

  const assignedTo = watch('assigned_to')
  const helperIds = watch('helper_ids')
  const scheduledAt = watch('scheduled_at')

  // Load workers once, then pre-fill the form whenever a new assignment is
  // opened for editing.
  useEffect(() => {
    if (!isOpen) return
    getFieldWorkers()
      .then((w) => setWorkers(w))
      .catch(() => toast.error('Failed to load field workers'))
  }, [isOpen])

  useEffect(() => {
    if (!assignment) return

    reset({
      assigned_to: assignment.assigned_to_id,
      helper_ids: assignment.helpers.map((h) => h.user_id),
      scheduled_at: assignment.scheduled_at ?? '',
    })
    setSelectedWorkerLabel(assignment.assigned_to_name)

    if (assignment.scheduled_at) {
      setScheduleDate(new Date(assignment.scheduled_at))
    } else {
      setScheduleDate(undefined)
    }
  }, [assignment, reset])

  // A worker can't also be their own helper.
  useEffect(() => {
    if (!assignedTo) return
    const current = helperIds ?? []
    if (current.includes(assignedTo)) {
      setValue('helper_ids', current.filter((id) => id !== assignedTo), { shouldValidate: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignedTo])

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
    if (!assignment) return
    setIsSubmitting(true)
    try {
      const res = await updateJobAssignment(assignment.job_assignment_id, {
        assigned_to: data.assigned_to,
        helper_ids: data.helper_ids ?? [],
        scheduled_at: data.scheduled_at,
      })

      if (res.status === 'success') {
        toast.success(res.message || 'Assignment updated')
        onOpenChange(false)
        onUpdated?.()
      } else {
        toast.error(res.message || 'Failed to update assignment')
      }
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  const helperCandidates = workers.filter((w) => w.user_id !== assignedTo)
  const selectedHelpers = workers.filter((w) => helperIds?.includes(w.user_id))

  // Date-only label for the schedule trigger.
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
    <Sheet open={isOpen} onOpenChange={(o) => { if (!o) onOpenChange(false) }}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col h-full p-0 gap-0 border-l border-slate-200 bg-white">

        {/* Header */}
        <div className="px-7 pt-6 pb-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="h-10 w-10 rounded-md bg-violet-600 border border-violet-700 flex items-center justify-center shrink-0">
              <PenSquare className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-[15px] font-bold text-slate-900 leading-tight">
                Update Assignment
              </SheetTitle>
              <p className="text-[12px] text-slate-500 mt-1 leading-snug">
                {assignment?.job_orders.length ?? 0} job order{(assignment?.job_orders.length ?? 0) !== 1 ? 's' : ''} on this trip
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-slate-50/60 px-7 py-6 space-y-6">

          {/* Field worker */}
          <div className="space-y-2.5 relative z-50">
            <Label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              <UserRound className="h-3 w-3 text-violet-500" />
              Assign To <span className="text-red-500">*</span>
            </Label>
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
                          <span className="truncate">{selectedWorkerLabel || 'Select field worker…'}</span>
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
                    <p className="text-[11px] text-rose-500 mt-1.5">{errors.assigned_to.message}</p>
                  )}
                </div>
              )}
            />
          </div>

          {/* Helpers */}
          <div className="space-y-2.5 relative z-40">
            <Label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              <Users className="h-3 w-3 text-violet-500" />
              Helpers <span className="text-slate-400 normal-case font-medium">(optional, can pick more than one)</span>
            </Label>
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
                      {helperIds?.length ? `${helperIds.length} helper${helperIds.length !== 1 ? 's' : ''} selected` : 'Add helpers…'}
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
              <div className="flex flex-wrap gap-1.5 pt-0.5">
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

          {/* Scheduled date */}
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
                    <p className="text-[11px] text-rose-500 mt-1.5">{errors.scheduled_at.message}</p>
                  )}
                </div>
              )}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-7 py-4 border-t border-slate-100 bg-white shrink-0">
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              className="rounded-md h-10 px-5 text-[13px] border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-600"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-md h-10 px-5 text-[13px] bg-violet-600 hover:bg-violet-700 text-white font-semibold border border-violet-700 gap-2"
              disabled={isSubmitting}
              onClick={handleSubmit(onSubmit)}
            >
              {isSubmitting ? (
                <><Spinner /> Saving…</>
              ) : (
                <><PenSquare className="h-3.5 w-3.5" /> Save Changes</>
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}