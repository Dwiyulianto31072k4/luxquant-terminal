// src/components/admin/users/UsersStatGrid.jsx
//
// 6-tile primary KPI grid at the top of the Users tab.
//

import { StatTile } from '../primitives';
import {
  UsersIcon,
  CrownIcon,
  UserIcon,
  ShieldIcon,
  ClockIcon,
  TrendingUpIcon,
} from '../Icons';

export const UsersStatGrid = ({ stats }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
    <StatTile
      label="Total Users"
      value={stats?.total_users}
      Icon={UsersIcon}
      accent="blue"
    />
    <StatTile
      label="Subscribers"
      value={stats?.active_subscribers}
      Icon={CrownIcon}
      accent="green"
      sub={stats?.lifetime_subscribers ? `${stats.lifetime_subscribers} lifetime` : undefined}
    />
    <StatTile
      label="Free Users"
      value={stats?.free_users}
      Icon={UserIcon}
      accent="gold"
    />
    <StatTile
      label="Admins"
      value={stats?.admin_count}
      Icon={ShieldIcon}
      accent="purple"
    />
    <StatTile
      label="Expiring Soon"
      value={stats?.expiring_soon}
      Icon={ClockIcon}
      accent="orange"
      sub="Within 7 days"
    />
    <StatTile
      label="New This Month"
      value={stats?.new_users_30d}
      Icon={TrendingUpIcon}
      accent="blue"
      sub="Last 30 days"
    />
  </div>
);
