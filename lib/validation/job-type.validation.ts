import { z } from 'zod'

export const jobTypeFormSchema = z.object({
  job_type_name: z.string().min(1, 'Job type name is required').max(100),
  skill_id: z.string().min(1, 'Please select a skill'),
  job_type_category: z.boolean(),
})

export type JobTypeFormValues = z.infer<typeof jobTypeFormSchema>