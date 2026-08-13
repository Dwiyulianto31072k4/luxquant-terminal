import { BinanceIcon, BitgetIcon, BingxIcon } from "./BrandIcons";

export const AUTOTRADE_SERVER_IP = "187.127.135.84";

export const EXCHANGE_VENUES = {
  binance: {
    id: "binance",
    name: "Binance",
    Icon: BinanceIcon,
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
    accent: "#2B6CFF",
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
