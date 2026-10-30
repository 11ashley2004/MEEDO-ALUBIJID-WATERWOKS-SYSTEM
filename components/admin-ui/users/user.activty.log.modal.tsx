'use client'

import { useState, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Activity, Calendar, FileText, Mail, ShieldCheck, PlusCircle, RefreshCw, Trash2, Settings } from 'lucide-react'
import { getUserAuditLogs } from '@/lib/actions/audit.action'
import { getUserById } from '@/lib/actions/users/user.actions'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface AuditLog {
  log_id:       string
  user_id:      string
  action:       string
  description:  string
  target_table: string
  target_id:    string
  created_at:   string
  users: {
    first_name: string
    last_name:  string
    email:      string
  }
}

interface AuditLogModalProps {
  userId: string
  children: React.ReactNode
}

// Per-action config
const ACTION_CONFIG: Record<string, {
  label: string
  icon: React.ElementType
  pill: string
  dot: string
  iconBg: string
}> = {
  CREATE: {
    label:  'Created',
    icon:   PlusCircle,
    pill:   'bg-emerald-50 text-emerald-700 ring-emerald-200',
    dot:    'bg-emerald-500',
    iconBg: 'bg-emerald-100 text-emerald-600',
  },
  UPDATE: {
    label:  'Updated',
    icon:   RefreshCw,
    pill:   'bg-blue-50 text-blue-700 ring-blue-200',
    dot:    'bg-blue-500',
    iconBg: 'bg-blue-100 text-blue-600',
  },
  STATUS_CHANGE: {
    label:  'Status Change',
    icon:   ShieldCheck,
    pill:   'bg-violet-50 text-violet-700 ring-violet-200',
    dot:    'bg-violet-500',
    iconBg: 'bg-violet-100 text-violet-600',
  },
  DELETE: {
    label:  'Deleted',
    icon:   Trash2,
    pill:   'bg-red-50 text-red-700 ring-red-200',
    dot:    'bg-red-400',
    iconBg: 'bg-red-100 text-red-500',
  },
  DEFAULT: {
    label:  'Action',
    icon:   Settings,
    pill:   'bg-slate-100 text-slate-600 ring-slate-200',
    dot:    'bg-slate-400',
    iconBg: 'bg-slate-100 text-slate-500',
  },
}

const getConfig = (action: string) => ACTION_CONFIG[action] ?? ACTION_CONFIG.DEFAULT

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

// Avatar color consistent with users table
const AVATAR_COLORS = [
  'bg-violet-100 text-violet-700',
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
]
const getAvatarColor = (name: string) =>
  AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]

const AuditLogModal = ({ userId, children }: AuditLogModalProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [user, setUser] = useState<{ first_name: string; last_name: string; email: string } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingUser, setIsLoadingUser] = useState(false)

  // Fetch user data and audit logs when modal opens
  useEffect(() => {
    if (isOpen && userId) {
      const fetchData = async () => {
        // Fetch user data
        setIsLoadingUser(true)
        try {
          const userData = await getUserById(userId)
          if (userData) {
            setUser(userData)
          }
        } catch (error) {
          toast.error('Failed to load user data')
        } finally {
          setIsLoadingUser(false)
        }

        // Fetch audit logs
        setIsLoading(true)
        try {
          const result = await getUserAuditLogs(userId)
          if (result.status === 'success') {
            setLogs(result.data)
          } else {
            toast.error('Failed to load audit logs')
          }
        } catch {
          toast.error('An error occurred')
        } finally {
          setIsLoading(false)
        }
      }
      
      fetchData()
    }
  }, [isOpen, userId])

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden rounded-2xl border-slate-200 shadow-xl shadow-slate-200/60 max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="px-6 pt-6 pb-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-9 w-9 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
              <Activity className="h-4.5 w-4.5 text-purple-600" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-slate-900 leading-tight">
                Activity Log
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400 mt-0.5">
                All recorded actions performed by this user
              </DialogDescription>
            </div>

            {/* Log count badge */}
            {!isLoading && logs.length > 0 && (
              <span className="ml-auto inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 ring-1 ring-purple-200">
                {logs.length} {logs.length === 1 ? 'entry' : 'entries'}
              </span>
            )}
          </div>

          {/* User card - loading state */}
          {isLoadingUser ? (
            <div className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3 ring-1 ring-slate-200">
              <div className="h-10 w-10 rounded-full bg-slate-200 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 bg-slate-200 animate-pulse rounded" />
                <div className="h-3 w-48 bg-slate-200 animate-pulse rounded" />
              </div>
            </div>
          ) : user && (
            <div className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3 ring-1 ring-slate-200">
              <div className={cn(
                'h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0',
                getAvatarColor(user.first_name),
              )}>
                {user.first_name[0]}{user.last_name[0]}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 leading-tight truncate">
                  {user.first_name} {user.last_name}
                </p>
                <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                  <Mail className="h-3 w-3 shrink-0" />
                  {user.email}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Scrollable log list */}
        <ScrollArea className="flex-1 min-h-0 overflow-y-auto">
          <div className="px-6 py-4">

            {/* Loading skeletons */}
            {isLoading && (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex gap-3 p-4 rounded-xl bg-slate-50 animate-pulse">
                    <div className="h-9 w-9 rounded-xl bg-slate-200 shrink-0" />
                    <div className="flex-1 space-y-2 pt-1">
                      <div className="flex gap-2 items-center">
                        <div className="h-5 w-20 bg-slate-200 rounded-full" />
                        <div className="h-3.5 w-32 bg-slate-200 rounded-full" />
                      </div>
                      <div className="h-3.5 w-3/4 bg-slate-200 rounded-full" />
                      <div className="h-3 w-1/3 bg-slate-200 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {!isLoading && logs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                  <Activity className="h-7 w-7 text-slate-400" />
                </div>
                <p className="text-base font-semibold text-slate-700">No activity yet</p>
                <p className="text-sm text-slate-400 mt-1">
                  This user hasn't performed any actions yet.
                </p>
              </div>
            )}

            {/* Log entries — timeline style */}
            {!isLoading && logs.length > 0 && (
              <div className="relative space-y-1">
                {/* Vertical timeline line */}
                <div className="absolute left-[28px] top-2 bottom-2 w-px bg-slate-100" />

                {logs.map((log) => {
                  const cfg    = getConfig(log.action)
                  const Icon   = cfg.icon

                  return (
                    <div
                      key={log.log_id}
                      className="relative flex gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors group"
                    >
                      {/* Icon node on timeline */}
                      <div className={cn(
                        'h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ring-1 z-10',
                        cfg.iconBg,
                        'ring-white shadow-sm',
                      )}>
                        <Icon className="h-4 w-4" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {/* Action pill */}
                          <span className={cn(
                            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ring-1',
                            cfg.pill,
                          )}>
                            <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
                            {cfg.label}
                          </span>

                          {/* Target table tag */}
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                            <FileText className="h-3 w-3" />
                            {log.target_table}
                          </span>

                          {/* Timestamp — pushed right */}
                          <span className="ml-auto text-[11px] text-slate-400 flex items-center gap-1 shrink-0">
                            <Calendar className="h-3 w-3" />
                            {formatDate(log.created_at)}
                          </span>
                        </div>

                        <p className="text-sm text-slate-600 leading-snug">
                          {log.description}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </ScrollArea>

      </DialogContent>
    </Dialog>
  )
}

export default AuditLogModal