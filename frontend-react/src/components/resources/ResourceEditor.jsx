// src/components/resources/ResourceEditor.jsx
// ════════════════════════════════════════════════════════════════════
// Shared create/edit modal for the Resource Hub. Used by BOTH the public
// page (inline admin quick-add) and the admin Management System tab.
//
// Supports four content types:
// • article — lightweight WYSIWYG (contentEditable) OR raw Markdown
// • pdf — upload a PDF module
// • video — paste a YouTube/Vimeo link → live preview + inline embed
// • link — paste any URL → Open-Graph preview card
//
// Dependency-free: the rich editor uses document.execCommand — no libs.
// ════════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { resourcesApi, coverUrl, youtubeThumb } from "../../services/resourcesApi";

const TYPES = [
  { id: "article", label: "Article", hint: "Written research / guide" },
  { id: "pdf", label: "PDF", hint: "Uploadable PDF module" },
  { id: "video", label: "Video", hint: "YouTube / Vimeo link" },
  { id: "link", label: "Link", hint: "External article / post" },
];

// ── Toolbar button ──
const TB = ({ onClick, title, children, active }) => (
  <button
    type="button"
    title={title}
    onMouseDown={(e) => {
      e.preventDefault();
      onClick();
    }}
    className={`min-w-[30px] h-8 px-2 rounded-md text-xs font-semibold transition-colors ${
      active
        ? "bg-accent/25 text-accent"
        : "text-text-secondary hover:bg-ink/10 hover:text-text-primary"
    }`}
  >
    {children}
  </button>
);

// ── Lightweight WYSIWYG (contentEditable) ──
const RichEditor = ({ value, onChange }) => {
  const ref = useRef(null);
  const [, force] = useState(0);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (value || "")) {
      ref.current.innerHTML = value || "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exec = (cmd, arg = null) => {
    document.execCommand(cmd, false, arg);
    ref.current?.focus();
    onChange(ref.current?.innerHTML || "");
    force((n) => n + 1);
  };

  const addLink = () => {
    const url = window.prompt("Link URL (https://…)");
    if (url) exec("createLink", url);
  };
  const addImage = () => {
    const url = window.prompt("Image URL (https://…)");
    if (url) exec("insertImage", url);
  };
  const block = (tag) => exec("formatBlock", tag);

  return (
    <div className="rounded-xl border border-ink/10 overflow-hidden bg-bg-card">
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-ink/10 bg-scrim/20">
        <TB title="Bold" onClick={() => exec("bold")}>
          <b>B</b>
        </TB>
        <TB title="Italic" onClick={() => exec("italic")}>
          <i>I</i>
        </TB>
        <TB title="Underline" onClick={() => exec("underline")}>
          <u>U</u>
        </TB>
        <span className="w-px h-5 bg-ink/10 mx-1" />
        <TB title="Heading 2" onClick={() => block("H2")}>
          H2
        </TB>
        <TB title="Heading 3" onClick={() => block("H3")}>
          H3
        </TB>
        <TB title="Paragraph" onClick={() => block("P")}>
          ¶
        </TB>
        <span className="w-px h-5 bg-ink/10 mx-1" />
        <TB title="Bullet list" onClick={() => exec("insertUnorderedList")}>
          •
        </TB>
        <TB title="Numbered list" onClick={() => exec("insertOrderedList")}>
          1.
        </TB>
        <TB title="Quote" onClick={() => block("BLOCKQUOTE")}>
          ❝
        </TB>
        <span className="w-px h-5 bg-ink/10 mx-1" />
        <TB title="Link" onClick={addLink}>
          🔗
        </TB>
        <TB title="Image" onClick={addImage}>
          🖼
        </TB>
        <TB title="Clear format" onClick={() => exec("removeFormat")}>
          ⌫
        </TB>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => onChange(e.currentTarget.innerHTML)}
        className="resource-rte min-h-[280px] max-h-[52vh] overflow-y-auto px-4 py-3 text-sm text-text-secondary focus:outline-none leading-relaxed"
        data-placeholder="Write your article…"
      />
      <style>{`
 .resource-rte:empty:before{content:attr(data-placeholder);color:rgb(var(--ink) / .25)}
 .resource-rte h2{font-size:1.25rem;font-weight:700;color:#fff;margin:.8em 0 .4em}
 .resource-rte h3{font-size:1.05rem;font-weight:600;color:#fff;margin:.7em 0 .35em}
 .resource-rte p{margin:.5em 0}
 .resource-rte ul{list-style:disc;padding-left:1.4em;margin:.5em 0}
 .resource-rte ol{list-style:decimal;padding-left:1.4em;margin:.5em 0}
 .resource-rte a{color:rgb(var(--accent));text-decoration:underline}
 .resource-rte img{max-width:100%;border-radius:10px;margin:.6em 0}
 .resource-rte blockquote{border-left:3px solid rgb(var(--line) / .5);padding-left:1em;margin:.6em 0;color:#c9b59e;font-style:italic}
 `}</style>
    </div>
  );
};

const Field = ({ label, children, required }) => (
  <div>
    <label className="text-accent text-[10px] font-bold uppercase tracking-wider mb-1.5 block">
      {label}
      {required && " *"}
    </label>
    {children}
  </div>
);

const inputCls =
  "w-full bg-bg-card border border-ink/10 rounded-xl px-4 py-3 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-ink/15 transition-colors";

const ResourceEditor = ({ resource, categories = [], onClose, onSaved }) => {
  const isEdit = !!resource;
  const [type, setType] = useState(resource?.type || "article");
  const [title, setTitle] = useState(resource?.title || "");
  const [excerpt, setExcerpt] = useState(resource?.excerpt || "");
  const [content, setContent] = useState(resource?.content || "");
  const [contentFormat, setContentFormat] = useState(resource?.content_format || "html");
  const [category, setCategory] = useState(resource?.category || "General");
  const [newCategory, setNewCategory] = useState("");
  const [tags, setTags] = useState(resource?.tags || "");
  const [authorName, setAuthorName] = useState(resource?.author_name || "");
  const [sourceUrl, setSourceUrl] = useState(resource?.source_url || "");
  const [embedHtml, setEmbedHtml] = useState(resource?.embed_html || "");
  const [provider, setProvider] = useState(resource?.provider || "");
  const [coverUrlExt, setCoverUrlExt] = useState(
    resource?.cover_is_external ? resource.cover_image : ""
  );
  const [statusVal, setStatusVal] = useState(resource?.status || "published");
  const [isFeatured, setIsFeatured] = useState(!!resource?.is_featured);

  const [pdfFile, setPdfFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(resource ? coverUrl(resource) : null);

  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handleCoverChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setCoverFile(file);
      setCoverPreview(URL.createObjectURL(file));
      setCoverUrlExt("");
    }
  };

  // ── Fetch oEmbed / OG preview for video/link ──
  const fetchPreview = useCallback(async () => {
    if (!sourceUrl.trim()) return;
    setFetching(true);
    setError(null);
    try {
      const p = await resourcesApi.urlPreview(sourceUrl.trim());
      setProvider(p.provider || "");
      if (p.embed_html) setEmbedHtml(p.embed_html);
      if (p.title && !title) setTitle(p.title);
      if (p.author_name && !authorName) setAuthorName(p.author_name);
      if (p.description && !excerpt) setExcerpt(p.description);
      if (p.thumbnail_url) {
        setCoverUrlExt(p.thumbnail_url);
        setCoverPreview(p.thumbnail_url);
        setCoverFile(null);
      }
      if (p.type === "video") setType("video");
    } catch (err) {
      setError("Could not fetch preview. You can still fill the fields manually.");
      // still offer a YouTube thumbnail if possible
      const yt = youtubeThumb(sourceUrl);
      if (yt) {
        setCoverUrlExt(yt);
        setCoverPreview(yt);
        setProvider("youtube");
      }
    } finally {
      setFetching(false);
    }
  }, [sourceUrl, title, authorName, excerpt]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (type === "pdf" && !isEdit && !pdfFile) {
      setError("Please choose a PDF file");
      return;
    }
    if ((type === "video" || type === "link") && !sourceUrl.trim()) {
      setError("Please paste a URL");
      return;
    }

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("type", type);
      fd.append("title", title.trim());
      fd.append("excerpt", excerpt.trim());
      fd.append("category", newCategory.trim() || category || "General");
      fd.append("tags", tags.trim());
      fd.append("author_name", authorName.trim());
      fd.append("resource_status", statusVal);
      fd.append("is_featured", isFeatured ? "true" : "false");

      if (type === "article") {
        fd.append("content", content);
        fd.append("content_format", contentFormat);
      }
      if (type === "video" || type === "link") {
        fd.append("source_url", sourceUrl.trim());
        if (embedHtml) fd.append("embed_html", embedHtml);
        if (provider) fd.append("provider", provider);
        // optional long-form notes (Markdown) shown in the reader
        fd.append("content", content || "");
        fd.append("content_format", "markdown");
      }
      if (coverUrlExt && !coverFile) fd.append("cover_url", coverUrlExt);
      if (coverFile) fd.append("cover_file", coverFile);
      if (pdfFile) fd.append("pdf_file", pdfFile);

      const saved = isEdit
        ? await resourcesApi.update(resource.id, fd)
        : await resourcesApi.create(fd);
      onSaved(saved);
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const showPreviewCard = (type === "video" || type === "link") && (coverPreview || embedHtml);

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center sm:items-center bg-scrim/75 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-bg-secondary rounded-t-3xl sm:rounded-2xl border-t border-ink/10 sm:border max-w-2xl w-full max-h-[min(92dvh,100%)] overflow-y-auto shadow-[0_-20px_60px_rgb(var(--scrim) / 0.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2.5 pb-0 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-ink/25" />
        </div>
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-ink/08 bg-bg-secondary/95 backdrop-blur">
          <h3 className="text-text-primary font-semibold text-base">
            {isEdit ? "Edit Resource" : "New Resource"}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 text-text-muted hover:text-text-primary rounded-lg hover:bg-ink/5 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Type selector */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {TYPES.map((tt) => (
              <button
                key={tt.id}
                type="button"
                onClick={() => setType(tt.id)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  type === tt.id
                    ? "bg-accent border-ink/15"
                    : "bg-bg-card border-ink/5 hover:border-ink/10"
                }`}
              >
                <div
                  className={`text-sm font-bold ${type === tt.id ? "text-accent" : "text-text-primary"}`}
                >
                  {tt.label}
                </div>
                <div className="text-[10px] text-text-muted mt-0.5 leading-tight">{tt.hint}</div>
              </button>
            ))}
          </div>

          <Field label="Title" required>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Resource title…"
              className={inputCls}
            />
          </Field>

          {/* Video / Link URL + preview */}
          {(type === "video" || type === "link") && (
            <Field label={type === "video" ? "Video URL" : "Link URL"} required>
              <div className="flex gap-2">
                <input
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder={type === "video" ? "https://youtube.com/watch?v=…" : "https://…"}
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={fetchPreview}
                  disabled={fetching || !sourceUrl.trim()}
                  className="shrink-0 px-4 rounded-xl bg-accent/20 text-accent text-sm font-bold hover:bg-accent/30 transition-colors disabled:opacity-40"
                >
                  {fetching ? "…" : "Fetch"}
                </button>
              </div>
              {showPreviewCard && (
                <div className="mt-3 rounded-xl border border-ink/10 overflow-hidden bg-bg-card">
                  {coverPreview && (
                    <div className="w-full" style={{ aspectRatio: "16 / 9" }}>
                      <img
                        src={coverPreview}
                        alt="preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="px-3 py-2">
                    <p className="text-[10px] text-accent uppercase tracking-wider font-bold">
                      {provider || "preview"}
                    </p>
                    <p className="text-sm text-text-primary font-medium truncate">
                      {title || "Untitled"}
                    </p>
                    {authorName && <p className="text-[11px] text-text-muted">{authorName}</p>}
                  </div>
                </div>
              )}
            </Field>
          )}

          {/* Notes / description for video & link (Markdown, shown in reader) */}
          {(type === "video" || type === "link") && (
            <Field label="Notes / Description (Markdown)">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                placeholder="Optional summary shown under the video. Supports **bold**, # headings, - lists, [text](url) links…"
                className={`${inputCls} font-mono text-[13px] resize-y`}
              />
              <p className="text-[10px] text-text-muted mt-1">
                Paste a summary here (e.g. from an AI) — bold, headings, lists & links render
                properly in the reader.
              </p>
            </Field>
          )}

          {/* Article body */}
          {type === "article" && (
            <Field label="Content">
              <div className="flex items-center gap-2 mb-2">
                {["html", "markdown"].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setContentFormat(f)}
                    className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                      contentFormat === f
                        ? "bg-accent/20 text-accent"
                        : "bg-bg-card text-text-muted hover:text-text-primary"
                    }`}
                  >
                    {f === "html" ? "Rich text" : "Markdown"}
                  </button>
                ))}
              </div>
              {contentFormat === "html" ? (
                <RichEditor value={content} onChange={setContent} />
              ) : (
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={12}
                  placeholder="# Heading&#10;&#10;Write in **markdown**…"
                  className={`${inputCls} font-mono text-[13px] resize-y`}
                />
              )}
            </Field>
          )}

          {/* PDF upload */}
          {type === "pdf" && (
            <Field label="PDF File" required={!isEdit}>
              <label className="flex items-center gap-3 bg-bg-card border-2 border-dashed border-ink/10 rounded-xl px-4 py-4 cursor-pointer hover:border-ink/15 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                  <svg
                    className="w-5 h-5 text-loss"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                    />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-text-primary text-sm font-medium truncate">
                    {pdfFile
                      ? pdfFile.name
                      : isEdit && resource?.pdf_path
                        ? `Current: ${resource.pdf_path}`
                        : "Choose PDF file"}
                  </p>
                  <p className="text-text-muted text-[10px]">
                    {pdfFile ? `${(pdfFile.size / 1048576).toFixed(2)} MB` : "PDF only"}
                  </p>
                </div>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setPdfFile(e.target.files[0])}
                  className="hidden"
                />
              </label>
            </Field>
          )}

          <Field label="Excerpt / Summary">
            <textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={2}
              placeholder="One or two lines shown on the card…"
              className={`${inputCls} resize-none`}
            />
          </Field>

          {/* Category + tags */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Category">
              <div className="flex gap-2">
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setNewCategory("");
                  }}
                  className={inputCls}
                >
                  <option value="General">General</option>
                  {categories
                    .filter((c) => c !== "General")
                    .map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                </select>
                <input
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="+ new"
                  className="w-24 bg-bg-card border border-ink/10 rounded-xl px-3 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-ink/15"
                />
              </div>
            </Field>
            <Field label="Tags (comma separated)">
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="btc, macro, defi"
                className={inputCls}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Author / Source">
              <input
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="e.g. LuxQuant Research"
                className={inputCls}
              />
            </Field>
            <Field label="Cover Image">
              <div className="flex gap-3">
                <label className="flex-1 flex items-center justify-center bg-bg-card border-2 border-dashed border-ink/10 rounded-xl px-4 py-3 cursor-pointer hover:border-ink/15 transition-colors text-text-muted text-xs">
                  {coverFile ? coverFile.name : "Upload cover"}
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.gif"
                    onChange={handleCoverChange}
                    className="hidden"
                  />
                </label>
                {coverPreview && (
                  <div className="w-14 h-14 rounded-xl overflow-hidden border border-ink/10 flex-shrink-0">
                    <img src={coverPreview} alt="cover" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            </Field>
          </div>

          {/* Publish controls */}
          <div className="flex flex-wrap items-center gap-4 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isFeatured}
                onChange={(e) => setIsFeatured(e.target.checked)}
                className="accent-accent w-4 h-4"
              />
              <span className="text-sm text-text-secondary">Featured (hero)</span>
            </label>
            <div className="flex items-center gap-1 ml-auto bg-bg-card rounded-lg p-1 border border-ink/5">
              {["draft", "published"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusVal(s)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-colors ${
                    statusVal === s
                      ? s === "published"
                        ? "bg-green-500/20 text-green-400"
                        : "bg-amber-500/20 text-amber-400"
                      : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <p className="text-loss text-sm">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-bg-card border border-ink/10 text-text-secondary rounded-xl text-sm font-medium hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 bg-gradient-to-r from-accent to-accent text-bg-primary rounded-xl text-sm font-bold hover: transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? "Saving…" : isEdit ? "Save changes" : "Publish"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default ResourceEditor;
