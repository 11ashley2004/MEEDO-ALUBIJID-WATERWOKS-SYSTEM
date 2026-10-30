'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Loader2, Users, Edit, AlertCircle } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import {
  Sheet, SheetClose, SheetContent, SheetDescription,
  SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { 
  UpdateClassificationFormValues, 
  updateClassificationFormSchema 
} from '@/lib/validation/consumer-classifications.validation'
import { updateClassification, getClassificationById } from '@/lib/actions/classifications/classifications.actions'

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

const textareaField = (err?: boolean) =>
  'w-full px-3 py-2 rounded-md text-[13px] text-slate-700 bg-white border outline-none transition-all duration-150 placeholder:text-slate-300 resize-none ' +
  (err
    ? 'border-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-100'
    : 'border-slate-200 hover:border-violet-300 focus:border-violet-400 focus:ring-2 focus:ring-violet-100')

interface UpdateClassificationFormProps {
  classificationId: string
  onSuccess?: () => void
  children: React.ReactNode
}

interface ClassificationData {
  classification_id: string
  classification_name: string
  description: string
  connection_fee: number
}

const UpdateClassificationForm = ({ 
  classificationId, 
  onSuccess,
  children
}: UpdateClassificationFormProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [classification, setClassification] = useState<ClassificationData | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateClassificationFormValues>({
    resolver: zodResolver(updateClassificationFormSchema),
    defaultValues: {
      classification_name: '',
      description: '',
      connection_fee: 0,
    },
  })

  // Fetch classification data when sheet opens
  useEffect(() => {
    const fetchClassificationData = async () => {
      if (!isOpen || !classificationId) return
      
      setIsLoading(true)
      setSubmitError(null)
      try {
        const result = await getClassificationById(classificationId)
        
        if (result.status === 'success' && result.data) {
          setClassification(result.data)
          reset({
            classification_name: result.data.classification_name,
            description: result.data.description,
            connection_fee: result.data.connection_fee,
          })
        } else {
          toast.error('Failed to load classification data')
          setIsOpen(false)
        }
      } catch {
        toast.error('Failed to load classification data')
        setIsOpen(false)
      } finally {
        setIsLoading(false)
      }
    }

    fetchClassificationData()
  }, [isOpen, classificationId, reset])

  const onSubmit = async (values: UpdateClassificationFormValues) => {
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const result = await updateClassification(classificationId, values)
      if (result.status === 'success') {
        toast.success('Classification updated successfully')
        setIsOpen(false)
        onSuccess?.()
      } else {
        setSubmitError(result.message || 'Failed to update classification')
      }
    } catch {
      setSubmitError('Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClear = () => {
    if (classification) {
      reset({
        classification_name: classification.classification_name,
        description: classification.description,
        connection_fee: classification.connection_fee,
      })
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
                {isLoading ? 'Loading...' : `Edit ${classification?.classification_name || 'Classification'}`}
              </SheetTitle>
              <SheetDescription className="text-[11px] text-slate-400 mt-0.5">
                Update classification information
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
            <form id="update-classification-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">

              {/* Error Banner */}
              {submitError && (
                <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-md bg-rose-50 border border-rose-200">
                  <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
                  <p className="text-xs font-medium text-rose-600">{submitError}</p>
                </div>
              )}

              {/* Classification Name */}
              <div>
                <FieldLabel label="Classification Name" required />
                <input
                  {...register('classification_name')}
                  placeholder="e.g. Residential, Commercial, Industrial"
                  className={field(!!errors.classification_name)}
                />
                <FieldError message={errors.classification_name?.message} />
              </div>

              {/* Description */}
              <div>
                <FieldLabel label="Description" required />
                <textarea
                  {...register('description')}
                  rows={4}
                  placeholder="Enter a detailed description of this classification"
                  className={textareaField(!!errors.description)}
                />
                <FieldError message={errors.description?.message} />
              </div>

              {/* Connection Fee */}
              <div>
                <FieldLabel label="Connection Fee" required />
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₱</span>
                  <input
                    {...register('connection_fee', { valueAsNumber: true })}
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    className={field(!!errors.connection_fee) + ' pl-8'}
                  />
                </div>
                <FieldError message={errors.connection_fee?.message} />
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
            form="update-classification-form"
            disabled={isSubmitting || isLoading}
            className="rounded-md h-9 text-[13px] bg-violet-600 hover:bg-violet-700 text-white gap-1.5 font-medium"
          >
            {isSubmitting
              ? <><Spinner /> Updating…</>
              : <><Users className="h-3.5 w-3.5" /> Update Classification</>
            }
          </Button>
        </div>

      </SheetContent>
    </Sheet>
  )
}

export default UpdateClassificationForm