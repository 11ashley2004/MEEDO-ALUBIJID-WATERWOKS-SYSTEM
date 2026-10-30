// lib/utils/billing-report-export.ts
import type { BillingRecord } from '@/lib/actions/billing/all-billing.actions'

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

// ─── XML helpers (SpreadsheetML — same pattern as the transactions report) ───

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
  <Style ss:ID="zoneTotalLabel">
   <Font ss:Bold="1" ss:Italic="1" ss:Size="9" ss:Color="#475569"/>
   <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
  </Style>
  <Style ss:ID="zoneTotalNum">
   <Font ss:Bold="1" ss:Italic="1" ss:Size="9" ss:Color="#334155"/>
   <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Right"/>
   <NumberFormat ss:Format="&quot;₱&quot;#,##0.00"/>
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
  </Style>
  <Style ss:ID="zoneTotalNumPlain">
   <Font ss:Bold="1" ss:Italic="1" ss:Size="9" ss:Color="#334155"/>
   <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Right"/>
   <NumberFormat ss:Format="#,##0.00"/>
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
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

// Totals row reports every summable column. The label spans everything up
// to (not including) the Consumption column so each numeric total lines up
// directly under its own column header.
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

interface ZoneTotals {
  accountCount: number
  totalConsumption: number
  totalCurrentBilling: number
  totalPenalty: number
  totalOverdue: number
  totalMeterCharge: number
  totalBilling: number
  totalRemaining: number
}

// Per-zone (Purok) subtotal row, shown right after that zone's data rows.
// Styled lighter/italic so it reads as a subtotal rather than competing
// with the bold barangay-level total at the bottom of the sheet.
function zoneTotalsRow(zoneName: string, t: ZoneTotals): XRow {
  return {
    cells: [
      {
        value: `${zoneName} Subtotal (${t.accountCount} account${t.accountCount !== 1 ? 's' : ''})`,
        styleId: 'zoneTotalLabel',
        mergeAcross: CONSUMPTION_COL_INDEX - 1,
      },
      { value: t.totalConsumption, type: 'Number', styleId: 'zoneTotalNumPlain' },
      { value: t.totalCurrentBilling, type: 'Number', styleId: 'zoneTotalNum' },
      { value: t.totalPenalty, type: 'Number', styleId: 'zoneTotalNum' },
      { value: t.totalOverdue, type: 'Number', styleId: 'zoneTotalNum' },
      { value: t.totalMeterCharge, type: 'Number', styleId: 'zoneTotalNum' },
      { value: t.totalBilling, type: 'Number', styleId: 'zoneTotalNum' },
      { value: t.totalRemaining, type: 'Number', styleId: 'zoneTotalNum' },
    ],
  }
}

// ─── Grouping ─────────────────────────────────────────────────────────────────

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

// ─── Public API ─────────────────────────────────────────────────────────────

export interface BillingReportResult {
  sheets: number
  totalAccounts: number
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

      const zoneTotals: ZoneTotals = {
        accountCount: 0,
        totalConsumption: 0,
        totalCurrentBilling: 0,
        totalPenalty: 0,
        totalOverdue: 0,
        totalMeterCharge: 0,
        totalBilling: 0,
        totalRemaining: 0,
      }

      zoneRecords.forEach((r, i) => {
        rows.push(dataRow(r, i + 1))

        zoneTotals.accountCount += 1
        zoneTotals.totalConsumption += r.consumption.consumption
        zoneTotals.totalCurrentBilling += r.current_billing
        zoneTotals.totalPenalty += r.penalty_amount
        zoneTotals.totalOverdue += r.previous_balance
        zoneTotals.totalMeterCharge += r.meter_charge
        zoneTotals.totalBilling += r.total_billing
        zoneTotals.totalRemaining += r.remaining_balance

        totals.accountCount += 1
        totals.totalConsumption += r.consumption.consumption
        totals.totalCurrentBilling += r.current_billing
        totals.totalPenalty += r.penalty_amount
        totals.totalOverdue += r.previous_balance
        totals.totalMeterCharge += r.meter_charge
        totals.totalBilling += r.total_billing
        totals.totalRemaining += r.remaining_balance
      })

      rows.push(zoneTotalsRow(zoneName, zoneTotals))

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