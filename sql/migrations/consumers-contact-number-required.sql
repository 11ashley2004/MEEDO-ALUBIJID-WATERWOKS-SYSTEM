-- Make consumers.contact_number required (NOT NULL).
-- Existing NULL/blank values get a unique placeholder so UNIQUE is preserved;
-- staff should replace those with real numbers afterward.

DO $$
DECLARE
  r RECORD;
  seq INT := 0;
BEGIN
  FOR r IN
    SELECT consumer_id
    FROM public.consumers
    WHERE contact_number IS NULL OR btrim(contact_number) = ''
    ORDER BY created_at NULLS LAST, consumer_id
  LOOP
    seq := seq + 1;
    UPDATE public.consumers
    SET contact_number = '+6399' || lpad(seq::text, 8, '0')
    WHERE consumer_id = r.consumer_id;
  END LOOP;
END $$;

ALTER TABLE public.consumers
  ALTER COLUMN contact_number SET NOT NULL;
