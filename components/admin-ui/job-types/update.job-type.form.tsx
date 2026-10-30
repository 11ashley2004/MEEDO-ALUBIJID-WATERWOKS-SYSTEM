'use client'

import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Briefcase, Edit } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import {
  Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle,
} from '@/components/ui/sheet'
import {
  Select, SelectContent, SelectItem, SelectTrigger,
  SelectValue, SelectGroup, SelectLabel,
} from '@/components/ui/select'
import { Input }  from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { jobTypeFormSchema, type JobTypeFormValues } from '@/lib/validation/job-type.validation'
import { updateJobType, getAllSkills } from  '@/lib/actions/job-order/job-type.actions'

interface Skill { skill_id: string; skill_name: string }

interface UpdateJobTypeFormProps {
  jobType: {
    job_type_id:       string
    job_type_name:     string
    skill_id:         string
    job_type_category: boolean
  }
  isOpen:       boolean
  onOpenChange: (open: boolean) => void
  onSuccess:    () => void
}

const CATEGORY_OPTIONS = [
  { value: true, label: 'Consumer' },
  { value: false, label: 'Internal' },
] as const

const UpdateJobTypeForm = ({ jobType, isOpen, onOpenChange, onSuccess }: UpdateJobTypeFormProps) => {
  const [isSubmitting,    setIsSubmitting]    = useState(false)
  const [skills,          setSkills]          = useState<Skill[]>([])
  const [isLoadingSkills, setIsLoadingSkills] = useState(true)

  const form = useForm<JobTypeFormValues>({
    resolver: zodResolver(jobTypeFormSchema),
    defaultValues: {
      job_type_name:     jobType.job_type_name,
      skill_id:         jobType.skill_id,
      job_type_category: jobType.job_type_category,
    },
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

  useEffect(() => {
    if (isOpen) {
      form.reset({
        job_type_name:     jobType.job_type_name,
        skill_id:         jobType.skill_id,
        job_type_category: jobType.job_type_category,
      })
    }
  }, [jobType, isOpen, form])

  const onSubmit = async (values: JobTypeFormValues) => {
    setIsSubmitting(true)
    try {
      const result = await updateJobType(jobType.job_type_id, values)
      if (result.status === 'success') {
        toast.success('Job type updated successfully.')
        onOpenChange(false)
        onSuccess()
      } else {
        toast.error(result.message || 'Failed to update job type.')
      }
    } catch {
      toast.error('An unexpected error occurred.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col h-full p-0 gap-0">

        {/* Header */}
        <div className="px-6 pt-6 pb-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
              <Edit className="h-4 w-4 text-purple-600" />
            </div>
            <div>
              <SheetTitle className="text-base font-bold text-slate-900 leading-tight">
                Edit {jobType.job_type_name}
              </SheetTitle>
              <SheetDescription className="text-xs text-slate-400 mt-0.5 leading-snug">
                Update job type information below.
              </SheetDescription>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <form id="update-job-type-form" onSubmit={form.handleSubmit(onSubmit)}>
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
                        <FieldLabel htmlFor="edit-job_type_category" className="text-xs font-semibold text-slate-600">
                          Category <span className="text-red-500">*</span>
                        </FieldLabel>
                        <Select 
                          onValueChange={(val) => field.onChange(val === 'true')} 
                          value={String(field.value)}
                        >
                          <SelectTrigger id="edit-job_type_category" className="w-full rounded-xl h-9 text-sm" aria-invalid={fieldState.invalid}>
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
                        <FieldLabel htmlFor="edit-job_type_name" className="text-xs font-semibold text-slate-600">
                          Job Type Name <span className="text-red-500">*</span>
                        </FieldLabel>
                        <Input
                          {...field}
                          id="edit-job_type_name"
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
                        <FieldLabel htmlFor="edit-skill_id" className="text-xs font-semibold text-slate-600">
                          Required Skill <span className="text-red-500">*</span>
                        </FieldLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={isLoadingSkills}>
                          <SelectTrigger id="edit-skill_id" className="w-full rounded-xl h-9 text-sm" aria-invalid={fieldState.invalid}>
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
            form="update-job-type-form"
            disabled={isSubmitting}
            className="rounded-xl h-9 text-sm bg-purple-600 hover:bg-purple-700 text-white gap-2 shadow-sm shadow-purple-200"
          >
            {isSubmitting
              ? <><Spinner /> Updating…</>
              : <><Briefcase className="h-4 w-4" /> Update Job Type</>
            }
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default UpdateJobTypeForm