-- ============================================================
-- BULK EXCEL IMPORT: import_billing_period_bulk()
--
-- Row fields (JSON): account_name, email, contact_number, meter_serial_no,
-- meter_status, classification, present/previous/consumption, billing amounts,
-- optional is_voluntary (disconnected rows).
--
-- Consumers require email (+ unique contact when provided). contract_no is
-- auto-generated as ##-####-#####. Returned `auth_consumers` is used by the
-- app to create matching Supabase Auth users after the RPC commits.
--
-- CHANGE (disconnections):
--   Meters imported with meter_status = 'disconnected' now also get a
--   matching row inserted into public.disconnections, instead of that
--   account only existing as "Disconnected" on the meters table with
--   nothing behind it in the disconnection workflow.
--
--   Voluntary/involuntary on that inserted row:
--     - If the row payload includes `is_voluntary` (true/false), that
--       value is used as-is.
--     - If the row does NOT specify it (the normal case for a bulk
--       historical import), it defaults to FALSE — i.e. treated as
--       notice-based / involuntary, per your instruction: "if not
--       specify voluntary means its notice base."
--
--   notice_meter_account_id is left NULL on these inserted rows — a bulk
--   import has no actual notice record to point to, it's just recording
--   that the account came in already disconnected, on a notice basis,
--   with no formal notice row behind it (mirrors the "no disconnections
--   row = notice-based" rule used in the reconnection eligibility logic).
--
-- ⚠️ UNRESOLVED — which disconnection_status to use on the inserted row:
--   I don't know your exact status_name values in disconnection_status
--   beyond "pending" and "cancelled" (used elsewhere in your app code).
--   For a historical/already-disconnected import, this needs a status
--   that means "already disconnected / completed" — NOT "pending".
--   I'm resolving it as "the first status that isn't pending or
--   cancelled," which is a guess. If you have more than one such status
--   (e.g. "Completed" vs "Disconnected" as distinct rows), tell me the
--   exact status_name to use and I'll pin it down instead of guessing.
--   If none is found, the row is skipped (added to v_skipped) rather
--   than silently inserting a disconnection with a null status.
--
-- CHANGE (billing payments for paid / partial):
--   When balance vs total_bill implies paid (remaining <= 0) or partial
--   (0 < remaining < total), insert a matching payments + billing_payments
--   transaction for the amount already collected:
--     amount_paid = total_billing - GREATEST(remaining_balance, 0)
--   Unpaid rows (remaining ≈ total) get no payment row.
--   Receipt numbers use IMP-{year}-{8 hex}. payment_type = 'billing'.
--   payment_date uses the period due_date (falls back to CURRENT_DATE).
--   recieved_by = imported_by.
--
-- (All other notes/caveats from the previous version — created_by,
-- account_status/v_connected_status_id, consumer_id vs auth.users —
-- still apply and are unchanged below.)
-- ============================================================
CREATE OR REPLACE FUNCTION public.import_billing_period_bulk(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_period        JSONB := payload->'period';
    v_barangay_name TEXT  := payload->>'barangay_name';
    v_purok         INT   := (payload->>'purok')::INT;
    v_rows          JSONB := payload->'rows';
    v_row           JSONB;
    v_imported_by   UUID  := (payload->>'imported_by')::UUID;

    v_barangay_id       UUID;
    v_zone_id           UUID;
    v_reading_period_id UUID;

    v_consumer_id       UUID;
    v_meter_account_id  UUID;
    v_meter_id          UUID;
    v_reading_id        UUID;
    v_consumption_id    UUID;
    v_billing_id        UUID;
    v_disconnection_id  UUID;
    v_payment_id        UUID;

    v_classification_id   UUID;
    v_connection_fee       NUMERIC(10,2);
    v_meter_status_id     UUID;
    v_reading_status_id   UUID;
    v_billing_status_id   UUID;
    v_disconnection_status_id UUID;
    v_payment_type_id     UUID;
    v_first_tier_id       UUID;

    v_clean_name             TEXT;
    v_meter_status_name      TEXT;
    v_is_voluntary            BOOLEAN;
    v_email                  TEXT;
    v_contact_number         TEXT;
    v_contract_no         TEXT;
    v_meter_serial           TEXT;
    v_receipt_number         TEXT;
    v_account_seq            BIGINT := 0;
    v_consumers_created      INT := 0;
    v_meter_accounts_created INT := 0;
    v_billings_created       INT := 0;
    v_disconnections_created INT := 0;
    v_payments_created       INT := 0;
    v_skipped                JSONB := '[]'::JSONB;
    v_auth_consumers         JSONB := '[]'::JSONB;
    v_is_new_consumer        BOOLEAN;

    v_present           NUMERIC;
    v_previous           NUMERIC;
    v_consumption         NUMERIC;
    v_current_billing     NUMERIC;
    v_rate_per_unit        NUMERIC;
    v_total_billing        NUMERIC;
    v_remaining_balance    NUMERIC;
    v_amount_paid          NUMERIC;
    v_payment_date         DATE;
BEGIN
    -- Seed contract_no sequence from existing ##-####-##### values
    SELECT COALESCE(MAX(
        CASE
            WHEN c.contract_no ~ '^[0-9]{2}-[0-9]{4}-[0-9]{5}$'
            THEN replace(c.contract_no, '-', '')::BIGINT
            ELSE 0
        END
    ), 0)
    INTO v_account_seq
    FROM public.consumers c;
    -- ------------------------------------------------------------
    -- 0. Resolve batch-level context & default statuses
    -- ------------------------------------------------------------
    IF v_imported_by IS NULL THEN
        RAISE EXCEPTION 'imported_by is required — meter_accounts.created_by is NOT NULL and cannot be inferred.';
    END IF;

    -- Confirm the importing user actually exists, so a bad/forged UUID
    -- fails loudly here instead of tripping the created_by FK mid-batch.
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE user_id = v_imported_by) THEN
        RAISE EXCEPTION 'imported_by (%) does not match any user_id in public.users.', v_imported_by;
    END IF;

    -- Billing payment type — required when creating paid/partial payment rows
    SELECT payment_type_id INTO v_payment_type_id
    FROM public.payment_type
    WHERE lower(payment_type_name) = 'billing'
    LIMIT 1;

    IF v_payment_type_id IS NULL THEN
        RAISE EXCEPTION 'payment_type "billing" not found. Seed payment_type before importing.';
    END IF;

    v_payment_date := COALESCE((v_period->>'due_date')::DATE, CURRENT_DATE);

    SELECT barangay_id INTO v_barangay_id
    FROM public.barangay
    WHERE lower(barangay_name) = lower(v_barangay_name)
    LIMIT 1;

    IF v_barangay_id IS NULL THEN
        RAISE EXCEPTION 'Barangay "%" not found. Create it first, then re-import.', v_barangay_name;
    END IF;

    SELECT zone_id INTO v_zone_id
    FROM public.zone
    WHERE barangay_id = v_barangay_id
      AND lower(zone_name) = lower('Purok-' || v_purok)
    LIMIT 1;

    IF v_zone_id IS NULL THEN
        RAISE EXCEPTION 'Zone "Purok-%" under barangay "%" not found. Create it first, then re-import.',
            v_purok, v_barangay_name;
    END IF;

    INSERT INTO public.reading_periods (period_start, period_end, due_date)
    VALUES (
        (v_period->>'period_start')::DATE,
        (v_period->>'period_end')::DATE,
        (v_period->>'due_date')::DATE
    )
    ON CONFLICT (period_start, period_end) DO UPDATE
        SET due_date = EXCLUDED.due_date
    RETURNING reading_period_id INTO v_reading_period_id;

    -- ------------------------------------------------------------
    -- 1. Disable live triggers for historical calculations parity
    -- ------------------------------------------------------------
    ALTER TABLE public.meter_readings     DISABLE TRIGGER create_water_consumption_trigger;
    ALTER TABLE public.meter_readings     DISABLE TRIGGER create_water_consumption_update_trigger;
    ALTER TABLE public.water_consumptions DISABLE TRIGGER process_billing_trigger;

    -- ------------------------------------------------------------
    -- 2. Row-by-row import
    -- ------------------------------------------------------------
    FOR v_row IN SELECT * FROM jsonb_array_elements(v_rows)
    LOOP
        v_clean_name        := v_row->>'account_name';
        v_meter_status_name := lower(v_row->>'meter_status');

        -- --- Classification + connection fee lookup ---
        SELECT classification_id, connection_fee
        INTO v_classification_id, v_connection_fee
        FROM public.classifications
        WHERE lower(classification_name) = lower(v_row->>'classification')
        LIMIT 1;

        IF v_classification_id IS NULL THEN
            v_skipped := v_skipped || jsonb_build_object(
                'account_name', v_clean_name,
                'reason', 'Unknown classification: ' || (v_row->>'classification')
            );
            CONTINUE;
        END IF;

        -- --- Meter status lookup ---
        SELECT meter_status_id INTO v_meter_status_id
        FROM public.meter_status
        WHERE lower(meter_status_name) = v_meter_status_name
        LIMIT 1;

        IF v_meter_status_id IS NULL THEN
            v_skipped := v_skipped || jsonb_build_object(
                'account_name', v_clean_name,
                'reason', 'Unknown meter status: ' || (v_row->>'meter_status')
            );
            CONTINUE;
        END IF;

        -- --- Reading status resolution (mirrors meter status) ---
        v_reading_status_id := NULL;

        IF v_meter_status_name IN ('defective', 'stolen', 'disconnected') THEN
            SELECT reading_status_id INTO v_reading_status_id
            FROM public.meter_reading_status
            WHERE upper(status_code) = upper(v_meter_status_name)
            LIMIT 1;

            IF v_reading_status_id IS NULL THEN
                v_skipped := v_skipped || jsonb_build_object(
                    'account_name', v_clean_name,
                    'reason', 'No matching meter_reading_status entry for meter status: ' || (v_row->>'meter_status')
                );
                CONTINUE;
            END IF;
        END IF;

        -- --- Disconnection status + voluntary resolution ---
        -- Only relevant when this row is being imported as already
        -- Disconnected. Resolved BEFORE any inserts happen for this row,
        -- so a missing status skips the whole row cleanly (same pattern
        -- as the classification/meter-status lookups above) rather than
        -- leaving a half-imported consumer/meter_account behind.
        v_disconnection_status_id := NULL;
        v_is_voluntary := FALSE;

        IF v_meter_status_name = 'disconnected' THEN
            -- Defaults to involuntary/notice-based unless the row explicitly
            -- says otherwise.
            v_is_voluntary := COALESCE((v_row->>'is_voluntary')::BOOLEAN, FALSE);

            -- Prefer exact "Disconnected" status (app uses this name).
            SELECT disconnection_status_id INTO v_disconnection_status_id
            FROM public.disconnection_status
            WHERE lower(status_name) = 'disconnected'
            LIMIT 1;

            IF v_disconnection_status_id IS NULL THEN
                SELECT disconnection_status_id INTO v_disconnection_status_id
                FROM public.disconnection_status
                WHERE status_name NOT ILIKE '%pending%'
                  AND status_name NOT ILIKE '%cancel%'
                LIMIT 1;
            END IF;

            IF v_disconnection_status_id IS NULL THEN
                v_skipped := v_skipped || jsonb_build_object(
                    'account_name', v_clean_name,
                    'reason', 'No usable disconnection_status found (need Disconnected / non-pending status)'
                );
                CONTINUE;
            END IF;
        END IF;

        -- --- Consumer lookup/creation ---
        -- Credentials live in Supabase Auth (created by the app after this RPC).
        v_is_new_consumer := FALSE;
        v_email := lower(nullif(btrim(COALESCE(v_row->>'email', '')), ''));
        v_contact_number := nullif(btrim(COALESCE(v_row->>'contact_number', '')), '');

        SELECT c.consumer_id
        INTO v_consumer_id
        FROM public.consumers c
        WHERE c.account_name = v_clean_name
        LIMIT 1;

        IF v_consumer_id IS NULL THEN
            IF v_email IS NULL THEN
                v_skipped := v_skipped || jsonb_build_object(
                    'account_name', v_clean_name,
                    'reason', 'Email is required for imported consumers'
                );
                CONTINUE;
            END IF;

            IF EXISTS (
                SELECT 1 FROM public.consumers c WHERE lower(c.email) = v_email
            ) THEN
                v_skipped := v_skipped || jsonb_build_object(
                    'account_name', v_clean_name,
                    'reason', 'Email already used by another consumer: ' || v_email
                );
                CONTINUE;
            END IF;

            IF v_contact_number IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.consumers c WHERE c.contact_number = v_contact_number
            ) THEN
                v_skipped := v_skipped || jsonb_build_object(
                    'account_name', v_clean_name,
                    'reason', 'Contact number already used: ' || v_contact_number
                );
                CONTINUE;
            END IF;

            v_account_seq := v_account_seq + 1;
            v_contract_no :=
                substring(lpad(v_account_seq::text, 11, '0') from 1 for 2) || '-' ||
                substring(lpad(v_account_seq::text, 11, '0') from 3 for 4) || '-' ||
                substring(lpad(v_account_seq::text, 11, '0') from 7 for 5);

            INSERT INTO public.consumers (
                contract_no, account_name, email, contact_number,
                is_email_verified, is_default_password, registered_by
            ) VALUES (
                v_contract_no, v_clean_name, v_email, v_contact_number,
                FALSE, TRUE, v_imported_by
            )
            RETURNING consumer_id INTO v_consumer_id;

            v_consumers_created := v_consumers_created + 1;
            v_is_new_consumer := TRUE;
        ELSE
            -- Existing consumer: use DB identity for auth; fill blank contact if provided
            IF v_contact_number IS NOT NULL THEN
                UPDATE public.consumers
                SET contact_number = v_contact_number,
                    updated_at = now()
                WHERE consumer_id = v_consumer_id
                  AND contact_number IS NULL;
            END IF;

            SELECT c.email, c.contract_no, c.contact_number
            INTO v_email, v_contract_no, v_contact_number
            FROM public.consumers c
            WHERE c.consumer_id = v_consumer_id;
        END IF;

        -- Queue for Supabase Auth provisioning in the app layer
        v_auth_consumers := v_auth_consumers || jsonb_build_object(
            'consumer_id', v_consumer_id,
            'email', v_email,
            'account_name', v_clean_name,
            'contract_no', v_contract_no,
            'is_new', v_is_new_consumer
        );

        -- --- Meter account creation ---
        -- Imported accounts are pre-existing, already-connected service:
        -- payment_status/paid_at reflect that the connection fee is
        -- already settled, and total_connection_fee is carried over from
        -- the classification so the historical fee is still on record.
        INSERT INTO public.meter_accounts (
            consumer_id, zone_id, classification_id, created_by,
            payment_status, paid_at, total_connection_fee
        ) VALUES (
            v_consumer_id, v_zone_id, v_classification_id, v_imported_by,
            TRUE, NOW(), COALESCE(v_connection_fee, 0)
        )
        RETURNING meter_account_id INTO v_meter_account_id;

        v_meter_accounts_created := v_meter_accounts_created + 1;

        -- --- Meter creation ---
        v_meter_serial := nullif(btrim(v_row->>'meter_serial_no'), '');
        INSERT INTO public.meters (
            meter_account_id, meter_serial_no, meter_status_id, installation_date
        ) VALUES (
            v_meter_account_id,
            COALESCE(v_meter_serial, 'PENDING-TMP-' || replace(gen_random_uuid()::text, '-', '')),
            v_meter_status_id,
            NOW()
        )
        RETURNING meter_id INTO v_meter_id;

        IF v_meter_serial IS NULL THEN
            UPDATE public.meters
            SET meter_serial_no = 'PENDING-' || replace(meter_id::text, '-', '')
            WHERE meter_id = v_meter_id;
        END IF;

        -- --- Disconnection record (new) ---
        -- Written whenever the meter is being imported as Disconnected, so
        -- the account shows up correctly in the reconnection eligibility
        -- flow instead of being "Disconnected" on the meter with nothing
        -- behind it. requested_date/disconnected_at use the import time
        -- since the row payload doesn't carry an original disconnection
        -- date. notice_meter_account_id is left NULL — no real notice
        -- record exists for a bulk-imported historical row.
        IF v_meter_status_name = 'disconnected' THEN
            INSERT INTO public.disconnections (
                meter_account_id, is_voluntary, disconnection_status_id,
                requested_date, disconnected_at, processed_by,
                notice_meter_account_id
            ) VALUES (
                v_meter_account_id, v_is_voluntary, v_disconnection_status_id,
                NOW()::DATE, NOW(), v_imported_by,
                NULL
            )
            RETURNING disconnection_id INTO v_disconnection_id;

            v_disconnections_created := v_disconnections_created + 1;
        END IF;

        -- --- Reading values ---
        IF v_meter_status_name = 'disconnected' THEN
            v_present := 0;
            v_previous := 0;
            v_consumption := 0;
        ELSE
            v_present := COALESCE((v_row->>'present_reading')::NUMERIC, 0);
            v_previous := COALESCE((v_row->>'previous_reading')::NUMERIC, 0);
            v_consumption := COALESCE((v_row->>'consumption')::NUMERIC, 0);
        END IF;

        INSERT INTO public.meter_readings (
            reading_period_id, meter_account_id, meter_id,
            meter_reader_id, reading_status_id, present_reading
        ) VALUES (
            v_reading_period_id, v_meter_account_id, v_meter_id,
            NULL, v_reading_status_id, v_present
        )
        RETURNING reading_id INTO v_reading_id;

        -- --- Water consumption record ---
        INSERT INTO public.water_consumptions (
            reading_id, meter_account_id, previous_reading, present_reading,
            consumption, billed_consumption, billing_basis_id
        ) VALUES (
            v_reading_id, v_meter_account_id, v_previous, v_present,
            v_consumption, v_consumption, NULL
        )
        RETURNING consumption_id INTO v_consumption_id;

        v_current_billing := COALESCE((v_row->>'current_billing')::NUMERIC, 0);

        -- --- Community breakdown ---
        IF v_consumption > 0 THEN
            SELECT community_charge_id INTO v_first_tier_id
            FROM public.community_charges
            WHERE classification_id = v_classification_id
            ORDER BY min_consumption ASC
            LIMIT 1;

            IF v_first_tier_id IS NOT NULL THEN
                v_rate_per_unit := ROUND((v_current_billing / v_consumption)::NUMERIC, 2);

                INSERT INTO public.billing_community_breakdowns (
                    consumption_id, community_charge_id, block_order,
                    units_used, rate_per_unit, subtotal
                ) VALUES (
                    v_consumption_id, v_first_tier_id, 1,
                    v_consumption, v_rate_per_unit, v_current_billing
                );
            END IF;
        END IF;

        -- --- Billing status resolution ---
        v_total_billing     := COALESCE((v_row->>'total_bill')::NUMERIC, 0);
        v_remaining_balance := COALESCE((v_row->>'balance')::NUMERIC, 0);

        SELECT billing_status_id INTO v_billing_status_id
        FROM public.billing_status
        WHERE billing_status_name = CASE
            WHEN v_remaining_balance <= 0 THEN 'paid'
            WHEN v_total_billing > v_remaining_balance THEN 'partial'
            ELSE 'unpaid'
        END
        LIMIT 1;

        IF v_billing_status_id IS NULL THEN
            RAISE EXCEPTION 'billing_status lookup failed for account %', v_clean_name;
        END IF;

        -- --- Billing creation ---
        INSERT INTO public.billing (
            reading_period_id, meter_account_id, consumer_id, consumption_id,
            current_billing, penalty_amount, previous_balance,
            total_billing, remaining_balance, billing_status_id
        ) VALUES (
            v_reading_period_id, v_meter_account_id, v_consumer_id, v_consumption_id,
            v_current_billing,
            COALESCE((v_row->>'penalty')::NUMERIC, 0),
            COALESCE((v_row->>'overdue_accounts')::NUMERIC, 0),
            v_total_billing,
            v_remaining_balance,
            v_billing_status_id
        )
        RETURNING billing_id INTO v_billing_id;

        v_billings_created := v_billings_created + 1;

        -- --- Billing payment transaction (paid / partial only) ---
        -- amount already collected = total − remaining (0 for unpaid)
        v_amount_paid := ROUND(
            GREATEST(0, v_total_billing - GREATEST(v_remaining_balance, 0))::NUMERIC,
            2
        );

        IF v_amount_paid > 0 THEN
            v_receipt_number :=
                'IMP-' || to_char(v_payment_date, 'YYYY') || '-' ||
                upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

            -- Extremely unlikely collision; regenerate once if needed
            IF EXISTS (
                SELECT 1 FROM public.payments p WHERE p.receipt_number = v_receipt_number
            ) THEN
                v_receipt_number :=
                    'IMP-' || to_char(v_payment_date, 'YYYY') || '-' ||
                    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
            END IF;

            INSERT INTO public.payments (
                receipt_number, payment_type_id, payment_date, recieved_by
            ) VALUES (
                v_receipt_number, v_payment_type_id, v_payment_date, v_imported_by
            )
            RETURNING payment_id INTO v_payment_id;

            INSERT INTO public.billing_payments (
                billing_id, payment_id, amount_paid
            ) VALUES (
                v_billing_id, v_payment_id, v_amount_paid
            );

            v_payments_created := v_payments_created + 1;
        END IF;
    END LOOP;

    -- ------------------------------------------------------------
    -- 3. Re-enable triggers on successful batch completion
    -- ------------------------------------------------------------
    ALTER TABLE public.meter_readings     ENABLE TRIGGER create_water_consumption_trigger;
    ALTER TABLE public.meter_readings     ENABLE TRIGGER create_water_consumption_update_trigger;
    ALTER TABLE public.water_consumptions ENABLE TRIGGER process_billing_trigger;

    RETURN jsonb_build_object(
        'reading_period_id', v_reading_period_id,
        'consumers_created', v_consumers_created,
        'meter_accounts_created', v_meter_accounts_created,
        'billings_created', v_billings_created,
        'disconnections_created', v_disconnections_created,
        'payments_created', v_payments_created,
        'skipped', v_skipped,
        'auth_consumers', v_auth_consumers
    );
END;
$$;