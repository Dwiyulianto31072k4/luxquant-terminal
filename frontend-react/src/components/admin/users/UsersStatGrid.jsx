// src/components/admin/users/UsersStatGrid.jsx
//
// 6-tile primary KPI grid at the top of the Users tab.
// Tiles are click-to-filter (ERP drill-down from KPI → directory).
//

import { StatTile } from "../primitives";
import { UsersIcon, CrownIcon, UserIcon, ShieldIcon, ClockIcon, TrendingUpIcon } from "../Icons";

/**
 * @param {object} props
 * @param {object|null} props.stats
 * @param {object} props.filters — current filter state (for active highlight)
 * @param {object} props.defaults — DEFAULT_FILTERS
 * @param {(next: object) => void} [props.onFilter] — apply segment filter
 */
export const UsersStatGrid = ({ stats, filters, defaults, onFilter }) => {
  const role = filters?.role || null;
  const plan = filters?.plan || null;
  const status = filters?.status || null;
  const anySegment =
    role || plan || status || filters?.exSubscriber || filters?.anomaly || filters?.crm;

  const apply = (patch) => {
    if (!onFilter || !defaults) return;
    onFilter({ ...defaults, ...patch });
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <StatTile
        label="Total Users"
        value={stats?.total_users}
        Icon={UsersIcon}
        accent="muted"
        active={onFilter ? !anySegment : false}
        onClick={onFilter ? () => apply({}) : undefined}
      />
      <StatTile
        label="Subscribers"
        value={stats?.active_subscribers}
        Icon={CrownIcon}
        accent="muted"
        sub={stats?.lifetime_subscribers ? `${stats.lifetime_subscribers} lifetime` : undefined}
        active={role === "subscriber" && !plan && !filters?.exSubscriber}
        onClick={onFilter ? () => apply({ role: "subscriber" }) : undefined}
      />
      <StatTile
        label="Free Users"
        value={stats?.free_users}
        Icon={UserIcon}
        accent="muted"
        active={role === "free"}
        onClick={onFilter ? () => apply({ role: "free" }) : undefined}
      />
      <StatTile
        label="Admins"
        value={stats?.admin_count}
        Icon={ShieldIcon}
        accent="muted"
        active={role === "admin"}
        onClick={onFilter ? () => apply({ role: "admin" }) : undefined}
      />
      <StatTile
        label="Expiring Soon"
        value={stats?.expiring_soon}
        Icon={ClockIcon}
        accent="orange"
        sub="Within 7 days"
        active={status === "expiring"}
        onClick={onFilter ? () => apply({ status: "expiring" }) : undefined}
      />
      <StatTile
        label="New This Month"
        value={stats?.new_users_30d}
        Icon={TrendingUpIcon}
        accent="muted"
        sub="Last 30 days"
        // No dedicated backend filter — drill-down = newest-first directory
        onClick={onFilter ? () => apply({ sortBy: "created_at", sortOrder: "desc" }) : undefined}
      />
    </div>
  );
};
