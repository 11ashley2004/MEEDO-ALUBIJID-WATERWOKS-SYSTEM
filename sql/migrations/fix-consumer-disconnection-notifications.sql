-- Fix: consumers never see NOTICE_OF_DISCONNECTION in the notification bell.
-- Root cause: older user_notifications schema required user_id NOT NULL and
-- had no consumer_id column, so consumer-targeted inserts failed / were
-- invisible to consumer sessions (auth.uid() = consumers.consumer_id).

-- ── 1. Schema: allow consumer recipients ─────────────────────────────────────
DO $$
BEGIN
  -- Make user_id nullable (staff OR consumer recipient)
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_notifications'
      AND column_name = 'user_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.user_notifications
      ALTER COLUMN user_id DROP NOT NULL;
  END IF;

  -- Add consumer_id if missing
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_notifications'
      AND column_name = 'consumer_id'
  ) THEN
    ALTER TABLE public.user_notifications
      ADD COLUMN consumer_id UUID NULL;
  END IF;
END $$;

-- FK to consumers (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_un_consumer'
      AND conrelid = 'public.user_notifications'::regclass
  ) THEN
    ALTER TABLE public.user_notifications
      ADD CONSTRAINT fk_un_consumer
      FOREIGN KEY (consumer_id)
      REFERENCES public.consumers(consumer_id)
      ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_notifications_consumer_id
  ON public.user_notifications (consumer_id);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_id
  ON public.user_notifications (user_id);

CREATE INDEX IF NOT EXISTS idx_user_notifications_event_ref
  ON public.user_notifications (event_code, reference_id);

-- ── 2. Template ──────────────────────────────────────────────────────────────
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

INSERT INTO public.notification_templates (event_code, title_template, body_template)
VALUES (
  'SERVICE_DISCONNECTED',
  'Service Disconnected',
  'Water service for meter {meter_serial_no} has been disconnected. Please settle your account and request reconnection.'
)
ON CONFLICT (event_code) DO UPDATE
SET
  title_template = EXCLUDED.title_template,
  body_template  = EXCLUDED.body_template;

-- ── 3. Grants so consumers can read/update their rows via PostgREST ──────────
GRANT SELECT, INSERT, UPDATE ON public.user_notifications TO authenticated;
GRANT ALL ON public.user_notifications TO service_role;

-- ── 4. RLS: consumer + staff can see/update their own notifications ──────────
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_notifications_select_own ON public.user_notifications;
CREATE POLICY user_notifications_select_own
  ON public.user_notifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = consumer_id);

DROP POLICY IF EXISTS user_notifications_update_own ON public.user_notifications;
CREATE POLICY user_notifications_update_own
  ON public.user_notifications
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = consumer_id)
  WITH CHECK (auth.uid() = user_id OR auth.uid() = consumer_id);

DROP POLICY IF EXISTS user_notifications_insert_authenticated ON public.user_notifications;
CREATE POLICY user_notifications_insert_authenticated
  ON public.user_notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ── 5. Helper: latest meter serial (safe if already exists) ──────────────────
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

-- ── 6. Arrears months (carry-over aware) ─────────────────────────────────────
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

-- ── 7. Notify helper — write to consumer_id (what the bell queries) ──────────
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

  -- Prefer meter account owner; fall back to billing.consumer_id
  SELECT ma.consumer_id INTO v_consumer_id
  FROM public.meter_accounts ma
  WHERE ma.meter_account_id = p_meter_account_id;

  IF v_consumer_id IS NULL THEN
    SELECT b.consumer_id INTO v_consumer_id
    FROM public.billing b
    WHERE b.billing_id = p_billing_id;
  END IF;

  IF v_consumer_id IS NULL THEN
    RAISE WARNING 'fn_notify_consumer_disconnection_warning: no consumer for meter_account % / billing %',
      p_meter_account_id, p_billing_id;
    RETURN FALSE;
  END IF;

  -- Must exist in consumers (auth.uid for that login = this id)
  IF NOT EXISTS (
    SELECT 1 FROM public.consumers c WHERE c.consumer_id = v_consumer_id
  ) THEN
    RAISE WARNING 'fn_notify_consumer_disconnection_warning: consumer % missing from consumers',
      v_consumer_id;
    RETURN FALSE;
  END IF;

  -- Idempotent: one NOTICE_OF_DISCONNECTION per billing
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
      'balance',         to_jsonb(COALESCE(p_balance, 0)),
      'months_unpaid',   COALESCE(p_months_unpaid, 0)
    ),
    p_billing_id,
    now()
  );

  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'fn_notify_consumer_disconnection_warning failed: %', SQLERRM;
    RETURN FALSE;
END;
$$;

-- ── 8. Billing trigger: notify when new bill meets disconnection rules ───────
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

-- Formal notice path still notifies via billing_id key
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

DROP TRIGGER IF EXISTS trg_notice_meter_accounts_notify ON public.notice_meter_accounts;
CREATE TRIGGER trg_notice_meter_accounts_notify
  AFTER INSERT ON public.notice_meter_accounts
  FOR EACH ROW
  EXECUTE PROCEDURE public.trg_notify_notice_of_disconnection();

-- ── 9. Repair orphan / mis-targeted NOTICE rows (best effort) ────────────────
-- If a row was inserted with user_id pointing at a consumers.consumer_id
-- (invalid for staff FK setups, or invisible to consumer filter), move it.
UPDATE public.user_notifications un
SET
  consumer_id = un.user_id,
  user_id = NULL
WHERE un.event_code IN ('NOTICE_OF_DISCONNECTION', 'SERVICE_DISCONNECTED')
  AND un.consumer_id IS NULL
  AND un.user_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.consumers c WHERE c.consumer_id = un.user_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.user_id = un.user_id
  );

-- Exactly one recipient target (after repair so existing bad rows get fixed first)
ALTER TABLE public.user_notifications
  DROP CONSTRAINT IF EXISTS chk_un_recipient;

DO $$
BEGIN
  ALTER TABLE public.user_notifications
    ADD CONSTRAINT chk_un_recipient
    CHECK (
      (user_id IS NOT NULL AND consumer_id IS NULL)
      OR (user_id IS NULL AND consumer_id IS NOT NULL)
    );
EXCEPTION
  WHEN check_violation THEN
    RAISE WARNING 'chk_un_recipient skipped — clean rows where both/neither recipient ids are set';
  WHEN duplicate_object THEN
    NULL;
END $$;

-- ── 10. Backfill: notify all currently eligible meter accounts ───────────────
DO $$
DECLARE
  v_result JSONB;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'auto_generate_disconnection_notices'
  ) THEN
    v_result := public.auto_generate_disconnection_notices(NULL, NULL);
    RAISE NOTICE 'Backfill auto_generate_disconnection_notices => %', v_result;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.fn_latest_meter_serial(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_count_arrears_months(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_notify_consumer_disconnection_warning(UUID, UUID, NUMERIC, INT, TEXT) TO authenticated;
