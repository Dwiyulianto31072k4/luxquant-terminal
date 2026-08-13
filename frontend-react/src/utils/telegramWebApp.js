// Telegram Mini App detection + signed identity.
//
// When Telegram opens a Mini App it appends the signed payload to the URL
// fragment (tgWebAppData=...), so the context is detectable — and the identity
// readable — before any Telegram script has loaded. That matters: the SDK is
// only worth fetching for people actually inside Telegram, and everyone else
// should not pay for a script they can never use.
//
// This is the answer to the popup problem rather than a workaround for it.
// There is no OAuth round trip here at all: Telegram already knows who this is
// and signs it, so nothing can be blocked, and nothing has to talk back to an
// opener window.

const SDK_SRC = "https://telegram.org/js/telegram-web-app.js";

/** Signed initData string, or null when we are not inside a Mini App. */
export function miniAppInitData() {
  try {
    const fromSdk = window?.Telegram?.WebApp?.initData;
    if (fromSdk) return fromSdk;
    const m = (window.location.hash || "").match(/tgWebAppData=([^&]+)/);
    if (m && m[1]) return decodeURIComponent(m[1]);
  } catch {
    /* ignore */
  }
  return null;
}

export function isMiniApp() {
  return !!miniAppInitData();
}

/** Load Telegram's SDK, then tell it we are painted. Best-effort. */
export function ensureMiniAppSdk(timeout = 6000) {
  return new Promise((resolve) => {
    if (window?.Telegram?.WebApp) return resolve(window.Telegram.WebApp);
    let script = document.querySelector(`script[src="${SDK_SRC}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = SDK_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
    const start = Date.now();
    const poll = setInterval(() => {
      if (window?.Telegram?.WebApp) {
        clearInterval(poll);
        resolve(window.Telegram.WebApp);
      } else if (Date.now() - start > timeout) {
        clearInterval(poll);
        resolve(null);
      }
    }, 80);
  });
}

/** Telegram keeps its own splash until ready() is called. */
export function markMiniAppReady() {
  try {
    const wa = window?.Telegram?.WebApp;
    if (!wa) return;
    wa.ready();
    if (typeof wa.expand === "function") wa.expand();
  } catch {
    /* ignore */
  }
}

/**
 * Are we inside a real Mini App with a signed identity?
 *
 * `TelegramWebviewProxy` is also exposed by Telegram's ordinary in-app
 * browser. Treating that proxy as a Mini App sent normal channel visitors to
 * `/telegram/webapp` without initData, producing an immediate, unwinnable
 * "Telegram sign-in is unavailable here" retry loop.
 */
export function inMiniAppContext() {
  return !!miniAppInitData();
}

/** Telegram's regular webview: popup-hostile, but not a signed Mini App. */
export function inTelegramWebView() {
  try {
    return !!window.TelegramWebviewProxy && !inMiniAppContext();
  } catch {
    return false;
  }
}

/**
 * initData, preferring the SDK's own copy.
 *
 * The fragment is readable before any script loads, which is what makes boot
 * detection possible — but the SDK assembles the string Telegram itself signs,
 * so when both are available the SDK is the one to trust.
 */
export async function initDataPreferSdk() {
  const wa = await ensureMiniAppSdk();
  return wa?.initData || miniAppInitData();
}
