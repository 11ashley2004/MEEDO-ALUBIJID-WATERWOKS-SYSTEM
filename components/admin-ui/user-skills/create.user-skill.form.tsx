'use client'

import { Plus, Trash2, AlertCircle, Wrench } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'

import {
  Sheet, SheetClose, SheetContent, SheetDescription,
  SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import {
  Select, SelectContent, SelectItem, SelectTrigger,
  SelectValue, SelectGroup, SelectLabel,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  getAllUsersForSelect,
  getAllSkillsForSelect,
  getAssignedSkillIds,
  assignSkillsToUser,
} from '@/lib/actions/user-skill.actions'
import { cn } from '@/lib/utils'

// ─── Field Components ─────────────────────────────────────────────────────────

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

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserOption  { user_id: string; first_name: string; last_name: string }
interface SkillOption { skill_id: string; skill_name: string }
interface SkillRow    { id: string; skill_id: string }

interface CreateUserSkillFormProps {
  onSuccess?:     () => void
  defaultUserId?: string
}

// ─── Component ───────────────────────────────────────────────────────────────

const CreateUserSkillForm = ({ onSuccess, defaultUserId }: CreateUserSkillFormProps) => {
  const [isSubmitting,       setIsSubmitting]       = useState(false)
  const [isOpen,             setIsOpen]             = useState(false)
  const [isLoadingData,      setIsLoadingData]      = useState(true)
  const [isLoadingAssigned,  setIsLoadingAssigned]  = useState(false)
  const [submitError,        setSubmitError]        = useState<string | null>(null)
  const [users,              setUsers]              = useState<UserOption[]>([])
  const [allSkills,          setAllSkills]          = useState<SkillOption[]>([])
  const [assignedSkillIds,   setAssignedSkillIds]   = useState<string[]>([])
  const [selectedUserId,     setSelectedUserId]     = useState('')
  const [skillRows,          setSkillRows]          = useState<SkillRow[]>([{ id: '1', skill_id: '' }])

  // Skills available to assign = all skills minus already assigned to user
  const availableSkills = allSkills.filter((s) => !assignedSkillIds.includes(s.skill_id))

  // ── Load users + all skills on open ──────────────────────
  useEffect(() => {
    const fetchData = async () => {
      if (!isOpen) return
      setIsLoadingData(true)
      setSubmitError(null)
      try {
        const [usersData, skillsData] = await Promise.all([
          defaultUserId ? Promise.resolve([]) : getAllUsersForSelect(),
          getAllSkillsForSelect(),
        ])
        setUsers(usersData)
        setAllSkills(skillsData)

        // If defaultUserId provided, immediately fetch their assigned skills
        if (defaultUserId) {
          const ids = await getAssignedSkillIds(defaultUserId)
          setAssignedSkillIds(ids)
        }
      } catch {
        toast.error('Failed to load form data')
      } finally {
        setIsLoadingData(false)
      }
    }
    fetchData()
  }, [isOpen, defaultUserId])

  // ── Fetch assigned skills when user is selected ───────────
  useEffect(() => {
    if (!selectedUserId || defaultUserId) return
    setIsLoadingAssigned(true)
    setSkillRows([{ id: '1', skill_id: '' }])
    getAssignedSkillIds(selectedUserId)
      .then(setAssignedSkillIds)
      .catch(() => toast.error('Failed to load assigned skills'))
      .finally(() => setIsLoadingAssigned(false))
  }, [selectedUserId, defaultUserId])

  // ── Reset on close ────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      setSelectedUserId('')
      setAssignedSkillIds([])
      setSkillRows([{ id: '1', skill_id: '' }])
      setSubmitError(null)
    }
  }, [isOpen])

  // ── Skill row handlers ────────────────────────────────────
  const handleAddSkillRow = () => {
    const newId = (Math.max(...skillRows.map((r) => parseInt(r.id))) + 1).toString()
    setSkillRows([...skillRows, { id: newId, skill_id: '' }])
  }

  const handleRemoveSkillRow = (id: string) => {
    if (skillRows.length === 1) return
    setSkillRows(skillRows.filter((r) => r.id !== id))
  }

  const handleSkillChange = (id: string, skillId: string) => {
    setSkillRows(skillRows.map((r) => (r.id === id ? { ...r, skill_id: skillId } : r)))
  }

  // Available skills for a specific row = availableSkills minus what other rows already picked
  const getAvailableSkillsForRow = (currentRowId: string) => {
    const pickedInOtherRows = skillRows
      .filter((r) => r.id !== currentRowId && r.skill_id !== '')
      .map((r) => r.skill_id)
    return availableSkills.filter((s) => !pickedInOtherRows.includes(s.skill_id))
  }

  // ── Submit ────────────────────────────────────────────────
  const onSubmit = async () => {
    const userId = defaultUserId ?? selectedUserId

    if (!userId) {
      toast.error('Please select a worker')
      return
    }

    const selectedSkillIds = skillRows.map((r) => r.skill_id).filter((id) => id !== '')

    if (selectedSkillIds.length === 0) {
      toast.error('Please select at least one skill')
      return
    }

    const uniqueSkills = new Set(selectedSkillIds)
    if (uniqueSkills.size !== selectedSkillIds.length) {
      toast.error('Duplicate skills selected. Please ensure each skill is unique.')
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const result = await assignSkillsToUser({ user_id: userId, skill_ids: selectedSkillIds })

      if (result.status === 'success') {
        toast.success(
          result.assigned === 1
            ? '1 skill assigned successfully'
            : `${result.assigned} skills assigned successfully`,
        )
        setIsOpen(false)
        onSuccess?.()
      } else {
        setSubmitError(result.message || 'Failed to assign skills')
      }
    } catch {
      setSubmitError('An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  const isLoading = isLoadingData || isLoadingAssigned
  const allSkillsAssigned = availableSkills.length === 0 && (!!selectedUserId || !!defaultUserId)
  const allRowsFilled = skillRows.filter((r) => r.skill_id !== '').length >= availableSkills.length && availableSkills.length > 0

  const fieldClassName = (err?: boolean) =>
    'w-full h-9 px-3 rounded-md text-[13px] text-slate-700 bg-white border outline-none transition-all duration-150 placeholder:text-slate-300 ' +
    (err
      ? 'border-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-100'
      : 'border-slate-200 hover:border-violet-300 focus:border-violet-400 focus:ring-2 focus:ring-violet-100')

  // ─── JSX ─────────────────────────────────────────────────

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button className="h-9 gap-2 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-semibold shadow-sm shadow-violet-200">
          <Plus className="h-4 w-4" />
          Assign Skill
        </Button>
      </SheetTrigger>

      <SheetContent className="w-full sm:max-w-md flex flex-col h-full p-0 gap-0 border-l border-slate-200 bg-white">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-violet-100 border border-violet-200 flex items-center justify-center shrink-0">
              <Wrench className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <SheetTitle className="text-[14px] font-bold text-slate-900 leading-tight">
                Assign Skill
              </SheetTitle>
              <SheetDescription className="text-[11px] text-slate-400 mt-0.5">
                Assign one or more skills to a worker
              </SheetDescription>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <div className="space-y-5">
              <div className="space-y-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3.5 w-16" />
                  <Skeleton className="h-7 w-20 rounded-md" />
                </div>
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
            </div>
          ) : (
            <div className="space-y-5">

              {/* Submit Error Banner */}
              {submitError && (
                <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-md bg-rose-50 border border-rose-200">
                  <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
                  <p className="text-xs font-medium text-rose-600">{submitError}</p>
                </div>
              )}

              {/* Worker Select */}
              {!defaultUserId && (
                <div>
                  <FieldLabel label="Worker" required />
                  <Select
                    onValueChange={(value) => setSelectedUserId(value)}
                    value={selectedUserId}
                  >
                    <SelectTrigger className={fieldClassName(!selectedUserId)}>
                      <SelectValue placeholder="Select a worker" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Workers</SelectLabel>
                        {users.length === 0 ? (
                          <SelectItem value="empty" disabled>No workers available</SelectItem>
                        ) : (
                          users.map((u) => (
                            <SelectItem key={u.user_id} value={u.user_id}>
                              {u.first_name} {u.last_name}
                            </SelectItem>
                          ))
                        )}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldError message={!selectedUserId ? 'Worker is required' : undefined} />
                </div>
              )}

              {/* Skills Section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <FieldLabel label="Skills" required />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleAddSkillRow}
                    disabled={isLoading || availableSkills.length === 0 || allRowsFilled}
                    className="h-7 px-3 text-[11px] rounded-md border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-600"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Skill
                  </Button>
                </div>

                {/* All skills already assigned notice */}
                {allSkillsAssigned && !isLoading ? (
                  <div className="p-3 rounded-md bg-slate-50 border border-slate-200 text-center">
                    <p className="text-[11px] text-slate-500">
                      All available skills are already assigned to this worker.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {skillRows.map((row, index) => {
                      const rowSkills = getAvailableSkillsForRow(row.id)
                      const hasError = row.skill_id === '' && skillRows.length > 1

                      return (
                        <div key={row.id} className="flex gap-2 items-start">
                          <div className="flex-1">
                            <Select
                              onValueChange={(value) => handleSkillChange(row.id, value)}
                              value={row.skill_id}
                            >
                              <SelectTrigger className={fieldClassName(hasError)}>
                                <SelectValue placeholder={`Select skill ${index + 1}`} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  <SelectLabel>Available Skills</SelectLabel>
                                  {rowSkills.length === 0 ? (
                                    <SelectItem value="empty" disabled>
                                      No more skills available
                                    </SelectItem>
                                  ) : (
                                    rowSkills.map((s) => (
                                      <SelectItem key={s.skill_id} value={s.skill_id}>
                                        {s.skill_name}
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                            {hasError && <FieldError message="Please select a skill" />}
                          </div>

                          {skillRows.length > 1 && (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={() => handleRemoveSkillRow(row.id)}
                              className="h-9 w-9 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                <p className="text-[10px] text-slate-400 mt-2">
                  Only unassigned skills are shown. Already-assigned skills are hidden.
                </p>
              </div>

            </div>
          )}
        </div>

        <Separator />

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-end gap-2.5 bg-slate-50/60">
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
          <Button
            type="button"
            onClick={onSubmit}
            disabled={
              isSubmitting ||
              isLoading ||
              allSkillsAssigned ||
              (!defaultUserId && !selectedUserId) ||
              skillRows.every((r) => r.skill_id === '')
            }
            className="rounded-md h-9 text-[13px] bg-violet-600 hover:bg-violet-700 text-white gap-1.5 font-medium shadow-sm shadow-violet-200"
          >
            {isSubmitting
              ? <><Spinner /> Assigning…</>
              : <><Wrench className="h-3.5 w-3.5" /> Assign Skill</>
            }
          </Button>
        </div>

      </SheetContent>
    </Sheet>
  )
}

export default CreateUserSkillForm