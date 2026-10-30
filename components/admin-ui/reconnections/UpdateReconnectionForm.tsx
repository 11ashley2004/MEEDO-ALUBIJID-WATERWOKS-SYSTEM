'use client'

import { useState, useEffect, useMemo } from 'react'
import { Loader2, Check, Pencil, MapPin, Building2, Trash2, Wallet, Info, Plus, Gauge } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'

import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

import {
  getReconnectionForEdit,
  getReconnectionChargeTypes,
  getCurrentMeterForAccount,
  updateReconnection,
  type ChargeTypeOption,
  type ReconnectionEditDetails,
  type CurrentMeterInfo,
  type MeterStatusUpdateInput,
} from '@/lib/actions/reconnection/reconnection.actions'

import { UpdateMeterStatusDialog, type MeterStatusAction } from './update-meter-status-dialog'

interface ChargeRow {
  row_id: string
  charge_type_id: string
  amount: string
  is_default?: boolean
  source_installment_id?: string   // set only for the auto-forwarded installment row
}

interface UpdateReconnectionFormProps {
  /** null = dialog closed. Set to a reconnection_id to open it for that row. */
  reconnectionId: string | null
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

const peso = (n: number) => n.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })
const RECONNECTION_FEE_NAME = 'Reconnection Fee'
const INSTALLMENT_FORWARD_NAME = 'Installment Balance Forward'

// crypto.randomUUID() is only available in secure contexts (https/localhost).
// Falling back keeps "Add charge" from throwing if it's the first call made
// in this form (e.g. an account with no default charge rows at all).
function genRowId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function UpdateReconnectionForm({ reconnectionId, onOpenChange, onSuccess }: UpdateReconnectionFormProps) {
  const isOpen = !!reconnectionId
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [chargeTypes, setChargeTypes] = useState<ChargeTypeOption[]>([])
  const [details, setDetails] = useState<ReconnectionEditDetails | null>(null)

  const [charges, setCharges] = useState<ChargeRow[]>([])

  // Meter status state — same shape as the create form. A status already
  // exists on this reconnection's meter, so re-updating is optional: the
  // user can leave it as-is, or stage a new Activate/Replace action which
  // gets committed on Save.
  const [currentMeter, setCurrentMeter] = useState<CurrentMeterInfo | null>(null)
  const [meterStatusAction, setMeterStatusAction] = useState<MeterStatusAction | null>(null)
  const [loadingMeter, setLoadingMeter] = useState(false)

  useEffect(() => {
    if (!reconnectionId) {
      setDetails(null)
      setCharges([])
      setCurrentMeter(null)
      setMeterStatusAction(null)
      return
    }

    let cancelled = false
    setIsLoading(true)

    Promise.all([getReconnectionForEdit(reconnectionId), getReconnectionChargeTypes()])
      .then(async ([res, types]) => {
        if (cancelled) return
        setChargeTypes(types)
        if (res.success && res.data) {
          setDetails(res.data)
          setCharges(res.data.charges)

          // Load the current meter for this account, same as the create form,
          // so staff can see its live status and re-stage a change if needed.
          setLoadingMeter(true)
          try {
            const meter = await getCurrentMeterForAccount(res.data.meter_account_id)
            if (!cancelled) setCurrentMeter(meter)
          } catch {
            if (!cancelled) toast.error('Failed to load meter info')
          } finally {
            if (!cancelled) setLoadingMeter(false)
          }
        } else {
          // Defensive — the row menu already hides Edit for non-Pending rows,
          // but status may have changed underneath the user (e.g. another
          // tab just marked it Reconnected/Cancelled).
          toast.error(res.error || 'Only pending reconnections can be edited')
          onOpenChange(false)
        }
      })
      .catch(() => {
        if (!cancelled) toast.error('Failed to load reconnection')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconnectionId])

  // Installment Balance Forward is never manually selectable — same rule as
  // the create form. It only ever exists as the pre-seeded, locked row.
  const availableChargeTypes = useMemo(() => {
    if (!details) return chargeTypes

    let list = chargeTypes.filter(ct => ct.charge_name !== INSTALLMENT_FORWARD_NAME)

    if (details.is_voluntary) {
      list = list.filter(ct => ct.charge_name !== RECONNECTION_FEE_NAME)
    }

    return list
  }, [chargeTypes, details])

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
    // Don't allow removing locked rows (Reconnection Fee or forwarded installment balance).
    // If staff genuinely need to drop the forwarded balance, that should happen
    // by cancelling the reconnection (which reverts the installment to Paused),
    // not by quietly deleting the row here.
    if (row?.is_default) {
      toast.info(
        row.source_installment_id
          ? 'The forwarded installment balance is required and cannot be removed here — cancel the reconnection instead if it needs to be undone'
          : 'The Reconnection Fee is required and cannot be removed'
      )
      return
    }
    setCharges(prev => prev.filter(r => r.row_id !== rowId))
  }

  const chargesTotal = charges.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0)
  const outstandingBalance = details?.outstanding_balance ?? 0
  const grandTotal = outstandingBalance + chargesTotal

  const handleSubmit = async () => {
    if (!details) return

    const validCharges = charges.filter(r => r.charge_type_id && parseFloat(r.amount) > 0)

    const typeIds = validCharges.map(r => r.charge_type_id)
    if (new Set(typeIds).size !== typeIds.length) {
      toast.error('Duplicate charge type — each charge type can only be added once')
      return
    }

    if (outstandingBalance <= 0 && validCharges.length === 0) {
      toast.error('Nothing to charge — add at least one charge amount')
      return
    }

    setIsSubmitting(true)
    try {
      // Only send a meter status update if the user actually re-staged one —
      // unlike create, this is optional since the meter already has a status.
      let meterStatusUpdate: MeterStatusUpdateInput | undefined
      if (meterStatusAction && currentMeter) {
        meterStatusUpdate = {
          meter_id: currentMeter.meter_id,
          action: meterStatusAction,
        }
      }

      const result = await updateReconnection({
        reconnection_id: details.reconnection_id,
        outstanding_balance: outstandingBalance,
        charges: validCharges.map(r => ({
          charge_type_id: r.charge_type_id,
          amount: parseFloat(r.amount),
          // Carry the forwarded-installment link through so the server can
          // tell it apart from a normal charge — both for the FK column and
          // so it knows NOT to revert the installment if this row survives
          // the edit unchanged.
          source_installment_id: r.source_installment_id,
        })),
        meter_status_update: meterStatusUpdate,
      })

      if (result.status === 'success') {
        toast.success(`Reconnection ${details.reconnection_no} updated`)
        onOpenChange(false)
        onSuccess?.()
      } else {
        toast.error(result.message || 'Failed to update reconnection')
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update reconnection')
    } finally {
      setIsSubmitting(false)
    }
  }

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
                Edit Reconnection
              </SheetTitle>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {details ? details.reconnection_no : 'Loading…'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto bg-slate-50/60 p-6 space-y-6">
          {isLoading && !details ? (
            <div className="flex items-center justify-center py-16 text-slate-400 gap-2 text-[12.5px]">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading reconnection…
            </div>
          ) : details ? (
            <>
              {/* ── Meter Account (read-only) ────────────────────────────── */}
              <div className="space-y-2">
                <Label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Meter Account
                </Label>
                <div className="flex items-start gap-3 rounded-md border-2 border-violet-700 bg-violet-50 px-4 py-3">
                  <div className="h-4 w-4 rounded-[4px] bg-violet-700 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="h-2.5 w-2.5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] font-mono font-bold text-slate-900">{details.meter_serial_no}</span>
                      <span className="text-[11px] text-slate-500">·</span>
                      <span className="text-[11px] font-medium text-slate-700">{details.consumer_name}</span>
                      <span className={cn(
                        'inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold',
                        details.is_voluntary ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
                      )}>
                        {details.is_voluntary ? 'Voluntary' : 'Involuntary'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 mt-1 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                        <MapPin className="h-2.5 w-2.5 shrink-0" />{details.zone_name}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                        <Building2 className="h-2.5 w-2.5 shrink-0" />{details.barangay_name}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Current Meter (editable — re-update Activate/Replace) ─── */}
              <div className="space-y-2">
                <Label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Current Meter
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
                ) : currentMeter ? (
                  <div className="rounded-md border border-slate-200 bg-white px-4 py-3">
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
                        onConfirm={(action) => setMeterStatusAction(action)}
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn(
                            'h-8 rounded-md text-[11px] font-semibold gap-1.5 shrink-0',
                            meterStatusAction
                              ? 'border-violet-200 text-violet-700 hover:bg-violet-50'
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
                    {meterStatusAction && (
                      <p className="text-[10.5px] text-violet-500 mt-2 flex items-center gap-1">
                        <Info className="h-2.5 w-2.5 shrink-0" />
                        Meter will be set to {meterStatusAction === 'activate' ? '"Active"' : '"Replacing"'} on save
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-md border border-slate-200 bg-white px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Gauge className="h-4 w-4 text-slate-400 shrink-0" />
                      <p className="text-[13px] text-slate-500">No meter found for this account</p>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Summary (Outstanding Balance + Default Charges) ─────────── */}
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
                            {chargeType?.charge_name || 'Charge'}
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

              {/* ── Additional Charges (editable) ─────────────────────────── */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Charges
                  </Label>
                  <button
                    type="button"
                    onClick={addChargeRow}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-600 hover:text-violet-700"
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
                            {/*
                              FIX: don't pass children into SelectValue. Radix's
                              Select.Value uses a ref internally for portal
                              positioning; giving it text children at the same
                              time triggers React's "ref on an element that also
                              sets children" error. Radix already renders the
                              matching SelectItem's label automatically once a
                              value is selected — the placeholder covers the
                              empty state.
                            */}
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
              disabled={isSubmitting || isLoading || !details}
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