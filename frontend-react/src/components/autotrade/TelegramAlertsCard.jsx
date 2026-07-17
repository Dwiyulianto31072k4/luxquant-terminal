import { useState } from "react";
import {
 sendTestAlert,
 updateAlertPreferences,
} from "../../services/autotradeApi";
import {
 Card,
 GhostButton,
 GoldButton,
 Notice,
 StatusDot,
 Toggle,
} from "./AutoTradeUI";
import { TelegramIcon } from "./BrandIcons";

export default function TelegramAlertsCard({ status, loadError = "", onUpdated }) {
 const [working, setWorking] = useState("");
 const [message, setMessage] = useState("");
 const [error, setError] = useState("");
 const telegram = status?.telegram || {};
 const preferences = status?.preferences || {};
 const unavailable = !status;

 const save = async (changes) => {
 setWorking("save");
 setError("");
 setMessage("");
 try {
 const updated = await updateAlertPreferences({
 ...preferences,
 ...changes,
 });
 onUpdated?.(updated);
 setMessage("Alert preferences saved.");
 } catch (err) {
 setError(err.message || "Failed to save alert preferences");
 } finally {
 setWorking("");
 }
 };

 const test = async () => {
 setWorking("test");
 setError("");
 setMessage("");
 try {
 await sendTestAlert();
 setMessage("Test alert sent to Telegram.");
 onUpdated?.();
 } catch (err) {
 setError(err.message || "Telegram test alert failed");
 } finally {
 setWorking("");
 }
 };

 return (
 <Card className="border-[#229ED9]/20">
 <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
 <div className="min-w-0">
 <div className="flex items-center gap-2.5">
 <span className="flex h-10 w-10 items-center justify-center rounded-md border border-[#229ED9]/25 bg-[#229ED9]/10 text-[#229ED9]">
 <TelegramIcon className="h-6 w-6" />
 </span>
 <div>
 <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#29a9ea]">
 Notification Channel
 </p>
 <h2 className="mt-0.5 text-lg font-semibold text-text-primary">
 Telegram alerts
 </h2>
 <StatusDot tone={telegram.linked ? "good" : "warn"}>
 {telegram.linked
 ? `Linked${telegram.username ? ` · @${telegram.username}` : ""}`
 : "Telegram not linked"}
 </StatusDot>
 </div>
 </div>
 <p className="mt-3 max-w-2xl text-xs leading-5 text-text-muted">
 Choose which operational events are delivered privately through
 LuxQuantTerminalBot.
 </p>
 </div>

 {unavailable ? (
 <GhostButton tone="gold" onClick={() => onUpdated?.()}>
 Retry status
 </GhostButton>
 ) : !telegram.linked ? (
 <GoldButton onClick={() => { window.location.href = "/profile"; }}>
 Link Telegram in Profile
 </GoldButton>
 ) : (
 <div className="flex flex-wrap items-center gap-2">
 <GhostButton
 tone="gold"
 onClick={test}
 disabled={working === "test" || !telegram.bot_configured}
 >
 {working === "test" ? "Sending…" : "Send test alert"}
 </GhostButton>
 <GhostButton
 onClick={() => save({ enabled: !preferences.enabled })}
 disabled={working === "save"}
 >
 {preferences.enabled ? "Disable alerts" : "Enable alerts"}
 </GhostButton>
 </div>
 )}
 </div>

 {!unavailable && telegram.linked && preferences.enabled ? (
 <div className="mt-4 grid gap-2 border-t border-ink/[0.06] pt-4 sm:grid-cols-2 lg:grid-cols-5">
 {[
 ["execution_failed", "Execution failed"],
 ["risk_limit", "Risk limits"],
 ["position_unprotected", "Unprotected position"],
 ["position_closed", "Position closed"],
 ["recovery", "Recovery"],
 ].map(([key, label]) => (
 <Toggle
 key={key}
 label={label}
 checked={preferences[key] !== false}
 onChange={(value) => save({ [key]: value })}
 />
 ))}
 </div>
 ) : null}

 {unavailable ? (
 <div className="mt-4">
 <Notice tone="error">
 Telegram alert status could not be loaded
 {loadError ? `: ${loadError}` : "."}
 </Notice>
 </div>
 ) : !telegram.bot_configured ? (
 <div className="mt-4">
 <Notice tone="warn">
 Telegram bot delivery is not configured on the AutoTrade server yet.
 </Notice>
 </div>
 ) : null}
 {error ? <div className="mt-4"><Notice tone="error">{error}</Notice></div> : null}
 {message ? <div className="mt-4"><Notice tone="success">{message}</Notice></div> : null}
 </Card>
 );
}
