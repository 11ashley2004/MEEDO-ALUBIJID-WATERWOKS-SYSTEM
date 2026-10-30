'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { MapPin, Plus, AlertCircle } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import {
  Sheet, SheetClose, SheetContent, SheetDescription,
  SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { BarangayFormValues, barangayFormSchema } from '@/lib/validation/barangay.validation'
import { createBarangay } from '@/lib/actions/barangay/barangay.actions'

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

interface CreateBarangayFormProps {
  onSuccess?: () => void
  children: React.ReactNode
}

const CreateBarangayForm = ({ onSuccess, children }: CreateBarangayFormProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<BarangayFormValues>({
    resolver: zodResolver(barangayFormSchema),
    defaultValues: { barangay_name: '' },
  })

  const resetAll = () => {
    reset({ barangay_name: '' })
    setSubmitError(null)
  }

  const onSubmit = async (values: BarangayFormValues) => {
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const result = await createBarangay(values)
      if (result.status === 'success') {
        toast.success('Barangay created successfully')
        setIsOpen(false)
        resetAll()
        onSuccess?.()
      } else {
        setSubmitError(result.message || 'Failed to create barangay')
      }
    } catch {
      setSubmitError('Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClear = () => {
    reset({ barangay_name: '' })
    setSubmitError(null)
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetAll() }}>
      <SheetTrigger asChild>
        {children}
      </SheetTrigger>

      <SheetContent className="w-full sm:max-w-md flex flex-col h-full p-0 gap-0 border-l border-slate-200 bg-white">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-violet-100 border border-violet-200 flex items-center justify-center shrink-0">
              <MapPin className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <SheetTitle className="text-[14px] font-bold text-slate-900 leading-tight">
                Add New Barangay
              </SheetTitle>
              <SheetDescription className="text-[11px] text-slate-400 mt-0.5">
                Create a new barangay in the system
              </SheetDescription>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <form id="create-barangay-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">

            {/* Error Banner */}
            {submitError && (
              <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-md bg-rose-50 border border-rose-200">
                <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
                <p className="text-xs font-medium text-rose-600">{submitError}</p>
              </div>
            )}

            {/* Barangay Name */}
            <div>
              <FieldLabel label="Barangay Name" required />
              <input
                {...register('barangay_name')}
                placeholder="e.g. Barangay Poblacion"
                className={field(!!errors.barangay_name)}
              />
              <FieldError message={errors.barangay_name?.message} />
            </div>

            <Separator />

          </form>
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
          {isDirty && (
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
            form="create-barangay-form"
            disabled={isSubmitting}
            className="rounded-md h-9 text-[13px] bg-violet-600 hover:bg-violet-700 text-white gap-1.5 font-medium"
          >
            {isSubmitting
              ? <><Spinner /> Creating…</>
              : <><Plus className="h-3.5 w-3.5" /> Create Barangay</>
            }
          </Button>
        </div>

      </SheetContent>
    </Sheet>
  )
}

export default CreateBarangayForm