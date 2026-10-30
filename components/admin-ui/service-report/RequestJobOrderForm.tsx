'use client'

import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Check, ChevronsUpDown, Wrench, Plus, ClipboardList, MapPin } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
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

import {
  getApprovedServiceReportsNeedingJobOrder,
  requestJobOrderForServiceReport,
  type ApprovedReportOption,
} from '@/lib/actions/service-report/admin-service-report.actions'

const schema = z.object({
  report_id: z.string().min(1, 'Please select a service report'),
})

type FormData = z.infer<typeof schema>

interface RequestJobOrderFormProps {
  onSuccess?: () => void
}

export default function RequestJobOrderForm({ onSuccess }: RequestJobOrderFormProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [srQuery, setSrQuery] = useState('')
  const [srOpen, setSrOpen] = useState(false)
  const [srResults, setSrResults] = useState<ApprovedReportOption[]>([])
  const [srSearching, setSrSearching] = useState(false)
  const [selectedReport, setSelectedReport] = useState<ApprovedReportOption | null>(null)
  const debouncedQuery = useDebouncedSearch(srQuery)

  const {
    control, handleSubmit, reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { report_id: '' },
  })

  useEffect(() => {
    if (!isOpen) return
    setSrSearching(true)
    getApprovedServiceReportsNeedingJobOrder('')
      .then(setSrResults)
      .catch(() => toast.error('Failed to load service reports'))
      .finally(() => setSrSearching(false))
  }, [isOpen])

  useEffect(() => {
  if (!isOpen) return
  let cancelled = false
  setSrSearching(true)
  getApprovedServiceReportsNeedingJobOrder(debouncedQuery)
    .then((res) => { if (!cancelled) setSrResults(res) })
    .catch(() => { if (!cancelled) toast.error('Failed to load service reports') })
    .finally(() => { if (!cancelled) setSrSearching(false) })
  return () => { cancelled = true }
}, [debouncedQuery, isOpen])

  function resetForm() {
    reset({ report_id: '' })
    setSelectedReport(null)
    setSrQuery('')
  }

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true)
    try {
      const res = await requestJobOrderForServiceReport(data.report_id)

      if (res.status === 'success') {
        toast.success(res.message || 'Job order created')
        setIsOpen(false)
        resetForm()
        onSuccess?.()
      } else {
        toast.error(res.message || 'Failed to create job order')
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
          Create Job Order
        </Button>
      </SheetTrigger>

      <SheetContent className="w-full sm:max-w-lg flex flex-col h-full p-0 gap-0 border-l border-slate-200 bg-white">

        {/* Header */}
        <div className="px-7 pt-6 pb-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="h-10 w-10 rounded-lg bg-violet-600 flex items-center justify-center shrink-0 shadow-sm shadow-violet-200">
              <Wrench className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-[15px] font-bold text-slate-900 leading-tight">
                Create Job Order
              </SheetTitle>
              <p className="text-[12px] text-slate-500 mt-1 leading-snug">
                Job type is set automatically based on the report's issue type
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-slate-50/60 px-7 py-6 space-y-6">

          {/* Service report */}
          <div className="space-y-2.5 relative z-50">
            <Label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              <ClipboardList className="h-3 w-3 text-violet-500" />
              Service Report <span className="text-red-500">*</span>
            </Label>
            <Controller
              control={control}
              name="report_id"
              render={({ field }) => (
                <div>
                  <Popover open={srOpen} onOpenChange={setSrOpen} modal={false}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className={cn(
                          'w-full justify-between h-11 px-3.5 rounded-lg text-[13px] border bg-white font-normal shadow-sm',
                          errors.report_id ? 'border-rose-300' : 'border-slate-200 hover:border-violet-300',
                          field.value ? 'text-slate-700' : 'text-slate-400',
                        )}
                      >
                        <span className="truncate">
                          {selectedReport
                            ? `${selectedReport.issue_name} — ${selectedReport.meter_serial_no ?? selectedReport.zone_name}`
                            : 'Search approved reports…'}
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
                          placeholder="Search account, consumer, zone, issue…"
                          value={srQuery}
                          onValueChange={setSrQuery}
                          className="h-10 text-[13px]"
                        />
                        <CommandList className="max-h-64">
                          {srSearching && (
                            <div className="flex items-center justify-center gap-2 py-5 text-[12px] text-slate-400">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                            </div>
                          )}
                          {!srSearching && srResults.length === 0 && (
                            <CommandEmpty className="text-[12px] text-slate-400 py-5 text-center px-4">
                              No approved reports are awaiting a job order
                            </CommandEmpty>
                          )}
                          {!srSearching && srResults.length > 0 && (
                            <CommandGroup>
                              {srResults.map((r) => (
                                <CommandItem
                                  key={r.report_id}
                                  value={r.report_id}
                                  onSelect={() => {
                                    field.onChange(r.report_id)
                                    setSelectedReport(r)
                                    setSrOpen(false)
                                  }}
                                  className="cursor-pointer text-[13px] py-2.5 gap-2.5"
                                >
                                  <div className="h-7 w-7 rounded-md bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                                    <ClipboardList className="h-3.5 w-3.5" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium text-slate-700 truncate">{r.issue_name}</p>
                                    <p className="text-[11px] text-slate-400 truncate">
                                      {r.meter_serial_no
                                        ? `${r.meter_serial_no} · ${r.consumer_name}`
                                        : `${r.zone_name} · ${r.barangay_name}`}
                                    </p>
                                  </div>
                                  {field.value === r.report_id && <Check className="h-3.5 w-3.5 text-violet-500 ml-auto shrink-0" />}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {errors.report_id && (
                    <p className="text-[11px] text-rose-500 mt-1.5">{errors.report_id.message}</p>
                  )}
                </div>
              )}
            />
          </div>

          {/* Selected summary — job type shown read-only, derived from issue type */}
          {selectedReport && (
            <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-4 space-y-2">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-violet-600">
                <ClipboardList className="h-3 w-3" /> Selected Report
              </div>
              <div className="grid grid-cols-2 gap-y-1.5 text-[12.5px]">
                <span className="text-slate-500">Issue</span>
                <span className="font-medium text-slate-700 text-right truncate">{selectedReport.issue_name}</span>
                {selectedReport.meter_serial_no ? (
                  <>
                    <span className="text-slate-500">Serial No.</span>
                    <span className="font-mono font-medium text-slate-700 text-right">{selectedReport.meter_serial_no}</span>
                    <span className="text-slate-500">Consumer</span>
                    <span className="font-medium text-slate-700 text-right truncate">{selectedReport.consumer_name}</span>
                  </>
                ) : (
                  <>
                    <span className="text-slate-500 inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> Zone
                    </span>
                    <span className="font-medium text-slate-700 text-right">{selectedReport.zone_name}</span>
                    <span className="text-slate-500">Barangay</span>
                    <span className="font-medium text-slate-700 text-right">{selectedReport.barangay_name}</span>
                  </>
                )}
              </div>

              <div className="pt-2 mt-1 border-t border-violet-200/60 flex items-center justify-between">
                <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                  <Wrench className="h-3 w-3" /> Job Type
                </span>
                {selectedReport.default_job_type_name ? (
                  <Badge variant="outline" className="bg-white text-violet-700 border-violet-200 text-[11px] font-semibold">
                    {selectedReport.default_job_type_name}
                  </Badge>
                ) : (
                  <span className="text-[11px] text-rose-500 font-medium">Not configured</span>
                )}
              </div>
              {!selectedReport.default_job_type_id && (
                <p className="text-[11px] text-rose-500 leading-snug">
                  This issue type has no default job type set — a job order can't be created for it yet.
                </p>
              )}
            </div>
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
              disabled={isSubmitting || !selectedReport?.default_job_type_id}
              onClick={handleSubmit(onSubmit)}
            >
              {isSubmitting ? (
                <><Spinner /> Creating…</>
              ) : (
                <><Wrench className="h-3.5 w-3.5" /> Create Job Order</>
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}