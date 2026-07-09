# LuxQuant Assistant — Rancangan Arsitektur

Widget AI kontekstual per-halaman (gaya "Gate AI"): bubble mengambang yang tahu
user sedang di page mana, menampilkan pertanyaan-saran, lalu menjawab **cara pakai
fitur + data pasar (read-only)**. Bukan penasihat finansial.

> Status: dokumen desain. Belum ada kode. Review dulu, baru implementasi.

---

## 1. Keputusan model — Hermes Agent vs Hermes 4

Ini menjawab langsung pertanyaan "bukannya Hermes Agent bisa di-inject?".

**Tidak.** Hermes Agent adalah aplikasi agent otonom-persisten (satu instance,
punya memori sendiri, jalan di VPS). Dia tidak dirancang jadi backend chat
multi-tenant yang dipanggil ribuan browser sekaligus. Untuk widget publik, yang
"disuntik" adalah **model bahasanya**, bukan agent-nya.

| | Hermes Agent | Hermes 4 (model) |
|---|---|---|
| Bentuk | Aplikasi agent di VPS | Bobot model / API |
| Cocok untuk | Asisten pribadi admin (kamu) | Widget publik multi-user |
| Cara pakai di web app | Tidak di-embed; diberi tool via MCP | Dipanggil sebagai API dari FastAPI |
| Skala multi-user | Buruk (stateful, 1 instance) | Bagus (stateless per request) |

**Rekomendasi:** widget publik pakai **model API**, di-abstraksi supaya gampang
ganti provider. Hermes Agent (opsional, terpisah) buat kamu sendiri sebagai
operator.

### Pilihan model (backend kamu SUDAH siap)

`backend/app/services/ai_worker.py` sudah memakai `AsyncOpenAI` untuk OpenAI dan
DeepSeek (via `base_url`). Menambah provider baru = tambah satu client dengan
`base_url` berbeda. Tidak perlu library baru.

- **Hermes 4 405B via OpenRouter** — `base_url="https://openrouter.ai/api/v1"`,
  `model="nousresearch/hermes-4-405b"`. Sesuai rencana "pakai Hermes". Bayar
  per-token, tanpa jatah chat harian.
- **DeepSeek** — sudah terpasang, sangat murah; kandidat kuat untuk Q&A panduan
  yang volumenya tinggi.
- **Abstraksi provider** disarankan: satu fungsi `chat(provider, messages)` agar
  model bisa ditukar tanpa mengubah endpoint. Rekomendasi default: **Hermes 4
  untuk jawaban "pintar", DeepSeek sebagai fallback murah** (routing sederhana).

---

## 2. Pola inti — RAG (Retrieval-Augmented Generation)

Agar jawaban akurat dan tidak mengarang, assistant tidak menjawab dari ingatan
model, melainkan dari **knowledge base kamu sendiri** + **konteks page** + **data
read-only** yang relevan.

```
User (di page X) ──▶ Widget React
      │  { question, page_id, visible_context }
      ▼
FastAPI  /api/v1/assistant/chat
      │
      ├─ 1. Retrieve  → cari potongan dokumen relevan (vector search)
      ├─ 2. Context   → tempel "panduan page X" + data read-only (opsional)
      ├─ 3. Guardrail → system prompt: hanya cara pakai + data; tolak saran finansial
      ├─ 4. LLM       → Hermes 4 / DeepSeek (streaming)
      ▼
Jawaban (stream) ──▶ Widget
```

### Kenapa RAG, bukan model polos
- **Grounded** → jawaban nempel ke dokumen resmi; kalau tak ada, jawab "tidak tahu / hubungi support".
- **Mudah di-update** → fitur baru cukup tambah dokumen + re-index, tanpa retrain.
- **Hemat** → hanya beberapa potong dokumen yang dikirim ke model per pertanyaan.

---

## 3. Knowledge base

Sumber pengetahuan panduan produk. Simpan sebagai markdown, satu file per area.

```
backend/knowledge/
  signals-page.md        # cara pakai filter, arti kolom WR / BTC Corr / Verdict
  top-gainers.md         # kategori, time range, cara baca proof
  autotrade.md
  ai-research.md
  money-flow.md
  glossary.md            # istilah: TP1..TP4, SL, FVG, RSI, dsb
  faq.md
```

**Indexing:** tiap dokumen dipecah jadi potongan (~300–500 token), di-embed, lalu
disimpan. Karena kamu sudah pakai **PostgreSQL**, opsi paling ringkas adalah
ekstensi **pgvector** (tanpa infrastruktur baru). Alternatif: Qdrant.

Tabel usulan:

```sql
CREATE TABLE assistant_kb (
  id           BIGSERIAL PRIMARY KEY,
  page_id      TEXT NOT NULL,          -- 'signals', 'top-gainers', 'global'
  title        TEXT,
  chunk        TEXT NOT NULL,
  embedding    VECTOR(1536),           -- sesuai dimensi model embedding
  updated_at   TIMESTAMPTZ DEFAULT now()
);
```

Retrieval = ambil top-k chunk dengan `embedding <=> query_embedding` (cosine),
diprioritaskan yang `page_id` cocok dengan page aktif.

---

## 4. Kontrak API

### `POST /api/v1/assistant/chat`  (SSE streaming)

Request:
```json
{
  "message": "gimana cara filter coin small-cap?",
  "page_id": "signals",
  "context": { "visible": ["MCap", "Vol 24H", "Risk"] },
  "history": [{ "role": "user", "content": "..." }]
}
```

Response: stream token (Server-Sent Events), lalu event `done` berisi
`{ sources: [...] }` (chunk mana yang dipakai — untuk transparansi).

### `GET /api/v1/assistant/suggestions?page_id=signals`
Mengembalikan 4–8 pertanyaan-saran khas page itu (seed statis per page; bisa
di-refresh berkala). Contoh untuk Signals:
- "Apa arti kolom WR dan Streak?"
- "Gimana cara cari coin small-cap yang menjanjikan?"
- "Beda Risk NORMAL vs HIGH apa?"

---

## 5. Guardrail (scope: fitur + data pasar read-only)

System prompt inti:
- Jawab **cara memakai fitur LuxQuant** dan **menjelaskan data yang sudah tampil**
  (arti kolom, sinyal apa yang ada, cara baca chart proof).
- **Tolak** rekomendasi beli/jual, prediksi harga, atau saran finansial. Alihkan
  dengan disclaimer: "LuxQuant menyediakan data & alat; keputusan trading ada di
  tangan kamu."
- Jika info tidak ada di knowledge base / data → katakan tidak tahu, jangan
  mengarang.
- Bahasa mengikuti user (ID/EN), sesuai i18n yang sudah ada.

Lapisan teknis tambahan:
- **Rate limit per user** (mis. via Redis yang sudah ada) — cegah abuse & kontrol biaya.
- **Data read-only saja** — assistant tidak boleh memanggil endpoint yang mengubah
  state (trade, ubah watchlist, dsb).
- **Log pertanyaan** (anonim) untuk memperbaiki knowledge base.

---

## 6. Frontend — widget

Komponen React baru, dipasang global di layout terminal.

```
frontend-react/src/components/assistant/
  AssistantProvider.jsx   # context: page_id aktif, buka/tutup, riwayat
  AssistantBubble.jsx     # tombol mengambang (pojok kanan bawah)
  AssistantPanel.jsx      # panel chat: suggestions, input, streaming, sources
  useAssistant.js         # hook: fetch stream ke /assistant/chat
```

- **Page-awareness:** `page_id` diambil dari route aktif (react-router). Tiap page
  bisa mendaftarkan konteks tambahan (mis. kolom yang lagi tampil) lewat provider.
- **UX (meniru Gate AI):** panel muncul dari bawah, ada chip pertanyaan-saran,
  input dengan streaming jawaban, dan link "sources" kecil.
- **Mobile:** panel full-height sheet; bubble tetap di atas nav bawah.

---

## 7. Rencana bertahap

1. **M1 — Knowledge base + retrieval.** Tulis 4–5 dokumen panduan inti; pasang
   pgvector; script indexing; endpoint retrieval (uji tanpa LLM dulu).
2. **M2 — Endpoint chat + guardrail.** `/assistant/chat` streaming, provider
   abstraction (Hermes 4 + DeepSeek fallback), system prompt guardrail.
3. **M3 — Widget frontend.** Bubble + panel + suggestions, page-awareness, i18n.
4. **M4 — Polish.** Rate limit, caching FAQ, logging, analitik pertanyaan,
   penyempurnaan knowledge base dari log nyata.

---

## 8. Biaya & risiko (ringkas)

- **Biaya** naik seiring user aktif (per-token). Mitigasi: model murah (DeepSeek)
  untuk FAQ, cache jawaban umum, rate limit, batasi ukuran konteks.
- **Halusinasi** → diredam oleh RAG + guardrail "jawab hanya dari dokumen".
- **Maintenance** → knowledge base harus diperbarui tiap fitur berubah; jadikan
  bagian dari checklist rilis fitur.
- **Keamanan** → assistant strictly read-only; tidak ada tool yang mengubah dana
  atau posisi.
```
