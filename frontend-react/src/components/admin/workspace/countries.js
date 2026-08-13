// src/components/admin/workspace/countries.js
//
// Country display for anything that renders a CF-IPCountry code.
//
// Coverage, measured rather than assumed (node 22 / current Chrome):
//   · Intl.DisplayNames names 280 of the 676 possible AA-ZZ pairs — every
//     assigned ISO-3166-1 alpha-2 country and territory, plus historic codes
//     (SU, YU, DD, ZR…) that Cloudflare will never send.
//   · All 175 polygons in /geo/world-iso2.json resolve to a name, so the map
//     can never fall back to a bare code.
//   · 105 named codes have NO polygon at 110m resolution — Singapore, Hong
//     Kong, Bahrain, Malta, Monaco, Macau, and the small-island territories.
//     Three of those already send us traffic, which is why WorldMapPanel lists
//     them under the map instead of dropping them.
//
// So a country we have never seen before needs no code change: it gets a name
// and a flag automatically, and is either shaded or listed as "not drawn".

const REGION_NAMES = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

// "T1" is Cloudflare's Tor exit; "XX"/"ZZ" are the unknown placeholders; "" and
// "(unknown)" are our own backfill. None of them are a place.
export const UNKNOWN_KEYS = new Set(["(unknown)", "unknown", "", "XX", "ZZ", "T1"]);

export const isUnknownCountry = (cc) =>
  UNKNOWN_KEYS.has(String(cc)) || UNKNOWN_KEYS.has(String(cc || "").toUpperCase());

export const countryName = (cc) => {
  const c = String(cc || "").toUpperCase();
  if (isUnknownCountry(cc)) return "Unknown";
  if (!/^[A-Z]{2}$/.test(c)) return String(cc);
  try {
    // .of() echoes the input back for codes it does not know, so an unchanged
    // result means "no name" rather than a name that happens to be two letters.
    const n = REGION_NAMES?.of(c);
    return n && n !== c ? n : c;
  } catch {
    return c;
  }
};

// Regional-indicator pair. Renders as a flag on macOS/iOS/Android; Windows
// Chrome draws the two letters instead — which is why callers keep the code
// visible next to the name rather than letting the flag replace it.
export const flagEmoji = (cc) => {
  const c = String(cc || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "\u{1F310}";
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
};
