"""Typed, data-backed Custom rules. Catalog and SQL share this registry.

Legacy saved criteria retain their original evaluator. New screens use rules_v2.
No live market requests or placeholder enrichment scores are used here.
"""
import os
import time as _time
import math
from fastapi import HTTPException
from sqlalchemy import text

# How far back the screen looks. Seven days was hiding 97% of the product's own
# record — 574 signals of 59,280, and 336 of 755 pairs — from a tool whose whole
# job is researching that record. A user typing HYPEUSDT (68 calls over fifteen
# months, the last one eight days ago) was told "no matching values in this
# signal book", which was not true: it is in the book, just not in the week.
#
# Nothing was buying anything with that narrowness. Measured across the full
# book: evaluate 0.27s, catalog 1.56s — against 0.06s and 0.43s at seven days.
# A second on opening the editor is worth paying to stop lying about what exists.
BOOK_DAYS = int(os.getenv("CUSTOM_SCREEN_BOOK_DAYS", "0"))  # 0 = the whole book
BOOK_START = (
    "date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' "
    f"- interval '{BOOK_DAYS} days'"
    if BOOK_DAYS > 0
    else "'1970-01-01'::timestamptz"
)
JOINS = "FROM signals s LEFT JOIN signal_enrichment e USING(signal_id) LEFT JOIN signal_btc_correlation bc USING(signal_id) LEFT JOIN _cache_outcomes o USING(signal_id) LEFT JOIN _cache_last_updates lu USING(signal_id)"
TAGS = "COALESCE(e.entry_snapshot->'facts'->'tags_annotated', e.entry_snapshot->'tags_annotated')"
MCAP_CLEAN = "upper(regexp_replace(coalesce(s.market_cap, ''), '[,$[:space:]]', '', 'g'))"
MCAP = f"CASE WHEN {MCAP_CLEAN} ~ '^[0-9]+([.][0-9]+)?[KMBT]?$' THEN regexp_replace({MCAP_CLEAN}, '[KMBT]$', '')::numeric * CASE right({MCAP_CLEAN},1) WHEN 'T' THEN 1e12 WHEN 'B' THEN 1e9 WHEN 'M' THEN 1e6 WHEN 'K' THEN 1e3 ELSE 1 END ELSE NULL END"
FIELDS = []

def field(key, label, group, kind, expr, hint, **extra):
    FIELDS.append(dict(key=key, label=label, group=group, kind=kind, expr=expr, hint=hint, **extra))

def preset(label, op, value):
    return {'label': label, 'op': op, 'value': value}

# Groups are the question a person is asking, not the table the value lives in.
# "Entry & Targets" mixed a coin's price with the size of its move; those are
# different questions and only one of them can be compared across pairs.
CALL, SETUP = 'The call', 'The setup'
LADDER, PRICES, BTCX = 'Ladder detail', 'Published prices', 'BTC detail'

# Two hints per field. `short` is one line that always fits the card, because a
# sentence cut mid-word by a line clamp reads as a broken page; `hint` is the
# whole sentence, carried to the tooltip.

# Age in days, from a TEXT timestamp column. Both created_at and last_update_at
# are stored as text in production, so the cast is not optional.
AGE = "EXTRACT(EPOCH FROM (now() - {}::timestamptz)) / 86400.0"
RECENCY = [preset('24 hours', 'lte', 1), preset('7 days', 'lte', 7), preset('30 days', 'lte', 30), preset('90 days', 'lte', 90)]

field('pair', 'Pair', CALL, 'choice', 's.pair', 'Exact pair from Signals. Select one or more pairs.', short='Exact pair, as published.', tier='primary', control='pairs')
field('status', 'Status', CALL, 'choice', "COALESCE(o.outcome, 'open')", 'Highest level the call reached. TP levels are exact; SL is a stopped signal.', short='Highest level the call reached.', tier='primary', control='chips', order_by="CASE value WHEN 'open' THEN 0 WHEN 'sl' THEN 9 ELSE 1 END, value")
# The scraper changed case and spelling mid-book, and the screen was showing
# every spelling as its own chip: picking "High" returned 10,279 calls out of
# the 30,595 that are high risk, silently, because the other 20,316 are stored
# as "high". The handover dates prove the pairs — "med" stops on 2026-02-09 and
# "Medium" starts the same day — so casing and that one abbreviation fold, and
# Medium and Normal, which really are different labels, stay apart.
RISK = "CASE lower(NULLIF(s.risk_level, '')) WHEN 'med' THEN 'Medium' WHEN '' THEN NULL ELSE initcap(lower(s.risk_level)) END"
RISK_ORDER = "CASE value WHEN 'Low' THEN 1 WHEN 'Normal' THEN 2 WHEN 'Medium' THEN 3 WHEN 'High' THEN 4 ELSE 5 END"
field('risk', 'Risk', CALL, 'choice', RISK, 'Risk label published with the signal. Older calls spelled these differently; the spellings are folded together, but Medium and Normal remain the separate labels they are.', short='Risk label published with the call.', tier='primary', control='chips', order_by=RISK_ORDER)
# Without these two, "calls from the last 30 days" — the first question anyone
# asks of a fifteen-month book — could not be expressed at all.
field('called_days', 'Called', CALL, 'number', AGE.format('s.created_at'), 'How long ago the call was published. The book runs from December 2023 to today.', short='When the call was published.', tier='primary', control='recency', unit='days ago', min=0, presets=RECENCY)
field('updated_days', 'Last move', CALL, 'number', AGE.format('lu.last_update_at'), 'How long ago this call last hit a TP or SL. A call that has never moved has no value here.', short='When it last hit a TP or SL.', tier='primary', control='recency', unit='days ago', min=0, presets=RECENCY[:3])

# TP1:TP2:TP3:TP4 are fixed multiples of one distance and SL is another multiple
# of it. Measured on the live book: corr(TP1%, TP4%) = 0.994, corr(TP1%, SL%) =
# 0.981. Filtering two rungs at once is filtering the same number twice, and
# opposite bounds on two rungs (TP1% >= 5 with TP4% <= 10) match exactly nothing.
# So one rung is promoted to stand for the whole ladder and the rest move to
# Ladder detail, where family='ladder' lets the screen warn about the collision.
field('tp4_pct', 'Target size', SETUP, 'number', 'round(((s.target4::numeric - s.entry::numeric) / NULLIF(s.entry::numeric, 0) * 100), 2)', 'Distance from Entry to the final target, in percent. The other targets sit at fixed fractions of this, so this one number describes the whole ladder.', short='How far the final target sits from entry.', tier='primary', control='range', unit='%', sublabel='Entry → TP4', family='ladder', presets=[preset('Small <10%', 'lte', 10), preset('Normal 10–20%', 'between', [10, 20]), preset('Big 20%+', 'gte', 20)])
field('sl_distance', 'Stop distance', SETUP, 'number', 'abs(s.entry - s.stop1) / NULLIF(abs(s.entry), 0) * 100', 'Distance from Entry to SL1: |Entry − SL1| ÷ |Entry| × 100. Moves with the target size, at roughly a fifth of it.', short='How far the stop sits from entry.', tier='primary', control='range', unit='%', sublabel='Entry → SL1', family='ladder', min=0, presets=[preset('Tight <2.5%', 'lte', 2.5), preset('Normal 2.5–4.5%', 'between', [2.5, 4.5]), preset('Wide 4.5%+', 'gte', 4.5)])

field('mcap', 'Market cap', SETUP, 'number', MCAP, 'Market cap recorded with the signal, in USD. This is not the live Market sheet value.', short='Market cap recorded at call time.', tier='primary', control='range', unit='USD', min=0, presets=[preset('Micro <$10m', 'lte', 1e7), preset('Small $10–100m', 'between', [1e7, 1e8]), preset('Mid $100m–1b', 'between', [1e8, 1e9]), preset('Large $1b+', 'gte', 1e9)])
field('volume_rank', 'Volume rank', SETUP, 'number', 's.volume_rank_num', 'Published volume rank (#) at call time. Lower is a busier coin. Not Vol 24h or order-book liquidity.', short='Volume rank at call time. Lower is busier.', tier='primary', control='range', unit='#', min=1, integer=True, presets=[preset('Top 100', 'lte', 100), preset('Top 250', 'lte', 250), preset('Top 500', 'lte', 500)])

field('tags', 'Tags', CALL, 'tags', TAGS, 'Important tags from the stored entry analysis, as shown in Signal details. Some historical context tags were reconstructed later.', short='Important tags from the entry analysis.', tier='primary', control='tags')

for n in range(1, 4):
    field(f'tp{n}_pct', f'TP{n} %', LADDER, 'number', f'round(((s.target{n}::numeric - s.entry::numeric) / NULLIF(s.entry::numeric, 0) * 100), 2)', f'Percentage from Entry to TP{n}. Moves with Target size — filtering both rarely does what it looks like.', unit='%', family='ladder')
# Absolute prices span seven orders of magnitude on this book — 0.00000925 to
# 124,300 — so no threshold means the same thing on two different pairs. They
# describe a result; they cannot screen across the book. Kept valid so saved
# screens keep working, kept out of the way so nobody reaches for them first.
field('entry', 'Entry', PRICES, 'number', 's.entry', 'Published entry price, in USDT. A price threshold only compares within one pair.', unit='USDT', min=0)
for n in range(1, 5):
    field(f'tp{n}', f'TP{n}', PRICES, 'number', f's.target{n}', f'Published TP{n} price, in USDT. A missing target is unavailable.', unit='USDT', min=0)
for n in (1, 2):
    field(f'sl{n}', f'SL{n}', PRICES, 'number', f's.stop{n}', f'Published SL{n} price. SL1 is shown as SL when there is only one stop.', unit='USDT', min=0)

field('btc_align', 'BTC alignment', SETUP, 'number', "CASE WHEN bc.confidence IS NOT NULL AND bc.confidence <> 'insufficient_data' THEN (bc.interpretation->>'alignment_score')::numeric END", 'Composite BTC alignment score, not a win probability or correlation percentage.', short='How closely the coin tracked BTC.', tier='primary', control='range', min=0, max=100, presets=[preset('Low <50', 'lte', 50), preset('Mid 50–65', 'between', [50, 65]), preset('High 65+', 'gte', 65)])
field('btc_decoupled', 'Decoupled from BTC', SETUP, 'boolean', "CASE WHEN bc.confidence IS NOT NULL AND bc.confidence <> 'insufficient_data' AND bc.corr_4h_30d IS NOT NULL THEN bc.is_decoupled END", 'BTC Correlation flag: |z-score| > 2 and |correlation| < 0.5. Unavailable analysis is neither Yes nor No.', short='Broke away from BTC at call time.', tier='primary', control='bool')
for key, label, column, hint, limits in [
    ('btc_rho', 'Correlation ρ', 'bc.corr_4h_30d', 'Long-window Pearson correlation with BTC. −1 opposite, 0 no linear relationship, +1 same direction. Up to 720 hourly samples.', {'min':-1,'max':1}),
    ('btc_rho_short', 'Correlation ρ · 7d', 'bc.corr_1h_7d', 'Short-window correlation with BTC, up to 168 hourly samples. Check Sample size and Confidence.', {'min':-1,'max':1}),
    ('btc_beta', 'Beta', 'bc.beta_30d', 'Sensitivity to BTC returns, as shown in BTC Correlation. Negative values are valid.', {}),
    ('btc_r2', 'R²', 'bc.r_squared_30d', 'Explained variance in BTC Correlation, expressed from 0 to 1.', {'min':0,'max':1}),
    ('btc_z', 'Z-score', 'bc.corr_zscore', 'Signed correlation z-score from BTC Correlation.', {}),
    ('btc_tail_down', 'Tail ρ (BTC ↓)', 'bc.tail_corr_btc_down', 'Correlation on hourly BTC returns below their mean, matching Advanced Metrics. Requires sufficient tail samples.', {'min':-1,'max':1}),
    ('btc_tail_up', 'Tail ρ (BTC ↑)', 'bc.tail_corr_btc_up', 'Correlation on hourly BTC returns above their mean, matching Advanced Metrics.', {'min':-1,'max':1}),
    ('btc_downside_beta', 'Downside β', 'bc.downside_beta', 'Beta on BTC-below-mean hourly returns, as shown in Advanced Metrics.', {}),
    ('btc_vol_ratio', 'Vol Ratio', 'bc.volatility_ratio', 'Coin volatility divided by BTC volatility, as shown in Advanced Metrics.', {'min':0,'unit':'×'}),
    ('btc_coin_vol', 'Coin annualized volatility', 'bc.coin_volatility_pct', 'Annualized volatility from hourly returns, as shown under Advanced Metrics.', {'min':0,'unit':'%'}),
    # Neither of these separates anything on this book: lead/lag is 0 from the
    # 25th to the 95th percentile, and sample size runs 979 to 999. They stay
    # filterable because saved screens may use them, and stay last because a
    # filter that cannot divide the book is not a filter.
    ('btc_lead_lag', 'Lead/Lag', 'bc.lead_lag_hours', 'Estimated hours: positive means the coin leads BTC; negative means it lags. Nearly every signal on this book is 0.', {'integer':True,'unit':'h'}),
    ('btc_samples', 'Sample size', 'bc.sample_size', 'Number of overlapping samples used for BTC analysis. A data-quality note rather than a screening criterion: almost every signal has 979–999.', {'min':1,'integer':True}),
]:
    field(key, label, BTCX, 'number', f"CASE WHEN bc.confidence IS NOT NULL AND bc.confidence <> 'insufficient_data' THEN {column} END", hint, **limits)
field('btc_confidence', 'Confidence · BTC', BTCX, 'choice', "NULLIF(bc.confidence, 'insufficient_data')", 'Data confidence shown inside BTC Correlation. Unavailable analysis does not match.', options=['high','medium','low'])

BY_KEY = {f['key']:f for f in FIELDS}
OPS = {'number': {'gte','lte','between','eq'}, 'choice': {'in','not_in'}, 'tags': {'any','all','none'}, 'boolean': {'eq'}}

def validate_rules(rules):
    def bad(message):
        raise HTTPException(422, message)
    if not isinstance(rules, list) or not 1 <= len(rules) <= len(FIELDS):
        bad('Add at least one filter.')
    seen = set()
    for r in rules:
        if not isinstance(r, dict) or set(r) != {'field','op','value'} or not isinstance(r['field'], str) or not isinstance(r['op'], str):
            bad('Invalid filter structure.')
        f = BY_KEY.get(r['field'])
        if not f or r['field'] in seen:
            bad('Unknown or duplicate filter field.')
        seen.add(r['field'])
        if r['op'] not in OPS[f['kind']]:
            bad(f"Invalid condition for {f['label']}.")
        value = r['value']
        if f['kind'] == 'number':
            values = value if r['op'] == 'between' else [value]
            if not isinstance(values, list) or len(values) != (2 if r['op'] == 'between' else 1):
                bad(f"Enter valid bounds for {f['label']}.")
            for v in values:
                if isinstance(v, bool) or not isinstance(v, (int,float)) or not math.isfinite(v):
                    bad(f"Enter a number for {f['label']}.")
                if ('min' in f and v < f['min']) or ('max' in f and v > f['max']) or (f.get('integer') and int(v) != v):
                    bad(f"Value outside the supported range for {f['label']}.")
            if len(values) == 2 and values[0] > values[1]:
                bad('Minimum cannot exceed maximum.')
        elif f['kind'] == 'boolean':
            if not isinstance(value, bool):
                bad('Choose Yes or No.')
        else:
            if not isinstance(value, list) or not 1 <= len(value) <= 600 or any(not isinstance(v,str) or not v.strip() or len(v)>100 for v in value):
                bad(f"Choose at least one value for {f['label']}.")
            if len(set(value)) != len(value):
                bad('Duplicate values are not allowed.')
            if f.get('options') and any(v not in f['options'] for v in value):
                bad('Unsupported option.')
    return rules


def rule_conditions(rules):
    validate_rules(rules)
    where, known, params = [], [], {}
    for i, r in enumerate(rules):
        f = BY_KEY[r['field']]
        expr = '(' + f['expr'] + ')'
        param = f'rule_{i}'
        known.append(f'{expr} IS NOT NULL')
        params[param] = r['value']
        if f['kind'] == 'tags':
            match = f"(SELECT count(DISTINCT t->>'name') FROM jsonb_array_elements(COALESCE({expr}, '[]'::jsonb)) t WHERE (t->>'important')::boolean IS TRUE AND t->>'name' = ANY(:{param}))"
            if r['op'] == 'all':
                params[param+'_n'] = len(r['value'])
                cond = f'{match} = :{param}_n'
            else:
                cond = f"{match} {'= 0' if r['op']=='none' else '> 0'}"
        elif r['op'] in ('in','not_in'):
            cond = f"{expr} {'= ANY' if r['op']=='in' else '<> ALL'}(:{param})"
        elif r['op'] == 'between':
            params[param], params[param+'_max'] = r['value']
            cond = f'{expr} BETWEEN :{param} AND :{param}_max'
        else:
            operator = {'gte':'>=', 'lte':'<=', 'eq':'='}[r['op']]
            cond = f'{expr} {operator} :{param}'
        where.append(f'({expr} IS NOT NULL AND {cond})')
    return where, known, params


def evaluate_rules(rules, db):
    where, known, params = rule_conditions(rules)
    rows = db.execute(text(f"SELECT s.signal_id, ({' AND '.join(where)}) matched, ({' AND '.join(known)}) available {JOINS} WHERE s.created_at::timestamptz >= {BOOK_START}"), params).fetchall()
    return {'signal_ids': [str(r[0]) for r in rows if r[1]], 'total':len(rows),
            'unavailable':sum(1 for r in rows if not r[2])}


# The catalog is the same answer for every user — it describes the signal book,
# not the person asking — and widening the window took it from 0.43s to 2.2s on
# every open of the editor. Two minutes of staleness costs nothing here: the
# worst case is a pair that appeared moments ago missing from the list until the
# next refresh, which is exactly the situation that existed permanently before.
_CATALOG_CACHE: dict = {"at": 0.0, "value": None}
CATALOG_TTL_S = float(os.getenv("CUSTOM_SCREEN_CATALOG_TTL", "120"))


def _cached_catalog(db):
    now = _time.time()
    if _CATALOG_CACHE["value"] is not None and now - _CATALOG_CACHE["at"] < CATALOG_TTL_S:
        return _CATALOG_CACHE["value"]
    value = _build_catalog(db)
    _CATALOG_CACHE.update(at=now, value=value)
    return value


def _build_catalog(db):
    fields = [{k:v for k,v in f.items() if k != 'expr'} for f in FIELDS]
    counts_sql = ', '.join(f"count(*) FILTER (WHERE ({f['expr']}) IS NOT NULL)" for f in FIELDS)
    coverage = db.execute(text(f'SELECT {counts_sql} {JOINS} WHERE s.created_at::timestamptz >= {BOOK_START}')).one()
    for index, f in enumerate(fields):
        source = BY_KEY[f['key']]['expr']
        f['available'] = coverage[index]
        if f['key'] in ('pair','risk','status'):
            # SELECT DISTINCT refuses an ORDER BY expression that is not in its
            # select list, so the distinct pass is wrapped and the declared
            # ordering — written against `value` — runs outside it.
            order = BY_KEY[f['key']].get('order_by', 'value')
            f['options'] = [r[0] for r in db.execute(text(f'SELECT value FROM (SELECT DISTINCT ({source}) value {JOINS} WHERE s.created_at::timestamptz >= {BOOK_START} AND ({source}) IS NOT NULL) t ORDER BY {order}')).fetchall()]
        elif f['key'] == 'tags':
            f['options'] = [r[0] for r in db.execute(text(f"SELECT DISTINCT t->>'name' value FROM signals s JOIN signal_enrichment e USING(signal_id) CROSS JOIN LATERAL jsonb_array_elements(COALESCE({TAGS}, '[]'::jsonb)) t WHERE s.created_at::timestamptz >= {BOOK_START} AND (t->>'important')::boolean IS TRUE ORDER BY value")).fetchall()]
    row = db.execute(text(f'SELECT count(*), {BOOK_START}, now() FROM signals s WHERE s.created_at::timestamptz >= {BOOK_START}')).one()
    return {'fields':fields, 'total':row[0], 'window_start':row[1].isoformat(), 'as_of':row[2].isoformat()}


# Public name keeps its meaning; the caching is an implementation detail.
catalog = _cached_catalog
