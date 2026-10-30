'use client'
import { PageHeading } from '@/components/shared-ui/page-heading'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Tag, TrendingUp } from 'lucide-react'
import ClassificationsPage from '@/components/admin-ui/classifications/classification-page'
import CommunityChargesPage from '@/components/admin-ui/community-charges/community-charges-page'

type Tab = 'classifications' | 'community-charges'

export default function RateManagementPage() {
  const [activeTab, setActiveTab] = useState<Tab>('classifications')

  return (
    <div className="w-full space-y-6">

      {/* Page header */}
      <PageHeading title="Service Rates" description="Manage classifications and consumption rate tiers" />
{/* Tabs */}
      <div className="flex items-center gap-1 bg-violet-50 border border-violet-100 rounded-md p-1 w-fit">
        <button
          onClick={() => setActiveTab('classifications')}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium transition-all duration-150 whitespace-nowrap',
            activeTab === 'classifications'
              ? 'bg-white text-violet-700 border border-violet-100 font-semibold'
              : 'text-slate-500 hover:text-violet-600 hover:bg-white/60',
          )}
        >
          <Tag className="h-3.5 w-3.5" />
          Classifications
        </button>
        <button
          onClick={() => setActiveTab('community-charges')}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium transition-all duration-150 whitespace-nowrap',
            activeTab === 'community-charges'
              ? 'bg-white text-violet-700 border border-violet-100 font-semibold'
              : 'text-slate-500 hover:text-violet-600 hover:bg-white/60',
          )}
        >
          <TrendingUp className="h-3.5 w-3.5" />
          Consumption Rates
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'classifications' && <ClassificationsPage />}
      {activeTab === 'community-charges' && <CommunityChargesPage />}

    </div>
  )
}