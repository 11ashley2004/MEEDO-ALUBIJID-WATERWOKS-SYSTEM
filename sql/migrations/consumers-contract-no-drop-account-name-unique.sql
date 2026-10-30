-- Rename consumers.account_number → contract_no (keep unique).
-- Drop UNIQUE on consumers.account_name (duplicate names allowed).

-- ── 1. Rename account_number → contract_no ────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'consumers'
      AND column_name = 'account_number'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'consumers'
      AND column_name = 'contract_no'
  ) THEN
    ALTER TABLE public.consumers RENAME COLUMN account_number TO contract_no;
  END IF;
END $$;

-- Rename unique constraint if it still uses the old name
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_consumers_account_number'
  ) THEN
    ALTER TABLE public.consumers
      RENAME CONSTRAINT uq_consumers_account_number TO uq_consumers_contract_no;
  END IF;
END $$;

-- Ensure UNIQUE on contract_no (covers DBs that only had column UNIQUE inline)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'consumers'
      AND column_name = 'contract_no'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.consumers'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ILIKE '%(contract_no)%'
  ) THEN
    ALTER TABLE public.consumers
      ADD CONSTRAINT uq_consumers_contract_no UNIQUE (contract_no);
  END IF;
END $$;

-- ── 2. Drop UNIQUE on account_name ────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'public.consumers'::regclass
      AND c.contype = 'u'
      AND a.attname = 'account_name'
      AND array_length(c.conkey, 1) = 1
  LOOP
    EXECUTE format('ALTER TABLE public.consumers DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;
