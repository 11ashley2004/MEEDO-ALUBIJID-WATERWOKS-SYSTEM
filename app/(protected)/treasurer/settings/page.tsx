'use client'

import { PageHeading } from '@/components/shared-ui/page-heading'
import { useEffect, useState, useCallback } from 'react'
import { Bell, Volume2, VolumeX, Save, Info } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  getUserNotificationPreference,
  updateUserNotificationPreference,
} from '@/lib/actions/notifications/notification-preferences.actions'

// ─── Shared bits (kept local so this file can be dropped in standalone) ──────

function LoadingBlock() {
  return (
    <div className="space-y-3">
      <div className="h-14 bg-slate-100 animate-pulse rounded-md border border-slate-100" />
    </div>
  )
}

function ToggleSwitch({
  checked, onChange, disabled,
}: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50',
        checked ? 'bg-violet-600 border-violet-600' : 'bg-slate-200 border-slate-200',
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-[3px]',
        )}
      />
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
// User-side settings — toast alert preference only. No admin sound library,
// no audio selection, no penalty/meter/disconnection config. A regular user
// only ever sees and edits *their own* toast_enabled preference row.

export default function Settings() {
  const [loading, setLoading] = useState(true)
  const [toastEnabled, setToastEnabled] = useState(true)
  const [initial, setInitial] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchPreference = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getUserNotificationPreference()
      if (res.status === 'success' && res.data) {
        setToastEnabled(res.data.toast_enabled)
        setInitial(res.data.toast_enabled)
      } else {
        toast.error(res.message ?? 'Failed to load your notification preference')
      }
    } catch {
      toast.error('Failed to load your notification preference')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPreference() }, [fetchPreference])

  const dirty = toastEnabled !== initial

  async function handleSave() {
    setSaving(true)
    try {
      const res = await updateUserNotificationPreference(toastEnabled)
      if (res.status === 'success') {
        toast.success(res.message ?? 'Notification preference saved')
        setInitial(toastEnabled)
      } else {
        toast.error(res.message ?? 'Failed to save preference')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-full space-y-5 sm:space-y-6">

      <PageHeading title="Settings" description="Manage your personal account preferences." />

      {/* Notification preference panel */}
      <div className="bg-white border border-slate-200 rounded-md">
        <div className="border-b border-slate-100 px-4 sm:px-5 py-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-md bg-violet-50 flex items-center justify-center ring-1 ring-violet-100 shrink-0">
            <Bell className="h-4 w-4 text-violet-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[13px] font-bold text-slate-900">Notifications</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Choose whether you see a pop-up toast for new notifications.
            </p>
          </div>
        </div>

        <div className="p-4 sm:p-5 max-w-md">
          {loading ? (
            <LoadingBlock />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 border border-slate-200 rounded-md px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn(
                    'h-9 w-9 rounded-md flex items-center justify-center shrink-0',
                    toastEnabled ? 'bg-violet-50 ring-1 ring-violet-100' : 'bg-slate-100',
                  )}>
                    {toastEnabled
                      ? <Volume2 className="h-4 w-4 text-violet-600" />
                      : <VolumeX className="h-4 w-4 text-slate-400" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-semibold text-slate-800">Toast Alerts</p>
                    <p className="text-[11px] text-slate-500 truncate">Show a pop-up toast when a new notification arrives.</p>
                  </div>
                </div>
                <ToggleSwitch checked={toastEnabled} onChange={() => setToastEnabled((v) => !v)} />
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="flex items-start gap-2 text-[11px] text-slate-500">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>This only affects your account.</span>
                </div>
                <Button
                  size="sm"
                  disabled={!dirty || saving}
                  onClick={handleSave}
                  className="h-9 shrink-0 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-[12px] font-semibold shadow-sm"
                >
                  {saving
                    ? <><Spinner className="mr-1.5" />Saving…</>
                    : <><Save className="mr-1.5 h-3.5 w-3.5" />Save</>
                  }
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}