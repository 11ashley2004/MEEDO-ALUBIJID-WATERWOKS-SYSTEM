-- =============================================================
-- SERVICE REPORTS — REFACTORED MODULE
-- Replaces the two conflicting service_reports definitions and the
-- 1:1 service_report_details extension table.
-- =============================================================

-- 1. Dedicated, ordered status lookup (stop overloading bulk_status)
CREATE TABLE public.report_status (
    report_status_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status_code      VARCHAR(30) NOT NULL UNIQUE,
    status_name      VARCHAR(50) NOT NULL,
    sort_order       SMALLINT  NOT NULL,
    is_terminal      BOOLEAN   NOT NULL DEFAULT FALSE,
    description      TEXT,
    created_at       TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.report_status (status_code, status_name, sort_order, description) VALUES
    ('SUBMITTED',    'Submitted',   1, 'Filed by consumer or staff, awaiting triage'),
    ('UNDER_REVIEW', 'Under Review',2, 'Staff verifying details / duplicate check'),
    ('APPROVED',     'Approved',    3, 'Validated; ready to dispatch'),
    ('REJECTED',     'Rejected',    4, 'Invalid or duplicate; terminal'),
    ('DISPATCHED',   'Dispatched',  5, 'Job order created and assigned to a crew'),
    ('RESOLVED',     'Resolved',    6, 'Crew finished; awaiting consumer confirmation'),
    ('CLOSED',       'Closed',      7, 'Confirmed by consumer or auto-closed; terminal');

-- 2. Issue types — single definition (merge of your two versions)
CREATE TABLE public.service_issue_types (
    issue_type_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id              UUID NOT NULL,
    target_type              TEXT NOT NULL DEFAULT 'account'
        CHECK (target_type IN ('account','zone')),
    issue_name               VARCHAR(50) NOT NULL UNIQUE,
    description              TEXT,
    severity_default         VARCHAR(10) NOT NULL DEFAULT 'MEDIUM'
        CHECK (severity_default IN ('LOW','MEDIUM','HIGH')),
    requires_job_order       BOOLEAN NOT NULL DEFAULT FALSE,
    default_job_type_id      UUID,
    approved_meter_status_id UUID,          -- meter state while issue is open (e.g. 'Under Repair')
    affects_billing          BOOLEAN NOT NULL DEFAULT FALSE,
    billing_basis_id         UUID,
    is_active                BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by               UUID,
    updated_at               TIMESTAMPTZ DEFAULT now(),
    created_at               TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_sit_category              FOREIGN KEY (category_id)              REFERENCES public.report_categories(category_id),
    CONSTRAINT fk_sit_default_job_type      FOREIGN KEY (default_job_type_id)      REFERENCES public.job_types(job_type_id),
    CONSTRAINT fk_sit_approved_meter_status FOREIGN KEY (approved_meter_status_id) REFERENCES public.meter_status(meter_status_id),
    CONSTRAINT fk_sit_billing_basis         FOREIGN KEY (billing_basis_id)         REFERENCES public.billing_basis(billing_basis_id),
    CONSTRAINT fk_sit_updated_by            FOREIGN KEY (updated_by)               REFERENCES public.users(user_id),
    CONSTRAINT chk_sit_basis_required_when_affects_billing
        CHECK (affects_billing = FALSE OR billing_basis_id IS NOT NULL),
    CONSTRAINT chk_sit_job_type_when_required
        CHECK (requires_job_order = FALSE OR default_job_type_id IS NOT NULL)
);

-- 3. Header — service_report_details flattened in (it was 1:1)
CREATE TABLE public.service_reports (
    report_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_no       VARCHAR(50) NOT NULL UNIQUE,           -- SR-2026-000123
    issue_type_id      UUID NOT NULL,
    meter_account_id   UUID,
    zone_id            UUID,
    barangay_id        UUID,
    report_source_id   UUID NOT NULL,
    consumer_id        UUID,                                 -- who filed it (NULL when staff-created)
    reported_by        UUID,                                 -- staff recorder, if entered on behalf
    report_description TEXT,
    severity           VARCHAR(10) NOT NULL DEFAULT 'MEDIUM'
        CHECK (severity IN ('LOW','MEDIUM','HIGH')),
    report_status_id   UUID NOT NULL,
    reviewed_by        UUID,
    reviewed_at        TIMESTAMPTZ,
    review_note        TEXT,                                 -- rejection reason / triage note
    approved_by        UUID,
    approved_at        TIMESTAMPTZ,
    resolved_at        TIMESTAMPTZ,
    closed_at          TIMESTAMPTZ,
    created_at         TIMESTAMPTZ DEFAULT now(),
    updated_at         TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_sr_issue_type FOREIGN KEY (issue_type_id)    REFERENCES public.service_issue_types(issue_type_id),
    CONSTRAINT fk_sr_account    FOREIGN KEY (meter_account_id) REFERENCES public.meter_accounts(meter_account_id),
    CONSTRAINT fk_sr_zone       FOREIGN KEY (zone_id)          REFERENCES public.zone(zone_id),
    CONSTRAINT fk_sr_barangay   FOREIGN KEY (barangay_id)      REFERENCES public.barangay(barangay_id),
    CONSTRAINT fk_sr_source     FOREIGN KEY (report_source_id) REFERENCES public.report_sources(report_source_id),
    CONSTRAINT fk_sr_consumer   FOREIGN KEY (consumer_id)      REFERENCES public.consumers(consumer_id),
    CONSTRAINT fk_sr_reporter   FOREIGN KEY (reported_by)      REFERENCES public.users(user_id),
    CONSTRAINT fk_sr_status     FOREIGN KEY (report_status_id) REFERENCES public.report_status(report_status_id),
    CONSTRAINT fk_sr_reviewer   FOREIGN KEY (reviewed_by)      REFERENCES public.users(user_id),
    CONSTRAINT fk_sr_approver   FOREIGN KEY (approved_by)      REFERENCES public.users(user_id),
    CONSTRAINT chk_sr_target CHECK (meter_account_id IS NOT NULL OR zone_id IS NOT NULL)
);

-- only ONE open report per account+issue (replaces idx_sr_open_by_account)
CREATE UNIQUE INDEX uq_sr_one_open_per_account_issue
    ON public.service_reports (meter_account_id, issue_type_id)
    WHERE resolved_at IS NULL AND report_status_id NOT IN
        (SELECT report_status_id FROM public.report_status WHERE status_code IN ('REJECTED','CLOSED'));

-- 4. Photo / file evidence
CREATE TABLE public.report_attachments (
    attachment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id     UUID NOT NULL REFERENCES public.service_reports(report_id) ON DELETE CASCADE,
    file_name     VARCHAR(255) NOT NULL,
    file_path     TEXT NOT NULL,
    mime_type     VARCHAR(100),
    file_size     INT,
    uploaded_by_consumer BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ DEFAULT now()
);

-- 5. One append-only event log (replaces service_report_responses;
--    internal notes, public replies and status changes live here)
CREATE TABLE public.service_report_events (
    event_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id         UUID NOT NULL REFERENCES public.service_reports(report_id) ON DELETE CASCADE,
    event_type        TEXT NOT NULL CHECK (event_type IN ('STATUS_CHANGED','INTERNAL_NOTE','PUBLIC_REPLY')),
    from_status_id    UUID REFERENCES public.report_status(report_status_id),
    to_status_id      UUID REFERENCES public.report_status(report_status_id),
    body              TEXT,
    actor_user_id     UUID REFERENCES public.users(user_id),
    actor_consumer_id UUID REFERENCES public.consumers(consumer_id),
    is_public         BOOLEAN NOT NULL DEFAULT FALSE,   -- consumers only ever see is_public rows
    created_at        TIMESTAMPTZ DEFAULT now()
);

-- 6. Meter swap extracted from the header (a swap is a full
--    meter_replacement job, not a column cluster)
CREATE TABLE public.report_meter_swaps (
    swap_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id      UUID NOT NULL UNIQUE REFERENCES public.service_reports(report_id),
    old_meter_id   UUID NOT NULL REFERENCES public.meters(meter_id),
    new_meter_id   UUID NOT NULL REFERENCES public.meters(meter_id),
    final_reading  NUMERIC(10,2),
    swapped_by     UUID NOT NULL REFERENCES public.users(user_id),
    swapped_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    notes          TEXT
);

-- 7. Fix for user_notifications (syntax error: stray ';' after
--    toast_shown_at) + the missing lookup table its FK points to
CREATE TABLE public.notification_templates (
    event_code  VARCHAR(50) PRIMARY KEY,
    title       VARCHAR(150) NOT NULL,
    body        TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.notification_templates (event_code, title, body) VALUES
    ('REPORT_SUBMITTED',     'Report received',          'Your report {{reference_no}} has been received.'),
    ('REPORT_UNDER_REVIEW',  'Report under review',      'Our team is verifying your report {{reference_no}}.'),
    ('REPORT_APPROVED',      'Report approved',          'Report {{reference_no}} approved — a crew will be scheduled.'),
    ('REPORT_REJECTED',      'Report not actionable',    'Report {{reference_no}} was closed: {{review_note}}.'),
    ('REPORT_DISPATCHED',    'Crew assigned',            'A crew has been assigned to report {{reference_no}}.'),
    ('REPORT_RESOLVED',      'Work completed',           'Report {{reference_no}} marked resolved. Please confirm.'),
    ('REPORT_CLOSED',        'Report closed',            'Report {{reference_no}} is now closed.');

-- =============================================================
-- HANDLING RULES (enforce in service layer / triggers)
-- =============================================================
-- R1 Triage: SUBMITTED -> UNDER_REVIEW on first staff touch;
--            reject requires review_note (feeds notification + public reply).
-- R2 Dispatch: approving an issue with requires_job_order=TRUE auto-creates
--   a job_orders row (job_type = default_job_type_id, barangay from report,
--   service_report_id = report_id); status -> DISPATCHED when assignment made.
-- R3 Meter state: on APPROVED, if approved_meter_status_id is set, set the
--   meter's meter_status_id to it; revert on RESOLVED.
-- R4 Billing: while a report with affects_billing=TRUE is open for the
--   account, bill using billing_basis_id (LAST_CONSUMPTION / AVERAGE).
-- R5 Visibility: consumers read ONLY service_report_events.is_public=TRUE
--   plus their own attachments; staff see everything + audit_logs entries.
-- R6 Closure: RESOLVED auto-CLOSED after 3 days without consumer action, or
--   immediately when consumer taps "Confirm resolution"; consumer may Reopen
--   once (back to UNDER_REVIEW) with a reason.