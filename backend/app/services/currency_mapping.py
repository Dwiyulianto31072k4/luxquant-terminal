# backend/app/services/currency_mapping.py
"""
Country → Currency mapping for multi-currency price display.

ISO 3166-1 alpha-2 country codes → ISO 4217 currency codes.
Only currencies supported by CoinGecko's /simple/price endpoint are usable;
unsupported countries fall back to USD.

Used by:
  - profile.py     → auto-set currency_code when user picks a country
  - fx.py          → validate currency_code on rate fetch
  - validation     → reject invalid country/currency input
"""

# ─────────────────────────────────────────────────────────────────────
# CoinGecko-supported fiat currencies
# Source: /api/v3/simple/supported_vs_currencies
# These are the ONLY currencies we can display real-time prices in.
# ─────────────────────────────────────────────────────────────────────
SUPPORTED_CURRENCIES = frozenset([
    "AED", "ARS", "AUD", "BDT", "BHD", "BMD", "BRL", "CAD", "CHF", "CLP",
    "CNY", "CZK", "DKK", "EUR", "GBP", "GEL", "HKD", "HUF", "IDR", "ILS",
    "INR", "JPY", "KRW", "KWD", "LKR", "MMK", "MXN", "MYR", "NGN", "NOK",
    "NZD", "PHP", "PKR", "PLN", "RUB", "SAR", "SEK", "SGD", "THB", "TRY",
    "TWD", "UAH", "USD", "VEF", "VND", "ZAR",
])

DEFAULT_CURRENCY = "USD"


# ─────────────────────────────────────────────────────────────────────
# Country → Currency mapping
# Native currency where CG-supported, USD fallback otherwise.
# Covers ~180 countries; missing codes auto-fallback to USD via .get().
# ─────────────────────────────────────────────────────────────────────
COUNTRY_TO_CURRENCY = {
    # ─── Americas ───
    "US": "USD", "CA": "CAD", "MX": "MXN", "BR": "BRL", "AR": "ARS", "CL": "CLP",
    "PE": "USD", "CO": "USD", "VE": "VEF", "UY": "USD", "PY": "USD", "BO": "USD",
    "EC": "USD", "GT": "USD", "CR": "USD", "PA": "USD", "DO": "USD", "CU": "USD",
    "HT": "USD", "HN": "USD", "NI": "USD", "SV": "USD", "JM": "USD", "TT": "USD",
    "BS": "USD", "BB": "USD", "BZ": "USD", "GY": "USD", "SR": "USD",

    # ─── Europe (Eurozone) ───
    "AT": "EUR", "BE": "EUR", "CY": "EUR", "EE": "EUR", "FI": "EUR", "FR": "EUR",
    "DE": "EUR", "GR": "EUR", "IE": "EUR", "IT": "EUR", "LV": "EUR", "LT": "EUR",
    "LU": "EUR", "MT": "EUR", "NL": "EUR", "PT": "EUR", "SK": "EUR", "SI": "EUR",
    "ES": "EUR", "HR": "EUR", "AD": "EUR", "MC": "EUR", "SM": "EUR", "VA": "EUR",
    "ME": "EUR", "XK": "EUR",

    # ─── Europe (non-Eurozone) ───
    "GB": "GBP", "CH": "CHF", "LI": "CHF", "NO": "NOK", "SE": "SEK", "DK": "DKK",
    "IS": "USD", "PL": "PLN", "CZ": "CZK", "HU": "HUF", "RO": "USD", "BG": "USD",
    "RS": "USD", "UA": "UAH", "RU": "RUB", "BY": "USD", "MD": "USD", "AL": "USD",
    "MK": "USD", "BA": "USD", "TR": "TRY", "GE": "GEL", "AM": "USD", "AZ": "USD",

    # ─── Asia ───
    "JP": "JPY", "KR": "KRW", "CN": "CNY", "HK": "HKD", "MO": "HKD", "TW": "TWD",
    "SG": "SGD", "MY": "MYR", "TH": "THB", "ID": "IDR", "PH": "PHP", "VN": "VND",
    "LA": "USD", "KH": "USD", "MM": "MMK", "BN": "USD", "TL": "USD",
    "IN": "INR", "PK": "PKR", "BD": "BDT", "LK": "LKR", "NP": "USD", "BT": "USD",
    "MV": "USD", "AF": "USD", "KZ": "USD", "UZ": "USD", "KG": "USD", "TJ": "USD",
    "TM": "USD", "MN": "USD", "KP": "USD",

    # ─── Middle East ───
    "AE": "AED", "SA": "SAR", "KW": "KWD", "BH": "BHD", "QA": "USD", "OM": "USD",
    "IL": "ILS", "PS": "ILS", "JO": "USD", "LB": "USD", "SY": "USD", "IQ": "USD",
    "IR": "USD", "YE": "USD",

    # ─── Africa ───
    "ZA": "ZAR", "NG": "NGN", "EG": "USD", "MA": "USD", "TN": "USD", "DZ": "USD",
    "LY": "USD", "SD": "USD", "SS": "USD", "ET": "USD", "KE": "USD", "UG": "USD",
    "TZ": "USD", "RW": "USD", "BI": "USD", "GH": "USD", "CI": "USD", "SN": "USD",
    "ML": "USD", "BF": "USD", "NE": "USD", "TD": "USD", "CM": "USD", "GA": "USD",
    "CG": "USD", "CD": "USD", "AO": "USD", "ZM": "USD", "ZW": "USD", "MZ": "USD",
    "MW": "USD", "MG": "USD", "MU": "USD", "SC": "USD", "NA": "USD", "BW": "USD",
    "SZ": "USD", "LS": "USD", "ER": "USD", "DJ": "USD", "SO": "USD", "GW": "USD",
    "GN": "USD", "SL": "USD", "LR": "USD", "GM": "USD", "MR": "USD", "CV": "USD",
    "ST": "USD", "GQ": "USD", "CF": "USD", "BJ": "USD", "TG": "USD", "KM": "USD",
    "RE": "EUR", "YT": "EUR",

    # ─── Oceania ───
    "AU": "AUD", "NZ": "NZD", "PG": "USD", "FJ": "USD", "SB": "USD", "VU": "USD",
    "NC": "EUR", "PF": "EUR", "WS": "USD", "TO": "USD", "KI": "USD", "TV": "USD",
    "NR": "USD", "FM": "USD", "MH": "USD", "PW": "USD", "GU": "USD",
}


# ─────────────────────────────────────────────────────────────────────
# Helper functions
# ─────────────────────────────────────────────────────────────────────

def get_currency_for_country(country_code: str | None) -> str:
    """
    Return the appropriate currency for a given country code.
    Falls back to USD for unsupported countries, missing codes, or None.

    Example:
        get_currency_for_country("ID") → "IDR"
        get_currency_for_country("QA") → "USD"  (Qatar — QAR not supported by CG)
        get_currency_for_country(None) → "USD"
    """
    if not country_code:
        return DEFAULT_CURRENCY
    code = country_code.strip().upper()
    return COUNTRY_TO_CURRENCY.get(code, DEFAULT_CURRENCY)


def is_supported_currency(currency_code: str | None) -> bool:
    """Check if currency is in CoinGecko's supported list."""
    if not currency_code:
        return False
    return currency_code.strip().upper() in SUPPORTED_CURRENCIES


def is_valid_country_code(country_code: str | None) -> bool:
    """Loose validation: 2 uppercase letters (ISO 3166-1 alpha-2 format)."""
    if not country_code:
        return False
    code = country_code.strip().upper()
    return len(code) == 2 and code.isalpha()