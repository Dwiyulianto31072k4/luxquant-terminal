// src/components/NewsBody.jsx
// ════════════════════════════════════════════════════════════════
// Render badan berita sebagai blok terstruktur — paragraf, sub-judul, dan
// daftar bertitik — bukan satu gumpalan teks.
//
// Dipakai oleh reader di CryptoNewsPage dan NewsPreviewModal supaya kedua
// permukaan itu tampil sama. Sebelumnya keduanya memanggil `cleanText` yang
// meratakan newline, sehingga daftar dari Telegram hilang strukturnya.
// ════════════════════════════════════════════════════════════════

import { useMemo } from "react";
import { normalizeNewsText, parseNewsBlocks } from "../utils/newsFormat";

const NewsBody = ({ text, title, limit = 2400, className = "" }) => {
  const blocks = useMemo(() => {
    const normalized = normalizeNewsText(text, { title });
    // Potong pada batas blok, bukan di tengah kalimat — memotong di tengah
    // baris membuat angka jadi menyesatkan (mis. "3.4" dari "3.40%").
    const all = parseNewsBlocks(normalized);
    let used = 0;
    const kept = [];
    for (const b of all) {
      const len = b.type === "list" ? b.items.join(" ").length : (b.text || "").length;
      if (used && used + len > limit) {
        kept.push({ type: "truncated" });
        break;
      }
      used += len;
      kept.push(b);
    }
    return kept;
  }, [text, title, limit]);

  if (!blocks.length) return null;

  return (
    <div className={`space-y-3 sm:space-y-3.5 ${className}`}>
      {blocks.map((b, i) => {
        if (b.type === "heading") {
          return (
            <h4
              key={i}
              className="pt-1 text-[13px] font-semibold leading-snug text-text-primary sm:text-[14px]"
            >
              {b.text}
            </h4>
          );
        }

        if (b.type === "list") {
          return (
            <ul key={i} className="space-y-1.5">
              {b.items.map((item, j) => (
                <li key={j} className="flex gap-2.5">
                  <span
                    aria-hidden="true"
                    className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-accent/70"
                  />
                  <span className="min-w-0 text-[14px] leading-[1.65] text-text-secondary sm:text-[15px]">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          );
        }

        if (b.type === "truncated") {
          return (
            <p key={i} className="font-mono text-[11px] text-text-muted/70">
              …
            </p>
          );
        }

        return (
          <p
            key={i}
            className="text-[14px] leading-[1.7] text-text-secondary sm:text-[15px] sm:leading-[1.75]"
          >
            {b.text}
          </p>
        );
      })}
    </div>
  );
};

export default NewsBody;
