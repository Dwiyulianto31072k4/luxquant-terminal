"""One-shot: Agent problem queue vs signed live acknowledgements."""
from app.core.database import SessionLocal
from app.models.agent_disclaimer import AgentDisclaimerAck
from app.models.user import User
from app.services import autotrade_monitor as m

o = m.overview()
users = o.get("users") or []
problems = [u for u in users if u.get("status") in ("error", "warn")]
print("problems", len(problems))
print(
    "live_bots",
    sum(1 for u in users if u.get("is_active") and u.get("dry_run") is False),
)

db = SessionLocal()
acks = db.query(AgentDisclaimerAck).all()
print("acks_total", len(acks))
print("live_acks", sum(1 for a in acks if a.kind == "live"))
print("assistant_acks", sum(1 for a in acks if a.kind == "assistant"))

by_user: dict[int, list] = {}
for a in acks:
    by_user.setdefault(a.user_id, []).append(a)
print("users_with_any_ack", len(by_user))
print(
    "users_with_live",
    sum(1 for rows in by_user.values() if any(r.kind == "live" for r in rows)),
)

print("\n=== problem queue ===")
for u in sorted(
    problems,
    key=lambda x: (0 if x.get("status") == "error" else 1, -(x.get("recent_errors") or 0)),
):
    uid = u.get("luxquant_user_id")
    rows = by_user.get(uid) or []
    kinds = ",".join(sorted({r.kind for r in rows})) or "-"
    live_at = next((r.accepted_at.isoformat() for r in rows if r.kind == "live"), None)
    venues = ",".join(
        v.get("exchange") for v in (u.get("venues") or []) if v.get("connected")
    )
    reason = (u.get("reasons") or [""])[0][:90]
    print(
        f"lq:{uid} status={u.get('status')} active={u.get('is_active')} "
        f"dry={u.get('dry_run')} key={u.get('key_status')} venues={venues or '-'} "
        f"acks={kinds} live_at={live_at} reason={reason}"
    )

print("\n=== live signed ===")
for uid, rows in sorted(by_user.items()):
    live = [r for r in rows if r.kind == "live"]
    if not live:
        continue
    u = next((x for x in users if x.get("luxquant_user_id") == uid), None)
    user = db.query(User).filter(User.id == uid).first()
    venues = (
        [v.get("exchange") for v in (u.get("venues") or []) if v.get("connected")]
        if u
        else None
    )
    print(
        f"lq:{uid} @{getattr(user, 'username', None)} "
        f"live_ack={live[0].accepted_at.isoformat()} "
        f"status={u.get('status') if u else 'not-in-monitor'} "
        f"active={u.get('is_active') if u else None} venues={venues}"
    )
db.close()
