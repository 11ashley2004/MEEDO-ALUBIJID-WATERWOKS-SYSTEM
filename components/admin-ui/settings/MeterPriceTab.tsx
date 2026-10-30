'use client'

import { useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react'
import { Info, AlertTriangle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
  getMeterPrice,
  updateMeterPrice,
  type MeterPriceRecord,
} from '@/lib/actions/settings/meter-price.actions'
import {
  EditableField, ConfirmSaveDialog, FieldCard, LoadingBlock, EmptyBlock,
  fieldInputClass, type SettingsTabHandle,
} from '@/components/admin-ui/settings/shared'

interface MeterPriceTabProps {
  onDirtyChange?: (dirty: boolean) => void
}

const MeterPriceTab = forwardRef<SettingsTabHandle, MeterPriceTabProps>(
  function MeterPriceTab({ onDirtyChange }, ref) {
    const [meterPrice,         setMeterPrice]         = useState<MeterPriceRecord | null>(null)
    const [loading,            setLoading]            = useState(true)
    const [unitPriceValue,     setUnitPriceValue]     = useState('')
    const [monthlyAmountValue, setMonthlyAmountValue] = useState('')
    const [dirty,              setDirty]              = useState(false)
    const [editMode,           setEditMode]           = useState(false)
    const [saving,             setSaving]             = useState(false)
    const [confirmOpen,        setConfirmOpen]        = useState(false)
    const [validationError,    setValidationError]    = useState<string | null>(null)

    const fetchMeterPrice = useCallback(async () => {
      setLoading(true)
      try {
        const res = await getMeterPrice()
        if (res.status === 'success' && res.data) {
          setMeterPrice(res.data)
          setUnitPriceValue(String(res.data.unit_price))
          setMonthlyAmountValue(String(res.data.monthly_amount))
          setDirty(false)
          setEditMode(false)
          setValidationError(null)
        } else {
          toast.error(res.message ?? 'Failed to load meter price')
        }
      } catch {
        toast.error('Failed to load meter price')
      } finally {
        setLoading(false)
      }
    }, [])

    useEffect(() => { fetchMeterPrice() }, [fetchMeterPrice])

    useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])

    function handleInput(field: 'unit' | 'monthly', val: string) {
      if (field === 'unit') setUnitPriceValue(val)
      else setMonthlyAmountValue(val)

      const newUnit    = field === 'unit'    ? val : unitPriceValue
      const newMonthly = field === 'monthly' ? val : monthlyAmountValue
      const parsedUnit    = parseFloat(newUnit)
      const parsedMonthly = parseFloat(newMonthly)

      const unitChanged    = !isNaN(parsedUnit) && parsedUnit !== meterPrice?.unit_price
      const monthlyChanged = !isNaN(parsedMonthly) && parsedMonthly !== meterPrice?.monthly_amount
      setDirty(unitChanged || monthlyChanged)
      
      // Clear validation error when user makes changes
      setValidationError(null)
    }

    function cancelEdit() {
      if (!meterPrice) return
      setUnitPriceValue(String(meterPrice.unit_price))
      setMonthlyAmountValue(String(meterPrice.monthly_amount))
      setDirty(false)
      setEditMode(false)
      setValidationError(null)
    }

    useImperativeHandle(ref, () => ({ cancelEdit }))

    async function saveMeterPrice() {
      const parsedUnit    = parseFloat(unitPriceValue)
      const parsedMonthly = parseFloat(monthlyAmountValue)

      // Basic client-side validation for format (not business logic)
      if (isNaN(parsedUnit) || parsedUnit < 0) {
        toast.error('Unit price must be a non-negative number')
        return
      }
      if (isNaN(parsedMonthly) || parsedMonthly < 0) {
        toast.error('Monthly amount must be a non-negative number')
        return
      }

      setSaving(true)
      try {
        const res = await updateMeterPrice(meterPrice!.meter_price_id, parsedUnit, parsedMonthly)
        
        if (res.status === 'success') {
          toast.success('Meter price updated successfully')
          await fetchMeterPrice()
          setConfirmOpen(false)
          setValidationError(null)
        } else {
          // Handle server validation errors
          if (res.errors && Array.isArray(res.errors)) {
            // Find the specific error for monthly_amount
            const monthlyError = res.errors.find((e) => e.path?.includes('monthly_amount'))
            if (monthlyError) {
              setValidationError(monthlyError.message)
              toast.error(monthlyError.message)
            } else {
              // Show the first error or the general message
              const firstError = res.errors[0]
              if (firstError) {
                setValidationError(firstError.message)
                toast.error(firstError.message)
              } else {
                toast.error(res.message ?? 'Failed to update meter price')
              }
            }
          } else {
            toast.error(res.message ?? 'Failed to update meter price')
          }
        }
      } catch {
        toast.error('An unexpected error occurred')
      } finally {
        setSaving(false)
      }
    }

    if (loading) return <LoadingBlock />
    if (!meterPrice) return <EmptyBlock label="No meter price configuration found." />

    // Check if validation is needed for the current input
    const showValidationWarning = validationError && editMode

    return (
      <div className="space-y-4 max-w-md">
        <EditableField
          label="Unit Price (per m³)"
          dirty={dirty}
          editing={editMode}
          onEdit={() => setEditMode(true)}
          onCancel={cancelEdit}
          onSave={() => setConfirmOpen(true)}
          saving={saving}
        >
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[12.5px] font-medium pointer-events-none">
            ₱
          </span>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={unitPriceValue}
            disabled={!editMode}
            onChange={(e) => handleInput('unit', e.target.value)}
            placeholder="e.g. 15.00"
            className={`${fieldInputClass} pl-7`}
          />
        </EditableField>

        <EditableField
          label="Monthly Amount"
          dirty={dirty}
          editing={editMode}
          onEdit={() => setEditMode(true)}
          onCancel={cancelEdit}
          onSave={() => setConfirmOpen(true)}
          saving={saving}
        >
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[12.5px] font-medium pointer-events-none">
            ₱
          </span>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={monthlyAmountValue}
            disabled={!editMode}
            onChange={(e) => handleInput('monthly', e.target.value)}
            placeholder="e.g. 50.00"
            className={`${fieldInputClass} pl-7`}
          />
        </EditableField>

        {showValidationWarning && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        <FieldCard className="flex items-center justify-between text-[12.5px]">
          <span className="text-slate-500">Current values</span>
          <span className="font-semibold tabular-nums text-slate-800">
            ₱{meterPrice.unit_price} / m³ · ₱{meterPrice.monthly_amount} monthly
          </span>
        </FieldCard>

        <div className="flex items-start gap-2 text-[11px] text-slate-500 px-1">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>Applied when computing monthly water bills for metered connections.</span>
        </div>

        <ConfirmSaveDialog
          open={confirmOpen}
          title="Update Meter Price"
          summary={
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Unit price</span>
                <span className="font-medium text-slate-800">
                  ₱{meterPrice.unit_price} → <span className="font-semibold text-violet-600">₱{unitPriceValue}</span>
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Monthly amount</span>
                <span className="font-medium text-slate-800">
                  ₱{meterPrice.monthly_amount} → <span className="font-semibold text-violet-600">₱{monthlyAmountValue}</span>
                </span>
              </div>
            </div>
          }
          onConfirm={saveMeterPrice}
          onClose={() => setConfirmOpen(false)}
          isLoading={saving}
        />
      </div>
    )
  },
)

export default MeterPriceTab