'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'


import React, { useState, useEffect } from 'react'
import { ArrowRightLeft, Loader2, AlertTriangle, User, MapPin, Check, ChevronsUpDown, Building2, X, Plus, Zap } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import {
  Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import { Label } from '@/components/ui/label'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  getMeterAccountById,
  transferMeterAccount,
  getAllBarangaysForSelect,
  getZonesByBarangay,
  searchConsumers,
  searchMeterAccounts,
} from '@/lib/actions/meter-transfers/meter-transfer.actions'
import { toast } from 'sonner'

interface CreateMeterTransferFormProps {
  onSuccess?: () => void
  children?: React.ReactNode
}

type TransferType = 'OWNERSHIP' | 'RELOCATION'

const CreateMeterTransferForm: React.FC<CreateMeterTransferFormProps> = ({
  onSuccess,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isFetchingAccount, setIsFetchingAccount] = useState(false)

  // Meter account picker
  const [meterAccountId, setMeterAccountId] = useState('')
  const [meterAccount, setMeterAccount] = useState<any>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const [accountSearch, setAccountSearch] = useState('')
  const debouncedAccountSearch = useDebouncedSearch(accountSearch)
  const [accountResults, setAccountResults] = useState<any[]>([])
  const [isSearchingAccounts, setIsSearchingAccounts] = useState(false)

  // Barangays / zones
  const [barangays, setBarangays] = useState<any[]>([])
  const [zones, setZones] = useState<any[]>([])

  // Transfer fields + selected labels (labels kept in state so they survive
  // the search result arrays being cleared after selection)
  const [transferType, setTransferType] = useState<TransferType>('OWNERSHIP')
  const [selectedBarangayId, setSelectedBarangayId] = useState('')
  const [selectedBarangayLabel, setSelectedBarangayLabel] = useState('')
  const [selectedConsumerId, setSelectedConsumerId] = useState('')
  const [selectedConsumerLabel, setSelectedConsumerLabel] = useState('')
  const [selectedZoneId, setSelectedZoneId] = useState('')
  const [selectedZoneLabel, setSelectedZoneLabel] = useState('')
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')

  // Consumer combobox state
  const [consumerOpen, setConsumerOpen] = useState(false)
  const [consumerSearch, setConsumerSearch] = useState('')
  const debouncedConsumerSearch = useDebouncedSearch(consumerSearch)
  const [consumers, setConsumers] = useState<any[]>([])
  const [isSearchingConsumers, setIsSearchingConsumers] = useState(false)

  // Barangay / zone combobox state
  const [barangayOpen, setBarangayOpen] = useState(false)
  const [barangaySearch, setBarangaySearch] = useState('')
  const debouncedBarangaySearch = useDebouncedSearch(barangaySearch)
  const [zoneOpen, setZoneOpen] = useState(false)
  const [zoneSearch, setZoneSearch] = useState('')
  const debouncedZoneSearch = useDebouncedSearch(zoneSearch)

  // Load barangays when the sheet opens
  useEffect(() => {
    const load = async () => {
      if (!isOpen) return
      try {
        setBarangays(await getAllBarangaysForSelect())
      } catch (err) {
        console.error('Error loading barangays:', err)
        toast.error('Failed to load barangays')
      }
    }
    load()
  }, [isOpen])

  // Debounced meter account search
  useEffect(() => {
    const search = async () => {
      if (!debouncedAccountSearch.trim()) { setAccountResults([]); return }
      setIsSearchingAccounts(true)
      try { setAccountResults((await searchMeterAccounts(debouncedAccountSearch, 10)) || []) }
      catch (err) { console.error('Error searching meter accounts:', err) }
      finally { setIsSearchingAccounts(false) }
    }
    const timer = setTimeout(search, 300)
    return () => clearTimeout(timer)
  }, [debouncedAccountSearch])

  // Load full meter account + pre-fill current barangay/label
  useEffect(() => {
    const fetchAccount = async () => {
      if (!meterAccountId) { setMeterAccount(null); return }
      setIsFetchingAccount(true)
      try {
        const data = await getMeterAccountById(meterAccountId)
        setMeterAccount(data)
        if (data) {
          const bId   = data.zone?.barangay?.barangay_id ?? data.barangay_id ?? ''
          const bName = data.zone?.barangay?.barangay_name ?? ''
          setSelectedBarangayId(bId)
          setSelectedBarangayLabel(bName)
        }
      } catch (err) {
        console.error('Error fetching meter account:', err)
        toast.error('Failed to load meter account')
      } finally {
        setIsFetchingAccount(false)
      }
    }
    fetchAccount()
  }, [meterAccountId])

  // Debounced consumer search — excludes the current owner
  useEffect(() => {
    const run = async () => {
      if (!debouncedConsumerSearch.trim()) { setConsumers([]); return }
      setIsSearchingConsumers(true)
      try {
        setConsumers(
          (await searchConsumers(debouncedConsumerSearch, 10, meterAccount?.consumer_id)) || []
        )
      } catch (err) {
        console.error('Error searching consumers:', err)
      } finally {
        setIsSearchingConsumers(false)
      }
    }
    const timer = setTimeout(run, 300)
    return () => clearTimeout(timer)
  }, [debouncedConsumerSearch, meterAccount?.consumer_id])

  // Load zones whenever barangay changes
  useEffect(() => {
    const fetchZones = async () => {
      if (!selectedBarangayId) { setZones([]); return }
      try { setZones(await getZonesByBarangay(selectedBarangayId)) }
      catch (err) {
        console.error('Error fetching zones:', err)
        toast.error('Failed to load zones')
      }
    }
    fetchZones()
  }, [selectedBarangayId])

  // Reset everything on close
  useEffect(() => {
    if (!isOpen) {
      setMeterAccountId('')
      setMeterAccount(null)
      setAccountSearch('')
      setAccountResults([])
      setSelectedBarangayId('')
      setSelectedBarangayLabel('')
      setSelectedConsumerId('')
      setSelectedConsumerLabel('')
      setSelectedZoneId('')
      setSelectedZoneLabel('')
      setConsumerSearch('')
      setBarangaySearch('')
      setZoneSearch('')
      setConsumers([])
      setError('')
      setReason('')
      setTransferType('OWNERSHIP')
    }
  }, [isOpen])

  // Guard: new owner can't be the same as the current owner
  useEffect(() => {
    if (
      meterAccount?.consumer_id &&
      selectedConsumerId &&
      selectedConsumerId === meterAccount.consumer_id
    ) {
      setSelectedConsumerId('')
      setSelectedConsumerLabel('')
      setError('New owner must be different from the current owner')
    }
  }, [meterAccount?.consumer_id, selectedConsumerId])

  const handleConfirm = async () => {
    setError('')
    if (!meterAccountId) { setError('Please select a meter account'); return }
    if (transferType === 'OWNERSHIP') {
      if (!selectedConsumerId) { setError('Please select a consumer'); return }
      if (selectedConsumerId === meterAccount?.consumer_id) {
        setError('New owner must be different from the current owner'); return
      }
    }
    if (transferType === 'RELOCATION' && !selectedZoneId) {
      setError('Please select a zone'); return
    }

    setIsLoading(true)
    try {
      const result = transferType === 'OWNERSHIP'
        ? await transferMeterAccount(meterAccountId, {
            transfer_type: 'OWNERSHIP',
            new_consumer_id: selectedConsumerId,
            transfer_reason: reason || null,
          })
        : await transferMeterAccount(meterAccountId, {
            transfer_type: 'RELOCATION',
            new_zone_id: selectedZoneId,
            transfer_reason: reason || null,
          })

      if (result.status === 'success') {
        toast.success(result.message || 'Meter account transferred successfully')
        setIsOpen(false)
        if (onSuccess) onSuccess()
      } else {
        toast.error(result.message || 'Failed to transfer meter account')
        setError(result.message || 'Failed to transfer meter account')
      }
    } catch (err: any) {
      console.error('Transfer error:', err)
      const errorMessage = err?.message || 'An unexpected error occurred'
      toast.error(errorMessage)
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const getSelectedAccountLabel = () => {
    const found = accountResults.find(a => a.meter_account_id === meterAccountId)
    if (found) return found.label
    if (meterAccount) {
      const consumerName = meterAccount.consumer?.account_name || 'Unknown Consumer'
      return `${meterAccount.meter_serial_no} — ${consumerName}`
    }
    return meterAccount?.meter_serial_no || 'Search serial no...'
  }

  const consumerName = meterAccount?.consumer?.account_name || meterAccount?.consumer_name || 'Unknown Consumer'

  const filteredBarangays = debouncedBarangaySearch
    ? barangays.filter((b) => b.barangay_name.toLowerCase().includes(debouncedBarangaySearch.toLowerCase()))
    : barangays
  const filteredZones = debouncedZoneSearch
    ? zones.filter((z) => z.zone_name.toLowerCase().includes(debouncedZoneSearch.toLowerCase()))
    : zones

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        {children ?? (
          <Button size="sm" className="h-9 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium gap-1.5 shadow-sm shadow-violet-200">
            <Plus className="h-3.5 w-3.5" /> New Transfer
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md flex flex-col h-full p-0 gap-0 border-l border-slate-200 bg-white">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-violet-600 flex items-center justify-center shrink-0">
              <ArrowRightLeft className="h-[18px] w-[18px] text-white" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-[14px] font-bold text-slate-900 leading-tight">New Transfer</SheetTitle>
              <SheetDescription className="text-[11px] text-slate-500 mt-0.5">
                Change ownership or relocate a meter account
              </SheetDescription>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-slate-50/60 px-6 py-5 space-y-5">

          {/* Meter Account picker */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold text-slate-700">
              Meter Account <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Popover open={accountOpen} onOpenChange={setAccountOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={accountOpen}
                    className={cn(
                      'w-full justify-between h-10 px-3 rounded-md text-[12.5px] border-2 transition-colors outline-none',
                      'focus:border-violet-400 focus:ring-2 focus:ring-violet-400 focus:ring-offset-0',
                      meterAccountId
                        ? 'border-violet-300 bg-violet-50/60 text-slate-900 font-semibold pr-9'
                        : 'border-slate-200 bg-white hover:border-violet-300 font-normal text-slate-400'
                    )}
                  >
                    <span className="flex items-center gap-2 min-w-0 truncate">
                      {meterAccountId && (
                        <span className="h-5 w-5 rounded-md bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                          <Zap className="h-3 w-3" />
                        </span>
                      )}
                      <span className="truncate">
                        {meterAccountId ? getSelectedAccountLabel() : 'Search serial no...'}
                      </span>
                    </span>
                    {!meterAccountId && <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-2" />}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[var(--radix-popover-trigger-width)] p-0 bg-white border border-slate-200 rounded-md shadow-lg"
                  align="start"
                  sideOffset={4}
                >
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search by serial no..."
                      value={accountSearch}
                      onValueChange={setAccountSearch}
                      className="h-9 text-[12.5px] w-full"
                    />
                    <CommandList className="max-h-64 overflow-y-auto w-full">
                      {isSearchingAccounts && (
                        <div className="flex items-center justify-center gap-2 py-4 text-[12px] text-slate-400">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                        </div>
                      )}
                      {!isSearchingAccounts && accountSearch && accountResults.length === 0 && (
                        <CommandEmpty className="text-[12px] text-slate-400 py-4 text-center">
                          No meter accounts found
                        </CommandEmpty>
                      )}
                      {!isSearchingAccounts && !accountSearch && (
                        <div className="py-4 text-center text-[12px] text-slate-400">Start typing to search</div>
                      )}
                      {!isSearchingAccounts && accountResults.length > 0 && (
                        <CommandGroup>
                          {accountResults.map((acct) => (
                            <CommandItem
                              key={acct.meter_account_id}
                              value={acct.meter_account_id}
                              onSelect={() => {
                                setMeterAccountId(
                                  meterAccountId === acct.meter_account_id ? '' : acct.meter_account_id
                                )
                                setAccountOpen(false)
                                setAccountSearch('')
                                setError('')
                              }}
                              className="cursor-pointer text-[12.5px] py-2.5 px-3 gap-2.5 flex items-center"
                            >
                              <div className="h-8 w-8 rounded-md bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                                <Zap className="h-4 w-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-slate-700 truncate">{acct.label}</p>
                              </div>
                              {meterAccountId === acct.meter_account_id && (
                                <Check className="h-3.5 w-3.5 text-violet-600 shrink-0" />
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {meterAccountId && (
                <button
                  type="button"
                  onClick={() => {
                    setMeterAccountId('')
                    setSelectedConsumerId('')
                    setSelectedConsumerLabel('')
                    setSelectedBarangayId('')
                    setSelectedBarangayLabel('')
                    setSelectedZoneId('')
                    setSelectedZoneLabel('')
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 transition-colors p-0.5"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {isFetchingAccount && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
            </div>
          )}

          {meterAccountId && !isFetchingAccount && (
            <>
              {/* Transfer Type */}
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-slate-700">
                  Transfer Type <span className="text-red-500">*</span>
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { setTransferType('OWNERSHIP'); setError('') }}
                    className={cn(
                      'flex items-center justify-center gap-2 h-10 px-4 rounded-md text-[13px] font-medium border-2 transition-all',
                      transferType === 'OWNERSHIP'
                        ? 'border-violet-600 bg-violet-50 text-violet-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:bg-violet-50/50'
                    )}
                  >
                    <User className="h-3.5 w-3.5" /> Change Owner
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTransferType('RELOCATION'); setError('') }}
                    className={cn(
                      'flex items-center justify-center gap-2 h-10 px-4 rounded-md text-[13px] font-medium border-2 transition-all',
                      transferType === 'RELOCATION'
                        ? 'border-violet-600 bg-violet-50 text-violet-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:bg-violet-50/50'
                    )}
                  >
                    <MapPin className="h-3.5 w-3.5" /> Relocate
                  </button>
                </div>
              </div>

              {transferType === 'OWNERSHIP' ? (
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold text-slate-700">
                    New Consumer <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Popover open={consumerOpen} onOpenChange={setConsumerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={consumerOpen}
                          className={cn(
                            'w-full justify-between h-10 px-3 rounded-md text-[12.5px] border-2 transition-colors outline-none',
                            'focus:border-violet-400 focus:ring-2 focus:ring-violet-400 focus:ring-offset-0',
                            selectedConsumerId
                              ? 'border-violet-300 bg-violet-50/60 text-slate-900 font-semibold pr-9'
                              : 'border-slate-200 bg-white hover:border-violet-300 font-normal text-slate-400'
                          )}
                        >
                          <span className="flex items-center gap-2 min-w-0 truncate">
                            {selectedConsumerId && selectedConsumerLabel && (
                              <span className="h-5 w-5 rounded-md bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                                <User className="h-3 w-3" />
                              </span>
                            )}
                            <span className="truncate">
                              {selectedConsumerId && selectedConsumerLabel
                                ? selectedConsumerLabel
                                : 'Search for a consumer...'}
                            </span>
                          </span>
                          {!selectedConsumerId && <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-2" />}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-[var(--radix-popover-trigger-width)] p-0 bg-white border border-slate-200 rounded-md shadow-lg"
                        align="start"
                        sideOffset={4}
                      >
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder="Search Contract No. or name…"
                            value={consumerSearch}
                            onValueChange={setConsumerSearch}
                            className="h-9 text-[12.5px] w-full"
                          />
                          <CommandList className="max-h-64 overflow-y-auto w-full">
                            {isSearchingConsumers && (
                              <div className="flex items-center justify-center gap-2 py-4 text-[12px] text-slate-400">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                              </div>
                            )}
                            {!isSearchingConsumers && consumerSearch && consumers.length === 0 && (
                              <CommandEmpty className="text-[12px] text-slate-400 py-4 text-center">
                                No consumers found
                              </CommandEmpty>
                            )}
                            {!isSearchingConsumers && !consumerSearch && (
                              <div className="py-4 text-center text-[12px] text-slate-400">Start typing to search</div>
                            )}
                            {!isSearchingConsumers && consumers.length > 0 && (
                              <CommandGroup>
                                {consumers.map((consumer) => (
                                  <CommandItem
                                    key={consumer.consumer_id}
                                    value={consumer.consumer_id}
                                    onSelect={() => {
                                      const picked = selectedConsumerId === consumer.consumer_id ? null : consumer
                                      setSelectedConsumerId(picked ? picked.consumer_id : '')
                                      setSelectedConsumerLabel(picked ? picked.label : '')
                                      setConsumerOpen(false)
                                      setConsumerSearch('')
                                      setError('')
                                    }}
                                    className="cursor-pointer text-[12.5px] py-2.5 px-3 gap-2.5 flex items-center"
                                  >
                                    <div className="h-8 w-8 rounded-md bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                                      <User className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-slate-700 truncate">{consumer.label}</p>
                                    </div>
                                    {selectedConsumerId === consumer.consumer_id && (
                                      <Check className="h-3.5 w-3.5 text-violet-600 shrink-0" />
                                    )}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            )}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {selectedConsumerId && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedConsumerId('')
                          setSelectedConsumerLabel('')
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 transition-colors p-0.5"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold text-slate-700">
                      New Barangay <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <Popover open={barangayOpen} onOpenChange={setBarangayOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={barangayOpen}
                            className={cn(
                              'w-full justify-between h-10 px-3 rounded-md text-[12.5px] border-2 transition-colors outline-none',
                              'focus:border-violet-400 focus:ring-2 focus:ring-violet-400 focus:ring-offset-0',
                              selectedBarangayId
                                ? 'border-violet-300 bg-violet-50/60 text-slate-900 font-semibold pr-9'
                                : 'border-slate-200 bg-white hover:border-violet-300 font-normal text-slate-400'
                            )}
                          >
                            <span className="flex items-center gap-2 min-w-0 truncate">
                              {selectedBarangayId && selectedBarangayLabel && (
                                <span className="h-5 w-5 rounded-md bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                                  <Building2 className="h-3 w-3" />
                                </span>
                              )}
                              <span className="truncate">
                                {selectedBarangayId && selectedBarangayLabel
                                  ? selectedBarangayLabel
                                  : 'Select a barangay...'}
                              </span>
                            </span>
                            {!selectedBarangayId && <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-2" />}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-[var(--radix-popover-trigger-width)] p-0 bg-white border border-slate-200 rounded-md shadow-lg"
                          align="start"
                          sideOffset={4}
                        >
                          <Command shouldFilter={false}>
                            <CommandInput
                              placeholder="Search barangay..."
                              value={barangaySearch}
                              onValueChange={setBarangaySearch}
                              className="h-9 text-[12.5px] w-full"
                            />
                            <CommandList className="max-h-64 overflow-y-auto w-full">
                              {filteredBarangays.length === 0 && (
                                <CommandEmpty className="text-[12px] text-slate-400 py-4 text-center">
                                  No barangays found
                                </CommandEmpty>
                              )}
                              {filteredBarangays.length > 0 && (
                                <CommandGroup>
                                  {filteredBarangays.map((barangay) => (
                                    <CommandItem
                                      key={barangay.barangay_id}
                                      value={barangay.barangay_id}
                                      onSelect={() => {
                                        setSelectedBarangayId(barangay.barangay_id)
                                        setSelectedBarangayLabel(barangay.barangay_name)
                                        setSelectedZoneId('')
                                        setSelectedZoneLabel('')
                                        setBarangayOpen(false)
                                        setBarangaySearch('')
                                        setError('')
                                      }}
                                      className="cursor-pointer text-[12.5px] py-2.5 px-3 gap-2.5 flex items-center"
                                    >
                                      <div className="h-8 w-8 rounded-md bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                                        <Building2 className="h-4 w-4" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="font-medium text-slate-700 truncate">{barangay.barangay_name}</p>
                                      </div>
                                      {selectedBarangayId === barangay.barangay_id && (
                                        <Check className="h-3.5 w-3.5 text-violet-600 shrink-0" />
                                      )}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              )}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      {selectedBarangayId && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedBarangayId('')
                            setSelectedBarangayLabel('')
                            setSelectedZoneId('')
                            setSelectedZoneLabel('')
                          }}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 transition-colors p-0.5"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold text-slate-700">
                      New Zone <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <Popover open={zoneOpen} onOpenChange={setZoneOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={zoneOpen}
                            className={cn(
                              'w-full justify-between h-10 px-3 rounded-md text-[12.5px] border-2 transition-colors outline-none',
                              'focus:border-violet-400 focus:ring-2 focus:ring-violet-400 focus:ring-offset-0',
                              selectedZoneId && selectedBarangayId
                                ? 'border-violet-300 bg-violet-50/60 text-slate-900 font-semibold pr-9'
                                : 'border-slate-200 bg-white hover:border-violet-300 font-normal text-slate-400'
                            )}
                            disabled={!selectedBarangayId}
                          >
                            <span className="flex items-center gap-2 min-w-0 truncate">
                              {selectedZoneId && selectedBarangayId && selectedZoneLabel && (
                                <span className="h-5 w-5 rounded-md bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                                  <MapPin className="h-3 w-3" />
                                </span>
                              )}
                              <span className="truncate">
                                {selectedZoneId && selectedZoneLabel
                                  ? selectedZoneLabel
                                  : selectedBarangayId
                                    ? 'Select a zone...'
                                    : 'Select barangay first'}
                              </span>
                            </span>
                            {!selectedZoneId && selectedBarangayId && (
                              <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-2" />
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-[var(--radix-popover-trigger-width)] p-0 bg-white border border-slate-200 rounded-md shadow-lg"
                          align="start"
                          sideOffset={4}
                        >
                          <Command shouldFilter={false}>
                            <CommandInput
                              placeholder="Search zone..."
                              value={zoneSearch}
                              onValueChange={setZoneSearch}
                              className="h-9 text-[12.5px] w-full"
                            />
                            <CommandList className="max-h-64 overflow-y-auto w-full">
                              {filteredZones.length === 0 && (
                                <CommandEmpty className="text-[12px] text-slate-400 py-4 text-center">
                                  {selectedBarangayId ? 'No zones found' : 'Select a barangay first'}
                                </CommandEmpty>
                              )}
                              {filteredZones.length > 0 && (
                                <CommandGroup>
                                  {filteredZones.map((zone) => (
                                    <CommandItem
                                      key={zone.zone_id}
                                      value={zone.zone_id}
                                      onSelect={() => {
                                        setSelectedZoneId(zone.zone_id)
                                        setSelectedZoneLabel(`Zone ${zone.zone_name}`)
                                        setZoneOpen(false)
                                        setZoneSearch('')
                                        setError('')
                                      }}
                                      className="cursor-pointer text-[12.5px] py-2.5 px-3 gap-2.5 flex items-center"
                                    >
                                      <div className="h-8 w-8 rounded-md bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                                        <MapPin className="h-4 w-4" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="font-medium text-slate-700 truncate">Zone {zone.zone_name}</p>
                                      </div>
                                      {selectedZoneId === zone.zone_id && (
                                        <Check className="h-3.5 w-3.5 text-violet-600 shrink-0" />
                                      )}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              )}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      {selectedZoneId && selectedBarangayId && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedZoneId('')
                            setSelectedZoneLabel('')
                          }}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 transition-colors p-0.5"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold text-slate-700">
                  Transfer Reason <span className="text-slate-400">(optional)</span>
                </Label>
                <textarea
                  rows={3}
                  placeholder="Provide a reason for this transfer..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-md text-[12.5px] text-slate-700 bg-white border border-slate-200 outline-none transition-all duration-150 placeholder:text-slate-300 resize-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                />
              </div>

              {meterAccount && (
                <div className="rounded-md bg-white border border-slate-200 overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50/60 border-b border-slate-200">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Current Details</p>
                  </div>
                  <div className="p-3 space-y-1.5">
                    <div className="flex justify-between text-[12px]">
                      <span className="text-slate-500">Contract No:</span>
                      <span className="text-slate-700 font-medium">{meterAccount.meter_serial_no}</span>
                    </div>
                    <div className="flex justify-between text-[12px]">
                      <span className="text-slate-500">Consumer:</span>
                      <span className="text-slate-700">{consumerName}</span>
                    </div>
                    <div className="flex justify-between text-[12px]">
                      <span className="text-slate-500">Location:</span>
                      <span className="text-slate-700">
                        Zone {meterAccount.zone?.zone_name}, {meterAccount.zone?.barangay?.barangay_name}
                      </span>
                    </div>
                    <div className="flex justify-between text-[12px]">
                      <span className="text-slate-500">Classification:</span>
                      <span className="text-slate-700">{meterAccount.classification?.classification_name}</span>
                    </div>
                    <div className="flex justify-between text-[12px]">
                      <span className="text-slate-500">Status:</span>
                      <span className="text-slate-700">{meterAccount.account_status?.status_name}</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-md bg-rose-50 border border-rose-200">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-rose-700">{error}</p>
            </div>
          )}
        </div>

        <Separator />

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-end gap-2.5 bg-slate-50/60">
          <SheetClose asChild>
            <Button
              type="button"
              variant="outline"
              className="rounded-md h-9 text-[13px] border-2 border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-600"
              disabled={isLoading}
            >
              Cancel
            </Button>
          </SheetClose>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={
              isLoading ||
              !meterAccountId ||
              (transferType === 'OWNERSHIP' && !selectedConsumerId) ||
              (transferType === 'RELOCATION' && !selectedZoneId)
            }
            className="rounded-md h-9 text-[13px] bg-violet-600 hover:bg-violet-700 text-white gap-1.5 font-medium shadow-sm shadow-violet-200"
          >
            {isLoading ? (
              <><Spinner /> Processing...</>
            ) : (
              <><ArrowRightLeft className="h-3.5 w-3.5" /> {transferType === 'OWNERSHIP' ? 'Transfer Ownership' : 'Relocate'}</>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default CreateMeterTransferForm