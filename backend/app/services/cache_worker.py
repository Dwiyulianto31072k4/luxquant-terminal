# backend/app/services/cache_worker.py
"""
LuxQuant Terminal - Background Cache Worker
Pre-computes expensive queries and stores results in Redis.

OPTIMIZED:
- Pre-computes "Last 7 Days" filter (most common frontend request)
- Page 1 cached with higher priority
- Signal CTE computed once per cycle, reused across queries
- Market data from Binance every 15s
- CoinGecko data every 120s (rate limit friendly)
"""
import asyncio
import time
import re
import httpx
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from email.utils import parsedate_to_datetime
from sqlalchemy import text
from app.core.database import SessionLocal
from app.core.redis import cache_set, cache_get, is_redis_available

# Worker intervals
SIGNAL_INTERVAL = 30   # seconds
MARKET_INTERVAL = 15   # seconds

# External APIs
BINANCE_SPOT_API = "https://api.binance.com"
BINANCE_FUTURES_API = "https://fapi.binance.com"
COINGECKO_API = "https://api.coingecko.com/api/v3"
FEAR_GREED_API = "https://api.alternative.me/fng"
MEMPOOL_API = "https://mempool.space/api"
BLOCKCHAIN_API = "https://api.blockchain.info"

# RSS Feeds for BTC news
BTC_NEWS_FEEDS = [
    "https://cointelegraph.com/rss/tag/bitcoin",
    "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "https://decrypt.co/feed",
]

TIMEOUT = 15.0


# ============================================
# OPTIMIZED CTE — computed ONCE as materialized view in temp table
# ============================================

def precompute_outcomes(db):
    """
    Pre-compute signal outcomes ONCE per cycle into a temp table.
    This avoids running the expensive CTE for every single query.
    """
    db.execute(text("DROP TABLE IF EXISTS _cache_outcomes"))
    db.execute(text("""
        CREATE TEMP TABLE _cache_outcomes AS
        SELECT signal_id, outcome
        FROM (
            SELECT 
                signal_id,
                CASE 
                    WHEN LOWER(update_type) LIKE '%tp4%' OR LOWER(update_type) LIKE '%target 4%' THEN 'tp4'
                    WHEN LOWER(update_type) LIKE '%tp3%' OR LOWER(update_type) LIKE '%target 3%' THEN 'tp3'
                    WHEN LOWER(update_type) LIKE '%tp2%' OR LOWER(update_type) LIKE '%target 2%' THEN 'tp2'
                    WHEN LOWER(update_type) LIKE '%tp1%' OR LOWER(update_type) LIKE '%target 1%' THEN 'tp1'
                    WHEN LOWER(update_type) LIKE '%sl%' OR LOWER(update_type) LIKE '%stop%' THEN 'sl'
                    ELSE NULL
                END as outcome,
                ROW_NUMBER() OVER (PARTITION BY signal_id ORDER BY 
                    CASE 
                        WHEN LOWER(update_type) LIKE '%tp4%' OR LOWER(update_type) LIKE '%target 4%' THEN 4
                        WHEN LOWER(update_type) LIKE '%tp3%' OR LOWER(update_type) LIKE '%target 3%' THEN 3
                        WHEN LOWER(update_type) LIKE '%tp2%' OR LOWER(update_type) LIKE '%target 2%' THEN 2
                        WHEN LOWER(update_type) LIKE '%tp1%' OR LOWER(update_type) LIKE '%target 1%' THEN 1
                        WHEN LOWER(update_type) LIKE '%sl%' OR LOWER(update_type) LIKE '%stop%' THEN 0
                        ELSE -1
                    END DESC
                ) as rn
            FROM signal_updates
            WHERE update_type IS NOT NULL
        ) ranked
        WHERE rn = 1 AND outcome IS NOT NULL
    """))
    db.execute(text("CREATE INDEX ON _cache_outcomes(signal_id)"))
    db.execute(text("CREATE INDEX ON _cache_outcomes(outcome)"))
    db.commit()


# ============================================
# SIGNAL QUERIES (using pre-computed temp table)
# ============================================

def status_to_filter(status_input):
    mapping = {
        'open': 'open', 'tp1': 'tp1', 'tp2': 'tp2', 'tp3': 'tp3',
        'closed_win': 'tp4', 'tp4': 'tp4', 'closed_loss': 'sl', 'sl': 'sl',
    }
    return mapping.get(status_input.lower(), status_input.lower()) if status_input else None


def query_signals_page(db, page=1, page_size=20, status=None, pair=None,
                       risk_level=None, sort_by="created_at", sort_order="desc",
                       date_from=None, date_to=None):
    """Query signals using pre-computed _cache_outcomes temp table"""
    conditions = []
    params = {}

    if pair:
        conditions.append("UPPER(s.pair) LIKE :pair")
        params["pair"] = f"%{pair.upper()}%"
    if risk_level:
        rl = risk_level.lower()
        if rl in ['med', 'medium']:
            conditions.append("LOWER(s.risk_level) LIKE 'med%'")
        else:
            conditions.append("LOWER(s.risk_level) LIKE :risk")
            params["risk"] = f"{rl}%"
    if date_from:
        conditions.append("s.created_at >= :date_from")
        params["date_from"] = date_from
    if date_to:
        conditions.append("s.created_at <= :date_to")
        params["date_to"] = f"{date_to} 23:59:59"
    if status:
        mapped = status_to_filter(status)
        if mapped == 'open':
            conditions.append("so.outcome IS NULL")
        else:
            conditions.append("so.outcome = :status_filter")
            params["status_filter"] = mapped

    where_clause = " AND ".join(conditions) if conditions else "1=1"
    valid_sorts = {
        'created_at': 's.call_message_id', 'pair': 's.pair', 'entry': 's.entry',
        'call_message_id': 's.call_message_id', 'status': "COALESCE(so.outcome, 'open')",
        'risk_level': "CASE WHEN LOWER(s.risk_level) LIKE 'low%' THEN 1 WHEN LOWER(s.risk_level) LIKE 'med%' THEN 2 WHEN LOWER(s.risk_level) LIKE 'high%' THEN 3 ELSE 4 END",
    }
    sort_col = valid_sorts.get(sort_by, 's.call_message_id')
    sort_dir = 'DESC' if sort_order == 'desc' else 'ASC'

    # Count
    total = db.execute(text(f"""
        SELECT COUNT(*) FROM signals s
        LEFT JOIN _cache_outcomes so ON s.signal_id = so.signal_id
        WHERE {where_clause}
    """), params).scalar() or 0
    total_pages = (total + page_size - 1) // page_size if total > 0 else 1
    offset = (page - 1) * page_size

    # Data
    params["limit"] = page_size
    params["offset"] = offset
    rows = db.execute(text(f"""
        SELECT s.signal_id, s.channel_id, s.call_message_id, s.message_link,
            s.pair, s.entry, s.target1, s.target2, s.target3, s.target4,
            s.stop1, s.stop2, s.risk_level, s.volume_rank_num, s.volume_rank_den,
            s.created_at,
            CASE WHEN so.outcome = 'tp4' THEN 'closed_win' WHEN so.outcome = 'sl' THEN 'closed_loss'
                 WHEN so.outcome IS NOT NULL THEN so.outcome ELSE 'open' END as derived_status,
            s.market_cap
        FROM signals s LEFT JOIN _cache_outcomes so ON s.signal_id = so.signal_id
        WHERE {where_clause} ORDER BY {sort_col} {sort_dir} LIMIT :limit OFFSET :offset
    """), params).fetchall()

    items = []
    for r in rows:
        items.append({
            "signal_id": r[0], "channel_id": r[1], "call_message_id": r[2], "message_link": r[3],
            "pair": r[4], "entry": float(r[5]) if r[5] else None,
            "target1": float(r[6]) if r[6] else None, "target2": float(r[7]) if r[7] else None,
            "target3": float(r[8]) if r[8] else None, "target4": float(r[9]) if r[9] else None,
            "stop1": float(r[10]) if r[10] else None, "stop2": float(r[11]) if r[11] else None,
            "risk_level": r[12], "volume_rank_num": r[13], "volume_rank_den": r[14],
            "created_at": str(r[15]) if r[15] else None, "status": r[16], "market_cap": r[17],
        })

    return {"items": items, "total": total, "page": page, "page_size": page_size, "total_pages": total_pages}


def query_signals_stats(db):
    row = db.execute(text("""
        SELECT COUNT(*), COUNT(CASE WHEN so.outcome IS NULL THEN 1 END),
            SUM(CASE WHEN so.outcome='tp1' THEN 1 ELSE 0 END),
            SUM(CASE WHEN so.outcome='tp2' THEN 1 ELSE 0 END),
            SUM(CASE WHEN so.outcome='tp3' THEN 1 ELSE 0 END),
            SUM(CASE WHEN so.outcome='tp4' THEN 1 ELSE 0 END),
            SUM(CASE WHEN so.outcome='sl' THEN 1 ELSE 0 END)
        FROM signals s LEFT JOIN _cache_outcomes so ON s.signal_id = so.signal_id
    """)).fetchone()
    if not row:
        return {"total_signals":0,"open_signals":0,"tp1_signals":0,"tp2_signals":0,"tp3_signals":0,"closed_win":0,"closed_loss":0,"win_rate":0}
    t,o,t1,t2,t3,cw,cl = [int(x or 0) for x in row]
    tc = t1+t2+t3+cw+cl
    tw = t1+t2+t3+cw
    wr = (tw/tc*100) if tc>0 else 0
    return {"total_signals":t,"open_signals":o,"tp1_signals":t1,"tp2_signals":t2,"tp3_signals":t3,"closed_win":cw,"closed_loss":cl,"win_rate":round(wr,2)}


def query_active_signals(db, limit=20):
    rows = db.execute(text(f"""
        SELECT s.signal_id, s.channel_id, s.call_message_id, s.message_link,
            s.pair, s.entry, s.target1, s.target2, s.target3, s.target4,
            s.stop1, s.stop2, s.risk_level, s.volume_rank_num, s.volume_rank_den,
            s.created_at, s.market_cap
        FROM signals s LEFT JOIN _cache_outcomes so ON s.signal_id = so.signal_id
        WHERE so.outcome IS NULL ORDER BY s.call_message_id DESC LIMIT :limit
    """), {"limit": limit}).fetchall()
    return {"items": [
        {"signal_id":r[0],"channel_id":r[1],"call_message_id":r[2],"message_link":r[3],
         "pair":r[4],"entry":float(r[5]) if r[5] else None,
         "target1":float(r[6]) if r[6] else None,"target2":float(r[7]) if r[7] else None,
         "target3":float(r[8]) if r[8] else None,"target4":float(r[9]) if r[9] else None,
         "stop1":float(r[10]) if r[10] else None,"stop2":float(r[11]) if r[11] else None,
         "risk_level":r[12],"volume_rank_num":r[13],"volume_rank_den":r[14],
         "created_at":str(r[15]) if r[15] else None,"status":"open","market_cap":r[16]}
        for r in rows
    ]}


def query_analyze(db, time_range="all", trend_mode="weekly"):
    """Pre-compute the full analyze response using pre-computed outcomes"""
    date_filter = ""
    if time_range != 'all':
        now = datetime.utcnow()
        start_map = {
            'ytd': datetime(now.year, 1, 1),
            'mtd': datetime(now.year, now.month, 1),
            '30d': now - timedelta(days=30),
            '7d': now - timedelta(days=7),
        }
        sd = start_map.get(time_range)
        if sd:
            date_filter = f"AND s.created_at >= '{sd.strftime('%Y-%m-%d')}'"

    # Query 1: Pair metrics
    rows = db.execute(text(f"""
        WITH pair_stats AS (
            SELECT s.pair, COUNT(*) as total_signals, COUNT(so.outcome) as closed_trades,
                COUNT(*) - COUNT(so.outcome) as open_signals,
                SUM(CASE WHEN so.outcome='tp1' THEN 1 ELSE 0 END) as tp1_count,
                SUM(CASE WHEN so.outcome='tp2' THEN 1 ELSE 0 END) as tp2_count,
                SUM(CASE WHEN so.outcome='tp3' THEN 1 ELSE 0 END) as tp3_count,
                SUM(CASE WHEN so.outcome='tp4' THEN 1 ELSE 0 END) as tp4_count,
                SUM(CASE WHEN so.outcome='sl' THEN 1 ELSE 0 END) as sl_count
            FROM signals s LEFT JOIN _cache_outcomes so ON s.signal_id = so.signal_id
            WHERE s.pair IS NOT NULL {date_filter} GROUP BY s.pair
        )
        SELECT pair, total_signals, closed_trades, open_signals, tp1_count, tp2_count, tp3_count, tp4_count, sl_count,
            CASE WHEN closed_trades > 0 THEN ROUND((tp1_count+tp2_count+tp3_count+tp4_count)::numeric/closed_trades*100,2) ELSE 0 END as win_rate,
            ROUND(CASE WHEN closed_trades > 0 THEN (tp1_count+tp2_count+tp3_count+tp4_count)::numeric/closed_trades*100*0.4 ELSE 0 END +
                LEAST(total_signals::numeric/20*100,100)*0.3 +
                CASE WHEN closed_trades > 0 THEN ((tp4_count*4+tp3_count*3+tp2_count*2+tp1_count*1)::numeric/closed_trades*25)*0.3 ELSE 0 END, 2) as performance_score
        FROM pair_stats ORDER BY win_rate DESC, closed_trades DESC
    """)).fetchall()

    pair_metrics = []
    ts=tc=to_=t1=t2=t3=t4=tsl=0
    for r in rows:
        pair_metrics.append({"pair":r[0],"total_signals":r[1],"closed_trades":r[2],"open_signals":r[3],
            "tp1_count":r[4],"tp2_count":r[5],"tp3_count":r[6],"tp4_count":r[7],"sl_count":r[8],
            "win_rate":float(r[9]) if r[9] else 0,"performance_score":float(r[10]) if r[10] else 0})
        ts+=r[1]; tc+=r[2]; to_+=r[3]; t1+=r[4]; t2+=r[5]; t3+=r[6]; t4+=r[7]; tsl+=r[8]

    tw = t1+t2+t3+t4
    wr = (tw/tc*100) if tc > 0 else 0

    # Query 2: Win rate trend
    dt = "DATE(s.created_at)" if trend_mode == 'daily' else "DATE(DATE_TRUNC('week', s.created_at::timestamp))"
    trend_rows = db.execute(text(f"""
        SELECT {dt} as period, COUNT(so.outcome) as total_closed,
            SUM(CASE WHEN so.outcome IN ('tp1','tp2','tp3','tp4') THEN 1 ELSE 0 END) as winners,
            SUM(CASE WHEN so.outcome='sl' THEN 1 ELSE 0 END) as losers,
            CASE WHEN COUNT(so.outcome)>0 THEN ROUND(SUM(CASE WHEN so.outcome IN ('tp1','tp2','tp3','tp4') THEN 1 ELSE 0 END)::numeric/COUNT(so.outcome)*100,2) ELSE 0 END as win_rate
        FROM signals s INNER JOIN _cache_outcomes so ON s.signal_id = so.signal_id
        WHERE s.created_at IS NOT NULL {date_filter}
        GROUP BY {dt} HAVING COUNT(so.outcome) >= 3 ORDER BY period ASC
    """)).fetchall()
    win_rate_trend = [{"period":str(r[0]),"total_closed":int(r[1]),"winners":int(r[2]),"losers":int(r[3]),"win_rate":float(r[4]) if r[4] else 0} for r in trend_rows]

    # Query 3: Risk:Reward
    rr_rows = db.execute(text(f"""
        SELECT so.outcome as level, COUNT(*) as cnt,
            AVG(CASE WHEN s.entry>0 AND s.stop1>0 AND ABS(s.entry-s.stop1)>0 THEN
                CASE so.outcome WHEN 'tp1' THEN ABS(s.target1-s.entry)/ABS(s.entry-s.stop1)
                    WHEN 'tp2' THEN ABS(s.target2-s.entry)/ABS(s.entry-s.stop1)
                    WHEN 'tp3' THEN ABS(s.target3-s.entry)/ABS(s.entry-s.stop1)
                    WHEN 'tp4' THEN ABS(s.target4-s.entry)/ABS(s.entry-s.stop1)
                    WHEN 'sl' THEN -1.0 ELSE 0 END ELSE NULL END) as avg_rr
        FROM signals s INNER JOIN _cache_outcomes so ON s.signal_id = so.signal_id
        WHERE s.entry>0 AND s.stop1>0 AND s.target1>0 {date_filter}
        GROUP BY so.outcome ORDER BY CASE so.outcome WHEN 'tp1' THEN 1 WHEN 'tp2' THEN 2 WHEN 'tp3' THEN 3 WHEN 'tp4' THEN 4 WHEN 'sl' THEN 5 END
    """)).fetchall()

    risk_reward = []
    trw = trc = 0
    for r in rr_rows:
        lv=str(r[0]); cnt=int(r[1]); arr=float(r[2]) if r[2] else 0
        risk_reward.append({"level":lv.upper(),"avg_rr":round(arr,2),"count":cnt})
        if lv != 'sl': trw += arr*cnt; trc += cnt
    avg_rr = round(trw/trc, 2) if trc > 0 else 0

    # Query 4: Risk Distribution
    risk_dist_rows = db.execute(text(f"""
        SELECT 
            CASE 
                WHEN LOWER(s.risk_level) LIKE 'low%' THEN 'Low'
                WHEN LOWER(s.risk_level) LIKE 'nor%' OR LOWER(s.risk_level) LIKE 'med%' THEN 'Normal'
                WHEN LOWER(s.risk_level) LIKE 'high%' THEN 'High'
                ELSE 'Unknown'
            END as risk_group,
            COUNT(*) as total_signals,
            COUNT(so.outcome) as closed_trades,
            SUM(CASE WHEN so.outcome IN ('tp1','tp2','tp3','tp4') THEN 1 ELSE 0 END) as winners,
            SUM(CASE WHEN so.outcome = 'sl' THEN 1 ELSE 0 END) as losers,
            CASE WHEN COUNT(so.outcome) > 0 
                THEN ROUND(SUM(CASE WHEN so.outcome IN ('tp1','tp2','tp3','tp4') THEN 1 ELSE 0 END)::numeric / COUNT(so.outcome) * 100, 2)
                ELSE 0 END as win_rate,
            AVG(CASE WHEN so.outcome IN ('tp1','tp2','tp3','tp4') AND s.entry > 0 AND s.stop1 > 0 AND ABS(s.entry - s.stop1) > 0 THEN
                CASE so.outcome
                    WHEN 'tp1' THEN ABS(s.target1 - s.entry) / ABS(s.entry - s.stop1)
                    WHEN 'tp2' THEN ABS(s.target2 - s.entry) / ABS(s.entry - s.stop1)
                    WHEN 'tp3' THEN ABS(s.target3 - s.entry) / ABS(s.entry - s.stop1)
                    WHEN 'tp4' THEN ABS(s.target4 - s.entry) / ABS(s.entry - s.stop1)
                END ELSE NULL END) as avg_rr_val
        FROM signals s
        LEFT JOIN _cache_outcomes so ON s.signal_id = so.signal_id
        WHERE s.risk_level IS NOT NULL {date_filter}
        GROUP BY risk_group
        ORDER BY 1
    """)).fetchall()

    risk_order = {'Low': 0, 'Normal': 1, 'High': 2}
    risk_distribution = sorted([
        {"risk_level": r[0], "total_signals": int(r[1]), "closed_trades": int(r[2]),
         "winners": int(r[3]), "losers": int(r[4]), "win_rate": float(r[5]) if r[5] else 0,
         "avg_rr": round(float(r[6]), 2) if r[6] else 0}
        for r in risk_dist_rows if r[0] != 'Unknown'
    ], key=lambda x: risk_order.get(x["risk_level"], 9))

    # Query 5: Risk Trend (win rate per risk level over time)
    risk_trend_dt = "DATE(s.created_at)" if trend_mode == 'daily' else "DATE(DATE_TRUNC('week', s.created_at::timestamp))"
    risk_trend_rows = db.execute(text(f"""
        SELECT 
            {risk_trend_dt} as period,
            CASE 
                WHEN LOWER(s.risk_level) LIKE 'low%' THEN 'low'
                WHEN LOWER(s.risk_level) LIKE 'nor%' OR LOWER(s.risk_level) LIKE 'med%' THEN 'normal'
                WHEN LOWER(s.risk_level) LIKE 'high%' THEN 'high'
            END as risk_group,
            COUNT(so.outcome) as closed,
            SUM(CASE WHEN so.outcome IN ('tp1','tp2','tp3','tp4') THEN 1 ELSE 0 END) as winners
        FROM signals s
        INNER JOIN _cache_outcomes so ON s.signal_id = so.signal_id
        WHERE s.risk_level IS NOT NULL AND LOWER(s.risk_level) NOT LIKE 'unk%' {date_filter}
        GROUP BY period, risk_group
        HAVING COUNT(so.outcome) >= 2
        ORDER BY period ASC
    """)).fetchall()

    risk_trend_raw = {}
    for r in risk_trend_rows:
        p = str(r[0])
        if p not in risk_trend_raw:
            risk_trend_raw[p] = {"period": p, "low_wr": None, "normal_wr": None, "high_wr": None, "low_count": 0, "normal_count": 0, "high_count": 0}
        rg = r[1]
        closed_cnt = int(r[2])
        winners_cnt = int(r[3])
        wr_val = round(winners_cnt / closed_cnt * 100, 2) if closed_cnt > 0 else None
        if rg == 'low':
            risk_trend_raw[p]["low_wr"] = wr_val
            risk_trend_raw[p]["low_count"] = closed_cnt
        elif rg == 'normal':
            risk_trend_raw[p]["normal_wr"] = wr_val
            risk_trend_raw[p]["normal_count"] = closed_cnt
        elif rg == 'high':
            risk_trend_raw[p]["high_wr"] = wr_val
            risk_trend_raw[p]["high_count"] = closed_cnt

    risk_trend = sorted(risk_trend_raw.values(), key=lambda x: x["period"])

    return {
        "stats": {"total_signals":ts,"closed_trades":tc,"open_signals":to_,"win_rate":round(wr,2),
            "total_winners":tw,"tp1_count":t1,"tp2_count":t2,"tp3_count":t3,"tp4_count":t4,"sl_count":tsl,"active_pairs":len(pair_metrics)},
        "pair_metrics": pair_metrics,
        "win_rate_trend": win_rate_trend,
        "risk_reward": risk_reward,
        "avg_risk_reward": avg_rr,
        "risk_distribution": risk_distribution,
        "risk_trend": risk_trend,
        "time_range": time_range,
    }


# ============================================
# MARKET DATA FETCHERS
# ============================================

async def fetch_market_overview():
    """
    Fetch market overview. Tries Binance Futures first, falls back to Spot.
    """
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            btc_res = await client.get(f"{BINANCE_SPOT_API}/api/v3/ticker/24hr", params={"symbol": "BTCUSDT"})
            btc_data = btc_res.json()
            btc_price = float(btc_data["lastPrice"])

            btc_info = {
                "price": btc_price,
                "high_24h": float(btc_data["highPrice"]),
                "low_24h": float(btc_data["lowPrice"]),
                "volume_24h": float(btc_data["quoteVolume"]),
                "price_change_24h": float(btc_data["priceChange"]),
                "price_change_pct": float(btc_data["priceChangePercent"]),
            }

            # Try Futures data (may fail on some networks)
            funding_rates = []
            long_short = None
            open_interest = None
            oi_hist = []
            top_coins = []
            source = "full"

            try:
                # Funding rates
                for sym in ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"]:
                    try:
                        fr = await client.get(f"{BINANCE_FUTURES_API}/fapi/v1/fundingRate", params={"symbol": sym, "limit": 1})
                        d = fr.json()
                        if d and isinstance(d, list):
                            funding_rates.append({"symbol": sym.replace("USDT",""), "rate": float(d[0]["fundingRate"]), "time": int(d[0]["fundingTime"])})
                    except: continue

                # Long/short ratio
                ls = await client.get(f"{BINANCE_FUTURES_API}/futures/data/globalLongShortAccountRatio", params={"symbol":"BTCUSDT","period":"5m","limit":1})
                ls_data = ls.json()
                if ls_data and isinstance(ls_data, list):
                    long_short = {"symbol":"BTCUSDT","longAccount":float(ls_data[0]["longAccount"]),"shortAccount":float(ls_data[0]["shortAccount"]),"longShortRatio":float(ls_data[0]["longShortRatio"]),"timestamp":int(ls_data[0]["timestamp"])}

                # Open Interest
                oi = await client.get(f"{BINANCE_FUTURES_API}/fapi/v1/openInterest", params={"symbol":"BTCUSDT"})
                oi_val = float(oi.json()["openInterest"])
                open_interest = {"symbol":"BTCUSDT","openInterest":oi_val,"openInterestUsd":oi_val*btc_price}

                # OI History
                oih = await client.get(f"{BINANCE_FUTURES_API}/futures/data/openInterestHist", params={"symbol":"BTCUSDT","period":"1h","limit":24})
                oi_hist = [{"timestamp":int(i["timestamp"]),"sumOpenInterestValue":float(i["sumOpenInterestValue"])} for i in oih.json()]

            except Exception as futures_err:
                print(f"⚠️ Futures unavailable in worker ({futures_err}), using Spot fallback")
                source = "spot_fallback"

                # Fallback: fetch top coins from Spot
                for sym in ["ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","ADAUSDT","DOGEUSDT"]:
                    try:
                        res = await client.get(f"{BINANCE_SPOT_API}/api/v3/ticker/24hr", params={"symbol": sym})
                        if res.status_code == 200:
                            d = res.json()
                            top_coins.append({"symbol":sym.replace("USDT",""),"price":float(d["lastPrice"]),"change_pct":float(d["priceChangePercent"]),"volume_24h":float(d["quoteVolume"])})
                    except: continue

            result = {
                "btc": btc_info,
                "fundingRates": funding_rates,
                "longShortRatio": long_short,
                "openInterest": open_interest,
                "oiHistory": oi_hist,
                "topCoins": top_coins,
                "timestamp": datetime.utcnow().isoformat(),
                "source": source,
            }
            return result

    except Exception as e:
        print(f"❌ Market overview fetch error: {e}")
        return None


async def fetch_bitcoin_coingecko():
    """Fetch Bitcoin + global + fear&greed from CoinGecko"""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            btc_res, global_res, fg_res = await asyncio.gather(
                client.get(f"{COINGECKO_API}/coins/bitcoin", params={"localization":"false","tickers":"false","community_data":"false","developer_data":"false"}),
                client.get(f"{COINGECKO_API}/global"),
                client.get(f"{FEAR_GREED_API}/?limit=1"),
                return_exceptions=True,
            )

            btc_data = btc_res.json() if not isinstance(btc_res, Exception) and btc_res.status_code == 200 else None
            global_data = global_res.json().get("data") if not isinstance(global_res, Exception) and global_res.status_code == 200 else None

            fear_greed = {"value": 50, "label": "Neutral"}
            if not isinstance(fg_res, Exception) and fg_res.status_code == 200:
                fg = fg_res.json()
                if fg.get("data") and len(fg["data"]) > 0:
                    fear_greed = {"value": int(fg["data"][0]["value"]), "label": fg["data"][0]["value_classification"]}

            if not btc_data: return None
            md = btc_data.get("market_data", {})

            return {
                "price": md.get("current_price",{}).get("usd",0),
                "priceChange24h": md.get("price_change_percentage_24h",0),
                "priceChange7d": md.get("price_change_percentage_7d",0),
                "priceChange30d": md.get("price_change_percentage_30d",0),
                "high24h": md.get("high_24h",{}).get("usd",0),
                "low24h": md.get("low_24h",{}).get("usd",0),
                "ath": md.get("ath",{}).get("usd",0),
                "athChange": md.get("ath_change_percentage",{}).get("usd",0),
                "marketCap": md.get("market_cap",{}).get("usd",0),
                "marketCapRank": btc_data.get("market_cap_rank",1),
                "volume24h": md.get("total_volume",{}).get("usd",0),
                "circulatingSupply": md.get("circulating_supply",0),
                "maxSupply": md.get("max_supply") or 21000000,
                "dominance": global_data.get("market_cap_percentage",{}).get("btc",0) if global_data else 0,
                "fearGreed": fear_greed,
            }
    except Exception as e:
        print(f"❌ CoinGecko fetch error: {e}")
        return None


async def fetch_global_coingecko():
    """Fetch global market data + top coins + fear&greed"""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            global_res, coins_res, fg_res = await asyncio.gather(
                client.get(f"{COINGECKO_API}/global"),
                client.get(f"{COINGECKO_API}/coins/markets", params={"vs_currency":"usd","order":"market_cap_desc","per_page":20,"page":1,"sparkline":"false","price_change_percentage":"24h,7d"}),
                client.get(f"{FEAR_GREED_API}/?limit=7"),
                return_exceptions=True,
            )
            global_data = global_res.json().get("data") if not isinstance(global_res, Exception) and global_res.status_code == 200 else None
            coins_data = coins_res.json() if not isinstance(coins_res, Exception) and coins_res.status_code == 200 else []

            fear_greed = {"value":50,"label":"Neutral","yesterday":50,"lastWeek":50}
            if not isinstance(fg_res, Exception) and fg_res.status_code == 200:
                fg = fg_res.json()
                if fg.get("data") and len(fg["data"]) > 0:
                    fear_greed = {
                        "value": int(fg["data"][0]["value"]), "label": fg["data"][0]["value_classification"],
                        "yesterday": int(fg["data"][1]["value"]) if len(fg["data"])>1 else 50,
                        "lastWeek": int(fg["data"][6]["value"]) if len(fg["data"])>6 else 50,
                    }
            return {"global": global_data, "coins": coins_data, "fearGreed": fear_greed}
    except Exception as e:
        print(f"❌ Global CoinGecko fetch error: {e}")
        return None


async def fetch_coins_market(per_page=100, page=1, order="market_cap_desc"):
    """Fetch coins market data from CoinGecko"""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            res = await client.get(f"{COINGECKO_API}/coins/markets", params={
                "vs_currency":"usd","order":order,"per_page":per_page,"page":page,
                "sparkline":"false","price_change_percentage":"1h,24h,7d"
            })
            if res.status_code == 200:
                return res.json()
            return None
    except Exception as e:
        print(f"❌ Coins market fetch error: {e}")
        return None


# ============================================
# BACKGROUND WORKERS
# ============================================

def get_7d_date():
    """Get date string for 7 days ago (matches frontend 'Last 7 Days' filter)"""
    return (datetime.utcnow() - timedelta(days=7)).strftime('%Y-%m-%d')


async def signal_cache_loop():
    """
    Pre-compute signal data every SIGNAL_INTERVAL seconds.
    
    Strategy:
    1. Compute outcomes ONCE into temp table
    2. Cache "Last 7 Days" pages (most common frontend request)
    3. Cache "All" pages
    4. Cache stats, active, analyze
    """
    print(f"🔄 Signal cache worker started (interval: {SIGNAL_INTERVAL}s)")
    await asyncio.sleep(2)

    while True:
        try:
            if not is_redis_available():
                await asyncio.sleep(SIGNAL_INTERVAL)
                continue

            start = time.time()
            db = SessionLocal()
            try:
                cached = 0
                ttl = SIGNAL_INTERVAL + 10

                # Step 1: Pre-compute outcomes ONCE
                t0 = time.time()
                precompute_outcomes(db)
                cte_ms = round((time.time() - t0) * 1000)

                date_7d = get_7d_date()

                # Step 2: Cache "Last 7 Days" pages (HIGHEST PRIORITY — what frontend actually requests)
                statuses = [None, "open", "tp1", "tp2", "tp3", "tp4", "closed_loss"]
                for st in statuses:
                    for pg in range(1, 4):  # pages 1-3
                        result = query_signals_page(db, page=pg, page_size=20, status=st,
                                                     sort_by="created_at", sort_order="desc",
                                                     date_from=date_7d)
                        key = f"lq:signals:page:{pg}:20:{st or 'all'}:all:all:created_at:desc:7d:{date_7d}"
                        cache_set(key, result, ttl=ttl)
                        cached += 1
                        # Stop if no more pages
                        if pg >= result.get("total_pages", 1):
                            break

                # Step 3: Cache "All time" pages (secondary)
                for st in [None, "open", "tp1", "tp2", "tp3", "tp4", "closed_loss"]:
                    for pg in range(1, 4):
                        result = query_signals_page(db, page=pg, page_size=20, status=st,
                                                     sort_by="created_at", sort_order="desc")
                        key = f"lq:signals:page:{pg}:20:{st or 'all'}:all:all:created_at:desc"
                        cache_set(key, result, ttl=ttl)
                        cached += 1
                        if pg >= result.get("total_pages", 1):
                            break

                # Step 4: Stats & Active
                cache_set("lq:signals:stats", query_signals_stats(db), ttl=ttl)
                cached += 1

                active_result = query_active_signals(db, 20)
                cache_set("lq:signals:active:20", active_result, ttl=ttl)
                cached += 1

                # Step 5: Analyze (common combos)
                for tr in ["all", "7d", "30d"]:
                    for tm in ["weekly", "daily"]:
                        result = query_analyze(db, time_range=tr, trend_mode=tm)
                        cache_set(f"lq:signals:analyze:{tr}:{ tm}", result, ttl=ttl)
                        cached += 1

                elapsed = round((time.time() - start) * 1000)
                print(f"✅ Signal cache: {cached} keys in {elapsed}ms (CTE: {cte_ms}ms)")
            finally:
                db.close()
        except Exception as e:
            import traceback
            print(f"❌ Signal cache error: {e}")
            traceback.print_exc()

        await asyncio.sleep(SIGNAL_INTERVAL)


async def market_cache_loop():
    """Pre-compute market data every MARKET_INTERVAL seconds"""
    print(f"🔄 Market cache worker started (interval: {MARKET_INTERVAL}s)")
    await asyncio.sleep(3)

    while True:
        try:
            if not is_redis_available():
                await asyncio.sleep(MARKET_INTERVAL)
                continue

            start = time.time()
            cached = 0

            overview = await fetch_market_overview()
            if overview:
                cache_set("lq:market:overview", overview, ttl=MARKET_INTERVAL + 5)
                cache_set("lq:market:btc-ticker", overview["btc"], ttl=MARKET_INTERVAL + 5)
                cache_set("lq:market:funding-rates", overview["fundingRates"], ttl=MARKET_INTERVAL + 5)
                if overview.get("longShortRatio"):
                    cache_set("lq:market:long-short-ratio", overview["longShortRatio"], ttl=MARKET_INTERVAL + 5)
                cache_set("lq:market:open-interest", overview["openInterest"], ttl=MARKET_INTERVAL + 5)
                cache_set("lq:market:oi-history", overview["oiHistory"], ttl=MARKET_INTERVAL + 5)
                cached += 6

            elapsed = round((time.time() - start) * 1000)
            print(f"✅ Market cache: {cached} keys in {elapsed}ms")
        except Exception as e:
            print(f"❌ Market cache error: {e}")

        await asyncio.sleep(MARKET_INTERVAL)


async def coingecko_cache_loop():
    """Pre-compute CoinGecko data every 120 seconds (rate limit friendly)"""
    print(f"🔄 CoinGecko cache worker started (interval: 120s)")
    await asyncio.sleep(5)

    while True:
        try:
            if not is_redis_available():
                await asyncio.sleep(120)
                continue

            start = time.time()
            cached = 0
            ttl = 130

            btc = await fetch_bitcoin_coingecko()
            if btc:
                cache_set("lq:market:bitcoin", btc, ttl=ttl)
                cached += 1

            await asyncio.sleep(2)

            glob = await fetch_global_coingecko()
            if glob:
                cache_set("lq:market:global", glob, ttl=ttl)
                cached += 1

            await asyncio.sleep(2)

            coins = await fetch_coins_market(per_page=100, page=1)
            if coins:
                cache_set("lq:market:coins:100:1:market_cap_desc", coins, ttl=ttl)
                cached += 1

            elapsed = round((time.time() - start) * 1000)
            print(f"✅ CoinGecko cache: {cached} keys in {elapsed}ms")
        except Exception as e:
            print(f"❌ CoinGecko cache error: {e}")

        await asyncio.sleep(120)


# ============================================
# BITCOIN TECHNICAL INDICATORS (from Binance Klines)
# ============================================

def calc_ema(closes, period):
    """Calculate Exponential Moving Average"""
    if len(closes) < period:
        return None
    multiplier = 2 / (period + 1)
    ema = sum(closes[:period]) / period
    for price in closes[period:]:
        ema = (price - ema) * multiplier + ema
    return ema


def calc_rsi(closes, period=14):
    """Calculate RSI from close prices"""
    if len(closes) < period + 1:
        return None
    gains, losses = [], []
    for i in range(1, len(closes)):
        diff = closes[i] - closes[i - 1]
        gains.append(diff if diff > 0 else 0)
        losses.append(abs(diff) if diff < 0 else 0)
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100 - (100 / (1 + rs)), 2)


def calc_macd(closes, fast=12, slow=26, signal=9):
    """Calculate MACD, signal line, histogram"""
    if len(closes) < slow + signal:
        return None
    ema_fast = calc_ema(closes, fast)
    ema_slow = calc_ema(closes, slow)
    if ema_fast is None or ema_slow is None:
        return None

    # Build MACD line series
    macd_line = []
    fast_mult = 2 / (fast + 1)
    slow_mult = 2 / (slow + 1)
    ef = sum(closes[:fast]) / fast
    es = sum(closes[:slow]) / slow
    for i in range(slow, len(closes)):
        ef_curr = closes[i] * fast_mult + ef * (1 - fast_mult) if i >= fast else ef
        es_curr = closes[i] * slow_mult + es * (1 - slow_mult)
        ef = ef_curr
        es = es_curr
        macd_line.append(ef - es)

    if len(macd_line) < signal:
        return None

    # Signal line (EMA of MACD line)
    sig_mult = 2 / (signal + 1)
    sig = sum(macd_line[:signal]) / signal
    for v in macd_line[signal:]:
        sig = v * sig_mult + sig * (1 - sig_mult)

    macd_val = macd_line[-1]
    histogram = macd_val - sig

    # Determine crossover
    prev_macd = macd_line[-2] if len(macd_line) > 1 else macd_val
    prev_sig_approx = sig - (macd_line[-1] - macd_line[-2]) * sig_mult if len(macd_line) > 1 else sig
    crossover = "bullish" if prev_macd <= prev_sig_approx and macd_val > sig else \
                "bearish" if prev_macd >= prev_sig_approx and macd_val < sig else "neutral"

    return {
        "macd": round(macd_val, 2),
        "signal": round(sig, 2),
        "histogram": round(histogram, 2),
        "crossover": crossover,
    }


def calc_bollinger(closes, period=20, std_dev=2):
    """Calculate Bollinger Bands"""
    if len(closes) < period:
        return None
    recent = closes[-period:]
    sma = sum(recent) / period
    variance = sum((x - sma) ** 2 for x in recent) / period
    std = variance ** 0.5
    return {
        "upper": round(sma + std_dev * std, 2),
        "middle": round(sma, 2),
        "lower": round(sma - std_dev * std, 2),
        "bandwidth": round((std_dev * std * 2) / sma * 100, 2) if sma > 0 else 0,
    }


async def fetch_btc_technical():
    """
    Fetch BTC klines from Binance and calculate technical indicators
    for multiple timeframes (1h, 4h, 1d)
    """
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            timeframes = {"1h": "1h", "4h": "4h", "1d": "1d"}
            result = {}

            for tf_key, tf_interval in timeframes.items():
                try:
                    res = await client.get(f"{BINANCE_SPOT_API}/api/v3/klines", params={
                        "symbol": "BTCUSDT", "interval": tf_interval, "limit": 200
                    })
                    if res.status_code != 200:
                        continue
                    klines = res.json()
                    closes = [float(k[4]) for k in klines]

                    rsi = calc_rsi(closes, 14)
                    macd = calc_macd(closes, 12, 26, 9)
                    bb = calc_bollinger(closes, 20, 2)
                    ema50 = calc_ema(closes, 50)
                    ema200 = calc_ema(closes, 200)

                    current_price = closes[-1]

                    # RSI signal
                    rsi_signal = "oversold" if rsi and rsi < 30 else \
                                 "overbought" if rsi and rsi > 70 else "neutral"

                    # BB position
                    bb_position = None
                    if bb:
                        bb_range = bb["upper"] - bb["lower"]
                        if bb_range > 0:
                            bb_pct = (current_price - bb["lower"]) / bb_range
                            bb_position = "near_upper" if bb_pct > 0.8 else \
                                          "near_lower" if bb_pct < 0.2 else "middle"

                    # EMA cross
                    ema_cross = None
                    if ema50 and ema200:
                        ema_cross = "golden_cross" if ema50 > ema200 else "death_cross"

                    result[tf_key] = {
                        "rsi": rsi,
                        "rsi_signal": rsi_signal,
                        "macd": macd,
                        "bollinger": bb,
                        "bb_position": bb_position,
                        "ema50": round(ema50, 2) if ema50 else None,
                        "ema200": round(ema200, 2) if ema200 else None,
                        "ema_cross": ema_cross,
                        "price": current_price,
                    }
                except Exception as tf_err:
                    print(f"⚠️ Technical {tf_key} error: {tf_err}")
                    continue

            if not result:
                return None

            # Overall signal summary (based on 4h as primary)
            primary = result.get("4h") or result.get("1h") or {}
            buy_signals = 0
            sell_signals = 0
            total_signals = 0

            for tf_data in result.values():
                if tf_data.get("rsi_signal") == "oversold":
                    buy_signals += 1
                elif tf_data.get("rsi_signal") == "overbought":
                    sell_signals += 1
                total_signals += 1

                macd_data = tf_data.get("macd")
                if macd_data:
                    if macd_data.get("histogram", 0) > 0:
                        buy_signals += 1
                    else:
                        sell_signals += 1
                    total_signals += 1

                if tf_data.get("bb_position") == "near_lower":
                    buy_signals += 1
                elif tf_data.get("bb_position") == "near_upper":
                    sell_signals += 1
                total_signals += 1

                if tf_data.get("ema_cross") == "golden_cross":
                    buy_signals += 1
                elif tf_data.get("ema_cross") == "death_cross":
                    sell_signals += 1
                total_signals += 1

            if total_signals > 0:
                buy_pct = buy_signals / total_signals
                sell_pct = sell_signals / total_signals
                if buy_pct >= 0.6:
                    summary = "Strong Buy" if buy_pct >= 0.75 else "Buy"
                elif sell_pct >= 0.6:
                    summary = "Strong Sell" if sell_pct >= 0.75 else "Sell"
                else:
                    summary = "Neutral"
            else:
                summary = "Neutral"

            return {
                "timeframes": result,
                "summary": summary,
                "buy_signals": buy_signals,
                "sell_signals": sell_signals,
                "total_signals": total_signals,
                "timestamp": datetime.utcnow().isoformat(),
            }
    except Exception as e:
        print(f"❌ BTC Technical fetch error: {e}")
        return None


# ============================================
# NETWORK HEALTH (mempool.space + blockchain.info)
# ============================================

async def fetch_network_health():
    """Fetch Bitcoin network health metrics"""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            # Parallel requests
            fees_req = client.get(f"{MEMPOOL_API}/v1/fees/recommended")
            mempool_req = client.get(f"{MEMPOOL_API}/mempool")
            hashrate_req = client.get(f"{MEMPOOL_API}/v1/mining/hashrate/1m")
            diff_adj_req = client.get(f"{MEMPOOL_API}/v1/difficulty-adjustment")
            tip_req = client.get(f"{MEMPOOL_API}/blocks/tip/height")

            results = await asyncio.gather(
                fees_req, mempool_req, hashrate_req, diff_adj_req, tip_req,
                return_exceptions=True
            )

            data = {}

            # Recommended fees
            if not isinstance(results[0], Exception) and results[0].status_code == 200:
                fees = results[0].json()
                data["fees"] = {
                    "fastest": fees.get("fastestFee", 0),
                    "half_hour": fees.get("halfHourFee", 0),
                    "hour": fees.get("hourFee", 0),
                    "economy": fees.get("economyFee", 0),
                    "minimum": fees.get("minimumFee", 0),
                }

            # Mempool stats
            if not isinstance(results[1], Exception) and results[1].status_code == 200:
                mp = results[1].json()
                data["mempool"] = {
                    "count": mp.get("count", 0),
                    "vsize": mp.get("vsize", 0),
                    "total_fee": mp.get("total_fee", 0),
                }

            # Hashrate & Difficulty
            if not isinstance(results[2], Exception) and results[2].status_code == 200:
                hr = results[2].json()
                data["hashrate"] = hr.get("currentHashrate", 0)
                data["difficulty"] = hr.get("currentDifficulty", 0)

            # Difficulty adjustment
            if not isinstance(results[3], Exception) and results[3].status_code == 200:
                da = results[3].json()
                data["difficulty_adjustment"] = {
                    "progress": round(da.get("progressPercent", 0), 2),
                    "change": round(da.get("difficultyChange", 0), 2),
                    "estimated_date": da.get("estimatedRetargetDate", 0),
                    "remaining_blocks": da.get("remainingBlocks", 0),
                    "remaining_time": da.get("remainingTime", 0),
                }

            # Block tip height
            if not isinstance(results[4], Exception) and results[4].status_code == 200:
                try:
                    data["block_height"] = int(results[4].text)
                except:
                    data["block_height"] = 0

            data["timestamp"] = datetime.utcnow().isoformat()
            return data if data else None

    except Exception as e:
        print(f"❌ Network health fetch error: {e}")
        return None


# ============================================
# ON-CHAIN METRICS (blockchain.info)
# ============================================

async def fetch_onchain_metrics():
    """Fetch on-chain metrics from blockchain.info"""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            # blockchain.info chart API — get latest value
            charts = {
                "n-unique-addresses": "active_addresses",
                "n-transactions": "daily_transactions",
                "mvrv": "mvrv",
                "nvt": "nvt",
            }

            data = {}
            for chart_name, key in charts.items():
                try:
                    res = await client.get(
                        f"{BLOCKCHAIN_API}/charts/{chart_name}",
                        params={"timespan": "7days", "format": "json", "sampled": "true"}
                    )
                    if res.status_code == 200:
                        chart_data = res.json()
                        values = chart_data.get("values", [])
                        if values:
                            latest = values[-1]
                            data[key] = {
                                "value": latest.get("y", 0),
                                "timestamp": latest.get("x", 0),
                            }
                            # Also get 7d trend (first vs last)
                            if len(values) > 1:
                                first_val = values[0].get("y", 0)
                                last_val = values[-1].get("y", 0)
                                if first_val > 0:
                                    data[key]["change_7d"] = round((last_val - first_val) / first_val * 100, 2)
                except Exception as chart_err:
                    print(f"⚠️ On-chain {chart_name} error: {chart_err}")
                    continue

                await asyncio.sleep(0.5)  # Be nice to blockchain.info

            # Also get unconfirmed TX count (simple endpoint)
            try:
                uc_res = await client.get(f"{BLOCKCHAIN_API}/q/unconfirmedcount")
                if uc_res.status_code == 200:
                    data["unconfirmed_tx"] = int(uc_res.text.strip())
            except:
                pass

            data["timestamp"] = datetime.utcnow().isoformat()
            return data if len(data) > 1 else None

    except Exception as e:
        print(f"❌ On-chain metrics fetch error: {e}")
        return None


# ============================================
# BTC NEWS (RSS feeds)
# ============================================

def parse_rss_date(date_str):
    """Parse various RSS date formats"""
    if not date_str:
        return None
    try:
        return parsedate_to_datetime(date_str)
    except:
        pass
    # Try ISO format
    for fmt in ["%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d %H:%M:%S"]:
        try:
            return datetime.strptime(date_str, fmt)
        except:
            continue
    return None


def extract_image_from_html(html_str):
    """Extract first image URL from HTML content"""
    if not html_str:
        return None
    match = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', html_str)
    return match.group(1) if match else None


async def fetch_btc_news():
    """Fetch Bitcoin news from RSS feeds"""
    articles = []
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
            for feed_url in BTC_NEWS_FEEDS:
                try:
                    res = await client.get(feed_url, headers={
                        "User-Agent": "LuxQuant/1.0 (News Aggregator)"
                    })
                    if res.status_code != 200:
                        continue

                    root = ET.fromstring(res.text)

                    # Determine source name from URL
                    source = "Unknown"
                    if "cointelegraph" in feed_url:
                        source = "CoinTelegraph"
                    elif "coindesk" in feed_url:
                        source = "CoinDesk"
                    elif "decrypt" in feed_url:
                        source = "Decrypt"

                    # Parse items (RSS 2.0 format)
                    ns = {
                        "media": "http://search.yahoo.com/mrss/",
                        "dc": "http://purl.org/dc/elements/1.1/",
                        "content": "http://purl.org/rss/1.0/modules/content/",
                    }

                    items = root.findall(".//item")
                    for item in items[:10]:  # Max 10 per source
                        title_el = item.find("title")
                        link_el = item.find("link")
                        desc_el = item.find("description")
                        pub_el = item.find("pubDate")
                        creator_el = item.find("dc:creator", ns)

                        title = title_el.text.strip() if title_el is not None and title_el.text else None
                        link = link_el.text.strip() if link_el is not None and link_el.text else None
                        description = desc_el.text.strip() if desc_el is not None and desc_el.text else ""
                        pub_date = pub_el.text.strip() if pub_el is not None and pub_el.text else None
                        author = creator_el.text.strip() if creator_el is not None and creator_el.text else None

                        if not title or not link:
                            continue

                        # Filter only BTC-related
                        text_check = (title + " " + description).lower()
                        btc_keywords = ["bitcoin", "btc", "satoshi", "halving", "mining"]
                        if not any(kw in text_check for kw in btc_keywords):
                            continue

                        # Extract image
                        image = None

                        # Try media:content
                        media_content = item.find("media:content", ns)
                        if media_content is not None:
                            image = media_content.get("url")

                        # Try media:thumbnail
                        if not image:
                            media_thumb = item.find("media:thumbnail", ns)
                            if media_thumb is not None:
                                image = media_thumb.get("url")

                        # Try enclosure
                        if not image:
                            enclosure = item.find("enclosure")
                            if enclosure is not None and "image" in (enclosure.get("type") or ""):
                                image = enclosure.get("url")

                        # Try extracting from description HTML
                        if not image:
                            image = extract_image_from_html(description)

                        # Clean description (strip HTML)
                        clean_desc = re.sub(r'<[^>]+>', '', description)
                        clean_desc = clean_desc.strip()[:300]

                        parsed_date = parse_rss_date(pub_date)
                        iso_date = parsed_date.isoformat() if parsed_date else pub_date

                        # Time ago
                        time_ago = ""
                        if parsed_date:
                            try:
                                now = datetime.now(parsed_date.tzinfo) if parsed_date.tzinfo else datetime.utcnow()
                                diff = now - parsed_date
                                mins = int(diff.total_seconds() / 60)
                                if mins < 60:
                                    time_ago = f"{mins}m ago"
                                elif mins < 1440:
                                    time_ago = f"{mins // 60}h ago"
                                else:
                                    time_ago = f"{mins // 1440}d ago"
                            except:
                                time_ago = ""

                        articles.append({
                            "title": title,
                            "link": link,
                            "description": clean_desc,
                            "image": image,
                            "source": source,
                            "author": author,
                            "published": iso_date,
                            "time_ago": time_ago,
                        })

                except Exception as feed_err:
                    print(f"⚠️ RSS feed error ({feed_url}): {feed_err}")
                    continue

        # Sort by published date (newest first), deduplicate by title
        seen_titles = set()
        unique_articles = []
        for a in articles:
            title_key = a["title"].lower()[:50]
            if title_key not in seen_titles:
                seen_titles.add(title_key)
                unique_articles.append(a)

        # Sort newest first
        unique_articles.sort(key=lambda x: x.get("published", ""), reverse=True)

        return {
            "articles": unique_articles[:20],  # Max 20 articles
            "total": len(unique_articles),
            "fetched_at": datetime.utcnow().isoformat(),
        }

    except Exception as e:
        print(f"❌ BTC news fetch error: {e}")
        return None


# ============================================
# BITCOIN DATA CACHE LOOP (60s interval)
# ============================================

async def bitcoin_data_cache_loop():
    """Pre-compute all Bitcoin page data every 60 seconds"""
    print(f"🔄 Bitcoin data cache worker started (interval: 60s)")
    await asyncio.sleep(4)

    while True:
        try:
            if not is_redis_available():
                await asyncio.sleep(60)
                continue

            start = time.time()
            cached = 0

            # 1. Technical Indicators
            technical = await fetch_btc_technical()
            if technical:
                cache_set("lq:bitcoin:technical", technical, ttl=70)
                cached += 1

            # 2. Network Health
            network = await fetch_network_health()
            if network:
                cache_set("lq:bitcoin:network", network, ttl=70)
                cached += 1

            # 3. On-Chain Metrics (every other cycle — these change slowly)
            # Check if we have recent data
            existing_onchain = cache_get("lq:bitcoin:onchain")
            should_fetch_onchain = existing_onchain is None
            if not should_fetch_onchain:
                try:
                    ts = existing_onchain.get("timestamp", "")
                    if ts:
                        last_fetch = datetime.fromisoformat(ts.replace("Z", "+00:00").replace("+00:00", ""))
                        should_fetch_onchain = (datetime.utcnow() - last_fetch).seconds > 300  # 5 min
                except:
                    should_fetch_onchain = True

            if should_fetch_onchain:
                onchain = await fetch_onchain_metrics()
                if onchain:
                    cache_set("lq:bitcoin:onchain", onchain, ttl=360)
                    cached += 1

            # 4. News (every 5 minutes)
            existing_news = cache_get("lq:bitcoin:news")
            should_fetch_news = existing_news is None
            if not should_fetch_news:
                try:
                    ts = existing_news.get("fetched_at", "")
                    if ts:
                        last_fetch = datetime.fromisoformat(ts)
                        should_fetch_news = (datetime.utcnow() - last_fetch).seconds > 300
                except:
                    should_fetch_news = True

            if should_fetch_news:
                news = await fetch_btc_news()
                if news:
                    cache_set("lq:bitcoin:news", news, ttl=360)
                    cached += 1

            elapsed = round((time.time() - start) * 1000)
            print(f"✅ Bitcoin data cache: {cached} keys in {elapsed}ms")

        except Exception as e:
            print(f"❌ Bitcoin data cache error: {e}")

        await asyncio.sleep(60)


def start_cache_workers():
    """Start all background cache workers"""
    loop = asyncio.get_event_loop()
    loop.create_task(signal_cache_loop())
    loop.create_task(market_cache_loop())
    loop.create_task(coingecko_cache_loop())
    loop.create_task(bitcoin_data_cache_loop())