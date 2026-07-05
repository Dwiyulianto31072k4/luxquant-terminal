# backend/gunicorn_conf.py
#
# Gunicorn config for the LuxQuant FastAPI backend.
# ──────────────────────────────────────────────────────────────────────
# Why gunicorn instead of `uvicorn --workers N`?
#   • Graceful rolling reload: `systemctl reload` (SIGHUP) replaces workers
#     ONE AT A TIME — a fresh worker boots and becomes ready BEFORE the old
#     one is retired, so there is never a moment with zero live workers.
#     Result: code deploys drop ZERO requests (no more ~10s login outage).
#   • Bounded graceful shutdown: an old worker gets `graceful_timeout` seconds
#     to finish in-flight requests, then is force-killed — but only that one
#     worker, never the whole service.
#
# IMPORTANT: preload_app MUST stay False. Each worker has to run the FastAPI
# lifespan itself (leader election, per-process Redis/DB connections). With
# preload the app would be imported once in the master and forked, sharing
# sockets across workers — exactly the fork-safety bug we want to avoid.

import os

bind = os.getenv("LUXQUANT_BIND", "0.0.0.0:8002")
workers = int(os.getenv("LUXQUANT_WORKERS", "4"))
worker_class = "uvicorn.workers.UvicornWorker"

# Rolling-reload / shutdown behaviour
graceful_timeout = int(os.getenv("LUXQUANT_GRACEFUL_TIMEOUT", "30"))
timeout = int(os.getenv("LUXQUANT_TIMEOUT", "120"))
keepalive = int(os.getenv("LUXQUANT_KEEPALIVE", "5"))

# Optional worker recycling to bound memory growth (0 = disabled).
# Set e.g. 2000 to have each worker respawn after ~2000 requests — helps if a
# slow leak causes the OOM kills seen in production.
max_requests = int(os.getenv("LUXQUANT_MAX_REQUESTS", "0"))
max_requests_jitter = int(os.getenv("LUXQUANT_MAX_REQUESTS_JITTER", "200"))

preload_app = False           # do NOT change — see note above
proc_name = "luxquant-backend"
loglevel = os.getenv("LUXQUANT_LOGLEVEL", "info")

# Keep startup/shutdown visible in journald.
accesslog = None              # access logs already emitted by uvicorn worker
errorlog = "-"


def on_starting(server):
    server.log.info("LuxQuant gunicorn starting (workers=%s, class=%s)", workers, worker_class)


def worker_int(worker):
    worker.log.info("LuxQuant worker %s interrupted — graceful shutdown", worker.pid)
