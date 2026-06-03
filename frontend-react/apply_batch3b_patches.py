#!/usr/bin/env python3
# frontend-react/apply_batch3b_patches.py
"""
Batch 3b patcher (frontend) — brings activity data into the user UIs.

Idempotent + edit-preserving. Patches 2 files:

  A. components/admin/users/UsersTable.jsx
     - header "Last Login" -> "Activity"
     - desktop cell: last_active_at (relative) + total_sessions + last feature
     - mobile card: "Last seen ..." -> last_active_at + last feature

  B. components/admin/UserDetailDrawer.jsx
     - import growthApi
     - add an <ActivityPulse> Section to the Overview tab (sparkline +
       engagement score + top features), lazy-fetched from
       /workspace/growth/user-activity/{id}

Run from frontend-react/:
    python3 apply_batch3b_patches.py
"""
import sys
import os

ROOT = sys.argv[1] if len(sys.argv) > 1 else "src"
USERS_TABLE = os.path.join(ROOT, "components", "admin", "users", "UsersTable.jsx")
DRAWER = os.path.join(ROOT, "components", "admin", "UserDetailDrawer.jsx")

# ════════════════════════════════════════════════════════════════════
# A. UsersTable
# ════════════════════════════════════════════════════════════════════

UT_HEADER_ANCHOR = "{['User', 'Contact', 'Role', 'Subscription', 'Last Login', ''].map((h, i) => ("
UT_HEADER_NEW = "{['User', 'Contact', 'Role', 'Subscription', 'Activity', ''].map((h, i) => ("

UT_DESKTOP_ANCHOR = """            <td className="px-3 py-2.5 hidden lg:table-cell">
              <span
                className="text-[10px]"
                style={{ color: u.last_login_at ? '#8a7a6e' : '#4a3f39' }}
              >
                {relativeTime(u.last_login_at)}
              </span>
              {u.login_count > 0 && (
                <p className="text-[9px] tabular-nums" style={{ color: '#4a3f39' }}>
                  {u.login_count}× total
                </p>
              )}
            </td>"""

UT_DESKTOP_NEW = """            <td className="px-3 py-2.5 hidden lg:table-cell">
              <span
                className="text-[10px]"
                style={{ color: u.last_active_at ? '#8a7a6e' : '#4a3f39' }}
              >
                {relativeTime(u.last_active_at)}
              </span>
              <p className="text-[9px] tabular-nums" style={{ color: '#4a3f39' }}>
                {u.total_sessions > 0 ? `${u.total_sessions} sessions` : 'no sessions'}
                {u.last_feature_touched ? ` · ${u.last_feature_touched}` : ''}
              </p>
            </td>"""

UT_MOBILE_ANCHOR = """            <span className="text-[10px]" style={{ color: '#8a7a6e' }}>
              Last seen {relativeTime(u.last_login_at)}
            </span>"""

UT_MOBILE_NEW = """            <span className="text-[10px]" style={{ color: '#8a7a6e' }}>
              {u.last_active_at ? `Active ${relativeTime(u.last_active_at)}` : 'No web activity'}
              {u.last_feature_touched ? ` · ${u.last_feature_touched}` : ''}
            </span>"""

# ════════════════════════════════════════════════════════════════════
# B. UserDetailDrawer
# ════════════════════════════════════════════════════════════════════

DR_IMPORT_ANCHOR = "import { adminApi } from '../../services/adminApi';"
DR_IMPORT_NEW = (
    "import { adminApi } from '../../services/adminApi';\n"
    "import { growthApi } from '../../services/growthApi';"
)

# ActivityPulse component definition — inserted right before "Tab 1: Overview"
DR_COMP_ANCHOR = """/* ════════════════════════════════════════
   Tab 1: Overview
   ════════════════════════════════════════ */"""

DR_COMP_NEW = '''const FEATURE_LABEL = {
  signals: 'Signals', autotrade: 'AutoTrade', markets: 'Markets',
  market_pulse: 'Market Pulse', ai_arena: 'AI Arena', tips: 'Tips',
  whale_alert: 'Whale Alert', onchain: 'On-chain', news: 'News', fx: 'FX',
  macro_calendar: 'Macro Calendar', watchlist: 'Watchlist',
  journal: 'Journal', referral: 'Referral', profile: 'Profile',
  analytics: 'Analytics',
};
const featLabel = (f) => FEATURE_LABEL[f] || f;

const ActivityPulse = ({ userId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    growthApi
      .getUserActivity(userId)
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [userId]);

  if (loading) {
    return (
      <Section title="Activity Pulse" Icon={ClockIcon}>
        <div className="flex items-center justify-center py-6">
          <span
            className="inline-block w-4 h-4 rounded-full animate-spin"
            style={{ border: '2px solid rgba(45,212,191,0.25)', borderTopColor: '#2dd4bf' }}
          />
        </div>
      </Section>
    );
  }
  if (!data || data.error) return null;

  const spark = data.sparkline_30d || [];
  const maxC = spark.reduce((m, p) => Math.max(m, p.count), 0) || 1;
  const score = data.engagement_score ?? 0;
  const scoreColor = score >= 60 ? '#34d399' : score >= 30 ? '#fbbf24' : '#8a7a6e';

  return (
    <Section title="Activity Pulse" Icon={ClockIcon}>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <StatTile label="Engagement" value={score} accent={scoreColor} />
        <StatTile label="Last seen" value={relativeTime(data.last_active_at)} />
        <StatTile label="Active days (30d)" value={data.active_days_30d ?? 0} />
        <StatTile label="Sessions" value={data.total_sessions ?? 0} />
      </div>

      {/* 30-day sparkline */}
      <div
        className="rounded-lg px-3 py-2.5"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Last 30 days
          </span>
          <span className="text-[9px]" style={{ color: '#4a3f39' }}>
            {data.events_30d ?? 0} actions
          </span>
        </div>
        <div className="flex items-end gap-[2px]" style={{ height: 36 }}>
          {spark.map((p, i) => (
            <div
              key={i}
              title={`${p.date}: ${p.count}`}
              className="flex-1 rounded-sm"
              style={{
                height: `${Math.max(6, (p.count / maxC) * 100)}%`,
                background: p.count > 0 ? '#2dd4bf' : 'rgba(255,255,255,0.05)',
                opacity: p.count > 0 ? 0.85 : 1,
              }}
            />
          ))}
        </div>
      </div>

      {/* Top features */}
      {data.top_features && data.top_features.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
          {data.top_features.map((f) => (
            <span
              key={f.feature}
              className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium"
              style={{ background: 'rgba(45,212,191,0.1)', color: '#2dd4bf' }}
            >
              {featLabel(f.feature)} ·{f.count}
            </span>
          ))}
        </div>
      )}
    </Section>
  );
};

/* ════════════════════════════════════════
   Tab 1: Overview
   ════════════════════════════════════════ */'''

# render <ActivityPulse> inside OverviewTab (after the Account Info Section)
DR_RENDER_ANCHOR = """      <Section title="Account Info" Icon={UserIcon}>
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="User ID" value={`#${user.id}`} />
          <StatTile label="Created" value={formatDate(user.created_at)} />
          <StatTile label="First Login" value={formatDate(user.first_login_at)} />
          <StatTile
            label="Last Login"
            value={relativeTime(user.last_login_at)}
          />
          <StatTile label="Login Count" value={user.login_count || 0} />
          <StatTile label="Country" value={user.country_code || '—'} />
        </div>
      </Section>"""

DR_RENDER_NEW = """      <Section title="Account Info" Icon={UserIcon}>
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="User ID" value={`#${user.id}`} />
          <StatTile label="Created" value={formatDate(user.created_at)} />
          <StatTile label="First Login" value={formatDate(user.first_login_at)} />
          <StatTile
            label="Last Login"
            value={relativeTime(user.last_login_at)}
          />
          <StatTile label="Login Count" value={user.login_count || 0} />
          <StatTile label="Country" value={user.country_code || '—'} />
        </div>
      </Section>

      <ActivityPulse userId={user.id} />"""


def patch_file(path, label, edits):
    if not os.path.exists(path):
        print(f"✗ not found: {path}")
        return False
    src = open(path, encoding="utf-8").read()
    applied = []
    for name, anchor, new, marker in edits:
        if marker in src:
            print(f"• {label}: {name} already present — skipped")
            continue
        if anchor not in src:
            print(f"✗ {label}: anchor not found for '{name}'")
            return False
        src = src.replace(anchor, new, 1)
        applied.append(name)
    if applied:
        open(path, "w", encoding="utf-8").write(src)
        print(f"✓ {label}: {', '.join(applied)}")
    return True


def main():
    ok_a = patch_file(
        USERS_TABLE, "UsersTable.jsx",
        [
            ("header label", UT_HEADER_ANCHOR, UT_HEADER_NEW,
             "'Subscription', 'Activity', ''"),
            ("desktop activity cell", UT_DESKTOP_ANCHOR, UT_DESKTOP_NEW,
             "u.total_sessions > 0 ? `${u.total_sessions} sessions`"),
            ("mobile activity line", UT_MOBILE_ANCHOR, UT_MOBILE_NEW,
             "u.last_active_at ? `Active ${relativeTime"),
        ],
    )
    ok_b = patch_file(
        DRAWER, "UserDetailDrawer.jsx",
        [
            ("import growthApi", DR_IMPORT_ANCHOR, DR_IMPORT_NEW,
             "import { growthApi }"),
            ("ActivityPulse component", DR_COMP_ANCHOR, DR_COMP_NEW,
             "const ActivityPulse = ({ userId })"),
            ("render ActivityPulse", DR_RENDER_ANCHOR, DR_RENDER_NEW,
             "<ActivityPulse userId={user.id} />"),
        ],
    )
    return ok_a and ok_b


if __name__ == "__main__":
    ok = main()
    print("─" * 40)
    print("✓ Batch 3b patches applied." if ok else "✗ Patch failed — see messages.")
    sys.exit(0 if ok else 1)
