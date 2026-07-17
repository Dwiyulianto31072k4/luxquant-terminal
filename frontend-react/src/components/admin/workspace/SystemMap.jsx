// src/components/admin/workspace/SystemMap.jsx
//
// LuxQuant — System Map, rebuilt on React Flow.
// Interactive service topology (Datadog / Grafana node-graph language):
//   • drag to pan · scroll / pinch to zoom · +/−/fit controls · minimap
//   • hover (desktop) or tap (mobile) a node → highlight its dependencies
//   • click a cluster → drill into its services → a service → detail + control
//   • detail panel = side drawer on desktop, bottom-sheet on mobile
// Data: /api/v1/workspace/services/topology
//
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import ReactFlow, {
  Background, Controls, MiniMap, Handle, Position,
  useNodesState, useEdgesState, ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { workspaceApi } from '../../../services/workspaceApi';

// ── palette / vocab (shared with the cards view) ──
const C = { ok: '#34d399', down: '#f87171', warn: '#fbbf24', idle: '#8a7a6e', gold: '#d4a853', teal: '#2dd4bf', blue: '#8a8a93', purple: '#8a8a93' };
const EDGE = {
  depends: { c: '#8a7a6e', flow: false, label: 'depends on' },
  db:      { c: '#8a8a93', flow: false, label: 'Postgres' },
  cache:   { c: '#f87171', flow: false, label: 'Redis' },
  poll:    { c: '#fbbf24', flow: true,  label: 'polls external' },
  deliver: { c: '#8a8a93', flow: true,  label: 'delivers to' },
  proxy:   { c: '#34d399', flow: false, label: 'proxies' },
};
const CATCOLOR = { 'Core API': C.gold, 'AI Compass': C.purple, 'AutoTrade / Cryptobot': C.teal, 'Signals': C.blue, 'Market Data': C.blue, 'Distribution': C.purple, 'Discord': '#5865F2', 'News': C.warn, 'Infrastructure': C.ok, 'Other': C.idle };
const CATFN = {
  'AI Compass': 'BTC Compass engine — event-driven reads, evaluation, resolver and daily reflection.',
  'AutoTrade / Cryptobot': 'The trading engine: ingestion, execution, price watch, reconciliation and alerts.',
  'Signals': 'Turns raw signals into tracked journeys, facts, tags and correlations.',
  'Market Data': 'Fetches and renders market data: liquidations, metadata, charts, PnL, money flow.',
  'Distribution': 'Delivers signals, alerts and posts out to Telegram, Discord and X.',
  'Discord': 'Discord-facing bots and relays.', 'News': 'Crypto news curation and posting.', 'Other': 'Miscellaneous services.',
};
const CLUSTER_ORDER = ['AI Compass', 'AutoTrade / Cryptobot', 'Signals', 'Market Data', 'Distribution', 'Discord', 'News', 'Other'];

// ── helpers ──
const hex = (c, a) => { const h = c.replace('#', ''); return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`; };
const cById = (h) => h === 'ok' ? C.ok : h === 'down' ? C.down : h === 'warn' ? C.warn : C.idle;
const hstatus = (l) => l.some(x => x.health === 'down') ? 'down' : l.some(x => x.health === 'warn') ? 'warn' : l.every(x => x.health === 'idle') ? 'idle' : 'ok';
const fmtUptime = (s) => { if (s == null) return '—'; s = Math.floor(s); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); if (d > 0) return `${d}d ${h}h`; if (h > 0) return `${h}h ${m}m`; if (m > 0) return `${m}m`; return `${s}s`; };
const fmtBytes = (n) => { if (n == null) return '—'; if (n < 1024) return `${n} B`; const u = ['KB', 'MB', 'GB']; let v = n / 1024, i = 0; while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; } return `${v.toFixed(v < 10 ? 1 : 0)} ${u[i]}`; };

// ════════════════════════════════════════════════════════════════════
// Custom nodes
// ════════════════════════════════════════════════════════════════════

const HANDLE = { opacity: 0, width: 6, height: 6, minWidth: 0, minHeight: 0, border: 'none', background: 'transparent' };

const ServiceNode = ({ data }) => {
  const size = data.size || 48;
  const c = data.color;
  const down = data.health === 'down';
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <Handle id="lt" type="target" position={Position.Left} style={HANDLE} />
      <Handle id="ls" type="source" position={Position.Left} style={HANDLE} />
      <Handle id="rt" type="target" position={Position.Right} style={HANDLE} />
      <Handle id="rs" type="source" position={Position.Right} style={HANDLE} />
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: hex(c, 0.16), border: `2px solid ${hex(c, 0.72)}`,
        boxShadow: `0 0 16px ${hex(c, down ? 0.55 : 0.28)}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {data.count != null
          ? <span style={{ color: 'rgb(var(--fg))', fontWeight: 700, fontSize: size > 52 ? 16 : 14 }}>{data.count}</span>
          : <span style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />}
      </div>
      {down && <span className="lqf-ping" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${c}` }} />}
      <div style={{ position: 'absolute', top: size + 5, left: '50%', transform: 'translateX(-50%)', width: 132, textAlign: 'center', pointerEvents: 'none' }}>
        <div style={{ color: 'rgb(var(--fg))', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.title}</div>
        <div style={{ color: 'rgb(var(--fg-muted))', fontSize: 9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.sub}</div>
      </div>
    </div>
  );
};

const TierNode = ({ data }) => (
  <div style={{ color: 'rgb(var(--fg-muted))', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', whiteSpace: 'nowrap', pointerEvents: 'none', fontWeight: 600 }}>
    {data.label}
  </div>
);

const nodeTypes = { service: ServiceNode, tier: TierNode };

// ════════════════════════════════════════════════════════════════════
// Graph builder — topology → React Flow nodes/edges + adjacency
// ════════════════════════════════════════════════════════════════════

function buildGraph(topo) {
  const nodes = topo.nodes || [], externals = topo.externals || [], edges = topo.edges || [];
  const byName = Object.fromEntries(nodes.map(n => [n.name, n]));
  const extById = Object.fromEntries(externals.map(e => [e.id, e]));
  const clusters = CLUSTER_ORDER.filter(c => nodes.some(n => n.category === c));
  const infra = nodes.filter(n => n.category === 'Infrastructure');
  const core = nodes.filter(n => n.category === 'Core API');
  const clusterOf = (name) => { const n = byName[name]; return (n && !['Infrastructure', 'Core API'].includes(n.category)) ? 'cat:' + n.category : name; };

  const tiers = [
    { x: 0,    label: 'External APIs',  items: externals.map(e => ({ id: e.id, kind: 'ext', ext: e })), size: 42 },
    { x: 320,  label: 'Infrastructure', items: infra.map(n => ({ id: n.name, kind: 'node', node: n })), size: 50 },
    { x: 620,  label: 'Core',           items: core.map(n => ({ id: n.name, kind: 'node', node: n })), size: 62 },
    { x: 940,  label: 'Worker clusters',items: clusters.map(c => ({ id: 'cat:' + c, kind: 'cluster', cluster: c })), size: 58 },
  ];

  const V = 118;
  const pos = {};
  const rfNodes = [];
  tiers.forEach((t, ti) => {
    const n = t.items.length;
    const topY = -((n - 1) * V) / 2;
    // tier label
    rfNodes.push({
      id: `tier:${ti}`, type: 'tier', position: { x: t.x - 8, y: topY - 62 },
      data: { label: t.label }, selectable: false, draggable: false, connectable: false, focusable: false,
    });
    t.items.forEach((it, i) => {
      const y = topY + i * V;
      pos[it.id] = { x: t.x, y };
      let d;
      if (it.kind === 'ext') {
        d = { title: it.ext.name, sub: 'external', color: C.idle, health: 'ext', size: t.size };
      } else if (it.kind === 'cluster') {
        const list = nodes.filter(nn => nn.category === it.cluster);
        const health = hstatus(list);
        d = { title: it.cluster.replace(' / Cryptobot', ''), sub: `${list.length} services`, color: CATCOLOR[it.cluster] || C.idle, health, count: list.length, size: t.size };
      } else {
        const nn = it.node, health = nn.health;
        d = { title: nn.name, sub: nn.kind === 'timer' ? 'timer' : (nn.uptime_seconds != null ? 'up ' + fmtUptime(nn.uptime_seconds) : (nn.active_state || 'inactive')), color: cById(health), health, size: t.size };
      }
      rfNodes.push({ id: it.id, type: 'service', position: { x: t.x, y }, data: d });
    });
  });

  const drawn = new Set();
  const rfEdges = [];
  const adj = {};
  const link = (a, b) => { (adj[a] = adj[a] || new Set()).add(b); (adj[b] = adj[b] || new Set()).add(a); };
  edges.forEach(e => {
    const A = clusterOf(e.from);
    const B = extById[e.to] ? e.to : clusterOf(e.to);
    if (!pos[A] || !pos[B] || A === B) return;
    const key = `${A}|${B}|${e.type}`;
    if (drawn.has(key)) return; drawn.add(key);
    const cfg = EDGE[e.type] || EDGE.depends;
    const rightward = pos[B].x >= pos[A].x;
    rfEdges.push({
      id: key, source: A, target: B,
      sourceHandle: rightward ? 'rs' : 'ls',
      targetHandle: rightward ? 'lt' : 'rt',
      type: 'default', animated: !!cfg.flow,
      style: { stroke: cfg.c, strokeWidth: 1.6, opacity: 0.4 },
      data: { base: 0.4 },
    });
    link(A, B);
  });

  return { rfNodes, rfEdges, adj };
}

// ════════════════════════════════════════════════════════════════════
// Detail drawer (side on desktop / bottom-sheet on mobile)
// ════════════════════════════════════════════════════════════════════

const Pill = ({ h }) => {
  const m = { ok: ['Running', C.ok], down: ['Failed', C.down], warn: ['Busy', C.warn], idle: ['Idle', C.idle] }[h] || ['Unknown', C.idle];
  return <span className="lqd-pill" style={{ background: hex(m[1], 0.14), color: m[1] }}>{m[0]}</span>;
};

const ConnRow = ({ name, type, dir }) => {
  const v = EDGE[type] || EDGE.depends;
  return (
    <div className="lqd-conn">
      <span className="lqd-line" style={{ borderTopColor: v.c, borderTopStyle: v.flow ? 'dashed' : 'solid' }} />
      {dir === 'out' ? '→' : '←'} {name}
      <span style={{ marginLeft: 'auto', color: v.c, fontSize: 10 }}>{v.label}</span>
    </div>
  );
};

function DetailModal({ selectedId, topo, onClose, onAction }) {
  const [view, setView] = useState(null); // {kind, id}
  useEffect(() => {
    if (!selectedId) { setView(null); return; }
    if (selectedId.startsWith('cat:')) setView({ kind: 'cluster', id: selectedId.slice(4) });
    else setView({ kind: 'auto', id: selectedId });
  }, [selectedId]);
  useEffect(() => {
    if (!selectedId) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, onClose]);

  if (!selectedId || !view) return null;
  const nodes = topo.nodes || [], externals = topo.externals || [], edges = topo.edges || [];
  const byName = Object.fromEntries(nodes.map(n => [n.name, n]));
  const extById = Object.fromEntries(externals.map(e => [e.id, e]));
  const nameOf = (id) => byName[id]?.name || extById[id]?.name || id;
  const connFor = (id) => {
    const out = edges.filter(e => e.from === id).map((e, i) => <ConnRow key={'o' + i} name={nameOf(e.to)} type={e.type} dir="out" />);
    const inc = edges.filter(e => e.to === id).map((e, i) => <ConnRow key={'i' + i} name={nameOf(e.from)} type={e.type} dir="in" />);
    const all = out.concat(inc);
    return all.length ? all : <div className="lqd-conn" style={{ color: 'rgb(var(--fg-muted))' }}>no mapped connections</div>;
  };

  let body;
  if (view.kind === 'cluster') {
    const list = nodes.filter(n => n.category === view.id);
    body = (
      <>
        <h3>{view.id}</h3>
        <div className="lqd-sub">{CATFN[view.id] || ''}</div>
        <div style={{ margin: '10px 0' }}><Pill h={hstatus(list)} /> <span style={{ color: 'rgb(var(--fg-muted))', fontSize: 12 }}>· {list.length} services</span></div>
        {list.map(n => (
          <div key={n.name} className="lqd-svc" onClick={() => setView({ kind: 'service', id: n.name })}>
            <div className="lqd-row">
              <span className="lqd-st"><span className="lqd-dot" style={{ background: cById(n.health) }} />{n.name}</span>
              <Pill h={n.health} />
            </div>
            {n.description && <div className="lqd-sd">{n.description}</div>}
          </div>
        ))}
      </>
    );
  } else if (extById[view.id]) {
    const e = extById[view.id];
    body = (<><h3>{e.name}</h3><div className="lqd-sub">{e.fn || ''}</div><div className="lqd-caps">Used by</div>{connFor(e.id)}</>);
  } else {
    const n = byName[view.id] || byName[selectedId];
    if (!n) return null;
    const backToCluster = view.kind === 'service' && n.category && !['Infrastructure', 'Core API'].includes(n.category);
    body = (
      <>
        {backToCluster && <button className="lqd-back" onClick={() => setView({ kind: 'cluster', id: n.category })}>← {n.category}</button>}
        <h3>{n.name}</h3>
        <div className="lqd-sub">{n.fn || n.description || ''}</div>
        <div className="lqd-statwrap">
          <div className="lqd-kv"><span>status</span><Pill h={n.health} /></div>
          <div className="lqd-kv"><span>type</span><span>{n.kind}</span></div>
          <div className="lqd-kv"><span>uptime</span><span>{n.uptime_seconds != null ? fmtUptime(n.uptime_seconds) : '—'}</span></div>
          <div className="lqd-kv"><span>memory</span><span>{fmtBytes(n.memory_bytes)}</span></div>
          <div className="lqd-kv"><span>pid</span><span>{n.main_pid || '—'}</span></div>
          <div className="lqd-kv"><span>restarts</span><span>{n.restarts || 0}</span></div>
        </div>
        <div className="lqd-caps">Connections</div>{connFor(n.name)}
        <div className="lqd-acts">
          <button className="lqd-cbtn" style={{ borderColor: hex(C.gold, 0.3), color: C.gold }} onClick={() => onAction(n.unit, 'restart')}>↻ Restart</button>
          {n.active_state === 'active'
            ? <button className="lqd-cbtn" style={{ borderColor: hex(C.down, 0.3), color: C.down }} onClick={() => onAction(n.unit, 'stop')}>⊘ Stop</button>
            : <button className="lqd-cbtn" style={{ borderColor: hex(C.ok, 0.3), color: C.ok }} onClick={() => onAction(n.unit, 'start')}>⚡ Start</button>}
        </div>
      </>
    );
  }

  return createPortal(
    <div className="lqm-overlay" onClick={onClose}>
      <div className="lqm-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="lqm-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="lqd-body">{body}</div>
      </div>
    </div>,
    document.body,
  );
}

// ════════════════════════════════════════════════════════════════════
// Flow canvas
// ════════════════════════════════════════════════════════════════════

const defaultEdgeOptions = { type: 'default' };

function MapFlow({ topo, onAction }) {
  const graph = useMemo(() => buildGraph(topo), [topo]);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedId, setSelectedId] = useState(null);
  const adjRef = useRef({});
  const selRef = useRef(null);

  useEffect(() => {
    setNodes(graph.rfNodes);
    setEdges(graph.rfEdges);
    adjRef.current = graph.adj;
  }, [graph, setNodes, setEdges]);

  const applyFocus = useCallback((id) => {
    setNodes((ns) => ns.map((n) => {
      if (n.type === 'tier') return n;
      const on = !id || id === n.id || adjRef.current[id]?.has(n.id);
      return { ...n, style: { ...n.style, opacity: on ? 1 : 0.14, transition: 'opacity .2s' } };
    }));
    setEdges((es) => es.map((e) => {
      const on = !id || e.source === id || e.target === id;
      return { ...e, style: { ...e.style, opacity: on ? (e.data?.base ?? 0.4) : 0.04 } };
    }));
  }, [setNodes, setEdges]);

  const onNodeClick = useCallback((_e, node) => {
    if (node.type === 'tier') return;
    setSelectedId(node.id); selRef.current = node.id; applyFocus(node.id);
  }, [applyFocus]);
  const onNodeEnter = useCallback((_e, node) => { if (node.type !== 'tier') applyFocus(node.id); }, [applyFocus]);
  const onNodeLeave = useCallback(() => applyFocus(selRef.current), [applyFocus]);
  const onPaneClick = useCallback(() => { setSelectedId(null); selRef.current = null; applyFocus(null); }, [applyFocus]);
  const closeDrawer = useCallback(() => { setSelectedId(null); selRef.current = null; applyFocus(null); }, [applyFocus]);

  return (
    <div className="lqf-root">
      <style>{CSS}</style>
      <div className="lqf-box">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          onNodeClick={onNodeClick}
          onNodeMouseEnter={onNodeEnter}
          onNodeMouseLeave={onNodeLeave}
          onPaneClick={onPaneClick}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          minZoom={0.25}
          maxZoom={2.4}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
          zoomOnScroll
          zoomOnPinch
          panOnDrag
        >
          <Background gap={22} size={1} color="rgb(var(--ink) / 0.05)" />
          <MiniMap
            className="lqf-mini"
            pannable zoomable
            nodeColor={(n) => n.data?.color || '#8a7a6e'}
            nodeStrokeWidth={0}
            maskColor="rgba(10,5,6,0.6)"
            style={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--ink) / 0.08)', borderRadius: 8 }}
          />
          <Controls showInteractive={false} />
        </ReactFlow>

        {/* legend */}
        <div className="lqf-legend">
          {Object.values(EDGE).map((v, i) => (
            <span key={i}><i className="lqf-lz" style={{ borderTopColor: v.c, borderTopStyle: v.flow ? 'dashed' : 'solid' }} />{v.label}</span>
          ))}
        </div>

        <DetailModal selectedId={selectedId} topo={topo} onClose={closeDrawer} onAction={onAction} />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Styling
// ════════════════════════════════════════════════════════════════════

const CSS = `
.lqf-root{position:relative}
.lqf-box{position:relative;border:1px solid rgb(var(--ink) / .07);border-radius:16px;overflow:hidden;background:linear-gradient(180deg,rgb(var(--surface)),rgb(var(--surface)));height:clamp(440px,64vh,660px)}
.lqf-box::before{content:"";position:absolute;inset:0 0 auto 0;height:1px;background:linear-gradient(to right,transparent,rgba(212,168,83,.45),transparent);z-index:5;pointer-events:none}
.lqf-box .react-flow__renderer,.lqf-box .react-flow{background:transparent}
.lqf-ping{animation:lqfping 1.5s ease-out infinite}
@keyframes lqfping{0%{transform:scale(1);opacity:.7}100%{transform:scale(1.5);opacity:0}}

/* React Flow control chrome → dark/gold */
.lqf-box .react-flow__controls{box-shadow:0 6px 20px rgba(0,0,0,.4);border-radius:8px;overflow:hidden}
.lqf-box .react-flow__controls-button{background:rgb(var(--surface-secondary));border-bottom:1px solid rgb(var(--ink) / .08);width:28px;height:28px}
.lqf-box .react-flow__controls-button:hover{background:#20121a}
.lqf-box .react-flow__controls-button svg{fill:#d4a853;max-width:14px;max-height:14px}
.lqf-mini{bottom:12px;right:12px}

/* legend */
.lqf-legend{position:absolute;bottom:12px;left:14px;display:flex;gap:14px;flex-wrap:wrap;font-size:10.5px;color:#a8967e;background:rgba(10,5,6,.72);padding:8px 12px;border:1px solid rgb(var(--ink) / .07);border-radius:10px;z-index:4;max-width:60%}
.lqf-legend span{display:inline-flex;align-items:center;gap:6px}
.lqf-lz{width:18px;height:0;border-top-width:2px;border-top-style:solid;display:inline-block}

/* node detail — centered modal (SignalModal-style) */
.lqm-overlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.62);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);animation:lqfade .18s ease}
@keyframes lqfade{from{opacity:0}to{opacity:1}}
.lqm-card{position:relative;width:min(680px,94vw);max-height:86vh;display:flex;flex-direction:column;background:linear-gradient(180deg,rgb(var(--surface-raised)),rgb(var(--surface)));border:1px solid rgb(var(--line) / .22);border-radius:18px;box-shadow:0 30px 90px rgba(0,0,0,.65);overflow:hidden;animation:lqpop .26s cubic-bezier(.16,1,.3,1)}
@keyframes lqpop{from{opacity:0;transform:translateY(16px) scale(.97)}to{opacity:1;transform:none}}
.lqm-card::before{content:"";position:absolute;inset:0 0 auto 0;height:1px;background:linear-gradient(to right,transparent,rgba(212,168,83,.5),transparent);z-index:2}
.lqm-close{position:absolute;top:14px;right:14px;width:30px;height:30px;border-radius:8px;border:1px solid rgb(var(--ink) / .12);background:rgb(var(--surface));color:#a8967e;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;transition:.15s;z-index:3}
.lqm-close:hover{color:#fff;border-color:rgba(248,113,113,.5);background:rgba(248,113,113,.14)}
.lqd-body{padding:22px;overflow-y:auto}
.lqd-body h3{font-size:18px;font-weight:600;margin:0 0 3px;color:#f5f0e8;padding-right:34px}
.lqd-sub{font-size:12.5px;color:#a8967e;line-height:1.6;margin:4px 0 6px}
.lqd-caps{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#a8967e;margin:20px 0 8px}
.lqd-back{background:transparent;border:none;color:#a8967e;font-size:12px;cursor:pointer;padding:0 0 10px}
.lqd-back:hover{color:#f5f0e8}
.lqd-statwrap{display:grid;grid-template-columns:1fr 1fr;gap:0 22px}
.lqd-svc{border:1px solid rgb(var(--ink) / .07);border-radius:12px;padding:12px 14px;margin-top:10px;cursor:pointer;background:rgb(var(--ink) / .015);transition:.15s}
.lqd-svc:hover{border-color:rgba(212,168,83,.35);background:rgb(var(--ink) / .04);transform:translateY(-1px)}
.lqd-st{font-size:13px;font-weight:600;display:flex;align-items:center;gap:7px;color:#f5f0e8}
.lqd-sd{font-size:11px;color:#a8967e;margin-top:3px;line-height:1.4}
.lqd-row{display:flex;align-items:center;justify-content:space-between;gap:8px}
.lqd-dot{width:7px;height:7px;border-radius:50%;display:inline-block}
.lqd-pill{font-size:10px;padding:3px 8px;border-radius:6px;font-weight:600}
.lqd-kv{display:flex;justify-content:space-between;font-size:12px;padding:7px 0;border-bottom:1px solid rgb(var(--ink) / .06);color:#f5f0e8}
.lqd-kv span:first-child{color:#a8967e}
.lqd-conn{font-size:12px;padding:8px 0;display:flex;align-items:center;gap:8px;border-bottom:1px solid rgb(var(--ink) / .06);color:#f5f0e8}
.lqd-line{width:16px;height:0;border-top-width:2px;border-top-style:solid;display:inline-block}
.lqd-acts{display:flex;gap:10px;margin-top:18px;flex-wrap:wrap}
.lqd-cbtn{font-size:12px;font-weight:600;padding:9px 16px;border-radius:9px;cursor:pointer;border:1px solid;background:transparent;transition:.15s}
.lqd-cbtn:hover{filter:brightness(1.3)}
@media(max-width:640px){
  .lqm-overlay{padding:0;align-items:flex-end}
  .lqm-card{width:100%;max-height:90vh;border-radius:18px 18px 0 0;animation:lqup .28s cubic-bezier(.16,1,.3,1)}
  .lqd-statwrap{grid-template-columns:1fr}
  .lqf-legend{display:none}
  .lqf-mini{display:none}
}
@keyframes lqup{from{transform:translateY(100%)}to{transform:translateY(0)}}
`;

// ════════════════════════════════════════════════════════════════════
// Public component
// ════════════════════════════════════════════════════════════════════

export default function SystemMap() {
  const [topo, setTopo] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setTopo(await workspaceApi.getServicesTopology()); setError(null); }
    catch (e) { setError(e?.response?.data?.detail || e.message); }
    finally { setLoading(false); }
  }, []);

  const onAction = useCallback(async (unit, action) => {
    const verb = action === 'restart' ? 'Restart' : action === 'stop' ? 'Stop' : 'Start';
    if (!window.confirm(`${verb} "${unit}" on the VPS?`)) return;
    try { const r = await workspaceApi.controlService(unit, action); if (!r.ok) window.alert(`${verb} failed:\n${r.message || 'unknown'}`); await load(); }
    catch (e) { window.alert(`${verb} failed:\n${e?.response?.data?.detail || e.message}`); }
  }, [load]);

  useEffect(() => { load(); }, [load]);

  if (loading && !topo) return <div style={{ padding: '60px 0', textAlign: 'center', color: 'rgb(var(--fg-muted))' }}>Loading topology…</div>;
  if (error) return <div style={{ padding: 16, borderRadius: 10, background: 'rgba(248,113,113,.08)', border: '1px solid rgba(248,113,113,.25)', color: '#fca5a5', fontSize: 13 }}>{error}</div>;
  if (topo && topo.available === false) return <div style={{ padding: '40px 0', textAlign: 'center', color: 'rgb(var(--fg-muted))' }}>{topo.reason || 'Topology unavailable.'}</div>;
  if (!topo) return null;

  return (
    <ReactFlowProvider>
      <MapFlow topo={topo} onAction={onAction} />
    </ReactFlowProvider>
  );
}
