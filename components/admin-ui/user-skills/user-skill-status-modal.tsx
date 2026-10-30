'use client'

import React, { useState, useEffect } from 'react'
import { AlertTriangle, Power, PowerOff } from 'lucide-react'

import { Spinner } from '@/components/ui/spinner'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { type UserSkill } from '@/lib/actions/user-skill.actions'

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserSkillStatusModalProps {
  isOpen:    boolean
  setIsOpen: (open: boolean) => void
  userSkill: UserSkill | null
  onConfirm: () => void
  isLoading: boolean
}

// ─── Component ───────────────────────────────────────────────────────────────

const UserSkillStatusModal = ({
  isOpen, setIsOpen, userSkill, onConfirm, isLoading,
}: UserSkillStatusModalProps) => {
  const [confirmationText, setConfirmationText] = useState('')
  const [error,            setError]            = useState('')

  // Reset input when modal closes
  useEffect(() => {
    if (!isOpen) {
      setConfirmationText('')
      setError('')
    }
  }, [isOpen])

  if (!userSkill) return null

  const isDeactivating = userSkill.is_active
  const workerName     = `${userSkill.user.first_name} ${userSkill.user.last_name}`
  const skillName      = userSkill.skill.skill_name
  // Confirmation keyword: skill name lowercased, spaces → hyphens
  const confirmKeyword = skillName.toLowerCase().replace(/\s+/g, '-')

  const handleConfirm = () => {
    if (isDeactivating) {
      if (confirmationText.trim().toLowerCase() !== confirmKeyword) {
        setError(`The skill name you entered does not match. Please type "${confirmKeyword}" to confirm.`)
        return
      }
    }
    setError('')
    onConfirm()
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmationText(e.target.value)
    if (error) setError('')
  }

  const isConfirmDisabled = isDeactivating
    ? confirmationText.trim().toLowerCase() !== confirmKeyword
    : false

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogContent className="max-w-md rounded-xl">
        <AlertDialogHeader>

          {/* Icon */}
          <div className={`inline-flex items-center justify-center w-10 h-10 rounded-full mb-2 ${
            isDeactivating ? 'bg-destructive/10' : 'bg-green-50 dark:bg-green-950/40'
          }`}>
            {isDeactivating
              ? <PowerOff className="h-5 w-5 text-destructive" />
              : <Power    className="h-5 w-5 text-green-600"   />
            }
          </div>

          <AlertDialogTitle>
            {isDeactivating ? 'Deactivate Skill Assignment' : 'Activate Skill Assignment'}
          </AlertDialogTitle>

          <AlertDialogDescription asChild>
            <span>
              Are you sure you want to{' '}
              {isDeactivating ? 'deactivate' : 'activate'}{' '}
              <span className="font-semibold text-foreground">{skillName}</span>
              {' '}for{' '}
              <span className="font-semibold text-foreground">{workerName}</span>?

              {/* Deactivate warning block */}
              {isDeactivating && (
                <span className="mt-3 p-3 border rounded-md block bg-destructive/5 border-destructive/20">
                  <span className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-destructive" />
                    <span className="text-sm">
                      This skill assignment will be marked as inactive. The worker will no longer
                      appear as having this skill.
                    </span>
                  </span>
                </span>
              )}

              {/* Activate info block */}
              {!isDeactivating && (
                <span className="mt-3 p-3 border rounded-md block bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800">
                  <span className="flex items-start gap-2">
                    <span className="text-sm">
                      This skill assignment will be reactivated. The worker will be listed
                      as having this skill again.
                    </span>
                  </span>
                </span>
              )}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Confirmation input — only on deactivate */}
        {isDeactivating && (
          <div className="space-y-2 my-2">
            <Label htmlFor="skill-confirm" className="text-sm font-medium">
              Type{' '}
              <span className="font-semibold">{confirmKeyword}</span>
              {' '}to confirm
            </Label>
            <Input
              id="skill-confirm"
              type="text"
              placeholder={`Type "${confirmKeyword}"`}
              value={confirmationText}
              onChange={handleInputChange}
              className={error ? 'border-destructive focus-visible:ring-destructive' : ''}
              disabled={isLoading}
              autoComplete="off"
            />
            {error && (
              <p className="text-sm text-destructive mt-1">{error}</p>
            )}
          </div>
        )}

        <AlertDialogFooter className="mt-4">
          <AlertDialogCancel disabled={isLoading} className='rounded-lg'>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); handleConfirm() }}
            disabled={isLoading || isConfirmDisabled}
            className={isDeactivating ? 'bg-destructive hover:bg-destructive/90 rounded-lg' : ''}
          >
            {isLoading ? (
              <>
                <Spinner className="mr-2 inline" />
                Processing...
              </>
            ) : (
              isDeactivating ? 'Yes, Deactivate' : 'Yes, Activate'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export default UserSkillStatusModal