// src/components/ResourcesPage.jsx
// ════════════════════════════════════════════════════════════════════
// LuxQuant Resource Hub — CoinGecko-Research-style content hub.
// Research articles · PDF guides · YouTube videos · external links,
// all in one mixed feed with type + category filtering, a featured hero,
// and inline admin quick-controls.
// ════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import AssistantWidget from './assistant/AssistantWidget';
import { resourcesApi, coverUrl, youtubeThumb } from '../services/resourcesApi';
import ResourceReader from './resources/ResourceReader';
import ResourceEditor from './resources/ResourceEditor';
import { stripMarkdown } from './resources/mdRender';

const TYPE_TABS = [
  { id: 'all',     label: 'All' },
  { id: 'article', label: 'Research' },
  { id: 'video',   label: 'Videos' },
  { id: 'pdf',     label: 'Guides' },
  { id: 'link',    label: 'Links' },
];

const TYPE_META = {
  article: { label: 'Research', color: '#60a5fa' },
  pdf:     { label: 'Guide',    color: '#f87171' },
  video:   { label: 'Video',    color: '#f97316' },
  link:    { label: 'Link',     color: '#34d399' },
};

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

const cardCover = (r) => coverUrl(r) || (r.type === 'video' ? youtubeThumb(r.source_url) : null);

// ── Type + category badges ──
const TypeBadge = ({ type }) => {
  const m = TYPE_META[type] || TYPE_META.article;
  return (
    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold" style={{ background: `${m.color}22`, color: m.color }}>
      {m.label}
    </span>
  );
};

// ── Featured hero card ──
const HeroCard = ({ resource, onOpen, isAdmin, onEdit, onDelete }) => {
  const cover = cardCover(resource);
  return (
    <div
      className="tip-card group relative glass-card rounded-2xl border border-gold-primary/15 overflow-hidden cursor-pointer grid grid-cols-1 lg:grid-cols-2"
      onClick={() => onOpen(resource)}
    >
      <div className="relative h-56 lg:h-full min-h-[240px] overflow-hidden bg-gradient-to-br from-gold-primary/10 to-orange-500/5">
        {cover ? (
          <img src={cover} alt={resource.title} className="w-full h-full object-cover tip-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-16 h-16 text-gold-primary/20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>
          </div>
        )}
        {resource.type === 'video' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur flex items-center justify-center border border-white/20">
              <svg className="w-7 h-7 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            </div>
          </div>
        )}
      </div>
      <div className="p-6 lg:p-8 flex flex-col justify-center">
        <div className="flex items-center gap-2 mb-3">
          <span className="px-2 py-0.5 rounded bg-gold-primary/15 text-gold-primary text-[10px] font-bold uppercase tracking-wider">Featured</span>
          <TypeBadge type={resource.type} />
          <span className="text-[11px] text-text-muted">{resource.category}</span>
        </div>
        <h2 className="text-xl lg:text-2xl font-bold text-white leading-tight group-hover:text-gold-primary transition-colors line-clamp-3">
          {resource.title}
        </h2>
        {resource.excerpt && <p className="text-text-muted text-sm mt-3 line-clamp-3 leading-relaxed">{stripMarkdown(resource.excerpt)}</p>}
        <div className="flex items-center gap-2 text-[11px] text-text-muted mt-4">
          {resource.author_name && <span className="text-text-secondary font-medium">{resource.author_name}</span>}
          {resource.author_name && <span>·</span>}
          <span>{fmtDate(resource.published_at || resource.created_at)}</span>
          {resource.reading_time && <><span>·</span><span>{resource.reading_time} min</span></>}
        </div>
      </div>
      {isAdmin && <AdminActions resource={resource} onEdit={onEdit} onDelete={onDelete} />}
    </div>
  );
};

// ── Standard resource card ──
const ResourceCard = ({ resource, onOpen, isAdmin, onEdit, onDelete }) => {
  const cover = cardCover(resource);
  const isVideo = resource.type === 'video';
  return (
    <div className="tip-card glass-card rounded-xl border border-gold-primary/10 overflow-hidden cursor-pointer group relative" onClick={() => onOpen(resource)}>
      <div className="relative w-full overflow-hidden bg-gradient-to-br from-gold-primary/5 to-orange-500/5" style={{ aspectRatio: '16 / 9' }}>
        {cover ? (
          <img src={cover} alt={resource.title} className="w-full h-full object-cover tip-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-11 h-11 text-gold-primary/25" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>
          </div>
        )}
        <div className="absolute top-3 left-3"><TypeBadge type={resource.type} /></div>
        {isVideo && (
          <div className="absolute inset-0 flex items-center justify-center opacity-90 group-hover:opacity-100 transition">
            <div className="w-12 h-12 rounded-full bg-black/55 backdrop-blur flex items-center justify-center border border-white/20 group-hover:scale-110 transition-transform">
              <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            </div>
          </div>
        )}
        {resource.type === 'link' && (
          <div className="absolute top-3 right-3 p-1 rounded bg-black/50 text-white/80">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] text-gold-primary/80 font-semibold uppercase tracking-wide">{resource.category}</span>
        </div>
        <h3 className="text-white font-semibold text-sm group-hover:text-gold-primary transition-colors line-clamp-2 leading-snug mb-1.5">
          {resource.title}
        </h3>
        {resource.excerpt && <p className="text-text-muted text-[11px] line-clamp-2 leading-relaxed mb-3">{stripMarkdown(resource.excerpt)}</p>}
        <div className="flex items-center justify-between text-[10px] text-text-muted">
          <span className="truncate">{resource.author_name || fmtDate(resource.published_at || resource.created_at)}</span>
          {resource.author_name && <span className="shrink-0 ml-2">{fmtDate(resource.published_at || resource.created_at)}</span>}
        </div>
      </div>
      {isAdmin && <AdminActions resource={resource} onEdit={onEdit} onDelete={onDelete} />}
    </div>
  );
};

// ── Admin hover controls ──
const AdminActions = ({ resource, onEdit, onDelete }) => (
  <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
    {resource.status === 'draft' && (
      <span className="px-2 py-1 bg-amber-500/80 text-black text-[9px] font-bold rounded-lg">DRAFT</span>
    )}
    <button onClick={(e) => { e.stopPropagation(); onEdit(resource); }} className="p-1.5 bg-black/70 backdrop-blur rounded-lg text-blue-400 hover:text-blue-300 border border-blue-500/20" title="Edit">
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
    </button>
    <button onClick={(e) => { e.stopPropagation(); onDelete(resource); }} className="p-1.5 bg-black/70 backdrop-blur rounded-lg text-red-400 hover:text-red-300 border border-red-500/20" title="Delete">
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
    </button>
  </div>
);

const ResourcesPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.is_admin === true || user?.role === 'admin';

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeType, setActiveType] = useState('all');
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');

  const [reading, setReading] = useState(null);
  const [editing, setEditing] = useState(null);      // resource object or {} for new
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const params = { page_size: 100 };
      if (activeType !== 'all') params.type = activeType;
      if (activeCategory !== 'all') params.category = activeCategory;
      if (search.trim()) params.search = search.trim();
      if (isAdmin) params.include_drafts = true;
      const data = await resourcesApi.list(params);
      setItems(data.items || []);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to load resources');
    } finally {
      setLoading(false);
    }
  }, [activeType, activeCategory, search, isAdmin]);

  useEffect(() => { fetchAll(); }, [activeType, activeCategory]); // eslint-disable-line
  useEffect(() => { resourcesApi.categories().then(setCategories).catch(() => {}); }, []);

  const openResource = (r) => {
    if (r.type === 'link' && r.source_url) {
      window.open(r.source_url, '_blank', 'noopener,noreferrer');
      return;
    }
    setReading(r);
  };

  const handleSaved = () => { setEditing(null); setLoading(true); fetchAll(); resourcesApi.categories().then(setCategories).catch(() => {}); };

  const handleDelete = async (r) => {
    try {
      await resourcesApi.remove(r.id);
      setItems((prev) => prev.filter((x) => x.id !== r.id));
      setDeleteConfirm(null);
    } catch (err) {
      alert('Failed to delete: ' + (err?.response?.data?.detail || err.message));
    }
  };

  const featured = items.find((r) => r.is_featured) || null;
  const rest = featured ? items.filter((r) => r.id !== featured.id) : items;

  const cardProps = {
    onOpen: openResource,
    isAdmin,
    onEdit: (r) => setEditing(r),
    onDelete: (r) => setDeleteConfirm(r),
  };

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="space-y-5">
      <style>{`
        @keyframes fadeInUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        .tip-fade{animation:fadeInUp .4s ease-out forwards;opacity:0}
        .tip-fade-1{animation-delay:.04s}.tip-fade-2{animation-delay:.08s}.tip-fade-3{animation-delay:.12s}
        .tip-fade-4{animation-delay:.16s}.tip-fade-5{animation-delay:.2s}.tip-fade-6{animation-delay:.24s}
        .tip-card{transition:all .3s cubic-bezier(.4,0,.2,1)}
        .tip-card:hover{transform:translateY(-4px);border-color:rgba(212,175,55,.3);box-shadow:0 12px 40px rgba(0,0,0,.4),0 0 0 1px rgba(212,175,55,.15)}
        .tip-card:hover .tip-cover{transform:scale(1.05)}
        .tip-cover{transition:transform .5s cubic-bezier(.4,0,.2,1)}
      `}</style>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
          <h2 className="font-display text-2xl font-semibold text-white">{t('resources.title', { defaultValue: 'Resources' })}</h2>
          <span className="px-2 py-1 bg-gold-primary/10 text-gold-primary text-xs font-medium rounded">
            {items.length}
          </span>
        </div>
        {isAdmin && (
          <button onClick={() => setEditing({})} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-gold-dark to-gold-primary text-bg-primary rounded-xl text-sm font-bold hover:shadow-gold-glow transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            {t('resources.new', { defaultValue: 'New Resource' })}
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="glass-card rounded-xl p-4 border border-gold-primary/10 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <form onSubmit={(e) => { e.preventDefault(); setLoading(true); fetchAll(); }} className="flex-1 min-w-[200px]">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </span>
              <input type="text" placeholder={t('resources.search', { defaultValue: 'Search resources…' })} value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-bg-card border border-gold-primary/15 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-text-muted focus:outline-none focus:border-gold-primary/40 transition-colors" />
            </div>
          </form>
          <div className="flex flex-wrap gap-2">
            {TYPE_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setActiveType(tab.id); setLoading(true); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeType === tab.id ? 'bg-gold-primary/20 text-gold-primary border border-gold-primary/30' : 'bg-bg-card text-text-muted border border-white/5 hover:text-white hover:border-gold-primary/20'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1 border-t border-white/5">
            <button onClick={() => { setActiveCategory('all'); setLoading(true); }} className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${activeCategory === 'all' ? 'bg-gold-primary/15 text-gold-primary' : 'text-text-muted hover:text-white'}`}>
              All categories
            </button>
            {categories.map((c) => (
              <button key={c} onClick={() => { setActiveCategory(c); setLoading(true); }} className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${activeCategory === c ? 'bg-gold-primary/15 text-gold-primary' : 'text-text-muted hover:text-white'}`}>
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="glass-card rounded-xl p-6 border border-red-500/30 text-center">
          <p className="text-red-400 text-sm mb-3">{error}</p>
          <button onClick={() => { setLoading(true); fetchAll(); }} className="px-4 py-2 bg-gold-primary/20 text-gold-primary rounded-lg text-sm hover:bg-gold-primary/30 transition-colors">Retry</button>
        </div>
      )}

      {!error && items.length === 0 && (
        <div className="glass-card rounded-xl p-12 border border-gold-primary/10 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gold-primary/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-gold-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>
          </div>
          <p className="text-text-secondary text-sm">{t('resources.empty', { defaultValue: 'No resources yet' })}</p>
          {isAdmin && <button onClick={() => setEditing({})} className="mt-4 px-4 py-2 bg-gold-primary/20 text-gold-primary rounded-lg text-sm hover:bg-gold-primary/30 transition-colors">{t('resources.new', { defaultValue: 'New Resource' })}</button>}
        </div>
      )}

      {/* Featured hero */}
      {featured && (
        <div className="tip-fade tip-fade-1">
          <HeroCard resource={featured} {...cardProps} />
        </div>
      )}

      {/* Grid */}
      {rest.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {rest.map((r, i) => (
            <div key={r.id} className={`tip-fade tip-fade-${(i % 6) + 1}`}>
              <ResourceCard resource={r} {...cardProps} />
            </div>
          ))}
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center bg-black/70 backdrop-blur-sm p-0 sm:p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-bg-secondary rounded-t-3xl sm:rounded-2xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] border-t border-red-500/30 sm:border max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center -mt-2 mb-3 sm:hidden" aria-hidden="true">
              <div className="h-1 w-10 rounded-full bg-white/25" />
            </div>
            <h3 className="text-white font-semibold text-center mb-2">Delete resource?</h3>
            <p className="text-text-muted text-sm text-center mb-5">"{deleteConfirm.title}" will be hidden from the hub.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 bg-bg-card border border-white/10 text-text-secondary rounded-xl text-sm font-medium hover:text-white transition-colors">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 py-2.5 bg-red-500/20 border border-red-500/30 text-red-400 rounded-xl text-sm font-bold hover:bg-red-500/30 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}

      {reading && <ResourceReader resource={reading} onClose={() => setReading(null)} />}
      {editing && (
        <ResourceEditor
          resource={editing.id ? editing : null}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}

      <AssistantWidget pageId="tips" />
    </div>
  );
};

const LoadingSkeleton = () => (
  <div className="space-y-5">
    <style>{`@keyframes sp{0%,100%{opacity:.05}50%{opacity:.15}}.skel{animation:sp 2s ease-in-out infinite;background:rgba(212,175,55,.1);border-radius:8px}`}</style>
    <div className="flex items-center gap-3"><div className="skel w-16 h-1" /><div className="skel w-40 h-7" /></div>
    <div className="glass-card rounded-xl p-4 border border-gold-primary/10"><div className="skel w-full h-10" /></div>
    <div className="skel w-full h-64 rounded-2xl" />
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="glass-card rounded-xl overflow-hidden border border-gold-primary/10">
          <div className="skel h-40 rounded-none" />
          <div className="p-4 space-y-2"><div className="skel w-3/4 h-4" /><div className="skel w-full h-3" /><div className="skel w-1/2 h-3" /></div>
        </div>
      ))}
    </div>
  </div>
);

export default ResourcesPage;
