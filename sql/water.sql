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
    last_active         TIMESTAMPTZ,
    profile_image       TEXT,
    is_default_password BOOLEAN DEFAULT TRUE,
    is_email_verified   BOOLEAN DEFAULT FALSE,
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
    contact_number      VARCHAR(50)  NULL UNIQUE,
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

CREATE TABLE public.account_status (
    account_status_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status_name         VARCHAR(50) UNIQUE NOT NULL, -- 'Connected', 'Disconnected', 'Pending'
    description         TEXT
);

-- =====================
-- METER STATUS (renamed from connection_status)
-- =====================
CREATE TABLE public.meter_status (
    meter_status_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meter_status_name VARCHAR(50) UNIQUE NOT NULL,
    description       TEXT,
    created_at        TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- METER ACCOUNTS (renamed from service_connections)
-- =====================
CREATE TABLE public.meter_accounts (
    meter_account_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consumer_id        UUID NOT NULL,
    zone_id            UUID NOT NULL,
    classification_id  UUID NOT NULL,
    meter_type         BOOLEAN DEFAULT TRUE,  -- TRUE = metered, FALSE = non-metered
    account_status_id    UUID NOT NULL,
    created_at         TIMESTAMPTZ DEFAULT now(),
    updated_at         TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_ma_consumer       FOREIGN KEY (consumer_id)       REFERENCES public.consumers(consumer_id),
    CONSTRAINT fk_ma_zone           FOREIGN KEY (zone_id)           REFERENCES public.zone(zone_id),
    CONSTRAINT fk_ma_classification FOREIGN KEY (classification_id) REFERENCES public.classifications(classification_id),
    CONSTRAINT fk_ma_status         FOREIGN KEY (account_status_id)   REFERENCES public.account_status(account_status_id)
);

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
-- CONNECTION APPLICATIONS
-- =====================
CREATE TABLE public.connection_applications (
    application_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- application_no        VARCHAR(50) UNIQUE NOT NULL,
    connection_no         VARCHAR(50) UNIQUE NOT NULL,
    consumer_id           UUID NOT NULL,
    applied_by            UUID NOT NULL,
    application_status    BOOLEAN DEFAULT FALSE,
    paid_at               TIMESTAMPTZ,
    -- application_fee       NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_connection_fee  NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_fee             NUMERIC(10,2) GENERATED ALWAYS AS (
                              application_fee + total_connection_fee
                          ) STORED,
    created_at            TIMESTAMPTZ DEFAULT now(),
    updated_at            TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_ca_consumer FOREIGN KEY (consumer_id) REFERENCES public.consumers(consumer_id),
    CONSTRAINT fk_ca_clerk    FOREIGN KEY (applied_by)  REFERENCES public.users(user_id)
);

-- =============================================
-- CONNECTION FEES
-- =============================================
CREATE TABLE public.connection_fees (
    connection_fee_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id    UUID NOT NULL,
    meter_account_id  UUID NOT NULL UNIQUE,
    connection_fee    NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_cf_application  FOREIGN KEY (application_id)  REFERENCES public.connection_applications(application_id),
    CONSTRAINT fk_cf_meter_account FOREIGN KEY (meter_account_id) REFERENCES public.meter_accounts(meter_account_id)
);

-- =============================================
-- CONNECTION FEE PAYMENTS
-- =============================================
CREATE TABLE public.connection_fee_payments (
    connection_fee_payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id            UUID NOT NULL,
    payment_id                UUID NOT NULL UNIQUE,
    amount_paid               NUMERIC(10,2) NOT NULL,
    created_at                TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_cfp_application FOREIGN KEY (application_id) REFERENCES public.connection_applications(application_id),
    CONSTRAINT fk_cfp_payment     FOREIGN KEY (payment_id)     REFERENCES public.payments(payment_id)
);

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
    job_type_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type_name     VARCHAR(100) NOT NULL,
    job_type_code     VARCHAR(50)  NOT NULL UNIQUE,
    is_consumer_job   BOOLEAN NOT NULL DEFAULT TRUE,
    skill_id          UUID,
    created_at        TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_jt_skill FOREIGN KEY (skill_id) REFERENCES public.skills(skill_id)
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

-- =====================
-- JOB ORDERS
-- =====================
CREATE TABLE public.job_orders (
    job_order_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_order_no      VARCHAR(30) UNIQUE,
    job_type_id       UUID NOT NULL,
    barangay_id       UUID NOT NULL, 
    job_status_id     UUID NOT NULL,
    created_by        UUID NOT NULL,
    completion_date   TIMESTAMPTZ,
    request_date      TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_job_types  FOREIGN KEY (job_type_id)    REFERENCES public.job_types(job_type_id),
    CONSTRAINT fk_jo_barangay FOREIGN KEY (barangay_id)   REFERENCES public.barangay(barangay_id),
    CONSTRAINT fk_jo_status   FOREIGN KEY (job_status_id) REFERENCES public.job_order_status(job_status_id),
    CONSTRAINT fk_jo_creator  FOREIGN KEY (created_by)    REFERENCES public.users(user_id)
);

-- =====================
-- JOB REQUEST STATUS
-- =====================
CREATE TABLE public.jo_request_status (
    request_status_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status_code       VARCHAR(30) UNIQUE NOT NULL,
    description       TEXT                         
);

INSERT INTO public.jo_request_status (status_code, description) VALUES
('Pending', 'Work has not started at this property yet.'),
('Completed', 'Task executed successfully by the field team.'),
('Cancelled', 'Task was skipped or cancelled due to field issues.');

-- =====================
-- JOB ORDER REQUEST
-- =====================
CREATE TABLE public.job_order_request (
    jo_request_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_order_id      UUID REFERENCES public.job_orders(job_order_id) ON DELETE CASCADE,
    meter_account_id  UUID REFERENCES public.meter_accounts(meter_account_id),
    request_status_id UUID NOT NULL,
    completed_at      TIMESTAMPTZ,
    CONSTRAINT fk_jor_request_status FOREIGN KEY (request_status_id) REFERENCES public.jo_request_status(request_status_id),
    UNIQUE (job_order_id, meter_account_id)
);

-- =====================
-- JOB ASSIGNMENTS
-- =====================
CREATE TABLE public.job_assignments (
    job_assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_order_id      UUID NOT NULL,
    user_id           UUID NOT NULL,  
    assign_by         UUID NOT NULL,   
    scheduled_at      TIMESTAMPTZ,
    started_at        TIMESTAMPTZ,
    assigned_date     TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_ja_jo       FOREIGN KEY (job_order_id) REFERENCES public.job_orders(job_order_id),
    CONSTRAINT fk_ja_plumber  FOREIGN KEY (user_id)      REFERENCES public.users(user_id),
    CONSTRAINT fk_ja_assigner FOREIGN KEY (assign_by)    REFERENCES public.users(user_id)
);

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

INSERT INTO public.disconnection_status (status_name, description)
VALUES
('Pending', 'Waiting for field technician'),
('Completed', 'Service has been disconnected'),
('Cancelled', 'Disconnection cancelled');

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
    status_name VARCHAR(50) NOT NULL UNIQUE, -- 'Pending', 'Scheduled', 'Completed', 'Cancelled'
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Populate clean operational statuses
INSERT INTO public.reconnection_status (status_name, description)
VALUES
('Pending', 'Request created, awaiting payment or verification'),
('Reconnected', 'Service has been restored and meter status set back to Connected'),
('Cancelled', 'Reconnection request has been aborted');

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

INSERT INTO public.reconnection_charge_types
(charge_name, default_amount)
VALUES
('Reconnection Fee', 200.00),
('Illegal Tapping Penalty', 0.00),
('Other', 0.00);

-- =====================
-- RECONNECTION CHARGES
-- =====================
CREATE TABLE public.reconnection_charges (
    reconnection_charge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconnection_id UUID NOT NULL,
    charge_type_id UUID NOT NULL,
    amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_rc_reconnection FOREIGN KEY (reconnection_id) REFERENCES public.reconnections(reconnection_id) ON DELETE CASCADE,
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

INSERT INTO public.meter_reading_status (status_code, description) VALUES
('RECORDED', 'The meter digits were successfully captured and saved under normal field conditions.'),
('DEFECTIVE', 'The meter hardware is broken. No digits could be recorded; awaiting supervisor average estimation.');


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

INSERT INTO public.billing_basis (basis_code, description) VALUES
('LAST_CONSUMPTION', 'Bill using the consumer''s most recent recorded consumption.'),
('AVERAGE', 'Bill using the average of past consumption readings.');

-- =====================
-- READING ISSUES
-- =====================
CREATE TABLE public.meter_issue_types (
    issue_type_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_name       VARCHAR(50) NOT NULL UNIQUE,
    description      TEXT,
    affects_billing  BOOLEAN NOT NULL DEFAULT FALSE,
    billing_basis_id UUID
        REFERENCES public.billing_basis(billing_basis_id),
    updated_by       UUID
        REFERENCES public.users(user_id),
    updated_at       TIMESTAMPTZ DEFAULT now(),
    created_at       TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT chk_basis_required_when_affects_billing
        CHECK (affects_billing = FALSE OR billing_basis_id IS NOT NULL)
);

INSERT INTO public.meter_issue_types (issue_name, description, affects_billing, billing_basis_id) VALUES
('DEFECTIVE', 'Meter hardware is broken or malfunctioning; no reliable reading possible.',
    TRUE,
    (SELECT billing_basis_id FROM public.billing_basis WHERE basis_code = 'LAST_CONSUMPTION')),
('STOLEN', 'Meter has been removed or stolen from the premises.',
    TRUE,
    (SELECT billing_basis_id FROM public.billing_basis WHERE basis_code = 'LAST_CONSUMPTION')),
('LEAK_AFTER_METER', 'Leak detected on the pipe/fixture after the meter — outside utility responsibility, meter reads normally.',
    FALSE,
    NULL);
-- =====================
-- METER READING REPORT
-- =====================
CREATE TABLE public.meter_issue_reports (
    issue_report_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meter_account_id    UUID NOT NULL,
    issue_type_id        UUID NOT NULL,
    report_description  TEXT,
    report_status_id    UUID NOT NULL,
    report_by           UUID NOT NULL,
    approved_by          UUID,
    approved_at           TIMESTAMPTZ,
    resolved_at            TIMESTAMPTZ,
    created_at             TIMESTAMPTZ DEFAULT now(),
    updated_at             TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_mir_account        FOREIGN KEY (meter_account_id)  REFERENCES public.meter_accounts(meter_account_id) ON DELETE CASCADE,
    CONSTRAINT fk_mir_issue_type     FOREIGN KEY (issue_type_id)     REFERENCES public.meter_issue_types(issue_type_id),
    CONSTRAINT fk_mir_status         FOREIGN KEY (report_status_id)  REFERENCES public.bulk_status(status_id),
    CONSTRAINT fk_mir_report_by      FOREIGN KEY (report_by)         REFERENCES public.users(user_id),
    CONSTRAINT fk_mir_approver       FOREIGN KEY (approved_by)       REFERENCES public.users(user_id)
);

-- =====================
-- METER READING ADJUSTMENTS
-- =====================
CREATE TABLE public.meter_reading_adjustments (
    reading_adjustment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reading_id            UUID NOT NULL,
    original_reading      NUMERIC(10,2),
    adjusted_reading      NUMERIC(10,2),
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

-- =====================
-- PAYMENT ADJUSTMENTS
-- =====================
CREATE TABLE public.payment_adjustments (
    adjustment_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    billing_payment_id   UUID          NOT NULL,
    requested_by         UUID          NOT NULL,
    approved_by          UUID,
    original_amount      NUMERIC(10,2) NOT NULL,
    adjusted_amount      NUMERIC(10,2) NOT NULL,
    adjustment_status_id UUID,
    reason               TEXT,
    requested_at         TIMESTAMPTZ   DEFAULT now(),
    approved_at          TIMESTAMPTZ,
    CONSTRAINT fk_pa_billing_payment FOREIGN KEY (billing_payment_id) REFERENCES public.billing_payments(billing_payment_id),
    CONSTRAINT fk_pa_requester FOREIGN KEY (requested_by) REFERENCES public.users(user_id),
    CONSTRAINT fk_pa_approver  FOREIGN KEY (approved_by) REFERENCES public.users(user_id),
    CONSTRAINT fk_pa_status    FOREIGN KEY (adjustment_status_id) REFERENCES public.bulk_status(status_id)
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
-- COMPLAINTS
-- =====================================================================

CREATE TABLE public.complaint_categories (
    category_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_name VARCHAR(100) NOT NULL,
    description   TEXT,
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.complaint_status (
    complaint_status_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_status_name VARCHAR(50) NOT NULL,
    description           TEXT,
    created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.consumer_complaints (
    complaint_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consumer_id         UUID NOT NULL,
    category_id         UUID NOT NULL,
    complaint_status_id UUID NOT NULL,
    description         TEXT NOT NULL,
    reported_date       DATE NOT NULL DEFAULT CURRENT_DATE,
    resolved_date       DATE,
    job_order_id        UUID,
    handled_by          UUID,
    remarks             TEXT,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_cc_consumer FOREIGN KEY (consumer_id)         REFERENCES public.consumers(consumer_id),
    CONSTRAINT fk_cc_category FOREIGN KEY (category_id)         REFERENCES public.complaint_categories(category_id),
    CONSTRAINT fk_cc_status   FOREIGN KEY (complaint_status_id) REFERENCES public.complaint_status(complaint_status_id),
    CONSTRAINT fk_cc_jo       FOREIGN KEY (job_order_id)        REFERENCES public.job_orders(job_order_id),
    CONSTRAINT fk_cc_handler  FOREIGN KEY (handled_by)          REFERENCES public.users(user_id)
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

-- 2. Insert your statuses
INSERT INTO public.installment_status (status_code, description) VALUES
('PENDING',    'Approved but billing has not yet started.'),
('ACTIVE',     'The installment plan is ongoing and currently being billed.'),
('COMPLETED',  'The total cost has been fully paid off.'),
('CANCELLED',  'Stopped manually by customer or admin request.'),
('TERMINATED', 'Stopped permanently due to defective meter/equipment.');

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

-- Index for fast lookup of active meter prices
CREATE INDEX idx_meter_prices_active ON public.meter_prices(meter_type, is_active);

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


CREATE TABLE public.user_notifications (
    notification_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL,                        -- Target recipient
    meter_account_id  UUID NULL,                            -- Linked meter account
    event_code        VARCHAR(50) NOT NULL,                 -- Links to notification_templates
    metadata          JSONB DEFAULT '{}'::jsonb,            -- Holds dynamic variables e.g. {"amount": "500", "jo_number": "JO-102"}
    -- Status & Delivery
    is_read           BOOLEAN DEFAULT FALSE,
    read_at           TIMESTAMPTZ NULL,
    -- Source Tracking
    reference_id      UUID NULL,                          
    created_at        TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_un_user FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_un_meter_account FOREIGN KEY (meter_account_id) REFERENCES public.meter_accounts(meter_account_id) ON DELETE CASCADE,
    CONSTRAINT fk_un_event_code FOREIGN KEY (event_code) REFERENCES public.notification_templates(event_code) ON DELETE CASCADE
);

-- ─── Admin-managed notification sounds ─────────────────────────────
CREATE TABLE public.notification_audio (
    audio_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audio_name    VARCHAR(100) NOT NULL,          -- e.g. 'Default Chime', 'Alert Beep'
    audio_url     TEXT NOT NULL,                  -- storage path/URL to the .mp3/.wav file
    is_active     BOOLEAN DEFAULT TRUE,           -- admin can disable without deleting
    created_by    UUID NULL,                      -- admin who uploaded it
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_na_created_by FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE SET NULL
);

-- ─── Per-user preference: sound on/off + which sound ───────────────
CREATE TABLE public.user_notification_preferences (
    preference_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID PRIMARY KEY,               -- one row per user
    sound_enabled     BOOLEAN DEFAULT TRUE,            -- the toggle
    audio_id          UUID NULL,                       -- which sound they've picked (NULL = use default)
    updated_at        TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_unp_user FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_unp_audio FOREIGN KEY (audio_id) REFERENCES public.notification_audio(audio_id) ON DELETE SET NULL
);