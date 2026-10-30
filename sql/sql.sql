-- =====================
-- NOTIFICATION TEMPLATES
-- =====================
CREATE TABLE public.notification_templates (
    template_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_code      VARCHAR(50) UNIQUE NOT NULL, 
    title_template  VARCHAR(150) NOT NULL,
    body_template   TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.notification_templates (event_code, title_template, body_template) VALUES
  ('METER_READING_ADJUSTED_PENDING',  'Reading Adjustment Submitted',  'A reading adjustment for {meter_serial_no} is pending review.'),
  ('METER_READING_ADJUSTED_APPROVED', 'Reading Adjustment Approved',   '{meter_serial_no} reading updated to {new_reading}.'),
  ('METER_READING_ADJUSTED_REJECTED', 'Reading Adjustment Rejected',   'The reading adjustment for {meter_serial_no} was rejected.'),
  ('PAYMENT_ADJUSTMENT_PENDING',      'Payment Adjustment Submitted',  'A payment adjustment for {meter_serial_no} is pending review.'),
  ('PAYMENT_ADJUSTMENT_APPLIED',      'Payment Adjustment Applied',    'Payment for {meter_serial_no} adjusted to {amount}.'),
  ('PAYMENT_ADJUSTMENT_REJECTED',     'Payment Adjustment Rejected',   'The payment adjustment for {meter_serial_no} was rejected.'),
  ('JOB_ASSIGNMENT_CREATED',          'New Job Assignment',            'You have a new job assignment.'),
  ('JOB_ASSIGNMENT_UPDATED',          'Job Assignment Updated',        'A job assignment you''re on was updated.'),
  ('NOTICE_OF_DISCONNECTION',         'Notice of Disconnection',       'Your account ({meter_serial_no}) has an outstanding balance of {balance}. Please settle within the notice period to avoid disconnection. Notice: {notice_no}.'),
  ('SERVICE_DISCONNECTED',            'Service Disconnected',          'Water service for meter {meter_serial_no} has been disconnected. Please settle your account and request reconnection.')
ON CONFLICT (event_code) DO NOTHING;

-- =====================
-- USER NOTIFICATIONS
-- =====================
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
    reference_id      UUID NULL,                            -- Polymorphic ID (e.g., job_order_id, issue_report_id)
    created_at        TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT fk_un_user FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_un_meter_account FOREIGN KEY (meter_account_id) REFERENCES public.meter_accounts(meter_account_id) ON DELETE CASCADE,
    CONSTRAINT fk_un_event_code FOREIGN KEY (event_code) REFERENCES public.notification_templates(event_code) ON DELETE CASCADE
);