import { useState, useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════
// LUXQUANT GLOBAL NETWORK — INTERACTIVE 3D & COMET STREAMS
// ═══════════════════════════════════════════════════════

function ll2xyz(lat, lon, R) {
  const phi = (90 - lat) * (Math.PI / 180);
  const th = (lon + 180) * (Math.PI / 180);
  return [-(R * Math.sin(phi) * Math.cos(th)), R * Math.cos(phi), R * Math.sin(phi) * Math.sin(th)];
}

// Pusat Operasi
const TAIWAN = { lat: 23.5, lon: 121.0 };

// Titik Destinasi (Lebih Padat & Menyebar ke Seluruh Dunia)
const DESTS = [
  // Asia & Oceania
  {lat:-6.2,lon:106.8},   // Jakarta
  {lat:1.35,lon:103.8},   // Singapore
  {lat:35.7,lon:139.7},   // Tokyo
  {lat:-33.9,lon:151.2},  // Sydney
  {lat:19.1,lon:72.9},    // Mumbai
  {lat:25.2,lon:55.3},    // Dubai
  {lat:37.6,lon:127},     // Seoul
  {lat:-37.8,lon:144.9},  // Melbourne
  // Europe
  {lat:51.5,lon:-0.1},    // London
  {lat:52.5,lon:13.4},    // Berlin
  {lat:48.8,lon:2.3},     // Paris
  {lat:41.9,lon:12.5},    // Rome
  // Americas
  {lat:37.8,lon:-122.4},  // SF/US West
  {lat:40.7,lon:-74.0},   // NY/US East
  {lat:-23.5,lon:-46.6},  // Sao Paulo
  {lat:19.4,lon:-99.1},   // Mexico City
  // Africa
  {lat:-33.9,lon:18.4},   // Cape Town
  {lat:6.5,lon:3.3},      // Lagos
];

const FALLBACK = [
  [[-130,55],[-140,60],[-160,62],[-168,66],[-168,72],[-155,72],[-140,70],[-120,72],[-100,72],[-85,72],[-75,68],[-65,62],[-58,54],[-53,52],[-55,48],[-64,47],[-67,44],[-70,42],[-74,40],[-76,35],[-80,30],[-80,25],[-82,23],[-76,18],[-78,8],[-80,8],[-82,10],[-88,15],[-95,18],[-100,20],[-105,25],[-110,32],[-118,34],[-122,37],[-125,48],[-130,50],[-130,55]],
  [[-82,12],[-77,8],[-72,12],[-67,12],[-60,8],[-52,4],[-50,0],[-45,-2],[-37,-5],[-35,-10],[-37,-15],[-40,-22],[-48,-28],[-50,-33],[-53,-34],[-58,-38],[-65,-42],[-68,-55],[-72,-53],[-73,-45],[-75,-35],[-75,-25],[-70,-15],[-75,-5],[-78,2],[-80,5],[-77,8],[-82,12]],
  [[-12,36],[-9,38],[-10,43],[0,44],[2,48],[-5,48],[-6,54],[-3,58],[0,58],[5,54],[10,55],[10,58],[15,56],[12,54],[14,52],[20,55],[25,55],[28,56],[30,60],[32,62],[35,65],[42,68],[50,70],[55,68],[60,62],[55,55],[50,52],[45,48],[42,42],[38,38],[35,37],[28,37],[25,35],[22,36],[20,38],[15,38],[12,43],[8,44],[3,43],[0,44],[-5,44],[-8,44],[-10,38],[-12,36]],
  [[-18,15],[-18,20],[-16,22],[-13,28],[-5,36],[0,37],[10,37],[12,33],[15,32],[25,32],[32,30],[35,28],[38,22],[42,12],[45,2],[42,-5],[40,-10],[38,-18],[35,-25],[32,-30],[28,-34],[25,-34],[20,-30],[18,-25],[15,-15],[12,-5],[10,0],[5,5],[2,5],[-5,5],[-8,5],[-10,10],[-15,12],[-18,15]],
  [[40,42],[45,48],[50,52],[55,55],[60,62],[65,65],[70,68],[80,72],[90,75],[100,73],[110,72],[120,68],[130,63],[140,55],[145,50],[140,45],[135,40],[130,37],[125,35],[120,30],[115,23],[110,20],[108,16],[105,15],[100,14],[98,16],[100,20],[98,23],[95,28],[90,28],[88,24],[85,22],[82,22],[80,25],[78,30],[74,30],[72,25],[68,24],[62,25],[55,28],[50,37],[45,42],[40,42]],
  [[68,35],[72,33],[75,30],[78,28],[80,25],[82,22],[85,22],[88,24],[92,22],[92,18],[88,12],[85,8],[82,8],[80,10],[78,12],[76,10],[74,12],[72,15],[70,22],[68,24],[68,28],[68,35]],
  [[95,8],[100,5],[104,2],[105,-2],[106,-6],[108,-8],[112,-8],[115,-8],[120,-10],[125,-8],[130,-4],[135,-2],[135,2],[130,5],[125,6],[120,5],[118,4],[115,5],[110,6],[105,6],[100,8],[95,8]],
  [[113,-22],[115,-35],[118,-35],[122,-35],[128,-34],[132,-33],[137,-35],[140,-38],[144,-38],[150,-38],[153,-30],[153,-25],[148,-20],[145,-15],[142,-12],[138,-12],[135,-15],[130,-15],[128,-18],[125,-20],[120,-20],[115,-22],[113,-22]],
  [[130,33],[132,35],[135,36],[138,36],[140,38],[142,44],[145,45],[145,40],[140,36],[136,34],[132,33],[130,33]],
  [[120,22],[120,25],[121,26],[122,25],[122,23],[121,22],[120,22]],
  [[-6,50],[-5,54],[-3,58],[0,58],[2,56],[2,52],[0,50],[-3,50],[-6,50]],
  [[60,62],[70,68],[80,72],[100,74],[120,72],[140,68],[150,62],[160,58],[170,62],[180,68],[180,75],[140,75],[100,78],[80,76],[60,70],[55,65],[60,62]],
  [[-55,60],[-50,62],[-45,65],[-38,68],[-30,72],[-22,76],[-20,78],[-25,80],[-35,82],[-45,82],[-52,80],[-55,76],[-55,72],[-52,68],[-55,64],[-55,60]],
];

function makeEarthCanvas(w, h, polys) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d");
  x.fillStyle = "rgb(16,12,7)"; x.fillRect(0,0,w,h);
  x.fillStyle = "rgb(155,125,58)"; x.strokeStyle = "rgb(175,145,70)"; x.lineWidth = 0.6; x.lineJoin = "round";
  polys.forEach(p => { x.beginPath(); p.forEach(([lo,la],i) => { const px=((lo+180)/360)*w, py=((90-la)/180)*h; i===0?x.moveTo(px,py):x.lineTo(px,py); }); x.closePath(); x.fill(); x.stroke(); });
  return c;
}

function decodeTopo(t) {
  const a=t.arcs, f=t.transform, ps=[];
  const da=i=>{const r=i<0,idx=r?~i:i,ar=a[idx],c=[];let x=0,y=0;ar.forEach(([dx,dy])=>{x+=dx;y+=dy;c.push([f?x*f.scale[0]+f.translate[0]:x,f?y*f.scale[1]+f.translate[1]:y]);});return r?c.reverse():c;};
  const dr=rings=>rings.map(ring=>{const c=[];ring.forEach(i=>{const d=da(i);c.push(...(c.length?d.slice(1):d));});return c;});
  const proc=g=>{if(g.type==="Polygon")dr(g.arcs).forEach(c=>ps.push(c));else if(g.type==="MultiPolygon")g.arcs.forEach(p=>dr(p).forEach(c=>ps.push(c)));else if(g.type==="GeometryCollection")g.geometries.forEach(proc);};
  proc(t.objects.land); return ps;
}

const STATS=[
  {value:"Taiwan",sub:"Core Operations"},
  {value:"24/7",sub:"Non-Stop Monitoring"},
  {value:"20+",sub:"Countries Served"},
  {value:"6",sub:"Continents Reached"},
];

const GlobeRenderer=({containerWidth,earthCanvas})=>{
  const ref=useRef(null);
  
  useEffect(()=>{
    const c=ref.current; if(!c||!window.THREE||!earthCanvas)return;
    const T=window.THREE,W=containerWidth,H=Math.round(W*0.65),R=2;
    
    const rn=new T.WebGLRenderer({canvas:c,alpha:true,antialias:true});
    rn.setPixelRatio(Math.min(window.devicePixelRatio,2)); rn.setSize(W,H);
    const sc=new T.Scene(),cam=new T.PerspectiveCamera(28,W/H,0.1,1000);
    cam.position.set(0,2.2,5.8); cam.lookAt(0,0.1,0);
    
    // Group untuk rotasi
    const g=new T.Group(); 
    sc.add(g);

    // Membuat bola bumi
    const tx=new T.CanvasTexture(earthCanvas); tx.anisotropy=rn.capabilities.getMaxAnisotropy();
    g.add(new T.Mesh(new T.SphereGeometry(R,80,80),new T.MeshBasicMaterial({map:tx})));
    
    // Grid Koordinat Bumi (garis bujur/lintang)
    const gM=new T.LineBasicMaterial({color:0xd4a853,transparent:true,opacity:0.04});
    for(let lat=-60;lat<=80;lat+=30){const p=[];for(let lo=0;lo<=360;lo+=3)p.push(new T.Vector3(...ll2xyz(lat,lo-180,R*1.002)));g.add(new T.Line(new T.BufferGeometry().setFromPoints(p),gM));}
    for(let lo=-180;lo<180;lo+=30){const p=[];for(let la=-90;la<=90;la+=3)p.push(new T.Vector3(...ll2xyz(la,lo,R*1.002)));g.add(new T.Line(new T.BufferGeometry().setFromPoints(p),gM));}
    
    // Partikel Bintang / Data Dust di Background
    const starsGeo = new T.BufferGeometry();
    const starPts = [];
    for(let i=0; i<300; i++){
        const rStar = R * 1.5 + Math.random();
        const theta = 2 * Math.PI * Math.random();
        const phi = Math.acos(2 * Math.random() - 1);
        starPts.push(rStar * Math.sin(phi) * Math.cos(theta), rStar * Math.cos(phi), rStar * Math.sin(phi) * Math.sin(theta));
    }
    starsGeo.setAttribute('position', new T.Float32BufferAttribute(starPts, 3));
    const starsMat = new T.PointsMaterial({color: 0xd4a853, size: 0.015, transparent: true, opacity: 0.3});
    g.add(new T.Points(starsGeo, starsMat));

    // Ping Radar TAIWAN
    const tw=ll2xyz(TAIWAN.lat,TAIWAN.lon,R*1.015);
    const rG=new T.RingGeometry(0.03,0.06,32);
    const rM1=new T.MeshBasicMaterial({color:0xf0d890,transparent:true,opacity:0.7,side:T.DoubleSide});
    const rM2=new T.MeshBasicMaterial({color:0xf0d890,transparent:true,opacity:0.4,side:T.DoubleSide});
    const r1=new T.Mesh(rG,rM1),r2=new T.Mesh(rG.clone(),rM2);
    [r1,r2].forEach(r=>{r.position.set(...tw);r.lookAt(0,0,0);g.add(r);});
    const cd=new T.Mesh(new T.CircleGeometry(0.025,16),new T.MeshBasicMaterial({color:0xf0d890,side:T.DoubleSide}));
    cd.position.set(...tw);cd.lookAt(0,0,0);g.add(cd);
    
    // Menambahkan titik negara tujuan (DESTS)
    DESTS.forEach(d=>{
        const p=ll2xyz(d.lat,d.lon,R*1.008);
        const m=new T.Mesh(new T.CircleGeometry(0.015,10),new T.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.6,side:T.DoubleSide}));
        m.position.set(...p);m.lookAt(0,0,0);g.add(m);
    });
    
    const parts=[];
    const aM=new T.LineBasicMaterial({color:0xd4a853,transparent:true,opacity:0.15}); // Garis tipis jalurnya

    // MEMBUAT JALUR & KOMET DATA
    DESTS.forEach((d,i)=>{
        const s=new T.Vector3(...ll2xyz(TAIWAN.lat,TAIWAN.lon,R*1.008));
        const e=new T.Vector3(...ll2xyz(d.lat,d.lon,R*1.008));
        const mid=new T.Vector3().addVectors(s,e).multiplyScalar(0.5);
        mid.normalize().multiplyScalar(R+s.distanceTo(e)*0.3); // Melengkung lebih dramatis
        
        const cv=new T.QuadraticBezierCurve3(s,mid,e);
        g.add(new T.Line(new T.BufferGeometry().setFromPoints(cv.getPoints(50)),aM));
        
        // Membentuk 1 Komet (terdiri dari 10 partikel yang mengecil ke belakang)
        for(let j=0; j<10; j++) {
            const isHead = j === 0;
            const size = isHead ? 0.02 : Math.max(0.002, 0.015 - (j * 0.0015));
            const opacity = isHead ? 1 : 1 - (j * 0.1);
            const color = isHead ? 0xffffff : 0xd4a853; // Kepala Putih Terang, Ekor Emas
            
            const pm = new T.Mesh(
                new T.SphereGeometry(size, 8, 8), 
                new T.MeshBasicMaterial({color: color, transparent: true, opacity: opacity})
            );
            g.add(pm);
            
            parts.push({
                mesh: pm, 
                curve: cv, 
                offset: (i * 0.08) - (j * 0.012), // Jarak antar partikel buntut komet
                baseOpacity: opacity,
                isHead: isHead
            }); 
        }
    });

    // SISTEM INTERAKTIF (DRAG UNTUK ROTASI)
    let isDragging = false;
    let prevMousePos = { x: 0, y: 0 };
    let targetRotY = -2.1; // Posisi default menghadap Asia
    let targetRotX = -0.2;

    const onPointerDown = (clientX, clientY) => {
        isDragging = true;
        prevMousePos = { x: clientX, y: clientY };
        c.style.cursor = 'grabbing';
    };

    const onPointerMove = (clientX, clientY) => {
        if (isDragging) {
            const deltaX = clientX - prevMousePos.x;
            const deltaY = clientY - prevMousePos.y;
            targetRotY += deltaX * 0.005;
            targetRotX += deltaY * 0.005;
            // Batasi rotasi sumbu Y (X-axis) agar bumi tidak terbalik penuh
            targetRotX = Math.max(-Math.PI/2 + 0.5, Math.min(Math.PI/2 - 0.5, targetRotX));
            prevMousePos = { x: clientX, y: clientY };
        }
    };

    const onPointerUp = () => {
        isDragging = false;
        c.style.cursor = 'grab';
    };

    // Events untuk Mouse (Laptop/PC)
    c.addEventListener('mousedown', (e) => onPointerDown(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => onPointerMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', onPointerUp);

    // Events untuk Touch (HP/Tablet)
    c.addEventListener('touchstart', (e) => {
        if(e.touches.length === 1) onPointerDown(e.touches[0].clientX, e.touches[0].clientY);
    }, {passive: false});
    window.addEventListener('touchmove', (e) => {
        if(isDragging && e.touches.length === 1) {
            onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
        }
    }, {passive: false});
    window.addEventListener('touchend', onPointerUp);
    
    // Style bawaan kursor
    c.style.cursor = 'grab';
    c.style.touchAction = 'pan-y'; // Mencegah scrolling ga sengaja saat drag globe ke samping

    // LOOP ANIMASI
    let t=0,raf;
    const anim=()=>{
      t+=0.004; // Kecepatan Animasi Komet
      
      // Interpolasi Rotasi (Membuat tarikan mouse terasa sangat SMOOTH/momentum)
      g.rotation.y += (targetRotY - g.rotation.y) * 0.1;
      g.rotation.x += (targetRotX - g.rotation.x) * 0.1;

      // Jika user tidak memegang globe, biarkan bumi berputar sendiri ke kanan
      if (!isDragging) {
          targetRotY += 0.001; 
      }
      
      // Animasi Radar Taiwan
      const p1=1+((t*2)%1)*1.8;r1.scale.set(p1,p1,1);rM1.opacity=0.7*(1-((t*2)%1));
      const p2=1+(((t*2+0.5)%1))*1.8;r2.scale.set(p2,p2,1);rM2.opacity=0.5*(1-(((t*2+0.5)%1)));
      
      // Animasi Komet
      parts.forEach(p=>{
        let pr = ((t*0.4 + p.offset) % 1);
        if (pr < 0) pr += 1;
        p.mesh.position.copy(p.curve.getPoint(pr));
        
        // Pudar di ujung awal dan akhir, menyala di tengah
        const fade = Math.sin(pr * Math.PI);
        p.mesh.material.opacity = p.baseOpacity * fade;
        
        // Efek kepala komet sedikit berdenyut
        if(p.isHead) {
            p.mesh.scale.setScalar(1 + 0.3 * Math.sin(t * 15 + p.offset));
        }
      });
      
      rn.render(sc,cam);raf=requestAnimationFrame(anim);
    };
    
    anim(); 
    
    return ()=>{
        cancelAnimationFrame(raf);
        rn.dispose();
        window.removeEventListener('mousemove', onPointerMove);
        window.removeEventListener('mouseup', onPointerUp);
        window.removeEventListener('touchmove', onPointerMove);
        window.removeEventListener('touchend', onPointerUp);
    };
  },[containerWidth,earthCanvas]);
  return <canvas ref={ref} style={{width:"100%",height:Math.round(containerWidth*0.65),display:"block"}}/>;
};

export default function GlobalNetworkSection(){
  const [cw,setCw]=useState(900);
  const [ec,setEc]=useState(null);
  const [tr,setTr]=useState(!!window.THREE);
  const ref=useRef(null);

  useEffect(()=>{const m=()=>{if(ref.current)setCw(Math.min(ref.current.offsetWidth,1200));};m();window.addEventListener("resize",m);return()=>window.removeEventListener("resize",m);},[]);
  useEffect(()=>{if(window.THREE){setTr(true);return;}const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";s.onload=()=>setTr(true);document.head.appendChild(s);},[]);
  useEffect(()=>{const W=2048,H=1024;fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json").then(r=>r.json()).then(t=>{try{setEc(makeEarthCanvas(W,H,decodeTopo(t)));}catch{setEc(makeEarthCanvas(W,H,FALLBACK));}}).catch(()=>setEc(makeEarthCanvas(W,H,FALLBACK)));},[]);

  const ready=tr&&ec;

  return(
    <section id="global-network" style={{position:"relative",width:"100%",paddingTop:80,paddingBottom:0,background:"transparent",borderTop:"1px solid rgba(212,168,83,0.1)",overflow:"hidden"}}>
      <div ref={ref} style={{maxWidth:1200,margin:"0 auto",padding:"0 24px",position:"relative",zIndex:10}}>

        {/* Heading */}
        <div style={{textAlign:"center",marginBottom:48}}>
          <h2 style={{fontFamily:"'Playfair Display',Georgia,serif",fontSize:"clamp(28px,5vw,52px)",fontWeight:700,color:"#ffffff",margin:"0 0 16px",lineHeight:1.15}}>
            Serving Traders Across{" "}
            <span style={{background:"linear-gradient(to right,#f0d890,#d4a853,#8b6914)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
              Every Continent.
            </span>
          </h2>
          <p style={{color:"rgba(255,255,255,0.45)",fontSize:"clamp(13px,1.4vw,16px)",maxWidth:600,margin:"0 auto",lineHeight:1.7}}>
            Built and operated from Taiwan, our quantitative engine delivers real-time algorithmic signals to active users worldwide.
          </p>
        </div>

        {/* Stats — Line UP → Dot → Number → Label */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"clamp(12px,3vw,32px)",maxWidth:900,margin:"0 auto",position:"relative",zIndex:20}}>
          {STATS.map((s,i)=>(
            <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center"}}>
              {/* 1. Line going UP */}
              <div style={{width:1.5,height:60,background:"linear-gradient(to bottom,rgba(212,168,83,0),#d4a853)"}}/>
              {/* 2. Dot */}
              <div style={{width:10,height:10,borderRadius:"50%",background:"#d4a853",boxShadow:"0 0 10px rgba(212,168,83,0.6)",margin:"0 0 16px"}}/>
              {/* 3. Number */}
              <span style={{fontFamily:"'Playfair Display',Georgia,serif",fontSize:"clamp(30px,5vw,54px)",fontWeight:700,color:i===0?"#f0d890":"#d4a853",lineHeight:1.1,textShadow:i===0?"0 0 20px rgba(212,168,83,0.3)":"none"}}>
                {s.value}
              </span>
              {/* 4. Label */}
              <span style={{color:"rgba(255,255,255,0.4)",fontSize:"clamp(9px,1vw,12px)",textTransform:"uppercase",letterSpacing:"0.12em",fontFamily:"monospace",marginTop:8}}>
                {s.sub}
              </span>
            </div>
          ))}
        </div>

        {/* Globe — Interactive & Comet Enabled */}
        <div style={{
          position:"relative",width:"100%",marginTop:-5,
          display:"flex",justifyContent:"center",overflow:"hidden",
          maskImage:"linear-gradient(to bottom, transparent 0%, black 8%, black 72%, transparent 95%)",
          WebkitMaskImage:"linear-gradient(to bottom, transparent 0%, black 8%, black 72%, transparent 95%)",
        }}>
          {ready?(
            <GlobeRenderer containerWidth={cw} earthCanvas={ec}/>
          ):(
            <div style={{width:"100%",height:Math.round(cw*0.65),display:"flex",alignItems:"center",justifyContent:"center"}}>
              <div style={{width:32,height:32,border:"2px solid rgba(212,168,83,0.2)",borderTopColor:"#d4a853",borderRadius:"50%",animation:"globeSpin 1s linear infinite"}}/>
            </div>
          )}
        </div>
      </div>

      {/* Shadow gradient bawah transparan */}
      <div style={{position:"absolute",bottom:0,left:0,right:0,height:80,background:"transparent",pointerEvents:"none",zIndex:5}}/>
      <style>{`@keyframes globeSpin{to{transform:rotate(360deg)}}`}</style>
    </section>
  );
}