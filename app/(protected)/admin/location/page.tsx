'use client'
import { PageHeading } from '@/components/shared-ui/page-heading'

import { useState } from 'react'
import { MapPin, Layers } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import BarangayPage from '@/components/admin-ui/barangay/barangay-page'
import ZonePage from '@/components/admin-ui/zones/zone-page'

const TABS = [
  {
    value: 'barangay',
    label: 'Barangays',
    icon: MapPin,
  },
  {
    value: 'zone',
    label: 'Zones',
    icon: Layers,
  },
] as const

export default function LocationsPage() {
  const [activeTab, setActiveTab] = useState<string>('barangay')

  return (
    <div className="w-full space-y-5">

      {/* Page header */}
      <PageHeading title="Locations" description="Manage barangays and zones" />
<Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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

        <TabsContent value="barangay" className="mt-5 focus-visible:outline-none">
          <BarangayPage />
        </TabsContent>

        <TabsContent value="zone" className="mt-5 focus-visible:outline-none">
          <ZonePage />
        </TabsContent>
      </Tabs>

    </div>
  )
}