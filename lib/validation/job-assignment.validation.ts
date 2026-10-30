import { z } from 'zod'

const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export const assignJobOrderSchema = z.object({
  user_id: z.string().min(1, 'Please select a worker'),

  scheduled_at: z
    .string()
    .min(1, 'Scheduled date & time is required')
    .refine((v) => !isNaN(Date.parse(v)), 'Invalid scheduled date')
    .refine(
      (v) => new Date(v) >= startOfToday(),
      'Scheduled date cannot be in the past',
    ),

  helper_ids: z.array(z.string()).optional(),
})

export type AssignJobOrderValues = z.infer<typeof assignJobOrderSchema>