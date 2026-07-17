// src/components/landing/v2/sections/Laurel.jsx
// ════════════════════════════════════════════════════════════════
// Laurel — setengah-wreath ala MEXC: cabang melengkung pendek dengan
// daun terisi (filled) nyabang ke atas-luar, gradasi emas LuxQuant.
// Mirror kiri/kanan via `side` (kiri condong ke kiri, kanan ke kanan).
//
// Pakai (taller-than-wide, viewBox 32×48):
// <Laurel side="left" className="w-6 h-10 lg:w-8 lg:h-14" />
// <Laurel side="right" className="w-6 h-10 lg:w-8 lg:h-14" />
// ════════════════════════════════════════════════════════════════
export default function Laurel({ side = "left", className = "" }) {
 const gid = `lq-laurel-${side}`;
 // satu daun almond, ujung ke atas (tip di -y)
 const leaf = "M0 0 C -2.8 -5 -2.8 -12 0 -17 C 2.8 -12 2.8 -5 0 0 Z";
 // titik & sudut tiap daun di sepanjang cabang (bawah → atas), nyabang kiri-atas
 const leaves = [
 { x: 20, y: 38, r: -30 },
 { x: 16.5, y: 28.5, r: -36 },
 { x: 14, y: 19.5, r: -42 },
 { x: 14, y: 11, r: -48 },
 { x: 16, y: 5.5, r: -56 },
 ];

 return (
 <svg
 viewBox="0 0 32 48"
 className={className}
 style={{ transform: side === "right" ? "scaleX(-1)" : "none" }}
 fill="none"
 aria-hidden="true"
 >
 <defs>
 <linearGradient
 id={gid}
 x1="16"
 y1="4"
 x2="16"
 y2="44"
 gradientUnits="userSpaceOnUse"
 >
 <stop offset="0" stopColor="#f7e6b0" />
 <stop offset="0.55" stopColor="rgb(var(--accent))" />
 <stop offset="1" stopColor="#9a7418" />
 </linearGradient>
 </defs>

 {/* cabang melengkung */}
 <path
 d="M22 44 C 15 34, 13 20, 16 5"
 stroke={`url(#${gid})`}
 strokeWidth="2"
 strokeLinecap="round"
 />

 {/* daun-daun filled */}
 <g fill={`url(#${gid})`}>
 {leaves.map((l, i) => (
 <path
 key={i}
 d={leaf}
 transform={`translate(${l.x} ${l.y}) rotate(${l.r})`}
 />
 ))}
 </g>
 </svg>
 );
}