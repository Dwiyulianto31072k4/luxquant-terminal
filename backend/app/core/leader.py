"""
LuxQuant Terminal — Redis single-leader election for background pollers
=======================================================================

Problem this solves
--------------------
The API runs with `uvicorn --workers N`, and the lifespan starts the
background pollers (CoinGecko / Binance cache workers) in EVERY worker
process. That multiplied every external API call by N (×4 in prod) and
exhausted the CoinGecko Demo quota.

Those pollers only fetch data and write it to a SHARED store (Redis), so a
single poller is enough for all N request-workers to read from. Running N
copies is not redundancy — it's N× the same work and N× the API spend.

What this gives instead
-----------------------
Exactly one process ("leader") runs the pollers. If that process dies, its
lock expires after LEADER_TTL seconds and one of the standby workers takes
over automatically — so we keep crash-failover WITHOUT the N× cost.

Mechanism
---------
Every worker runs `_election_loop()` which, every RENEW_EVERY seconds, runs
an atomic Lua "acquire-or-renew":
    if key is vacant OR already mine  -> set key=me EX TTL, I am leader
    else                              -> someone else leads, I stand by
Because it's a single atomic script, two workers can never both win.

Usage
-----
    from app.core.leader import start_leader_election, is_leader

    # lifespan (runs in every worker):
    start_leader_election()

    # inside a polling loop:
    while True:
        if not is_leader():
            await asyncio.sleep(STANDBY_POLL)   # short — so a new leader
            continue                            # starts working promptly
        ... do external API work ...
"""
import os
import socket
import asyncio

from app.core.redis import get_redis, is_redis_available

LEADER_KEY = "lq:poller:leader"
LEADER_TTL = 30          # seconds the lock survives without a renew
RENEW_EVERY = 10         # leader renews well before TTL expiry
STANDBY_POLL = 15        # how often a non-leader re-checks / how fast it takes over

# Unique id for this process (host + pid) so the leader can recognise its own lock.
_instance_id = f"{socket.gethostname()}:{os.getpid()}"
_is_leader = False
_started = False

# Atomic acquire-or-renew. Returns 1 if this instance holds leadership afterwards.
_ACQUIRE_LUA = """
local v = redis.call('get', KEYS[1])
if (not v) or v == ARGV[1] then
  redis.call('set', KEYS[1], ARGV[1], 'EX', ARGV[2])
  return 1
end
return 0
"""


def is_leader() -> bool:
    """True only in the single process currently holding the poller lock."""
    return _is_leader


def leader_instance_id() -> str:
    return _instance_id


async def _election_loop():
    global _is_leader
    while True:
        try:
            if not is_redis_available():
                # No Redis → can't coordinate. Stay standby so we don't
                # accidentally run N pollers; pollers also skip without Redis.
                _is_leader = False
            else:
                client = get_redis()
                got = client.eval(_ACQUIRE_LUA, 1, LEADER_KEY, _instance_id, LEADER_TTL)
                was_leader = _is_leader
                _is_leader = bool(got)
                if _is_leader and not was_leader:
                    print(f"🗳️  This worker is now the POLLER LEADER ({_instance_id})")
                elif was_leader and not _is_leader:
                    print(f"🗳️  Lost poller leadership ({_instance_id}) — standing by")
        except Exception as e:
            print(f"⚠️ Leader election error: {type(e).__name__}: {e}")
            _is_leader = False
        await asyncio.sleep(RENEW_EVERY)


def start_leader_election():
    """Start the election loop (idempotent). Call once per process in lifespan."""
    global _started
    if _started:
        return
    _started = True
    loop = asyncio.get_event_loop()
    loop.create_task(_election_loop())
    print(f"🗳️  Leader election started (instance={_instance_id}, ttl={LEADER_TTL}s, renew={RENEW_EVERY}s)")
