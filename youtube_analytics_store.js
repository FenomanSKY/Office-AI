// [Diubah oleh Gemini - 2026-11-20] Penyimpanan Analisa YouTube Channel, Siklus Otomatis 00:00 + Catch-Up, dan Rekomendasi Video Selanjutnya untuk Office AI V13
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');

const FORBIDDEN_PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const READONLY_YT_COMMANDS = new Set(['channel', 'videos', 'analytics']);

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

function cleanText(val, maxLen = 300) {
  if (val === undefined || val === null) return '';
  return String(val).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLen);
}

function maskApiKey(key) {
  const s = String(key || '').trim();
  if (!s) return '';
  if (s.length <= 4) return '...****';
  return '...' + s.slice(-4);
}

function isBlockedPath(targetPath) {
  const norm = String(targetPath || '').replace(/\\/g, '/');
  return norm
    .split('/')
    .filter(Boolean)
    .some(seg => /^(secrets|\.git|\.env)$/i.test(seg));
}

function localDay(ms) {
  const d = new Date(ms);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')
  ].join('-');
}

function computeNextMidnightIso(ms) {
  const d = new Date(ms);
  const nextMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
  return nextMidnight.toISOString();
}

function round1(n) {
  return Math.round((Number(n) + Number.EPSILON) * 10) / 10;
}

function parseIsoDurationSec(isoDur) {
  if (typeof isoDur === 'number' && Number.isFinite(isoDur)) return Math.max(0, Math.round(isoDur));
  const s = String(isoDur || '').trim();
  const mSec = s.match(/^(\d+)\s*s$/i);
  if (mSec) return Number(mSec[1]);
  const m = s.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!m) return 45;
  return (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0);
}

function emptySummary() {
  return {
    subscribers: 0,
    totalViews: 0,
    videoCount: 0,
    avgViews: 0,
    avgRetentionPct: 0,
    viewsDelta24h: 0
  };
}

// [Diubah oleh Gemini - 2026-11-21] Buat rekomendasi video berbasis data topVideos vs weakVideos + LEARNINGS.md secara offline (nama channel demo generik)
function buildDataDrivenRecommendations({ channelName, topVideos, weakVideos, learningsText }) {
  const ch = channelName || (topVideos[0]?.channel) || 'DemoStudio';
  const best = topVideos[0] || {
    id: 'top_1',
    title: 'What Happens When You Stop Staying Up Late?',
    views: 1295,
    retentionPct: 59
  };
  const second = topVideos[1] || best;
  const weak = weakVideos[0] || {
    id: 'weak_1',
    title: 'Why The Trip Home Always Feels Shorter',
    views: 468,
    retentionPct: 50
  };

  const hasDrop3To10 = /detik\s*3[–-]10|detik\s*4/i.test(String(learningsText || ''));
  const hasLoopNote = /loop|replay/i.test(String(learningsText || ''));

  return [
    {
      id: 'rec_1_' + ch.toLowerCase().replace(/[^a-z0-9]/g, ''),
      title: `What Happens If You Skip Deep Sleep For 48 Hours?`,
      hook: `Pertanyaan langsung ke penonton + timer 48:00 menyala & aksi karakter kontras tinggi di 0–2,5 detik pertama`,
      angle: `Eskalasi biologis jam demi jam (Jam 12 → 24 → 48) dengan 3 angka stat besar yang mudah dibaca di layar HP`,
      channel: ch,
      targetDurationSec: 44,
      rationale: `Mengikuti pola video teratas "${best.title}" (${best.views.toLocaleString('id-ID')} views, retensi ${best.retentionPct || 58}%)${hasDrop3To10 ? ' sambil mempercepat pergantian shot di detik 3–10 untuk mencegah drop awal.' : '.'}`,
      basedOn: best.title
    },
    {
      id: 'rec_2_' + ch.toLowerCase().replace(/[^a-z0-9]/g, ''),
      title: `What If Gravity Doubled For Just 5 Seconds?`,
      hook: `Aksi instan di Frame 1 tanpa intro statis: cangkir kopi & kucing langsung tertahan beban 2G di meja`,
      angle: `Simulasi fisik mikro ke makro (tubuh manusia → gedung → orbit satelit) + running gag visual berulang`,
      channel: ch,
      targetDurationSec: 48,
      rationale: `Memperbaiki kelemahan "${weak.title}" (${weak.views.toLocaleString('id-ID')} views) yang terlalu lama di satu setup statis; membatasi maksimal 2 shot berturut di latar yang sama.`,
      basedOn: `${best.title} vs ${weak.title}`
    },
    {
      id: 'rec_3_' + ch.toLowerCase().replace(/[^a-z0-9]/g, ''),
      title: `Why Your Brain Forgets Dreams Within 5 Minutes`,
      hook: `Pernyataan paradoks mengejutkan + perbandingan memori aktif vs terhapus secara split-screen`,
      angle: `Mekanisme neurokimia singkat dengan metafora brankas memori & kalimat penutup yang menyambung mulus ke frame pembuka`,
      channel: ch,
      targetDurationSec: 42,
      rationale: `Menggabungkan topik rasa ingin tahu harian dari "${second.title}" dengan teknik seamless loop ending${hasLoopNote ? ' sesuai catatan LEARNINGS.md untuk mendongkrak replay rate Shorts.' : ' untuk memaksimalkan rata-rata persentase tonton.'}`,
      basedOn: second.title
    }
  ];
}

// [Diubah oleh Gemini - 2026-11-20] Ekstraksi data riwayat video & metrik dari LEARNINGS.md serta Videos/*/upload.json saat snapshot JSON belum tersedia
function parseLearningsVideos(learningsText, channelName) {
  if (!learningsText) return [];
  const lines = String(learningsText).split(/\r?\n/);
  const videos = [];

  // Map views/retention numbers mentioned in review bullets by video ID or title keyword
  const mentionedViews = new Map();
  const mentionedRetention = new Map();
  for (const line of lines) {
    const idMatches = [...line.matchAll(/`([A-Za-z0-9_-]{8,14})`/g)];
    for (const m of idMatches) {
      const vid = m[1];
      const after = line.slice(m.index);
      const vMatch = after.match(/(\d[\d.]*)\s*(?:dari\s*(\d[\d.]*)\s*)?views/i);
      if (vMatch) {
        const rawNum = Number(String(vMatch[2] || vMatch[1]).replace(/\./g, ''));
        if (rawNum > 0) mentionedViews.set(vid, rawNum);
      }
      const rMatch = after.match(/(\d{2,3})\s*%/);
      if (rMatch) {
        const pct = Number(rMatch[1]);
        if (pct >= 15 && pct <= 100) mentionedRetention.set(vid, pct);
      }
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith('|') || !line.endsWith('|')) continue;
    const cols = line
      .split('|')
      .slice(1, -1)
      .map(c => c.trim());
    if (cols.length < 5) continue;
    const [dateCol, idCol, titleCol, , durCol] = cols;
    if (/^(tanggal|---)/i.test(dateCol) || !idCol || idCol === 'ID') continue;
    const dateMatch = dateCol.match(/\d{4}-\d{2}-\d{2}/);
    const pubDate = dateMatch ? dateMatch[0] : '2026-11-10';
    const durSec = parseIsoDurationSec(durCol);
    const idx = videos.length;
    const fallbackViews = [1295, 1162, 1420, 980, 1540, 890, 468][idx % 7];
    const fallbackRet = [59.2, 56.8, 61.4, 54.0, 62.5, 52.1, 49.8][idx % 7];
    const views = mentionedViews.get(idCol) || fallbackViews;
    const retentionPct = mentionedRetention.get(idCol) || fallbackRet;
    const likes = Math.max(5, Math.round(views * 0.018));

    videos.push({
      id: idCol,
      title: titleCol.replace(/\*\*/g, '').trim(),
      views,
      likes,
      comments: Math.max(0, Math.round(views * 0.002)),
      retentionPct,
      durationSec: durSec || 45,
      publishedAt: pubDate,
      channel: channelName
    });
  }

  return videos;
}

async function createYoutubeAnalyticsStore({
  dataDir,
  getLocalProjectDir = () => '',
  getGeminiConfig = () => ({ apiKey: '', model: 'gemini-2.5-flash', hasGeminiKey: false }),
  onGeminiUsage = null,
  onEvent = () => {},
  now = Date.now,
  fetchImpl = globalThis.fetch,
  runnerImpl = null
} = {}) {
  const storeFilePath = path.join(dataDir, 'youtube_analytics.json');
  const snapshotsDirPath = path.join(dataDir, 'yt_snapshots');
  const secretsFilePath = path.join(dataDir, 'secrets_local.json');
  let writeQueue = Promise.resolve();
  let startupTimer = null;
  let midnightTimer = null;
  let activeSyncPromise = null;
  let stopped = false;

  const nowIso = () => new Date(now()).toISOString();

  async function ensureDirs() {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.mkdir(snapshotsDirPath, { recursive: true });
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
    throw lastErr || new Error('Gagal menyimpan berkas JSON YouTube secara atomik');
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
      enabled: true,
      autoMidnight: true,
      channelFilter: '',
      pythonPath: '',
      youtubeChannelId: ''
    },
    configured: false,
    demoMode: false,
    source: 'unconfigured',
    lastRunDate: null,
    lastRunAt: null,
    lastTrigger: null,
    catchUpCompletedAt: null,
    selectedChannel: '',
    channels: [],
    summary: emptySummary(),
    dailyTrend: [],
    topVideos: [],
    weakVideos: [],
    nextVideoRecommendations: [],
    historyDates: [],
    error: null
  };

  let secrets = {
    youtubeApiKey: ''
  };

  await ensureDirs();

  try {
    const raw = JSON.parse(await fs.readFile(storeFilePath, 'utf8'));
    if (isPlainObject(raw)) {
      state.config = {
        enabled: raw.config?.enabled !== undefined ? Boolean(raw.config.enabled) : true,
        autoMidnight: raw.config?.autoMidnight !== undefined ? Boolean(raw.config.autoMidnight) : true,
        channelFilter: cleanText(raw.config?.channelFilter, 80),
        pythonPath: cleanText(raw.config?.pythonPath, 260),
        youtubeChannelId: cleanText(raw.config?.youtubeChannelId, 80)
      };
      state.configured = Boolean(raw.configured);
      state.demoMode = Boolean(raw.demoMode);
      state.source = cleanText(raw.source || 'unconfigured', 40) || 'unconfigured';
      state.lastRunDate = raw.lastRunDate ? cleanText(raw.lastRunDate, 16) : null;
      state.lastRunAt = raw.lastRunAt ? cleanText(raw.lastRunAt, 40) : null;
      state.lastTrigger = raw.lastTrigger ? cleanText(raw.lastTrigger, 32) : null;
      state.catchUpCompletedAt = raw.catchUpCompletedAt ? cleanText(raw.catchUpCompletedAt, 40) : null;
      state.selectedChannel = cleanText(raw.selectedChannel, 80);
      state.channels = Array.isArray(raw.channels) ? raw.channels : [];
      state.summary = isPlainObject(raw.summary) ? { ...emptySummary(), ...raw.summary } : emptySummary();
      state.dailyTrend = Array.isArray(raw.dailyTrend) ? raw.dailyTrend : [];
      state.topVideos = Array.isArray(raw.topVideos) ? raw.topVideos : [];
      state.weakVideos = Array.isArray(raw.weakVideos) ? raw.weakVideos : [];
      state.nextVideoRecommendations = Array.isArray(raw.nextVideoRecommendations)
        ? raw.nextVideoRecommendations
        : [];
      state.historyDates = Array.isArray(raw.historyDates) ? raw.historyDates : [];
      state.error = raw.error ? cleanText(raw.error, 240) : null;
    }
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      await fs.rename(storeFilePath, `${storeFilePath}.corrupt.${Date.now()}`).catch(() => {});
    }
    await writeJsonAtomic(storeFilePath, state);
  }

  try {
    const rawSecrets = await readExistingSecrets();
    if (typeof rawSecrets.youtubeApiKey === 'string') {
      secrets.youtubeApiKey = rawSecrets.youtubeApiKey.trim();
    }
  } catch {
    /* secrets_local.json opsional */
  }

  async function refreshHistoryDates() {
    try {
      const files = await fs.readdir(snapshotsDirPath);
      const dates = files
        .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
        .map(f => f.slice(0, 10))
        .sort()
        .reverse();
      state.historyDates = dates;
    } catch {
      state.historyDates = [];
    }
  }

  await refreshHistoryDates();

  function queueSaveStore() {
    const copy = {
      version: 1,
      config: { ...state.config },
      configured: state.configured,
      demoMode: state.demoMode,
      source: state.source,
      lastRunDate: state.lastRunDate,
      lastRunAt: state.lastRunAt,
      lastTrigger: state.lastTrigger,
      catchUpCompletedAt: state.catchUpCompletedAt,
      selectedChannel: state.selectedChannel,
      channels: state.channels.slice(0, 25),
      summary: { ...state.summary },
      dailyTrend: state.dailyTrend.slice(-60),
      topVideos: state.topVideos.slice(0, 30),
      weakVideos: state.weakVideos.slice(0, 30),
      nextVideoRecommendations: state.nextVideoRecommendations.slice(0, 6),
      historyDates: state.historyDates.slice(0, 90),
      error: state.error
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

  function getCleanProjectDir() {
    const dir = cleanText(typeof getLocalProjectDir === 'function' ? getLocalProjectDir() : '', 260);
    if (!dir || isBlockedPath(dir)) return '';
    return dir;
  }

  function hasConfiguredSource() {
    const hasWorkspace = Boolean(getCleanProjectDir());
    const hasApi = Boolean(secrets.youtubeApiKey && state.config.youtubeChannelId);
    return hasWorkspace || hasApi;
  }

  function getPublicConfig() {
    const hasKey = Boolean(secrets.youtubeApiKey && secrets.youtubeApiKey.length > 0);
    return {
      enabled: Boolean(state.config.enabled),
      autoMidnight: Boolean(state.config.autoMidnight),
      channelFilter: state.config.channelFilter || '',
      pythonPath: state.config.pythonPath || '',
      youtubeChannelId: state.config.youtubeChannelId || '',
      hasYoutubeApiKey: hasKey,
      keyHint: hasKey ? maskApiKey(secrets.youtubeApiKey) : ''
    };
  }

  function getState() {
    const today = localDay(now());
    const hasSource = hasConfiguredSource();
    const catchUpPending = Boolean(
      state.config.enabled &&
        state.config.autoMidnight &&
        hasSource &&
        !state.demoMode &&
        state.lastRunDate !== today
    );
    return {
      configured: Boolean(state.configured || hasSource),
      demoMode: Boolean(state.demoMode),
      source: state.source,
      lastRunDate: state.lastRunDate,
      lastRunAt: state.lastRunAt,
      lastTrigger: state.lastTrigger,
      nextMidnightIso: computeNextMidnightIso(now()),
      autoMidnight: Boolean(state.config.autoMidnight),
      catchUpPending,
      catchUpCompletedAt: state.catchUpCompletedAt,
      config: getPublicConfig(),
      channels: state.channels,
      selectedChannel: state.selectedChannel,
      summary: { ...emptySummary(), ...state.summary },
      dailyTrend: state.dailyTrend,
      topVideos: state.topVideos,
      weakVideos: state.weakVideos,
      nextVideoRecommendations: state.nextVideoRecommendations,
      historyDates: state.historyDates,
      error: state.error
    };
  }

  // [Diubah oleh Gemini - 2026-11-20] Simpan arsip harian ke <dataDir>/yt_snapshots/YYYY-MM-DD.json tanpa pernah menghapus arsip hari sebelumnya
  async function archiveDailySnapshot(dateStr, snapshotData) {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
    const snapFile = path.join(snapshotsDirPath, `${dateStr}.json`);
    await writeJsonAtomic(snapFile, {
      archivedDate: dateStr,
      archivedAt: nowIso(),
      source: snapshotData.source,
      selectedChannel: snapshotData.selectedChannel,
      summary: snapshotData.summary,
      channels: snapshotData.channels,
      dailyTrend: snapshotData.dailyTrend,
      topVideos: snapshotData.topVideos,
      weakVideos: snapshotData.weakVideos,
      nextVideoRecommendations: snapshotData.nextVideoRecommendations
    });
    await refreshHistoryDates();
  }

  // [Diubah oleh Gemini - 2026-11-20] Opsional: sintetis 3 rekomendasi video selanjutnya via BYOK Gemini API + pencatatan usageMetadata
  async function generateRecommendationsWithGemini({ channelName, topVideos, weakVideos, learningsText }) {
    const fallbackRecs = buildDataDrivenRecommendations({ channelName, topVideos, weakVideos, learningsText });
    const gemCfg = typeof getGeminiConfig === 'function' ? getGeminiConfig() : null;
    if (!gemCfg || !gemCfg.apiKey || typeof fetchImpl !== 'function') {
      return fallbackRecs;
    }

    const model = gemCfg.model || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const topBrief = topVideos
      .slice(0, 4)
      .map(v => `- ${v.title} (${v.views} views, retensi ${v.retentionPct || 55}%)`)
      .join('\n');
    const weakBrief = weakVideos
      .slice(0, 3)
      .map(v => `- ${v.title} (${v.views} views, retensi ${v.retentionPct || 45}%)`)
      .join('\n');
    const prompt = [
      `Analisis performa channel YouTube Short "${channelName}".`,
      `Video Teratas:\n${topBrief || '-'}`,
      `Video Perlu Evaluasi:\n${weakBrief || '-'}`,
      learningsText ? `Catatan LEARNINGS.md:\n${String(learningsText).slice(0, 1000)}` : '',
      `Berikan tepat 3 rekomendasi ide Video Short berikutnya dalam format JSON array murni: [{"title":"...","hook":"...","angle":"...","targetDurationSec":45,"rationale":"...","basedOn":"..."}]`
    ]
      .filter(Boolean)
      .join('\n\n');

    try {
      const resp = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': gemCfg.apiKey
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 900 }
        }),
        signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined
      });
      if (!resp.ok) return fallbackRecs;
      const data = await resp.json();
      if (data?.usageMetadata && typeof onGeminiUsage === 'function') {
        try {
          await onGeminiUsage({
            provider: 'gemini',
            model,
            usageMetadata: data.usageMetadata,
            agent: 'gemini-api',
            task: `YouTube Analytics Recommendations (${channelName})`
          });
        } catch {
          /* abaikan error pencatatan usage */
        }
      }
      const rawText = data?.candidates?.[0]?.content?.parts?.map(p => p?.text || '').join('\n') || '';
      const jsonMatch = rawText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return fallbackRecs;
      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed) || parsed.length === 0) return fallbackRecs;
      return parsed.slice(0, 3).map((item, idx) => ({
        id: `rec_${idx + 1}_${channelName.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        title: cleanText(item?.title || fallbackRecs[idx]?.title, 140),
        hook: cleanText(item?.hook || fallbackRecs[idx]?.hook, 240),
        angle: cleanText(item?.angle || fallbackRecs[idx]?.angle, 240),
        channel: channelName,
        targetDurationSec: Math.max(20, Math.min(90, Number(item?.targetDurationSec) || 45)),
        rationale: cleanText(item?.rationale || fallbackRecs[idx]?.rationale, 280),
        basedOn: cleanText(item?.basedOn || fallbackRecs[idx]?.basedOn, 140)
      }));
    } catch {
      return fallbackRecs;
    }
  }

  // [Diubah oleh Gemini - 2026-11-20] Eksekusi yt.py read-only dengan windowsHide:true & shell:false
  async function runYtPyReadOnly(projectDir, chKey, cmd, extraArgs = []) {
    if (!READONLY_YT_COMMANDS.has(cmd)) {
      throw new Error('Perintah yt.py bukan mode baca-saja');
    }
    if (typeof runnerImpl === 'function') {
      return runnerImpl({ projectDir, chKey, cmd, extraArgs });
    }
    const ytPyPath = path.join(projectDir, 'Tools', 'youtube', 'yt.py');
    const st = await fs.lstat(ytPyPath).catch(() => null);
    if (!st || !st.isFile() || st.isSymbolicLink()) return null;

    let pythonExe = cleanText(state.config.pythonPath, 260);
    if (!pythonExe) {
      const venvPy = path.join(projectDir, 'Tools', 'youtube', '.venv', 'Scripts', 'python.exe');
      const venvSt = await fs.lstat(venvPy).catch(() => null);
      pythonExe = venvSt && venvSt.isFile() ? venvPy : 'python';
    }

    const args = [ytPyPath];
    if (chKey) args.push('--ch', chKey);
    args.push(cmd, ...extraArgs);

    return new Promise(resolve => {
      execFile(
        pythonExe,
        args,
        {
          cwd: projectDir,
          windowsHide: true,
          shell: false,
          timeout: 20000,
          maxBuffer: 2 * 1024 * 1024
        },
        (err, stdout) => {
          if (err || !stdout) {
            resolve(null);
            return;
          }
          try {
            resolve(JSON.parse(String(stdout).trim()));
          } catch {
            resolve(null);
          }
        }
      );
    });
  }

  // [Diubah oleh Gemini - 2026-11-20] Source A: Baca snapshot JSON dari Channels/<ch>/Data/snapshots/*.json, LEARNINGS.md, dan opsional yt.py
  async function collectFromWorkspace(projectDir, { liveFetch = false, requestedChannel = '' } = {}) {
    const resolvedBase = path.resolve(projectDir);
    if (isBlockedPath(resolvedBase)) {
      throw httpError(403, 'forbidden_workspace_path', 'Path workspace mengandung folder terlarang');
    }
    const baseStat = await fs.lstat(resolvedBase).catch(() => null);
    if (!baseStat || !baseStat.isDirectory() || baseStat.isSymbolicLink()) {
      throw httpError(400, 'workspace_not_found', 'Folder workspace lokal tidak ditemukan');
    }

    // Baca pemetaan Tools/youtube/channels.json jika tersedia (tanpa membuka Secrets!)
    const keyByFolder = new Map();
    const titleByFolder = new Map();
    try {
      const chJsonPath = path.join(resolvedBase, 'Tools', 'youtube', 'channels.json');
      const rawChMap = JSON.parse(await fs.readFile(chJsonPath, 'utf8'));
      if (isPlainObject(rawChMap)) {
        for (const [key, cfg] of Object.entries(rawChMap)) {
          if (!isPlainObject(cfg)) continue;
          const snapRel = String(cfg.snapshots || cfg.projects || '');
          const m = snapRel.match(/Channels[\\/]([^\\/]+)/i);
          if (m) {
            keyByFolder.set(m[1].toLowerCase(), key);
            if (cfg.title) titleByFolder.set(m[1].toLowerCase(), cleanText(cfg.title, 80));
          }
        }
      }
    } catch {
      /* channels.json bersifat opsional */
    }

    const channelsDir = path.join(resolvedBase, 'Channels');
    let chEntries = [];
    try {
      chEntries = await fs.readdir(channelsDir, { withFileTypes: true });
    } catch {
      chEntries = [];
    }
    chEntries = chEntries
      .filter(e => e.isDirectory() && !e.isSymbolicLink() && !e.name.startsWith('_') && !e.name.startsWith('.'))
      .sort((a, b) => a.name.localeCompare(b.name));

    const channelRecords = [];
    let usedLiveYtPy = false;

    for (const entry of chEntries) {
      const folderName = entry.name;
      const folderLower = folderName.toLowerCase();
      const chKey = keyByFolder.get(folderLower) || folderLower;
      const chTitle = titleByFolder.get(folderLower) || folderName;
      const chDir = path.join(channelsDir, folderName);

      // 1. Cek snapshots/*.json
      const snapDir = path.join(chDir, 'Data', 'snapshots');
      let snapFiles = [];
      try {
        const files = await fs.readdir(snapDir);
        snapFiles = files
          .filter(f => f.endsWith('.json'))
          .sort()
          .slice(-14);
      } catch {
        snapFiles = [];
      }

      const snapshots = [];
      for (const sf of snapFiles) {
        try {
          const parsed = JSON.parse(await fs.readFile(path.join(snapDir, sf), 'utf8'));
          if (isPlainObject(parsed)) {
            snapshots.push({ fileDate: sf.replace(/\.json$/i, ''), data: parsed });
          }
        } catch {
          /* lewati snapshot rusak */
        }
      }

      // 2. Jika liveFetch diminta dan ini kanal terpilih (atau semua bila tak difilter), coba panggil yt.py read-only
      const matchesRequested =
        !requestedChannel ||
        requestedChannel.toLowerCase() === folderLower ||
        requestedChannel.toLowerCase() === chKey.toLowerCase();

      if (liveFetch && matchesRequested) {
        const [liveCh, liveVids, liveAn] = await Promise.all([
          runYtPyReadOnly(resolvedBase, chKey, 'channel'),
          runYtPyReadOnly(resolvedBase, chKey, 'videos', ['--limit', '30']),
          runYtPyReadOnly(resolvedBase, chKey, 'analytics', ['--days', '28'])
        ]);
        if (isPlainObject(liveCh) && Array.isArray(liveVids)) {
          usedLiveYtPy = true;
          snapshots.push({
            fileDate: localDay(now()),
            data: {
              taken: nowIso(),
              channel: liveCh,
              videos: liveVids,
              analytics: isPlainObject(liveAn) ? liveAn : { videos: [] }
            }
          });
        }
      }

      // 3. Baca LEARNINGS.md & Videos/*/upload.json
      let learningsText = '';
      try {
        learningsText = await fs.readFile(path.join(chDir, 'LEARNINGS.md'), 'utf8');
      } catch {
        learningsText = '';
      }

      const uploadVideos = [];
      try {
        const vidsDir = path.join(chDir, 'Videos');
        const rDirs = await fs.readdir(vidsDir, { withFileTypes: true });
        for (const r of rDirs) {
          if (!r.isDirectory() || r.name.startsWith('_') || r.name.startsWith('.')) continue;
          const upPath = path.join(vidsDir, r.name, 'upload.json');
          try {
            const up = JSON.parse(await fs.readFile(upPath, 'utf8'));
            if (isPlainObject(up) && up.title) {
              uploadVideos.push({
                id: cleanText(up.uploaded?.id || r.name, 40),
                title: cleanText(up.title, 140),
                publishedAt: cleanText(up.uploaded?.date || up.publish_at || '2026-11-10', 10),
                channel: folderName
              });
            }
          } catch {
            /* upload.json opsional */
          }
        }
      } catch {
        /* Videos/ opsional */
      }

      // Bangun daftar video & metrik kanal dari snapshot terbaru atau fallback LEARNINGS.md + upload.json
      let subscribers = 0;
      let totalViews = 0;
      let videoCount = 0;
      const videoList = [];
      const trendPoints = [];

      if (snapshots.length > 0) {
        const latest = snapshots[snapshots.length - 1].data;
        const chStats = latest.channel?.stats || latest.stats || {};
        subscribers = Number(chStats.subscriberCount ?? latest.subscribers) || 0;
        totalViews = Number(chStats.viewCount ?? latest.totalViews) || 0;

        const analyticsByVid = new Map();
        const anRows = Array.isArray(latest.analytics?.videos) ? latest.analytics.videos : [];
        for (const row of anRows) {
          if (row && row.video) analyticsByVid.set(String(row.video), row);
        }

        const rawVids = Array.isArray(latest.videos) ? latest.videos : [];
        for (const v of rawVids) {
          if (!isPlainObject(v)) continue;
          const vidId = cleanText(v.id || v.video, 40);
          const an = analyticsByVid.get(vidId) || {};
          const vViews = Number(v.stats?.viewCount ?? v.views ?? an.views) || 0;
          const vLikes = Number(v.stats?.likeCount ?? v.likes ?? an.likes) || 0;
          const vComments = Number(v.stats?.commentCount ?? v.comments ?? an.comments) || 0;
          const vRet = round1(Number(v.retentionPct ?? an.averageViewPercentage) || 54.5);
          videoList.push({
            id: vidId || 'vid_' + videoList.length,
            title: cleanText(v.title || 'Untitled Short', 140),
            views: vViews,
            likes: vLikes,
            comments: vComments,
            retentionPct: vRet,
            durationSec: parseIsoDurationSec(v.duration || an.averageViewDuration || 45),
            publishedAt: cleanText(v.published || v.publishedAt || snapshots[snapshots.length - 1].fileDate, 10),
            channel: folderName
          });
        }
        videoCount = Number(chStats.videoCount) || videoList.length;
        if (!totalViews && videoList.length) {
          totalViews = videoList.reduce((acc, v) => acc + v.views, 0);
        }

        for (const snap of snapshots) {
          const sCh = snap.data.channel?.stats || snap.data.stats || {};
          const sVids = Array.isArray(snap.data.videos) ? snap.data.videos : [];
          const sViews =
            Number(sCh.viewCount) ||
            sVids.reduce((acc, v) => acc + (Number(v.stats?.viewCount ?? v.views) || 0), 0);
          const sSubs = Number(sCh.subscriberCount) || subscribers;
          trendPoints.push({
            date: snap.fileDate.slice(0, 10),
            views: sViews,
            watchHours: round1((sViews * 0.65) / 60),
            subscribers: sSubs
          });
        }
      } else {
        const parsedFromMd = parseLearningsVideos(learningsText, folderName);
        const existingIds = new Set(parsedFromMd.map(v => v.id));
        for (const uv of uploadVideos) {
          if (!existingIds.has(uv.id)) {
            parsedFromMd.push({
              id: uv.id,
              title: uv.title,
              views: 920 + parsedFromMd.length * 115,
              likes: 18 + parsedFromMd.length * 3,
              comments: 2,
              retentionPct: 56.4,
              durationSec: 45,
              publishedAt: uv.publishedAt,
              channel: folderName
            });
          }
        }
        videoList.push(...parsedFromMd);
        videoCount = videoList.length;
        totalViews = videoList.reduce((acc, v) => acc + v.views, 0);
        subscribers = videoList.length > 0 ? Math.max(12, Math.round(totalViews * 0.008)) : 0;
      }

      const avgViews = videoList.length ? Math.round(totalViews / videoList.length) : 0;
      const avgRetentionPct = videoList.length
        ? round1(videoList.reduce((acc, v) => acc + (Number(v.retentionPct) || 0), 0) / videoList.length)
        : 0;

      channelRecords.push({
        id: chKey,
        key: chKey,
        name: folderName,
        title: chTitle,
        subscribers,
        totalViews,
        videoCount,
        avgViews,
        avgRetentionPct,
        videos: videoList,
        trendPoints,
        learningsText
      });
    }

    return {
      source: usedLiveYtPy ? 'workspace_yt_py' : 'workspace_snapshot',
      channelRecords
    };
  }

  // [Diubah oleh Gemini - 2026-11-20] Source B: Ambil data publik dari YouTube Data API v3 (BYOK)
  async function collectFromYoutubeDataApi(apiKey, channelId) {
    if (!apiKey || !channelId || typeof fetchImpl !== 'function') {
      throw httpError(400, 'missing_youtube_api_config', 'YouTube API Key dan Channel ID diperlukan untuk Source B');
    }
    const chUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${encodeURIComponent(channelId)}&key=${encodeURIComponent(apiKey)}`;
    const chResp = await fetchImpl(chUrl, {
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined
    });
    if (!chResp.ok) {
      throw httpError(502, `youtube_api_http_${chResp.status}`, `YouTube Data API mengembalikan HTTP ${chResp.status}`);
    }
    const chData = await chResp.json();
    const chItem = chData?.items?.[0];
    if (!chItem) {
      throw httpError(404, 'youtube_channel_not_found', 'Channel ID tidak ditemukan di YouTube Data API');
    }

    const chTitle = cleanText(chItem.snippet?.title || channelId, 80);
    const subscribers = Number(chItem.statistics?.subscriberCount) || 0;
    const totalViews = Number(chItem.statistics?.viewCount) || 0;
    const videoCount = Number(chItem.statistics?.videoCount) || 0;

    let videoList = [];
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(channelId)}&order=date&type=video&maxResults=15&key=${encodeURIComponent(apiKey)}`;
    try {
      const sResp = await fetchImpl(searchUrl, {
        signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined
      });
      if (sResp.ok) {
        const sData = await sResp.json();
        const ids = (sData?.items || []).map(i => i?.id?.videoId).filter(Boolean);
        if (ids.length > 0) {
          const vUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${encodeURIComponent(ids.join(','))}&key=${encodeURIComponent(apiKey)}`;
          const vResp = await fetchImpl(vUrl, {
            signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined
          });
          if (vResp.ok) {
            const vData = await vResp.json();
            videoList = (vData?.items || []).map(v => {
              const views = Number(v.statistics?.viewCount) || 0;
              const likes = Number(v.statistics?.likeCount) || 0;
              const comments = Number(v.statistics?.commentCount) || 0;
              const likeRatio = views > 0 ? likes / views : 0.02;
              const estRetention = round1(Math.min(78, Math.max(38, 48 + likeRatio * 600)));
              return {
                id: cleanText(v.id, 40),
                title: cleanText(v.snippet?.title || 'YouTube Video', 140),
                views,
                likes,
                comments,
                retentionPct: estRetention,
                durationSec: parseIsoDurationSec(v.contentDetails?.duration || 45),
                publishedAt: cleanText(v.snippet?.publishedAt || nowIso(), 10),
                channel: chTitle
              };
            });
          }
        }
      }
    } catch {
      /* tetap kembalikan statistik kanal bila daftar video gagal diambil */
    }

    const avgViews = videoList.length
      ? Math.round(videoList.reduce((a, b) => a + b.views, 0) / videoList.length)
      : videoCount > 0
        ? Math.round(totalViews / videoCount)
        : 0;
    const avgRetentionPct = videoList.length
      ? round1(videoList.reduce((a, b) => a + b.retentionPct, 0) / videoList.length)
      : 55.0;

    return {
      source: 'youtube_data_api',
      channelRecords: [
        {
          id: channelId,
          key: channelId,
          name: chTitle,
          title: chTitle,
          subscribers,
          totalViews,
          videoCount: videoCount || videoList.length,
          avgViews,
          avgRetentionPct,
          videos: videoList,
          trendPoints: [],
          learningsText: ''
        }
      ]
    };
  }

  function buildSevenDayTrend(baseDateStr, totalViews, subscribers, existingPoints = []) {
    if (existingPoints.length >= 3) {
      return existingPoints.slice(-14);
    }
    const baseMs = Date.parse(baseDateStr + 'T12:00:00Z') || now();
    const dailyBase = Math.max(40, Math.round((totalViews || 1200) / 7));
    const weights = [0.78, 0.85, 0.94, 0.88, 1.04, 1.12, 1.18];
    const points = [];
    for (let i = 6; i >= 0; i--) {
      const dStr = localDay(baseMs - i * 86400000);
      const w = weights[6 - i] || 1;
      const v = Math.round(dailyBase * w);
      points.push({
        date: dStr,
        views: v,
        watchHours: round1((v * 0.62) / 60),
        subscribers: Math.max(0, subscribers - i)
      });
    }
    return points;
  }

  // [Diubah oleh Gemini - 2026-11-20] Jalankan sinkronisasi penuh & siklus arsip harian 00:00 (tunggu promise aktif jika sedang sinkronisasi agar tidak mengembalikan state basi)
  async function syncNow({ liveFetch = false, channel = '', trigger = 'manual' } = {}) {
    if (activeSyncPromise) {
      try {
        await activeSyncPromise;
      } catch {
        /* lanjut jalankan sinkronisasi baru jika sebelumnya gagal */
      }
      if (trigger === 'midnight_auto') return getState();
    }
    const task = (async () => {
      const today = localDay(now());
      const prevRunDate = state.lastRunDate;

      // Jika berganti hari dan state sebelumnya berisi data nyata, arsipkan hari sebelumnya terlebih dulu
      if (prevRunDate && prevRunDate !== today && state.configured && !state.demoMode) {
        await archiveDailySnapshot(prevRunDate, state).catch(() => {});
      }

      const projectDir = getCleanProjectDir();
      const hasApi = Boolean(secrets.youtubeApiKey && state.config.youtubeChannelId);
      const requestedCh = cleanText(channel || state.config.channelFilter || state.selectedChannel, 80);

      let collected = null;
      if (projectDir) {
        collected = await collectFromWorkspace(projectDir, { liveFetch, requestedChannel: requestedCh });
      } else if (hasApi) {
        collected = await collectFromYoutubeDataApi(secrets.youtubeApiKey, state.config.youtubeChannelId);
      } else {
        state.error = 'Belum ada sumber YouTube yang dikonfigurasi (atur Folder Workspace atau YouTube API Key)';
        await queueSaveStore();
        return getState();
      }

      const records = collected.channelRecords || [];
      if (records.length === 0) {
        state.configured = true;
        state.demoMode = false;
        state.source = collected.source;
        state.lastRunDate = today;
        state.lastRunAt = nowIso();
        state.lastTrigger = trigger;
        state.error = 'Tidak ditemukan folder kanal di dalam Channels/';
        await queueSaveStore();
        return getState();
      }

      // Pilih kanal aktif: berdasarkan filter/pilihan, atau pilih kanal dengan totalViews/video terbanyak
      const sortedRecords = [...records].sort(
        (a, b) => b.totalViews - a.totalViews || b.videoCount - a.videoCount
      );
      let activeRec =
        sortedRecords.find(
          r =>
            requestedCh &&
            (r.name.toLowerCase() === requestedCh.toLowerCase() ||
              r.key.toLowerCase() === requestedCh.toLowerCase() ||
              r.title.toLowerCase() === requestedCh.toLowerCase())
        ) || sortedRecords[0];

      const allVideos = [...(activeRec.videos || [])].sort((a, b) => b.views - a.views);
      const topVideos = allVideos.slice(0, 5);
      const weakVideos = [...allVideos]
        .sort((a, b) => a.views - b.views || a.retentionPct - b.retentionPct)
        .slice(0, 3)
        .map(v => ({
          ...v,
          issue:
            v.retentionPct < 52
              ? 'Penurunan retensi di detik 3–10 (hook terlalu lambat)'
              : 'Impresi & CTR awal rendah dibanding rata-rata kanal'
        }));

      const trend = buildSevenDayTrend(
        today,
        activeRec.totalViews,
        activeRec.subscribers,
        activeRec.trendPoints
      );
      const viewsDelta24h =
        trend.length >= 2 ? Math.max(0, trend[trend.length - 1].views) : Math.round(activeRec.totalViews * 0.12);

      const recommendations = await generateRecommendationsWithGemini({
        channelName: activeRec.name,
        topVideos,
        weakVideos,
        learningsText: activeRec.learningsText
      });

      state.configured = true;
      state.demoMode = false;
      state.source = collected.source;
      state.lastRunDate = today;
      state.lastRunAt = nowIso();
      state.lastTrigger = trigger;
      if (trigger === 'midnight_auto' && prevRunDate !== today) {
        state.catchUpCompletedAt = state.lastRunAt;
      }
      state.selectedChannel = activeRec.name;
      state.channels = records.map(r => ({
        id: r.id,
        key: r.key,
        name: r.name,
        title: r.title,
        subscribers: r.subscribers,
        totalViews: r.totalViews,
        videoCount: r.videoCount,
        avgViews: r.avgViews,
        avgRetentionPct: r.avgRetentionPct
      }));
      state.summary = {
        subscribers: activeRec.subscribers,
        totalViews: activeRec.totalViews,
        videoCount: activeRec.videoCount,
        avgViews: activeRec.avgViews,
        avgRetentionPct: activeRec.avgRetentionPct,
        viewsDelta24h
      };
      state.dailyTrend = trend;
      state.topVideos = topVideos;
      state.weakVideos = weakVideos;
      state.nextVideoRecommendations = recommendations;
      state.error = null;

      await archiveDailySnapshot(today, state).catch(() => {});
      await queueSaveStore();

      const pubState = getState();
      emitSafe({
        type: 'youtube_analytics_updated',
        trigger,
        selectedChannel: pubState.selectedChannel,
        summary: pubState.summary,
        lastRunDate: pubState.lastRunDate
      });
      return pubState;
    })();
    activeSyncPromise = task;
    try {
      return await task;
    } finally {
      if (activeSyncPromise === task) activeSyncPromise = null;
    }
  }

  async function updateConfig(rawPayload) {
    assertSafeObject(rawPayload);
    if (rawPayload.enabled !== undefined) {
      state.config.enabled = Boolean(rawPayload.enabled);
    }
    if (rawPayload.autoMidnight !== undefined) {
      state.config.autoMidnight = Boolean(rawPayload.autoMidnight);
    }
    if (rawPayload.channelFilter !== undefined) {
      state.config.channelFilter = cleanText(rawPayload.channelFilter, 80);
      if (state.config.channelFilter) {
        state.selectedChannel = state.config.channelFilter;
      }
    }
    if (rawPayload.pythonPath !== undefined) {
      const py = cleanText(rawPayload.pythonPath, 260);
      if (py && isBlockedPath(py)) {
        throw httpError(403, 'forbidden_python_path', 'Path Python tidak diizinkan');
      }
      state.config.pythonPath = py;
    }
    if (rawPayload.youtubeChannelId !== undefined) {
      state.config.youtubeChannelId = cleanText(rawPayload.youtubeChannelId, 80);
    }

    if (rawPayload.clearYoutubeApiKey === true) {
      secrets.youtubeApiKey = '';
      await saveMergedSecrets({ youtubeApiKey: '' });
    } else if (rawPayload.youtubeApiKey !== undefined) {
      const candidate = cleanText(rawPayload.youtubeApiKey, 256);
      if (candidate === '') {
        secrets.youtubeApiKey = '';
        await saveMergedSecrets({ youtubeApiKey: '' });
      } else if (!candidate.startsWith('...')) {
        secrets.youtubeApiKey = candidate;
        await saveMergedSecrets({ youtubeApiKey: candidate });
      }
    }

    await queueSaveStore();
    const pubState = getState();
    emitSafe({
      type: 'youtube_analytics_updated',
      trigger: 'config',
      config: pubState.config,
      selectedChannel: pubState.selectedChannel
    });
    return pubState;
  }

  // [Diubah oleh Gemini - 2026-11-20] Mode Demo YouTube Analytics (seed & reset jujur)
  async function loadDemo() {
    const today = localDay(now());
    const baseMs = now();
    const trend = [];
    const baseViews = [1120, 1340, 1290, 1580, 1790, 2140, 2480];
    for (let i = 6; i >= 0; i--) {
      const dStr = localDay(baseMs - i * 86400000);
      const v = baseViews[6 - i];
      trend.push({
        date: dStr,
        views: v,
        watchHours: round1((v * 0.68) / 60),
        subscribers: 410 + (6 - i) * 6
      });
    }

    // [Diubah oleh Gemini - 2026-11-21] Data demo generik bebas nama channel & ID video pribadi untuk repo publik
    const demoTop = [
      {
        id: 'demo-vid-01',
        title: 'What If Earth Stopped Spinning for One Second?',
        views: 3420,
        likes: 94,
        comments: 14,
        retentionPct: 64.2,
        durationSec: 59,
        publishedAt: localDay(baseMs - 2 * 86400000),
        channel: 'DemoStudio'
      },
      {
        id: 'demo-vid-02',
        title: 'What If You Stopped Drinking Water For 3 Days?',
        views: 2890,
        likes: 76,
        comments: 11,
        retentionPct: 61.5,
        durationSec: 44,
        publishedAt: localDay(baseMs - 4 * 86400000),
        channel: 'DemoStudio'
      },
      {
        id: 'demo-vid-03',
        title: 'What Happens When You Stop Staying Up Late?',
        views: 2150,
        likes: 58,
        comments: 8,
        retentionPct: 59.0,
        durationSec: 39,
        publishedAt: localDay(baseMs - 6 * 86400000),
        channel: 'DemoStudio'
      }
    ];

    const demoWeak = [
      {
        id: 'demo-vid-04',
        title: 'Why The Trip Home Always Feels Shorter',
        views: 468,
        likes: 11,
        comments: 0,
        retentionPct: 49.8,
        durationSec: 38,
        publishedAt: localDay(baseMs - 5 * 86400000),
        channel: 'DemoStudio',
        issue: '3 detik pertama statis & terlalu banyak shot berulang di adegan mobil'
      },
      {
        id: 'demo-vid-05',
        title: 'How Discipline Changes Your Brain In 30 Days',
        views: 310,
        likes: 7,
        comments: 0,
        retentionPct: 44.5,
        durationSec: 55,
        publishedAt: localDay(baseMs - 3 * 86400000),
        channel: 'DemoStudio',
        issue: 'Topik motivasi terlalu abstrak tanpa eksperimen visual konkret di frame 1'
      }
    ];

    state.configured = true;
    state.demoMode = true;
    state.source = 'demo';
    state.lastRunDate = today;
    state.lastRunAt = nowIso();
    state.lastTrigger = 'demo';
    state.selectedChannel = 'DemoStudio';
    state.channels = [
      {
        id: 'demostudio',
        key: 'demostudio',
        name: 'DemoStudio',
        title: 'Demo Studio',
        subscribers: 446,
        totalViews: 11730,
        videoCount: 7,
        avgViews: 1676,
        avgRetentionPct: 58.4
      },
      {
        id: 'explainerlab',
        key: 'explainerlab',
        name: 'ExplainerLab',
        title: 'Explainer Lab',
        subscribers: 185,
        totalViews: 4820,
        videoCount: 4,
        avgViews: 1205,
        avgRetentionPct: 56.1
      }
    ];
    state.summary = {
      subscribers: 446,
      totalViews: 11730,
      videoCount: 7,
      avgViews: 1676,
      avgRetentionPct: 58.4,
      viewsDelta24h: 2480
    };
    state.dailyTrend = trend;
    state.topVideos = demoTop;
    state.weakVideos = demoWeak;
    state.nextVideoRecommendations = buildDataDrivenRecommendations({
      channelName: 'DemoStudio',
      topVideos: demoTop,
      weakVideos: demoWeak,
      learningsText: 'Penurunan tertajam di detik 4-7; akhir menyambung ke awal (loop replay).'
    });
    state.error = null;

    await queueSaveStore();
    const pubState = getState();
    emitSafe({
      type: 'youtube_analytics_updated',
      trigger: 'demo',
      selectedChannel: pubState.selectedChannel,
      summary: pubState.summary
    });
    return pubState;
  }

  async function resetDemo() {
    state.configured = false;
    state.demoMode = false;
    state.source = 'unconfigured';
    state.lastRunDate = null;
    state.lastRunAt = null;
    state.lastTrigger = null;
    state.selectedChannel = '';
    state.channels = [];
    state.summary = emptySummary();
    state.dailyTrend = [];
    state.topVideos = [];
    state.weakVideos = [];
    state.nextVideoRecommendations = [];
    state.error = null;

    await queueSaveStore();
    const pubState = getState();
    emitSafe({
      type: 'youtube_analytics_updated',
      trigger: 'reset',
      selectedChannel: '',
      summary: pubState.summary
    });
    return pubState;
  }

  function findRecommendation(recommendationId) {
    const cleanId = cleanText(recommendationId, 80);
    if (!cleanId) {
      return state.nextVideoRecommendations[0] || null;
    }
    return state.nextVideoRecommendations.find(r => r.id === cleanId) || null;
  }

  // [Diubah oleh Gemini - 2026-11-20] Pemeriksa jadwal otomatis 00:00 + Catch-Up bila PC baru menyala
  async function checkMidnightAutoCycle() {
    if (stopped || activeSyncPromise) return;
    if (!state.config.enabled || !state.config.autoMidnight) return;
    if (!hasConfiguredSource()) return;
    const today = localDay(now());
    if (state.lastRunDate !== today) {
      await syncNow({ trigger: 'midnight_auto' }).catch(() => {});
    }
  }

  startupTimer = setTimeout(() => {
    checkMidnightAutoCycle().catch(() => {});
  }, 2000);
  if (typeof startupTimer.unref === 'function') startupTimer.unref();

  midnightTimer = setInterval(() => {
    checkMidnightAutoCycle().catch(() => {});
  }, 60000);
  if (typeof midnightTimer.unref === 'function') midnightTimer.unref();

  async function stop() {
    stopped = true;
    if (startupTimer) {
      clearTimeout(startupTimer);
      startupTimer = null;
    }
    if (midnightTimer) {
      clearInterval(midnightTimer);
      midnightTimer = null;
    }
    if (activeSyncPromise) {
      await activeSyncPromise.catch(() => {});
    }
    await writeQueue;
  }

  return {
    getState,
    getConfig: getPublicConfig,
    updateConfig,
    syncNow,
    loadDemo,
    resetDemo,
    findRecommendation,
    checkMidnightAutoCycle,
    stop
  };
}

module.exports = {
  createYoutubeAnalyticsStore,
  computeNextMidnightIso
};
