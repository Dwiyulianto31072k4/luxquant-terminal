// src/components/admin/workspace/SystemMap.jsx
//
// LuxQuant — System Map. Circular-node service topology (Datadog / Grafana
// node-graph language) rendered imperatively into a scoped SVG. Live health
// + typed connection edges from /api/v1/workspace/services/topology.
//   • hover a node  → tooltip with what it does + highlight its connections
//   • click a cluster → drill panel of its services → click a service → detail
//   • flow-animated edges for external polling / delivery
//
import { useEffect, useRef, useState, useCallback } from 'react';
import { workspaceApi } from '../../../services/workspaceApi';

const C = { ok:'#34d399', down:'#f87171', warn:'#fbbf24', idle:'#8a7a6e', gold:'#d4a853', teal:'#2dd4bf', blue:'#60a5fa', purple:'#a78bfa' };
const EDGE = {
  depends:{ c:'#8a7a6e', flow:false, label:'depends on' },
  db:{ c:'#60a5fa', flow:false, label:'Postgres' },
  cache:{ c:'#f87171', flow:false, label:'Redis' },
  poll:{ c:'#fbbf24', flow:true, label:'polls external' },
  deliver:{ c:'#a78bfa', flow:true, label:'delivers to' },
  proxy:{ c:'#34d399', flow:false, label:'proxies' },
};
const CATCOLOR = { 'Core API':C.gold, 'AI Compass':C.purple, 'AutoTrade / Cryptobot':C.teal, 'Signals':C.blue, 'Market Data':C.blue, 'Distribution':C.purple, 'Discord':'#5865F2', 'News':C.warn, 'Infrastructure':C.ok, 'Other':C.idle };
const CATFN = {
  'AI Compass':'BTC Compass engine — event-driven reads, evaluation, resolver and daily reflection.',
  'AutoTrade / Cryptobot':'The trading engine: ingestion, execution, price watch, reconciliation and alerts.',
  'Signals':'Turns raw signals into tracked journeys, facts, tags and correlations.',
  'Market Data':'Fetches and renders market data: liquidations, metadata, charts, PnL, money flow.',
  'Distribution':'Delivers signals, alerts and posts out to Telegram, Discord and X.',
  'Discord':'Discord-facing bots and relays.', 'News':'Crypto news curation and posting.', 'Other':'Miscellaneous services.',
};
const CLUSTER_ORDER = ['AI Compass','AutoTrade / Cryptobot','Signals','Market Data','Distribution','Discord','News','Other'];

const NS = 'http://www.w3.org/2000/svg';
const cById = (h) => h==='ok'?C.ok:h==='down'?C.down:h==='warn'?C.warn:C.idle;
const cssid = (x) => String(x).replace(/[^a-z0-9]/gi,'_');
const hex = (c,a) => { const h=c.replace('#',''); return `rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${a})`; };
const trunc = (s,n) => s.length>n ? s.slice(0,n-1)+'…' : s;
const fmtUptime = (secs) => { if(secs==null) return '—'; const s=Math.floor(secs),d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60); if(d>0)return `${d}d ${h}h`; if(h>0)return `${h}h ${m}m`; if(m>0)return `${m}m`; return `${s}s`; };
const fmtBytes = (n) => { if(n==null) return '—'; if(n<1024) return `${n} B`; const u=['KB','MB','GB']; let v=n/1024,i=0; while(v>=1024&&i<u.length-1){v/=1024;i++;} return `${v.toFixed(v<10?1:0)} ${u[i]}`; };
const hstatus = (l) => l.some(x=>x.health==='down')?'down':l.some(x=>x.health==='warn')?'warn':l.every(x=>x.health==='idle')?'idle':'ok';
const statusPill = (h) => { const m={ok:['Running',C.ok],down:['Failed',C.down],warn:['Busy',C.warn],idle:['Idle',C.idle]}[h]; return `<span class="lqpill" style="background:${hex(m[1],.14)};color:${m[1]}">${m[0]}</span>`; };

function buildMap(root, data, onAction) {
  const svg = root.querySelector('svg');
  const tip = root.querySelector('.lqtip');
  const panel = root.querySelector('.lqpanel');
  const pbody = root.querySelector('.lqpbody');
  const el = (t,a) => { const e=document.createElementNS(NS,t); for(const k in a) e.setAttribute(k,a[k]); return e; };
  const txt = (x,y,t,cls,anchor='middle') => { const e=el('text',{x,y,class:cls,'text-anchor':anchor}); e.textContent=t; return e; };
  const nodes = data.nodes || [];
  const externals = data.externals || [];
  const edges = data.edges || [];
  const byName = Object.fromEntries(nodes.map(n=>[n.name,n]));
  const extById = Object.fromEntries(externals.map(e=>[e.id,e]));
  const clusters = CLUSTER_ORDER.filter(c => nodes.some(n=>n.category===c));
  const infra = nodes.filter(n=>n.category==='Infrastructure');
  const core = nodes.filter(n=>n.category==='Core API');
  const clusterOf = (name) => { const n=byName[name]; return (n && !['Infrastructure','Core API'].includes(n.category)) ? 'cat:'+n.category : name; };
  const nameOf = (id) => byName[id]?.name || extById[id]?.name || id;

  const nodePos = {};
  const tiers = [
    { cx:95, lbl:'External APIs', r:20, items: externals.map(e=>({ id:e.id, name:e.name, fn:e.fn, ext:true })) },
    { cx:360, lbl:'Infrastructure', r:26, items: infra },
    { cx:645, lbl:'Core', r:30, items: core },
    { cx:960, lbl:'Worker clusters', r:30, items: clusters.map(c=>({ id:'cat:'+c, cluster:c })) },
  ];
  svg.innerHTML='';
  const defs = el('defs',{});
  defs.innerHTML = '<filter id="lqglow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
  svg.appendChild(defs);
  tiers.forEach(t => svg.appendChild(txt(t.cx,30,t.lbl,'lqtierlbl')));
  tiers.forEach(t => { const n=t.items.length, top=80, span=520, gap=n>1?span/(n-1):0; t.items.forEach((it,i)=>{ nodePos[it.ext?it.id:(it.cluster?it.id:it.name)] = { x:t.cx, y:n>1?top+gap*i:top+span/2, r:t.r, it }; }); });

  const drawn = new Set();
  edges.forEach(e => {
    const A = clusterOf(e.from), B = extById[e.to]?e.to:clusterOf(e.to);
    if(!nodePos[A] || !nodePos[B]) return;
    const key=A+B+e.type; if(drawn.has(key)) return; drawn.add(key);
    const p=nodePos[A], q=nodePos[B], x1=p.x+(q.x>p.x?p.r:-p.r), x2=q.x+(q.x>p.x?-q.r:q.r), mx=(x1+x2)/2;
    const path = el('path',{ d:`M${x1},${p.y} C${mx},${p.y} ${mx},${q.y} ${x2},${q.y}`, class:'lqedge'+((EDGE[e.type]||{}).flow?' lqflow':''), stroke:(EDGE[e.type]||EDGE.depends).c });
    path.dataset.a=A; path.dataset.b=B; svg.appendChild(path);
  });

  Object.values(nodePos).forEach(np => {
    const { x,y,r,it } = np, g = el('g',{ class:'lqnode', id:'n_'+cssid(it.ext?it.id:(it.cluster?it.id:it.name)) });
    let health='ok', title, sub, stroke, list=[];
    if(it.ext){ title=it.name; sub='external'; stroke='#8a7a6e'; }
    else if(it.cluster){ list=nodes.filter(n=>n.category===it.cluster); health=hstatus(list); title=it.cluster.replace(' / Cryptobot',''); sub=list.length+' services'; stroke=CATCOLOR[it.cluster]||C.idle; }
    else { health=it.health; title=it.name; sub=it.kind==='timer'?'timer':(it.uptime_seconds!=null?'up '+fmtUptime(it.uptime_seconds):(it.active_state||'inactive')); stroke=cById(health); list=[it]; }
    const hc = it.ext?stroke:cById(health);
    g.appendChild(el('circle',{ cx:x, cy:y, r:r+7, fill:hex(hc,.14) }));
    g.appendChild(el('circle',{ class:'lqcore', cx:x, cy:y, r, fill:hex(hc,it.ext?0.10:0.16), stroke:hex(hc,.75), 'stroke-width':2, filter:'url(#lqglow)' }));
    if(health==='down'){ const ring=el('circle',{ cx:x, cy:y, r, fill:'none', stroke:C.down, 'stroke-width':2 }); ring.innerHTML=`<animate attributeName="r" from="${r}" to="${r+14}" dur="1.4s" repeatCount="indefinite"/><animate attributeName="opacity" from="0.7" to="0" dur="1.4s" repeatCount="indefinite"/>`; g.appendChild(ring); }
    if(it.cluster) g.appendChild(txt(x,y+5,list.length,'lqcount'));
    else g.appendChild(el('circle',{ cx:x, cy:y, r:5, fill:it.ext?'#8a7a6e':cById(health) }));
    g.appendChild(txt(x,y+r+16,trunc(title,18),'lqlabel'));
    g.appendChild(txt(x,y+r+28,trunc(sub,22),'lqnsub'));
    g.addEventListener('mouseenter',(ev)=>{ g.classList.add('hot'); highlight(it); showTip(ev,it,list,health); });
    g.addEventListener('mousemove',moveTip);
    g.addEventListener('mouseleave',()=>{ g.classList.remove('hot'); clearHi(); tip.classList.remove('on'); });
    g.addEventListener('click',()=>openNode(it));
    svg.appendChild(g);
  });

  root.querySelector('.lqlegend').innerHTML = Object.values(EDGE).map(v=>`<span><i class="lqlz" style="border-top-color:${v.c};border-top-style:${v.flow?'dashed':'solid'}"></i>${v.label}</span>`).join('');

  function highlight(it){
    const node = it.ext?it.id : (it.cluster?it.id : clusterOf(it.name));
    const keep = new Set([node]);
    svg.querySelectorAll('.lqedge').forEach(e=>{ if(e.dataset.a===node||e.dataset.b===node){ e.classList.remove('dim'); keep.add(e.dataset.a); keep.add(e.dataset.b); } else e.classList.add('dim'); });
    svg.querySelectorAll('.lqnode').forEach(n=>{ const nid=n.id.replace('n_',''); n.classList.toggle('dim',![...keep].some(k=>cssid(k)===nid)); });
  }
  function clearHi(){ svg.querySelectorAll('.lqedge').forEach(e=>e.classList.remove('dim')); svg.querySelectorAll('.lqnode').forEach(n=>n.classList.remove('dim')); }
  function showTip(ev,it,list,health){
    const name = it.cluster?it.cluster:it.name;
    const fn = it.cluster?(CATFN[it.cluster]||''):(it.fn||it.description||'');
    const col = it.ext?'#8a7a6e':(it.cluster?(CATCOLOR[it.cluster]||C.idle):cById(health));
    const meta = it.ext?'External dependency':it.cluster?(`${list.length} services · ${health}`):(it.description||'');
    tip.innerHTML = `<div class="lqtt"><span class="lqdot" style="background:${col}"></span>${name}</div><div class="lqtf">${fn}</div><div class="lqtm">${meta}</div>`;
    tip.classList.add('on'); moveTip(ev);
  }
  function moveTip(ev){ const m=root.querySelector('.lqmapbox').getBoundingClientRect(); let x=ev.clientX-m.left+14, y=ev.clientY-m.top+14; if(x>m.width-260)x=ev.clientX-m.left-260; tip.style.left=x+'px'; tip.style.top=y+'px'; }
  function connRow(name,type,dir){ const v=EDGE[type]||EDGE.depends; return `<div class="lqconn"><span class="lqlz" style="width:14px;border-top-color:${v.c};border-top-style:${v.flow?'dashed':'solid'}"></span>${dir==='out'?'→':'←'} ${name}<span style="margin-left:auto;color:${v.c};font-size:10px">${v.label}</span></div>`; }
  function connectionsFor(id){
    const out = edges.filter(e=>e.from===id).map(e=>connRow(nameOf(e.to),e.type,'out'));
    const inc = edges.filter(e=>e.to===id).map(e=>connRow(nameOf(e.from),e.type,'in'));
    const all = out.concat(inc);
    return all.length?all.join(''):'<div class="lqconn" style="color:#6b5c52">no mapped connections</div>';
  }
  function openNode(it){
    if(it.ext){ pbody.innerHTML=`<h3>${it.name}</h3><div class="lqsub">${it.fn||''}</div><div class="lqcaps">Used by</div>${connectionsFor(it.id)}`; panel.classList.add('open'); return; }
    if(it.cluster){ openCluster(it.cluster); return; }
    openService(it);
  }
  function openCluster(cat){
    const list = nodes.filter(n=>n.category===cat), h=hstatus(list);
    pbody.innerHTML = `<h3>${cat}</h3><div class="lqsub">${CATFN[cat]||''}</div><div style="margin:8px 0">${statusPill(h)} · ${list.length} services</div>` +
      list.map(n=>`<div class="lqsvc" data-svc="${cssid(n.name)}"><div class="lqrow"><span class="lqst"><span class="lqdot" style="background:${cById(n.health)}"></span>${n.name}</span>${statusPill(n.health)}</div><div class="lqsd">${n.description||''}</div></div>`).join('');
    pbody.querySelectorAll('.lqsvc').forEach(div=>{ const n=list.find(x=>cssid(x.name)===div.dataset.svc); div.addEventListener('click',()=>openService(n)); });
    panel.classList.add('open');
  }
  function openService(n){
    pbody.innerHTML = `<h3>${n.name}</h3><div class="lqsub">${n.fn||n.description||''}</div>
      <div class="lqkv"><span>status</span>${statusPill(n.health)}</div>
      <div class="lqkv"><span>type</span><span>${n.kind}</span></div>
      <div class="lqkv"><span>uptime</span><span>${n.uptime_seconds!=null?fmtUptime(n.uptime_seconds):'—'}</span></div>
      <div class="lqkv"><span>memory</span><span>${fmtBytes(n.memory_bytes)}</span></div>
      <div class="lqkv"><span>pid</span><span>${n.main_pid||'—'}</span></div>
      <div class="lqkv"><span>restarts</span><span>${n.restarts||0}</span></div>
      <div class="lqcaps">Connections</div>${connectionsFor(n.name)}
      <div class="lqacts">
        <button class="lqcbtn" data-unit="${n.unit}" data-act="restart" style="border-color:rgba(212,168,83,.3);color:${C.gold}">↻ Restart</button>
        ${n.active_state==='active'
          ? `<button class="lqcbtn" data-unit="${n.unit}" data-act="stop" style="border-color:rgba(248,113,113,.3);color:${C.down}">⊘ Stop</button>`
          : `<button class="lqcbtn" data-unit="${n.unit}" data-act="${n.kind==='timer'?'start':'start'}" style="border-color:rgba(52,211,153,.3);color:${C.ok}">⚡ Start</button>`}
      </div>`;
    pbody.querySelectorAll('.lqcbtn').forEach(b=>b.addEventListener('click',()=>onAction(b.dataset.unit,b.dataset.act)));
    panel.classList.add('open');
  }
}

const CSS = `
.lqmap-root{position:relative}
.lqmapbox{position:relative;background:linear-gradient(180deg,#0c0709,#0a0506);border:1px solid rgba(255,255,255,.07);border-radius:16px;overflow:hidden}
.lqmapbox::before{content:"";position:absolute;inset:0 0 auto 0;height:1px;background:linear-gradient(to right,transparent,rgba(212,168,83,.45),transparent);z-index:2}
.lqmapbox svg{display:block;width:100%;height:600px}
.lqtierlbl{fill:#6b5c52;font-size:10px;letter-spacing:.22em;text-transform:uppercase}
.lqlabel{fill:#f5f0e8;font-size:11px;font-weight:600}
.lqnsub{fill:#a8967e;font-size:9px}
.lqcount{fill:#fff;font-size:15px;font-weight:700}
.lqnode{cursor:pointer;transition:opacity .2s}
.lqnode.hot .lqcore{filter:brightness(1.25)}
.lqnode.dim{opacity:.14}
.lqedge{fill:none;stroke-width:1.6;opacity:.34;transition:opacity .2s}
.lqedge.lqflow{stroke-dasharray:5 6;animation:lqflow 1s linear infinite}
@keyframes lqflow{to{stroke-dashoffset:-11}}
.lqedge.dim{opacity:.05}
.lqlegend{position:absolute;bottom:12px;left:14px;display:flex;gap:14px;flex-wrap:wrap;font-size:10.5px;color:#a8967e;background:rgba(10,5,6,.72);padding:8px 12px;border:1px solid rgba(255,255,255,.07);border-radius:10px;z-index:2}
.lqlegend span{display:inline-flex;align-items:center;gap:6px}
.lqlz{width:18px;height:0;border-top-width:2px;border-top-style:solid;display:inline-block}
.lqdot{width:7px;height:7px;border-radius:50%;display:inline-block}
.lqtip{position:absolute;pointer-events:none;z-index:5;max-width:250px;background:#140a0e;border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:10px 12px;font-size:11px;opacity:0;transition:opacity .15s;box-shadow:0 12px 30px rgba(0,0,0,.55)}
.lqtip.on{opacity:1}
.lqtt{font-weight:700;font-size:12px;margin-bottom:3px;display:flex;align-items:center;gap:6px;color:#f5f0e8}
.lqtf{color:#a8967e;line-height:1.5}
.lqtm{color:#6b5c52;font-size:10px;margin-top:5px}
.lqpanel{position:absolute;top:0;right:0;height:100%;width:340px;background:#0a0805;border-left:1px solid rgba(255,255,255,.12);transform:translateX(100%);transition:transform .3s cubic-bezier(.16,1,.3,1);padding:18px;overflow-y:auto;z-index:4}
.lqpanel.open{transform:translateX(0)}
.lqpanel h3{font-size:16px;font-weight:600;margin:0 0 2px;color:#f5f0e8}
.lqpclose{position:absolute;top:14px;right:14px;cursor:pointer;color:#6b5c52;font-size:18px;z-index:5}
.lqsub{font-size:12px;color:#a8967e;line-height:1.5;margin:4px 0 6px}
.lqcaps{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#a8967e;margin:16px 0 4px}
.lqsvc{border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:10px 12px;margin-top:9px;cursor:pointer;background:rgba(255,255,255,.015);transition:.15s}
.lqsvc:hover{border-color:rgba(255,255,255,.12);background:rgba(255,255,255,.04);transform:translateX(-2px)}
.lqst{font-size:12.5px;font-weight:600;display:flex;align-items:center;gap:7px;color:#f5f0e8}
.lqsd{font-size:10.5px;color:#a8967e;margin-top:2px}
.lqrow{display:flex;align-items:center;justify-content:space-between;gap:8px}
.lqpill{font-size:9.5px;padding:2px 7px;border-radius:5px;font-weight:600}
.lqkv{display:flex;justify-content:space-between;font-size:11px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.07);color:#f5f0e8}
.lqkv span:first-child{color:#a8967e}
.lqconn{font-size:11px;padding:6px 0;display:flex;align-items:center;gap:8px;border-bottom:1px solid rgba(255,255,255,.07);color:#f5f0e8}
.lqacts{display:flex;gap:8px;margin-top:14px}
.lqcbtn{font-size:11px;font-weight:600;padding:6px 12px;border-radius:7px;cursor:pointer;display:inline-flex;gap:5px;align-items:center;border:1px solid;background:transparent;transition:.15s}
.lqcbtn:hover{filter:brightness(1.3)}
`;

export default function SystemMap() {
  const rootRef = useRef(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setData(await workspaceApi.getServicesTopology()); setError(null); }
    catch (e) { setError(e?.response?.data?.detail || e.message); }
    finally { setLoading(false); }
  }, []);

  const onAction = useCallback(async (unit, action) => {
    const verb = action==='restart'?'Restart':action==='stop'?'Stop':'Start';
    if (!window.confirm(`${verb} "${unit}" on the VPS?`)) return;
    try { const r = await workspaceApi.controlService(unit, action); if (!r.ok) window.alert(`${verb} failed:\n${r.message||'unknown'}`); await load(); }
    catch (e) { window.alert(`${verb} failed:\n${e?.response?.data?.detail||e.message}`); }
  }, [load]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (data && data.available !== false && rootRef.current) buildMap(rootRef.current, data, onAction); }, [data, onAction]);

  if (loading && !data) return <div style={{ padding:'60px 0', textAlign:'center', color:'#a8967e' }}>Loading topology…</div>;
  if (error) return <div style={{ padding:16, borderRadius:10, background:'rgba(248,113,113,.08)', border:'1px solid rgba(248,113,113,.25)', color:'#fca5a5', fontSize:13 }}>{error}</div>;
  if (data && data.available === false) return <div style={{ padding:'40px 0', textAlign:'center', color:'#a8967e' }}>{data.reason || 'Topology unavailable.'}</div>;

  return (
    <div className="lqmap-root" ref={rootRef}>
      <style>{CSS}</style>
      <div className="lqmapbox">
        <svg viewBox="0 0 1160 640" preserveAspectRatio="xMidYMid meet" />
        <div className="lqlegend" />
        <div className="lqtip" />
        <div className="lqpanel">
          <div className="lqpclose" onClick={(e)=>e.currentTarget.parentElement.classList.remove('open')}>✕</div>
          <div className="lqpbody" />
        </div>
      </div>
    </div>
  );
}
