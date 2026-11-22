// [Diubah oleh Gemini - 2026-11-21] Penyimpanan Alur Kerja Otomasi Video Short 6-Tahap + Sinkronisasi Aturan Workspace Proyek, dashboardDir V15 & Pelacakan Token Gemini
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

// 6 tahap alur kerja Video Short terinspirasi pola orkestrasi MIT the-delegation
const SHORT_STAGES = Object.freeze([
  {
    index: 0,
    id: 'brief',
    label: '1. Brief & Topik',
    persona: 'project-shepherd',
    roleName: 'Project Shepherd',
    hitlGate: false
  },
  {
    index: 1,
    id: 'research',
    label: '2. Riset & Cek Fakta',
    persona: 'reality-checker',
    roleName: 'Reality Checker',
    hitlGate: false
  },
  {
    index: 2,
    id: 'script',
    label: '3. Naskah Short [HITL]',
    persona: 'technical-writer',
    roleName: 'Technical Writer',
    hitlGate: true
  },
  {
    index: 3,
    id: 'storyboard',
    label: '4. Storyboard Visual [HITL]',
    persona: 'ui-designer',
    roleName: 'UI Designer',
    hitlGate: true
  },
  {
    index: 4,
    id: 'render',
    label: '5. Paket Produksi & Render',
    persona: 'short-video-editing-coach',
    roleName: 'Short Video Coach',
    hitlGate: false
  },
  {
    index: 5,
    id: 'qa_publish',
    label: '6. QA & Siap Upload [HITL]',
    persona: 'social-media-strategist',
    roleName: 'Social Media Strategist',
    hitlGate: true
  }
]);

const VALID_MODES = new Set(['auto', 'local', 'gemini']);
const MODEL_SLUG_RE = /^[a-zA-Z0-9._-]{3,64}$/;
const FORBIDDEN_PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function httpError(status, code, message) {
  const err = new Error(message || code);
  err.status = status;
  err.code = code;
  return err;
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function assertSafeObject(obj) {
  if (!isPlainObject(obj)) {
    throw httpError(400, 'invalid_payload', 'Payload harus berupa objek JSON');
  }
  for (const k of Object.getOwnPropertyNames(obj)) {
    if (FORBIDDEN_PROTO_KEYS.has(k)) {
      throw httpError(400, 'forbidden_prototype_key', 'Properti prototipe tidak diizinkan');
    }
  }
}

function cleanText(val, maxLen = 400) {
  if (val === undefined || val === null) return '';
  return String(val).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLen);
}

function maskApiKey(key) {
  const s = String(key || '').trim();
  if (!s) return '';
  if (s.length <= 4) return '...****';
  return '...' + s.slice(-4);
}

// [Diubah oleh Gemini - 2026-11-20] Penjaga path workspace: wajib melewati semua folder Secrets atau .git
function isBlockedWorkspacePath(targetPath) {
  const norm = String(targetPath || '').replace(/\\/g, '/');
  const segments = norm.split('/').filter(Boolean);
  return segments.some(seg => /^(secrets|\.git|\.env)$/i.test(seg));
}

async function readSafeWorkspaceFile(filePath, maxChars = 2500) {
  if (!filePath || isBlockedWorkspacePath(filePath)) return '';
  try {
    const st = await fs.lstat(filePath);
    if (!st.isFile() || st.isSymbolicLink()) return '';
    const handle = await fs.open(filePath, 'r');
    try {
      const capBytes = Math.min(st.size, Math.max(4096, maxChars * 4));
      const buf = Buffer.alloc(capBytes);
      const { bytesRead } = await handle.read(buf, 0, capBytes, 0);
      return buf
        .subarray(0, bytesRead)
        .toString('utf8')
        .replace(/<!--[\s\S]*?-->/g, '')
        .trim()
        .slice(0, maxChars);
    } finally {
      await handle.close();
    }
  } catch {
    return '';
  }
}

async function fileExistsSafe(filePath) {
  if (!filePath || isBlockedWorkspacePath(filePath)) return false;
  try {
    const st = await fs.lstat(filePath);
    return st.isFile() && !st.isSymbolicLink();
  } catch {
    return false;
  }
}

function extractConciseRules(markdownText, sourceTag, maxItems = 6, maxTotalChars = 3500) {
  if (!markdownText) return { bullets: [], excerpt: '' };
  const lines = String(markdownText).split(/\r?\n/);
  const bullets = [];
  let charAccum = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const isBullet = /^([-*]|\d+\.)\s+/.test(line);
    if (!isBullet) continue;
    const cleaned = line
      .replace(/^([-*]|\d+\.)\s+/, '')
      .replace(/\*\*/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 220);
    if (cleaned.length < 12) continue;
    if (/^(belum ada data|cara memperbarui)/i.test(cleaned)) continue;
    const formatted = `[${sourceTag}] ${cleaned}`;
    if (charAccum + formatted.length > maxTotalChars) break;
    bullets.push(formatted);
    charAccum += formatted.length;
    if (bullets.length >= maxItems) break;
  }

  return {
    bullets,
    excerpt: String(markdownText).slice(0, maxTotalChars)
  };
}

function normalizeChannelKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// [Diubah oleh Gemini - 2026-11-20] Resolusi aturan workspace (root AGENTS.md + Channels/<ch>/AGENTS.md + LEARNINGS.md) untuk kanal target
function resolveWorkspaceContext(workspaceScan, targetChannel) {
  const defaultBuiltInRules = [
    '[HITL Safety] Gerbang persetujuan manual aktif pada tahap Naskah, Storyboard, dan QA Akhir (auto-upload dilarang)',
    '[Short Format] Rasio vertikal 9:16 (1080x1920), hook visual kuat di 0-3 detik pertama, teks aman dari overlay UI'
  ];

  if (!workspaceScan || !workspaceScan.valid) {
    return {
      synced: false,
      channelMatched: null,
      rulesApplied: defaultBuiltInRules,
      promptBlock: `=== ATURAN STANDAR STUDIO SHORT (WAJIB DIIKUTI) ===\n${defaultBuiltInRules.map(r => `- ${r}`).join('\n')}`
    };
  }

  const targetNorm = normalizeChannelKey(targetChannel);
  const matchedCh =
    (workspaceScan.channels || []).find(ch => {
      const chNorm = normalizeChannelKey(ch.name);
      return chNorm === targetNorm || chNorm.includes(targetNorm) || targetNorm.includes(chNorm);
    }) || null;

  const applied = [];
  if (Array.isArray(workspaceScan.rootRules)) {
    applied.push(...workspaceScan.rootRules.slice(0, 4));
  }
  if (matchedCh) {
    if (Array.isArray(matchedCh.agentRules)) {
      applied.push(...matchedCh.agentRules.slice(0, 4));
    }
    if (Array.isArray(matchedCh.learningRules)) {
      applied.push(...matchedCh.learningRules.slice(0, 4));
    }
  }
  if (applied.length === 0 && Array.isArray(workspaceScan.rulesSummary)) {
    applied.push(...workspaceScan.rulesSummary.slice(0, 6));
  }
  for (const r of defaultBuiltInRules) {
    if (applied.length < 12) applied.push(r);
  }

  const sections = ['=== ATURAN WORKSPACE PROYEK & KANAL (WAJIB DIIKUTI) ==='];
  if (workspaceScan.rootAgentsExcerpt) {
    sections.push(`[Root AGENTS.md — ${workspaceScan.rootName}]\n${workspaceScan.rootAgentsExcerpt.slice(0, 1200)}`);
  }
  if (matchedCh) {
    if (matchedCh.agentsExcerpt) {
      sections.push(`[Channels/${matchedCh.name}/AGENTS.md]\n${matchedCh.agentsExcerpt.slice(0, 1200)}`);
    }
    if (matchedCh.learningsExcerpt) {
      sections.push(`[Channels/${matchedCh.name}/LEARNINGS.md]\n${matchedCh.learningsExcerpt.slice(0, 1200)}`);
    }
  }
  sections.push(`Ringkasan Aturan Aktif:\n${applied.map(r => `- ${r}`).join('\n')}`);

  return {
    synced: true,
    channelMatched: matchedCh ? matchedCh.name : null,
    rulesApplied: applied,
    promptBlock: sections.join('\n\n')
  };
}

function buildStagePrompt(workflow, stage, prevOutputs, workspaceContext) {
  const revNote = stage.feedback ? `\nCatatan Revisi dari Bos (WAJIB DIPERBAIKI): ${stage.feedback}\n` : '';
  const wsBlock = workspaceContext?.promptBlock ? `\n${workspaceContext.promptBlock}\n` : '';
  const baseHeader = [
    `Proyek Video Short: "${workflow.title}"`,
    `Topik Utama: ${workflow.topic}`,
    `Target Channel: ${workflow.channel || 'General Short'}`,
    `Tahap Saat Ini: ${stage.label} (Spesialis: ${stage.roleName} / ${stage.persona})`,
    wsBlock,
    revNote
  ].filter(Boolean).join('\n');

  if (stage.id === 'brief') {
    return `${baseHeader}\nSusun dokumen Brief Video Short (durasi 35-55 detik, rasio 9:16) yang mematuhi aturan workspace & kanal di atas mencakup:
1. Sudut Pandang Utama (Core Angle)
2. Target Penonton & Emosi Kunci
3. Pesan Satu Kalimat (Takeaway)
4. Batasan Gaya Visual & Suara sesuai identitas kanal`;
  }
  if (stage.id === 'research') {
    return `${baseHeader}\nKonteks Brief:\n${prevOutputs.brief || '-'}\n\nSusun hasil Riset & Cek Fakta yang mematuhi aturan kanal & LEARNINGS.md mencakup:
1. 3 Fakta Terverifikasi / Data Utama
2. 3 Pilihan Hook Pembuka (0-3 detik pertama) yang memicu rasa ingin tahu tanpa clickbait palsu
3. Potensi Kesalahan Fakta yang Harus Dihindari`;
  }
  if (stage.id === 'script') {
    return `${baseHeader}\nKonteks Riset:\n${prevOutputs.research || '-'}\n\nTulis Naskah Video Short (35-55 detik, Bahasa Indonesia lugas & mengalir) sesuai gaya kanal dengan struktur waktu:
- [00:00 - 00:04] HOOK: Kalimat pembuka tajam + aksi visual pembuka
- [00:04 - 00:20] ISI BAGIAN 1: Penjelasan mekanisme/masalah utama
- [00:20 - 00:40] ISI BAGIAN 2: Puncak temuan / twist faktual
- [00:40 - 00:50] PENUTUP & CTA: Kesimpulan tajam + loop ending / ajakan berdiskusi`;
  }
  if (stage.id === 'storyboard') {
    return `${baseHeader}\nNaskah Disetujui:\n${prevOutputs.script || '-'}\n\nSusun Storyboard Visual 6 Shot (9:16 vertikal) sesuai aturan QA storyboard kanal lengkap dengan:
- Shot #1..#6 (Durasi, Komposisi Kamera, Aksi Karakter/Objek, Teks Layar Maks 4 Kata, Petunjuk SFX/BGM)
- Checklist Konsistensi Visual (tokoh utuh, tidak ada benda melayang, teks tidak menutup wajah, kontras tinggi)`;
  }
  if (stage.id === 'render') {
    return `${baseHeader}\nStoryboard Disetujui:\n${prevOutputs.storyboard || '-'}\n\nSusun Paket Produksi & Checklist Render Lokal sesuai struktur folder kanal:
1. Daftar Aset Suara (Voiceover TTS/rekaman, BGM, SFX transisi)
2. Spesifikasi Render (1080x1920, 30/60fps, H.264, loudness -14 LUFS)
3. Struktur Berkas Proyek Lokal (script.json, audio/, web/, stills/, upload.json, description.txt, thumbnail.jpg)`;
  }
  return `${baseHeader}\nNaskah & Produksi:\n${prevOutputs.script || '-'}\n\nSusun Paket QA Akhir & Metadata Siap Upload (TANPA UPLOAD OTOMATIS) sesuai aturan kanal:
1. 3 Pilihan Judul Short (< 60 karakter)
2. Deskripsi & Hashtag (#Shorts)
3. Checklist QA Pra-Publikasi (Audio sinkron, frame pertama kuat, bebas klaim palsu, teks aman dari UI overlay)
4. Status: Menunggu Persetujuan Final Bos`;
}

function buildLocalStructuredDraft(workflow, stage, prevOutputs, workspaceContext) {
  const revBanner = stage.feedback
    ? `> [Revisi #${stage.revisionCount}] Disesuaikan berdasarkan catatan Bos: "${stage.feedback}"\n\n`
    : '';
  const channel = workflow.channel || 'DefaultChannel';
  const topic = workflow.topic || workflow.title;
  const rulesList = Array.isArray(workspaceContext?.rulesApplied) && workspaceContext.rulesApplied.length
    ? `\n\n## Aturan Workspace & Kanal yang Diterapkan\n${workspaceContext.rulesApplied.slice(0, 5).map(r => `- ${r}`).join('\n')}`
    : '';

  if (stage.id === 'brief') {
    return `${revBanner}# Brief Produksi Video Short
- **Judul Kerja**: ${workflow.title}
- **Topik**: ${topic}
- **Target Channel**: ${channel}
- **Format**: YouTube Shorts / Reels Vertikal (1080×1920, 45 detik)
- **Sudut Pandang Utama**: Membongkar cara kerja & fakta nyata di balik "${topic}" secara visual dan padat.
- **Target Retensi**: Hook visual dalam 2,5 detik pertama; pergantian beat visual setiap 4–6 detik.
- **Penanggung Jawab**: Project Shepherd (\`project-shepherd\`)${rulesList}`;
  }

  if (stage.id === 'research') {
    return `${revBanner}# Riset & Verifikasi Fakta — ${workflow.title}
## 1. Poin Fakta & Mekanisme Utama
- **Fakta 1**: Definisi inti dan angka dasar terkait "${topic}" yang dapat diverifikasi silang.
- **Fakta 2**: Penyebab utama mengapa fenomena/topik ini sering disalahpahami penonton umum.
- **Fakta 3**: Dampak nyata atau contoh konkret dalam kehidupan sehari-hari.

## 2. Opsi Hook Pembuka (0–3 Detik)
1. *"Pernah sadar kenapa ${topic} tidak bekerja seperti yang kita kira?"*
2. *"Dalam 45 detik, ini alasan sebenarnya di balik ${topic}."*
3. *"Kebanyakan orang salah paham soal ${topic}—lihat perbandingan ini."*

## 3. Batas Keamanan Fakta (Reality Checker)
- Hindari klaim angka absolut tanpa rentang yang jujur.
- Pastikan istilah teknis disederhanakan dengan analogi visual.${rulesList}`;
  }

  if (stage.id === 'script') {
    return `${revBanner}# Naskah Video Short (45 Detik) — ${workflow.title}
**Gerbang HITL**: Menunggu tinjauan & persetujuan Bos sebelum masuk ke Storyboard.

| Waktu | Narasi Voiceover (ID) | Arahan Visual & Teks Layar |
|---|---|---|
| **00:00–00:04** | "Pernah terpikir kenapa **${topic}** bisa mengubah hasil akhir secara drastis?" | Close-up kontras tinggi + Teks Layar: **KENAPA BISA?** |
| **00:04–00:18** | "Kuncinya ada pada mekanisme dasarnya. Saat langkah pertama dimulai, sebagian besar energi atau fokus justru terkumpul di titik tersempit." | Diagram animasi bergerak 2 tahap + sorotan warna emas |
| **00:18–00:34** | "Begitu batas ini dilewati, efek berantainya langsung terlihat jelas dibanding cara biasa." | Split-screen perbandingan Cara Lama vs Pola Baru |
| **00:34–00:45** | "Jadi bukan soal seberapa rumit alatnya, tapi ketepatan urutannya. Menurutmu bagian mana yang paling krusial?" | Frame ringkasan bersih + CTA komentar |${rulesList}`;
  }

  if (stage.id === 'storyboard') {
    return `${revBanner}# Storyboard Visual 6-Shot (9:16) — ${workflow.title}
**Gerbang HITL**: Menunggu persetujuan Bos sebelum paket produksi/render dibuat.

1. **Shot 1 (00:00–00:04) — Hook Establishing**
   - *Visual*: Karakter utama menunjuk grafik/objek inti "${topic}" dengan latar kontras gelap-hangat.
   - *Teks Layar*: **FAKTA INTI** (posisi sepertiga atas, aman dari wajah).
2. **Shot 2 (00:04–00:11) — Masalah / Pemicu**
   - *Visual*: Zoom-in ke komponen utama; garis alur menyala menunjukkan bottleneck.
3. **Shot 3 (00:11–00:20) — Mekanisme Kerja**
   - *Visual*: Infografis 3 langkah bersih dengan angka tabular jelas.
4. **Shot 4 (00:20–00:29) — Perbandingan Visual**
   - *Visual*: Panel Atas vs Bawah memperlihatkan selisih hasil secara instan.
5. **Shot 5 (00:29–00:38) — Temuan Kunci**
   - *Visual*: Karakter di meja kerja menyelesaikan keping terakhir dengan lampu indikator hijau.
6. **Shot 6 (00:38–00:45) — Resolusi & Loop Ending**
   - *Visual*: Komposisi menyambung halus ke frame pembuka untuk replay loop.${rulesList}`;
  }

  if (stage.id === 'render') {
    return `${revBanner}# Paket Produksi & Checklist Render — ${workflow.title}
- **Target Folder Kanal**: \`${channel}\`
- **Spesifikasi Video**: \`1080x1920\` (9:16), \`30 fps\`, H.264 MP4, Audio AAC 48kHz (-14 LUFS).
- **Daftar Berkas Artefak**:
  - \`1_brief.md\` — Dokumen brief awal
  - \`2_research.md\` — Catatan fakta & hook
  - \`3_script.md\` — Naskah voiceover terverifikasi HITL
  - \`4_storyboard.md\` — Breakdown 6 shot terverifikasi HITL
  - \`workflow.json\` — Metadata lengkap untuk pipeline render lokal
- **Status Produksi**: Paket instruksi render siap dijalankan oleh agen/mesin render lokal.${rulesList}`;
  }

  return `${revBanner}# Paket QA Akhir & Metadata Publikasi — ${workflow.title}
**Gerbang HITL Final**: **TIDAK PERNAH UPLOAD OTOMATIS**. Publikasi hanya dilakukan setelah Bos menyetujui.

## Pilihan Judul
1. \`Cara Kerja ${workflow.title} dalam 45 Detik #Shorts\`
2. \`Kenapa ${workflow.title} Sering Disalahpahami? #Shorts\`
3. \`Rahasia di Balik ${workflow.title} yang Jarang Dibahas #Shorts\`

## Deskripsi & Tag
\`\`\`text
Penjelasan singkat dan padat mengenai ${topic}.
Channel: ${channel}
#Shorts #Edukasi #Animasi
\`\`\`

## Daftar Cek QA Pra-Upload
- [x] Naskah telah melewati persetujuan HITL
- [x] Storyboard bebas tumpang-tindih teks & aman dari zona UI Shorts
- [x] Tidak ada klaim tanpa dasar fakta
- [ ] Konfirmasi manual Bos sebelum menjalankan skrip upload${rulesList}`;
}

async function createShortWorkflowStore({
  dataDir,
  onEvent = () => {},
  onGeminiUsage = null,
  now = Date.now,
  fetchImpl = globalThis.fetch
} = {}) {
  const storeFilePath = path.join(dataDir, 'short_workflows.json');
  const secretsFilePath = path.join(dataDir, 'secrets_local.json');
  const artifactsRootDir = path.join(dataDir, 'short_workflows');
  let writeQueue = Promise.resolve();
  let lastWorkspaceScan = null;

  const nowIso = () => new Date(now()).toISOString();

  async function ensureDirs() {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.mkdir(artifactsRootDir, { recursive: true });
  }

  async function writeJsonAtomic(targetPath, obj) {
    await ensureDirs();
    const tmp = `${targetPath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    const payload = JSON.stringify(obj, null, 2) + '\n';
    await fs.writeFile(tmp, payload, 'utf8');
    let lastErr = null;
    for (let i = 0; i < 5; i++) {
      try {
        await fs.rename(tmp, targetPath);
        return;
      } catch (err) {
        lastErr = err;
        if (err && (err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EEXIST')) {
          await new Promise(r => setTimeout(r, 20 * (i + 1)));
          continue;
        }
        break;
      }
    }
    await fs.unlink(tmp).catch(() => {});
    throw lastErr || new Error('Gagal menyimpan berkas JSON secara atomik');
  }

  async function readExistingSecrets() {
    try {
      const raw = JSON.parse(await fs.readFile(secretsFilePath, 'utf8'));
      return isPlainObject(raw) ? raw : {};
    } catch {
      return {};
    }
  }

  async function saveMergedSecrets(patch) {
    const existing = await readExistingSecrets();
    const merged = { ...existing, ...patch, updatedAt: nowIso() };
    await writeJsonAtomic(secretsFilePath, merged);
  }

  let state = {
    version: 1,
    config: {
      localProjectDir: '',
      dashboardDir: '',
      defaultChannel: '',
      geminiModel: 'gemini-2.5-flash',
      autoApprove: false
    },
    workflows: [],
    actionLog: []
  };

  let secrets = {
    geminiApiKey: ''
  };

  await ensureDirs();

  try {
    const rawStore = JSON.parse(await fs.readFile(storeFilePath, 'utf8'));
    if (isPlainObject(rawStore)) {
      state.config = {
        localProjectDir: cleanText(rawStore.config?.localProjectDir, 260),
        dashboardDir: cleanText(rawStore.config?.dashboardDir, 260),
        defaultChannel: cleanText(rawStore.config?.defaultChannel || '', 80),
        geminiModel: MODEL_SLUG_RE.test(String(rawStore.config?.geminiModel || ''))
          ? String(rawStore.config.geminiModel)
          : 'gemini-2.5-flash',
        // Strict HITL: autoApprove selalu false
        autoApprove: false
      };
      if (Array.isArray(rawStore.workflows)) {
        state.workflows = rawStore.workflows.filter(w => isPlainObject(w) && typeof w.id === 'string');
      }
      if (Array.isArray(rawStore.actionLog)) {
        state.actionLog = rawStore.actionLog.slice(-200);
      }
    }
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      await fs.rename(storeFilePath, `${storeFilePath}.corrupt.${Date.now()}`).catch(() => {});
    }
    await writeJsonAtomic(storeFilePath, state);
  }

  try {
    const rawSecrets = await readExistingSecrets();
    if (typeof rawSecrets.geminiApiKey === 'string') {
      secrets.geminiApiKey = rawSecrets.geminiApiKey.trim();
    }
  } catch {
    /* secrets_local.json bersifat opsional dan hanya dibuat saat pengguna menyimpan API key */
  }

  function queueSaveStore() {
    const copy = {
      version: 1,
      config: { ...state.config, autoApprove: false },
      workflows: state.workflows.slice(-100),
      actionLog: state.actionLog.slice(-200)
    };
    const next = writeQueue.then(() => writeJsonAtomic(storeFilePath, copy));
    writeQueue = next.catch(() => {});
    return next;
  }

  function emitSafe(payload) {
    try {
      onEvent(payload);
    } catch {
      /* abaikan error listener SSE */
    }
  }

  function recordAction(actionObj) {
    const entry = {
      id: 'act_' + crypto.randomBytes(5).toString('hex'),
      timestamp: nowIso(),
      ...actionObj
    };
    state.actionLog.push(entry);
    if (state.actionLog.length > 200) {
      state.actionLog = state.actionLog.slice(-200);
    }
    return entry;
  }

  // [Diubah oleh Gemini - 2026-11-21] Pindai folder workspace proyek secara read-only (AGENTS.md, LEARNINGS.md, ACTIVE.md, Channels/*, Videos/*)
  async function scanWorkspace(overrideDir) {
    const rawDir = cleanText(overrideDir !== undefined ? overrideDir : state.config.localProjectDir, 260);
    const stamp = nowIso();
    if (!rawDir) {
      const emptyScan = {
        configured: false,
        valid: false,
        rootName: '',
        localProjectDir: '',
        hasRootAgents: false,
        hasRootActive: false,
        rootAgentsExcerpt: '',
        rootActiveExcerpt: '',
        rootRules: [],
        channels: [],
        rulesSummary: [],
        rulesCount: 0,
        syncedAt: stamp
      };
      lastWorkspaceScan = emptyScan;
      return emptyScan;
    }

    const resolvedBase = path.resolve(rawDir);
    if (isBlockedWorkspacePath(resolvedBase)) {
      const blockedScan = {
        configured: true,
        valid: false,
        rootName: path.basename(resolvedBase),
        localProjectDir: rawDir,
        hasRootAgents: false,
        hasRootActive: false,
        rootAgentsExcerpt: '',
        rootActiveExcerpt: '',
        rootRules: [],
        channels: [],
        rulesSummary: [],
        rulesCount: 0,
        syncedAt: stamp,
        error: 'Folder sensitif (Secrets / .git) ditolak oleh penjaga keamanan'
      };
      lastWorkspaceScan = blockedScan;
      return blockedScan;
    }

    let baseStat = null;
    try {
      baseStat = await fs.lstat(resolvedBase);
    } catch {
      baseStat = null;
    }

    if (!baseStat || !baseStat.isDirectory() || baseStat.isSymbolicLink()) {
      const invalidScan = {
        configured: true,
        valid: false,
        rootName: path.basename(resolvedBase),
        localProjectDir: rawDir,
        hasRootAgents: false,
        hasRootActive: false,
        rootAgentsExcerpt: '',
        rootActiveExcerpt: '',
        rootRules: [],
        channels: [],
        rulesSummary: [],
        rulesCount: 0,
        syncedAt: stamp,
        error: 'Folder workspace tidak ditemukan atau bukan direktori reguler'
      };
      lastWorkspaceScan = invalidScan;
      return invalidScan;
    }

    const rootName = path.basename(resolvedBase);
    const rootAgentsRaw = await readSafeWorkspaceFile(path.join(resolvedBase, 'AGENTS.md'), 3500);
    const rootActiveRaw = await readSafeWorkspaceFile(path.join(resolvedBase, 'ACTIVE.md'), 1500);
    const rootExtracted = extractConciseRules(rootAgentsRaw, 'Root AGENTS.md', 8, 3500);

    const channels = [];
    const allRules = [...rootExtracted.bullets];

    const channelsDir = path.join(resolvedBase, 'Channels');
    let chEntries = [];
    try {
      const chDirStat = await fs.lstat(channelsDir);
      if (chDirStat.isDirectory() && !chDirStat.isSymbolicLink()) {
        chEntries = await fs.readdir(channelsDir, { withFileTypes: true });
      }
    } catch {
      chEntries = [];
    }

    chEntries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of chEntries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      if (entry.name.startsWith('_') || entry.name.startsWith('.') || isBlockedWorkspacePath(entry.name)) continue;

      const chName = entry.name;
      const chPath = path.join(channelsDir, chName);
      const chAgentsRaw = await readSafeWorkspaceFile(path.join(chPath, 'AGENTS.md'), 2500);
      const chLearningsRaw = await readSafeWorkspaceFile(path.join(chPath, 'LEARNINGS.md'), 2500);
      const chActiveRaw = await readSafeWorkspaceFile(path.join(chPath, 'ACTIVE.md'), 1200);

      const chAgentRules = extractConciseRules(chAgentsRaw, `${chName}/AGENTS.md`, 5, 2500).bullets;
      const chLearningRules = extractConciseRules(chLearningsRaw, `${chName}/LEARNINGS.md`, 5, 2500).bullets;
      const combinedChRules = [...chAgentRules, ...chLearningRules];
      for (const r of combinedChRules) {
        if (allRules.length < 48) allRules.push(r);
      }

      const activeReels = [];
      const videosDir = path.join(chPath, 'Videos');
      let reelEntries = [];
      try {
        const vStat = await fs.lstat(videosDir);
        if (vStat.isDirectory() && !vStat.isSymbolicLink()) {
          reelEntries = await fs.readdir(videosDir, { withFileTypes: true });
        }
      } catch {
        reelEntries = [];
      }

      reelEntries.sort((a, b) => a.name.localeCompare(b.name));
      for (const rEntry of reelEntries) {
        if (!rEntry.isDirectory() || rEntry.isSymbolicLink()) continue;
        if (rEntry.name.startsWith('_') || rEntry.name.startsWith('.') || isBlockedWorkspacePath(rEntry.name)) continue;
        const slug = rEntry.name;
        const reelDir = path.join(videosDir, slug);
        const [hasScript, hasStoryboard, hasQaReport, hasUploadJson, hasThumbnail] = await Promise.all([
          Promise.any([
            fileExistsSafe(path.join(reelDir, 'script.json')).then(ok => (ok ? true : Promise.reject())),
            fileExistsSafe(path.join(reelDir, '3_script.md')).then(ok => (ok ? true : Promise.reject())),
            fileExistsSafe(path.join(reelDir, 'script.md')).then(ok => (ok ? true : Promise.reject()))
          ]).catch(() => false),
          Promise.any([
            fileExistsSafe(path.join(reelDir, 'storyboard.jpg')).then(ok => (ok ? true : Promise.reject())),
            fileExistsSafe(path.join(reelDir, 'storyboard.png')).then(ok => (ok ? true : Promise.reject())),
            fileExistsSafe(path.join(reelDir, 'board.json')).then(ok => (ok ? true : Promise.reject())),
            fileExistsSafe(path.join(reelDir, '4_storyboard.md')).then(ok => (ok ? true : Promise.reject())),
            fileExistsSafe(path.join(reelDir, 'qa', 'storyboard_report.md')).then(ok => (ok ? true : Promise.reject()))
          ]).catch(() => false),
          Promise.any([
            fileExistsSafe(path.join(reelDir, 'qa', 'qa_report.md')).then(ok => (ok ? true : Promise.reject())),
            fileExistsSafe(path.join(reelDir, 'qa_report.md')).then(ok => (ok ? true : Promise.reject()))
          ]).catch(() => false),
          fileExistsSafe(path.join(reelDir, 'upload.json')),
          Promise.any([
            fileExistsSafe(path.join(reelDir, 'thumbnail.jpg')).then(ok => (ok ? true : Promise.reject())),
            fileExistsSafe(path.join(reelDir, 'thumbnail.png')).then(ok => (ok ? true : Promise.reject()))
          ]).catch(() => false)
        ]);

        activeReels.push({
          slug,
          hasScript,
          hasStoryboard,
          hasQaReport,
          hasUploadJson,
          hasThumbnail
        });
      }

      channels.push({
        name: chName,
        hasAgents: Boolean(chAgentsRaw),
        hasLearnings: Boolean(chLearningsRaw),
        hasActive: Boolean(chActiveRaw),
        agentsExcerpt: chAgentsRaw,
        learningsExcerpt: chLearningsRaw,
        activeExcerpt: chActiveRaw,
        agentRules: chAgentRules,
        learningRules: chLearningRules,
        rules: combinedChRules,
        rulesCount: combinedChRules.length,
        activeReels,
        reelCount: activeReels.length
      });
    }

    const result = {
      configured: true,
      valid: true,
      rootName,
      localProjectDir: rawDir,
      hasRootAgents: Boolean(rootAgentsRaw),
      hasRootActive: Boolean(rootActiveRaw),
      rootAgentsExcerpt: rootAgentsRaw,
      rootActiveExcerpt: rootActiveRaw,
      rootRules: rootExtracted.bullets,
      channels,
      rulesSummary: allRules,
      rulesCount: allRules.length,
      syncedAt: stamp
    };
    lastWorkspaceScan = result;
    return result;
  }

  if (state.config.localProjectDir) {
    await scanWorkspace().catch(() => {});
  }

  // [Diubah oleh Gemini - 2026-11-21] GET config tidak pernah membocorkan geminiApiKey mentah (hanya hasGeminiKey + keyHint) + dukung dashboardDir terpisah
  function getPublicConfig() {
    const hasKey = Boolean(secrets.geminiApiKey && secrets.geminiApiKey.length > 0);
    return {
      localProjectDir: state.config.localProjectDir,
      dashboardDir: state.config.dashboardDir || '',
      defaultChannel: state.config.defaultChannel,
      geminiModel: state.config.geminiModel,
      hasGeminiKey: hasKey,
      keyHint: hasKey ? maskApiKey(secrets.geminiApiKey) : '',
      autoApprove: false
    };
  }

  // Helper internal bagi store V13 lain (YouTube Analytics & Agent Prompt) di proses server yang sama
  function getInternalGeminiConfig() {
    return {
      apiKey: secrets.geminiApiKey || '',
      model: state.config.geminiModel || 'gemini-2.5-flash',
      hasGeminiKey: Boolean(secrets.geminiApiKey && secrets.geminiApiKey.length > 0)
    };
  }

  async function updateConfig(rawPayload) {
    assertSafeObject(rawPayload);

    if (rawPayload.localProjectDir !== undefined) {
      const candidateDir = cleanText(rawPayload.localProjectDir, 260);
      if (candidateDir && isBlockedWorkspacePath(candidateDir)) {
        throw httpError(403, 'forbidden_workspace_path', 'Folder Secrets atau .git tidak diizinkan sebagai workspace');
      }
      state.config.localProjectDir = candidateDir;
    }
    if (rawPayload.dashboardDir !== undefined) {
      const candidateDash = cleanText(rawPayload.dashboardDir, 260);
      if (candidateDash && isBlockedWorkspacePath(candidateDash)) {
        throw httpError(403, 'forbidden_workspace_path', 'Folder Secrets atau .git tidak diizinkan sebagai folder dasbor');
      }
      state.config.dashboardDir = candidateDash;
    }
    if (rawPayload.defaultChannel !== undefined) {
      state.config.defaultChannel = cleanText(rawPayload.defaultChannel, 80);
    }
    if (rawPayload.geminiModel !== undefined) {
      const m = cleanText(rawPayload.geminiModel, 64);
      if (!m || !MODEL_SLUG_RE.test(m)) {
        throw httpError(400, 'invalid_gemini_model', 'Nama model Gemini tidak valid');
      }
      state.config.geminiModel = m;
    }

    // Strict HITL: tolak atau paksa autoApprove tetap false
    state.config.autoApprove = false;

    if (rawPayload.clearGeminiKey === true) {
      secrets.geminiApiKey = '';
      await saveMergedSecrets({ geminiApiKey: '' });
    } else if (rawPayload.geminiApiKey !== undefined) {
      const candidate = cleanText(rawPayload.geminiApiKey, 256);
      if (candidate === '') {
        secrets.geminiApiKey = '';
        await saveMergedSecrets({ geminiApiKey: '' });
      } else if (!candidate.startsWith('...')) {
        secrets.geminiApiKey = candidate;
        await saveMergedSecrets({ geminiApiKey: candidate });
      }
    }

    if (rawPayload.localProjectDir !== undefined) {
      await scanWorkspace().catch(() => {});
    }

    const act = recordAction({
      type: 'config_updated',
      persona: 'project-shepherd',
      message: 'Konfigurasi integrasi Video Short diperbarui'
    });
    await queueSaveStore();
    const pubCfg = getPublicConfig();
    emitSafe({ type: 'workflow_config', config: pubCfg, action: act });
    return pubCfg;
  }

  function listWorkflows() {
    return {
      workflows: state.workflows,
      stagesCatalog: SHORT_STAGES,
      actionLog: state.actionLog.slice(-80).reverse(),
      config: getPublicConfig(),
      workspace: lastWorkspaceScan
        ? {
            configured: lastWorkspaceScan.configured,
            valid: lastWorkspaceScan.valid,
            rootName: lastWorkspaceScan.rootName,
            rulesCount: lastWorkspaceScan.rulesCount,
            channelNames: (lastWorkspaceScan.channels || []).map(c => c.name),
            syncedAt: lastWorkspaceScan.syncedAt
          }
        : null
    };
  }

  async function saveWorkflowArtifacts(workflow, stage) {
    const wfDir = path.join(artifactsRootDir, workflow.id);
    await fs.mkdir(wfDir, { recursive: true });
    if (stage && stage.output) {
      const mdName = `${stage.index + 1}_${stage.id}.md`;
      await fs.writeFile(path.join(wfDir, mdName), stage.output + '\n', 'utf8');
    }
    await fs.writeFile(path.join(wfDir, 'workflow.json'), JSON.stringify(workflow, null, 2) + '\n', 'utf8');

    // Mode A: jika localProjectDir dikonfigurasi & bukan workspace root dengan Channels/, atau sub-folder aman
    if (state.config.localProjectDir && !isBlockedWorkspacePath(state.config.localProjectDir)) {
      try {
        const resolvedBase = path.resolve(state.config.localProjectDir);
        const stat = await fs.stat(resolvedBase);
        if (stat.isDirectory()) {
          // Jika folder tersebut memiliki subfolder Channels/, simpan di bawah Channels/<channel>/Videos/_office_drafts/<id>
          // atau jika folder biasa, simpan di <localProjectDir>/<id> agar tetap kompatibel dengan V12
          const targetDir = path.join(resolvedBase, workflow.id);
          await fs.mkdir(targetDir, { recursive: true });
          if (stage && stage.output) {
            const mdName = `${stage.index + 1}_${stage.id}.md`;
            await fs.writeFile(path.join(targetDir, mdName), stage.output + '\n', 'utf8');
          }
          await fs.writeFile(
            path.join(targetDir, 'workflow.json'),
            JSON.stringify(workflow, null, 2) + '\n',
            'utf8'
          );
          workflow.exportedDir = targetDir;
        }
      } catch {
        /* biarkan tersimpan aman di dataDir lokal bila folder eksternal belum tersedia */
      }
    }
  }

  // [Diubah oleh Gemini - 2026-11-20] Panggil Gemini REST API & laporkan usageMetadata ke onGeminiUsage untuk kalkulasi biaya token V13
  async function callGeminiDraft(promptText, taskTitle = 'Video Short Draft') {
    if (!secrets.geminiApiKey || typeof fetchImpl !== 'function') {
      return { ok: false, reason: 'no_api_key' };
    }
    const model = state.config.geminiModel || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    try {
      const resp = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': secrets.geminiApiKey
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: promptText }]
            }
          ],
          generationConfig: {
            temperature: 0.65,
            maxOutputTokens: 1200
          }
        }),
        signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined
      });
      if (!resp.ok) {
        return { ok: false, reason: `gemini_http_${resp.status}` };
      }
      const data = await resp.json();
      if (data?.usageMetadata && typeof onGeminiUsage === 'function') {
        try {
          await onGeminiUsage({
            provider: 'gemini',
            model,
            usageMetadata: data.usageMetadata,
            agent: 'gemini-api',
            task: cleanText(taskTitle, 90)
          });
        } catch {
          /* abaikan kegagalan pencatatan usage agar alur kerja tidak terputus */
        }
      }
      const text = data?.candidates?.[0]?.content?.parts
        ?.map(p => p?.text || '')
        .join('\n')
        .trim();
      if (!text) {
        return { ok: false, reason: 'empty_candidates' };
      }
      return { ok: true, text, model, usageMetadata: data?.usageMetadata || null };
    } catch (err) {
      return { ok: false, reason: cleanText(err?.message || 'network_error', 80) };
    }
  }

  async function createWorkflow(rawPayload) {
    assertSafeObject(rawPayload);
    const title = cleanText(rawPayload.title || rawPayload.topic, 140);
    const topic = cleanText(rawPayload.topic || rawPayload.title || rawPayload.brief, 300);
    if (!title && !topic) {
      throw httpError(400, 'missing_title_or_topic', 'Judul atau topik Video Short wajib diisi');
    }
    const channel = cleanText(rawPayload.channel || state.config.defaultChannel || 'MainChannel', 80);
    const rawMode = String(rawPayload.mode || 'auto').trim().toLowerCase();
    const mode = VALID_MODES.has(rawMode) ? rawMode : 'auto';
    const stamp = nowIso();
    const id = 'swf_' + crypto.randomBytes(6).toString('hex');

    if (state.config.localProjectDir && !lastWorkspaceScan) {
      await scanWorkspace().catch(() => {});
    }
    const wsCtx = resolveWorkspaceContext(lastWorkspaceScan, channel);

    const stages = SHORT_STAGES.map((st, idx) => ({
      index: idx,
      id: st.id,
      label: st.label,
      persona: st.persona,
      roleName: st.roleName,
      hitlGate: st.hitlGate,
      status: idx === 0 ? 'ready' : 'pending',
      output: '',
      prompt: '',
      feedback: '',
      engineUsed: null,
      rulesApplied: wsCtx.rulesApplied,
      revisionCount: 0,
      updatedAt: null
    }));

    const workflow = {
      id,
      title: title || topic.slice(0, 80),
      topic: topic || title,
      channel,
      mode,
      autoApprove: false,
      status: 'active',
      currentStageIndex: 0,
      currentStageId: SHORT_STAGES[0].id,
      currentPersona: SHORT_STAGES[0].persona,
      rulesApplied: wsCtx.rulesApplied,
      workspaceChannelMatched: wsCtx.channelMatched,
      createdAt: stamp,
      updatedAt: stamp,
      exportedDir: null,
      stages
    };

    state.workflows.unshift(workflow);
    const act = recordAction({
      type: 'workflow_created',
      workflowId: workflow.id,
      stageId: 'brief',
      persona: 'project-shepherd',
      message: `Alur Short "${workflow.title}" dibuat untuk kanal ${workflow.channel}`
    });
    await saveWorkflowArtifacts(workflow, null);
    await queueSaveStore();

    emitSafe({ type: 'workflow_update', workflow, action: act });
    return { ok: true, workflow, action: act };
  }

  function findWorkflowOrThrow(id) {
    const cleanId = cleanText(id, 64);
    const wf = state.workflows.find(w => w.id === cleanId);
    if (!wf) {
      throw httpError(404, 'workflow_not_found', 'Alur kerja Video Short tidak ditemukan');
    }
    return wf;
  }

  async function runStep(id, rawPayload = {}) {
    if (rawPayload !== undefined && rawPayload !== null) {
      assertSafeObject(rawPayload);
    }
    const wf = findWorkflowOrThrow(id);
    if (wf.status === 'completed') {
      throw httpError(409, 'workflow_already_completed', 'Alur kerja sudah selesai sepenuhnya');
    }

    const stage = wf.stages[wf.currentStageIndex];
    if (!stage) {
      throw httpError(400, 'invalid_stage_index', 'Tahap alur kerja tidak valid');
    }

    // Gerbang HITL ketat: jika tahap sedang menunggu persetujuan Bos, tolak step sampai di-approve atau di-reject
    if (wf.status === 'awaiting_approval' && stage.status === 'awaiting_approval' && !rawPayload.rerun) {
      throw httpError(
        409,
        'hitl_approval_required',
        `Tahap "${stage.label}" memerlukan persetujuan HITL (Approve atau Reject) sebelum melanjutkan`
      );
    }

    if (state.config.localProjectDir) {
      await scanWorkspace().catch(() => {});
    }
    const wsCtx = resolveWorkspaceContext(lastWorkspaceScan, wf.channel);

    stage.status = 'working';
    wf.updatedAt = nowIso();
    const startAct = recordAction({
      type: 'stage_working',
      workflowId: wf.id,
      stageId: stage.id,
      persona: stage.persona,
      message: `${stage.roleName} sedang mengerjakan tahap ${stage.label}`
    });
    emitSafe({ type: 'workflow_update', workflow: wf, action: startAct });

    const prevOutputs = {};
    for (const st of wf.stages) {
      if (st.output) prevOutputs[st.id] = st.output;
    }

    const promptText = buildStagePrompt(wf, stage, prevOutputs, wsCtx);
    stage.prompt = promptText;
    stage.rulesApplied = wsCtx.rulesApplied;
    wf.rulesApplied = wsCtx.rulesApplied;
    wf.workspaceChannelMatched = wsCtx.channelMatched;

    const useGemini =
      (wf.mode === 'gemini' || (wf.mode === 'auto' && Boolean(secrets.geminiApiKey))) &&
      wf.mode !== 'local';

    let outputText = '';
    let engineUsed = 'local_template';
    if (useGemini) {
      const gemRes = await callGeminiDraft(promptText, wf.title);
      if (gemRes.ok) {
        outputText = gemRes.text;
        engineUsed = `gemini:${gemRes.model}`;
      } else {
        outputText = buildLocalStructuredDraft(wf, stage, prevOutputs, wsCtx);
        engineUsed = `local_fallback (${gemRes.reason})`;
      }
    } else {
      outputText = buildLocalStructuredDraft(wf, stage, prevOutputs, wsCtx);
      engineUsed = 'local_workspace';
    }

    stage.output = outputText;
    stage.engineUsed = engineUsed;
    stage.updatedAt = nowIso();
    wf.updatedAt = stage.updatedAt;

    let finishAct;
    if (stage.hitlGate) {
      // Berhenti di gerbang HITL (autoApprove selalu false!)
      stage.status = 'awaiting_approval';
      wf.status = 'awaiting_approval';
      finishAct = recordAction({
        type: 'hitl_gate_paused',
        workflowId: wf.id,
        stageId: stage.id,
        persona: stage.persona,
        message: `Gerbang HITL: "${stage.label}" selesai disusun oleh ${stage.roleName}, menunggu persetujuan Bos`
      });
    } else {
      stage.status = 'done';
      if (wf.currentStageIndex + 1 < wf.stages.length) {
        wf.currentStageIndex += 1;
        const nextStage = wf.stages[wf.currentStageIndex];
        if (nextStage.status === 'pending') nextStage.status = 'ready';
        wf.currentStageId = nextStage.id;
        wf.currentPersona = nextStage.persona;
        wf.status = 'active';
      } else {
        wf.status = 'completed';
      }
      finishAct = recordAction({
        type: 'stage_completed',
        workflowId: wf.id,
        stageId: stage.id,
        nextStageId: wf.currentStageId,
        persona: stage.persona,
        message: `${stage.roleName} menyelesaikan "${stage.label}" -> lanjut ke ${wf.currentStageId}`
      });
    }

    await saveWorkflowArtifacts(wf, stage);
    await queueSaveStore();

    emitSafe({ type: 'workflow_update', workflow: wf, action: finishAct });
    return { ok: true, workflow: wf, stage, action: finishAct };
  }

  async function approveStage(id, rawPayload = {}) {
    if (rawPayload !== undefined && rawPayload !== null) {
      assertSafeObject(rawPayload);
    }
    const wf = findWorkflowOrThrow(id);
    const stage = wf.stages[wf.currentStageIndex];
    if (!stage) {
      throw httpError(400, 'invalid_stage_index', 'Tahap tidak ditemukan');
    }
    if (wf.status !== 'awaiting_approval' && stage.status !== 'awaiting_approval') {
      throw httpError(409, 'not_awaiting_approval', 'Tahap saat ini tidak sedang menunggu persetujuan HITL');
    }

    const stamp = nowIso();
    stage.status = 'done';
    stage.approvedAt = stamp;
    if (rawPayload.note) {
      stage.approvalNote = cleanText(rawPayload.note, 240);
    }
    wf.updatedAt = stamp;

    let act;
    if (wf.currentStageIndex + 1 < wf.stages.length) {
      wf.currentStageIndex += 1;
      const nextStage = wf.stages[wf.currentStageIndex];
      if (nextStage.status === 'pending') nextStage.status = 'ready';
      wf.currentStageId = nextStage.id;
      wf.currentPersona = nextStage.persona;
      wf.status = 'active';
      act = recordAction({
        type: 'hitl_approved',
        workflowId: wf.id,
        stageId: stage.id,
        nextStageId: nextStage.id,
        persona: stage.persona,
        message: `Bos menyetujui "${stage.label}" -> didelegasikan ke ${nextStage.roleName}`
      });
    } else {
      wf.status = 'completed';
      wf.readyToPublish = true;
      wf.autoUploaded = false;
      act = recordAction({
        type: 'workflow_completed',
        workflowId: wf.id,
        stageId: stage.id,
        persona: stage.persona,
        message: `Bos menyetujui QA akhir "${wf.title}" — Paket siap dipublikasikan secara manual (tanpa auto-upload)`
      });
    }

    await saveWorkflowArtifacts(wf, stage);
    await queueSaveStore();

    emitSafe({ type: 'workflow_update', workflow: wf, action: act });
    return { ok: true, workflow: wf, stage, action: act };
  }

  async function rejectStage(id, rawPayload = {}) {
    assertSafeObject(rawPayload);
    const wf = findWorkflowOrThrow(id);
    const stage = wf.stages[wf.currentStageIndex];
    if (!stage) {
      throw httpError(400, 'invalid_stage_index', 'Tahap tidak ditemukan');
    }
    if (
      wf.status !== 'awaiting_approval' &&
      stage.status !== 'awaiting_approval' &&
      wf.status !== 'revision_requested'
    ) {
      throw httpError(409, 'not_awaiting_approval', 'Hanya tahap di gerbang HITL yang dapat diminta revisi');
    }

    const feedback = cleanText(
      rawPayload.feedback || rawPayload.note || rawPayload.reason || 'Perjelas detail & pertajam hook',
      300
    );
    const stamp = nowIso();
    stage.feedback = feedback;
    stage.revisionCount = (Number(stage.revisionCount) || 0) + 1;
    stage.status = 'revision';
    stage.updatedAt = stamp;
    wf.status = 'revision_requested';
    wf.updatedAt = stamp;

    const act = recordAction({
      type: 'hitl_rejected',
      workflowId: wf.id,
      stageId: stage.id,
      persona: stage.persona,
      feedback,
      message: `Bos meminta revisi pada "${stage.label}": "${feedback}"`
    });

    await saveWorkflowArtifacts(wf, stage);
    await queueSaveStore();

    emitSafe({ type: 'workflow_update', workflow: wf, action: act });
    return { ok: true, workflow: wf, stage, action: act };
  }

  async function deleteWorkflow(id) {
    const cleanId = cleanText(id, 64);
    const idx = state.workflows.findIndex(w => w.id === cleanId);
    if (idx === -1) {
      throw httpError(404, 'workflow_not_found', 'Alur kerja tidak ditemukan');
    }
    const [removed] = state.workflows.splice(idx, 1);
    const act = recordAction({
      type: 'workflow_deleted',
      workflowId: removed.id,
      persona: 'project-shepherd',
      message: `Alur kerja "${removed.title}" dihapus`
    });
    await queueSaveStore();
    emitSafe({ type: 'workflow_deleted', deletedId: removed.id, action: act });
    return { ok: true, deletedId: removed.id, action: act };
  }

  async function stop() {
    await writeQueue;
  }

  return {
    // V15 [Diubah oleh Gemini - 2026-11-21] API lama tetap tersedia + teruskan workspaceDiscovery ke short_pipeline
    createPipeline: options => require('./short_pipeline').createShortPipeline({
      ...options, dataDir, getProjectDir: () => getPublicConfig().localProjectDir
    }),
    SHORT_STAGES,
    getConfig: getPublicConfig,
    getInternalGeminiConfig,
    updateConfig,
    scanWorkspace,
    listWorkflows,
    createWorkflow,
    runStep,
    approveStage,
    rejectStage,
    deleteWorkflow,
    stop
  };
}

module.exports = {
  createShortWorkflowStore,
  SHORT_STAGES
};
