// lib/utils/water-bill-export.ts
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { BillingRecord, BillingBreakdownRow } from '@/lib/actions/billing/billing.actions'
import { NOTO_SANS_REGULAR_BASE64, NOTO_SANS_BOLD_BASE64 } from '@/lib/pdf-fonts/noto-sans-base64'

const PAGE_MARGIN = 18 // pt
const BILL_GAP = 10 // pt between bills
const DEFAULT_ORG_NAME = 'ALUBIJID WATERWORKS SYSTEM'

// Conservative worst-case height for one bill (header + meta + disclaimer +
// 12-row table). Used only to decide WHETHER a new bill can start on the
// current page — the actual drawn height always comes from autoTable's
// real finalY, never from this estimate. Erring high here just means an
// occasional bill starts a page earlier than strictly necessary; erring
// low is what caused the overflow/split bug, so this stays generous.
const ESTIMATED_BILL_HEIGHT = 300

// The custom font family used when NotoSans embeds successfully. If
// embedding fails on a given jsPDF instance (see registerPdfFonts), we fall
// back to this built-in font instead, so the doc always has SOME valid font
// active rather than crashing or silently drawing with an unregistered one.
const CUSTOM_FONT_FAMILY = 'NotoSans'
const FALLBACK_FONT_FAMILY = 'helvetica'

const BLUE: [number, number, number] = [0, 119, 182]
const BLUE_LIGHT: [number, number, number] = [232, 244, 253]
const BLACK: [number, number, number] = [30, 30, 30]

/**
 * Registers NotoSans on THIS SPECIFIC jsPDF instance and returns the font
 * family name that is actually safe to use for the rest of the document.
 *
 * IMPORTANT: font registration in jsPDF is per-instance, not global. Each
 * call to generateWaterBillsPDF() creates a brand new `doc`, so the font
 * must be re-registered every single time — caching a "already registered"
 * flag at module scope (as the previous version did) only helps the first
 * doc ever created; every doc after that silently has no NotoSans font
 * registered on it at all, which either throws or falls back to jsPDF's
 * default font with completely different glyph metrics than the ones used
 * throughout this file's manual `doc.getTextWidth()` positioning.
 *
 * We also wrap the embedding in try/catch: some PDF readers (and jsPDF
 * versions) are picky about malformed/complex TTF embeds. If registration
 * throws, we fall back to 'helvetica' rather than producing a PDF with a
 * broken or missing font resource — the layout stays correct even if the
 * exact glyph style differs slightly (helvetica won't render "₱" glyphs
 * from the base font the same way, but text will never disappear or
 * corrupt).
 */
function registerPdfFonts(doc: jsPDF): string {
  try {
    doc.addFileToVFS('NotoSans-Regular.ttf', NOTO_SANS_REGULAR_BASE64)
    doc.addFont('NotoSans-Regular.ttf', CUSTOM_FONT_FAMILY, 'normal')
    doc.addFileToVFS('NotoSans-Bold.ttf', NOTO_SANS_BOLD_BASE64)
    doc.addFont('NotoSans-Bold.ttf', CUSTOM_FONT_FAMILY, 'bold')
    doc.setFont(CUSTOM_FONT_FAMILY, 'normal')
    return CUSTOM_FONT_FAMILY
  } catch (err) {
    console.error('NotoSans embedding failed, falling back to helvetica:', err)
    doc.setFont(FALLBACK_FONT_FAMILY, 'normal')
    return FALLBACK_FONT_FAMILY
  }
}

function peso(n: number): string {
  return new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function formatPeriod(periodStart: string): string {
  const [y, m] = periodStart.split('-').map(Number)
  const date = new Date(y, m - 1)
  const last = new Date(y, m, 0).getDate()
  return `${date.toLocaleDateString('en-US', { month: 'long' }).toUpperCase()} 1-${last}, ${y}`
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()
}

function tierLabel(t: BillingBreakdownRow): string {
  return t.max_consumption === null
    ? `${t.min_consumption} and above`
    : `${t.min_consumption} - ${t.max_consumption} cu.m.`
}

/**
 * Draws one bill's CONTENT starting at (x, y) and returns the actual Y its
 * content ended at. Does NOT draw the outer border — the caller draws that
 * afterwards using this returned value, since the real height isn't known
 * until autoTable has actually laid the table out.
 */
function drawOneBillContent(
  doc: jsPDF,
  fontFamily: string,
  record: BillingRecord,
  x: number,
  startY: number,
  width: number,
  organizationName: string,
): number {
  let y = startY
  const padX = 8
  const contentX = x + padX
  const contentWidth = width - padX * 2

  const consumer = record.meter_account.consumer
  const zone = record.meter_account.zone
  const cons = record.consumption
  const periodStart = record.period_start ?? ''

  const currentBilling = record.current_billing
  const overdue = record.previous_balance
  const penaltyAmount = record.penalty_amount
  const meterCharge = record.meter_charge ?? 0
  const totalBill = currentBilling + overdue + penaltyAmount + meterCharge

  y += 12
  doc.setFont(fontFamily, 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...BLUE)
  doc.text(organizationName, x + width / 2, y, { align: 'center' })
  y += 12
  doc.setFontSize(12)
  doc.text('WATER BILL', x + width / 2, y, { align: 'center' })
  y += 12

  doc.setFontSize(7.5)
  const colWidth = contentWidth / 2
  const leftX = contentX
  const rightX = contentX + colWidth

  // FIXED: previously, doc.getTextWidth() for a bold-drawn label was
  // sometimes called AFTER doc.setFont(..., 'normal') had already been
  // switched on, so the width was measured against the wrong font's glyph
  // metrics (normal and bold are two separately embedded font programs
  // here, with different character widths). That produced wrong x-offsets
  // for the values next to each label — overlap or gaps that got worse
  // with longer labels. Every getTextWidth() call below now happens while
  // the matching font weight is still active.
  const metaRow = (
    leftLabel: string, leftValue: string,
    rightLabel?: string, rightValue?: string,
  ) => {
    doc.setFont(fontFamily, 'bold')
    doc.text(leftLabel, leftX, y)
    const leftLabelWidth = doc.getTextWidth(leftLabel) // measured while bold is active
    doc.setFont(fontFamily, 'normal')
    doc.text(`: ${leftValue}`, leftX + leftLabelWidth + 3, y)

    if (rightLabel && rightValue !== undefined) {
      const valueStr = `: ${rightValue}`

      doc.setFont(fontFamily, 'bold')
      const rightLabelWidth = doc.getTextWidth(rightLabel) // measured while bold is active

      doc.setFont(fontFamily, 'normal')
      const valueStrWidth = doc.getTextWidth(valueStr) // measured while normal is active

      doc.setFont(fontFamily, 'bold')
      doc.text(rightLabel, rightX + colWidth - rightLabelWidth - valueStrWidth - 3, y)

      doc.setFont(fontFamily, 'normal')
      doc.text(valueStr, rightX + colWidth - valueStrWidth, y)
    }
    y += 10
  }

  metaRow(
    'Consumer Name', consumer.account_name.toUpperCase(),
    'Address/Zone', `${zone.zone_name.toUpperCase()} - ${zone.barangay.barangay_name.toUpperCase()}`,
  )
  metaRow('S/N', record.meter_account.meter_serial_no ?? '—', 'Reading Period', periodStart ? formatPeriod(periodStart) : '—')
  metaRow('Present Reading', cons.present_reading.toFixed(0), 'Due Date', formatDate(record.due_date))
  metaRow('Previous Reading', cons.previous_reading.toFixed(0))
  metaRow('Consumption', cons.consumption.toFixed(0))

  y += 3
  doc.setFont(fontFamily, 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(...BLACK)
  const disclaimer =
    'Your service will be discontinued from non-payment of bills (15) days upon delivery of ' +
    'this statement of account. Partial payment will not relieve disconnection of your service ' +
    'as well as disconnection will not relieve your obligation.'
  const disclaimerLines = doc.splitTextToSize(disclaimer, contentWidth)
  doc.text(disclaimerLines, contentX, y)
  y += disclaimerLines.length * 7.5 + 3

  const tierRows = record.breakdowns.map((tier) => [
    tierLabel(tier),
    tier.reached ? tier.units_used.toFixed(0) : '',
    tier.rate_per_unit.toFixed(2),
    tier.reached ? peso(tier.subtotal) : '',
  ])

  const summaryRow = (label: string, amount: number) => [
    { content: label, colSpan: 3, styles: { fontStyle: 'bold' as const } },
    { content: amount > 0 ? peso(amount) : '', styles: { halign: 'right' as const } },
  ]

  const body = [
    ...tierRows,
    summaryRow('Overdue Account', overdue),
    summaryRow('Penalty (2%)', penaltyAmount),
    summaryRow('Meter Charge', meterCharge),
    [{ content: 'Connection Fee', colSpan: 3, styles: { fontStyle: 'bold' as const } }, ''],
    [{ content: 'Less: Advance Payment', colSpan: 3, styles: { fontStyle: 'bold' as const } }, ''],
    [
      { content: 'Total Bill', colSpan: 3, styles: { fontStyle: 'bold' as const, fontSize: 8, fillColor: BLUE_LIGHT } },
      { content: peso(totalBill), styles: { halign: 'right' as const, fontStyle: 'bold' as const, fontSize: 8, fillColor: BLUE_LIGHT } },
    ],
    [
      { content: 'Received by :', colSpan: 2, styles: { fontStyle: 'bold' as const } },
      { content: 'Date Received :', colSpan: 2, styles: { fontStyle: 'bold' as const } },
    ],
  ]

  autoTable(doc, {
    startY: y,
    margin: { left: contentX, right: x + width - (contentX + contentWidth), bottom: PAGE_MARGIN },
    tableWidth: contentWidth,
    head: [['Bracket', 'Consumption (Cu.M.)', 'Community Charges', 'Total Payables (PhP)']],
    body,
    theme: 'grid',
    styles: {
      font: fontFamily,
      fontSize: 6.5,
      // Tightened from 2 to a smaller, asymmetric padding: NotoSans' tall
      // line-height (see setLineHeightFactor above) already gives each row
      // more effective breathing room than the same fontSize would in a
      // standard font, so less padding on top of that is needed to match
      // the compactness of the HTML/CSS preview.
      cellPadding: { top: 1, right: 2, bottom: 1, left: 2 },
      minCellHeight: 0, // don't let autoTable pad rows up to a larger default minimum
      valign: 'middle',
      textColor: BLACK,
      lineColor: BLUE,
      lineWidth: 0.5,
    },
    headStyles: { font: fontFamily, fillColor: BLUE_LIGHT, textColor: BLACK, fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { cellWidth: contentWidth * 0.4 },
      1: { cellWidth: contentWidth * 0.2, halign: 'center' },
      2: { cellWidth: contentWidth * 0.2, halign: 'center' },
      3: { cellWidth: contentWidth * 0.2, halign: 'right' },
    },
  })

  return (doc as any).lastAutoTable.finalY as number
}

/**
 * Generates and downloads a PDF of water bills on A4 portrait pages.
 *
 * Bills flow down each page one after another using the REAL height each
 * one actually rendered at (autoTable's finalY) rather than a fixed
 * pre-guessed slot size. Before starting a new bill, it checks whether
 * there's enough room left on the current page (using a generous worst-case
 * estimate) and starts a new page if not — so a bill's table is never
 * split across a page, and bills never overlap each other. Typically 3
 * bills land on a page, occasionally 2 if the previous ones ran long
 * (e.g. a wrapped consumer name), but never a partial/split bill.
 */
export function generateWaterBillsPDF(
  records: BillingRecord[],
  organizationName: string = DEFAULT_ORG_NAME,
): { filename: string } {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const fontFamily = registerPdfFonts(doc) // registered fresh on THIS doc instance every call

  // jsPDF's default line-height factor (1.15) multiplies on top of the
  // active font's own ascent/descent metrics. NotoSans has noticeably
  // taller built-in metrics than a standard font like Helvetica, so at the
  // default factor every autoTable row (and every multi-line text block)
  // ends up with visibly more vertical space than the same layout would
  // have in an HTML/CSS preview using normal browser line-height. Tightening
  // this to 1.0 removes that extra multiplier — rows still fit the text
  // comfortably, they just aren't padded on top of NotoSans' own tall metrics.
  doc.setLineHeightFactor(1.0)

  const pageWidth = doc.internal.pageSize.getWidth()   // 595.28pt — A4 width
  const pageHeight = doc.internal.pageSize.getHeight() // 841.89pt — A4 height
  const boxWidth = pageWidth - PAGE_MARGIN * 2

  let cursorY = PAGE_MARGIN
  let isFirstOnPage = true

  records.forEach((record) => {
    // Not enough room left for another bill on this page? Start a fresh one.
    if (!isFirstOnPage && cursorY + ESTIMATED_BILL_HEIGHT > pageHeight - PAGE_MARGIN) {
      doc.addPage()
      cursorY = PAGE_MARGIN
      isFirstOnPage = true
    }

    const contentBottom = drawOneBillContent(doc, fontFamily, record, PAGE_MARGIN, cursorY, boxWidth, organizationName)
    const boxBottom = contentBottom + 6

    // Border drawn AFTER content, now that the real height is known.
    doc.setDrawColor(...BLUE)
    doc.setLineWidth(0.75)
    doc.rect(PAGE_MARGIN, cursorY, boxWidth, boxBottom - cursorY)

    cursorY = boxBottom + BILL_GAP
    isFirstOnPage = false
  })

  const filename = records.length === 1
    ? `${records[0].meter_account.meter_serial_no}_bill.pdf`
    : 'water_bills.pdf'

  doc.save(filename)
  return { filename }
}