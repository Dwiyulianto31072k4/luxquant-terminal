#!/usr/bin/env python3
"""CI gate: no async route/dependency may do sync DB work on the event loop.

Why this exists — 2026-07-19, production: gunicorn murdered workers 124 times
in 24 hours. An `async def` function runs on the event loop; a synchronous
db.query()/db.execute() inside one blocks that loop for the query's duration,
and under database contention a few of those back-to-back exceed the 60s
heartbeat — the arbiter kills the worker and every in-flight request on it
dies at once. The killer was get_current_user: async, sync db.query, traversed
by every authenticated request. Flipping it (and 123 handlers with the same
shape) to plain `def` took the same load gauntlet from 9 kills per 10 minutes
to zero, then through a live deploy study: 1,178/1,178 requests unharmed.

Two shapes fail this gate:
  - an `async def` that touches the DB and awaits nothing: async bought
    nothing, so it belongs in the threadpool as a plain `def`;
  - an `async def` that awaits (httpx, Telegram) AND touches the DB directly:
    the DB part goes through run_in_threadpool.

A commit or refresh blocks exactly like a query, so they count too. Work handed
to run_in_threadpool / asyncio.to_thread — a lambda, or a nested def passed by
name — runs in a thread and does not count.

History: this used to accept 21 await-mixing cases as debt and count only
execute/query, with the debt check returning before the no-await failures were
even printed. By 25 Sep 2026 the debt had grown to 25 and CI had been red for
weeks. All of it was paid off on 26 Sep; the baseline is now zero.
"""

import ast
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent / "app" / "api"

SYNC_DB = {"execute", "query", "commit", "refresh", "flush", "rollback", "scalar", "scalars", "get", "merge"}
OFFLOAD = {"run_in_threadpool", "to_thread", "run_in_executor", "run_sync"}


def _callee(call: ast.Call) -> str:
    f = call.func
    return f.attr if isinstance(f, ast.Attribute) else (f.id if isinstance(f, ast.Name) else "")


def _offloaded(fn: ast.AsyncFunctionDef) -> set:
    """ids of every node that runs in a thread rather than on the loop."""
    ids, names = set(), set()
    for call in ast.walk(fn):
        if isinstance(call, ast.Call) and _callee(call) in OFFLOAD:
            for arg in call.args:
                if isinstance(arg, ast.Name):
                    names.add(arg.id)
                ids.update(id(n) for n in ast.walk(arg))
    for node in ast.walk(fn):
        if isinstance(node, ast.FunctionDef) and node.name in names:
            ids.update(id(n) for n in ast.walk(node))
    return ids


def sync_db_calls(fn: ast.AsyncFunctionDef) -> int:
    off = _offloaded(fn)
    return sum(
        1
        for sub in ast.walk(fn)
        if isinstance(sub, ast.Call)
        and isinstance(sub.func, ast.Attribute)
        and sub.func.attr in SYNC_DB
        and isinstance(sub.func.value, ast.Name)
        and sub.func.value.id == "db"
        and id(sub) not in off
    )


def has_await(node: ast.AST) -> bool:
    return any(isinstance(sub, (ast.Await, ast.AsyncFor, ast.AsyncWith)) for sub in ast.walk(node))


def analyze(source: str, where: str = "<src>"):
    failures, warnings = [], []
    for node in ast.walk(ast.parse(source, filename=where)):
        if not isinstance(node, ast.AsyncFunctionDef):
            continue
        calls = sync_db_calls(node)
        if not calls:
            continue
        label = f"{where}:{node.lineno} async def {node.name} ({calls} sync db call{'s' if calls > 1 else ''})"
        (warnings if has_await(node) else failures).append(label)
    return failures, warnings


def self_test() -> None:
    cases = {
        "offloaded lambda": ("async def f(db):\n    await run_in_threadpool(lambda: db.query(U).first())\n", 0, 0),
        "offloaded named def": (
            "async def f(db):\n    def _load():\n        return db.query(U).all()\n    return await run_in_threadpool(_load)\n", 0, 0),
        "commit on the loop": ("async def f(db):\n    await httpx_call()\n    db.commit()\n", 0, 1),
        "no await at all": ("async def f(db):\n    return db.query(U).all()\n", 1, 0),
    }
    for label, (src, want_fail, want_warn) in cases.items():
        fails, warns = analyze(src)
        if (len(fails), len(warns)) != (want_fail, want_warn):
            print(f"sync-db-on-loop gate: SELF-TEST FAILED ({label}): {fails} {warns}")
            sys.exit(2)


def main() -> int:
    self_test()
    failures, warnings = [], []
    for f in sorted(ROOT.rglob("*.py")):
        fails, warns = analyze(f.read_text(), str(f.relative_to(ROOT.parent.parent)))
        failures += fails
        warnings += warns

    if warnings:
        print("FAIL — async functions that await AND touch the DB on the event loop:")
        for w in warnings:
            print(f"  {w}")
        print("Move the DB work into run_in_threadpool (a lambda, or a nested def passed by name).")
    if failures:
        print("FAIL — async functions doing sync DB with no await (event-loop blockers):")
        for x in failures:
            print(f"  {x}")
        print("Make these plain `def` (FastAPI runs them in the threadpool). See the header")
        print("of app/api/deps.py for the production incident this prevents.")
    if warnings or failures:
        return 1
    print("sync-db-on-loop gate: clean (self-test passed)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
