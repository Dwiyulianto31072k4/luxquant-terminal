// src/components/referral/SharePlatforms.jsx
// ════════════════════════════════════════════════════════════════════
// Every platform the campaign artwork shows, as a real shortcut.
//
// They do not all work the same way, and pretending otherwise would be
// the bug. Five of them publish a web share endpoint, so a click opens
// the composer with the message already in it. The other five have no
// such endpoint at all: Instagram, TikTok, Xiaohongshu and YouTube
// never had one, and WeChat only accepts a scanned QR. For those the
// honest action is to put the message on the clipboard and say which
// app to paste it into, which is what a person does by hand anyway.
//
// WhatsApp is drawn rather than imported: the supplied file was a
// watermarked stock image, and a stock watermark has no business on a
// production page. X is drawn for the same reason the rest are not —
// its mark is already in this codebase.
// ════════════════════════════════════════════════════════════════════
import { useState } from "react";

const TILE =
  "group flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 transition-colors hover:bg-ink/[0.05]";

const Img = ({ src, alt }) => (
  <img src={src} alt="" aria-hidden="true" className="h-8 w-8 shrink-0" title={alt} />
);

const Glyph = ({ bg, children }) => (
  <span
    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]"
    style={{ background: bg }}
    aria-hidden="true"
  >
    {children}
  </span>
);

const WhatsAppMark = () => (
  <Glyph bg="#25D366">
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#fff" aria-hidden="true">
      <path d="M17.5 14.4c-.3-.1-1.8-.9-2-.9s-.5-.1-.7.2-.8.9-1 1.1-.4.2-.7.1a8.1 8.1 0 0 1-2.4-1.5 8.8 8.8 0 0 1-1.6-2c-.2-.3 0-.5.1-.6l.5-.6c.2-.2.2-.3.3-.5s0-.4 0-.5l-.9-2.2c-.2-.5-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.5 1.1 2.9 1.2 3.1a13.4 13.4 0 0 0 5.1 5c.7.3 1.3.4 1.8.3s1.6-.7 1.8-1.3.2-1.2.1-1.3-.3-.2-.6-.3z" />
    </svg>
  </Glyph>
);

const XMark = () => (
  <Glyph bg="#0b0e11">
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="#fff" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  </Glyph>
);

// `href` present  → opens that platform's composer with the message in it.
// `href` absent   → the platform has no web share endpoint; copy instead.
export const PLATFORMS = [
  {
    id: "whatsapp",
    label: "WhatsApp",
    mark: WhatsAppMark,
    href: ({ text }) => `https://wa.me/?text=${encodeURIComponent(text)}`,
  },
  {
    id: "telegram",
    label: "Telegram",
    img: "/social/telegram.png",
    href: ({ link, message }) =>
      `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(message)}`,
  },
  {
    id: "twitter",
    label: "X",
    mark: XMark,
    href: ({ link, message }) =>
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}&url=${encodeURIComponent(link)}`,
  },
  {
    id: "weibo",
    label: "Weibo",
    img: "/social/weibo.png",
    href: ({ link, message }) =>
      `https://service.weibo.com/share/share.php?url=${encodeURIComponent(link)}&title=${encodeURIComponent(message)}`,
  },
  {
    id: "qq",
    label: "QQ",
    img: "/social/qq.png",
    href: ({ link, message }) =>
      `https://connect.qq.com/widget/shareqq/index.html?url=${encodeURIComponent(link)}&title=${encodeURIComponent(message)}`,
  },
  { id: "instagram", label: "Instagram", img: "/social/instagram.png" },
  { id: "tiktok", label: "TikTok", img: "/social/tiktok.png" },
  { id: "wechat", label: "WeChat", img: "/social/wechat.png" },
  // "RED" is the app's own international name and the only one of the ten
  // that does not fit five-across on a 375px screen under its full name.
  { id: "xiaohongshu", label: "RED", img: "/social/xiaohongshu.png" },
  { id: "youtube", label: "YouTube", img: "/social/youtube.png" },
];

export const SharePlatformGrid = ({ link, message, onShare }) => {
  const [copied, setCopied] = useState(null);

  const handle = async (p) => {
    const text = `${message}`;
    onShare?.(p.id);

    if (p.href) {
      window.open(p.href({ link, message, text }), "_blank", "noopener,noreferrer");
      return;
    }

    // No endpoint to open. Hand them the message and name the app, which is
    // the step they would otherwise do themselves.
    try {
      await navigator.clipboard.writeText(text);
      setCopied(p.id);
      setTimeout(() => setCopied((c) => (c === p.id ? null : c)), 2200);
    } catch {
      /* clipboard blocked — the message is on screen to copy by hand */
    }
  };

  return (
    <div className="grid grid-cols-5 gap-1 sm:grid-cols-5">
      {PLATFORMS.map((p) => {
        const Mark = p.mark;
        const isCopied = copied === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => handle(p)}
            className={TILE}
            title={p.href ? `Share on ${p.label}` : `Copy the message for ${p.label}`}
          >
            {Mark ? <Mark /> : <Img src={p.img} alt={p.label} />}
            <span
              // 9px on a phone rather than truncation: at five across on a
              // 375px screen "WhatsApp" became "Whats…", and a clipped name
              // beside a logo is worse than a small one.
              className="w-full text-center text-[9px] font-medium leading-tight sm:text-[10px]"
              style={{ color: isCopied ? "rgb(var(--pos))" : "rgb(var(--fg-muted))" }}
            >
              {isCopied ? "Copied" : p.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default SharePlatformGrid;
