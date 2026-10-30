'use client'

import { useDebouncedSearch } from '@/lib/hooks/use-debounced-search'


import { PageHeading } from '@/components/shared-ui/page-heading'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCheck, BellOff, Search, X } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { UserRole } from '@/lib/constants/roles'

import {
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type UserNotificationRecord,
} from '@/lib/actions/notifications/notifications.actions'
import { getNotificationDisplay, getNotificationHref } from '../shared-ui/notification-config'

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

// Bump this if you want the page to load more history than the dropdown.
// NOTE: getUserNotifications currently has no offset param — if the list
// grows large, add server-side pagination to the action instead of relying
// on this single larger fetch.
const PAGE_FETCH_LIMIT = 100

interface NotificationsPageContentProps {
  /** Current user's role — used to resolve per-notification navigation targets. */
  role: UserRole | null
}

export default function NotificationsPageContent({ role }: NotificationsPageContentProps) {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [notifications, setNotifications] = useState<UserNotificationRecord[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [markingAll, setMarkingAll] = useState(false)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedSearch(search)

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getUserNotifications(PAGE_FETCH_LIMIT)
      if (res.status === 'success' && res.data) {
        setNotifications(res.data.notifications)
        setUnreadCount(res.data.unread_count)
      } else {
        toast.error(res.message ?? 'Failed to load notifications')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchNotifications() }, [fetchNotifications])

  const visible = useMemo(() => {
    let list = filter === 'unread' ? notifications.filter((n) => !n.is_read) : notifications
    const q = debouncedSearch.trim().toLowerCase()
    if (q) {
      list = list.filter((n) => {
        const display = getNotificationDisplay(n)
        return display.title.toLowerCase().includes(q) || display.body.toLowerCase().includes(q)
      })
    }
    return list
  }, [notifications, filter, debouncedSearch])

  const groups = useMemo(() => groupByDay(visible), [visible])

  async function handleItemClick(n: UserNotificationRecord) {
    if (!n.is_read) {
      setNotifications((prev) =>
        prev.map((row) => (row.notification_id === n.notification_id ? { ...row, is_read: true } : row)),
      )
      setUnreadCount((c) => Math.max(0, c - 1))
      const res = await markNotificationRead(n.notification_id)
      if (res.status === 'error') toast.error(res.message ?? 'Failed to update notification')
    }
    router.push(getNotificationHref(n, role))
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
    <div className="w-full space-y-5">
      <PageHeading
        title="Notifications"
        description={unreadCount > 0 ? `${unreadCount} unread` : 'Every update, in one place'}
      />
      {unreadCount > 0 && (
        <div className="flex items-center justify-end">
          <Button
            variant="outline"
            onClick={handleMarkAllRead}
            disabled={markingAll}
            className="h-9 gap-1.5 rounded-md text-sm font-medium border-slate-200 hover:border-violet-300 hover:text-violet-600"
          >
            {markingAll ? <Spinner /> : <CheckCheck className="h-3.5 w-3.5" />}
            Mark all read
          </Button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300" />
          <Input
            placeholder="Search notifications..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8 rounded-md text-xs bg-white border-slate-200 text-slate-700 placeholder:text-slate-300 focus-visible:ring-2 focus-visible:ring-violet-100 hover:border-violet-200"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-100">
              <X className="h-3 w-3 text-slate-400" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {(['all', 'unread'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-semibold transition-colors',
                filter === key
                  ? 'bg-violet-600 border-violet-600 text-white'
                  : 'bg-white border-slate-200 text-slate-500 hover:border-violet-300 hover:text-violet-600',
              )}
            >
              {key === 'all' ? 'All' : 'Unread'}
              {key === 'unread' && unreadCount > 0 && (
                <span className={cn(
                  'inline-flex items-center justify-center h-[16px] min-w-[16px] px-1 rounded-md text-[9.5px] font-bold',
                  filter === key ? 'bg-white/20 text-white' : 'bg-violet-50 border border-violet-200 text-violet-700',
                )}>
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-start gap-3 px-3 py-3">
                <div className="h-10 w-10 rounded-md bg-slate-100 animate-pulse shrink-0" />
                <div className="flex-1 space-y-1.5 pt-0.5">
                  <div className="h-2.5 bg-slate-100 rounded-md animate-pulse w-2/5" />
                  <div className="h-2.5 bg-slate-100 rounded-md animate-pulse w-3/5" />
                  <div className="h-2 bg-slate-50 rounded-md animate-pulse w-1/5" />
                </div>
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 px-6">
            <div className="h-14 w-14 rounded-md bg-white border border-slate-200 flex items-center justify-center">
              <BellOff className="h-6 w-6 text-slate-300" />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-slate-800">
                {search ? 'No matches' : filter === 'unread' ? 'No unread notifications' : "You're all caught up"}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {search ? 'Try a different search term.' : filter === 'unread' ? 'Switch to All to see your full history.' : "We'll let you know when something needs attention."}
              </p>
            </div>
          </div>
        ) : (
          <div className="py-2">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="px-5 pt-3 pb-1.5 text-[10px] font-extrabold uppercase tracking-[1.2px] text-slate-400">
                  {group.label}
                </p>
                <div className="px-3 space-y-1">
                  {group.items.map((n) => {
                    const display = getNotificationDisplay(n)
                    return (
                      <button
                        key={n.notification_id}
                        type="button"
                        onClick={() => handleItemClick(n)}
                        className={cn(
                          'relative w-full flex items-start gap-3 rounded-md border px-3 py-3 text-left transition-colors outline-none',
                          n.is_read
                            ? 'border-transparent hover:border-slate-200 hover:bg-slate-50'
                            : 'border-violet-200 bg-violet-50/50 hover:bg-violet-50',
                        )}
                      >
                        <div className={cn('h-10 w-10 rounded-md flex items-center justify-center shrink-0', display.iconWrap)}>
                          <display.icon className={cn('h-4.5 w-4.5', display.iconColor)} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className={cn('text-[13.5px] leading-tight', n.is_read ? 'font-medium text-slate-700' : 'font-bold text-slate-900')}>
                              {display.title}
                            </p>
                            {!n.is_read && <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-violet-600 shrink-0" />}
                          </div>
                          {display.body && <p className="text-[12.5px] text-slate-500 mt-0.5">{display.body}</p>}
                          <p className="text-[10.5px] text-slate-400 mt-1">{fmtRelative(n.created_at)}</p>
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
    </div>
  )
}