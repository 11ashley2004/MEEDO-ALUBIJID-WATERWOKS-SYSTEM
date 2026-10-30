-- =====================
-- CONSUMER CREDIT BALANCE (running total per meter account)
-- =====================
CREATE TABLE public.consumer_credit_balances (
    meter_account_id UUID PRIMARY KEY
        REFERENCES public.meter_accounts(meter_account_id),
    credit_balance   NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (credit_balance >= 0),
    updated_at       TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- CREDIT TRANSACTION TYPES
-- =====================
CREATE TABLE public.credit_transaction_types (
    credit_transaction_type_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type_code   VARCHAR(30) NOT NULL UNIQUE, -- 'ADVANCE_PAYMENT', 'OVERPAYMENT', 'APPLIED', 'REFUND', 'ADJUSTMENT'
    description TEXT
);

-- =====================
-- CONSUMER CREDIT TRANSACTIONS (audit ledger)
-- =====================
CREATE TABLE public.consumer_credit_transactions (
    credit_transaction_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meter_account_id           UUID NOT NULL
        REFERENCES public.meter_accounts(meter_account_id),
    credit_transaction_type_id UUID NOT NULL
        REFERENCES public.credit_transaction_types(credit_transaction_type_id),
    amount                     NUMERIC(10,2) NOT NULL, -- positive = credit added, negative = credit consumed/refunded
    balance_after              NUMERIC(10,2) NOT NULL, -- running balance snapshot, for audit
    payment_id                 UUID
        REFERENCES public.payments(payment_id),   -- set when money came in (deposit/overpayment)
    billing_id                 UUID
        REFERENCES public.billing(billing_id),     -- set when credit was applied to a bill
    processed_by               UUID NOT NULL
        REFERENCES public.users(user_id),
    remarks                    TEXT,
    created_at                 TIMESTAMPTZ DEFAULT now()
);