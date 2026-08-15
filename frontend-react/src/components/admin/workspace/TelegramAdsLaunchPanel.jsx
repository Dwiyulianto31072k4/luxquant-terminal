import { useMemo, useState } from "react";

import {
  buildTelegramMiniAppUrl,
  buildTelegramStartParam,
  telegramCampaignSlug,
} from "../../../utils/telegramCampaign";

const number = (value) => Number(value || 0).toLocaleString("en-US");

const CopyButton = ({ value, copied, onCopy }) => (
  <button
    type="button"
    onClick={() => onCopy(value)}
    className="shrink-0 rounded-lg border border-ink/[0.09] bg-surface-raised px-2.5 py-1.5 text-[10px] font-semibold text-text-secondary transition-colors hover:bg-ink/[0.05] hover:text-text-primary"
  >
    {copied === value ? "Copied" : "Copy"}
  </button>
);

const LinkRow = ({ label, value, copied, onCopy }) => (
  <div className="rounded-xl border border-ink/[0.07] bg-surface-secondary/40 p-3">
    <p className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">{label}</p>
    <div className="mt-1.5 flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md bg-ink/[0.04] px-2 py-1.5 text-[10px] text-text-primary">
        {value}
      </code>
      <CopyButton value={value} copied={copied} onCopy={onCopy} />
    </div>
  </div>
);

const TelegramAdsLaunchPanel = ({ rows = [] }) => {
  const [campaign, setCampaign] = useState("proof-scale");
  const [creative, setCreative] = useState("proof-a");
  const [copied, setCopied] = useState(null);

  const links = useMemo(() => {
    const campaignSlug = telegramCampaignSlug(campaign, "campaign");
    const creativeSlug = telegramCampaignSlug(creative, "creative");
    const startParam = buildTelegramStartParam({
      medium: "paid_social",
      campaign: campaignSlug,
      content: creativeSlug,
    });
    const miniApp = buildTelegramMiniAppUrl({
      medium: "paid_social",
      campaign: campaignSlug,
      content: creativeSlug,
    });
    const query = new URLSearchParams({
      utm_source: "telegram",
      utm_medium: "paid_social",
      utm_campaign: campaignSlug,
      utm_content: creativeSlug,
    });
    return {
      startParam,
      miniApp,
      web: `https://luxquant.tw/performance?${query.toString()}`,
    };
  }, [campaign, creative]);

  const copy = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  };

  const paidRows = rows.filter(
    (row) =>
      String(row.source || "").toLowerCase() === "telegram" &&
      String(row.medium || "").toLowerCase() === "paid_social"
  );

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Campaign
          <input
            value={campaign}
            onChange={(event) => setCampaign(event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-ink/[0.09] bg-surface-raised px-3 py-2 text-[12px] font-medium normal-case tracking-normal text-text-primary outline-none focus:border-accent/40"
            placeholder="proof-scale"
          />
        </label>
        <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Creative
          <input
            value={creative}
            onChange={(event) => setCreative(event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-ink/[0.09] bg-surface-raised px-3 py-2 text-[12px] font-medium normal-case tracking-normal text-text-primary outline-none focus:border-accent/40"
            placeholder="proof-a"
          />
        </label>
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        <LinkRow
          label="Telegram Ads / Mini App · primary"
          value={links.miniApp}
          copied={copied}
          onCopy={copy}
        />
        <LinkRow
          label="Web campaign · alternate"
          value={links.web}
          copied={copied}
          onCopy={copy}
        />
      </div>

      <p className="mt-2 text-[10.5px] leading-relaxed text-text-muted">
        Signed payload <code className="text-text-secondary">{links.startParam}</code> carries
        campaign and creative through Telegram, signs the user in inside the Mini App, and lands on
        proof at <span className="font-medium text-text-secondary">/performance</span>.
      </p>

      {paidRows.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-xl border border-ink/[0.07]">
          <table className="w-full min-w-[560px] text-left text-[11px]">
            <thead className="bg-surface-secondary/60 text-[9px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-3 py-2 font-semibold">Campaign</th>
                <th className="px-3 py-2 text-right font-semibold">Signup</th>
                <th className="px-3 py-2 text-right font-semibold">Activated</th>
                <th className="px-3 py-2 text-right font-semibold">Invoice</th>
                <th className="px-3 py-2 text-right font-semibold">Paid</th>
                <th className="px-3 py-2 text-right font-semibold">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {paidRows.slice(0, 12).map((row) => (
                <tr
                  key={`${row.medium}:${row.campaign}`}
                  className="border-t border-ink/[0.05] text-text-primary"
                >
                  <td className="px-3 py-2 font-medium">{row.campaign}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{number(row.signups)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{number(row.activated_users)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{number(row.invoice_users)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-profit">{number(row.paid_users)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">${number(Math.round(row.revenue_usdt || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-ink/[0.07] bg-surface-secondary/30 px-3 py-2.5 text-[10.5px] text-text-muted">
          No paid Telegram cohort yet. Copy one generated link above; results will appear here from signup through confirmed revenue.
        </p>
      )}
    </div>
  );
};

export default TelegramAdsLaunchPanel;
