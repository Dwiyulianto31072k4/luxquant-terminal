// What the numbers actually say — computed, not written by hand.
//
// The first version of this page drew ten bars of the ten worst symbols. In
// production those ten are −$17 to −$27 each, one to four trades apiece: ten
// near-identical bars that look like a chart and carry no finding. The real
// shape of this desk's loss is concentration — two days, one account, one exit
// reason — and concentration is a part-to-whole question, not a ranking one.
//
// Every figure here is a SHARE OF THE NET LOSS, with the arithmetic in one
// place so the sentence under a bar can never drift from the bar.

import { fmtDay, num } from "./agentMetrics";

/** The n worst days and what share of the net loss they are. */
export function worstDays(curve, n = 2) {
  const rows = (Array.isArray(curve) ? curve : []).filter((r) => r && r.day && num(r.pnl) !== null);
  if (rows.length < 3) return null;
  const net = rows.reduce((a, r) => a + num(r.pnl), 0);
  if (net >= 0) return null; // nothing to explain
  const worst = [...rows].sort((a, b) => num(a.pnl) - num(b.pnl)).slice(0, n);
  const sum = worst.reduce((a, r) => a + num(r.pnl), 0);
  if (sum >= 0) return null;
  return {
    days: worst.map((r) => ({ day: r.day, pnl: num(r.pnl), btc: num(r.btc_change_pct) })),
    sum,
    share: Math.min(100, (100 * Math.abs(sum)) / Math.abs(net)),
    of: rows.length,
  };
}

/** The account carrying the most money, and its share of the net. */
export function topAccount(leaderboard, net) {
  const rows = (leaderboard || []).filter((r) => num(r.net) !== null);
  if (rows.length < 2 || !net) return null;
  const top = [...rows].sort((a, b) => Math.abs(num(b.net)) - Math.abs(num(a.net)))[0];
  const tradesAll = rows.reduce((a, r) => a + (num(r.trades) || 0), 0);
  return {
    row: top,
    share: Math.min(100, (100 * Math.abs(num(top.net))) / Math.abs(net)),
    tradeShare: tradesAll ? (100 * (num(top.trades) || 0)) / tradesAll : null,
    accounts: rows.length,
  };
}

/** Exit reasons as shares of trades, with the two that matter pulled out:
 *  what the losses were closed by, and how much of the book we cannot
 *  attribute at all. */
export function exitShape(byExitReason, grossLost = null) {
  const rows = (byExitReason || []).filter((r) => (num(r.trades) || 0) > 0);
  if (!rows.length) return null;
  const trades = rows.reduce((a, r) => a + num(r.trades), 0);
  const withShare = rows.map((r) => ({
    ...r,
    share: (100 * num(r.trades)) / trades,
    unattributed: !r.key || r.key === "exchange_close",
  }));
  const find = (k) => withShare.find((r) => r.key === k);
  return {
    rows: withShare.sort((a, b) =>
      a.unattributed !== b.unattributed ? a.unattributed - b.unattributed : b.trades - a.trades
    ),
    trades,
    stopped: find("stop_loss") || null,
    target: find("take_profit") || null,
    // Of every dollar the desk lost, how much left through a stop. Its own
    // denominator, named wherever it is shown.
    stopShareOfLoss: (() => {
      const stop = find("stop_loss");
      const lost = Math.abs(num(grossLost) ?? 0);
      return stop && lost ? Math.min(100, (100 * Math.abs(num(stop.net) || 0)) / lost) : null;
    })(),
    unattributed: withShare.filter((r) => r.unattributed).reduce((a, r) => a + r.share, 0),
  };
}

/** The whole finding, ordered by how much of the loss each line explains.
 *  Returns [] when the desk is up — there is nothing to explain. */
export function concentration({ analytics, rows = [], venueName = (k) => k } = {}) {
  const t = analytics?.totals || {};
  const net = num(t.net);
  if (net === null || net >= 0) return [];
  const out = [];

  const days = worstDays(analytics?.curve);
  if (days) {
    const label = days.days.map((d) => fmtDay(d.day)).join(" and ");
    out.push({
      key: "days",
      share: days.share,
      headline: `${days.days.length} days out of ${days.of}`,
      detail: `${label} lost ${fmtShort(Math.abs(days.sum))} between them`,
    });
  }

  const acct = topAccount(analytics?.leaderboard, net);
  if (acct) {
    const meta = rows.find((r) => r.subject === acct.row.subject);
    const venue = (meta?.venues || []).find((v) => v.connected)?.exchange;
    const lev = acct.row.leverage || meta?.leverage;
    out.push({
      key: "account",
      share: acct.share,
      headline: `1 account of ${acct.accounts}`,
      detail: `${acct.row.trades} trades${venue ? ` on ${venueName(venue)}` : ""}${lev ? ` at ${lev}×` : ""}`,
      subject: acct.row.subject,
    });
  }

  // Deliberately NOT here: "stop-losses are 182% of the net loss". True, and
  // unreadable — stops are a share of the money LOST, while these two lines are
  // shares of the NET. One list, one denominator; stops get their own card with
  // their own denominator stated.
  return out.sort((a, b) => b.share - a.share);
}

const fmtShort = (v) => `$${Math.round(v)}`;

/** Accounts, merged and ranked for the one table that replaces the venue and
 *  leverage charts — in production those two drew the SAME fact twice, because
 *  the dominant account is the only one on its venue and the only one at its
 *  leverage. */
export function accountRows(rows = [], leaderboard = []) {
  const perf = new Map((leaderboard || []).map((r) => [r.subject, r]));
  return rows
    .filter((r) => r.has_account)
    .map((r) => ({ ...r, ...(perf.get(r.subject) || {}) }))
    .filter((r) => num(r.trades) !== null || r.is_active || r.status === "error")
    .sort((a, b) => Math.abs(num(b.net) || 0) - Math.abs(num(a.net) || 0));
}
