-- migration-workspace-v1-fix.sql
-- Rename column 'metadata' -> 'extra_data' di marketing_campaigns
-- karena 'metadata' RESERVED oleh SQLAlchemy Base.
-- Idempotent: aman re-run kapan aja.

BEGIN;

DO $$
BEGIN
    -- Check apakah kolom 'metadata' masih ada
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'marketing_campaigns'
          AND column_name = 'metadata'
    ) THEN
        -- Drop kolom 'extra_data' kalau udah ada (avoid conflict)
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'marketing_campaigns'
              AND column_name = 'extra_data'
        ) THEN
            ALTER TABLE marketing_campaigns DROP COLUMN extra_data;
        END IF;

        -- Rename
        ALTER TABLE marketing_campaigns RENAME COLUMN metadata TO extra_data;
        RAISE NOTICE 'Renamed metadata -> extra_data';
    ELSE
        -- Kalau metadata udah gak ada tapi extra_data juga gak ada → create
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'marketing_campaigns'
              AND column_name = 'extra_data'
        ) THEN
            ALTER TABLE marketing_campaigns
              ADD COLUMN extra_data JSONB NOT NULL DEFAULT '{}'::jsonb;
            RAISE NOTICE 'Created extra_data column from scratch';
        ELSE
            RAISE NOTICE 'extra_data already exists, nothing to do';
        END IF;
    END IF;
END $$;

COMMIT;

-- Verify final state
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'marketing_campaigns'
ORDER BY ordinal_position;
