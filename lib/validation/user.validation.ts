import { z } from "zod"

const validatePHPhone = (val: string) => /^\d{10}$/.test(val)

const MAX_FILE_SIZE   = 1 * 1024 * 1024 // 1 MB
const ALLOWED_TYPES   = ['image/png', 'image/jpeg', 'image/webp'] as const

const profileImageSchema = z
  .instanceof(File)
  .refine((f) => f.size <= MAX_FILE_SIZE, 'Image must be 1 MB or less.')
  .refine((f) => ALLOWED_TYPES.includes(f.type as typeof ALLOWED_TYPES[number]), 'Only PNG, JPG, and WEBP are allowed.')

export const userFormSchema = z.object({
  first_name: z.string()
    .min(2, 'First name must be at least 2 characters')
    .max(50, 'First name must be less than 50 characters'),
  middle_name: z.string()
    .max(50, 'Middle name must be less than 50 characters')
    .optional()
    .nullable(),
  last_name: z.string()
    .min(2, 'Last name must be at least 2 characters')
    .max(50, 'Last name must be less than 50 characters'),
  email: z.string()
    .email('Invalid email address')
    .min(1, 'Email is required'),
  phone: z.string()
    .min(1, 'Phone number is required')
    .refine(validatePHPhone, 'Phone number must be 10 digits'),
  role: z.string()
    .min(1, 'Please select a role'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters'),
  profile: profileImageSchema.optional().nullable(),
})

export const updateUserFormSchema = z.object({
  first_name: z.string()
    .min(2, 'First name must be at least 2 characters')
    .max(50, 'First name must be less than 50 characters'),
  middle_name: z.string()
    .max(50, 'Middle name must be less than 50 characters')
    .optional(),
  last_name: z.string()
    .min(2, 'Last name must be at least 2 characters')
    .max(50, 'Last name must be less than 50 characters'),
  email: z.string()
    .email('Invalid email address')
    .min(1, 'Email is required'),
  phone: z.string()
    .refine(
      (val) => !val || validatePHPhone(val),
      'Phone number must be 10 digits'
    ),
  profile: profileImageSchema.optional().nullable(),
})

export type UserFormValues       = z.infer<typeof userFormSchema>
export type UpdateUserFormValues = z.infer<typeof updateUserFormSchema>