"""Unsubscribe — the one page in the product that must work with no account.

Two verbs, and the split matters:

  GET  shows a confirmation page and changes nothing.
  POST performs the unsubscribe.

That is not ceremony. Corporate mail scanners and link previewers fetch every
URL in a message, and a GET that unsubscribes would silently opt people out of
mail they never chose to leave. RFC 8058 one-click, which is what Gmail's
"Unsubscribe" button uses, sends a POST — so the button in the inbox still
works in one step while a robot's GET cannot do any harm.
"""
import base64
import hashlib
import hmac
import json
import logging
import os
import time

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services import email_log
from app.services import email_suppression as sup
from app.services import email_templates as tpl

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/email", tags=["email"])


def _page(title: str, lede: str, action: str | None, token: str | None = None) -> str:
    """Same palette as the mail it came from, so the click does not land the
    reader somewhere that looks like a different company."""
    button = ""
    if action and token:
        button = f"""
      <form method="post" action="{action}" style="margin:26px 0 0;">
        <input type="hidden" name="t" value="{token}">
        <button type="submit" style="display:inline-block;padding:13px 26px;border:0;cursor:pointer;
          font-family:{tpl.SANS};font-size:16px;font-weight:600;color:{tpl.GOLD_FG};
          background:{tpl.GOLD};background-image:linear-gradient(180deg,{tpl.GOLD_LIGHT} 0%,{tpl.GOLD} 62%,{tpl.GOLD_DARK} 100%);
          border-radius:8px;">Yes, unsubscribe</button>
      </form>"""
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>{title} · LuxQuant</title></head>
<body style="margin:0;background:{tpl.GROUND};">
<div style="max-width:560px;margin:0 auto;padding:64px 20px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:22px;"><tr>
    <td width="34" style="padding-right:11px;" valign="middle">
      <img src="{tpl.LOGO}" width="34" height="34" alt="" style="display:block;border-radius:8px;">
    </td>
    <td valign="middle" style="font-family:{tpl.SANS};font-size:19px;font-weight:800;color:{tpl.INK};">
      Lux<span style="color:{tpl.GOLD};">Quant</span></td>
  </tr></table>
  <div style="background:{tpl.CARD};border:1px solid {tpl.RING};border-radius:14px;padding:32px 30px;">
    <h1 style="margin:0 0 10px;font-family:{tpl.SANS};font-size:22px;font-weight:800;
      letter-spacing:-0.025em;color:{tpl.INK};">{title}</h1>
    <p style="margin:0;font-family:{tpl.SANS};font-size:14.5px;line-height:1.65;color:{tpl.INK_SOFT};">{lede}</p>
    {button}
  </div>
  <p style="margin:20px 4px 0;font-family:{tpl.SANS};font-size:11px;line-height:1.7;color:{tpl.INK_MUTED};">
    <a href="https://luxquant.tw" style="color:{tpl.INK_SOFT};text-decoration:none;">luxquant.tw</a>
  </p>
</div>
</body></html>"""


_GONE = ("This link is not valid",
         "It may have been truncated by your mail client. Copy the whole "
         "address from the email, or reply to us and we will remove you by hand.")

# Say precisely what stops and what does not. "Payments and access are
# unaffected" was too broad — it covered the renewal and invoice reminders,
# which DO stop — and a promise that does not match the code is worse than no
# promise at all.
_DONE = ("You are unsubscribed",
         "No more reminders about invoices or renewals. Receipts for payments "
         "you actually make are still sent — those are proof of a purchase, "
         "not something to opt into.")


@router.get("/unsubscribe", response_class=HTMLResponse)
async def unsubscribe_page(request: Request, t: str = ""):
    email = sup.read_token(t)
    if not email:
        return HTMLResponse(_page(*_GONE, None), status_code=400)
    # <!--email_off--> is Cloudflare's documented opt-out from Email Address
    # Obfuscation. Without it CF rewrites the address into "[email protected]"
    # behind a decoder script and a /cdn-cgi/ link — so the one thing this page
    # exists to show, which address is about to be unsubscribed, is the one
    # thing the reader cannot see.
    return HTMLResponse(_page(
        "Unsubscribe from LuxQuant emails",
        f"You are about to stop LuxQuant emails to <strong style=\"color:"
        f"{tpl.INK};\"><!--email_off-->{email}<!--/email_off--></strong>.",
        str(request.url_for("unsubscribe_confirm")), t))


@router.post("/unsubscribe", response_class=HTMLResponse, name="unsubscribe_confirm")
async def unsubscribe_confirm(t: str = "", t_form: str = Form("", alias="t"),
                              db: Session = Depends(get_db)):
    """`t` arrives two different ways and both have to work.

    Gmail's one-click POSTs to the List-Unsubscribe URL itself, so the token is
    in the QUERY STRING and the body is RFC 8058's `List-Unsubscribe=One-Click`.
    The confirmation page here posts it as a FORM FIELD. Reading only one of
    them would silently break the other."""
    email = sup.read_token(t or t_form)
    if not email:
        return HTMLResponse(_page(*_GONE, None), status_code=400)
    sup.suppress(db, email, "unsubscribed")
    return HTMLResponse(_page(*_DONE, None))


# ── Provider webhook ───────────────────────────────────────────────────────
# Resend reports a bounce or a spam complaint minutes to hours after the send,
# and those two are the only signals that keep a sending domain alive: an
# address that hard-bounces and keeps being mailed is how a young domain gets
# blocked. Signed with Svix, which is what Resend uses.

WEBHOOK_SECRET_ENV = "RESEND_WEBHOOK_SECRET"
_TOLERANCE = 5 * 60          # seconds; anything older is a replay


def _verify_svix(secret: str, svix_id: str, svix_ts: str, sig_header: str,
                 body: bytes) -> bool:
    """Constant-time check of any of the signatures the header carries.

    The header can hold several (`v1,a v1,b`) because a secret being rotated
    signs with both for a while; matching only the first would drop every
    delivery during a rotation."""
    try:
        ts = int(svix_ts)
    except (TypeError, ValueError):
        return False
    if abs(time.time() - ts) > _TOLERANCE:
        return False
    try:
        key = base64.b64decode(secret.split("_", 1)[1])
    except Exception:
        return False
    signed = f"{svix_id}.{svix_ts}.".encode() + body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
    for part in (sig_header or "").split():
        if "," in part and hmac.compare_digest(part.split(",", 1)[1], expected):
            return True
    return False


@router.post("/webhook/resend")
async def resend_webhook(request: Request, db: Session = Depends(get_db)):
    """Bounces and complaints, straight onto the suppression list.

    Fails CLOSED when no secret is configured. An unauthenticated endpoint that
    can suppress an arbitrary address is a way for anyone to cut a paying
    customer off from their own receipts.
    """
    secret = os.getenv(WEBHOOK_SECRET_ENV, "")
    if not secret:
        logger.warning("resend webhook called but %s is not set", WEBHOOK_SECRET_ENV)
        raise HTTPException(status_code=503, detail="webhook not configured")

    body = await request.body()
    h = request.headers
    if not _verify_svix(secret, h.get("svix-id", ""), h.get("svix-timestamp", ""),
                        h.get("svix-signature", ""), body):
        raise HTTPException(status_code=401, detail="bad signature")

    try:
        payload = json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="bad body")

    event = (payload.get("type") or "").lower()
    data = payload.get("data") or {}
    msg_id = data.get("email_id") or data.get("id")
    to = data.get("to")
    address = (to[0] if isinstance(to, list) and to else to) or ""

    # Only a HARD bounce suppresses. A soft one is a full mailbox or a server
    # having a bad afternoon, and striking that address off permanently would
    # lose a customer over a temporary condition.
    bounce_type = ((data.get("bounce") or {}).get("type") or "").lower()

    status = {
        "email.delivered": "delivered",
        "email.bounced": "bounced",
        "email.complained": "complained",
        "email.delivery_delayed": "delayed",
    }.get(event)

    if status and msg_id:
        email_log.mark_by_provider_id(db, msg_id, status,
                                      detail=bounce_type or event)

    if address and (event == "email.complained"
                    or (event == "email.bounced" and bounce_type != "transient")):
        sup.suppress(db, address,
                     "complaint" if event == "email.complained" else "hard_bounce")
        logger.info("suppressed %s after %s", address, event)

    # 200 even for an event we do not act on: a provider that gets anything
    # else retries it for hours.
    return {"ok": True, "event": event, "recorded": bool(status and msg_id)}
