"""Keep credentials out of logs.

httpx and requests put the whole request URL in their error messages, and some
providers only take a key as a query parameter (Etherscan `apikey`,
BGeometrics `token`). So printing an exception printed the key: the Coinalyze
key reached journald on every 429 until 26 Sep 2026. Run anything that may
carry a URL through `redact` before it is printed, logged or stored.
"""
import re

_QUERY_SECRET = re.compile(
    r"(?i)([?&](?:api_?key|apikey|token|auth_token|access_key|key|secret|x_cg_[a-z_]*api_key)=)[^&#\s'\"]+"
)
# Not \b: in ".../bot123456789:AA..." the digits follow "bot" with no boundary.
_TG_BOT_TOKEN = re.compile(r"(?<!\d)\d{8,10}:[A-Za-z0-9_-]{35}(?![A-Za-z0-9_-])")


def redact(text) -> str:
    """`text` with query-string secrets and Telegram bot tokens masked."""
    s = str(text)
    s = _QUERY_SECRET.sub(r"\1***", s)
    return _TG_BOT_TOKEN.sub("<bot-token>", s)
