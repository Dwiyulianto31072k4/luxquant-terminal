-- ============================================================
-- LuxQuant Terminal - AutoTrade v3 Migration
-- Clean build: multi-exchange, real execution, spot+futures
-- ============================================================
-- Run: sudo -u postgres psql -d luxquant < migration-autotrade-v3.sql
-- ============================================================

BEGIN;

-- ============================================================
-- 1. exchange_accounts
-- ============================================================
-- Stores user's connected exchange API credentials (encrypted).
-- One user can have multiple accounts per exchange (multi-account).
-- ============================================================
CREATE TABLE exchange_accounts (
    id                  SERIAL PRIMARY KEY,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Exchange identification
    exchange_id         VARCHAR(20) NOT NULL,           -- binance, bybit, okx, bitget, mexc
    label               VARCHAR(100) DEFAULT '',         -- user-chosen display name
    trading_mode        VARCHAR(10) NOT NULL DEFAULT 'both',  -- spot | futures | both

    -- Credentials (Fernet encrypted)
    api_key_enc         TEXT NOT NULL,
    api_secret_enc      TEXT NOT NULL,
    passphrase_enc      TEXT,                            -- OKX & Bitget only

    -- Options
    is_active           BOOLEAN DEFAULT TRUE,
    is_testnet          BOOLEAN DEFAULT FALSE,
    custom_base_url     VARCHAR(255),                    -- e.g. api.bybit.id for Indonesia

    -- Balance cache (updated periodically)
    balance_cache       JSONB,                           -- {spot: {...}, futures: {...}}
    balance_updated_at  TIMESTAMPTZ,

    -- Timestamps
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_exacc_user ON exchange_accounts(user_id);
CREATE INDEX idx_exacc_exchange ON exchange_accounts(exchange_id);
CREATE INDEX idx_exacc_active ON exchange_accounts(user_id, is_active);


-- ============================================================
-- 2. autotrade_config
-- ============================================================
-- One config per (user_id, exchange_account_id).
-- All risk/filter/trailing/anti-liquid settings.
-- ============================================================
CREATE TABLE autotrade_config (
    id                           SERIAL PRIMARY KEY,
    user_id                      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exchange_account_id          INTEGER NOT NULL REFERENCES exchange_accounts(id) ON DELETE CASCADE,

    -- Master toggle
    enabled                      BOOLEAN DEFAULT FALSE,
    mode                         VARCHAR(10) DEFAULT 'auto',  -- auto (only option for now)
    default_market_type          VARCHAR(10) DEFAULT 'futures', -- spot | futures

    -- Position sizing & risk
    max_position_pct             REAL DEFAULT 5.0,            -- % of balance per trade
    max_leverage                 INTEGER DEFAULT 10,
    max_concurrent_trades        INTEGER DEFAULT 5,
    daily_loss_limit_pct         REAL DEFAULT 10.0,
    margin_mode                  VARCHAR(10) DEFAULT 'isolated', -- isolated | cross

    -- TP strategy
    tp_strategy                  VARCHAR(30) DEFAULT 'equal_split', -- equal_split | front_loaded | back_loaded | tp1_only | custom
    tp_custom_splits             JSONB,                        -- [25, 25, 25, 25] custom splits

    -- SL rules
    sl_to_breakeven_after        VARCHAR(10) DEFAULT 'tp1',   -- tp1 | tp2 | never

    -- Signal filters
    risk_filter                  VARCHAR(20) DEFAULT 'all',    -- all | low_only | low_medium
    pair_whitelist               JSONB,                        -- NULL = allow all; array of symbols if set
    pair_blacklist               JSONB DEFAULT '[]'::jsonb,    -- array of symbols to skip
    min_volume_rank              INTEGER,                      -- skip low-volume pairs

    -- Trailing stop (optional, default OFF)
    trailing_stop_enabled        BOOLEAN DEFAULT FALSE,
    trailing_stop_type           VARCHAR(12) DEFAULT 'percent', -- percent | fixed_usdt
    trailing_stop_value          NUMERIC(10,2) DEFAULT 1.5,
    trailing_activation          VARCHAR(20) DEFAULT 'breakeven', -- immediate | breakeven | after_tp1
    trailing_update_interval     INTEGER DEFAULT 15,            -- seconds
    max_trailing_distance        NUMERIC(10,2),                 -- optional safety cap

    -- Max loss protection (optional, default OFF)
    max_loss_protection_enabled  BOOLEAN DEFAULT FALSE,
    max_loss_per_trade_pct       NUMERIC(5,2) DEFAULT 1.5,
    emergency_close_trigger_pct  NUMERIC(5,2) DEFAULT 2.0,

    -- Anti-liquidation (for futures with isolated margin)
    liquidation_buffer_pct       NUMERIC(5,2) DEFAULT 220,     -- emergency action trigger
    liquidation_warning_pct      NUMERIC(5,2) DEFAULT 320,     -- notify-only
    auto_topup_margin            BOOLEAN DEFAULT FALSE,
    auto_topup_max_pct           NUMERIC(5,2) DEFAULT 30,
    emergency_action             VARCHAR(30) DEFAULT 'partial_close', -- partial_close | tighten_sl | full_close | add_margin

    -- Timestamps
    created_at                   TIMESTAMPTZ DEFAULT NOW(),
    updated_at                   TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, exchange_account_id)
);

CREATE INDEX idx_atconfig_user ON autotrade_config(user_id);
CREATE INDEX idx_atconfig_enabled ON autotrade_config(enabled) WHERE enabled = TRUE;


-- ============================================================
-- 3. trade_orders
-- ============================================================
-- Actual trade executions. Linked to signal + exchange account.
-- Tracks full lifecycle: pending → placed → filled → closed.
-- ============================================================
CREATE TABLE trade_orders (
    id                      SERIAL PRIMARY KEY,
    signal_id               TEXT REFERENCES signals(signal_id) ON DELETE SET NULL,
    user_id                 INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exchange_account_id     INTEGER NOT NULL REFERENCES exchange_accounts(id) ON DELETE CASCADE,
    exchange_id             VARCHAR(20) NOT NULL,              -- redundant but useful for queries
    market_type             VARCHAR(10) NOT NULL,              -- spot | futures

    -- Exchange-side
    exchange_order_id       VARCHAR(100),

    -- Trade params
    pair                    VARCHAR(30) NOT NULL,
    side                    VARCHAR(10) NOT NULL,              -- buy | sell
    order_type              VARCHAR(20) NOT NULL,              -- market | limit
    entry_price             REAL,                              -- actual filled avg price
    target_entry            REAL,                              -- intended entry from signal
    qty                     REAL NOT NULL,                     -- intended qty
    qty_filled              REAL DEFAULT 0,

    -- Futures only
    leverage                INTEGER DEFAULT 1,
    margin_mode             VARCHAR(10) DEFAULT 'isolated',

    -- Status
    status                  VARCHAR(20) NOT NULL DEFAULT 'pending',
                                -- pending | placed | filled | partial | closed | error | cancelled
    close_reason            VARCHAR(20),
                                -- tp1 | tp2 | tp3 | tp4 | sl | trailing_sl | emergency | manual | signal_sl | daily_limit
    realized_pnl            REAL,
    fee_total               REAL,
    error_message           TEXT,

    -- TP plan (array of exchange TP orders with split %)
    tp_orders               JSONB,
                                -- [{level:"tp1", price:X, qty_pct:25, filled:false, order_id:null}, ...]

    -- SL tracking
    sl_order_id             VARCHAR(100),
    sl_price                REAL,                              -- original SL from signal
    sl_current              REAL,                              -- current SL (may have been moved)

    -- Trailing state (only if trailing enabled)
    trailing_enabled        BOOLEAN DEFAULT FALSE,
    trailing_type           VARCHAR(12),
    trailing_value          NUMERIC(10,2),
    trailing_activation     VARCHAR(20),
    trailing_activated      BOOLEAN DEFAULT FALSE,
    highest_price           NUMERIC(20,10),                    -- for long trailing
    lowest_price            NUMERIC(20,10),                    -- for short trailing
    last_trail_updated_at   TIMESTAMPTZ,

    -- Anti-liquid tracking
    max_loss_amount         REAL,                              -- USD hard cap
    margin_allocated        REAL,                              -- USD initial margin

    -- Timestamps
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    filled_at               TIMESTAMPTZ,
    closed_at               TIMESTAMPTZ,
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_torders_user ON trade_orders(user_id);
CREATE INDEX idx_torders_exacc ON trade_orders(exchange_account_id);
CREATE INDEX idx_torders_signal ON trade_orders(signal_id);
CREATE INDEX idx_torders_pair ON trade_orders(pair);
CREATE INDEX idx_torders_status ON trade_orders(status);
CREATE INDEX idx_torders_open ON trade_orders(user_id, status)
    WHERE status IN ('pending', 'placed', 'filled', 'partial');
CREATE INDEX idx_torders_trailing ON trade_orders(trailing_enabled, status)
    WHERE trailing_enabled = TRUE AND status IN ('filled', 'partial');


-- ============================================================
-- 4. trade_log
-- ============================================================
-- Event-based audit trail for trade lifecycle.
-- Event examples: order_placed, order_failed, tp_hit, sl_moved,
-- trailing_updated, emergency_triggered, partial_closed, etc.
-- ============================================================
CREATE TABLE trade_log (
    id                  SERIAL PRIMARY KEY,
    trade_order_id      INTEGER REFERENCES trade_orders(id) ON DELETE CASCADE,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event               VARCHAR(50) NOT NULL,
    details             JSONB,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tlog_order ON trade_log(trade_order_id);
CREATE INDEX idx_tlog_user ON trade_log(user_id);
CREATE INDEX idx_tlog_event ON trade_log(event);
CREATE INDEX idx_tlog_created ON trade_log(created_at);


-- ============================================================
-- 5. daily_pnl
-- ============================================================
-- Aggregated per user/exchange_account/day.
-- Used for daily_loss_limit enforcement + portfolio charts.
-- ============================================================
CREATE TABLE daily_pnl (
    id                  SERIAL PRIMARY KEY,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exchange_account_id INTEGER NOT NULL REFERENCES exchange_accounts(id) ON DELETE CASCADE,
    date                DATE NOT NULL,

    -- Counts
    trades_opened       INTEGER DEFAULT 0,
    trades_closed       INTEGER DEFAULT 0,
    wins                INTEGER DEFAULT 0,
    losses              INTEGER DEFAULT 0,

    -- PnL
    realized_pnl        REAL DEFAULT 0,
    fees_total          REAL DEFAULT 0,
    net_pnl             REAL DEFAULT 0,

    created_at          TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, exchange_account_id, date)
);

CREATE INDEX idx_dpnl_user_date ON daily_pnl(user_id, date);


-- ============================================================
-- 6. LISTEN/NOTIFY — signal trigger
-- ============================================================
-- Notifies autotrade engine when a new signal is inserted.
-- Engine uses asyncpg LISTEN to receive real-time notifications.
-- ============================================================
CREATE OR REPLACE FUNCTION notify_new_signal()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify(
        'new_signal',
        json_build_object(
            'signal_id', NEW.signal_id,
            'pair', NEW.pair,
            'entry', NEW.entry,
            'created_at', NEW.created_at
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_new_signal ON signals;
CREATE TRIGGER trg_new_signal
    AFTER INSERT ON signals
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_signal();


-- ============================================================
-- DONE
-- ============================================================
COMMIT;

-- Verify
\dt exchange_accounts
\dt autotrade_config
\dt trade_orders
\dt trade_log
\dt daily_pnl
