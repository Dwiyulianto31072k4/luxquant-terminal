// src/utils/roles.js
//
// Central helpers for platform + staff roles.
//
// Staff:
// - admin → full write access to management system
// - co_admin → view-only admin panel
// - founder → view-only admin panel (same capabilities as co_admin)
// Members:
// - free / subscriber / premium

export const STAFF_ROLES = Object.freeze(["admin", "co_admin", "founder"]);
export const VIEW_ONLY_STAFF_ROLES = Object.freeze(["co_admin", "founder"]);
export const ASSIGNABLE_ROLES = Object.freeze([
  "free",
  "subscriber",
  "co_admin",
  "founder",
  "admin",
]);

export const ROLE_LABELS = Object.freeze({
  free: "Free",
  subscriber: "Subscriber",
  premium: "Premium",
  co_admin: "Co-Admin",
  founder: "Founder",
  admin: "Admin",
});

/** Full admin — all mutations allowed. */
export function isAdminFull(user) {
  if (!user) return false;
  if (user.is_admin === true) return true;
  return user.role === "admin";
}

/** Can open admin panel (full + view-only staff). */
export function isAdminStaff(user) {
  if (!user) return false;
  if (user.is_admin_staff === true) return true;
  if (user.is_admin === true) return true;
  return STAFF_ROLES.includes(user.role);
}

/** View-only staff (co_admin / founder) — no delete/write actions. */
export function isAdminViewOnly(user) {
  if (!user) return false;
  if (user.is_admin_view_only === true) return true;
  return VIEW_ONLY_STAFF_ROLES.includes(user.role);
}

/** True if role is any staff role (admin / co_admin / founder). */
export function isStaffRole(role) {
  return STAFF_ROLES.includes(role);
}

export function roleLabel(role) {
  if (!role) return "—";
  return ROLE_LABELS[role] || role;
}
