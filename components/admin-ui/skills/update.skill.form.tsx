'use client'


import { Spinner } from '@/components/ui/spinner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Controller } from 'react-hook-form'
import { z } from 'zod'

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Separator } from '@/components/ui/separator'
import { updateSkill } from '@/lib/actions/skill.actions'

// ─── Validation ───────────────────────────────────────────────────────────────

const skillFormSchema = z.object({
  skill_name:  z.string().min(1, 'Skill name is required').max(100, 'Skill name must be 100 characters or less'),
  description: z.string().max(500, 'Description must be 500 characters or less').optional(),
})

type SkillFormValues = z.infer<typeof skillFormSchema>

// ─── Props ────────────────────────────────────────────────────────────────────

interface Skill {
  skill_id:    string
  skill_name:  string
  description: string | null
  is_active:   boolean
  created_at:  string
  updated_at?: string | null
}

interface UpdateSkillFormProps {
  skill:        Skill
  isOpen:       boolean
  onOpenChange: (open: boolean) => void
  onSuccess?:   () => void
}

// ─── Component ───────────────────────────────────────────────────────────────

const UpdateSkillForm = ({ skill, isOpen, onOpenChange, onSuccess }: UpdateSkillFormProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<SkillFormValues>({
    resolver: zodResolver(skillFormSchema),
    defaultValues: {
      skill_name:  skill.skill_name,
      description: skill.description ?? '',
    },
  })

  // Reset form when skill prop changes (different row opened)
  useEffect(() => {
    if (isOpen) {
      form.reset({
        skill_name:  skill.skill_name,
        description: skill.description ?? '',
      })
    }
  }, [skill, isOpen, form])

  const onSubmit = async (values: SkillFormValues) => {
    setIsSubmitting(true)
    try {
      const result = await updateSkill(skill.skill_id, {
        skill_name:  values.skill_name,
        description: values.description ?? null,
      })

      if (result.status === 'success') {
        onOpenChange(false)
        onSuccess?.()
      } else {
        toast.error(result.message || 'Something went wrong')
      }
    } catch (err) {
      console.error('Submit error:', err)
      toast.error('An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col h-full">
        <SheetHeader>
          <SheetTitle>Edit Skill</SheetTitle>
          <SheetDescription>
            Update the details for <span className="font-medium text-foreground">{skill.skill_name}</span>.
          </SheetDescription>
        </SheetHeader>

        <Separator className="my-4" />

        <div className="flex-1 overflow-y-auto px-4">
          <form id="update-skill-form" onSubmit={form.handleSubmit(onSubmit)} className="py-2">
            <FieldGroup className="gap-5">

              {/* Skill Name */}
              <Controller
                name="skill_name"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="skill_name">Skill Name <span className="text-destructive">*</span></FieldLabel>
                    <Input
                      {...field}
                      id="skill_name"
                      placeholder="e.g. Pipe Installation"
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldDescription>
                      Enter the name of the skill or competency
                    </FieldDescription>
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

              {/* Description */}
              <Controller
                name="description"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="description">Description</FieldLabel>
                    <Textarea
                      {...field}
                      id="description"
                      placeholder="Brief description of the skill..."
                      rows={4}
                      className="resize-none"
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldDescription>
                      Optional — describe what this skill involves
                    </FieldDescription>
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />

            </FieldGroup>
          </form>
        </div>

        <Separator className="my-4" />

        <SheetFooter className="px-4 pb-4">
          <div className="flex items-center justify-end gap-3 w-full">
            <SheetClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                Cancel
              </Button>
            </SheetClose>
            <Button
              type="submit"
              form="update-skill-form"
              disabled={isSubmitting}
            >
              {isSubmitting && <Spinner className="mr-2" />}
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

export default UpdateSkillForm