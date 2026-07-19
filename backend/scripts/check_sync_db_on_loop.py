#!/usr/bin/env python3
"""CI gate: no async route/dependency may do sync DB work without awaiting.

Why this exists — 2026-07-19, production: gunicorn murdered workers 124 times
in 24 hours. An `async def` function runs on the event loop; a synchronous
db.query()/db.execute() inside one blocks that loop for the query's duration,
and under database contention a few of those back-to-back exceed the 60s
heartbeat — the arbiter kills the worker and every in-flight request on it
dies at once. The killer was get_current_user: async, sync db.query, traversed
by every authenticated request. Flipping it (and 123 handlers with the same
shape) to plain `def` took the same load gauntlet from 9 kills per 10 minutes
to zero, then through a live deploy study: 1,178/1,178 requests unharmed.

This gate blocks the unambiguous regression: an `async def` in app/api/ that
touches db.execute/db.query and contains NO await — meaning async bought
nothing and the function belongs in the threadpool as a plain `def`.

Functions that DO await (httpx fan-outs mixing in sync db) are reported as
warnings, not failures: fixing those needs run_in_threadpool judgment, and the
handful that exist are low-traffic. New code should not add to them.
"""

import ast
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent / "app" / "api"

SYNC_DB = {"execute", "query"}


def sync_db_calls(node: ast.AST) -> int:
    n = 0
    for sub in ast.walk(node):
        if (
            isinstance(sub, ast.Call)
            and isinstance(sub.func, ast.Attribute)
            and sub.func.attr in SYNC_DB
            and isinstance(sub.func.value, ast.Name)
            and sub.func.value.id == "db"
        ):
            n += 1
    return n


def has_await(node: ast.AST) -> bool:
    return any(isinstance(sub, (ast.Await, ast.AsyncFor, ast.AsyncWith)) for sub in ast.walk(node))


def main() -> int:
    failures, warnings = [], []
    for f in sorted(ROOT.rglob("*.py")):
        tree = ast.parse(f.read_text(), filename=str(f))
        for node in ast.walk(tree):
            if not isinstance(node, ast.AsyncFunctionDef):
                continue
            calls = sync_db_calls(node)
            if not calls:
                continue
            where = f"{f.relative_to(ROOT.parent.parent)}:{node.lineno} async def {node.name} ({calls} sync db call{'s' if calls > 1 else ''})"
            if has_await(node):
                warnings.append(where)
            else:
                failures.append(where)

    for w in warnings:
        print(f"  warning (awaits + sync db — wrap the db calls in run_in_threadpool): {w}")
    if failures:
        print("\nFAIL — async functions doing sync DB with no await (event-loop blockers):")
        for x in failures:
            print(f"  {x}")
        print("\nMake these plain `def` (FastAPI runs them in the threadpool), or wrap the")
        print("DB work in run_in_threadpool. See the header of app/api/deps.py for the")
        print("production incident this prevents.")
        return 1
    print(f"sync-db-on-loop gate: clean ({len(warnings)} accepted await-mixing warnings)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
