import { trackGrowth } from "./growthAnalytics";
import { ensureMiniAppSdk, isMiniApp } from "./telegramWebApp";

const STATE_KEY = "lq_tg_write_access_v1";
const CANCEL_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function readState() {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY) || "null");
  } catch {
    return null;
  }
}

function writeState(status) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({ status, at: Date.now() }));
  } catch {
    /* best effort */
  }
}

async function verifyDelivery() {
  const token = localStorage.getItem("access_token");
  if (!token) return false;
  try {
    const response = await fetch("/api/v1/auth/telegram/write-access/confirm", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      keepalive: true,
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Ask for Telegram DM permission only after a user has armed real value.
 * The activation itself always succeeds even when this prompt is unavailable,
 * cancelled, or Telegram delivery verification fails.
 */
export async function requestTelegramWriteAccess({ trigger = "activation" } = {}) {
  if (!isMiniApp()) return { status: "unavailable", verified: false };

  const webApp = await ensureMiniAppSdk();
  if (!webApp || typeof webApp.requestWriteAccess !== "function") {
    return { status: "unavailable", verified: false };
  }

  if (webApp.initDataUnsafe?.user?.allows_write_to_pm === true) {
    writeState("allowed");
    trackGrowth("telegram_write_access_allowed", {
      source: "telegram_miniapp",
      meta: { trigger, result: "already_allowed" },
      once: `telegram_write_access_allowed:${trigger}`,
    });
    return { status: "allowed", verified: await verifyDelivery() };
  }

  const prior = readState();
  if (prior?.status === "allowed") {
    return { status: "allowed", verified: await verifyDelivery() };
  }
  if (
    prior?.status === "cancelled" &&
    Number.isFinite(prior.at) &&
    Date.now() - prior.at < CANCEL_COOLDOWN_MS
  ) {
    return { status: "cooldown", verified: false };
  }

  trackGrowth("telegram_write_access_shown", {
    source: "telegram_miniapp",
    meta: { trigger },
    once: `telegram_write_access_shown:${trigger}`,
  });

  return new Promise((resolve) => {
    try {
      webApp.requestWriteAccess(async (allowed) => {
        const status = allowed === true ? "allowed" : "cancelled";
        writeState(status);
        trackGrowth(`telegram_write_access_${status}`, {
          source: "telegram_miniapp",
          meta: { trigger, result: status },
          once: `telegram_write_access_${status}:${trigger}`,
        });
        const verified = status === "allowed" ? await verifyDelivery() : false;
        resolve({ status, verified });
      });
    } catch {
      resolve({ status: "unavailable", verified: false });
    }
  });
}

export const __TEST__ = { CANCEL_COOLDOWN_MS, STATE_KEY };
