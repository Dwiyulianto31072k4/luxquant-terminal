// src/components/resources/mdRender.jsx
// ════════════════════════════════════════════════════════════════════
// Self-contained Markdown → React renderer for resource bodies.
// Handles the shapes that copy-pasted content (e.g. Gemini summaries)
// produce: # headings, **bold**, *italic*, `code`, [text](url) links,
// bare URLs, - / 1. lists, > quotes, --- rules. Dependency-free.
// ════════════════════════════════════════════════════════════════════

// ── Inline parsing ──
const INLINE_RE = /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\n]+)\*|_([^_\n]+)_|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|https?:\/\/[^\s<)\]]+)/g;

function renderInline(text, keyBase = 'i') {
  const nodes = [];
  let last = 0;
  let m;
  let i = 0;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const key = `${keyBase}-${i++}`;
    if (m[2] !== undefined) nodes.push(<strong key={key} className="font-semibold text-white">{m[2]}</strong>);
    else if (m[3] !== undefined) nodes.push(<strong key={key} className="font-semibold text-white">{m[3]}</strong>);
    else if (m[4] !== undefined) nodes.push(<em key={key}>{m[4]}</em>);
    else if (m[5] !== undefined) nodes.push(<em key={key}>{m[5]}</em>);
    else if (m[6] !== undefined) nodes.push(<code key={key} className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[.85em] text-gold-primary/90">{m[6]}</code>);
    else if (m[7] !== undefined && m[8] !== undefined) {
      nodes.push(
        <a key={key} href={m[8]} target="_blank" rel="noopener noreferrer" className="text-gold-primary underline underline-offset-2 hover:text-gold-light">
          {m[7]}
        </a>
      );
    } else {
      // bare URL
      nodes.push(
        <a key={key} href={m[0]} target="_blank" rel="noopener noreferrer" className="text-gold-primary underline underline-offset-2 hover:text-gold-light break-all">
          {m[0]}
        </a>
      );
    }
    last = INLINE_RE.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const HEADING_CLS = {
  1: 'text-2xl font-bold text-white mt-6 mb-2',
  2: 'text-xl font-bold text-white mt-5 mb-2',
  3: 'text-lg font-semibold text-white mt-4 mb-1.5',
  4: 'text-base font-semibold text-white mt-3 mb-1.5',
  5: 'text-sm font-semibold text-white mt-3 mb-1',
  6: 'text-sm font-semibold text-white/80 mt-3 mb-1',
};

// ── Block parsing ──
export function renderRich(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const blocks = [];
  let list = null;      // { ordered, items: [] }
  let quote = null;     // string[]
  let para = [];        // string[]
  let k = 0;

  const flushPara = () => {
    if (para.length) {
      blocks.push(<p key={k++} className="my-3 leading-relaxed">{renderInline(para.join(' '), `p${k}`)}</p>);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const Tag = list.ordered ? 'ol' : 'ul';
      blocks.push(
        <Tag key={k++} className={`my-3 space-y-1.5 pl-5 ${list.ordered ? 'list-decimal' : 'list-disc'}`}>
          {list.items.map((it, j) => <li key={j} className="leading-relaxed pl-1">{renderInline(it, `li${k}-${j}`)}</li>)}
        </Tag>
      );
      list = null;
    }
  };
  const flushQuote = () => {
    if (quote) {
      blocks.push(
        <blockquote key={k++} className="my-3 border-l-2 border-gold-primary/50 pl-4 text-text-muted italic">
          {renderInline(quote.join(' '), `q${k}`)}
        </blockquote>
      );
      quote = null;
    }
  };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };

  for (const raw of lines) {
    const t = raw.trim();

    if (t === '') { flushAll(); continue; }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flushAll(); blocks.push(<hr key={k++} className="my-4 border-white/10" />); continue; }

    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushAll();
      const lvl = h[1].length;
      const Tag = `h${lvl}`;
      blocks.push(<Tag key={k++} className={HEADING_CLS[lvl]}>{renderInline(h[2].replace(/\s*#+\s*$/, ''), `h${k}`)}</Tag>);
      continue;
    }

    const q = t.match(/^>\s?(.*)$/);
    if (q) { flushPara(); flushList(); (quote ||= []).push(q[1]); continue; }

    const ol = t.match(/^\d+[.)]\s+(.*)$/);
    const ul = t.match(/^[-*+]\s+(.*)$/);
    if (ol) { flushPara(); flushQuote(); if (!list || !list.ordered) { flushList(); list = { ordered: true, items: [] }; } list.items.push(ol[1]); continue; }
    if (ul) { flushPara(); flushQuote(); if (!list || list.ordered) { flushList(); list = { ordered: false, items: [] }; } list.items.push(ul[1]); continue; }

    flushList(); flushQuote();
    para.push(t);
  }
  flushAll();
  return blocks;
}

// ── Plain-text preview (strip markdown) for card teasers ──
export function stripMarkdown(text) {
  return String(text || '')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1')   // links → label
    .replace(/[#>*_`~\[\]]/g, '')                    // markdown punctuation
    .replace(/https?:\/\/\S+/g, '')                  // bare urls
    .replace(/\s+/g, ' ')
    .trim();
}
