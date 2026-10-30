-- ============================================================
-- generate_billing_for_issue_accounts (v4)
--
-- CHANGED v4: the estimate for Defective / Stolen accounts uses only
-- NORMAL months — counts_as_actual = TRUE AND status_code <> 'LEAK_AFTER_METER'.
-- Leak months are excluded from the average and from the "last
-- consumption" fallback, because the customer's own pipe was leaking
-- those months — their usage then is not representative of normal use.
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_billing_for_issue_accounts(
    p_reading_period_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_account              RECORD;
    v_period_start         DATE;
    v_defective_status_id  UUID;
    v_stolen_status_id     UUID;
    v_approved_status_id   UUID;

    v_reading_status_code  TEXT;
    v_reading_status_id    UUID;
    v_reading_id           UUID;
    v_existing_reading_id  UUID;
    v_existing_present     NUMERIC;
    v_basis_code           TEXT;
    v_previous_reading     NUMERIC;
    v_consumption          NUMERIC;
    v_present_reading      NUMERIC;
    v_consumption_id       UUID;
    v_billing_id           UUID;
    v_already_billed       BOOLEAN;

    v_history_count        INT;
    v_avg_consumption      NUMERIC;
    v_meter_reader_id      UUID;

    v_generated        JSONB := '[]'::JSONB;
    v_skipped          JSONB := '[]'::JSONB;
    v_already_billed_list JSONB := '[]'::JSONB;
    v_generated_count  INT   := 0;
BEGIN
    SELECT period_start INTO v_period_start
    FROM public.reading_periods
    WHERE reading_period_id = p_reading_period_id;

    IF v_period_start IS NULL THEN
        RAISE EXCEPTION 'Reading period % not found', p_reading_period_id;
    END IF;

    SELECT meter_status_id INTO v_defective_status_id
    FROM public.meter_status WHERE meter_status_name = 'Defective' LIMIT 1;

    SELECT meter_status_id INTO v_stolen_status_id
    FROM public.meter_status WHERE meter_status_name = 'Stolen' LIMIT 1;

    SELECT status_id INTO v_approved_status_id
    FROM public.bulk_status WHERE lower(status_name) = 'approved' LIMIT 1;

    IF v_defective_status_id IS NULL AND v_stolen_status_id IS NULL THEN
        RAISE EXCEPTION 'Neither "Defective" nor "Stolen" meter_status rows were found — check meter_status table names';
    END IF;

    -- Skip any account that has a PENDING service report.
    FOR v_account IN
        SELECT m.meter_id, m.meter_account_id, m.meter_status_id
        FROM public.meters m
        WHERE m.meter_status_id IN (v_defective_status_id, v_stolen_status_id)
          AND NOT EXISTS (
              SELECT 1
              FROM public.service_reports sr
              JOIN public.bulk_status bs ON bs.status_id = sr.report_status_id
              WHERE sr.meter_account_id = m.meter_account_id
                AND lower(bs.status_name) = 'pending'
          )
    LOOP
        BEGIN
            v_already_billed := FALSE;

            SELECT mr.reading_id, mr.present_reading
            INTO v_existing_reading_id, v_existing_present
            FROM public.meter_readings mr
            WHERE mr.meter_account_id = v_account.meter_account_id
              AND mr.reading_period_id = p_reading_period_id
            LIMIT 1;

            IF v_existing_reading_id IS NOT NULL AND v_existing_present IS NOT NULL THEN
                SELECT b.billing_id INTO v_billing_id
                FROM public.water_consumptions wc
                JOIN public.billing b ON b.consumption_id = wc.consumption_id
                WHERE wc.reading_id = v_existing_reading_id
                LIMIT 1;

                IF v_billing_id IS NOT NULL THEN
                    v_already_billed := TRUE;
                END IF;
            END IF;

            IF v_already_billed THEN
                v_already_billed_list := v_already_billed_list || jsonb_build_object(
                    'meter_account_id', v_account.meter_account_id,
                    'reading_id', v_existing_reading_id,
                    'billing_id', v_billing_id
                );
                CONTINUE;
            END IF;

            v_reading_status_code := CASE
                WHEN v_account.meter_status_id = v_stolen_status_id THEN 'STOLEN'
                ELSE 'DEFECTIVE'
            END;

            SELECT reading_status_id INTO v_reading_status_id
            FROM public.meter_reading_status
            WHERE upper(status_code) = v_reading_status_code
            LIMIT 1;

            IF v_reading_status_id IS NULL THEN
                v_skipped := v_skipped || jsonb_build_object(
                    'meter_account_id', v_account.meter_account_id,
                    'reason', 'No matching meter_reading_status for ' || v_reading_status_code
                );
                CONTINUE;
            END IF;

            -- Meter reader currently ACTIVE on this account's zone.
            SELECT mra.user_id INTO v_meter_reader_id
            FROM public.meter_accounts ma
            JOIN public.meter_reader_assignments mra ON mra.zone_id = ma.zone_id
            WHERE ma.meter_account_id = v_account.meter_account_id
              AND mra.is_active = TRUE
            ORDER BY mra.assigned_date DESC
            LIMIT 1;

            IF v_existing_reading_id IS NOT NULL THEN
                v_reading_id := v_existing_reading_id;
            ELSE
                INSERT INTO public.meter_readings (
                    reading_period_id, meter_account_id, meter_id,
                    meter_reader_id, present_reading, reading_status_id, reading_date
                ) VALUES (
                    p_reading_period_id, v_account.meter_account_id, v_account.meter_id,
                    v_meter_reader_id, NULL, v_reading_status_id, NOW()
                )
                RETURNING reading_id INTO v_reading_id;
            END IF;

            -- Billing basis from an approved service report (only used to
            -- detect NO_CHARGE now; AVERAGE vs LAST_CONSUMPTION is decided
            -- by how much history the meter has).
            v_basis_code := NULL;

            IF v_approved_status_id IS NOT NULL THEN
                BEGIN
                    SELECT bb.basis_code INTO v_basis_code
                    FROM public.service_reports sr
                    JOIN public.service_issue_types sit ON sit.issue_type_id = sr.issue_type_id
                    JOIN public.billing_basis bb ON bb.billing_basis_id = sit.billing_basis_id
                    WHERE sr.meter_account_id = v_account.meter_account_id
                      AND sr.report_status_id = v_approved_status_id
                      AND sit.affects_billing = TRUE
                    ORDER BY sr.approved_at DESC
                    LIMIT 1;
                EXCEPTION WHEN undefined_table OR undefined_column THEN
                    v_basis_code := NULL;
                END;
            END IF;

            v_basis_code := COALESCE(v_basis_code, 'LAST_CONSUMPTION');

            -- Previous reading = the latest reading of THIS meter from any
            -- earlier period, INCLUDING estimated and leak months, so each
            -- month's present_reading builds on the one before it.
            SELECT mr2.present_reading INTO v_previous_reading
            FROM public.meter_readings mr2
            JOIN public.reading_periods rp2 ON rp2.reading_period_id = mr2.reading_period_id
            WHERE mr2.meter_account_id = v_account.meter_account_id
              AND mr2.meter_id = v_account.meter_id
              AND mr2.present_reading IS NOT NULL
              AND rp2.period_start < v_period_start
            ORDER BY rp2.period_start DESC
            LIMIT 1;

            v_previous_reading := COALESCE(v_previous_reading, 0);

            -- ▼▼ CHANGED (v4): history excludes LEAK_AFTER_METER ▼▼
            IF upper(v_basis_code) = 'NO_CHARGE' THEN
                v_consumption := 0;

            ELSE
                -- Step 1: average of the last 3 NORMAL readings of the
                -- CURRENT meter — counts_as_actual = TRUE AND status_code
                -- is not LEAK_AFTER_METER. Leak months are skipped so they
                -- don't inflate the average for a Defective/Stolen estimate.
                SELECT COUNT(*), AVG(x.consumption)
                INTO v_history_count, v_avg_consumption
                FROM (
                    SELECT wc.consumption
                    FROM public.water_consumptions wc
                    JOIN public.meter_readings mr3 ON mr3.reading_id = wc.reading_id
                    JOIN public.meter_reading_status mrs3 ON mrs3.reading_status_id = mr3.reading_status_id
                    JOIN public.reading_periods rp3 ON rp3.reading_period_id = mr3.reading_period_id
                    WHERE wc.meter_account_id = v_account.meter_account_id
                      AND mr3.meter_id = v_account.meter_id
                      AND mrs3.counts_as_actual = TRUE
                      AND mrs3.status_code <> 'LEAK_AFTER_METER'
                      AND rp3.period_start < v_period_start
                    ORDER BY rp3.period_start DESC
                    LIMIT 3
                ) x;

                IF v_history_count = 3 THEN
                    -- 3 normal months -> whole-number average
                    v_consumption := ROUND(v_avg_consumption, 0);
                    v_basis_code  := 'AVERAGE';
                ELSE
                    -- Step 2: fewer than 3 normal months -> last NORMAL
                    -- consumption (skips leak months AND estimated months).
                    SELECT wc.consumption INTO v_consumption
                    FROM public.water_consumptions wc
                    JOIN public.meter_readings mr3 ON mr3.reading_id = wc.reading_id
                    JOIN public.meter_reading_status mrs3 ON mrs3.reading_status_id = mr3.reading_status_id
                    JOIN public.reading_periods rp3 ON rp3.reading_period_id = mr3.reading_period_id
                    WHERE wc.meter_account_id = v_account.meter_account_id
                      AND mrs3.counts_as_actual = TRUE
                      AND mrs3.status_code <> 'LEAK_AFTER_METER'
                      AND rp3.period_start < v_period_start
                    ORDER BY rp3.period_start DESC
                    LIMIT 1;

                    v_consumption := COALESCE(ROUND(v_consumption, 0), 0);
                    v_basis_code  := 'LAST_CONSUMPTION';
                END IF;
            END IF;
            -- ▲▲ CHANGED (v4) ▲▲

            v_present_reading := v_previous_reading + v_consumption;

            UPDATE public.meter_readings
            SET present_reading  = v_present_reading,
                meter_reader_id  = COALESCE(meter_reader_id, v_meter_reader_id)
            WHERE reading_id = v_reading_id
              AND present_reading IS NULL;

            SELECT consumption_id INTO v_consumption_id
            FROM public.water_consumptions
            WHERE reading_id = v_reading_id;

            IF v_consumption_id IS NULL THEN
                v_skipped := v_skipped || jsonb_build_object(
                    'meter_account_id', v_account.meter_account_id,
                    'reading_id', v_reading_id,
                    'reason', 'present_reading update did not produce a water_consumptions row — check create_water_consumption trigger'
                );
                CONTINUE;
            END IF;

            SELECT billing_id INTO v_billing_id
            FROM public.billing
            WHERE consumption_id = v_consumption_id;

            IF v_billing_id IS NULL THEN
                v_skipped := v_skipped || jsonb_build_object(
                    'meter_account_id', v_account.meter_account_id,
                    'reading_id', v_reading_id,
                    'consumption_id', v_consumption_id,
                    'reason', 'water_consumptions row created but no billing row followed — check process_billing_trigger'
                );
                CONTINUE;
            END IF;

            v_generated := v_generated || jsonb_build_object(
                'meter_account_id', v_account.meter_account_id,
                'reading_id', v_reading_id,
                'basis_code', v_basis_code,
                'consumption', v_consumption,
                'present_reading', v_present_reading,
                'billing_id', v_billing_id
            );
            v_generated_count := v_generated_count + 1;

        EXCEPTION WHEN OTHERS THEN
            v_skipped := v_skipped || jsonb_build_object(
                'meter_account_id', v_account.meter_account_id,
                'reason', SQLERRM
            );
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'reading_period_id', p_reading_period_id,
        'generated_count', v_generated_count,
        'generated', v_generated,
        'already_billed', v_already_billed_list,
        'skipped', v_skipped
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_billing_for_issue_accounts(UUID) TO authenticated;