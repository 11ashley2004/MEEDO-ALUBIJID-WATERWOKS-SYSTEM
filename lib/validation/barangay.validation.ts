import { z } from "zod"

export const barangayFormSchema = z.object({
  barangay_name: z.string()
    .min(2, 'Barangay name must be at least 2 characters')
    .max(100, 'Barangay name must be less than 100 characters'),
});

export const updateBarangayFormSchema = barangayFormSchema;

export type BarangayFormValues = z.infer<typeof barangayFormSchema>;
export type UpdateBarangayFormValues = z.infer<typeof updateBarangayFormSchema>;