// components/admin-ui/disconnections/CreateDisconnectionForm.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Loader2, Check, PowerOff, Power,
  MapPin, Building2, Users, X, Search, User,
  ChevronsUpDown, AlertCircle,
} from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'
import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'

import {
  Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  searchVoluntaryConsumers,
  searchInvoluntaryConsumers,
  createDisconnection,
  getEligibleMeterAccountsForDisconnection,
} from '@/lib/actions/disconnection/disconnection.actions'

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

interface CreateDisconnectionFormProps {
  onSuccess?: () => void
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function CreateDisconnectionForm({ onSuccess }: CreateDisconnectionFormProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Disconnection type
  const [disconnectionType, setDisconnectionType] = useState<'voluntary' | 'involuntary'>('voluntary')

  // Consumer search
  const [consumerQuery, setConsumerQuery] = useState('')
  const [consumerOpen, setConsumerOpen] = useState(false)
  const [consumerResults, setConsumerResults] = useState<EligibleMeterAccount[]>([])
  const [consumerSearching, setConsumerSearching] = useState(false)

  // Selected connections
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectedMeterAccounts, setSelectedMeterAccounts] = useState<EligibleMeterAccount[]>([])

  const debouncedQuery = useDebouncedSearch(consumerQuery, 400)

  // ── Reset form when sheet opens ──────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return
    resetForm()
  }, [isOpen])

  function resetForm() {
    setSelectedIds([])
    setSelectedMeterAccounts([])
    setConsumerQuery('')
    setConsumerResults([])
    setDisconnectionType('voluntary')
  }

  // ── Handle Type Change ────────────────────────────────────────────────────

  const handleTypeChange = useCallback(async (type: 'voluntary' | 'involuntary') => {
    setDisconnectionType(type)
    setSelectedIds([])
    setSelectedMeterAccounts([])
    setConsumerQuery('')
    setConsumerResults([])

    // If involuntary, load all eligible connections
    if (type === 'involuntary') {
      setConsumerSearching(true)
      try {
        const result = await getEligibleMeterAccountsForDisconnection({
          is_voluntary: false,
        })
        if (result.success && result.data) {
          setConsumerResults(result.data)
        } else {
          setConsumerResults([])
        }
      } catch (error) {
        toast.error('Failed to load eligible meter accounts')
        setConsumerResults([])
      } finally {
        setConsumerSearching(false)
      }
    }
  }, [])

  // ── Debounced consumer search ────────────────────────────────────────────

  useEffect(() => {
    // For involuntary, we already loaded all, don't search
    if (disconnectionType === 'involuntary') {
      return
    }

    if (!debouncedQuery.trim() || debouncedQuery.length < 2) {
      setConsumerResults([])
      return
    }

    setConsumerSearching(true)

    const searchFn = searchVoluntaryConsumers

    searchFn(debouncedQuery)
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
  }, [debouncedQuery, disconnectionType])

  // ── Handle consumer selection ────────────────────────────────────────────

  const handleSelectConsumer = (consumer: EligibleMeterAccount) => {
    // Check if already selected
    const alreadySelected = selectedMeterAccounts.some(c => c.meter_account_id === consumer.meter_account_id)

    if (alreadySelected) {
      // Remove from selection
      setSelectedMeterAccounts(prev => prev.filter(c => c.meter_account_id !== consumer.meter_account_id))
      setSelectedIds(prev => prev.filter(id => id !== consumer.meter_account_id))
      toast.info(`Removed ${consumer.consumer_name}`)
    } else {
      // Add to selection
      setSelectedMeterAccounts(prev => [...prev, consumer])
      setSelectedIds(prev => [...prev, consumer.meter_account_id])
      toast.success(`Added ${consumer.consumer_name}`)
    }

    // Clear the search after selection (only for voluntary)
    if (disconnectionType === 'voluntary') {
      setConsumerQuery('')
      setConsumerResults([])
    }
    setConsumerOpen(false)
  }

  // ── Remove selected connection ──────────────────────────────────────────

  const removeConnection = (meterAccountId: string) => {
    const conn = selectedMeterAccounts.find(c => c.meter_account_id === meterAccountId)
    setSelectedMeterAccounts(prev => prev.filter(c => c.meter_account_id !== meterAccountId))
    setSelectedIds(prev => prev.filter(id => id !== meterAccountId))
    if (conn) {
      toast.info(`Removed ${conn.consumer_name}`)
    }
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (selectedIds.length === 0) {
      toast.error('Please select at least one meter account')
      return
    }

    setIsSubmitting(true)

    try {
      let successCount = 0
      let errorCount = 0

      for (const conn of selectedMeterAccounts) {
        const result = await createDisconnection({
          meter_account_id: conn.meter_account_id,
          is_voluntary: disconnectionType === 'voluntary',
          notice_meter_account_id: conn.notice_meter_account_id ?? null,
          processed_by: '',
        })

        if (result.success) {
          successCount++
        } else {
          errorCount++
          console.error(`Failed to create disconnection for ${conn.meter_serial_no}:`, result.error)
        }
      }

      if (successCount > 0) {
        toast.success(
          `Created ${successCount} disconnection request${successCount > 1 ? 's' : ''}`
        )
        setIsOpen(false)
        resetForm()
        onSuccess?.()
      }

      if (errorCount > 0) {
        toast.error(`Failed to create ${errorCount} request${errorCount > 1 ? 's' : ''}`)
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to create disconnection requests')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(o) => {
        setIsOpen(o)
        if (!o) resetForm()
      }}
    >
      <SheetTrigger asChild>
        <Button className="h-9 gap-2 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-semibold shadow-sm">
          <Plus className="h-4 w-4" />
          Create Disconnection
        </Button>
      </SheetTrigger>

      <SheetContent className="w-full sm:max-w-2xl flex flex-col h-full p-0 gap-0 border-l border-slate-200 bg-white">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-violet-600 flex items-center justify-center shrink-0">
              <PowerOff className="h-[18px] w-[18px] text-white" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-[14px] font-bold text-slate-900 leading-tight">
                New Disconnection
              </SheetTitle>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {disconnectionType === 'voluntary' ? 'Voluntary' : 'Notice-based'} disconnection
              </p>
            </div>
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto bg-slate-50/60 p-6 space-y-6">

          {/* ── Disconnection Type ────────────────────────────────────────── */}
          <div className="space-y-2">
            <Label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Disconnection Type <span className="text-red-500">*</span>
            </Label>
            <div className="flex items-center gap-2 bg-slate-100 rounded-md p-1">
              <button
                type="button"
                onClick={() => handleTypeChange('voluntary')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded text-[12px] font-medium transition-all',
                  disconnectionType === 'voluntary'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                )}
              >
                <Power className="h-4 w-4" />
                Voluntary
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange('involuntary')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded text-[12px] font-medium transition-all',
                  disconnectionType === 'involuntary'
                    ? 'bg-red-600 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                )}
              >
                <PowerOff className="h-4 w-4" />
                Notice-based
              </button>
            </div>
            <p className="text-[10px] text-slate-400">
              {disconnectionType === 'voluntary'
                ? 'Consumer-initiated disconnection. No notice required.'
                : 'Utility-initiated disconnection. Requires an outstanding unpaid notice.'}
            </p>
          </div>

          {/* ── Consumer Search ───────────────────────────────────────────── */}
          <div className="space-y-2 relative z-50 w-full">
            <Label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              {disconnectionType === 'voluntary' ? 'Search Consumer' : 'Eligible Consumers'} <span className="text-red-500">*</span>
            </Label>
            <Popover
              open={consumerOpen}
              onOpenChange={setConsumerOpen}
              modal={false}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={consumerOpen}
                  className="w-full justify-between h-10 px-3 rounded-md text-[12.5px] border border-slate-200 bg-white hover:border-violet-300 transition-colors font-normal text-slate-400"
                >
                  <span className="truncate">
                    {selectedMeterAccounts.length > 0
                      ? `${selectedMeterAccounts.length} meter account${selectedMeterAccounts.length > 1 ? 's' : ''} selected`
                      : disconnectionType === 'voluntary'
                        ? 'Type name or serial no…'
                        : `${consumerResults.length} eligible meter accounts available`
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
                  {disconnectionType === 'voluntary' && (
                    <CommandInput
                      placeholder="Type name or serial no…"
                      value={consumerQuery}
                      onValueChange={setConsumerQuery}
                      className="h-9 text-[12.5px] w-full"
                    />
                  )}
                  <CommandList className="max-h-52 overflow-y-auto w-full">
                    {consumerSearching && (
                      <div className="flex items-center justify-center gap-2 py-4 text-[12px] text-slate-400">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                      </div>
                    )}
                    {!consumerSearching && disconnectionType === 'voluntary' && consumerQuery && consumerResults.length === 0 && (
                      <CommandEmpty className="text-[12px] text-slate-400 py-4 text-center">
                        No eligible consumers found
                      </CommandEmpty>
                    )}
                    {!consumerSearching && disconnectionType === 'voluntary' && !consumerQuery && (
                      <div className="py-4 text-center text-[12px] text-slate-400">
                        Type at least 2 characters to search
                      </div>
                    )}
                    {!consumerSearching && consumerResults.length === 0 && disconnectionType === 'involuntary' && (
                      <div className="py-4 text-center text-[12px] text-slate-400">
                        No eligible meter accounts for notice-based disconnection
                      </div>
                    )}
                    {!consumerSearching && consumerResults.length > 0 && (
                      <CommandGroup>
                        {consumerResults.map((c) => {
                          const isSelected = selectedMeterAccounts.some(sc => sc.meter_account_id === c.meter_account_id)
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
                                  {disconnectionType === 'involuntary' && (
                                    <span className="inline-flex items-center gap-1 text-[9px] text-red-500 bg-red-50 px-1.5 py-0.5 rounded-md">
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

          {/* ── Selected Connections ───────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Selected Meter Accounts
              </p>
              <span className="text-[11px] font-semibold text-violet-600">
                {selectedIds.length} selected
              </span>
            </div>

            {selectedMeterAccounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <div className="h-12 w-12 rounded-md bg-slate-100 flex items-center justify-center">
                  <Users className="h-6 w-6 text-slate-300" />
                </div>
                <p className="text-sm font-bold text-slate-700">No meter accounts selected</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {selectedMeterAccounts.map((conn) => (
                  <div
                    key={conn.meter_account_id}
                    className="flex items-start gap-3 rounded-md border-2 border-violet-700 bg-violet-50 px-4 py-3"
                  >
                    <div className="h-4 w-4 rounded-[4px] bg-violet-700 flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="h-2.5 w-2.5 text-white" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[12px] font-mono font-bold text-slate-900">
                          {conn.meter_serial_no}
                        </span>
                        <span className="text-[11px] text-slate-500">·</span>
                        <span className="text-[11px] font-medium text-slate-700">
                          {conn.consumer_name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5 mt-1 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                          <MapPin className="h-2.5 w-2.5 shrink-0" />
                          {conn.zone_name}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                          <Building2 className="h-2.5 w-2.5 shrink-0" />
                          {conn.barangay_name}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeConnection(conn.meter_account_id)}
                      className="shrink-0 text-slate-400 hover:text-red-500 transition-colors p-0.5"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-t border-slate-100 bg-white shrink-0">
          <div className="flex items-center justify-between gap-3">

            <SheetClose asChild>
              <Button
                variant="outline"
                className="rounded-md h-9 text-[13px] border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-600"
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </SheetClose>

            <Button
              type="button"
              className="rounded-md h-9 text-[13px] bg-violet-600 hover:bg-violet-700 text-white font-semibold gap-1.5"
              disabled={
                selectedIds.length === 0 ||
                isSubmitting
              }
              onClick={handleSubmit}
            >
              {isSubmitting ? (
                <>
                  <Spinner />
                  Creating…
                </>
              ) : (
                <>
                  <PowerOff className="h-3.5 w-3.5" />
                  Create {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
                </>
              )}
            </Button>
          </div>
        </div>

      </SheetContent>
    </Sheet>
  )
}