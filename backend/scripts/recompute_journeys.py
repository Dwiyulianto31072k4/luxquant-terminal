"""Recompute a list of signal journeys with the current fetcher.

One-off repair for audit item J (2026-09-26): 2,690 journeys built on Bybit's
newest-first klines (their first candle a median 253 days after the call) and
119 built on another instrument that shares the ticker. The fetcher is fixed;
this re-runs process_signal(force_recompute=True) for each id in a file.

    python scripts/recompute_journeys.py ids.txt [--rate-limit-ms 400] [--report out.csv]

Back the rows up first — this overwrites signal_journey.
"""
import argparse
import csv
import os
import sys
import time
from collections import Counter

_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

from app.workers.journey_worker import process_signal  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("ids_file")
    ap.add_argument("--rate-limit-ms", type=int, default=400)
    ap.add_argument("--report", default="recompute_report.csv")
    args = ap.parse_args()

    ids = [line.strip() for line in open(args.ids_file) if line.strip()]
    outcomes = Counter()
    started = time.time()
    with open(args.report, "w", newline="") as fh:
        out = csv.writer(fh)
        out.writerow(["signal_id", "status"])
        for i, sid in enumerate(ids, 1):
            status = process_signal(sid, force_recompute=True)
            outcomes[status.split(":")[0]] += 1
            out.writerow([sid, status])
            if i % 100 == 0 or i == len(ids):
                fh.flush()
                rate = i / max(time.time() - started, 1)
                print(f"[recompute] {i}/{len(ids)} {dict(outcomes)} ({rate:.1f}/s)", flush=True)
            time.sleep(args.rate_limit_ms / 1000)
    print(f"[recompute] done: {dict(outcomes)}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
