'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { FileText } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'
import { getAllBillingsForPrint, getBillingById, type BillingRecord } from '@/lib/actions/billing/billing.actions'
import { generateWaterBillsPDF } from './WaterBillDocument'
import { cn } from '@/lib/utils'

interface BillingPdfExportButtonProps {
  billingId?: string
  label?: string
  variant?: 'default' | 'outline' | 'dropdown-item'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  className?: string
}

export function BillingPdfExportButton({
  billingId,
  label = 'Export PDF',
  variant = 'outline',
  size = 'sm',
  className,
}: BillingPdfExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false)

  const getButtonClassName = () =>
    cn(
      'h-9 rounded-lg text-[13px] font-semibold gap-2 px-4 transition-all',
      variant === 'outline'
        ? 'bg-white border-2 border-violet-200 text-violet-700 hover:border-violet-400 hover:bg-violet-50'
        : 'bg-violet-600 hover:bg-violet-700 text-white',
      className
    )

  const handleExport = async () => {
    setIsExporting(true)
    try {
      let records: BillingRecord[]

      if (billingId) {
        const result = await getBillingById(billingId)
        if (result.status === 'error' || !result.data) {
          toast.error(result.message || 'Failed to load billing record')
          return
        }
        records = [result.data]
      } else {
        const result = await getAllBillingsForPrint()
        if (result.status === 'error' || !result.data) {
          toast.error(result.message || 'Failed to load billing records')
          return
        }
        records = result.data
      }

      if (records.length === 0) {
        toast.error('No billing records found')
        return
      }

      generateWaterBillsPDF(records)
      toast.success('PDF file downloaded')
    } catch (err) {
      console.error('PDF export error:', err)
      toast.error('Failed to export PDF file')
    } finally {
      setIsExporting(false)
    }
  }

  if (variant === 'dropdown-item') {
    return (
      <DropdownMenuItem
        onClick={handleExport}
        disabled={isExporting}
        className="text-xs cursor-pointer rounded-md focus:bg-violet-50 focus:text-violet-700 dark:focus:bg-accent dark:focus:text-accent-foreground gap-2"
      >
        {isExporting
          ? <Spinner />
          : <FileText className="h-3.5 w-3.5" />}
        {label}
      </DropdownMenuItem>
    )
  }

  return (
    <Button
      variant={variant === 'outline' ? 'outline' : 'default'}
      size={size}
      onClick={handleExport}
      disabled={isExporting}
      className={getButtonClassName()}
    >
      {isExporting ? (
        <Spinner />
      ) : (
        <FileText className="h-3.5 w-3.5" />
      )}
      {label}
    </Button>
  )
}