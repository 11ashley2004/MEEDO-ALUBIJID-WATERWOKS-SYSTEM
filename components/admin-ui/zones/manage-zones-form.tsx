'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Power, PowerOff, MapPin, Layers, Check } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'

import {
  Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

import {
  getZonesByBarangay,
  createZone,
} from '@/lib/actions/zone.actions'
import ZoneStatusModal from '@/components/admin-ui/zones/zone-status-modal'

interface ZoneRow {
  zone_id: string
  zone_name: string
  is_active: boolean
  created_at: string
}

interface ManageZonesFormProps {
  barangayId: string
  barangayName: string
  onSuccess?: () => void
  children?: React.ReactNode
}

export function ManageZonesForm({
  barangayId,
  barangayName,
  onSuccess,
  children,
}: ManageZonesFormProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [zones, setZones] = useState<ZoneRow[]>([])

  const [zoneName, setZoneName] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [zoneNameError, setZoneNameError] = useState<string | null>(null)

  // Zone status confirmation modal
  const [statusModalOpen, setStatusModalOpen] = useState(false)
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)

  const loadZones = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await getZonesByBarangay(barangayId)
      setZones(
        (data as any[]).map((z) => ({
          zone_id: z.zone_id,
          zone_name: z.zone_name,
          is_active: z.is_active,
          created_at: z.created_at,
        })),
      )
    } catch (error) {
      console.error('Failed to load zones:', error)
      toast.error('Failed to load zones')
      setZones([])
    } finally {
      setIsLoading(false)
    }
  }, [barangayId])

  useEffect(() => {
    if (!isOpen) return
    loadZones()
  }, [isOpen, loadZones])

  useEffect(() => {
    if (!isOpen) {
      setZoneName('')
      setZoneNameError(null)
    }
  }, [isOpen])

  const handleAddZone = async () => {
    const name = zoneName.trim()
    if (!name) {
      setZoneNameError('Please enter a zone name')
      return
    }
    setZoneNameError(null)

    setIsAdding(true)
    try {
      const result = await createZone({ zone_name: name, barangay_id: barangayId })
      if (result.status === 'success' && result.data) {
        toast.success(`Zone "${name}" added`)
        setZoneName('')
        setZones((prev) =>
          [
            ...prev,
            {
              zone_id: result.data.zone_id,
              zone_name: result.data.zone_name,
              is_active: result.data.is_active,
              created_at: result.data.created_at,
            },
          ].sort((a, b) => a.zone_name.localeCompare(b.zone_name)),
        )
        onSuccess?.()
      } else {
        // Duplicate-name errors etc. from createZone also show inline, not just as a toast
        setZoneNameError(result.message || 'Failed to add zone')
        toast.error(result.message || 'Failed to add zone')
      }
    } catch (error) {
      console.error('Failed to add zone:', error)
      setZoneNameError('Failed to add zone')
      toast.error('Failed to add zone')
    } finally {
      setIsAdding(false)
    }
  }

  // Open confirmation modal instead of toggling directly
  const handleToggleClick = (zone: ZoneRow) => {
    setSelectedZoneId(zone.zone_id)
    setStatusModalOpen(true)
  }

  // Called by ZoneStatusModal after a successful toggle
  const handleStatusModalSuccess = () => {
    // Re-fetch so the list (active state, ordering) reflects the confirmed change
    loadZones()
    onSuccess?.()
  }

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          {children ?? (
            <Button className="h-9 gap-2 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-semibold shadow-sm">
              <Layers className="h-4 w-4" />
              Manage Zones
            </Button>
          )}
        </SheetTrigger>

        <SheetContent className="w-full sm:max-w-md flex flex-col h-full p-0 gap-0 border-l border-slate-200 bg-white">

          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
            <SheetTitle className="text-[14px] font-bold text-slate-900">
              Manage Zones
            </SheetTitle>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Add and manage zones in{' '}
              <span className="font-semibold text-slate-700">{barangayName}</span>
            </p>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto bg-slate-50/60 p-6 space-y-5">

            {/* Add Zone */}
            <div className="space-y-2">
              <Label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                Add New Zone
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="e.g. Zone 1, Purok 3..."
                  value={zoneName}
                  onChange={(e) => {
                    setZoneName(e.target.value)
                    if (zoneNameError) setZoneNameError(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddZone()
                    }
                  }}
                  disabled={isAdding}
                  className={cn(
                    'h-9 rounded-md text-[12.5px] bg-white focus-visible:ring-2',
                    zoneNameError
                      ? 'border-red-300 focus-visible:ring-red-100 focus-visible:border-red-400'
                      : 'border-slate-200 focus-visible:ring-violet-100 focus-visible:border-violet-400',
                  )}
                />
                <Button
                  type="button"
                  onClick={handleAddZone}
                  disabled={isAdding}
                  className="h-9 shrink-0 rounded-md bg-violet-600 hover:bg-violet-700 text-white px-3"
                >
                  {isAdding ? (
                    <Spinner />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
              {zoneNameError && (
                <p className="text-[10.5px] text-red-500 font-medium">{zoneNameError}</p>
              )}
            </div>

            {/* Existing Zones */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Existing Zones
                </Label>
                {!isLoading && (
                  <span className="text-[10px] text-slate-400">
                    {zones.length} zone{zones.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
                {isLoading && (
                  <div className="p-3 space-y-1.5">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="flex items-center gap-3 px-2 py-2.5">
                        <div className="h-8 w-8 rounded-md bg-slate-100 animate-pulse shrink-0" />
                        <div className="flex-1 h-3 bg-slate-100 rounded-md animate-pulse" />
                        <div className="h-7 w-7 rounded-md bg-slate-100 animate-pulse shrink-0" />
                      </div>
                    ))}
                  </div>
                )}

                {!isLoading && zones.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-10 gap-2 px-6">
                    <div className="h-10 w-10 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center">
                      <MapPin className="h-4 w-4 text-violet-300" />
                    </div>
                    <p className="text-[12px] font-semibold text-slate-600">No zones yet</p>
                    <p className="text-[11px] text-slate-400 text-center">
                      Add the first zone for this barangay above.
                    </p>
                  </div>
                )}

                {!isLoading && zones.length > 0 && (
                  <div className="divide-y divide-slate-100">
                    {zones.map((zone) => (
                      <div
                        key={zone.zone_id}
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50/70 transition-colors"
                      >
                        <div className="h-8 w-8 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center shrink-0">
                          <MapPin className="h-3.5 w-3.5 text-violet-500" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-[12.5px] font-medium text-slate-700 truncate">
                            {zone.zone_name}
                          </p>
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 mt-0.5 text-[10px] font-semibold',
                              zone.is_active ? 'text-emerald-600' : 'text-slate-400',
                            )}
                          >
                            <span
                              className={cn(
                                'h-1.5 w-1.5 rounded-full',
                                zone.is_active ? 'bg-emerald-500' : 'bg-slate-300',
                              )}
                            />
                            {zone.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleToggleClick(zone)}
                          title={zone.is_active ? 'Deactivate zone' : 'Activate zone'}
                          className={cn(
                            'h-7 w-7 rounded-md border flex items-center justify-center shrink-0 transition-colors',
                            zone.is_active
                              ? 'border-slate-200 text-slate-400 hover:border-red-300 hover:text-red-600 hover:bg-red-50'
                              : 'border-slate-200 text-slate-400 hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50',
                          )}
                        >
                          {zone.is_active ? (
                            <PowerOff className="h-3.5 w-3.5" />
                          ) : (
                            <Power className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-100 bg-white shrink-0">
            <SheetClose asChild>
              <Button
                variant="outline"
                className="w-full rounded-md h-9 text-[13px] border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-600"
              >
                <Check className="h-3.5 w-3.5 mr-1.5" />
                Done
              </Button>
            </SheetClose>
          </div>

        </SheetContent>
      </Sheet>

      {/* Confirmation modal — rendered outside the Sheet so it can sit on top of it */}
      <ZoneStatusModal
        isOpen={statusModalOpen}
        setIsOpen={setStatusModalOpen}
        zoneId={selectedZoneId}
        onSuccess={handleStatusModalSuccess}
      />
    </>
  )
}

export default ManageZonesForm