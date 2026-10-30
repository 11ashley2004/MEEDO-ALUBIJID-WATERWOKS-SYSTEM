// can search account name
'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'


import React, { useState, useEffect } from 'react'
import { ArrowRightLeft, Loader2, AlertTriangle, User, MapPin, Check, ChevronsUpDown, Building2, X } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Label } from '@/components/ui/label'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { 
  getMeterAccountById,
  transferMeterAccount,
  getAllBarangaysForSelect,
  getZonesByBarangay,
  searchConsumers,
} from '@/lib/actions/meter-transfers/meter-transfer.actions'
import { toast } from 'sonner'

interface TransferMeterAccountModalProps {
  meterAccountId: string
  onSuccess?: () => void
  children?: React.ReactNode
}

type TransferType = 'OWNERSHIP' | 'RELOCATION'

const TransferMeterAccountModal: React.FC<TransferMeterAccountModalProps> = ({
  meterAccountId,
  onSuccess,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(false)
  const [meterAccount, setMeterAccount] = useState<any>(null)
  const [barangays, setBarangays] = useState<any[]>([])
  const [zones, setZones] = useState<any[]>([])
  const [transferType, setTransferType] = useState<TransferType>('OWNERSHIP')
  const [selectedBarangayId, setSelectedBarangayId] = useState('')
  const [selectedConsumerId, setSelectedConsumerId] = useState('')
  const [selectedZoneId, setSelectedZoneId] = useState('')
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')
  
  // Consumer combobox state
  const [consumerOpen, setConsumerOpen] = useState(false)
  const [consumerSearch, setConsumerSearch] = useState('')
  const debouncedConsumerSearch = useDebouncedSearch(consumerSearch)
  const [consumers, setConsumers] = useState<any[]>([])
  const [isSearchingConsumers, setIsSearchingConsumers] = useState(false)

  // Barangay combobox state
  const [barangayOpen, setBarangayOpen] = useState(false)
  const [barangaySearch, setBarangaySearch] = useState('')
  const debouncedBarangaySearch = useDebouncedSearch(barangaySearch)

  // Zone combobox state
  const [zoneOpen, setZoneOpen] = useState(false)
  const [zoneSearch, setZoneSearch] = useState('')
  const debouncedZoneSearch = useDebouncedSearch(zoneSearch)

  useEffect(() => {
    const fetchData = async () => {
      if (!isOpen || !meterAccountId) return
      setIsFetching(true)
      try {
        const [meterAccountData, barangaysData] = await Promise.all([
          getMeterAccountById(meterAccountId),
          getAllBarangaysForSelect(),
        ])
        setMeterAccount(meterAccountData)
        setBarangays(barangaysData)
        if (meterAccountData) {
          setSelectedBarangayId(meterAccountData.barangay_id || '')
        }
      } catch (err) {
        console.error('Error fetching data:', err)
        toast.error('Failed to load data')
        setIsOpen(false)
      } finally {
        setIsFetching(false)
      }
    }
    fetchData()
  }, [isOpen, meterAccountId])

  useEffect(() => {
    const searchConsumersDebounced = async () => {
      if (!debouncedConsumerSearch.trim()) {
        setConsumers([])
        return
      }
      setIsSearchingConsumers(true)
      try {
        const results = await searchConsumers(debouncedConsumerSearch, 10)
        setConsumers(results || [])
      } catch (err) {
        console.error('Error searching consumers:', err)
      } finally {
        setIsSearchingConsumers(false)
      }
    }
    const timer = setTimeout(searchConsumersDebounced, 300)
    return () => clearTimeout(timer)
  }, [debouncedConsumerSearch])

  useEffect(() => {
    const fetchZones = async () => {
      if (!selectedBarangayId) {
        setZones([])
        return
      }
      try {
        const zonesData = await getZonesByBarangay(selectedBarangayId)
        setZones(zonesData)
      } catch (err) {
        console.error('Error fetching zones:', err)
        toast.error('Failed to load zones')
      }
    }
    fetchZones()
  }, [selectedBarangayId])

  useEffect(() => {
    if (!isOpen) {
      setSelectedBarangayId('')
      setSelectedConsumerId('')
      setSelectedZoneId('')
      setConsumerSearch('')
      setBarangaySearch('')
      setZoneSearch('')
      setConsumers([])
      setError('')
      setReason('')
      setMeterAccount(null)
      setTransferType('OWNERSHIP')
    }
  }, [isOpen])

  const handleConfirm = async () => {
    setError('')
    if (transferType === 'OWNERSHIP' && !selectedConsumerId) {
      setError('Please select a consumer')
      return
    }
    if (transferType === 'RELOCATION' && !selectedZoneId) {
      setError('Please select a zone')
      return
    }
    setIsLoading(true)
    try {
      let result
      if (transferType === 'OWNERSHIP') {
        result = await transferMeterAccount(meterAccountId, {
          transfer_type: 'OWNERSHIP',
          new_consumer_id: selectedConsumerId,
          transfer_reason: reason || null,
        })
      } else {
        result = await transferMeterAccount(meterAccountId, {
          transfer_type: 'RELOCATION',
          new_zone_id: selectedZoneId,
          transfer_reason: reason || null,
        })
      }
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

  // Get consumer name from account_name
  const consumerName = meterAccount?.consumer?.account_name || 'Unknown Consumer'

  const selectedConsumer = consumers.find(c => c.consumer_id === selectedConsumerId)

  // Filter barangays
  const filteredBarangays = debouncedBarangaySearch
    ? barangays.filter((b) => b.barangay_name.toLowerCase().includes(debouncedBarangaySearch.toLowerCase()))
    : barangays

  // Filter zones
  const filteredZones = debouncedZoneSearch
    ? zones.filter((z) => z.zone_name.toLowerCase().includes(debouncedZoneSearch.toLowerCase()))
    : zones

  if (isFetching) {
    return (
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>{children}</SheetTrigger>
        <SheetContent className="w-full sm:max-w-md flex flex-col h-full p-0 gap-0 border-l border-slate-200 bg-white">
          <div className="px-6 pt-6 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-md bg-violet-100 border border-violet-200 flex items-center justify-center shrink-0">
                <ArrowRightLeft className="h-4 w-4 text-violet-600" />
              </div>
              <div>
                <SheetTitle className="text-[14px] font-bold text-slate-900 leading-tight">
                  Transfer Meter Account
                </SheetTitle>
                <SheetDescription className="text-[11px] text-slate-500 mt-0.5">
                  Loading meter account details...
                </SheetDescription>
              </div>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent className="w-full sm:max-w-md flex flex-col h-full p-0 gap-0 border-l border-slate-200 bg-white">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-violet-600 flex items-center justify-center shrink-0">
              <ArrowRightLeft className="h-[18px] w-[18px] text-white" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-[14px] font-bold text-slate-900 leading-tight">
                Transfer Meter Account
              </SheetTitle>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                {meterAccount?.meter_serial_no} · {consumerName}
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-slate-50/60 px-6 py-5 space-y-5">

          {/* Transfer Type - Simple toggle buttons */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold text-slate-700">
              Transfer Type <span className="text-red-500">*</span>
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setTransferType('OWNERSHIP')
                  setError('')
                }}
                className={cn(
                  'flex items-center justify-center gap-2 h-10 px-4 rounded-md text-[13px] font-medium border-2 transition-all',
                  transferType === 'OWNERSHIP'
                    ? 'border-violet-600 bg-violet-50 text-violet-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:bg-violet-50/50'
                )}
              >
                <User className="h-3.5 w-3.5" />
                Change Owner
              </button>
              <button
                type="button"
                onClick={() => {
                  setTransferType('RELOCATION')
                  setError('')
                }}
                className={cn(
                  'flex items-center justify-center gap-2 h-10 px-4 rounded-md text-[13px] font-medium border-2 transition-all',
                  transferType === 'RELOCATION'
                    ? 'border-violet-600 bg-violet-50 text-violet-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:bg-violet-50/50'
                )}
              >
                <MapPin className="h-3.5 w-3.5" />
                Relocate
              </button>
            </div>
          </div>

          {/* Content based on transfer type */}
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
                        {selectedConsumerId && selectedConsumer && (
                          <span className="h-5 w-5 rounded-md bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                            <User className="h-3 w-3" />
                          </span>
                        )}
                        <span className="truncate">
                          {selectedConsumerId && selectedConsumer
                            ? selectedConsumer.label
                            : 'Search for a consumer...'}
                        </span>
                      </span>
                      {!selectedConsumerId && (
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
                        placeholder="Search consumer..."
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
                          <div className="py-4 text-center text-[12px] text-slate-400">
                            Start typing to search
                          </div>
                        )}
                        {!isSearchingConsumers && consumers.length > 0 && (
                          <CommandGroup>
                            {consumers.map((consumer) => (
                              <CommandItem
                                key={consumer.consumer_id}
                                value={consumer.consumer_id}
                                onSelect={() => {
                                  setSelectedConsumerId(
                                    selectedConsumerId === consumer.consumer_id ? '' : consumer.consumer_id
                                  )
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
                                  <p className="font-medium text-slate-700 truncate">
                                    {consumer.label}
                                  </p>
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
                    onClick={() => setSelectedConsumerId('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 transition-colors p-0.5"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* New Barangay - Popover/Command style */}
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
                          {selectedBarangayId && (
                            <span className="h-5 w-5 rounded-md bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                              <Building2 className="h-3 w-3" />
                            </span>
                          )}
                          <span className="truncate">
                            {selectedBarangayId
                              ? barangays.find(b => b.barangay_id === selectedBarangayId)?.barangay_name
                              : 'Select a barangay...'}
                          </span>
                        </span>
                        {!selectedBarangayId && (
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
                                    setSelectedZoneId('')
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
                                    <p className="font-medium text-slate-700 truncate">
                                      {barangay.barangay_name}
                                    </p>
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
                        setSelectedZoneId('')
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 transition-colors p-0.5"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* New Zone - Popover/Command style */}
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
                          {selectedZoneId && selectedBarangayId && (
                            <span className="h-5 w-5 rounded-md bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                              <MapPin className="h-3 w-3" />
                            </span>
                          )}
                          <span className="truncate">
                            {selectedZoneId && selectedBarangayId
                              ? `Zone ${zones.find(z => z.zone_id === selectedZoneId)?.zone_name || ''}`
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
                                    <p className="font-medium text-slate-700 truncate">
                                      Zone {zone.zone_name}
                                    </p>
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
                      onClick={() => setSelectedZoneId('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 transition-colors p-0.5"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Transfer Reason */}
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

          {/* Current Details */}
          {meterAccount && (
            <div className="rounded-md bg-white border border-slate-200 overflow-hidden">
              <div className="px-3 py-2 bg-slate-50/60 border-b border-slate-200">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                  Current Details
                </p>
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

export default TransferMeterAccountModal