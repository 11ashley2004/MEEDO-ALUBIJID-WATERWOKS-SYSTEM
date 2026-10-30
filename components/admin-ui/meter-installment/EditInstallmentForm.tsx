'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'


import { useState, useEffect } from 'react'
import {
  Edit, Loader2, CheckCircle2, X, ChevronsUpDown,
} from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'

import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

import {
  updateMeterInstallment,
  getPendingMeterAccounts,
  type MeterInstallmentDetail,
  type PendingMeterAccount,
} from '@/lib/actions/meter-installment/meter-installment.actions'

// ─── Local helpers ──────────────────────────────────────────────────────────

function peso(amount: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount)
}

function getStatusBadge(statusCode: string) {
  switch (statusCode) {
    case 'ACTIVE':
      return { label: 'Active', className: 'rounded-md bg-emerald-50 text-emerald-700 border-emerald-200' }
    case 'COMPLETED':
      return { label: 'Completed', className: 'rounded-md bg-slate-100 text-slate-500 border-slate-200' }
    case 'CANCELLED':
      return { label: 'Cancelled', className: 'rounded-md bg-rose-50 text-rose-700 border-rose-200' }
    case 'PENDING':
      return { label: 'Pending', className: 'rounded-md bg-amber-50 text-amber-700 border-amber-200' }
    default:
      return { label: 'Unknown', className: 'rounded-md bg-slate-50 text-slate-500 border-slate-200' }
  }
}

function getMeterStatusBadge(statusName: string | undefined) {
  if (!statusName) return null
  const name = statusName.toLowerCase()
  if (name === 'replacing') {
    return <Badge className="text-[9px] bg-orange-100 text-orange-700 border-orange-200">Replacing</Badge>
  }
  if (name === 'defective') {
    return <Badge className="text-[9px] bg-rose-100 text-rose-700 border-rose-200">Defective</Badge>
  }
  if (name === 'stolen') {
    return <Badge className="text-[9px] bg-red-100 text-red-700 border-red-200">Stolen</Badge>
  }
  return <Badge className="text-[9px] bg-amber-50 text-amber-700 border-amber-200">Pending</Badge>
}

// ─── Props ────────────────────────────────────────────────────────────────

interface EditInstallmentFormProps {
  installment: MeterInstallmentDetail | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

// ─── Component ──────────────────────────────────────────────────────────────

export function EditInstallmentForm({
  installment,
  open,
  onOpenChange,
  onSuccess,
}: EditInstallmentFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false)

  const [comboOpen, setComboOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearchQuery = useDebouncedSearch(searchQuery)
  const [meterAccounts, setMeterAccounts] = useState<PendingMeterAccount[]>([])
  const [selectedMeterAccount, setSelectedMeterAccount] = useState<PendingMeterAccount | null>(null)

  // ── Load eligible accounts, plus the plan's current account ─────────────
  // getPendingMeterAccounts() excludes accounts already tied to an
  // active/pending installment — which includes this very plan's account.
  // Prepend it manually so it still shows up (and remains selected by default).
  useEffect(() => {
    if (!open || !installment) return

    setIsLoadingAccounts(true)
    getPendingMeterAccounts()
      .then((res) => {
        const fetched = res.status === 'success' && res.data ? res.data : []

        const currentAccount: PendingMeterAccount = {
          meter_account_id: installment.meter_account_id,
          meter_serial_no: installment.meter_serial_no,
          consumer_id: '',
          consumer_name: installment.consumer_name,
          zone_name: '',
          barangay_name: '',
          classification_name: '',
        }

        const alreadyIncluded = fetched.some(
          (a) => a.meter_account_id === installment.meter_account_id,
        )
        const combined = alreadyIncluded ? fetched : [currentAccount, ...fetched]

        setMeterAccounts(combined)
        setSelectedMeterAccount(currentAccount)

        if (res.status === 'error' && res.message) toast.error(res.message)
      })
      .catch(() => toast.error('Failed to load meter accounts'))
      .finally(() => setIsLoadingAccounts(false))
  }, [open, installment])

  useEffect(() => {
    if (!open) {
      setSearchQuery('')
      setComboOpen(false)
    }
  }, [open])

  const handleSelect = (account: PendingMeterAccount) => {
    setSelectedMeterAccount(account)
    setComboOpen(false)
    setSearchQuery('')
  }

  const handleRemove = () => {
    setSelectedMeterAccount(null)
  }

  const filteredAccounts = debouncedSearchQuery
    ? meterAccounts.filter(
        (account) =>
          (account.meter_serial_no ?? '').toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
          account.consumer_name.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
      )
    : meterAccounts

  const handleSubmit = async () => {
    if (!installment) return

    if (!selectedMeterAccount) {
      toast.error('Please select a meter account')
      return
    }

    setIsSubmitting(true)
    try {
      const result = await updateMeterInstallment({
        installment_id: installment.installment_id,
        meter_account_id: selectedMeterAccount.meter_account_id,
      })

      if (result.status === 'success') {
        toast.success('Installment plan updated successfully')
        onOpenChange(false)
        onSuccess()
      } else {
        toast.error(result.message || 'Failed to update installment')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!installment) return null

  const statusBadge = getStatusBadge(installment.status_code)
  const hasChanged = selectedMeterAccount?.meter_account_id !== installment.meter_account_id

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col h-full p-0 gap-0 border-l border-slate-200 bg-white">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-violet-600 flex items-center justify-center shrink-0">
              <Edit className="h-[18px] w-[18px] text-white" />
            </div>
            <div>
              <SheetTitle className="text-[14px] font-bold text-slate-900 leading-tight">
                Edit Installment Plan
              </SheetTitle>
              <SheetDescription className="text-[11px] text-slate-500 mt-0.5">
                {installment.meter_serial_no}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto bg-slate-50/60 p-6 space-y-6">
        
          <div className="space-y-2">
            <Label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Meter Account <span className="text-red-500">*</span>
            </Label>

            {selectedMeterAccount ? (
              <div className="rounded-md border-2 border-violet-700 bg-violet-50 px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[12px] font-mono font-bold text-slate-900">
                    {selectedMeterAccount.meter_serial_no}
                  </span>
                  <span className="text-[11px] text-slate-500">·</span>
                  <span className="text-[11px] font-medium text-slate-700 truncate">
                    {selectedMeterAccount.consumer_name}
                  </span>
                  {getMeterStatusBadge(selectedMeterAccount.meter_status_name)}
                  {selectedMeterAccount.meter_account_id === installment.meter_account_id && (
                    <Badge className="text-[9px] bg-violet-100 text-violet-700 border-violet-300">Current</Badge>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleRemove}
                  className="shrink-0 text-slate-400 hover:text-red-500 transition-colors p-0.5"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <Popover open={comboOpen} onOpenChange={setComboOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={comboOpen}
                    className="w-full justify-between h-10 px-3 rounded-md text-[12.5px] border-slate-200 bg-white hover:border-violet-300 transition-colors font-normal text-slate-400"
                    disabled={isLoadingAccounts}
                  >
                    <span className="truncate">
                      {isLoadingAccounts
                        ? 'Loading accounts...'
                        : meterAccounts.length === 0
                          ? 'No eligible accounts available'
                          : 'Select a meter account...'}
                    </span>
                    <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-2" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[var(--radix-popover-trigger-width)] p-0 bg-white border border-slate-200 rounded-md shadow-lg"
                  align="start"
                  sideOffset={4}
                >
                  <Command>
                    <CommandInput
                      placeholder="Search by name or Contract No..."
                      value={searchQuery}
                      onValueChange={setSearchQuery}
                      className="h-9 text-[12.5px] w-full"
                    />
                    <CommandList className="max-h-52 overflow-y-auto w-full">
                      {isLoadingAccounts && (
                        <div className="flex items-center justify-center gap-2 py-4 text-[12px] text-slate-400">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                        </div>
                      )}
                      {!isLoadingAccounts && filteredAccounts.length === 0 && (
                        <CommandEmpty className="text-[12px] text-slate-400 py-4 text-center">
                          No matching accounts found
                        </CommandEmpty>
                      )}
                      {!isLoadingAccounts && filteredAccounts.length > 0 && (
                        <CommandGroup>
                          {filteredAccounts.map((account) => (
                            <CommandItem
                              key={account.meter_account_id}
                              value={`${account.consumer_name} ${account.meter_serial_no}`}
                              onSelect={() => handleSelect(account)}
                              className="cursor-pointer text-[12.5px] py-2.5 px-3 flex items-center gap-2"
                            >
                              <span className="font-medium text-slate-700 truncate">
                                {account.consumer_name}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono shrink-0">
                                {account.meter_serial_no}
                              </span>
                              {account.meter_account_id === installment.meter_account_id && (
                                <Badge className="text-[9px] bg-violet-50 text-violet-600 border-violet-200">Current</Badge>
                              )}
                              {getMeterStatusBadge(account.meter_status_name)}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
            <p className="text-[10px] text-slate-400">
              Accounts with Pending, Replacing, Defective, or Stolen status
            </p>

            {selectedMeterAccount && hasChanged && (
              <p className="text-[10px] text-violet-600 font-medium">
                This will move the plan from {installment.meter_serial_no} to {selectedMeterAccount.meter_serial_no}.
              </p>
            )}
          </div>

          {/* Read-only reference values — sourced from meter_price at creation time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Total Cost
              </Label>
              <div className="h-9 px-3 flex items-center rounded-md border border-slate-200 bg-slate-50 text-sm font-medium text-slate-600">
                {peso(installment.total_cost)}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Monthly Amount
              </Label>
              <div className="h-9 px-3 flex items-center rounded-md border border-slate-200 bg-slate-50 text-sm font-medium text-slate-600">
                {peso(installment.monthly_amount)}
              </div>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 -mt-3">
            Set from the meter price catalog when the plan was created — not editable here.
          </p>
        </div>

        <SheetFooter className="px-6 py-4 border-t border-slate-100 bg-white shrink-0">
          <div className="flex items-center justify-between gap-3 w-full">
            <Button
              variant="outline"
              className="rounded-md h-9 text-[13px] border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-600"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              className="rounded-md h-9 text-[13px] bg-violet-600 hover:bg-violet-700 text-white font-semibold gap-1.5"
              onClick={handleSubmit}
              disabled={isSubmitting || !selectedMeterAccount}
            >
              {isSubmitting ? (
                <>
                  <Spinner />
                  Saving…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}