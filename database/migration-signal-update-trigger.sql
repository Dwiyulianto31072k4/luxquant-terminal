-- ============================================
-- LuxQuant Terminal - Signal Update Notify Trigger
-- ============================================
-- Layer 4c dari Signal Journey feature.
-- Bikin trigger di signal_updates yang fire NOTIFY signal_update tiap row baru.
-- Worker journey LISTEN ke channel ini buat trigger compute_journey.
--
-- Pattern: mirror trg_new_signal (existing trigger di table signals).
--
-- Idempotent: aman di-run berkali-kali.
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_signal_update_notify ON signal_updates;
--   DROP FUNCTION IF EXISTS notify_signal_update();
-- ============================================

BEGIN;

-- ============================================
-- 1. Trigger function
-- ============================================
-- Sends signal_id sebagai payload, biar worker bisa langsung query
-- signal_journey + signal_updates buat re-compute.
CREATE OR REPLACE FUNCTION notify_signal_update()
RETURNS trigger AS $$
BEGIN
    -- pg_notify payload: signal_id (TEXT, max 8000 bytes — UUID jauh dari limit)
    -- Skip notify kalau signal_id NULL (gak boleh terjadi tapi defensive)
    IF NEW.signal_id IS NOT NULL THEN
        PERFORM pg_notify('signal_update', NEW.signal_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================
-- 2. Trigger
-- ============================================
-- AFTER INSERT — fire setelah row sukses inserted (post-commit pun OK)
-- FOR EACH ROW — per-row, bukan per-statement (jadi multi-row INSERT tetep dapet 1 notify per row)
DROP TRIGGER IF EXISTS trg_signal_update_notify ON signal_updates;

CREATE TRIGGER trg_signal_update_notify
    AFTER INSERT ON signal_updates
    FOR EACH ROW
    EXECUTE FUNCTION notify_signal_update();


-- ============================================
-- 3. Comment
-- ============================================
COMMENT ON FUNCTION notify_signal_update() IS
    'Fires NOTIFY signal_update with signal_id payload. Used by luxquant-journey-worker to re-compute signal_journey on TP/SL events.';


COMMIT;


-- ============================================
-- VERIFICATION
-- ============================================

-- 1. Verify trigger exists
-- \d signal_updates
-- (Section "Triggers:" should show trg_signal_update_notify)

-- 2. Verify function exists
-- \df notify_signal_update

-- 3. Manual test (run di session terpisah):
--   Session A:  LISTEN signal_update;
--   Session B:  INSERT INTO signal_updates (channel_id, update_message_id, update_type, signal_id, price, update_at)
--               VALUES (999999, 999999, 'tp1', 'test-signal', 1.0, '2026-04-30T10:00:00+00:00');
--   Session A:  Should print: Asynchronous notification "signal_update" with payload "test-signal" received from server process with PID xxx.
--   Cleanup:    DELETE FROM signal_updates WHERE signal_id = 'test-signal';
