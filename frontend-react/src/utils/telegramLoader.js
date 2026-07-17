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

// WAJIB dipanggil di dalam click handler, tanpa await sebelumnya (anti popup-blocker)
export function openTelegramAuth(options = {}) {
  return new Promise((resolve, reject) => {
    if (!window.Telegram?.Login?.auth) {
      ensureTelegram().catch(() => {});
      return reject(new Error("not-ready"));
    }
    window.Telegram.Login.auth(
      { bot_id: TELEGRAM_BOT_ID, request_access: "write", ...options },
      (user) => (user ? resolve(user) : reject(new Error("cancelled")))
    );
  });
}
