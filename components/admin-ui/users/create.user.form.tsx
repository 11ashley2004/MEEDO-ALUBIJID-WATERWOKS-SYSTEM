'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'



import { useEffect, useRef, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Loader2, UserPlus, KeyRound, Mail, X, ImagePlus, ShieldCheck,
  Check, ChevronsUpDown, UserCircle2,
} from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import {
  Sheet, SheetClose, SheetContent, SheetDescription,
  SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import {
  InputGroup, InputGroupAddon, InputGroupInput,
} from "@/components/ui/input-group"
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { getAllUserRoles } from '@/lib/actions/roles/roles.action'
import { UserFormValues, userFormSchema } from '@/lib/validation/user.validation'
import { Role } from '@/lib/types/roles.types'
import { createUser } from '@/lib/actions/users/user.actions'
import { cn } from '@/lib/utils'

const MAX_FILE_SIZE = 1 * 1024 * 1024
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp']

interface AddUserFormProps {
  onSuccess?: () => void
}

const AddUserForm = ({ onSuccess }: AddUserFormProps) => {
  const [roles, setRoles] = useState<Role[]>([])
  const [isLoadingRoles, setIsLoadingRoles] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [roleOpen, setRoleOpen] = useState(false)
  const [roleSearch, setRoleSearch] = useState('')
  const debouncedRoleSearch = useDebouncedSearch(roleSearch)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      first_name: '',
      middle_name: '',
      last_name: '',
      email: '',
      phone: '',
      role: '',
      password: '',
      profile: undefined,
    },
  })

  useEffect(() => {
    const fetchRoles = async () => {
      setIsLoadingRoles(true)
      try {
        setRoles(await getAllUserRoles())
      } catch {
        toast.error('Failed to load roles')
      } finally {
        setIsLoadingRoles(false)
      }
    }
    fetchRoles()
  }, [])

  const selectedRole = form.watch('role')
  useEffect(() => {
    if (!selectedRole || roles.length === 0) return
    const role = roles.find(r => r.role_id === selectedRole)
    if (role) form.setValue('password', `${role.role_name.toLowerCase()}123`)
  }, [selectedRole, roles, form])

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

  const resetAll = () => {
    form.reset()
    removeImage()
    setRoleOpen(false)
    setRoleSearch('')
  }

  const filteredRoles = debouncedRoleSearch
    ? roles.filter((r) => r.role_name.toLowerCase().includes(debouncedRoleSearch.toLowerCase()))
    : roles

  const onSubmit = async (values: UserFormValues) => {
    setIsSubmitting(true)
    try {
      const result = await createUser({
        first_name: values.first_name,
        middle_name: values.middle_name || null,
        last_name: values.last_name,
        email: values.email,
        phone: `+63${values.phone}`,
        role: values.role,
        password: values.password,
        profile: selectedFile,
      })

      if (result.status === 'success') {
        toast.success(result.message || 'User created successfully.')
        setIsOpen(false)
        resetAll()
        onSuccess?.()
      } else {
        toast.error(result.message || 'Something went wrong.')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputBase = "rounded-md h-9 text-[12.5px] border-2 transition-all duration-200 outline-none"
  const inputOk = cn(inputBase, "border-slate-200 focus:border-violet-400 focus:ring-2 focus:ring-violet-400 focus:ring-offset-0")
  const inputErr = cn(inputBase, "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500 focus:ring-offset-0")

  return (
    <Sheet open={isOpen} onOpenChange={(open) => {
      setIsOpen(open)
      if (!open) resetAll()
    }}>
      <SheetTrigger asChild>
        <Button className="h-9 gap-2 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-semibold shadow-sm">
          <UserPlus className="h-4 w-4" />
          Add User
        </Button>
      </SheetTrigger>

      <SheetContent className="w-full sm:max-w-md flex flex-col h-full p-0 gap-0 border-l border-slate-200 bg-white">
        {/* Header */}
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-violet-600 flex items-center justify-center shrink-0">
              <UserPlus className="h-[18px] w-[18px] text-white" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-[14px] font-bold text-slate-900 leading-tight">
                Add New User
              </SheetTitle>
              <SheetDescription className="text-xs font-medium text-foreground/80 mt-0.5 leading-snug">
                Fill in the details to create a new user account.
              </SheetDescription>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-slate-50/60 px-6 py-5">
          <form id="add-user-form" onSubmit={form.handleSubmit(onSubmit)}>
            <FieldGroup className="gap-6">

              {/* Profile Image */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Profile Image
                </Label>

                <input
                  ref={fileInputRef}
                  id="add-profile-upload"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleFile(f)
                  }}
                />

                <label
                  htmlFor="add-profile-upload"
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
                  {preview ? (
                    <img
                      src={preview}
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
                      <FieldLabel htmlFor="first_name" className="text-sm font-semibold text-foreground">
                        First Name
                      </FieldLabel>
                      <Input
                        {...field}
                        id="first_name"
                        placeholder="John"
                        className={fieldState.invalid ? inputErr : inputOk}
                      />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )} />

                  <Controller name="last_name" control={form.control} render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="last_name" className="text-sm font-semibold text-foreground">
                        Last Name
                      </FieldLabel>
                      <Input
                        {...field}
                        id="last_name"
                        placeholder="Doe"
                        className={fieldState.invalid ? inputErr : inputOk}
                      />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )} />
                </div>

                <Controller name="middle_name" control={form.control} render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="middle_name" className="text-sm font-semibold text-foreground">
                      Middle Name <span className="font-medium text-foreground/80">(Optional)</span>
                    </FieldLabel>
                    <Input
                      {...field}
                      id="middle_name"
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
                    <FieldLabel htmlFor="email" className="text-sm font-semibold text-foreground">
                      Email
                    </FieldLabel>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                      <Input
                        {...field}
                        id="email"
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
                    <FieldLabel htmlFor="phone" className="text-sm font-semibold text-foreground">
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
                        id="phone"
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

              {/* Access */}
              <div className="space-y-3">
                <Label className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Access
                </Label>

                <Controller name="role" control={form.control} render={({ field, fieldState }) => {
                  const selected = roles.find((r) => r.role_id === field.value) ?? null
                  return (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="role" className="text-sm font-semibold text-foreground">
                        Role
                      </FieldLabel>

                      <div className="relative">
                        <Popover open={roleOpen} onOpenChange={setRoleOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              id="role"
                              type="button"
                              variant="outline"
                              role="combobox"
                              aria-expanded={roleOpen}
                              className={cn(
                                'w-full justify-between h-9 px-3 rounded-md text-[12.5px] border-2 transition-colors outline-none',
                                'focus:border-violet-400 focus:ring-2 focus:ring-violet-400 focus:ring-offset-0',
                                fieldState.invalid
                                  ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                                  : selected
                                  ? 'border-violet-300 bg-violet-50/60 text-slate-900 font-semibold pr-9'
                                  : 'border-slate-200 bg-white hover:border-violet-300 font-normal text-slate-400',
                              )}
                              disabled={isLoadingRoles}
                            >
                              <span className="flex items-center gap-2 min-w-0 truncate">
                                {selected && (
                                  <span className="h-5 w-5 rounded-md bg-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                                    <UserCircle2 className="h-3 w-3" />
                                  </span>
                                )}
                                <span className="truncate capitalize">
                                  {isLoadingRoles
                                    ? 'Loading roles...'
                                    : selected
                                    ? selected.role_name
                                    : 'Select a role...'}
                                </span>
                              </span>
                              {!selected && (
                                <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-2" />
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            className="w-[var(--radix-popover-trigger-width)] overflow-hidden gap-0 p-0 bg-popover text-popover-foreground border border-border rounded-md shadow-lg"
                            align="start"
                            sideOffset={4}
                          >
                            <Command shouldFilter={false}>
                              <CommandInput
                                placeholder="Search role..."
                                value={roleSearch}
                                onValueChange={setRoleSearch}
                                className="h-9 text-[12.5px] w-full"
                              />
                              <CommandList className="max-h-64 overflow-y-auto w-full">
                                {isLoadingRoles && (
                                  <div className="flex items-center justify-center gap-2 py-4 text-[12px] text-slate-400">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                                  </div>
                                )}
                                {!isLoadingRoles && filteredRoles.length === 0 && (
                                  <CommandEmpty className="text-[12px] text-slate-400 py-4 text-center">
                                    No matching roles found
                                  </CommandEmpty>
                                )}
                                {!isLoadingRoles && filteredRoles.length > 0 && (
                                  <CommandGroup>
                                    {filteredRoles.map((role) => {
                                      const isSelected = field.value === role.role_id
                                      return (
                                        <CommandItem
                                          key={role.role_id}
                                          value={role.role_id}
                                          onSelect={() => {
                                            field.onChange(role.role_id)
                                            setRoleOpen(false)
                                            setRoleSearch('')
                                          }}
                                          className="cursor-pointer text-[12.5px] py-2.5 px-3 gap-2.5 flex items-center"
                                        >
                                          <div className="h-8 w-8 rounded-md bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                                            <UserCircle2 className="h-4 w-4" />
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <p className="font-medium text-slate-700 truncate capitalize">
                                              {role.role_name}
                                            </p>
                                          </div>
                                          {isSelected && <Check className="h-3.5 w-3.5 text-violet-600 shrink-0" />}
                                        </CommandItem>
                                      )
                                    })}
                                  </CommandGroup>
                                )}
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        {selected && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              field.onChange('')
                            }}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 transition-colors p-0.5"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      <FieldDescription className="text-xs font-medium text-foreground/80">
                        Selecting a role auto-generates the password
                      </FieldDescription>
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )
                }} />

                {/* Password is auto-generated from the role and intentionally never shown in the UI */}
                <Controller name="password" control={form.control} render={({ field }) => (
                  <input type="hidden" {...field} />
                )} />

                {selectedRole && (
                  <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-md bg-violet-50 border-2 border-violet-200">
                    <ShieldCheck className="h-3.5 w-3.5 text-violet-600 shrink-0 mt-0.5" />
                    <div className="text-xs font-medium text-foreground leading-snug">
                      <p className="font-semibold flex items-center gap-1">
                        <KeyRound className="h-2.5 w-2.5" /> Password auto-generated
                      </p>
                      <p className="mt-0.5 text-violet-600/90">
                        A default password is generated from the selected role and sent to the user directly. It isn&apos;t shown here for security.
                      </p>
                    </div>
                  </div>
                )}
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
              form="add-user-form"
              disabled={isSubmitting}
              className="rounded-md h-9 text-[13px] bg-violet-600 hover:bg-violet-700 text-white font-semibold gap-1.5 shadow-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-400 focus:ring-offset-2"
            >
              {isSubmitting ? (
                <><Spinner /> Creating…</>
              ) : (
                <><UserPlus className="h-3.5 w-3.5" /> Create User</>
              )}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default AddUserForm