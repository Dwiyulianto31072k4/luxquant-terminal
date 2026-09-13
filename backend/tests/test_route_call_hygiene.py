"""
Two static rules that a partner's bug report turned into an outage.

Calling another route's function is calling a PLAIN function. FastAPI resolves
nothing, so:

  1. awaiting one that is defined with `def` raises before a line of its body
     runs, and
  2. any Query()/Depends() you leave out arrives as the FastAPI OBJECT.

Seven endpoints were serving 500 to every request they had ever received
because of these two, and one of them — /analytics/dashboard — had done it
1,011 times in a morning. Two of the calls were closer to a wrong answer than
to a crash: a Query object is truthy, so an omitted `distinct` or
`luxquant_only` flips a filter on rather than failing.

These are static because the runtime audit can only reach GET routes that need
no path parameter. Everything else has to be read.
"""
import ast
import pathlib

import pytest

APP = pathlib.Path(__file__).resolve().parents[1] / "app"
FASTAPI_MARKERS = {"Query", "Depends", "Path", "Body", "Header", "Cookie", "Form"}


def _trees():
    out = {}
    for f in sorted(APP.rglob("*.py")):
        try:
            out[f] = ast.parse(f.read_text(encoding="utf-8"))
        except SyntaxError:
            continue
    return out


def _rel(f):
    return str(f.relative_to(APP.parent))


def _module(f):
    return str(f.with_suffix("")).replace("/", ".").split("backend.")[-1]


def _signature(node):
    a = node.args
    params = [x.arg for x in a.posonlyargs + a.args]
    defaults = [None] * (len(params) - len(a.defaults)) + list(a.defaults)
    risky = {
        p
        for p, d in zip(params, defaults)
        if isinstance(d, ast.Call)
        and isinstance(d.func, ast.Name)
        and d.func.id in FASTAPI_MARKERS
    }
    return params, risky


def test_nothing_awaits_a_plain_def():
    trees = _trees()
    sync, async_names = {}, set()
    for f, t in trees.items():
        for node in ast.walk(t):
            if isinstance(node, ast.FunctionDef):
                sync.setdefault(node.name, f"{_rel(f)}:{node.lineno}")
            elif isinstance(node, ast.AsyncFunctionDef):
                async_names.add(node.name)

    offenders = []
    for f, t in trees.items():
        for node in ast.walk(t):
            if not isinstance(node, ast.Await) or not isinstance(node.value, ast.Call):
                continue
            fn = node.value.func
            name = fn.id if isinstance(fn, ast.Name) else getattr(fn, "attr", None)
            # A name defined async anywhere cannot be judged from the tree alone.
            if not name or name in async_names or name not in sync:
                continue
            offenders.append(f"{_rel(f)}:{node.lineno} awaits {name}() — defined sync at {sync[name]}")

    assert not offenders, "awaiting a plain `def` raises on every call:\n  " + "\n  ".join(offenders)


def test_no_call_leaves_a_fastapi_default_unresolved():
    trees = _trees()
    defs = {}
    for f, t in trees.items():
        mod = _module(f)
        for node in ast.walk(t):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                params, risky = _signature(node)
                defs[(mod, node.name)] = (f"{_rel(f)}:{node.lineno}", params, risky)

    offenders = []
    for f, t in trees.items():
        mod = _module(f)
        origin = {}
        for node in ast.walk(t):
            if isinstance(node, ast.ImportFrom) and node.module:
                for al in node.names:
                    origin[al.asname or al.name] = al.name and node.module
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                origin.setdefault(node.name, mod)

        for node in ast.walk(t):
            if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Name):
                continue
            key = (origin.get(node.func.id), node.func.id)
            if key not in defs:
                continue
            loc, params, risky = defs[key]
            if not risky:
                continue
            # the definition's own line, not a call
            if loc == f"{_rel(f)}:{node.lineno}":
                continue
            given = {k.arg for k in node.keywords if k.arg}
            given.update(params[i] for i in range(min(len(node.args), len(params))))
            missing = sorted(risky - given)
            if missing:
                offenders.append(
                    f"{_rel(f)}:{node.lineno} calls {node.func.id}() without {missing} — defined {loc}"
                )

    assert not offenders, (
        "an omitted Query()/Depends() arrives as the FastAPI object, and a Query "
        "object is truthy:\n  " + "\n  ".join(offenders)
    )
