-- ════════════════════════════════════════════════════════════════
-- Migration: Multi-Wallet Rotation (v1.0)
-- ════════════════════════════════════════════════════════════════
-- Purpose: Privacy-enhanced payment receiving via rotated exchange addresses
--          to prevent revenue/operation doxxing via single-wallet BSCScan trace.
--
-- Strategy: 6 deposit addresses from different CEX (Binance, Bybit, OKX,
--           Bitget, Tokocrypto, Indodax, etc) — each invoice rotates to
--           different wallet via smart LRU + 1h cooldown algorithm.
--
-- Backward compat:
--   - Existing pending invoices keep their stored wallet_to (no migration)
--   - Existing RECEIVING_WALLET_BSC env var serves as fallback
--   - Frontend already reads invoice.wallet_to per-invoice (no FE changes)
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. TABLE: receiving_wallets ──
CREATE TABLE IF NOT EXISTS receiving_wallets (
  id                    SERIAL PRIMARY KEY,
  label                 VARCHAR(50) NOT NULL UNIQUE,
  address               VARCHAR(50) NOT NULL UNIQUE,
  exchange_name         VARCHAR(50) NOT NULL,
  network               VARCHAR(20) NOT NULL DEFAULT 'BSC',
  is_active             BOOLEAN NOT NULL DEFAULT true,
  last_used_at          TIMESTAMPTZ,
  total_received_count  INTEGER NOT NULL DEFAULT 0,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT chk_wallet_address_format
    CHECK (address ~ '^0x[0-9a-fA-F]{40}$'),
  CONSTRAINT chk_wallet_count_nonneg
    CHECK (total_received_count >= 0),
  CONSTRAINT chk_wallet_network
    CHECK (network IN ('BSC', 'ETH', 'TRON', 'POLYGON'))
);

-- ── 2. INDEXES ──
CREATE INDEX IF NOT EXISTS idx_recvwallet_active_lastused
  ON receiving_wallets(is_active, last_used_at NULLS FIRST);

CREATE INDEX IF NOT EXISTS idx_recvwallet_exchange
  ON receiving_wallets(exchange_name);

CREATE INDEX IF NOT EXISTS idx_recvwallet_network
  ON receiving_wallets(network);

-- Case-insensitive address lookup
CREATE INDEX IF NOT EXISTS idx_recvwallet_address_lower
  ON receiving_wallets(LOWER(address));

-- ── 3. SEED initial wallets ──
-- These are the 6 CEX deposit addresses for LuxQuant subscription payments.
-- Insert is idempotent (ON CONFLICT DO NOTHING) — safe to re-run.

INSERT INTO receiving_wallets (label, address, exchange_name, network, notes)
VALUES
  ('mexc_main',     '0x7d9fe739eddb4bbc777519bf874856c98ce761bb', 'MEXC',     'BSC', 'MEXC global exchange'),
  ('binance_main',  '0x537ae20517fcd02bee46ba2ebce8fb4ac254058a', 'Binance',  'BSC', 'Binance global exchange'),
  ('gate_main',     '0x0146E3620c86feb924eBEf047459EC885a18f5d0', 'Gate.io',  'BSC', 'Gate.io global exchange'),
  ('bybit_main',    '0xf447c6095af844dee49993e7ac48c370b29cec9d', 'Bybit',    'BSC', 'Bybit global exchange'),
  ('indodax_main',  '0xB8a24149EE00658275Cca2CBa52BDe49eCAdf95b', 'Indodax',  'BSC', 'Indodax local exchange (also legacy primary)'),
  ('huobi_main',    '0x253297d5425218a86172a2a3e18128e48175e408', 'Huobi',    'BSC', 'Huobi (HTX) global exchange')
ON CONFLICT (label) DO NOTHING;

-- ── 4. GRANTS ──
GRANT SELECT, INSERT, UPDATE, DELETE ON receiving_wallets TO luxq;
GRANT USAGE, SELECT ON SEQUENCE receiving_wallets_id_seq TO luxq;

-- Conditional grant for readonly role (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'luxq_readonly') THEN
    GRANT SELECT ON receiving_wallets TO luxq_readonly;
  END IF;
END $$;

-- ── 5. COMMENTS (self-documentation) ──
COMMENT ON TABLE receiving_wallets IS
  'Pool of CEX deposit addresses for USDT BEP-20 subscription payments. Rotated per-invoice for privacy (anti-doxxing).';
COMMENT ON COLUMN receiving_wallets.label IS
  'Internal identifier (e.g., binance_main, bybit_alt). Must be unique.';
COMMENT ON COLUMN receiving_wallets.address IS
  'On-chain BSC address (0x + 40 hex). Must be unique.';
COMMENT ON COLUMN receiving_wallets.is_active IS
  'Toggle to pause wallet without deletion (e.g., compromised, ToS issue, exchange maintenance).';
COMMENT ON COLUMN receiving_wallets.last_used_at IS
  'Last assignment to a payment invoice. Used for LRU rotation + cooldown logic.';
COMMENT ON COLUMN receiving_wallets.total_received_count IS
  'Number of invoices assigned to this wallet. Auto-incremented by wallet_pool service.';

-- ════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES
-- ════════════════════════════════════════════════════════════════

\echo ''
\echo '═══════════════════════════════════════════════════════════════'
\echo 'VERIFICATION'
\echo '═══════════════════════════════════════════════════════════════'

\echo ''
\echo '── Table structure ──'
\d receiving_wallets

\echo ''
\echo '── Seeded wallets ──'
SELECT id, label, exchange_name, network, is_active,
       SUBSTRING(address, 1, 10) || '...' || SUBSTRING(address, 35) AS addr_preview,
       total_received_count
FROM receiving_wallets
ORDER BY id;

\echo ''
\echo '── Counts ──'
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE is_active = true) AS active,
  COUNT(DISTINCT exchange_name) AS exchanges,
  COUNT(DISTINCT network) AS networks
FROM receiving_wallets;

\echo ''
\echo '── Index list ──'
SELECT indexname
FROM pg_indexes
WHERE tablename = 'receiving_wallets'
ORDER BY indexname;

\echo ''
\echo '═══════════════════════════════════════════════════════════════'
\echo 'MIGRATION COMPLETE — commit'
\echo '═══════════════════════════════════════════════════════════════'

COMMIT;
