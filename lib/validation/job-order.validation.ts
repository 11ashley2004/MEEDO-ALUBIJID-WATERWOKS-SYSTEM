import { z } from 'zod'

// ─── Base — columns that map 1-to-1 into job_orders ──────────────────────────

const baseSchema = z.object({
  service_id:          z.string().min(1, 'Please select a service'),
  zone_id:             z.string().min(1, 'Please select a zone'),
  landmark:            z.string().max(500).optional().nullable(),
  problem_description: z.string().max(1000).optional().nullable(),
})

// ─── Consumer job ─────────────────────────────────────────────────────────────
// consumer_id  → client-only filter, never inserted into job_orders
// connection_id → stored in job_orders
// barangay_id  → client-only; used to filter zone options, never inserted

export const consumerJobOrderSchema = baseSchema.extend({
  consumer_id:   z.string().min(1, 'Please select a consumer'),
  connection_id: z.string().min(1, 'Please select a service connection'),
  barangay_id:   z.string().optional().nullable(),   // display/filter only
})

// ─── Internal job ─────────────────────────────────────────────────────────────
// Admin manually picks barangay then zone.
// barangay_id → client-only filter; zone_id is what gets stored.

export const internalJobOrderSchema = baseSchema.extend({
  barangay_id: z.string().min(1, 'Please select a barangay'),
})

// ─── Exported types ───────────────────────────────────────────────────────────

export type ConsumerJobOrderValues = z.infer<typeof consumerJobOrderSchema>
export type InternalJobOrderValues = z.infer<typeof internalJobOrderSchema>