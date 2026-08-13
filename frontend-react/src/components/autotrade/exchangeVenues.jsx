import { BinanceIcon, BitgetIcon, BingxIcon } from "./BrandIcons";

export const AUTOTRADE_SERVER_IP = "187.127.135.84";

export const EXCHANGE_VENUES = {
  binance: {
    id: "binance",
    name: "Binance",
    Icon: BinanceIcon,
    logo: "/exchanges/binance.png",
    accent: "#F0B90B",
    markets: "Spot + USDT-M futures",
    blurb: "The original desk. Isolated futures by default.",
    needsPassphrase: false,
    placeholderLabel: "Primary Binance",
    keyPlaceholder: "API key",
    secretPlaceholder: "API secret",
    ipHint: "If the key is IP-restricted, whitelist the server below or every order is rejected.",
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
      className={`relative inline-block shrink-0 overflow-hidden rounded-full bg-white ring-1 ring-ink/[0.08] ${className}`}
      aria-hidden
    >
      {meta.logo ? (
        <img
          src={meta.logo}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
      ) : Fallback ? (
        <Fallback className="h-full w-full" />
      ) : null}
    </span>
  );
}
