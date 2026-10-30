'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { UserPlus, CheckCircle2, AlertCircle, Info, Mail, Phone } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { createConsumer } from '@/lib/actions/consumer/consumer.actions'
import { toast } from 'sonner'
import { Separator } from '@/components/ui/separator'
import {
  InputGroup, InputGroupAddon, InputGroupText, InputGroupInput,
} from "@/components/ui/input-group"

// ── Schema ────────────────────────────────────────────────────────────────────
const schema = z.object({
  account_name: z.string().min(1, 'Account name is required').max(255),
  email: z.string().min(1, 'Email is required').email('Invalid email address').max(150),
  contact_number: z
    .string()
    .min(1, 'Contact number is required')
    .regex(/^\d{10}$/, 'Must be exactly 10 digits (e.g., 9511963007)'),
})

type FormData = z.infer<typeof schema>

function FieldLabel({ label, required, optional }: {
  label: string; required?: boolean; optional?: boolean
}) {
  return (
    <label className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">
      {label}
      {required && <span className="text-rose-400 text-[11px] leading-none">*</span>}
      {optional && (
        <span className="text-[9px] font-medium text-violet-400 bg-violet-50 border border-violet-100 rounded-md px-1.5 py-0.5 normal-case tracking-normal">
          optional
        </span>
      )}
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
  'w-full h-9 px-3 rounded-lg text-[12.5px] text-slate-700',
  'bg-white border outline-none transition-all duration-150 placeholder:text-slate-300',
  err
    ? 'border-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-100'
    : 'border-slate-200 hover:border-violet-300 focus:border-violet-400 focus:ring-2 focus:ring-violet-100',
)
const fieldIcon = (err?: boolean) => cn(field(err), 'pl-8')

export default function RegisterConsumerForm({ onSuccess }: { onSuccess?: () => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { register, handleSubmit, reset, setValue, formState: { errors, isDirty }, watch } =
    useForm<FormData>({ resolver: zodResolver(schema) })

  const watchedValues = watch()
  const hasAnyValue = Object.values(watchedValues).some((v) => v && String(v).trim())

  // Enforce max 10 digits, numbers only
  const handleContactInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 10)
    setValue('contact_number', digits, { shouldValidate: true })
  }

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const res = await createConsumer({
        account_name: data.account_name,
        email: data.email,
        contact_number: `+63${data.contact_number}`,
      })
      if (res.status === 'success') {
        setSubmitted(true)
        toast.success('Consumer registered successfully')
        reset()
        onSuccess?.()
        setTimeout(() => setSubmitted(false), 3000)
      } else {
        setSubmitError(res.message ?? 'Failed to register consumer')
      }
    } catch {
      setSubmitError('Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClear = () => {
    reset()
    setSubmitError(null)
    setSubmitted(false)
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">

      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-violet-100 border border-violet-200 flex items-center justify-center shrink-0">
          <UserPlus className="h-4 w-4 text-violet-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">Register Consumer</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Creates the consumer identity only — zone, barangay, and meter are set per meter account.
          </p>
        </div>
      </div>

      {/* Banners */}
      {submitted && (
        <div className="mx-6 mt-5 flex items-center gap-2.5 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <p className="text-xs font-semibold text-emerald-700">Consumer registered successfully!</p>
        </div>
      )}
      {submitError && (
        <div className="mx-6 mt-5 flex items-center gap-2.5 px-4 py-3 rounded-lg bg-rose-50 border border-rose-200">
          <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
          <p className="text-xs font-semibold text-rose-600">{submitError}</p>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 flex flex-col gap-5">

        {/* Account Name - Full width */}
        <div>
          <FieldLabel label="Account Name" required />
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <input 
              {...register('account_name')} 
              placeholder="Juan Dela Cruz" 
              className={fieldIcon(!!errors.account_name)} 
            />
          </div>
          <FieldError message={errors.account_name?.message} />
          <p className="text-[10.5px] text-slate-400 mt-1.5 flex items-center gap-1.5">
            <Info className="h-3 w-3" />
            Full name of the consumer (e.g., Juan Dela Cruz)
          </p>
        </div>

        {/* Email + Contact row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel label="Email Address" required />
            <div className="relative">
              <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300 pointer-events-none" />
              <input {...register('email')} type="email" placeholder="juan@example.com" className={fieldIcon(!!errors.email)} />
            </div>
            <FieldError message={errors.email?.message} />
          </div>
          <div>
            <FieldLabel label="Contact No." required />
            <div className="relative">
              <InputGroup className={cn(
                "rounded-lg border transition-all duration-200",
                errors.contact_number
                  ? "border-rose-300 focus-within:border-rose-400 focus-within:ring-2 focus-within:ring-rose-100"
                  : "border-slate-200 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100"
              )}>
                <InputGroupAddon>
                  <InputGroupText className="text-[12px] font-semibold text-slate-500 bg-slate-50 rounded-l-lg border-r border-slate-200">
                    +63
                  </InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  {...register('contact_number')}
                  onChange={handleContactInput}
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="9511963007"
                  className="rounded-r-lg h-9 text-[12.5px] border-0 focus:ring-0"
                />
              </InputGroup>
            </div>
            <FieldError message={errors.contact_number?.message} />
            <p className="text-[10.5px] text-slate-400 mt-1.5 flex items-center gap-1.5">
              <Info className="h-3 w-3" />
              10-digit number without country code (e.g., 9511963007)
            </p>
          </div>
        </div>

        <Separator />

        {/* Footer */}
        <div className="flex items-center justify-end gap-2">
          {(isDirty || hasAnyValue) && (
            <button
              type="button"
              onClick={handleClear}
              className="h-8 px-4 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-500 hover:border-violet-300 hover:text-violet-600 transition-colors"
            >
              Clear
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className={cn(
              'h-8 px-5 rounded-lg text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors',
              'bg-violet-600 hover:bg-violet-700 border border-violet-700',
              'disabled:opacity-50 disabled:pointer-events-none',
            )}
          >
            {isSubmitting
              ? <><Spinner /> Saving…</>
              : <><UserPlus className="h-3.5 w-3.5" /> Save Consumer</>
            }
          </button>
        </div>
      </form>
    </div>
  )
}