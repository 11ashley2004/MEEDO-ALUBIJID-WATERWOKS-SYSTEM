-- When a prior billing remaining balance is carried into the new current
-- billing, close that prior bill as "forwarded" (not "paid").
-- Keep remaining_balance as a historical snapshot (do not zero it).
-- Reconnection carry-over already uses "forwarded"; billings now match.

-- Ensure the status row exists (name only — works even if description is unused)
INSERT INTO public.billing_status (billing_status_name)
SELECT 'forwarded'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.billing_status bs
  WHERE lower(bs.billing_status_name) = 'forwarded'
);

CREATE OR REPLACE FUNCTION public.process_billing_on_consumption()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $body$
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

    v_status_id           UUID;
    v_forwarded_status_id UUID;
    v_billing_id          UUID;
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
        RAISE EXCEPTION 'meter_account % has no linked consumer - cannot create billing', NEW.meter_account_id;
    END IF;

    -- Tiered community breakdown uses NEW.billed_consumption
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
        RAISE EXCEPTION 'no community_charges tiers found for classification % - cannot bill billed_consumption %',
            v_classification_id, NEW.billed_consumption;
    END IF;

    v_current_billing := ROUND(v_current_billing::NUMERIC, 2);

    -- Check reconnections / prior balances
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
        -- Prior period billing whose remaining balance will be carried forward
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

    -- Meter installments
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
        RAISE EXCEPTION 'billing_status has no unpaid entry - cannot create billing';
    END IF;

    INSERT INTO public.billing (
        reading_period_id, meter_account_id, consumer_id, consumption_id,
        current_billing, previous_balance, penalty_amount, total_billing, remaining_balance, billing_status_id
    ) VALUES (
        v_reading_period_id, NEW.meter_account_id, v_consumer_id, NEW.consumption_id,
        v_current_billing, v_prev_balance, v_penalty_amount, v_total_billing, v_total_billing, v_status_id
    )
    RETURNING billing_id INTO v_billing_id;

    SELECT billing_status_id INTO v_forwarded_status_id
    FROM public.billing_status WHERE billing_status_name = 'forwarded' LIMIT 1;

    IF v_forwarded_status_id IS NULL THEN
        RAISE EXCEPTION 'billing_status has no forwarded entry - cannot close carried-over balances';
    END IF;

    IF v_target_reconnect_id IS NOT NULL THEN
        UPDATE public.reconnections
        SET payment_status_id = v_forwarded_status_id,
            updated_at = NOW()
        WHERE reconnection_id = v_target_reconnect_id;
    ELSIF v_prev_billing_id IS NOT NULL AND v_prev_balance > 0 THEN
        -- Balance carried to the new bill - mark prior as forwarded.
        -- Keep remaining_balance as historical snapshot (do not zero it).
        UPDATE public.billing
        SET billing_status_id = v_forwarded_status_id,
            updated_at = NOW()
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
$body$;
