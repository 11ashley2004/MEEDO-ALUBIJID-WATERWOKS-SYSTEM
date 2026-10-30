-- =====================================================================
-- RATE LIMIT FUNCTION (unchanged logic — already does what you described)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.check_and_increment_rate_limit(
  p_scope                 TEXT,
  p_identifier             TEXT,
  p_action_name            TEXT,
  p_max_attempts           INT,
  p_window_minutes         INT,
  p_base_block_minutes     INT,
  p_max_block_minutes      INT DEFAULT 1440
) RETURNS TABLE(allowed BOOLEAN, retry_after_seconds INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row               public.rate_limits%ROWTYPE;
  v_now                TIMESTAMPTZ := now();
  v_action_id          UUID;
  v_default_id         UUID;
  v_blocked_id         UUID;
  v_status_name        TEXT;
  v_effective_lockouts INT;
  v_block_minutes      INT;
  v_block_just_expired BOOLEAN;
BEGIN
  SELECT rate_limit_action_id INTO v_action_id
    FROM public.rate_limit_actions WHERE action_name = p_action_name;

  IF v_action_id IS NULL THEN
    RAISE EXCEPTION 'Unknown rate limit action: %', p_action_name;
  END IF;

  SELECT rate_limit_status_id INTO v_default_id
    FROM public.rate_limit_statuses WHERE status_name = 'default';
  SELECT rate_limit_status_id INTO v_blocked_id
    FROM public.rate_limit_statuses WHERE status_name = 'blocked';

  IF v_default_id IS NULL OR v_blocked_id IS NULL THEN
    RAISE EXCEPTION 'Missing "default" or "blocked" row in rate_limit_statuses';
  END IF;

  SELECT rl.* INTO v_row
    FROM public.rate_limits rl
    WHERE rl.scope = p_scope AND rl.identifier = p_identifier AND rl.rate_limit_action_id = v_action_id
    FOR UPDATE;

  IF FOUND THEN
    SELECT status_name INTO v_status_name FROM public.rate_limit_statuses
      WHERE rate_limit_status_id = v_row.rate_limit_status_id;
  END IF;

  -- ── Manual admin block: status='blocked' + override_by set → governed by override_expires_at ──
  IF FOUND AND v_status_name = 'blocked' AND v_row.override_by IS NOT NULL
     AND (v_row.override_expires_at IS NULL OR v_row.override_expires_at > v_now) THEN
    RETURN QUERY SELECT false, 0;
    RETURN;
  END IF;

  -- ── Admin unrestricted: always allowed, no counting ───────────────────────
  IF FOUND AND v_status_name = 'unrestricted' THEN
    UPDATE public.rate_limits
      SET attempts = COALESCE(v_row.attempts, 0) + 1, updated_at = v_now
      WHERE rate_limit_id = v_row.rate_limit_id;
    RETURN QUERY SELECT true, 0;
    RETURN;
  END IF;

  -- ── Automatic lockout: status='blocked' + override_by NULL → governed by blocked_until ──
  IF FOUND AND v_status_name = 'blocked' AND v_row.override_by IS NULL
     AND v_row.blocked_until IS NOT NULL AND v_row.blocked_until > v_now THEN
    RETURN QUERY SELECT false, CEIL(EXTRACT(EPOCH FROM (v_row.blocked_until - v_now)))::INT;
    RETURN;
  END IF;

  -- Did an automatic block just expire? If so, the block itself WAS the
  -- penalty — flip status back to 'default' and start clean rather than
  -- carrying stale attempts into a window that hasn't naturally expired.
  v_block_just_expired := FOUND AND v_status_name = 'blocked' AND v_row.override_by IS NULL
                           AND v_row.blocked_until IS NOT NULL AND v_row.blocked_until <= v_now;

  -- ── Decay: if last update was over 24h ago, forgive past lockouts ────────
  v_effective_lockouts := CASE
    WHEN FOUND AND v_now - v_row.updated_at > INTERVAL '24 hours' THEN 0
    WHEN FOUND THEN v_row.lockout_count
    ELSE 0
  END;

  -- ── Fresh window: new identifier, window naturally expired, OR auto-block just served ──
  IF NOT FOUND
     OR (v_now - v_row.window_start) > (p_window_minutes || ' minutes')::INTERVAL
     OR v_block_just_expired
  THEN
    INSERT INTO public.rate_limits (scope, identifier, rate_limit_action_id, attempts, window_start, blocked_until, lockout_count, rate_limit_status_id, updated_at)
    VALUES (p_scope, p_identifier, v_action_id, 1, v_now, NULL, v_effective_lockouts, v_default_id, v_now)
    ON CONFLICT (scope, identifier, rate_limit_action_id)
    DO UPDATE SET attempts = 1, window_start = v_now, blocked_until = NULL,
                  lockout_count = v_effective_lockouts,
                  rate_limit_status_id = CASE
                    -- expired manual block also reverts to default here
                    WHEN v_status_name = 'blocked' AND v_row.override_by IS NOT NULL
                     AND v_row.override_expires_at IS NOT NULL
                     AND v_row.override_expires_at <= v_now
                    THEN v_default_id
                    WHEN v_block_just_expired THEN v_default_id
                    ELSE public.rate_limits.rate_limit_status_id
                  END,
                  override_by = CASE WHEN v_block_just_expired THEN NULL ELSE public.rate_limits.override_by END,
                  updated_at = v_now;
    RETURN QUERY SELECT true, 0;
    RETURN;
  END IF;

  -- ── Over the limit → escalating automatic lockout, status flips to 'blocked' ──
  IF v_row.attempts + 1 > p_max_attempts THEN
    v_block_minutes := LEAST(p_base_block_minutes * POWER(2, v_effective_lockouts), p_max_block_minutes)::INT;
    UPDATE public.rate_limits
      SET attempts = v_row.attempts + 1,
          lockout_count = v_effective_lockouts + 1,
          blocked_until = v_now + (v_block_minutes || ' minutes')::INTERVAL,
          rate_limit_status_id = v_blocked_id,   -- ← now visible in the status column
          updated_at = v_now
      WHERE rate_limit_id = v_row.rate_limit_id;
    RETURN QUERY SELECT false, v_block_minutes * 60;
    RETURN;
  END IF;

  -- ── Under the limit → increment and allow ─────────────────────────────────
  UPDATE public.rate_limits
    SET attempts = v_row.attempts + 1, updated_at = v_now
    WHERE rate_limit_id = v_row.rate_limit_id;
  RETURN QUERY SELECT true, 0;
END;
$$;


-- =====================
-- RATE LIMIT ACTIONS
-- =====================
CREATE TABLE public.rate_limit_actions (
    rate_limit_action_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_name             VARCHAR(50) NOT NULL UNIQUE,
    description              TEXT,
    created_at               TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.rate_limit_actions (action_name, description) VALUES
  ('password_reset_otp',      'OTP sent for password reset flow'),
  ('login_otp',                 'OTP sent for login verification'),
  ('email_verification_otp',    'OTP sent to verify a new email address'),
  ('phone_verification_otp',    'OTP sent to verify a phone number'),
   ('account_setup_otp', 'OTP sent to verify email + set password on first login (admin-created accounts)'),
     ('login_attempt', 'Login attempts, rate limited per email to stop brute-force password guessing'),
  ('email_code',                'Verification/login code sent by email — capped at 3 sends');
  -- ↑ new action. If this is really the same flow as 'email_verification_otp',
  --   skip adding a row and just call the function with that action name
  --   and p_max_attempts := 3 instead — don't double-track the same thing.

-- =====================
-- RATE LIMIT STATUSES
-- =====================
CREATE TABLE public.rate_limit_statuses (
    rate_limit_status_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status_name             VARCHAR(50) NOT NULL UNIQUE,
    description              TEXT,
    created_at               TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.rate_limit_statuses (status_name, description) VALUES
  ('default',    'No manual restriction; normal rate limit rules apply (auto lockouts via blocked_until still enforced)'),
  ('blocked',      'Manually blocked by an admin; denied until admin unblocks (or override_expires_at passes)'),
  ('unrestricted', 'Manually exempted by an admin; always allowed, no counting');

-- =====================
-- RATE LIMITS
-- FIXED: table now matches what the function actually queries/writes
-- (scope + identifier), not the old ip-only column.
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

CREATE INDEX idx_rate_limits_scope_identifier_action
  ON public.rate_limits (scope, identifier, rate_limit_action_id);


-- =====================
-- DISPLAY VIEW: shows IP and Email as their own columns
-- =====================
-- The underlying table stays generic (scope + identifier) so it works for
-- any future scope (user_id, phone, etc.) without a schema change. This
-- view just pivots that out into readable columns for dashboards/admin
-- queries — it's read-only, nothing writes to it.
CREATE OR REPLACE VIEW public.rate_limits_display AS
SELECT
    rl.rate_limit_id,
    CASE WHEN rl.scope = 'ip'    THEN rl.identifier END AS ip,
    CASE WHEN rl.scope = 'email' THEN rl.identifier END AS email,
    rl.scope,
    ra.action_name,
    rs.status_name,
    rl.attempts,
    rl.window_start,
    rl.blocked_until,
    rl.lockout_count,
    rl.override_note,
    rl.override_by,
    rl.override_at,
    rl.override_expires_at,
    rl.updated_at
FROM public.rate_limits rl
JOIN public.rate_limit_actions ra ON ra.rate_limit_action_id = rl.rate_limit_action_id
JOIN public.rate_limit_statuses rs ON rs.rate_limit_status_id = rl.rate_limit_status_id;

-- Example:
-- SELECT ip, email, action_name, status_name, attempts, blocked_until
--   FROM public.rate_limits_display
--   WHERE status_name = 'blocked'
--   ORDER BY updated_at DESC;


-- =====================
-- EXAMPLE: sending an email code, capped at 3 per window
-- =====================
-- Assumption: "3 times" means 3 sends per rolling window, then an
-- escalating lockout — same pattern as your other actions. I used a
-- 60-minute window and a 15-minute base block below; swap these for
-- whatever window/block duration you actually want.
--
-- SELECT * FROM public.check_and_increment_rate_limit(
--   p_scope             => 'email',
--   p_identifier        => lower(trim(:email)),   -- normalize the email
--   p_action_name       => 'email_code',
--   p_max_attempts      => 3,
--   p_window_minutes    => 60,
--   p_base_block_minutes=> 15,
--   p_max_block_minutes => 1440
-- );
--
-- allowed = true  → go ahead and send the code
-- allowed = false → do NOT send; retry_after_seconds tells you how long to wait