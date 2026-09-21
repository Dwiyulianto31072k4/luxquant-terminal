// src/components/referral/MessageStudio.jsx
// ════════════════════════════════════════════════════════════════════
// Pick the words, edit them, and see what the other person will get.
//
// Three things shape this, and all three came from checking rather than
// taste:
//
// 1. Referral copy converts when it opens with what the FRIEND gets, not
//    what the sender earns. Every variant here does, including the one
//    about the commission.
// 2. X replaces any URL with a t.co link of exactly 23 characters, so the
//    budget is 280 - 23 = 257 no matter how long the link is, and CJK
//    characters count double. The counter below implements that rule
//    rather than calling String.length and hoping.
// 3. The card under the message is not decoration: WhatsApp, Telegram, X
//    and the rest build it from the site's Open Graph tags, so what is
//    drawn here is the real og:title / og:description / og:image the
//    scraper will read. Source of truth is frontend-react/index.html.
//
// Instagram, TikTok, RED and YouTube get a different preview on purpose:
// a link in an Instagram caption is not clickable, so showing them a
// pretty link card would be a lie. They see the plain paste instead.
// ════════════════════════════════════════════════════════════════════
import { useMemo, useState } from "react";

// Mirrors the homepage's Open Graph tags — the ones a scraper actually
// reads for `https://luxquant.tw/?ref=CODE`.
const OG = {
  title: "LuxQuant Terminal — Quantitative Crypto Intelligence",
  description:
    "LuxQuant Terminal turns market data into a quantitative edge with algorithmic analysis, on-chain intelligence, and risk scoring.",
  image: "/og-default-1200.png",
  host: "luxquant.tw",
};

export const MESSAGE_VARIANTS = [
  {
    id: "proof",
    label: "Proof",
    hint: "For people who have been burned by signal groups",
    build: (link) =>
      `LuxQuant publishes every call it has ever made, so you can check the record before you trust any of it. Join free with my link: ${link}`,
  },
  {
    id: "free",
    label: "Free to look",
    hint: "Lowest friction. Nothing to lose by clicking",
    build: (link) =>
      `You can see LuxQuant's whole track record without paying anything. Join free with my link: ${link}`,
  },
  {
    id: "both",
    label: "We both win",
    hint: "Says the discount out loud, and that you earn too",
    build: (link) =>
      `Join LuxQuant with my link and you get 5% off your first subscription. I earn a small share too, so we both win: ${link}`,
  },
  {
    id: "short",
    label: "Short",
    hint: "One line. Best for X and for a busy chat",
    build: (link) => `Every call LuxQuant has made, public and checkable. Join free: ${link}`,
  },
  {
    id: "personal",
    label: "Personal",
    hint: "Reads like you wrote it, because you should edit it",
    build: (link) =>
      `I have been using this for my entries and the whole track record is public, so you can judge it yourself. Here is my link: ${link}`,
  },
  {
    id: "zh",
    label: "中文",
    hint: "For WeChat, Weibo, RED and QQ",
    build: (link) =>
      `LuxQuant 公开每一次交易信号的历史记录，你可以自己核对之后再决定。用我的链接免费注册：${link}`,
  },
];

// X counts a CJK character as two. Anything else is one, and every URL is
// 23 regardless of its real length.
const URL_RE = /https?:\/\/\S+/g;
const CJK_RE = /[ᄀ-ᇿ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/;

export const weightedLength = (text) => {
  const withoutUrls = text.replace(URL_RE, "");
  const urls = text.match(URL_RE) || [];
  let n = urls.length * 23;
  for (const ch of withoutUrls) n += CJK_RE.test(ch) ? 2 : 1;
  return n;
};

// WhatsApp, Telegram, WeChat and QQ all render a message bubble with a
// link card under it; X and Weibo render a post with a large card; the
// rest cannot make a link clickable at all.
const SURFACE = {
  whatsapp: "chat",
  telegram: "chat",
  wechat: "chat",
  qq: "chat",
  twitter: "post",
  weibo: "post",
  instagram: "paste",
  tiktok: "paste",
  xiaohongshu: "paste",
  youtube: "paste",
};

const LinkCard = ({ large }) => (
  <div
    className="overflow-hidden rounded-lg"
    style={{ border: "1px solid rgb(var(--ink) / 0.10)", background: "rgb(var(--surface))" }}
  >
    {large && (
      <img
        src={OG.image}
        alt=""
        className="w-full"
        style={{ aspectRatio: "1200 / 630", objectFit: "cover" }}
        loading="lazy"
      />
    )}
    <div className="flex gap-2 p-2.5">
      {!large && (
        <img
          src={OG.image}
          alt=""
          className="h-11 w-11 shrink-0 rounded"
          style={{ objectFit: "cover" }}
          loading="lazy"
        />
      )}
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold text-text-primary">{OG.title}</p>
        <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug" style={{ color: "rgb(var(--fg-muted))" }}>
          {OG.description}
        </p>
        <p className="mt-1 text-[9px] uppercase tracking-wider" style={{ color: "rgb(var(--fg-muted))" }}>
          {OG.host}
        </p>
      </div>
    </div>
  </div>
);

export const MessagePreview = ({ platform, message }) => {
  const surface = SURFACE[platform] || "chat";

  if (surface === "paste") {
    return (
      <div className="space-y-2">
        <div
          className="whitespace-pre-wrap rounded-lg p-3 text-xs leading-relaxed text-text-secondary"
          style={{ background: "rgb(var(--ink) / 0.04)" }}
        >
          {message}
        </div>
        <p className="text-[10px] leading-relaxed" style={{ color: "rgb(var(--fg-muted))" }}>
          A link in a caption here is not clickable, and there is no preview card. Your code is
          what people can actually use, so say it out loud or put the link in your bio.
        </p>
      </div>
    );
  }

  if (surface === "post") {
    return (
      <div className="space-y-2">
        <p className="whitespace-pre-wrap text-xs leading-relaxed text-text-primary">{message}</p>
        <LinkCard large />
      </div>
    );
  }

  return (
    <div className="flex justify-end">
      <div className="w-full max-w-[19rem] space-y-1.5 rounded-xl rounded-br-sm p-2.5"
           style={{ background: "rgb(var(--accent) / 0.12)" }}>
        <p className="whitespace-pre-wrap text-xs leading-relaxed text-text-primary">{message}</p>
        <LinkCard />
      </div>
    </div>
  );
};

export const MessageStudio = ({ link, value, onChange, platform, onPlatformChange, platforms }) => {
  const [variant, setVariant] = useState("proof");
  const count = useMemo(() => weightedLength(value || ""), [value]);
  const overX = count > 280;

  const pick = (v) => {
    setVariant(v.id);
    onChange(v.build(link));
  };
  const active = MESSAGE_VARIANTS.find((v) => v.id === variant);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {MESSAGE_VARIANTS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => pick(v)}
            className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors"
            style={{
              background: variant === v.id ? "rgb(var(--accent) / 0.14)" : "rgb(var(--ink) / 0.04)",
              color: variant === v.id ? "rgb(var(--accent-text))" : "rgb(var(--fg-muted))",
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      {active?.hint && (
        <p className="text-[10px]" style={{ color: "rgb(var(--fg-muted))" }}>
          {active.hint}
        </p>
      )}

      {/* Editable on purpose: a message that sounds like the sender beats a
          better-written one that sounds like marketing. */}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full resize-y rounded-lg px-3 py-2.5 text-xs leading-relaxed text-text-primary outline-none transition-colors focus:border-accent/35"
        style={{ background: "rgb(var(--ink) / 0.03)", border: "1px solid rgb(var(--ink) / 0.08)" }}
        aria-label="Your share message"
      />

      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px]" style={{ color: "rgb(var(--fg-muted))" }}>
          Edit it. It works better when it sounds like you.
        </p>
        <p
          className="shrink-0 font-mono text-[10px] tabular-nums"
          style={{ color: overX ? "rgb(var(--neg))" : "rgb(var(--fg-muted))" }}
          title="X counts any link as 23 characters and a Chinese character as two"
        >
          {count} / 280 on X
        </p>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap gap-1">
          {platforms.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPlatformChange(p.id)}
              className="rounded-md px-2 py-1 text-[10px] font-medium transition-colors"
              style={{
                background: platform === p.id ? "rgb(var(--ink) / 0.08)" : "transparent",
                color: platform === p.id ? "rgb(var(--fg))" : "rgb(var(--fg-muted))",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div
          className="rounded-xl p-3"
          style={{ background: "rgb(var(--ink) / 0.02)", border: "1px solid rgb(var(--ink) / 0.06)" }}
        >
          <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider"
             style={{ color: "rgb(var(--fg-muted))" }}>
            What they will see
          </p>
          <MessagePreview platform={platform} message={value} />
        </div>
      </div>
    </div>
  );
};

export default MessageStudio;
