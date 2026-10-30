// lib/utils/excel-export.ts
import { format } from 'date-fns'
import type { TransactionRecord } from '@/lib/actions/payment/transaction.actions'

// ─── Config ───────────────────────────────────────────────────────────────────

export const ORG_NAME = 'MEEDO ALUBIJID WATER WORKS'
export const ORG_ADDRESS = 'Alubijid, Misamis Oriental, Philippines'
export const ORG_CONTACT = 'Water Billing & Collection Office'

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export type ReportPaymentType = 'all' | 'billing' | 'connection_fee' | 'reconnection'

export const REPORT_TYPE_OPTIONS: { val: ReportPaymentType; label: string }[] = [
  { val: 'all', label: 'All Types' },
  { val: 'billing', label: 'Billing' },
  { val: 'connection_fee', label: 'Connection Fee' },
  { val: 'reconnection', label: 'Reconnection' },
]

// ─── Helpers shared with the report ────────────────────────────────────────────

const formatDate = (dateString: string) => format(new Date(dateString), 'MMM dd, yyyy')
const formatDateTime = (dateString: string) => format(new Date(dateString), 'MMM dd, yyyy h:mm a')

// ─── Excel (SpreadsheetML) generation — pure JS, no library ───────────────────
// Produces a genuine, Excel-native .xls file (Microsoft's XML Spreadsheet
// format). Excel opens it directly with real formatting, merged cells,
// borders and number formats — this is not a CSV renamed to .xls.

type CellType = 'String' | 'Number' | 'DateTime'

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

function buildWorkbookXML(sheetName: string, columnWidths: number[], rows: XRow[]): string {
  const columnsXML = columnWidths.map((w) => `<Column ss:Width="${w}"/>`).join('')
  const rowsXML = rows
    .map((r) => `<Row${r.height ? ` ss:Height="${r.height}"` : ''}>${r.cells.map(cellToXML).join('')}</Row>`)
    .join('')

  return `<?xml version="1.0"?>
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
  <Style ss:ID="sectionLabel">
   <Font ss:Bold="1" ss:Size="10" ss:Color="#4C1D95"/>
   <Interior ss:Color="#EDE9FE" ss:Pattern="Solid"/>
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
  <Style ss:ID="cellInt">
   <Font ss:Size="9" ss:Color="#334155"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
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
 </Styles>
 <Worksheet ss:Name="${escapeXML(sheetName)}">
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
  </WorksheetOptions>
 </Worksheet>
</Workbook>`
}

function downloadWorkbook(xml: string, filename: string) {
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const DETAIL_COLUMN_WIDTHS = [90, 110, 150, 90, 90, 130]
const DETAIL_HEADERS = ['Receipt #', 'Type', 'Collector', 'Amount', 'Payment Date', 'Recorded At']

function detailHeaderRow(): XRow {
  return {
    height: 20,
    cells: DETAIL_HEADERS.map((h) => ({ value: h, styleId: 'colHead' })),
  }
}

function detailDataRow(t: TransactionRecord): XRow {
  return {
    cells: [
      { value: t.receipt_number, styleId: 'cellText' },
      { value: t.payment_type_name.replace(/_/g, ' '), styleId: 'cellText' },
      { value: `${t.collected_by.last_name}, ${t.collected_by.first_name}`, styleId: 'cellText' },
      { value: t.amount, type: 'Number', styleId: 'cellNum' },
      { value: formatDate(t.payment_date), styleId: 'cellText' },
      { value: formatDateTime(t.created_at), styleId: 'cellText' },
    ],
  }
}

function filterByPaymentType(transactions: TransactionRecord[], paymentType: ReportPaymentType) {
  if (paymentType === 'all') return transactions
  return transactions.filter((t) => t.payment_type_name.toLowerCase() === paymentType)
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface PeriodReportResult {
  count: number
  total: number
}

/** Generates and downloads a monthly or yearly revenue report, optionally scoped to one payment type. */
export function generatePeriodReport(
  transactions: TransactionRecord[],
  periodType: 'monthly' | 'yearly',
  month: number,
  year: number,
  paymentType: ReportPaymentType = 'all',
): PeriodReportResult {
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

  const rows: XRow[] = [
    { height: 24, cells: [{ value: ORG_NAME, styleId: 'orgTitle', mergeAcross: 5 }] },
    { cells: [{ value: `${ORG_ADDRESS} · ${ORG_CONTACT}`, styleId: 'orgSub', mergeAcross: 5 }] },
    { cells: [{ value: '', mergeAcross: 5 }] },
    {
      height: 22,
      cells: [{ value: `${titlePrefix} — ${titleSuffix}`, styleId: 'reportTitle', mergeAcross: 5 }],
    },
    { cells: [{ value: '', mergeAcross: 5 }] },

    { cells: [{ value: 'TRANSACTION DETAILS', styleId: 'sectionLabel', mergeAcross: 5 }] },
    detailHeaderRow(),
    ...inPeriod.map(detailDataRow),
    inPeriod.length === 0
      ? { cells: [{ value: 'No transactions recorded for this period.', styleId: 'cellText', mergeAcross: 5 }] }
      : {
          cells: [
            { value: `Total (${inPeriod.length} transaction${inPeriod.length !== 1 ? 's' : ''})`, styleId: 'totalLabel', mergeAcross: 2 },
            { value: grandTotal, type: 'Number', styleId: 'totalNum' },
            { value: '', styleId: 'totalLabel' },
            { value: '', styleId: 'totalLabel' },
          ],
        },
  ]

  const xml = buildWorkbookXML('Revenue Report', DETAIL_COLUMN_WIDTHS, rows)
  const periodPart = periodType === 'monthly' ? `Monthly-${MONTH_NAMES[month]}-${year}` : `Annual-${year}`
  const typePart = paymentType === 'all' ? '' : `-${typeLabel.replace(/\s+/g, '')}`
  downloadWorkbook(xml, `MAWW-Report-${periodPart}${typePart}.xls`)

  return { count: inPeriod.length, total: grandTotal }
}