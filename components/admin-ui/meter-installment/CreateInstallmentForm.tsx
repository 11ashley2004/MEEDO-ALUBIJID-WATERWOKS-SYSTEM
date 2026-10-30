'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'


import { useState, useEffect } from 'react'
import {
  Plus, Loader2, Check, X, ChevronsUpDown,
} from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'

import {
  Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
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
import { Badge } from '@/components/ui/badge'

import {
  getPendingMeterAccounts,
  createMeterInstallment,
  getCurrentMeterPrice,
  type PendingMeterAccount,
} from '@/lib/actions/meter-installment/meter-installment.actions'

interface CreateInstallmentFormProps {
  onSuccess?: () => void
}

function peso(n: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n)
}

export function CreateInstallmentForm({ onSuccess }: CreateInstallmentFormProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearchQuery = useDebouncedSearch(searchQuery)
  const [meterAccounts, setMeterAccounts] = useState<PendingMeterAccount[]>([])
  const [selectedMeterAccount, setSelectedMeterAccount] = useState<PendingMeterAccount | null>(null)

  const [unitPrice, setUnitPrice] = useState<number | null>(null)
  const [monthlyAmount, setMonthlyAmount] = useState<number | null>(null)
  const [priceLoading, setPriceLoading] = useState(true)

  useEffect(() => {
    if (!isOpen) return
    loadPendingMeterAccounts()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      resetForm()
    }
  }, [isOpen])

  useEffect(() => {
    setPriceLoading(true)
    getCurrentMeterPrice().then((res) => {
      if (res.status === 'success' && res.data) {
        setUnitPrice(res.data.unit_price)
        setMonthlyAmount(res.data.monthly_amount)
      } else {
        toast.error(res.message ?? 'Failed to load meter price')
      }
    }).finally(() => setPriceLoading(false))
  }, [])

  function resetForm() {
    setSelectedMeterAccount(null)
    setSearchQuery('')
    setMeterAccounts([])
  }

  async function loadPendingMeterAccounts() {
    setIsLoading(true)
    try {
      const result = await getPendingMeterAccounts()
      if (result.status === 'success' && result.data) {
        setMeterAccounts(result.data)
      } else {
        setMeterAccounts([])
        if (result.message) toast.error(result.message)
      }
    } catch (error) {
      console.error('Failed to load meter accounts:', error)
      toast.error('Failed to load meter accounts')
      setMeterAccounts([])
    } finally {
      setIsLoading(false)
    }
  }

  // Derived, display-only — the server recomputes this independently on submit
  const totalMonths = unitPrice && monthlyAmount && monthlyAmount > 0
    ? Math.ceil(unitPrice / monthlyAmount)
    : 0

  const handleSelect = (account: PendingMeterAccount) => {
    setSelectedMeterAccount(account)
    setOpen(false)
    setSearchQuery('')
  }

  const handleRemove = () => {
    setSelectedMeterAccount(null)
  }

  const handleSubmit = async () => {
    if (!selectedMeterAccount) {
      toast.error('Please select a meter account')
      return
    }

    if (unitPrice === null || unitPrice <= 0 || monthlyAmount === null || monthlyAmount <= 0) {
      toast.error('Meter price is unavailable. Please try again later.')
      return
    }

    setIsSubmitting(true)

    try {
      const result = await createMeterInstallment({
        meter_account_id: selectedMeterAccount.meter_account_id,
        status_code: 'PENDING',
      })

      if (result.status === 'success') {
        toast.success(result.message || 'Installment plan created successfully')
        setIsOpen(false)
        resetForm()
        onSuccess?.()
      } else {
        toast.error(result.message || 'Failed to create installment')
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to create installment')
    } finally {
      setIsSubmitting(false)
    }
  }

  const filteredAccounts = debouncedSearchQuery
    ? meterAccounts.filter(
        (account) =>
          (account.meter_serial_no ?? '').toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
          account.consumer_name.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
      )
    : meterAccounts

  const getStatusBadge = (statusName: string | undefined) => {
    if (!statusName) return null
    const name = statusName.toLowerCase().trim()
    
    if (name === 'pending') {
      return <Badge className="text-[9px] bg-amber-100 text-amber-700 border-amber-200">Pending</Badge>
    }
    if (name === 'replacing') {
      return <Badge className="text-[9px] bg-orange-100 text-orange-700 border-orange-200">Replacing</Badge>
    }
    if (name === 'defective') {
      return <Badge className="text-[9px] bg-rose-100 text-rose-700 border-rose-200">Defective</Badge>
    }
    if (name === 'stolen') {
      return <Badge className="text-[9px] bg-red-100 text-red-700 border-red-200">Stolen</Badge>
    }
    
    // No badge for other statuses
    return null
  }

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
          Create Installment
        </Button>
      </SheetTrigger>

      <SheetContent className="w-full sm:max-w-md flex flex-col h-full p-0 gap-0 border-l border-slate-200 bg-white">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
          <SheetTitle className="text-[14px] font-bold text-slate-900">
            Create Installment Plan
          </SheetTitle>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Select a meter account to create an installment plan
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-slate-50/60 p-6 space-y-5">

          {/* Select Meter Account */}
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
                  {getStatusBadge(selectedMeterAccount.meter_status_name)}
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
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between h-10 px-3 rounded-md text-[12.5px] border-slate-200 bg-white hover:border-violet-300 transition-colors font-normal text-slate-400"
                    disabled={isLoading}
                  >
                    <span className="truncate">
                      {isLoading
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
                      {isLoading && (
                        <div className="flex items-center justify-center gap-2 py-4 text-[12px] text-slate-400">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                        </div>
                      )}
                      {!isLoading && filteredAccounts.length === 0 && (
                        <CommandEmpty className="text-[12px] text-slate-400 py-4 text-center">
                          No matching accounts found
                        </CommandEmpty>
                      )}
                      {!isLoading && filteredAccounts.length > 0 && (
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
                              {getStatusBadge(account.meter_status_name)}
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
              Accounts with Pending, Replacing, Defective, or Stolen meter status
            </p>
          </div>

          {/* Installment Details */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Total Cost</Label>
                <div className="h-9 px-3 flex items-center rounded-md border border-slate-200 bg-slate-50 text-sm font-medium text-slate-700">
                  {priceLoading ? (
                    <span className="h-3.5 w-16 bg-slate-200 animate-pulse rounded" />
                  ) : unitPrice !== null ? (
                    peso(unitPrice)
                  ) : (
                    <span className="text-red-500">Unavailable</span>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">Monthly Amount</Label>
                <div className="h-9 px-3 flex items-center rounded-md border border-slate-200 bg-slate-50 text-sm font-medium text-slate-700">
                  {priceLoading ? (
                    <span className="h-3.5 w-16 bg-slate-200 animate-pulse rounded" />
                  ) : monthlyAmount !== null ? (
                    peso(monthlyAmount)
                  ) : (
                    <span className="text-red-500">Unavailable</span>
                  )}
                </div>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 -mt-2">Set by the current meter price catalog — not editable here.</p>

            {totalMonths > 0 && (
              <div className="rounded-md bg-violet-50 border border-violet-200 px-4 py-2.5 flex items-center justify-between">
                <span className="text-[11px] font-medium text-violet-700">Total Months</span>
                <span className="text-[13px] font-bold text-violet-900">{totalMonths} month{totalMonths !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
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
                !selectedMeterAccount ||
                !unitPrice ||
                !monthlyAmount ||
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
                  <Check className="h-3.5 w-3.5" />
                  Create Plan
                </>
              )}
            </Button>
          </div>
        </div>

      </SheetContent>
    </Sheet>
  )
}