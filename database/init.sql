-- LuxQuant Terminal - Database Schema
-- Sama dengan struktur di VPS production

-- Table: signals (main trading signals)
CREATE TABLE IF NOT EXISTS signals (
    signal_id TEXT PRIMARY KEY,
    channel_id INTEGER,
    call_message_id INTEGER UNIQUE,
    message_link TEXT,
    pair TEXT,
    entry REAL,
    target1 REAL,
    target2 REAL,
    target3 REAL,
    target4 REAL,
    stop1 REAL,
    stop2 REAL,
    risk_level TEXT,
    volume_rank_num INTEGER,
    volume_rank_den INTEGER,
    created_at TEXT,
    status TEXT DEFAULT 'open',
    raw_text TEXT,
    text_sha1 TEXT,
    edit_date TEXT
);

-- Indexes for signals
CREATE INDEX IF NOT EXISTS idx_signals_pair ON signals(pair);
CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);
CREATE INDEX IF NOT EXISTS idx_signals_callid ON signals(call_message_id);
CREATE INDEX IF NOT EXISTS idx_signals_created ON signals(created_at);

-- Table: signal_updates (history of TP/SL hits)
CREATE TABLE IF NOT EXISTS signal_updates (
    signal_id TEXT,
    channel_id INTEGER,
    update_message_id INTEGER,
    message_link TEXT,
    update_type TEXT,
    price REAL,
    update_at TEXT,
    raw_text TEXT,
    reply_to_msg_id INTEGER,
    linked_msg_id INTEGER,
    PRIMARY KEY (channel_id, update_message_id, update_type)
);

-- Indexes for signal_updates
CREATE INDEX IF NOT EXISTS idx_updates_sid ON signal_updates(signal_id);
CREATE INDEX IF NOT EXISTS idx_updates_uid ON signal_updates(update_message_id);

-- Table: starred_signals (user watchlist) - NEW
CREATE TABLE IF NOT EXISTS starred_signals (
    id TEXT PRIMARY KEY,
    signal_id TEXT REFERENCES signals(signal_id) ON DELETE CASCADE,
    user_id TEXT DEFAULT 'default',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for starred
CREATE INDEX IF NOT EXISTS idx_starred_user ON starred_signals(user_id);
CREATE INDEX IF NOT EXISTS idx_starred_signal ON starred_signals(signal_id);
