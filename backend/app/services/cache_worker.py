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
import httpx
from datetime import datetime, timedelta
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

    return {
        "stats": {"total_signals":ts,"closed_trades":tc,"open_signals":to_,"win_rate":round(wr,2),
            "total_winners":tw,"tp1_count":t1,"tp2_count":t2,"tp3_count":t3,"tp4_count":t4,"sl_count":tsl,"active_pairs":len(pair_metrics)},
        "pair_metrics": pair_metrics,
        "win_rate_trend": win_rate_trend,
        "risk_reward": risk_reward,
        "avg_risk_reward": avg_rr,
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
                    result = query_analyze(db, time_range=tr, trend_mode="weekly")
                    cache_set(f"lq:signals:analyze:{tr}:weekly", result, ttl=ttl)
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


def start_cache_workers():
    """Start all background cache workers"""
    loop = asyncio.get_event_loop()
    loop.create_task(signal_cache_loop())
    loop.create_task(market_cache_loop())
    loop.create_task(coingecko_cache_loop())