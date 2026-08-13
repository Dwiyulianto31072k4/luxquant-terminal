// src/components/account/AccountLayout.jsx
// ════════════════════════════════════════════════════════════════
// One shell for everything behind the avatar menu — as a dialog, not a page.
//
// These five destinations were five unrelated pages: Profile capped at
// max-w-6xl, Notifications at max-w-[1400px], Watchlist uncapped, API Keys
// switching between max-w-2xl and max-w-6xl — and no way to get from one to
// the next without going back up to the avatar dropdown every time.
//
// They are now one settings dialog over the app, the pattern Grok, Linear and
// Slack all use for the same job. Settings are a detour, not a destination:
// keeping the terminal visible behind the scrim says "you are still where you
// were", and closing returns you there instead of leaving you on an orphan
// page wondering how to get back.
//
// Routing is unchanged — /profile, /notifications, /watchlist, /api-keys and
// /pricing still resolve on their own. This only changes what they look like
// once AppShell has rendered them.
// ════════════════════════════════════════════════════════════════
import { useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useDialog } from "../../hooks/useDialog";

const Icon = {
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
    </>
  ),
  billing: (
    <>
      <rect width="18" height="13" x="3" y="6" rx="2" />
      <path d="M3 11h18" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
      <path d="M10.3 21a2 2 0 0 0 3.4 0" />
    </>
  ),
  star: <path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6.1L12 16.8 6.7 19.7l1.1-6.1L3.4 9.4l6-.8z" />,
  key: (
    <>
      <circle cx="7.5" cy="15.5" r="3.5" />
      <path d="m10 13 8-8 3 3-2 2-2-2-2 2 2 2-3 3" />
    </>
  ),
};

// Subscription points at /pricing — it is the same destination the avatar menu
// uses, and plans live there rather than in a settings pane of their own.
const ITEMS = [
  { path: "/profile", label: "Profile", icon: Icon.profile },
  { path: "/account/subscription", label: "Subscription", icon: Icon.billing },
  { path: "/notifications", label: "Notifications", icon: Icon.bell },
  { path: "/watchlist", label: "Watchlist", icon: Icon.star },
  { path: "/api-keys", label: "API Keys", icon: Icon.key },
];

// Grouped by what the setting is about, so a destination is found by category
// rather than scanned out of five equal-weight items. Every group describes
// routes that already exist — none was invented to fill a heading.
const GROUPS = [
  { title: "General", paths: ["/profile", "/notifications"] },
  { title: "Payments", paths: ["/account/subscription"] },
  { title: "Data & tools", paths: ["/watchlist", "/api-keys"] },
];

const Glyph = ({ children }) => (
  <svg
    viewBox="0 0 24 24"
    className="h-[15px] w-[15px] shrink-0"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);

export function AccountLayout({ children }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const dialogRef = useRef(null);
  const isOn = (p) => pathname === p || pathname.startsWith(p + "/");

  // Back if there is somewhere to go back to, home otherwise — a dialog opened
  // from a deep link has no history to return into.
  const close = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };

  // Escape, background scroll lock, focus trap and focus restore.
  useDialog({ isOpen: true, onClose: close, ref: dialogRef });

  const NavButton = ({ it }) => (
    <button
      onClick={() => navigate(it.path)}
      aria-current={isOn(it.path) ? "page" : undefined}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] transition-colors ${
        isOn(it.path)
          ? "bg-ink/[0.07] font-medium text-text-primary"
          : "text-text-secondary hover:bg-ink/[0.03] hover:text-text-primary"
      }`}
    >
      <Glyph>{it.icon}</Glyph>
      {it.label}
    </button>
  );

  return (
    <div
      className="lq-modal-safe fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Account settings"
    >
      <button
        type="button"
        aria-label="Close settings"
        onClick={close}
        className="lq-scrim absolute inset-0 bg-scrim/60 backdrop-blur-sm"
      />

      <div
        ref={dialogRef}
        className="relative flex w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border border-ink/[0.08] bg-surface-raised shadow-2xl sm:rounded-2xl"
        style={{ height: "min(86vh, 780px)" }}
      >
        {/* ── mobile: tab strip, since a rail would eat half the width ── */}
        <div className="flex items-center gap-2 border-b border-ink/[0.07] px-3 py-2.5 lg:hidden">
          <nav
            aria-label="Account"
            className="-mx-1 flex flex-1 gap-1 overflow-x-auto px-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {ITEMS.map((it) => (
              <button
                key={it.path}
                onClick={() => navigate(it.path)}
                aria-current={isOn(it.path) ? "page" : undefined}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] transition-colors ${
                  isOn(it.path)
                    ? "bg-ink/[0.07] font-medium text-text-primary"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                <Glyph>{it.icon}</Glyph>
                {it.label}
              </button>
            ))}
          </nav>
          <CloseButton onClick={close} />
        </div>

        <div className="flex min-h-0 flex-1">
          {/* ── desktop: grouped rail inside the dialog ── */}
          <nav
            aria-label="Account"
            className="hidden w-52 shrink-0 flex-col gap-5 overflow-y-auto border-r border-ink/[0.07] p-4 lg:flex"
            style={{ background: "rgb(var(--surface-secondary) / 0.5)" }}
          >
            {GROUPS.map((g) => (
              <div key={g.title}>
                <p className="mb-1 px-3 text-[11px] font-medium text-text-muted/80">{g.title}</p>
                <div className="space-y-0.5">
                  {g.paths
                    .map((path) => ITEMS.find((i) => i.path === path))
                    .filter(Boolean)
                    .map((it) => (
                      <NavButton key={it.path} it={it} />
                    ))}
                </div>
              </div>
            ))}
          </nav>

          {/* ── the pane ── */}
          <div className="relative flex min-w-0 flex-1 flex-col">
            {/* Its own row, not an overlay: the previous version floated the
                close button over the content with a negative margin, which
                landed on top of whatever a page put in its top-right corner
                (Watchlist puts "Starred signals" there). A bar that occupies
                real space cannot collide with anything. */}
            <div className="hidden shrink-0 items-center justify-end border-b border-ink/[0.07] px-4 py-2.5 lg:flex">
              <CloseButton onClick={close} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 lg:px-8 lg:py-6">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const CloseButton = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label="Close"
    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-ink/[0.06] hover:text-text-primary"
  >
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  </button>
);

export default AccountLayout;
