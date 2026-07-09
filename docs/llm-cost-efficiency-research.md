# Efisiensi Biaya LLM — Riset Metode Terbaik (untuk LuxQuant Assistant)

Ternyata "hemat biaya LLM" itu bidang riset matang dengan istilah baku, paper, dan
tool open-source. Ada **5 lapis** yang bisa ditumpuk. Digabung, penghematannya bisa
**90–98%** dibanding memanggil model penuh tiap pertanyaan.

Ringkas: **jangan panggil model kalau tak perlu (cache), pakai model semurah
mungkin yang masih cukup (cascade), dan kirim token sesedikit mungkin (RAG + prompt
caching).**

---

## Lapis 1 — Prompt / KV Caching (provider-level)

Diskon dari penyedia model untuk bagian prompt yang **berulang** (prefix sama).

- Cara kerja: susun prompt jadi **prefix statis** (system prompt + dokumen panduan)
  di depan, lalu **bagian dinamis** (pertanyaan user) di belakang. Prefix yang sama
  ditagih jauh lebih murah pada panggilan berikutnya.
- Diskon: Anthropic & **DeepSeek ~90% (DeepSeek hingga ~98%)** untuk cached read;
  OpenAI ~25–50%. Realistis memangkas biaya input **70–90%** di banyak app.
- **Relevan banget buat kita**: system prompt + potongan dokumen sering identik antar
  pertanyaan di page yang sama → prefix nyaris selalu cache-hit.
- Aksi: taruh guardrail + dokumen di **awal** prompt; pertanyaan user di akhir.

## Lapis 2 — Semantic Cache (jawaban mirip = gratis)

Ini jawaban langsung untuk "pertanyaan sering identik". Pola dari **GPTCache**
(open-source, paper ACL 2023).

- Cara kerja: pertanyaan di-embed → cari pertanyaan lama yang **mirip secara makna**
  (bukan cuma persis sama) → kalau kemiripan di atas ambang, pakai jawaban lama.
  **Tidak memanggil LLM sama sekali.**
- **Hit rate produksi umumnya 30–70%** tergantung pola traffic. Untuk help/FAQ yang
  pertanyaannya berulang, condong ke ujung tinggi.
- Best practice hasil riset:
  - **Desain berjenjang**: *static cache* (jawaban FAQ kurasi manual dari log) +
    *dynamic cache* (terisi otomatis saat berjalan).
  - **Kualitas embedding = penentu utama.** Embedding jelek → *false hit* (pertanyaan
    beda dianggap sama → jawaban salah). Rekomendasi riset: **BGE-M3 @512 dim** sebagai
    titik awal.
  - **Re-rank kandidat cache** dengan cross-encoder sebelum dipakai, untuk buang
    kecocokan palsu.
  - **Tuning ambang kemiripan**: terlalu longgar → jawaban ngawur; terlalu ketat →
    hematnya kecil. Mulai ketat (mis. ~0.95), longgarkan sambil pantau.
- Risiko utama: **false cache hit** → wajib ambang konservatif + TTL + bust saat
  dokumen/fitur berubah.

## Lapis 3 — Model Cascade / Routing (FrugalGPT)

Paper **FrugalGPT** (Chen, Zaharia & Zou, 2023): **hemat hingga 98%** sambil
menyamai kualitas model termahal.

- Cara kerja: coba model **termurah dulu** → nilai keyakinan jawaban → kalau kurang
  yakin baru naik ke model lebih mahal. Sebagian besar pertanyaan tuntas di model
  murah.
- Tiga strategi FrugalGPT: **prompt adaptation** (rampingkan prompt), **LLM
  approximation** (cache/model kecil pengganti), **LLM cascade** (berjenjang).
- Komponen: *generation scoring function* (menilai jawaban cukup baik/tidak) + *router*.
- **Untuk kita**: DeepSeek Flash sebagai lapis-1 (hampir semua pertanyaan panduan
  selesai di sini); eskalasi ke model lebih besar hanya untuk pertanyaan sulit/langka.

## Lapis 4 — Efisiensi RAG (kirim token sesedikit mungkin)

Biaya sebanding jumlah token yang dikirim. RAG yang rapi memangkasnya.

- **Semantic chunking**: pecah dokumen di titik pergeseran makna (bukan potong
  seukuran tetap). Satu studi: akurasi naik ke ~71% vs baseline potong-tetap.
- **Reranking** (Cohere Rerank 3.5 / Voyage / BGE reranker v2): dari banyak kandidat,
  kirim **sedikit chunk paling relevan** ke LLM. Presisi naik 18–42%, dan **token
  LLM turun** — penghematannya biasanya menutup biaya reranker.
- **Context compression**: ringkas/filter chunk sebelum masuk prompt, ambil hanya
  yang penting.
- **RAG > long-context**: prompt 5K token jauh lebih murah daripada menjejalkan 1M
  token konteks, bahkan dengan prompt caching. Jadi jangan tempel seluruh dokumen —
  ambil potongan relevan saja.

## Lapis 5 — Prompt Adaptation (higienis)

- Pangkas riwayat chat (ringkas turn lama), batasi `max_tokens` output, buang few-shot
  yang tak perlu, instruksi ringkas. Kecil-kecil tapi berlipat di volume tinggi.

---

## Tumpukan rekomendasi untuk LuxQuant Assistant

Urutan eksekusi tiap pertanyaan (berhenti begitu terjawab):

```
Pertanyaan user
  │
  ├─ 1. Exact-match cache (Redis)         → hit? balas. $0
  ├─ 2. Semantic cache (embed + similarity)→ hit? balas. ≈$0 (cuma biaya embed)
  ├─ 3. RAG retrieve + rerank              → ambil few chunk relevan
  ├─ 4. Prompt: [prefix statis + docs][pertanyaan]  → prompt caching aktif
  ├─ 5. Model cascade: DeepSeek Flash dulu → cukup? balas.
  └─ 6. (jarang) eskalasi model lebih besar untuk kasus sulit
  └─ tulis hasil ke cache (TTL) untuk pertanyaan berikutnya
```

Pilihan konkret (murah, selaras stack kamu):
- **Embedding**: BGE-M3 (bisa self-host, murah) untuk RAG **dan** semantic cache.
- **Vector store**: **pgvector** (Postgres kamu sudah ada) — dipakai bersama untuk
  knowledge base + cache; tak perlu infra baru.
- **Cache**: **Redis** (sudah ada) untuk exact-match + metadata; vektor cache di pgvector.
- **Model lapis-1**: **DeepSeek** (sudah terpasang di `ai_worker.py`).
- **Prompt caching**: aktif otomatis kalau prefix disusun statis-di-depan.

### Perkiraan dampak (skenario 5.000 pertanyaan/hari)

| Skenario | Panggilan LLM | Biaya/hari* |
|---|---|---|
| Tanpa optimasi | 5.000 | ~$1.85 |
| + Semantic cache (hit 70%) | 1.500 | ~$0.55 |
| + Prompt caching (input −85%) | 1.500 | ~$0.15 |
| + Cascade (mayoritas model murah) | 1.500 | ~$0.10–0.15 |

\* Kasar, pakai DeepSeek Flash $0.14/$0.28. Intinya: dari ~$55/bln jadi **~$3–5/bln**
untuk traffic ramai. Makin lama cache makin "matang" → makin murah.

---

## Prinsip & jebakan

- **Correctness dulu, hemat kemudian.** Semantic cache yang ambangnya kelonggaran →
  jawaban salah yang meyakinkan. Mulai ketat, longgarkan sambil ukur.
- **Cache harus bisa basi.** TTL + invalidasi saat dokumen panduan/fitur berubah.
  Untuk jawaban yang bergantung data live (mis. "sinyal apa yang jalan sekarang"),
  cache pendek atau skip.
- **Ukur hit rate.** Log tiap pertanyaan → hitung cache hit rate, false-hit, biaya.
  Optimasi berbasis data nyata, bukan tebakan.
- **RAG mengalahkan long-context** untuk biaya — selalu kirim potongan, bukan seluruh
  dokumen.

---

## Sumber

- GPTCache (semantic cache open-source, paper ACL 2023) — https://github.com/zilliztech/gptcache , https://aclanthology.org/2023.nlposs-1.24/
- "How LLM Caching Actually Works" (prompt vs semantic cache, BGE-M3, hit rate) — https://akshayghalme.com/blogs/how-llm-caching-actually-works/
- Semantic caching for LLM inference (GPTCache / Redis / Prompt Cache) — https://www.spheron.network/blog/semantic-cache-llm-inference-gpu-cloud/
- FrugalGPT (LLM cascade, hemat s.d. 98%) — https://arxiv.org/abs/2305.05176
- Prompt caching cost analysis 2026 (diskon cached read per provider) — https://artificialanalysis.ai/models/caching , https://openrouter.ai/docs/guides/best-practices/prompt-caching
- RAG best practices 2026 (semantic chunking, reranking, compression) — https://www.callmissed.com/en/blog/rag-best-practices-2026 , https://www.abhs.in/blog/rag-in-production-chunking-retrieval-cost-developers-2026
