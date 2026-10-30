'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'



import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Loader2, MapPin, Check,
  ChevronsUpDown, Building2, X,
} from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'

import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'

import {
  getAllBarangays,
  getZonesByBarangay,
  createAssignment,
} from '@/lib/actions/job-assignment/meter-reader-assignments.actions'

interface BarangayOption { barangay_id: string; barangay_name: string }
interface ZoneOption { zone_id: string; zone_name: string }
interface StagedZone { zone_id: string; zone_name: string; barangay_name: string }

interface AssignZoneFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  readerId: string
  readerName: string
  readerEmail: string
  onSuccess?: () => void
}

export function AssignZoneForm({
  open, onOpenChange, readerId, readerName, onSuccess,
}: AssignZoneFormProps) {
  const [barangays, setBarangays] = useState<BarangayOption[]>([])
  const [zones, setZones] = useState<ZoneOption[]>([])
  const [selectedBarangay, setSelectedBarangay] = useState<BarangayOption | null>(null)
  const [selectedZone, setSelectedZone] = useState<ZoneOption | null>(null)
  const [isLoadingBarangays, setIsLoadingBarangays] = useState(false)
  const [isLoadingZones, setIsLoadingZones] = useState(false)

  // Staged zones — picked but not yet saved. Submitted together in one call.
  const [stagedZones, setStagedZones] = useState<StagedZone[]>([])
  const [isSubmittingZones, setIsSubmittingZones] = useState(false)

  const [barangayOpen, setBarangayOpen] = useState(false)
  const [barangaySearch, setBarangaySearch] = useState('')
  const debouncedBarangaySearch = useDebouncedSearch(barangaySearch)
  const [zoneOpen, setZoneOpen] = useState(false)
  const [zoneSearch, setZoneSearch] = useState('')
  const debouncedZoneSearch = useDebouncedSearch(zoneSearch)

  useEffect(() => {
    if (!open) return
    setIsLoadingBarangays(true)
    getAllBarangays()
      .then(setBarangays)
      .catch(() => toast.error('Failed to load barangays'))
      .finally(() => setIsLoadingBarangays(false))
  }, [open])

  useEffect(() => {
    if (!open) {
      setSelectedBarangay(null)
      setSelectedZone(null)
      setZones([])
      setStagedZones([])
      setBarangaySearch('')
      setZoneSearch('')
    }
  }, [open])

  // Only zones this reader isn't already actively assigned to come back here.
  const handleBarangaySelect = useCallback(async (barangayId: string) => {
    const b = barangays.find((x) => x.barangay_id === barangayId)
    if (!b) return
    setSelectedBarangay(b)
    setBarangayOpen(false)
    setBarangaySearch('')
    setSelectedZone(null)
    setZones([])
    setIsLoadingZones(true)
    try {
      const data = await getZonesByBarangay(b.barangay_id, readerId)
      setZones(data)
    } catch {
      toast.error('Failed to load zones')
    } finally {
      setIsLoadingZones(false)
    }
  }, [barangays, readerId])

  const clearBarangay = useCallback(() => {
    setSelectedBarangay(null)
    setSelectedZone(null)
    setZones([])
  }, [])

  const clearZone = useCallback(() => setSelectedZone(null), [])

  const handleAddZone = () => {
    if (!selectedZone || !selectedBarangay) return
    if (stagedZones.some((z) => z.zone_id === selectedZone.zone_id)) {
      toast.error('That zone is already in your list')
      return
    }
    setStagedZones((prev) => [
      ...prev,
      { zone_id: selectedZone.zone_id, zone_name: selectedZone.zone_name, barangay_name: selectedBarangay.barangay_name },
    ])
    setZones((prev) => prev.filter((z) => z.zone_id !== selectedZone.zone_id))
    setSelectedZone(null)
  }

  const handleUnstageZone = (zoneId: string) => {
    const removed = stagedZones.find((z) => z.zone_id === zoneId)
    setStagedZones((prev) => prev.filter((z) => z.zone_id !== zoneId))
    if (
      removed &&
      selectedBarangay &&
      removed.barangay_name === selectedBarangay.barangay_name
    ) {
      setZones((prev) =>
        prev.some((z) => z.zone_id === removed.zone_id)
          ? prev
          : [...prev, { zone_id: removed.zone_id, zone_name: removed.zone_name }],
      )
    }
  }

  const handleSubmitZones = async () => {
    if (stagedZones.length === 0) {
      toast.error('Add at least one zone first')
      return
    }
    setIsSubmittingZones(true)
    try {
      const result = await createAssignment({
        user_id: readerId,
        zones: stagedZones.map((z) => ({ zone_id: z.zone_id })),
      })
      if (result.status === 'success') {
        toast.success(result.message || 'Zones assigned successfully')
        setStagedZones([])
        setSelectedBarangay(null)
        setSelectedZone(null)
        setZones([])
        onOpenChange(false)
        onSuccess?.()
      } else {
        toast.error(result.message || 'Failed to assign zones')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsSubmittingZones(false)
    }
  }

  const handleCancel = () => {
    setStagedZones([])
    onOpenChange(false)
  }

  const filteredBarangays = debouncedBarangaySearch
    ? barangays.filter((b) => b.barangay_name.toLowerCase().includes(debouncedBarangaySearch.toLowerCase()))
    : barangays

  const filteredZones = debouncedZoneSearch
    ? zones.filter((z) => z.zone_name.toLowerCase().includes(debouncedZoneSearch.toLowerCase()))
    : zones

  const triggerClass = (selected: boolean) =>
    cn(
      'w-full justify-between !h-9 px-3 !rounded-md border bg-background text-sm font-medium text-foreground shadow-none',
      selected ? 'border-primary pr-9' : 'border-input',
    )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col h-full p-0 gap-0 border-l border-border bg-background">
        <div className="px-6 pt-6 pb-5 border-b border-border shrink-0">
          <div className="flex items-start gap-3 pr-8">
            <div className="h-10 w-10 rounded-md bg-primary flex items-center justify-center shrink-0">
              <Plus className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-base font-semibold text-foreground leading-tight">
                Assign zones
              </SheetTitle>
              <p className="text-sm text-foreground/80 mt-0.5 truncate">{readerName}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-foreground">Barangay</Label>
            <div className="relative">
              <Popover open={barangayOpen} onOpenChange={setBarangayOpen} modal={false}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={barangayOpen}
                    disabled={isLoadingBarangays}
                    className={triggerClass(!!selectedBarangay)}
                  >
                    <span className="flex items-center gap-2 min-w-0 truncate">
                      <Building2 className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate">
                        {isLoadingBarangays
                          ? 'Loading barangays…'
                          : selectedBarangay
                            ? selectedBarangay.barangay_name
                            : 'Select a barangay'}
                      </span>
                    </span>
                    {!selectedBarangay && <ChevronsUpDown className="h-4 w-4 shrink-0 text-foreground/70" />}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[var(--radix-popover-trigger-width)] overflow-hidden gap-0 p-0 bg-popover text-popover-foreground border border-border rounded-md shadow-lg"
                  align="start" sideOffset={6} collisionPadding={12} avoidCollisions side="bottom"
                >
                  <Command shouldFilter={false} className="bg-popover text-popover-foreground">
                    <CommandInput
                      placeholder="Search barangay"
                      value={barangaySearch}
                      onValueChange={setBarangaySearch}
                    />
                    <CommandList className="max-h-64">
                      {isLoadingBarangays && (
                        <div className="flex items-center justify-center gap-2 py-6 text-sm font-medium text-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                        </div>
                      )}
                      {!isLoadingBarangays && filteredBarangays.length === 0 && (
                        <CommandEmpty className="py-6 text-center text-sm font-medium text-foreground">
                          No matching barangays
                        </CommandEmpty>
                      )}
                      {!isLoadingBarangays && filteredBarangays.length > 0 && (
                        <CommandGroup>
                          {filteredBarangays.map((b) => {
                            const isSelected = selectedBarangay?.barangay_id === b.barangay_id
                            return (
                              <CommandItem
                                key={b.barangay_id}
                                value={b.barangay_id}
                                onSelect={() => handleBarangaySelect(b.barangay_id)}
                                className="cursor-pointer text-sm py-2.5 gap-2.5 text-foreground"
                              >
                                <Building2 className="h-4 w-4 text-primary shrink-0" />
                                <p className="flex-1 min-w-0 font-medium text-foreground truncate">{b.barangay_name}</p>
                                {isSelected && <Check className="h-4 w-4 text-primary ml-auto shrink-0" />}
                              </CommandItem>
                            )
                          })}
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedBarangay && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); clearBarangay() }}
                  aria-label="Clear barangay"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground/80 hover:text-destructive p-0.5"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold text-foreground">Zone</Label>
            <div className="relative">
              <Popover open={zoneOpen} onOpenChange={setZoneOpen} modal={false}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={zoneOpen}
                    disabled={!selectedBarangay || isLoadingZones}
                    className={cn(triggerClass(!!selectedZone), !selectedBarangay && 'opacity-70')}
                  >
                    <span className="flex items-center gap-2 min-w-0 truncate">
                      <MapPin className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate">
                        {!selectedBarangay
                          ? 'Select a barangay first'
                          : isLoadingZones
                            ? 'Loading zones…'
                            : selectedZone
                              ? selectedZone.zone_name
                              : 'Select a zone'}
                      </span>
                    </span>
                    {!selectedZone && <ChevronsUpDown className="h-4 w-4 shrink-0 text-foreground/70" />}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[var(--radix-popover-trigger-width)] overflow-hidden gap-0 p-0 bg-popover text-popover-foreground border border-border rounded-md shadow-lg"
                  align="start" sideOffset={6} collisionPadding={12} avoidCollisions side="bottom"
                >
                  <Command shouldFilter={false} className="bg-popover text-popover-foreground">
                    <CommandInput
                      placeholder="Search zone"
                      value={zoneSearch}
                      onValueChange={setZoneSearch}
                    />
                    <CommandList className="max-h-64">
                      {isLoadingZones && (
                        <div className="flex items-center justify-center gap-2 py-6 text-sm font-medium text-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                        </div>
                      )}
                      {!isLoadingZones && filteredZones.length === 0 && (
                        <CommandEmpty className="py-6 text-center text-sm font-medium text-foreground px-4">
                          {zones.length === 0 && selectedBarangay
                            ? 'Every zone in this barangay is already assigned or added.'
                            : 'No matching zones'}
                        </CommandEmpty>
                      )}
                      {!isLoadingZones && filteredZones.length > 0 && (
                        <CommandGroup>
                          {filteredZones.map((z) => {
                            const isSelected = selectedZone?.zone_id === z.zone_id
                            return (
                              <CommandItem
                                key={z.zone_id}
                                value={z.zone_id}
                                onSelect={() => {
                                  setSelectedZone(z)
                                  setZoneOpen(false)
                                  setZoneSearch('')
                                }}
                                className="cursor-pointer text-sm py-2.5 gap-2.5 text-foreground"
                              >
                                <MapPin className="h-4 w-4 text-primary shrink-0" />
                                <p className="flex-1 min-w-0 font-medium text-foreground truncate">{z.zone_name}</p>
                                {isSelected && <Check className="h-4 w-4 text-primary ml-auto shrink-0" />}
                              </CommandItem>
                            )
                          })}
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedZone && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); clearZone() }}
                  aria-label="Clear zone"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground/80 hover:text-destructive p-0.5"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleAddZone}
              disabled={!selectedZone}
              className="w-full !h-9 !rounded-md text-sm font-semibold"
            >
              <Plus className="h-4 w-4" />
              Add zone to list
            </Button>
          </div>

          <div className="rounded-md border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <p className="text-sm font-semibold text-foreground">Zones to assign</p>
              <span className="text-sm font-medium text-foreground/80">{stagedZones.length}</span>
            </div>
            {stagedZones.length === 0 ? (
              <p className="px-4 py-6 text-sm text-foreground/80 text-center">
                Nothing added yet. Select a zone, then add it here.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {stagedZones.map((z) => (
                  <div key={z.zone_id} className="flex items-center gap-3 px-4 py-3">
                    <div className="h-9 w-9 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                      <MapPin className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">{z.zone_name}</p>
                      <p className="text-sm text-foreground/80 truncate">{z.barangay_name}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUnstageZone(z.zone_id)}
                      aria-label={`Remove ${z.zone_name}`}
                      className="h-8 px-2 rounded-md text-sm font-medium text-foreground/80 hover:text-destructive hover:bg-destructive/10"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border bg-background shrink-0 flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isSubmittingZones}
            className="flex-1 !h-10 !rounded-md text-sm font-semibold"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmitZones}
            disabled={isSubmittingZones || stagedZones.length === 0}
            className="flex-1 !h-10 !rounded-md text-sm font-semibold"
          >
            {isSubmittingZones ? <Spinner /> : <Check className="h-4 w-4" />}
            {stagedZones.length > 0 ? `Assign ${stagedZones.length}` : 'Assign'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default AssignZoneForm