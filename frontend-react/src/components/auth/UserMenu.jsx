// src/components/auth/UserMenu.jsx
// Compact avatar menu: short list; Appearance is a nested panel (admin-gated).

import { useState, useRef, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import HelpSupportModal from "../HelpSupportModal";
import { ThemeAppearancePicker } from "../ThemeToggle";
import api from "../../services/authApi";

const UserMenu = () => {
  const { t } = useTranslation();
  const { user, logout, isAuthenticated } = useAuth();
  const { canSwitchTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [panel, setPanel] = useState("root"); // 'root' | 'appearance'
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [vipBusy, setVipBusy] = useState(false);
  const [vipToast, setVipToast] = useState(null);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        handleClose();
      }
    };
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
      setPanel("root");
    }, 140);
  };

  const handleToggle = () => {
    if (isOpen) handleClose();
    else {
      setPanel("root");
      setIsOpen(true);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={() => navigate("/login")}
          className="rounded-lg border border-ink/12 px-2.5 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-ink/[0.04] sm:px-3 sm:text-sm"
        >
          {t("userMenu.login")}
        </button>
        <button
          type="button"
          onClick={() => navigate("/register")}
          className="hidden rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90 sm:block"
        >
          {t("userMenu.register")}
        </button>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    handleClose();
    navigate("/");
  };

  const go = (path) => {
    navigate(path);
    handleClose();
  };

  const role = user?.role || "free";
  const isStaff = role === "admin" || role === "co_admin" || role === "founder";
  const isPaid = isStaff || role === "premium" || role === "subscriber";
  const initial = user?.username?.charAt(0).toUpperCase() || "U";
  const avatarUrl = !avatarBroken && user?.avatar_url ? user.avatar_url : null;
  const telegramLinked = !!user?.telegram_id;
  const inVipGroup = !!user?.telegram_in_group;

  const showVipToast = (msg) => {
    setVipToast(msg);
    setTimeout(() => setVipToast(null), 2200);
  };

  const handleJoinVip = async () => {
    if (!isPaid) {
      go("/pricing");
      return;
    }
    if (!telegramLinked) {
      go("/profile");
      return;
    }
    if (inVipGroup) {
      go("/profile");
      return;
    }
    setVipBusy(true);
    try {
      const res = await api.post("/api/v1/auth/telegram/join-vip");
      if (res.data?.already_member) {
        showVipToast(t("userMenu.vip_member"));
        return;
      }
      const link = res.data?.invite_link;
      if (link) {
        showVipToast(t("userMenu.vip_joining"));
        window.location.href = link;
      } else {
        showVipToast(t("vip.link_failed", "Could not get invite link."));
      }
    } catch (err) {
      const msg = err.response?.data?.detail;
      showVipToast(typeof msg === "string" ? msg : t("vip.join_failed", "Failed to join VIP group."));
    } finally {
      setVipBusy(false);
    }
  };

  const vipHint = !isPaid
    ? t("userMenu.vip_hint_free")
    : inVipGroup
      ? t("userMenu.vip_member")
      : !telegramLinked
        ? t("userMenu.vip_hint_link")
        : t("userMenu.vip_hint");

  const roleChip = isStaff
    ? t("userMenu.plan_admin", { defaultValue: "Admin" })
    : isPaid
      ? t("userMenu.plan_premium", { defaultValue: "Premium" })
      : t("userMenu.plan_free", { defaultValue: "Free" });

  return (
    <div className="relative" ref={menuRef}>
      <style>{`
        @keyframes umIn {
          from { opacity: 0; transform: translateY(-6px) scale(.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes umOut {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to { opacity: 0; transform: translateY(-6px) scale(.98); }
        }
        .um-enter { animation: umIn .16s cubic-bezier(.16,1,.3,1) forwards; }
        .um-exit { animation: umOut .12s ease forwards; }
      `}</style>

      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border transition-all ${
          isOpen
            ? "border-ink/20 ring-2 ring-ink/10"
            : "border-ink/10 hover:border-ink/20"
        }`}
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
          <span className="flex h-full w-full items-center justify-center bg-surface-secondary text-[13px] font-semibold text-text-primary">
            {initial}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="menu"
          className={`absolute right-0 z-50 mt-2 w-[280px] overflow-hidden rounded-2xl border border-ink/[0.08] bg-surface-raised shadow-[0_16px_48px_rgb(var(--scrim)/0.28)] ${
            isClosing ? "um-exit" : "um-enter"
          }`}
        >
          {panel === "appearance" ? (
            <>
              <div className="flex items-center gap-1 border-b border-ink/[0.06] px-2 py-2">
                <button
                  type="button"
                  onClick={() => setPanel("root")}
                  className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[13px] font-medium text-text-primary transition-colors hover:bg-ink/[0.05]"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  {t("userMenu.appearance", { defaultValue: "Appearance" })}
                </button>
              </div>
              <div className="max-h-[min(60vh,360px)] overflow-y-auto px-2 py-2">
                <ThemeAppearancePicker showHeading={false} variant="list" />
              </div>
            </>
          ) : (
            <>
              {/* Identity — compact */}
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-ink/[0.08] bg-surface-secondary">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                      onError={() => setAvatarBroken(true)}
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-[13px] font-semibold text-text-primary">
                      {initial}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-[13.5px] font-semibold tracking-tight text-text-primary">
                      {user?.username || "User"}
                    </p>
                    <span className="shrink-0 rounded-md bg-ink/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                      {roleChip}
                    </span>
                  </div>
                  {user?.email ? (
                    <p className="mt-0.5 truncate text-[11.5px] text-text-muted">{user.email}</p>
                  ) : null}
                </div>
              </div>

              <div className="mx-3 h-px bg-ink/[0.06]" />

              <div className="p-1.5">
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleJoinVip}
                  disabled={vipBusy}
                  className="mb-0.5 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-ink/[0.05] disabled:opacity-60"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#229ED9]/12 text-[#229ED9]">
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium text-text-primary">
                      {inVipGroup ? t("userMenu.vip_member") : t("userMenu.vip_join")}
                    </span>
                    <span className="mt-0.5 block truncate text-[11.5px] leading-snug text-text-muted">
                      {vipHint}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                      inVipGroup
                        ? "bg-profit/12 text-profit"
                        : !isPaid
                          ? "bg-accent/15 text-accent"
                          : "bg-[#229ED9]/12 text-[#229ED9]"
                    }`}
                  >
                    {vipBusy
                      ? "…"
                      : inVipGroup
                        ? t("userMenu.vip_joined_badge")
                        : !isPaid
                          ? t("userMenu.upgrade_badge")
                          : t("userMenu.vip_cta")}
                  </span>
                </button>

                {vipToast ? (
                  <p className="px-3 pb-1.5 text-[11px] text-text-muted">{vipToast}</p>
                ) : null}

                <Row
                  label={t("userMenu.profile_settings", { defaultValue: "Profile" })}
                  onClick={() => go("/profile")}
                />
                {canSwitchTheme ? (
                  <Row
                    label={t("userMenu.appearance", { defaultValue: "Appearance" })}
                    onClick={() => setPanel("appearance")}
                    trailing={
                      <svg className="h-4 w-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    }
                  />
                ) : null}
                <Row
                  label={t("userMenu.subs_billing", { defaultValue: "Subscription" })}
                  onClick={() => go("/pricing")}
                  trailing={
                    !isPaid ? (
                      <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                        {t("userMenu.upgrade_badge", { defaultValue: "Upgrade" })}
                      </span>
                    ) : null
                  }
                />
                <Row
                  label={t("userMenu.notif", { defaultValue: "Notifications" })}
                  onClick={() => go("/notifications")}
                />
                <Row
                  label={t("userMenu.my_watchlist", { defaultValue: "Watchlist" })}
                  onClick={() => go("/watchlist")}
                />
                <Row
                  label={t("userMenu.help_support", { defaultValue: "Help" })}
                  onClick={() => {
                    handleClose();
                    setShowHelpModal(true);
                  }}
                />
                {isPaid ? (
                  <Row
                    label={t("userMenu.api_keys", { defaultValue: "API Keys" })}
                    onClick={() => go("/api-keys")}
                  />
                ) : null}
              </div>

              <div className="mx-3 h-px bg-ink/[0.06]" />

              <div className="p-1.5">
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogout}
                  className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-[13.5px] font-medium text-loss transition-colors hover:bg-loss/10"
                >
                  {t("userMenu.logout", { defaultValue: "Log out" })}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <HelpSupportModal isOpen={showHelpModal} onClose={() => setShowHelpModal(false)} />
    </div>
  );
};

function Row({ label, onClick, trailing }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-medium text-text-primary transition-colors hover:bg-ink/[0.05]"
    >
      <span>{label}</span>
      {trailing}
    </button>
  );
}

export default UserMenu;
