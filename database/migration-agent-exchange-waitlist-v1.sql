-- Agent exchange waitlist (Bitget / BingX demand).
-- The API also CREATE TABLE IF NOT EXISTS on first use.

CREATE TABLE IF NOT EXISTS agent_exchange_waitlist (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exchange    VARCHAR(20) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, exchange)
);

CREATE INDEX IF NOT EXISTS idx_agent_waitlist_exchange
    ON agent_exchange_waitlist (exchange, created_at DESC);
