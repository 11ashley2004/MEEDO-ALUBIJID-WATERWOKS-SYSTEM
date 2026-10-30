'use server'

import { createClient } from '@/lib/supabase/server'
import { createAuditLog } from '../audit.action'

export interface MeterAccountOption {
  meter_account_id: string
  meter_serial_no: string | null
  consumer_id: string
  consumer_name: string
  zone_name: string
  barangay_name: string
  classification_name: string
}

export interface IssueTypeOption {
  issue_type_id: string
  issue_name: string
  description: string | null
  billing_basis_code: string | null
  affects_billing: boolean
}

export interface IssueReportListItem {
  issue_report_id: string
  meter_account_id: string
  meter_serial_no: string | null
  consumer_name: string
  zone_name: string
  barangay_name: string
  issue_type_id: string
  issue_name: string
  billing_basis_code: string | null
  report_description: string | null
  report_status_id: string
  report_status_name: string
  report_by_name: string
  approved_by_name: string | null
  approved_at: string | null
  created_at: string
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function latestMeterSerialFromMeters(meters: unknown): string | null {
  const list = Array.isArray(meters) ? meters : meters ? [meters] : []
  if (!list.length) return null
  let best: any = list[0]
  for (const m of list) {
    const bt = best?.created_at ? new Date(best.created_at).getTime() : 0
    const mt = m?.created_at ? new Date(m.created_at).getTime() : 0
    if (mt >= bt) best = m
  }
  return best?.meter_serial_no ?? null
}

function unwrap<T>(val: T | T[] | null | undefined): T | null {
  if (val == null) return null
  return Array.isArray(val) ? (val[0] ?? null) : val
}

// =====================
// LOOKUPS
// =====================

export async function getReadingIssues(): Promise<IssueTypeOption[]> {
  const supabase = await createClient()
  
  // Only get issues that affect billing (affects_billing = TRUE)
  const { data, error } = await supabase
    .from('meter_issue_types')
    .select(`
      issue_type_id,
      issue_name,
      description,
      affects_billing,
      billing_basis:billing_basis_id ( basis_code )
    `)
    .eq('affects_billing', true)
    .order('issue_name', { ascending: true })

  if (error) {
    console.error('Error fetching reading issues:', error)
    return []
  }

  return (data || []).map((d: any) => ({
    issue_type_id: d.issue_type_id,
    issue_name: d.issue_name,
    description: d.description,
    billing_basis_code: d.billing_basis?.basis_code ?? null,
    affects_billing: d.affects_billing,
  }))
}

// =====================
// SEARCH METER ACCOUNTS
// =====================

export async function searchMeterAccounts(query: string): Promise<{
  success: boolean
  data?: MeterAccountOption[]
  error?: string
}> {
  const supabase = await createClient()

  try {
    const q = query.trim()
    if (q.length < 2) return { success: true, data: [] }

    // ─── Get the meter status IDs we want to EXCLUDE ───────────────────────
    // Exclude: Defective, Stolen, Waterleak_After_Meter (already have issues)
    const { data: defectiveStatus } = await supabase
      .from('meter_status')
      .select('meter_status_id')
      .ilike('meter_status_name', 'Defective')
      .maybeSingle()

    const { data: stolenStatus } = await supabase
      .from('meter_status')
      .select('meter_status_id')
      .ilike('meter_status_name', 'Stolen')
      .maybeSingle()

    const { data: waterleakStatus } = await supabase
      .from('meter_status')
      .select('meter_status_id')
      .ilike('meter_status_name', 'Waterleak_After_Meter')
      .maybeSingle()

    const excludedStatusIds = [
      defectiveStatus?.meter_status_id,
      stolenStatus?.meter_status_id,
      waterleakStatus?.meter_status_id,
    ].filter(Boolean)

    // ─── Search by meter serial number (excluding problematic meters) ──────
    let bySerial: any[] = []
    let serialError: any = null

    if (excludedStatusIds.length > 0) {
      const { data, error } = await supabase
        .from('meters')
        .select(`
          meter_account_id,
          meter_serial_no,
          meter_status_id,
          meter_accounts:meter_account_id (
            meter_account_id,
            consumer_id,
            consumers:consumer_id ( account_name ),
            zone:zone_id (
              zone_name,
              barangay:barangay_id ( barangay_name )
            ),
            classifications:classification_id ( classification_name )
          )
        `)
        .ilike('meter_serial_no', `%${q}%`)
        .not('meter_status_id', 'in', `(${excludedStatusIds.join(',')})`)
        .limit(50)

      bySerial = data || []
      serialError = error
    } else {
      const { data, error } = await supabase
        .from('meters')
        .select(`
          meter_account_id,
          meter_serial_no,
          meter_status_id,
          meter_accounts:meter_account_id (
            meter_account_id,
            consumer_id,
            consumers:consumer_id ( account_name ),
            zone:zone_id (
              zone_name,
              barangay:barangay_id ( barangay_name )
            ),
            classifications:classification_id ( classification_name )
          )
        `)
        .ilike('meter_serial_no', `%${q}%`)
        .limit(50)

      bySerial = data || []
      serialError = error
    }

    if (serialError) throw serialError

    // ─── Search by meter serial (excluding problematic meters) ───────────────
    let byAccountNo: any[] = []
    let accountError: any = null

    if (excludedStatusIds.length > 0) {
      const { data, error } = await supabase
        .from('meters')
        .select(`
          meter_serial_no,
          meter_account:meter_account_id (
            meter_account_id,
            consumer_id,
            consumers:consumer_id ( account_name ),
            zone:zone_id (
              zone_name,
              barangay:barangay_id ( barangay_name )
            ),
            classifications:classification_id ( classification_name )
          )
        `)
        .ilike('meter_serial_no', `%${q}%`)
        .limit(50)

      byAccountNo = (data ?? [])
        .map((m: any) => {
          const ma = Array.isArray(m.meter_account) ? m.meter_account[0] : m.meter_account
          if (!ma) return null
          return { ...ma, meter_serial_no: m.meter_serial_no }
        })
        .filter(Boolean)
      accountError = error

      // Filter out accounts that have a Defective/Stolen/Waterleak meter
      if (byAccountNo.length > 0 && excludedStatusIds.length > 0) {
        const accountIds = byAccountNo.map((a: any) => a.meter_account_id)
        const { data: badMeters } = await supabase
          .from('meters')
          .select('meter_account_id')
          .in('meter_account_id', accountIds)
          .in('meter_status_id', excludedStatusIds)

        const badAccountIds = new Set(badMeters?.map((m: any) => m.meter_account_id) || [])
        byAccountNo = byAccountNo.filter((a: any) => !badAccountIds.has(a.meter_account_id))
      }
    } else {
      const { data, error } = await supabase
        .from('meters')
        .select(`
          meter_serial_no,
          meter_account:meter_account_id (
            meter_account_id,
            consumer_id,
            consumers:consumer_id ( account_name ),
            zone:zone_id (
              zone_name,
              barangay:barangay_id ( barangay_name )
            ),
            classifications:classification_id ( classification_name )
          )
        `)
        .ilike('meter_serial_no', `%${q}%`)
        .limit(50)

      byAccountNo = (data ?? [])
        .map((m: any) => {
          const ma = Array.isArray(m.meter_account) ? m.meter_account[0] : m.meter_account
          if (!ma) return null
          return { ...ma, meter_serial_no: m.meter_serial_no }
        })
        .filter(Boolean)
      accountError = error
    }

    if (accountError) throw accountError

    // ─── Search by consumer name (excluding problematic meters) ─────────────
    let byName: any[] = []
    let nameError: any = null

    if (excludedStatusIds.length > 0) {
      const { data, error } = await supabase
        .from('meter_accounts')
        .select(`
          meter_account_id,
          consumer_id,
          consumers:consumer_id!inner ( account_name ),
          zone:zone_id (
            zone_name,
            barangay:barangay_id ( barangay_name )
          ),
          classifications:classification_id ( classification_name )
        `)
        .ilike('consumers.account_name', `%${q}%`)
        .limit(50)

      byName = data || []
      nameError = error

      // Filter out accounts that have a Defective/Stolen/Waterleak meter
      if (byName.length > 0 && excludedStatusIds.length > 0) {
        const accountIds = byName.map((a: any) => a.meter_account_id)
        const { data: badMeters } = await supabase
          .from('meters')
          .select('meter_account_id')
          .in('meter_account_id', accountIds)
          .in('meter_status_id', excludedStatusIds)

        const badAccountIds = new Set(badMeters?.map((m: any) => m.meter_account_id) || [])
        byName = byName.filter((a: any) => !badAccountIds.has(a.meter_account_id))
      }
    } else {
      const { data, error } = await supabase
        .from('meter_accounts')
        .select(`
          meter_account_id,
          consumer_id,
          consumers:consumer_id!inner ( account_name ),
          zone:zone_id (
            zone_name,
            barangay:barangay_id ( barangay_name )
          ),
          classifications:classification_id ( classification_name )
        `)
        .ilike('consumers.account_name', `%${q}%`)
        .limit(50)

      byName = data || []
      nameError = error
    }

    if (nameError) throw nameError

    // ─── Merge all results ──────────────────────────────────────────────────
    const merged = new Map<string, any>()

    for (const m of bySerial || []) {
      const ma = unwrap(m.meter_accounts)
      if (ma) {
        merged.set(ma.meter_account_id, {
          meter_account_id: ma.meter_account_id,
          consumer_id: ma.consumer_id,
          consumers: ma.consumers,
          zone: ma.zone,
          classifications: ma.classifications,
          meter_serial_no: m.meter_serial_no,
        })
      }
    }

    for (const r of byAccountNo || []) {
      if (!merged.has(r.meter_account_id)) {
        merged.set(r.meter_account_id, r)
      }
    }

    for (const r of byName || []) {
      if (!merged.has(r.meter_account_id)) {
        merged.set(r.meter_account_id, r)
      }
    }

    // ─── Build results ──────────────────────────────────────────────────────
    const results: MeterAccountOption[] = []

    for (const [_, r] of merged) {
      const consumer = unwrap(r.consumers)
      const zone = unwrap(r.zone)
      const barangay = unwrap(zone?.barangay)
      const classification = unwrap(r.classifications)

      results.push({
        meter_account_id: r.meter_account_id,
        meter_serial_no: r.meter_serial_no,
        consumer_id: r.consumer_id,
        consumer_name: consumer?.account_name ?? 'Unknown Consumer',
        zone_name: zone?.zone_name ?? '',
        barangay_name: barangay?.barangay_name ?? '',
        classification_name: classification?.classification_name ?? '',
      })
    }

    return { success: true, data: results.slice(0, 20) }
  } catch (error) {
    console.error('Error searching meter accounts:', error)
    return { success: false, error: 'Failed to search meter accounts' }
  }
}

// =====================
// CREATE ISSUE REPORT
// =====================

export async function createIssueReport(payload: {
  meter_account_id: string
  issue_type_id: string
  report_description?: string
  reading_period_id: string
}) {
  const supabase = await createClient()

  try {
    if (!payload.meter_account_id) return { status: 'error', message: 'Please select a meter account' }
    if (!payload.issue_type_id) return { status: 'error', message: 'Please select an issue type' }
    if (!payload.reading_period_id) return { status: 'error', message: 'Missing reading period context' }

    const { data: { user: actorUser } } = await supabase.auth.getUser()
    if (!actorUser) return { status: 'error', message: 'User not authenticated' }

    // ─── 1. Fetch Pending Status ──────────────────────────────────────────
    const { data: pendingStatus } = await supabase
      .from('bulk_status')
      .select('status_id')
      .ilike('status_name', 'pending')
      .single()

    if (!pendingStatus) return { status: 'error', message: 'Status "pending" is not configured in bulk_status' }

    // ─── 2. Check for existing pending issue report ───────────────────────
    const { data: existing } = await supabase
      .from('meter_issue_reports')
      .select('issue_report_id')
      .eq('meter_account_id', payload.meter_account_id)
      .eq('report_status_id', pendingStatus.status_id)
      .maybeSingle()

    if (existing) return { status: 'error', message: 'This account already has a pending issue report' }

    // ─── 3. Fetch the selected Issue details ─────────────────────────────
    const { data: issueType } = await supabase
      .from('meter_issue_types')
      .select('issue_name, affects_billing')
      .eq('issue_type_id', payload.issue_type_id)
      .single()

    if (!issueType) return { status: 'error', message: 'Invalid issue type selected' }
    
    // Only allow issues that affect billing
    if (!issueType.affects_billing) {
      return { status: 'error', message: 'Selected issue type does not affect billing and cannot be reported through this form' }
    }

    // ─── 4. Insert Issue Report Record ────────────────────────────────────
    const { data: report, error: insertError } = await supabase
      .from('meter_issue_reports')
      .insert({
        meter_account_id: payload.meter_account_id,
        issue_type_id: payload.issue_type_id,
        report_description: payload.report_description || null,
        report_status_id: pendingStatus.status_id,
        report_by: actorUser.id,
      })
      .select()
      .single()

    if (insertError) throw insertError

    // ─── 5. Audit Log ─────────────────────────────────────────────────────
    await createAuditLog(
      actorUser.id,
      'CREATE',
      `Filed a ${issueType.issue_name} issue report`,
      'meter_issue_reports',
      report.issue_report_id
    )

    return { status: 'success', data: report }
  } catch (error: any) {
    console.error('Error creating issue report:', error)
    return { status: 'error', message: error?.message ?? 'Failed to create issue report' }
  }
}

// =====================
// LIST ISSUE REPORTS
// =====================

export async function getAllIssueReports(): Promise<IssueReportListItem[]> {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('meter_issue_reports')
      .select(`
        issue_report_id,
        meter_account_id,
        report_description,
        report_status_id,
        approved_at,
        created_at,
        meter_accounts:meter_account_id (
          consumers:consumer_id ( account_name ),
          zone:zone_id (
            zone_name,
            barangay:barangay_id ( barangay_name )
          ),
          meters ( meter_serial_no, created_at )
        ),
        issue_types:issue_type_id (
          issue_name,
          billing_basis:billing_basis_id ( basis_code )
        ),
        report_status:report_status_id ( status_id, status_name ),
        report_by_user:report_by ( first_name, last_name ),
        approved_by_user:approved_by ( first_name, last_name )
      `)
      .order('created_at', { ascending: false })

    if (error) throw error

    return (data || []).map((row: any) => {
      const ma = unwrap(row.meter_accounts)
      const consumer = unwrap(ma?.consumers)
      const zone = unwrap(ma?.zone)
      const barangay = unwrap(zone?.barangay)
      const reportBy = unwrap(row.report_by_user)
      const approvedBy = unwrap(row.approved_by_user)
      const issue = unwrap(row.issue_types)
      const billingBasis = unwrap(issue?.billing_basis)
      const reportStatus = unwrap(row.report_status)

      return {
        issue_report_id: row.issue_report_id,
        meter_account_id: row.meter_account_id,
        meter_serial_no: latestMeterSerialFromMeters(ma?.meters) ?? '',
        consumer_name: consumer?.account_name ?? 'Unknown Consumer',
        zone_name: zone?.zone_name ?? '',
        barangay_name: barangay?.barangay_name ?? '',
        issue_type_id: row.issue_type_id,
        issue_name: issue?.issue_name ?? '',
        billing_basis_code: billingBasis?.basis_code ?? null,
        report_description: row.report_description,
        report_status_id: reportStatus?.status_id ?? '',
        report_status_name: reportStatus?.status_name ?? '',
        report_by_name: reportBy ? `${reportBy.first_name} ${reportBy.last_name}` : 'Unknown',
        approved_by_name: approvedBy ? `${approvedBy.first_name} ${approvedBy.last_name}` : null,
        approved_at: row.approved_at,
        created_at: row.created_at,
      }
    })
  } catch (error) {
    console.error('Error fetching issue reports:', error)
    throw new Error('Failed to fetch issue reports')
  }
}

// =====================
// APPROVE ISSUE REPORT - WITH INSTALLMENT TERMINATION
// =====================

export async function approveIssueReport(
  reportId: string
): Promise<{
  status: 'success' | 'error'
  message?: string
}> {
  const supabase = await createClient()

  try {
    const { data: { user: actorUser } } = await supabase.auth.getUser()
    if (!actorUser) {
      return { status: 'error', message: 'User not authenticated' }
    }

    // ─── Get the report with all details ──────────────────────────────────
    const { data: report, error: reportError } = await supabase
      .from('meter_issue_reports')
      .select(`
        issue_report_id,
        report_status_id,
        meter_account_id,
        issue_type_id,
        issue_types:issue_type_id (
          issue_type_id,
          issue_name,
          billing_basis:billing_basis_id ( basis_code )
        )
      `)
      .eq('issue_report_id', reportId)
      .single()

    if (reportError || !report) {
      return { status: 'error', message: 'Report not found' }
    }

    // ─── Get Approved status ID ──────────────────────────────────────────
    const { data: approvedStatus } = await supabase
      .from('bulk_status')
      .select('status_id')
      .ilike('status_name', 'approved')
      .single()

    if (!approvedStatus) {
      return { status: 'error', message: 'Status "approved" is not configured' }
    }

    // ─── Get the issue details ───────────────────────────────────────────
    const issue = unwrap(report.issue_types)
    const issueName = issue?.issue_name?.toUpperCase() || ''

    // ─── Determine which meter status to apply based on the issue ──────
    let newMeterStatusId: string | null = null
    let statusUpdateMessage = ''

    // Map issue names to meter statuses
    if (issueName.includes('DEFECTIVE')) {
      const { data: defectiveStatus } = await supabase
        .from('meter_status')
        .select('meter_status_id')
        .ilike('meter_status_name', 'Defective')
        .single()
      
      if (defectiveStatus) {
        newMeterStatusId = defectiveStatus.meter_status_id
        statusUpdateMessage = 'updated meter status to Defective'
      }
    } 
    else if (issueName.includes('STOLEN')) {
      const { data: stolenStatus } = await supabase
        .from('meter_status')
        .select('meter_status_id')
        .ilike('meter_status_name', 'Stolen')
        .single()
      
      if (stolenStatus) {
        newMeterStatusId = stolenStatus.meter_status_id
        statusUpdateMessage = 'updated meter status to Stolen'
      }
    }
    else if (issueName.includes('WATERLEAK') || issueName.includes('LEAK_AFTER_METER')) {
      const { data: leakStatus } = await supabase
        .from('meter_status')
        .select('meter_status_id')
        .ilike('meter_status_name', 'Waterleak_After_Meter')
        .single()
      
      if (leakStatus) {
        newMeterStatusId = leakStatus.meter_status_id
        statusUpdateMessage = 'updated meter status to Water Leak After Meter'
      }
    }

    // ─── Update meter status ONLY for the ACTIVE meter ──────────────────
    if (newMeterStatusId) {
      // First, get the ACTIVE meter for this meter account
      const { data: activeMeter, error: meterError } = await supabase
        .from('meters')
        .select('meter_id')
        .eq('meter_account_id', report.meter_account_id)
        .eq('meter_status_id', (await supabase
          .from('meter_status')
          .select('meter_status_id')
          .ilike('meter_status_name', 'Active')
          .single()
        ).data?.meter_status_id)
        .maybeSingle()

      if (meterError || !activeMeter) {
        console.error('Error finding active meter for account:', meterError)
        return { 
          status: 'error', 
          message: 'No active meter found for this account' 
        }
      }

      // Update ONLY the ACTIVE meter by its meter_id
      const { error: meterUpdateError } = await supabase
        .from('meters')
        .update({ 
          meter_status_id: newMeterStatusId,
          updated_at: new Date().toISOString()
        })
        .eq('meter_id', activeMeter.meter_id)

      if (meterUpdateError) {
        console.error('Error updating meter status:', meterUpdateError)
        return { 
          status: 'error', 
          message: 'Failed to update meter status' 
        }
      }

      // ─── CHECK AND TERMINATE ACTIVE INSTALLMENT PLAN ──────────────────
      // If meter status is being changed to DEFECTIVE or STOLEN, terminate any active installment
      const isDefectiveOrStolen = issueName.includes('DEFECTIVE') || issueName.includes('STOLEN')
      
      if (isDefectiveOrStolen) {
        // Get ACTIVE and PENDING status IDs for installments
        const { data: activeStatus } = await supabase
          .from('installment_status')
          .select('installment_status_id')
          .eq('status_code', 'ACTIVE')
          .single()

        const { data: pendingStatus } = await supabase
          .from('installment_status')
          .select('installment_status_id')
          .eq('status_code', 'PENDING')
          .single()

        const { data: terminatedStatus } = await supabase
          .from('installment_status')
          .select('installment_status_id')
          .eq('status_code', 'TERMINATED')
          .single()

        if (terminatedStatus) {
          // Find any ACTIVE or PENDING installment for this meter account
          const { data: activeInstallments } = await supabase
            .from('meter_installments')
            .select('installment_id, remaining_balance, status_id')
            .eq('meter_account_id', report.meter_account_id)
            .in('status_id', [
              activeStatus?.installment_status_id,
              pendingStatus?.installment_status_id
            ].filter(Boolean))

          if (activeInstallments && activeInstallments.length > 0) {
            // Update all active/pending installments to TERMINATED
            const installmentIds = activeInstallments.map(i => i.installment_id)
            
            const { error: updateInstallmentError } = await supabase
              .from('meter_installments')
              .update({
                status_id: terminatedStatus.installment_status_id,
                updated_at: new Date().toISOString()
              })
              .in('installment_id', installmentIds)

            if (updateInstallmentError) {
              console.error('Error terminating installment plans:', updateInstallmentError)
              // Don't fail the approval, just log the error
            } else {
              // Create audit log for installment termination
              await createAuditLog(
                actorUser.id,
                'UPDATE',
                `Terminated installment plan(s) for meter account ${report.meter_account_id} due to ${issueName} status change`,
                'meter_installments',
                installmentIds.join(',')
              )
              
              // Add to the status update message
              statusUpdateMessage += ` and terminated ${activeInstallments.length} installment plan(s)`
            }
          }
        }
      }
    }

    // ─── Update the report status to Approved ────────────────────────────
    const { error: updateError } = await supabase
      .from('meter_issue_reports')
      .update({
        report_status_id: approvedStatus.status_id,
        approved_by: actorUser.id,
        approved_at: new Date().toISOString(),
      })
      .eq('issue_report_id', reportId)

    if (updateError) throw updateError

    // ─── Create audit log ─────────────────────────────────────────────────
    const logMessage = statusUpdateMessage 
      ? `Approved meter issue report: ${issue?.issue_name || 'Unknown issue'} and ${statusUpdateMessage}`
      : `Approved meter issue report: ${issue?.issue_name || 'Unknown issue'}`

    await createAuditLog(
      actorUser.id,
      'APPROVE',
      logMessage,
      'meter_issue_reports',
      reportId
    )

    return { 
      status: 'success', 
      message: statusUpdateMessage 
        ? `Report approved and ${statusUpdateMessage}`
        : 'Report approved successfully' 
    }
  } catch (error) {
    console.error('Error approving issue report:', error)
    return { status: 'error', message: 'Failed to approve report' }
  }
}

// =====================
// REJECT ISSUE REPORT
// =====================

export async function rejectIssueReport(
  reportId: string
): Promise<{
  status: 'success' | 'error'
  message?: string
}> {
  const supabase = await createClient()

  try {
    const { data: { user: actorUser } } = await supabase.auth.getUser()
    if (!actorUser) {
      return { status: 'error', message: 'User not authenticated' }
    }

    // ─── Get the report to check if it exists and is pending ────────────
    const { data: report, error: reportError } = await supabase
      .from('meter_issue_reports')
      .select(`
        issue_report_id,
        report_status_id,
        issue_type_id,
        issue_types:issue_type_id (
          issue_name
        )
      `)
      .eq('issue_report_id', reportId)
      .single()

    if (reportError || !report) {
      return { status: 'error', message: 'Report not found' }
    }

    // ─── Get Rejected status ID ──────────────────────────────────────────
    const { data: rejectedStatus } = await supabase
      .from('bulk_status')
      .select('status_id')
      .ilike('status_name', 'rejected')
      .single()

    if (!rejectedStatus) {
      return { status: 'error', message: 'Status "rejected" is not configured' }
    }

    // ─── Update the report status to Rejected ────────────────────────────
    const { error: updateError } = await supabase
      .from('meter_issue_reports')
      .update({
        report_status_id: rejectedStatus.status_id,
        approved_by: actorUser.id,
        approved_at: new Date().toISOString(),
      })
      .eq('issue_report_id', reportId)

    if (updateError) throw updateError

    // ─── Create audit log ─────────────────────────────────────────────────
    const issue = unwrap(report.issue_types)
    await createAuditLog(
      actorUser.id,
      'REJECT',
      `Rejected meter issue report: ${issue?.issue_name || 'Unknown issue'}`,
      'meter_issue_reports',
      reportId
    )

    return { status: 'success', message: 'Report rejected successfully' }
  } catch (error) {
    console.error('Error rejecting issue report:', error)
    return { status: 'error', message: 'Failed to reject report' }
  }
}

export async function getActiveReadingPeriodId(): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reading_periods')
    .select('reading_period_id')
    .order('period_start', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return data.reading_period_id
}