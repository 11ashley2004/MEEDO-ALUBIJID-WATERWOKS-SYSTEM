'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { FileText } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { toast } from 'sonner'
import html2canvas from 'html2canvas-pro'
import jsPDF from 'jspdf'
import {
  getNoticeWithConnectionsById,
  getNoticeConnectionBillingDetails,
} from '@/lib/actions/disconnection-notice/disconnection-notice.actions'

interface PdfExportButtonProps {
  noticeId: string
  variant?: 'button' | 'dropdown-item'
}

// ─── Config ───────────────────────────────────────────────────────────────────
// Same physical page as the print view: A4 portrait, two half-page notices per sheet.

const PAGE_W_MM = 210
const PAGE_H_MM = 297

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPesoPlain(n: number): string {
  return new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

// ─── Single-notice markup (mirrors PrintNoticesButton's buildSingleNoticeHTML) ─

function buildSingleNoticeHTML(conn: any, billing: any): string {
  // Current Bill = current_billing from the specific billing record
  const currentBill = billing.current_billing ?? 0

  // Overdue Account = previous_balance from the specific billing record (unpaid from previous period)
  const overdueAccount = billing.previous_balance ?? 0

  // Penalty = penalty_amount from the specific billing record
  const penalty = billing.penalty_amount ?? 0

  // Meter charge = meter_charge from the specific billing record
  const meterCharge = billing.meter_charge ?? 0

  // Total Amount = total_billing (this is the total amount including all charges)
  const totalAmount = billing.total_billing ?? (currentBill + overdueAccount + penalty + meterCharge)

  // Account Payables = remaining_balance (total amount still owed)
  const accountPayables = conn.balance_snapshot ?? billing.remaining_balance ?? 0

  return `
    <div class="notice-half">
      <div class="notice-header">
        <div class="org-name">ALUBIJID WATERWORKS SYSTEM</div>
        <div class="org-sub">MUNICIPAL ECONOMIC ENTERPRISE &amp; DEVELOPMENT OFFICE</div>
        <div class="notice-title">Notice &nbsp; of &nbsp; Disconnection</div>
      </div>

      <div class="to-row">
        <div class="to-left">
          <span class="label-to">To</span>
          <span class="colon">:</span>
          <span class="consumer-name">${conn.consumer_name}</span>
        </div>
        <div class="to-right">Zone ${conn.zone_name}, ${conn.barangay_name}, Alubijid, Mis. Or.</div>
      </div>

      <div class="schedule-header">DISCONNECTION SCHEDULE</div>
      <div class="salutation">Sir/Ma'am:</div>

      <div class="body-text">
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Much as we desire to continue serving you, we have no other choice but to disconnect
        your water service if you fail to settle the overdue account within 2 days from receipt of this notice
        or any member of your household.
      </div>

      <div class="notice-line">Please present this notice when making payments at our office.</div>
      <div class="notice-line">Disregard this notice if payment has been made.</div>

      <div class="amounts-section">
        <div class="amount-row">
          <span class="amount-label">Current Bill</span>
          <span class="amount-colon">:</span>
          <span class="amount-value">${formatPesoPlain(currentBill)}</span>
        </div>
        <div class="amount-row">
          <span class="amount-label">Overdue Account</span>
          <span class="amount-colon">:</span>
          <span class="amount-value">${formatPesoPlain(overdueAccount)}</span>
        </div>
        <div class="amount-row">
          <span class="amount-label">Penalty</span>
          <span class="amount-colon">:</span>
          <span class="amount-value">${formatPesoPlain(penalty)}</span>
        </div>
        <div class="amount-row">
          <span class="amount-label">Meter charge</span>
          <span class="amount-colon">:</span>
          <span class="amount-value">${formatPesoPlain(meterCharge)}</span>
        </div>
        <div class="amount-row">
          <span class="amount-label">Total Amount</span>
          <span class="amount-colon">:</span>
          <span class="amount-value">${formatPesoPlain(totalAmount)}</span>
        </div>
        <div class="amount-row">
          <span class="amount-label">Less Payment</span>
          <span class="amount-colon">:</span>
          <span class="amount-value">${formatPesoPlain(0)}</span>
        </div>
        <div class="amount-row">
          <span class="amount-label">Account Payables</span>
          <span class="amount-colon">:</span>
          <span class="amount-value amount-bold">${formatPesoPlain(accountPayables)}</span>
        </div>
      </div>

      <div class="received-row">
        <div class="received-left">
          <span>Received by</span>
          <span class="colon">:</span>
          <span class="underline-blank"></span>
        </div>
        <div class="received-right">
          <div class="dept-head-name">JOSE J. CAMENSI</div>
          <div class="dept-head-title">Department Head</div>
        </div>
      </div>

      <div class="datetime-row">
        <span>Date/Time</span>
        <span class="colon">:</span>
        <span class="underline-blank-long"></span>
      </div>
    </div>
  `
}

// ─── Off-screen page builder (same visual rules as the print stylesheet) ──────

function buildPageElement(topHtml: string, bottomHtml: string): HTMLDivElement {
  const page = document.createElement('div')
  page.innerHTML = `
    <style>
      .pdf-page-inner, .pdf-page-inner * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      .pdf-page-inner {
        font-family: 'Courier New', Courier, monospace; font-size: 10px; color: #000; background: #fff;
        width: 210mm; height: 297mm; display: flex; flex-direction: column; overflow: hidden;
      }
      .pdf-page-inner .notice-half { width: 100%; height: 148.5mm; padding: 8mm 14mm 6mm 14mm; border-bottom: 1px dashed #999; overflow: hidden; position: relative; flex-shrink: 0; }
      .pdf-page-inner .notice-half:last-child { border-bottom: none; }
      .pdf-page-inner .notice-header { text-align: center; margin-bottom: 4px; }
      .pdf-page-inner .org-name { font-size: 13px; font-weight: 900; letter-spacing: 1px; }
      .pdf-page-inner .org-sub { font-size: 10px; font-weight: 700; margin-top: 1px; }
      .pdf-page-inner .notice-title { font-size: 15px; font-weight: 700; letter-spacing: 6px; margin-top: 6px; margin-bottom: 2px; font-style: italic; }
      .pdf-page-inner .to-row { display: flex; justify-content: space-between; align-items: flex-end; margin: 4px 0 2px; }
      .pdf-page-inner .to-left { display: flex; align-items: center; gap: 5px; }
      .pdf-page-inner .label-to { font-size: 10px; }
      .pdf-page-inner .colon { margin: 0 2px; }
      .pdf-page-inner .consumer-name { font-size: 14px; font-weight: 900; letter-spacing: 0.5px; }
      .pdf-page-inner .to-right { font-size: 9px; font-style: italic; }
      .pdf-page-inner .schedule-header { text-align: center; font-weight: 900; font-size: 11px; letter-spacing: 1px; margin: 3px 0 2px; }
      .pdf-page-inner .salutation { font-size: 10px; margin: 2px 0; }
      .pdf-page-inner .body-text { font-size: 10px; line-height: 1.45; text-align: justify; margin: 3px 0; font-style: italic; }
      .pdf-page-inner .notice-line { text-align: center; font-size: 10px; font-style: italic; line-height: 1.4; }
      .pdf-page-inner .amounts-section { margin: 5px 0 4px; padding-left: 8mm; }
      .pdf-page-inner .amount-row { display: flex; align-items: baseline; margin: 1.5px 0; }
      .pdf-page-inner .amount-label { width: 120px; font-size: 10px; }
      .pdf-page-inner .amount-colon { margin: 0 6px; }
      .pdf-page-inner .amount-value { font-size: 10px; min-width: 70px; text-align: right; }
      .pdf-page-inner .amount-bold { font-weight: 900; font-size: 12px; }
      .pdf-page-inner .received-row { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 6px; }
      .pdf-page-inner .received-left { display: flex; align-items: center; gap: 5px; font-size: 10px; }
      .pdf-page-inner .underline-blank { display: inline-block; width: 110px; border-bottom: 1px solid #000; }
      .pdf-page-inner .underline-blank-long { display: inline-block; width: 150px; border-bottom: 1px solid #000; }
      .pdf-page-inner .received-right { text-align: center; font-size: 10px; }
      .pdf-page-inner .dept-head-name { font-weight: 900; font-size: 11px; letter-spacing: 0.5px; }
      .pdf-page-inner .dept-head-title { font-size: 9px; }
      .pdf-page-inner .datetime-row { display: flex; align-items: center; gap: 5px; font-size: 10px; margin-top: 3px; }
    </style>
    <div class="pdf-page-inner">${topHtml}${bottomHtml}</div>
  `
  return page
}

// ─── Render one off-screen page into the PDF as a full A4 sheet ──────────────

async function renderPageToPdf(pdf: jsPDF, pageEl: HTMLDivElement, isFirstPage: boolean) {
  pageEl.style.position = 'fixed'
  pageEl.style.top = '0'
  pageEl.style.left = '-99999px'
  document.body.appendChild(pageEl)

  try {
    const inner = pageEl.querySelector('.pdf-page-inner') as HTMLElement
    const canvas = await html2canvas(inner, { scale: 2, backgroundColor: '#ffffff' })

    if (!isFirstPage) pdf.addPage('a4', 'portrait')
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, PAGE_W_MM, PAGE_H_MM)
  } finally {
    document.body.removeChild(pageEl)
  }
}

// ─── Public component ─────────────────────────────────────────────────────────

export function PdfExportButton({ noticeId, variant = 'button' }: PdfExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const result = await getNoticeWithConnectionsById(noticeId)
      if (result.status !== 'success' || !result.data) {
        toast.error('Failed to load notice data')
        return
      }

      const { notice, connections } = result.data

      // Same lookup pattern as PrintNoticesButton: billing keyed by notice_meter_account_id
      const noticeMeterAccountIds = connections.map((c: any) => c.notice_meter_account_id)
      const billingResult = await getNoticeConnectionBillingDetails(noticeMeterAccountIds)
      const billingDetails = billingResult.status === 'success' ? (billingResult.data ?? {}) : {}

      if (connections.length === 0) {
        toast.error('No connections to export')
        return
      }

      const halves = connections.map((conn: any) => {
        const billing = billingDetails[conn.meter_account_id] ?? {
          current_billing: 0,
          previous_balance: conn.balance_snapshot ?? 0,
          penalty_amount: 0,
          meter_charge: 0,
          total_billing: conn.balance_snapshot ?? 0,
          remaining_balance: conn.balance_snapshot ?? 0,
        }
        return buildSingleNoticeHTML(conn, billing)
      })

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

      for (let i = 0; i < halves.length; i += 2) {
        const top = halves[i]
        const bottom = halves[i + 1] ?? '<div class="notice-half notice-half--empty"></div>'
        const pageEl = buildPageElement(top, bottom)
        await renderPageToPdf(pdf, pageEl, i === 0)
      }

      pdf.save(`${notice.notice_no}_notices.pdf`)
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
        Export PDF
      </DropdownMenuItem>
    )
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-9 rounded-md gap-2 border-slate-200 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-600"
      onClick={handleExport}
      disabled={isExporting}
    >
      {isExporting ? <Spinner /> : <FileText className="h-4 w-4" />}
      Export PDF
    </Button>
  )
}