import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSuggestions, askAssistant, getAssistantStatus } from '../../services/assistantApi';
import { renderMarkdown } from './markdown';

/**
 * LuxQuant Assistant — floating, page-aware help widget.
 * Desktop: wide, centered panel (Gate-AI style) with a 2-column suggestion grid.
 * Mobile: full-width bottom sheet.
 *
 * Usage:  <AssistantWidget pageId="signals" />
 */
export default function AssistantWidget({ pageId = 'signals', contextHint = null }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(null); // null=loading, false=hidden
  const [label, setLabel] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [messages, setMessages] = useState([]); // {role:'user'|'assistant', content}
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  // Global on/off (admin-controlled). When off, render nothing at all.
  useEffect(() => {
    let alive = true;
    getAssistantStatus().then((s) => { if (alive) setEnabled(s.enabled !== false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    getSuggestions(pageId).then((d) => {
      if (!alive) return;
      setLabel(d.label || '');
      setSuggestions(d.suggestions || []);
    });
    return () => { alive = false; };
  }, [pageId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const send = useCallback(async (text) => {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    setInput('');
    const history = messages.slice(-6);
    setMessages((m) => [...m, { role: 'user', content: q }]);
    setLoading(true);
    try {
      const res = await askAssistant({ message: q, pageId, history, context: contextHint });
      setMessages((m) => [...m, { role: 'assistant', content: res.answer || '…' }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, pageId, contextHint]);

  const hasChat = messages.length > 0 || loading;

  // Admin turned the assistant off (or still loading status) — show nothing.
  if (enabled === false || enabled === null) return null;

  return (
    <>
      {/* Floating bubble */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-24 right-4 z-[9998] flex items-center gap-2 rounded-full bg-gold-primary text-surface-hover pl-3 pr-4 h-12 font-bold text-sm shadow-[0_6px_24px_-6px_rgba(212,168,83,0.8)] hover:bg-gold-primary/90 transition-all active:scale-[0.97] sm:bottom-5 sm:right-5"
          aria-label="Open LuxQuant Assistant"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12a8 8 0 01-11.6 7.1L4 20l1-4.4A8 8 0 1121 12z" /></svg>
          Ask AI
        </button>
      )}

      {open && (
        <>
          {/* Desktop dim backdrop (Gate-style modal) */}
          <div className="hidden sm:block fixed inset-0 z-[9998] bg-black/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />

          {/* Panel: mobile bottom sheet, desktop centered wide modal */}
          <div className="fixed inset-x-0 bottom-0 z-[9999] flex h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line/30 bg-surface-raised shadow-[0_-8px_40px_rgba(0,0,0,0.5)] sm:inset-x-auto sm:bottom-6 sm:left-1/2 sm:h-[600px] sm:w-[760px] sm:max-w-[92vw] sm:-translate-x-1/2 sm:rounded-2xl sm:shadow-[0_25px_60px_rgba(0,0,0,0.55)] lg:w-[900px]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 bg-surface-raised px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold-primary/15 text-gold-primary">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12a8 8 0 01-11.6 7.1L4 20l1-4.4A8 8 0 1121 12z" /></svg>
                </span>
                <div className="min-w-0">
                  <p className="font-display text-sm font-semibold text-text-primary leading-none sm:text-base">LuxQuant Assistant</p>
                  {label && <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-wider text-gold-primary/70">{label}</p>}
                </div>
              </div>
              <button
                onClick={() => { setOpen(false); navigate(`/assistant?page=${encodeURIComponent(pageId)}`); }}
                className="mr-1 hidden sm:inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-text-muted hover:bg-white/5 hover:text-text-primary transition-all font-mono text-[10px] uppercase tracking-wider"
                title="Open full page"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                Full Page
              </button>
              <button onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-text-muted hover:bg-white/5 hover:text-text-primary transition-all" aria-label="Close">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Body */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 sm:px-6 sm:py-6 space-y-3">
              {!hasChat && (
                <div className="space-y-4">
                  <p className="text-sm text-text-primary/70 leading-relaxed sm:text-[15px]">
                    Ask anything about how to use the <span className="text-gold-primary font-semibold">{label || 'this'}</span> page — column meanings, filtering, and more.
                  </p>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
                    {suggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => send(s)}
                        className="text-left rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-[13px] text-text-primary/80 hover:border-gold-primary/40 hover:bg-gold-primary/[0.06] hover:text-text-primary transition-all"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed sm:text-[14px] ${
                    m.role === 'user'
                      ? 'whitespace-pre-wrap bg-gold-primary text-surface-hover font-medium'
                      : 'bg-white/[0.05] text-text-primary/90 border border-white/5'
                  }`}>
                    {m.role === 'assistant' ? <div className="space-y-2">{renderMarkdown(m.content, (path) => { setOpen(false); navigate(path); })}</div> : m.content}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl bg-white/[0.05] border border-white/5 px-3.5 py-2.5">
                    <span className="flex gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-gold-primary/70 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-gold-primary/70 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="h-1.5 w-1.5 rounded-full bg-gold-primary/70 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-t border-white/10 bg-surface-raised p-3 pb-24 sm:px-6 sm:py-4 sm:pb-4">
              <div className="flex items-end gap-2">
                <textarea
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Ask how to use this page…"
                  className="flex-1 resize-none rounded-xl border border-white/10 bg-surface-raised px-3.5 py-2.5 text-[13px] text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:border-gold-primary/40 max-h-24 sm:text-[14px]"
                />
                <button
                  onClick={() => send()}
                  disabled={loading || !input.trim()}
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gold-primary text-surface-hover disabled:opacity-30 hover:bg-gold-primary/90 transition-all active:scale-[0.97]"
                  aria-label="Send"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" /></svg>
                </button>
              </div>
              <p className="mt-2 text-center text-[9px] text-text-muted/50">Feature & data guidance — not financial advice.</p>
            </div>
          </div>
        </>
      )}
    </>
  );
}
