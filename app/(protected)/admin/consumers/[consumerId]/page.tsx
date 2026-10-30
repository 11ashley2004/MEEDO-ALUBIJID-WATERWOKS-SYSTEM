'use client'

import { PageHeading } from '@/components/shared-ui/page-heading'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Edit, FileText, Gauge, MapPin, Building2,
  CalendarDays, Phone, Mail, Power, ArrowRightLeft, Replace, Wrench,
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { getConsumerById, toggleConsumerStatus, type Consumer } from '@/lib/actions/consumer/consumer.actions'
import { getMeterAccountsByConsumer, type MeterAccount } from '@/lib/actions/meter-account/meter-accounts'
import EditConsumerForm from '@/components/admin-ui/consumers/update.consumer.form'
import { ToggleStatusDialog } from '@/components/admin-ui/consumers/consumer-status-modal'
import { MeterInstallmentModal } from '@/components/admin-ui/meter-installment/meter-installment-modal'
import TransferMeterAccountModal from '@/components/admin-ui/meter-transfer/transfer-connection-modal'
import { getMeterInstallmentByMeterAccount } from '@/lib/actions/meter-installment/meter-installment.actions'

// ─── Shared style tokens ───────────────────────────────────────────────────────
const PANEL = 'bg-white border border-slate-200 rounded-md'
const BUTTON_OUTLINE = 'border border-slate-200 text-slate-500 hover:text-violet-600 hover:bg-violet-50 hover:border-violet-200 rounded-md'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = (d: string) => format(new Date(d), 'MMM dd, yyyy')
const formatPeso = (n: number | null) =>
  n !== null && n !== undefined
    ? `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
    : '—'

function getInitials(accountName: string) {
  const parts = accountName.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  if (parts.length === 2) return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase()
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase()
}

type StatusConfig = {
  label: string
  dotClass: string
  badgeBg: string
  badgeText: string
  badgeBorder: string
  iconBg: string
  iconBorder: string
  iconColor: string
}

function getStatusConfig(status: string): StatusConfig {
  const s = status.toLowerCase().trim()

  if (s === 'active')
    return {
      label: 'Active',
      dotClass: 'bg-emerald-500',
      badgeBg: 'bg-emerald-50',
      badgeText: 'text-emerald-700',
      badgeBorder: 'border-emerald-300',
      iconBg: 'bg-emerald-50',
      iconBorder: 'border-emerald-200',
      iconColor: 'text-emerald-600',
    }

  if (s === 'pending')
    return {
      label: 'Pending',
      dotClass: 'bg-amber-400',
      badgeBg: 'bg-amber-50',
      badgeText: 'text-amber-700',
      badgeBorder: 'border-amber-300',
      iconBg: 'bg-amber-50',
      iconBorder: 'border-amber-200',
      iconColor: 'text-amber-600',
    }

  if (s === 'defective')
    return {
      label: 'Defective',
      dotClass: 'bg-orange-400',
      badgeBg: 'bg-orange-50',
      badgeText: 'text-orange-700',
      badgeBorder: 'border-orange-300',
      iconBg: 'bg-orange-50',
      iconBorder: 'border-orange-200',
      iconColor: 'text-orange-600',
    }

  if (s === 'inactive')
    return {
      label: 'Inactive',
      dotClass: 'bg-slate-400',
      badgeBg: 'bg-slate-50',
      badgeText: 'text-slate-700',
      badgeBorder: 'border-slate-300',
      iconBg: 'bg-slate-50',
      iconBorder: 'border-slate-200',
      iconColor: 'text-slate-500',
    }

  if (s === 'disconnected' || s === 'disconnected')
    return {
      label: 'Disconnected',
      dotClass: 'bg-red-400',
      badgeBg: 'bg-red-50',
      badgeText: 'text-red-700',
      badgeBorder: 'border-red-300',
      iconBg: 'bg-red-50',
      iconBorder: 'border-red-200',
      iconColor: 'text-red-500',
    }

  if (s === 'removed')
    return {
      label: 'Removed',
      dotClass: 'bg-slate-400',
      badgeBg: 'bg-slate-50',
      badgeText: 'text-slate-700',
      badgeBorder: 'border-slate-300',
      iconBg: 'bg-slate-50',
      iconBorder: 'border-slate-200',
      iconColor: 'text-slate-500',
    }

  if (s === 'replacing')
    return {
      label: 'Replacing',
      dotClass: 'bg-blue-400',
      badgeBg: 'bg-blue-50',
      badgeText: 'text-blue-700',
      badgeBorder: 'border-blue-300',
      iconBg: 'bg-blue-50',
      iconBorder: 'border-blue-200',
      iconColor: 'text-blue-600',
    }

  if (s === 'stolen')
    return {
      label: 'Stolen',
      dotClass: 'bg-rose-400',
      badgeBg: 'bg-rose-50',
      badgeText: 'text-rose-700',
      badgeBorder: 'border-rose-300',
      iconBg: 'bg-rose-50',
      iconBorder: 'border-rose-200',
      iconColor: 'text-rose-600',
    }

  if (s === 'waterleak_after_meter' || s === 'waterleak after meter')
    return {
      label: 'Water Leak',
      dotClass: 'bg-cyan-400',
      badgeBg: 'bg-cyan-50',
      badgeText: 'text-cyan-700',
      badgeBorder: 'border-cyan-300',
      iconBg: 'bg-cyan-50',
      iconBorder: 'border-cyan-200',
      iconColor: 'text-cyan-600',
    }

  return {
    label: status,
    dotClass: 'bg-slate-300',
    badgeBg: 'bg-slate-50',
    badgeText: 'text-slate-500',
    badgeBorder: 'border-slate-300',
    iconBg: 'bg-slate-50',
    iconBorder: 'border-slate-200',
    iconColor: 'text-slate-400',
  }
}

// ─── Tiny shared primitives ─────────────────────────────────────────────────────

function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('text-[10px] font-bold uppercase tracking-widest text-slate-400', className)}>
      {children}
    </p>
  )
}

function IconTile({
  icon,
  className,
}: {
  icon: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('rounded-md flex items-center justify-center border shrink-0', className)}>
      {icon}
    </div>
  )
}

function StatusBadge({ config }: { config: StatusConfig }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-bold border',
      config.badgeBg, config.badgeText, config.badgeBorder,
    )}>
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', config.dotClass)} />
      {config.label}
    </span>
  )
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="py-16 text-center">
      <IconTile icon={icon} className="h-12 w-12 bg-slate-100 border-slate-200 mx-auto mb-3" />
      <p className="text-sm font-semibold text-slate-600">{title}</p>
      <p className="text-xs text-slate-400 mt-1">{description}</p>
    </div>
  )
}

// ─── Stat Card (bento tile) ──────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  valueClass,
  iconClass,
  feature = false,
}: {
  label: string
  value: number
  icon: React.ReactNode
  valueClass?: string
  iconClass?: string
  feature?: boolean
}) {
  return (
    <div className={cn(PANEL, 'h-full p-4 flex flex-col justify-between')}>
      <div className="flex items-start justify-between">
        <Eyebrow>{label}</Eyebrow>
        <IconTile icon={icon} className={cn('h-8 w-8', iconClass)} />
      </div>
      <p className={cn(feature ? 'text-4xl sm:text-5xl' : 'text-3xl', 'font-bold mt-3', valueClass ?? 'text-slate-800')}>
        {value}
      </p>
    </div>
  )
}

// ─── Info Row ─────────────────────────────────────────────────────────────────

function InfoRow({
  icon,
  children,
}: {
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-slate-400 shrink-0">{icon}</span>
      <span className="text-[12.5px] text-slate-600 leading-snug">{children}</span>
    </div>
  )
}

// ─── Meter Account Card ──────────────────────────────────────────────────────────

const METER_DATA_CELLS = (ma: MeterAccount) => [
  {
    label: 'Meter Serial',
    value: ma.meter_serial_no,
    fallback: 'Not assigned',
    mono: true,
  },
  {
    label: 'Connection Fee',
    value: formatPeso(ma.total_connection_fee),
    mono: false,
  },
  {
    label: 'Since',
    value: formatDate(ma.created_at),
    mono: false,
  },
]

function MeterAccountCard({
  meterAccount,
  onViewDetails,
  onTransferSuccess,
}: {
  meterAccount: MeterAccount
  onViewDetails: (id: string) => void
  onTransferSuccess: () => void
}) {
  const [installmentModalOpen, setInstallmentModalOpen] = useState(false)
  const [installmentData, setInstallmentData] = useState<{
    hasActive: boolean
    remainingBalance: number
    monthsRemaining: number
  } | null>(null)
  const [checkingInstallment, setCheckingInstallment] = useState(false)

  const status = getStatusConfig(meterAccount.meter_status_name || 'Pending')
  const isPending = meterAccount.meter_status_name?.toLowerCase().trim() === 'pending'
  const isActive = meterAccount.meter_status_name?.toLowerCase().trim() === 'active'

  const checkActiveInstallment = useCallback(async () => {
    if (!meterAccount.meter_account_id) return
    setCheckingInstallment(true)
    try {
      const res = await getMeterInstallmentByMeterAccount(meterAccount.meter_account_id)
      if (res.status === 'success' && res.data && res.data.status_code === 'ACTIVE') {
        setInstallmentData({
          hasActive: true,
          remainingBalance: res.data.remaining_balance,
          monthsRemaining: res.data.months_remaining,
        })
      } else {
        setInstallmentData(null)
      }
    } catch {
      setInstallmentData(null)
    } finally {
      setCheckingInstallment(false)
    }
  }, [meterAccount.meter_account_id])

  useEffect(() => {
    checkActiveInstallment()
  }, [checkActiveInstallment])

  const hasActiveInstallment = installmentData?.hasActive ?? false

  return (
    <>
      <div className={cn(PANEL, 'overflow-hidden hover:border-slate-300 transition-colors duration-150')}>

        {/* Header row */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <IconTile
              icon={<Gauge className={cn('h-5 w-5', status.iconColor)} />}
              className={cn('h-10 w-10', status.iconBg, status.iconBorder)}
            />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[13.5px] font-bold text-slate-800 font-mono tracking-tight">
                  {meterAccount.meter_serial_no || '—'}
                </span>
                <StatusBadge config={status} />
              </div>

              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                  <Building2 className="h-3 w-3" />
                  {meterAccount.classification_name}
                </span>
                <span className="text-slate-300 font-bold">·</span>
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                  <MapPin className="h-3 w-3" />
                  Zone {meterAccount.zone_name}, {meterAccount.barangay_name}
                </span>
              </div>
            </div>
          </div>

          {!checkingInstallment ? (
            <div className="flex items-center gap-1.5 flex-wrap sm:shrink-0 sm:ml-auto">
              {hasActiveInstallment && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setInstallmentModalOpen(true)}
                  className="h-8 text-[11px] gap-1.5 border border-violet-200 text-violet-700 bg-violet-50 hover:bg-violet-100 hover:border-violet-300 rounded-md"
                >
                  <Wrench className="h-3.5 w-3.5" />
                  Installment
                </Button>
              )}

              {/* Transfer only makes sense once the meter is Active */}
              {isActive && (
                <TransferMeterAccountModal
                  meterAccountId={meterAccount.meter_account_id}
                  onSuccess={onTransferSuccess}
                >
                  <Button variant="ghost" size="sm" className={cn('h-8 text-[11px] gap-1.5', BUTTON_OUTLINE)}>
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    Transfer
                  </Button>
                </TransferMeterAccountModal>
              )}

              {/* Details (billing history) only applies once the meter is Active */}
              {isActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onViewDetails(meterAccount.meter_account_id)}
                  className={cn('h-8 text-[11px] gap-1.5', BUTTON_OUTLINE)}
                >
                  <FileText className="h-3.5 w-3.5" />
                  Details
                </Button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap sm:shrink-0 sm:ml-auto">
              <Skeleton className="h-8 w-[92px] rounded-md" />
              <Skeleton className="h-8 w-[80px] rounded-md" />
            </div>
          )}
        </div>

        {/* Data grid — 3 cols on mobile, 3 from sm up */}
        <div className="grid grid-cols-3 divide-x divide-y sm:divide-y-0 divide-slate-200 border-t border-slate-200 bg-slate-50">
          {METER_DATA_CELLS(meterAccount).map((cell) => (
            <div key={cell.label} className="px-4 py-3">
              <Eyebrow className="mb-1.5 tracking-widest">{cell.label}</Eyebrow>
              {cell.value ? (
                <p className={cn('text-[12.5px] font-semibold text-slate-700', cell.mono && 'font-mono text-emerald-600')}>
                  {cell.value}
                </p>
              ) : (
                <p className="text-[12px] text-slate-300 italic font-normal">{cell.fallback}</p>
              )}
            </div>
          ))}
        </div>

        {/* Installment strip */}
        {!checkingInstallment && hasActiveInstallment && installmentData && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-2.5 border-t border-violet-100 bg-violet-50/60">
            <div className="flex items-center gap-2 text-[11px] text-violet-700 flex-wrap">
              <Wrench className="h-3.5 w-3.5 shrink-0" />
              <span className="font-medium">Active Installment Plan</span>
              <span className="text-violet-400">·</span>
              <span>
                {formatPeso(installmentData.remainingBalance)} remaining
                &nbsp;·&nbsp;
                {installmentData.monthsRemaining} month{installmentData.monthsRemaining !== 1 ? 's' : ''} left
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setInstallmentModalOpen(true)}
              className="h-7 text-[10px] text-violet-600 hover:bg-violet-100 border border-violet-200 rounded-md gap-1 self-start sm:self-auto"
            >
              <Wrench className="h-3 w-3" />
              View plan
            </Button>
          </div>
        )}
      </div>

      <MeterInstallmentModal
        open={installmentModalOpen}
        meterAccountId={meterAccount.meter_account_id}
        meterSerialNo={meterAccount.meter_serial_no ?? ''}
        onClose={() => setInstallmentModalOpen(false)}
      />
    </>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function ConsumerSidebar({
  consumer,
  accountName,
  onEdit,
  onToggleStatus,
}: {
  consumer: Consumer
  accountName: string
  onEdit: () => void
  onToggleStatus: () => void
}) {
  const initials = getInitials(accountName)

  return (
    <aside className={cn(PANEL, 'flex flex-col w-full lg:w-[260px] shrink-0 overflow-hidden')}>

      {/* Avatar + identity */}
      <div className="flex flex-col items-center text-center px-5 py-6">
        <IconTile
          icon={<span className="text-xl font-bold text-violet-600">{initials}</span>}
          className="h-16 w-16 bg-violet-100 border-violet-200 mb-3"
        />
        <h2 className="text-[14px] font-bold text-slate-800 leading-snug">{accountName}</h2>
        <p className="text-[11px] font-mono text-slate-500 mt-1">{consumer.contract_no}</p>
        <span className={cn(
          'inline-flex items-center gap-1.5 mt-2.5 px-3 py-1 rounded-md text-[10px] font-bold border',
          consumer.is_active
            ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
            : 'bg-slate-100 text-slate-500 border-slate-300',
        )}>
          <span className={cn('h-1.5 w-1.5 rounded-full', consumer.is_active ? 'bg-emerald-500' : 'bg-slate-400')} />
          {consumer.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>

      <div className="h-px bg-slate-200" />

      {/* Contact info */}
      <div className="px-4 py-4 space-y-3">
        <Eyebrow>Contact</Eyebrow>
        {consumer.contact_number
          ? <InfoRow icon={<Phone className="h-3.5 w-3.5" />}>{consumer.contact_number}</InfoRow>
          : <InfoRow icon={<Phone className="h-3.5 w-3.5" />}><span className="text-slate-300 italic">No number on file</span></InfoRow>
        }
        {consumer.email
          ? <InfoRow icon={<Mail className="h-3.5 w-3.5" />}>{consumer.email}</InfoRow>
          : <InfoRow icon={<Mail className="h-3.5 w-3.5" />}><span className="text-slate-300 italic">No email on file</span></InfoRow>
        }
        <InfoRow icon={<CalendarDays className="h-3.5 w-3.5" />}>
          Registered {formatDate(consumer.created_at)}
        </InfoRow>
      </div>

      <div className="h-px bg-slate-200" />

      {/* Actions */}
      <div className="px-4 py-3 space-y-1.5">
        <Eyebrow className="mb-2">Actions</Eyebrow>
        <EditConsumerForm consumer={consumer} onSuccess={onEdit}>
          <button className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-[12px] font-medium text-slate-600 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 transition-colors bg-white">
            <Edit className="h-3.5 w-3.5 text-slate-400" />
            Edit profile
          </button>
        </EditConsumerForm>
        <button
          onClick={onToggleStatus}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-[12px] font-medium text-rose-600 hover:bg-rose-50 border border-rose-200 hover:border-rose-300 transition-colors bg-white"
        >
          <Power className="h-3.5 w-3.5" />
          {consumer.is_active ? 'Deactivate account' : 'Activate account'}
        </button>
      </div>

      <div className="pb-3" />
    </aside>
  )
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="w-full space-y-5">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-6 w-40 rounded-md" />
      </div>
      <div className="flex flex-col lg:flex-row gap-4">
        <Skeleton className="h-[380px] w-full lg:w-[260px] rounded-md shrink-0" />
        <div className="flex-1 space-y-3 w-full min-w-0">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Skeleton className="h-[168px] rounded-md col-span-2" />
            <Skeleton className="h-20 rounded-md" />
            <Skeleton className="h-20 rounded-md" />
          </div>
          <Skeleton className="h-[200px] rounded-md" />
          <Skeleton className="h-[200px] rounded-md" />
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ConsumerDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const consumerId = params?.consumerId as string

  const [consumer, setConsumer] = useState<Consumer | null>(null)
  const [meterAccounts, setMeterAccounts] = useState<MeterAccount[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [toggleDialogOpen, setToggleDialogOpen] = useState(false)

  const fetchData = useCallback(async () => {
    if (!consumerId) return
    setIsLoading(true)
    try {
      const [consumerData, meterAccountsData] = await Promise.all([
        getConsumerById(consumerId),
        getMeterAccountsByConsumer(consumerId),
      ])
      setConsumer(consumerData)
      setMeterAccounts(meterAccountsData)
    } catch {
      toast.error('Failed to load consumer data')
    } finally {
      setIsLoading(false)
    }
  }, [consumerId])

  useEffect(() => { fetchData() }, [fetchData])

  const handleViewMeterAccountDetails = (accountId: string) => {
    router.push(`/admin/consumers/meter-account/${accountId}`)
  }

  const handleToggleStatus = async (id: string) => {
    if (!consumer) return
    try {
      const res = await toggleConsumerStatus(id, consumer.is_active)
      if (res.status === 'success') {
        toast.success(`Consumer ${consumer.is_active ? 'deactivated' : 'activated'}`)
        fetchData()
        setToggleDialogOpen(false)
      } else {
        toast.error(res.message ?? 'Failed to update status')
      }
    } catch {
      toast.error('Something went wrong')
    }
  }

  if (isLoading) return <LoadingSkeleton />

  if (!consumer) {
    return (
      <div className="w-full py-16 text-center">
        <p className="text-slate-500 text-sm">Consumer not found.</p>
        <Button variant="outline" size="sm" className="mt-4 rounded-md" onClick={() => router.back()}>
          Go back
        </Button>
      </div>
    )
  }

  const accountName = consumer.account_name
  const totalMeterAccounts = meterAccounts.length
  const activeMeterAccounts = meterAccounts.filter(
    (c) => c.meter_status_name?.toLowerCase().trim() === 'active',
  ).length
  const disconnectedMeterAccounts = meterAccounts.filter((c) => {
    const s = c.meter_status_name?.toLowerCase().trim() ?? ''
    return s === 'disconnected' || s === 'disconnected '
  }).length

  return (
    <>
      <ToggleStatusDialog
        consumerId={consumer.consumer_id}
        open={toggleDialogOpen}
        onOpenChange={setToggleDialogOpen}
        onConfirm={handleToggleStatus}
      />

      <div className="w-full space-y-5">
        <PageHeading title="Consumer profile" description="View and manage consumer information" />

        {/* Page header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-md border border-slate-200 hover:bg-slate-50"
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </div>

        {/* Sidebar stacks above content below the lg breakpoint */}
        <div className="flex flex-col lg:flex-row gap-4 items-start">

          <ConsumerSidebar
            consumer={consumer}
            accountName={accountName}
            onEdit={fetchData}
            onToggleStatus={() => setToggleDialogOpen(true)}
          />

          <div className="flex-1 min-w-0 w-full space-y-3">

            {/* Bento stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="col-span-2">
                <StatCard
                  feature
                  label="Total meter accounts"
                  value={totalMeterAccounts}
                  icon={<Gauge className="h-4 w-4" />}
                  iconClass="bg-violet-50 border-violet-200 text-violet-600"
                />
              </div>
              <div className="col-span-2 grid grid-cols-2 md:grid-cols-1 md:grid-rows-2 gap-3">
                <StatCard
                  label="Active"
                  value={activeMeterAccounts}
                  valueClass="text-emerald-600"
                  icon={<Power className="h-4 w-4" />}
                  iconClass="bg-emerald-50 border-emerald-200 text-emerald-600"
                />
                <StatCard
                  label="Disconnected"
                  value={disconnectedMeterAccounts}
                  valueClass="text-red-500"
                  icon={<Power className="h-4 w-4" />}
                  iconClass="bg-red-50 border-red-200 text-red-500"
                />
              </div>
            </div>

            {/* Meter accounts panel */}
            <div className={cn(PANEL, 'overflow-hidden')}>
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50">
                <Gauge className="h-4 w-4 text-violet-600" />
                <h3 className="text-[12.5px] font-bold text-slate-800">Meter Accounts</h3>
                {totalMeterAccounts > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] px-1.5 rounded-md text-[10px] font-bold bg-violet-100 text-violet-700">
                    {totalMeterAccounts}
                  </span>
                )}
              </div>

              <div className="p-4 space-y-3">
                {meterAccounts.length === 0 ? (
                  <EmptyState
                    icon={<Gauge className="h-6 w-6 text-slate-300" />}
                    title="No meter accounts"
                    description="This consumer doesn't have any meter accounts yet."
                  />
                ) : (
                  meterAccounts.map((ma) => (
                    <MeterAccountCard
                      key={ma.meter_account_id}
                      meterAccount={ma}
                      onViewDetails={handleViewMeterAccountDetails}
                      onTransferSuccess={fetchData}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}