import { z } from "zod"

export const zoneItemSchema = z.object({
  barangay_id: z.string().min(1, 'Please select a barangay'),
  zone_id: z.string().min(1, 'Please select a zone'),
});

export const assignmentFormSchema = z.object({
  user_id: z.string().min(1, 'Please select a meter reader'),
  zones: z.array(zoneItemSchema).min(1, 'At least one zone is required'),
});

export type AssignmentFormValues = z.infer<typeof assignmentFormSchema>;