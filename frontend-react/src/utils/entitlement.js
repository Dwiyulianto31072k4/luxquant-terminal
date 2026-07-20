// src/utils/entitlement.js
//
// One question, one place: may this user open full signal detail?
// The server's /me answer (has_active_access) is authoritative when present.
// The role fallback only exists for stale cached user objects from before
// the field was serialized — it must NEVER override an explicit false.
// (The backend still redacts levels regardless; this only decides whether
// the UI opens the signal or the upgrade modal.)

import { isAdminStaff } from "./roles";

const MEMBER_ROLES = ["premium", "subscriber"];

export function isEntitled(user) {
  if (!user) return false;
  return !!(user.has_active_access ?? (isAdminStaff(user) || MEMBER_ROLES.includes(user.role)));
}
