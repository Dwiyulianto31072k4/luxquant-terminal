import { useState } from "react";
import AccountsOverview from "./AccountsOverview";
import ConfigurationStudio from "./ConfigurationStudio";
import TelegramAlertsCard from "./TelegramAlertsCard";
import { BinanceIcon, TelegramIcon, SettingsIcon } from "./BrandIcons";

const SECTIONS = [
  {
    id: "strategy",
    label: "Trading & risk",
    description: "Markets, sizing, exits and portfolio limits",
    icon: SettingsIcon,
  },
  {
    id: "connections",
    label: "Connections",
    description: "Binance API credentials and account health",
    icon: BinanceIcon,
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Telegram delivery and alert preferences",
    icon: TelegramIcon,
  },
];

export default function AutoTradeSettings({
  section,
  onSectionChange,
  config,
  hasConnectedAccount,
  onSaved,
  user,
  health,
  exchangeAccounts,
  portfolio,
  onConnect,
  alertStatus,
  alertStatusError,
  onAlertUpdated,
}) {
  const [internalSection, setInternalSection] = useState("strategy");
  const activeSection = section || internalSection;
  const changeSection = (next) => {
    setInternalSection(next);
    onSectionChange?.(next);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="h-fit rounded-md border border-ink/[0.06] bg-surface-raised p-2 lg:sticky lg:top-24">
        <div className="px-3 pb-2 pt-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">
            AutoTrade Settings
          </p>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            Configuration changes apply to future execution jobs.
          </p>
        </div>
        <nav className="mt-2 space-y-1">
          {SECTIONS.map((item) => {
            const Icon = item.icon;
            const active = item.id === activeSection;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => changeSection(item.id)}
                className={`flex w-full items-start gap-3 rounded-md px-3 py-3 text-left transition-colors ${
                  active
                    ? "bg-gold-primary/[0.09] text-gold-primary"
                    : "text-text-muted hover:bg-ink/[0.03] hover:text-text-primary"
                }`}
              >
                <Icon className="mt-0.5 h-5 w-5 flex-shrink-0" />
                <span>
                  <span className="block text-sm font-medium">{item.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-text-muted">
                    {item.description}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0">
        {activeSection === "strategy" ? (
          <ConfigurationStudio
            config={config}
            hasConnectedAccount={hasConnectedAccount}
            onSaved={onSaved}
          />
        ) : null}
        {activeSection === "connections" ? (
          <AccountsOverview
            user={user}
            health={health}
            exchangeAccounts={exchangeAccounts}
            portfolio={portfolio}
            onConnect={onConnect}
          />
        ) : null}
        {activeSection === "notifications" ? (
          <TelegramAlertsCard
            status={alertStatus}
            loadError={alertStatusError}
            onUpdated={onAlertUpdated}
          />
        ) : null}
      </div>
    </div>
  );
}
