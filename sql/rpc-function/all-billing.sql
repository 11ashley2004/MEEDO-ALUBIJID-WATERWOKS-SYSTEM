CREATE OR REPLACE FUNCTION public.get_billing_records(
    p_reading_period_id UUID DEFAULT NULL,
    p_meter_account_id  UUID DEFAULT NULL,
    p_billing_id        UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'billing_id',        b.billing_id,
                'consumer_id',       b.consumer_id,
                'reading_period_id', b.reading_period_id,
                'period_start',      rp.period_start,
                'period_end',        rp.period_end,
                'due_date',          rp.due_date,
                'current_billing',   b.current_billing,
                'previous_balance',  COALESCE(b.previous_balance, 0),
                'penalty_amount',    COALESCE(b.penalty_amount, 0),
                'total_billing',     b.total_billing,
                'remaining_balance', b.remaining_balance,
                'meter_charge',      COALESCE(mc.total_charge, 0),
                'is_non_metered',    (wc.reading_id IS NULL),
                'meter_serial_no',   ms.meter_serial_no,

                'reading_date',      mr.reading_date,

                'meter_reader',
                    CASE WHEN u.user_id IS NOT NULL THEN
                        jsonb_build_object(
                            'user_id', u.user_id,
                            'name', trim(concat(u.first_name, ' ', u.last_name))
                        )
                    ELSE NULL END,

                'reading_status',
                    CASE WHEN rs.reading_status_id IS NOT NULL THEN
                        jsonb_build_object(
                            'reading_status_id', rs.reading_status_id,
                            'status_code', rs.status_code
                        )
                    ELSE NULL END,

                'billing_status', jsonb_build_object(
                    'billing_status_id',   bs.billing_status_id,
                    'billing_status_name', bs.billing_status_name
                ),

                'meter_account', jsonb_build_object(
                    'meter_account_id', ma.meter_account_id,
                    'meter_serial_no', (
                        SELECT m.meter_serial_no
                        FROM public.meters m
                        WHERE m.meter_account_id = ma.meter_account_id
                        ORDER BY m.created_at DESC
                        LIMIT 1
                    ),
                    'consumer', jsonb_build_object(
                        'consumer_id',    c.consumer_id,
                        'contract_no', c.contract_no,
                        'account_name',   c.account_name,
                        'email',          c.email,
                        'contact_number', c.contact_number
                    ),
                    'zone', jsonb_build_object(
                        'zone_id',   z.zone_id,
                        'zone_name', z.zone_name,
                        'barangay', jsonb_build_object(
                            'barangay_id',   br.barangay_id,
                            'barangay_name', br.barangay_name
                        )
                    ),
                    'classification', jsonb_build_object(
                        'classification_id',   cl.classification_id,
                        'classification_name', cl.classification_name
                    )
                ),

                'consumption', jsonb_build_object(
                    'consumption_id',      wc.consumption_id,
                    'previous_reading',    wc.previous_reading,
                    'present_reading',     wc.present_reading,
                    'consumption',         wc.consumption,
                    'billed_consumption',  wc.billed_consumption,
                    'reading_id',          wc.reading_id
                ),

                'breakdowns', COALESCE(bd.breakdowns, '[]'::jsonb)
            )
            ORDER BY rp.period_start DESC, b.created_at DESC
        ),
        '[]'::jsonb
    )
    FROM public.billing b
    JOIN public.reading_periods    rp ON rp.reading_period_id = b.reading_period_id
    JOIN public.billing_status     bs ON bs.billing_status_id = b.billing_status_id
    JOIN public.meter_accounts     ma ON ma.meter_account_id  = b.meter_account_id
    JOIN public.zone               z  ON z.zone_id            = ma.zone_id
    JOIN public.barangay           br ON br.barangay_id       = z.barangay_id
    JOIN public.classifications    cl ON cl.classification_id = ma.classification_id
    JOIN public.consumers          c  ON c.consumer_id        = b.consumer_id
    JOIN public.water_consumptions wc ON wc.consumption_id    = b.consumption_id
    LEFT JOIN public.meter_readings       mr ON mr.reading_id        = wc.reading_id
    LEFT JOIN public.meter_reading_status rs ON rs.reading_status_id = mr.reading_status_id
    LEFT JOIN public.users                u  ON u.user_id            = mr.meter_reader_id

    LEFT JOIN LATERAL (
        SELECT m.meter_serial_no
        FROM public.meters m
        WHERE m.meter_account_id = ma.meter_account_id
        ORDER BY m.created_at DESC
        LIMIT 1
    ) ms ON true

    LEFT JOIN LATERAL (
        SELECT SUM(mic.amount) AS total_charge
        FROM public.meter_installment_charges mic
        WHERE mic.billing_id = b.billing_id
    ) mc ON true

    LEFT JOIN LATERAL (
        SELECT jsonb_agg(
            jsonb_build_object(
                'community_charge_id', t.community_charge_id,
                'block_order',         t.block_order,
                'min_consumption',     t.min_consumption,
                'max_consumption',     t.max_consumption,
                'rate_per_unit',       t.multiplier,
                'units_used',          COALESCE(bcb.units_used, 0),
                'subtotal',            COALESCE(bcb.subtotal, 0),
                'reached',             (bcb.consumption_id IS NOT NULL)
            )
            ORDER BY t.min_consumption
        ) AS breakdowns
        FROM (
            SELECT
                cc.community_charge_id,
                cc.min_consumption,
                cc.max_consumption,
                cc.multiplier,
                ROW_NUMBER() OVER (ORDER BY cc.min_consumption) AS block_order
            FROM public.community_charges cc
            WHERE cc.classification_id = ma.classification_id
        ) t
        LEFT JOIN public.billing_community_breakdowns bcb
            ON bcb.consumption_id = wc.consumption_id
           AND bcb.community_charge_id = t.community_charge_id
    ) bd ON true

    WHERE (p_reading_period_id IS NULL OR b.reading_period_id = p_reading_period_id)
      AND (p_meter_account_id  IS NULL OR b.meter_account_id  = p_meter_account_id)
      AND (p_billing_id        IS NULL OR b.billing_id        = p_billing_id)
$$;

-- Drop the old 2-arg signature so PostgREST's schema cache doesn't keep
-- offering it as a conflicting overload, then grant on the new one.
DROP FUNCTION IF EXISTS public.get_billing_records(UUID, UUID);

GRANT EXECUTE ON FUNCTION public.get_billing_records(UUID, UUID, UUID) TO authenticated;