import { useState, useEffect, useRef, useCallback } from 'react';
import { getSuggestions, askAssistant } from '../../services/assistantApi';

/**
 * LuxQuant Assistant — floating, page-aware help widget (MVP).
 * Scope: one feature at a time. Pass `pageId` for the current page.
 *
 * Usage:  <AssistantWidget pageId="signals" />
 */
export default function AssistantWidget({ pageId = 'signals' }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [messages, setMessages] = useState([]); // {role:'user'|'assistant', content}
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  // Load suggestions once per page
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
    const next = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setLoading(true);
    try {
      const res = await askAssistant({ message: q, pageId, history });
      setMessages((m) => [...m, { role: 'assistant', content: res.answer || '…' }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: 'Maaf, ada gangguan. Coba lagi ya.' }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, pageId]);

  return (
    <>
      {/* Floating bubble */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-[9998] flex items-center gap-2 rounded-full bg-gold-primary text-[#1a1206] pl-3 pr-4 h-12 font-bold text-sm shadow-[0_6px_24px_-6px_rgba(212,168,83,0.8)] hover:bg-gold-primary/90 transition-all active:scale-[0.97]"
          aria-label="Open LuxQuant Assistant"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12a8 8 0 01-11.6 7.1L4 20l1-4.4A8 8 0 1121 12z" /></svg>
          Ask AI
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed inset-x-0 bottom-0 z-[9999] mx-auto flex h-[80vh] w-full max-w-[440px] flex-col overflow-hidden rounded-t-2xl border border-gold-primary/30 bg-[#0d0b09] shadow-[0_-8px_40px_rgba(0,0,0,0.5)] sm:inset-x-auto sm:bottom-5 sm:right-5 sm:h-[560px] sm:rounded-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 bg-[#0a0a0a] px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold-primary/15 text-gold-primary">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12a8 8 0 01-11.6 7.1L4 20l1-4.4A8 8 0 1121 12z" /></svg>
              </span>
              <div className="min-w-0">
                <p className="font-display text-sm font-semibold text-white leading-none">LuxQuant Assistant</p>
                {label && <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-wider text-gold-primary/70">{label}</p>}
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-text-muted hover:bg-white/5 hover:text-white transition-all" aria-label="Close">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Body */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-white/70 leading-relaxed">
                  Tanya apa saja soal cara pakai halaman <span className="text-gold-primary font-semibold">{label || 'ini'}</span> — arti kolom, cara filter, dan lainnya.
                </p>
                <div className="flex flex-col gap-2">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => send(s)}
                      className="text-left rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[13px] text-white/80 hover:border-gold-primary/40 hover:bg-gold-primary/[0.06] hover:text-white transition-all"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-gold-primary text-[#1a1206] font-medium'
                    : 'bg-white/[0.05] text-white/90 border border-white/5'
                }`}>
                  {m.content}
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
          <div className="border-t border-white/10 bg-[#0a0a0a] p-3">
            <div className="flex items-end gap-2">
              <textarea
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Tanya cara pakai fitur ini…"
                className="flex-1 resize-none rounded-xl border border-white/10 bg-[#0d0d0d] px-3 py-2 text-[13px] text-white placeholder:text-text-muted/60 focus:outline-none focus:border-gold-primary/40 max-h-24"
              />
              <button
                onClick={() => send()}
                disabled={loading || !input.trim()}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gold-primary text-[#1a1206] disabled:opacity-30 hover:bg-gold-primary/90 transition-all active:scale-[0.97]"
                aria-label="Send"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" /></svg>
              </button>
            </div>
            <p className="mt-1.5 text-center text-[9px] text-text-muted/50">Panduan fitur & data — bukan saran finansial.</p>
          </div>
        </div>
      )}
    </>
  );
}
