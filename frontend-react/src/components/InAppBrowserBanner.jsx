import { useState, useEffect } from "react";

/**
 * InAppBrowserBanner
 * ==================
 * Detects in-app browsers (Telegram, Instagram, Facebook, TikTok, etc.)
 * and shows a dismissible banner telling the user to open the site in
 * a real browser — OAuth login (Google/Telegram/Discord) is unreliable
 * inside webviews.
 *
 * Usage: render once near the top of App.jsx (outside routes):
 *   <InAppBrowserBanner />
 */

const IN_APP_PATTERNS = [
  /Telegram/i,        // Telegram in-app browser
  /Instagram/i,       // Instagram
  /FBAN|FBAV|FB_IAB/i, // Facebook / Messenger
  /TikTok|musical_ly|Bytedance/i, // TikTok
  /Line\//i,          // LINE
  /Twitter/i,         // X/Twitter
  /MicroMessenger/i,  // WeChat
  /GSA\//i,           // Google Search App
  /; ?wv\)/,          // Android generic WebView marker
];

function detectInAppBrowser() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // iOS webview: has AppleWebKit but no Safari token (real Safari always has it)
  const iosWebview =
    /iPhone|iPad|iPod/i.test(ua) &&
    /AppleWebKit/i.test(ua) &&
    !/Safari/i.test(ua) &&
    !/CriOS|FxiOS|EdgiOS/i.test(ua); // exclude real Chrome/Firefox/Edge on iOS
  return iosWebview || IN_APP_PATTERNS.some((re) => re.test(ua));
}

export default function InAppBrowserBanner() {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // sessionStorage: dismissal lasts for the webview session only,
    // so the banner reappears on a fresh open (intentional).
    const dismissed = sessionStorage.getItem("iab_banner_dismissed") === "1";
    if (!dismissed && detectInAppBrowser()) setVisible(true);
  }, []);

  if (!visible) return null;

  const copyLink = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API can be blocked in webviews — fallback
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const dismiss = () => {
    sessionStorage.setItem("iab_banner_dismissed", "1");
    setVisible(false);
  };

  return (
    <div
      role="alert"
      className="fixed top-0 inset-x-0 z-[9999] bg-surface-raised border-b border-line/40"
    >
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-accent mb-1">
            Better in a real browser
          </p>
          <p className="text-sm text-neutral-300 leading-snug">
            You&apos;re viewing this inside an app. Login and some features may
            not work here — open <span className="text-neutral-100 font-medium">luxquant.tw</span> in
            Chrome or Safari instead.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={copyLink}
            className="text-xs font-medium px-3 py-1.5 rounded border border-line/50 text-accent hover:bg-accent/10 transition-colors"
          >
            {copied ? "Copied ✓" : "Copy link"}
          </button>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="text-neutral-500 hover:text-neutral-300 text-lg leading-none px-1"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
