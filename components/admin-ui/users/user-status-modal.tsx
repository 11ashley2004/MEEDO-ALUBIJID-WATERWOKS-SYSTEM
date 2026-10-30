'use client'

import React, { useState, useEffect } from 'react'
import { UserCheck, UserX } from 'lucide-react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getUserById, toggleUserStatus } from '@/lib/actions/users/user.actions'
import { toast } from 'sonner'

interface UserStatusModalProps {
  userId: string
  onSuccess?: () => void
  children: React.ReactNode
}

const UserStatusModal: React.FC<UserStatusModalProps> = ({ userId, onSuccess, children }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  // Fetch user data when modal opens
  useEffect(() => {
    if (isOpen && userId) {
      const fetchUser = async () => {
        setIsLoading(true)
        try {
          const userData = await getUserById(userId)
          setUser(userData)
        } catch (error) {
          toast.error('Failed to load user data')
        } finally {
          setIsLoading(false)
        }
      }
      fetchUser()
    } else if (!isOpen) {
      // Reset when dialog closes
      setUser(null)
    }
  }, [isOpen, userId])

  const handleConfirm = async () => {
    if (!user) return

    setIsProcessing(true)
    try {
      const result = await toggleUserStatus(userId, user.is_active)

      if (result.status === 'success') {
        toast.success(`User ${user.is_active ? 'deactivated' : 'activated'} successfully`)
        setIsOpen(false)
        onSuccess?.()
      } else {
        toast.error(result.message || 'Failed to update user status')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setIsProcessing(false)
    }
  }

  const isActive = user?.is_active ?? false
  const action = isActive ? 'Deactivate' : 'Activate'
  const fullName = user ? `${user.first_name} ${user.last_name}` : ''

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md rounded-md border border-slate-200 bg-white p-0 overflow-hidden shadow-none">
        {/* DialogTitle must be a direct child of DialogContent */}
        <DialogTitle className="sr-only">
          {action} User
        </DialogTitle>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
          </div>
        ) : user && (
          <>
            <div className="p-5 pb-3">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'h-9 w-9 rounded-md flex items-center justify-center',
                    isActive ? 'bg-red-100' : 'bg-emerald-100',
                  )}
                >
                  {isActive ? (
                    <UserX className="h-4 w-4 text-red-600" />
                  ) : (
                    <UserCheck className="h-4 w-4 text-emerald-600" />
                  )}
                </div>
                <div
                  className={cn(
                    'text-base font-semibold tracking-tight',
                    isActive ? 'text-red-600' : 'text-emerald-600',
                  )}
                >
                  {action} User
                </div>
              </div>
              <div className="text-sm text-slate-500 pt-2">
                {isActive ? (
                  <>
                    Are you sure you want to deactivate{' '}
                    <span className="font-semibold text-slate-700">{fullName}</span>?
                    <br />
                    <span className="text-xs text-slate-400 mt-1.5 block leading-relaxed">
                      This action cannot be undone. The user will be immediately
                      locked out and lose all system access.
                    </span>
                  </>
                ) : (
                  <>
                    Are you sure you want to activate{' '}
                    <span className="font-semibold text-slate-700">{fullName}</span>?
                    <br />
                    <span className="text-xs text-slate-400 mt-1.5 block leading-relaxed">
                      The user will regain full system access.
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-50/50 border-t border-slate-100 flex flex-row justify-end gap-2">
              <DialogClose asChild>
                <Button
                  disabled={isProcessing}
                  variant="outline"
                  className="h-8 px-3 rounded-md text-xs font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-700 transition-colors shadow-none"
                >
                  Cancel
                </Button>
              </DialogClose>
              <Button
                onClick={handleConfirm}
                disabled={isProcessing}
                className={cn(
                  'h-8 px-3 rounded-md text-xs font-medium gap-1.5 shadow-none transition-colors',
                  isActive
                    ? 'bg-red-600 hover:bg-red-700 focus:ring-red-600 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-600 text-white',
                )}
              >
                {isProcessing ? (
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : isActive ? (
                  <UserX className="h-3.5 w-3.5" />
                ) : (
                  <UserCheck className="h-3.5 w-3.5" />
                )}
                {action}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default UserStatusModal