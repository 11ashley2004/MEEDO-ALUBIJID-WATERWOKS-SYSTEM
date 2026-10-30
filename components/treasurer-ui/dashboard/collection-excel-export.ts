import type { CollectionExportRow } from '@/lib/actions/dashboard/treasurer-dashboard.actions'

function escapeXML(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function downloadXml(filename: string, xml: string) {
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportCollectionRowsExcel(opts: {
  kind: 'outstanding' | 'collected'
  periodLabel: string
  rows: CollectionExportRow[]
}) {
  const title =
    opts.kind === 'outstanding'
      ? 'Need to Collect (Current Outstanding Bills)'
      : 'Collected This Month (Billing Payments)'

  const headers =
    opts.kind === 'outstanding'
      ? [
          'Consumer',
          'Contract No.',
          'Meter Serial No.',
          'Zone',
          'Barangay',
          'Billing Period',
          'Total Billing',
          'Remaining (Need to Collect)',
          'Status',
        ]
      : [
          'Consumer',
          'Contract No.',
          'Meter Serial No.',
          'Zone',
          'Barangay',
          'Receipt No.',
          'Payment Date',
          'Amount Collected',
          'Billing Period',
        ]

  const dataRows = opts.rows.map((r) => {
    if (opts.kind === 'outstanding') {
      return [
        r.consumer_name,
        r.contract_no ?? '—',
        r.meter_serial_no ?? '—',
        r.zone_name,
        r.barangay_name,
        r.period_label ?? '—',
        Number(r.total_billing ?? 0),
        Number(r.amount),
        r.billing_status ?? '—',
      ]
    }
    return [
      r.consumer_name,
      r.contract_no ?? '—',
      r.meter_serial_no ?? '—',
      r.zone_name,
      r.barangay_name,
      r.receipt_number ?? '—',
      r.payment_date ?? '—',
      Number(r.amount),
      r.period_label ?? '—',
    ]
  })

  const total = opts.rows.reduce((s, r) => s + (Number(r.amount) || 0), 0)

  const headerCells = headers
    .map((h) => `<Cell ss:StyleID="hdr"><Data ss:Type="String">${escapeXML(h)}</Data></Cell>`)
    .join('')

  const body = dataRows
    .map((cells) => {
      const xml = cells
        .map((c) => {
          if (typeof c === 'number') {
            return `<Cell ss:StyleID="num"><Data ss:Type="Number">${c}</Data></Cell>`
          }
          return `<Cell><Data ss:Type="String">${escapeXML(c)}</Data></Cell>`
        })
        .join('')
      return `<Row>${xml}</Row>`
    })
    .join('')

  const amountCol = opts.kind === 'outstanding' ? 7 : 7
  const totalRowCells = headers
    .map((_, i) => {
      if (i === 0) return `<Cell ss:StyleID="total"><Data ss:Type="String">TOTAL</Data></Cell>`
      if (i === amountCol) {
        return `<Cell ss:StyleID="totalNum"><Data ss:Type="Number">${total}</Data></Cell>`
      }
      return `<Cell ss:StyleID="total"><Data ss:Type="String"></Data></Cell>`
    })
    .join('')

  const colCount = headers.length
  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="title"><Font ss:Bold="1" ss:Size="14"/></Style>
  <Style ss:ID="sub"><Font ss:Size="10"/><Font ss:Color="#666666"/></Style>
  <Style ss:ID="hdr"><Font ss:Bold="1"/><Interior ss:Color="#EDE9FE" ss:Pattern="Solid"/></Style>
  <Style ss:ID="num"><NumberFormat ss:Format="#,##0.00"/></Style>
  <Style ss:ID="total"><Font ss:Bold="1"/></Style>
  <Style ss:ID="totalNum"><Font ss:Bold="1"/><NumberFormat ss:Format="#,##0.00"/></Style>
 </Styles>
 <Worksheet ss:Name="Collections">
  <Table>
   <Row><Cell ss:StyleID="title" ss:MergeAcross="${colCount - 1}"><Data ss:Type="String">MEEDO ALUBIJID WATER WORKS</Data></Cell></Row>
   <Row><Cell ss:StyleID="title" ss:MergeAcross="${colCount - 1}"><Data ss:Type="String">${escapeXML(title)}</Data></Cell></Row>
   <Row><Cell ss:StyleID="sub" ss:MergeAcross="${colCount - 1}"><Data ss:Type="String">${escapeXML(opts.periodLabel)} · ${opts.rows.length} record(s)</Data></Cell></Row>
   <Row></Row>
   <Row>${headerCells}</Row>
   ${body}
   <Row>${totalRowCells}</Row>
  </Table>
 </Worksheet>
</Workbook>`

  const stamp = new Date().toISOString().slice(0, 10)
  const file =
    opts.kind === 'outstanding'
      ? `need-to-collect-${stamp}.xls`
      : `collected-this-month-${stamp}.xls`
  downloadXml(file, xml)
}
