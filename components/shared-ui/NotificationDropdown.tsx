'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CheckCheck, BellOff } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { UserRole, getBaseRoute } from '@/lib/constants/roles'

import {
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  markNotificationToastShown,
  type UserNotificationRecord,
} from '@/lib/actions/notifications/notifications.actions'
import { getUserNotificationPreference } from '@/lib/actions/notifications/notification-preferences.actions'
import { getNotificationDisplay, getNotificationHref } from './notification-config'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtRelative = (d: string) => {
  const diffMs = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

function groupByDay(list: UserNotificationRecord[]) {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)

  const today: UserNotificationRecord[] = []
  const yesterday: UserNotificationRecord[] = []
  const earlier: UserNotificationRecord[] = []

  for (const n of list) {
    const d = new Date(n.created_at)
    if (d >= startOfToday) today.push(n)
    else if (d >= startOfYesterday) yesterday.push(n)
    else earlier.push(n)
  }

  return [
    { label: 'Today', items: today },
    { label: 'Yesterday', items: yesterday },
    { label: 'Earlier', items: earlier },
  ].filter((g) => g.items.length > 0)
}

// ─── Loading / empty states ────────────────────────────────────────────────────

function LoadingRows() {
  return (
    <div className="p-3 space-y-1">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-start gap-3 px-3 py-2.5">
          <div className="h-9 w-9 rounded-md bg-slate-100 animate-pulse shrink-0" />
          <div className="flex-1 space-y-1.5 pt-0.5">
            <div className="h-2.5 bg-slate-100 rounded-md animate-pulse w-3/5" />
            <div className="h-2.5 bg-slate-100 rounded-md animate-pulse w-4/5" />
            <div className="h-2 bg-slate-50 rounded-md animate-pulse w-1/4" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-3 px-6">
      <div className="h-14 w-14 rounded-md bg-white border border-slate-200 flex items-center justify-center">
        <BellOff className="h-6 w-6 text-slate-300" />
      </div>
      <div className="text-center">
        <p className="text-[13px] font-bold text-slate-800">
          {filtered ? 'No unread notifications' : "You're all caught up"}
        </p>
        <p className="text-[11.5px] text-slate-400 mt-0.5">
          {filtered ? 'Switch to All to see your full history.' : "We'll let you know when something needs attention."}
        </p>
      </div>
    </div>
  )
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface NotificationDropdownProps {
  /** Current user's role — used to resolve notification/View-all routes. */
  role: UserRole | null
  /** Called when a notification row is clicked, after it's marked read.
   *  Omit to use the default: navigate via getNotificationHref(n, role). */
  onNotificationClick?: (notification: UserNotificationRecord) => void
  /** Called when "View all notifications" is clicked.
   *  Omit to use the default: navigate to `${getBaseRoute(role)}/notifications`. */
  onViewAll?: () => void
  /** How often to silently refresh the list, in ms. Set 0 to disable polling. */
  pollIntervalMs?: number
}

export default function NotificationDropdown({
  role,
  onNotificationClick,
  onViewAll,
  pollIntervalMs = 30_000,
}: NotificationDropdownProps) {
  const router = useRouter()
  const baseRoute = getBaseRoute(role)

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notifications, setNotifications] = useState<UserNotificationRecord[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [markingAll, setMarkingAll] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const hasLoadedOnce = useRef(false)
  const toastEnabledRef = useRef(true)

  // ── Client-side dedupe guard ─────────────────────────────────────────
  const toastedIdsRef = useRef<Set<string>>(new Set())

  const fetchPreference = useCallback(async () => {
    try {
      const res = await getUserNotificationPreference()
      if (res.status === 'success' && res.data) {
        toastEnabledRef.current = res.data.toast_enabled
      }
    } catch {
      // Silent — worst case, toasts just don't fire this poll cycle.
    }
  }, [])

  function processIncomingToasts(list: UserNotificationRecord[]) {
    if (!toastEnabledRef.current) return

    const unshown = list.filter(
      (n) => n.toast_shown_at === null && !toastedIdsRef.current.has(n.notification_id),
    )
    if (unshown.length === 0) return

    // Newest first, oldest last, so toasts stack in the order they arrived.
    ;[...unshown].reverse().forEach((n) => {
      toastedIdsRef.current.add(n.notification_id) // claim it immediately, before the await
      const display = getNotificationDisplay(n)
      toast(display.title, {
        description: display.body || undefined,
        action: {
          label: 'View',
          onClick: () => handleItemClick(n),
        },
      })
      markNotificationToastShown(n.notification_id).catch((error) => {
        console.error('[NotificationToast] Failed to mark toast shown:', error)
      })
    })
  }

  const fetchNotifications = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await getUserNotifications(20)
      if (res.status === 'success' && res.data) {
        setNotifications(res.data.notifications)
        setUnreadCount(res.data.unread_count)
        processIncomingToasts(res.data.notifications)
      }
    } finally {
      if (!silent) setLoading(false)
      hasLoadedOnce.current = true
    }
  }, [])

  useEffect(() => {
    fetchPreference()
    fetchNotifications()
  }, [fetchPreference, fetchNotifications])

  useEffect(() => {
    if (open) {
      fetchNotifications(hasLoadedOnce.current)
      fetchPreference() // pick up any preference change made on the Settings page
    }
  }, [open, fetchNotifications, fetchPreference])

  useEffect(() => {
    if (!pollIntervalMs) return
    const id = setInterval(() => fetchNotifications(true), pollIntervalMs)
    return () => clearInterval(id)
  }, [pollIntervalMs, fetchNotifications])

  const visible = filter === 'unread' ? notifications.filter((n) => !n.is_read) : notifications
  const groups = groupByDay(visible)

  async function handleItemClick(n: UserNotificationRecord) {
    if (!n.is_read) {
      setNotifications((prev) =>
        prev.map((row) => (row.notification_id === n.notification_id ? { ...row, is_read: true } : row)),
      )
      setUnreadCount((c) => Math.max(0, c - 1))
      const res = await markNotificationRead(n.notification_id)
      if (res.status === 'error') toast.error(res.message ?? 'Failed to update notification')
    }

    setOpen(false)
    if (onNotificationClick) {
      onNotificationClick(n)
    } else {
      router.push(getNotificationHref(n, role))
    }
  }

  function handleViewAll() {
    setOpen(false)
    if (onViewAll) {
      onViewAll()
    } else {
      router.push(`${baseRoute}/notifications`)
    }
  }

  async function handleMarkAllRead() {
    if (unreadCount === 0) return
    setMarkingAll(true)
    const prevNotifications = notifications
    const prevUnread = unreadCount
    setNotifications((prev) => prev.map((row) => ({ ...row, is_read: true })))
    setUnreadCount(0)
    try {
      const res = await markAllNotificationsRead()
      if (res.status === 'error') {
        setNotifications(prevNotifications)
        setUnreadCount(prevUnread)
        toast.error(res.message ?? 'Failed to update notifications')
      }
    } finally {
      setMarkingAll(false)
    }
  }

  return (
    <TooltipProvider>
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip>
      <TooltipTrigger asChild>
      <DropdownMenuTrigger asChild>
        <button
          className="relative h-9 w-9 flex items-center justify-center rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all duration-150 group outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
        >
          <Bell className="h-4.5 w-4.5 transition-transform group-hover:scale-110 group-hover:-rotate-12" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[17px] h-[17px] px-1 rounded-md bg-red-500 text-white text-[9.5px] font-bold ring-2 ring-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="rounded-md">Notifications</TooltipContent>
      </Tooltip>

      <DropdownMenuContent
        className="w-[400px] rounded-md border border-slate-200 shadow-xl shadow-slate-200/60 bg-white p-0 overflow-hidden"
        align="end"
        sideOffset={10}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-violet-50 border border-violet-200 flex items-center justify-center">
              <Bell className="h-3.5 w-3.5 text-violet-600" />
            </div>
            <span className="text-[14px] font-bold text-slate-900 tracking-tight">Notifications</span>
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1.5 rounded-md bg-violet-50 border border-violet-200 text-violet-700 text-[10px] font-bold">
                {unreadCount}
              </span>
            )}
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={markingAll}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white hover:border-violet-300 hover:text-violet-600 px-2.5 py-1 text-[10.5px] font-semibold text-slate-500 transition-colors disabled:opacity-50"
            >
              {markingAll ? <Spinner /> : <CheckCheck className="h-3 w-3" />}
              Mark all read
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-slate-100">
          {(['all', 'unread'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[11.5px] font-semibold transition-colors',
                filter === key
                  ? 'bg-violet-600 border-violet-600 text-white'
                  : 'bg-white border-slate-200 text-slate-500 hover:border-violet-300 hover:text-violet-600',
              )}
            >
              {key === 'all' ? 'All' : 'Unread'}
              {key === 'unread' && unreadCount > 0 && (
                <span className={cn(
                  'inline-flex items-center justify-center h-[15px] min-w-[15px] px-1 rounded-md text-[9px] font-bold',
                  filter === key ? 'bg-white/20 text-white' : 'bg-violet-50 border border-violet-200 text-violet-700',
                )}>
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="max-h-[420px] overflow-y-auto bg-white">
          {loading ? (
            <LoadingRows />
          ) : visible.length === 0 ? (
            <EmptyState filtered={filter === 'unread'} />
          ) : (
            <div className="py-2">
              {groups.map((group) => (
                <div key={group.label}>
                  <p className="px-4 pt-2.5 pb-1 text-[10px] font-extrabold uppercase tracking-[1.2px] text-slate-400">
                    {group.label}
                  </p>
                  <div className="px-2 space-y-0.5">
                    {group.items.map((n) => {
                      const display = getNotificationDisplay(n)
                      return (
                        <button
                          key={n.notification_id}
                          type="button"
                          onClick={() => handleItemClick(n)}
                          className={cn(
                            'relative w-full flex items-start gap-3 rounded-md border px-2.5 py-2.5 text-left transition-colors outline-none group',
                            n.is_read
                              ? 'border-transparent hover:border-slate-200 hover:bg-slate-50'
                              : 'border-violet-200 bg-violet-50/50 hover:bg-violet-50',
                          )}
                        >
                          <div className={cn(
                            'h-9 w-9 rounded-md flex items-center justify-center shrink-0',
                            display.iconWrap,
                          )}>
                            <display.icon className={cn('h-4 w-4', display.iconColor)} />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className={cn(
                                'text-[12.5px] leading-tight truncate',
                                n.is_read ? 'font-medium text-slate-700' : 'font-bold text-slate-900',
                              )}>
                                {display.title}
                              </p>
                              {!n.is_read && (
                                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-violet-600 shrink-0" />
                              )}
                            </div>
                            {display.body && (
                              <p className="text-[11.5px] text-slate-500 truncate mt-0.5">{display.body}</p>
                            )}
                            <p className="text-[10px] text-slate-400 mt-1">{fmtRelative(n.created_at)}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 bg-white p-3">
          <Button
            onClick={handleViewAll}
            className="w-full h-9 gap-2 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-semibold shadow-sm"
          >
            View All Notifications
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
    </TooltipProvider>
  )
}