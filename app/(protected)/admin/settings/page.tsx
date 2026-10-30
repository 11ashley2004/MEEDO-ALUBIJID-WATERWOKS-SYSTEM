'use client'

import { PageHeading } from '@/components/shared-ui/page-heading'
import { useRef, useState } from 'react'
import {
  Percent, Droplets, PlugZap, Music2, Upload, History, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import PenaltyRateTab        from '@/components/admin-ui/settings/PenaltyRateTab'
import MeterPriceTab         from '@/components/admin-ui/settings/MeterPriceTab'
import DisconnectionRulesTab from '@/components/admin-ui/settings/DisconnectionRulesTab'
import ImportDataTab         from '@/components/admin-ui/settings/ImportDataTab'
import NotificationSoundsTab from '@/components/admin-ui/notification/NotificationSoundsTab'
import type { SettingsTabHandle } from '@/components/admin-ui/settings/shared'

// ─── Tab config ───────────────────────────────────────────────────────────────

type TabKey = 'penalty' | 'meter_price' | 'disconnection' | 'notifications' | 'import_data'

const TABS: { key: TabKey; label: string; icon: React.ElementType; desc: string }[] = [
  { key: 'penalty',       label: 'Penalty Rate',        icon: Percent,  desc: 'Overdue balance penalties' },
  { key: 'meter_price',   label: 'Meter Price',         icon: Droplets, desc: 'Unit price & monthly amount' },
  { key: 'disconnection', label: 'Disconnection Rules', icon: PlugZap,  desc: 'Notice generation thresholds' },
  { key: 'notifications', label: 'Notification Sounds', icon: Music2,   desc: 'Sound library & your preference' },
  { key: 'import_data',   label: 'Import Data',         icon: Upload,   desc: 'Bulk import from file' },
]

const TAB_DESCRIPTIONS: Record<TabKey, string> = {
  penalty:        'Percentage applied to overdue balances when penalties are assessed.',
  meter_price:    'Unit price per cubic meter and fixed monthly amount applied to billing.',
  disconnection:  'Thresholds used when generating disconnection notices.',
  notifications:  'Manage the shared sound library and your own alert preference.',
  import_data:    'Bulk import records from a file into the system.',
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('penalty')
  const [dirtyByTab, setDirtyByTab] = useState<Record<TabKey, boolean>>({
    penalty: false, meter_price: false, disconnection: false,
    notifications: false, import_data: false,
  })

  const penaltyRef  = useRef<SettingsTabHandle>(null)
  const meterRef    = useRef<SettingsTabHandle>(null)
  const discRef     = useRef<SettingsTabHandle>(null)
  const notifRef    = useRef<SettingsTabHandle>(null)

  const tabRefs: Partial<Record<TabKey, React.RefObject<SettingsTabHandle | null>>> = {
    penalty: penaltyRef,
    meter_price: meterRef,
    disconnection: discRef,
    notifications: notifRef,
  }

  function setDirty(tab: TabKey, dirty: boolean) {
    setDirtyByTab((p) => (p[tab] === dirty ? p : { ...p, [tab]: dirty }))
  }

  // Cancels any open edit on the tab being left, then switches.
  function handleTabChange(next: TabKey) {
    if (activeTab === next) return
    tabRefs[activeTab]?.current?.cancelEdit()
    setActiveTab(next)
  }

  const activeMeta = TABS.find((t) => t.key === activeTab)!

  return (
    <div className="w-full space-y-5 sm:space-y-6">

      <PageHeading
        title="System Settings"
        description="Configuration values that affect all future billing and disconnection calculations."
      />

      {/* Tabs layout */}
      <div className="flex flex-col lg:flex-row gap-4 sm:gap-5 items-start">

        {/* Left tab rail — desktop/tablet */}
        <aside className="hidden lg:flex flex-col w-full lg:w-[240px] flex-shrink-0 bg-white border border-slate-200 rounded-md overflow-hidden select-none">
          <div className="px-3 pt-3 pb-2">
            <p className="text-[9px] font-extrabold uppercase tracking-[1.6px] text-slate-400 px-1">
              Configuration
            </p>
          </div>
          <ul className="px-1.5 pb-2">
            {TABS.map((tab) => {
              const active = activeTab === tab.key
              const dirty = dirtyByTab[tab.key]

              return (
                <li key={tab.key} className="my-0.5">
                  <button
                    onClick={() => handleTabChange(tab.key)}
                    className={cn(
                      'w-full flex items-center gap-2.5 rounded-md border px-3 py-2.5 transition-colors text-left',
                      active
                        ? 'bg-violet-600 border-violet-600 text-white'
                        : 'border-transparent text-slate-600 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700'
                    )}
                  >
                    <div className={cn(
                      'h-7 w-7 rounded-md flex items-center justify-center shrink-0',
                      active ? 'bg-white/20' : 'bg-slate-100'
                    )}>
                      <tab.icon className={cn('h-3.5 w-3.5', active ? 'text-white' : 'text-slate-500')} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-[12.5px] font-semibold truncate', active && 'text-white')}>
                        {tab.label}
                      </p>
                      <p className={cn('text-[10px] truncate', active ? 'text-violet-100' : 'text-slate-400')}>
                        {tab.desc}
                      </p>
                    </div>
                    {dirty && (
                      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', active ? 'bg-white' : 'bg-amber-500')} />
                    )}
                    <ChevronRight className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-white/70' : 'text-slate-300')} />
                  </button>
                </li>
              )
            })}
          </ul>
        </aside>

        {/* Tab rail — mobile/tablet: clean segmented/grouped control */}
        <div className="flex lg:hidden w-full">
          <div className="grid grid-cols-3 sm:grid-cols-5 w-full rounded-md border border-slate-200 bg-white overflow-hidden divide-x divide-y sm:divide-y-0 divide-slate-200">
            {TABS.map((tab) => {
              const active = activeTab === tab.key
              const dirty = dirtyByTab[tab.key]
              return (
                <button
                  key={tab.key}
                  onClick={() => handleTabChange(tab.key)}
                  className={cn(
                    'relative flex flex-col items-center justify-center gap-1 px-2 py-2.5 text-[10.5px] font-semibold transition-colors',
                    active
                      ? 'bg-violet-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-violet-50 hover:text-violet-700'
                  )}
                >
                  <tab.icon className={cn('h-4 w-4', active ? 'text-white' : 'text-slate-500')} />
                  <span className="truncate max-w-full leading-tight text-center">{tab.label}</span>
                  {dirty && (
                    <span className={cn('absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full', active ? 'bg-white' : 'bg-amber-500')} />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Right content panel */}
        <div className="flex-1 min-w-0 w-full bg-white border border-slate-200 rounded-md">
          <div className="border-b border-slate-100 px-4 sm:px-5 py-4 flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-md bg-violet-50 flex items-center justify-center ring-1 ring-violet-100 shrink-0">
                <activeMeta.icon className="h-4 w-4 text-violet-600" />
              </div>
              <div className="min-w-0">
                <h2 className="text-[13px] font-bold text-slate-900">{activeMeta.label}</h2>
                <p className="text-[11px] text-slate-500 mt-0.5">{TAB_DESCRIPTIONS[activeTab]}</p>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-5">
            {/* Each tab manages its own fetch/save/confirm state. `key` on the
               active branch keeps things simple — inactive tabs unmount, so
               only one network fetch per tab happens per visit. Switch to
               always-mounted + `hidden` if you'd rather keep tab state warm. */}
            {activeTab === 'penalty' && (
              <PenaltyRateTab ref={penaltyRef} onDirtyChange={(d) => setDirty('penalty', d)} />
            )}
            {activeTab === 'meter_price' && (
              <MeterPriceTab ref={meterRef} onDirtyChange={(d) => setDirty('meter_price', d)} />
            )}
            {activeTab === 'disconnection' && (
              <DisconnectionRulesTab ref={discRef} onDirtyChange={(d) => setDirty('disconnection', d)} />
            )}
            {activeTab === 'notifications' && (
              <NotificationSoundsTab ref={notifRef} onDirtyChange={(d) => setDirty('notifications', d)} />
            )}
            {activeTab === 'import_data' && <ImportDataTab />}
          </div>
        </div>
      </div>
    </div>
  )
}