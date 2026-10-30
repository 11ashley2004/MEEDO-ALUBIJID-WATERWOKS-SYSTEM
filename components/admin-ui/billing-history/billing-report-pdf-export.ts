// lib/utils/billing-report-export.ts
import type { BillingRecord } from '@/lib/actions/billing/all-billing.actions'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { NOTO_SANS_REGULAR_BASE64, NOTO_SANS_BOLD_BASE64 } from '@/lib/pdf-fonts/noto-sans-base64'

// ─── Config ───────────────────────────────────────────────────────────────────

const ORG_NAME = 'MEEDO ALUBIJID WATER WORKS'
const ORG_ADDRESS = 'Alubijid, Misamis Oriental, Philippines'
const ORG_CONTACT = 'Water Billing & Collection Office'

const COLUMN_WIDTHS = [30, 170, 110, 100, 110, 90, 90, 90, 90, 100, 100, 110, 100, 100, 100]
const DETAIL_HEADERS = [
  '#', 'Account Name', 'Serial No.',
  'Classification', 'Meter Serial No.', 'Reading Status', 'Previous Reading',
  'Present Reading', 'Consumption (m³)', 'Current Billing', 'Penalty (2%)',
  'Overdue Accounts', 'Meter Charge', 'Total Billing', 'Remaining Balance',
]
const COLS = DETAIL_HEADERS.length // 15

// Column index of "Consumption (m³)" — the totals row aligns its first
// numeric cell directly under this column, with the label merged across
// everything to its left.
const CONSUMPTION_COL_INDEX = DETAIL_HEADERS.indexOf('Consumption (m³)') // 8

// ─── Shared sorting helper ────────────────────────────────────────────────────
// FIX: alphabetical (A→Z) sort for accounts within each Purok/zone section.
// Records arrive from get_billing_records ordered by period_start DESC,
// created_at DESC — never by name — so without this the row order inside
// each zone was arbitrary (insertion order of the billing rows) instead of
// alphabetical. Uses localeCompare with sensitivity: 'base' so case and
// accents don't affect ordering (e.g. "de la Cruz" sorts with "De La Cruz").
const sortByAccountNameAsc = (a: BillingRecord, b: BillingRecord) =>
  a.meter_account.consumer.account_name.localeCompare(
    b.meter_account.consumer.account_name,
    undefined,
    { sensitivity: 'base' },
  )

// ─── PDF font (Noto Sans, subset to Latin + ₱) ───────────────────────────────
// jsPDF's built-in Helvetica/Times/Courier only cover WinAnsi, which does NOT
// include the peso sign (₱, U+20B1) — that's why it rendered as a blank box
// or "?" while the Excel export (which uses a NumberFormat mask, not a drawn
// glyph) was fine. We embed a real Unicode font instead of swapping to "PHP".
// The font file is subsetted to just the glyphs this report needs, so the
// TTF is ~34KB rather than several MB.
const PDF_FONT_FAMILY = 'NotoSans'
let pdfFontRegistered = false

function registerPdfFonts(doc: jsPDF) {
  if (!pdfFontRegistered) {
    doc.addFileToVFS('NotoSans-Regular.ttf', NOTO_SANS_REGULAR_BASE64)
    doc.addFont('NotoSans-Regular.ttf', PDF_FONT_FAMILY, 'normal')
    doc.addFileToVFS('NotoSans-Bold.ttf', NOTO_SANS_BOLD_BASE64)
    doc.addFont('NotoSans-Bold.ttf', PDF_FONT_FAMILY, 'bold')
    pdfFontRegistered = true
  }
  doc.setFont(PDF_FONT_FAMILY, 'normal')
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function groupByBarangayThenZone(records: BillingRecord[]) {
  const byBarangay = new Map<string, Map<string, BillingRecord[]>>()
  for (const r of records) {
    const barangayName = r.meter_account.zone.barangay.barangay_name
    const zoneName = r.meter_account.zone.zone_name
    if (!byBarangay.has(barangayName)) byBarangay.set(barangayName, new Map())
    const zoneMap = byBarangay.get(barangayName)!
    if (!zoneMap.has(zoneName)) zoneMap.set(zoneName, [])
    zoneMap.get(zoneName)!.push(r)
  }
  return byBarangay
}

const naturalSort = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })

export interface BillingReportResult {
  sheets: number
  totalAccounts: number
}

// ============================================================================
// EXCEL EXPORT
// ============================================================================

// ─── XML helpers (SpreadsheetML) ──────────────────────────────────────────────

type CellType = 'String' | 'Number'

interface XCell {
  value: string | number
  type?: CellType
  styleId?: string
  mergeAcross?: number
}

interface XRow {
  cells: XCell[]
  height?: number
}

interface XSheet {
  name: string
  columnWidths: number[]
  rows: XRow[]
}

function escapeXML(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function cellToXML(cell: XCell): string {
  const type = cell.type ?? 'String'
  const styleAttr = cell.styleId ? ` ss:StyleID="${cell.styleId}"` : ''
  const mergeAttr = cell.mergeAcross ? ` ss:MergeAcross="${cell.mergeAcross}"` : ''
  const value = type === 'Number' ? cell.value : escapeXML(cell.value)
  return `<Cell${styleAttr}${mergeAttr}><Data ss:Type="${type}">${value}</Data></Cell>`
}

/** Excel sheet names: max 31 chars, no [ ] : * ? / \ */
function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[\[\]:*?/\\]/g, '').trim()
  return (cleaned || 'Sheet').slice(0, 31)
}

function buildMultiSheetWorkbookXML(sheets: XSheet[]): string {
  const worksheetsXML = sheets
    .map((sheet) => {
      const columnsXML = sheet.columnWidths.map((w) => `<Column ss:Width="${w}"/>`).join('')
      const rowsXML = sheet.rows
        .map((r) => `<Row${r.height ? ` ss:Height="${r.height}"` : ''}>${r.cells.map(cellToXML).join('')}</Row>`)
        .join('')
      return `
 <Worksheet ss:Name="${escapeXML(sheet.name)}">
  <Table>
   ${columnsXML}
   ${rowsXML}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <PageSetup>
    <Layout x:Orientation="Landscape"/>
    <Header x:Margin="0.3"/>
    <Footer x:Margin="0.3"/>
   </PageSetup>
   <Print>
    <FitWidth>1</FitWidth>
    <FitHeight>32767</FitHeight>
   </Print>
  </WorksheetOptions>
 </Worksheet>`
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="orgTitle">
   <Font ss:Bold="1" ss:Size="16" ss:Color="#4C1D95"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="orgSub">
   <Font ss:Size="10" ss:Color="#64748B"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="reportTitle">
   <Font ss:Bold="1" ss:Size="13" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#7C3AED" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="purokHeader">
   <Font ss:Bold="1" ss:Size="11" ss:Color="#1E293B"/>
   <Interior ss:Color="#D4D400" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#A3A300"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#A3A300"/>
   </Borders>
  </Style>
  <Style ss:ID="periodHeader">
   <Font ss:Bold="1" ss:Size="10" ss:Color="#1E293B"/>
   <Interior ss:Color="#E4E400" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#A3A300"/>
   </Borders>
  </Style>
  <Style ss:ID="colHead">
   <Font ss:Bold="1" ss:Size="9" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#7C3AED" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#5B21B6"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#5B21B6"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#5B21B6"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#5B21B6"/>
   </Borders>
  </Style>
  <Style ss:ID="cellInt">
   <Font ss:Size="9" ss:Color="#64748B"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="cellTextBold">
   <Font ss:Bold="1" ss:Size="9" ss:Color="#334155"/>
   <Alignment ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="cellText">
   <Font ss:Size="9" ss:Color="#334155"/>
   <Alignment ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="cellNumPlain">
   <Font ss:Size="9" ss:Color="#334155"/>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <NumberFormat ss:Format="#,##0.00"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="cellNum">
   <Font ss:Size="9" ss:Color="#047857"/>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <NumberFormat ss:Format="&quot;₱&quot;#,##0.00"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="cellNumDanger">
   <Font ss:Size="9" ss:Color="#E11D48"/>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <NumberFormat ss:Format="&quot;₱&quot;#,##0.00"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="totalLabel">
   <Font ss:Bold="1" ss:Size="10" ss:Color="#1E293B"/>
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#7C3AED"/>
   </Borders>
  </Style>
  <Style ss:ID="totalNum">
   <Font ss:Bold="1" ss:Size="10" ss:Color="#047857"/>
   <Alignment ss:Horizontal="Right"/>
   <NumberFormat ss:Format="&quot;₱&quot;#,##0.00"/>
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#7C3AED"/>
   </Borders>
  </Style>
  <Style ss:ID="totalNumPlain">
   <Font ss:Bold="1" ss:Size="10" ss:Color="#1E293B"/>
   <Alignment ss:Horizontal="Right"/>
   <NumberFormat ss:Format="#,##0.00"/>
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#7C3AED"/>
   </Borders>
  </Style>
 </Styles>${worksheetsXML}
</Workbook>`
}

function downloadWorkbook(xml: string, filename: string) {
  // Prepend a UTF-8 BOM (\uFEFF). Excel's SpreadsheetML/XML parser doesn't
  // reliably auto-detect UTF-8 on its own — without the BOM it can silently
  // misdecode multi-byte characters, which is exactly why the peso sign (₱,
  // a 3-byte UTF-8 character) was showing up as "±". The BOM is the signal
  // Excel actually checks.
  const blob = new Blob(['\uFEFF' + xml], { type: 'application/vnd.ms-excel;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// ─── Row builders ───────────────────────────────────────────────────────────

function purokHeaderRow(zoneName: string, barangayName: string): XRow {
  return {
    height: 22,
    cells: [{ value: `${zoneName}, ${barangayName}`, styleId: 'purokHeader', mergeAcross: COLS - 1 }],
  }
}

function periodHeaderRow(periodLabel: string): XRow {
  return {
    cells: [{ value: periodLabel, styleId: 'periodHeader', mergeAcross: COLS - 1 }],
  }
}

function columnHeaderRow(): XRow {
  return {
    height: 24,
    cells: DETAIL_HEADERS.map((h) => ({ value: h, styleId: 'colHead' })),
  }
}

function dataRow(r: BillingRecord, idx: number): XRow {
  return {
    cells: [
      { value: idx, type: 'Number', styleId: 'cellInt' },
      { value: r.meter_account.consumer.account_name, styleId: 'cellTextBold' },
      { value: r.meter_account.meter_serial_no ?? '—', styleId: 'cellText' },
      { value: r.meter_account.classification.classification_name, styleId: 'cellText' },
      { value: r.meter_serial_no ?? '—', styleId: 'cellText' },
      { value: r.reading_status?.status_code ?? '—', styleId: 'cellText' },
      { value: r.consumption.previous_reading, type: 'Number', styleId: 'cellNumPlain' },
      { value: r.consumption.present_reading, type: 'Number', styleId: 'cellNumPlain' },
      { value: r.consumption.consumption, type: 'Number', styleId: 'cellNumPlain' },
      { value: r.current_billing, type: 'Number', styleId: 'cellNum' },
      { value: r.penalty_amount, type: 'Number', styleId: 'cellNum' },
      { value: r.previous_balance, type: 'Number', styleId: 'cellNum' },
      { value: r.meter_charge, type: 'Number', styleId: 'cellNum' },
      { value: r.total_billing, type: 'Number', styleId: 'cellNum' },
      {
        value: r.remaining_balance,
        type: 'Number',
        styleId: r.remaining_balance > 0 ? 'cellNumDanger' : 'cellNum',
      },
    ],
  }
}

function blankRow(): XRow {
  return { cells: [{ value: '', mergeAcross: COLS - 1 }] }
}

interface BarangayTotals {
  accountCount: number
  totalConsumption: number
  totalCurrentBilling: number
  totalPenalty: number
  totalOverdue: number
  totalMeterCharge: number
  totalBilling: number
  totalRemaining: number
}

function barangayTotalsRow(t: BarangayTotals): XRow {
  return {
    cells: [
      {
        value: `Barangay Total (${t.accountCount} account${t.accountCount !== 1 ? 's' : ''})`,
        styleId: 'totalLabel',
        mergeAcross: CONSUMPTION_COL_INDEX - 1,
      },
      { value: t.totalConsumption, type: 'Number', styleId: 'totalNumPlain' },
      { value: t.totalCurrentBilling, type: 'Number', styleId: 'totalNum' },
      { value: t.totalPenalty, type: 'Number', styleId: 'totalNum' },
      { value: t.totalOverdue, type: 'Number', styleId: 'totalNum' },
      { value: t.totalMeterCharge, type: 'Number', styleId: 'totalNum' },
      { value: t.totalBilling, type: 'Number', styleId: 'totalNum' },
      { value: t.totalRemaining, type: 'Number', styleId: 'totalNum' },
    ],
  }
}

/**
 * Generates and downloads a billing report for one reading period.
 * Each barangay becomes its own worksheet; within a sheet, accounts are
 * grouped into sections by Purok (zone), matching the printed ledger layout.
 * Within each zone section, accounts are sorted alphabetically (A→Z) by
 * account name. Each zone section ends with a subtotal row, and each sheet
 * ends with a barangay-wide grand total row.
 */
export function generateBillingReport(
  records: BillingRecord[],
  periodLabel: string,
): BillingReportResult {
  const grouped = groupByBarangayThenZone(records)
  const barangayNames = [...grouped.keys()].sort(naturalSort)

  const sheets: XSheet[] = barangayNames.map((barangayName) => {
    const zoneMap = grouped.get(barangayName)!
    const zoneNames = [...zoneMap.keys()].sort(naturalSort)

    const rows: XRow[] = [
      { height: 24, cells: [{ value: ORG_NAME, styleId: 'orgTitle', mergeAcross: COLS - 1 }] },
      { cells: [{ value: `${ORG_ADDRESS} · ${ORG_CONTACT}`, styleId: 'orgSub', mergeAcross: COLS - 1 }] },
      blankRow(),
      {
        height: 22,
        cells: [{ value: `REPORT — Barangay ${barangayName}`, styleId: 'reportTitle', mergeAcross: COLS - 1 }],
      },
      blankRow(),
    ]

    const totals: BarangayTotals = {
      accountCount: 0,
      totalConsumption: 0,
      totalCurrentBilling: 0,
      totalPenalty: 0,
      totalOverdue: 0,
      totalMeterCharge: 0,
      totalBilling: 0,
      totalRemaining: 0,
    }

    zoneNames.forEach((zoneName, zi) => {
      const zoneRecords = zoneMap.get(zoneName)!

      // FIX: sort this zone's accounts A→Z before rendering rows, so the
      // printed order matches the alphabetical ledger layout instead of
      // whatever order the RPC happened to return them in.
      zoneRecords.sort(sortByAccountNameAsc)

      rows.push(purokHeaderRow(zoneName, barangayName))
      rows.push(periodHeaderRow(periodLabel))
      rows.push(columnHeaderRow())

      zoneRecords.forEach((r, i) => {
        rows.push(dataRow(r, i + 1))
        totals.accountCount += 1
        totals.totalConsumption += r.consumption.consumption
        totals.totalCurrentBilling += r.current_billing
        totals.totalPenalty += r.penalty_amount
        totals.totalOverdue += r.previous_balance
        totals.totalMeterCharge += r.meter_charge
        totals.totalBilling += r.total_billing
        totals.totalRemaining += r.remaining_balance
      })

      if (zi < zoneNames.length - 1) rows.push(blankRow())
    })

    rows.push(blankRow())
    rows.push(barangayTotalsRow(totals))

    return {
      name: sanitizeSheetName(barangayName),
      columnWidths: COLUMN_WIDTHS,
      rows,
    }
  })

  const xml = buildMultiSheetWorkbookXML(sheets)
  downloadWorkbook(xml, `MAWW-Report-${periodLabel.replace(/\s+/g, '-')}.xls`)

  return { sheets: sheets.length, totalAccounts: records.length }
}

// ============================================================================
// PDF EXPORT
// ============================================================================

// PDF colors (RGB triples matching the Excel palette above).
// NOTE: kept as mutable [number, number, number] tuples (no `as const`) —
// jspdf-autotable's Color type requires a mutable tuple, and `as const`
// would make these readonly and fail to typecheck against it.
type RGB = [number, number, number]
const PDF_COLOR: Record<string, RGB> = {
  purple: [124, 58, 237],       // #7C3AED
  purpleDark: [76, 29, 149],    // #4C1D95
  slate: [51, 65, 85],          // #334155
  slateLight: [100, 116, 139],  // #64748B
  muted: [148, 163, 184],       // #94A3B8
  purokYellow: [212, 212, 0],   // #D4D400
  periodYellow: [228, 228, 0],  // #E4E400
  green: [4, 120, 87],          // #047857
  red: [225, 29, 72],           // #E11D48
  white: [255, 255, 255],
}

function zoneTotals(records: BillingRecord[]) {
  return records.reduce(
    (acc, r) => ({
      consumption: acc.consumption + r.consumption.consumption,
      current: acc.current + r.current_billing,
      penalty: acc.penalty + r.penalty_amount,
      overdue: acc.overdue + r.previous_balance,
      meterCharge: acc.meterCharge + r.meter_charge,
      total: acc.total + r.total_billing,
      remaining: acc.remaining + r.remaining_balance,
    }),
    { consumption: 0, current: 0, penalty: 0, overdue: 0, meterCharge: 0, total: 0, remaining: 0 },
  )
}

interface TotalsMetrics {
  consumption: number
  current: number
  penalty: number
  overdue: number
  meterCharge: number
  total: number
  remaining: number
}

/**
 * Scales the Excel column-width ratios (COLUMN_WIDTHS, already used for the
 * .xls export) down to fit the PDF's printable page width, and returns a
 * jspdf-autotable columnStyles map. Passing the SAME map to the main data
 * table and to the Purok/Barangay total rows is what makes the total row's
 * numbers land in exactly the same columns as the data above it — same
 * layout idea as the Excel sheet, just expressed as pt widths instead of
 * Excel's ss:Width units.
 */
function buildColumnStyles(usableWidth: number) {
  const totalUnits = COLUMN_WIDTHS.reduce((sum, w) => sum + w, 0)
  const widths = COLUMN_WIDTHS.map((w) => (w / totalUnits) * usableWidth)
  const columnStyles: Record<number, { cellWidth: number }> = {}
  widths.forEach((w, i) => {
    columnStyles[i] = { cellWidth: w }
  })
  return columnStyles
}

/**
 * One-row table body for a Purok or Barangay total: the label spans the
 * same first 8 columns (0 through CONSUMPTION_COL_INDEX - 1) that the
 * "Account Name / Serial No. / …" columns occupy in the data rows,
 * then each of the 7 numeric columns holds its matching total — mirroring
 * the Excel barangayTotalsRow layout exactly.
 */
function totalsRowBody(label: string, t: TotalsMetrics, textColor: RGB) {
  const numCell = (content: string) => ({ content, styles: { halign: 'right' as const, textColor } })
  return [
    [
      { content: label, colSpan: CONSUMPTION_COL_INDEX, styles: { halign: 'left' as const, textColor } },
      numCell(t.consumption.toFixed(2)),
      numCell(formatCurrency(t.current)),
      numCell(formatCurrency(t.penalty)),
      numCell(formatCurrency(t.overdue)),
      numCell(formatCurrency(t.meterCharge)),
      numCell(formatCurrency(t.total)),
      numCell(formatCurrency(t.remaining)),
    ],
  ]
}

/**
 * Generates and downloads a billing report PDF for one reading period.
 *
 * Layout rule: every Purok (zone) section starts on its own fresh page —
 * Purok 2's first account never lands on the same page as Purok 1's last
 * account, even if Purok 1 only used a third of a page. Overflow *within*
 * a single Purok (when its account list itself is longer than one page)
 * is handled automatically by jspdf-autotable: it paginates the table body
 * and re-prints the column header row on every continuation page.
 */
export function generateBillingReportPDF(
  records: BillingRecord[],
  periodLabel: string,
): BillingReportResult {
  const grouped = groupByBarangayThenZone(records)
  const barangayNames = [...grouped.keys()].sort(naturalSort)

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  registerPdfFonts(doc)

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 24
  const footerReserve = 24 // space reserved at the bottom for the page-number footer
  const usableWidth = pageWidth - margin * 2
  // Shared across the data table AND both total rows, so everything lines
  // up in the same columns (see buildColumnStyles for why).
  const columnStyles = buildColumnStyles(usableWidth)

  let isFirstSection = true

  barangayNames.forEach((barangayName) => {
    const zoneMap = grouped.get(barangayName)!
    const zoneNames = [...zoneMap.keys()].sort(naturalSort)

    // Running grand total for this barangay, built up across all its
    // Purok sections, drawn once at the very end of the barangay.
    const barangayTotals: BarangayTotals = {
      accountCount: 0,
      totalConsumption: 0,
      totalCurrentBilling: 0,
      totalPenalty: 0,
      totalOverdue: 0,
      totalMeterCharge: 0,
      totalBilling: 0,
      totalRemaining: 0,
    }

    // Tracks where the last thing drawn ended, so the barangay total can
    // be placed right after the final Purok's total line (or pushed to a
    // new page if it won't fit there).
    let lastTotalsY = margin

    zoneNames.forEach((zoneName) => {
      const zoneRecords = zoneMap.get(zoneName)!

      // FIX: sort this zone's accounts A→Z before rendering rows, so the
      // printed order matches the alphabetical ledger layout instead of
      // whatever order the RPC happened to return them in.
      zoneRecords.sort(sortByAccountNameAsc)

      // ── Force a new page per Purok section ──────────────────────────
      // This is the key rule: never continue onto the tail end of the
      // previous section's page. Only skipped for the very first section
      // in the whole document (a fresh doc already starts on page 1).
      if (!isFirstSection) doc.addPage()
      isFirstSection = false

      let cursorY = margin

      // Org header
      doc.setFont(PDF_FONT_FAMILY, 'bold')
      doc.setFontSize(14)
      doc.setTextColor(...PDF_COLOR.purpleDark)
      doc.text(ORG_NAME, pageWidth / 2, cursorY, { align: 'center' })
      cursorY += 16

      doc.setFont(PDF_FONT_FAMILY, 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...PDF_COLOR.slateLight)
      doc.text(`${ORG_ADDRESS} · ${ORG_CONTACT}`, pageWidth / 2, cursorY, { align: 'center' })
      cursorY += 18

      // Report title band
      doc.setFillColor(...PDF_COLOR.purple)
      doc.rect(margin, cursorY, pageWidth - margin * 2, 20, 'F')
      doc.setFont(PDF_FONT_FAMILY, 'bold')
      doc.setFontSize(12)
      doc.setTextColor(...PDF_COLOR.white)
      doc.text(`REPORT — Barangay ${barangayName}`, pageWidth / 2, cursorY + 14, { align: 'center' })
      cursorY += 28

      // Purok header band
      doc.setFillColor(...PDF_COLOR.purokYellow)
      doc.rect(margin, cursorY, pageWidth - margin * 2, 18, 'F')
      doc.setFontSize(11)
      doc.setTextColor(30, 41, 59)
      doc.text(`${zoneName}, ${barangayName}`, pageWidth / 2, cursorY + 13, { align: 'center' })
      cursorY += 18

      // Period header band
      doc.setFillColor(...PDF_COLOR.periodYellow)
      doc.rect(margin, cursorY, pageWidth - margin * 2, 14, 'F')
      doc.setFont(PDF_FONT_FAMILY, 'bold')
      doc.setFontSize(10)
      doc.text(periodLabel, pageWidth / 2, cursorY + 10, { align: 'center' })
      cursorY += 20

      const body = zoneRecords.map((r, i) => [
        String(i + 1),
        r.meter_account.consumer.account_name,
        r.meter_account.meter_serial_no,
        r.meter_account.classification.classification_name,
        r.meter_serial_no ?? '—',
        r.reading_status?.status_code ?? '—',
        r.consumption.previous_reading.toFixed(2),
        r.consumption.present_reading.toFixed(2),
        r.consumption.consumption.toFixed(2),
        formatCurrency(r.current_billing),
        formatCurrency(r.penalty_amount),
        formatCurrency(r.previous_balance),
        formatCurrency(r.meter_charge),
        formatCurrency(r.total_billing),
        r.remaining_balance > 0
          ? { content: formatCurrency(r.remaining_balance), styles: { textColor: PDF_COLOR.red } }
          : formatCurrency(r.remaining_balance),
      ])

      // ── Table with built-in row-overflow pagination ─────────────────
      // showHead: 'everyPage' re-draws the column headers whenever
      // autoTable itself has to spill this section onto another page,
      // so a long Purok never loses its column context mid-list.
      autoTable(doc, {
        startY: cursorY,
        margin: { left: margin, right: margin, bottom: margin + footerReserve },
        head: [DETAIL_HEADERS],
        body,
        theme: 'grid',
        tableWidth: usableWidth,
        columnStyles,
        styles: { font: PDF_FONT_FAMILY, fontSize: 7, cellPadding: 3, textColor: PDF_COLOR.slate },
        headStyles: {
          font: PDF_FONT_FAMILY,
          fillColor: PDF_COLOR.purple,
          textColor: PDF_COLOR.white,
          fontStyle: 'bold',
          halign: 'center',
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        showHead: 'everyPage',
      })

      // ── Purok Total — column-aligned row, not a single text line ─────
      // Uses the same columnStyles as the data table above, so "Consumption",
      // "Current Billing", etc. line up under their matching columns, the
      // way the Excel export's Barangay Total row does. jspdf-autotable
      // paginates this on its own (via `margin.bottom`) if it wouldn't fit
      // on the current page, so no manual height guard is needed.
      const totals = zoneTotals(zoneRecords)

      doc.setDrawColor(...PDF_COLOR.purple)
      doc.setLineWidth(1.5)
      const beforePurokTotalY = (doc as any).lastAutoTable.finalY as number
      doc.line(margin, beforePurokTotalY + 4, pageWidth - margin, beforePurokTotalY + 4)

      autoTable(doc, {
        startY: beforePurokTotalY + 6,
        margin: { left: margin, right: margin, bottom: margin + footerReserve },
        body: totalsRowBody(
          `Purok Total — ${zoneName} (${zoneRecords.length} account${zoneRecords.length !== 1 ? 's' : ''})`,
          totals,
          [30, 41, 59],
        ),
        theme: 'plain',
        tableWidth: usableWidth,
        columnStyles,
        styles: { font: PDF_FONT_FAMILY, fontSize: 8, fontStyle: 'bold', cellPadding: { top: 4, bottom: 4, left: 4, right: 4 } },
      })

      const totalsY = (doc as any).lastAutoTable.finalY as number

      // Roll this Purok's totals into the barangay-wide running total.
      barangayTotals.accountCount += zoneRecords.length
      barangayTotals.totalConsumption += totals.consumption
      barangayTotals.totalCurrentBilling += totals.current
      barangayTotals.totalPenalty += totals.penalty
      barangayTotals.totalOverdue += totals.overdue
      barangayTotals.totalMeterCharge += totals.meterCharge
      barangayTotals.totalBilling += totals.total
      barangayTotals.totalRemaining += totals.remaining

      lastTotalsY = totalsY
    })

    // ── Barangay grand total — same column-aligned row treatment, with a
    // solid purple fill (matching the report's accent color) instead of
    // the Purok row's plain background, so it reads as the bigger rollup.
    autoTable(doc, {
      startY: lastTotalsY + 10,
      margin: { left: margin, right: margin, bottom: margin + footerReserve },
      body: totalsRowBody(
        `Barangay Total — ${barangayName} (${barangayTotals.accountCount} account${barangayTotals.accountCount !== 1 ? 's' : ''})`,
        {
          consumption: barangayTotals.totalConsumption,
          current: barangayTotals.totalCurrentBilling,
          penalty: barangayTotals.totalPenalty,
          overdue: barangayTotals.totalOverdue,
          meterCharge: barangayTotals.totalMeterCharge,
          total: barangayTotals.totalBilling,
          remaining: barangayTotals.totalRemaining,
        },
        PDF_COLOR.white,
      ),
      theme: 'plain',
      tableWidth: usableWidth,
      columnStyles,
      styles: {
        font: PDF_FONT_FAMILY,
        fontSize: 9,
        fontStyle: 'bold',
        fillColor: PDF_COLOR.purpleDark,
        cellPadding: { top: 6, bottom: 6, left: 6, right: 4 },
      },
    })
  })

  doc.save(`MAWW-Report-${periodLabel.replace(/\s+/g, '-')}.pdf`)

  return { sheets: barangayNames.length, totalAccounts: records.length }
}