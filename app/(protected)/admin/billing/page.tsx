'use client'
import { PageHeading } from '@/components/shared-ui/page-heading'

import { Suspense, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Receipt, Calendar } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import CurrentBillingPage from '@/components/admin-ui/billing/current-billing-page'
import BillingHistoryPage from '@/components/admin-ui/billing-history/billing-history-page'
import { Skeleton } from '@/components/ui/skeleton'

const TABS = [
  {
    value: 'current',
    label: 'Current Billing',
    icon: Receipt,
  },
  {
    value: 'history',
    label: 'Billing History',
    icon: Calendar,
  },
] as const

type BillingTab = (typeof TABS)[number]['value']

function isBillingTab(v: string | null): v is BillingTab {
  return v === 'current' || v === 'history'
}

function BillingPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = useMemo<BillingTab>(() => {
    const q = searchParams.get('tab')
    return isBillingTab(q) ? q : 'current'
  }, [searchParams])

  const setTab = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (next === 'current') params.delete('tab')
      else params.set('tab', next)
      const qs = params.toString()
      router.replace(qs ? `/admin/billing?${qs}` : '/admin/billing', { scroll: false })
    },
    [router, searchParams],
  )

  return (
    <div className="w-full space-y-5">
      <PageHeading title="Billing" description="Manage water billing records and payment history" />
<Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="!h-11 !rounded-md !bg-violet-50 dark:!bg-muted !p-1.5 !gap-1.5 border dark:border-border">
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="!h-8 !rounded-md !text-sm !font-medium !gap-2 !px-4
                         !text-violet-600 dark:data-[state=inactive]:!text-foreground !border-0 !shadow-none
                         hover:!text-violet-800 dark:hover:!text-foreground
                         data-[state=active]:!bg-violet-600
                         data-[state=active]:!text-white
                         data-[state=active]:!shadow-none
                         !transition-all"
            >
              <Icon className="h-4 w-4" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="current" className="mt-5 focus-visible:outline-none">
          <CurrentBillingPage />
        </TabsContent>

        <TabsContent value="history" className="mt-5 focus-visible:outline-none">
          <BillingHistoryPage basePath="/admin" />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default function BillingPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full space-y-5">
          <div className="space-y-2">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-11 w-72 rounded-md" />
          <Skeleton className="h-64 w-full rounded-md" />
        </div>
      }
    >
      <BillingPageInner />
    </Suspense>
  )
}
