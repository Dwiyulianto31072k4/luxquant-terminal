// ════════════════════════════════════════════════════════════════════
// AnnouncementsTab — admin CRUD for user-facing announcement modals
// List existing announcements + create/edit form (content, image
// upload-or-URL, CTA, audience targeting, frequency, schedule, status).
// Backend: /api/v1/admin/announcements (+ /upload-image)
// ════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useMemo } from "react";
import { announcementApi } from "../../../services/announcementApi";
import { CampaignCard } from "../../AnnouncementModal";
import { ViewportFrame } from "./ViewportFrame";
import { palette } from "../designSystem";
import { Surface, SectionHeader, StatusBadge } from "../primitives";
import { PlusIcon, EditIcon, TrashIcon, CloseIcon } from "../Icons";
import { CollectionPagination, useCollectionPagination } from "../CollectionPagination";

const AUDIENCES = [
  { value: "all", label: "Everyone" },
  { value: "role", label: "By subscription role" },
  { value: "user", label: "Specific user (ID)" },
  { value: "no_telegram", label: "Users without Telegram linked" },
  { value: "paid_outside", label: "Paid users outside VIP group" },
];
const ROLES = ["free", "subscriber", "premium", "admin"];
const STATUSES = ["draft", "active", "archived"];

// Two frames, because the card has exactly two shapes. Every width at or above
// Tailwind's `sm` (640px) renders the same floating card, so 720 stands in for
// every desktop; below it the card is a bottom sheet. Scaled to fit the form,
// never resized — a resized frame would change the media query being shown.
const PREVIEW_FRAMES = (phoneShape) => [
  phoneShape === "landscape"
    ? { key: "phone", w: 740, h: 380, scale: 0.62, label: "Phone landscape 740x380" }
    : { key: "phone", w: 390, h: 760, scale: 0.62, label: "Phone 390x760" },
  { key: "desktop", w: 720, h: 620, scale: 0.62, label: "Desktop 720x620 and wider" },
];

const EMPTY = {
  title: "",
  badge: "",
  body: "",
  image_url: "",
  cta_label: "",
  cta_url: "",
  audience: "all",
  target_role: "subscriber",
  target_user_id: "",
  max_shows: 3,
  cooldown_hours: 72,
  status: "draft",
  starts_at: "",
  ends_at: "",
};

const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

// <input type="datetime-local"> speaks naive local wall-clock time; the API
// speaks UTC. With no conversion either way the two silently disagree by the
// operator's own offset — and the failure is invisible, because the row looks
// correct in the form. A campaign set to start "now" from Jakarta (UTC+7) was
// stored as 18:57 UTC and sat unseen for seven hours, reading as "the modal is
// broken". Convert on the way in and on the way out.
const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const toUtcIso = (local) => {
  if (!local) return null;
  const d = new Date(local); // a bare "YYYY-MM-DDTHH:mm" is parsed as local time
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const inputCls =
  "w-full px-3 py-2 rounded-md bg-ink/[0.03] border border-ink/[0.08] text-text-primary text-xs " +
  "placeholder:text-text-primary/30 focus:outline-none focus:border-ink/20 transition-colors";
const labelCls = "block text-[10px] uppercase tracking-wider text-text-primary/40 font-mono mb-1.5";

export const AnnouncementsTab = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null = list view; object = form
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [phoneShape, setPhoneShape] = useState("portrait");

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (!query) return true;
      return [item.title, item.badge, item.body, item.audience]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [items, search, statusFilter]);
  const announcementPages = useCollectionPagination(filteredItems, 8);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await announcementApi.list();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setForm(EMPTY);
    setEditing("new");
    setErr("");
  };
  const openEdit = (a) => {
    setForm({
      ...EMPTY,
      ...a,
      title: a.title ?? "",
      badge: a.badge ?? "",
      body: a.body ?? "",
      image_url: a.image_url ?? "",
      cta_label: a.cta_label ?? "",
      cta_url: a.cta_url ?? "",
      target_user_id: a.target_user_id ?? "",
      starts_at: toLocalInput(a.starts_at),
      ends_at: toLocalInput(a.ends_at),
    });
    setEditing(a.id);
    setErr("");
  };
  const cancel = () => {
    setEditing(null);
    setForm(EMPTY);
    setErr("");
  };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr("");
    try {
      const res = await announcementApi.uploadImage(file);
      if (res?.image_url) set("image_url", res.image_url);
    } catch {
      setErr("Image upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!form.title.trim()) {
      setErr("Title is required.");
      return;
    }
    setSaving(true);
    setErr("");
    const payload = {
      ...form,
      badge: form.badge?.trim() || null,
      target_user_id:
        form.audience === "user" && form.target_user_id ? Number(form.target_user_id) : null,
      target_role: form.audience === "role" ? form.target_role : null,
      max_shows: Number(form.max_shows) || 1,
      cooldown_hours: Number(form.cooldown_hours) || 1,
      starts_at: toUtcIso(form.starts_at),
      ends_at: toUtcIso(form.ends_at),
    };
    try {
      if (editing === "new") await announcementApi.create(payload);
      else await announcementApi.update(editing, payload);
      cancel();
      load();
    } catch (e) {
      setErr(e?.response?.data?.detail || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this announcement?")) return;
    try {
      await announcementApi.remove(id);
      load();
    } catch {
      /* ignore */
    }
  };

  // ── FORM VIEW ──
  if (editing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <SectionHeader
            title={editing === "new" ? "New Announcement" : `Edit Announcement #${editing}`}
          />
          <button
            onClick={cancel}
            className="p-1.5 rounded-md hover:bg-ink/[0.06] text-text-primary/50 hover:text-text-primary transition-colors"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <Surface className="p-5 space-y-4">
          {err && (
            <div
              className="px-3 py-2 rounded-md text-[11px]"
              style={{
                background: "rgb(var(--neg) / 0.08)",
                color: palette.red[300],
                border: "1px solid rgb(var(--neg) / 0.2)",
              }}
            >
              {err}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
            <div>
              <label className={labelCls}>Title *</label>
              <input
                className={inputCls}
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Announcement title"
              />
            </div>
            <div>
              <label className={labelCls}>Badge</label>
              <input
                className={inputCls}
                value={form.badge}
                onChange={(e) => set("badge", e.target.value)}
                placeholder="NEW"
                maxLength={14}
              />
              <p className="mt-1 text-[10px] text-text-muted">
                Pill on the image. Blank = none.
              </p>
            </div>
          </div>

          <div>
            <label className={labelCls}>Body</label>
            <textarea
              className={inputCls}
              rows={3}
              value={form.body}
              onChange={(e) => set("body", e.target.value)}
              placeholder="Message body (optional)"
            />
          </div>

          {/* image: upload OR url */}
          <div>
            <label className={labelCls}>Image (optional)</label>
            <div className="flex items-center gap-2">
              <input
                className={inputCls}
                value={form.image_url}
                onChange={(e) => set("image_url", e.target.value)}
                placeholder="Paste image URL or upload →"
              />
              <label className="shrink-0 px-3 py-2 rounded-md bg-ink/[0.04] border border-ink/[0.08] text-text-primary/70 text-[10px] uppercase tracking-wider font-mono cursor-pointer hover:bg-ink/[0.07] transition-colors">
                {uploading ? "..." : "Upload"}
                <input type="file" accept="image/*" className="hidden" onChange={onUpload} />
              </label>
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-text-muted">
              One image serves every device: the card is 375-420px wide
              everywhere, so the artwork is always{" "}
              <span className="font-mono text-text-secondary">16:9</span> — a
              PowerPoint or Keynote slide exported at{" "}
              <span className="font-mono text-text-secondary">1920x1080</span>{" "}
              fits exactly, nothing cropped. Any other ratio is cropped from the
              centre, and on a landscape phone the tile loses height, so keep
              anything that must be read away from the edges. Check it in
              Preview below.
            </p>
          </div>

          {/* CTA */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Button label</label>
              <input
                className={inputCls}
                value={form.cta_label}
                onChange={(e) => set("cta_label", e.target.value)}
                placeholder="e.g. Learn more"
              />
            </div>
            <div>
              <label className={labelCls}>Button link</label>
              <input
                className={inputCls}
                value={form.cta_url}
                onChange={(e) => set("cta_url", e.target.value)}
                placeholder="/pricing or https://..."
              />
            </div>
          </div>

          {/* audience */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Audience</label>
              <select
                className={inputCls}
                value={form.audience}
                onChange={(e) => set("audience", e.target.value)}
              >
                {AUDIENCES.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            {form.audience === "role" && (
              <div>
                <label className={labelCls}>Target role</label>
                <select
                  className={inputCls}
                  value={form.target_role}
                  onChange={(e) => set("target_role", e.target.value)}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {form.audience === "user" && (
              <div>
                <label className={labelCls}>User ID</label>
                <input
                  className={inputCls}
                  type="number"
                  value={form.target_user_id}
                  onChange={(e) => set("target_user_id", e.target.value)}
                  placeholder="e.g. 5"
                />
              </div>
            )}
          </div>

          {/* frequency */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Max shows / user</label>
              <input
                className={inputCls}
                type="number"
                min={1}
                value={form.max_shows}
                onChange={(e) => set("max_shows", e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Cooldown (hours)</label>
              <input
                className={inputCls}
                type="number"
                min={1}
                value={form.cooldown_hours}
                onChange={(e) => set("cooldown_hours", e.target.value)}
              />
            </div>
          </div>

          {/* schedule + status */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Status</label>
              <select
                className={inputCls}
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Starts</label>
              <input
                className={inputCls}
                type="datetime-local"
                value={form.starts_at}
                onChange={(e) => set("starts_at", e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Ends</label>
              <input
                className={inputCls}
                type="datetime-local"
                value={form.ends_at}
                onChange={(e) => set("ends_at", e.target.value)}
              />
            </div>
          </div>

          {/* Live preview, at two real viewports. See ViewportFrame for why
              this cannot be done with a CSS-sized box. */}
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <label className={labelCls + " !mb-0"}>Preview</label>
              {[
                { k: "portrait", label: "Portrait" },
                { k: "landscape", label: "Landscape" },
              ].map((o) => (
                <button
                  key={o.k}
                  type="button"
                  onClick={() => setPhoneShape(o.k)}
                  className={
                    "rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors " +
                    (phoneShape === o.k
                      ? "bg-ink/[0.10] text-text-primary"
                      : "text-text-muted hover:text-text-primary")
                  }
                >
                  Phone {o.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-start gap-4">
              {PREVIEW_FRAMES(phoneShape).map((f) => (
                <div key={f.key}>
                  <ViewportFrame width={f.w} height={f.h} scale={f.scale}>
                    <div
                      className="fixed inset-0 flex flex-col"
                      style={{ background: "rgb(var(--surface))" }}
                    >
                      {/* something under the scrim, so the blur has work to do */}
                      <div className="flex-1 space-y-2.5 p-5">
                        {Array.from({ length: 12 }).map((_, i) => (
                          <div key={i} className="h-5 rounded bg-ink/[0.06]" />
                        ))}
                      </div>
                    </div>
                    <div className="lq-modal-safe lq-scrim-bg fixed inset-0 flex items-end justify-center p-0 sm:items-center sm:p-4">
                      <CampaignCard
                        asDialog={false}
                        ann={{
                          title: form.title || "Announcement title",
                          body: form.body,
                          badge: form.badge,
                          image_url: form.image_url,
                          cta_label: form.cta_label,
                          cta_url: form.cta_url,
                        }}
                        onDismiss={() => {}}
                        onAct={(e) => e.preventDefault()}
                      />
                    </div>
                  </ViewportFrame>
                  <p className="mt-1.5 font-mono text-[9px] uppercase tracking-wider text-text-muted">
                    {f.label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 rounded-md text-[11px] uppercase tracking-wider font-bold font-mono transition-all disabled:opacity-50"
              style={{ background: palette.gold[500], color: "rgb(var(--accent-fg))" }}
            >
              {saving ? "Saving..." : editing === "new" ? "Create" : "Save changes"}
            </button>
            <button
              onClick={cancel}
              className="px-4 py-2 rounded-md text-[11px] uppercase tracking-wider font-mono text-text-primary/50 hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
          </div>
        </Surface>
      </div>
    );
  }

  // ── LIST VIEW ──
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionHeader title="Announcements" subtitle="Modal messages shown to users in-app" />
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md text-[11px] uppercase tracking-wider font-bold font-mono transition-all"
          style={{ background: palette.gold[500], color: "rgb(var(--accent-fg))" }}
        >
          <PlusIcon size={14} /> New
        </button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            announcementPages.resetPage();
          }}
          placeholder="Search title, message, or audience…"
          className="min-w-0 flex-1 rounded-xl border border-ink/[0.08] bg-surface-raised px-3 py-2.5 text-xs text-text-primary outline-none placeholder:text-text-muted/60 focus:border-accent/35"
        />
        <select
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value);
            announcementPages.resetPage();
          }}
          className="rounded-xl border border-ink/[0.08] bg-surface-raised px-3 py-2.5 text-xs font-medium text-text-primary outline-none focus:border-accent/35"
        >
          <option value="all">All statuses</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="lqsk-group space-y-2">
          {[...Array(4)].map((_, i) => (
            <Surface key={i} className="p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-md bg-ink/[0.05]" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/3 rounded bg-ink/[0.05]" />
                <div className="h-2.5 w-2/3 rounded bg-ink/[0.03]" />
              </div>
            </Surface>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <Surface className="p-8 text-center text-text-primary/40 text-xs">
          {items.length ? "No announcements match this view." : "No announcements yet. Click “New” to create one."}
        </Surface>
      ) : (
        <div className="space-y-2">
          {announcementPages.pagedItems.map((a) => (
            <Surface key={a.id} className="p-3.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-text-primary text-sm font-medium truncate">{a.title}</span>
                  {a.badge && (
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider"
                      style={{ background: "rgb(var(--accent))", color: "rgb(var(--accent-fg))" }}
                    >
                      {a.badge}
                    </span>
                  )}
                  <StatusBadge status={a.status} label={a.status} />
                </div>
                <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-text-primary/40">
                  <span>{AUDIENCES.find((x) => x.value === a.audience)?.label || a.audience}</span>
                  <span>·</span>
                  <span>{a.view_count || 0} seen</span>
                  <span>·</span>
                  <span>
                    max {a.max_shows} / {a.cooldown_hours}h
                  </span>
                  {a.ends_at && (
                    <>
                      <span>·</span>
                      <span>ends {fmtDate(a.ends_at)}</span>
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={() => openEdit(a)}
                className="p-1.5 rounded-md hover:bg-ink/[0.06] text-text-primary/50 hover:text-text-primary transition-colors"
              >
                <EditIcon size={14} />
              </button>
              <button
                onClick={() => del(a.id)}
                className="p-1.5 rounded-md hover:bg-ink/[0.06] text-text-primary/50 hover:text-loss transition-colors"
              >
                <TrashIcon size={14} />
              </button>
            </Surface>
          ))}
        </div>
      )}
      <CollectionPagination
        page={announcementPages.page}
        totalPages={announcementPages.totalPages}
        total={announcementPages.total}
        pageSize={announcementPages.pageSize}
        onPageChange={announcementPages.setPage}
        onPageSizeChange={announcementPages.setPageSize}
        pageSizeOptions={[8, 16, 32]}
        itemLabel="announcements"
      />
    </div>
  );
};

export default AnnouncementsTab;
