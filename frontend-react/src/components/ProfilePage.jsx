// src/components/ProfilePage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Profile — Terminal desk monochrome
// - Responsive: 1-col mobile → 2-col tablet → multi-col desktop
// - Wider max-w-6xl, denser layout
// - Account Info as KPI strip at top
// - Display Preferences with live BTC ticker preview
// - Subtle borders, light typography, tabular-nums
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { useTheme } from "../context/ThemeContext";
import { useTranslation } from "react-i18next";
import api from "../services/authApi";
import { ensureTelegram, openTelegramAuth } from "../utils/telegramLoader";
import CountryCurrencyPicker from "./CountryCurrencyPicker";
import VipGroupCard from "./VipGroupCard";
import { ThemeAppearancePicker } from "./ThemeToggle";
import { convertPrice, formatLocalPrice } from "../utils/currencyHelpers";

// ─── Lazy-load Google Identity Services — hanya saat dibutuhkan ───
// AuthContext tidak lagi me-load GSI global (login Google sekarang pakai
// OAuth2 redirect), jadi fitur "Link Google" di sini load script-nya sendiri.
const loadGsiScript = () =>
  new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.getElementById("google-gsi-script");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", reject);
      return;
    }
    const script = document.createElement("script");
    script.id = "google-gsi-script";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });

const ProfilePage = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const { user, setUser } = useAuth();
  const { rates, supported } = useCurrency();
  const { canSwitchTheme } = useTheme();
  const fileInputRef = useRef(null);

  const [username, setUsername] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [connections, setConnections] = useState(null);
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const [linkingTelegram, setLinkingTelegram] = useState(false);
  const [linkingDiscord, setLinkingDiscord] = useState(false);
  const [toast, setToast] = useState(null);
  const [avatarBroken, setAvatarBroken] = useState(false);

  // ─── BTC live ticker for preview ───
  const [btcTicker, setBtcTicker] = useState(null);

  useEffect(() => {
    if (user) setUsername(user.username || "");
  }, [user, setUser]);
  // New URL = new chance to load (upload replaces the filename every time).
  useEffect(() => {
    setAvatarBroken(false);
  }, [user?.avatar_url]);
  useEffect(() => {
    fetchConnections();
  }, []);

  // Avatar menu "Join VIP group" lands on /profile#vip-group. The settings
  // dialog scrolls its own pane, not the window — scrollIntoView still walks
  // that overflow ancestor.
  useEffect(() => {
    if (location.hash !== "#vip-group") return undefined;
    let tries = 0;
    let timer = 0;
    const run = () => {
      const el = document.getElementById("vip-group");
      if (!el && tries < 12) {
        tries += 1;
        timer = window.setTimeout(run, 50);
        return;
      }
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-accent/40");
      timer = window.setTimeout(() => {
        el.classList.remove("ring-2", "ring-accent/40");
      }, 1600);
    };
    timer = window.setTimeout(run, 80);
    return () => window.clearTimeout(timer);
  }, [location.hash, location.key]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Preload Telegram widget script saat halaman dibuka, supaya tombol
  // "Link / Replace" Telegram langsung siap pakai begitu diklik.
  useEffect(() => {
    ensureTelegram().catch(() => {});
  }, []);

  const detailMessage = (err) => {
    const d = err?.response?.data?.detail;
    if (typeof d === "string") return d;
    return d?.message || "";
  };

  const offerMigrate = (detail) => {
    if (!detail || typeof detail !== "object" || !detail.transferable) return false;
    return window.confirm(detail.message || "Move this login to this account?");
  };

  // After Discord OAuth: the identity is on another row — offer to move it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const migrate = params.get("migrate") === "discord" || params.get("discord_transfer") === "1";
    const locked = params.get("error") === "discord_linked_elsewhere_locked";
    const already = params.get("error") === "discord_already_linked";
    if (!migrate && !locked && !already) return;

    const next = new URL(window.location.href);
    next.search = "";
    window.history.replaceState({}, "", next.pathname + next.hash);

    (async () => {
      if (locked) {
        showToast(
          "That Discord belongs to a staff account. Ask an admin to move it.",
          "error"
        );
        return;
      }
      try {
        const pending = (await api.get("/api/v1/profile/pending-identity-transfer")).data;
        if (!pending?.pending) {
          if (already) showToast("This Discord is already linked to another account.", "error");
          return;
        }
        if (!pending.transferable) {
          showToast(pending.message || "Cannot move this Discord.", "error");
          return;
        }
        if (!offerMigrate(pending)) return;
        const res = await api.post("/api/v1/profile/confirm-discord-transfer");
        setUser(res.data);
        fetchConnections();
        showToast("Discord moved to this account");
      } catch (err) {
        showToast(detailMessage(err) || "Could not move Discord", "error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-link from avatar menu → Appearance
  useEffect(() => {
    if (window.location.hash !== "#appearance") return;
    const tmr = setTimeout(() => {
      document.getElementById("appearance")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => clearTimeout(tmr);
  }, []);

  // Fetch BTC live ticker every 30s for the preview section
  useEffect(() => {
    let cancelled = false;
    const fetchBtc = async () => {
      try {
        const res = await api.get("/api/v1/market/btc-ticker");
        if (!cancelled) setBtcTicker(res.data);
      } catch {
        // Silent fail — preview just won't show if unavailable
      }
    };
    fetchBtc();
    const interval = setInterval(fetchBtc, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const showToast = (message, type = "success") => setToast({ message, type });

  const fetchConnections = async () => {
    try {
      const res = await api.get("/api/v1/profile/connections");
      setConnections(res.data);
    } catch (err) {
      console.error("Failed to fetch connections:", err);
    }
  };

  const isGoogleLinked = connections?.google?.linked || false;
  const isTelegramLinked = connections?.telegram?.linked || false;
  const isDiscordLinked = connections?.discord?.linked || false;
  const initial = user?.username?.charAt(0).toUpperCase() || "U";
  // A dead avatar URL (expired Google photo, deleted upload) must degrade to the
  // initial, not to the browser's broken-image glyph. Remove still shows so the
  // user can clear a broken one.
  const storedAvatarUrl = user?.avatar_url;
  const avatarUrl = avatarBroken ? null : storedAvatarUrl;
  const usernameChanged = username !== (user?.username || "");

  // ════════════════════════════════════════
  // USERNAME
  // ════════════════════════════════════════
  const validateUsername = (val) => {
    if (val.length < 3) return t("profile.username_min");
    if (val.length > 50) return t("profile.username_max");
    if (!/^[a-z0-9_]+$/.test(val)) return t("profile.username_format");
    return "";
  };
  const handleUsernameChange = (e) => {
    const val = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
    setUsername(val);
    setUsernameError(val ? validateUsername(val) : "");
  };
  const handleSaveUsername = async () => {
    if (!username || username === user?.username) return;
    const err = validateUsername(username);
    if (err) {
      setUsernameError(err);
      return;
    }
    setSaving(true);
    try {
      const res = await api.put("/api/v1/profile", { username });
      setUser(res.data);
      showToast(t("profile.username_saved"));
    } catch (err) {
      const msg = err.response?.data?.detail || t("profile.username_failed");
      setUsernameError(msg);
      showToast(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  // ════════════════════════════════════════
  // AVATAR
  // ════════════════════════════════════════
  const handleAvatarClick = () => fileInputRef.current?.click();

  const compressImage = (file, maxW = 512, maxH = 512, quality = 0.85) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Read failed"));
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error("Load failed"));
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let { width: w, height: h } = img;
          if (w > maxW || h > maxH) {
            const r = Math.min(maxW / w, maxH / h);
            w = Math.round(w * r);
            h = Math.round(h * r);
          }
          canvas.width = w;
          canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          canvas.toBlob(
            (blob) =>
              blob
                ? resolve(new File([blob], "avatar.jpg", { type: "image/jpeg" }))
                : reject(new Error("Compress failed")),
            "image/jpeg",
            quality
          );
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      showToast(t("profile.avatar_format_error"), "error");
      return;
    }
    setUploadingAvatar(true);
    try {
      const compressed = await compressImage(file);
      const formData = new FormData();
      formData.append("file", compressed);
      const res = await api.post("/api/v1/profile/avatar", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setUser(res.data);
      showToast(t("profile.avatar_saved"));
    } catch (err) {
      showToast(err.response?.data?.detail || t("profile.avatar_failed"), "error");
    } finally {
      setUploadingAvatar(false);
      e.target.value = "";
    }
  };

  const handleRemoveAvatar = async () => {
    setUploadingAvatar(true);
    try {
      const res = await api.delete("/api/v1/profile/avatar");
      setUser(res.data);
      showToast(t("profile.avatar_removed"));
    } catch {
      showToast(t("profile.avatar_remove_failed"), "error");
    } finally {
      setUploadingAvatar(false);
    }
  };

  // ════════════════════════════════════════
  // DISPLAY PREFERENCES (Country & Currency)
  // ════════════════════════════════════════
  const handleCountryChange = async (newCountry) => {
    setSavingPreferences(true);
    try {
      const payload = newCountry ? { country_code: newCountry } : { country_code: "" };
      const res = await api.put("/api/v1/profile", payload);
      setUser(res.data);
      showToast(
        newCountry
          ? t("profile.country_saved", "Country updated to ") + newCountry
          : t("profile.country_cleared", "Country cleared")
      );
    } catch (err) {
      const msg =
        err.response?.data?.detail || t("profile.country_failed", "Failed to update country");
      showToast(typeof msg === "string" ? msg : "Update failed", "error");
    } finally {
      setSavingPreferences(false);
    }
  };

  const handleCurrencyChange = async (newCurrency) => {
    if (!newCurrency || newCurrency === user?.currency_code) return;
    setSavingPreferences(true);
    try {
      const res = await api.put("/api/v1/profile", { currency_code: newCurrency });
      setUser(res.data);
      showToast(t("profile.currency_saved", "Currency updated to ") + newCurrency);
    } catch (err) {
      const msg =
        err.response?.data?.detail || t("profile.currency_failed", "Failed to update currency");
      showToast(typeof msg === "string" ? msg : "Update failed", "error");
    } finally {
      setSavingPreferences(false);
    }
  };

  // ════════════════════════════════════════
  // CONNECTIONS — Google
  // ════════════════════════════════════════
  const handleLinkGoogle = useCallback(async () => {
    setLinkingGoogle(true);
    try {
      await loadGsiScript();
    } catch {
      showToast(t("profile.google_not_ready"), "error");
      setLinkingGoogle(false);
      return;
    }
    window.google.accounts.id.initialize({
      client_id: "352504384995-lo53k3ak37t4mst7nuauj3nm6hg0n1j7.apps.googleusercontent.com",
      callback: async (response) => {
        const postLink = (transfer) =>
          api.post("/api/v1/profile/link-google", {
            id_token: response.credential,
            ...(transfer ? { transfer: true } : {}),
          });
        const onLinked = (res) => {
          setUser(res.data);
          fetchConnections();
          showToast(t("profile.google_linked"));
        };

        try {
          onLinked(await postLink(false));
        } catch (err) {
          const detail = err.response?.data?.detail;
          if (err.response?.status === 409 && offerMigrate(detail)) {
            try {
              onLinked(await postLink(true));
            } catch (err2) {
              showToast(detailMessage(err2) || t("profile.google_link_failed"), "error");
            }
          } else {
            showToast(detailMessage(err) || t("profile.google_link_failed"), "error");
          }
        } finally {
          setLinkingGoogle(false);
        }
      },
      auto_select: false,
    });
    window.google.accounts.id.prompt((n) => {
      if (n.isNotDisplayed() || n.isDismissedMoment()) setLinkingGoogle(false);
    });
  }, [t, setUser]);

  const handleUnlinkGoogle = async () => {
    try {
      const res = await api.delete("/api/v1/profile/unlink-google");
      setUser(res.data);
      fetchConnections();
      showToast(t("profile.google_unlinked"));
    } catch (err) {
      showToast(err.response?.data?.detail || t("profile.google_unlink_failed"), "error");
    }
  };

  // ─── Telegram ───
  // Pakai openTelegramAuth() yang sama dengan login flow — deterministik,
  // tidak ada inject <script> per-klik. Popup OAuth Telegram kebuka langsung.
  // PENTING: openTelegramAuth() dipanggil sebelum await pertama (anti popup-blocker).
  const handleLinkTelegram = useCallback(async () => {
    const isReplace = isTelegramLinked;
    setLinkingTelegram(true);
    try {
      const telegramUser = await openTelegramAuth();
      const postLink = (transfer) =>
        api.post("/api/v1/profile/link-telegram", {
          ...telegramUser,
          ...(transfer ? { transfer: true } : {}),
        });
      try {
        const res = await postLink(false);
        setUser(res.data);
        fetchConnections();
        showToast(isReplace ? t("profile.telegram_replaced") : t("profile.telegram_linked"));
      } catch (err) {
        const detail = err.response?.data?.detail;
        if (err.response?.status === 409 && offerMigrate(detail)) {
          const res = await postLink(true);
          setUser(res.data);
          fetchConnections();
          showToast("Telegram moved to this account");
        } else {
          throw err;
        }
      }
    } catch (err) {
      if (err.message === "cancelled") return; // user batal — diam
      if (err.message === "not-ready") {
        showToast(
          t("profile.telegram_not_ready", "Telegram is still loading. Please try again."),
          "error"
        );
      } else {
        showToast(detailMessage(err) || t("profile.telegram_link_failed"), "error");
      }
    } finally {
      setLinkingTelegram(false);
    }
  }, [t, isTelegramLinked, setUser]);

  // ─── Discord ───
  const handleLinkDiscord = useCallback(async () => {
    setLinkingDiscord(true);
    try {
      const res = await api.get("/api/v1/profile/link-discord/url");
      window.location.href = res.data.url;
    } catch (err) {
      showToast(
        err.response?.data?.detail || t("profile.discord_link_failed") || "Discord link failed",
        "error"
      );
      setLinkingDiscord(false);
    }
  }, [t]);

  const handleUnlinkDiscord = async () => {
    try {
      const res = await api.delete("/api/v1/profile/unlink-discord");
      setUser(res.data);
      fetchConnections();
      showToast(t("profile.discord_unlinked") || "Discord unlinked");
    } catch (err) {
      showToast(
        err.response?.data?.detail || t("profile.discord_unlink_failed") || "Discord unlink failed",
        "error"
      );
    }
  };

  // ════════════════════════════════════════
  // DERIVED
  // ════════════════════════════════════════
  const showLocal =
    user?.currency_code && user.currency_code !== "USD" && rates?.[user.currency_code];
  const btcPrice = btcTicker?.price;
  const btcLocal = showLocal && btcPrice ? convertPrice(btcPrice, user.currency_code, rates) : null;
  const btcChangePct = btcTicker?.price_change_pct;

  // ════════════════════════════════════════
  // RENDER — Grok-clean settings surface
  // ════════════════════════════════════════
  const joined =
    user?.created_at &&
    new Date(user.created_at).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  const roleLabel = user?.role ? String(user.role).replace(/_/g, " ") : "free";

  return (
    <div className="mx-auto w-full max-w-2xl">
      {toast && (
        <div
          className={`lq-toast-safe fixed right-4 z-[100000] rounded-xl border px-4 py-3 text-[13px] font-medium shadow-xl backdrop-blur-md ${
            toast.type === "error"
              ? "border-loss/25 bg-loss/15 text-loss"
              : "border-profit/25 bg-profit/15 text-profit"
          }`}
          style={{ animation: "slideIn 0.25s ease-out" }}
        >
          {toast.message}
        </div>
      )}

      <header className="mb-8">
        <h1 className="text-[1.65rem] font-semibold tracking-tight text-text-primary sm:text-[1.85rem]">
          {t("profile.title", "Profile")}
        </h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-text-muted">
          {t("profile.subtitle", "Account, appearance, and connected logins.")}
        </p>
        <p className="mt-2 text-[12px] text-text-muted/70">
          <span className="capitalize">{roleLabel}</span>
          {joined ? ` · Joined ${joined}` : null}
          {user?.id != null ? ` · #${user.id}` : null}
        </p>
      </header>

      <div className="space-y-4">
        {/* Profile */}
        <Section title={t("profile.section_profile", "Profile")}>
          <div className="flex flex-col gap-6 p-5 sm:flex-row sm:items-start">
            <div className="flex shrink-0 flex-col items-center gap-2 sm:items-start">
              <button
                type="button"
                onClick={handleAvatarClick}
                className="group relative h-[88px] w-[88px] overflow-hidden rounded-full border border-ink/[0.1] bg-surface-secondary"
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarBroken(true)}
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-2xl font-semibold text-text-primary">
                    {initial}
                  </span>
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-scrim/55 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {uploadingAvatar ? "…" : t("profile.upload", "Upload")}
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleAvatarUpload}
              />
              <div className="flex gap-3 text-[12px]">
                <button
                  type="button"
                  onClick={handleAvatarClick}
                  className="font-medium text-accent hover:underline"
                >
                  {t("profile.upload", "Upload")}
                </button>
                {storedAvatarUrl ? (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    className="font-medium text-text-muted hover:text-loss hover:underline"
                  >
                    {t("profile.remove", "Remove")}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="min-w-0 flex-1 space-y-4">
              <Field label={t("profile.username", "Username")}>
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/50">
                      @
                    </span>
                    <input
                      type="text"
                      value={username}
                      onChange={handleUsernameChange}
                      maxLength={50}
                      className={`w-full rounded-xl border bg-surface-secondary py-2.5 pl-8 pr-3 text-[14px] text-text-primary outline-none transition-colors focus:border-ink/20 ${
                        usernameError
                          ? "border-loss/40"
                          : usernameChanged
                            ? "border-accent/40"
                            : "border-ink/[0.1]"
                      }`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveUsername}
                    disabled={!usernameChanged || saving || !!usernameError}
                    className="shrink-0 rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-accent-fg transition-opacity disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    {saving ? "…" : t("profile.save", "Save")}
                  </button>
                </div>
                {usernameError ? (
                  <p className="mt-1.5 text-[12px] text-loss">{usernameError}</p>
                ) : (
                  <p className="mt-1.5 text-[12px] text-text-muted">
                    {t("profile.username_hint", "Lowercase letters, numbers, and underscores.")}
                  </p>
                )}
              </Field>

              <Field label={t("profile.email", "Email")}>
                <div className="rounded-xl border border-ink/[0.07] bg-ink/[0.02] px-3 py-2.5 text-[13px] text-text-muted">
                  {user?.email || "—"}
                </div>
                <p className="mt-1.5 text-[12px] text-text-muted">
                  {t("profile.email_readonly", "Email cannot be changed.")}
                </p>
              </Field>
            </div>
          </div>
        </Section>

        {/* Appearance — theme lives here (not in avatar menu) */}
        {canSwitchTheme ? (
          <Section id="appearance" title={t("userMenu.appearance", "Appearance")}>
            <div className="p-5">
              <p className="mb-4 text-[13px] leading-relaxed text-text-muted">
                {t(
                  "profile.appearance_desc",
                  "Choose how LuxQuant looks. Changes apply instantly across the terminal."
                )}
              </p>
              <ThemeAppearancePicker variant="grid" showHeading />
            </div>
          </Section>
        ) : null}

        {/* Display preferences */}
        <Section
          title={t("profile.section_preferences", "Display")}
          badge={
            savingPreferences ? (
              <span className="text-[12px] text-text-muted">Saving…</span>
            ) : null
          }
        >
          <div className="p-5">
            <p className="mb-4 text-[13px] leading-relaxed text-text-muted">
              {t(
                "profile.preferences_desc",
                "Show local currency next to USDT on signals and charts."
              )}
            </p>
            <CountryCurrencyPicker
              country={user?.country_code || null}
              currency={user?.currency_code || "USD"}
              supportedCurrencies={supported}
              onCountryChange={handleCountryChange}
              onCurrencyChange={handleCurrencyChange}
              disabled={savingPreferences}
            />
            {showLocal && btcPrice ? (
              <div className="mt-4 rounded-xl border border-ink/[0.08] bg-ink/[0.02] px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
                  BTC preview
                </p>
                <p className="mt-1 font-mono text-[15px] tabular-nums text-text-primary">
                  ${btcPrice.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                  <span className="mx-2 text-text-muted/40">≈</span>
                  <span className="text-accent">
                    {btcLocal != null ? formatLocalPrice(btcLocal, user.currency_code) : "—"}
                  </span>
                </p>
              </div>
            ) : null}
          </div>
        </Section>

        {/* Connections */}
        <Section title={t("profile.section_connections", "Connected accounts")}>
          <div className="divide-y divide-ink/[0.06] px-2 py-1">
            <ConnectionRow
              icon={
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
              }
              name="Google"
              linked={isGoogleLinked}
              detail={
                isGoogleLinked
                  ? t("profile.connected", "Connected")
                  : t("profile.not_connected", "Not connected")
              }
              onLink={handleLinkGoogle}
              onUnlink={handleUnlinkGoogle}
              linking={linkingGoogle}
              canUnlink
              linkLabel={t("profile.link", "Link")}
              unlinkLabel={t("profile.unlink", "Unlink")}
            />
            <ConnectionRow
              icon={
                <svg className="h-4 w-4 text-brand-telegram" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                </svg>
              }
              name="Telegram"
              linked={isTelegramLinked}
              detail={
                isTelegramLinked
                  ? `@${connections?.telegram?.username || "connected"}`
                  : t("profile.not_connected", "Not connected")
              }
              onLink={handleLinkTelegram}
              linking={linkingTelegram}
              canUnlink={false}
              linkLabel={
                isTelegramLinked ? t("profile.replace", "Replace") : t("profile.link", "Link")
              }
              replaceMode={isTelegramLinked}
            />
            <ConnectionRow
              icon={
                <svg className="h-4 w-4" fill="#5865F2" viewBox="0 0 24 24">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z" />
                </svg>
              }
              name="Discord"
              linked={isDiscordLinked}
              detail={
                isDiscordLinked
                  ? `@${connections?.discord?.username || "connected"}`
                  : t("profile.not_connected", "Not connected")
              }
              onLink={handleLinkDiscord}
              onUnlink={handleUnlinkDiscord}
              linking={linkingDiscord}
              canUnlink
              linkLabel={t("profile.link", "Link")}
              unlinkLabel={t("profile.unlink", "Unlink")}
            />
          </div>
        </Section>

        <VipGroupCard onToast={showToast} />
      </div>

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────

const Section = ({ title, badge, children, id }) => (
  <section
    id={id}
    className="scroll-mt-24 overflow-hidden rounded-2xl border border-ink/[0.08] bg-surface-raised"
  >
    <div className="flex items-center justify-between border-b border-ink/[0.06] px-5 py-3.5">
      <h2 className="text-[15px] font-semibold tracking-tight text-text-primary">{title}</h2>
      {badge}
    </div>
    {children}
  </section>
);

const Field = ({ label, children }) => (
  <div>
    <label className="mb-1.5 block text-[13px] font-medium text-text-primary">{label}</label>
    {children}
  </div>
);

const ConnectionRow = ({
  icon,
  name,
  linked,
  detail,
  onLink,
  onUnlink,
  linking,
  canUnlink,
  linkLabel,
  unlinkLabel,
  replaceMode,
}) => (
  <div className="flex items-center justify-between gap-3 px-3 py-3.5">
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink/[0.04]">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[14px] font-medium text-text-primary">{name}</p>
        <p
          className={`mt-0.5 truncate text-[12px] ${
            linked ? "text-profit" : "text-text-muted"
          }`}
        >
          {detail}
        </p>
      </div>
    </div>
    <div className="flex shrink-0 gap-1.5">
      {linked && canUnlink ? (
        <button
          type="button"
          onClick={onUnlink}
          className="rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-loss transition-colors hover:bg-loss/10"
        >
          {unlinkLabel}
        </button>
      ) : null}
      {!linked || replaceMode ? (
        <button
          type="button"
          onClick={onLink}
          disabled={linking}
          className="rounded-lg border border-ink/[0.1] bg-surface-secondary px-3 py-1.5 text-[12px] font-medium text-text-primary transition-colors hover:border-ink/20 disabled:opacity-50"
        >
          {linking ? "…" : linkLabel}
        </button>
      ) : null}
    </div>
  </div>
);

export default ProfilePage;
