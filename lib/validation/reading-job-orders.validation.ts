import { z } from 'zod';

export const readingJobOrderSchema = z.object({
  reading_period: z.string().min(1, 'Reading period is required'),  // Renamed
  reading_start: z.string().min(1, 'Start date is required'),
  reading_end: z.string().min(1, 'End date is required'),
}).refine(
  (data) => new Date(data.reading_end) > new Date(data.reading_start),
  {
    message: 'End date must be after start date',
    path: ['reading_end'],
  }
);

export const updateJobOrderSchema = z.object({
  reading_start: z.string().min(1, 'Start date is required'),
  reading_end: z.string().min(1, 'End date is required'),
}).refine(
  (data) => new Date(data.reading_end) > new Date(data.reading_start),
  {
    message: 'End date must be after start date',
    path: ['reading_end'],
  }
);

export const extendJobOrderSchema = z.object({
  extended_end: z.string().min(1, 'Extended end date is required'),
  extension_reason: z.string().min(10, 'Please provide a detailed reason (minimum 10 characters)'),
});

export type ReadingJobOrderFormValues = z.infer<typeof readingJobOrderSchema>;
export type UpdateJobOrderFormValues = z.infer<typeof updateJobOrderSchema>;
export type ExtendJobOrderFormValues = z.infer<typeof extendJobOrderSchema>;