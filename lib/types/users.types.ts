interface User {
  user_id: string; // UUID - string, not number
  role_id: string; // UUID - string, not number
  first_name: string
  last_name: string
  middle_name?: string
  email: string
  contact_number: string
  is_active: boolean
  created_at: string
  role?: {
    role_name: string
  }
}