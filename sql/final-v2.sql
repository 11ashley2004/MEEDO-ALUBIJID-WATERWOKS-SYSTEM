-- ============================================================================
-- final-v2.sql
-- Copy of sql/final.sql with service-report workflow refactor + schema fixes.
-- Do NOT overwrite sql/final.sql. Fixes include:
--   - deferred job_orders.service_report_id FK (no forward reference)
--   - deferred connection_fee_payments after payments
--   - notification_templates before user_notifications
--   - toast_shown_at syntax fix
--   - approved_meter_status_id on service_issue_types
--   - report attachments / events / meter swaps / leak inspections /
--     clerk billing adjustments
--   - issue-type seeds via subselects (no hardcoded UUIDs)
-- ============================================================================

-- =====================
-- ROLES
-- =====================
CREATE TABLE public.roles (
    role_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_name   VARCHAR(100) NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);


-- =====================
-- USERS (STAFF)
-- =====================
CREATE TABLE public.users (
    user_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id             UUID NOT NULL,
    first_name          VARCHAR(100) NOT NULL,
    last_name           VARCHAR(100) NOT NULL,
    middle_name         VARCHAR(100),
    email               VARCHAR(150) UNIQUE,
    contact_number      VARCHAR(50),
    password            VARCHAR(255) NOT NULL,
    is_active           BOOLEAN DEFAULT TRUE,
    -- last_active         TIMESTAMPTZ, remove it
    profile_image       TEXT,
    -- is_default_password BOOLEAN DEFAULT TRUE, remove it
    -- is_email_verified   BOOLEAN DEFAULT FALSE,  remove it
    updated_at          TIMESTAMPTZ DEFAULT now(),
    created_at          TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES public.roles(role_id)
);

CREATE TABLE public.user_otps (
    otp_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID,
    consumer_id UUID,
    otp_code    VARCHAR(6)  NOT NULL,
    otp_type    VARCHAR(50) NOT NULL,
    is_used     BOOLEAN     DEFAULT FALSE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_otp_user FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);


-- =====================
-- BARANGAYS
-- =====================
CREATE TABLE public.barangay (
    barangay_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barangay_name VARCHAR(150) NOT NULL,
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMPTZ DEFAULT now()
);


-- =====================
-- ZONES
-- =====================
CREATE TABLE public.zone (
    zone_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_name   VARCHAR(100) NOT NULL,
    barangay_id UUID NOT NULL,
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_zone_barangay FOREIGN KEY (barangay_id) REFERENCES public.barangay(barangay_id)
);

CREATE TABLE public.classifications (
    classification_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    classification_name VARCHAR(100) NOT NULL,
    description         TEXT,
    connection_fee      NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT now()
);


-- =====================
-- CONSUMERS
-- =====================
CREATE TABLE public.consumers (
    consumer_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_no         VARCHAR(50)  NOT NULL UNIQUE,
    account_name        VARCHAR(255) NOT NULL,
    email               VARCHAR(150) NOT NULL UNIQUE,
    contact_number      VARCHAR(50)  NOT NULL UNIQUE,
    password            VARCHAR(255) NOT NULL,
    is_active           BOOLEAN DEFAULT TRUE,
    last_active         TIMESTAMPTZ,
    is_default_password BOOLEAN DEFAULT TRUE,
    is_email_verified   BOOLEAN DEFAULT FALSE,
    registered_by       UUID,
    updated_at          TIMESTAMPTZ DEFAULT now(),
    created_at          TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- BULK STATUS
-- =====================
CREATE TABLE public.bulk_status (
    status_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status_name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.meter_accounts (
    meter_account_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consumer_id            UUID NOT NULL,
    zone_id                 UUID NOT NULL,
    classification_id       UUID NOT NULL,
    created_by              UUID NOT NULL,
    payment_status       BOOLEAN DEFAULT FALSE,
    paid_at                  TIMESTAMPTZ,
    total_connection_fee     NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at               TIMESTAMPTZ DEFAULT now(),
    updated_at                TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_ma_consumer       FOREIGN KEY (consumer_id)       REFERENCES public.consumers(consumer_id),
    CONSTRAINT fk_ma_zone           FOREIGN KEY (zone_id)           REFERENCES public.zone(zone_id),
    CONSTRAINT fk_ma_classification FOREIGN KEY (classification_id) REFERENCES public.classifications(classification_id),
    CONSTRAINT fk_ma_created_by     FOREIGN KEY (created_by)        REFERENCES public.users(user_id)
);

-- connection_fee_payments is created AFTER public.payments (see below)
-- to avoid a forward FK reference.

-- =====================
-- METER STATUS (renamed from connection_status)
-- =====================
CREATE TABLE public.meter_status (
    meter_status_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meter_status_name VARCHAR(50) UNIQUE NOT NULL,
    description       TEXT,
    created_at        TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.meter_status (meter_status_name, description) VALUES
    ('Active',                 'Meter is in normal service'),
    ('Pending',                'Meter pending activation / installation'),
    ('Defective',              'Meter reported defective; awaiting replacement'),
    ('Stolen',                 'Meter reported stolen; awaiting replacement'),
    ('Waterleak_After_Meter',  'Consumer-side leak under inspection / repair'),
    ('Removed',                'Meter removed from service'),
    ('Disconnected',           'Service disconnected'),
    ('Replacing',              'Meter replacement in progress'),
    ('Inactive',               'Meter inactive');

-- =====================
-- METERS (renamed from meter_serials)
-- =====================
CREATE TABLE public.meters (
    meter_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meter_account_id  UUID NOT NULL,
    meter_serial_no   VARCHAR(100) NOT NULL UNIQUE,
    meter_status_id   UUID NOT NULL,
    installation_date TIMESTAMPTZ,
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_m_meter_account   FOREIGN KEY (meter_account_id) REFERENCES public.meter_accounts(meter_account_id),
    CONSTRAINT fk_m_meter_status    FOREIGN KEY (meter_status_id)  REFERENCES public.meter_status(meter_status_id)
);

-- =====================
-- TRANSFER STATUS
-- =====================
CREATE TABLE public.transfer_status (
    transfer_status_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status_name        VARCHAR(50) NOT NULL UNIQUE,   -- 'Pending', 'Completed', 'Cancelled'
    description        TEXT,
    created_at         TIMESTAMPTZ DEFAULT now(),
    updated_at         TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.transfer_status (status_name, description) VALUES
    ('Pending',   'Transfer request created, not yet processed'),
    ('Completed', 'Transfer has been completed'),
    ('Cancelled', 'Transfer was cancelled before completion');

-- =====================
-- METER TRANSFERS
-- =====================
CREATE TABLE public.meter_transfers (
    transfer_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meter_account_id     UUID NOT NULL,
    transfer_type        VARCHAR(20) NOT NULL CHECK (transfer_type IN ('OWNERSHIP', 'RELOCATION')),
    previous_consumer_id UUID,
    new_consumer_id      UUID,
    old_zone_id          UUID,
    transfer_status_id UUID NOT NULL REFERENCES public.transfer_status(transfer_status_id),
    new_zone_id          UUID,
    transfer_reason      TEXT,
    transferred_by       UUID NOT NULL,
    transfer_date        TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_mt_meter_account   FOREIGN KEY (meter_account_id)        REFERENCES public.meter_accounts(meter_account_id),
    CONSTRAINT fk_mt_prev_consumer   FOREIGN KEY (previous_consumer_id)    REFERENCES public.consumers(consumer_id),
    CONSTRAINT fk_mt_new_consumer    FOREIGN KEY (new_consumer_id)         REFERENCES public.consumers(consumer_id),
    CONSTRAINT fk_mt_old_zone        FOREIGN KEY (old_zone_id)             REFERENCES public.zone(zone_id),
    CONSTRAINT fk_mt_new_zone        FOREIGN KEY (new_zone_id)             REFERENCES public.zone(zone_id),
    CONSTRAINT fk_mt_user            FOREIGN KEY (transferred_by)          REFERENCES public.users(user_id)
);

-- =====================
-- COMMUNITY CHARGES
-- =====================
CREATE TABLE public.community_charges (
    community_charge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    classification_id   UUID NOT NULL,
    min_consumption     NUMERIC(10,2) NOT NULL,
    max_consumption     NUMERIC(10,2),
    multiplier          NUMERIC(10,2) NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_cc_classification FOREIGN KEY (classification_id) REFERENCES public.classifications(classification_id)
);

CREATE TABLE public.installation_status (
    installation_status_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status_name VARCHAR(50) NOT NULL UNIQUE, -- 'Pending', 'Scheduled', 'Completed', 'Cancelled'
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.installations (
    installation_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meter_account_id     UUID NOT NULL REFERENCES public.meter_accounts(meter_account_id),
    installation_status_id UUID NOT NULL REFERENCES public.installation_status(installation_status_id),
    requested_by          UUID NOT NULL REFERENCES public.users(user_id),
    completed_by           UUID REFERENCES public.users(user_id),
    completed_at             TIMESTAMPTZ,
    created_at               TIMESTAMPTZ DEFAULT now(),
    updated_at               TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- SKILLS
-- =====================
CREATE TABLE public.skills (
    skill_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_name  VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.user_skills (
    user_skill_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL,
    skill_id      UUID NOT NULL,
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_us_user  FOREIGN KEY (user_id)  REFERENCES public.users(user_id),
    CONSTRAINT fk_us_skill FOREIGN KEY (skill_id) REFERENCES public.skills(skill_id),
    UNIQUE (user_id, skill_id)
);

-- =====================
-- JOB TYPES
-- =====================
CREATE TABLE public.job_types (
    job_type_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type_name  VARCHAR(100) NOT NULL,
    job_type_code  VARCHAR(50)  NOT NULL UNIQUE,
    created_at     TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- JOB ORDER STATUS
-- =====================
CREATE TABLE public.job_order_status (
    job_status_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_status_name VARCHAR(50) NOT NULL UNIQUE,
    description     TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- NOTE: service_report_id FK is added AFTER public.service_reports is created
-- (see ALTER TABLE near the service-report module) so this file runs without
-- forward-reference errors.
CREATE TABLE public.job_orders (
    job_order_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_order_no      VARCHAR(30) UNIQUE,
    job_type_id       UUID REFERENCES public.job_types(job_type_id),
    barangay_id       UUID REFERENCES public.barangay(barangay_id),
    job_status_id     UUID REFERENCES public.job_order_status(job_status_id),
    meter_account_id  UUID REFERENCES public.meter_accounts(meter_account_id),
    disconnection_id  UUID REFERENCES public.disconnections(disconnection_id),
    reconnection_id   UUID REFERENCES public.reconnections(reconnection_id),
    installation_id   UUID REFERENCES public.installations(installation_id),
    service_report_id UUID, -- FK added after service_reports
    transfer_id       UUID REFERENCES public.meter_transfers(transfer_id),
    created_by        UUID REFERENCES public.users(user_id),
    completion_date   TIMESTAMPTZ,
    request_date      TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX uq_jo_reconnection ON public.job_orders (reconnection_id) WHERE reconnection_id IS NOT NULL;
CREATE UNIQUE INDEX uq_jo_disconnection ON public.job_orders (disconnection_id) WHERE disconnection_id IS NOT NULL;
CREATE UNIQUE INDEX uq_jo_service_report ON public.job_orders (service_report_id) WHERE service_report_id IS NOT NULL;
CREATE UNIQUE INDEX uq_jo_transfer ON public.job_orders (transfer_id) WHERE transfer_id IS NOT NULL;

-- =====================
-- JOB ASSIGNMENTS
-- (the "trip" — one worker, one outing; can cover multiple job orders)
-- =====================
CREATE TABLE public.job_assignments (
    job_assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assigned_to        UUID NOT NULL,   -- the field worker doing the job
    assign_by          UUID NOT NULL,
    scheduled_at       TIMESTAMPTZ,
    started_at         TIMESTAMPTZ,
    assigned_date      TIMESTAMPTZ DEFAULT now(),
    updated_at         TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_ja_assigned_to FOREIGN KEY (assigned_to) REFERENCES public.users(user_id),
    CONSTRAINT fk_ja_assigner    FOREIGN KEY (assign_by)   REFERENCES public.users(user_id)
);

-- =====================
-- ASSIGNMENT STATUS
-- =====================
CREATE TABLE public.assignment_status (
    assignment_status_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status_code             VARCHAR(30) NOT NULL UNIQUE,
    description              TEXT,
    created_at               TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- JOB ASSIGNMENT ORDERS
-- (junction: one assignment <-> many job orders, batchable at assignment time)
-- =====================
CREATE TABLE public.job_assignment_orders (
    assignment_order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_assignment_id   UUID NOT NULL,
    job_order_id        UUID NOT NULL,
    status_id            UUID NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_jao_assignment FOREIGN KEY (job_assignment_id) REFERENCES public.job_assignments(job_assignment_id) ON DELETE CASCADE,
    CONSTRAINT fk_jao_job_order  FOREIGN KEY (job_order_id)      REFERENCES public.job_orders(job_order_id),
    CONSTRAINT fk_jao_status     FOREIGN KEY (status_id)         REFERENCES public.assignment_status(assignment_status_id),
    UNIQUE (job_assignment_id, job_order_id)
);
-- Note: "only one open (SCHEDULED/ONPROGRESS) assignment per job order" is
-- enforced in the server action, not a DB constraint — see the earlier
-- discussion on why a partial index can't reference these status_ids
-- without hardcoding UUIDs.

-- =====================
-- JOB ASSIGNMENT HELPERS
-- =====================
CREATE TABLE public.job_assignment_helper (
    assignment_helper_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_assignment_id    UUID NOT NULL,
    helper_id            UUID NOT NULL,
    CONSTRAINT fk_jah_assignment FOREIGN KEY (job_assignment_id) REFERENCES public.job_assignments(job_assignment_id),
    CONSTRAINT fk_jah_helper     FOREIGN KEY (helper_id)         REFERENCES public.users(user_id),
    UNIQUE (job_assignment_id, helper_id)
);


-- =====================================================================
-- DEFAULT VALUES
-- =====================================================================

INSERT INTO public.job_types (job_type_name, job_type_code) VALUES
    ('Reconnection',             'RECONNECTION'),
    ('Disconnection',            'DISCONNECTION'),
    ('New Meter Installation',   'METER_INSTALLATION'),
    ('Meter Replacement',        'METER_REPLACEMENT'),
    ('Leak Repair',              'LEAK_REPAIR'),
    ('Meter Reading Adjustment', 'READING_ADJUSTMENT'),
    ('General Maintenance',      'GENERAL_MAINTENANCE');

INSERT INTO public.job_order_status (job_status_name, description) VALUES
    ('Pending',   'Job order created, not yet assigned to a worker'),
    ('Assigned',  'Job order has a worker assignment'),
    ('Completed', 'Job order has been finished'),
    ('Cancelled', 'Job order was cancelled before completion');

INSERT INTO public.assignment_status (status_code, description) VALUES
    ('SCHEDULED',  'Assignment created, worker has not started yet'),
    ('ONPROGRESS', 'Worker has started the job on-site'),
    ('COMPLETED',  'Assignment finished — job order was completed under this assignment'),
    ('CANCELLED',  'Assignment cancelled before work started');

    
-- =====================
-- PAYMENT TYPE
-- =====================
CREATE TABLE public.payment_type (
    payment_type_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_type_name VARCHAR(50) NOT NULL UNIQUE,
    description       TEXT,
    created_at        TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- PAYMENTS
-- =====================
CREATE TABLE public.payments (
    payment_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_number  VARCHAR(50)   NOT NULL UNIQUE,
    payment_type_id UUID          NOT NULL,
    payment_date    DATE          NOT NULL DEFAULT CURRENT_DATE,
    recieved_by     UUID          NOT NULL,
    created_at      TIMESTAMPTZ   DEFAULT now(),
    CONSTRAINT fk_receipt_type     FOREIGN KEY (payment_type_id) REFERENCES public.payment_type(payment_type_id),
    CONSTRAINT fk_receipt_recorder FOREIGN KEY (recieved_by)     REFERENCES public.users(user_id)
);

-- Deferred from earlier: needs public.payments
CREATE TABLE public.connection_fee_payments (
    connection_fee_payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meter_account_id          UUID NOT NULL,
    payment_id                UUID NOT NULL UNIQUE,
    amount_paid               NUMERIC(10,2) NOT NULL,
    created_at                TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_cfp_meter_account FOREIGN KEY (meter_account_id) REFERENCES public.meter_accounts(meter_account_id),
    CONSTRAINT fk_cfp_payment       FOREIGN KEY (payment_id)       REFERENCES public.payments(payment_id)
);

-- =====================================================================
-- DISCONNECTION FLOW
-- =====================================================================

CREATE TABLE public.disconnection_rules (
    rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    min_balance NUMERIC(10,2),
    min_unpaid_months INT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =========================================================================
-- 1. DISCONNECTION BATCH HEADER
-- =========================================================================
CREATE TABLE public.notice_of_disconnection (
    notice_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notice_no          VARCHAR(50) UNIQUE NOT NULL,
    reading_period_id  UUID NOT NULL
        REFERENCES public.reading_periods(reading_period_id),
    rule_id            UUID,
    generated_by       UUID REFERENCES public.users(user_id),
    total_accounts     INT DEFAULT 0,
    generated_at       TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_nod_rule
        FOREIGN KEY (rule_id)
        REFERENCES public.disconnection_rules(rule_id),
    CONSTRAINT uq_one_nod_run_per_period
        UNIQUE (reading_period_id, rule_id)
);

-- =========================================================================
-- 2. DISCONNECTION TARGET LIST
-- =========================================================================
CREATE TABLE public.notice_meter_accounts (
    notice_meter_account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notice_id               UUID NOT NULL,
    meter_account_id        UUID NOT NULL,
    billing_id              UUID NOT NULL, 
    balance_snapshot        NUMERIC(10,2),
    months_unpaid           INT,
    created_at              TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_nma_notice       FOREIGN KEY (notice_id)        REFERENCES public.notice_of_disconnection(notice_id) ON DELETE CASCADE,
    CONSTRAINT fk_nma_meter_account FOREIGN KEY (meter_account_id) REFERENCES public.meter_accounts(meter_account_id),
    CONSTRAINT fk_nma_billing      FOREIGN KEY (billing_id)       REFERENCES public.billing(billing_id),
    UNIQUE (notice_id, meter_account_id, billing_id)
);

-- =====================
-- DISCONNECTION STATUS
-- =====================
CREATE TABLE public.disconnection_status (
    disconnection_status_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status_name VARCHAR(30) NOT NULL UNIQUE,
    description TEXT
);

-- =====================
-- DISCONNECTIONS
-- =====================
CREATE TABLE public.disconnections (
    disconnection_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meter_account_id UUID NOT NULL,
    notice_meter_account_id UUID NULL,
    is_voluntary     BOOLEAN NOT NULL DEFAULT FALSE,
    disconnection_status_id UUID NOT NULL,
    requested_date   DATE NOT NULL DEFAULT CURRENT_DATE,
    disconnected_at  TIMESTAMPTZ,
    processed_by     UUID NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_dis_meter_account      FOREIGN KEY (meter_account_id)         REFERENCES public.meter_accounts(meter_account_id),
    CONSTRAINT fk_dis_notice_meter_account FOREIGN KEY (notice_meter_account_id) REFERENCES public.notice_meter_accounts(notice_meter_account_id),
    CONSTRAINT fk_dis_status            FOREIGN KEY (disconnection_status_id)   REFERENCES public.disconnection_status(disconnection_status_id),
    CONSTRAINT fk_dis_user              FOREIGN KEY (processed_by)              REFERENCES public.users(user_id)
);

-- =====================
-- RECONNECTION STATUS
-- =====================
CREATE TABLE public.reconnection_status (
    reconnection_status_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status_name VARCHAR(50) NOT NULL UNIQUE, -- 'Pending', 'Completed', 'Cancelled'
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- RECONNECTIONS
-- =====================
CREATE TABLE public.reconnections (
    reconnection_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconnection_no VARCHAR(50) NOT NULL UNIQUE,
    disconnection_id UUID NOT NULL,
    outstanding_balance NUMERIC(10,2) NOT NULL DEFAULT 0.00, -- Unpaid water balance from disconnection
    total_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,        -- outstanding_balance + reconnection_fee
    remaining_balance NUMERIC(10,2) NOT NULL DEFAULT 0.00,    -- Left unpaid (Will set to 0.00 once forwarded)
    payment_status_id UUID NOT NULL,        -- FK to billing_status ('unpaid', 'paid', 'partial', 'forwarded')
    reconnection_status_id UUID NOT NULL,   -- FK to reconnection_status ('Pending', 'Reconnected', 'Cancelled')
    processed_by UUID NOT NULL,          
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_rec_disconnection FOREIGN KEY (disconnection_id) REFERENCES public.disconnections(disconnection_id),
    CONSTRAINT fk_rec_payment_status FOREIGN KEY (payment_status_id) REFERENCES public.billing_status(billing_status_id),
    CONSTRAINT fk_rec_status FOREIGN KEY (reconnection_status_id) REFERENCES public.reconnection_status(reconnection_status_id),
    CONSTRAINT fk_rec_user FOREIGN KEY (processed_by) REFERENCES public.users(user_id)
);

-- =====================
-- RECONNECTION CHARGE TYPES
-- =====================
CREATE TABLE public.reconnection_charge_types (
    charge_type_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    charge_name VARCHAR(50) NOT NULL UNIQUE,
    default_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    description TEXT
);

-- =====================
-- RECONNECTION CHARGES
-- =====================
CREATE TABLE public.reconnection_charges (
    reconnection_charge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconnection_id UUID NOT NULL,
    source_installment_id UUID NOT NULL,
    charge_type_id UUID NOT NULL,
    amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_rc_reconnection FOREIGN KEY (reconnection_id) REFERENCES public.reconnections(reconnection_id) ON DELETE CASCADE,
    CONSTRAINT fk_source_installment_id FOREIGN KEY (source_installment_id) REFERENCES public.meter_installments(installment_id),
    CONSTRAINT fk_rc_charge_type FOREIGN KEY (charge_type_id) REFERENCES public.reconnection_charge_types(charge_type_id)
);

-- =====================
-- RECONNECTION PAYMENTS
-- =====================
CREATE TABLE public.reconnection_payments (
    reconnection_payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconnection_id         UUID NOT NULL,
    payment_id              UUID NOT NULL UNIQUE,
    amount_paid             NUMERIC(10,2) NOT NULL,
    created_at              TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_rp_reconnection FOREIGN KEY (reconnection_id) REFERENCES public.reconnections(reconnection_id),
    CONSTRAINT fk_rp_payment      FOREIGN KEY (payment_id)      REFERENCES public.payments(payment_id)
);

-- =====================================================================
-- READING & BILLING
-- =====================================================================

-- ==========================================
-- 1. METER READING STATUS LOOKUP
-- ==========================================
CREATE TABLE public.meter_reading_status (
    reading_status_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status_code         VARCHAR(30) NOT NULL UNIQUE,
    description         TEXT,
    created_at          TIMESTAMPTZ DEFAULT now()
);


CREATE TABLE public.reading_periods (
    reading_period_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    due_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_period UNIQUE (period_start, period_end)
);

-- =========================================================================
-- 2. METER READINGS LAYER
-- =========================================================================
CREATE TABLE public.meter_readings (
    reading_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reading_period_id   UUID NOT NULL
        REFERENCES public.reading_periods(reading_period_id),
    meter_account_id    UUID NOT NULL
        REFERENCES public.meter_accounts(meter_account_id),
    meter_id            UUID NOT NULL
        REFERENCES public.meters(meter_id),
    meter_reader_id     UUID
        REFERENCES public.users(user_id),
    reading_status_id   UUID NOT NULL
        REFERENCES public.meter_reading_status(reading_status_id),
    present_reading     NUMERIC(10,2),
    reading_date        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_one_reading_per_period
        UNIQUE (meter_account_id, reading_period_id)
);

CREATE TABLE public.billing_basis (
    billing_basis_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    basis_code       VARCHAR(30) NOT NULL UNIQUE, -- 'LAST_CONSUMPTION', 'AVERAGE'
    description       TEXT,
    created_at        TIMESTAMPTZ DEFAULT now()
);


-- Seed billing basis (used by Defective / Stolen average billing)
INSERT INTO public.billing_basis (basis_code, description) VALUES
    ('LAST_CONSUMPTION', 'Bill using the previous period consumption'),
    ('AVERAGE',          'Bill using average consumption across prior periods'),
    ('LEAK_ADJUSTED',    'Clerk reduced billed m³ after a confirmed Leak After Meter inspection')
ON CONFLICT (basis_code) DO NOTHING;

-- Seed bulk_status values used by service reports
INSERT INTO public.bulk_status (status_name, description) VALUES
    ('pending',   'Filed / reported — awaiting consultant review'),
    ('approved',  'Reviewed by consultant — job order may be created'),
    ('rejected',  'Rejected by consultant'),
    ('cancelled', 'Cancelled by reporter or staff'),
    ('resolved',  'Confirmed complete by consultant')
ON CONFLICT (status_name) DO NOTHING;

-- =====================================================================
-- SERVICE ISSUE TYPES
-- =====================================================================
CREATE TABLE public.service_issue_types (
    issue_type_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type              TEXT NOT NULL DEFAULT 'account'
        CHECK (target_type IN ('account', 'zone')),
    issue_name               VARCHAR(50) NOT NULL UNIQUE,
    description              TEXT,
    affects_billing          BOOLEAN NOT NULL DEFAULT FALSE,
    billing_basis_id         UUID,
    requires_job_order       BOOLEAN NOT NULL DEFAULT FALSE,
    default_job_type_id      UUID,
    approved_meter_status_id UUID,
    is_active                BOOLEAN NOT NULL DEFAULT TRUE,
    created_at               TIMESTAMPTZ DEFAULT now(),
    updated_at               TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_sit_billing_basis         FOREIGN KEY (billing_basis_id)         REFERENCES public.billing_basis(billing_basis_id),
    CONSTRAINT fk_sit_default_job_type      FOREIGN KEY (default_job_type_id)      REFERENCES public.job_types(job_type_id),
    CONSTRAINT fk_sit_approved_meter_status FOREIGN KEY (approved_meter_status_id) REFERENCES public.meter_status(meter_status_id),
    CONSTRAINT chk_sit_basis_required_when_affects_billing
        CHECK (affects_billing = FALSE OR billing_basis_id IS NOT NULL),
    CONSTRAINT chk_sit_job_type_when_required
        CHECK (requires_job_order = FALSE OR default_job_type_id IS NOT NULL)
);

-- =====================================================================
-- SERVICE REPORTS
-- Consultant-owned workflow (no admin approval step):
--   pending → approved (reviewed) → job order → assigned → field done → resolved (confirmed)
-- =====================================================================
CREATE TABLE public.service_reports (
    report_id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meter_account_id         UUID,
    zone_id                  UUID,
    barangay_id              UUID,
    issue_type_id            UUID NOT NULL,
    reference_no             VARCHAR(50) UNIQUE,
    report_description       TEXT,
    report_status_id         UUID NOT NULL,

    -- who filed it: staff OR consumer, never both, never neither
    report_by                UUID,
    reported_by_consumer_id  UUID,

    -- consultant review (replaces admin approval)
    reviewed_by              UUID,
    reviewed_at              TIMESTAMPTZ,
    review_note              TEXT,
    approved_by              UUID,          -- kept for backward compatibility (= reviewed_by)
    approved_at              TIMESTAMPTZ,

    -- field completion recorded; consultant confirmation closes the report
    field_completed_at       TIMESTAMPTZ,
    field_completed_by       UUID,
    confirmed_by             UUID,
    confirmed_at             TIMESTAMPTZ,
    resolved_at              TIMESTAMPTZ,

    -- Stolen Meter: replacement cost / who pays / installment option
    replacement_cost         NUMERIC(10,2),
    cost_shouldered_by       VARCHAR(20)
        CHECK (cost_shouldered_by IS NULL OR cost_shouldered_by IN ('CONSUMER', 'UTILITY', 'SHARED')),
    allow_installment        BOOLEAN NOT NULL DEFAULT FALSE,

    created_at               TIMESTAMPTZ DEFAULT now(),
    updated_at               TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT fk_sr_meter_account   FOREIGN KEY (meter_account_id)        REFERENCES public.meter_accounts(meter_account_id) ON DELETE CASCADE,
    CONSTRAINT fk_sr_zone            FOREIGN KEY (zone_id)                 REFERENCES public.zone(zone_id),
    CONSTRAINT fk_sr_barangay        FOREIGN KEY (barangay_id)             REFERENCES public.barangay(barangay_id),
    CONSTRAINT fk_sr_issue_type      FOREIGN KEY (issue_type_id)           REFERENCES public.service_issue_types(issue_type_id),
    CONSTRAINT fk_sr_status          FOREIGN KEY (report_status_id)        REFERENCES public.bulk_status(status_id),
    CONSTRAINT fk_sr_report_by       FOREIGN KEY (report_by)               REFERENCES public.users(user_id),
    CONSTRAINT fk_sr_report_consumer FOREIGN KEY (reported_by_consumer_id) REFERENCES public.consumers(consumer_id),
    CONSTRAINT fk_sr_reviewer        FOREIGN KEY (reviewed_by)             REFERENCES public.users(user_id),
    CONSTRAINT fk_sr_approver        FOREIGN KEY (approved_by)             REFERENCES public.users(user_id),
    CONSTRAINT fk_sr_field_worker    FOREIGN KEY (field_completed_by)      REFERENCES public.users(user_id),
    CONSTRAINT fk_sr_confirmer       FOREIGN KEY (confirmed_by)            REFERENCES public.users(user_id),

    CONSTRAINT chk_sr_target
        CHECK (meter_account_id IS NOT NULL OR zone_id IS NOT NULL),
    CONSTRAINT chk_sr_reporter_single
        CHECK ((report_by IS NOT NULL)::int + (reported_by_consumer_id IS NOT NULL)::int = 1)
);

-- Only one unresolved report per account + issue type
-- (partial unique index cannot use subqueries — gate on resolved_at)
CREATE UNIQUE INDEX uq_sr_one_open_per_account_issue
    ON public.service_reports (meter_account_id, issue_type_id)
    WHERE meter_account_id IS NOT NULL AND resolved_at IS NULL;

-- Wire deferred job_orders.service_report_id FK
ALTER TABLE public.job_orders
    ADD CONSTRAINT fk_jo_service_report
    FOREIGN KEY (service_report_id) REFERENCES public.service_reports(report_id);

-- Photo / file evidence (report + inspection + adjustment)
CREATE TABLE public.report_attachments (
    attachment_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id              UUID NOT NULL REFERENCES public.service_reports(report_id) ON DELETE CASCADE,
    leak_inspection_id     UUID,          -- optional link; FK added after inspections table
    billing_adjustment_id  UUID,          -- optional link; FK added after adjustments table
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

-- Append-only timeline / audit of workflow steps
CREATE TABLE public.service_report_events (
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

-- Defective / Stolen meter replacement record
CREATE TABLE public.report_meter_swaps (
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

-- Leak After Meter inspection result (plumber)
CREATE TABLE public.report_leak_inspections (
    leak_inspection_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id          UUID NOT NULL UNIQUE REFERENCES public.service_reports(report_id) ON DELETE CASCADE,
    job_order_id       UUID REFERENCES public.job_orders(job_order_id),
    leak_confirmed     BOOLEAN NOT NULL,
    findings           TEXT,
    inspected_by       UUID NOT NULL REFERENCES public.users(user_id),
    inspected_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at         TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.report_attachments
    ADD CONSTRAINT fk_ra_leak_inspection
    FOREIGN KEY (leak_inspection_id) REFERENCES public.report_leak_inspections(leak_inspection_id);

-- NOTE: report_billing_adjustments is created AFTER public.billing
-- (see below) because it FKs billing_id.

-- =====================================================================
-- DATA — service issue types (subselects; no hardcoded UUIDs)
-- =====================================================================
INSERT INTO public.service_issue_types
  (issue_name, description, target_type, affects_billing, billing_basis_id,
   requires_job_order, default_job_type_id, approved_meter_status_id)
VALUES
  (
    'Defective Meter',
    'Meter is malfunctioning or giving inaccurate readings and needs replacement. Billing uses average consumption until replaced.',
    'account',
    TRUE,
    (SELECT billing_basis_id FROM public.billing_basis WHERE basis_code = 'AVERAGE'),
    TRUE,
    (SELECT job_type_id FROM public.job_types WHERE job_type_code = 'METER_REPLACEMENT'),
    (SELECT meter_status_id FROM public.meter_status WHERE meter_status_name = 'Defective')
  ),
  (
    'Stolen Meter',
    'Meter has been reported stolen and must be replaced. Old meter is marked Stolen; replacement cost / shoulder / installment are recorded on the report.',
    'account',
    TRUE,
    (SELECT billing_basis_id FROM public.billing_basis WHERE basis_code = 'AVERAGE'),
    TRUE,
    (SELECT job_type_id FROM public.job_types WHERE job_type_code = 'METER_REPLACEMENT'),
    (SELECT meter_status_id FROM public.meter_status WHERE meter_status_name = 'Stolen')
  ),
  (
    'Leak After Meter',
    'Leak on the consumer''s plumbing (after the meter). Billing stays on actual readings; plumber inspects; clerk may encode an optional bill adjustment.',
    'account',
    FALSE,
    NULL,
    TRUE,
    (SELECT job_type_id FROM public.job_types WHERE job_type_code = 'LEAK_REPAIR'),
    (SELECT meter_status_id FROM public.meter_status WHERE meter_status_name = 'Waterleak_After_Meter')
  ),
  (
    'Leak Mainline',
    'Leak on the utility''s main distribution line affecting an entire zone.',
    'zone',
    FALSE,
    NULL,
    TRUE,
    (SELECT job_type_id FROM public.job_types WHERE job_type_code = 'LEAK_REPAIR'),
    NULL
  );
-- =====================
-- METER READING ADJUSTMENTS
-- =====================
CREATE TABLE public.meter_reading_adjustments (
    reading_adjustment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reading_id            UUID NOT NULL,
    original_reading      NUMERIC(10,2),
    adjusted_reading      NUMERIC(10,2),
    proof_image_url       TEXT NOT NULL,
    requested_by          UUID,
    requested_date        TIMESTAMPTZ,
    approved_by           UUID,
    approved_at           TIMESTAMPTZ,
    status_id             UUID,
    reason                TEXT,
    created_at            TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_mra_reading FOREIGN KEY (reading_id) REFERENCES public.meter_readings(reading_id) ON DELETE CASCADE,
    CONSTRAINT fk_mra_requester FOREIGN KEY (requested_by) REFERENCES public.users(user_id),
    CONSTRAINT fk_mra_approver FOREIGN KEY (approved_by) REFERENCES public.users(user_id),
    CONSTRAINT fk_mra_status FOREIGN KEY (status_id) REFERENCES public.bulk_status(status_id)
);

-- =====================
-- WATER CONSUMPTIONS
-- =====================
CREATE TABLE public.water_consumptions (
    consumption_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meter_account_id   UUID          NOT NULL,
    reading_id         UUID,
    previous_reading   NUMERIC(10,2) NOT NULL,
    present_reading    NUMERIC(10,2) NOT NULL,
    consumption        NUMERIC(10,2) NOT NULL,
    billed_consumption NUMERIC(10,2) NOT NULL,
    billing_basis_id   UUID
        REFERENCES public.billing_basis(billing_basis_id),
    created_at         TIMESTAMPTZ   DEFAULT now(),
    CONSTRAINT fk_wc_meter_account FOREIGN KEY (meter_account_id) REFERENCES public.meter_accounts(meter_account_id),
    CONSTRAINT fk_wc_reading       FOREIGN KEY (reading_id)       REFERENCES public.meter_readings(reading_id),
    CONSTRAINT chk_billed_consumption_basis
        CHECK (
            (billing_basis_id IS NULL AND billed_consumption = consumption)
            OR
            (billing_basis_id IS NOT NULL)
        )
);

-- =====================
-- BILLING COMMUNITY BREAKDOWNS
-- =====================
CREATE TABLE public.billing_community_breakdowns (
    breakdown_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consumption_id      UUID          NOT NULL,
    community_charge_id UUID          NOT NULL,
    block_order         INT           NOT NULL,
    units_used          NUMERIC(10,2) NOT NULL,
    rate_per_unit       NUMERIC(10,2) NOT NULL,
    subtotal            NUMERIC(10,2) NOT NULL,
    created_at          TIMESTAMPTZ   DEFAULT now(),
    updated_at          TIMESTAMPTZ   DEFAULT now(),
    CONSTRAINT fk_bcb_consumption FOREIGN KEY (consumption_id)      REFERENCES public.water_consumptions(consumption_id),
    CONSTRAINT fk_bcb_charge      FOREIGN KEY (community_charge_id) REFERENCES public.community_charges(community_charge_id)
);

-- =====================
-- BILLING STATUS
-- =====================
CREATE TABLE public.billing_status (
    billing_status_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    billing_status_name VARCHAR(50) NOT NULL UNIQUE,
    description         TEXT,
    created_at          TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- BILLING
-- =====================
CREATE TABLE public.billing (
    billing_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reading_period_id   UUID NOT NULL
        REFERENCES public.reading_periods(reading_period_id),
    meter_account_id    UUID NOT NULL
        REFERENCES public.meter_accounts(meter_account_id),
    consumer_id         UUID NOT NULL
        REFERENCES public.consumers(consumer_id),
    consumption_id      UUID NOT NULL UNIQUE
        REFERENCES public.water_consumptions(consumption_id),
    current_billing     NUMERIC(10,2) NOT NULL,
    penalty_amount      NUMERIC(10,2) DEFAULT 0,
    previous_balance    NUMERIC(10,2) DEFAULT 0,
    total_billing       NUMERIC(10,2) NOT NULL,
    remaining_balance   NUMERIC(10,2) DEFAULT 0,
    billing_status_id   UUID NOT NULL
        REFERENCES public.billing_status(billing_status_id),
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_billing_per_period
        UNIQUE (meter_account_id, reading_period_id)
);
-- =====================
-- BILLING PAYMENTS
-- =====================
CREATE TABLE public.billing_payments (
    billing_payment_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    billing_id   UUID          NOT NULL,
    payment_id   UUID          NOT NULL UNIQUE,
    amount_paid  NUMERIC(10,2) NOT NULL,
    created_at   TIMESTAMPTZ   DEFAULT now(),
    CONSTRAINT fk_bp_billing FOREIGN KEY (billing_id) REFERENCES public.billing(billing_id),
    CONSTRAINT fk_bp_payment FOREIGN KEY (payment_id) REFERENCES public.payments(payment_id)
);

-- Clerk bill adjustment for confirmed Leak After Meter (no admin approval)
CREATE TABLE public.report_billing_adjustments (
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

ALTER TABLE public.report_attachments
    ADD CONSTRAINT fk_ra_billing_adjustment
    FOREIGN KEY (billing_adjustment_id) REFERENCES public.report_billing_adjustments(billing_adjustment_id);

-- =====================
-- PAYMENT ADJUSTMENTS
-- =====================
CREATE TABLE public.payment_adjustments (
    adjustment_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    billing_payment_id       UUID,
    reconnection_payment_id  UUID,
    requested_by             UUID          NOT NULL,
    approved_by              UUID,
    original_amount          NUMERIC(10,2) NOT NULL,
    adjusted_amount          NUMERIC(10,2) NOT NULL,
    adjustment_status_id     UUID,
    reason                   TEXT,
    requested_at             TIMESTAMPTZ   DEFAULT now(),
    approved_at              TIMESTAMPTZ,
    CONSTRAINT fk_pa_billing_payment      FOREIGN KEY (billing_payment_id)      REFERENCES public.billing_payments(billing_payment_id),
    CONSTRAINT fk_pa_reconnection_payment FOREIGN KEY (reconnection_payment_id) REFERENCES public.reconnection_payments(reconnection_payment_id),
    CONSTRAINT fk_pa_requester            FOREIGN KEY (requested_by)            REFERENCES public.users(user_id),
    CONSTRAINT fk_pa_approver             FOREIGN KEY (approved_by)             REFERENCES public.users(user_id),
    CONSTRAINT fk_pa_status               FOREIGN KEY (adjustment_status_id)    REFERENCES public.bulk_status(status_id),
    CONSTRAINT chk_pa_single_target CHECK (
        (billing_payment_id IS NOT NULL)::int
        + (reconnection_payment_id IS NOT NULL)::int = 1
    )
);

-- =====================
-- PENALTY RATE
-- =====================
CREATE TABLE public.penalty_rate (
    penalty_rate_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    penalty_rate    NUMERIC(5,2) NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- NON-METER CONSUMPTION
-- =====================
CREATE TABLE public.non_meter_consumption (
    non_meter_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fixed_consumption NUMERIC(10,2) NOT NULL,
    created_at        TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- METER READER ASSIGNMENTS
-- =====================
CREATE TABLE public.meter_reader_assignments (
    assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID    NOT NULL,
    zone_id       UUID    NOT NULL,
    is_active     BOOLEAN DEFAULT TRUE,
    assigned_date TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_mra_user FOREIGN KEY (user_id) REFERENCES public.users(user_id),
    CONSTRAINT fk_mra_zone FOREIGN KEY (zone_id) REFERENCES public.zone(zone_id)
);

-- =====================================================================
-- METER INSTALLMENTS
-- =====================================================================

-- 1. Create the lookup table
CREATE TABLE public.installment_status (
    installment_status_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status_code            VARCHAR(30) NOT NULL UNIQUE, -- 'ACTIVE', 'COMPLETED', 'CANCELLED'
    description            TEXT,
    created_at             TIMESTAMPTZ DEFAULT now()
);

-- 3. Update your meter_installments table definition
CREATE TABLE public.meter_installments (
    installment_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meter_account_id  UUID          NOT NULL,
    total_cost        NUMERIC(10,2) NOT NULL,
    monthly_amount    NUMERIC(10,2) NOT NULL,
    total_months      INT           NOT NULL,
    remaining_balance NUMERIC(10,2) NOT NULL,
    status_id         UUID          NOT NULL, 
    created_at        TIMESTAMPTZ   DEFAULT now(),
    CONSTRAINT fk_mi_meter_account FOREIGN KEY (meter_account_id) REFERENCES public.meter_accounts(meter_account_id),
    CONSTRAINT fk_mi_status        FOREIGN KEY (status_id)        REFERENCES public.installment_status(installment_status_id)
);

-- ============================================================
-- METER PRICES (Catalog & Price Management)
-- ============================================================
CREATE TABLE public.meter_price (
    meter_price_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_price      NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
    monthly_amount  NUMERIC(10,2) NOT NULL CHECK (monthly_amount >= 0),            
    updated_by      UUID,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_mp_updated_by FOREIGN KEY (updated_by) REFERENCES public.users(user_id)
);

CREATE TABLE public.meter_installment_charges (
    charge_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    installment_id UUID          NOT NULL,
    billing_id     UUID          NOT NULL,
    amount         NUMERIC(10,2) NOT NULL,
    created_at     TIMESTAMPTZ   DEFAULT now(),
    CONSTRAINT fk_mic_installment FOREIGN KEY (installment_id) REFERENCES public.meter_installments(installment_id),
    CONSTRAINT fk_mic_billing     FOREIGN KEY (billing_id)     REFERENCES public.billing(billing_id)
);

-- =====================================================================
-- AUDIT LOGS
-- =====================================================================

CREATE TABLE public.audit_logs (
    log_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID    NOT NULL,
    action       VARCHAR NOT NULL,
    description  TEXT,
    target_table VARCHAR,
    target_id    VARCHAR,
    created_at   TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_al_user FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);


-- =====================
-- RATE LIMIT ACTIONS
-- =====================
CREATE TABLE public.rate_limit_actions (
    rate_limit_action_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_name             VARCHAR(50) NOT NULL UNIQUE,
    description              TEXT,
    created_at               TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- RATE LIMIT STATUSES
-- =====================
CREATE TABLE public.rate_limit_status (
    rate_limit_status_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status_name             VARCHAR(50) NOT NULL UNIQUE,
    description              TEXT,
    created_at               TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- RATE LIMITS
-- =====================
CREATE TABLE public.rate_limits (
    rate_limit_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope                  TEXT NOT NULL,              -- e.g. 'ip', 'email', 'user'
    identifier             TEXT NOT NULL,              -- e.g. the IP string, the email address, the user_id
    rate_limit_action_id  UUID NOT NULL
        REFERENCES public.rate_limit_actions(rate_limit_action_id),
    attempts              INT NOT NULL DEFAULT 1,
    window_start          TIMESTAMPTZ NOT NULL DEFAULT now(),
    blocked_until          TIMESTAMPTZ,               -- auto lockout, self-expires
    lockout_count          INT NOT NULL DEFAULT 0,     -- escalates block duration on repeat offenses
    rate_limit_status_id  UUID NOT NULL
        REFERENCES public.rate_limit_statuses(rate_limit_status_id),
    override_note          TEXT,
    override_by            UUID REFERENCES public.users(user_id),
    override_at             TIMESTAMPTZ,
    override_expires_at     TIMESTAMPTZ,               -- only for admin 'blocked'; null = permanent until admin unblocks
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_rate_limit_per_scope_identifier_action UNIQUE (scope, identifier, rate_limit_action_id)
);


-- =====================
-- NOTIFICATION TEMPLATES (must exist before user_notifications FK)
-- =====================
CREATE TABLE public.notification_templates (
    template_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_code      VARCHAR(50) UNIQUE NOT NULL,
    title_template  VARCHAR(150) NOT NULL,
    body_template   TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.notification_templates (event_code, title_template, body_template) VALUES
  ('SERVICE_REPORT_PENDING',           'Service report received',     'Report {reference_no} ({issue_name}) was filed and is awaiting review.'),
  ('SERVICE_REPORT_RECEIVED',          'Report received',             'We received your report {reference_no} ({issue_name}).'),
  ('SERVICE_REPORT_JOB_SCHEDULED',     'Job scheduled',               'A crew has been scheduled for report {reference_no}.'),
  ('SERVICE_REPORT_WORK_COMPLETED',    'Work completed',              'Field work for report {reference_no} is complete.'),
  ('SERVICE_REPORT_CONFIRMED',         'Report completed',            'Report {reference_no} has been confirmed complete.'),
  ('SERVICE_REPORT_BILL_ADJUSTED',     'Bill adjusted',               'A bill adjustment was encoded for report {reference_no}.'),
  ('SERVICE_REPORT_CANCELLED',         'Service report cancelled',    'Report {reference_no} was cancelled.'),
  ('SERVICE_REPORT_NEW',               'New service report',          'A new {issue_name} report ({reference_no}) needs review.'),
  ('SERVICE_REPORT_FIELD_RESULT',      'Field result recorded',       'Field result recorded for report {reference_no} — confirm completion.'),
  ('JOB_ASSIGNMENT_CREATED',           'New job assignment',          'You have been assigned to job {job_order_no}.'),
  ('LEAK_CONFIRMED_BILL_ADJUST',       'Leak confirmed — adjust bill','Leak confirmed on report {reference_no}. Ready for bill adjustment.'),
  ('METER_READING_ADJUSTED_PENDING',   'Reading Adjustment Submitted','A reading adjustment for {meter_serial_no} is pending review.'),
  ('METER_READING_ADJUSTED_APPROVED',  'Reading Adjustment Approved', '{meter_serial_no} reading updated to {new_reading}.'),
  ('METER_READING_ADJUSTED_REJECTED',  'Reading Adjustment Rejected', 'The reading adjustment for {meter_serial_no} was rejected.'),
  ('PAYMENT_ADJUSTMENT_PENDING',       'Payment Adjustment Submitted','A payment adjustment for {meter_serial_no} is pending review.'),
  ('PAYMENT_ADJUSTMENT_APPLIED',       'Payment Adjustment Applied',  'Payment for {meter_serial_no} adjusted to {amount}.'),
  ('PAYMENT_ADJUSTMENT_REJECTED',      'Payment Adjustment Rejected', 'The payment adjustment for {meter_serial_no} was rejected.'),
  ('JOB_ASSIGNMENT_UPDATED',           'Job Assignment Updated',      'A job assignment you''re on was updated.'),
  ('NOTICE_OF_DISCONNECTION',          'Notice of Disconnection',     'Your account ({meter_serial_no}) has an outstanding balance of {balance}. Notice: {notice_no}.'),
  ('SERVICE_DISCONNECTED',             'Service Disconnected',        'Water service for meter {meter_serial_no} has been disconnected.')
ON CONFLICT (event_code) DO NOTHING;

CREATE TABLE public.user_notifications (
    notification_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NULL,
    consumer_id       UUID NULL,
    meter_account_id  UUID NULL,
    event_code        VARCHAR(50) NOT NULL,
    metadata          JSONB DEFAULT '{}'::jsonb,
    is_read           BOOLEAN DEFAULT FALSE,
    read_at           TIMESTAMPTZ NULL,
    toast_shown_at    TIMESTAMPTZ NULL,
    reference_id      UUID NULL,
    created_at        TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_un_user          FOREIGN KEY (user_id)          REFERENCES public.users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_un_consumer      FOREIGN KEY (consumer_id)      REFERENCES public.consumers(consumer_id),
    CONSTRAINT fk_un_meter_account FOREIGN KEY (meter_account_id) REFERENCES public.meter_accounts(meter_account_id) ON DELETE CASCADE,
    CONSTRAINT fk_un_event_code    FOREIGN KEY (event_code)       REFERENCES public.notification_templates(event_code) ON DELETE CASCADE
);

CREATE TABLE public.user_notification_preferences (
    preference_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE,
    toast_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at      TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_unp_user
        FOREIGN KEY (user_id)
        REFERENCES public.users(user_id)
        ON DELETE CASCADE
);