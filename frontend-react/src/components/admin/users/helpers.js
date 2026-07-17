// src/components/admin/users/helpers.js
//
// Pure helpers used across the Users tab. No JSX, no React.
//

// ════════════════════════════════════════════════════════════════════
// Date / time
// ════════════════════════════════════════════════════════════════════

export const formatDate = (dateStr) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

export const daysSince = (dateStr) => {
  if (!dateStr) return null;
  return Math.floor((new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24));
};

export const relativeTime = (dateStr) => {
  if (!dateStr) return "Never";
  const days = daysSince(dateStr);
  if (days === 0) return "Today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
};

// ════════════════════════════════════════════════════════════════════
// Channel / reach detection
// ════════════════════════════════════════════════════════════════════

/** Returns whether user can be reached via telegram.
 * A linked telegram_id counts: even without a public @username, the bot
 * can DM the user by their chat id. */
export const hasTelegram = (u) =>
  !!(u?.admin_telegram_username || u?.telegram_username || u?.telegram_id);

/** Returns whether user can be reached via discord. */
export const hasDiscord = (u) => !!(u?.admin_discord_handle || u?.discord_id);

/** Returns whether user can be reached via a "real" email (not provider stub). */
export const hasRealEmail = (u) =>
  !!(
    u?.email &&
    !u.email.endsWith("@telegram.luxquant.tw") &&
    !u.email.endsWith("@discord.luxquant.tw")
  );

/** Total reachability flag. */
export const isReachable = (u) => hasTelegram(u) || hasDiscord(u) || hasRealEmail(u);

// ════════════════════════════════════════════════════════════════════
// Subscription status
// ════════════════════════════════════════════════════════════════════

export const subscriptionStatus = (user) => {
  if (user.role === "admin") return { type: "admin", label: "Admin" };
  if (user.role === "co_admin") return { type: "co_admin", label: "Co-Admin" };
  if (user.role === "founder") return { type: "founder", label: "Founder" };
  if (user.role !== "subscriber" && user.role !== "premium") return { type: "free", label: "—" };
  if (!user.subscription_expires_at) return { type: "lifetime", label: "Lifetime" };
  const days = daysUntil(user.subscription_expires_at);
  if (days <= 0) return { type: "expired", label: "Expired", days };
  if (days <= 7) return { type: "expiring", label: `${days}d left`, days };
  return { type: "active", label: `${days}d left`, days };
};
