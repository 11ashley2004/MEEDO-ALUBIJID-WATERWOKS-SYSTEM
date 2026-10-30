import { z } from 'zod';

// Helper function for 11-digit phone number validation
const validate11DigitPhone = (val: string) => /^\d{11}$/.test(val)

export const consumerFormSchema = z.object({
  first_name: z.string()
    .min(1, 'First name is required')
    .max(100, 'First name must be less than 100 characters'),
  last_name: z.string()
    .min(1, 'Last name is required')
    .max(100, 'Last name must be less than 100 characters'),
  middle_name: z.string()
    .min(1, 'Middle name is required')
    .max(100, 'Middle name must be less than 100 characters'),
  email: z.string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
  contact_number: z.string()
    .min(1, 'Contact number is required')
    .refine(validate11DigitPhone, 'Contact number must be exactly 11 digits'),
});

export type ConsumerFormValues = z.infer<typeof consumerFormSchema>;

export const updateConsumerFormSchema = consumerFormSchema;

export type UpdateConsumerFormValues = z.infer<typeof updateConsumerFormSchema>;