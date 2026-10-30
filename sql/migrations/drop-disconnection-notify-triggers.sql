-- Move disconnection consumer notifications out of Postgres triggers.
-- App (Next.js) validates billing via server actions + Supabase Realtime.

-- ── 1. Drop auto-notify triggers ─────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_billing_notify_disconnection_warning ON public.billing;
DROP TRIGGER IF EXISTS trg_notice_meter_accounts_notify ON public.notice_meter_accounts;

-- Keep helper functions for optional manual/RPC use, but they are no longer
-- fired by billing / notice_meter_accounts inserts.

-- ── 2. Ensure billing is in the realtime publication (idempotent) ────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'billing'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.billing;
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    RAISE WARNING 'Publication supabase_realtime not found — enable Realtime for public.billing in the Supabase dashboard';
  WHEN duplicate_object THEN
    NULL;
END $$;
