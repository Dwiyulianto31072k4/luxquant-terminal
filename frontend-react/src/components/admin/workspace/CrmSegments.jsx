// src/components/admin/workspace/CrmSegments.jsx
//
// Behavioural segments — who to talk to today.
//
// The Users tab already answers "what are they" (subscriber / free / lifetime).
// This answers "who needs a message". They are different questions: a lifetime
// subscriber who has not opened the app in a month is healthy by role and a
// problem by behaviour.
//
// Counts come from the same SQL fragment that builds each list, so a card can
// never disagree with what it opens.
import { useCallback, useEffect, useMemo, useState } from "react";
import { workspaceApi } from "../../../services/workspaceApi";
import { UserDetailDrawer } from "../UserDetailDrawer";
import { palette, tint } from "../designSystem";
import Modal from "../../ui/Modal";

const TONE = {
  red: palette.red[400],
  amber: palette.amber[400],
  green: palette.green[400],
  muted: "rgb(var(--fg-muted))",
};

// Jump to the Finance tab with the payments list already filtered to this
// person. Written through the hash, which AdminWorkspacePage already listens
// on, so this needs no prop drilling through FollowupTab -- and the resulting
// URL can be pasted to a colleague.
const goToPayments = (username) => {
  window.location.hash = `finance?q=${encodeURIComponent(username)}`;
};

const ACCESS_TONE = {
  active: palette.green[400],
  "lifetime/granted": palette.gold[300],
  expired: palette.red[400],
  none: "rgb(var(--fg-muted))",
};

// "Last seen" is whichever happened later. Login alone under-reports: a session
// can stay signed in for weeks, so someone using the product daily can show a
// login date from last month.
const lastSeen = (m) => {
  const a = m.last_activity_at ? new Date(m.last_activity_at).getTime() : 0;
  const b = m.last_login_at ? new Date(m.last_login_at).getTime() : 0;
  const t = Math.max(a, b);
  return t ? new Date(t).toISOString() : null;
};

const fmtWhen = (iso) => {
  if (!iso) return "never";
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const m = Math.floor(days / 30);
  return `${m}mo ago`;
};

const SegmentCard = ({ seg, active, onClick }) => {
  const color = TONE[seg.tone] || TONE.muted;
  return (
    <button
      type="button"
      onClick={onClick}
      title={seg.hint}
      className="rounded-xl px-3.5 py-3 text-left transition-colors"
      style={{
        background: active ? tint(color, 0.14) : "rgb(var(--surface-secondary) / 0.4)",
        border: `1px solid ${active ? tint(color, 0.5) : "rgb(var(--ink) / 0.06)"}`,
      }}
    >
      <p className="text-[10px] uppercase tracking-wider" style={{ color: "rgb(var(--fg-muted))" }}>
        {seg.label}
      </p>
      <p className="mt-1 text-[24px] font-bold tabular-nums leading-none" style={{ color }}>
        {seg.count == null ? "–" : seg.count}
      </p>
      <p className="mt-1.5 text-[10.5px] leading-snug" style={{ color: "rgb(var(--fg-muted))" }}>
        {seg.hint}
      </p>
    </button>
  );
};

const CrmSegments = ({ onToast }) => {
  const [segments, setSegments] = useState([]);
  const [active, setActive] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [drawerUserId, setDrawerUserId] = useState(null);
  const [error, setError] = useState(null);

  const loadSegments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await workspaceApi.getCrmSegments();
      setSegments(res.segments || []);
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.detail || "Could not load segments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSegments();
  }, [loadSegments]);

  // Fetch only. Kept separate from the toggle below so callers that just want
  // fresh data (after an edit in the drawer) cannot accidentally close the
  // list they are looking at.
  const fetchSegment = useCallback(
    async (key) => {
      if (!key) return;
      setListLoading(true);
      try {
        setDetail(await workspaceApi.getCrmSegment(key, 200));
      } catch (e) {
        onToast?.(e?.response?.data?.detail || "Could not load that segment", "error");
        setDetail(null);
      } finally {
        setListLoading(false);
      }
    },
    [onToast]
  );

  const openSegment = useCallback(
    (key) => {
      if (active === key) {
        setActive(null);
        setDetail(null);
        return;
      }
      setActive(key);
      fetchSegment(key);
    },
    [active, fetchSegment]
  );

  const unreachable = useMemo(
    () => (detail?.members || []).filter((m) => !m.reachable).length,
    [detail]
  );

  return (
    <div className="mb-5">
      <div className="mb-2.5 flex items-end justify-between gap-3">
        <div>
          <p className="mb-1 font-mono text-[9.5px] font-medium uppercase tracking-[0.16em] text-text-muted">
            CRM · who to talk to
          </p>
          <h3 className="font-display text-[15px] font-semibold tracking-tight text-text-primary">
            Behavioural segments
          </h3>
        </div>
        <button
          type="button"
          onClick={loadSegments}
          className="rounded-md px-2 py-1 text-[10px] font-semibold"
          style={{
            background: tint(palette.gold[300], 0.1),
            border: `1px solid ${tint(palette.gold[300], 0.25)}`,
            color: palette.gold[300],
          }}
        >
          Refresh
        </button>
      </div>

      {error ? (
        <p className="text-[12px]" style={{ color: palette.red[300] }}>
          {error}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
          {(loading ? Array.from({ length: 7 }) : segments).map((seg, i) =>
            seg ? (
              <SegmentCard
                key={seg.key}
                seg={seg}
                active={active === seg.key}
                onClick={() => openSegment(seg.key)}
              />
            ) : (
              <div
                key={i}
                className="h-[104px] animate-pulse rounded-xl"
                style={{ background: "rgb(var(--ink) / 0.05)" }}
              />
            )
          )}
        </div>
      )}

      {/* A modal, not an inline panel. The list can run to 460 rows; expanding
          that under the cards pushed the whole tab down and made the segment
          you were comparing against scroll out of view. A modal keeps the
          cards where they were and hands the list the full screen. */}
      <Modal
        isOpen={!!active}
        onClose={() => {
          setActive(null);
          setDetail(null);
        }}
        eyebrow="CRM segment"
        title={detail?.label || "Loading…"}
        subtitle={detail?.hint}
        size="xl"
      >
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] text-text-muted">
            <span className="font-semibold tabular-nums text-text-primary">
              {detail?.total ?? 0}
            </span>{" "}
            people
            {detail && detail.total > (detail.members || []).length
              ? ` · showing first ${(detail.members || []).length}`
              : ""}
          </p>
          {unreachable > 0 && (
            <p className="text-[11px]" style={{ color: palette.amber[400] }}>
              {unreachable} have no Telegram — a follow-up assigned to them is a task
              nobody can complete.
            </p>
          )}
        </div>

        {listLoading ? (
          <p className="py-10 text-center text-[12px] text-text-muted">Loading…</p>
        ) : !detail?.members?.length ? (
          <p className="py-10 text-center text-[12px] text-text-muted">
            Nobody in this segment right now.
          </p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-ink/[0.07]">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 z-10 bg-surface-raised">
                <tr className="text-left text-[10px] uppercase tracking-wider text-text-muted">
                  <th className="px-3 py-2 font-medium">User</th>
                  <th className="px-2 py-2 font-medium">Acquisition</th>
                  <th className="px-2 py-2 font-medium">Access</th>
                  <th className="px-2 py-2 font-medium">Last seen</th>
                  <th className="px-2 py-2 font-medium">Activity</th>
                  <th className="px-2 py-2 font-medium">Paid</th>
                  <th className="px-2 py-2 font-medium">Reach</th>
                </tr>
              </thead>
              <tbody>
                {detail.members.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => setDrawerUserId(m.id)}
                    className="cursor-pointer border-t border-ink/[0.05] hover:bg-ink/[0.04]"
                  >
                    <td className="px-3 py-2">
                      <span className="font-medium text-text-primary">{m.username}</span>
                      {/* This said "N failed", which was wrong in both
                          directions: nothing failed (not one of these ever
                          carried a transaction hash), and it counted the
                          system's own plan-switch cancellations against the
                          user. What it really means is an invoice that was
                          created and never paid. */}
                      {m.unpaid_invoices > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            goToPayments(m.username);
                          }}
                          className="ml-1.5 rounded px-1 py-0.5 text-[9.5px] font-semibold hover:brightness-125"
                          style={{
                            background: tint(palette.amber[400], 0.14),
                            color: palette.amber[400],
                          }}
                          title={
                            `${m.unpaid_invoices} invoice${m.unpaid_invoices > 1 ? "s" : ""} created and never paid — ` +
                            "no transaction was ever submitted. Invoices expire 24h after they are created." +
                            (m.switched_plan
                              ? ` (${m.switched_plan} more were auto-cancelled because they switched plan — not counted here.)`
                              : "") +
                            "\nClick to open these payments."
                          }
                        >
                          {m.unpaid_invoices} unpaid ↗
                        </button>
                      )}
                      {/* Zero today. If it ever fires it is a genuine payment
                          bug, so it must not look like an abandonment. */}
                      {m.failed_verify > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            goToPayments(m.username);
                          }}
                          className="ml-1.5 rounded px-1 py-0.5 text-[9.5px] font-semibold hover:brightness-125"
                          style={{
                            background: tint(palette.red[400], 0.14),
                            color: palette.red[400],
                          }}
                          title="Submitted a transaction hash that did not verify. This is a real payment failure — open it."
                        >
                          {m.failed_verify} failed verify ↗
                        </button>
                      )}
                    </td>
                    <td
                      className="max-w-[190px] px-2 py-2"
                      title={[
                        m.acq_source,
                        m.acq_medium,
                        m.acq_campaign,
                        m.acq_content,
                        m.acq_path,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    >
                      <div className="font-medium text-text-primary">
                        {m.acq_source || "—"}
                      </div>
                      {(m.acq_campaign || m.acq_content) && (
                        <div className="truncate text-[10.5px] text-text-muted">
                          {[m.acq_campaign, m.acq_content]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{
                          background: tint(
                            ACCESS_TONE[m.access] || ACCESS_TONE.none,
                            0.14
                          ),
                          color: ACCESS_TONE[m.access] || ACCESS_TONE.none,
                        }}
                      >
                        {m.access || m.role}
                      </span>
                    </td>
                    <td className="px-2 py-2 tabular-nums text-text-muted">
                      {fmtWhen(lastSeen(m))}
                    </td>
                    <td className="px-2 py-2 text-text-muted">
                      <span className="tabular-nums">{m.events_total ?? "–"}</span>
                      {m.last_feature && (
                        <span className="ml-1.5 text-[10.5px] opacity-70">
                          {m.last_feature}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 tabular-nums">
                      {m.paid_usdt > 0 ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            goToPayments(m.username);
                          }}
                          className="hover:underline"
                          style={{ color: palette.green[400] }}
                          title="Open this person's payments"
                        >
                          ${Math.round(m.paid_usdt)}
                        </button>
                      ) : (
                        <span className="text-text-muted">–</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {m.reachable ? (
                        <span style={{ color: palette.green[400] }}>
                          @{m.telegram_username || m.telegram_id}
                        </span>
                      ) : (
                        <span style={{ color: palette.amber[400] }}>no telegram</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {drawerUserId && (
        <UserDetailDrawer
          userId={drawerUserId}
          onClose={() => setDrawerUserId(null)}
          onUserUpdated={() => {
            loadSegments();
            fetchSegment(active);
          }}
          onToast={onToast}
          canWrite
        />
      )}
    </div>
  );
};

export default CrmSegments;
