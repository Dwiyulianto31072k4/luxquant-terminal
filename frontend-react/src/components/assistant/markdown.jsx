// Lightweight markdown renderer for assistant answers (no dependency).
// Handles: # / ## / ### headings, bullet & numbered lists, --- dividers,
// **bold** (gold), `inline code`, paragraphs — AND auto-links any mention of a
// LuxQuant page to that page (SPA navigation via the onLink callback).

// Display name -> route. Longest names first so "Market Pulse" wins over "Pulse".
const PAGE_ROUTES = [
  ['Potential Trades', '/signals'],
  ['Performance Hub', '/performance'],
  ['Market Pulse', '/market-pulse'],
  ['Money Flow', '/money-flow'],
  ['Order Book', '/orderbook'],
  ['AI Research', '/ai-arena'],
  ['On-Chain', '/onchain'],
  ['AutoTrade', '/autotrade'],
  ['Delistings', '/delistings'],
  ['Watchlist', '/watchlist'],
  ['Portfolio', '/portfolio'],
  ['Performance', '/performance'],
  ['Referral', '/referral'],
  ['Calendar', '/calendar'],
  ['Bitcoin', '/bitcoin'],
  ['Markets', '/markets'],
  ['Journal', '/journal'],
  ['Pulse', '/market-pulse'],
  ['News', '/crypto-news'],
  ['Tips', '/tips'],
  ['Home', '/home'],
].sort((a, b) => b[0].length - a[0].length);

const ROUTE_BY_NAME = Object.fromEntries(PAGE_ROUTES.map(([n, p]) => [n.toLowerCase(), p]));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PAGE_RE = new RegExp('\\b(' + PAGE_ROUTES.map(([n]) => esc(n)).join('|') + ')\\b', 'gi');

// Turn page-name mentions inside a plain string into clickable links.
function linkify(text, onLink, kb) {
  const nodes = [];
  let last = 0, m, i = 0;
  PAGE_RE.lastIndex = 0;
  while ((m = PAGE_RE.exec(text))) {
    if (m.index > last) nodes.push(<span key={`${kb}-${i++}`}>{text.slice(last, m.index)}</span>);
    const matched = m[0];
    const path = ROUTE_BY_NAME[matched.toLowerCase()];
    nodes.push(
      <a
        key={`${kb}-${i++}`}
        href={path}
        onClick={(e) => { e.preventDefault(); if (onLink) onLink(path); }}
        className="text-gold-primary underline underline-offset-2 hover:text-gold-light cursor-pointer"
      >
        {matched}
      </a>
    );
    last = PAGE_RE.lastIndex;
  }
  if (last < text.length) nodes.push(<span key={`${kb}-${i++}`}>{text.slice(last)}</span>);
  return nodes;
}

export function renderInline(text, onLink) {
  const nodes = [];
  const re = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(...linkify(text.slice(last, m.index), onLink, `t${i++}`));
    if (m[2] !== undefined) nodes.push(<strong key={`b${i++}`} className="font-semibold text-gold-primary">{linkify(m[2], onLink, `bi${i}`)}</strong>);
    else if (m[3] !== undefined) nodes.push(<code key={`c${i++}`} className="rounded bg-white/10 px-1 py-0.5 font-mono text-[12px] text-gold-primary/90">{m[3]}</code>);
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push(...linkify(text.slice(last), onLink, `e${i++}`));
  return nodes;
}

export function renderMarkdown(text, onLink) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const blocks = [];
  let list = null;
  let para = [];
  let k = 0;

  const flushPara = () => {
    if (para.length) { blocks.push(<p key={k++} className="leading-relaxed">{renderInline(para.join(' '), onLink)}</p>); para = []; }
  };
  const flushList = () => {
    if (list) {
      const Tag = list.ordered ? 'ol' : 'ul';
      blocks.push(
        <Tag key={k++} className={`space-y-1 pl-1 ${list.ordered ? 'list-decimal list-inside' : ''}`}>
          {list.items.map((it, j) => (
            <li key={j} className="leading-relaxed">
              {!list.ordered && <span className="mr-2 text-gold-primary/70">•</span>}
              {renderInline(it, onLink)}
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
    if (h) { flushPara(); flushList(); blocks.push(<p key={k++} className="mt-1 font-semibold text-text-primary">{renderInline(h[2], onLink)}</p>); continue; }

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
