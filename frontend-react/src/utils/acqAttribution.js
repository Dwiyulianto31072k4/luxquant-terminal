// First-touch acquisition (UTM + social referrer).
// Stored once in localStorage; claimed onto the user after login.
// Aligns with free TG buttons: utm_source=telegram&utm_medium=channel&...

import { trackFunnel } from "./funnelAnalytics";

const LS_KEY = "lq_acq_v1";
const SESSION_FIRED = "lq_acq_land_fired";

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function fromReferrer(ref) {
  const h = hostOf(ref);
  if (!h) return null;
  if (h === "t.me" || h.endsWith("telegram.org") || h.endsWith("telegram.me")) {
    return { source: "telegram", medium: "referrer", campaign: null, content: null };
  }
  if (h === "x.com" || h === "twitter.com" || h.endsWith("t.co")) {
    return { source: "x", medium: "referrer", campaign: null, content: null };
  }
  if (h.includes("google.")) {
    return { source: "google", medium: "organic", campaign: null, content: null };
  }
  if (h.includes("discord.com") || h.includes("discord.gg")) {
    return { source: "discord", medium: "referrer", campaign: null, content: null };
  }
  return null;
}

function readStored() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object") return null;
    return o;
  } catch {
    return null;
  }
}

function writeStored(acq) {
  try {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({
        source: acq.source || null,
        medium: acq.medium || null,
        campaign: acq.campaign || null,
        content: acq.content || null,
        path: acq.path || null,
        ts: new Date().toISOString(),
      })
    );
  } catch {
    /* ignore */
  }
}

/**
 * Capture first-touch from current URL (UTM) or document.referrer.
 * Call once on app boot. Never overwrites an existing first touch.
 * @returns {object|null} stored acq
 */
export function captureAcqFromUrl() {
  if (typeof window === "undefined") return null;

  const existing = readStored();
  if (existing?.source || existing?.campaign || existing?.content) {
    return existing;
  }

  const params = new URLSearchParams(window.location.search || "");
  const utm = {
    source: (params.get("utm_source") || "").trim().toLowerCase() || null,
    medium: (params.get("utm_medium") || "").trim().toLowerCase() || null,
    campaign: (params.get("utm_campaign") || "").trim().toLowerCase() || null,
    content: (params.get("utm_content") || "").trim().toLowerCase() || null,
    path: window.location.pathname || "/",
  };

  let acq = null;
  if (utm.source || utm.campaign || utm.content) {
    if (utm.source === "twitter") utm.source = "x";
    acq = utm;
  } else if (document.referrer) {
    const ref = fromReferrer(document.referrer);
    if (ref) {
      acq = { ...ref, path: window.location.pathname || "/" };
    }
  }

  if (!acq) return null;

  writeStored(acq);

  // Fire once per tab session so Conversion can see land volume before signup
  try {
    if (!sessionStorage.getItem(SESSION_FIRED)) {
      sessionStorage.setItem(SESSION_FIRED, "1");
      trackFunnel("acq_land", {
        source: acq.source || "unknown",
        path: acq.path,
        meta: {
          medium: acq.medium,
          campaign: acq.campaign,
          content: acq.content,
        },
      });
    }
  } catch {
    /* ignore */
  }

  return acq;
}

/** @returns {object|null} first-touch acq for login body / claim */
export function getStoredAcq() {
  return readStored();
}

export function clearStoredAcq() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}
