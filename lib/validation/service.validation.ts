import { z } from 'zod'

export const serviceFormSchema = z.object({
  service_name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be less than 100 characters'),

  skill_id: z.string().min(1, 'Please select a skill'),

  service_category: z.enum(['consumer', 'internal', 'both'], {
    message: 'Please select a category',
  }),
})

export type ServiceFormValues = z.infer<typeof serviceFormSchema>