-- ============================================================================
-- Migration: service-report workflow v2 (Defective / Stolen / Leak After Meter)
-- Safe to run on an existing database that already has sql/final.sql objects.
-- Adds columns/tables used by the consultant → field worker → clerk flow.
-- ============================================================================

-- ── service_issue_types ─────────────────────────────────────────────────────
ALTER TABLE public.service_issue_types
  ADD COLUMN IF NOT EXISTS approved_meter_status_id UUID
    REFERENCES public.meter_status(meter_status_id),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

UPDATE public.service_issue_types sit
SET approved_meter_status_id = ms.meter_status_id
FROM public.meter_status ms
WHERE sit.issue_name = 'Defective Meter'
  AND ms.meter_status_name = 'Defective'
  AND sit.approved_meter_status_id IS NULL;

UPDATE public.service_issue_types sit
SET approved_meter_status_id = ms.meter_status_id
FROM public.meter_status ms
WHERE sit.issue_name = 'Stolen Meter'
  AND ms.meter_status_name = 'Stolen'
  AND sit.approved_meter_status_id IS NULL;

UPDATE public.service_issue_types sit
SET approved_meter_status_id = ms.meter_status_id
FROM public.meter_status ms
WHERE sit.issue_name = 'Leak After Meter'
  AND ms.meter_status_name = 'Waterleak_After_Meter'
  AND sit.approved_meter_status_id IS NULL;

-- ── service_reports ─────────────────────────────────────────────────────────
ALTER TABLE public.service_reports
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.users(user_id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_note TEXT,
  ADD COLUMN IF NOT EXISTS field_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS field_completed_by UUID REFERENCES public.users(user_id),
  ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES public.users(user_id),
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS replacement_cost NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS cost_shouldered_by VARCHAR(20),
  ADD COLUMN IF NOT EXISTS allow_installment BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_sr_cost_shouldered_by'
  ) THEN
    ALTER TABLE public.service_reports
      ADD CONSTRAINT chk_sr_cost_shouldered_by
      CHECK (
        cost_shouldered_by IS NULL
        OR cost_shouldered_by IN ('CONSUMER', 'UTILITY', 'SHARED')
      );
  END IF;
END $$;

-- Backfill review columns from approve columns
UPDATE public.service_reports
SET reviewed_by = COALESCE(reviewed_by, approved_by),
    reviewed_at = COALESCE(reviewed_at, approved_at)
WHERE approved_by IS NOT NULL AND reviewed_by IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sr_one_open_per_account_issue
  ON public.service_reports (meter_account_id, issue_type_id)
  WHERE meter_account_id IS NOT NULL AND resolved_at IS NULL;

-- ── New tables ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.report_attachments (
    attachment_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id              UUID NOT NULL REFERENCES public.service_reports(report_id) ON DELETE CASCADE,
    leak_inspection_id     UUID,
    billing_adjustment_id  UUID,
    file_name              VARCHAR(255) NOT NULL,
    file_path              TEXT NOT NULL,
    mime_type              VARCHAR(100),
    file_size              INT,
    attachment_kind        VARCHAR(30) NOT NULL DEFAULT 'REPORT'
        CHECK (attachment_kind IN ('REPORT', 'SITE', 'INSPECTION', 'BILL_ADJUSTMENT', 'OTHER')),
    uploaded_by            UUID REFERENCES public.users(user_id),
    uploaded_by_consumer   UUID REFERENCES public.consumers(consumer_id),
    created_at             TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.service_report_events (
    event_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id          UUID NOT NULL REFERENCES public.service_reports(report_id) ON DELETE CASCADE,
    event_type         VARCHAR(40) NOT NULL
        CHECK (event_type IN (
            'REPORTED', 'REVIEWED', 'REJECTED', 'JOB_CREATED', 'ASSIGNED',
            'FIELD_COMPLETED', 'CONFIRMED', 'CANCELLED', 'BILL_ADJUSTED',
            'INTERNAL_NOTE', 'PUBLIC_REPLY'
        )),
    from_status_id     UUID REFERENCES public.bulk_status(status_id),
    to_status_id       UUID REFERENCES public.bulk_status(status_id),
    body               TEXT,
    actor_user_id      UUID REFERENCES public.users(user_id),
    actor_consumer_id  UUID REFERENCES public.consumers(consumer_id),
    is_public          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.report_meter_swaps (
    swap_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id        UUID NOT NULL UNIQUE REFERENCES public.service_reports(report_id) ON DELETE CASCADE,
    job_order_id     UUID REFERENCES public.job_orders(job_order_id),
    old_meter_id     UUID NOT NULL REFERENCES public.meters(meter_id),
    new_meter_id     UUID NOT NULL REFERENCES public.meters(meter_id),
    final_reading    NUMERIC(10,2),
    swapped_by       UUID NOT NULL REFERENCES public.users(user_id),
    swapped_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    notes            TEXT
);

CREATE TABLE IF NOT EXISTS public.report_leak_inspections (
    leak_inspection_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id          UUID NOT NULL UNIQUE REFERENCES public.service_reports(report_id) ON DELETE CASCADE,
    job_order_id       UUID REFERENCES public.job_orders(job_order_id),
    leak_confirmed     BOOLEAN NOT NULL,
    findings           TEXT,
    inspected_by       UUID NOT NULL REFERENCES public.users(user_id),
    inspected_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.report_billing_adjustments (
    billing_adjustment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id             UUID NOT NULL REFERENCES public.service_reports(report_id) ON DELETE CASCADE,
    billing_id            UUID NOT NULL REFERENCES public.billing(billing_id),
    leak_inspection_id    UUID REFERENCES public.report_leak_inspections(leak_inspection_id),
    original_amount       NUMERIC(10,2) NOT NULL,
    adjusted_amount       NUMERIC(10,2) NOT NULL,
    reason                TEXT NOT NULL,
    encoded_by            UUID NOT NULL REFERENCES public.users(user_id),
    encoded_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at            TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_ra_leak_inspection'
  ) THEN
    ALTER TABLE public.report_attachments
      ADD CONSTRAINT fk_ra_leak_inspection
      FOREIGN KEY (leak_inspection_id) REFERENCES public.report_leak_inspections(leak_inspection_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_ra_billing_adjustment'
  ) THEN
    ALTER TABLE public.report_attachments
      ADD CONSTRAINT fk_ra_billing_adjustment
      FOREIGN KEY (billing_adjustment_id) REFERENCES public.report_billing_adjustments(billing_adjustment_id);
  END IF;
END $$;

-- ── Notification templates ──────────────────────────────────────────────────
INSERT INTO public.notification_templates (event_code, title_template, body_template) VALUES
  ('SERVICE_REPORT_RECEIVED',       'Report received',              'We received your report {reference_no} ({issue_name}).'),
  ('SERVICE_REPORT_JOB_SCHEDULED',  'Job scheduled',                'A crew has been scheduled for report {reference_no}.'),
  ('SERVICE_REPORT_WORK_COMPLETED', 'Work completed',               'Field work for report {reference_no} is complete.'),
  ('SERVICE_REPORT_CONFIRMED',      'Report completed',             'Report {reference_no} has been confirmed complete.'),
  ('SERVICE_REPORT_BILL_ADJUSTED',  'Bill adjusted',                'A bill adjustment was encoded for report {reference_no}.'),
  ('SERVICE_REPORT_NEW',            'New service report',           'A new {issue_name} report ({reference_no}) needs review.'),
  ('SERVICE_REPORT_FIELD_RESULT',   'Field result recorded',        'Field result recorded for report {reference_no} — confirm completion.'),
  ('LEAK_CONFIRMED_BILL_ADJUST',    'Leak confirmed — adjust bill', 'Leak confirmed on report {reference_no}. Ready for bill adjustment.')
ON CONFLICT (event_code) DO NOTHING;
