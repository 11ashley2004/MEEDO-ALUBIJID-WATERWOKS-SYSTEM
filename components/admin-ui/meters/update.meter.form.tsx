'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Loader2, Edit, AlertCircle } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import {
  Sheet, SheetClose, SheetContent, SheetDescription,
  SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { UpdateMeterFormValues, updateMeterFormSchema } from '@/lib/validation/meter.validation'
import { updateMeter, getMeterById } from '@/lib/actions/meter/meter.actions'

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
      {label}
      {required && <span className="text-rose-400 text-[11px] leading-none">*</span>}
    </label>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="flex items-center gap-1 text-[10.5px] text-rose-500 mt-1">
      <AlertCircle className="h-3 w-3 shrink-0" />{message}
    </p>
  )
}

const field = (err?: boolean) =>
  'w-full h-9 px-3 rounded-md text-[13px] text-slate-700 bg-white border outline-none transition-all duration-150 placeholder:text-slate-300 ' +
  (err
    ? 'border-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-100'
    : 'border-slate-200 hover:border-violet-300 focus:border-violet-400 focus:ring-2 focus:ring-violet-100')

interface UpdateMeterFormProps {
  meterId: string
  onSuccess?: () => void
  children?: React.ReactNode
}

interface MeterData {
  meter_id: string
  meter_serial_no: string
  connection_id: string
}

const UpdateMeterForm = ({ meterId, onSuccess, children }: UpdateMeterFormProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [meterData, setMeterData] = useState<MeterData | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateMeterFormValues>({
    resolver: zodResolver(updateMeterFormSchema),
    defaultValues: {
      meter_serial_no: '',
    },
  })

  // Fetch meter data when sheet opens
  useEffect(() => {
    if (isOpen && meterId) {
      setIsLoading(true)
      setSubmitError(null)
      getMeterById(meterId)
        .then((data) => {
          if (data) {
            setMeterData(data)
            reset({ meter_serial_no: data.meter_serial_no })
          }
        })
        .catch(() => {
          toast.error('Failed to load meter data')
          setIsOpen(false)
        })
        .finally(() => {
          setIsLoading(false)
        })
    }
  }, [isOpen, meterId, reset])

  const onSubmit = async (values: UpdateMeterFormValues) => {
    if (!meterData) return

    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const result = await updateMeter(meterId, {
        meter_serial_no: values.meter_serial_no,
      })
      if (result.status === 'success') {
        toast.success('Meter updated successfully')
        setIsOpen(false)
        onSuccess?.()
      } else {
        setSubmitError(result.message || 'Failed to update meter')
      }
    } catch {
      setSubmitError('Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClear = () => {
    if (meterData) {
      reset({ meter_serial_no: meterData.meter_serial_no })
    }
    setSubmitError(null)
  }

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        {children}
      </SheetTrigger>

      <SheetContent className="w-full sm:max-w-md flex flex-col h-full p-0 gap-0 border-l border-slate-200 bg-white">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-violet-100 border border-violet-200 flex items-center justify-center shrink-0">
              <Edit className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <SheetTitle className="text-[14px] font-bold text-slate-900 leading-tight">
                {isLoading ? 'Loading...' : `Edit ${meterData?.meter_serial_no || 'Meter'}`}
              </SheetTitle>
              <SheetDescription className="text-[11px] text-slate-400 mt-0.5">
                Update meter serial number
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
            <form id="update-meter-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">

              {/* Error Banner */}
              {submitError && (
                <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-md bg-rose-50 border border-rose-200">
                  <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
                  <p className="text-xs font-medium text-rose-600">{submitError}</p>
                </div>
              )}

              {/* Meter Serial Number */}
              <div>
                <FieldLabel label="Meter Serial Number" required />
                <input
                  {...register('meter_serial_no')}
                  placeholder="e.g., MTR-2026-001"
                  className={field(!!errors.meter_serial_no)}
                />
                <FieldError message={errors.meter_serial_no?.message} />
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
              disabled={isSubmitting || isLoading}
            >
              Cancel
            </Button>
          </SheetClose>
          {isDirty && !isLoading && (
            <Button
              type="button"
              variant="outline"
              onClick={handleClear}
              className="rounded-md h-9 text-[13px] border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-600"
              disabled={isSubmitting}
            >
              Clear
            </Button>
          )}
          <Button
            type="submit"
            form="update-meter-form"
            disabled={isSubmitting || isLoading}
            className="rounded-md h-9 text-[13px] bg-violet-600 hover:bg-violet-700 text-white gap-1.5 font-medium"
          >
            {isSubmitting
              ? <><Spinner /> Updating…</>
              : <><Edit className="h-3.5 w-3.5" /> Update Meter</>
            }
          </Button>
        </div>

      </SheetContent>
    </Sheet>
  )
}

export default UpdateMeterForm