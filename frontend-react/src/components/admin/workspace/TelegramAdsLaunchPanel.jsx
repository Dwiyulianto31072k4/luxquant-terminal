import { useMemo, useState } from "react";

import {
  buildTelegramMiniAppUrl,
  buildTelegramStartParam,
  buildTelegramWebCampaignUrl,
  telegramCampaignSlug,
} from "../../../utils/telegramCampaign";
import {
  TELEGRAM_AD_CAMPAIGN,
  TELEGRAM_AD_CREATIVES,
  TELEGRAM_AD_PLACEMENTS,
} from "../../../utils/telegramAdsLaunchPlan";

const number = (value) => Number(value || 0).toLocaleString("en-US");

const CopyButton = ({ value, copied, onCopy, label = "Copy" }) => (
  <button
    type="button"
    onClick={() => onCopy(value)}
    className="shrink-0 rounded-lg border border-ink/[0.09] bg-surface-raised px-2.5 py-1.5 text-[10px] font-semibold text-text-secondary transition-colors hover:bg-ink/[0.05] hover:text-text-primary"
  >
    {copied === value ? "Copied" : label}
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
  const [campaign, setCampaign] = useState(TELEGRAM_AD_CAMPAIGN);
  const [creative, setCreative] = useState(TELEGRAM_AD_CREATIVES[0].id);
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
    return {
      startParam,
      miniApp,
      web: buildTelegramWebCampaignUrl({
        campaign: campaignSlug,
        content: creativeSlug,
      }),
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
          label="Web campaign · public proof"
          value={links.web}
          copied={copied}
          onCopy={copy}
        />
      </div>

      <p className="mt-2 text-[10.5px] leading-relaxed text-text-muted">
        Signed payload <code className="text-text-secondary">{links.startParam}</code> carries
        campaign and creative through Telegram, signs the user in inside the Mini App, and routes to
        the full performance hub. The web companion shows the public verified track record before
        asking for sign-in.
      </p>

      <div className="mt-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-primary">
              Launch-ready creative pack
            </p>
            <p className="mt-1 text-[10.5px] text-text-muted">
              Six policy-safe angles · each message is under Telegram&apos;s 160-character limit.
            </p>
          </div>
          <span className="rounded-full border border-profit/20 bg-profit/[0.07] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider text-profit">
            Proof-first · no profit claims
          </span>
        </div>

        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {TELEGRAM_AD_CREATIVES.map((item) => {
            const url = buildTelegramMiniAppUrl({
              medium: "paid_social",
              campaign,
              content: item.id,
            });
            const selected = creative === item.id;
            return (
              <div
                key={item.id}
                className={`rounded-xl border p-3 transition-colors ${
                  selected
                    ? "border-accent/30 bg-accent/[0.055]"
                    : "border-ink/[0.07] bg-surface-secondary/30"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <button type="button" onClick={() => setCreative(item.id)} className="text-left">
                    <span className="text-[11px] font-semibold text-text-primary">
                      {item.angle}
                    </span>
                    <span className="ml-2 font-mono text-[9px] text-text-muted">{item.id}</span>
                  </button>
                  <span className="font-mono text-[9px] tabular-nums text-text-muted">
                    {item.text.length}/160
                  </span>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-text-secondary">{item.text}</p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <CopyButton value={item.text} copied={copied} onCopy={copy} label="Copy text" />
                  <CopyButton value={url} copied={copied} onCopy={copy} label="Copy URL" />
                  <button
                    type="button"
                    onClick={() => setCreative(item.id)}
                    className="rounded-lg px-2.5 py-1.5 text-[10px] font-semibold text-accent hover:bg-accent/[0.07]"
                  >
                    Use creative
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="overflow-hidden rounded-xl border border-ink/[0.07]">
          <div className="border-b border-ink/[0.06] bg-surface-secondary/50 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-primary">
              Placement shortlist · English
            </p>
            <p className="mt-0.5 text-[9.5px] text-text-muted">
              Validate availability in Telegram Ads; subscriber snapshots checked Aug 2026.
            </p>
          </div>
          <div className="divide-y divide-ink/[0.05]">
            {TELEGRAM_AD_PLACEMENTS.map((placement) => (
              <div
                key={placement.handle}
                className="grid gap-1 px-3 py-2.5 sm:grid-cols-[124px_1fr_54px_60px] sm:items-center"
              >
                <button
                  type="button"
                  onClick={() => copy(placement.handle)}
                  className="text-left font-mono text-[10.5px] font-semibold text-accent"
                >
                  {copied === placement.handle ? "Copied" : placement.handle}
                </button>
                <span className="text-[10px] text-text-secondary">{placement.audience}</span>
                <span className="font-mono text-[9.5px] tabular-nums text-text-muted">
                  {placement.snapshot}
                </span>
                <span className="text-[9px] font-semibold uppercase tracking-wide text-text-muted">
                  Tier {placement.priority}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-ink/[0.07] bg-surface-secondary/30 p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-primary">
            Pilot guardrails
          </p>
          <ol className="mt-2.5 space-y-2 text-[10.5px] leading-relaxed text-text-secondary">
            <li>1. Create one ad per creative and keep budget equal.</li>
            <li>2. Start at the platform CPM floor; raise only where delivery is zero.</li>
            <li>3. Stop after 1,500 views with no bot starts, or 10 starts with no signup.</li>
            <li>4. Scale by proof verification, watch/alert activation, paid users and revenue.</li>
            <li>5. Never optimize from clicks or Telegram joins alone.</li>
          </ol>
          <p className="mt-3 rounded-lg bg-ink/[0.035] px-2.5 py-2 text-[9.5px] leading-relaxed text-text-muted">
            Language must match the placement and destination. This first pack is English because
            the Mini App destination is English-first.
          </p>
        </div>
      </div>

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
                  <td className="px-3 py-2 text-right tabular-nums">
                    {number(row.activated_users)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{number(row.invoice_users)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-profit">
                    {number(row.paid_users)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    ${number(Math.round(row.revenue_usdt || 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-ink/[0.07] bg-surface-secondary/30 px-3 py-2.5 text-[10.5px] text-text-muted">
          No paid Telegram cohort yet. Copy one generated link above; results will appear here from
          signup through confirmed revenue.
        </p>
      )}
    </div>
  );
};

export default TelegramAdsLaunchPanel;
