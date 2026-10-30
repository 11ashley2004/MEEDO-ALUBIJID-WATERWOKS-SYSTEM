'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { onBillingRealtimeChange } from '@/lib/actions/disconnection-notice/billing-disconnection-notify.actions'

/**
 * Listens to Supabase Realtime `billing` INSERT/UPDATE and runs the
 * Next.js disconnection-notify server action (replaces DB triggers).
 *
 * Mount once under the protected shell. Debounces duplicate events for
 * the same billing_id within a short window.
 */
export function BillingDisconnectionRealtimeListener() {
  const recentRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel('billing-disconnection-notify')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'billing',
        },
        (payload) => {
          void handleChange(payload.new as { billing_id?: string })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'billing',
        },
        (payload) => {
          void handleChange(payload.new as { billing_id?: string })
        },
      )
      .subscribe()

    async function handleChange(row: { billing_id?: string }) {
      const billingId = row?.billing_id
      if (!billingId) return

      const now = Date.now()
      const last = recentRef.current.get(billingId) ?? 0
      if (now - last < 2500) return
      recentRef.current.set(billingId, now)

      // Prune old keys
      if (recentRef.current.size > 200) {
        for (const [id, t] of recentRef.current) {
          if (now - t > 60_000) recentRef.current.delete(id)
        }
      }

      try {
        console.log('[disconnection-notify] realtime client event', { billingId })
        const result = await onBillingRealtimeChange({
          billing_id: billingId,
          eventType: 'CHANGE',
        })
        console.log('[disconnection-notify] realtime client result', result)
      } catch (err) {
        console.error('[BillingDisconnectionRealtimeListener]', err)
      }
    }

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [])

  return null
}

export default BillingDisconnectionRealtimeListener
