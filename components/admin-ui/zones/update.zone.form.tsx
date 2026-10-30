'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller } from 'react-hook-form'
import { toast } from 'sonner'
import { Loader2, AlertCircle } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { UpdateZoneFormValues, updateZoneFormSchema } from '@/lib/validation/zone.validation'
import { updateZone, getAllBarangaysForSelect, getZoneById } from '@/lib/actions/zone.actions'

interface BarangayOption {
  barangay_id: string;
  barangay_name: string;
}

interface UpdateZoneFormProps {
  zoneId: string
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

const field = (err?: boolean) => cn(
  'w-full h-9 px-3 rounded-md text-[13px] text-slate-700',
  'bg-white border outline-none transition-all duration-150 placeholder:text-slate-300',
  err
    ? 'border-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-100'
    : 'border-slate-200 hover:border-violet-300 focus:border-violet-400 focus:ring-2 focus:ring-violet-100',
)

function FieldLabelText({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
      {label}
      {required && <span className="text-rose-400 text-[11px] leading-none">*</span>}
    </label>
  )
}

function FieldErrorText({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="flex items-center gap-1 text-[10.5px] text-rose-500 mt-1">
      <AlertCircle className="h-3 w-3 shrink-0" />{message}
    </p>
  )
}

const UpdateZoneForm = ({ zoneId, isOpen, onOpenChange, onSuccess }: UpdateZoneFormProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [barangays, setBarangays] = useState<BarangayOption[]>([])
  const [isLoadingBarangays, setIsLoadingBarangays] = useState(true)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [zoneData, setZoneData] = useState<{
    zone_name: string
    barangay_id: string
    is_active: boolean
  } | null>(null)

  const form = useForm<UpdateZoneFormValues>({
    resolver: zodResolver(updateZoneFormSchema),
    defaultValues: {
      zone_name: '',
      barangay_id: '',
    },
  })

  // Fetch zone data when sheet opens
  useEffect(() => {
    const fetchZoneData = async () => {
      if (!isOpen) return
      
      setIsLoading(true)
      setSubmitError(null)
      try {
        const result = await getZoneById(zoneId)
        if (result.status === 'success' && result.data) {
          const zone = result.data
          setZoneData({
            zone_name: zone.zone_name,
            barangay_id: zone.barangay.barangay_id,
            is_active: zone.is_active,
          })
          form.reset({
            zone_name: zone.zone_name,
            barangay_id: zone.barangay.barangay_id,
          })
        } else {
          toast.error('Failed to load zone data')
          onOpenChange(false)
        }
      } catch {
        toast.error('An error occurred')
        onOpenChange(false)
      } finally {
        setIsLoading(false)
      }
    }

    fetchZoneData()
  }, [isOpen, zoneId, form, onOpenChange])

  // Fetch barangays when sheet opens
  useEffect(() => {
    const fetchBarangays = async () => {
      if (!isOpen) return;
      
      setIsLoadingBarangays(true);
      try {
        const data = await getAllBarangaysForSelect();
        setBarangays(data);
      } catch (err) {
        console.error('Error fetching barangays:', err);
        toast.error('Failed to load barangays');
      } finally {
        setIsLoadingBarangays(false);
      }
    };

    fetchBarangays();
  }, [isOpen]);

  const onSubmit = async (values: UpdateZoneFormValues) => {
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const result = await updateZone(zoneId, {
        zone_name: values.zone_name,
        barangay_id: values.barangay_id,
        is_active: zoneData?.is_active ?? true,
      })

      if (result.status === 'success') {
        toast.success('Zone updated successfully')
        onOpenChange(false)
        onSuccess()
      } else {
        setSubmitError(result.message || 'Failed to update zone')
      }
    } catch (err) {
      console.error('Update error:', err)
      setSubmitError('An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col h-full p-0 gap-0 border-l border-slate-200 bg-white">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-violet-100 border border-violet-200 flex items-center justify-center shrink-0">
              <svg className="h-4 w-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <div>
              <SheetTitle className="text-[14px] font-bold text-slate-900 leading-tight">
                Edit Zone
              </SheetTitle>
              <SheetDescription className="text-[11px] text-slate-400 mt-0.5">
                Update zone information.
              </SheetDescription>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
            </div>
          ) : (
            <form id="update-zone-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

              {/* Error Banner */}
              {submitError && (
                <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-md bg-rose-50 border border-rose-200">
                  <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
                  <p className="text-xs font-medium text-rose-600">{submitError}</p>
                </div>
              )}

              {/* Zone Name */}
              <div>
                <FieldLabelText label="Zone Name" required />
                <Controller
                  name="zone_name"
                  control={form.control}
                  render={({ field: controllerField, fieldState }) => (
                    <>
                      <Input
                        {...controllerField}
                        id="edit-zone_name"
                        placeholder="Enter zone name"
                        className={field(!!fieldState.error)}
                      />
                      <FieldErrorText message={fieldState.error?.message} />
                    </>
                  )}
                />
                <p className="text-[11px] text-slate-400 mt-1.5">Enter the name of the zone</p>
              </div>

              {/* Barangay */}
              <div>
                <FieldLabelText label="Barangay" required />
                <Controller
                  name="barangay_id"
                  control={form.control}
                  render={({ field: controllerField, fieldState }) => (
                    <>
                      <Select
                        onValueChange={controllerField.onChange}
                        value={controllerField.value}
                        disabled={isLoadingBarangays}
                      >
                        <SelectTrigger className={field(!!fieldState.error)}>
                          <SelectValue placeholder="Select a barangay" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>Barangays</SelectLabel>
                            {isLoadingBarangays ? (
                              <SelectItem value="loading" disabled>Loading barangays...</SelectItem>
                            ) : barangays.length === 0 ? (
                              <SelectItem value="empty" disabled>No barangays available</SelectItem>
                            ) : (
                              barangays.map((barangay) => (
                                <SelectItem key={barangay.barangay_id} value={barangay.barangay_id}>
                                  {barangay.barangay_name}
                                </SelectItem>
                              ))
                            )}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FieldErrorText message={fieldState.error?.message} />
                    </>
                  )}
                />
                <p className="text-[11px] text-slate-400 mt-1.5">Select the barangay this zone belongs to</p>
              </div>

              <Separator />

            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2.5 bg-slate-50/60">
          <SheetClose asChild>
            <Button
              type="button"
              variant="outline"
              className="rounded-md h-9 text-[13px] border-slate-200"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </SheetClose>
          <Button
            type="submit"
            form="update-zone-form"
            disabled={isSubmitting || isLoading}
            className="rounded-md h-9 text-[13px] bg-violet-600 hover:bg-violet-700 text-white gap-1.5 font-medium"
          >
            {isSubmitting && <Spinner />}
            {isSubmitting ? 'Updating...' : 'Update Zone'}
          </Button>
        </div>

      </SheetContent>
    </Sheet>
  )
}

export default UpdateZoneForm