"""HTML for the mails LuxQuant sends.

Email is not the web. Outlook renders through Word — no flexbox, no grid, no
external stylesheet — so layout is tables and every rule is inline. Gmail clips
anything past ~102KB, which is why there is one image here and nothing else.

The look is the LANDING PAGE's, not a generic transactional template: the same
near-black ground, the same warm-grey body text, the same gold used exactly once
per mail, and the same mono micro-labels over big figures that the site uses to
show numbers. Values are read off the landing tokens rather than eyeballed, so
the two can never drift apart.
"""
from __future__ import annotations

BRAND = "LuxQuant"

# ── Palette, straight off the landing tokens (src/styles/index.css, :root) ──
#   --surface 10 5 6 · --surface-raised 20 8 10 · --accent 240 185 11
#   --accent-light 252 213 53 · --accent-dark 200 148 8 · --accent-fg 11 14 17
#   --fg #fff · --fg-secondary 184 168 154 · --fg-muted 165 149 133
# Hairlines on the landing are rgb(ink / 0.08) and rgb(accent / 0.16); email
# has no alpha in Outlook, so both are pre-composited onto their own ground.
GOLD = "#f0b90b"          # --accent
GOLD_LIGHT = "#fcd535"    # --accent-light
GOLD_DARK = "#c89408"     # --accent-dark
GOLD_FG = "#0b0e11"       # --accent-fg: dark ink ON gold, never white
INK = "#ffffff"           # --fg
INK_SOFT = "#b8a89a"      # --fg-secondary, the warm grey the landing runs on
INK_MUTED = "#a59585"     # --fg-muted, micro-labels only
GROUND = "#0a0506"        # --surface
CARD = "#14080a"          # --surface-raised
LINE = "#271c1e"          # ink 8% composited on CARD
RING = "#3d2d07"          # accent 22% composited on GROUND — the card's ring
LOGO = "https://luxquant.tw/apple-touch-icon.png"   # same artwork as the header
LINE_GROUND = "#1e191a"   # ink 8% composited on GROUND, for rules outside the card
TILE_BG   = "#140f10"     # ink 4% on GROUND — the landing's social tile fill
TILE_LINE = "#272324"     # ink 12% on GROUND — its border

# ── Where LuxQuant actually is ────────────────────────────────────────────
# Same set the landing footer carries, plus the second X account, which the
# landing does not list yet. Partner marks (DRC, CryptoNewsCanada, CryptoLeb)
# are deliberately NOT here: they belong on a marketing page, and every extra
# outbound link in a transactional mail is weight against its spam score.
#
# Icons are PNG at 48px displayed at 18px. Not SVG — Gmail and Outlook strip it
# outright; not JPEG — on a dark ground the white box around a JPEG is the
# giveaway. Transparent PNG is the one format that survives every client and
# both colour schemes.
_ICON = "https://luxquant.tw/email/{}.png"
SOCIALS = [
    ("Website",   "luxquant.tw",     "https://luxquant.tw",               "web"),
    ("Telegram",  "@LuxQuantSignal", "https://t.me/LuxQuantSignal",       "telegram"),
    ("X",         "@luxquantalgo",   "https://x.com/luxquantalgo",        "x"),
    ("X",         "@luxquantcrypto", "https://x.com/luxquantcrypto",      "x"),
    ("Instagram", "@luxquant.tw",    "https://instagram.com/luxquant.tw", "instagram"),
]
TAGLINE = ("Market intelligence for crypto — signals, research, "
           "and the full terminal.")

SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"
# The landing self-hosts Open Sauce One; a webfont cannot be relied on in mail,
# so the stack falls through to the same system faces the site falls back to.
MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace"

# A dark mail also sidesteps the usual dark-mode problem: there is nothing for a
# client to invert. Apple Mail and Gmail leave an explicitly dark palette alone,
# where a white one gets rewritten and often breaks.
_HEAD = f"""\
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">"""


def _eyebrow(text: str, color: str = INK_MUTED) -> str:
    """The landing's micro-label: mono, uppercase, widely tracked, tiny.

    It is what tells the reader a figure is a figure before they read it, and
    it is the cheapest piece of the site's voice to carry into mail."""
    return (f'<span style="font-family:{MONO};font-size:10px;font-weight:700;'
            f'text-transform:uppercase;letter-spacing:0.2em;color:{color};">{text}</span>')


def _button(label: str, url: str) -> str:
    """A table, not an <a> with padding: Outlook drops padding on inline links.

    The landing's CTA is a lit surface, not a colour swatch — a light source
    above the top edge, brightest at the top, falling to accent-dark. Outlook
    ignores background-image and keeps the solid bgcolor, which is the same
    button one step flatter; every other client gets the ramp."""
    return f"""
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 6px;">
  <tr><td align="center" bgcolor="{GOLD}" style="border-radius:8px;background-color:{GOLD};background-image:linear-gradient(180deg,{GOLD_LIGHT} 0%,{GOLD} 62%,{GOLD_DARK} 100%);">
    <a href="{url}" style="display:inline-block;padding:13px 26px;font-family:{SANS};font-size:16px;font-weight:600;line-height:17px;color:{GOLD_FG};text-decoration:none;border-radius:8px;">{label}</a>
  </td></tr>
</table>"""


def _hero(label: str, value: str, sub: str = "") -> str:
    """Label over a big mono figure — how every number on the site is shown.

    An invoice whose amount is buried in a table row reads like a receipt for
    something already done. Leading with the figure is what makes it read as a
    thing still waiting."""
    subline = (f'<div style="margin-top:7px;font-family:{SANS};font-size:13px;'
               f'color:{INK_SOFT};">{sub}</div>') if sub else ""
    # Unit one register down from the figure, the way the terminal prints it:
    # at the same size mono puts a full em between the two and "49  USDT" reads
    # as two separate values.
    unit = ""
    if " " in value:
        value, unit = value.split(" ", 1)
        unit = (f'<span style="font-size:17px;font-weight:600;color:{INK_SOFT};'
                f'letter-spacing:0.04em;">&nbsp;{unit}</span>')
    return f"""
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 4px;">
  <tr><td style="padding:18px 20px;background-color:{GROUND};border:1px solid {LINE};border-radius:10px;">
    <div style="margin-bottom:9px;">{_eyebrow(label)}</div>
    <div style="font-family:{MONO};font-size:30px;line-height:1.1;font-weight:700;letter-spacing:-0.01em;color:{INK};">{value}{unit}</div>
    {subline}
  </td></tr>
</table>"""


def _row(label: str, value: str, strong: bool = False) -> str:
    w = "700" if strong else "500"
    return f"""
<tr>
  <td style="padding:11px 0;border-bottom:1px solid {LINE};font-family:{SANS};font-size:13px;color:{INK_SOFT};">{label}</td>
  <td align="right" style="padding:11px 0;border-bottom:1px solid {LINE};font-family:{MONO};font-size:14px;font-weight:{w};color:{INK};">{value}</td>
</tr>"""


def _section(title: str) -> str:
    """A ruled band inside the detail table.

    A twelve-row invoice with no grouping is read as one undifferentiated list;
    the reader cannot tell that "Address" belongs to paying and "Access" belongs
    to what they get. The bands are the same mono micro-label the site uses."""
    return (f'<tr><td colspan="2" style="padding:22px 0 8px;">{_eyebrow(title)}</td></tr>')


def _mono_row(label: str, value: str) -> str:
    """For a wallet address: 42 characters that must not be re-wrapped in the
    middle by a client guessing at word boundaries, and must never become a
    link — a tappable address in mail is a phishing pattern, not a convenience."""
    return f"""
<tr>
  <td style="padding:11px 0;border-bottom:1px solid {LINE};font-family:{SANS};font-size:13px;color:{INK_SOFT};" valign="top">{label}</td>
  <td align="right" style="padding:11px 0;border-bottom:1px solid {LINE};font-family:{MONO};font-size:12px;font-weight:500;color:{INK};word-break:break-all;line-height:1.5;" valign="top">{value}</td>
</tr>"""


def _table(*rows: str) -> str:
    return ('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
            'border="0" style="margin:20px 0 4px;">' + "".join(rows) + "</table>")


def _flinks() -> str:
    items = [("luxquant.tw", "https://luxquant.tw"),
             ("Track record", "https://luxquant.tw/performance"),
             ("Support", "https://t.me/luxquant_support")]
    return "&nbsp;·&nbsp;".join(
        f'<a href="{u}" style="color:{INK_SOFT};text-decoration:none;">{l}</a>'
        for l, u in items)


def _footer_top() -> str:
    """Brand on the left, where LuxQuant can be found on the right.

    Two columns rather than a centred stack because the mail above it is a
    left-aligned document; a centred footer under a left-aligned body reads as
    a template someone forgot to finish.

    The tiles are the landing footer's own chrome — one size, one radius, one
    border, monochrome glyphs — so the row reads as a set rather than as five
    different app icons.

    Both X accounts are here and the mark is the same on both, so the tile
    alone cannot say which is which: `alt` and `title` carry the handle, which
    is also what shows when a client blocks images (Gmail still does for a
    sender you have not written back to)."""
    tiles = "".join(f"""
      <td width="36" valign="middle" style="padding-left:8px;">
        <table role="presentation" width="36" cellpadding="0" cellspacing="0" border="0" bgcolor="{TILE_BG}" style="width:36px;background-color:{TILE_BG};border:1px solid {TILE_LINE};border-radius:9px;">
          <tr><td height="34" align="center" valign="middle" style="height:34px;line-height:34px;">
            <a href="{href}" title="{name} · {handle}" style="text-decoration:none;">
              <img src="{_ICON.format(slug)}" width="18" height="18" alt="{handle}" style="display:inline-block;width:18px;height:18px;border:0;vertical-align:middle;">
            </a>
          </td></tr>
        </table>
      </td>""" for name, handle, href, slug in SOCIALS)

    return f"""
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
 <tr>
  <td width="52%" valign="middle" style="padding-right:14px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="26" style="padding-right:9px;" valign="middle">
        <img src="{LOGO}" width="26" height="26" alt="" style="display:block;width:26px;height:26px;border-radius:6px;border:0;">
      </td>
      <td valign="middle" style="font-family:{SANS};font-size:15px;font-weight:700;letter-spacing:0.01em;color:{INK};">{BRAND}</td>
    </tr></table>
  </td>
  <td width="48%" valign="middle" align="right">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right"><tr>{tiles}
    </tr></table>
  </td>
 </tr>
 <tr><td colspan="2" style="padding-top:13px;font-family:{SANS};font-size:12.5px;line-height:1.65;color:{INK_MUTED};">{TAGLINE}</td></tr>
</table>"""


def wrap(title: str, preheader: str, body: str, unsubscribe_url: str | None = None,
         kicker: str = "") -> str:
    """Frame every mail shares. `preheader` is the grey line the inbox previews
    beside the subject — left empty it shows raw markup, which reads as spam.

    `kicker` is the mono word in the header's right corner (INVOICE, RENEWAL).
    It does the job a subject line cannot: it survives being skimmed."""
    # Transactional mail is not legally required to carry an unsubscribe, but
    # including one costs nothing and is what keeps a receipt from being filed
    # as marketing by a client that cannot tell the difference.
    unsub = ""
    if unsubscribe_url:
        unsub = (f'<a href="{unsubscribe_url}" style="color:{INK_MUTED};'
                 f'text-decoration:underline;">Unsubscribe</a>')
    kick = (f'<td align="right" valign="middle">{_eyebrow(kicker)}</td>') if kicker else "<td></td>"
    return f"""<!doctype html>
<html lang="en"><head>{_HEAD}<title>{title}</title></head>
<body style="margin:0;padding:0;background-color:{GROUND};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="{GROUND}" style="background-color:{GROUND};">
 <tr><td align="center" style="padding:34px 16px 40px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center" style="width:600px;max-width:600px;">

   <tr><td style="padding:0 2px 20px;">
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
       <td width="34" style="padding-right:11px;" valign="middle">
         <img src="{LOGO}" width="34" height="34" alt="{BRAND}" style="display:block;width:34px;height:34px;border-radius:8px;border:0;">
       </td>
       <td valign="middle" style="font-family:{SANS};font-size:19px;font-weight:800;letter-spacing:0.01em;color:{INK};">
         Lux<span style="color:{GOLD};">Quant</span>
       </td>
       {kick}
     </tr></table>
   </td></tr>

   <tr><td bgcolor="{CARD}" style="background-color:{CARD};border:1px solid {RING};border-radius:14px;padding:32px 30px;">
     {body}
   </td></tr>

   <tr><td style="padding:26px 4px 0;">{_footer_top()}</td></tr>
   <tr><td style="padding:18px 4px 0;border-top:1px solid {LINE_GROUND};font-family:{SANS};font-size:11px;line-height:1.7;color:{INK_MUTED};">
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
       <td style="font-family:{SANS};font-size:11px;color:{INK_MUTED};">{_flinks()}</td>
       <td align="right" style="font-family:{SANS};font-size:11px;color:{INK_MUTED};">{unsub}</td>
     </tr></table>
     Sent by {BRAND} · you are receiving this because you have a {BRAND} account.
   </td></tr>

  </table>
 </td></tr>
</table>
</body></html>"""


def _h(text: str) -> str:
    # The landing tightens headings to -0.025em and leaves h1 at normal; at mail
    # sizes there is only one heading, so it takes the tightened setting.
    return (f'<h1 style="margin:0 0 10px;font-family:{SANS};font-size:22px;'
            f'line-height:1.3;font-weight:800;letter-spacing:-0.025em;color:{INK};">{text}</h1>')


def _p(text: str) -> str:
    return (f'<p style="margin:0 0 14px;font-family:{SANS};font-size:14.5px;'
            f'line-height:1.65;color:{INK_SOFT};">{text}</p>')


def _note(text: str) -> str:
    return (f'<p style="margin:20px 0 0;padding-top:17px;border-top:1px solid {LINE};'
            f'font-family:{SANS};font-size:12.5px;line-height:1.65;color:{INK_MUTED};">{text}</p>')


CHECKOUT_URL = "https://luxquant.tw/payment"
RENEW_URL = "https://luxquant.tw/pricing"

# There is no plan called "Premium". subscription_plans holds exactly three rows
# — Monthly (30d), Annual (365d), Lifetime (no expiry) — so a mail that names the
# tier without its duration is describing a plan the customer cannot find on the
# pricing page. Duration is half of what they bought.
def _duration(days: int | None) -> str:
    """Worded the way the app already words it (pricing.admin_duration_days and
    the admin modals): plain day counts, "Lifetime" when duration_days is NULL."""
    # No "30 days · 1 month" restatement: the Plan row already says Monthly or
    # Annual, so the duration row's whole job is the exact number.
    if days is None:
        return "Lifetime"
    return f"{days} days"


def _money(v) -> str:
    """Trailing .00 on a price is noise; 49.50 keeps its cents."""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return str(v)
    return f"{f:,.0f}" if f == int(f) else f"{f:,.2f}"


def _price_rows(list_price, discount, credit, total):
    """Only shown when the number actually moved.

    An invoice whose total differs from the pricing page with no explanation is
    the single most common reason someone stops and asks instead of paying —
    referral discount and store credit both do that here."""
    d = float(discount or 0)
    c = float(credit or 0)
    if d <= 0 and c <= 0:
        return ""
    rows = [_row("Plan price", f"{_money(list_price)} USDT")]
    if d > 0:
        rows.append(_row("Referral discount", f"-{_money(d)} USDT"))
    if c > 0:
        rows.append(_row("Credit applied", f"-{_money(c)} USDT"))
    rows.append(_row("Total", f"{_money(total)} USDT", strong=True))
    return "".join(rows)


def invoice_open(plan: str, amount, expires_phrase: str, unsub: str | None = None,
                 *, duration_days: int | None = None, list_price=None,
                 discount=0, credit=0, network: str = "BEP-20",
                 invoice_no: str | None = None, issued: str | None = None,
                 expires_at: str | None = None, account: str | None = None,
                 telegram: str | None = None, email: str | None = None,
                 wallet_to: str | None = None, chain: str = "BNB Smart Chain (BSC)",
                 covers_from: str | None = None, covers_to: str | None = None,
                 extends_existing: bool = False):
    """An invoice that was opened and never paid.

    The tone rule from the checkout rebuild carries over: nobody did anything
    wrong. State what is waiting, when it lapses, how to finish. No 'you failed
    to'. One action only — paying — because a second link splits the decision.

    Everything past `expires_phrase` is optional and each block simply does not
    render when its data is absent, so a caller with only a plan and an amount
    still gets a correct mail rather than a form full of blanks.
    """
    access = _duration(duration_days)
    ident = f"Invoice {invoice_no} · " if invoice_no else ""
    # On Lifetime the plan and its duration are the same word, and the subline
    # came out "Lifetime · Lifetime". Say it once.
    plan_line = plan if access.lower() == plan.lower() else f"{plan} · {access}"

    rows = [_section("Billed to")] if (account or telegram or email) else []
    if account:
        rows.append(_row("Account", account))
    if telegram:
        rows.append(_row("Telegram", f"@{telegram.lstrip('@')}"))
    if email and not email.endswith((".luxquant.tw",)):
        # Telegram and Discord sign-ups carry a synthetic address
        # (tg_123@telegram.luxquant.tw). Printing it back at the reader tells
        # them nothing and looks like we have the wrong person.
        rows.append(_row("Email", email))

    rows.append(_section("Plan"))
    rows.append(_row("Plan", plan))
    rows.append(_row("Access", access))
    if covers_from and covers_to:
        rows.append(_row("Covers", f"{covers_from} — {covers_to}"))
    elif duration_days is not None:
        rows.append(_row("Starts", "when the payment confirms"))

    rows.append(_section("Amount"))
    lp = list_price if list_price is not None else amount
    d, c = float(discount or 0), float(credit or 0)
    if d > 0 or c > 0:
        rows.append(_row("Plan price", f"{_money(lp)} USDT"))
        if d > 0:
            rows.append(_row("Referral discount", f"-{_money(d)} USDT"))
        if c > 0:
            rows.append(_row("Credit applied", f"-{_money(c)} USDT"))
    rows.append(_row("Total due", f"{_money(amount)} USDT", strong=True))

    if wallet_to:
        rows.append(_section("Send payment to"))
        rows.append(_row("Token", f"USDT ({network})"))
        rows.append(_row("Chain", chain))
        rows.append(_mono_row("Address", wallet_to))
        rows.append(_row("Exact amount", f"{_money(amount)} USDT", strong=True))
    else:
        rows.append(_row("Network", f"{network} · {chain}"))

    rows.append(_section("Invoice"))
    if invoice_no:
        rows.append(_row("Number", invoice_no))
    if issued:
        rows.append(_row("Issued", issued))
    rows.append(_row("Expires", expires_at or expires_phrase))

    # Back on. This was switched off while the two confirm paths disagreed —
    # the admin one stacked on time still running, the self-serve one replaced
    # it — which made the sentence a lie to most of the people who would read
    # it. subscription.py now uses the same base as finance.py, so it is true
    # on both, and it is the reassurance the T-7/T-3/T-1 reminders need: nobody
    # renews early if they believe it costs them the days they already bought.
    extend_note = ""
    if extends_existing:
        extend_note = _p("You still have time left on your current access. Paying "
                         "this invoice adds the new period on top of it — none of "
                         "your remaining days are lost.")

    body = (
        _h("Your invoice is still open")
        + _p("Nothing has been charged yet. Finishing takes about a minute.")
        + _hero("Amount due", f"{_money(amount)} USDT", f"{ident}{plan_line}")
        + extend_note
        + _table(*rows)
        + _button("Complete payment", CHECKOUT_URL)
        + _note("Send the exact amount, on the network shown above, to that address "
                "only. Already sent it? Paste the transaction hash on the payment "
                "page and your access unlocks straight away — no need to pay twice.")
    )
    return (f"Your {plan} invoice is still open",
            wrap("Invoice open",
                 f"{_money(amount)} USDT · {access} · expires {expires_phrase}",
                 body, unsub, kicker="Invoice"))


def payment_confirmed(plan: str, amount, unsub: str | None = None, *,
                      duration_days: int | None = None, paid_at: str | None = None,
                      tx_hash: str | None = None, network: str = "BEP-20",
                      chain: str = "BNB Smart Chain (BSC)",
                      receipt_no: str | None = None, method: str | None = None,
                      account: str | None = None, telegram: str | None = None,
                      access_from: str | None = None, access_to: str | None = None,
                      list_price=None, discount=0, credit=0):
    """The receipt. The only mail here that confirms rather than asks.

    It leads with what they now have, not with what they paid — the money left
    their wallet a minute ago and they know the number. What they cannot see
    from a block explorer is the date their access runs to, and that is the
    thing this mail exists to put in writing.

    No unsubscribe on a receipt: it is proof of a purchase, not a message
    anyone opted into, and offering to stop it would contradict what the
    unsubscribe page promises about payment mail.
    """
    access = _duration(duration_days)
    until = access_to or ("never — Lifetime" if duration_days is None else None)

    rows = [_section("What you have")]
    rows.append(_row("Plan", plan))
    rows.append(_row("Access", access))
    if access_from and access_to:
        rows.append(_row("Covers", f"{access_from} — {access_to}"))
    elif duration_days is None:
        rows.append(_row("Expires", "never"))

    rows.append(_section("Payment"))
    lp = list_price if list_price is not None else amount
    d, c = float(discount or 0), float(credit or 0)
    if d > 0 or c > 0:
        rows.append(_row("Plan price", f"{_money(lp)} USDT"))
        if d > 0:
            rows.append(_row("Referral discount", f"-{_money(d)} USDT"))
        if c > 0:
            rows.append(_row("Credit applied", f"-{_money(c)} USDT"))
    rows.append(_row("Paid", f"{_money(amount)} USDT", strong=True))
    if method:
        rows.append(_row("Method", method))
    else:
        rows.append(_row("Token", f"USDT ({network})"))
        rows.append(_row("Chain", chain))
    if tx_hash:
        # Text, not a link. Nothing in a LuxQuant mail makes a chain identifier
        # clickable — a reader trained to click them is a reader one convincing
        # forgery away from losing money.
        rows.append(_mono_row("Transaction", tx_hash))

    rows.append(_section("Receipt"))
    if receipt_no:
        rows.append(_row("Number", receipt_no))
    if account:
        rows.append(_row("Account", account))
    if telegram:
        rows.append(_row("Telegram", f"@{telegram.lstrip('@')}"))
    if paid_at:
        rows.append(_row("Confirmed", paid_at))

    body = (
        _h("Payment confirmed")
        + _p("Your access is open. Nothing else is needed from you.")
        + _hero("Access runs to", until or "—", f"{plan} · {access}")
        + _table(*rows)
        + _button("Open LuxQuant", "https://luxquant.tw/signals")
        + _note("Keep this mail — it is your receipt. Your VIP group invite and "
                "the full terminal are already unlocked on your account.")
    )
    return (f"Payment confirmed — your {plan} access is open",
            wrap("Payment confirmed",
                 f"{_money(amount)} USDT received · {plan} · {access}",
                 body, None, kicker="Receipt"))


def invoice_expired(plan: str, amount, recovery_url: str, unsub: str | None = None,
                    *, duration_days: int | None = None):
    access = _duration(duration_days)
    body = (
        _h("Your invoice expired")
        + _p("No access was removed and no charge was created. The invoice simply "
             "ran out of time.")
        + _table(
            _row("Plan", plan),
            _row("Access", access),
            _row("Previous amount", f"{_money(amount)} USDT", strong=True),
        )
        + _button("Start again", recovery_url)
        + _note("The price and the plan are unchanged. Restarting creates a fresh "
                "invoice at the current rate.")
    )
    return (f"Your {plan} invoice expired — nothing was charged",
            wrap("Invoice expired", "No charge was made. Restart when you are ready.",
                 body, unsub, kicker="Invoice"))


def renewal_due(when_phrase: str, days_left: float, unsub: str | None = None,
                *, plan: str | None = None):
    """Asked while the customer still HAS the thing — the only moment renewing
    feels like continuity rather than repurchase."""
    if days_left < 1:
        head, lede = ("Last day of your access",
                      f"Your LuxQuant access ends {when_phrase}. Renew today and "
                      "nothing breaks in between.")
    elif days_left <= 3:
        head, lede = ("Your subscription ends soon",
                      f"Your access ends {when_phrase}. Renew now and it simply "
                      "continues — the VIP group and live levels stay open.")
    else:
        head, lede = ("A heads-up on your subscription",
                      f"Your LuxQuant access ends {when_phrase}. Renew any time "
                      "before then and nothing changes — same group, same terminal, "
                      "no gap in your signals.")
    n = int(days_left) if days_left >= 1 else 0
    figure = f"{n} day" + ("s" if n != 1 else "") if n else "Today"
    sub = f"{plan} plan · VIP group · live levels · terminal" if plan else \
          "VIP group · live levels · terminal"
    body = (_h(head) + _p(lede)
            + _hero("Access ends in", figure, sub)
            + _button("Renew subscription", RENEW_URL)
            + _note("You are receiving this because you have an active LuxQuant "
                    "subscription."))
    return (head, wrap(head, f"Access ends {when_phrase}", body, unsub, kicker="Renewal"))


def subscription_ended(unsub: str | None = None, *, plan: str | None = None):
    body = (
        _h("Your subscription has ended")
        + _p("Your VIP group access has been withdrawn. Renewing adds you straight "
             "back — the same group, the same terminal.")
        + (_table(_row("Plan that ended", plan)) if plan else "")
        + _button("Renew subscription", RENEW_URL)
        + _note("The public track record at luxquant.tw/performance stays open to "
                "you either way.")
    )
    return ("Your LuxQuant subscription has ended",
            wrap("Subscription ended", "Renew anytime to rejoin.", body, unsub,
                 kicker="Subscription"))
