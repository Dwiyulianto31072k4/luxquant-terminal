// Lightweight markdown renderer for assistant answers (no dependency).
// Handles: # / ## / ### headings, bullet & numbered lists, --- dividers,
// **bold** (gold), `inline code`, and paragraphs. Tuned for LLM output.

export function renderInline(text) {
  const nodes = [];
  const re = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(<span key={i++}>{text.slice(last, m.index)}</span>);
    if (m[2] !== undefined) nodes.push(<strong key={i++} className="font-semibold text-gold-primary">{m[2]}</strong>);
    else if (m[3] !== undefined) nodes.push(<code key={i++} className="rounded bg-white/10 px-1 py-0.5 font-mono text-[12px] text-gold-primary/90">{m[3]}</code>);
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push(<span key={i++}>{text.slice(last)}</span>);
  return nodes;
}

export function renderMarkdown(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const blocks = [];
  let list = null;
  let para = [];
  let k = 0;

  const flushPara = () => {
    if (para.length) { blocks.push(<p key={k++} className="leading-relaxed">{renderInline(para.join(' '))}</p>); para = []; }
  };
  const flushList = () => {
    if (list) {
      const Tag = list.ordered ? 'ol' : 'ul';
      blocks.push(
        <Tag key={k++} className={`space-y-1 pl-1 ${list.ordered ? 'list-decimal list-inside' : ''}`}>
          {list.items.map((it, j) => (
            <li key={j} className="leading-relaxed">
              {!list.ordered && <span className="mr-2 text-gold-primary/70">•</span>}
              {renderInline(it)}
            </li>
          ))}
        </Tag>
      );
      list = null;
    }
  };

  for (let raw of lines) {
    const t = raw.trimEnd().trim();
    if (t === '') { flushPara(); flushList(); continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flushPara(); flushList(); blocks.push(<div key={k++} className="my-1 h-px bg-white/10" />); continue; }

    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) { flushPara(); flushList(); blocks.push(<p key={k++} className="mt-1 font-semibold text-white">{renderInline(h[2])}</p>); continue; }

    const ol = t.match(/^\d+[.)]\s+(.*)$/);
    const ul = t.match(/^[-*]\s+(.*)$/);
    if (ol) { flushPara(); if (!list || !list.ordered) { flushList(); list = { ordered: true, items: [] }; } list.items.push(ol[1]); continue; }
    if (ul) { flushPara(); if (!list || list.ordered) { flushList(); list = { ordered: false, items: [] }; } list.items.push(ul[1]); continue; }

    flushList();
    para.push(t);
  }
  flushPara(); flushList();
  return blocks;
}
