'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  Plus, Loader2, Check, Zap, MapPin, Building2, X,
  ChevronsUpDown, Trash2, Wallet, Info, Gauge, ReceiptText,
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

import {
  searchReconnectableConnections,
  getReconnectionChargeTypes,
  createReconnection,
  getCurrentMeterForAccount,
  getPausedInstallmentForAccount,
  type EligibleDisconnection,
  type ChargeTypeOption,
  type CurrentMeterInfo,
  type MeterStatusUpdateInput,
  type PausedInstallmentInfo,
} from '@/lib/actions/reconnection/reconnection.actions'

import { UpdateMeterStatusDialog, type MeterStatusAction } from './update-meter-status-dialog'

interface ChargeRow {
  row_id: string
  charge_type_id: string
  amount: string
  is_default?: boolean
  source_installment_id?: string   // set only for the auto-forwarded installment row
}

interface CreateReconnectionFormProps {
  onSuccess?: () => void
}

const peso = (n: number) => n.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })
const RECONNECTION_FEE_NAME = 'Reconnection Fee'
const INSTALLMENT_FORWARD_NAME = 'Installment Balance Forward'

// crypto.randomUUID() is only available in secure contexts (https or
// localhost). This fallback keeps row-id generation working everywhere.
function genRowId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function CreateReconnectionForm({ onSuccess }: CreateReconnectionFormProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [chargeTypes, setChargeTypes] = useState<ChargeTypeOption[]>([])

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<EligibleDisconnection[]>([])
  const [searching, setSearching] = useState(false)
  const debouncedQuery = useDebouncedSearch(query, 400)

  const [selected, setSelected] = useState<EligibleDisconnection | null>(null)
  const [charges, setCharges] = useState<ChargeRow[]>([])

  // Meter status update state
  const [currentMeter, setCurrentMeter] = useState<CurrentMeterInfo | null>(null)
  const [meterStatusAction, setMeterStatusAction] = useState<MeterStatusAction | null>(null)
  const [loadingMeter, setLoadingMeter] = useState(false)
  const [isMeterLoaded, setIsMeterLoaded] = useState(false)

  // Paused installment state — auto-forwarded into charges when present
  const [pausedInstallment, setPausedInstallment] = useState<PausedInstallmentInfo | null>(null)

  // Track submission attempt
  const [submissionAttempted, setSubmissionAttempted] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    resetForm()
    getReconnectionChargeTypes().then(setChargeTypes)
  }, [isOpen])

  function resetForm() {
    setSelected(null)
    setCharges([])
    setQuery('')
    setResults([])
    setCurrentMeter(null)
    setMeterStatusAction(null)
    setIsMeterLoaded(false)
    setPausedInstallment(null)
    setSubmissionAttempted(false)
  }

  useEffect(() => {
    if (!debouncedQuery.trim() || debouncedQuery.length < 2) {
      setResults([])
      return
    }
    setSearching(true)
    searchReconnectableConnections(debouncedQuery)
      .then((res) => setResults(res.success && res.data ? res.data : []))
      .catch(() => {
        toast.error('Search failed')
        setResults([])
      })
      .finally(() => setSearching(false))
  }, [debouncedQuery])

  // Reconnection Fee is hidden entirely for voluntary disconnections.
  // Installment Balance Forward is never manually selectable — it's only
  // ever auto-seeded when a paused installment exists for the account.
  const availableChargeTypes = useMemo(() => {
    let list = chargeTypes.filter(ct => ct.charge_name !== INSTALLMENT_FORWARD_NAME)
    if (selected?.is_voluntary) {
      list = list.filter(ct => ct.charge_name !== RECONNECTION_FEE_NAME)
    }
    return list
  }, [chargeTypes, selected])

  const handleSelect = async (conn: EligibleDisconnection) => {
    setSelected(conn)
    setQuery('')
    setResults([])
    setOpen(false)
    setMeterStatusAction(null)
    setCurrentMeter(null)
    setIsMeterLoaded(false)
    setPausedInstallment(null)
    setSubmissionAttempted(false)

    // Fetch current meter info + any paused installment plan in parallel
    setLoadingMeter(true)
    let meter: CurrentMeterInfo | null = null
    let installment: PausedInstallmentInfo | null = null
    try {
      [meter, installment] = await Promise.all([
        getCurrentMeterForAccount(conn.meter_account_id),
        getPausedInstallmentForAccount(conn.meter_account_id),
      ])
      setCurrentMeter(meter)
      setPausedInstallment(installment)
      setIsMeterLoaded(true)
    } catch {
      toast.error('Failed to load meter/installment info')
      setIsMeterLoaded(true)
    } finally {
      setLoadingMeter(false)
    }

    // Seed charge rows:
    // - Involuntary disconnections auto-seed the Reconnection Fee row (is_default, locked).
    // - A paused installment plan auto-seeds its remaining_balance as a locked
    //   "Installment Balance Forward" row — no "Add charge" click needed.
    const seeded: ChargeRow[] = []
    if (!conn.is_voluntary) {
      const fee = chargeTypes.find(c => c.charge_name === RECONNECTION_FEE_NAME)
      if (fee) {
        seeded.push({
          row_id: genRowId(),
          charge_type_id: fee.charge_type_id,
          amount: fee.default_amount > 0 ? String(fee.default_amount) : '',
          is_default: true,
        })
      }
    }
    if (installment && installment.remaining_balance > 0) {
      const forwardType = chargeTypes.find(c => c.charge_name === INSTALLMENT_FORWARD_NAME)
      if (forwardType) {
        seeded.push({
          row_id: genRowId(),
          charge_type_id: forwardType.charge_type_id,
          amount: String(installment.remaining_balance),
          is_default: true,
          source_installment_id: installment.installment_id,
        })
      } else {
        console.error('Charge type "Installment Balance Forward" is not configured')
      }
    }
    setCharges(seeded)
  }

  const clearSelected = () => {
    setSelected(null)
    setCharges([])
    setCurrentMeter(null)
    setMeterStatusAction(null)
    setIsMeterLoaded(false)
    setPausedInstallment(null)
    setSubmissionAttempted(false)
  }

  const usedChargeTypeIds = (excludeRowId?: string) =>
    new Set(charges.filter(r => r.row_id !== excludeRowId && r.charge_type_id).map(r => r.charge_type_id))

  const addChargeRow = () => {
    const used = usedChargeTypeIds()
    const hasUnusedType = availableChargeTypes.some(ct => !used.has(ct.charge_type_id))
    if (!hasUnusedType) {
      toast.info('All available charge types have already been added')
      return
    }
    setCharges(prev => [...prev, { row_id: genRowId(), charge_type_id: '', amount: '' }])
  }

  const updateChargeRow = (rowId: string, patch: Partial<ChargeRow>) => {
    if (patch.charge_type_id) {
      const alreadyUsed = usedChargeTypeIds(rowId).has(patch.charge_type_id)
      if (alreadyUsed) {
        toast.error('That charge type is already added')
        return
      }
    }
    setCharges(prev => prev.map(r => (r.row_id === rowId ? { ...r, ...patch } : r)))
  }

  const removeChargeRow = (rowId: string) => {
    const row = charges.find(r => r.row_id === rowId)
    // Don't allow removing locked rows (Reconnection Fee or forwarded installment balance)
    if (row?.is_default) {
      toast.info(
        row.source_installment_id
          ? 'The forwarded installment balance is required and cannot be removed'
          : 'The Reconnection Fee is required and cannot be removed'
      )
      return
    }
    setCharges(prev => prev.filter(r => r.row_id !== rowId))
  }

  const chargesTotal = charges.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0)
  const outstandingBalance = selected?.outstanding_balance ?? 0
  const grandTotal = outstandingBalance + chargesTotal

  const handleSubmit = async () => {
    if (!selected) {
      toast.error('Please select a connection to reconnect')
      return
    }

    if (!meterStatusAction) {
      setSubmissionAttempted(true)
      toast.error('Please update the meter status before submitting')
      return
    }

    const validCharges = charges.filter(r => r.charge_type_id && parseFloat(r.amount) > 0)

    // Duplicate guard (defensive — UI already prevents this)
    const typeIds = validCharges.map(r => r.charge_type_id)
    if (new Set(typeIds).size !== typeIds.length) {
      toast.error('Duplicate charge type — each charge type can only be added once')
      return
    }

    // NOTE: A zero total is allowed. When there is nothing to collect,
    // createReconnection marks the reconnection as "paid" automatically.

    setIsSubmitting(true)
    setSubmissionAttempted(false)
    try {
      let meterStatusUpdate: MeterStatusUpdateInput | undefined
      if (meterStatusAction && currentMeter) {
        meterStatusUpdate = {
          meter_id: currentMeter.meter_id,
          action: meterStatusAction,
        }
      }

      const result = await createReconnection({
        disconnection_id: selected.disconnection_id,
        outstanding_balance: outstandingBalance,
        charges: validCharges.map(r => ({
          charge_type_id: r.charge_type_id,
          amount: parseFloat(r.amount),
          source_installment_id: r.source_installment_id,
        })),
        meter_status_update: meterStatusUpdate,
      })

      if (result.status === 'success') {
        toast.success(`Reconnection ${result.data.reconnection_no} created`)
        setIsOpen(false)
        resetForm()
        onSuccess?.()
      } else {
        toast.error(result.message || 'Failed to create reconnection')
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to create reconnection')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={(o) => { setIsOpen(o); if (!o) resetForm() }}>
      <SheetTrigger asChild>
        <Button className="h-9 gap-2 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-semibold shadow-sm">
          <Plus className="h-4 w-4" />
          Create Reconnection
        </Button>
      </SheetTrigger>

      <SheetContent className="w-full sm:max-w-2xl flex flex-col h-full p-0 gap-0 border-l border-slate-200 bg-white">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-violet-600 flex items-center justify-center shrink-0">
              <Zap className="h-[18px] w-[18px] text-white" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-[14px] font-bold text-slate-900 leading-tight">
                New Reconnection
              </SheetTitle>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Based on the latest completed disconnection
              </p>
            </div>
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto bg-slate-50/60 p-6 space-y-6">

          {/* ── Connection Search / Selected ───────────────────────────────── */}
          <div className="space-y-2 relative z-50">
            <Label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Meter Account <span className="text-red-500">*</span>
            </Label>

            {!selected ? (
              <Popover open={open} onOpenChange={setOpen} modal={false}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between h-10 px-3 rounded-md text-[12.5px] border border-slate-200 bg-white hover:border-violet-300 transition-colors font-normal text-slate-400"
                  >
                    <span className="truncate">Search disconnected consumer or serial no…</span>
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
                      value={query}
                      onValueChange={setQuery}
                      className="h-9 text-[12.5px]"
                    />
                    <CommandList className="max-h-52 overflow-y-auto">
                      {searching && (
                        <div className="flex items-center justify-center gap-2 py-4 text-[12px] text-slate-400">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                        </div>
                      )}
                      {!searching && query && results.length === 0 && (
                        <CommandEmpty className="text-[12px] text-slate-400 py-4 text-center">
                          No reconnectable connections found
                        </CommandEmpty>
                      )}
                      {!searching && !query && (
                        <div className="py-4 text-center text-[12px] text-slate-400">
                          Type at least 2 characters to search
                        </div>
                      )}
                      {!searching && results.length > 0 && (
                        <CommandGroup>
                          {results.map((c) => (
                            <CommandItem
                              key={c.disconnection_id}
                              value={c.disconnection_id}
                              onSelect={() => handleSelect(c)}
                              className="cursor-pointer text-[12.5px] py-2.5 px-3 gap-2.5 flex items-center"
                            >
                              <div className="h-6 w-6 rounded-md bg-violet-100 text-violet-600 flex items-center justify-center text-[9px] font-bold shrink-0">
                                {c.consumer_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-slate-700 truncate">{c.consumer_name}</p>
                                <p className="text-[10px] text-slate-400 font-mono">{c.meter_serial_no}</p>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  <span className="inline-flex items-center gap-1 text-[9px] text-slate-400">
                                    <MapPin className="h-2.5 w-2.5" />{c.zone_name}
                                  </span>
                                  <span className="inline-flex items-center gap-1 text-[9px] text-slate-400">
                                    <Building2 className="h-2.5 w-2.5" />{c.barangay_name}
                                  </span>
                                  <span className={cn(
                                    'inline-flex items-center text-[9px] font-semibold',
                                    c.is_voluntary ? 'text-blue-600' : 'text-red-600'
                                  )}>
                                    {c.is_voluntary ? 'Voluntary' : 'Notice Based'}
                                  </span>
                                  {c.outstanding_balance > 0 && (
                                    <span className="inline-flex items-center text-[9px] font-semibold text-amber-600">
                                      {peso(c.outstanding_balance)} due
                                    </span>
                                  )}
                                </div>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            ) : (
              <div className="flex items-start gap-3 rounded-md border-2 border-violet-700 bg-violet-50 px-4 py-3">
                <div className="h-4 w-4 rounded-[4px] bg-violet-700 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="h-2.5 w-2.5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[12px] font-mono font-bold text-slate-900">{selected.meter_serial_no}</span>
                    <span className="text-[11px] text-slate-500">·</span>
                    <span className="text-[11px] font-medium text-slate-700">{selected.consumer_name}</span>
                    <span className={cn(
                      'inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold',
                      selected.is_voluntary ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
                    )}>
                      {selected.is_voluntary ? 'Voluntary' : 'Notice Based'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearSelected}
                  className="shrink-0 text-slate-400 hover:text-red-500 transition-colors p-0.5"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* ── Meter Status Update ────────────────────────────────────────── */}
          {selected && (
            <div className="space-y-2">
              <Label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                Current Meter <span className="text-red-500">*</span>
              </Label>

              {loadingMeter ? (
                <div className="rounded-md border border-slate-200 bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="h-4 w-4 rounded bg-slate-200 animate-pulse shrink-0" />
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
                        <div className="h-3 w-24 bg-slate-200 rounded animate-pulse" />
                      </div>
                    </div>
                    <div className="h-8 w-24 bg-slate-200 rounded animate-pulse shrink-0" />
                  </div>
                </div>
              ) : isMeterLoaded && currentMeter ? (
                <div>
                  <div className={cn(
                    'rounded-md border px-4 py-3 transition-colors',
                    submissionAttempted && !meterStatusAction
                      ? 'border-red-300 bg-red-50'
                      : 'border-slate-200 bg-white'
                  )}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Gauge className="h-4 w-4 text-slate-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[13px] font-mono font-semibold text-slate-800">
                            {currentMeter.meter_serial_no || 'No serial number'}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Status: {currentMeter.meter_status_name || 'Unknown'}
                          </p>
                        </div>
                      </div>
                      <UpdateMeterStatusDialog
                        currentSerial={currentMeter.meter_serial_no || 'No serial'}
                        currentStatusName={currentMeter.meter_status_name || 'Unknown'}
                        initialAction={meterStatusAction}
                        onConfirm={(action) => {
                          setMeterStatusAction(action)
                          setSubmissionAttempted(false)
                        }}
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn(
                            'h-8 rounded-md text-[11px] font-semibold gap-1.5 shrink-0',
                            meterStatusAction
                              ? 'border-violet-200 text-violet-700 hover:bg-violet-50'
                              : submissionAttempted
                              ? 'border-red-300 text-red-600 hover:bg-red-50'
                              : 'border-slate-200 text-slate-600 hover:border-violet-300'
                          )}
                        >
                          {meterStatusAction ? (
                            <>
                              <Check className="h-3 w-3" />
                              {meterStatusAction === 'activate' ? 'Activate' : 'Replace'}
                            </>
                          ) : (
                            <>Update Status</>
                          )}
                        </Button>
                      </UpdateMeterStatusDialog>
                    </div>
                  </div>

                  {submissionAttempted && !meterStatusAction && (
                    <p className="text-[11px] text-red-500 mt-1.5 flex items-center gap-1">
                      <span className="text-red-400">⚠</span>
                      Please update the meter status before submitting
                    </p>
                  )}
                </div>
              ) : isMeterLoaded && !currentMeter ? (
                <div className="rounded-md border border-slate-200 bg-white px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Gauge className="h-4 w-4 text-slate-400 shrink-0" />
                    <p className="text-[13px] text-slate-500">No meter found for this account</p>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* ── Summary (Outstanding Balance + Default Charges) ─────────────── */}
          {selected && (
            <div className="space-y-2">
              <Label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                Summary
              </Label>
              <div className="rounded-md border border-slate-200 bg-white divide-y divide-slate-100">

                {/* Outstanding Balance - Always shown */}
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
                    <span className="text-[12.5px] font-medium text-slate-700 truncate">
                      Outstanding Balance
                    </span>
                  </div>
                  <span className="text-[12.5px] font-semibold text-slate-800 tabular-nums shrink-0 ml-3">
                    {peso(outstandingBalance)}
                  </span>
                </div>

                {/* Default charges (Reconnection Fee / Forwarded Installment) */}
                {charges.filter(r => r.is_default).map((row) => {
                  const isForwardedInstallment = !!row.source_installment_id
                  const chargeType = chargeTypes.find(ct => ct.charge_type_id === row.charge_type_id)
                  return (
                    <div key={row.row_id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={cn(
                          'h-1.5 w-1.5 rounded-full shrink-0',
                          isForwardedInstallment ? 'bg-amber-400' : 'bg-violet-500'
                        )} />
                        <span className="text-[12.5px] font-medium text-slate-700 truncate">
                          {chargeType?.charge_name}
                        </span>
                      </div>
                      <span className="text-[12.5px] font-semibold text-slate-800 tabular-nums shrink-0 ml-3">
                        {peso(parseFloat(row.amount) || 0)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Additional Charges ────────────────────────────────────────── */}
          {selected && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Charges
                </Label>
                <button
                  type="button"
                  onClick={addChargeRow}
                  className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md border border-violet-200 text-[11px] font-semibold text-violet-600 hover:bg-violet-50 hover:border-violet-300 transition-colors"
                >
                  <Plus className="h-3 w-3" /> Add charge
                </button>
              </div>

              {charges.filter(r => !r.is_default).length === 0 && (
                <p className="text-[11px] text-slate-400">No additional charges yet.</p>
              )}

              <div className="space-y-2">
                {charges.filter(r => !r.is_default).map((row) => {
                  const used = usedChargeTypeIds(row.row_id)
                  const rowOptions = availableChargeTypes.filter(
                    ct => ct.charge_type_id === row.charge_type_id || !used.has(ct.charge_type_id)
                  )

                  return (
                    <div key={row.row_id} className="flex items-center gap-2">
                      <Select
                        value={row.charge_type_id}
                        onValueChange={(v) => {
                          const ct = chargeTypes.find(c => c.charge_type_id === v)
                          updateChargeRow(row.row_id, {
                            charge_type_id: v,
                            amount: row.amount || (ct?.default_amount ? String(ct.default_amount) : ''),
                          })
                        }}
                      >
                        <SelectTrigger className="h-9 flex-1 rounded-md text-[12px] bg-white border-slate-200">
                          <SelectValue placeholder="Charge type" />
                        </SelectTrigger>
                        <SelectContent className="bg-white border border-slate-200 rounded-md">
                          {rowOptions.map((ct) => (
                            <SelectItem key={ct.charge_type_id} value={ct.charge_type_id} className="text-[12px]">
                              {ct.charge_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={row.amount}
                        onChange={(e) => updateChargeRow(row.row_id, { amount: e.target.value })}
                        className="h-9 w-28 rounded-md text-[12px] border-slate-200"
                      />
                      <button
                        type="button"
                        onClick={() => removeChargeRow(row.row_id)}
                        className="shrink-0 text-slate-400 hover:text-red-500 transition-colors p-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>

              <div className="flex items-center justify-between rounded-md bg-violet-600 px-4 py-3">
                <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-violet-100">
                  <Wallet className="h-3.5 w-3.5" /> Total Amount
                </span>
                <span className="text-[15px] font-bold text-white">{peso(grandTotal)}</span>
              </div>
            </div>
          )}
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
              disabled={isSubmitting}
              onClick={handleSubmit}
            >
              {isSubmitting ? (
                <><Spinner /> Creating…</>
              ) : (
                <><Zap className="h-3.5 w-3.5" /> Create Reconnection</>
              )}
            </Button>
          </div>
        </div>

      </SheetContent>
    </Sheet>
  )
}