#!/usr/bin/env python3
"""Build standalone Binance-only PnL generator (v2 — fixed style switching)."""
import re
from pathlib import Path

SRC = Path("Crypto Trading & PnL Screenshot Generator.html")
DST = Path("binance-only.html")
ASSETS = "./Crypto Trading & PnL Screenshot Generator_files"

BLOCKS = [(1718,1771,1),(1772,1834,2),(1835,1889,3),(1890,1957,4),
          (1958,2071,5),(2072,2164,6),(2165,2316,7),(2317,2423,8),(2424,2522,9)]

lines = SRC.read_text(encoding="utf-8").splitlines()
designs = []
for s,e,n in BLOCKS:
    block = "\n".join(lines[s-1:e])
    block = re.sub(r"<noscript>.*?</noscript>", "", block, flags=re.DOTALL)
    block = block.replace(" entered lazyloaded","").replace(" lazyloaded","")
    # Force inline display:none so original CSS :has() rules don't see them
    block = re.sub(r'(class="tsg-trading-history binance-design-\d+-layout")',
                   r'\1 style="display: none"', block)
    designs.append(f"<!-- Design {n} -->\n{block}")

HTML = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Binance PnL Generator</title>
<link rel="stylesheet" href="{ASSETS}/style.css">
<style>
*{{box-sizing:border-box}}
body{{margin:0;font-family:Manrope,system-ui,sans-serif;background:#f6f7f9;color:#111}}
.app{{display:grid;grid-template-columns:1fr 320px;gap:24px;padding:24px;max-width:1400px;margin:0 auto}}
.canvas-wrap{{display:flex;align-items:flex-start;justify-content:center;min-height:600px;overflow:auto}}
.tsg-container{{margin:0;position:relative}}
.sidebar{{background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08);height:fit-content;position:sticky;top:24px}}
.sidebar h2{{margin:0 0 4px;font-size:16px}}
.sub{{margin:0 0 16px;font-size:12px;color:#888}}
.style-grid{{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:16px}}
.style-btn{{padding:8px 0;border:1px solid #ddd;background:#fff;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500}}
.style-btn:hover{{border-color:#999}}
.style-btn.active{{background:#111;color:#fff;border-color:#111}}
.action{{display:block;width:100%;padding:10px 12px;margin-bottom:8px;border:1px solid #ddd;background:#fff;border-radius:8px;cursor:pointer;font-size:14px;text-align:left}}
.action:hover{{border-color:#999}}
.action.primary{{background:#111;color:#fff;border-color:#111}}
.hint{{font-size:12px;color:#888;line-height:1.5;margin-top:16px}}
[contenteditable="true"]{{outline:none;cursor:text}}
[contenteditable="true"]:hover{{background:rgba(255,235,59,.15)}}
[contenteditable="true"]:focus{{background:rgba(255,235,59,.3)}}
.tsg-binance-qr-image,.tsg-binance-qr-container,.tsg-binance-avatar-img{{cursor:pointer}}
</style>
</head>
<body>
<div class="app">
  <div class="canvas-wrap">
    <div class="tsg-container" id="canvas">
{chr(10).join(designs)}
    </div>
  </div>
  <aside class="sidebar">
    <h2>Binance PnL</h2>
    <p class="sub">Pick a style, edit, download.</p>
    <div class="style-grid">
      <button class="style-btn active" data-style="1">1</button>
      <button class="style-btn" data-style="2">2</button>
      <button class="style-btn" data-style="3">3</button>
      <button class="style-btn" data-style="4">4</button>
      <button class="style-btn" data-style="5">5</button>
      <button class="style-btn" data-style="6">6</button>
      <button class="style-btn" data-style="7">7</button>
      <button class="style-btn" data-style="8">8</button>
      <button class="style-btn" data-style="9">9</button>
    </div>
    <button class="action" id="toggle-side">↕  Toggle Long / Short</button>
    <button class="action" id="random">🎲  Random Data</button>
    <button class="action primary" id="download">⬇  Download PNG</button>
    <p class="hint">Klik teks untuk edit. Klik QR/avatar untuk upload gambar.</p>
  </aside>
</div>
<script src="{ASSETS}/html2canvas.min.js"></script>
<script>
(function(){{
  const layouts = document.querySelectorAll('#canvas .tsg-trading-history');
  function show(n){{
    layouts.forEach(l => l.style.display = 'none');
    const t = document.querySelector('.binance-design-'+n+'-layout');
    if (t) {{ t.style.display = 'block'; t.removeAttribute('style'); t.style.display = ''; }}
    // Use empty string to let CSS take over, but first remove the display:none
    if (t) t.style.removeProperty('display');
  }}
  // Init: show design 1
  show(1);

  document.querySelectorAll('.style-btn').forEach(btn => {{
    btn.addEventListener('click', () => {{
      document.querySelectorAll('.style-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      show(btn.dataset.style);
    }});
  }});

  document.getElementById('toggle-side').addEventListener('click', () => {{
    document.querySelectorAll('#canvas [contenteditable="true"]').forEach(el => {{
      if (el.offsetParent === null) return;
      const t = el.textContent.trim();
      if (t==='Short'){{el.textContent='Long';el.style.color='#0ECB81'}}
      else if (t==='Long'){{el.textContent='Short';el.style.color='#F6465D'}}
    }});
  }});

  const SYMS = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','DOGEUSDT'];
  const LEVS = [3,5,10,20,25,50,75,100];
  document.getElementById('random').addEventListener('click', () => {{
    const sym = SYMS[Math.floor(Math.random()*SYMS.length)]+' Perpetual';
    const lev = LEVS[Math.floor(Math.random()*LEVS.length)]+'X';
    const pnl = (Math.random()*350-30).toFixed(2);
    const entry = (Math.random()*60000+100).toFixed(2);
    document.querySelectorAll('#canvas [contenteditable="true"]').forEach(el => {{
      if (el.offsetParent === null) return;
      const t = el.textContent.trim();
      if (/Perpetual$/i.test(t)) el.textContent = sym;
      else if (/^\\d+\\s*X$/i.test(t)) el.textContent = lev;
      else if (/%/.test(t)) {{
        el.textContent = (pnl>=0?'+':'')+pnl+'%';
        el.style.color = pnl>=0?'#0ECB81':'#F6465D';
      }}
      else if (/^[\\d,\\.]+$/.test(t) && parseFloat(t.replace(/,/g,''))>1) {{
        el.textContent = parseFloat(entry).toLocaleString('en-US',{{minimumFractionDigits:2,maximumFractionDigits:2}});
      }}
    }});
  }});

  document.querySelectorAll('img').forEach(img => {{
    if (/qr|avatar/i.test(img.className) || /qr|avatar/i.test(img.alt||'')) {{
      img.style.cursor = 'pointer';
      img.title = 'Click to upload';
      img.addEventListener('click', () => {{
        const inp = document.createElement('input');
        inp.type='file'; inp.accept='image/*';
        inp.onchange = e => {{
          const f = e.target.files[0]; if(!f) return;
          const r = new FileReader();
          r.onload = ev => {{ img.src = ev.target.result; }};
          r.readAsDataURL(f);
        }};
        inp.click();
      }});
    }}
  }});

  document.getElementById('download').addEventListener('click', async () => {{
    const visible = Array.from(layouts).find(l => l.offsetParent !== null);
    if (!visible) return;
    try {{
      const canvas = await html2canvas(visible, {{backgroundColor:null,scale:2,useCORS:true,logging:false}});
      const a = document.createElement('a');
      a.download = 'binance-pnl-'+Date.now()+'.png';
      a.href = canvas.toDataURL('image/png');
      a.click();
    }} catch(e) {{ alert('Download failed: '+e.message); }}
  }});
}})();
</script>
</body>
</html>'''
DST.write_text(HTML, encoding="utf-8")
print(f"Wrote {DST} ({DST.stat().st_size//1024} KB)")
