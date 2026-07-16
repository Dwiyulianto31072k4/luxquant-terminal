// src/components/admin/users/UsersSearchBar.jsx
//
// Search input + result counter row. Lives above the FilterPanel.
//

import { SearchInput } from '../primitives';
import { SearchIcon } from '../Icons';
import { palette } from '../designSystem';

export const UsersSearchBar = ({ search, onSearchChange, total, selectedCount }) => (
  <div className="flex items-center gap-3">
    <SearchInput
      value={search}
      onChange={(e) => onSearchChange(e.target.value)}
      placeholder="Search by username, email, telegram, discord, or admin notes..."
      Icon={SearchIcon}
      className="flex-1"
    />
    <div className="text-[10px] whitespace-nowrap tabular-nums" style={{ color: 'rgb(var(--fg-muted))' }}>
      <span className="text-text-primary font-bold">{total}</span> user{total !== 1 ? 's' : ''}
      {selectedCount > 0 && (
        <span style={{ color: palette.gold[300] }}> · {selectedCount} selected</span>
      )}
    </div>
  </div>
);
