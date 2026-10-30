-- NOTICE_OF_DISCONNECTION must target consumers.consumer_id
-- (same UUID as Supabase Auth auth.users.id for that login).
-- App reads: auth.getUser().id → consumers.consumer_id → user_notifications.consumer_id

-- Ensure recipient columns exist / are nullable for consumer rows
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_notifications'
      AND column_name = 'user_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.user_notifications
      ALTER COLUMN user_id DROP NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_notifications'
      AND column_name = 'consumer_id'
  ) THEN
    ALTER TABLE public.user_notifications
      ADD COLUMN consumer_id UUID NULL
      REFERENCES public.consumers(consumer_id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_notifications_consumer_id
  ON public.user_notifications (consumer_id);

CREATE INDEX IF NOT EXISTS idx_user_notifications_consumer_event
  ON public.user_notifications (consumer_id, event_code, created_at DESC);

-- RLS: consumer session (auth.uid) matches consumers.consumer_id column
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_notifications_select_own ON public.user_notifications;
CREATE POLICY user_notifications_select_own
  ON public.user_notifications
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR auth.uid() = consumer_id
  );

DROP POLICY IF EXISTS user_notifications_update_own ON public.user_notifications;
CREATE POLICY user_notifications_update_own
  ON public.user_notifications
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR auth.uid() = consumer_id
  )
  WITH CHECK (
    auth.uid() = user_id
    OR auth.uid() = consumer_id
  );

DROP POLICY IF EXISTS user_notifications_insert_authenticated ON public.user_notifications;
CREATE POLICY user_notifications_insert_authenticated
  ON public.user_notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.user_notifications TO authenticated;

-- Write NOTICE rows only to consumers.consumer_id (auth id of that consumer)
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

  -- Resolve owner from meter account / billing, then REQUIRE a consumers row.
  -- consumers.consumer_id = Supabase Auth user id used at consumer login.
  SELECT c.consumer_id
  INTO v_consumer_id
  FROM public.meter_accounts ma
  JOIN public.consumers c ON c.consumer_id = ma.consumer_id
  WHERE ma.meter_account_id = p_meter_account_id
  LIMIT 1;

  IF v_consumer_id IS NULL THEN
    SELECT c.consumer_id
    INTO v_consumer_id
    FROM public.billing b
    JOIN public.consumers c ON c.consumer_id = b.consumer_id
    WHERE b.billing_id = p_billing_id
    LIMIT 1;
  END IF;

  IF v_consumer_id IS NULL THEN
    RAISE WARNING
      'fn_notify_consumer_disconnection_warning: no consumers.consumer_id for meter_account % / billing %',
      p_meter_account_id, p_billing_id;
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_notifications un
    WHERE un.event_code = 'NOTICE_OF_DISCONNECTION'
      AND un.reference_id = p_billing_id
      AND un.consumer_id = v_consumer_id
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
    v_consumer_id,  -- filters with auth.uid() on consumer login
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

GRANT EXECUTE ON FUNCTION public.fn_notify_consumer_disconnection_warning(UUID, UUID, NUMERIC, INT, TEXT)
  TO authenticated;
