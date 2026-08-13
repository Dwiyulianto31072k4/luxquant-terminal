// src/components/TelegramNudgeModal.jsx
// ════════════════════════════════════════════════════════════════
// Adaptive Telegram nudge modal (user-facing, global)
// Shows ONLY to paid users who haven't completed Telegram setup:
// - hasAccess && !telegramLinked → "Link Telegram" (→ /profile)
// - hasAccess && linked && !inGroup → "Join VIP Group" (invite link)
// - inGroup OR !hasAccess → nothing
//
// Frequency (best practice, localStorage-backed):
// - First appears 5s after load (lets app settle)
// - Dismissible; after dismiss → 3-day cooldown
// - Max 4 shows per stage, then stops forever
// - "link" and "join" stages track separately (own quota each)
// - Acting (link/join) changes user state → auto-stops next load
//
// Reusable for future admin-announcement modals: presentational shell
// takes title/body/benefits/cta as props; only the trigger logic is here.
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import api from "../services/authApi";
import { useDialog } from "../hooks/useDialog";
// Same buttons the exchange modals use, so a primary action looks the
// same everywhere in the product.
import { GoldButton, GhostButton } from "./autotrade/AutoTradeUI";

const INITIAL_DELAY_MS = 5000;
const LS_KEY = "lq_tg_nudge_v1";
const DAY_MS = 24 * 60 * 60 * 1000;

// Cooldown grows with how many times we've shown it — gentle reminder that
// never fully stops, just gets rarer over time.
// shows 1-2 -> 3 days
// shows 3-4 -> 7 days
// shows 5+ -> 30 days (about monthly, forever)
const cooldownFor = (shows) => {
  if (shows >= 4) return 30 * DAY_MS;
  if (shows >= 2) return 7 * DAY_MS;
  return 3 * DAY_MS;
};

// ── localStorage helpers (safe — wrapped in try/catch) ──
const readState = () => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};
const writeState = (next) => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  } catch {
    /* ignore (private mode / disabled) */
  }
};

// Decide whether a given stage is eligible to show right now.
// Never hard-stops; cooldown just widens as shows accumulate.
const stageEligible = (state, stage) => {
  const s = state[stage] || { shows: 0, lastDismissed: 0 };
  if (s.lastDismissed && Date.now() - s.lastDismissed < cooldownFor(s.shows)) return false;
  return true;
};

const TelegramIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
  </svg>
);

const CheckIcon = () => (
  <svg
    className="w-3.5 h-3.5 text-profit flex-shrink-0 mt-0.5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const TelegramNudgeModal = () => {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [visible, setVisible] = useState(false);
  const [stage, setStage] = useState(null); // 'link' | 'join'
  const [loading, setLoading] = useState(false);
  const [joinError, setJoinError] = useState(null);
  const [joinOk, setJoinOk] = useState(null);
  const [manualLink, setManualLink] = useState(null);

  // ── derive current condition (reuse VipGroupCard logic) ──
  const hasAccess =
    user?.has_active_access ??
    (user?.role === "admin" ||
      user?.role === "co_admin" ||
      user?.role === "founder" ||
      user?.role === "premium" ||
      user?.role === "subscriber");
  const telegramLinked = !!user?.telegram_id;
  const inGroup = !!user?.telegram_in_group;

  let neededStage = null;
  if (hasAccess && !inGroup) {
    neededStage = !telegramLinked ? "link" : "join";
  }
  // staff never needs the nudge
  if (user?.role === "admin" || user?.role === "co_admin" || user?.role === "founder") {
    neededStage = null;
  }

  // ── decide to show, after initial delay ──
  useEffect(() => {
    if (!neededStage) {
      setVisible(false);
      return;
    }
    const state = readState();
    if (!stageEligible(state, neededStage)) return;

    const timer = setTimeout(() => {
      setStage(neededStage);
      setVisible(true);
      // record a "show" immediately so reloads within cooldown don't re-spam
      const cur = state[neededStage] || { shows: 0, lastDismissed: 0 };
      writeState({
        ...state,
        [neededStage]: { ...cur, shows: cur.shows + 1, lastShown: Date.now() },
      });
    }, INITIAL_DELAY_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [neededStage]);

  const dismiss = useCallback(() => {
    setVisible(false);
    if (!stage) return;
    const state = readState();
    const cur = state[stage] || { shows: 0, lastDismissed: 0 };
    writeState({ ...state, [stage]: { ...cur, lastDismissed: Date.now() } });
  }, [stage]);

  // Open Telegram invite without relying on window.open (blocked after await by
  // most browsers). Same-tab navigation to t.me works on desktop + mobile apps.
  const openInviteLink = (url) => {
    if (!url || typeof url !== "string") return false;
    try {
      // Prefer location assign — not subject to popup blockers after async.
      window.location.assign(url);
      return true;
    } catch {
      try {
        const a = document.createElement("a");
        a.href = url;
        a.rel = "noopener noreferrer";
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        a.remove();
        return true;
      } catch {
        return false;
      }
    }
  };

  const handleJoin = async () => {
    setLoading(true);
    setJoinError(null);
    setJoinOk(null);
    try {
      const res = await api.post("/api/v1/auth/telegram/join-vip");
      const data = res?.data || {};

      if (data.already_member) {
        setJoinOk(
          t("nudge.already_member", "You're already in the VIP group — open Telegram to find it.")
        );
        // Don't hard-dismiss instantly; give feedback then close
        setTimeout(() => dismiss(), 1800);
        return;
      }

      const link = data.invite_link;
      if (!link) {
        setJoinError(
          t(
            "nudge.no_link",
            "Couldn't create an invite link. Try again, or open Profile → VIP Group."
          )
        );
        return;
      }

      // Keep modal open briefly so user sees feedback if navigation is delayed
      setJoinOk(t("nudge.opening", "Opening Telegram invite…"));
      const opened = openInviteLink(link);
      if (!opened) {
        // Absolute fallback: show the link so user can tap manually
        setJoinError(null);
        setJoinOk(null);
        setJoinError(
          t(
            "nudge.copy_link",
            "Popup was blocked. Tap the link below to join:"
          )
        );
        // Store link for manual CTA
        setManualLink(link);
        return;
      }
      // Navigation away — dismiss for when they return
      setTimeout(() => dismiss(), 400);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      const msg =
        typeof detail === "string"
          ? detail
          : t(
              "nudge.join_failed",
              "Could not join VIP group. Check that Telegram is linked and your plan is active."
            );
      setJoinError(msg);
      // Stay open — silent dismiss was the bug users hit
    } finally {
      setLoading(false);
    }
  };

  // Escape to dismiss, background scroll locked, focus trapped and handed
  // back to whatever opened this. See hooks/useDialog.
  // Declared ABOVE the early return: hooks must run on every render, and this
  // component bails out with `return null` while hidden.
  const dialogRef = useRef(null);
  useDialog({ isOpen: visible && !!stage, onClose: dismiss, ref: dialogRef });

  if (!visible || !stage) return null;

  const isLink = stage === "link";

  const benefits = isLink
    ? [
        t("nudge.link_b1", "New signal alerts the moment they fire"),
        t("nudge.link_b2", "Market moves, news & important updates"),
        t("nudge.link_b3", "Stay in the loop without opening the app"),
      ]
    : [
        t("nudge.join_b1", "Signals & alerts delivered as they happen"),
        t("nudge.join_b2", "Exclusive analysis & announcements"),
        t("nudge.join_b3", "Stay updated without checking the app"),
      ];

  return (
    <div
      className="lq-modal-safe lq-scrim-bg fixed inset-0 z-[9999] flex items-end justify-center sm:items-center p-0 sm:p-4"
      onClick={dismiss}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="relative w-full max-w-sm max-h-[min(var(--lq-modal-maxh),100%)] flex flex-col overflow-hidden rounded-t-3xl sm:rounded-2xl bg-surface-raised"
        style={{
          border: "1px solid rgb(var(--ink) / 0.1)",
          boxShadow: "0 -20px 60px rgb(var(--scrim) / 0.35)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 justify-center pt-2.5 pb-1 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-ink/25" />
        </div>
        {/* close */}
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 z-10 w-7 h-7 rounded-md flex items-center justify-center text-text-muted/60 hover:text-text-primary hover:bg-ink/[0.06] transition-colors"
          aria-label="Close"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto p-6 pt-4">
          {/* icon */}
          {/* Eyebrow + mark, the same opening the exchange modals use. */}
          <p className="mb-3 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-accent">
            {t("nudge.eyebrow", "Notifications")}
          </p>
          <div
            className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg"
            style={{
              background: "rgb(var(--tg) / 0.08)",
              border: "1px solid rgb(var(--tg) / 0.25)",
            }}
          >
            <TelegramIcon className="w-6 h-6 text-brand-telegram" />
          </div>

          {/* title */}
          <h3
            className="text-text-primary text-lg font-semibold leading-snug"
            style={{ fontFamily: '"Playfair Display", serif' }}
          >
            {isLink
              ? t("nudge.link_title", "Get notified — never miss a move")
              : t("nudge.join_title", "One step left — join to get notified")}
          </h3>
          <p className="text-text-muted/70 text-xs mt-1.5 leading-relaxed">
            {isLink
              ? t(
                  "nudge.link_sub",
                  "Link your Telegram to get updates pushed straight to you — no need to keep checking the app."
                )
              : t(
                  "nudge.join_sub",
                  "Your access is active. Join the VIP group to get signals and updates pushed to you in real time."
                )}
          </p>

          {/* benefits */}
          <div className="mt-4 space-y-2">
            {benefits.map((b, i) => (
              <div key={i} className="flex items-start gap-2">
                <CheckIcon />
                <p className="text-text-primary/80 text-[11px] leading-relaxed">{b}</p>
              </div>
            ))}
          </div>
        </div>

        {/* sticky CTA footer — never covered */}
        <div
          className="shrink-0 border-t border-ink/[0.06] px-6 pt-4"
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))" }}
        >
          {(joinError || joinOk) && (
            <div
              className={`mb-1 rounded-lg px-3 py-2 text-[11px] leading-snug ${
                joinError
                  ? "border border-negative/25 bg-negative/[0.08] text-loss"
                  : "border border-profit/25 bg-profit/[0.08] text-profit"
              }`}
            >
              {joinError || joinOk}
              {manualLink ? (
                <a
                  href={manualLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 block break-all font-mono text-[10px] font-semibold underline underline-offset-2"
                >
                  {manualLink}
                </a>
              ) : null}
            </div>
          )}

          <div className="flex gap-3">
            <GhostButton onClick={dismiss} className="flex-1">
              {t("nudge.later", "Maybe later")}
            </GhostButton>

            {isLink ? (
              <a
                href="/profile"
                onClick={dismiss}
                className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-center font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-fg transition-opacity hover:opacity-90"
              >
                {t("nudge.link_cta", "Link Telegram")}
              </a>
            ) : manualLink ? (
              <a
                href={manualLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center rounded-lg bg-accent px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-fg transition-opacity hover:opacity-90"
              >
                {t("nudge.open_invite", "Open invite in Telegram")}
              </a>
            ) : (
              <GoldButton onClick={handleJoin} disabled={loading} className="flex-1">
                {loading ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent-fg/30 border-t-accent-fg" />
                    {t("nudge.joining", "Joining…")}
                  </span>
                ) : (
                  t("nudge.join_cta", "Join VIP Group")
                )}
              </GoldButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TelegramNudgeModal;
