// src/components/account/AccountLayout.jsx
// ════════════════════════════════════════════════════════════════
// One shell for everything behind the avatar menu.
//
// These five destinations were five unrelated pages: Profile capped at
// max-w-6xl, Notifications at max-w-[1400px], Watchlist uncapped, API Keys
// switching between max-w-2xl and max-w-6xl — and no way to get from one to
// the next without going back up to the avatar dropdown every time.
//
// Coinbase's account area is the reference: the handful of settings a person
// actually returns to sit together under persistent sub-navigation, and the
// long tail lives one level down. So: a sticky rail on desktop, a scrollable
// tab strip on mobile, and a single measure across all of them.
// ════════════════════════════════════════════════════════════════
import { useNavigate, useLocation } from "react-router-dom";

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
  { path: "/pricing", label: "Subscription", icon: Icon.billing },
  { path: "/notifications", label: "Notifications", icon: Icon.bell },
  { path: "/watchlist", label: "Watchlist", icon: Icon.star },
  { path: "/api-keys", label: "API Keys", icon: Icon.key },
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
  const isOn = (p) => pathname === p || pathname.startsWith(p + "/");

  return (
    <div className="mx-auto w-full max-w-6xl">
      {/* ── mobile: scrollable tab strip ── */}
      <nav
        aria-label="Account"
        className="-mx-3 mb-5 flex gap-1 overflow-x-auto px-3 lg:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {ITEMS.map((it) => (
          <button
            key={it.path}
            onClick={() => navigate(it.path)}
            aria-current={isOn(it.path) ? "page" : undefined}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors ${
              isOn(it.path)
                ? "border-accent/40 bg-accent/[0.1] text-accent"
                : "border-ink/[0.07] text-text-muted hover:text-text-primary"
            }`}
          >
            <Glyph>{it.icon}</Glyph>
            {it.label}
          </button>
        ))}
      </nav>

      <div className="flex gap-8">
        {/* ── desktop: sticky rail ── */}
        <nav
          aria-label="Account"
          className="hidden w-48 shrink-0 lg:block"
          style={{ position: "sticky", top: 88, alignSelf: "flex-start" }}
        >
          <p className="mb-3 px-3 font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted">
            Account
          </p>
          <div className="space-y-0.5">
            {ITEMS.map((it) => (
              <button
                key={it.path}
                onClick={() => navigate(it.path)}
                aria-current={isOn(it.path) ? "page" : undefined}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${
                  isOn(it.path)
                    ? "bg-accent/[0.1] text-accent shadow-[inset_2px_0_0_rgb(var(--accent))]"
                    : "text-text-secondary hover:bg-ink/[0.03] hover:text-text-primary"
                }`}
              >
                <Glyph>{it.icon}</Glyph>
                {it.label}
              </button>
            ))}
          </div>
        </nav>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

export default AccountLayout;
