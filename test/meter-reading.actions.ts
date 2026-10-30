// 'use server'
// import { createClient } from '@/lib/supabase/server'
// import { SupabaseClient } from '@supabase/supabase-js'
// import { getCurrentReadingWindow, toDateStr } from '@/lib/actions/meter-reading/reading-window'

// export type { ReadingWindow } from '@/lib/actions/meter-reading/reading-window'

// // ============================================================
// // TYPES
// // ============================================================

// export interface ReadingConsumer {
//   consumer_id:          string
//   first_name:           string
//   last_name:            string
//   middle_name:          string | null
//   contact_number:       string | null
//   meter_account_id:     string
//   meter_serial_no: string | null
//   meter_id:             string | null
//   meter_serial_no:      string | null
//   zone: {
//     zone_id:   string
//     zone_name: string
//     barangay: { barangay_id: string; barangay_name: string }
//   }
//   classification: {
//     classification_id:   string
//     classification_name: string
//   }
//   reading_id:           string | null
//   previous_reading:     number
//   present_reading:      number | null
//   reading_date:         string | null
//   reading_status_code:  string | null
// }

// // ============================================================
// // HELPERS
// // ============================================================

// function unwrap<T>(val: T | T[] | null | undefined): T | null {
//   if (val == null) return null
//   return Array.isArray(val) ? (val[0] ?? null) : val
// }

// function getLastFridayOfMonth(year: number, month: number): Date {
//   const date = new Date(Date.UTC(year, month, 0))
//   while (date.getUTCDay() !== 5) date.setUTCDate(date.getUTCDate() - 1)
//   return date
// }

// async function getBillingStatusMap(supabase: SupabaseClient): Promise<Record<string, string>> {
//   const { data, error } = await supabase
//     .from('billing_status')
//     .select('billing_status_id, billing_status_name')
//   if (error) throw error
//   if (!data?.length) throw new Error('No billing statuses found')
//   return Object.fromEntries(
//     data.map((s: any) => [s.billing_status_name.toLowerCase(), s.billing_status_id])
//   )
// }

// async function getPenaltyRate(supabase: SupabaseClient): Promise<{ id: string; rate: number } | null> {
//   const { data, error } = await supabase
//     .from('penalty_rate')
//     .select('penalty_rate_id, penalty_rate')
//     .order('created_at', { ascending: false })
//     .limit(1)
//     .maybeSingle()
//   if (error || !data) return null
//   return { id: data.penalty_rate_id, rate: Number(data.penalty_rate) }
// }

// async function getPreviousBalanceAndPenalty(
//   supabase:         SupabaseClient,
//   meterAccountId:   string,
//   currentPeriod:    string,
//   billingStatusMap: Record<string, string>,
//   penaltyRate:      number,
// ): Promise<{ previous_balance: number; penalty_amount: number }> {
//   const carryOverStatuses = [
//     billingStatusMap['unpaid'],
//     billingStatusMap['partial'],
//   ].filter(Boolean)

//   if (!carryOverStatuses.length) return { previous_balance: 0, penalty_amount: 0 }

//   const d     = new Date(currentPeriod)
//   const prevM = d.getUTCMonth() === 0 ? 11 : d.getUTCMonth() - 1
//   const prevY = d.getUTCMonth() === 0 ? d.getUTCFullYear() - 1 : d.getUTCFullYear()
//   const prevPeriod = toDateStr(new Date(Date.UTC(prevY, prevM, 1)))

//   const { data: prevBill } = await supabase
//     .from('billing')
//     .select('remaining_balance')
//     .eq('meter_account_id', meterAccountId)
//     .eq('reading_period', prevPeriod)
//     .in('billing_status_id', carryOverStatuses)
//     .gt('remaining_balance', 0)
//     .maybeSingle()

//   const previous_balance = prevBill
//     ? parseFloat(Number(prevBill.remaining_balance).toFixed(2))
//     : 0

//   const penalty_amount = previous_balance > 0 && penaltyRate > 0
//     ? parseFloat((previous_balance * (penaltyRate / 100)).toFixed(2))
//     : 0

//   return { previous_balance, penalty_amount }
// }

// // ============================================================
// // TIER / BREAKDOWN
// // ============================================================

// interface Tier {
//   community_charge_id: string
//   min_consumption:     number
//   max_consumption:     number | null
//   multiplier:          number
// }

// interface BreakdownBlock {
//   community_charge_id: string
//   block_order:         number
//   units_used:          number
//   rate_per_unit:       number
//   subtotal:            number
// }

// function computeBreakdowns(consumption: number, tiers: Tier[]): BreakdownBlock[] {
//   const sorted  = [...tiers].sort((a, b) => a.min_consumption - b.min_consumption)
//   const blocks: BreakdownBlock[] = []
//   let remaining = consumption

//   for (let i = 0; i < sorted.length; i++) {
//     if (remaining <= 0) break
//     const tier      = sorted[i]
//     const blockSize = tier.max_consumption !== null
//       ? tier.max_consumption - tier.min_consumption + 1
//       : Infinity
//     const units = Math.min(remaining, blockSize)
//     if (units <= 0) continue
//     blocks.push({
//       community_charge_id: tier.community_charge_id,
//       block_order:         i + 1,
//       units_used:          units,
//       rate_per_unit:       Number(tier.multiplier),
//       subtotal:            parseFloat((units * Number(tier.multiplier)).toFixed(2)),
//     })
//     remaining -= units
//   }
//   return blocks
// }

// const _tierCache = new Map<string, Tier[]>()

// async function getTiersForMeterAccount(supabase: SupabaseClient, meterAccountId: string): Promise<Tier[]> {
//   if (_tierCache.has(meterAccountId)) return _tierCache.get(meterAccountId)!

//   const { data: ma } = await supabase
//     .from('meter_accounts')
//     .select('classification_id')
//     .eq('meter_account_id', meterAccountId)
//     .single()

//   if (!ma) return []

//   const { data } = await supabase
//     .from('community_charges')
//     .select('community_charge_id, min_consumption, max_consumption, multiplier')
//     .eq('classification_id', ma.classification_id)
//     .order('min_consumption', { ascending: true })

//   if (!data?.length) return []

//   const tiers: Tier[] = data.map((t: any) => ({
//     community_charge_id: t.community_charge_id,
//     min_consumption:     Number(t.min_consumption),
//     max_consumption:     t.max_consumption !== null ? Number(t.max_consumption) : null,
//     multiplier:          Number(t.multiplier),
//   }))

//   _tierCache.set(meterAccountId, tiers)
//   return tiers
// }

// // ============================================================
// // createConsumptionAndBilling
// // ============================================================

// async function createConsumptionAndBilling(
//   supabase: SupabaseClient,
//   params: {
//     meter_account_id:   string
//     consumer_id:        string
//     reading_period:     string
//     reading_id:         string | null
//     previous_reading:   number
//     present_reading:    number
//     consumption:        number
//     due_date:           string
//     billing_status_map: Record<string, string>
//     penalty_rate:       number
//   }
// ): Promise<{ success: boolean; consumption_id?: string; billing_id?: string; error?: string }> {
//   const {
//     meter_account_id, consumer_id, reading_period, reading_id,
//     previous_reading, present_reading, consumption,
//     due_date, billing_status_map, penalty_rate,
//   } = params

//   const { data: consumptionRow, error: consumptionErr } = await supabase
//     .from('water_consumptions')
//     .insert({ meter_account_id, reading_id, previous_reading, present_reading, consumption })
//     .select('consumption_id')
//     .single()

//   if (consumptionErr || !consumptionRow)
//     return { success: false, error: `water_consumptions insert failed: ${consumptionErr?.message}` }

//   const consumption_id = consumptionRow.consumption_id

//   const tiers = await getTiersForMeterAccount(supabase, meter_account_id)
//   if (!tiers.length) {
//     await supabase.from('water_consumptions').delete().eq('consumption_id', consumption_id)
//     return { success: false, error: `No charge tiers for meter account ${meter_account_id}` }
//   }

//   const blocks = computeBreakdowns(consumption, tiers)
//   if (!blocks.length) {
//     await supabase.from('water_consumptions').delete().eq('consumption_id', consumption_id)
//     return { success: false, error: 'No breakdown blocks computed' }
//   }

//   for (const block of blocks) {
//     const { error: bdErr } = await supabase
//       .from('billing_community_breakdowns')
//       .insert({
//         consumption_id,
//         community_charge_id: block.community_charge_id,
//         block_order:         block.block_order,
//         units_used:          block.units_used,
//         rate_per_unit:       block.rate_per_unit,
//         subtotal:            block.subtotal,
//       })
//     if (bdErr) {
//       await supabase.from('billing_community_breakdowns').delete().eq('consumption_id', consumption_id)
//       await supabase.from('water_consumptions').delete().eq('consumption_id', consumption_id)
//       return { success: false, error: `breakdown insert failed: ${bdErr.message}` }
//     }
//   }

//   const current_billing = parseFloat(blocks.reduce((s, b) => s + b.subtotal, 0).toFixed(2))

//   const { previous_balance, penalty_amount } = await getPreviousBalanceAndPenalty(
//     supabase, meter_account_id, reading_period, billing_status_map, penalty_rate,
//   )

//   let meter_charge = 0
//   let active_installment_id: string | null = null

//   if (reading_id !== null) {
//     const { data: installment } = await supabase
//       .from('meter_installments')
//       .select('installment_id, monthly_amount, remaining_balance')
//       .eq('meter_account_id', meter_account_id)
//       .eq('status', true)
//       .gt('remaining_balance', 0)
//       .order('created_at', { ascending: true })
//       .limit(1)
//       .maybeSingle()

//     if (installment) {
//       meter_charge = parseFloat(
//         Math.min(Number(installment.monthly_amount), Number(installment.remaining_balance)).toFixed(2)
//       )
//       active_installment_id = installment.installment_id
//     }
//   }

//   const total_billing     = parseFloat((current_billing + previous_balance + penalty_amount + meter_charge).toFixed(2))
//   const remaining_balance = total_billing

//   await supabase.from('billing').delete()
//     .eq('meter_account_id', meter_account_id)
//     .eq('reading_period', reading_period)

//   const { data: billingRow, error: billingErr } = await supabase
//     .from('billing')
//     .insert({
//       meter_account_id,
//       consumer_id,
//       consumption_id,
//       reading_period,
//       due_date,
//       current_billing,
//       previous_balance,
//       penalty_amount,
//       total_billing,
//       remaining_balance,
//       billing_status_id: billing_status_map['unpaid'],
//     })
//     .select('billing_id')
//     .single()

//   if (billingErr) {
//     await supabase.from('billing_community_breakdowns').delete().eq('consumption_id', consumption_id)
//     await supabase.from('water_consumptions').delete().eq('consumption_id', consumption_id)
//     return { success: false, error: `billing insert failed: ${billingErr.message}` }
//   }

//   if (active_installment_id && meter_charge > 0) {
//     const { error: icErr } = await supabase
//       .from('meter_installment_charges')
//       .insert({ installment_id: active_installment_id, billing_id: billingRow.billing_id, amount: meter_charge })

//     if (!icErr) {
//       const { data: cur } = await supabase
//         .from('meter_installments')
//         .select('remaining_balance')
//         .eq('installment_id', active_installment_id)
//         .single()

//       if (cur) {
//         const newRemaining = parseFloat((Number(cur.remaining_balance) - meter_charge).toFixed(2))
//         await supabase
//           .from('meter_installments')
//           .update({ remaining_balance: newRemaining, status: newRemaining > 0 })
//           .eq('installment_id', active_installment_id)
//       }
//     }
//   }

//   return { success: true, consumption_id, billing_id: billingRow.billing_id }
// }

// // ============================================================
// // RECORDED status cache
// // ============================================================

// let _recordedStatusId: string | null = null

// async function getRecordedStatusId(supabase: SupabaseClient): Promise<string> {
//   if (_recordedStatusId) return _recordedStatusId
//   const { data } = await supabase
//     .from('meter_reading_status')
//     .select('reading_status_id')
//     .eq('status_code', 'RECORDED')
//     .single()
//   const id = data?.reading_status_id ?? ''
//   _recordedStatusId = id
//   return id
// }

// // ============================================================
// // resolveTargetPeriod
// // ============================================================

// async function resolveTargetPeriod(
//   supabase:       SupabaseClient,
//   meterAccountIds: string[],
//   totalCount:     number,
//   recordedId:     string,
// ): Promise<string> {
//   const now = new Date()
//   const currentYear  = now.getUTCFullYear()
//   const currentMonth = now.getUTCMonth() + 1 // 1-indexed

//   // Start one month BEFORE the current month (was hardcoded to May)
//   let startMonth = currentMonth - 1
//   let startYear  = currentYear
//   if (startMonth < 1) {
//     startMonth = 12
//     startYear -= 1
//   }

//   // Walk forward up to 12 months from the start point, wrapping the year if needed
//   for (let i = 0; i < 12; i++) {
//     const m = ((startMonth - 1 + i) % 12) + 1
//     const y = startYear + Math.floor((startMonth - 1 + i) / 12)
//     const period = toDateStr(new Date(Date.UTC(y, m - 1, 1)))

//     if (totalCount === 0) return period

//     const { count } = await supabase
//       .from('meter_readings')
//       .select('reading_id', { count: 'exact', head: true })
//       .in('meter_account_id', meterAccountIds)
//       .eq('reading_period', period)
//       .eq('reading_status_id', recordedId)

//     if ((count ?? 0) < totalCount) return period
//   }

//   // fallback: 12 months after start, if everything up to there is fully recorded
//   const fallbackMonth = ((startMonth - 1 + 11) % 12) + 1
//   const fallbackYear  = startYear + Math.floor((startMonth - 1 + 11) / 12)
//   return toDateStr(new Date(Date.UTC(fallbackYear, fallbackMonth - 1, 1)))
// }

// // ============================================================
// // getMeterReadingData
// // ============================================================

// export async function getMeterReadingData() {
//   const supabase = await createClient()

//   try {
//     const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
//     if (authError || !authUser)
//       return { status: 'error', message: 'User not authenticated', data: null }

//     const { data: assignments, error: assignErr } = await supabase
//       .from('meter_reader_assignments')
//       .select('zone_id')
//       .eq('user_id', authUser.id)
//       .eq('is_active', true)

//     if (assignErr)
//       return { status: 'error', message: 'Failed to load assigned zones', data: null }

//     const assignedZoneIds = (assignments ?? []).map((a: any) => a.zone_id)

//     // Connected status ID
//     const { data: connectedStatus, error: statusErr } = await supabase
//       .from('account_status')
//       .select('account_status_id')
//       .eq('status_name', 'Connected')
//       .single()

//     if (statusErr || !connectedStatus)
//       return { status: 'error', message: 'Account status "Connected" not found', data: null }

//     // All active meter accounts in assigned zones
//     const { data: meterAccounts, error: maErr } = await supabase
//       .from('meter_accounts')
//       .select(`
//         meter_account_id, meter_serial_no,
//         consumer:consumer_id ( consumer_id, first_name, last_name, middle_name, contact_number ),
//         zone:zone_id ( zone_id, zone_name, barangay:barangay_id ( barangay_id, barangay_name ) ),
//         classification:classification_id ( classification_id, classification_name ),
//         meters!inner ( meter_id, meter_serial_no )
//       `)
//       .in('zone_id', assignedZoneIds)
//       .eq('account_status_id', connectedStatus.account_status_id)

//     if (maErr)
//       return { status: 'error', message: 'Failed to load meter accounts', data: null }

//     const allMeterAccountIds = (meterAccounts ?? []).map((c: any) => c.meter_account_id)
//     const totalConnections = allMeterAccountIds.length
//     const recordedId       = await getRecordedStatusId(supabase)

//     // Auto-resolve which period to show
//     const targetPeriod = await resolveTargetPeriod(
//       supabase, allMeterAccountIds, totalConnections, recordedId,
//     )

//     const window = getCurrentReadingWindow(targetPeriod)

//     if (!assignedZoneIds.length || totalConnections === 0) {
//       return { status: 'success', data: { window, connections: [], zones: [], targetPeriod } }
//     }

//     // Readings for the resolved target period
//     const { data: existingReadings } = await supabase
//       .from('meter_readings')
//       .select('reading_id, meter_account_id, present_reading, reading_date, reading_status_id, meter_reading_status:reading_status_id(status_code)')
//       .in('meter_account_id', allMeterAccountIds)
//       .eq('reading_period', targetPeriod)

//     const readingMap = new Map<string, any>()
//     for (const r of existingReadings ?? []) readingMap.set(r.meter_account_id, r)

//     // Previous readings (one month before target)
//     const prevDate = new Date(targetPeriod)
//     prevDate.setUTCMonth(prevDate.getUTCMonth() - 1)
//     const prevPeriod = toDateStr(prevDate)

//     const { data: prevReadings } = await supabase
//       .from('meter_readings')
//       .select('meter_account_id, present_reading')
//       .in('meter_account_id', allMeterAccountIds)
//       .eq('reading_period', prevPeriod)
//       .eq('reading_status_id', recordedId)

//     const prevMap = new Map<string, number>()
//     for (const p of prevReadings ?? []) prevMap.set(p.meter_account_id, Number(p.present_reading))

//     // Build ReadingConsumer[]
//     const connections: ReadingConsumer[] = []

//     for (const ma of meterAccounts ?? []) {
//       const consumer       = unwrap(ma.consumer)
//       const zone           = unwrap(ma.zone)
//       const barangay       = unwrap((zone as any)?.barangay)
//       const classification = unwrap(ma.classification)
//       const meters         = ma.meters as any[]
//       const meter          = meters?.length > 0 ? meters[0] : null

//       if (!consumer || !zone) continue

//       const reading    = readingMap.get(ma.meter_account_id) ?? null
//       const statusCode = reading ? unwrap(reading.meter_reading_status)?.status_code ?? null : null

//       connections.push({
//         consumer_id:         consumer.consumer_id,
//         first_name:          consumer.first_name,
//         last_name:           consumer.last_name,
//         middle_name:         consumer.middle_name    ?? null,
//         contact_number:      consumer.contact_number ?? null,
//         meter_account_id:    ma.meter_account_id,
//         meter_serial_no:    ma.meter_serial_no,
//         meter_id:            meter?.meter_id         ?? null,
//         meter_serial_no:     meter?.meter_serial_no  ?? null,
//         zone: {
//           zone_id:   zone.zone_id,
//           zone_name: zone.zone_name,
//           barangay: {
//             barangay_id:   barangay?.barangay_id   ?? '',
//             barangay_name: barangay?.barangay_name ?? 'Unknown',
//           },
//         },
//         classification: {
//           classification_id:   classification?.classification_id   ?? '',
//           classification_name: classification?.classification_name ?? 'Unknown',
//         },
//         reading_id:          reading?.reading_id ?? null,
//         previous_reading:    prevMap.get(ma.meter_account_id) ?? 0,
//         present_reading:     reading?.present_reading != null ? Number(reading.present_reading) : null,
//         reading_date:        reading?.reading_date ?? null,
//         reading_status_code: statusCode,
//       })
//     }

//     connections.sort((a, b) => a.last_name.localeCompare(b.last_name))

//     const { data: zones } = await supabase
//       .from('zone')
//       .select('zone_id, zone_name, barangay:barangay_id(barangay_id, barangay_name)')
//       .in('zone_id', assignedZoneIds)
//       .eq('is_active', true)

//     const zoneList = (zones ?? []).map((z: any) => ({
//       zone_id:   z.zone_id,
//       zone_name: z.zone_name,
//       barangay:  unwrap(z.barangay) ?? { barangay_id: '', barangay_name: 'Unknown' },
//     }))

//     return { status: 'success', data: { window, connections, zones: zoneList, targetPeriod } }
//   } catch (error) {
//     console.error('getMeterReadingData error:', error)
//     return { status: 'error', message: 'Failed to load data', data: null }
//   }
// }

// // ============================================================
// // submitMeterReading
// // ============================================================

// export async function submitMeterReading(payload: {
//   meter_account_id:  string
//   present_reading: number
//   target_period:   string
// }) {
//   const supabase = await createClient()

//   try {
//     const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
//     if (authError || !authUser)
//       return { status: 'error', message: 'User not authenticated' }

//     const targetPeriod = payload.target_period

//     // Duplicate check
//     const { data: existing } = await supabase
//       .from('meter_readings')
//       .select('reading_id, reading_date')
//       .eq('meter_account_id', payload.meter_account_id)
//       .eq('reading_period', targetPeriod)
//       .maybeSingle()

//     if (existing) {
//       const submittedAt = new Date(existing.reading_date).toLocaleString('en-US', {
//         month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
//       })
//       return { status: 'error', message: `Already recorded on ${submittedAt}.` }
//     }

//     const { data: meterRow } = await supabase
//       .from('meters')
//       .select('meter_id')
//       .eq('meter_account_id', payload.meter_account_id)
//       .maybeSingle()

//     if (!meterRow)
//       return { status: 'error', message: 'No meter found for this meter account.' }

//     // Previous reading = recorded reading for the month before targetPeriod
//     const prevDate = new Date(targetPeriod)
//     prevDate.setUTCMonth(prevDate.getUTCMonth() - 1)
//     const prevPeriod   = toDateStr(prevDate)
//     const recordedId   = await getRecordedStatusId(supabase)

//     const { data: prevRow } = await supabase
//       .from('meter_readings')
//       .select('present_reading')
//       .eq('meter_account_id', payload.meter_account_id)
//       .eq('reading_period', prevPeriod)
//       .eq('reading_status_id', recordedId)
//       .maybeSingle()

//     const previous_reading = prevRow ? Number(prevRow.present_reading) : 0

//     if (payload.present_reading < previous_reading)
//       return {
//         status: 'error',
//         message: `Reading ${payload.present_reading} cannot be less than previous reading (${previous_reading}).`,
//       }

//     const consumption = Math.max(0, payload.present_reading - previous_reading)

//     const { data: readingRow, error: readingErr } = await supabase
//       .from('meter_readings')
//       .insert({
//         reading_period:    targetPeriod,
//         meter_account_id:  payload.meter_account_id,
//         meter_id:          meterRow.meter_id,
//         meter_reader_id:   authUser.id,
//         present_reading:   payload.present_reading,
//         reading_date:      new Date().toISOString(),
//         reading_status_id: recordedId,
//       })
//       .select('reading_id')
//       .single()

//     if (readingErr)
//       return { status: 'error', message: `Failed to save reading: ${readingErr.message}` }

//     const tp       = new Date(targetPeriod)
//     const dueYear  = tp.getUTCMonth() === 11 ? tp.getUTCFullYear() + 1 : tp.getUTCFullYear()
//     const dueMonth = tp.getUTCMonth() === 11 ? 1 : tp.getUTCMonth() + 2
//     const due_date = toDateStr(getLastFridayOfMonth(dueYear, dueMonth))

//     const billingStatusMap = await getBillingStatusMap(supabase)
//     if (!billingStatusMap['unpaid'])
//       return { status: 'error', message: 'Billing status "unpaid" not configured.' }

//     const penaltyRateRow = await getPenaltyRate(supabase)
//     const penaltyRate    = penaltyRateRow?.rate ?? 0

//     const { data: maRow } = await supabase
//       .from('meter_accounts')
//       .select('consumer_id')
//       .eq('meter_account_id', payload.meter_account_id)
//       .single()

//     const result = await createConsumptionAndBilling(supabase, {
//       meter_account_id:   payload.meter_account_id,
//       consumer_id:        maRow?.consumer_id ?? '',
//       reading_period:     targetPeriod,
//       reading_id:         readingRow.reading_id,
//       previous_reading,
//       present_reading:    payload.present_reading,
//       consumption,
//       due_date,
//       billing_status_map: billingStatusMap,
//       penalty_rate:       penaltyRate,
//     })

//     if (!result.success)
//       return { status: 'error', message: result.error }

//     return {
//       status: 'success',
//       data: {
//         reading_id:      readingRow.reading_id,
//         billing_id:      result.billing_id,
//         previous_reading,
//         present_reading: payload.present_reading,
//         consumption,
//         reading_date:    new Date().toISOString(),
//       },
//     }
//   } catch (error: any) {
//     console.error('submitMeterReading error:', error)
//     return { status: 'error', message: error?.message ?? 'Failed to submit meter reading' }
//   }
// }

// // ============================================================
// // getReadingConsumerByMeterAccount
// // ============================================================

// export async function getReadingConsumerByMeterAccount(meterAccountId: string, targetPeriod: string) {
//   const supabase = await createClient()

//   try {
//     const { data: ma, error: maErr } = await supabase
//       .from('meter_accounts')
//       .select(`
//         meter_account_id, meter_serial_no,
//         consumer:consumer_id ( consumer_id, first_name, last_name, middle_name ),
//         zone:zone_id ( zone_id, zone_name, barangay:barangay_id ( barangay_id, barangay_name ) ),
//         classification:classification_id ( classification_id, classification_name )
//       `)
//       .eq('meter_account_id', meterAccountId)
//       .single()

//     if (maErr || !ma) return null

//     const consumer       = unwrap(ma.consumer)
//     const zone           = unwrap(ma.zone)
//     const barangay       = unwrap((zone as any)?.barangay)
//     const classification = unwrap(ma.classification)

//     const { data: meterRow } = await supabase
//       .from('meters')
//       .select('meter_id')
//       .eq('meter_account_id', meterAccountId)
//       .maybeSingle()

//     const prevDate = new Date(targetPeriod)
//     prevDate.setUTCMonth(prevDate.getUTCMonth() - 1)
//     const prevPeriod       = toDateStr(prevDate)
//     const recordedStatusId = await getRecordedStatusId(supabase)

//     const { data: prevRow } = await supabase
//       .from('meter_readings')
//       .select('present_reading')
//       .eq('meter_account_id', meterAccountId)
//       .eq('reading_period', prevPeriod)
//       .eq('reading_status_id', recordedStatusId)
//       .maybeSingle()

//     const previous_reading = prevRow ? Number(prevRow.present_reading) : 0

//     const { data: reading } = await supabase
//       .from('meter_readings')
//       .select('reading_id, present_reading, reading_date, reading_status_id, meter_reading_status:reading_status_id(status_code)')
//       .eq('meter_account_id', meterAccountId)
//       .eq('reading_period', targetPeriod)
//       .maybeSingle()

//     const statusCode = reading ? unwrap(reading.meter_reading_status)?.status_code ?? null : null

//     return {
//       first_name:          consumer?.first_name    ?? '',
//       last_name:           consumer?.last_name     ?? '',
//       middle_name:         consumer?.middle_name   ?? null,
//       consumer_id:         consumer?.consumer_id   ?? '',
//       meter_account_id:    ma.meter_account_id,
//       meter_serial_no:    ma.meter_serial_no     ?? '',
//       meter_id:            meterRow?.meter_id      ?? null,
//       zone_name:           zone?.zone_name         ?? '',
//       barangay_name:       barangay?.barangay_name ?? 'Unknown',
//       classification_name: classification?.classification_name ?? 'Unknown',
//       reading_id:          reading?.reading_id     ?? null,
//       present_reading:     reading?.present_reading != null ? Number(reading.present_reading) : null,
//       reading_date:        reading?.reading_date   ?? null,
//       reading_status_code: statusCode,
//       previous_reading,
//       targetPeriod,
//       windowOpenDate:      getCurrentReadingWindow(targetPeriod).windowOpenDate,
//     }
//   } catch (error) {
//     console.error('getReadingConsumerByMeterAccount error:', error)
//     return null
//   }
// }