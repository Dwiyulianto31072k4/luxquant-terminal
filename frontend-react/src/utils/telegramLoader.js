const TELEGRAM_BOT_ID = import.meta.env.VITE_TELEGRAM_BOT_ID || "8398445725";
let telegramPromise = null;

export function ensureTelegram(timeout = 8000) {
  if (window.Telegram?.Login?.auth) return Promise.resolve(window.Telegram);
  if (telegramPromise) return telegramPromise;
  telegramPromise = new Promise((resolve, reject) => {
    let script = document.querySelector('script[src*="telegram-widget.js"]');
    if (!script) {
      script = document.createElement("script");
      script.src = "https://telegram.org/js/telegram-widget.js?22";
      script.async = true;
      document.head.appendChild(script);
    }
    const start = Date.now();
    const poll = setInterval(() => {
      if (window.Telegram?.Login?.auth) {
        clearInterval(poll);
        resolve(window.Telegram);
      } else if (Date.now() - start > timeout) {
        clearInterval(poll);
        telegramPromise = null;
        reject(new Error("telegram-load-timeout"));
      }
    }, 100);
  });
  return telegramPromise;
}

// Telegram's UA is identical to Safari inside its own in-app browser
// (Telegram-iOS issue #736, still open), so "are we in a webview" is not a
// question the client can answer. What we CAN observe is the thing that
// actually breaks: the popup. Opening one moves focus away from this document,
// so if we never lose focus the popup never opened. That is a capability
// signal, and unlike UA sniffing it is true wherever popups are blocked.
const POPUP_BLUR_MS = 1800;      // grace for the popup to take focus
const AUTH_ABANDON_MS = 90_000;  // callback silent this long => it is not coming

// WAJIB dipanggil di dalam click handler, tanpa await sebelumnya (anti popup-blocker)
export function openTelegramAuth(options = {}) {
  return new Promise((resolve, reject) => {
    if (!window.Telegram?.Login?.auth) {
      ensureTelegram().catch(() => {});
      return reject(new Error("not-ready"));
    }

    let settled = false;
    let sawBlur = false;
    const onBlur = () => {
      sawBlur = true;
    };
    window.addEventListener("blur", onBlur, { once: true });

    const emit = (event, extra = {}) => {
      // Imported lazily: this module is pulled into the login path and must not
      // fail to load if analytics ever does.
      import("./funnelAnalytics")
        .then((m) =>
          m.trackFunnel(event, {
            provider: "telegram",
            meta: { saw_blur: sawBlur, ...extra },
          })
        )
        .catch(() => {});
    };

    const blurTimer = setTimeout(() => {
      if (settled || sawBlur) return;
      emit("auth_popup_blocked");
      // Publish it so the sign-in screen can offer the redirect flow. Session
      // scoped on purpose: whether popups work is a property of the browser
      // this person is in right now, not of the person.
      try {
        sessionStorage.setItem("lq_tg_popup_blocked", "1");
        window.dispatchEvent(new CustomEvent("lq:tg-popup-blocked"));
      } catch {
        /* ignore */
      }
    }, POPUP_BLUR_MS);

    const abandonTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      emit("auth_abandoned", { reason: "no_callback" });
      cleanup();
      reject(new Error("popup-unreachable"));
    }, AUTH_ABANDON_MS);

    function cleanup() {
      clearTimeout(blurTimer);
      clearTimeout(abandonTimer);
      window.removeEventListener("blur", onBlur);
    }

    window.Telegram.Login.auth(
      { bot_id: TELEGRAM_BOT_ID, request_access: "write", ...options },
      (user) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (user) resolve(user);
        else reject(new Error("cancelled"));
      }
    );
  });
}
