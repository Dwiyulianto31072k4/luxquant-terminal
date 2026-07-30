-- ════════════════════════════════════════════════════════════════
-- In-app live chat (user ↔ admin), phase 1
--   chat_conversations   : one open thread per user + read cursors
--   chat_messages        : the thread itself + Telegram relay outbox
--   chat_handoff_tokens  : single-use tokens for the "continue in Telegram" link
--   chat_settings        : singleton — away message, office hours, nudges
--
-- Phase 1 uses none of the tg_* / relay_* columns. They ship now anyway so
-- the Telegram mirror (phase 2) needs no second migration against a table
-- that by then holds live conversations.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS chat_conversations (
    id                    BIGSERIAL PRIMARY KEY,
    user_id               INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

    status                TEXT NOT NULL DEFAULT 'open',   -- open | snoozed | closed

    -- Gapless per-conversation counter. This — never id — is the ordering and
    -- cursor key: two concurrent INSERTs can take ids 100/101 but commit
    -- 101-then-100, and a client polling "id > 100" in that window would skip
    -- row 100 forever. Allocated under a row lock in append_message().
    last_seq              BIGINT NOT NULL DEFAULT 0,
    user_last_read_seq    BIGINT NOT NULL DEFAULT 0,
    admin_last_read_seq   BIGINT NOT NULL DEFAULT 0,
    -- Unread is derived (last_seq - *_last_read_seq), never stored: counters drift.

    last_message_at       TIMESTAMPTZ,
    last_user_message_at  TIMESTAMPTZ,                    -- drives the unanswered nudge
    last_admin_message_at TIMESTAMPTZ,

    -- ── Telegram mirror (phase 2) ──
    tg_chat_id            BIGINT,                         -- support supergroup
    tg_topic_id           INTEGER,                        -- message_thread_id
    tg_topic_state        TEXT NOT NULL DEFAULT 'none',   -- none | pending | ready | failed
    tg_topic_error        TEXT,
    dm_bound_at           TIMESTAMPTZ,                    -- handoff done; DMs route here
    handoff_sent_at       TIMESTAMPTZ,

    assigned_admin_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,

    -- AI seam (phase 6). 'human' is the only value phase 1 ever writes.
    answer_mode           TEXT NOT NULL DEFAULT 'human',  -- human | ai_draft | ai_auto

    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Admin inbox list: open threads, most recently active first.
CREATE INDEX IF NOT EXISTS ix_chatconv_status_last
    ON chat_conversations(status, last_message_at DESC);

-- Topic → conversation resolution for inbound Telegram updates (phase 2).
CREATE UNIQUE INDEX IF NOT EXISTS ux_chatconv_topic
    ON chat_conversations(tg_chat_id, tg_topic_id)
    WHERE tg_topic_id IS NOT NULL;

-- Unanswered-nudge scan (phase 3): stays tiny, only open threads.
CREATE INDEX IF NOT EXISTS ix_chatconv_unanswered
    ON chat_conversations(last_user_message_at)
    WHERE status = 'open';


CREATE TABLE IF NOT EXISTS chat_messages (
    id                BIGSERIAL PRIMARY KEY,
    conversation_id   BIGINT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    seq               BIGINT NOT NULL,                    -- gapless, per conversation

    sender            TEXT NOT NULL,                      -- user | admin | system | ai
    sender_user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    body              TEXT NOT NULL,
    kind              TEXT NOT NULL DEFAULT 'text',       -- text | media_ref | system

    -- 'admin' hides a row from the user: AI drafts and internal notes (phase 6).
    visibility        TEXT NOT NULL DEFAULT 'all',        -- all | admin

    source            TEXT NOT NULL,                      -- web | admin_panel | telegram_topic
                                                          -- | telegram_dm | system
    client_msg_id     TEXT,                               -- client UUID, send idempotency

    -- ── Telegram relay outbox (phase 2) ──
    -- Sends can't live in the request path: handlers are sync def (can't await
    -- the httpx helper) and Telegram caps ~20 msg/min into one group, which
    -- every conversation funnels through. A leader-gated poller loop drains this.
    tg_chat_id        BIGINT,
    tg_message_id     BIGINT,
    relay_state       TEXT NOT NULL DEFAULT 'pending',    -- pending | sent | skipped | failed
    relay_attempts    SMALLINT NOT NULL DEFAULT 0,
    relay_next_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    relay_error       TEXT,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT ux_chatmsg_seq UNIQUE (conversation_id, seq)
);

-- Send idempotency: optimistic UI retries and double-clicks collapse to one row.
CREATE UNIQUE INDEX IF NOT EXISTS ux_chatmsg_client_id
    ON chat_messages(conversation_id, client_msg_id)
    WHERE client_msg_id IS NOT NULL;

-- Telegram delivers at-least-once (retries, lost offset commits). Last-resort
-- guard so a redelivered update can't duplicate a message.
CREATE UNIQUE INDEX IF NOT EXISTS ux_chatmsg_tg_id
    ON chat_messages(tg_chat_id, tg_message_id)
    WHERE tg_message_id IS NOT NULL;

-- History reads and the after=<seq> cursor.
CREATE INDEX IF NOT EXISTS ix_chatmsg_conv_seq
    ON chat_messages(conversation_id, seq);

-- Relay drain (phase 2): partial, so it stays near-empty in steady state.
CREATE INDEX IF NOT EXISTS ix_chatmsg_relay_due
    ON chat_messages(relay_next_at)
    WHERE relay_state = 'pending';

-- Retention prune.
CREATE INDEX IF NOT EXISTS ix_chatmsg_created
    ON chat_messages(created_at);


-- Phase 4. Opaque and single-use on purpose: a guessable
-- t.me/<bot>?start=chat_<conversation_id> would let anyone send
-- "/start chat_47" and get another user's support thread relayed to them.
-- Ingest must also verify the sender's telegram_id matches user_id.
-- In Postgres rather than Redis because the link sits in a Telegram DM for
-- days and has to survive a Redis flush.
CREATE TABLE IF NOT EXISTS chat_handoff_tokens (
    token            TEXT PRIMARY KEY,                    -- secrets.token_urlsafe(24)
    conversation_id  BIGINT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at       TIMESTAMPTZ NOT NULL,
    used_at          TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_chathandoff_conv ON chat_handoff_tokens(conversation_id);


-- Singleton row. Postgres rather than a Redis key because these are content,
-- edited from the admin tab, and must survive a flush.
CREATE TABLE IF NOT EXISTS chat_settings (
    id                     INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),

    away_enabled           BOOLEAN NOT NULL DEFAULT true,
    away_message           TEXT,
    office_hours           JSONB,          -- {tz, days:[{d,start,end}]}; NULL = always away-eligible
    autoreply_cooldown_min INTEGER NOT NULL DEFAULT 120,
    nudge_after_min        INTEGER NOT NULL DEFAULT 30,
    nudge_message          TEXT,
    welcome_message        TEXT,

    tg_support_chat_id     BIGINT,
    tg_last_update_id      BIGINT,         -- getUpdates offset mirror (phase 2)

    updated_by             INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO chat_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Verify
\d chat_conversations
\d chat_messages
\d chat_handoff_tokens
\d chat_settings
