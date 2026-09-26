-- Drop six indexes Postgres has never used (audit #11, 2026-09-26).
--
-- pg_stat_database.stats_reset is NULL on this cluster (PostgreSQL 16, whose
-- statistics survive clean restarts), so idx_scan = 0 covers the whole life of
-- the statistics. No application query uses what they index: no JSONB
-- operator touches signal_journey.events, and initial_mae_pct / downside_beta
-- are only read in Python, never filtered or ordered on in SQL. Three are
-- exact duplicates left by the SQLite migration (the `idx_163xx_` prefix) of
-- indexes that are in heavy use.
--
-- ~251 MB, most of it the GIN index, which every journey update also had to
-- maintain. Kept on purpose: idx_signals_callid (one copy of the duplicate
-- pair) and flow_snapshots_pkey (a primary key).
--
-- CONCURRENTLY: no lock that blocks reads or writes. It cannot run inside a
-- transaction block, so run this file with psql in autocommit mode.
SET lock_timeout = '5s';

DROP INDEX CONCURRENTLY IF EXISTS public.idx_journey_events_gin;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_16392_idx_updates_sid;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_16392_idx_updates_uid;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_16386_idx_signals_callid;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_journey_initial_mae;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_correlation_downside_beta;

-- To put any of them back (definitions as they were on 2026-09-26):
-- CREATE INDEX CONCURRENTLY idx_journey_events_gin ON public.signal_journey USING gin (events);
-- CREATE INDEX CONCURRENTLY idx_16392_idx_updates_sid ON public.signal_updates USING btree (signal_id);        -- duplicate of idx_updates_sid
-- CREATE INDEX CONCURRENTLY idx_16392_idx_updates_uid ON public.signal_updates USING btree (update_message_id); -- duplicate of idx_updates_uid
-- CREATE INDEX CONCURRENTLY idx_16386_idx_signals_callid ON public.signals USING btree (call_message_id);       -- duplicate of idx_signals_callid
-- CREATE INDEX CONCURRENTLY idx_journey_initial_mae ON public.signal_journey USING btree (initial_mae_pct);
-- CREATE INDEX CONCURRENTLY idx_correlation_downside_beta ON public.signal_btc_correlation USING btree (downside_beta DESC NULLS LAST);
