'use client'

import { Plus } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
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
  SheetTrigger,
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
import { createSkill } from '@/lib/actions/skill.actions'

// ─── Validation ───────────────────────────────────────────────────────────────

const skillFormSchema = z.object({
  skill_name:  z.string().min(1, 'Skill name is required').max(100, 'Skill name must be 100 characters or less'),
  description: z.string().max(500, 'Description must be 500 characters or less'),
})

type SkillFormValues = z.infer<typeof skillFormSchema>

// ─── Props ────────────────────────────────────────────────────────────────────

interface CreateSkillFormProps {
  onSuccess?: () => void
}

// ─── Component ───────────────────────────────────────────────────────────────

const CreateSkillForm = ({ onSuccess }: CreateSkillFormProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  const form = useForm<SkillFormValues>({
    resolver: zodResolver(skillFormSchema),
    defaultValues: {
      skill_name:  '',
      description: '',
    },
  })

  const onSubmit = async (values: SkillFormValues) => {
    setIsSubmitting(true)
    try {
      const result = await createSkill({
        skill_name:  values.skill_name,
        description: values.description,
      })

      if (result.status === 'success') {
        toast.success('Skill created successfully')
        setIsOpen(false)
        form.reset()
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
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
         <Button className=" rounded-lg">
          <Plus className="h-4 w-4" />
          Add Skill
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md flex flex-col h-full">
        <SheetHeader>
          <SheetTitle>Add New Skill</SheetTitle>
          <SheetDescription>
            Create a new skill that can be assigned to workers.
          </SheetDescription>
        </SheetHeader>

        <Separator className="my-4" />

        <div className="flex-1 overflow-y-auto px-4">
          <form id="create-skill-form" onSubmit={form.handleSubmit(onSubmit)} className="py-2">
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
                      Describe what this skill involves
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
              form="create-skill-form"
              disabled={isSubmitting}
            >
              {isSubmitting && <Spinner className="mr-2" />}
              {isSubmitting ? 'Creating...' : 'Create Skill'}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

export default CreateSkillForm