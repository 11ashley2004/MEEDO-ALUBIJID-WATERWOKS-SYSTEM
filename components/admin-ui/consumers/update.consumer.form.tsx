'use client'

import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { User, CheckCircle2, AlertCircle, Edit, Mail } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import {
  Sheet, SheetClose, SheetContent, SheetDescription,
  SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  InputGroup, InputGroupAddon, InputGroupInput,
} from '@/components/ui/input-group'
import { Separator } from '@/components/ui/separator'
import { updateConsumer, type Consumer } from '@/lib/actions/consumer/consumer.actions'
import { toast } from 'sonner'

// Consumers are stored with a full "+63XXXXXXXXXX" number (see
// RegisterConsumerForm), so the edit form needs to strip the +63 prefix
// back off to populate the bare 10-digit field, and re-add it on submit.
function stripPhonePrefix(value: string | null | undefined): string {
  if (!value) return ''
  return value.replace(/^\+63/, '')
}

const schema = z.object({
  account_name: z.string().min(1, 'Account name is required').max(255),
  email: z
    .string()
    .min(1, 'Email is required')
    .max(200, 'Email must be at most 200 characters')
    .email('Invalid email address'),
  contact_number: z
    .string()
    .min(1, 'Contact number is required')
    .regex(/^\d{10}$/, 'Must be exactly 10 digits (e.g., 9511963007)'),
})

type FormData = z.infer<typeof schema>

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

const field = (err?: boolean) => cn(
  'w-full h-9 px-3 rounded-md text-[13px] text-slate-700',
  'bg-white border outline-none transition-all duration-150 placeholder:text-slate-300',
  err
    ? 'border-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-100'
    : 'border-slate-200 hover:border-violet-300 focus:border-violet-400 focus:ring-2 focus:ring-violet-100',
)

interface EditConsumerFormProps {
  consumer: Consumer
  onSuccess?: () => void
  children: React.ReactNode
}

export default function EditConsumerForm({ consumer, onSuccess, children }: EditConsumerFormProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      account_name: consumer.account_name,
      email: consumer.email || '',
      contact_number: stripPhonePrefix(consumer.contact_number),
    },
  })

  // Same digit-only normalization as RegisterConsumerForm's handleContactInput.
  const handleContactInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 10)
    setValue('contact_number', digits, { shouldValidate: true })
  }

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const res = await updateConsumer(consumer.consumer_id, {
        account_name: data.account_name,
        email: data.email.trim(),
        contact_number: `+63${data.contact_number}`,
      })
      if (res.status === 'success') {
        toast.success('Consumer updated successfully')
        setIsOpen(false)
        onSuccess?.()
      } else {
        setSubmitError(res.message ?? 'Failed to update consumer')
      }
    } catch {
      setSubmitError('Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClear = () => {
    reset({
      account_name: consumer.account_name,
      email: consumer.email || '',
      contact_number: stripPhonePrefix(consumer.contact_number),
    })
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
                Edit Consumer
              </SheetTitle>
              <SheetDescription className="text-[11px] text-slate-400 mt-0.5">
                Update consumer information
              </SheetDescription>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <form id="edit-consumer-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">

            {/* Error Banner */}
            {submitError && (
              <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-md bg-rose-50 border border-rose-200">
                <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
                <p className="text-xs font-medium text-rose-600">{submitError}</p>
              </div>
            )}

            <div>
              <FieldLabel label="Contract No." />
              <input
                value={consumer.contract_no}
                readOnly
                className={cn(field(false), 'bg-slate-50 text-slate-500 font-mono cursor-default')}
              />
              <p className="text-[10.5px] text-slate-400 mt-1.5">
                Assigned automatically and cannot be changed
              </p>
            </div>

            <div>
              <FieldLabel label="Account Name" required />
              <div className="relative">
                <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300 pointer-events-none" />
                <input
                  {...register('account_name')}
                  placeholder="Juan Dela Cruz"
                  className={cn(field(!!errors.account_name), 'pl-8')}
                />
              </div>
              <FieldError message={errors.account_name?.message} />
              <p className="text-xs font-medium text-foreground/80 mt-1.5 flex items-center gap-1.5">
                <AlertCircle className="h-3 w-3" />
                Full name of the consumer (e.g., Juan Dela Cruz)
              </p>
            </div>

            <div>
              <FieldLabel label="Email Address" required />
              <div className="relative">
                <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300 pointer-events-none" />
                <Input
                  {...register('email')}
                  type="email"
                  placeholder="juan@example.com"
                  maxLength={200}
                  className={cn(field(!!errors.email), 'pl-8')}
                />
              </div>
              <FieldError message={errors.email?.message} />
            </div>

            {/* Contact Number — matches RegisterConsumerForm's +63 InputGroup */}
            <Controller
              name="contact_number"
              control={control}
              render={({ field: rhfField, fieldState }) => (
                <div>
                  <FieldLabel label="Contact No." required />
                  <InputGroup className={cn(
                    'h-9 overflow-hidden rounded-md border-2 bg-background dark:bg-background',
                    fieldState.invalid ? 'border-red-500' : 'border-slate-200'
                  )}>
                    <InputGroupAddon align="inline-start" className="h-full self-stretch border-r border-slate-200 bg-muted px-3 text-[13px] font-semibold text-foreground">
                      +63
                    </InputGroupAddon>
                    <InputGroupInput
                      {...rhfField}
                      onChange={handleContactInput}
                      type="tel"
                      inputMode="numeric"
                      placeholder="9511963007"
                      maxLength={10}
                      className="h-9 min-w-0 px-3 text-[13px] text-foreground"
                    />
                  </InputGroup>
                  <p className="text-xs font-medium text-foreground/80 mt-1">
                    Enter the 10-digit mobile number. Do not include +63.
                  </p>
                  <FieldError message={fieldState.error?.message} />
                </div>
              )}
            />

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
            form="edit-consumer-form"
            disabled={isSubmitting}
            className="rounded-md h-9 text-[13px] bg-violet-600 hover:bg-violet-700 text-white gap-1.5 font-medium"
          >
            {isSubmitting
              ? <><Spinner /> Saving…</>
              : <><CheckCircle2 className="h-3.5 w-3.5" /> Save Changes</>
            }
          </Button>
        </div>

      </SheetContent>
    </Sheet>
  )
}