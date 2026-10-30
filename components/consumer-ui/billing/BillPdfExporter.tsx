// components/consumer-ui/billing/BillPdfExporter.tsx
'use client'

import { forwardRef, useImperativeHandle, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { toast } from 'sonner'
import html2canvas from 'html2canvas-pro'
import jsPDF from 'jspdf'
import { getConsumerBillingById } from '@/lib/actions/billing/consumer-billing.actions'
import { WaterBillDocument } from '@/components/consumer-ui/billing/WaterBillDocument'

export interface BillPdfExporterHandle {
  download: (billingId: string) => Promise<void>
}

/**
 * Direct-to-PDF download: renders WaterBillDocument into a hidden, fixed-width
 * off-screen container, rasterizes it with html2canvas, embeds the image in a
 * jsPDF document sized to A4, then triggers a real file download — no browser
 * print dialog involved.
 */
export const BillPdfExporter = forwardRef<BillPdfExporterHandle>((_, ref) => {
  const [isDownloading, setIsDownloading] = useState(false)

  useImperativeHandle(ref, () => ({
    async download(billingId: string) {
      if (isDownloading) return
      setIsDownloading(true)
      const toastId = toast.loading('Preparing your bill…')

      let container: HTMLDivElement | null = null
      let root: Root | null = null

      const cleanup = () => {
        try { root?.unmount() } catch {}
        container?.remove()
      }

      try {
        const res = await getConsumerBillingById(billingId)
        if (res.status !== 'success' || !res.data) {
          toast.error(res.message ?? 'Failed to load bill', { id: toastId })
          return
        }

        const data = res.data

        const printable = {
          ...data,
          meter_account: {
            ...data.meter_account,
            consumer: data.consumer,
          },
        }

        // ── Off-screen container, fixed to A4 pixel width @ 96dpi ──────
        const A4_WIDTH_PX = 794 // ~210mm at 96dpi

        container = document.createElement('div')
        container.style.position = 'fixed'
        container.style.top = '0'
        container.style.left = '-9999px'
        container.style.width = `${A4_WIDTH_PX}px`
        container.style.background = '#ffffff'
        document.body.appendChild(container)

        root = createRoot(container)
        root.render(<WaterBillDocument record={printable} />)

        // Let React paint before we capture it.
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        )

        const canvas = await html2canvas(container, {
          scale: 2, // sharper output
          backgroundColor: '#ffffff',
          useCORS: true,
        })

        const imgData = canvas.toDataURL('image/png')

        // ── Build the PDF ───────────────────────────────────────────
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4',
        })

        const pageWidth = pdf.internal.pageSize.getWidth()
        const pageHeight = pdf.internal.pageSize.getHeight()

        // Scale the captured image to fit page width, preserve aspect ratio
        const imgWidth = pageWidth
        const imgHeight = (canvas.height * imgWidth) / canvas.width

        let heightLeft = imgHeight
        let position = 0

        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
        heightLeft -= pageHeight

        // Add extra pages if the bill overflows one A4 page
        while (heightLeft > 0) {
          position = heightLeft - imgHeight
          pdf.addPage()
          pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
          heightLeft -= pageHeight
        }

        const filename = `water-bill-${printable.meter_account?.meter_serial_no ?? billingId}.pdf`
        pdf.save(filename) // triggers a real file download, no dialog

        toast.success('Bill downloaded', { id: toastId })
      } catch (err) {
        console.error('[BillPdfExporter]', err)
        toast.error('Failed to generate bill PDF', { id: toastId })
      } finally {
        cleanup()
        setIsDownloading(false)
      }
    },
  }))

  return null
})

BillPdfExporter.displayName = 'BillPdfExporter'