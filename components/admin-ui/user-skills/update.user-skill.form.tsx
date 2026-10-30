'use client'


import { Spinner } from '@/components/ui/spinner'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'

import {
  Sheet, SheetClose, SheetContent, SheetDescription,
  SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet'
import {
  Select, SelectContent, SelectItem, SelectTrigger,
  SelectValue, SelectGroup, SelectLabel,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  getAllSkillsForSelect,
  getAssignedSkillIds,
  updateUserSkill,
  type UserSkill,
} from '@/lib/actions/user-skill.actions'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SkillOption { skill_id: string; skill_name: string }

interface UpdateUserSkillFormProps {
  userSkill:    UserSkill
  isOpen:       boolean
  onOpenChange: (open: boolean) => void
  onSuccess?:   () => void
}

// ─── Component ───────────────────────────────────────────────────────────────

const UpdateUserSkillForm = ({
  userSkill,
  isOpen,
  onOpenChange,
  onSuccess,
}: UpdateUserSkillFormProps) => {
  const [isSubmitting,    setIsSubmitting]    = useState(false)
  const [isLoadingSkills, setIsLoadingSkills] = useState(true)
  const [allSkills,       setAllSkills]       = useState<SkillOption[]>([])
  const [assignedIds,     setAssignedIds]     = useState<string[]>([])
  const [selectedSkillId, setSelectedSkillId] = useState(userSkill.skill_id)

  // Skills shown in dropdown:
  //   - exclude all already-assigned skills for this user
  //   - BUT always include the current skill so they can keep it (or re-select it)
  const availableSkills = allSkills.filter(
    (s) => !assignedIds.includes(s.skill_id) || s.skill_id === userSkill.skill_id,
  )

  // ── Re-seed and fetch on open ─────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    setSelectedSkillId(userSkill.skill_id)
    setIsLoadingSkills(true)

    Promise.all([
      getAllSkillsForSelect(),
      getAssignedSkillIds(userSkill.user_id),
    ])
      .then(([skillsData, assignedData]) => {
        setAllSkills(skillsData)
        setAssignedIds(assignedData)
      })
      .catch(() => toast.error('Failed to load skills'))
      .finally(() => setIsLoadingSkills(false))
  }, [isOpen, userSkill.skill_id, userSkill.user_id])

  // ── Submit ────────────────────────────────────────────────
  const onSubmit = async () => {
    if (!selectedSkillId) {
      toast.error('Please select a skill')
      return
    }

    if (selectedSkillId === userSkill.skill_id) {
      toast.error('Please select a different skill')
      return
    }

    setIsSubmitting(true)
    try {
      const result = await updateUserSkill(userSkill.user_skill_id, {
        skill_id: selectedSkillId,
      })

      if (result.status === 'success') {
        onOpenChange(false)
        onSuccess?.()
      } else {
        toast.error(result.message || 'Something went wrong')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  const hasChanged = selectedSkillId !== userSkill.skill_id && selectedSkillId !== ''

  // ── Skeleton ──────────────────────────────────────────────
  if (isLoadingSkills) {
    return (
      <Sheet open={isOpen} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-md flex flex-col h-full">
          <SheetHeader>
            <SheetTitle>Edit Skill Assignment</SheetTitle>
            <SheetDescription>Loading form data...</SheetDescription>
          </SheetHeader>
          <Separator className="my-4" />
          <div className="flex-1 overflow-y-auto px-4">
            <div className="py-2 space-y-6">
              {[1, 2].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-3 w-40" />
                </div>
              ))}
            </div>
          </div>
          <Separator className="my-4" />
          <SheetFooter className="px-4 pb-4">
            <div className="flex items-center justify-end gap-3 w-full">
              <Skeleton className="h-10 w-20" />
              <Skeleton className="h-10 w-28" />
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    )
  }

  // ─── JSX ─────────────────────────────────────────────────

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col h-full">
        <SheetHeader>
          <SheetTitle>Edit Skill Assignment</SheetTitle>
          <SheetDescription>
            Update the skill assigned to{' '}
            <span className="font-medium text-foreground">
              {userSkill.user.first_name} {userSkill.user.last_name}
            </span>.
          </SheetDescription>
        </SheetHeader>

        <Separator className="my-4" />

        <div className="flex-1 overflow-y-auto px-4">
          <div className="py-2 space-y-5">

            {/* ── Worker — read-only ── */}
            <Field>
              <FieldLabel>Worker</FieldLabel>
              <div className="flex items-center gap-2 h-9 px-3 rounded-lg border bg-muted/40 text-sm">
                <span className="font-medium text-foreground">
                  {userSkill.user.first_name} {userSkill.user.last_name}
                </span>
                <Badge variant="outline" className="ml-auto rounded-full text-xs">
                  Read-only
                </Badge>
              </div>
              <FieldDescription>
                Worker cannot be changed — remove and re-assign instead
              </FieldDescription>
            </Field>

            {/* ── Skill Select ── */}
            <Field>
              <FieldLabel htmlFor="skill_select">
                Skill <span className="text-red-500">*</span>
              </FieldLabel>
              <Select
                onValueChange={setSelectedSkillId}
                value={selectedSkillId}
                disabled={isLoadingSkills}
              >
                <SelectTrigger id="skill_select" className="w-full">
                  <SelectValue placeholder="Select a skill" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Available Skills</SelectLabel>
                    {availableSkills.length === 0 ? (
                      <SelectItem value="empty" disabled>
                        No other skills available
                      </SelectItem>
                    ) : (
                      availableSkills.map((s) => (
                        <SelectItem key={s.skill_id} value={s.skill_id}>
                          {s.skill_name}
                          {s.skill_id === userSkill.skill_id && (
                            <span className="ml-2 text-xs text-muted-foreground">(current)</span>
                          )}
                        </SelectItem>
                      ))
                    )}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                Only unassigned skills are shown. Already-assigned skills are hidden.
              </FieldDescription>
            </Field>

          </div>
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
              type="button"
              onClick={onSubmit}
              disabled={isSubmitting || isLoadingSkills || !hasChanged}
              className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg dark:bg-purple-700 dark:hover:bg-purple-600"
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

export default UpdateUserSkillForm