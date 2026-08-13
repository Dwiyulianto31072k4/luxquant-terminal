// src/components/admin/users/UnclaimedEntitlementsPanel.jsx
//
// Everyone holding a LuxQuant entitlement from an upstream source — claimed
// or not, Discord or Telegram.
//
// Daily Rekom Crypto is a PARTNER server: only its Premium+ role is a LuxQuant
// entitlement. Its other ~7,000 members are DRC's own and deliberately never
// appear here.
//
// Both Discord Premium+ and the pre-webapp Telegram VIP snapshot grant a role,
// but only at LOGIN. Someone who never signs in therefore never reaches the
// `users` table — so every other number on this page, including the member
// directory itself, is blind to them. Measured 2026-08-09: 208 such people,
// against 918 members total.
//
// Collapsed by default like the other panels; the drill-down opens a modal
// because these rows are not app users and cannot be filtered into the table.

import { useEffect, useMemo, useState } from "react";
import Modal from "../../ui/Modal";
import { Surface, IntentTile } from "../primitives";
import { adminApi } from "../../../services/adminApi";
import { palette, tint } from "../designSystem";
import {
  TelegramIcon,
  DiscordIcon,
  ChevronDownIcon,
  SearchIcon,
  UserPlusIcon,
  RefreshIcon,
  ExternalLinkIcon,
} from "../Icons";

const SOURCE_META = {
  discord_premium: {
    label: "Discord Premium+",
    Icon: DiscordIcon,
    color: palette.channels.discord,
    where: "Daily Rekom Crypto",
  },
  legacy: {
    label: "Telegram legacy",
    Icon: TelegramIcon,
    color: palette.channels.telegram,
    where: "VIP group (pre-webapp)",
  },
};

const fmtDate = (d) => (d ? String(d).slice(0, 10) : "—");

export const UnclaimedEntitlementsPanel = ({ defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [drill, setDrill] = useState(null); // null | 'all' | source key
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState("");
  // Default: longest-entitled first. Someone who joined the server in Feb 2024
  // and still has not claimed is a stronger lead than last week's arrival.
  const [sort, setSort] = useState({ key: "joined", dir: "asc" });
  // all · unclaimed (no LuxQuant account) · claimed (has one)
  const [seg, setSeg] = useState("all");
  // Optimistic overlay so a tick lands instantly; the server response replaces it.
  const [paidEdits, setPaidEdits] = useState({});
  const [saving, setSaving] = useState(null);
  const [noteEdit, setNoteEdit] = useState(null); // {id, value}
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!open || data) return;
    setLoading(true);
    adminApi
      .getEntitlements()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [open, data]);

  const rows = useMemo(
    () => (data?.rows || []).map((r) => (paidEdits[r.platform_id] ? { ...r, ...paidEdits[r.platform_id] } : r)),
    [data, paidEdits]
  );
  const s = data?.summary || {};

  // Discord rows are all still holders by definition (we only list current
  // role holders). Telegram legacy rows carry `still_present`, and someone who
  // has left the group is a much weaker lead — surface the two separately
  // rather than averaging them into one flattering number.
  const groups = useMemo(() => {
    const g = {};
    rows.forEach((r) => {
      const k = r.source;
      g[k] = g[k] || { total: 0, present: 0, unclaimed: 0, rows: [] };
      g[k].total += 1;
      if (r.still_present) g[k].present += 1;
      if (!r.has_account) g[k].unclaimed += 1;
      g[k].rows.push(r);
    });
    return g;
  }, [rows]);

  const unclaimedRows = rows.filter((r) => !r.has_account);

  const doRefresh = async () => {
    setRefreshing(true);
    try {
      await adminApi.refreshEntitlements();
    } finally {
      // The recompute takes about a minute; clearing the cached copy makes the
      // next open re-fetch rather than showing a number we know is being replaced.
      setTimeout(() => {
        setData(null);
        setRefreshing(false);
      }, 60000);
    }
  };

  const togglePaid = async (r) => {
    const next = !r.paid;
    setSaving(r.platform_id);
    setPaidEdits((p) => ({ ...p, [r.platform_id]: { paid: next } }));
    try {
      const res = await adminApi.setEntitlementMark({
        platform: r.platform,
        platform_id: r.platform_id,
        handle: r.handle,
        paid: next,
      });
      setPaidEdits((p) => ({
        ...p,
        [r.platform_id]: {
          paid: res.paid,
          paid_source: res.paid_source,
          paid_checked_at: res.paid_checked_at,
          paid_checked_by: res.paid_checked_by,
        },
      }));
    } catch {
      // Put it back — a tick that silently failed is worse than one that never moved.
      setPaidEdits((p) => ({ ...p, [r.platform_id]: { paid: r.paid } }));
    } finally {
      setSaving(null);
    }
  };

  const saveNote = async (r, value) => {
    const prev = r.note ?? "";
    if (value === prev) return setNoteEdit(null);
    setNoteEdit(null);
    setPaidEdits((p) => ({ ...p, [r.platform_id]: { ...(p[r.platform_id] || {}), note: value } }));
    try {
      const res = await adminApi.setEntitlementMark({
        platform: r.platform,
        platform_id: r.platform_id,
        handle: r.handle,
        note: value,
      });
      setPaidEdits((p) => ({ ...p, [r.platform_id]: { ...(p[r.platform_id] || {}), note: res.note } }));
    } catch {
      setPaidEdits((p) => ({ ...p, [r.platform_id]: { ...(p[r.platform_id] || {}), note: prev } }));
    }
  };

  const drillPool =
    drill === "all" ? rows : drill ? (groups[drill]?.rows || []) : [];
  const drillBase = useMemo(() => {
    if (seg === "unclaimed") return drillPool.filter((r) => !r.has_account);
    if (seg === "claimed") return drillPool.filter((r) => r.has_account);
    return drillPool;
  }, [drillPool, seg]);

  // Match on anything the operator might have in front of them — a handle from
  // a chat, a display name, a raw id pasted out of a log. Diacritics and case
  // are normalised because these names are typed by hand.
  const drillRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return drillBase;
    return drillBase.filter((r) =>
      [r.handle, r.name, r.platform_id, r.source, r.entitles_to]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle))
    );
  }, [drillBase, q]);

  const sorted = useMemo(() => {
    const { key, dir } = sort;
    const mult = dir === "asc" ? 1 : -1;
    return [...drillRows].sort((a, b) => {
      let x = a[key];
      let y = b[key];
      if (key === "still_present") {
        x = x ? 1 : 0;
        y = y ? 1 : 0;
      }
      // Rows with no value always sink, whichever way the arrow points —
      // otherwise the legacy rows (which genuinely have no date) would take
      // over the top of the list and look like the oldest entries.
      const xe = x === null || x === undefined || x === "";
      const ye = y === null || y === undefined || y === "";
      if (xe && ye) return 0;
      if (xe) return 1;
      if (ye) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * mult;
      return String(x).localeCompare(String(y), undefined, { numeric: true }) * mult;
    });
  }, [drillRows, sort]);

  const toggleSort = (key) =>
    setSort((p) => ({ key, dir: p.key === key && p.dir === "asc" ? "desc" : "asc" }));

  const Th = ({ label, sortKey, className = "" }) => (
    <th className={`py-2 pr-3 font-semibold ${className}`}>
      {sortKey ? (
        <button
          type="button"
          onClick={() => toggleSort(sortKey)}
          className="inline-flex items-center gap-1 hover:text-text-primary"
          style={{ color: sort.key === sortKey ? palette.gold[300] : "inherit" }}
        >
          {label}
          <span className="text-[8px] leading-none">
            {sort.key === sortKey ? (sort.dir === "asc" ? "▲" : "▼") : "⇅"}
          </span>
        </button>
      ) : (
        label
      )}
    </th>
  );

  return (
    <>
      <Surface variant="premium" hover={false} padding="p-0">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <div className="flex items-center gap-2 min-w-0">
            <UserPlusIcon size={14} style={{ color: palette.gold[300] }} />
            <h3 className="text-xs font-bold text-text-primary tracking-tight">
              Entitlements
            </h3>
            {unclaimedRows.length > 0 && (
              <span
                className="text-[10px] tabular-nums px-1.5 py-0.5 rounded-full"
                style={{
                  background: tint(palette.gold[300], 0.12),
                  color: palette.gold[300],
                  border: `1px solid ${tint(palette.gold[300], 0.25)}`,
                }}
              >
                {unclaimedRows.length} unclaimed
              </span>
            )}
          </div>
          <ChevronDownIcon
            size={15}
            style={{
              color: "rgb(var(--ink) / 0.4)",
              transform: open ? "rotate(180deg)" : "none",
              transition: "transform .2s",
            }}
          />
        </button>

        {open && (
          <div className="px-4 pb-4">
            {loading && (
              <p className="text-[11px] text-text-muted py-3">Loading…</p>
            )}

            {!loading && data?.warming && (
              <p className="text-[11px] text-text-muted py-3">
                Never computed yet — hit refresh to build it (takes ~1 minute).
              </p>
            )}

            {!loading && !data?.warming && (
              <>
                <p className="text-[11px] leading-relaxed text-text-muted mb-3">
                  Everyone holding LuxQuant access from an upstream source —
                  Discord Premium+ or the legacy Telegram VIP snapshot — whether
                  or not they have claimed it. Those without an account appear
                  nowhere else on this page: roles are granted at login.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.entries(groups).map(([key, g]) => {
                    const meta = SOURCE_META[key] || {
                      label: key,
                      Icon: UserPlusIcon,
                      color: palette.gold[300],
                    };
                    return (
                      <IntentTile
                        key={key}
                        Icon={meta.Icon}
                        label={meta.label}
                        value={g.total}
                        color={meta.color}
                        onClick={() => {
                          setQ("");
                          setSeg("all");
                          setDrill(key);
                        }}
                      />
                    );
                  })}
                  <IntentTile
                    Icon={UserPlusIcon}
                    label="Unclaimed"
                    value={unclaimedRows.length}
                    color={palette.gold[300]}
                    onClick={() => {
                      setQ("");
                      setSeg("unclaimed");
                      setDrill("all");
                    }}
                  />
                </div>

                <div className="flex items-center justify-between gap-3 mt-3">
                  <p className="text-[10px] text-text-muted">
                    {data?.generated_at
                      ? `Checked ${fmtDate(data.generated_at)} · Discord ${
                          s.discord_premium_total ?? "?"
                        } Premium+ · ${s.legacy_still_in_group ?? "?"} legacy still in VIP group`
                      : ""}
                  </p>
                  <button
                    type="button"
                    onClick={doRefresh}
                    disabled={refreshing}
                    className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-1 rounded disabled:opacity-50"
                    style={{
                      background: tint(palette.gold[300], 0.1),
                      color: palette.gold[300],
                    }}
                  >
                    <RefreshIcon size={11} />
                    {refreshing ? "Recomputing…" : "Refresh"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </Surface>

      <Modal
        isOpen={!!drill}
        onClose={() => setDrill(null)}
        size={expanded ? "full" : "xl"}
        header={
          // Passing `header` replaces the whole chrome — Modal renders its own
          // title only when no header is given — so this carries the title and
          // the live count itself rather than losing them to the expand button.
          <div className="flex w-full items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-[15px] font-bold text-text-primary">
                {drill === "all"
                  ? "Entitlements — all sources"
                  : `Entitlements — ${SOURCE_META[drill]?.label || drill}`}
              </h2>
              <p className="mt-0.5 text-[11.5px] text-text-muted">
                {q.trim()
                  ? `${drillRows.length} of ${drillBase.length} match "${q.trim()}"`
                  : `${drillBase.length} people · entitled via an upstream source`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="shrink-0 rounded px-2 py-1 text-[11px] font-semibold"
              style={{ background: tint(palette.gold[300], 0.12), color: palette.gold[300] }}
              title={expanded ? "Back to a dialog" : "Use the whole window"}
            >
              {expanded ? "Collapse" : "Expand"}
            </button>
          </div>
        }
      >
        <div className="mb-2 flex items-center gap-1.5">
          {[
            ["all", "All"],
            ["unclaimed", "No account"],
            ["claimed", "Has account"],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setSeg(k)}
              className="text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors"
              style={
                seg === k
                  ? { background: tint(palette.gold[300], 0.14), color: palette.gold[300] }
                  : { background: "rgb(var(--ink) / 0.04)", color: "rgb(var(--ink) / 0.55)" }
              }
            >
              {label}
              <span className="ml-1 tabular-nums opacity-70">
                {k === "all"
                  ? drillPool.length
                  : k === "unclaimed"
                    ? drillPool.filter((r) => !r.has_account).length
                    : drillPool.filter((r) => r.has_account).length}
              </span>
            </button>
          ))}
        </div>

        <div className="mb-3 relative">
          <SearchIcon
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ color: "rgb(var(--ink) / 0.35)" }}
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search handle, name or ID…"
            autoFocus
            className="w-full rounded-lg border border-ink/10 bg-ink/[0.03] py-2 pl-8 pr-8 text-[12px] text-text-primary placeholder:text-text-muted outline-none focus:border-ink/20"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary text-[13px]"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <div
          className="overflow-auto -mx-1"
          style={{ maxHeight: expanded ? "calc(100vh - 230px)" : "60vh" }}
        >
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-text-muted">
                <th className="py-2 pr-3 font-semibold">#</th>
                <Th label="Handle" sortKey="handle" />
                <Th label="Name" sortKey="name" />
                <Th label="Source" sortKey="source" />
                <Th label="LuxQuant" sortKey="lux_username" />
                <Th label="Role" sortKey="lux_role" />
                <Th label="Joined server" sortKey="joined" />
                <Th label="Form date" sortKey="form_joined_at" />
                <Th label="Paid" sortKey="paid" />
                <Th label="Still there" sortKey="still_present" />
                <Th label="Note" sortKey="note" />
                <th className="py-2 font-semibold">ID</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => {
                const meta = SOURCE_META[r.source] || {};
                return (
                  <tr
                    key={`${r.platform}-${r.platform_id}`}
                    className="border-t border-ink/[0.06] text-[11.5px] text-text-primary/85"
                  >
                    <td className="py-1.5 pr-3 tabular-nums text-text-muted">{i + 1}</td>
                    <td className="py-1.5 pr-3 font-semibold">
                      {r.handle ? (
                        r.platform === "telegram" ? (
                          <a
                            href={`https://t.me/${r.handle}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 hover:underline"
                            style={{ color: palette.channels.telegram }}
                          >
                            @{r.handle}
                            <ExternalLinkIcon size={10} />
                          </a>
                        ) : (
                          `@${r.handle}`
                        )
                      ) : (
                        <span className="text-text-muted">(no username)</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3">{r.name || "—"}</td>
                    <td className="py-1.5 pr-3" style={{ color: meta.color }}>
                      {meta.label || r.source}
                    </td>
                    <td className="py-1.5 pr-3">
                      {r.has_account ? (
                        r.lux_username
                      ) : (
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                          style={{ background: tint(palette.gold[300], 0.12), color: palette.gold[300] }}
                        >
                          no account
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3">
                      {r.lux_role || <span className="text-text-muted">—</span>}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums text-text-muted">
                      {fmtDate(r.joined)}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums text-text-muted">
                      {r.form_joined_at ? (
                        <span title={r.form_batch || ""}>{fmtDate(r.form_joined_at)}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-1.5 pr-3">
                      {r.platform === "discord" ? (
                        <button
                          type="button"
                          disabled={saving === r.platform_id}
                          onClick={() => togglePaid(r)}
                          title={
                            r.paid
                              ? `${r.paid_source === "lynk_form" ? "From the Lynk signup sheet" : "Confirmed by hand"}` +
                                (r.paid_checked_at ? ` · ${fmtDate(r.paid_checked_at)}` : "") +
                                (r.paid_checked_by ? ` · ${r.paid_checked_by}` : "")
                              : "Not settled — tick once invoiced to DRC"
                          }
                          className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold px-1.5 py-0.5 rounded disabled:opacity-40"
                          style={
                            r.paid
                              ? { background: tint(palette.green[400], 0.14), color: palette.green[400] }
                              : { background: "rgb(var(--ink) / 0.05)", color: "rgb(var(--ink) / 0.5)" }
                          }
                        >
                          <span>{r.paid ? "✓" : "○"}</span>
                          {r.paid ? (r.paid_source === "lynk_form" ? "Lynk" : "paid") : "unpaid"}
                        </button>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3">
                      {r.still_present ? (
                        <span style={{ color: palette.green?.[400] || "#4ade80" }}>yes</span>
                      ) : (
                        <span className="text-text-muted">left</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 min-w-[150px]">
                      {noteEdit?.id === r.platform_id ? (
                        <input
                          autoFocus
                          value={noteEdit.value}
                          onChange={(e) => setNoteEdit({ id: r.platform_id, value: e.target.value })}
                          onBlur={() => saveNote(r, noteEdit.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveNote(r, noteEdit.value);
                            if (e.key === "Escape") setNoteEdit(null);
                          }}
                          placeholder="Add a note…"
                          className="w-full rounded border border-ink/15 bg-ink/[0.03] px-1.5 py-0.5 text-[11px] outline-none"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setNoteEdit({ id: r.platform_id, value: r.note ?? "" })}
                          className="w-full text-left text-[11px] hover:underline"
                          style={{ color: r.note ? undefined : "rgb(var(--ink) / 0.35)" }}
                          title="Click to edit"
                        >
                          {r.note || "add note…"}
                        </button>
                      )}
                    </td>
                    <td className="py-1.5 tabular-nums text-[10px] text-text-muted">
                      {r.platform_id}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {drillRows.length === 0 && (
            <p className="text-[11px] text-text-muted py-6 text-center">
              {q.trim() ? `No match for "${q.trim()}".` : "Nothing here."}
            </p>
          )}
        </div>
      </Modal>
    </>
  );
};

export default UnclaimedEntitlementsPanel;
