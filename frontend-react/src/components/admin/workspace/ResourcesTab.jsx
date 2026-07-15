// src/components/admin/workspace/ResourcesTab.jsx
// ════════════════════════════════════════════════════════════════════
// Management System → Resources. Central CMS for the Resource Hub:
// list / filter / create / edit / publish / feature / delete every
// article, PDF guide, video and link — mirrors the inline controls on
// the public hub, but as a full table.
// ════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useMemo } from 'react';
import { resourcesApi, coverUrl, youtubeThumb } from '../../../services/resourcesApi';
import ResourceEditor from '../../resources/ResourceEditor';
import { palette, tint, surface, motion } from '../designSystem';

const TYPE_META = {
  article: { label: 'Research', color: palette.blue[400] },
  pdf:     { label: 'Guide',    color: palette.red[400] },
  video:   { label: 'Video',    color: palette.orange[400] },
  link:    { label: 'Link',     color: palette.green[400] },
};

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'article', label: 'Research' },
  { id: 'video', label: 'Videos' },
  { id: 'pdf', label: 'Guides' },
  { id: 'link', label: 'Links' },
  { id: 'draft', label: 'Drafts' },
];

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const cardCover = (r) => coverUrl(r) || (r.type === 'video' ? youtubeThumb(r.source_url) : null);

const Stat = ({ label, value, color }) => (
  <div className="rounded-xl px-4 py-3" style={{ background: tint(color, 0.05), border: `1px solid ${tint(color, 0.18)}` }}>
    <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: tint(color, 0.75) }}>{label}</div>
    <div className="text-xl font-bold tabular-nums" style={{ color }}>{value}</div>
  </div>
);

const Pill = ({ children, color }) => (
  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap" style={{ background: tint(color, 0.14), color }}>
    {children}
  </span>
);

export const ResourcesTab = () => {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const data = await resourcesApi.list({ include_drafts: true, page_size: 100 });
      setItems(data.items || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { resourcesApi.categories().then(setCategories).catch(() => {}); }, []);

  const stats = useMemo(() => {
    const s = { total: items.length, article: 0, pdf: 0, video: 0, link: 0, draft: 0 };
    items.forEach((r) => {
      s[r.type] = (s[r.type] || 0) + 1;
      if (r.status === 'draft') s.draft += 1;
    });
    return s;
  }, [items]);

  const filtered = useMemo(() => {
    let list = items;
    if (filter === 'draft') list = list.filter((r) => r.status === 'draft');
    else if (filter !== 'all') list = list.filter((r) => r.type === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.title?.toLowerCase().includes(q) || r.category?.toLowerCase().includes(q) || r.tags?.toLowerCase().includes(q));
    }
    return list;
  }, [items, filter, search]);

  const handleSaved = () => { setEditing(null); fetchAll(); resourcesApi.categories().then(setCategories).catch(() => {}); };

  const toggleFeatured = async (r) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('is_featured', r.is_featured ? 'false' : 'true');
      const updated = await resourcesApi.update(r.id, fd);
      setItems((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_featured: updated.is_featured } : x)));
    } catch (e) { /* noop */ } finally { setBusy(false); }
  };

  const togglePublish = async (r) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('resource_status', r.status === 'published' ? 'draft' : 'published');
      const updated = await resourcesApi.update(r.id, fd);
      setItems((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: updated.status } : x)));
    } catch (e) { /* noop */ } finally { setBusy(false); }
  };

  const handleDelete = async (r) => {
    try {
      await resourcesApi.remove(r.id);
      setItems((prev) => prev.filter((x) => x.id !== r.id));
      setDeleteConfirm(null);
    } catch (e) {
      alert('Failed to delete: ' + (e?.response?.data?.detail || e.message));
    }
  };

  return (
    <div className="space-y-5">
      {/* Stat row */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
        <Stat label="Total" value={stats.total} color={palette.gold[300]} />
        <Stat label="Research" value={stats.article} color={palette.blue[400]} />
        <Stat label="Videos" value={stats.video} color={palette.orange[400]} />
        <Stat label="Guides" value={stats.pdf} color={palette.red[400]} />
        <Stat label="Links" value={stats.link} color={palette.green[400]} />
        <Stat label="Drafts" value={stats.draft} color={palette.amber[400]} />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search resources…"
            className="w-full rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none"
            style={{ background: surface.sunken.bg, border: `1px solid ${surface.sunken.border}` }}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={filter === f.id
                ? { background: tint(palette.gold[300], 0.18), color: palette.gold[300], border: `1px solid ${tint(palette.gold[300], 0.3)}` }
                : { background: surface.sunken.bg, color: 'rgba(255,255,255,0.55)', border: `1px solid ${surface.sunken.border}` }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setEditing({})}
          className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-black"
          style={{ background: 'linear-gradient(135deg, #f0d890, #d4a853 50%, #b88a3e)' }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
          New Resource
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: surface.base.bg, border: `1px solid ${surface.base.border}` }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{ background: surface.raised.bg }}>
                {['Resource', 'Type', 'Category', 'Status', 'Featured', 'Date', ''].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-[10px] uppercase tracking-wider font-semibold text-white/40 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: surface.base.border }}>
                    <td colSpan={7} className="px-4 py-4"><div className="h-8 lqsk" style={{ background: 'rgba(255,255,255,0.04)' }} /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-white/40 text-sm">No resources match this view.</td></tr>
              ) : (
                filtered.map((r) => {
                  const tm = TYPE_META[r.type] || TYPE_META.article;
                  const cover = cardCover(r);
                  return (
                    <tr key={r.id} className="border-t hover:bg-white/[0.02]" style={{ borderColor: surface.base.border, transition: motion.base }}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0 max-w-[360px]">
                          <div className="w-12 h-9 rounded-md overflow-hidden flex-shrink-0" style={{ background: 'rgba(255,255,255,0.05)' }}>
                            {cover ? <img src={cover} alt="" className="w-full h-full object-cover" /> : null}
                          </div>
                          <div className="min-w-0">
                            <div className="text-white font-medium truncate">{r.title}</div>
                            {r.author_name && <div className="text-[11px] text-white/40 truncate">{r.author_name}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3"><Pill color={tm.color}>{tm.label}</Pill></td>
                      <td className="px-4 py-3 text-white/60 whitespace-nowrap">{r.category}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => togglePublish(r)} disabled={busy} title="Toggle publish">
                          <Pill color={r.status === 'published' ? palette.green[400] : palette.amber[400]}>
                            {r.status === 'published' ? 'Published' : 'Draft'}
                          </Pill>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleFeatured(r)} disabled={busy} title="Toggle featured" className="text-lg leading-none" style={{ color: r.is_featured ? palette.gold[300] : 'rgba(255,255,255,0.2)' }}>
                          {r.is_featured ? '★' : '☆'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-white/40 text-xs whitespace-nowrap">{fmtDate(r.published_at || r.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => setEditing(r)} className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-500/10" title="Edit">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button onClick={() => setDeleteConfirm(r)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10" title="Delete">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <ResourceEditor
          resource={editing.id ? editing : null}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center bg-black/70 backdrop-blur-sm p-0 sm:p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="rounded-t-3xl sm:rounded-2xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-w-sm w-full" style={{ background: surface.glass.bg, border: `1px solid ${tint(palette.red[400], 0.3)}` }} onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center -mt-2 mb-3 sm:hidden" aria-hidden="true">
              <div className="h-1 w-10 rounded-full bg-white/25" />
            </div>
            <h3 className="text-white font-semibold text-center mb-2">Delete resource?</h3>
            <p className="text-white/50 text-sm text-center mb-5">"{deleteConfirm.title}" will be hidden from the hub.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white/70 hover:text-white" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 py-2.5 rounded-xl text-sm font-bold" style={{ background: tint(palette.red[400], 0.2), color: palette.red[400], border: `1px solid ${tint(palette.red[400], 0.3)}` }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourcesTab;
