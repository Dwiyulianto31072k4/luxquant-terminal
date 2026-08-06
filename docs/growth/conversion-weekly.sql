-- LuxQuant weekly login conversion pack
-- Run on production: sudo -u postgres psql -d luxquant -f conversion-weekly.sql
-- Pair with Cloudflare UV for visitor → signup rate.

\echo '=== A. Signups last 7 / 30 days ==='
SELECT
  count(*) FILTER (WHERE created_at >= now() - interval '7 days')  AS signups_7d,
  count(*) FILTER (WHERE created_at >= now() - interval '30 days') AS signups_30d,
  count(*) FILTER (WHERE last_login_at >= now() - interval '7 days')  AS login_7d,
  count(*) FILTER (WHERE last_login_at >= now() - interval '30 days') AS login_30d,
  count(*) FILTER (WHERE last_login_at >= now() - interval '1 day')   AS login_24h
FROM users;

\echo '=== B. New cohort quality (created last 30d) ==='
SELECT
  count(*) AS signups,
  count(*) FILTER (WHERE COALESCE(login_count,0) = 1) AS one_shot,
  count(*) FILTER (WHERE COALESCE(login_count,0) BETWEEN 2 AND 5) AS login_2_5,
  count(*) FILTER (WHERE COALESCE(login_count,0) >= 6) AS login_6_plus,
  round(
    100.0 * count(*) FILTER (WHERE COALESCE(login_count,0) = 1) / NULLIF(count(*),0),
    1
  ) AS one_shot_pct
FROM users
WHERE created_at >= now() - interval '30 days';

\echo '=== C. Daily signups (30d) ==='
SELECT created_at::date AS day, count(*) AS signups
FROM users
WHERE created_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY 1;

\echo '=== D. Auth provider mix (30d signups) ==='
SELECT auth_provider, count(*)
FROM users
WHERE created_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY 2 DESC;

\echo '=== E. Activity engagement (DAU/WAU/MAU) ==='
SELECT
  count(DISTINCT user_id) FILTER (WHERE occurred_at >= now() - interval '1 day')  AS dau,
  count(DISTINCT user_id) FILTER (WHERE occurred_at >= now() - interval '7 days') AS wau,
  count(DISTINCT user_id) FILTER (WHERE occurred_at >= now() - interval '30 days') AS mau
FROM user_activity_events;

\echo '=== F. Feature reach 30d ==='
SELECT feature, count(*) AS events, count(DISTINCT user_id) AS users
FROM user_activity_events
WHERE occurred_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY events DESC;

\echo '=== G. Client funnel events 30d (if table exists) ==='
SELECT event, count(*) AS n
FROM funnel_events
WHERE created_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY n DESC;

\echo '=== H. CTA sources 30d ==='
SELECT COALESCE(source,'(none)') AS source, count(*) AS n
FROM funnel_events
WHERE created_at >= now() - interval '30 days'
  AND event = 'cta_click'
GROUP BY 1
ORDER BY n DESC
LIMIT 25;

\echo '=== I. Soft gate effectiveness ==='
SELECT
  count(*) FILTER (WHERE event = 'soft_gate_shown') AS shown,
  count(*) FILTER (WHERE event = 'soft_gate_login_click') AS login_clicks,
  round(
    100.0 * count(*) FILTER (WHERE event = 'soft_gate_login_click')
      / NULLIF(count(*) FILTER (WHERE event = 'soft_gate_shown'), 0),
    1
  ) AS ctr_pct
FROM funnel_events
WHERE created_at >= now() - interval '30 days';

\echo '=== J. Paid intent vs confirmed (30d payments) ==='
SELECT status, count(*), round(sum(amount_usdt)::numeric, 2) AS usdt
FROM payments
WHERE created_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY 2 DESC;

\echo '=== K. Referral contribution ==='
SELECT
  count(*) FILTER (
    WHERE referred_by IS NOT NULL OR referral_code_used IS NOT NULL
  ) AS referred,
  count(*) AS total,
  round(
    100.0 * count(*) FILTER (
      WHERE referred_by IS NOT NULL OR referral_code_used IS NOT NULL
    ) / NULLIF(count(*),0),
    1
  ) AS referred_pct
FROM users
WHERE created_at >= now() - interval '30 days';
