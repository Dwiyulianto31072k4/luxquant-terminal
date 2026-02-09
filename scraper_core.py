# pip install telethon sqlalchemy pandas python-dateutil tqdm psycopg2-binary nest_asyncio
# -*- coding: utf-8 -*-

import os, re, uuid, hashlib, asyncio, datetime as dt
import pandas as pd
from typing import Optional
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.errors import FloodWaitError
from telethon.tl.types import MessageEntityTextUrl, MessageEntityUrl
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from tqdm.asyncio import tqdm as tqdm_async

# ========= KONFIG =========
API_ID   = int(os.getenv("TG_API_ID", "28690093"))
API_HASH = os.getenv("TG_API_HASH", "aa512841e37c5ccb5a8ac494395bb373")
CHANNEL_ID   = int(os.getenv("TG_CHANNEL_ID", "-1002051092635"))
SESSION_FILE = os.getenv("TG_SESSION_FILE", "/opt/luxquant-sync/telethon_sessionvip.txt")
DB_URL = os.getenv("DB_URL", "postgresql+psycopg2://luxq:ukCjpVAkqpeExAiLcFNETgmP@127.0.0.1:5432/luxquant")

engine = create_engine(DB_URL, future=True)

def is_pg(e: Engine) -> bool:
    try:
        return e.dialect.name == "postgresql"
    except Exception:
        return False

# ========= UTIL & REGEX =========
def sha1(s): 
    return hashlib.sha1((s or "").encode("utf-8")).hexdigest()

NUM      = r"([0-9]*\.?[0-9]+)"
HIT_MARK = r"(✅|✔️|☑️|hit|reached|achieved)"
SL_LABEL = r"(?:stop\s*loss|stoploss|sl)"
PAIR_RX  = re.compile(r"\b([A-Z0-9]{2,}USDT)\b", re.I)

def get_session() -> StringSession:
    if not os.path.isfile(SESSION_FILE):
        raise RuntimeError(f"Tidak menemukan file session: {SESSION_FILE}")
    with open(SESSION_FILE, "r", encoding="utf-8") as f:
        return StringSession(f.read().strip())

def message_link(chat_id: int, msg_id: int) -> str:
    return f"https://t.me/c/{str(chat_id)[4:]}/{msg_id}" if str(chat_id).startswith("-100") \
           else f"https://t.me/{chat_id}/{msg_id}"

def extract_linked_msg_id(msg) -> Optional[int]:
    if not getattr(msg, "entities", None): 
        return None
    text_ = msg.text or ""
    for e in msg.entities:
        if isinstance(e, (MessageEntityTextUrl, MessageEntityUrl)):
            url = getattr(e, "url", None) or text_[e.offset:e.offset+e.length]
            m = re.search(r"/(?:c/\d+|[A-Za-z0-9_]+)/(\d+)$", url)
            if m:
                try:
                    return int(m.group(1))
                except:
                    pass
    return None

# ========= SCHEMA =========
def ensure_tables():
    with engine.begin() as con:
        if not is_pg(engine):
            try:
                con.execute(text("PRAGMA journal_mode=WAL;"))
                con.execute(text("PRAGMA synchronous=NORMAL;"))
            except Exception:
                pass

        con.execute(text("""
        CREATE TABLE IF NOT EXISTS signals (
            signal_id TEXT PRIMARY KEY,
            channel_id INTEGER,
            call_message_id INTEGER UNIQUE,
            message_link TEXT,
            pair TEXT, entry REAL,
            target1 REAL, target2 REAL, target3 REAL, target4 REAL,
            stop1 REAL, stop2 REAL,
            risk_level TEXT,
            volume_rank_num INTEGER, volume_rank_den INTEGER,
            created_at TEXT,
            status TEXT,
            raw_text TEXT, text_sha1 TEXT,
            edit_date TEXT
        );"""))
        con.execute(text("CREATE INDEX IF NOT EXISTS idx_signals_pair ON signals(pair);"))
        con.execute(text("CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);"))
        con.execute(text("CREATE INDEX IF NOT EXISTS idx_signals_callid ON signals(call_message_id);"))

        con.execute(text("""
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
        );"""))
        con.execute(text("CREATE INDEX IF NOT EXISTS idx_updates_sid ON signal_updates(signal_id);"))
        con.execute(text("CREATE INDEX IF NOT EXISTS idx_updates_uid ON signal_updates(update_message_id);"))

def migrate_schema_for_multi_updates():
    if is_pg(engine):
        return
    with engine.begin() as con:
        try:
            schema = con.execute(text(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name='signal_updates';"
            )).scalar() or ""
        except Exception:
            return
        if "PRIMARY KEY (channel_id, update_message_id, update_type)" in schema:
            return
        con.execute(text("ALTER TABLE signal_updates RENAME TO signal_updates_old;"))
        con.execute(text("""
        CREATE TABLE signal_updates (
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
        );"""))
        con.execute(text("""
        INSERT INTO signal_updates
        (signal_id, channel_id, update_message_id, message_link,
         update_type, price, update_at, raw_text, reply_to_msg_id, linked_msg_id)
        SELECT signal_id, channel_id, update_message_id, message_link,
               update_type, price, update_at, raw_text, reply_to_msg_id, linked_msg_id
        FROM signal_updates_old;
        """))
        con.execute(text("DROP TABLE signal_updates_old;"))
        con.execute(text("CREATE INDEX IF NOT EXISTS idx_updates_sid ON signal_updates(signal_id);"))
        con.execute(text("CREATE INDEX IF NOT EXISTS idx_updates_uid ON signal_updates(update_message_id);"))

# ========= PARSER =========
def classify(text: str) -> str:
    t = (text or "").strip()
    if re.search(r"Daily\s+Results", t, re.I):
        return "other"
    if re.search(r"\bEntry\s*[:：]\s*" + NUM, t, re.I):
        return "call"
    if (re.search(r"\bTarget\s*\d+\s*[:：]?\s*" + NUM + r".*?" + HIT_MARK, t, re.I|re.S)
        or re.search(SL_LABEL, t, re.I)
        or re.search(r"\bTP\s*\d+\b.*?" + HIT_MARK, t, re.I|re.S)):
        return "update"
    return "other"

def parse_call(text: str) -> dict:
    t = text or ""
    pair = (m:=re.search(PAIR_RX, t)) and m.group(1).upper()
    def fnum(pat):
        m = re.search(pat, t, re.I)
        return float(m.group(1)) if m else None
    entry = fnum(r"Entry\s*[:：]\s*" + NUM)
    tg = {k: fnum(rf"Target\s*{k}\s*[:：]?\s*{NUM}") for k in range(1,5)}
    sl1 = fnum(rf"{SL_LABEL}\s*1\s*[:：]?\s*{NUM}")
    sl2 = fnum(rf"{SL_LABEL}\s*2\s*[:：]?\s*{NUM}")
    risk = (m:=re.search(r"Risk\s*Level\s*[:：]?\s*([A-Za-z]+)", t, re.I))
    risk_level = m and m.group(1).title() or None
    vr = re.search(r"Volume\(24H\)\s*Ranked\s*[:：]?\s*(\d+)\D+(\d+)", t, re.I)
    volume_rank_num = int(vr.group(1)) if vr else None
    volume_rank_den = int(vr.group(2)) if vr else None

    return {
        "pair": pair, "entry": entry,
        "target1": tg.get(1), "target2": tg.get(2), "target3": tg.get(3), "target4": tg.get(4),
        "stop1": sl1, "stop2": sl2,
        "risk_level": risk_level,
        "volume_rank_num": volume_rank_num, "volume_rank_den": volume_rank_den,
    }

def parse_update(text: str) -> dict:
    t = text or ""
    pair = (m := re.search(PAIR_RX, t)) and m.group(1).upper()
    events = []
    for k in range(1,5):
        m_full = re.search(rf"(?:Target|TP)\s*{k}\s*[:：]?\s*{NUM}.*?{HIT_MARK}", t, re.I | re.S)
        if m_full:
            price = float(re.search(rf"(?:Target|TP)\s*{k}\s*[:：]?\s*{NUM}", t, re.I).group(1))
            events.append((f"tp{k}", price)); continue
        if re.search(rf"(?:TP|Target|T)\s*{k}\b.*?{HIT_MARK}", t, re.I | re.S):
            events.append((f"tp{k}", None)); continue
        if re.search(rf"Target\s*{k}\s*(?:hit|reached|achieved)", t, re.I | re.S):
            events.append((f"tp{k}", None))
    if re.search(SL_LABEL, t, re.I):
        m = re.search(rf"{SL_LABEL}(?:\s*\d+)?\s*[:：]?\s*{NUM}", t, re.I)
        price = float(m.group(1)) if m else None
        events.append(("sl", price))
    if re.search(r"(all\s+targets\s+(hit|reached|achieved)|tp\s*4\s*(hit|reached|done))", t, re.I):
        if not any(e[0] == "tp4" for e in events):
            events.append(("tp4", None))
    return {"pair": pair, "events": events}

# ========= DB I/O =========
def upsert_signal(msg, fields):
    rec = {
        "signal_id": str(uuid.uuid4()),
        "channel_id": msg.chat_id,
        "call_message_id": msg.id,
        "message_link": message_link(msg.chat_id, msg.id),
        "pair": fields.get("pair"),
        "entry": fields.get("entry"),
        "target1": fields.get("target1"),
        "target2": fields.get("target2"),
        "target3": fields.get("target3"),
        "target4": fields.get("target4"),
        "stop1": fields.get("stop1"),
        "stop2": fields.get("stop2"),
        "risk_level": fields.get("risk_level"),
        "volume_rank_num": fields.get("volume_rank_num"),
        "volume_rank_den": fields.get("volume_rank_den"),
        "created_at": msg.date.replace(tzinfo=dt.timezone.utc).isoformat(),
        "status": "open",
        "raw_text": msg.text or "",
        "text_sha1": sha1(msg.text or ""),
        "edit_date": None
    }

    if is_pg(engine):
        sql = text("""
            INSERT INTO signals (
                signal_id, channel_id, call_message_id, message_link,
                pair, entry, target1, target2, target3, target4,
                stop1, stop2, risk_level, volume_rank_num, volume_rank_den,
                created_at, status, raw_text, text_sha1, edit_date
            ) VALUES (
                :signal_id, :channel_id, :call_message_id, :message_link,
                :pair, :entry, :target1, :target2, :target3, :target4,
                :stop1, :stop2, :risk_level, :volume_rank_num, :volume_rank_den,
                :created_at, :status, :raw_text, :text_sha1, :edit_date
            )
            ON CONFLICT (call_message_id) DO UPDATE SET
                channel_id      = EXCLUDED.channel_id,
                message_link    = EXCLUDED.message_link,
                pair            = EXCLUDED.pair,
                entry           = EXCLUDED.entry,
                target1         = EXCLUDED.target1,
                target2         = EXCLUDED.target2,
                target3         = EXCLUDED.target3,
                target4         = EXCLUDED.target4,
                stop1           = EXCLUDED.stop1,
                stop2           = EXCLUDED.stop2,
                risk_level      = EXCLUDED.risk_level,
                volume_rank_num = EXCLUDED.volume_rank_num,
                volume_rank_den = EXCLUDED.volume_rank_den,
                created_at      = EXCLUDED.created_at,
                raw_text        = EXCLUDED.raw_text,
                text_sha1       = EXCLUDED.text_sha1,
                edit_date       = EXCLUDED.edit_date
            RETURNING signal_id;
        """)
        with engine.begin() as con:
            return con.execute(sql, rec).scalar()
    else:
        sql = text("""
            INSERT INTO signals (
                signal_id, channel_id, call_message_id, message_link,
                pair, entry, target1, target2, target3, target4,
                stop1, stop2, risk_level, volume_rank_num, volume_rank_den,
                created_at, status, raw_text, text_sha1, edit_date
            ) VALUES (
                :signal_id, :channel_id, :call_message_id, :message_link,
                :pair, :entry, :target1, :target2, :target3, :target4,
                :stop1, :stop2, :risk_level, :volume_rank_num, :volume_rank_den,
                :created_at, :status, :raw_text, :text_sha1, :edit_date
            )
            ON CONFLICT(call_message_id) DO UPDATE SET
                channel_id      = excluded.channel_id,
                message_link    = excluded.message_link,
                pair            = excluded.pair,
                entry           = excluded.entry,
                target1         = excluded.target1,
                target2         = excluded.target2,
                target3         = excluded.target3,
                target4         = excluded.target4,
                stop1           = excluded.stop1,
                stop2           = excluded.stop2,
                risk_level      = excluded.risk_level,
                volume_rank_num = excluded.volume_rank_num,
                volume_rank_den = excluded.volume_rank_den,
                created_at      = excluded.created_at,
                raw_text        = excluded.raw_text,
                text_sha1       = excluded.text_sha1,
                edit_date       = excluded.edit_date;
        """)
        with engine.begin() as con:
            con.execute(sql, rec)
            row = con.execute(text("SELECT signal_id FROM signals WHERE call_message_id=:m"),
                              {"m": msg.id}).fetchone()
            return row[0] if row else None

def insert_update(signal_id, msg, utype, price):
    reply_to_id = getattr(getattr(msg, "reply_to", None), "reply_to_msg_id", None) or getattr(msg, "reply_to_msg_id", None)
    linked_id   = extract_linked_msg_id(msg)
    rec = {
        "signal_id": signal_id,
        "channel_id": msg.chat_id,
        "update_message_id": msg.id,
        "message_link": message_link(msg.chat_id, msg.id),
        "update_type": utype,
        "price": price,
        "update_at": msg.date.replace(tzinfo=dt.timezone.utc).isoformat(),
        "raw_text": msg.text or "",
        "reply_to_msg_id": reply_to_id,
        "linked_msg_id": linked_id
    }
    sql = text("""
        INSERT INTO signal_updates
        (signal_id, channel_id, update_message_id, message_link,
         update_type, price, update_at, raw_text, reply_to_msg_id, linked_msg_id)
        VALUES (:signal_id, :channel_id, :update_message_id, :message_link,
                :update_type, :price, :update_at, :raw_text, :reply_to_msg_id, :linked_msg_id)
        ON CONFLICT(channel_id, update_message_id, update_type) DO NOTHING
    """)
    with engine.begin() as con:
        con.execute(sql, rec)
    return True

def bump_status(signal_id, current_status, utype):
    order = {"open":0,"tp1":1,"tp2":2,"tp3":3,"closed_win":4,"closed_loss":4}
    new_status = current_status
    if utype in ("tp1","tp2","tp3"):
        new_status = utype if order.get(utype,0) > order.get(current_status,0) else current_status
    elif utype == "tp4":
        new_status = "closed_win"
    elif utype == "sl" and current_status != "closed_win":
        new_status = "closed_loss"
    if new_status != current_status:
        with engine.begin() as con:
            con.execute(text("UPDATE signals SET status=:s WHERE signal_id=:sid"),
                        {"s": new_status, "sid": signal_id})
    return new_status

def choose_signal_for_update(pair, chat_id, update_msg_id):
    q = text("""
    SELECT signal_id, pair, call_message_id, status
    FROM signals
    WHERE channel_id=:c
      AND pair=:p
      AND call_message_id < :upd_id
      AND status IN ('open','tp1','tp2','tp3')
    ORDER BY call_message_id DESC
    LIMIT 1
    """)
    with engine.begin() as con:
        df = pd.read_sql(q, con, params={"c": chat_id, "p": pair, "upd_id": update_msg_id})
    return None if df.empty else df.iloc[0].to_dict()

# ========= PROCESS =========
async def process_messages(msgs, per_msg_sleep: float = 0.2, verbose: bool = True):
    last_open = {}
    cnt_seen = cnt_call = cnt_upd = cnt_ins_call = cnt_ins_upd = 0

    for msg in tqdm_async(msgs, desc=f"Process {len(msgs)} msgs", unit="msg"):
        try:
            txt = msg.text or ""
            kind = classify(txt)
            cnt_seen += 1

            # handle edit call
            if msg.edit_date and kind == "call":
                with engine.begin() as con:
                    row = con.execute(text(
                        "SELECT signal_id FROM signals WHERE channel_id=:c AND call_message_id=:m"
                    ), {"c": msg.chat_id, "m": msg.id}).fetchone()
                if row:
                    fields = parse_call(txt)
                    updates = {
                        "entry": fields.get("entry"),
                        "target1": fields.get("target1"),
                        "target2": fields.get("target2"),
                        "target3": fields.get("target3"),
                        "target4": fields.get("target4"),
                        "stop1": fields.get("stop1"),
                        "stop2": fields.get("stop2"),
                        "risk_level": fields.get("risk_level"),
                        "volume_rank_num": fields.get("volume_rank_num"),
                        "volume_rank_den": fields.get("volume_rank_den"),
                        "raw_text": txt,
                        "text_sha1": sha1(txt),
                        "edit_date": msg.edit_date.replace(tzinfo=dt.timezone.utc).isoformat(),
                        "sid": row[0],
                    }
                    set_clause = ", ".join([f"{k}=:{k}" for k in updates.keys() if k != "sid"])
                    with engine.begin() as con:
                        con.execute(text(f"UPDATE signals SET {set_clause} WHERE signal_id=:sid"), updates)
                    if verbose: print(f"[EDIT CALL] id={msg.id}")
                    await asyncio.sleep(per_msg_sleep)
                    continue

            if kind == "call":
                fields = parse_call(txt)
                if fields.get("pair") and fields.get("entry") is not None:
                    cnt_call += 1
                    sid = upsert_signal(msg, fields)
                    if sid:
                        cnt_ins_call += 1
                        last_open[fields["pair"]] = (sid, msg.id, "open")
                        if verbose: print(f"[CALL] {fields['pair']} id={msg.id}")
                    else:
                        if verbose: print(f"[WARN] gagal upsert call id={msg.id}")

            elif kind == "update":
                upd = parse_update(txt)
                if not upd.get("pair") or not upd["events"]:
                    await asyncio.sleep(per_msg_sleep); continue
                cnt_upd += 1

                # Relasi ke CALL
                sig_row = None
                reply_to_id = getattr(getattr(msg, "reply_to", None), "reply_to_msg_id", None) or getattr(msg, "reply_to_msg_id", None)
                if reply_to_id:
                    with engine.begin() as con:
                        row = con.execute(text(
                            "SELECT signal_id, status FROM signals WHERE channel_id=:c AND call_message_id=:m"
                        ), {"c": msg.chat_id, "m": reply_to_id}).fetchone()
                    if row: sig_row = {"signal_id": row[0], "status": row[1]}
                if not sig_row:
                    linked_id = extract_linked_msg_id(msg)
                    if linked_id:
                        with engine.begin() as con:
                            row = con.execute(text(
                                "SELECT signal_id, status FROM signals WHERE channel_id=:c AND call_message_id=:m"
                            ), {"c": msg.chat_id, "m": linked_id}).fetchone()
                        if row: sig_row = {"signal_id": row[0], "status": row[1]}
                if not sig_row:
                    cache = last_open.get(upd["pair"])
                    if cache and cache[1] < msg.id:
                        sig_row = {"signal_id": cache[0], "status": cache[2]}
                if not sig_row:
                    chosen = choose_signal_for_update(upd["pair"], msg.chat_id, msg.id)
                    if chosen:
                        sig_row = {"signal_id": chosen["signal_id"], "status": chosen["status"]}
                        last_open[upd["pair"]] = (chosen["signal_id"], chosen["call_message_id"], chosen["status"])
                if not sig_row:
                    if verbose: print(f"[WARN] Update tanpa CALL: pair={upd['pair']} msg_id={msg.id}")
                    await asyncio.sleep(per_msg_sleep); continue

                # fallback harga TP dari call jika di update tak ada harga
                fallback_prices = None
                with engine.begin() as con:
                    r = con.execute(text("""
                        SELECT target1, target2, target3, target4
                        FROM signals
                        WHERE signal_id = :sid
                        LIMIT 1
                    """), {"sid": sig_row["signal_id"]}).fetchone()
                if r:
                    fallback_prices = {f"tp{i}": r[i-1] for i in range(1,5)}

                for utype, price in upd["events"]:
                    if price is None and fallback_prices and utype in fallback_prices:
                        price = fallback_prices[utype]
                    ok = insert_update(sig_row["signal_id"], msg, utype, price)
                    if ok:
                        new_status = bump_status(sig_row["signal_id"], sig_row["status"], utype)
                        sid, call_id, _ = last_open.get(upd["pair"], (sig_row["signal_id"], None, None))
                        last_open[upd["pair"]] = (sid, call_id, new_status)
                        if verbose: print(f"[UPDATE] {upd['pair']} {utype} -> {new_status} (msg_id={msg.id})")
                        if new_status in ("closed_win","closed_loss"):
                            last_open.pop(upd["pair"], None)

            if cnt_seen % 200 == 0 and verbose:
                print(f"[progress] seen={cnt_seen} call:{cnt_call}/{cnt_ins_call} upd:{cnt_upd}/{cnt_ins_upd}")
            await asyncio.sleep(per_msg_sleep)

        except FloodWaitError as e:
            if verbose: print(f"[loop] FloodWait {e.seconds}s — tidur...")
            await asyncio.sleep(e.seconds + 1)
        except Exception as ex:
            if verbose: print(f"[ERR] id={getattr(msg,'id',None)}: {ex}")

    if verbose:
        print(f"[done] seen={cnt_seen} call parsed/inserted={cnt_call}/{cnt_ins_call} upd parsed/inserted={cnt_upd}/{cnt_ins_upd}")

# ========= INGEST =========
async def preview_and_ingest_last_days(days: int = 3, limit=None, per_msg_sleep: float = 0.2,
                                       preview_n: int = 8, verbose: bool = True):
    ensure_tables()
    migrate_schema_for_multi_updates()
    sess = get_session()

    client = TelegramClient(
        sess, API_ID, API_HASH,
        connection_retries=3, request_retries=3,
        timeout=30,
        use_ipv6=False
    )
    await client.connect()
    if not await client.is_user_authorized():
        await client.start()

    try:
        since_date = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=days)
        msgs = []
        try:
            async for msg in client.iter_messages(
                CHANNEL_ID,
                offset_date=since_date,
                limit=limit,
                reverse=True
            ):
                if getattr(msg, "text", None):
                    msgs.append(msg)
        except FloodWaitError as e:
            if verbose: print(f"[iter] FloodWait {e.seconds}s — tidur...")
            await asyncio.sleep(e.seconds + 1)

        print(f"Ambil {len(msgs)} pesan dari {days} hari terakhir")
        for m in msgs[:preview_n]:
            print(m.id, m.date, (m.text or "").replace("\n", " ")[:120])

        await process_messages(msgs, per_msg_sleep=per_msg_sleep, verbose=verbose)
    finally:
        await client.disconnect()

async def ingest_from_last_id(last_id: int, per_msg_sleep: float = 0.1, preview_n: int = 8, verbose: bool = True):
    ensure_tables()
    migrate_schema_for_multi_updates()
    sess = get_session()
    client = TelegramClient(sess, API_ID, API_HASH,
                            connection_retries=3, request_retries=3,
                            timeout=30, use_ipv6=False)
    await client.connect()
    if not await client.is_user_authorized():
        await client.start()

    try:
        msgs = []
        async for msg in client.iter_messages(
            CHANNEL_ID,
            min_id=last_id,
            reverse=True
        ):
            if getattr(msg, "text", None):
                msgs.append(msg)

        if verbose:
            print(f"Ambil {len(msgs)} pesan baru sejak id={last_id}")
            for m in msgs[:preview_n]:
                print(m.id, m.date, (m.text or "").replace("\n", " ")[:120])

        await process_messages(msgs, per_msg_sleep=per_msg_sleep, verbose=verbose)
    finally:
        await client.disconnect()

# ========= UTIL =========
def print_last_10_calls():
    with engine.begin() as con:
        cnt = con.execute(text("SELECT COUNT(*) FROM signals")).scalar()
        print("rows in signals =", cnt)
        df = pd.read_sql(text("""
            SELECT
                call_message_id, pair, entry,
                target1, target2, target3, target4,
                stop1, stop2, risk_level,
                volume_rank_num, volume_rank_den,
                status, created_at, message_link
            FROM signals
            ORDER BY call_message_id DESC
            LIMIT 10
        """), con)
    if df.empty:
        print("Tidak ada data CALL.")
    else:
        print(df.to_string(index=False))

# ========= MAIN =========
if __name__ == "__main__":
    try:
        import nest_asyncio
        nest_asyncio.apply()
    except Exception:
        pass

    print("Using DB:", engine.url)

    ensure_tables()
    migrate_schema_for_multi_updates()

    LAST_ID = int(os.getenv("LQ_LAST_ID", "87876"))
    asyncio.run(ingest_from_last_id(
        last_id=LAST_ID,
        per_msg_sleep=float(os.getenv("LQ_PER_MSG_SLEEP", "0.08")),
        preview_n=int(os.getenv("LQ_PREVIEW_N", "8")),
        verbose=os.getenv("LQ_VERBOSE", "true").lower() == "true",
    ))

    print_last_10_calls()
