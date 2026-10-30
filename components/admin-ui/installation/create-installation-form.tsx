'use client'

import { useState, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Check, ChevronsUpDown, Plug, Plus, Wrench, MapPin, AlertTriangle } from 'lucide-react'
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
  getMeterAccountsNeedingInstallation,
  createInstallation,
  type MeterAccountOption,
} from '@/lib/actions/installation/installation.actions'

const schema = z.object({
  meter_account_id: z.string().min(1, 'Please select a meter account'),
})

type FormData = z.infer<typeof schema>

interface CreateInstallationFormProps {
  onSuccess?: () => void
}

export default function CreateInstallationForm({ onSuccess }: CreateInstallationFormProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [maQuery, setMaQuery] = useState('')
  const [maOpen, setMaOpen] = useState(false)
  const [maResults, setMaResults] = useState<MeterAccountOption[]>([])
  const [maSearching, setMaSearching] = useState(false)
  const [selectedOption, setSelectedOption] = useState<MeterAccountOption | null>(null)
  const debouncedQuery = useDebouncedSearch(maQuery)

  const {
    control, handleSubmit, reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { meter_account_id: '' },
  })

  useEffect(() => {
    if (!isOpen) return
    setMaSearching(true)
    getMeterAccountsNeedingInstallation('')
      .then(setMaResults)
      .catch(() => toast.error('Failed to load meter accounts'))
      .finally(() => setMaSearching(false))
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    setMaSearching(true)
    getMeterAccountsNeedingInstallation(debouncedQuery)
      .then(setMaResults)
      .catch(() => toast.error('Search failed'))
      .finally(() => setMaSearching(false))
  }, [debouncedQuery, isOpen])

  function resetForm() {
    reset({ meter_account_id: '' })
    setSelectedOption(null)
    setMaQuery('')
  }

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true)
    try {
      const res = await createInstallation({ meter_account_id: data.meter_account_id })

      if (res.status === 'success') {
        toast.success(res.message || 'Installation requested')
        setIsOpen(false)
        resetForm()
        onSuccess?.()
      } else {
        toast.error(res.message || 'Failed to request installation')
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
          Request Installation
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
                New Installation Request
              </SheetTitle>
              <p className="text-[12px] text-slate-500 mt-1 leading-snug">
                Creates the installation record and its job order together
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-slate-50/60 px-7 py-6 space-y-6">

          {/* Meter account */}
          <div className="space-y-2.5 relative z-50">
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
                        <span className="truncate">{selectedOption?.label || 'Search serial no. or name…'}</span>
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
                              No meter accounts need installation right now
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
                                  setSelectedOption(m)
                                  setMaOpen(false)
                                }}
                                className="cursor-pointer text-[13px] py-2.5 gap-2.5"
                              >
                                <div className="h-7 w-7 rounded-md bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                                  <Plug className="h-3.5 w-3.5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <p className="font-medium text-slate-700 truncate">{m.meter_serial_no}</p>
                                    {!m.payment_status && (
                                      <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200 text-[9px] px-1.5 py-0 h-4">
                                        Unpaid
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-slate-400 truncate">{m.consumer_name}</p>
                                </div>
                                {field.value === m.meter_account_id && <Check className="h-3.5 w-3.5 text-violet-500 ml-auto shrink-0" />}
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
          </div>
           

          {/* Selected summary */}
         {selectedOption && (
          <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-4 space-y-2">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-violet-600">
              <Wrench className="h-3 w-3" /> Selected Account
            </div>
            <div className="grid grid-cols-2 gap-y-1.5 text-[12.5px]">
              <span className="text-slate-500">Serial No.</span>
              <span className="font-mono font-medium text-slate-700 text-right">{selectedOption.meter_serial_no}</span>
              <span className="text-slate-500">Consumer</span>
              <span className="font-medium text-slate-700 text-right truncate">{selectedOption.consumer_name}</span>
              <span className="text-slate-500 inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Barangay
              </span>
              <span className="font-medium text-slate-700 text-right">{selectedOption.barangay_name}</span>
            </div>

            {!selectedOption.payment_status && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 mt-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[11.5px] text-amber-700 leading-snug">
                  Unpaid connection fee: <span className="font-semibold">
                    ₱{selectedOption.total_connection_fee.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </span>. This request will be rejected until payment is settled.
                </p>
              </div>
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
              disabled={isSubmitting}
              onClick={handleSubmit(onSubmit)}
            >
              {isSubmitting ? (
                <><Spinner /> Requesting…</>
              ) : (
                <><Wrench className="h-3.5 w-3.5" /> Request Installation</>
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}