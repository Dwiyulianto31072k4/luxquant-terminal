import { BinanceIcon, BitgetIcon, BingxIcon, OkxIcon, BybitIcon, GateIcon } from "./BrandIcons";

export const AUTOTRADE_SERVER_IP = "187.127.135.84";
export const AUTOTRADE_BACKUP_IP = "103.197.189.58";

export const AUTOTRADE_SERVER_IPS = [
  { ip: AUTOTRADE_SERVER_IP, id: "primary", label: "Primary", note: "Default route" },
  { ip: AUTOTRADE_BACKUP_IP, id: "backup", label: "Backup", note: "Used if primary is rate-limited" },
];

export function whitelistIpsFor(venueId) {
  if (venueId === "binance") return AUTOTRADE_SERVER_IPS;
  return AUTOTRADE_SERVER_IPS.slice(0, 1);
}

export function whitelistCopyText(venueId) {
  return whitelistIpsFor(venueId)
    .map((row) => row.ip)
    .join("\n");
}

export const EXCHANGE_VENUES = {
  binance: {
    id: "binance",
    name: "Binance",
    Icon: BinanceIcon,
    logo: "/exchanges/binance.png",
    accent: "#F0B90B",
    markets: "Spot + USDT-M futures",
    blurb: "Largest desk. Isolated futures by default.",
    needsPassphrase: false,
    placeholderLabel: "Primary Binance",
    keyPlaceholder: "API key",
    secretPlaceholder: "API secret",
    ipHint: "Restrict the key to both IPs below. Agent fails over to backup if the primary is banned — one IP only and failover orders are rejected.",
    permissions: [
      { label: "Read", state: "yes" },
      { label: "Futures", state: "yes" },
      { label: "Spot", state: "yes" },
      { label: "Withdraw", state: "no" },
    ],
  },
  okx: {
    id: "okx",
    name: "OKX",
    Icon: OkxIcon,
    logo: "/exchanges/okx.png",
    accent: "#000000",
    markets: "Spot + USDT-M swap",
    blurb: "Needs key, secret, and the passphrase you set on the key.",
    needsPassphrase: true,
    placeholderLabel: "Primary OKX",
    keyPlaceholder: "API key",
    secretPlaceholder: "API secret",
    ipHint: "Whitelist the server IP. Turn off passphrase encryption — paste the phrase you typed.",
    permissions: [
      { label: "Read", state: "yes" },
      { label: "Futures", state: "yes" },
      { label: "Spot", state: "yes" },
      { label: "Withdraw", state: "no" },
    ],
  },
  bybit: {
    id: "bybit",
    name: "Bybit",
    Icon: BybitIcon,
    logo: "/exchanges/bybit.png?v=2",
    logoBg: "#1B1E2E",
    accent: "#F7A600",
    markets: "Spot + USDT-M linear",
    blurb: "Key and secret only. Unified account, isolated by default.",
    needsPassphrase: false,
    placeholderLabel: "Primary Bybit",
    keyPlaceholder: "API key",
    secretPlaceholder: "API secret",
    ipHint: "If the key is IP-restricted, whitelist the server below.",
    permissions: [
      { label: "Read", state: "yes" },
      { label: "Futures", state: "yes" },
      { label: "Spot", state: "yes" },
      { label: "Withdraw", state: "no" },
    ],
  },
  gate: {
    id: "gate",
    name: "Gate",
    Icon: GateIcon,
    logo: "/exchanges/gate.png",
    accent: "#17E6A1",
    markets: "Spot + USDT-M futures",
    blurb: "Key and secret only. Same risk rules as the other venues.",
    needsPassphrase: false,
    placeholderLabel: "Primary Gate",
    keyPlaceholder: "API key",
    secretPlaceholder: "API secret",
    ipHint: "If the key is IP-restricted, whitelist the server below.",
    permissions: [
      { label: "Read", state: "yes" },
      { label: "Futures", state: "yes" },
      { label: "Spot", state: "yes" },
      { label: "Withdraw", state: "no" },
    ],
  },
  bitget: {
    id: "bitget",
    name: "Bitget",
    Icon: BitgetIcon,
    logo: "/exchanges/bitget.png",
    accent: "#00E8B5",
    markets: "Spot + USDT-M futures",
    blurb: "Needs key, secret, and the passphrase you set on the key.",
    needsPassphrase: true,
    placeholderLabel: "Primary Bitget",
    keyPlaceholder: "API key",
    secretPlaceholder: "API secret",
    ipHint: "Whitelist the server IP. Turn off passphrase encryption — paste the phrase you typed.",
    permissions: [
      { label: "Read", state: "yes" },
      { label: "Futures", state: "yes" },
      { label: "Spot", state: "yes" },
      { label: "Withdraw", state: "no" },
    ],
  },
  bingx: {
    id: "bingx",
    name: "BingX",
    Icon: BingxIcon,
    logo: "/exchanges/bingx.png?v=2",
    accent: "#2B54FC",
    markets: "Spot + USDT-M perpetual",
    blurb: "Key and secret only. Same risk rules as the other venues.",
    needsPassphrase: false,
    placeholderLabel: "Primary BingX",
    keyPlaceholder: "API key",
    secretPlaceholder: "API secret",
    ipHint: "If the key is IP-restricted, whitelist the server below.",
    permissions: [
      { label: "Read", state: "yes" },
      { label: "Futures", state: "yes" },
      { label: "Spot", state: "yes" },
      { label: "Withdraw", state: "no" },
    ],
  },
};

export const EXCHANGE_LIST = Object.values(EXCHANGE_VENUES);

export function VenueLogo({ venue, className = "h-8 w-8" }) {
  const meta = typeof venue === "string" ? EXCHANGE_VENUES[venue] : venue;
  if (!meta) return null;
  const Fallback = meta.Icon;
  return (
    <span
      className={`relative inline-block shrink-0 overflow-hidden rounded-full ring-1 ring-ink/[0.08] ${className}`}
      style={{ background: meta.logoBg || "#fff" }}
      aria-hidden
    >
      {meta.logo ? (
        <img
          src={meta.logo}
          alt=""
          className={`absolute inset-0 h-full w-full ${
            meta.logoFit === "contain" ? "object-contain p-[18%]" : "object-cover"
          }`}
          draggable={false}
        />
      ) : Fallback ? (
        <Fallback className="h-full w-full" />
      ) : null}
    </span>
  );
}
