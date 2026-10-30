// components/admin-ui/connection-fee-payment/receipt-dialog.tsx

'use client'

import { useEffect, useRef } from 'react'
import type { PaidMeterAccount } from '@/lib/actions/payment/connection-fee-payment.actions'

interface ReceiptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  account: PaidMeterAccount | null
}

function formatPeso(n: number): string {
  return new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

// ── Amount-in-words (Philippine peso convention) ───────────────────────────
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
  'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function threeDigitsToWords(n: number): string {
  let str = ''
  if (n >= 100) {
    str += `${ONES[Math.floor(n / 100)]} Hundred `
    n %= 100
  }
  if (n >= 20) {
    str += `${TENS[Math.floor(n / 10)]} `
    n %= 10
  }
  if (n > 0) {
    str += `${ONES[n]} `
  }
  return str.trim()
}

function numberToWords(n: number): string {
  if (n === 0) return 'Zero'
  const groups = ['', 'Thousand', 'Million', 'Billion']
  let groupIndex = 0
  let result = ''
  while (n > 0) {
    const chunk = n % 1000
    if (chunk > 0) {
      const chunkWords = threeDigitsToWords(chunk)
      result = `${chunkWords} ${groups[groupIndex]} ${result}`.trim()
    }
    n = Math.floor(n / 1000)
    groupIndex++
  }
  return result
}

function amountInWords(amount: number): string {
  const pesos = Math.floor(amount)
  const centavos = Math.round((amount - pesos) * 100)
  const pesoWords = `${numberToWords(pesos)} Peso${pesos === 1 ? '' : 's'}`
  if (centavos > 0) {
    return `${pesoWords} and ${centavos}/100 Only`
  }
  return `${pesoWords} Only`
}

export function ReceiptDialog({ open, onOpenChange, account }: ReceiptDialogProps) {
  const hasOpenedRef = useRef(false)

  useEffect(() => {
    // Only open the print window once when dialog opens
    if (open && account && !hasOpenedRef.current) {
      hasOpenedRef.current = true

      const printWindow = window.open('', '_blank', 'width=650,height=800')

      if (!printWindow) {
        onOpenChange(false)
        return
      }

      const logoUrl = `${window.location.origin}/meedo-logo-removebg.png`
      const amountStr = formatPeso(account.total_connection_fee)
      const wordsStr = amountInWords(account.total_connection_fee)

      // Use the processed_by_name from the account
      const treasurerName = account.processed_by_name || 'Treasurer'

      // Generate receipt HTML
      const receiptHTML = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Official Receipt - ${account.receipt_number}</title>
            <style>
              * { box-sizing: border-box; }
              body {
                font-family: 'Georgia', 'Times New Roman', serif;
                margin: 0;
                padding: 24px 16px;
                background: #fff;
                display: flex;
                justify-content: center;
                color: #1a1a1a;
              }
              .receipt {
                width: 100%;
                max-width: 480px;
                border: 2px solid #1a1a1a;
                border-radius: 4px;
                padding: 18px 20px 14px;
              }

              /* ── Header ── */
              .header {
                display: flex;
                align-items: center;
                gap: 12px;
                border-bottom: 2px solid #1a1a1a;
                padding-bottom: 10px;
                margin-bottom: 10px;
              }
              .header img {
                width: 52px;
                height: 52px;
                object-fit: contain;
                flex-shrink: 0;
              }
              .header-text { flex: 1; text-align: center; }
              .header-text .title {
                font-size: 19px;
                font-weight: 700;
                letter-spacing: 3px;
                margin: 0 0 3px;
              }
              .header-text .subtitle {
                font-size: 10.5px;
                margin: 1px 0;
                color: #333;
              }
              .header-text .office {
                font-size: 10.5px;
                font-weight: 700;
                margin: 2px 0 0;
                letter-spacing: 0.5px;
              }

              .municipality-row {
                display: flex;
                justify-content: space-between;
                align-items: baseline;
                font-size: 11px;
                margin-bottom: 8px;
              }
              .municipality-row .muni-label { font-weight: 700; }
              .municipality-row .form-no { font-size: 9.5px; color: #555; text-align: right; }

              /* ── OR number / date / status strip ── */
              .or-strip {
                display: flex;
                justify-content: space-between;
                align-items: center;
                border: 1px solid #1a1a1a;
                border-radius: 4px;
                padding: 6px 10px;
                margin-bottom: 10px;
              }
              .or-strip .or-no {
                font-size: 15px;
                font-weight: 700;
                color: #b91c1c;
                letter-spacing: 1px;
              }
              .or-strip .or-no .hash { color: #1a1a1a; font-weight: 400; margin-right: 3px; }
              .or-strip .or-meta { text-align: right; font-size: 10.5px; }
              .or-strip .or-meta .original-tag {
                display: inline-block;
                font-size: 9.5px;
                font-weight: 700;
                letter-spacing: 1.5px;
                border: 1px solid #1a1a1a;
                border-radius: 3px;
                padding: 1px 6px;
                margin-bottom: 2px;
              }

              /* ── Field rows (Payor) ── */
              .field-block {
                border: 1px solid #1a1a1a;
                border-radius: 4px;
                margin-bottom: 8px;
                overflow: hidden;
              }
              .field-row {
                display: flex;
                font-size: 11px;
                border-bottom: 1px solid #ddd;
              }
              .field-row:last-child { border-bottom: none; }
              .field-row .field-label {
                width: 74px;
                flex-shrink: 0;
                padding: 5px 8px;
                font-weight: 700;
                background: #f5f5f0;
                border-right: 1px solid #1a1a1a;
              }
              .field-row .field-value {
                flex: 1;
                padding: 5px 8px;
              }

              /* ── Nature of Collection table ── */
              .collection-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 11px;
                margin-bottom: 8px;
              }
              .collection-table th {
                border: 1px solid #1a1a1a;
                background: #f5f5f0;
                padding: 5px 8px;
                font-size: 9.5px;
                letter-spacing: 0.5px;
                text-align: left;
              }
              .collection-table th.amount-col,
              .collection-table td.amount-col { text-align: right; width: 90px; }
              .collection-table td {
                border: 1px solid #1a1a1a;
                padding: 6px 8px;
              }
              .collection-table tfoot td {
                font-weight: 700;
                border-top: 2px solid #1a1a1a;
              }

              /* ── Amount in words ── */
              .words-block {
                border: 1px solid #1a1a1a;
                border-radius: 4px;
                padding: 6px 8px;
                margin-bottom: 10px;
                font-size: 10.5px;
              }
              .words-block .words-label {
                font-size: 9px;
                font-weight: 700;
                letter-spacing: 1px;
                color: #555;
                display: block;
                margin-bottom: 2px;
              }
              .words-block .words-value {
                font-style: italic;
                text-decoration: underline;
              }

              /* ── Payment method ── */
              .payment-method {
                display: flex;
                gap: 14px;
                font-size: 10.5px;
                margin-bottom: 10px;
                padding: 0 2px;
              }
              .payment-method .pm-item { display: flex; align-items: center; gap: 4px; }
              .payment-method .pm-box {
                width: 11px;
                height: 11px;
                border: 1.2px solid #1a1a1a;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 9px;
                font-weight: 900;
              }
              .payment-method .pm-box.checked::after { content: '✓'; }

              /* ── Signature ── */
              .signature-block {
                display: flex;
                justify-content: space-between;
                align-items: flex-end;
                margin-top: 18px;
                padding-top: 6px;
              }
              .signature-block .sig-line {
                text-align: center;
                width: 55%;
              }
              .signature-block .sig-name {
                font-weight: 700;
                font-size: 12px;
                border-bottom: 1px solid #1a1a1a;
                padding-bottom: 2px;
                margin-bottom: 3px;
              }
              .signature-block .sig-title {
                font-size: 9.5px;
                letter-spacing: 1px;
                text-transform: uppercase;
                color: #333;
              }

              /* ── Footer note ── */
              .footer-note {
                margin-top: 14px;
                padding-top: 8px;
                border-top: 1px dashed #999;
                font-size: 8.5px;
                color: #555;
                line-height: 1.4;
              }
              .footer-note b { color: #1a1a1a; }

              @media print {
                body { padding: 0; }
                .receipt { border-color: #1a1a1a; }
              }
            </style>
          </head>
          <body>
            <div class="receipt">

              <!-- Header -->
              <div class="header">
                <img src="${logoUrl}" alt="MEEDO Waterworks" />
                <div class="header-text">
                  <p class="title">OFFICIAL RECEIPT</p>
                  <p class="subtitle">Republic of the Philippines</p>
                  <p class="subtitle">MEEDO Waterworks</p>
                  <p class="office">OFFICE OF THE TREASURER</p>
                </div>
              </div>

              <div class="municipality-row">
                <span><span class="muni-label">Municipality:</span> —</span>
                <span class="form-no">Accountable Form No. 51<br/>Revised August 1994</span>
              </div>

              <!-- OR number strip -->
              <div class="or-strip">
                <div class="or-no"><span class="hash">#</span>${account.receipt_number}</div>
                <div class="or-meta">
                  <div class="original-tag">ORIGINAL</div>
                  <div>${formatDate(account.paid_at)}</div>
                </div>
              </div>

              <!-- Payor -->
              <div class="field-block">
                <div class="field-row">
                  <div class="field-label">PAYOR</div>
                  <div class="field-value">${account.consumer_name}</div>
                </div>
                <div class="field-row">
                  <div class="field-label">METER ACCT</div>
                  <div class="field-value">${account.meter_serial_no}</div>
                </div>
              </div>

              <!-- Nature of Collection -->
              <table class="collection-table">
                <thead>
                  <tr>
                    <th>NATURE OF COLLECTION</th>
                    <th class="amount-col">AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Connection Fee</td>
                    <td class="amount-col">₱${amountStr}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <td>TOTAL</td>
                    <td class="amount-col">₱${amountStr}</td>
                  </tr>
                </tfoot>
              </table>

              <!-- Amount in words -->
              <div class="words-block">
                <span class="words-label">AMOUNT IN WORDS</span>
                <span class="words-value">${wordsStr}</span>
              </div>

              <!-- Payment method -->
              <div class="payment-method">
                <div class="pm-item"><span class="pm-box checked"></span> Cash</div>
                <div class="pm-item"><span class="pm-box"></span> Check</div>
                <div class="pm-item"><span class="pm-box"></span> Money Order</div>
              </div>

              <!-- Signature -->
              <div class="signature-block">
                <div class="sig-line">
                  <div class="sig-name">${treasurerName}</div>
                  <div class="sig-title">COLLECTING OFFICER</div>
                </div>
              </div>

              <!-- Footer -->
              <div class="footer-note">
                <b>NOTE:</b> This receipt is valid only for the amount and transaction stated above.
                Please keep this receipt for your records.
              </div>
            </div>

            <script>
              window.onload = function() {
                window.print();
                window.onafterprint = function() {
                  window.close();
                };
              }
            <\/script>
          </body>
        </html>
      `

      printWindow.document.write(receiptHTML)
      printWindow.document.close()

      onOpenChange(false)
    }

    if (!open) {
      hasOpenedRef.current = false
    }
  }, [open, account, onOpenChange])

  return null
}