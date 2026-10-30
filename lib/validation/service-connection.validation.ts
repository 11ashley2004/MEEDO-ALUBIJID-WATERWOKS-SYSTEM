// lib/validation/service-connection.validation.ts
import { z } from 'zod'

export const serviceConnectionFormSchema = z.object({
  connection_no: z.string().optional(), // Auto-generated, not required from form
  consumer_id: z.string()
    .min(1, 'Consumer is required'),
  zone_id: z.string()
    .min(1, 'Zone is required'),
  classification_id: z.string()
    .min(1, 'Classification is required'),
   meter_serial_no: z.string().optional(),
})

export type ServiceConnectionFormValues = z.infer<typeof serviceConnectionFormSchema>

export const updateServiceConnectionFormSchema = z.object({
  connection_no: z.string().optional(), // Cannot be changed after creation
  zone_id: z.string()
    .min(1, 'Zone is required')
    .optional(),
  classification_id: z.string()
    .min(1, 'Classification is required')
    .optional(),
})

export type UpdateServiceConnectionFormValues = z.infer<typeof updateServiceConnectionFormSchema>