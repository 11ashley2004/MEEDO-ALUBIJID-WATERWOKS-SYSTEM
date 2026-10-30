import { z } from 'zod'

export const meterFormSchema = z.object({
  connection_id: z.string().uuid('Please select a valid service connection'),
  meter_serial_no: z
    .string()
    .min(3, 'Meter serial number must be at least 3 characters')
    .max(100, 'Meter serial number must be less than 100 characters')
    .regex(
      /^[A-Za-z0-9\-_]+$/,
      'Only letters, numbers, hyphens, and underscores are allowed'
    ),
})

export const updateMeterFormSchema = z.object({
  connection_id: z.string().uuid('Please select a valid service connection'),
  meter_serial_no: z
    .string()
    .min(3, 'Meter serial number must be at least 3 characters')
    .max(100, 'Meter serial number must be less than 100 characters')
    .regex(
      /^[A-Za-z0-9\-_]+$/,
      'Only letters, numbers, hyphens, and underscores are allowed'
    ),
})

export type MeterFormValues = z.infer<typeof meterFormSchema>
export type UpdateMeterFormValues = z.infer<typeof updateMeterFormSchema>