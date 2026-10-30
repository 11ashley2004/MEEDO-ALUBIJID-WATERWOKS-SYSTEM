import { z } from "zod"

export const classificationFormSchema = z.object({
  classification_name: z.string()
    .min(2, 'Classification name must be at least 2 characters')
    .max(100, 'Classification name must be less than 100 characters'),
  description: z.string()
    .min(5, 'Description must be at least 5 characters')
    .max(500, 'Description must be less than 500 characters'),
  connection_fee: z.number()
    .min(0, 'Connection fee must be 0 or greater'),
});

export const updateClassificationFormSchema = classificationFormSchema;

export type ClassificationFormValues = z.infer<typeof classificationFormSchema>;
export type UpdateClassificationFormValues = z.infer<typeof updateClassificationFormSchema>;