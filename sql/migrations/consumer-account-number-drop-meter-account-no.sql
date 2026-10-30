-- Consumer account_number (unique), email required;
-- drop meter_accounts.meter_account_no;
-- meters.meter_serial_no required (NOT NULL UNIQUE).

-- ── 1. consumers.account_number ──────────────────────────────────────────────
ALTER TABLE public.consumers
  ADD COLUMN IF NOT EXISTS account_number VARCHAR(50);

-- Backfill existing rows that lack an account number
-- Format: ##-####-#####  (e.g. 00-0000-00001, 11-2222-11111)
WITH numbered AS (
  SELECT
    consumer_id,
    lpad(row_number() OVER (ORDER BY created_at, consumer_id)::text, 11, '0') AS digits
  FROM public.consumers
  WHERE account_number IS NULL
     OR btrim(account_number) = ''
     OR account_number NOT SIMILAR TO '[0-9]{2}-[0-9]{4}-[0-9]{5}'
)
UPDATE public.consumers c
SET account_number =
  substring(n.digits from 1 for 2) || '-' ||
  substring(n.digits from 3 for 4) || '-' ||
  substring(n.digits from 7 for 5)
FROM numbered n
WHERE c.consumer_id = n.consumer_id;

ALTER TABLE public.consumers
  ALTER COLUMN account_number SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_consumers_account_number'
  ) THEN
    ALTER TABLE public.consumers
      ADD CONSTRAINT uq_consumers_account_number UNIQUE (account_number);
  END IF;
END $$;

-- ── 2. consumers.email required ──────────────────────────────────────────────
-- Placeholder for legacy rows with no email (must be unique)
UPDATE public.consumers
SET email = 'pending+' || replace(consumer_id::text, '-', '') || '@meedo.local'
WHERE email IS NULL OR btrim(email) = '';

ALTER TABLE public.consumers
  ALTER COLUMN email SET NOT NULL;

-- ── 3. Drop meter_accounts.meter_account_no ───────────────────────────────────
ALTER TABLE public.meter_accounts
  DROP COLUMN IF EXISTS meter_account_no;

-- ── 4. meters.meter_serial_no required ───────────────────────────────────────
-- Pending meters created without a serial get a unique temporary value so
-- NOT NULL can be applied; replace via updateMeterSerialNo / installation.
UPDATE public.meters
SET meter_serial_no = 'PENDING-' || replace(meter_id::text, '-', '')
WHERE meter_serial_no IS NULL OR btrim(meter_serial_no) = '';

ALTER TABLE public.meters
  ALTER COLUMN meter_serial_no SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'meters_meter_serial_no_key'
  ) THEN
    ALTER TABLE public.meters
      ADD CONSTRAINT meters_meter_serial_no_key UNIQUE (meter_serial_no);
  END IF;
END $$;

-- ── 5. Notification templates: {meter_account_no} → {meter_serial_no} ─────────
UPDATE public.notification_templates
SET
  title_template = replace(title_template, '{meter_account_no}', '{meter_serial_no}'),
  body_template  = replace(body_template,  '{meter_account_no}', '{meter_serial_no}')
WHERE title_template LIKE '%{meter_account_no}%'
   OR body_template  LIKE '%{meter_account_no}%';
