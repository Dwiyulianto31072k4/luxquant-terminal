import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  getPages,
  getSuggestions,
  askAssistant,
  getAssistantStatus,
} from "../../services/assistantApi";
import { renderMarkdown } from "./markdown";

/**
 * Full-page LuxQuant Assistant — a roomy, whole-screen version of the help chat
 * (like Gate AI's "View Full Page"). Lets the user pick which page/topic to ask
 * about via a selector. Route: /assistant?page=<pageId>
 */
export default function AssistantFullPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const pageId = params.get("page") || "signals";

  const [pages, setPages] = useState([]);
  const [label, setLabel] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const scrollRef = useRef(null);

  useEffect(() => {
    getAssistantStatus().then((s) => setEnabled(s.enabled !== false));
  }, []);
  useEffect(() => {
    getPages().then((d) => setPages(d.pages || []));
  }, []);

  // Reset the conversation when the topic changes, load its suggestions.
  useEffect(() => {
    setMessages([]);
    let alive = true;
    getSuggestions(pageId).then((d) => {
      if (!alive) return;
      setLabel(d.label || "");
      setSuggestions(d.suggestions || []);
    });
    return () => {
      alive = false;
    };
  }, [pageId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const send = useCallback(
    async (text) => {
      const q = (text ?? input).trim();
      if (!q || loading) return;
      setInput("");
      const history = messages.slice(-6);
      setMessages((m) => [...m, { role: "user", content: q }]);
      setLoading(true);
      try {
        const res = await askAssistant({ message: q, pageId, history });
        setMessages((m) => [...m, { role: "assistant", content: res.answer || "…" }]);
      } catch (e) {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: "Sorry, something went wrong. Please try again." },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, messages, pageId]
  );

  const changePage = (pid) => setParams({ page: pid });

  if (!enabled) {
    return (
      <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-4xl items-center justify-center px-4 text-center">
        <div>
          <p className="font-display text-lg font-semibold text-text-primary">
            Assistant is currently off
          </p>
          <p className="mt-2 text-sm text-text-primary/60">
            The LuxQuant Assistant has been turned off by an admin.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-4xl flex-col px-4 py-4 sm:px-6 sm:py-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-ink/10 pb-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-accent-fg">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 10h.01M12 10h.01M16 10h.01M21 12a8 8 0 01-11.6 7.1L4 20l1-4.4A8 8 0 1121 12z"
              />
            </svg>
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-lg font-semibold text-text-primary leading-none">
              LuxQuant Assistant
            </h1>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-text-muted">
              Full page · feature & data help
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Topic selector */}
          <select
            value={pageId}
            onChange={(e) => changePage(e.target.value)}
            className="rounded-lg border border-ink/10 bg-surface-raised px-3 py-1.5 text-[12px] text-text-primary focus:outline-none focus:border-ink/15"
          >
            {pages.map((p) => (
              <option key={p.page_id} value={p.page_id}>
                {p.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => navigate(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-ink/10 text-text-muted hover:bg-ink/5 hover:text-text-primary transition-all"
            title="Back"
            aria-label="Back"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar py-6 space-y-3">
        {messages.length === 0 && !loading && (
          <div className="space-y-4">
            <p className="text-[15px] text-text-primary/70 leading-relaxed">
              Ask anything about how to use the{" "}
              <span className="text-accent font-semibold">{label || "this"}</span> page. Pick a
              different topic from the selector above anytime.
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => send(s)}
                  className="text-left rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-3 text-[14px] text-text-primary/80 hover:border-ink/15 hover:bg-surface-secondary hover:text-text-primary transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed ${
                m.role === "user"
                  ? "whitespace-pre-wrap bg-accent text-surface-hover font-medium"
                  : "bg-ink/[0.05] text-text-primary/90 border border-ink/5"
              }`}
            >
              {m.role === "assistant" ? (
                <div className="space-y-2">
                  {renderMarkdown(m.content, (path) => navigate(path))}
                </div>
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-ink/[0.05] border border-ink/5 px-4 py-3">
              <span className="flex gap-1">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-accent/70 animate-bounce"
                  style={{ animationDelay: "0ms" }}
                />
                <span
                  className="h-1.5 w-1.5 rounded-full bg-accent/70 animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="h-1.5 w-1.5 rounded-full bg-accent/70 animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-ink/10 pt-4">
        <div className="flex items-end gap-2">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask how to use this page…"
            className="flex-1 resize-none rounded-xl border border-ink/10 bg-surface-raised px-4 py-3 text-[14px] text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:border-ink/15 max-h-32"
          />
          <button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-accent text-surface-hover disabled:opacity-30 hover:bg-accent/90 transition-all active:scale-[0.97]"
            aria-label="Send"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
        <p className="mt-2 text-center text-[10px] text-text-muted/50">
          Feature & data guidance — not financial advice.
        </p>
      </div>
    </div>
  );
}
