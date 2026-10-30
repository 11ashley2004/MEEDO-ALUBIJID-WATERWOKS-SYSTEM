import { z } from 'zod'

// ── Ownership Transfer ────────────────────────────────────────────────────────

export const ownershipTransferSchema = z.object({
  transfer_type:        z.literal('OWNERSHIP'),
  new_consumer_id:      z.string().uuid('Please select the new consumer.'),
  transfer_reason:      z.string().optional().nullable(),
})

// ── Relocation Transfer ───────────────────────────────────────────────────────

export const relocationTransferSchema = z.object({
  transfer_type:        z.literal('RELOCATION'),
  new_barangay_id:      z.string().uuid('Please select a barangay.'),
  new_address_id:       z.string().uuid('Please select the new zone.'),
  transfer_reason:      z.string().optional().nullable(),
})

// ── Union ─────────────────────────────────────────────────────────────────────

export const transferSchema = z.discriminatedUnion('transfer_type', [
  ownershipTransferSchema,
  relocationTransferSchema,
])

export type OwnershipTransferValues  = z.infer<typeof ownershipTransferSchema>
export type RelocationTransferValues = z.infer<typeof relocationTransferSchema>
export type TransferFormValues       = z.infer<typeof transferSchema>