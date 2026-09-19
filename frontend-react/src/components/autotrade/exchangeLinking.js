// One venue at a time. Unlink is a user action; the server still fail-closes.

export function pickLinkedAccount(accounts = [], config = null) {
  const linked = (accounts || []).filter((account) => account?.exchange);
  if (!linked.length) return null;
  const wanted = config?.exchange;
  if (wanted) {
    const match = linked.find((account) => account.exchange === wanted);
    if (match) return match;
  }
  return linked.find((account) => account.key_status === "valid") || linked[0];
}

export function pickStrategyConfig(items = [], accounts = []) {
  if (!items.length) return null;
  const linked = new Set((accounts || []).map((account) => account.exchange).filter(Boolean));
  if (!linked.size) return items.find((item) => item.is_active) || items[0] || null;
  const pool = items.filter((item) => linked.has(item.exchange));
  if (!pool.length) return null;
  const valid = new Set(
    accounts.filter((account) => account.key_status === "valid").map((account) => account.exchange)
  );
  return (
    pool.find((item) => item.is_active) ||
    pool.find((item) => valid.has(item.exchange)) ||
    pool[0]
  );
}

export function trackedAgentPositions(portfolio) {
  return (portfolio?.spot?.tracked_positions || []).filter(Boolean);
}

export function venueAlreadyLinkedError(error) {
  const code = error?.code || error?.detail?.code;
  if (code === "venue_already_linked") return error;
  const message = String(error?.message || "");
  if (/already has .+ linked/i.test(message) || /one venue at a time/i.test(message)) {
    return error;
  }
  return null;
}
