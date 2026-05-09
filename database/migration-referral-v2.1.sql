-- ════════════════════════════════════════════════════════════════════
-- LuxQuant Terminal — Migration v2.1: subscription_source
-- ════════════════════════════════════════════════════════════════════
-- Date         : 2026-05-09
-- Purpose      : Tambah subscription_source biar OAuth provider switching
--                ga ngerusak role user.
-- Strategy     : Additive only, backfill data existing dengan rule sederhana.
--
-- Source values:
--   'lifetime'         → admin grant, lifetime (expires_at NULL)
--   'admin'            → admin grant, time-based (expires_at filled)
--   'payment'          → user bayar (CoinGate/manual confirmation)
--   'telegram_vip'     → role auto-set karena member VIP Telegram group
--   'discord_premium'  → role auto-set karena punya Premium role di Discord
--
-- Backfill logic:
--   - role='admin'                              → source = 'admin'
--   - role='subscriber' + subscription_granted_by IS NOT NULL → 'admin'
--   - role='subscriber' + has telegram_id       → 'telegram_vip' (assumption)
--   - role='subscriber' + has discord_id        → 'discord_premium'
--   - role='subscriber' + ada payment record    → 'payment'
--   - else (free/no role)                       → NULL
--
-- ⚠️ Backfill ini approximate. Kalau ada konflik (user punya telegram_id +
--    discord_id + payment), prioritas: payment > admin > telegram_vip > discord_premium.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════════════
-- STEP 1 — ADD COLUMN
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subscription_source VARCHAR(30);

-- Constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_subscription_source'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT chk_subscription_source
      CHECK (
        subscription_source IS NULL OR
        subscription_source IN ('lifetime', 'admin', 'payment', 'telegram_vip', 'discord_premium')
      );
  END IF;
END $$;

-- Index
CREATE INDEX IF NOT EXISTS idx_users_subscription_source
  ON users(subscription_source) WHERE subscription_source IS NOT NULL;


-- ════════════════════════════════════════════════════════════════════
-- STEP 2 — BACKFILL existing subscribers
-- ════════════════════════════════════════════════════════════════════

-- Priority 1: admin role
UPDATE users
SET subscription_source = 'admin'
WHERE role = 'admin' AND subscription_source IS NULL;

-- Priority 2: subscriber yang di-grant admin (subscription_granted_by NOT NULL)
UPDATE users u
SET subscription_source = CASE
  WHEN u.subscription_expires_at IS NULL THEN 'lifetime'
  ELSE 'admin'
END
WHERE u.role = 'subscriber'
  AND u.subscription_granted_by IS NOT NULL
  AND u.subscription_source IS NULL;

-- Priority 3: subscriber yang punya payment confirmed
UPDATE users u
SET subscription_source = 'payment'
WHERE u.role = 'subscriber'
  AND u.subscription_source IS NULL
  AND EXISTS (
    SELECT 1 FROM payments p
    WHERE p.user_id = u.id
      AND p.status IN ('confirmed', 'paid', 'completed')
  );

-- Priority 4: subscriber yang ada telegram_id (assumed telegram_vip)
UPDATE users
SET subscription_source = 'telegram_vip'
WHERE role = 'subscriber'
  AND telegram_id IS NOT NULL
  AND subscription_source IS NULL;

-- Priority 5: subscriber yang ada discord_id (assumed discord_premium)
UPDATE users
SET subscription_source = 'discord_premium'
WHERE role = 'subscriber'
  AND discord_id IS NOT NULL
  AND subscription_source IS NULL;

-- Priority 6: subscriber tanpa info apa-apa → assume admin (paling konservatif)
UPDATE users
SET subscription_source = 'admin'
WHERE role = 'subscriber'
  AND subscription_source IS NULL;


-- ════════════════════════════════════════════════════════════════════
-- STEP 3 — VERIFICATION
-- ════════════════════════════════════════════════════════════════════

\echo ''
\echo '═══════════════════════════════════════════════════════════════'
\echo 'VERIFICATION — backfill breakdown'
\echo '═══════════════════════════════════════════════════════════════'

\echo ''
\echo '── Distribution role × source ──'
SELECT 
  role,
  COALESCE(subscription_source, '(null)') AS source,
  COUNT(*) AS count
FROM users
GROUP BY role, subscription_source
ORDER BY role, subscription_source NULLS LAST;

\echo ''
\echo '── Subscribers tanpa source (HARUSNYA 0) ──'
SELECT COUNT(*) AS unsourced_subscribers
FROM users
WHERE role IN ('subscriber', 'admin') AND subscription_source IS NULL;

\echo ''
\echo '── Free/null role yg punya source (HARUSNYA 0, defensive) ──'
SELECT COUNT(*) AS free_with_source
FROM users
WHERE role = 'free' AND subscription_source IS NOT NULL;

\echo ''
\echo '═══════════════════════════════════════════════════════════════'

COMMIT;
