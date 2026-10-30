// lib/utils/pdf-export.ts
'use client'

import html2canvas from 'html2canvas-pro'
import jsPDF from 'jspdf'
import { format } from 'date-fns'
import type { TransactionRecord } from '@/lib/actions/payment/transaction.actions'
import {
  ORG_NAME, ORG_ADDRESS, ORG_CONTACT, MONTH_NAMES,
  REPORT_TYPE_OPTIONS, type ReportPaymentType,
} from '@/components/treasurer-ui/transactions/excel-export'

// ─── Config ───────────────────────────────────────────────────────────────────

const PAGE_W_MM = 297 // A4 landscape
const PAGE_H_MM = 210
const MARGIN_MM = 8

const DETAIL_HEADERS = ['Receipt #', 'Type', 'Collector', 'Amount', 'Payment Date', 'Recorded At']

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatPeso = (amount: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(amount)

const formatDate = (dateString: string) => format(new Date(dateString), 'MMM dd, yyyy')
const formatDateTime = (dateString: string) => format(new Date(dateString), 'MMM dd, yyyy h:mm a')

function filterByPaymentType(transactions: TransactionRecord[], paymentType: ReportPaymentType) {
  if (paymentType === 'all') return transactions
  return transactions.filter((t) => t.payment_type_name.toLowerCase() === paymentType)
}

// ─── DOM section builder ────────────────────────────────────────────────────

function buildReportSection(
  inPeriod: TransactionRecord[],
  titlePrefix: string,
  titleSuffix: string,
  grandTotal: number,
): HTMLDivElement {
  const wrap = document.createElement('div')
  wrap.style.cssText = `
    width: 1000px;
    font-family: Arial, Helvetica, sans-serif;
    color: #1e293b;
    background: #ffffff;
    padding: 24px 28px;
  `

  // Letterhead
  const head = document.createElement('div')
  head.style.cssText = 'text-align:center; margin-bottom:12px;'
  head.innerHTML = `
    <div style="font-size:20px; font-weight:700; color:#4C1D95; letter-spacing:0.5px;">${ORG_NAME}</div>
    <div style="font-size:11px; color:#64748B; margin-top:2px;">${ORG_ADDRESS} &middot; ${ORG_CONTACT}</div>
  `
  wrap.appendChild(head)

  // Title band
  const title = document.createElement('div')
  title.style.cssText = `
    background:#7C3AED; color:#fff; font-weight:700; font-size:14px;
    text-align:center; padding:8px 0; border-radius:4px; margin-bottom:14px;
  `
  title.textContent = `${titlePrefix} — ${titleSuffix}`
  wrap.appendChild(title)

  // Section label
  const sectionLabel = document.createElement('div')
  sectionLabel.style.cssText = `
    background:#EDE9FE; color:#4C1D95; font-weight:700; font-size:10.5px;
    padding:6px 8px; margin-bottom:2px;
  `
  sectionLabel.textContent = 'TRANSACTION DETAILS'
  wrap.appendChild(sectionLabel)

  const table = document.createElement('table')
  table.style.cssText = 'width:100%; border-collapse:collapse; font-size:9.5px;'

  const thead = document.createElement('thead')
  const headRow = document.createElement('tr')
  DETAIL_HEADERS.forEach((h) => {
    const th = document.createElement('th')
    th.textContent = h
    th.style.cssText = `
      background:#7C3AED; color:#fff; font-size:9px; font-weight:700;
      padding:6px 4px; border:1px solid #5B21B6; text-align:center;
    `
    headRow.appendChild(th)
  })
  thead.appendChild(headRow)
  table.appendChild(thead)

  const tbody = document.createElement('tbody')

  if (inPeriod.length === 0) {
    const tr = document.createElement('tr')
    const td = document.createElement('td')
    td.colSpan = DETAIL_HEADERS.length
    td.textContent = 'No transactions recorded for this period.'
    td.style.cssText = 'padding:12px 6px; text-align:center; color:#64748B; font-size:10px; border:1px solid #E2E8F0;'
    tr.appendChild(td)
    tbody.appendChild(tr)
  } else {
    inPeriod.forEach((t, i) => {
      const tr = document.createElement('tr')
      tr.style.background = i % 2 === 0 ? '#ffffff' : '#FAFAFF'

      const cells = [
        t.receipt_number,
        t.payment_type_name.replace(/_/g, ' '),
        `${t.collected_by.last_name}, ${t.collected_by.first_name}`,
        formatPeso(t.amount),
        formatDate(t.payment_date),
        formatDateTime(t.created_at),
      ]

      cells.forEach((c, ci) => {
        const td = document.createElement('td')
        td.textContent = c
        const isAmount = ci === 3
        td.style.cssText = `
          padding:5px 4px; border:1px solid #E2E8F0; font-size:9px;
          text-align:${isAmount ? 'right' : 'left'};
          color:${isAmount ? '#047857' : '#334155'};
          ${isAmount ? 'font-weight:600;' : ''}
        `
        tr.appendChild(td)
      })
      tbody.appendChild(tr)
    })
  }
  table.appendChild(tbody)
  wrap.appendChild(table)

  // Totals
  if (inPeriod.length > 0) {
    const totals = document.createElement('div')
    totals.style.cssText = `
      display:flex; justify-content:space-between; align-items:center;
      margin-top:16px; padding-top:10px; border-top:2px solid #7C3AED;
      font-size:12px; font-weight:700; color:#1E293B;
    `
    totals.innerHTML = `
      <span>Total (${inPeriod.length} transaction${inPeriod.length !== 1 ? 's' : ''})</span>
      <span style="color:#047857;">${formatPeso(grandTotal)}</span>
    `
    wrap.appendChild(totals)
  }

  return wrap
}

// ─── Render the off-screen section into the PDF, paginating if it overflows ──

async function renderSectionToPdf(pdf: jsPDF, section: HTMLDivElement) {
  section.style.position = 'fixed'
  section.style.top = '0'
  section.style.left = '-99999px'
  document.body.appendChild(section)

  try {
    const canvas = await html2canvas(section, { scale: 2, backgroundColor: '#ffffff' })

    const usableWidthMm = PAGE_W_MM - MARGIN_MM * 2
    const usableHeightMm = PAGE_H_MM - MARGIN_MM * 2
    const imgWidthMm = usableWidthMm
    const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width
    const pxPerMm = canvas.width / imgWidthMm

    let renderedHeightMm = 0
    let pageIndex = 0

    while (renderedHeightMm < imgHeightMm) {
      if (pageIndex > 0) pdf.addPage('a4', 'landscape')

      const sliceHeightMm = Math.min(usableHeightMm, imgHeightMm - renderedHeightMm)
      const sliceHeightPx = Math.round(sliceHeightMm * pxPerMm)
      const sliceYPx = Math.round(renderedHeightMm * pxPerMm)

      const sliceCanvas = document.createElement('canvas')
      sliceCanvas.width = canvas.width
      sliceCanvas.height = sliceHeightPx
      const ctx = sliceCanvas.getContext('2d')!
      ctx.drawImage(canvas, 0, sliceYPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx)

      pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', MARGIN_MM, MARGIN_MM, imgWidthMm, sliceHeightMm)

      renderedHeightMm += sliceHeightMm
      pageIndex += 1
    }
  } finally {
    document.body.removeChild(section)
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface PeriodReportResult {
  count: number
  total: number
}

/** Generates and downloads a monthly or yearly revenue report as a PDF, optionally scoped to one payment type. */
export async function generatePeriodReportPDF(
  transactions: TransactionRecord[],
  periodType: 'monthly' | 'yearly',
  month: number,
  year: number,
  paymentType: ReportPaymentType = 'all',
): Promise<PeriodReportResult> {
  const byPeriod = transactions.filter((t) => {
    const d = new Date(t.payment_date)
    if (periodType === 'monthly') {
      return d.getFullYear() === year && d.getMonth() === month
    }
    return d.getFullYear() === year
  })
  const inPeriod = filterByPaymentType(byPeriod, paymentType)

  const periodLabel = periodType === 'monthly'
    ? `${MONTH_NAMES[month]} ${year}`
    : `Year ${year}`

  const typeLabel = REPORT_TYPE_OPTIONS.find((o) => o.val === paymentType)?.label ?? 'All Types'

  const grandTotal = inPeriod.reduce((sum, t) => sum + t.amount, 0)

  const titlePrefix = periodType === 'monthly' ? 'MONTHLY REVENUE REPORT' : 'ANNUAL REVENUE REPORT'
  const titleSuffix = paymentType === 'all' ? periodLabel : `${periodLabel} — ${typeLabel}`

  const section = buildReportSection(inPeriod, titlePrefix, titleSuffix, grandTotal)

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  await renderSectionToPdf(pdf, section)

  const periodPart = periodType === 'monthly' ? `Monthly-${MONTH_NAMES[month]}-${year}` : `Annual-${year}`
  const typePart = paymentType === 'all' ? '' : `-${typeLabel.replace(/\s+/g, '')}`
  pdf.save(`MAWW-Report-${periodPart}${typePart}.pdf`)

  return { count: inPeriod.length, total: grandTotal }
}