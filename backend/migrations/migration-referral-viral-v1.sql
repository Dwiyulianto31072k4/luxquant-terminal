-- Referral viral loop v1 — additive, zero-downtime.
-- signup_count: referees who applied the code (distinct from times_used = paid).
-- qualified_at: referee met the activation bar (2 of 3 signals in 7 days).
-- reward_days_granted: access days granted to the referrer when this use crossed a threshold.

BEGIN;

ALTER TABLE referral_codes
  ADD COLUMN IF NOT EXISTS signup_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE referral_uses
  ADD COLUMN IF NOT EXISTS qualified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reward_days_granted INTEGER NOT NULL DEFAULT 0;

UPDATE referral_codes rc
SET signup_count = sub.n
FROM (
  SELECT referral_code_id, COUNT(*)::int AS n
  FROM referral_uses
  GROUP BY referral_code_id
) sub
WHERE rc.id = sub.referral_code_id
  AND rc.signup_count = 0;

CREATE INDEX IF NOT EXISTS idx_referral_uses_qualified
  ON referral_uses (referrer_id, qualified_at)
  WHERE qualified_at IS NOT NULL;

COMMIT;
