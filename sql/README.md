-- ============================================================
-- FULL MIGRATION SCRIPT: Consumption & Billing Issue Auto-Adjustment
--
-- (1) set_reading_metadata() does not overwrite an explicitly-set
--     reading_status_id (LEAK_AFTER_METER / DEFECTIVE / STOLEN). It only
--     defaults to RECORDED when the app didn't set one.
--
-- (2) create_water_consumption_on_reading() sources the active issue from
--     service_reports joined to service_issue_types, using
--     approved_at IS NOT NULL as the "approved" check.
--
-- (3) ESTIMATED BILLING IS DATA-DRIVEN (no issue names in code).
--     An approved, unresolved report triggers estimated billing when:
--       - its issue type has affects_billing = TRUE OR a billing_basis_id, AND
--       - the meter being READ is still flagged (Defective / Stolen /
--         Waterleak_After_Meter). After a replacement swap the new meter
--         is Active while the report may still await consultant confirm —
--         do NOT keep estimating on that Active meter (v5).
--     Rule:
--       a) Current meter has 3 prior NORMAL readings
--          (counts_as_actual = TRUE AND status_code <> 'LEAK_AFTER_METER')
--          -> billed_consumption = 3-period average rounded to a WHOLE
--          number (19.6 -> 20, 19.2 -> 19).
--       b) Otherwise (meter younger than 3 normal months) -> last NORMAL
--          consumption.
--       c) No normal history at all -> bill 0 (the issue reading itself
--          is never billed).
--     water_consumptions.consumption / present_reading always keep the
--     REAL reading values; only billed_consumption is estimated.
--
--     v4 FIX: LEAK_AFTER_METER months are EXCLUDED from the history used
--     for the average and the "last consumption" fallback. The customer's
--     own pipe was leaking that month, so their usage is not
--     representative of their normal behavior — including it would inflate
--     the average for a Defective/Stolen estimate that follows.
--
--     Leak After Meter (product rule): affects_billing = FALSE and no
--     billing_basis_id -> bill ACTUAL readings; clerk may optionally
--     adjust. Meter returns to Active when the report is resolved (see 8).
--
-- (4) Installment termination triggers resolve the "terminated" status
--     from 'CANCELLED' (the seeded code), falling back to 'TERMINATED'.
--
-- (5) OPTIONAL path: if a leak-type issue ever has billing_basis_id set,
--     once that estimated leak month is BILLED, restore the flagged meter
--     to Active (section 7). Primary leak path uses actual readings +
--     section 8 instead.
--
-- (8) When a service report is RESOLVED/confirmed, restore any meter on
--     that account still sitting on an affects_billing = FALSE approved
--     status (Waterleak_After_Meter) back to Active.
-- ============================================================

BEGIN;

-- ============================================================
-- 0. READING STATUS FLAG: which readings were actually taken by a person
-- ============================================================
ALTER TABLE public.meter_reading_status
    ADD COLUMN IF NOT EXISTS counts_as_actual BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.meter_reading_status
SET counts_as_actual = TRUE
WHERE status_code IN ('RECORDED', 'LEAK_AFTER_METER');

-- ============================================================
-- 1. DROP OLD TRIGGERS & FUNCTIONS FOR CLEAN RESET
-- ============================================================
DROP TRIGGER IF EXISTS set_reading_metadata_trigger ON public.meter_readings;
DROP TRIGGER IF EXISTS create_water_consumption_trigger ON public.meter_readings;
DROP TRIGGER IF EXISTS create_water_consumption_update_trigger ON public.meter_readings;
DROP TRIGGER IF EXISTS process_billing_trigger ON public.water_consumptions;
DROP TRIGGER IF EXISTS restore_leak_meter_active_after_billing_trigger ON public.billing;
DROP TRIGGER IF EXISTS restore_meter_active_on_report_resolved_trigger ON public.service_reports;
DROP TRIGGER IF EXISTS check_meter_status_for_installment_termination_trigger ON public.meters;
DROP TRIGGER IF EXISTS check_new_meter_status_for_installment_termination_trigger ON public.meters;

DROP FUNCTION IF EXISTS public.set_reading_metadata();
DROP FUNCTION IF EXISTS public.create_water_consumption_on_reading();
DROP FUNCTION IF EXISTS public.process_billing_on_consumption();
DROP FUNCTION IF EXISTS public.restore_leak_meter_active_after_billing();
DROP FUNCTION IF EXISTS public.restore_meter_active_on_report_resolved();
DROP FUNCTION IF EXISTS public.get_installment_status_id(VARCHAR);
DROP FUNCTION IF EXISTS public.get_recorded_status_id();
DROP FUNCTION IF EXISTS public.get_terminated_status_id();
DROP FUNCTION IF EXISTS public.get_billing_basis_id(VARCHAR);
DROP FUNCTION IF EXISTS public.check_meter_status_for_installment_termination();
DROP FUNCTION IF EXISTS public.check_new_meter_status_for_installment_termination();

-- ============================================================
-- 2. HELPER FUNCTIONS
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_recorded_status_id()
RETURNS UUID LANGUAGE plpgsql STABLE AS $$
DECLARE v_status_id UUID;
BEGIN
    SELECT reading_status_id INTO v_status_id
    FROM public.meter_reading_status WHERE status_code = 'RECORDED' LIMIT 1;
    RETURN v_status_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_installment_status_id(p_status_code VARCHAR)
RETURNS UUID LANGUAGE plpgsql STABLE AS $$
DECLARE v_status_id UUID;
BEGIN
    SELECT installment_status_id INTO v_status_id
    FROM public.installment_status WHERE status_code = p_status_code LIMIT 1;
    RETURN v_status_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_terminated_status_id()
RETURNS UUID LANGUAGE plpgsql STABLE AS $$
DECLARE v_status_id UUID;
BEGIN
    SELECT installment_status_id INTO v_status_id
    FROM public.installment_status
    WHERE status_code IN ('CANCELLED', 'TERMINATED')
    ORDER BY (status_code = 'CANCELLED') DESC
    LIMIT 1;
    RETURN v_status_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_billing_basis_id(p_basis_code VARCHAR)
RETURNS UUID LANGUAGE plpgsql STABLE AS $$
DECLARE v_basis_id UUID;
BEGIN
    SELECT billing_basis_id INTO v_basis_id
    FROM public.billing_basis WHERE basis_code = p_basis_code LIMIT 1;
    RETURN v_basis_id;
END;
$$;

-- ============================================================
-- 3. TRIGGER 1: BEFORE INSERT ON meter_readings
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_reading_metadata()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_recorded_id UUID;
BEGIN
    IF NEW.present_reading IS NOT NULL THEN
        NEW.reading_date := NOW();

        IF NEW.reading_status_id IS NULL THEN
            v_recorded_id := get_recorded_status_id();
            IF v_recorded_id IS NULL THEN
                RAISE EXCEPTION 'meter_reading_status has no RECORDED entry — cannot record reading';
            END IF;
            NEW.reading_status_id := v_recorded_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER set_reading_metadata_trigger
    BEFORE INSERT ON public.meter_readings
    FOR EACH ROW EXECUTE FUNCTION public.set_reading_metadata();

-- ============================================================
-- 4. TRIGGER 2: AFTER INSERT/UPDATE ON meter_readings
--
-- v4: The estimate is built from NORMAL readings only
--     (counts_as_actual = TRUE AND status_code <> 'LEAK_AFTER_METER').
--     Leak months are skipped so they don't inflate the average or the
--     "last consumption" for a following Defective/Stolen estimate.
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_water_consumption_on_reading()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_meter_account_id   UUID;
    v_prev_reading       NUMERIC := 0;
    v_consumption        NUMERIC;

    v_active_issue       RECORD;
    v_billed_consumption NUMERIC;
    v_billing_basis_id   UUID;
    v_avg_consumption    NUMERIC;
    v_history_count      INT;
    v_last_consumption   NUMERIC;
    v_basis_average_id   UUID;
    v_basis_last_id      UUID;
BEGIN
    IF NEW.present_reading IS NULL THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.present_reading IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF EXISTS (SELECT 1 FROM public.water_consumptions WHERE reading_id = NEW.reading_id) THEN
        RETURN NEW;
    END IF;

    SELECT meter_account_id INTO v_meter_account_id
    FROM public.meters WHERE meter_id = NEW.meter_id;

    IF v_meter_account_id IS NULL THEN
        RAISE EXCEPTION 'meter % has no linked meter_account — cannot create water_consumption', NEW.meter_id;
    END IF;

    -- meter_status is the single source of truth for whether a meter
    -- account can be billed. Only Active, Defective, Stolen, and
    -- Waterleak_After_Meter meters are billable.
    IF NOT EXISTS (
        SELECT 1 FROM public.meters m
        JOIN public.meter_status ms ON ms.meter_status_id = m.meter_status_id
        WHERE m.meter_id = NEW.meter_id
          AND ms.meter_status_name IN ('Active', 'Defective', 'Stolen', 'Waterleak_After_Meter')
    ) THEN
        RAISE EXCEPTION 'meter % is not in a billable status — cannot record a billable reading', NEW.meter_id;
    END IF;

    -- Previous reading (scoped to the current physical meter).
    SELECT mr.present_reading INTO v_prev_reading
    FROM public.meter_readings mr
    JOIN public.reading_periods rp_prev ON rp_prev.reading_period_id = mr.reading_period_id
    JOIN public.reading_periods rp_cur  ON rp_cur.reading_period_id  = NEW.reading_period_id
    WHERE mr.meter_account_id = v_meter_account_id
      AND mr.meter_id = NEW.meter_id
      AND mr.reading_id != NEW.reading_id
      AND mr.present_reading IS NOT NULL
      AND rp_prev.period_start < rp_cur.period_start
    ORDER BY rp_prev.period_start DESC
    LIMIT 1;

    v_prev_reading := COALESCE(v_prev_reading, 0);

    -- Actual consumption: always stored as-is on water_consumptions.consumption
    v_consumption := GREATEST(NEW.present_reading - v_prev_reading, 0);

    -- Default: normal billing uses the actual consumption
    v_billed_consumption := v_consumption;
    v_billing_basis_id   := NULL;

    v_basis_average_id := get_billing_basis_id('AVERAGE');
    v_basis_last_id    := get_billing_basis_id('LAST_CONSUMPTION');

    -- Approved, unresolved service report for this account.
    SELECT sr.report_id,
           sit.issue_name,
           sit.affects_billing,
           sit.billing_basis_id AS issue_basis_id
    INTO v_active_issue
    FROM public.service_reports sr
    JOIN public.service_issue_types sit ON sit.issue_type_id = sr.issue_type_id
    WHERE sr.meter_account_id = v_meter_account_id
      AND sr.resolved_at IS NULL
      AND sr.approved_at IS NOT NULL
    ORDER BY sr.created_at DESC
    LIMIT 1;

    -- ─── Estimated billing for any issue type that defines how to bill ───
    -- v4: history excludes LEAK_AFTER_METER
    -- v5: only estimate while the meter being read is still flagged
    --     (after replacement the new Active meter must bill actuals even
    --     if the report is not yet consultant-confirmed)
    IF v_active_issue.report_id IS NOT NULL
       AND (v_active_issue.affects_billing = TRUE OR v_active_issue.issue_basis_id IS NOT NULL)
       AND EXISTS (
           SELECT 1
           FROM public.meters m
           JOIN public.meter_status ms ON ms.meter_status_id = m.meter_status_id
           WHERE m.meter_id = NEW.meter_id
             AND ms.meter_status_name IN ('Defective', 'Stolen', 'Waterleak_After_Meter')
       )
    THEN

        -- Step 1: average of the last 3 NORMAL consumptions of the CURRENT
        -- meter. "Normal" = a reading with counts_as_actual = TRUE AND a
        -- status_code other than LEAK_AFTER_METER — the customer's own
        -- pipe was leaking during leak months, so those months are not
        -- representative of normal usage and must not feed the average.
        SELECT COUNT(*), AVG(x.consumption)
        INTO v_history_count, v_avg_consumption
        FROM (
            SELECT wc.consumption
            FROM public.water_consumptions wc
            JOIN public.meter_readings mr ON mr.reading_id = wc.reading_id
            JOIN public.meter_reading_status mrs ON mrs.reading_status_id = mr.reading_status_id
            JOIN public.reading_periods rp_prev ON rp_prev.reading_period_id = mr.reading_period_id
            JOIN public.reading_periods rp_cur  ON rp_cur.reading_period_id  = NEW.reading_period_id
            WHERE wc.meter_account_id = v_meter_account_id
              AND mr.meter_id = NEW.meter_id
              AND mrs.counts_as_actual = TRUE
              AND mrs.status_code <> 'LEAK_AFTER_METER'
              AND rp_prev.period_start < rp_cur.period_start
            ORDER BY rp_prev.period_start DESC
            LIMIT 3
        ) x;

        IF v_history_count = 3 THEN
            -- 3 normal months -> whole-number average (19.6 -> 20, 19.2 -> 19)
            v_billed_consumption := ROUND(v_avg_consumption, 0);
            v_billing_basis_id   := COALESCE(v_basis_average_id, v_active_issue.issue_basis_id);

        ELSE
            -- Step 2: fewer than 3 normal months -> last NORMAL consumption
            -- (skips estimated months AND leak months)
            SELECT wc2.consumption INTO v_last_consumption
            FROM public.water_consumptions wc2
            JOIN public.meter_readings mr2 ON mr2.reading_id = wc2.reading_id
            JOIN public.meter_reading_status mrs2 ON mrs2.reading_status_id = mr2.reading_status_id
            JOIN public.reading_periods rp_prev2 ON rp_prev2.reading_period_id = mr2.reading_period_id
            JOIN public.reading_periods rp_cur2  ON rp_cur2.reading_period_id  = NEW.reading_period_id
            WHERE wc2.meter_account_id = v_meter_account_id
              AND mr2.meter_id = NEW.meter_id
              AND mrs2.counts_as_actual = TRUE
              AND mrs2.status_code <> 'LEAK_AFTER_METER'
              AND rp_prev2.period_start < rp_cur2.period_start
            ORDER BY rp_prev2.period_start DESC
            LIMIT 1;

            IF v_last_consumption IS NOT NULL THEN
                v_billed_consumption := ROUND(v_last_consumption, 2);
                v_billing_basis_id   := COALESCE(v_basis_last_id, v_active_issue.issue_basis_id);
            ELSE
                -- No normal history at all: never bill the issue reading itself
                v_billed_consumption := 0;
                v_billing_basis_id   := COALESCE(v_active_issue.issue_basis_id, v_basis_last_id);
                RAISE NOTICE 'Meter account % has issue % with no prior normal consumption history — billed 0',
                    v_meter_account_id, v_active_issue.issue_name;
            END IF;
        END IF;

    END IF;
    -- ▲▲ CHANGED (v4) ▲▲

    -- Insert Consumption Record
    INSERT INTO public.water_consumptions (
        reading_id, meter_account_id, previous_reading, present_reading,
        consumption, billed_consumption, billing_basis_id, created_at
    ) VALUES (
        NEW.reading_id, v_meter_account_id, v_prev_reading, NEW.present_reading,
        v_consumption, v_billed_consumption, v_billing_basis_id, NOW()
    );

    RETURN NEW;
END;
$$;

CREATE TRIGGER create_water_consumption_trigger
    AFTER INSERT ON public.meter_readings
    FOR EACH ROW EXECUTE FUNCTION public.create_water_consumption_on_reading();

CREATE TRIGGER create_water_consumption_update_trigger
    AFTER UPDATE ON public.meter_readings
    FOR EACH ROW
    WHEN (NEW.present_reading IS DISTINCT FROM OLD.present_reading)
    EXECUTE FUNCTION public.create_water_consumption_on_reading();

-- ============================================================
-- 5. TRIGGER 3: AFTER INSERT ON water_consumptions
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_billing_on_consumption()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_reading_period_id UUID;
    v_consumer_id       UUID;
    v_classification_id UUID;

    v_tier              RECORD;
    v_remaining         NUMERIC;
    v_block_order       INT := 0;
    v_units_used        NUMERIC;
    v_subtotal          NUMERIC;
    v_current_billing   NUMERIC := 0;

    v_billing_prev_bal  NUMERIC := 0;
    v_reconnect_bal     NUMERIC := 0;
    v_target_reconnect_id UUID := NULL;
    v_prev_billing_id   UUID := NULL;
    v_prev_balance      NUMERIC := 0;
    v_penalty_amount    NUMERIC := 0;
    v_penalty_rate      NUMERIC := 0;
    v_meter_charge      NUMERIC := 0;
    v_install_id        UUID;
    v_active_installment_status_id    UUID;
    v_completed_installment_status_id UUID;
    v_total_billing     NUMERIC;

    v_status_id         UUID;
    v_forwarded_status_id UUID;
    v_paid_status_id    UUID;
    v_billing_id        UUID;
BEGIN
    IF EXISTS (SELECT 1 FROM public.billing WHERE consumption_id = NEW.consumption_id) THEN
        RETURN NEW;
    END IF;

    SELECT mr.reading_period_id INTO v_reading_period_id
    FROM public.meter_readings mr
    WHERE mr.reading_id = NEW.reading_id;

    IF v_reading_period_id IS NULL THEN
        RAISE EXCEPTION 'water_consumption % has no matching meter_reading with a reading_period', NEW.consumption_id;
    END IF;

    SELECT consumer_id, classification_id INTO v_consumer_id, v_classification_id
    FROM public.meter_accounts WHERE meter_account_id = NEW.meter_account_id;

    IF v_consumer_id IS NULL THEN
        RAISE EXCEPTION 'meter_account % has no linked consumer — cannot create billing', NEW.meter_account_id;
    END IF;

    -- Tiered Community Breakdown uses NEW.billed_consumption
    v_remaining := NEW.billed_consumption;

    FOR v_tier IN
        SELECT community_charge_id, min_consumption, max_consumption, multiplier
        FROM public.community_charges
        WHERE classification_id = v_classification_id
        ORDER BY min_consumption ASC
    LOOP
        EXIT WHEN v_remaining <= 0;
        v_block_order := v_block_order + 1;

        IF v_tier.max_consumption IS NOT NULL THEN
            v_units_used := LEAST(v_remaining, v_tier.max_consumption - v_tier.min_consumption + 1);
        ELSE
            v_units_used := v_remaining;
        END IF;

        v_subtotal := ROUND((v_units_used * v_tier.multiplier)::NUMERIC, 2);
        v_current_billing := v_current_billing + v_subtotal;
        v_remaining := v_remaining - v_units_used;

        INSERT INTO public.billing_community_breakdowns (
            consumption_id, community_charge_id, block_order, units_used, rate_per_unit, subtotal
        ) VALUES (
            NEW.consumption_id, v_tier.community_charge_id, v_block_order, v_units_used, v_tier.multiplier, v_subtotal
        );
    END LOOP;

    IF v_block_order = 0 AND NEW.billed_consumption > 0 THEN
        RAISE EXCEPTION 'no community_charges tiers found for classification % — cannot bill billed_consumption %',
            v_classification_id, NEW.billed_consumption;
    END IF;

    v_current_billing := ROUND(v_current_billing::NUMERIC, 2);

    -- Check Reconnections / Prior Balances
    SELECT r.reconnection_id, r.remaining_balance
    INTO v_target_reconnect_id, v_reconnect_bal
    FROM public.reconnections r
    JOIN public.disconnections d ON r.disconnection_id = d.disconnection_id
    WHERE d.meter_account_id = NEW.meter_account_id
      AND r.reconnection_status_id IN (
          SELECT reconnection_status_id FROM public.reconnection_status
          WHERE status_name = 'Reconnected'
      )
      AND r.payment_status_id NOT IN (
          SELECT billing_status_id FROM public.billing_status
          WHERE billing_status_name IN ('forwarded', 'paid')
      )
      AND r.remaining_balance > 0
    ORDER BY r.created_at ASC
    LIMIT 1;

    IF v_target_reconnect_id IS NOT NULL THEN
        v_prev_balance := ROUND(v_reconnect_bal::NUMERIC, 2);
    ELSE
        -- Prior period billing whose remaining balance will be carried into
        -- this new bill (and then closed as paid below).
        SELECT b.billing_id, b.remaining_balance
        INTO v_prev_billing_id, v_billing_prev_bal
        FROM public.billing b
        JOIN public.reading_periods rp_prev ON rp_prev.reading_period_id = b.reading_period_id
        JOIN public.reading_periods rp_cur  ON rp_cur.reading_period_id  = v_reading_period_id
        JOIN public.billing_status bs ON bs.billing_status_id = b.billing_status_id
        WHERE b.meter_account_id = NEW.meter_account_id
          AND rp_prev.period_start < rp_cur.period_start
          AND bs.billing_status_name IN ('unpaid', 'partial')
          AND b.remaining_balance > 0
        ORDER BY rp_prev.period_start DESC
        LIMIT 1;

        v_billing_prev_bal := COALESCE(v_billing_prev_bal, 0);
        v_prev_balance := ROUND(v_billing_prev_bal::NUMERIC, 2);
    END IF;

    SELECT COALESCE(penalty_rate, 0) INTO v_penalty_rate
    FROM public.penalty_rate ORDER BY created_at DESC LIMIT 1;

    v_penalty_amount := ROUND((v_prev_balance * v_penalty_rate / 100.0)::NUMERIC, 2);

    -- Meter Installments
    v_meter_charge := 0;
    v_install_id := NULL;
    v_active_installment_status_id := get_installment_status_id('ACTIVE');

    IF v_active_installment_status_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.meter_accounts ma
        WHERE ma.meter_account_id = NEW.meter_account_id
    ) THEN
        SELECT mi.installment_id, LEAST(mi.monthly_amount, mi.remaining_balance)
        INTO v_install_id, v_meter_charge
        FROM public.meter_installments mi
        WHERE mi.meter_account_id = NEW.meter_account_id
          AND mi.status_id = v_active_installment_status_id
          AND mi.remaining_balance > 0
        ORDER BY mi.created_at ASC
        LIMIT 1;
    END IF;

    v_meter_charge := COALESCE(ROUND(v_meter_charge::NUMERIC, 2), 0);
    v_total_billing := ROUND((v_current_billing + v_prev_balance + v_penalty_amount + v_meter_charge)::NUMERIC, 2);

    SELECT billing_status_id INTO v_status_id
    FROM public.billing_status WHERE billing_status_name = 'unpaid' LIMIT 1;

    IF v_status_id IS NULL THEN
        RAISE EXCEPTION 'billing_status has no "unpaid" entry — cannot create billing';
    END IF;

    INSERT INTO public.billing (
        reading_period_id, meter_account_id, consumer_id, consumption_id,
        current_billing, previous_balance, penalty_amount, total_billing, remaining_balance, billing_status_id
    ) VALUES (
        v_reading_period_id, NEW.meter_account_id, v_consumer_id, NEW.consumption_id,
        v_current_billing, v_prev_balance, v_penalty_amount, v_total_billing, v_total_billing, v_status_id
    )
    RETURNING billing_id INTO v_billing_id;

    IF v_target_reconnect_id IS NOT NULL THEN
        SELECT billing_status_id INTO v_forwarded_status_id
        FROM public.billing_status WHERE billing_status_name = 'forwarded' LIMIT 1;

        IF v_forwarded_status_id IS NULL THEN
            RAISE EXCEPTION 'billing_status has no "forwarded" entry — cannot update reconnection payment status';
        END IF;

        UPDATE public.reconnections
        SET payment_status_id = v_forwarded_status_id,
            updated_at = NOW()
        WHERE reconnection_id = v_target_reconnect_id;
    ELSIF v_prev_billing_id IS NOT NULL AND v_prev_balance > 0 THEN
        -- Balance was carried into the new bill — mark prior as paid only.
        -- Keep remaining_balance as historical snapshot (do not zero it).
        SELECT billing_status_id INTO v_paid_status_id
        FROM public.billing_status WHERE billing_status_name = 'paid' LIMIT 1;

        IF v_paid_status_id IS NULL THEN
            RAISE EXCEPTION 'billing_status has no "paid" entry — cannot close carried-over prior billing';
        END IF;

        UPDATE public.billing
        SET billing_status_id = v_paid_status_id
        WHERE billing_id = v_prev_billing_id;
    END IF;

    IF v_install_id IS NOT NULL AND v_meter_charge > 0 THEN
        INSERT INTO public.meter_installment_charges (installment_id, billing_id, amount)
        VALUES (v_install_id, v_billing_id, v_meter_charge);

        v_completed_installment_status_id := get_installment_status_id('COMPLETED');

        UPDATE public.meter_installments
        SET remaining_balance = ROUND((remaining_balance - v_meter_charge)::NUMERIC, 2),
            status_id = CASE
                WHEN remaining_balance - v_meter_charge <= 0 AND v_completed_installment_status_id IS NOT NULL
                    THEN v_completed_installment_status_id
                ELSE status_id
            END
        WHERE installment_id = v_install_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER process_billing_trigger
    AFTER INSERT ON public.water_consumptions
    FOR EACH ROW EXECUTE FUNCTION public.process_billing_on_consumption();

-- ============================================================
-- 6. INSTALLMENT TERMINATION TRIGGERS ON METERS
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_meter_status_for_installment_termination()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_terminated_status_id UUID;
    v_active_status_id UUID;
    v_pending_status_id UUID;
    v_installment_record RECORD;
    v_new_status_name VARCHAR;
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.meter_status_id IS DISTINCT FROM NEW.meter_status_id THEN
        SELECT meter_status_name INTO v_new_status_name
        FROM public.meter_status
        WHERE meter_status_id = NEW.meter_status_id;

        IF v_new_status_name IN ('Defective', 'Stolen') THEN
            v_terminated_status_id := get_terminated_status_id();

            IF v_terminated_status_id IS NOT NULL THEN
                v_active_status_id  := get_installment_status_id('ACTIVE');
                v_pending_status_id := get_installment_status_id('PENDING');

                FOR v_installment_record IN
                    SELECT installment_id, remaining_balance, status_id
                    FROM public.meter_installments
                    WHERE meter_account_id = NEW.meter_account_id
                      AND status_id IN (v_active_status_id, v_pending_status_id)
                LOOP
                    UPDATE public.meter_installments
                    SET status_id = v_terminated_status_id,
                        updated_at = NOW()
                    WHERE installment_id = v_installment_record.installment_id;

                    RAISE NOTICE 'Installment % terminated due to meter status change to %',
                        v_installment_record.installment_id, v_new_status_name;
                END LOOP;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_new_meter_status_for_installment_termination()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_terminated_status_id UUID;
    v_active_status_id UUID;
    v_pending_status_id UUID;
    v_installment_record RECORD;
    v_status_name VARCHAR;
BEGIN
    SELECT meter_status_name INTO v_status_name
    FROM public.meter_status
    WHERE meter_status_id = NEW.meter_status_id;

    IF v_status_name IN ('Defective', 'Stolen') THEN
        v_terminated_status_id := get_terminated_status_id();

        IF v_terminated_status_id IS NOT NULL THEN
            v_active_status_id  := get_installment_status_id('ACTIVE');
            v_pending_status_id := get_installment_status_id('PENDING');

            FOR v_installment_record IN
                SELECT installment_id, remaining_balance, status_id
                FROM public.meter_installments
                WHERE meter_account_id = NEW.meter_account_id
                  AND status_id IN (v_active_status_id, v_pending_status_id)
            LOOP
                UPDATE public.meter_installments
                SET status_id = v_terminated_status_id,
                    updated_at = NOW()
                WHERE installment_id = v_installment_record.installment_id;

                RAISE NOTICE 'Installment % terminated due to new meter with status %',
                    v_installment_record.installment_id, v_status_name;
            END LOOP;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER check_meter_status_for_installment_termination_trigger
    AFTER UPDATE OF meter_status_id ON public.meters
    FOR EACH ROW
    EXECUTE FUNCTION public.check_meter_status_for_installment_termination();

CREATE TRIGGER check_new_meter_status_for_installment_termination_trigger
    AFTER INSERT ON public.meters
    FOR EACH ROW
    EXECUTE FUNCTION public.check_new_meter_status_for_installment_termination();

-- ============================================================
-- 7. TRIGGER 4: AFTER INSERT ON billing
-- ============================================================
CREATE OR REPLACE FUNCTION public.restore_leak_meter_active_after_billing()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_meter_id         UUID;
    v_active_status_id UUID;
BEGIN
    SELECT mr.meter_id
    INTO v_meter_id
    FROM public.water_consumptions wc
    JOIN public.meter_readings mr ON mr.reading_id = wc.reading_id
    JOIN public.meters m          ON m.meter_id    = mr.meter_id
    WHERE wc.consumption_id = NEW.consumption_id
      AND wc.billing_basis_id IS NOT NULL
      AND m.meter_status_id IN (
          SELECT sit.approved_meter_status_id
          FROM public.service_issue_types sit
          WHERE sit.approved_meter_status_id IS NOT NULL
            AND sit.affects_billing = FALSE
      );

    IF v_meter_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT meter_status_id INTO v_active_status_id
    FROM public.meter_status
    WHERE meter_status_name = 'Active'
    LIMIT 1;

    IF v_active_status_id IS NULL THEN
        RAISE NOTICE 'meter_status has no "Active" entry — meter % not restored', v_meter_id;
        RETURN NEW;
    END IF;

    UPDATE public.meters
    SET meter_status_id = v_active_status_id
    WHERE meter_id = v_meter_id;

    RETURN NEW;
END;
$$;

CREATE TRIGGER restore_leak_meter_active_after_billing_trigger
    AFTER INSERT ON public.billing
    FOR EACH ROW
    EXECUTE FUNCTION public.restore_leak_meter_active_after_billing();

-- ============================================================
-- 8. TRIGGER 5: AFTER UPDATE ON service_reports (resolved)
--    Leak After Meter bills ACTUAL readings (no billing_basis), so
--    section 7 never fires. When the consultant confirms / resolves the
--    report, clear Waterleak_After_Meter back to Active.
-- ============================================================
CREATE OR REPLACE FUNCTION public.restore_meter_active_on_report_resolved()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_active_status_id UUID;
    v_affects_billing  BOOLEAN;
BEGIN
    -- Only fire when resolved_at flips from null -> set
    IF NEW.resolved_at IS NULL THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.resolved_at IS NOT NULL THEN
        RETURN NEW;
    END IF;
    IF NEW.meter_account_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT sit.affects_billing
    INTO v_affects_billing
    FROM public.service_issue_types sit
    WHERE sit.issue_type_id = NEW.issue_type_id;

    -- Defective / Stolen are cleared by the meter-replacement job flow
    IF COALESCE(v_affects_billing, TRUE) = TRUE THEN
        RETURN NEW;
    END IF;

    SELECT meter_status_id INTO v_active_status_id
    FROM public.meter_status
    WHERE meter_status_name = 'Active'
    LIMIT 1;

    IF v_active_status_id IS NULL THEN
        RAISE NOTICE 'meter_status has no "Active" entry — cannot restore meters for report %', NEW.report_id;
        RETURN NEW;
    END IF;

    UPDATE public.meters m
    SET meter_status_id = v_active_status_id,
        updated_at = NOW()
    WHERE m.meter_account_id = NEW.meter_account_id
      AND m.meter_status_id IN (
          SELECT sit.approved_meter_status_id
          FROM public.service_issue_types sit
          WHERE sit.approved_meter_status_id IS NOT NULL
            AND sit.affects_billing = FALSE
      );

    RETURN NEW;
END;
$$;

CREATE TRIGGER restore_meter_active_on_report_resolved_trigger
    AFTER UPDATE OF resolved_at ON public.service_reports
    FOR EACH ROW
    EXECUTE FUNCTION public.restore_meter_active_on_report_resolved();

COMMIT;