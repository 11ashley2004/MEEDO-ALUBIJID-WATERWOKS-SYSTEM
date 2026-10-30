'use client'

import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Briefcase, Plus } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import {
  Sheet, SheetClose, SheetContent, SheetDescription,
  SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import {
  Select, SelectContent, SelectItem, SelectTrigger,
  SelectValue, SelectGroup, SelectLabel,
} from '@/components/ui/select'
import { Input }  from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { jobTypeFormSchema, type JobTypeFormValues } from '@/lib/validation/job-type.validation'
import { createJobType, getAllSkills } from '@/lib/actions/job-order/job-type.actions'

interface Skill { skill_id: string; skill_name: string }
interface CreateJobTypeFormProps { onSuccess?: () => void }

const CATEGORY_OPTIONS = [
  { value: true, label: 'Consumer' },
  { value: false, label: 'Internal' },
] as const

const CreateJobTypeForm = ({ onSuccess }: CreateJobTypeFormProps) => {
  const [isSubmitting,    setIsSubmitting]    = useState(false)
  const [isOpen,          setIsOpen]          = useState(false)
  const [skills,          setSkills]          = useState<Skill[]>([])
  const [isLoadingSkills, setIsLoadingSkills] = useState(true)

  const form = useForm<JobTypeFormValues>({
    resolver: zodResolver(jobTypeFormSchema),
    defaultValues: { job_type_name: '', skill_id: '', job_type_category: true },
  })

  useEffect(() => {
    const fetchSkills = async () => {
      setIsLoadingSkills(true)
      try { setSkills(await getAllSkills()) }
      catch { toast.error('Failed to load skills') }
      finally { setIsLoadingSkills(false) }
    }
    fetchSkills()
  }, [])

  const resetAll = () => form.reset({ job_type_name: '', skill_id: '', job_type_category: true })

  const onSubmit = async (values: JobTypeFormValues) => {
    setIsSubmitting(true)
    try {
      const result = await createJobType(values)
      if (result.status === 'success') {
        toast.success('Job type created successfully.')
        setIsOpen(false)
        resetAll()
        onSuccess?.()
      } else {
        toast.error(result.message || 'Something went wrong.')
      }
    } catch {
      toast.error('An unexpected error occurred.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetAll() }}>
      <SheetTrigger asChild>
        <Button className="h-9 gap-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-sm shadow-purple-200 transition-all">
          <Plus className="h-4 w-4" />
          Add Job Type
        </Button>
      </SheetTrigger>

      <SheetContent className="w-full sm:max-w-md flex flex-col h-full p-0 gap-0">

        {/* Header */}
        <div className="px-6 pt-6 pb-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
              <Briefcase className="h-4 w-4 text-purple-600" />
            </div>
            <div>
              <SheetTitle className="text-base font-bold text-slate-900 leading-tight">Add Job Type</SheetTitle>
              <SheetDescription className="text-xs text-slate-400 mt-0.5 leading-snug">
                Create a new job type with a category and required skill.
              </SheetDescription>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <form id="create-job-type-form" onSubmit={form.handleSubmit(onSubmit)}>
            <FieldGroup className="gap-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
                  Job Type Details
                </p>
                <div className="space-y-4">

                  {/* Job Type Category */}
                  <Controller
                    name="job_type_category"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="job_type_category" className="text-xs font-semibold text-slate-600">
                          Category <span className="text-red-500">*</span>
                        </FieldLabel>
                        <Select 
                          onValueChange={(val) => field.onChange(val === 'true')} 
                          value={String(field.value)}
                        >
                          <SelectTrigger id="job_type_category" className="w-full rounded-xl h-9 text-sm" aria-invalid={fieldState.invalid}>
                            <SelectValue placeholder="Select a category…" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            <SelectGroup>
                              <SelectLabel className="text-xs text-slate-400">Category</SelectLabel>
                              {CATEGORY_OPTIONS.map((opt) => (
                                <SelectItem key={String(opt.value)} value={String(opt.value)} className="rounded-lg">
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <FieldDescription className="text-xs text-slate-400">
                          Who this job type applies to.
                        </FieldDescription>
                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                      </Field>
                    )}
                  />

                  {/* Job Type Name */}
                  <Controller
                    name="job_type_name"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="job_type_name" className="text-xs font-semibold text-slate-600">
                          Job Type Name <span className="text-red-500">*</span>
                        </FieldLabel>
                        <Input
                          {...field}
                          id="job_type_name"
                          placeholder="e.g. Meter Installation"
                          className="rounded-xl h-9 text-sm"
                          aria-invalid={fieldState.invalid}
                        />
                        <FieldDescription className="text-xs text-slate-400">
                          Enter a descriptive name for this job type.
                        </FieldDescription>
                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                      </Field>
                    )}
                  />

                  {/* Required Skill */}
                  <Controller
                    name="skill_id"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="skill_id" className="text-xs font-semibold text-slate-600">
                          Required Skill <span className="text-red-500">*</span>
                        </FieldLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={isLoadingSkills}>
                          <SelectTrigger id="skill_id" className="w-full rounded-xl h-9 text-sm" aria-invalid={fieldState.invalid}>
                            <SelectValue placeholder="Select a skill…" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            <SelectGroup>
                              <SelectLabel className="text-xs text-slate-400">Skills</SelectLabel>
                              {isLoadingSkills ? (
                                <SelectItem value="loading" disabled>Loading skills…</SelectItem>
                              ) : skills.length === 0 ? (
                                <SelectItem value="empty" disabled>No skills available</SelectItem>
                              ) : (
                                skills.map((s) => (
                                  <SelectItem key={s.skill_id} value={s.skill_id} className="rounded-lg capitalize">
                                    {s.skill_name}
                                  </SelectItem>
                                ))
                              )}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <FieldDescription className="text-xs text-slate-400">
                          The skill required to perform this job.
                        </FieldDescription>
                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                      </Field>
                    )}
                  />

                </div>
              </div>
            </FieldGroup>
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2.5 bg-slate-50/60">
          <SheetClose asChild>
            <Button type="button" variant="outline" className="rounded-xl h-9 text-sm" disabled={isSubmitting}>
              Cancel
            </Button>
          </SheetClose>
          <Button
            type="submit"
            form="create-job-type-form"
            disabled={isSubmitting}
            className="rounded-xl h-9 text-sm bg-purple-600 hover:bg-purple-700 text-white gap-2 shadow-sm shadow-purple-200"
          >
            {isSubmitting
              ? <><Spinner /> Creating…</>
              : <><Briefcase className="h-4 w-4" /> Create Job Type</>
            }
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default CreateJobTypeForm