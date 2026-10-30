'use client'
import { PageHeading } from '@/components/shared-ui/page-heading'

import { useState } from 'react'
import { FileText, Receipt } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import MeterREadingAdjustmentPage from '@/components/admin-ui/reading-adjustment/reading-adjustment-requests-page'
import PaymentAdjustmentBillingPage from '@/components/admin-ui/payment-adjustment/payment-adjustment-billing-page'

const TABS = [
  {
    value: 'reading',
    label: 'Adjustment Reading',
    icon: FileText,
  },
  {
    value: 'billing',
    label: 'Adjustment Billing',
    icon: Receipt,
  },
] as const

export default function PaymentAdjustmentsPage() {
  const [tab, setTab] = useState<string>('reading')

  return (
    <div className="w-full space-y-5">

      {/* Page header */}
      <PageHeading title="Manage Adjustment" description="Manage meter reading and billing adjustment requests" />
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

        <TabsContent value="reading" className="mt-5 focus-visible:outline-none">
          <MeterREadingAdjustmentPage />
        </TabsContent>

        <TabsContent value="billing" className="mt-5 focus-visible:outline-none">
          <PaymentAdjustmentBillingPage />
        </TabsContent>
      </Tabs>
    </div>
  )
}