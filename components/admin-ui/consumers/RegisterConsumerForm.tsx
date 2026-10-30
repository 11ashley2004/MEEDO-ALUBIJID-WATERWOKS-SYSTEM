'use client'

import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { UserPlus, Mail, User } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Sheet, SheetClose, SheetContent, SheetDescription,
  SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  InputGroup, InputGroupAddon, InputGroupInput,
} from "@/components/ui/input-group"
import { Field, FieldError, FieldLabel, FieldGroup } from "@/components/ui/field"
import { createConsumer } from '@/lib/actions/consumer/consumer.actions'

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

const inputBase = "rounded-md h-9 text-[12.5px] border-2 transition-all duration-200 outline-none w-full"
const inputOk = cn(inputBase, "border-slate-200 focus:border-violet-400 focus:ring-2 focus:ring-violet-400 focus:ring-offset-0")
const inputErr = cn(inputBase, "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500 focus:ring-offset-0")

interface RegisterConsumerFormProps {
  onSuccess?: () => void
  children?: React.ReactNode
}

export default function RegisterConsumerForm({ onSuccess, children }: RegisterConsumerFormProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { control, handleSubmit, reset, setValue } =
    useForm<FormData>({
      resolver: zodResolver(schema),
      defaultValues: {
        account_name: '',
        email: '',
        contact_number: '',
      }
    })

  const handleContactInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 10)
    setValue('contact_number', digits, { shouldValidate: true })
  }

  const resetAll = () => {
    reset()
    setIsOpen(false)
  }

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true)
    try {
      const res = await createConsumer({
        account_name: data.account_name,
        email: data.email.trim(),
        contact_number: `+63${data.contact_number}`,
      })
      if (res.status === 'success') {
        toast.success(
          res.data?.contract_no
            ? `Consumer registered — Contract No. ${res.data.contract_no}`
            : 'Consumer registered successfully',
        )
        resetAll()
        onSuccess?.()
      } else {
        toast.error(res.message ?? 'Failed to register consumer')
      }
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => {
      setIsOpen(open)
      if (!open) reset()
    }}>
      <SheetTrigger asChild>
        {children ? (
          children
        ) : (
          <Button className="h-12 w-12 rounded-full shadow-lg bg-violet-600 hover:bg-violet-700 text-white flex items-center justify-center">
            <UserPlus className="h-6 w-6" />
          </Button>
        )}
      </SheetTrigger>

      <SheetContent className="w-full sm:max-w-md flex flex-col h-full p-0 gap-0 border-l border-slate-200 bg-white">
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-violet-600 flex items-center justify-center shrink-0">
              <UserPlus className="h-[18px] w-[18px] text-white" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-[14px] font-bold text-slate-900 leading-tight">
                Register New Consumer
              </SheetTitle>
              <SheetDescription className="text-xs font-medium text-foreground/80 mt-0.5 leading-snug">
                Contract No. is assigned automatically. Zone, barangay, and meter are set per meter account.
              </SheetDescription>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50/60 px-6 py-5">
          <form id="register-consumer-form" onSubmit={handleSubmit(onSubmit)}>
            <FieldGroup className="gap-6">

              <div className="space-y-3">
                <FieldLabel className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Personal Info
                </FieldLabel>
                <Controller
                  name="account_name"
                  control={control}
                  defaultValue=""
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="account_name" className="text-sm font-semibold text-foreground">
                        Account Name
                      </FieldLabel>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                        <Input
                          {...field}
                          id="account_name"
                          placeholder="Juan Dela Cruz"
                          className={cn("pl-9", fieldState.invalid ? inputErr : inputOk)}
                        />
                      </div>
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
              </div>

              <div className="space-y-3">
                <FieldLabel className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Contact
                </FieldLabel>

                <Controller
                  name="email"
                  control={control}
                  defaultValue=""
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="email" className="text-sm font-semibold text-foreground">
                        Email <span className="text-rose-400">*</span>
                      </FieldLabel>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                        <Input
                          {...field}
                          id="email"
                          type="email"
                          placeholder="email@example.com"
                          maxLength={200}
                          className={cn("pl-9", fieldState.invalid ? inputErr : inputOk)}
                        />
                      </div>
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />

                <Controller
                  name="contact_number"
                  control={control}
                  defaultValue=""
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="contact_number" className="text-sm font-semibold text-foreground">
                        Phone <span className="text-rose-400">*</span>
                      </FieldLabel>
                      <InputGroup className={cn(
                        "h-9 overflow-hidden rounded-md border-2 bg-background dark:bg-background",
                        fieldState.invalid ? "border-red-500" : "border-slate-200"
                      )}>
                        <InputGroupAddon align="inline-start" className="h-full self-stretch border-r border-slate-200 bg-muted px-3 text-[12.5px] font-semibold text-foreground">
                          +63
                        </InputGroupAddon>
                        <InputGroupInput
                          {...field}
                          id="contact_number"
                          onChange={handleContactInput}
                          type="tel"
                          inputMode="numeric"
                          placeholder="9511963007"
                          maxLength={10}
                          className="h-9 min-w-0 px-3 text-[12.5px] text-foreground"
                        />
                      </InputGroup>
                      <p className="text-xs font-medium text-foreground/80">
                        Enter the 10-digit mobile number. Do not include +63.
                      </p>
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
              </div>

            </FieldGroup>
          </form>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-white shrink-0">
          <div className="flex items-center justify-end gap-2.5">
            <SheetClose asChild>
              <Button
                type="button"
                variant="outline"
                className="rounded-md h-9 text-[13px] border-2 border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-600 focus:border-violet-400 focus:ring-2 focus:ring-violet-400 focus:ring-offset-0"
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </SheetClose>
            <Button
              type="submit"
              form="register-consumer-form"
              disabled={isSubmitting}
              className="rounded-md h-9 text-[13px] bg-violet-600 hover:bg-violet-700 text-white font-semibold gap-1.5 shadow-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-400 focus:ring-offset-2"
            >
              {isSubmitting ? (
                <><Spinner /> Registering…</>
              ) : (
                <><UserPlus className="h-3.5 w-3.5" /> Register Consumer</>
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
