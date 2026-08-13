// src/utils/newsFormat.js
// ════════════════════════════════════════════════════════════════
// Formatter untuk badan berita.
//
// Masalah yang diperbaiki: `cleanText` di halaman News meratakan SEMUA
// whitespace (`\s+` → " "), termasuk newline. Badan artikel sudah dirender
// dengan `whitespace-pre-line`, tapi teksnya keburu diratakan sebelum sampai
// ke sana — jadi daftar bertitik dari Telegram tampil sebagai satu blok
// paragraf panjang yang tidak terbaca.
//
// Struktur sumbernya (disurvei dari crypto_news.raw_text) ada empat bentuk:
//
//   1. Judul, baris kosong, lalu daftar berpenanda `🔸`
//   2. Judul, sub-judul berakhiran `:`, lalu daftar
//   3. Judul, lalu paragraf prosa dipisah baris kosong
//   4. Heading beremoji (`🟢 UPGRADES`), lalu daftar berpenanda `•`
//
// Blok dipisah baris kosong. Di dalam satu blok, penanda dianggap daftar
// hanya bila MINIMAL DUA baris memakai penanda yang sama — supaya judul
// beremoji seperti `🚨 U.S. CPI DAY` tidak salah dibaca sebagai satu bullet.
// ════════════════════════════════════════════════════════════════

/** Decode entitas HTML tanpa menyentuh struktur baris. */
export function decodeEntities(input) {
  const s = String(input ?? "");
  if (!s) return "";
  try {
    const el = document.createElement("textarea");
    el.innerHTML = s;
    return el.value;
  } catch {
    return s
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'");
  }
}

// Penanda daftar yang dipakai kanal-kanal sumber. Emoji apa pun juga
// diterima sebagai penanda selama dipakai berulang di blok yang sama.
const BULLET_RE =
  /^(?:[•▪●◦‣⁃·–—*+-]|(?:[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]\u{FE0F}?)+)\s*/u;

const TRAILING_HANDLE_RE = /^\(?@[A-Za-z0-9_]{3,32}\)?$/;

/**
 * Baris pertama sebuah judul.
 *
 * Sebagian baris di `crypto_news.title` menyimpan SELURUH isi pesan, bukan
 * judulnya saja — cacat di sisi ingest. Membandingkan atau menampilkan
 * apa adanya membuat judul raksasa berbaris-baris di modal, dan membuat
 * pembuangan judul-ganda meleset. Ambil baris pertamanya saja.
 */
export function newsTitleLine(title) {
  const first = String(title ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  return first || "";
}

/**
 * Rapikan teks berita sambil MEMPERTAHANKAN struktur baris.
 *
 * @param {string} raw
 * @param {{ title?: string }} opts — judul dipakai untuk membuang baris
 *   pertama yang cuma mengulang judul (kartu sudah menampilkannya).
 */
export function normalizeNewsText(raw, { title } = {}) {
  let text = decodeEntities(raw)
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n");

  // Rapatkan spasi HANYA di dalam baris — newline tidak disentuh.
  text = text
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n");

  // Maksimal satu baris kosong sebagai pemisah.
  text = text.replace(/\n{3,}/g, "\n\n").trim();

  const lines = text.split("\n");

  // Buang baris pertama yang mengulang judul. Sumber Telegram hampir selalu
  // memulai pesan dengan judulnya sendiri, dan modal sudah menampilkannya
  // di atas — tanpa ini judulnya tampil dua kali.
  if (title) {
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const t = norm(newsTitleLine(title));
    while (lines.length && (!lines[0] || (t && norm(lines[0]) === t))) {
      lines.shift();
    }
  }

  // Buang atribusi handle di ekor — kartu "Shared from" sudah menyebutkannya.
  while (lines.length && (!lines[lines.length - 1] || TRAILING_HANDLE_RE.test(lines[lines.length - 1]))) {
    lines.pop();
  }

  return lines.join("\n").trim();
}

/**
 * Pecah teks jadi blok siap render.
 * @returns {Array<{type:'heading'|'list'|'para', text?:string, items?:string[]}>}
 */
export function parseNewsBlocks(text) {
  if (!text) return [];

  const chunks = text.split(/\n\s*\n/);
  const blocks = [];

  for (const chunk of chunks) {
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    // Hitung baris berpenanda. Butuh minimal dua supaya heading beremoji
    // tidak salah dianggap daftar satu item.
    const marks = lines.map((l) => (l.match(BULLET_RE) || [null])[0]);
    const marked = marks.filter(Boolean);

    if (marked.length >= 2 && marked.length >= lines.length - 1) {
      // Penanda yang paling sering dipakai = penanda daftar sebenarnya.
      // Penanda LAIN yang isinya pendek adalah pemisah bagian, bukan item —
      // `🔴 DOWNGRADES` di tengah daftar `•` sempat tertelan jadi satu item.
      const freq = {};
      for (const m of marked) freq[m.trim()] = (freq[m.trim()] || 0) + 1;
      const dominant = Object.keys(freq).sort((a, b) => freq[b] - freq[a])[0];

      let items = [];
      let pending = null;
      const flush = () => {
        if (pending) items.push(pending);
        pending = null;
      };
      const flushList = () => {
        flush();
        if (items.length) blocks.push({ type: "list", items });
        items = [];
      };

      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const mark = marks[i];
        const body = mark ? line.slice(mark.length).trim() : line;

        if (mark && mark.trim() !== dominant && body.length <= 40 && !body.includes(":")) {
          flushList();
          blocks.push({ type: "heading", text: body.replace(/:$/, "") });
          continue;
        }

        if (mark) {
          flush();
          pending = body;
        } else if (pending) {
          // Baris lanjutan dari item sebelumnya (teks yang terbungkus).
          pending += ` ${line}`;
        } else {
          blocks.push({ type: "para", text: line });
        }
      }
      flushList();
      continue;
    }

    // Sub-judul: satu baris pendek yang diakhiri titik dua.
    if (lines.length === 1 && lines[0].endsWith(":") && lines[0].length <= 80) {
      blocks.push({ type: "heading", text: lines[0].replace(/:$/, "") });
      continue;
    }

    blocks.push({ type: "para", text: lines.join(" ") });
  }

  return blocks;
}

/** Versi satu baris — untuk kartu, preview, dan pencarian. */
export function flattenNewsText(raw) {
  return decodeEntities(raw)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
