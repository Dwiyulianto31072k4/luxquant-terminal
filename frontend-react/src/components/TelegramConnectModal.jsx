// Walks someone from "Telegram alerts: on" to a bot that can actually reach them.
//
// A Telegram bot may only message an account that pressed Start in that bot.
// Linking Telegram on the site does not do it, and nothing used to say so: on
// 2026-09-22 six of the eight people with Telegram alerts switched on had never
// been reachable, their alerts failed with "chat not found", and the site kept
// showing the toggle as on. This is the one place that closes that gap — open
// the bot, press Start, and the server confirms it can write before we say done.

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "./ui/Modal";
import { Z } from "../constants/zIndex";
import { TelegramIcon } from "./autotrade/BrandIcons";
import { telegramCheck } from "../services/telegramReach";
import { ensureMiniAppSdk, isMiniApp } from "../utils/telegramWebApp";
import { requestTelegramWriteAccess } from "../utils/telegramWriteAccess";

export const ALERT_BOT = "LuxQuantTerminalBot";
const BOT_LINK = `https://t.me/${ALERT_BOT}?start=alerts`;

const BUTTON =
  "min-h-[44px] rounded-lg border border-ink/[0.12] px-4 py-2 text-[13px] font-medium text-text-primary hover:bg-ink/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40";

/**
 * @param {boolean}  isOpen
 * @param {function} onClose       closed without connecting
 * @param {function} onConnected   the server confirmed the bot can write
 * @param {boolean}  [nested]      opened from inside another dialog
 */
export default function TelegramConnectModal({ isOpen, onClose, onConnected, nested = false }) {
  const navigate = useNavigate();
  // idle → checking → (connected | blocked | unknown | unlinked)
  const [state, setState] = useState("idle");
  const [opened, setOpened] = useState(false);
  const done = useRef(false);

  const check = useCallback(async () => {
    setState("checking");
    try {
      const r = await telegramCheck();
      if (!r.linked) return setState("unlinked");
      if (r.ready) {
        setState("connected");
        if (!done.current) {
          done.current = true;
          onConnected?.();
        }
        return;
      }
      setState(r.unknown ? "unknown" : "blocked");
    } catch {
      setState("unknown");
    }
  }, [onConnected]);

  useEffect(() => {
    if (!isOpen) return;
    done.current = false;
    setOpened(false);
    setState("idle");
  }, [isOpen]);

  // Coming back from the Telegram app is the moment they are most likely to
  // have pressed Start, so check then instead of making them find a button.
  useEffect(() => {
    if (!isOpen || !opened) return;
    const onBack = () => {
      if (document.visibilityState === "visible" && state !== "connected") check();
    };
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    return () => {
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("focus", onBack);
    };
  }, [isOpen, opened, state, check]);

  async function openBot() {
    setOpened(true);
    if (!isMiniApp()) {
      // Synchronous, straight from the click, or a popup blocker eats it.
      window.open(BOT_LINK, "_blank", "noopener,noreferrer");
      return;
    }
    // Inside the Mini App, Telegram can grant the permission in place; if it
    // will not, hand over to the chat through Telegram itself.
    const r = await requestTelegramWriteAccess({ trigger: "alert_connect" });
    if (r.status === "allowed") return check();
    const webApp = await ensureMiniAppSdk();
    if (webApp?.openTelegramLink) webApp.openTelegramLink(BOT_LINK);
    else window.location.href = BOT_LINK;
  }

  const connected = state === "connected";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      eyebrow="TELEGRAM"
      title={connected ? "Telegram connected" : "Connect Telegram alerts"}
      zIndex={nested ? Z.nestedModal : Z.modal}
      footer={
        connected ? (
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] w-full rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-accent-fg"
          >
            Done
          </button>
        ) : state === "unlinked" ? (
          <button
            type="button"
            onClick={() => navigate("/profile")}
            className="min-h-[44px] w-full rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-accent-fg"
          >
            Link Telegram in Profile
          </button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openBot}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-accent-fg"
            >
              <TelegramIcon className="h-4 w-4" />
              Open @{ALERT_BOT}
            </button>
            <button
              type="button"
              onClick={check}
              disabled={state === "checking"}
              className={`${BUTTON} flex-1`}
            >
              {state === "checking" ? "Checking…" : "I pressed Start"}
            </button>
          </div>
        )
      }
    >
      {connected ? (
        <p className="text-[13px] leading-relaxed text-text-secondary">
          Alerts will arrive as messages from{" "}
          <span className="font-mono text-text-primary">@{ALERT_BOT}</span>. You can turn them off
          any time in Notifications.
        </p>
      ) : state === "unlinked" ? (
        <p className="text-[13px] leading-relaxed text-text-secondary">
          Link your Telegram account in Profile first, then come back and switch alerts on.
        </p>
      ) : (
        <div className="space-y-4 text-[13px] leading-relaxed text-text-secondary">
          <p>
            Telegram only lets a bot message you after you press <strong>Start</strong> in it. Until
            then your alerts cannot be delivered.
          </p>
          <ol className="space-y-2.5">
            {[
              <>
                Open <span className="font-mono text-text-primary">@{ALERT_BOT}</span>
              </>,
              <>
                Press <strong className="text-text-primary">Start</strong> at the bottom of the chat
              </>,
              <>Come back here — we check automatically</>,
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-ink/[0.12] font-mono text-[11px] text-text-primary">
                  {i + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
          <div aria-live="polite">
            {state === "blocked" && (
              <p className="rounded-lg border border-amber-500/25 bg-amber-500/[0.07] p-2.5 text-[12px] text-text-secondary">
                We still can’t reach you. Make sure you pressed Start in{" "}
                <span className="font-mono">@{ALERT_BOT}</span> — not another bot — and that you
                haven’t blocked it.
              </p>
            )}
            {state === "unknown" && (
              <p className="rounded-lg border border-ink/[0.1] p-2.5 text-[12px] text-text-muted">
                Couldn’t check right now. Try again in a moment.
              </p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
