-- Allow clerk leak bill adjustments to set billed_consumption ≠ actual
-- consumption by tagging the row with billing_basis LEAK_ADJUSTED.
-- (chk_billed_consumption_basis already allows diverge when basis IS NOT NULL.)

INSERT INTO public.billing_basis (basis_code, description) VALUES
    ('LEAK_ADJUSTED', 'Clerk reduced billed m³ after a confirmed Leak After Meter inspection')
ON CONFLICT (basis_code) DO NOTHING;
