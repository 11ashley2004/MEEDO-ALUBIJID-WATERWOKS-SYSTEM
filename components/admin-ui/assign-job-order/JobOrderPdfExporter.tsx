// components/admin-ui/assign-job-order/JobOrderPdfExporter.tsx
'use client'

import { forwardRef, useImperativeHandle, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { toast } from 'sonner'
import html2canvas from 'html2canvas-pro'
import jsPDF from 'jspdf'
import {
  getJobTypes,
  type JobAssignmentListItem,
} from '@/lib/actions/job-assignment/job-assignment.actions'
import {
  JobOrderFormDocument, PAGE_W, PAGE_H, FORM_H,
} from '@/components/admin-ui/assign-job-order/JobOrderFormDocument'

export interface JobOrderPdfExporterHandle {
  // Pass assignmentOrderId to export just that one job order (one form);
  // omit it to export every non-cancelled job order in the trip.
  download: (assignment: JobAssignmentListItem, assignmentOrderId?: string) => Promise<void>
}

const FORMS_PER_PAGE = 2

// Put the municipal logo in /public (e.g. public/logo.png). If the file is
// missing the form simply prints without it.
const LOGO_SRC = '/meedo-logo-removebg.png'

/**
 * Builds a printable PDF of every (non-cancelled) job order in one assignment.
 * One job order = one separate form. Two forms per A4 page, so 1–2 job orders
 * make one page, 3–4 make two pages, and so on.
 */
export const JobOrderPdfExporter = forwardRef<JobOrderPdfExporterHandle>((_, ref) => {
  const [busy, setBusy] = useState(false)

  useImperativeHandle(ref, () => ({
    async download(assignment, assignmentOrderId) {
      if (busy) return

      const orders = assignment.job_orders.filter((o) =>
        assignmentOrderId
          ? o.assignment_order_id === assignmentOrderId
          : o.status_code !== 'CANCELLED',
      )
      if (orders.length === 0) {
        toast.error('No active job orders to export')
        return
      }

      setBusy(true)
      const toastId = toast.loading('Preparing job order forms…')

      let container: HTMLDivElement | null = null
      let root: Root | null = null

      try {
        // Job types come from the database, not from a hard-coded list
        const jobTypes = await getJobTypes()
        if (jobTypes.length === 0) {
          toast.error('No job types are configured', { id: toastId })
          return
        }

        // Split into pages of 2 forms each
        const pages: typeof orders[] = []
        for (let i = 0; i < orders.length; i += FORMS_PER_PAGE) {
          pages.push(orders.slice(i, i + FORMS_PER_PAGE))
        }

        container = document.createElement('div')
        container.style.position = 'fixed'
        container.style.top = '0'
        container.style.left = '-9999px'
        container.style.width = `${PAGE_W}px`
        container.style.background = '#ffffff'
        document.body.appendChild(container)

        root = createRoot(container)
        root.render(
          <>
            {pages.map((pageOrders, p) => (
              <div
                key={p}
                data-page
                style={{ width: PAGE_W, height: PAGE_H, background: '#ffffff', overflow: 'hidden' }}
              >
                {Array.from({ length: FORMS_PER_PAGE }).map((_, slot) => {
                  const jo = pageOrders[slot]
                  return (
                    <div
                      key={slot}
                      style={{
                        width: PAGE_W,
                        height: FORM_H,
                        boxSizing: 'border-box',
                        position: 'relative',
                      }}
                    >
                      {jo && (
                        <JobOrderFormDocument
                          jobOrder={jo}
                          jobTypes={jobTypes}
                          logoSrc={LOGO_SRC}
                          assignedTo={assignment.assigned_to_name}
                          helpers={assignment.helpers.map((h) => h.full_name)}
                          preparedBy={assignment.assign_by_name}
                          scheduledAt={assignment.scheduled_at}
                        />
                      )}
                      {/* Cut-line reminder, sits on the edge between the two forms */}
                      {slot === 0 && (
                        <div
                          style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            bottom: -7,
                            zIndex: 1,
                            textAlign: 'center',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            fontFamily: 'Arial, Helvetica, sans-serif',
                            fontSize: 9,
                            lineHeight: '14px',
                            color: '#666',
                          }}
                        >
                          {'- '.repeat(70)} CUT HERE {' -'.repeat(70)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </>,
        )

        // let React paint
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

        // make sure the logo (if any) has loaded or failed before we capture
        await Promise.all(
          Array.from(container.querySelectorAll('img')).map((img) =>
            img.complete
              ? Promise.resolve()
              : new Promise<void>((r) => { img.onload = () => r(); img.onerror = () => r() }),
          ),
        )

        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
        const pw = pdf.internal.pageSize.getWidth()
        const ph = pdf.internal.pageSize.getHeight()

        const pageEls = Array.from(container.querySelectorAll<HTMLElement>('[data-page]'))
        for (let i = 0; i < pageEls.length; i++) {
          const canvas = await html2canvas(pageEls[i], {
            scale: 2,
            backgroundColor: '#ffffff',
            useCORS: true,
          })
          if (i > 0) pdf.addPage()
          pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pw, ph)
        }

        const safeName = assignment.assigned_to_name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
        pdf.save(`job-orders-${safeName}-${assignment.job_assignment_id.slice(0, 8)}.pdf`)

        toast.success(`Exported ${orders.length} job order${orders.length !== 1 ? 's' : ''}`, { id: toastId })
      } catch (err) {
        console.error('[JobOrderPdfExporter]', err)
        toast.error('Failed to generate job order PDF', { id: toastId })
      } finally {
        try { root?.unmount() } catch {}
        container?.remove()
        setBusy(false)
      }
    },
  }))

  return null
})

JobOrderPdfExporter.displayName = 'JobOrderPdfExporter'