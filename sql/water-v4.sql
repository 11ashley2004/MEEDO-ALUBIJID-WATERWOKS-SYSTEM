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
    connection_fee      NUMERIC(10,2) NOT NULL DEFAULT 0,  -- one-time fee; waived on 2nd+ of same class
    created_at          TIMESTAMPTZ DEFAULT now()
);


-- =====================
-- CONSUMERS
-- =====================
CREATE TABLE public.consumers (
    consumer_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consumer_no   VARCHAR(30) NOT NULL UNIQUE, 
    first_name          VARCHAR(100) NOT NULL,
    last_name           VARCHAR(100) NOT NULL,
    middle_name         VARCHAR(100),
    email               VARCHAR(150),
    contact_number      VARCHAR(50),
    password            VARCHAR(255) NOT NULL,
    is_active           BOOLEAN DEFAULT TRUE,
    last_active         TIMESTAMPTZ,
    is_default_password BOOLEAN DEFAULT TRUE,
    is_email_verified   BOOLEAN DEFAULT FALSE,
    registered_by UUID, 
    updated_at          TIMESTAMPTZ DEFAULT now(),
    created_at          TIMESTAMPTZ DEFAULT now()
);


-- =====================
-- BULK STATUS
-- General-purpose status lookup used by reports, adjustments, etc.
-- Seed: pending | approved | rejected 
-- =====================
CREATE TABLE public.bulk_status (
    status_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status_name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- =====================
CREATE TABLE public.connection_status (
    connection_status_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_status_name VARCHAR(50) UNIQUE NOT NULL,
    description            TEXT,
    created_at             TIMESTAMPTZ DEFAULT now()
);


-- =====================
-- SERVICE CONNECTIONS
-- =====================
CREATE TABLE public.service_connections (
    connection_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_no        VARCHAR(50) UNIQUE NOT NULL,
    consumer_id          UUID NOT NULL,
    zone_id              UUID NOT NULL,
    classification_id    UUID NOT NULL,
    connection_type      BOOLEAN DEFAULT TRUE,            -- TRUE = metered, FALSE = non-metered
    connection_status_id UUID NOT NULL,
    created_at           TIMESTAMPTZ DEFAULT now(),
    updated_at           TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_sc_consumer       FOREIGN KEY (consumer_id)          REFERENCES public.consumers(consumer_id),
    CONSTRAINT fk_sc_zone           FOREIGN KEY (zone_id)              REFERENCES public.zone(zone_id),
    CONSTRAINT fk_sc_classification FOREIGN KEY (classification_id)    REFERENCES public.classifications(classification_id),
    CONSTRAINT fk_sc_status         FOREIGN KEY (connection_status_id) REFERENCES public.connection_status(connection_status_id)
);

CREATE TABLE public.connection_applications (
    application_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_no        VARCHAR(50) UNIQUE NOT NULL,
    consumer_id           UUID NOT NULL,
    applied_by            UUID NOT NULL,
    application_status    BOOLEAN DEFAULT FALSE,       -- FALSE = unpaid, TRUE = paid
    paid_at               TIMESTAMPTZ,
    application_fee       NUMERIC(10,2) NOT NULL DEFAULT 0,   -- flat fee per application
    total_connection_fee  NUMERIC(10,2) NOT NULL DEFAULT 0,   -- sum of all connection fees
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
-- One row per service_connection.
-- Only connection_fee here — no application_fee.
-- application_fee lives on the application batch.
-- =============================================
CREATE TABLE public.connection_fees (
    connection_fee_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id    UUID NOT NULL,
    connection_id     UUID NOT NULL UNIQUE,
    connection_fee    NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_cf_application FOREIGN KEY (application_id) REFERENCES public.connection_applications(application_id),
    CONSTRAINT fk_cf_connection  FOREIGN KEY (connection_id)  REFERENCES public.service_connections(connection_id)
);

-- =============================================
-- CONNECTION FEE PAYMENTS
-- One payment per application batch.
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


CREATE TABLE public.meters (
    meter_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id    UUID NOT NULL,
    meter_serial_no        VARCHAR(100) NOT NULL UNIQUE,
    meter_status_id  UUID NOT NULL,
    installation_date     TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_meter_connection FOREIGN KEY (connection_id)
        REFERENCES public.service_connections(connection_id),
    CONSTRAINT fk_meter_status FOREIGN KEY (meter_status_id)
        REFERENCES public.meter_status(meter_status_id)
);

-- =====================
-- SERVICE TRANSFERS
-- =====================
CREATE TABLE public.service_transfers (
    transfer_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id        UUID NOT NULL,
    transfer_type        VARCHAR(20) NOT NULL
                         CHECK (transfer_type IN ('OWNERSHIP', 'RELOCATION')),
    previous_consumer_id UUID,
    new_consumer_id      UUID,
    old_zone_id          UUID,
    new_zone_id          UUID,
    transfer_reason      TEXT,
    transferred_by       UUID NOT NULL,
    transfer_date        TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_st_connection    FOREIGN KEY (connection_id)        REFERENCES public.service_connections(connection_id),
    CONSTRAINT fk_st_prev_consumer FOREIGN KEY (previous_consumer_id) REFERENCES public.consumers(consumer_id),
    CONSTRAINT fk_st_new_consumer  FOREIGN KEY (new_consumer_id)      REFERENCES public.consumers(consumer_id),
    CONSTRAINT fk_st_old_zone      FOREIGN KEY (old_zone_id)          REFERENCES public.zone(zone_id),
    CONSTRAINT fk_st_new_zone      FOREIGN KEY (new_zone_id)          REFERENCES public.zone(zone_id),
    CONSTRAINT fk_st_user          FOREIGN KEY (transferred_by)       REFERENCES public.users(user_id)
);


-- =====================
-- COMMUNITY CHARGES (BILLING RATE TIERS)
-- =====================
CREATE TABLE public.community_charges (
    community_charge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    classification_id   UUID NOT NULL,
    min_consumption     NUMERIC(10,2) NOT NULL,
    max_consumption     NUMERIC(10,2),           -- NULL = unbounded top block
    multiplier          NUMERIC(10,2) NOT NULL,  -- ₱ per cubic meter
    created_at          TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_cc_classification FOREIGN KEY (classification_id) REFERENCES public.classifications(classification_id)
);


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

CREATE TABLE public.job_types (
    job_type_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type_name     VARCHAR(100) NOT NULL,
    job_type_code     VARCHAR(50)  NOT NULL UNIQUE,
    -- TRUE  = consumer-facing (tied to service connection)
    --         e.g. Installation, Replacement, Disconnection, Reconnection
    -- FALSE = internal (not tied to service connection)
    --         e.g. Pipe Repair, Maintenance, Inspection
    is_consumer_job   BOOLEAN NOT NULL DEFAULT TRUE,
    skill_id          UUID,
    created_at        TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT fk_jt_skill FOREIGN KEY (skill_id) REFERENCES public.skills(skill_id)
);



-- =====================
-- JOB ORDER STATUS
-- Seed: pending | assigned | in_progress | completed | cancelled
-- =====================
CREATE TABLE public.job_order_status (
    job_status_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_status_name VARCHAR(50) NOT NULL UNIQUE,
    description     TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);


-- =====================
-- JOB ORDERS
-- One JO → one service (service_id replaces old jo_type + junction table).
-- App reads service.service_code on JO completion to fire status transitions.
-- connection_id is NULL for internal JOs with no linked consumer connection.
-- =====================
CREATE TABLE public.job_orders (
    job_order_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_order_no      VARCHAR(30) UNIQUE,
    job_type_id        UUID NOT NULL,
    barangay_id       UUID NOT NULL, 
    job_status_id     UUID NOT NULL,
    created_by        UUID NOT NULL,
    completion_date   TIMESTAMPTZ,
    request_date      TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_job_types  FOREIGN KEY (job_type_id)    REFERENCES public.job_types(job_type_id),
    CONSTRAINT fk_jo_barangay FOREIGN KEY (barangay_id)   REFERENCES public.barangays(barangay_id), -- Assuming your table name
    CONSTRAINT fk_jo_status   FOREIGN KEY (job_status_id) REFERENCES public.job_order_status(job_status_id),
    CONSTRAINT fk_jo_creator  FOREIGN KEY (created_by)    REFERENCES public.users(user_id)
);

CREATE TABLE public.jo_request_status (
    request_status_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status_code       VARCHAR(30) UNIQUE NOT NULL, -- 'Pending', 'Completed', 'Cancelled'
    description       TEXT                         
);

-- 2. POPULATE THE SPECIFIC OUTCOMES
INSERT INTO public.job_request_statuses (status_code, description) VALUES
('Pending', 'Work has not started at this property yet.'),
('Completed', 'Task executed successfully by the field team.'),
('Cancelled', 'Task was skipped or cancelled due to field issues.');

CREATE TABLE public.job_order_request (
    jo_request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_order_id  UUID REFERENCES public.job_orders(job_order_id) ON DELETE CASCADE,
    connection_id UUID REFERENCES public.service_connections(connection_id),
    request_status_id UUID NOT NULL,
    completed_at  TIMESTAMPTZ,
    CONSTRAINT fk_jor_request_status 
        FOREIGN KEY (request_status_id) REFERENCES public.jo_request_status(request_status_id),
        
    UNIQUE (job_order_id, connection_id)
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
-- JOB ASSIGNMENT HELPERS (additional plumbers on same JO)
-- =====================
CREATE TABLE public.job_assignment_helper (
    assignment_helper_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_assignment_id    UUID NOT NULL,
    helper_id            UUID NOT NULL,
    CONSTRAINT fk_jah_assignment FOREIGN KEY (job_assignment_id) REFERENCES public.job_assignments(job_assignment_id),
    CONSTRAINT fk_jah_helper     FOREIGN KEY (helper_id)         REFERENCES public.users(user_id),
    UNIQUE (job_assignment_id, helper_id)
);


CREATE TABLE public.payment_type (
    payment_type_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_type_name VARCHAR(50) NOT NULL UNIQUE,
    description       TEXT,
    created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.payments (
    payment_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_number  VARCHAR(50)   NOT NULL UNIQUE,   -- OR-YYYY-XXXXX, system-wide unique
    payment_type_id UUID          NOT NULL,
    payment_date    DATE          NOT NULL DEFAULT CURRENT_DATE,
    recieved_by     UUID          NOT NULL,           -- treasurer / cashier user_id
    created_at      TIMESTAMPTZ   DEFAULT now(),
    CONSTRAINT fk_receipt_type     FOREIGN KEY (payment_type_id) REFERENCES public.payment_type(payment_type_id),
    CONSTRAINT fk_receipt_recorder FOREIGN KEY (recorded_by)     REFERENCES public.users(user_id)
);

-- =====================================================================
-- DISCONNECTION FLOW
-- =====================================================================

CREATE TABLE public.disconnection_rules (
    rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    min_balance NUMERIC(10,2),   -- e.g. 2000.00
    min_unpaid_months INT,       -- e.g. 2 or 3
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =========================================================================
-- 1. DISCONNECTION BATCH HEADER
-- =========================================================================
CREATE TABLE public.notice_of_disconnection (
    notice_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notice_no         VARCHAR(50) UNIQUE NOT NULL, -- e.g., 'NOD-202606-001'
    rule_id           UUID,
    
    -- ◄ FIX: Anchors this batch to the active monthly billing cycle (e.g., '2026-06-01')
    reading_period    DATE NOT NULL, 
    
    generated_by      UUID REFERENCES public.users(user_id),
    total_accounts    INT DEFAULT 0, 
    generated_at      TIMESTAMPTZ DEFAULT now(),
    
    CONSTRAINT fk_nod_rule
        FOREIGN KEY (rule_id)
        REFERENCES public.disconnection_rules(rule_id),
        
    -- Prevents generating duplicate enforcement runs for the same month using the same rule
    CONSTRAINT uq_one_nod_run_per_period UNIQUE (reading_period, rule_id)
);

-- =========================================================================
-- 2. DISCONNECTION TARGET LIST (Junction Table)
-- =========================================================================
CREATE TABLE public.notice_service_connections (
    notice_sc_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notice_id        UUID NOT NULL,
    connection_id    UUID NOT NULL,
    
    -- ◄ NEW CRITICAL LINK: Connects the notice to the actual offending statement/invoice
    billing_id       UUID NOT NULL, 
    
    balance_snapshot NUMERIC(10,2), -- Historical snapshot of debt at generation time
    months_unpaid    INT,           -- e.g., 2 or 3 months overdue
    created_at       TIMESTAMPTZ DEFAULT now(),
    
    CONSTRAINT fk_nsc_notice
        FOREIGN KEY (notice_id)
        REFERENCES public.notice_of_disconnection(notice_id) ON DELETE CASCADE,
        
    CONSTRAINT fk_nsc_connection
        FOREIGN KEY (connection_id)
        REFERENCES public.service_connections(connection_id),
        
    -- ◄ NEW FOREIGN KEY: Ensures the referenced bill is real
    CONSTRAINT fk_nsc_billing
        FOREIGN KEY (billing_id)
        REFERENCES public.billing(billing_id),
        
    -- Enforces that a specific unpaid bill cannot be put on the same notice batch twice
    UNIQUE (notice_id, connection_id, billing_id)
);

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


CREATE TABLE public.disconnections (
    disconnection_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL,
    notice_sc_id UUID NULL,
    is_voluntary BOOLEAN NOT NULL DEFAULT FALSE,
    disconnection_status_id UUID NOT NULL,
    requested_date DATE NOT NULL DEFAULT CURRENT_DATE,
    disconnected_at TIMESTAMPTZ,
    processed_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_dis_connection
        FOREIGN KEY (connection_id)
        REFERENCES public.service_connections(connection_id),
    CONSTRAINT fk_dis_notice
        FOREIGN KEY (notice_sc_id)
        REFERENCES public.notice_service_connections(notice_sc_id),
    CONSTRAINT fk_dis_status
        FOREIGN KEY (disconnection_status_id)
        REFERENCES public.disconnection_status(disconnection_status_id),
    CONSTRAINT fk_dis_user
        FOREIGN KEY (processed_by)
        REFERENCES public.users(user_id)
);


CREATE TABLE public.reconnection_status (
    reconnection_status_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status_name VARCHAR(30) NOT NULL UNIQUE,
    description TEXT
);

INSERT INTO public.reconnection_status (status_name, description)
VALUES
('Pending Payment', 'Waiting for customer to complete payment'),
('Pending Reconnection', 'Payment completed and waiting for service reconnection'),
('Reconnected', 'Service has been restored'),
('Cancelled', 'Reconnection request cancelled');

CREATE TABLE public.reconnections (
    reconnection_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconnection_no VARCHAR(50) NOT NULL UNIQUE,
    disconnection_id UUID NOT NULL,
    outstanding_balance NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    remaining_balance NUMERIC(10,2) NOT NULL DEFAULT 0,
    payment_status_id UUID NOT NULL,
    reconnection_status_id UUID NOT NULL,
    processed_by UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT fk_rec_disconnection
        FOREIGN KEY (disconnection_id)
        REFERENCES public.disconnections(disconnection_id),
    CONSTRAINT fk_rec_payment_status
        FOREIGN KEY (payment_status_id)
        REFERENCES public.billing_status(billing_status_id),
    CONSTRAINT fk_rec_status
        FOREIGN KEY (reconnection_status_id)
        REFERENCES public.reconnection_status(reconnection_status_id),
    CONSTRAINT fk_rec_user
        FOREIGN KEY (processed_by)
        REFERENCES public.users(user_id)
);

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

CREATE TABLE public.reconnection_charges (
    reconnection_charge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconnection_id UUID NOT NULL,
    charge_type_id UUID NOT NULL,
    amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_rc_reconnection
        FOREIGN KEY (reconnection_id)
        REFERENCES public.reconnections(reconnection_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_rc_charge_type
        FOREIGN KEY (charge_type_id)
        REFERENCES public.reconnection_charge_types(charge_type_id)
);

-- One row per payment made toward a reconnection (supports partial)
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



INSERT INTO public.meter_reading_status (status_code, description) VALUES
('RECORDED', 'The meter digits were successfully captured and saved under normal field conditions.'),
('DEFECTIVE', 'The meter hardware is broken. No digits could be recorded; awaiting supervisor average estimation.'),

-- ==========================================
-- 1. METER READING STATUS LOOKUP
-- ==========================================
CREATE TABLE public.meter_reading_status (
    reading_status_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status_code         VARCHAR(30) NOT NULL UNIQUE, -- 'SUCCESS', 'DEFECTIVE',
    description         TEXT,
    created_at          TIMESTAMPTZ DEFAULT now()
);

-- =========================================================================
-- 2. METER READINGS LAYER (Raw Field Collections)
-- =========================================================================

CREATE TABLE public.meter_readings (
    reading_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Tracks the specific billing month context (e.g., '2026-05-01')
    reading_period      DATE NOT NULL, 
    connection_id       UUID NOT NULL REFERENCES public.service_connections(connection_id),
    meter_id            UUID NOT NULL REFERENCES public.meter(meter_id),
    meter_reader_id     UUID REFERENCES public.users(user_id),
    present_reading     NUMERIC(10,2), 
    reading_date        TIMESTAMPTZ,   -- Physical clock time of entry
    created_at          TIMESTAMPTZ DEFAULT now(),
    -- Enforces your single-submission guardrail per monthly window
    CONSTRAINT uq_one_reading_per_period UNIQUE (connection_id, reading_period)
);



CREATE TABLE public.reading_issues (
    issue_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_name  VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.meter_reading_report (
    reading_report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reading_id        UUID         NOT NULL UNIQUE,
    issue_id          UUID         NOT NULL,
    report_description TEXT,
    report_status_id  UUID         NOT NULL,    
    report_by         UUID         NOT NULL,
    approved_by       UUID,
    approved_at       TIMESTAMPTZ,
    resolved_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ  DEFAULT now(),
    updated_at        TIMESTAMPTZ  DEFAULT now(),
    CONSTRAINT fk_mrr_reading   FOREIGN KEY (reading_id)       REFERENCES public.meter_readings(reading_id) ON DELETE CASCADE,
    CONSTRAINT fk_mrr_issue     FOREIGN KEY (issue_id)         REFERENCES public.reading_issues(issue_id),
    CONSTRAINT fk_mrr_status    FOREIGN KEY (report_status_id) REFERENCES public.bulk_status(status_id),
    CONSTRAINT fk_mrr_report_by FOREIGN KEY (report_by)        REFERENCES public.users(user_id),
    CONSTRAINT fk_mrr_approver  FOREIGN KEY (approved_by)      REFERENCES public.users(user_id)
);


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
    CONSTRAINT fk_mra_reading
        FOREIGN KEY (reading_id)
        REFERENCES public.meter_readings(reading_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_mra_requester
        FOREIGN KEY (requested_by)
        REFERENCES public.users(user_id),

    CONSTRAINT fk_mra_approver
        FOREIGN KEY (approved_by)
        REFERENCES public.users(user_id),

    CONSTRAINT fk_mra_status
        FOREIGN KEY (status_id)
        REFERENCES public.bulk_status(status_id)
);


-- =====================
-- WATER CONSUMPTIONS
-- Stores actual consumption per billing period per connection.
-- For DEFECTIVE connections, a row is still inserted using the ESTIMATED
-- =====================
CREATE TABLE public.water_consumptions (
    consumption_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id    UUID          NOT NULL,
    reading_id       UUID,                       -- NULL for non-metered connections
    previous_reading NUMERIC(10,2) NOT NULL,
    present_reading  NUMERIC(10,2) NOT NULL,
    consumption      NUMERIC(10,2) NOT NULL,
    created_at       TIMESTAMPTZ   DEFAULT now(),
    CONSTRAINT fk_wc_connection FOREIGN KEY (connection_id) REFERENCES public.service_connections(connection_id),
    CONSTRAINT fk_wc_reading    FOREIGN KEY (reading_id)    REFERENCES public.meter_readings(reading_id)
);


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
-- Seed: unpaid | partial | paid | forwarded
-- 'forwarded' = prior balance carried into a newer billing period
-- 'overdue' is NOT a status — use billing.was_overdue flag instead.
-- =====================
CREATE TABLE public.billing_status (
    billing_status_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    billing_status_name VARCHAR(50) NOT NULL UNIQUE,
    description         TEXT,
    created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.billing (
    billing_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id       UUID NOT NULL REFERENCES public.service_connections(connection_id),
    consumer_id         UUID NOT NULL REFERENCES public.consumers(consumer_id),
    consumption_id      UUID NOT NULL UNIQUE REFERENCES public.water_consumptions(consumption_id),
    
    reading_period      DATE NOT NULL,
    due_date            DATE NOT NULL,
    was_overdue         BOOLEAN DEFAULT FALSE,
    
    current_billing     NUMERIC(10,2) NOT NULL, -- Total calculated purely from water usage breakdowns
    penalty_amount      NUMERIC(10,2) DEFAULT 0,  -- Arrears fees injected late
    previous_balance    NUMERIC(10,2) DEFAULT 0,  -- Historic rolled debts
    total_billing       NUMERIC(10,2) NOT NULL, -- ($Current + Penalty + Previous$)
    remaining_balance   NUMERIC(10,2) DEFAULT 0,  -- Decreases dynamically as payments post
    
    billing_status_id   UUID NOT NULL REFERENCES public.billing_status(billing_status_id),
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),
    
    CONSTRAINT uq_billing_per_period UNIQUE (connection_id, reading_period)
);

CREATE TABLE public.billing_payments (
    billing_payment_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    billing_id   UUID          NOT NULL,
    payment_id   UUID          NOT NULL UNIQUE,
    amount_paid               NUMERIC(10,2) NOT NULL,
    created_at   TIMESTAMPTZ   DEFAULT now(),
    CONSTRAINT fk_bp_billing FOREIGN KEY (billing_id) REFERENCES public.billing(billing_id),
    CONSTRAINT fk_bp_payment FOREIGN KEY (payment_id) REFERENCES public.payments(payment_id)
);

CREATE TABLE public.payment_adjustments (
    adjustment_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    billing_payment_id           UUID          NOT NULL,
    requested_by         UUID          NOT NULL,
    approved_by          UUID,
    original_amount NUMERIC(10,2) NOT NULL,
    adjusted_amount NUMERIC(10,2) NOT NULL,
    adjustment_status_id UUID,
    reason               TEXT,
    requested_at           TIMESTAMPTZ   DEFAULT now(),
    approved_at          TIMESTAMPTZ,
    CONSTRAINT fk_pa_biling_payment   FOREIGN KEY (billing_payment_id)           REFERENCES public.billing_payments(billing_payment_id),
    CONSTRAINT fk_pa_requester FOREIGN KEY (requested_by)         REFERENCES public.users(user_id),
    CONSTRAINT fk_pa_approver  FOREIGN KEY (approved_by)          REFERENCES public.users(user_id),
    CONSTRAINT fk_pa_status    FOREIGN KEY (adjustment_status_id) REFERENCES public.bulk_status(status_id)
);

CREATE TABLE public.penalty_rate (
    penalty_rate_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    penalty_rate    NUMERIC(5,2) NOT NULL,  -- e.g. 2.00 = 2%
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.non_meter_consumption (
    non_meter_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fixed_consumption NUMERIC(10,2) NOT NULL,
    created_at        TIMESTAMPTZ DEFAULT now()
);

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

CREATE TABLE public.meter_installments (
    installment_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id     UUID          NOT NULL,
    job_order_id      UUID,
    total_cost        NUMERIC(10,2) NOT NULL,
    monthly_amount    NUMERIC(10,2) NOT NULL,
    total_months      INT           NOT NULL,
    remaining_balance NUMERIC(10,2) NOT NULL,
    status            BOOLEAN       DEFAULT TRUE,  -- TRUE = active, FALSE = completed
    created_at        TIMESTAMPTZ   DEFAULT now(),
    CONSTRAINT fk_mi_connection FOREIGN KEY (connection_id) REFERENCES public.service_connections(connection_id),
    CONSTRAINT fk_mi_jo         FOREIGN KEY (job_order_id)  REFERENCES public.job_orders(job_order_id)
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

