-- ════════════════════════════════════════════════════════════════
-- LuxQuant — Notification Duplicate Cleanup + Constraints
-- Run: psql $DATABASE_URL -f backend/scripts/fix_notification_duplicates.sql
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- ── Step 1: Preview duplicates ──
\echo '=== PREVIEW: Duplicates to be deleted ==='
SELECT user_id, type, source_type, source_id, COUNT(*) AS dup
FROM notifications
WHERE source_id IS NOT NULL
GROUP BY user_id, type, source_type, source_id
HAVING COUNT(*) > 1
ORDER BY dup DESC;

-- ── Step 2: Delete duplicates (keep oldest by created_at) ──
\echo ''
\echo '=== DELETING duplicates ==='
WITH dups AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, type, source_type, source_id
      ORDER BY created_at, id
    ) AS rn
  FROM notifications
  WHERE source_id IS NOT NULL
)
DELETE FROM notifications WHERE id IN (SELECT id FROM dups WHERE rn > 1);

-- ── Step 3: Add UNIQUE constraints ──
\echo ''
\echo '=== Creating UNIQUE indexes ==='

CREATE UNIQUE INDEX IF NOT EXISTS uniq_notif_user_source
ON notifications (user_id, type, source_type, source_id)
WHERE user_id IS NOT NULL AND source_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_notif_broadcast_source
ON notifications (type, source_type, source_id)
WHERE user_id IS NULL AND source_id IS NOT NULL;

-- ── Verify ──
\echo ''
\echo '=== VERIFY: Remaining duplicates (should be 0) ==='
SELECT COUNT(*) AS remaining_duplicates
FROM (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY user_id, type, source_type, source_id ORDER BY id
  ) AS rn
  FROM notifications WHERE source_id IS NOT NULL
) sub WHERE rn > 1;

\echo ''
\echo '=== VERIFY: Indexes ==='
SELECT indexname FROM pg_indexes
WHERE tablename = 'notifications' AND indexname LIKE 'uniq_notif%';

COMMIT;

\echo ''
\echo '✅ Done. Restart backend to load patched worker.'
