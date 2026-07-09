#!/usr/bin/env python3
"""
LuxQuant DB schema & data introspection.

Produces a complete, human-readable report of the `luxquant` database so we can
design the terminal from what actually exists:
  • every table with exact row count + on-disk size
  • columns (type, nullable, default) per table
  • primary keys, foreign keys (the relationship graph), indexes
  • enum types, views & materialized views
  • value distribution for low-cardinality columns on signal-domain tables
  • a couple of sample rows for signal-domain tables (no user/PII tables)

Output: /root/luxquant_schema_report.txt

Run with the backend venv (it has psycopg2):
  /root/luxquant-terminal/backend/venv/bin/python /root/introspect_schema.py
"""
import os
import re
import sys
import datetime

# ── connection ─────────────────────────────────────────────────────────
def get_dsn():
    for env in ("/root/luxquant-terminal/backend/.env", "backend/.env", ".env"):
        if os.path.exists(env):
            for line in open(env):
                line = line.strip()
                if line.startswith("DATABASE_URL="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    return "dbname=luxquant"

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    sys.exit("psycopg2 missing — run with: /root/luxquant-terminal/backend/venv/bin/python " + __file__)

OUT = os.getenv("REPORT_OUT", "/root/luxquant_schema_report.txt")
conn = psycopg2.connect(get_dsn())
conn.set_session(readonly=True, autocommit=True)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

def q(sql, args=None):
    cur.execute(sql, args or ())
    return cur.fetchall()

L = []
def w(s=""):
    L.append(s)

# signal-domain heuristic (safe to sample) vs tables to never sample (PII)
SIGNAL_RE = re.compile(r"signal|enrich|journey|tag|correlation|outcome|compass|arena|call|track|pnl|market|coin|price|regime|btc", re.I)
PII_RE = re.compile(r"user|payment|referral|telegram|discord|api_key|auth|session|subscri|wallet|contact|outreach|order|account", re.I)

def hr(c="="):
    return c * 80

# ── header ─────────────────────────────────────────────────────────────
now = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
ver = q("SHOW server_version")[0]["server_version"]
dbname = q("SELECT current_database() d")[0]["d"]
dbsize = q("SELECT pg_size_pretty(pg_database_size(current_database())) s")[0]["s"]
w(hr())
w(" LUXQUANT DATABASE — SCHEMA & DATA REPORT")
w(f" db={dbname} · postgres {ver} · size {dbsize} · generated {now}Z")
w(hr())

# ── table list (size + exact rows) ─────────────────────────────────────
tabs = q("""
  SELECT c.relname AS t, pg_total_relation_size(c.oid) AS bytes,
         pg_size_pretty(pg_total_relation_size(c.oid)) AS size
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r'
  ORDER BY pg_total_relation_size(c.oid) DESC
""")
counts = {}
for t in tabs:
    try:
        counts[t["t"]] = q(f'SELECT count(*) c FROM "{t["t"]}"')[0]["c"]
    except Exception:
        counts[t["t"]] = -1

w("")
w(f"TABLES ({len(tabs)}) — sorted by size")
w(hr("-"))
for t in tabs:
    w(f"  {t['t']:<44} {counts[t['t']]:>10,} rows   {t['size']:>10}")

# ── relationship graph (all FKs) ───────────────────────────────────────
fks = q("""
  SELECT tc.table_name AS src, kcu.column_name AS src_col,
         ccu.table_name AS ref, ccu.column_name AS ref_col
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name
  JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name
  WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'
  ORDER BY tc.table_name
""")
w("")
w(f"RELATIONSHIPS ({len(fks)} foreign keys)")
w(hr("-"))
if fks:
    for f in fks:
        w(f"  {f['src']}.{f['src_col']}  →  {f['ref']}.{f['ref_col']}")
else:
    w("  (no declared foreign keys — relationships are implicit / by convention)")

# ── enum types ─────────────────────────────────────────────────────────
enums = q("""
  SELECT t.typname AS name, string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS vals
  FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
  JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public'
  GROUP BY t.typname ORDER BY t.typname
""")
if enums:
    w("")
    w(f"ENUM TYPES ({len(enums)})")
    w(hr("-"))
    for e in enums:
        w(f"  {e['name']}: {e['vals']}")

# ── views / matviews ───────────────────────────────────────────────────
views = q("""
  SELECT c.relname AS name, CASE c.relkind WHEN 'v' THEN 'view' ELSE 'matview' END AS kind
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('v','m') ORDER BY c.relname
""")
if views:
    w("")
    w(f"VIEWS / MATERIALIZED VIEWS ({len(views)})")
    w(hr("-"))
    for v in views:
        w(f"  [{v['kind']}] {v['name']}")

# ── per-table detail ───────────────────────────────────────────────────
w("")
w(hr())
w(" PER-TABLE DETAIL")
w(hr())
for t in tabs:
    tn = t["t"]
    w("")
    w(f"▓▓ {tn}   ({counts[tn]:,} rows · {t['size']})")
    # columns
    cols = q("""
      SELECT column_name, data_type, is_nullable, column_default,
             character_maximum_length AS len
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name=%s ORDER BY ordinal_position
    """, (tn,))
    pk = {r["column_name"] for r in q("""
      SELECT kcu.column_name FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name
      WHERE tc.constraint_type='PRIMARY KEY' AND tc.table_schema='public' AND tc.table_name=%s
    """, (tn,))}
    w("   columns:")
    for c in cols:
        typ = c["data_type"] + (f"({c['len']})" if c["len"] else "")
        flags = []
        if c["column_name"] in pk: flags.append("PK")
        if c["is_nullable"] == "NO": flags.append("NOT NULL")
        if c["column_default"]: flags.append(f"default {str(c['column_default'])[:40]}")
        w(f"     - {c['column_name']:<30} {typ:<26} {' · '.join(flags)}")
    # indexes
    idx = q("""
      SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname='public' AND tablename=%s ORDER BY indexname
    """, (tn,))
    if idx:
        w("   indexes:")
        for i in idx:
            deftxt = re.sub(r".*USING ", "", i["indexdef"])
            w(f"     · {i['indexname']}: {deftxt}")
    # outgoing FKs
    out = [f for f in fks if f["src"] == tn]
    if out:
        w("   references:")
        for f in out:
            w(f"     → {f['ref']}.{f['ref_col']} (via {f['src_col']})")

    # value distribution + samples for signal-domain tables
    if SIGNAL_RE.search(tn) and not PII_RE.search(tn) and counts[tn] > 0:
        textcols = [c["column_name"] for c in cols
                    if c["data_type"] in ("character varying", "text", "USER-DEFINED", "boolean")]
        dist_shown = False
        for col in textcols:
            try:
                nd = q(f'SELECT count(DISTINCT "{col}") n FROM "{tn}"')[0]["n"]
            except Exception:
                continue
            if 0 < nd <= 30:
                if not dist_shown:
                    w("   value distribution (low-cardinality columns):")
                    dist_shown = True
                rows = q(f'SELECT "{col}"::text v, count(*) c FROM "{tn}" GROUP BY 1 ORDER BY 2 DESC LIMIT 30')
                vals = ", ".join(f"{r['v']}={r['c']:,}" for r in rows)
                w(f"     · {col}: {vals[:400]}")
        # sample rows
        try:
            sample = q(f'SELECT * FROM "{tn}" ORDER BY 1 DESC LIMIT 2')
            if sample:
                w("   sample rows:")
                for r in sample:
                    pairs = []
                    for k, v in r.items():
                        sv = str(v)
                        if len(sv) > 60: sv = sv[:57] + "..."
                        pairs.append(f"{k}={sv}")
                    w("     { " + " · ".join(pairs)[:600] + " }")
        except Exception:
            pass

# ── write ──────────────────────────────────────────────────────────────
with open(OUT, "w") as fh:
    fh.write("\n".join(L) + "\n")
print(f"✅ Wrote {OUT}  ({len(L)} lines, {len(tabs)} tables)")
