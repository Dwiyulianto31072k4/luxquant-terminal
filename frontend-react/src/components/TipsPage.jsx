// src/components/TipsPage.jsx
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next'; // <-- 1. Import i18n
import { useAuth } from '../context/AuthContext';

const API_BASE = '/api/v1';

const TipsPage = () => {
  const { t } = useTranslation(); // <-- 2. Panggil i18n
  const { user, isAuthenticated } = useAuth();
  const [tips, setTips] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTip, setSelectedTip] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingTip, setEditingTip] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const isAdmin = user?.is_admin === true;

  useEffect(() => {
    fetchTips();
    fetchCategories();
  }, [activeCategory]);

  const fetchTips = async () => {
    try {
      setError(null);
      const params = new URLSearchParams();
      if (activeCategory !== 'all') params.append('category', activeCategory);
      if (searchQuery) params.append('search', searchQuery);
      
      const res = await fetch(`${API_BASE}/tips/?${params}`);
      if (!res.ok) throw new Error('Failed to fetch tips');
      const data = await res.json();
      setTips(data.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch(`${API_BASE}/tips/categories`);
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
      }
    } catch {}
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setLoading(true);
    fetchTips();
  };

  const handleDelete = async (tipId) => {
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_BASE}/tips/${tipId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setTips(prev => prev.filter(t => t.id !== tipId));
        setDeleteConfirm(null);
      }
    } catch (err) {
      alert(`${t('tips.failed_delete')} ${err.message}`);
    }
  };

  const handleUploadSuccess = () => {
    setShowUploadModal(false);
    setEditingTip(null);
    setLoading(true);
    fetchTips();
    fetchCategories();
  };

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="space-y-5">
      <style>{`
        @keyframes fadeInUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        .tip-fade{animation:fadeInUp .4s ease-out forwards;opacity:0}
        .tip-fade-1{animation-delay:.05s}.tip-fade-2{animation-delay:.1s}.tip-fade-3{animation-delay:.15s}
        .tip-fade-4{animation-delay:.2s}.tip-fade-5{animation-delay:.25s}.tip-fade-6{animation-delay:.3s}
        .tip-card{transition:all .3s cubic-bezier(.4,0,.2,1)}
        .tip-card:hover{transform:translateY(-4px);border-color:rgba(212,175,55,.3);box-shadow:0 12px 40px rgba(0,0,0,.4),0 0 0 1px rgba(212,175,55,.15)}
        .tip-card:hover .tip-cover{transform:scale(1.05)}
        .tip-cover{transition:transform .5s cubic-bezier(.4,0,.2,1)}
      `}</style>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
          <h2 className="font-display text-2xl font-semibold text-white">{t('tips.title')}</h2>
          <span className="px-2 py-1 bg-gold-primary/10 text-gold-primary text-xs font-medium rounded">
            {tips.length} {t('tips.modules')}
          </span>
        </div>

        {isAdmin && (
          <button
            onClick={() => { setEditingTip(null); setShowUploadModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-gold-dark to-gold-primary text-bg-primary rounded-xl text-sm font-bold hover:shadow-gold-glow transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t('tips.upload_module')}
          </button>
        )}
      </div>

      {/* Search + Category Filter */}
      <div className="glass-card rounded-xl p-4 border border-gold-primary/10">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1 min-w-[200px]">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                placeholder={t('tips.search_placeholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-bg-card border border-gold-primary/15 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-text-muted focus:outline-none focus:border-gold-primary/40 transition-colors"
              />
            </div>
          </form>

          {/* Category Tabs */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setActiveCategory('all'); setLoading(true); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeCategory === 'all'
                  ? 'bg-gold-primary/20 text-gold-primary border border-gold-primary/30'
                  : 'bg-bg-card text-text-muted border border-white/5 hover:text-white hover:border-gold-primary/20'
              }`}
            >
              {t('tips.all')}
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => { setActiveCategory(cat); setLoading(true); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeCategory === cat
                    ? 'bg-gold-primary/20 text-gold-primary border border-gold-primary/30'
                    : 'bg-bg-card text-text-muted border border-white/5 hover:text-white hover:border-gold-primary/20'
                }`}
              >
                {cat === 'General' ? t('tips.general') : cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="glass-card rounded-xl p-6 border border-red-500/30 text-center">
          <p className="text-red-400 text-sm mb-3">{error}</p>
          <button
            onClick={() => { setLoading(true); fetchTips(); }}
            className="px-4 py-2 bg-gold-primary/20 text-gold-primary rounded-lg text-sm hover:bg-gold-primary/30 transition-colors"
          >
            {t('tips.retry')}
          </button>
        </div>
      )}

      {/* Empty State */}
      {!error && tips.length === 0 && (
        <div className="glass-card rounded-xl p-12 border border-gold-primary/10 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gold-primary/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-gold-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
          </div>
          <p className="text-text-secondary text-sm">{t('tips.no_modules')}</p>
          {isAdmin && (
            <button
              onClick={() => setShowUploadModal(true)}
              className="mt-4 px-4 py-2 bg-gold-primary/20 text-gold-primary rounded-lg text-sm hover:bg-gold-primary/30 transition-colors"
            >
              {t('tips.upload_first')}
            </button>
          )}
        </div>
      )}

      {/* Tips Grid */}
      {tips.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {tips.map((tip, i) => (
            <div
              key={tip.id}
              className={`tip-fade tip-fade-${(i % 6) + 1}`}
            >
              <div
                className="tip-card glass-card rounded-xl border border-gold-primary/10 overflow-hidden cursor-pointer group relative"
                onClick={() => setSelectedTip(tip)}
              >
                {/* Cover Image */}
                <div className="relative h-44 overflow-hidden bg-gradient-to-br from-gold-primary/5 to-orange-500/5">
                  {tip.cover_image ? (
                    <img
                      src={`${API_BASE}/tips/file/cover/${tip.cover_image}`}
                      alt={tip.title}
                      className="w-full h-full object-cover tip-cover"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div
                    className={`w-full h-full flex flex-col items-center justify-center ${tip.cover_image ? 'hidden' : 'flex'}`}
                    style={{ display: tip.cover_image ? 'none' : 'flex' }}
                  >
                    <svg className="w-12 h-12 text-gold-primary/30 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    <span className="text-gold-primary/40 text-xs font-semibold">{t('tips.pdf_module')}</span>
                  </div>

                  {/* Category Badge */}
                  <div className="absolute top-3 left-3">
                    <span className="px-2.5 py-1 bg-black/60 backdrop-blur-sm text-gold-primary text-[10px] font-bold rounded-lg border border-gold-primary/20">
                      {tip.category === 'General' ? t('tips.general') : tip.category}
                    </span>
                  </div>

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <div className="bg-gold-primary/90 rounded-full p-3 shadow-lg transform scale-75 group-hover:scale-100 transition-transform duration-300">
                      <svg className="w-6 h-6 text-bg-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="p-4">
                  <h3 className="text-white font-semibold text-sm group-hover:text-gold-primary transition-colors line-clamp-2 leading-snug mb-1.5">
                    {tip.title}
                  </h3>
                  {tip.description && (
                    <p className="text-text-muted text-[11px] line-clamp-2 leading-relaxed mb-3">
                      {tip.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-text-muted text-[10px]">
                      {new Date(tip.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <span className="text-gold-primary text-[10px] font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                      {t('tips.read')}
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                  </div>
                </div>

                {/* Admin Actions */}
                {isAdmin && (
                  <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingTip(tip); setShowUploadModal(true); }}
                      className="p-1.5 bg-black/70 backdrop-blur-sm rounded-lg text-blue-400 hover:text-blue-300 border border-blue-500/20 hover:border-blue-500/40 transition-all"
                      title={t('tips.edit')}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirm(tip.id); }}
                      className="p-1.5 bg-black/70 backdrop-blur-sm rounded-lg text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 transition-all"
                      title={t('tips.delete')}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-bg-secondary rounded-2xl p-6 border border-red-500/30 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-red-500/10 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h3 className="text-white font-semibold text-center mb-2">{t('tips.del_confirm_title')}</h3>
            <p className="text-text-muted text-sm text-center mb-5">{t('tips.del_confirm_desc')}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 bg-bg-card border border-white/10 text-text-secondary rounded-xl text-sm font-medium hover:text-white transition-colors"
              >
                {t('tips.cancel')}
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 py-2.5 bg-red-500/20 border border-red-500/30 text-red-400 rounded-xl text-sm font-bold hover:bg-red-500/30 transition-colors"
              >
                {t('tips.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Viewer Modal */}
      {selectedTip && (
        <PDFViewerModal
          tip={selectedTip}
          onClose={() => setSelectedTip(null)}
          t={t}
        />
      )}

      {/* Upload/Edit Modal */}
      {showUploadModal && (
        <UploadModal
          tip={editingTip}
          onClose={() => { setShowUploadModal(false); setEditingTip(null); }}
          onSuccess={handleUploadSuccess}
          categories={categories}
          t={t}
        />
      )}
    </div>
  );
};


/* ── PDF VIEWER MODAL ── */
const PDFViewerModal = ({ tip, onClose, t }) => {
  const pdfUrl = `${'/api/v1'}/tips/file/pdf/${tip.pdf_path}`;

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-6 lg:p-10"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl h-full max-h-[90vh] bg-bg-secondary rounded-2xl border border-gold-primary/20 shadow-2xl shadow-black/50 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'modalIn .25s ease-out' }}
      >
        <style>{`@keyframes modalIn{from{opacity:0;transform:scale(.97) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent z-10" />

        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-gold-primary/10 bg-bg-primary/50 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onClose}
              className="p-2 -ml-1 text-text-muted hover:text-white hover:bg-white/5 rounded-xl transition-all flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="text-xs font-medium hidden sm:inline">{t('tips.back')}</span>
            </button>
            <div className="w-px h-6 bg-gold-primary/10 hidden sm:block" />
            <div className="w-8 h-8 rounded-lg bg-gold-primary/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-gold-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <div className="min-w-0">
              <h3 className="text-white font-semibold text-sm truncate">{tip.title}</h3>
              <p className="text-text-muted text-[10px]">{tip.category === 'General' ? t('tips.general') : tip.category}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <a
              href={pdfUrl}
              download
              className="p-2 text-text-muted hover:text-gold-primary hover:bg-gold-primary/10 rounded-xl transition-all"
              title={t('tips.download_pdf')}
              onClick={(e) => e.stopPropagation()}
            >
              <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </a>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-text-muted hover:text-gold-primary hover:bg-gold-primary/10 rounded-xl transition-all"
              title={t('tips.open_new_tab')}
              onClick={(e) => e.stopPropagation()}
            >
              <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
            <div className="w-px h-6 bg-gold-primary/10 mx-1" />
            <button
              onClick={onClose}
              className="p-2 text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
              title={t('tips.close')}
            >
              <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden bg-[#525659] rounded-b-2xl">
          <iframe
            src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`}
            className="w-full h-full border-none"
            title={tip.title}
          />
        </div>
      </div>
    </div>
  );
};


/* ── UPLOAD / EDIT MODAL ── */
const UploadModal = ({ tip, onClose, onSuccess, categories, t }) => {
  const [title, setTitle] = useState(tip?.title || '');
  const [description, setDescription] = useState(tip?.description || '');
  const [category, setCategory] = useState(tip?.category || 'General');
  const [newCategory, setNewCategory] = useState('');
  const [pdfFile, setPdfFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(
    tip?.cover_image ? `/api/v1/tips/file/cover/${tip.cover_image}` : null
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const isEdit = !!tip;

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleCoverChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setCoverFile(file);
      setCoverPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!isEdit && !pdfFile) {
      setError(t('tips.req_pdf_err'));
      return;
    }
    if (!title.trim()) {
      setError(t('tips.req_title_err'));
      return;
    }

    setUploading(true);
    try {
      const token = localStorage.getItem('access_token');
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('description', description.trim());
      formData.append('category', newCategory.trim() || category);

      if (pdfFile) formData.append('pdf_file', pdfFile);
      if (coverFile) formData.append('cover_file', coverFile);

      const url = isEdit ? `${API_BASE}/tips/${tip.id}` : `${API_BASE}/tips/`;
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Upload failed');
      }

      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-bg-secondary rounded-2xl border border-gold-primary/20 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gold-primary/10">
          <h3 className="text-white font-semibold text-base">
            {isEdit ? t('tips.edit_module_title') : t('tips.upload_new_title')}
          </h3>
          <button onClick={onClose} className="p-1.5 text-text-muted hover:text-white rounded-lg hover:bg-white/5 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-gold-primary text-[10px] font-bold uppercase tracking-wider mb-1.5 block">{t('tips.form_title')}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('tips.form_title_ph')}
              className="w-full bg-bg-card border border-gold-primary/15 rounded-xl px-4 py-3 text-sm text-white placeholder-text-muted focus:outline-none focus:border-gold-primary/40 transition-colors"
              required
            />
          </div>

          <div>
            <label className="text-gold-primary text-[10px] font-bold uppercase tracking-wider mb-1.5 block">{t('tips.form_desc')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('tips.form_desc_ph')}
              rows={3}
              className="w-full bg-bg-card border border-gold-primary/15 rounded-xl px-4 py-3 text-sm text-white placeholder-text-muted focus:outline-none focus:border-gold-primary/40 transition-colors resize-none"
            />
          </div>

          <div>
            <label className="text-gold-primary text-[10px] font-bold uppercase tracking-wider mb-1.5 block">{t('tips.form_cat')}</label>
            <div className="flex gap-2">
              <select
                value={category}
                onChange={(e) => { setCategory(e.target.value); setNewCategory(''); }}
                className="flex-1 bg-bg-card border border-gold-primary/15 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-gold-primary/40 transition-colors"
              >
                <option value="General">{t('tips.general')}</option>
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder={t('tips.or_new')}
                className="w-28 bg-bg-card border border-gold-primary/15 rounded-xl px-3 py-3 text-sm text-white placeholder-text-muted focus:outline-none focus:border-gold-primary/40 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="text-gold-primary text-[10px] font-bold uppercase tracking-wider mb-1.5 block">
              {t('tips.form_pdf')} {!isEdit && '*'}
            </label>
            <label className="flex items-center gap-3 bg-bg-card border-2 border-dashed border-gold-primary/20 rounded-xl px-4 py-4 cursor-pointer hover:border-gold-primary/40 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-white text-sm font-medium truncate">
                  {pdfFile ? pdfFile.name : isEdit ? `${t('tips.current_pdf')} ${tip.pdf_path}` : t('tips.choose_pdf')}
                </p>
                <p className="text-text-muted text-[10px]">
                  {pdfFile ? `${(pdfFile.size / 1024 / 1024).toFixed(2)} MB` : t('tips.pdf_req')}
                </p>
              </div>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setPdfFile(e.target.files[0])}
                className="hidden"
              />
            </label>
          </div>

          <div>
            <label className="text-gold-primary text-[10px] font-bold uppercase tracking-wider mb-1.5 block">{t('tips.form_cover')}</label>
            <div className="flex gap-3">
              <label className="flex-1 flex items-center gap-3 bg-bg-card border-2 border-dashed border-gold-primary/20 rounded-xl px-4 py-4 cursor-pointer hover:border-gold-primary/40 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    {coverFile ? coverFile.name : t('tips.choose_cover')}
                  </p>
                  <p className="text-text-muted text-[10px]">{t('tips.cover_req')}</p>
                </div>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp"
                  onChange={handleCoverChange}
                  className="hidden"
                />
              </label>
              {coverPreview && (
                <div className="w-20 h-20 rounded-xl overflow-hidden border border-gold-primary/15 flex-shrink-0">
                  <img src={coverPreview} alt="Cover preview" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-bg-card border border-white/10 text-text-secondary rounded-xl text-sm font-medium hover:text-white transition-colors"
            >
              {t('tips.cancel')}
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="flex-1 py-3 bg-gradient-to-r from-gold-dark to-gold-primary text-bg-primary rounded-xl text-sm font-bold hover:shadow-gold-glow transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {t('tips.uploading')}
                </>
              ) : (
                isEdit ? t('tips.save_changes') : t('tips.upload_btn')
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


/* ── LOADING SKELETON ── */
const LoadingSkeleton = () => (
  <div className="space-y-5">
    <style>{`@keyframes sp{0%,100%{opacity:.05}50%{opacity:.15}}.skel{animation:sp 2s ease-in-out infinite;background:rgba(212,175,55,.1);border-radius:8px}`}</style>
    <div className="flex items-center gap-3">
      <div className="skel w-16 h-1" />
      <div className="skel w-40 h-7" />
    </div>
    <div className="glass-card rounded-xl p-4 border border-gold-primary/10">
      <div className="skel w-full h-10" />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="glass-card rounded-xl overflow-hidden border border-gold-primary/10">
          <div className="skel h-44 rounded-none" />
          <div className="p-4 space-y-2">
            <div className="skel w-3/4 h-4" />
            <div className="skel w-full h-3" />
            <div className="skel w-1/2 h-3" />
          </div>
        </div>
      ))}
    </div>
  </div>
);


export default TipsPage;