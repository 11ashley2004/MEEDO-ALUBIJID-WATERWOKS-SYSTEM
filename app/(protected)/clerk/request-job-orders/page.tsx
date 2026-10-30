'use client'
import { PageHeading } from '@/components/shared-ui/page-heading'

import { useState } from 'react'
import { Wrench, PowerOff, Zap } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import InstallationList from '@/components/admin-ui/installation/installation-list'
import DisconnectionsList from '@/components/admin-ui/disconnections/DisconnectionsList'
import ReconnectionsList from '@/components/admin-ui/reconnections/ReconnectionsList'

const TABS = [
  {
    value: 'installations',
    label: 'Installations',
    icon: Wrench,
    description: 'Review and process new installation requests submitted by consumers.',
  },
  {
    value: 'disconnections',
    label: 'Disconnections',
    icon: PowerOff,
    description: 'Manage pending and completed service disconnection requests.',
  },
  {
    value: 'reconnections',
    label: 'Reconnections',
    icon: Zap,
    description: 'Track and approve requests to reconnect previously disconnected services.',
  },
] as const

export default function JobOrderRequestsPage() {
  const [tab, setTab] = useState<string>('installations')

  return (
    <div className="w-full space-y-5 lg:mb-0 mb-15">
      <PageHeading title="Request Job Orders" description="Manage installation, disconnection, and reconnection requests in one place" />
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

        {TABS.map(({ value, label, description }) => (
          <TabsContent key={value} value={value} className="mt-5 focus-visible:outline-none">
            <Card className="!border-violet-100 rounded-md">
              <CardHeader>
                <CardTitle className="!text-violet-900">{label}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
              <CardContent>
                {value === 'installations' && <InstallationList />}
                {value === 'disconnections' && <DisconnectionsList />}
                {value === 'reconnections' && <ReconnectionsList />}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}