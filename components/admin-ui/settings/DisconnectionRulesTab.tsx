'use client'

import { useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react'
import { Info } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
  getDisconnectionRules,
  updateDisconnectionRule,
  type DisconnectionRuleRecord,
} from '@/lib/actions/settings/disconnection-rules.actions'
import {
  EditableField, ConfirmSaveDialog, FieldCard, LoadingBlock, EmptyBlock,
  fieldInputClass, type SettingsTabHandle,
} from '@/components/admin-ui/settings/shared'

interface DisconnectionRulesTabProps {
  onDirtyChange?: (dirty: boolean) => void
}

const DisconnectionRulesTab = forwardRef<SettingsTabHandle, DisconnectionRulesTabProps>(
  function DisconnectionRulesTab({ onDirtyChange }, ref) {
    const [discRule,    setDiscRule]    = useState<DisconnectionRuleRecord | null>(null)
    const [loading,     setLoading]     = useState(true)
    const [balance,     setBalance]     = useState('')
    const [months,      setMonths]      = useState('')
    const [dirty,       setDirty]       = useState(false)
    const [editMode,    setEditMode]    = useState(false)
    const [saving,      setSaving]      = useState(false)
    const [confirmOpen, setConfirmOpen] = useState(false)

    const fetchDiscRule = useCallback(async () => {
      setLoading(true)
      try {
        const res = await getDisconnectionRules()
        if (res.status === 'success' && res.data) {
          setDiscRule(res.data)
          setBalance(String(res.data.min_balance ?? ''))
          setMonths(String(res.data.min_unpaid_months ?? ''))
          setDirty(false)
          setEditMode(false)
        } else {
          toast.error(res.message ?? 'Failed to load disconnection rules')
        }
      } catch {
        toast.error('Failed to load disconnection rules')
      } finally {
        setLoading(false)
      }
    }, [])

    useEffect(() => { fetchDiscRule() }, [fetchDiscRule])

    useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])

    function handleInput(field: 'balance' | 'months', val: string) {
      if (field === 'balance') setBalance(val)
      else setMonths(val)

      const newBalance = field === 'balance' ? val : balance
      const newMonths  = field === 'months'  ? val : months
      const parsedBalance = parseFloat(newBalance)
      const parsedMonths  = parseInt(newMonths, 10)

      const balanceChanged = !isNaN(parsedBalance) && parsedBalance !== discRule?.min_balance
      const monthsChanged  = !isNaN(parsedMonths) && parsedMonths !== discRule?.min_unpaid_months
      setDirty(balanceChanged || monthsChanged)
    }

    function cancelEdit() {
      if (!discRule) return
      setBalance(String(discRule.min_balance ?? ''))
      setMonths(String(discRule.min_unpaid_months ?? ''))
      setDirty(false)
      setEditMode(false)
    }

    useImperativeHandle(ref, () => ({ cancelEdit }))

    async function saveDiscRule() {
      const parsedBalance = parseFloat(balance)
      const parsedMonths  = parseInt(months, 10)

      if (isNaN(parsedBalance) || parsedBalance < 0) {
        toast.error('Minimum balance must be a non-negative number')
        return
      }
      if (isNaN(parsedMonths) || parsedMonths < 1) {
        toast.error('Minimum unpaid months must be at least 1')
        return
      }

      setSaving(true)
      try {
        const res = await updateDisconnectionRule(discRule!.rule_id, parsedBalance, parsedMonths)
        if (res.status === 'success') {
          toast.success('Disconnection rule updated successfully')
          await fetchDiscRule()
        } else {
          toast.error(res.message ?? 'Failed to update disconnection rule')
        }
      } catch {
        toast.error('An unexpected error occurred')
      } finally {
        setSaving(false)
        setConfirmOpen(false)
      }
    }

    if (loading) return <LoadingBlock />
    if (!discRule) return <EmptyBlock label="No disconnection rule configured." />

    return (
      <div className="space-y-4 max-w-md">
        <EditableField
          label="Minimum Overdue Balance"
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
            value={balance}
            disabled={!editMode}
            onChange={(e) => handleInput('balance', e.target.value)}
            placeholder="e.g. 500.00"
            className={`${fieldInputClass} pl-7`}
          />
        </EditableField>

        <EditableField
          label="Minimum Unpaid Months"
          dirty={dirty}
          editing={editMode}
          onEdit={() => setEditMode(true)}
          onCancel={cancelEdit}
          onSave={() => setConfirmOpen(true)}
          saving={saving}
        >
          <Input
            type="number"
            min="1"
            step="1"
            value={months}
            disabled={!editMode}
            onChange={(e) => handleInput('months', e.target.value)}
            placeholder="e.g. 2"
            className={`${fieldInputClass} pr-16`}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[11px] font-medium pointer-events-none">
            months
          </span>
        </EditableField>

        <FieldCard className="text-[12.5px]">
          <span className="text-slate-500">
            Accounts with a balance ≥{' '}
            <span className="font-semibold text-slate-800">₱{discRule.min_balance ?? 0}</span> or{' '}
            <span className="font-semibold text-slate-800">{discRule.min_unpaid_months ?? 0}+</span> unpaid
            months are flagged.
          </span>
        </FieldCard>

        <div className="flex items-start gap-2 text-[11px] text-slate-500 px-1">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>Accounts meeting either threshold are notified by the Next.js app (Realtime + server action) when billing is created/updated, when the consumer opens Billing/Home, or when you run Notify. No notice document is created for that path.</span>
        </div>

        <ConfirmSaveDialog
          open={confirmOpen}
          title="Update Disconnection Rule"
          summary={
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Min. balance</span>
                <span className="font-medium text-slate-800">
                  ₱{discRule.min_balance ?? 0} → <span className="font-semibold text-violet-600">₱{balance}</span>
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Min. unpaid months</span>
                <span className="font-medium text-slate-800">
                  {discRule.min_unpaid_months ?? 0} → <span className="font-semibold text-violet-600">{months}</span>
                </span>
              </div>
            </div>
          }
          onConfirm={saveDiscRule}
          onClose={() => setConfirmOpen(false)}
          isLoading={saving}
        />
      </div>
    )
  },
)

export default DisconnectionRulesTab