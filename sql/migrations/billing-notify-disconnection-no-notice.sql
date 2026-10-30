-- When billing is created (or already exists and is eligible), notify the
-- consumer directly. Do NOT create notice_of_disconnection rows for the
-- automatic path — formal notices remain optional via manual create only.

-- ── 1. Template (works with or without a formal notice number) ───────────────
INSERT INTO public.notification_templates (event_code, title_template, body_template)
VALUES (
  'NOTICE_OF_DISCONNECTION',
  'Notice of Disconnection',
  'Your account ({meter_serial_no}) has an outstanding balance of {balance} with {months_unpaid} unpaid month(s). Please settle soon to avoid disconnection.'
)
ON CONFLICT (event_code) DO UPDATE
SET
  title_template = EXCLUDED.title_template,
  body_template  = EXCLUDED.body_template;

-- ── 2. Shared helper: notify one consumer (idempotent per billing_id) ────────
CREATE OR REPLACE FUNCTION public.fn_notify_consumer_disconnection_warning(
  p_meter_account_id UUID,
  p_billing_id       UUID,
  p_balance          NUMERIC,
  p_months_unpaid    INT,
  p_notice_no        TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_consumer_id UUID;
  v_serial      TEXT;
BEGIN
  IF p_meter_account_id IS NULL OR p_billing_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT ma.consumer_id INTO v_consumer_id
  FROM public.meter_accounts ma
  WHERE ma.meter_account_id = p_meter_account_id;

  IF v_consumer_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- One warning notification per billing (covers billing create + auto + formal)
  IF EXISTS (
    SELECT 1
    FROM public.user_notifications un
    WHERE un.event_code = 'NOTICE_OF_DISCONNECTION'
      AND un.reference_id = p_billing_id
  ) THEN
    RETURN FALSE;
  END IF;

  v_serial := public.fn_latest_meter_serial(p_meter_account_id);

  INSERT INTO public.user_notifications (
    user_id,
    consumer_id,
    meter_account_id,
    event_code,
    metadata,
    reference_id,
    created_at
  ) VALUES (
    NULL,
    v_consumer_id,
    p_meter_account_id,
    'NOTICE_OF_DISCONNECTION',
    jsonb_build_object(
      'meter_serial_no', COALESCE(v_serial, ''),
      'notice_no',       COALESCE(p_notice_no, ''),
      'balance',         COALESCE(p_balance, 0),
      'months_unpaid',   COALESCE(p_months_unpaid, 0)
    ),
    p_billing_id,
    now()
  );

  RETURN TRUE;
END;
$$;

-- ── 3. Formal notice row: still notifies, keyed by billing_id ────────────────
CREATE OR REPLACE FUNCTION public.trg_notify_notice_of_disconnection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notice_no TEXT;
BEGIN
  SELECT n.notice_no INTO v_notice_no
  FROM public.notice_of_disconnection n
  WHERE n.notice_id = NEW.notice_id;

  PERFORM public.fn_notify_consumer_disconnection_warning(
    NEW.meter_account_id,
    NEW.billing_id,
    COALESCE(NEW.balance_snapshot, 0),
    COALESCE(NEW.months_unpaid, 0),
    v_notice_no
  );

  RETURN NEW;
END;
$$;

-- ── 4. Count arrears months (supports carry-over closing prior as paid) ───────
-- Latest open bill = 1 month. Then keep walking older bills while either:
--   - still unpaid/partial, or
--   - paid/forwarded because balance was carried into the newer bill
--     (newer.previous_balance > 0).
CREATE OR REPLACE FUNCTION public.fn_count_arrears_months(p_meter_account_id UUID)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_months INT := 0;
  v_expect_carry BOOLEAN := FALSE;
  v_bill RECORD;
BEGIN
  IF p_meter_account_id IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_bill IN
    SELECT
      COALESCE(b.previous_balance, 0) AS previous_balance,
      COALESCE(b.remaining_balance, 0) AS remaining_balance,
      lower(bs.billing_status_name) AS status_name
    FROM public.billing b
    JOIN public.billing_status bs ON bs.billing_status_id = b.billing_status_id
    WHERE b.meter_account_id = p_meter_account_id
    ORDER BY b.created_at DESC
  LOOP
    IF v_months = 0 THEN
      IF v_bill.status_name IN ('unpaid', 'partial') AND v_bill.remaining_balance > 0 THEN
        v_months := 1;
        v_expect_carry := v_bill.previous_balance > 0;
      ELSE
        RETURN 0;
      END IF;
    ELSE
      IF v_bill.status_name IN ('unpaid', 'partial') THEN
        v_months := v_months + 1;
        v_expect_carry := v_bill.previous_balance > 0;
      ELSIF v_expect_carry AND v_bill.status_name IN ('paid', 'forwarded') THEN
        v_months := v_months + 1;
        v_expect_carry := v_bill.previous_balance > 0;
      ELSE
        EXIT;
      END IF;
    END IF;
  END LOOP;

  RETURN v_months;
END;
$$;

-- ── 5. On new billing: if eligible under disconnection rules, notify only ────
CREATE OR REPLACE FUNCTION public.trg_billing_notify_disconnection_warning()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule RECORD;
  v_eligible_status_ids UUID[];
  v_unpaid_months INT := 0;
  v_meter_ok BOOLEAN := FALSE;
  v_status_name TEXT;
BEGIN
  IF COALESCE(NEW.remaining_balance, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT lower(bs.billing_status_name)
  INTO v_status_name
  FROM public.billing_status bs
  WHERE bs.billing_status_id = NEW.billing_status_id;

  IF v_status_name IS NULL OR v_status_name NOT IN ('unpaid', 'partial') THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO v_rule
  FROM public.disconnection_rules
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_rule.rule_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT array_agg(ms.meter_status_id)
  INTO v_eligible_status_ids
  FROM public.meter_status ms
  WHERE ms.meter_status_name IN (
    'Active',
    'Defective',
    'Stolen',
    'Waterleak_After_Meter'
  );

  SELECT EXISTS (
    SELECT 1
    FROM public.meters m
    WHERE m.meter_account_id = NEW.meter_account_id
      AND m.meter_status_id = ANY (v_eligible_status_ids)
  ) INTO v_meter_ok;

  IF NOT v_meter_ok THEN
    RETURN NEW;
  END IF;

  v_unpaid_months := public.fn_count_arrears_months(NEW.meter_account_id);

  -- Both thresholds (AND): balance + arrears months
  IF COALESCE(NEW.remaining_balance, 0) < COALESCE(v_rule.min_balance, 0)
     OR v_unpaid_months < COALESCE(v_rule.min_unpaid_months, 0) THEN
    RETURN NEW;
  END IF;

  PERFORM public.fn_notify_consumer_disconnection_warning(
    NEW.meter_account_id,
    NEW.billing_id,
    COALESCE(NEW.remaining_balance, 0),
    v_unpaid_months,
    NULL
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_billing_notify_disconnection_warning ON public.billing;
CREATE TRIGGER trg_billing_notify_disconnection_warning
  AFTER INSERT ON public.billing
  FOR EACH ROW
  EXECUTE PROCEDURE public.trg_billing_notify_disconnection_warning();

-- ── 6. Auto path: notify eligible consumers — never create a notice ──────────
CREATE OR REPLACE FUNCTION public.auto_generate_disconnection_notices(
  p_generated_by UUID DEFAULT NULL,
  p_reading_period_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule RECORD;
  v_period_id UUID;
  v_eligible_status_ids UUID[];
  v_notified INT := 0;
  v_skipped INT := 0;
  r RECORD;
  v_unpaid_months INT;
  v_latest_billing_id UUID;
  v_latest_balance NUMERIC(10,2);
  v_status_name TEXT;
BEGIN
  SELECT *
  INTO v_rule
  FROM public.disconnection_rules
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_rule.rule_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'message', 'No disconnection rule configured'
    );
  END IF;

  IF p_reading_period_id IS NOT NULL THEN
    v_period_id := p_reading_period_id;
  ELSE
    SELECT b.reading_period_id
    INTO v_period_id
    FROM public.billing b
    WHERE b.reading_period_id IS NOT NULL
    ORDER BY b.created_at DESC
    LIMIT 1;

    IF v_period_id IS NULL THEN
      SELECT rp.reading_period_id
      INTO v_period_id
      FROM public.reading_periods rp
      ORDER BY rp.period_start DESC
      LIMIT 1;
    END IF;
  END IF;

  IF v_period_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'message', 'No reading period found'
    );
  END IF;

  SELECT array_agg(ms.meter_status_id)
  INTO v_eligible_status_ids
  FROM public.meter_status ms
  WHERE ms.meter_status_name IN (
    'Active',
    'Defective',
    'Stolen',
    'Waterleak_After_Meter'
  );

  IF v_eligible_status_ids IS NULL OR array_length(v_eligible_status_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'message', 'No eligible meter statuses found'
    );
  END IF;

  FOR r IN
    SELECT DISTINCT m.meter_account_id
    FROM public.meters m
    WHERE m.meter_status_id = ANY (v_eligible_status_ids)
      AND m.meter_account_id IS NOT NULL
  LOOP
    SELECT
      b.billing_id,
      COALESCE(b.remaining_balance, 0),
      lower(bs.billing_status_name)
    INTO v_latest_billing_id, v_latest_balance, v_status_name
    FROM public.billing b
    JOIN public.billing_status bs ON bs.billing_status_id = b.billing_status_id
    WHERE b.meter_account_id = r.meter_account_id
    ORDER BY b.created_at DESC
    LIMIT 1;

    IF v_latest_billing_id IS NULL THEN
      CONTINUE;
    END IF;

    IF v_status_name IS NULL
       OR v_status_name NOT IN ('unpaid', 'partial')
       OR v_latest_balance <= 0 THEN
      CONTINUE;
    END IF;

    v_unpaid_months := public.fn_count_arrears_months(r.meter_account_id);

    IF v_latest_balance < COALESCE(v_rule.min_balance, 0)
       OR v_unpaid_months < COALESCE(v_rule.min_unpaid_months, 0) THEN
      CONTINUE;
    END IF;

    IF public.fn_notify_consumer_disconnection_warning(
      r.meter_account_id,
      v_latest_billing_id,
      v_latest_balance,
      v_unpaid_months,
      NULL
    ) THEN
      v_notified := v_notified + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'success',
    'message', CASE
      WHEN v_notified = 0 AND v_skipped = 0 THEN 'No eligible accounts to notify'
      WHEN v_notified = 0 THEN 'Eligible consumers already notified'
      ELSE format('Notified %s consumer(s)', v_notified)
    END,
    'added', v_notified,
    'notified', v_notified,
    'skipped', v_skipped,
    'notice_id', NULL,
    'notice_no', NULL,
    'reading_period_id', v_period_id,
    'created_notice', FALSE
  );
END;
$$;

-- ── 7. Batch notify selected accounts (billing modal — no notice created) ────
CREATE OR REPLACE FUNCTION public.notify_disconnection_warnings_batch(p_items JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_notified INT := 0;
  v_skipped INT := 0;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'message', 'No accounts selected'
    );
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF public.fn_notify_consumer_disconnection_warning(
      (v_item->>'meter_account_id')::UUID,
      (v_item->>'billing_id')::UUID,
      COALESCE((v_item->>'balance_snapshot')::NUMERIC, 0),
      COALESCE((v_item->>'months_unpaid')::INT, 0),
      NULL
    ) THEN
      v_notified := v_notified + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'success',
    'message', CASE
      WHEN v_notified = 0 THEN 'Selected consumers were already notified'
      ELSE format('Notified %s consumer(s)', v_notified)
    END,
    'notified', v_notified,
    'skipped', v_skipped
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_count_arrears_months(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_notify_consumer_disconnection_warning(UUID, UUID, NUMERIC, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_disconnection_warnings_batch(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_generate_disconnection_notices(UUID, UUID) TO authenticated;
