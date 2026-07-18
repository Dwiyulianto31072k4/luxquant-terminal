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

# Only processes marked "eligible" may ever become leader and run the pollers.
# Default True = backward compatible (any process can lead). Set
# LUXQUANT_POLLER_ELIGIBLE=0 on the API service so its request-workers NEVER
# poll — leaving the dedicated luxquant-poller.service as the sole poller.
_ELIGIBLE = os.getenv("LUXQUANT_POLLER_ELIGIBLE", "1").strip().lower() not in ("0", "false", "no", "off")

# Atomic release: delete the key ONLY if we still own it, so a process that
# already lost leadership (stalled past its TTL) cannot delete the new leader's
# lock on its way out.
_RELEASE_LUA = """
local v = redis.call('get', KEYS[1])
if v == ARGV[1] then
  redis.call('del', KEYS[1])
  return 1
end
return 0
"""


def resign_leadership() -> bool:
    """Hand leadership back at shutdown instead of letting the lock time out.

    Without this the lock simply expires: the departing process dies still
    holding it and the replacement waits out the full TTL before it can start
    working. Measured on a real restart, that gap ran 75 seconds — 75 seconds
    with nobody refreshing any cache, which is exactly when the request logs
    fill with 20-second responses. Releasing on the way out turns that into
    roughly one second.
    """
    global _is_leader
    try:
        from app.core.redis import get_redis
        released = bool(get_redis().eval(_RELEASE_LUA, 1, LEADER_KEY, _instance_id))
        if released:
            print(f"🗳️  Leadership released ({_instance_id})")
        _is_leader = False
        return released
    except Exception as e:
        print(f"⚠️ Leadership release failed: {type(e).__name__}: {e}")
        return False


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
            if not _ELIGIBLE:
                # This process (e.g. an API request-worker) must never poll.
                _is_leader = False
            elif not is_redis_available():
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
