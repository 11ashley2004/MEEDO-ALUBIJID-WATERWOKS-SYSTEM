'use client'

import { useState, useEffect } from 'react'
import {
  Loader2, Check, PowerOff, Power, Pencil, MapPin, Building2,
  Users, X, ChevronsUpDown, AlertCircle,
} from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'
import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'

import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'

import {
  getDisconnectionForEdit,
  updateDisconnection,
  searchVoluntaryConsumers,
  searchInvoluntaryConsumers,
  type DisconnectionEditDetails,
} from '@/lib/actions/disconnection/disconnection.actions'

interface UpdateDisconnectionFormProps {
  /** null = dialog closed. Set to a disconnection_id to open it for that row. */
  disconnectionId: string | null
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface EligibleMeterAccount {
  meter_account_id: string
  consumer_id: string
  consumer_name: string
  meter_serial_no: string | null
  zone_name: string
  barangay_name: string
  barangay_id: string
  has_notice: boolean
  is_unpaid: boolean
  notice_meter_account_id?: string | null
  billing_id?: string | null
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function UpdateDisconnectionForm({ disconnectionId, onOpenChange, onSuccess }: UpdateDisconnectionFormProps) {
  const isOpen = !!disconnectionId
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [details, setDetails] = useState<DisconnectionEditDetails | null>(null)

  // Disconnection type
  const [isVoluntary, setIsVoluntary] = useState(true)

  // Consumer search (matching Create form behavior)
  const [consumerQuery, setConsumerQuery] = useState('')
  const debouncedConsumerQuery = useDebouncedSearch(consumerQuery, 400)
  const [consumerOpen, setConsumerOpen] = useState(false)
  const [consumerResults, setConsumerResults] = useState<EligibleMeterAccount[]>([])
  const [consumerSearching, setConsumerSearching] = useState(false)

  // Selected connection (only one, since we are editing a single record)
  const [selectedMeterAccount, setSelectedMeterAccount] = useState<EligibleMeterAccount | null>(null)

  // ── Load data when dialog opens ──────────────────────────────────────────

  useEffect(() => {
    if (!disconnectionId) {
      setDetails(null)
      setSelectedMeterAccount(null)
      setConsumerQuery('')
      setConsumerResults([])
      return
    }

    let cancelled = false
    setIsLoading(true)

    getDisconnectionForEdit(disconnectionId)
      .then((res) => {
        if (cancelled) return
        if (res.success && res.data) {
          setDetails(res.data)
          setIsVoluntary(res.data.is_voluntary)

          // Pre-fill the selected meter account with the existing data
          setSelectedMeterAccount({
            meter_account_id: res.data.meter_account_id,
            consumer_id: '', // Not needed for update
            consumer_name: res.data.consumer_name,
            meter_serial_no: res.data.meter_serial_no,
            zone_name: res.data.zone_name,
            barangay_name: res.data.barangay_name,
            barangay_id: '', // Not needed for update
            has_notice: false, // Not needed for update
            is_unpaid: false, // Not needed for update
            notice_meter_account_id: res.data.notice_meter_account_id,
            billing_id: null,
          })
        } else {
          toast.error(res.error || 'Only pending disconnections can be edited')
          onOpenChange(false)
        }
      })
      .catch(() => {
        if (!cancelled) toast.error('Failed to load disconnection')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disconnectionId])

  // ── Consumer search (matching Create form) ──────────────────────────────

  useEffect(() => {
    if (!debouncedConsumerQuery.trim() || debouncedConsumerQuery.length < 2) {
      setConsumerResults([])
      return
    }

    setConsumerSearching(true)

    const searchFn = isVoluntary
      ? searchVoluntaryConsumers
      : searchInvoluntaryConsumers

    searchFn(debouncedConsumerQuery)
      .then((res) => {
        if (res.success && res.data) {
          setConsumerResults(res.data)
        } else {
          setConsumerResults([])
        }
      })
      .catch(() => {
        toast.error('Search failed')
        setConsumerResults([])
      })
      .finally(() => setConsumerSearching(false))
  }, [debouncedConsumerQuery, isVoluntary])

  // ── Handle consumer selection ────────────────────────────────────────────

  const handleSelectConsumer = (consumer: EligibleMeterAccount) => {
    // If clicking the same one, just close
    if (selectedMeterAccount?.meter_account_id === consumer.meter_account_id) {
      setConsumerOpen(false)
      return
    }

    // Replace selection (since we only allow one)
    setSelectedMeterAccount(consumer)
    toast.success(`Selected ${consumer.consumer_name}`)

    // Clear search
    setConsumerQuery('')
    setConsumerResults([])
    setConsumerOpen(false)
  }

  // ── Remove selected connection ──────────────────────────────────────────

  const removeConnection = () => {
    if (selectedMeterAccount) {
      toast.info(`Removed ${selectedMeterAccount.consumer_name}`)
      setSelectedMeterAccount(null)
    }
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!details) return

    if (!selectedMeterAccount) {
      toast.error('Please select a meter account')
      return
    }

    setIsSubmitting(true)
    try {
      const result = await updateDisconnection({
        disconnection_id: details.disconnection_id,
        is_voluntary: isVoluntary,
        // We only send the type and date is no longer required
        // The server action will use current date or handle accordingly
        requested_date: new Date().toISOString().split('T')[0], // Keep this or remove if server allows null
      })

      if (result.success) {
        toast.success('Disconnection updated')
        onOpenChange(false)
        onSuccess?.()
      } else {
        toast.error(result.error || 'Failed to update disconnection')
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update disconnection')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <Sheet open={isOpen} onOpenChange={(o) => { if (!o) onOpenChange(false) }}>
      <SheetContent className="w-full sm:max-w-2xl flex flex-col h-full p-0 gap-0 border-l border-slate-200 bg-white">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-violet-600 flex items-center justify-center shrink-0">
              <Pencil className="h-[18px] w-[18px] text-white" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-[14px] font-bold text-slate-900 leading-tight">
                Edit Disconnection
              </SheetTitle>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {details ? details.meter_serial_no : 'Loading…'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto bg-slate-50/60 p-6 space-y-6">
          {isLoading && !details ? (
            <div className="flex items-center justify-center py-16 text-slate-400 gap-2 text-[12.5px]">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading disconnection…
            </div>
          ) : details ? (
            <>
              {/* ── Disconnection Type (editable) ────────────────────────── */}
              <div className="space-y-2">
                <Label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Disconnection Type <span className="text-red-500">*</span>
                </Label>
                <div className="flex items-center gap-2 bg-slate-100 rounded-md p-1">
                  <button
                    type="button"
                    onClick={() => setIsVoluntary(true)}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded text-[12px] font-medium transition-all',
                      isVoluntary ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
                    )}
                  >
                    <Power className="h-4 w-4" />
                    Voluntary
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsVoluntary(false)}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded text-[12px] font-medium transition-all',
                      !isVoluntary ? 'bg-red-600 text-white' : 'text-slate-600 hover:text-slate-900'
                    )}
                  >
                    <PowerOff className="h-4 w-4" />
                    Involuntary
                  </button>
                </div>
                {!isVoluntary && details.is_voluntary && (
                  <p className="inline-flex items-start gap-1.5 text-[10.5px] text-amber-600">
                    <AlertCircle className="h-3 w-3 mt-[1px] shrink-0" />
                    Switching to involuntary re-checks that this account still has an unpaid notice on file.
                  </p>
                )}
                <p className="text-[10px] text-slate-400">
                  {isVoluntary
                    ? 'Consumer-initiated disconnection. No notice required.'
                    : 'Utility-initiated disconnection. Requires an outstanding unpaid notice.'}
                </p>
              </div>

              {/* ── Consumer Search (matching Create form) ──────────────── */}
              <div className="space-y-2 relative z-50 w-full">
                <Label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Select Meter Account <span className="text-red-500">*</span>
                </Label>
                <Popover open={consumerOpen} onOpenChange={setConsumerOpen} modal={false}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={consumerOpen}
                      className="w-full justify-between h-10 px-3 rounded-md text-[12.5px] border border-slate-200 bg-white hover:border-violet-300 transition-colors font-normal"
                    >
                      <span className="truncate">
                        {selectedMeterAccount
                          ? `${selectedMeterAccount.consumer_name} (${selectedMeterAccount.meter_serial_no})`
                          : 'Type name or serial no…'
                        }
                      </span>
                      <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-2" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[var(--radix-popover-trigger-width)] p-0 bg-white border border-slate-200 rounded-md shadow-lg"
                    align="start"
                    sideOffset={4}
                    collisionPadding={12}
                    avoidCollisions
                    side="bottom"
                  >
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Type name or serial no…"
                        value={consumerQuery}
                        onValueChange={setConsumerQuery}
                        className="h-9 text-[12.5px] w-full"
                      />
                      <CommandList className="max-h-52 overflow-y-auto w-full">
                        {consumerSearching && (
                          <div className="flex items-center justify-center gap-2 py-4 text-[12px] text-slate-400">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                          </div>
                        )}
                        {!consumerSearching && consumerQuery && consumerResults.length === 0 && (
                          <CommandEmpty className="text-[12px] text-slate-400 py-4 text-center">
                            No eligible consumers found
                          </CommandEmpty>
                        )}
                        {!consumerSearching && !consumerQuery && (
                          <div className="py-4 text-center text-[12px] text-slate-400">
                            Type at least 2 characters to search
                          </div>
                        )}
                        {!consumerSearching && consumerResults.length > 0 && (
                          <CommandGroup>
                            {consumerResults.map((c) => {
                              const isSelected = selectedMeterAccount?.meter_account_id === c.meter_account_id
                              return (
                                <CommandItem
                                  key={c.meter_account_id}
                                  value={c.meter_account_id}
                                  onSelect={() => handleSelectConsumer(c)}
                                  className={cn(
                                    'cursor-pointer text-[12.5px] py-2.5 px-3 gap-2.5 flex items-center',
                                    isSelected && 'bg-violet-50'
                                  )}
                                >
                                  <div className="h-6 w-6 rounded-md bg-violet-100 text-violet-600 flex items-center justify-center text-[9px] font-bold shrink-0">
                                    {c.consumer_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-slate-700 truncate">{c.consumer_name}</p>
                                    <p className="text-[10px] text-slate-400 font-mono">{c.meter_serial_no}</p>
                                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                      <span className="inline-flex items-center gap-1 text-[9px] text-slate-400">
                                        <MapPin className="h-2.5 w-2.5" />
                                        {c.zone_name}
                                      </span>
                                      <span className="inline-flex items-center gap-1 text-[9px] text-slate-400">
                                        <Building2 className="h-2.5 w-2.5" />
                                        {c.barangay_name}
                                      </span>
                                      {!isVoluntary && (
                                        <span className="inline-flex items-center gap-1 text-[9px] text-red-500 bg-red-50 px-1.5 py-0.5 rounded">
                                          <AlertCircle className="h-2.5 w-2.5" />
                                          Unpaid
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  {isSelected && (
                                    <Check className="h-3.5 w-3.5 text-violet-500 ml-auto shrink-0" />
                                  )}
                                </CommandItem>
                              )
                            })}
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* ── Selected Connection (single item display) ────────────── */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Selected Meter Account
                  </p>
                  {selectedMeterAccount && (
                    <span className="text-[11px] font-semibold text-violet-600">
                      1 selected
                    </span>
                  )}
                </div>

                {!selectedMeterAccount ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <div className="h-12 w-12 rounded-md bg-slate-100 flex items-center justify-center">
                      <Users className="h-6 w-6 text-slate-300" />
                    </div>
                    <p className="text-sm font-bold text-slate-700">No meter account selected</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div
                      className="flex items-start gap-3 rounded-md border-2 border-violet-700 bg-violet-50 px-4 py-3"
                    >
                      <div className="h-4 w-4 rounded-[4px] bg-violet-700 flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="h-2.5 w-2.5 text-white" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[12px] font-mono font-bold text-slate-900">
                            {selectedMeterAccount.meter_serial_no}
                          </span>
                          <span className="text-[11px] text-slate-500">·</span>
                          <span className="text-[11px] font-medium text-slate-700">
                            {selectedMeterAccount.consumer_name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5 mt-1 flex-wrap">
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                            <MapPin className="h-2.5 w-2.5 shrink-0" />
                            {selectedMeterAccount.zone_name}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                            <Building2 className="h-2.5 w-2.5 shrink-0" />
                            {selectedMeterAccount.barangay_name}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={removeConnection}
                        className="shrink-0 text-slate-400 hover:text-red-500 transition-colors p-0.5"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-t border-slate-100 bg-white shrink-0">
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              className="rounded-md h-9 text-[13px] border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-600"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>

            <Button
              type="button"
              className="rounded-md h-9 text-[13px] bg-violet-600 hover:bg-violet-700 text-white font-semibold gap-1.5"
              disabled={isSubmitting || isLoading || !details || !selectedMeterAccount}
              onClick={handleSubmit}
            >
              {isSubmitting ? (
                <><Spinner /> Saving…</>
              ) : (
                <><Pencil className="h-3.5 w-3.5" /> Save Changes</>
              )}
            </Button>
          </div>
        </div>

      </SheetContent>
    </Sheet>
  )
}