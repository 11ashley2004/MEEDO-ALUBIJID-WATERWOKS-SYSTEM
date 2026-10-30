// lib/validation/community-charges.validation.ts
import { z } from "zod"

export const communityChargeFormSchema = z.object({
  classification_id: z.string().uuid('Please select a classification'),
  min_consumption: z.number()
    .min(0, 'Minimum consumption must be 0 or greater'),
  max_consumption: z.number()
    .min(0, 'Maximum consumption must be 0 or greater')
    .nullable()
    .optional(),
  multiplier: z.number()
    .min(0, 'Multiplier must be 0 or greater'),
}).refine(data => {
  // If max_consumption is provided and not null, it must be greater than min_consumption
  if (data.max_consumption !== null && data.max_consumption !== undefined) {
    return data.max_consumption > data.min_consumption;
  }
  return true;
}, {
  message: "Maximum consumption must be greater than minimum consumption",
  path: ["max_consumption"],
});

export const updateCommunityChargeFormSchema = communityChargeFormSchema;

export type CommunityChargeFormValues = z.infer<typeof communityChargeFormSchema>;
export type UpdateCommunityChargeFormValues = z.infer<typeof updateCommunityChargeFormSchema>;