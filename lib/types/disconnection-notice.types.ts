// ============================================================
// NOTICE OF DISCONNECTION — TYPES
// ============================================================

export interface EligibleConnection {
  connection_id: string
  connection_no: string
  consumer_id: string
  consumer_name: string
  zone_id: string
  zone_name: string
  barangay_id: string
  barangay_name: string
  total_outstanding: number
  months_unpaid: number
  last_payment_date: string | null
  rule_matched: 1 | 2 | 3 | null
}

export interface DisconnectionRule {
  r1: boolean // High Outstanding Balance
  r2: boolean // No Payment / No Partial Payment
  r3: boolean // Either Rule (R1 OR R2)
}

export interface DisconnectionFilters {
  barangay_id: string  // '' = all
  zone_id: string      // '' = all
  as_of_date: string   // ISO date string YYYY-MM-DD
  min_balance: number  // Rule 1 threshold
  min_months: number   // Rule 2 threshold
}

export interface NoticeOfDisconnection {
  notice_id: string
  notice_no: string
  generated_at: string
  generated_by: string
  total_accounts: number
  total_outstanding: number
  status: 'pending' | 'issued' | 'executed' | 'cancelled'
  rule_used: string
}

export interface NoticeConnection {
  notice_sc_id: string
  connection_id: string
  connection_no: string
  consumer_name: string
  zone_name: string
  barangay_name: string
  balance_snapshot: number
  months_unpaid: number
}

export interface Barangay {
  barangay_id: string
  barangay_name: string
}

export interface Zone {
  zone_id: string
  zone_name: string
  barangay_id: string
}

export interface RuleSummary {
  r1: number
  r2: number
  r3: number
  total: number
  totalAmount: number
}