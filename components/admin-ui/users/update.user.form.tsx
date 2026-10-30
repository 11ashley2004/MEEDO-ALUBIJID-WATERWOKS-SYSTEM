'use client'

import { useEffect, useRef, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Loader2, UserCog, Mail, X, ImagePlus, Edit } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import {
  Sheet, SheetClose, SheetContent, SheetDescription,
  SheetTitle, SheetTrigger
} from '@/components/ui/sheet'
import { Label } from '@/components/ui/label'
import { updateUser, getUserById } from '@/lib/actions/users/user.actions'
import { UpdateUserFormValues, updateUserFormSchema } from '@/lib/validation/user.validation'
import { cn } from '@/lib/utils'

const MAX_FILE_SIZE = 1 * 1024 * 1024
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp']

interface EditUserFormProps {
  userId: string
  onSuccess: () => void
}

const EditUserForm = ({ userId, onSuccess }: EditUserFormProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [existingProfileImage, setExistingProfileImage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const form = useForm<UpdateUserFormValues>({
    resolver: zodResolver(updateUserFormSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      middle_name: '',
      email: '',
      phone: '',
      profile: undefined,
    },
  })

  // Fetch user data when modal opens
  useEffect(() => {
    if (isOpen && userId) {
      const fetchUser = async () => {
        setIsLoading(true)
        try {
          const user = await getUserById(userId)
          if (user) {
            const extractPhone = (phone: string) => phone.startsWith('+63') ? phone.slice(3) : phone
            
            form.reset({
              first_name: user.first_name,
              last_name: user.last_name,
              middle_name: user.middle_name || '',
              email: user.email,
              phone: extractPhone(user.contact_number),
              profile: undefined,
            })
            setExistingProfileImage(user.profile_image || null)
            setPreview(null)
            setSelectedFile(null)
          }
        } catch (error) {
          toast.error('Failed to load user data')
        } finally {
          setIsLoading(false)
        }
      }
      
      fetchUser()
    }
  }, [userId, isOpen, form])

  const handleFile = (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Only PNG, JPG, and WEBP images are allowed.')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error('Image is too large. Max file size is 1 MB.')
      return
    }
    const reader = new FileReader()
    reader.onloadend = () => setPreview(reader.result as string)
    reader.readAsDataURL(file)
    setSelectedFile(file)
    form.setValue('profile', file)
  }

  const removeImage = () => {
    setSelectedFile(null)
    setPreview(null)
    form.setValue('profile', undefined)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const onSubmit = async (values: UpdateUserFormValues) => {
    setIsSubmitting(true)
    try {
      const result = await updateUser(userId, {
        first_name: values.first_name,
        last_name: values.last_name,
        middle_name: values.middle_name || null,
        email: values.email,
        contact_number: `+63${values.phone}`,
        profile: selectedFile,
      })
      
      if (result.status === 'success') {
        toast.success('User updated successfully')
        setIsOpen(false)
        onSuccess()
      } else {
        toast.error(result.message || 'Failed to update user')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  const avatarSrc = preview ?? existingProfileImage
  const initials = form.watch('first_name')?.[0] + form.watch('last_name')?.[0] || 'U'

  const inputBase = "rounded-md h-9 text-[12.5px] border-2 transition-all duration-200 outline-none"
  const inputOk = cn(inputBase, "border-slate-200 focus:border-violet-400 focus:ring-2 focus:ring-violet-400 focus:ring-offset-0")
  const inputErr = cn(inputBase, "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500 focus:ring-offset-0")

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <div className="flex items-center gap-3 cursor-pointer w-full">
          <div className="h-7 w-7 rounded-md bg-slate-100 flex items-center justify-center group-hover:bg-violet-100 transition-colors shrink-0">
            <Edit className="h-3.5 w-3.5 text-slate-500 group-hover:text-violet-600 transition-colors" />
          </div>
          <span className="text-sm font-medium">Edit user</span>
        </div>
      </SheetTrigger>

      <SheetContent className="w-full sm:max-w-md flex flex-col h-full p-0 gap-0 border-l border-slate-200 bg-white">
        {/* Always include SheetTitle and SheetDescription for accessibility */}
        <SheetTitle className="sr-only">Edit User</SheetTitle>
        <SheetDescription className="sr-only">
          Update user information including personal details, contact info, and profile image.
        </SheetDescription>

        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-6 pt-6 pb-5 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-md bg-violet-600 flex items-center justify-center shrink-0">
                  <UserCog className="h-[18px] w-[18px] text-white" />
                </div>
                <div className="min-w-0">
                  <SheetTitle className="text-[14px] font-bold text-slate-900 leading-tight">
                    Edit User
                  </SheetTitle>
                  <SheetDescription className="text-xs font-medium text-foreground/80 mt-0.5 leading-snug">
                    Update this user's information below.
                  </SheetDescription>
                </div>
              </div>
            </div>

            {/* Form body */}
            <div className="flex-1 overflow-y-auto bg-slate-50/60 px-6 py-5">
              <form id="edit-user-form" onSubmit={form.handleSubmit(onSubmit)}>
                <FieldGroup className="gap-6">
                  {/* Profile Image */}
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-foreground uppercase tracking-wider">
                      Profile Image
                    </Label>

                    <input
                      ref={fileInputRef}
                      id="edit-profile-upload"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      onChange={(e) => { 
                        const f = e.target.files?.[0] 
                        if (f) handleFile(f) 
                      }}
                    />

                    <label
                      htmlFor="edit-profile-upload"
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault()
                        setIsDragging(false)
                        const f = e.dataTransfer.files[0]
                        if (f) handleFile(f)
                      }}
                      className={cn(
                        'flex items-center gap-3 rounded-md border-2 px-3 py-2.5 cursor-pointer transition-colors bg-white',
                        isDragging ? 'border-violet-400 bg-violet-50/60' : 'border-slate-200 hover:border-violet-300',
                      )}
                    >
                      {avatarSrc ? (
                        <img
                          src={avatarSrc}
                          alt="Profile preview"
                          className="h-9 w-9 rounded-md object-cover ring-1 ring-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="h-9 w-9 rounded-md bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                          <ImagePlus className="h-4 w-4" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] font-medium text-slate-700 truncate">
                          {selectedFile ? selectedFile.name : 'Click or drag & drop to upload'}
                        </p>
                        <p className="text-xs font-medium text-foreground/80">PNG, JPG, WEBP · Max 1 MB</p>
                      </div>

                      {selectedFile && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            removeImage()
                          }}
                          className="text-slate-400 hover:text-red-500 transition-colors p-1 shrink-0"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </label>

                    {form.formState.errors.profile && (
                      <p className="text-[11px] text-red-500">
                        {form.formState.errors.profile.message}
                      </p>
                    )}
                  </div>

                  {/* Personal Info */}
                  <div className="space-y-3">
                    <Label className="text-xs font-bold text-foreground uppercase tracking-wider">
                      Personal Info
                    </Label>

                    <div className="grid grid-cols-2 gap-3">
                      <Controller name="first_name" control={form.control} render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="edit-first_name" className="text-sm font-semibold text-foreground">
                            First Name
                          </FieldLabel>
                          <Input 
                            {...field} 
                            id="edit-first_name" 
                            placeholder="John" 
                            className={fieldState.invalid ? inputErr : inputOk} 
                          />
                          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                        </Field>
                      )} />
                      
                      <Controller name="last_name" control={form.control} render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                          <FieldLabel htmlFor="edit-last_name" className="text-sm font-semibold text-foreground">
                            Last Name
                          </FieldLabel>
                          <Input 
                            {...field} 
                            id="edit-last_name" 
                            placeholder="Doe" 
                            className={fieldState.invalid ? inputErr : inputOk} 
                          />
                          {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                        </Field>
                      )} />
                    </div>
                    
                    <Controller name="middle_name" control={form.control} render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="edit-middle_name" className="text-sm font-semibold text-foreground">
                          Middle Name <span className="font-medium text-foreground/80">(Optional)</span>
                        </FieldLabel>
                        <Input 
                          {...field} 
                          id="edit-middle_name" 
                          placeholder="Middle name" 
                          value={field.value || ''} 
                          className={fieldState.invalid ? inputErr : inputOk} 
                        />
                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                      </Field>
                    )} />
                  </div>

                  {/* Contact */}
                  <div className="space-y-3">
                    <Label className="text-xs font-bold text-foreground uppercase tracking-wider">
                      Contact
                    </Label>

                    <Controller name="email" control={form.control} render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="edit-email" className="text-sm font-semibold text-foreground">
                          Email
                        </FieldLabel>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                          <Input 
                            {...field} 
                            id="edit-email" 
                            type="email" 
                            placeholder="email@example.com" 
                            className={cn("pl-9", fieldState.invalid ? inputErr : inputOk)} 
                          />
                        </div>
                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                      </Field>
                    )} />
                    
                    <Controller name="phone" control={form.control} render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="edit-phone" className="text-sm font-semibold text-foreground">
                          Phone
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
                            id="edit-phone"
                            type="tel"
                            inputMode="numeric"
                            placeholder="9171234567"
                            maxLength={10}
                            className="h-9 min-w-0 px-3 text-[12.5px] text-foreground"
                          />
                        </InputGroup>
                        <FieldDescription className="text-xs font-medium text-foreground/80">
                          Enter the 10-digit mobile number. Do not include +63.
                        </FieldDescription>
                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                      </Field>
                    )} />
                  </div>
                </FieldGroup>
              </form>
            </div>

            {/* Footer */}
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
                  form="edit-user-form"
                  disabled={isSubmitting}
                  className="rounded-md h-9 text-[13px] bg-violet-600 hover:bg-violet-700 text-white font-semibold gap-1.5 shadow-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-400 focus:ring-offset-2"
                >
                  {isSubmitting ? (
                    <><Spinner /> Updating…</>
                  ) : (
                    <><UserCog className="h-3.5 w-3.5" /> Update User</>
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

export default EditUserForm