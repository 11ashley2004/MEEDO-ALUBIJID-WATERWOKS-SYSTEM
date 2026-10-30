-- Auto notice of disconnection + consumer notifications
-- 1) Templates for notice + disconnection events
-- 2) Notify consumer when added to a notice (trigger)
-- 3) Notify consumer when service is disconnected (trigger)
-- 4) RPC / billing trigger: notify eligible consumers (no auto notice create)
-- See also: billing-notify-disconnection-no-notice.sql

-- ── 1. Notification templates ────────────────────────────────────────────────
INSERT INTO public.notification_templates (event_code, title_template, body_template)
VALUES
  (
    'NOTICE_OF_DISCONNECTION',
    'Notice of Disconnection',
    'Your account ({meter_serial_no}) has an outstanding balance of {balance} with {months_unpaid} unpaid month(s). Please settle soon to avoid disconnection.'
  ),
  (
    'SERVICE_DISCONNECTED',
    'Service Disconnected',
    'Water service for meter {meter_serial_no} has been disconnected. Please settle your account and request reconnection.'
  )
ON CONFLICT (event_code) DO UPDATE
SET
  title_template = EXCLUDED.title_template,
  body_template  = EXCLUDED.body_template;

-- ── 2. Helper: latest meter serial for an account ────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_latest_meter_serial(p_meter_account_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT m.meter_serial_no
  FROM public.meters m
  WHERE m.meter_account_id = p_meter_account_id
  ORDER BY m.created_at DESC NULLS LAST
  LIMIT 1;
$$;

-- ── 3. Notify consumer when included in a notice of disconnection ────────────
CREATE OR REPLACE FUNCTION public.trg_notify_notice_of_disconnection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_consumer_id UUID;
  v_notice_no   TEXT;
  v_serial      TEXT;
BEGIN
  SELECT ma.consumer_id INTO v_consumer_id
  FROM public.meter_accounts ma
  WHERE ma.meter_account_id = NEW.meter_account_id;

  IF v_consumer_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Idempotent: one notification per notice_meter_account row
  IF EXISTS (
    SELECT 1
    FROM public.user_notifications un
    WHERE un.event_code = 'NOTICE_OF_DISCONNECTION'
      AND un.reference_id = NEW.notice_meter_account_id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT n.notice_no INTO v_notice_no
  FROM public.notice_of_disconnection n
  WHERE n.notice_id = NEW.notice_id;

  v_serial := public.fn_latest_meter_serial(NEW.meter_account_id);

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
    NEW.meter_account_id,
    'NOTICE_OF_DISCONNECTION',
    jsonb_build_object(
      'meter_serial_no', COALESCE(v_serial, ''),
      'notice_no',       COALESCE(v_notice_no, ''),
      'balance',         COALESCE(NEW.balance_snapshot, 0),
      'months_unpaid',   COALESCE(NEW.months_unpaid, 0)
    ),
    NEW.notice_meter_account_id,
    now()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notice_meter_accounts_notify ON public.notice_meter_accounts;
CREATE TRIGGER trg_notice_meter_accounts_notify
  AFTER INSERT ON public.notice_meter_accounts
  FOR EACH ROW
  EXECUTE PROCEDURE public.trg_notify_notice_of_disconnection();

-- ── 4. Notify consumer when disconnection is completed ───────────────────────
CREATE OR REPLACE FUNCTION public.trg_notify_service_disconnected()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status TEXT;
  v_new_status TEXT;
  v_consumer_id UUID;
  v_serial TEXT;
BEGIN
  IF NEW.disconnection_status_id IS NOT DISTINCT FROM OLD.disconnection_status_id THEN
    RETURN NEW;
  END IF;

  SELECT ds.status_name INTO v_old_status
  FROM public.disconnection_status ds
  WHERE ds.disconnection_status_id = OLD.disconnection_status_id;

  SELECT ds.status_name INTO v_new_status
  FROM public.disconnection_status ds
  WHERE ds.disconnection_status_id = NEW.disconnection_status_id;

  IF lower(COALESCE(v_new_status, '')) <> 'disconnected' THEN
    RETURN NEW;
  END IF;

  IF lower(COALESCE(v_old_status, '')) = 'disconnected' THEN
    RETURN NEW;
  END IF;

  SELECT ma.consumer_id INTO v_consumer_id
  FROM public.meter_accounts ma
  WHERE ma.meter_account_id = NEW.meter_account_id;

  IF v_consumer_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_notifications un
    WHERE un.event_code = 'SERVICE_DISCONNECTED'
      AND un.reference_id = NEW.disconnection_id
  ) THEN
    RETURN NEW;
  END IF;

  v_serial := public.fn_latest_meter_serial(NEW.meter_account_id);

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
    NEW.meter_account_id,
    'SERVICE_DISCONNECTED',
    jsonb_build_object(
      'meter_serial_no', COALESCE(v_serial, ''),
      'disconnected_at', COALESCE(NEW.disconnected_at, now())
    ),
    NEW.disconnection_id,
    now()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_disconnections_notify ON public.disconnections;
CREATE TRIGGER trg_disconnections_notify
  AFTER UPDATE OF disconnection_status_id ON public.disconnections
  FOR EACH ROW
  EXECUTE PROCEDURE public.trg_notify_service_disconnected();

-- ── 5. Auto-generate notice nos if missing (BEFORE INSERT) ───────────────────
CREATE OR REPLACE FUNCTION public.trg_set_notice_of_disconnection_no()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ym TEXT;
  v_seq INT;
BEGIN
  IF NEW.notice_no IS NOT NULL AND btrim(NEW.notice_no) <> '' THEN
    RETURN NEW;
  END IF;

  v_ym := to_char(COALESCE(NEW.generated_at, now()), 'YYYYMM');

  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(n.notice_no, '^NOD-' || v_ym || '-', ''), '')::INT
  ), 0) + 1
  INTO v_seq
  FROM public.notice_of_disconnection n
  WHERE n.notice_no ~ ('^NOD-' || v_ym || '-[0-9]+$');

  NEW.notice_no := 'NOD-' || v_ym || '-' || lpad(v_seq::text, 3, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notice_of_disconnection_set_no ON public.notice_of_disconnection;
CREATE TRIGGER trg_notice_of_disconnection_set_no
  BEFORE INSERT ON public.notice_of_disconnection
  FOR EACH ROW
  EXECUTE PROCEDURE public.trg_set_notice_of_disconnection_no();

-- ── 6. RPC: auto-generate notices for eligible overdue accounts ──────────────
-- Matches app rules: Active/Defective/Stolen/Waterleak_After_Meter meters,
-- consecutive unpaid months from latest billing, balance + unpaid months
-- both meet disconnection_rules thresholds (AND).
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
  v_notice_id UUID;
  v_notice_no TEXT;
  v_unpaid_status_id UUID;
  v_eligible_status_ids UUID[];
  v_added INT := 0;
  v_skipped INT := 0;
  v_created_notice BOOLEAN := FALSE;
  r RECORD;
  v_unpaid_months INT;
  v_latest_billing_id UUID;
  v_latest_balance NUMERIC(10,2);
  v_bill RECORD;
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
    -- Prefer the reading period of the latest billing row; fallback newest period
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

  SELECT bs.billing_status_id
  INTO v_unpaid_status_id
  FROM public.billing_status bs
  WHERE lower(bs.billing_status_name) = 'unpaid'
  LIMIT 1;

  IF v_unpaid_status_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'message', 'Billing status "unpaid" not found'
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

  -- Existing notice for this period + rule, or create one
  SELECT n.notice_id, n.notice_no
  INTO v_notice_id, v_notice_no
  FROM public.notice_of_disconnection n
  WHERE n.reading_period_id = v_period_id
    AND n.rule_id = v_rule.rule_id
  LIMIT 1;

  IF v_notice_id IS NULL THEN
    INSERT INTO public.notice_of_disconnection (
      reading_period_id,
      rule_id,
      generated_by,
      total_accounts
    ) VALUES (
      v_period_id,
      v_rule.rule_id,
      p_generated_by,
      0
    )
    RETURNING notice_id, notice_no INTO v_notice_id, v_notice_no;

    v_created_notice := TRUE;
  END IF;

  FOR r IN
    SELECT DISTINCT m.meter_account_id
    FROM public.meters m
    WHERE m.meter_status_id = ANY (v_eligible_status_ids)
      AND m.meter_account_id IS NOT NULL
  LOOP
    -- Skip if already on this notice
    IF EXISTS (
      SELECT 1
      FROM public.notice_meter_accounts nma
      WHERE nma.notice_id = v_notice_id
        AND nma.meter_account_id = r.meter_account_id
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Latest billing + consecutive unpaid months
    v_unpaid_months := 0;
    v_latest_billing_id := NULL;
    v_latest_balance := 0;

    FOR v_bill IN
      SELECT b.billing_id, b.remaining_balance, b.billing_status_id, b.created_at
      FROM public.billing b
      WHERE b.meter_account_id = r.meter_account_id
      ORDER BY b.created_at DESC
    LOOP
      IF v_latest_billing_id IS NULL THEN
        v_latest_billing_id := v_bill.billing_id;
        v_latest_balance := COALESCE(v_bill.remaining_balance, 0);
      END IF;

      IF v_bill.billing_status_id = v_unpaid_status_id THEN
        v_unpaid_months := v_unpaid_months + 1;
      ELSE
        EXIT;
      END IF;
    END LOOP;

    IF v_latest_billing_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Both rule thresholds must be met (matches settings UI)
    IF v_latest_balance < COALESCE(v_rule.min_balance, 0)
       OR v_unpaid_months < COALESCE(v_rule.min_unpaid_months, 0) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.notice_meter_accounts (
      notice_id,
      meter_account_id,
      billing_id,
      balance_snapshot,
      months_unpaid
    ) VALUES (
      v_notice_id,
      r.meter_account_id,
      v_latest_billing_id,
      v_latest_balance,
      v_unpaid_months
    );

    v_added := v_added + 1;
  END LOOP;

  UPDATE public.notice_of_disconnection n
  SET total_accounts = (
    SELECT COUNT(*)::INT
    FROM public.notice_meter_accounts nma
    WHERE nma.notice_id = n.notice_id
  )
  WHERE n.notice_id = v_notice_id;

  -- If we created an empty notice (no eligible accounts), remove it
  IF v_created_notice AND v_added = 0 THEN
    DELETE FROM public.notice_of_disconnection WHERE notice_id = v_notice_id;
    RETURN jsonb_build_object(
      'status', 'success',
      'message', 'No eligible overdue accounts to notice',
      'added', 0,
      'skipped', v_skipped,
      'notice_id', NULL,
      'notice_no', NULL,
      'reading_period_id', v_period_id
    );
  END IF;

  RETURN jsonb_build_object(
    'status', 'success',
    'message', CASE
      WHEN v_added = 0 THEN 'No new eligible accounts to add'
      ELSE format('Added %s account(s) to notice %s', v_added, v_notice_no)
    END,
    'added', v_added,
    'skipped', v_skipped,
    'notice_id', v_notice_id,
    'notice_no', v_notice_no,
    'reading_period_id', v_period_id,
    'created_notice', v_created_notice
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_generate_disconnection_notices(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_latest_meter_serial(UUID) TO authenticated;

-- Optional: schedule daily via pg_cron when available
-- SELECT cron.schedule(
--   'auto-disconnection-notices',
--   '0 8 * * *',
--   $$SELECT public.auto_generate_disconnection_notices(NULL, NULL)$$
-- );
