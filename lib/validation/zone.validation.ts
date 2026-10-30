import { z } from "zod"

export const zoneFormSchema = z.object({
  zone_name: z.string()
    .min(1, 'Zone name must be at least 2 characters')
    .max(100, 'Zone name must be less than 100 characters'),
  barangay_id: z.string()
    .min(1, 'Please select a barangay'),
});

export const updateZoneFormSchema = zoneFormSchema;

export type ZoneFormValues = z.infer<typeof zoneFormSchema>;
export type UpdateZoneFormValues = z.infer<typeof updateZoneFormSchema>;