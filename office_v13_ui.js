/* [Diubah oleh Gemini - 2026-11-21] Antarmuka Office AI V13/V14: Panel Prompt Agen AI Langsung (Audit V14: pratinjau perintah nyata, peringatan risiko Full Access, larangan tier -low Antigravity, badge usage limit, & penampil berkas laporan) + delegasi Dasbor YouTube V14 */
'use strict';

window.OfficeV13UI = {
  create(opts = {}) {
    const {
      dialog: openDialogFn,
      isDemo = () => true,
      before,
      onOpenShorts,
      onPromptRun,
      onFocusZone,
      onYoutubeSync,
      onOpenSetup,
      getYoutubeUI = () => null
    } = opts;

    const $ = id => document.getElementById(id);
    const SVG_NS = 'http://www.w3.org/2000/svg';

    const DEFAULT_AGENTS = [
      { id: 'claude', name: 'Claude Code', command: 'claude', provider: 'claude', available: true, kind: 'cli' },
      { id: 'codex', name: 'Codex', command: 'codex', provider: 'codex', available: true, kind: 'cli' },
      { id: 'antigravity', name: 'Antigravity', command: 'agy', provider: 'gemini', available: true, kind: 'cli' },
      { id: 'opencode', name: 'OpenCode', command: 'opencode', provider: 'codex', available: true, kind: 'cli' },
      { id: 'hermes', name: 'Hermes', command: 'hermes', provider: 'hermes', available: false, kind: 'cli' },
      { id: 'gemini-api', name: 'Gemini API BYOK', command: 'REST API', provider: 'gemini', available: false, kind: 'api' }
    ];

    let activePanel = null; // null | 'youtube' | 'prompt'
    let generation = 0;
    let busyYt = false;
    let ytNotice = { text: '', kind: '' };
    let promptNotice = { text: '', kind: '' };
    let selectedYtChannel = '';
    let selectedAgentId = 'claude';
    let promptFullAccess = true;
    let promptCwd = '';
    let promptModel = '';
    let promptEffort = '';
    let promptModelSearch = '';
    let promptCustomModelMode = false;
    let promptDraft = '';
    let selectedRunId = null;
    // [Diubah oleh Gemini - 2026-11-21] State terintegrasi penuh V14-B: katalog model nyata per agen, daftar cepat cwd, validasi cwd, uji koneksi, & panel kunci integrasi inline
    let testingAgentId = null;
    let refreshingModels = false;
    let showIntegrationBox = false;
    let cwdValidation = null; // { valid, blocked, reasonCode }
    let cwdValidateTimer = null;
    const savedSelectionByAgent = Object.create(null);
    // [Diubah oleh Gemini - 2026-11-20] Guard state kirim & batal prompt agar pembatalan saat proses berjalan tidak pernah macet loading atau mengunci pengiriman berikutnya
    let sendingPrompt = false;
    let cancellingRunId = null;
    let cancelRequestedDuringSend = false;
    let demoStreamTimer = null;
    let demoRunSeq = 1;

    function nextLocalMidnightIso() {
      const d = new Date();
      d.setHours(24, 0, 0, 0);
      return d.toISOString();
    }

    function emptyYoutubeState() {
      return {
        configured: false,
        source: 'none',
        lastRunDate: null,
        lastRunAt: null,
        lastTrigger: null,
        nextMidnightIso: nextLocalMidnightIso(),
        autoMidnight: true,
        catchUpPending: false,
        channels: [],
        selectedChannel: '',
        summary: {
          subscribers: 0,
          totalViews: 0,
          videoCount: 0,
          avgViews: 0,
          avgRetentionPct: 0,
          viewsDelta24h: 0
        },
        dailyTrend: [],
        topVideos: [],
        weakVideos: [],
        nextVideoRecommendations: [],
        historyDates: [],
        config: {
          enabled: true,
          autoMidnight: true,
          channelFilter: '',
          pythonPath: '',
          youtubeChannelId: '',
          hasYoutubeApiKey: false,
          keyHint: ''
        },
        error: null
      };
    }

    function buildDemoYoutubeState() {
      const now = new Date();
      const trend = [];
      const viewsSeq = [1420, 1890, 2150, 1760, 2640, 3120, 3480];
      const hrsSeq = [18.4, 24.1, 29.8, 22.5, 36.2, 43.0, 48.6];
      const subsSeq = [12, 16, 19, 14, 25, 31, 34];
      for (let i = 0; i < 7; i++) {
        const d = new Date(now.getTime() - (6 - i) * 86400000);
        trend.push({
          date: d.toISOString().slice(0, 10),
          views: viewsSeq[i],
          watchHours: hrsSeq[i],
          subscribers: subsSeq[i]
        });
      }
      return {
        configured: true,
        source: 'demo',
        lastRunDate: now.toISOString().slice(0, 10),
        lastRunAt: now.toISOString(),
        lastTrigger: 'demo_seed',
        nextMidnightIso: nextLocalMidnightIso(),
        autoMidnight: true,
        catchUpPending: false,
        channels: ['DemoStudio', 'ExplainerLab', 'StoryLab'],
        selectedChannel: selectedYtChannel || '',
        summary: {
          subscribers: 12480,
          totalViews: 16460,
          videoCount: 18,
          avgViews: 2351,
          avgRetentionPct: 68.4,
          viewsDelta24h: 3480
        },
        dailyTrend: trend,
        topVideos: [
          { id: 'demo-top-1', title: 'Kenapa Otak Memilih Hal Sulit Saat Tertekan?', channel: 'DemoStudio', views: 5420, likes: 412, retentionPct: 79.2, publishedAt: trend[5].date },
          { id: 'demo-top-2', title: 'Efek Domino 1 Menit yang Mengubah Kebiasaan', channel: 'ExplainerLab', views: 4180, likes: 318, retentionPct: 74.6, publishedAt: trend[4].date },
          { id: 'demo-top-3', title: 'Rahasia Visual Kontras Tinggi di 3 Detik Awal', channel: 'DemoStudio', views: 3690, likes: 274, retentionPct: 71.8, publishedAt: trend[2].date }
        ],
        weakVideos: [
          { id: 'demo-weak-1', title: 'Rangkuman Berita Teknologi Minggu Ini', channel: 'StoryLab', views: 420, likes: 19, retentionPct: 34.1, publishedAt: trend[1].date },
          { id: 'demo-weak-2', title: 'Intro Panjang Tanpa Konflik di Awal Video', channel: 'ExplainerLab', views: 590, likes: 28, retentionPct: 39.5, publishedAt: trend[0].date }
        ],
        nextVideoRecommendations: [
          {
            id: 'rec-demo-1',
            title: '3 Detik Pertama yang Membuat Penonton Tidak Bisa Scroll',
            hook: '90% penonton pergi sebelum detik ke-3 — ini satu pola visual yang menahannya.',
            angle: 'Perbandingan langsung frame pembuka berkonflik vs intro generik menggunakan diagram garis tipis.',
            channel: 'DemoStudio',
            targetDurationSec: 48,
            rationale: 'Top video Anda mencapai retensi 79.2% saat konflik langsung tampil di detik 0–3, jauh di atas video intro lambat (39.5%).',
            basedOn: 'demo-top-1'
          },
          {
            id: 'rec-demo-2',
            title: 'Mengapa Keputusan Kecil Jam 7 Pagi Menentukan Sisa Harimu?',
            hook: 'Bukan motivasi — ini satu bias kognitif yang menguras energi sejak bangun tidur.',
            angle: 'Visualisasi 3 langkah efek domino sederhana tanpa narasi bertele-tele.',
            channel: 'ExplainerLab',
            targetDurationSec: 52,
            rationale: 'Format efek domino meraih 4.180 views dan 74.6% retensi dengan rasio suka 7.6%.',
            basedOn: 'demo-top-2'
          },
          {
            id: 'rec-demo-3',
            title: 'Paradoks Pilihan: Kenapa Terlalu Banyak Opsi Bikin Kita Diam?',
            hook: 'Semakin banyak pilihan di depanmu, semakin kecil peluangmu memilih yang terbaik.',
            angle: 'Eksperimen visual 2 rak vs 24 rak dengan satu angka konkret per adegan.',
            channel: 'StoryLab',
            targetDurationSec: 45,
            rationale: 'Mengganti format berita umum (retensi 34.1%) ke cerita paradoks berbasis eksperimen nyata.',
            basedOn: 'demo-weak-1'
          }
        ],
        historyDates: trend.map(x => x.date),
        config: {
          enabled: true,
          autoMidnight: true,
          channelFilter: '',
          pythonPath: '',
          youtubeChannelId: '',
          hasYoutubeApiKey: false,
          keyHint: ''
        },
        error: null
      };
    }

    const state = {
      yt: emptyYoutubeState(),
      prompt: {
        agents: DEFAULT_AGENTS.map(a => ({ ...a })),
        defaultCwd: '',
        runs: [],
        modelsByAgent: Object.create(null),
        cwdOptions: [],
        config: { lastSelection: {}, executableOverrides: {}, lastTests: {} }
      }
    };

    const demoState = {
      yt: emptyYoutubeState(),
      prompt: {
        agents: DEFAULT_AGENTS.map(a => ({ ...a })),
        defaultCwd: '<workspace>',
        runs: [],
        modelsByAgent: Object.create(null),
        cwdOptions: [],
        config: { lastSelection: {}, executableOverrides: {}, lastTests: {} }
      }
    };

    const isLocalDemo = () => isDemo() || location.protocol === 'file:';
    const getToken = () => document.querySelector('meta[name="office-vault-token"]')?.content || '';

    async function req(method, url, body) {
      const headers = { 'X-Office-Token': getToken() };
      const init = { method, headers };
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
      const res = await fetch(url, init);
      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (!res.ok) {
        const msg = data?.error || data?.message || ('HTTP ' + res.status);
        throw new Error(t('v12.apiError', { message: msg }));
      }
      return data;
    }

    function el(tag, text, cls) {
      const node = document.createElement(tag);
      if (text !== undefined && text !== null) node.textContent = String(text);
      if (cls) node.className = cls;
      return node;
    }

    function svgEl(tag, attrs = {}) {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      return node;
    }

    function fmtCompact(n) {
      const val = Number(n);
      if (!Number.isFinite(val)) return '0';
      return I18n.number(val, { notation: 'compact', maximumFractionDigits: 1 });
    }

    function normalizeYoutube(raw) {
      if (!raw || typeof raw !== 'object') return state.yt;
      const base = emptyYoutubeState();
      const s = raw.summary && typeof raw.summary === 'object' ? raw.summary : {};
      const cfg = raw.config && typeof raw.config === 'object' ? raw.config : {};
      const channels = Array.isArray(raw.channels)
        ? raw.channels.map(c => typeof c === 'string' ? c : (c?.name || c?.title || c?.key || c?.id || '')).filter(Boolean)
        : [];
      return {
        ...base,
        ...raw,
        demoMode: Boolean(raw.demoMode ?? (raw.source === 'demo')),
        catchUpCompletedAt: raw.catchUpCompletedAt || null,
        channels,
        nextMidnightIso: raw.nextMidnightIso || base.nextMidnightIso,
        autoMidnight: Boolean(raw.autoMidnight ?? cfg.autoMidnight ?? true),
        summary: {
          subscribers: Number(s.subscribers || 0) || 0,
          totalViews: Number(s.totalViews || 0) || 0,
          videoCount: Number(s.videoCount || 0) || 0,
          avgViews: Number(s.avgViews || 0) || 0,
          avgRetentionPct: Number(s.avgRetentionPct || 0) || 0,
          viewsDelta24h: Number(s.viewsDelta24h || 0) || 0
        },
        dailyTrend: Array.isArray(raw.dailyTrend) ? raw.dailyTrend : [],
        topVideos: Array.isArray(raw.topVideos) ? raw.topVideos : [],
        weakVideos: Array.isArray(raw.weakVideos) ? raw.weakVideos : [],
        nextVideoRecommendations: Array.isArray(raw.nextVideoRecommendations) ? raw.nextVideoRecommendations : [],
        historyDates: Array.isArray(raw.historyDates) ? raw.historyDates : [],
        config: {
          enabled: Boolean(cfg.enabled ?? true),
          autoMidnight: Boolean(cfg.autoMidnight ?? raw.autoMidnight ?? true),
          channelFilter: String(cfg.channelFilter || ''),
          pythonPath: String(cfg.pythonPath || ''),
          youtubeChannelId: String(cfg.youtubeChannelId || ''),
          hasYoutubeApiKey: Boolean(cfg.hasYoutubeApiKey ?? raw.hasYoutubeApiKey),
          keyHint: String(cfg.keyHint || raw.keyHint || '')
        }
      };
    }

    function normalizeAgent(raw) {
      if (!raw || typeof raw !== 'object') return null;
      const st = String(raw.status || '');
      const isApi = raw.kind === 'api' || raw.id === 'gemini-api' || st.startsWith('byok_');
      const avail = raw.installed !== undefined
        ? Boolean(raw.installed)
        : raw.available !== undefined
          ? Boolean(raw.available)
          : (st === 'ready' || st === 'byok_ready');
      return {
        id: String(raw.id || 'claude'),
        name: String(raw.name || raw.label || raw.id || 'Agent'),
        command: String(raw.binary || raw.command || raw.id || ''),
        provider: String(raw.residentProvider || raw.provider || 'claude'),
        available: avail,
        serviceReady: raw.serviceReady !== undefined ? Boolean(raw.serviceReady) : avail,
        status: st || (isApi ? (avail ? 'byok_ready' : 'byok_missing') : (avail ? 'ready' : 'missing')),
        statusReasonCode: String(raw.statusReasonCode || (isApi ? (avail ? 'ready_byok' : 'byok_key_missing') : (avail ? 'ready_cli' : 'cli_missing'))),
        version: String(raw.version || ''),
        kind: isApi ? 'api' : 'cli',
        supportsFullAccess: raw.supportsFullAccess !== undefined ? Boolean(raw.supportsFullAccess) : !isApi,
        supportsEffort: Boolean(raw.supportsEffort),
        effortOptions: Array.isArray(raw.effortOptions) ? raw.effortOptions : [],
        defaultEffort: String(raw.defaultEffort || ''),
        billingType: String(raw.billingType || ''),
        fullAccessFlagsOn: String(raw.fullAccessFlagsOn || ''),
        fullAccessFlagsOff: String(raw.fullAccessFlagsOff || ''),
        commandPreviewOn: String(raw.commandPreviewOn || ''),
        commandPreviewOff: String(raw.commandPreviewOff || ''),
        defaultModel: String(raw.defaultModel || ''),
        savedModel: raw.savedModel !== undefined ? String(raw.savedModel) : '',
        savedEffort: raw.savedEffort !== undefined ? String(raw.savedEffort) : '',
        recommendedModels: Array.isArray(raw.recommendedModels) ? raw.recommendedModels : [],
        banLowTier: Boolean(raw.banLowTier || raw.id === 'antigravity'),
        resolvedPathDisplay: String(raw.resolvedPathDisplay || ''),
        launcherSource: String(raw.launcherSource || ''),
        executableOverride: String(raw.executableOverride || ''),
        byokHint: String(raw.byokHint || ''),
        recentLimit: raw.recentLimit || null,
        lastTest: raw.lastTest || null,
        serviceNote: String(raw.serviceNote || ''),
        detail: String(raw.resolvedBinary || raw.detail || raw.path || '')
      };
    }

    function normalizeRun(raw) {
      if (!raw || typeof raw !== 'object') return null;
      return {
        id: String(raw.id || raw.runId || ('run-' + Date.now())),
        agentId: String(raw.agentId || 'claude'),
        agentName: String(raw.agentName || raw.agentId || 'Agent'),
        provider: String(raw.residentProvider || raw.target || raw.provider || 'claude'),
        prompt: String(raw.prompt || ''),
        cwd: String(raw.cwdLabel || raw.cwd || ''),
        model: String(raw.model || ''),
        effort: String(raw.effort || ''),
        fullAccess: Boolean(raw.fullAccess ?? true),
        commandPreview: String(raw.commandPreview || ''),
        status: String(raw.status || 'completed'),
        exitCode: raw.exitCode ?? raw.code ?? null,
        output: String(raw.output ?? ''),
        outputFileLabel: String(raw.outputFileLabel || ''),
        limitDetected: Boolean(raw.limitDetected),
        retryAfter: raw.retryAfter ? String(raw.retryAfter) : '',
        errorCode: raw.errorCode ? String(raw.errorCode) : '',
        error: raw.error ? String(raw.error) : '',
        startedAt: raw.startedAt || raw.createdAt || new Date().toISOString(),
        finishedAt: raw.finishedAt || null,
        durationMs: Number(raw.durationMs ?? 0) || 0,
        demo: Boolean(raw.demo || raw.mode === 'demo')
      };
    }

    function currentData() {
      if (isLocalDemo()) {
        return { yt: demoState.yt, prompt: demoState.prompt };
      }
      return { yt: state.yt, prompt: state.prompt };
    }

    function findRun(id) {
      const runs = currentData().prompt.runs || [];
      if (id) {
        const hit = runs.find(r => r.id === id);
        if (hit) return hit;
      }
      return runs[0] || null;
    }

    function updateSidebar() {
      const { yt, prompt } = currentData();
      const ytUI = typeof getYoutubeUI === 'function' ? getYoutubeUI() : null;
      if (ytUI && typeof ytUI.updateSidebar === 'function') {
        ytUI.updateSidebar();
      } else {
        const ytBadge = $('v13YoutubeBadge');
        if (ytBadge) {
          if (yt.catchUpPending) {
            ytBadge.textContent = t('v13.youtubeBadgeCatchUp');
            ytBadge.dataset.state = 'hitl';
          } else if (yt.configured && (yt.summary?.totalViews > 0 || yt.lastRunAt)) {
            ytBadge.textContent = t('v13.youtubeBadgeViews', { views: fmtCompact(yt.summary?.totalViews || 0) });
            ytBadge.dataset.state = 'connected';
          } else {
            ytBadge.textContent = t('v13.youtubeBadgeStandby');
            ytBadge.dataset.state = 'idle';
          }
        }
      }

      const prBadge = $('v13PromptBadge');
      if (prBadge) {
        const running = Boolean(sendingPrompt) || (prompt.runs || []).some(r => r.status === 'running');
        const readyCount = (prompt.agents || []).filter(a => a.available && a.serviceReady !== false).length;
        if (running) {
          prBadge.textContent = t('v13.promptBadgeRunning');
          prBadge.dataset.state = 'trading';
        } else if (readyCount > 0) {
          prBadge.textContent = t('v13.promptBadgeReady', { count: readyCount });
          prBadge.dataset.state = 'connected';
        } else if (!isLocalDemo() && Array.isArray(prompt.agents) && prompt.agents.length > 0 && prompt.agents.some(a => a.status)) {
          prBadge.textContent = t('setup15.promptSidebarSetup');
          prBadge.dataset.state = 'idle';
        } else {
          prBadge.textContent = t('v13.promptBadgeStandby');
          prBadge.dataset.state = 'idle';
        }
      }
    }

    async function fetchYoutubeLive() {
      const res = await req('GET', '/youtube/analytics').catch(() => null);
      if (res) {
        state.yt = normalizeYoutube(res);
        if (!selectedYtChannel && state.yt.selectedChannel) {
          selectedYtChannel = state.yt.selectedChannel;
        }
      }
      updateSidebar();
    }

    function isTerminalRunStatus(st) {
      return st === 'completed' || st === 'done' || st === 'failed' || st === 'error' || st === 'cancelled' || st === 'interrupted' || st === 'timed_out' || st === 'rate_limited';
    }

    // [Diubah oleh Gemini - 2026-11-21] Merge aman state prompt run: tidak pernah menurunkan status terminal atau menghapus outputFileLabel/limitDetected
    function upsertRunSafe(raw, { select = false } = {}) {
      const incoming = normalizeRun(raw);
      if (!incoming) return null;
      const idx = state.prompt.runs.findIndex(r => r.id === incoming.id);
      let merged = incoming;
      if (idx >= 0) {
        const prev = state.prompt.runs[idx];
        const keepPrevTerminal = isTerminalRunStatus(prev.status) && !isTerminalRunStatus(incoming.status);
        merged = {
          ...prev,
          ...incoming,
          status: keepPrevTerminal ? prev.status : incoming.status,
          exitCode: keepPrevTerminal ? prev.exitCode : (incoming.exitCode ?? prev.exitCode),
          finishedAt: keepPrevTerminal ? prev.finishedAt : (incoming.finishedAt || prev.finishedAt),
          durationMs: keepPrevTerminal ? prev.durationMs : (incoming.durationMs || prev.durationMs),
          outputFileLabel: incoming.outputFileLabel || prev.outputFileLabel || '',
          limitDetected: keepPrevTerminal ? prev.limitDetected : Boolean(incoming.limitDetected || prev.limitDetected),
          retryAfter: keepPrevTerminal ? prev.retryAfter : (incoming.retryAfter || prev.retryAfter || ''),
          errorCode: keepPrevTerminal ? prev.errorCode : (incoming.errorCode || prev.errorCode || ''),
          error: keepPrevTerminal ? prev.error : (incoming.error || prev.error || ''),
          output: (prev.output && prev.output.length > (incoming.output || '').length) ? prev.output : (incoming.output || prev.output || '')
        };
        state.prompt.runs[idx] = merged;
      } else {
        state.prompt.runs.unshift(merged);
        if (state.prompt.runs.length > 50) state.prompt.runs.length = 50;
      }
      if (select) selectedRunId = merged.id;
      return merged;
    }

    function applySavedSelectionForAgent(agentId) {
      const agents = currentData().prompt.agents || [];
      const ag = agents.find(a => a.id === agentId);
      const localMem = savedSelectionByAgent[agentId];
      if (localMem) {
        promptModel = localMem.model || '';
        promptEffort = localMem.effort || '';
      } else if (ag) {
        promptModel = ag.savedModel || '';
        promptEffort = ag.savedEffort || ag.defaultEffort || '';
      } else {
        promptModel = '';
        promptEffort = '';
      }
      promptModelSearch = '';
      promptCustomModelMode = false;
    }

    async function fetchAgentModelsLive(agentId, { forceRefresh = false } = {}) {
      if (isLocalDemo() || !agentId) return;
      const q = '?agent=' + encodeURIComponent(agentId) + (forceRefresh ? '&refresh=1' : '');
      const res = await req('GET', '/prompt/models' + q).catch(() => null);
      if (res && res.catalog) {
        state.prompt.modelsByAgent[agentId] = res.catalog;
      }
    }

    async function fetchCwdsLive() {
      if (isLocalDemo()) return;
      const res = await req('GET', '/prompt/cwds').catch(() => null);
      if (res && Array.isArray(res.options)) {
        state.prompt.cwdOptions = res.options;
        if (!promptCwd && res.defaultCwd) {
          promptCwd = String(res.defaultCwd);
        }
      }
    }

    async function fetchPromptRunsOnly() {
      const runRes = await req('GET', '/prompt/runs').catch(() => null);
      if (runRes && Array.isArray(runRes.runs)) {
        state.prompt.runs = runRes.runs.map(normalizeRun).filter(Boolean);
        if (selectedRunId && !state.prompt.runs.some(r => r.id === selectedRunId)) {
          selectedRunId = state.prompt.runs[0]?.id || null;
        } else if (!selectedRunId && state.prompt.runs.length) {
          selectedRunId = state.prompt.runs[0].id;
        }
      }
      updateSidebar();
    }

    async function fetchPromptLive({ refreshAgents = false } = {}) {
      const [agRes, runRes, cwdRes] = await Promise.all([
        req('GET', '/prompt/agents' + (refreshAgents ? '?refresh=1' : '')).catch(() => null),
        req('GET', '/prompt/runs').catch(() => null),
        req('GET', '/prompt/cwds').catch(() => null)
      ]);
      if (agRes) {
        const list = Array.isArray(agRes.agents) ? agRes.agents.map(normalizeAgent).filter(Boolean) : [];
        if (list.length) state.prompt.agents = list;
        if (agRes.config && typeof agRes.config === 'object') {
          state.prompt.config = agRes.config;
          const ls = agRes.config.lastSelection || {};
          for (const [aid, sel] of Object.entries(ls)) {
            if (!savedSelectionByAgent[aid] && sel && typeof sel === 'object') {
              savedSelectionByAgent[aid] = { model: String(sel.model || ''), effort: String(sel.effort || '') };
            }
          }
        }
        if (agRes.defaultCwd) {
          state.prompt.defaultCwd = String(agRes.defaultCwd);
          if (!promptCwd) promptCwd = state.prompt.defaultCwd;
        }
        const curAg = state.prompt.agents.find(a => a.id === selectedAgentId);
        if (curAg && !savedSelectionByAgent[selectedAgentId] && (curAg.savedModel || curAg.savedEffort)) {
          savedSelectionByAgent[selectedAgentId] = { model: curAg.savedModel || '', effort: curAg.savedEffort || '' };
          if (!promptModel) promptModel = curAg.savedModel || '';
          if (!promptEffort) promptEffort = curAg.savedEffort || curAg.defaultEffort || '';
        }
      }
      if (cwdRes && Array.isArray(cwdRes.options)) {
        state.prompt.cwdOptions = cwdRes.options;
        if (!promptCwd && cwdRes.defaultCwd) promptCwd = String(cwdRes.defaultCwd);
      }
      if (runRes) {
        state.prompt.runs = Array.isArray(runRes.runs) ? runRes.runs.map(normalizeRun).filter(Boolean) : [];
        if (selectedRunId && !state.prompt.runs.some(r => r.id === selectedRunId)) {
          selectedRunId = state.prompt.runs[0]?.id || null;
        } else if (!selectedRunId && state.prompt.runs.length) {
          selectedRunId = state.prompt.runs[0].id;
        }
      }
      if (!state.prompt.modelsByAgent[selectedAgentId]) {
        await fetchAgentModelsLive(selectedAgentId);
      }
      updateSidebar();
    }

    function showModalTitle(titleText) {
      if (typeof openDialogFn === 'function') {
        openDialogFn(titleText);
      } else {
        const panel = $('panel');
        const titleEl = $('panelTitle');
        const body = $('panelContent');
        if (titleEl) titleEl.textContent = titleText;
        if (body) body.replaceChildren();
        if (panel && !panel.open) panel.showModal();
      }
      const content = $('panelContent');
      if (content) {
        content.classList.remove('quality-panel');
        content.classList.add('v12-panel');
      }
    }

    // ===== PANEL A: YOUTUBE CHANNEL ANALYTICS =====
    function buildYoutubeTrendSvg(trend) {
      const W = 760, H = 205;
      const padL = 56, padR = 52, padT = 20, padB = 30;
      const plotW = W - padL - padR;
      const plotH = H - padT - padB;
      const svg = svgEl('svg', {
        id: 'v13YtTrendSvg',
        viewBox: `0 0 ${W} ${H}`,
        class: 'v13-chart-svg',
        role: 'img',
        'aria-label': t('v13.ytTrendAria')
      });

      const pts = Array.isArray(trend) ? trend : [];
      const maxViews = Math.max(10, ...pts.map(p => Number(p.views || 0) || 0));
      const maxHrs = Math.max(1, ...pts.map(p => Number(p.watchHours || 0) || 0));

      for (const frac of [0, 0.5, 1]) {
        const yy = padT + plotH - frac * plotH;
        svg.append(svgEl('line', { x1: padL, y1: yy, x2: W - padR, y2: yy, class: 'v13-chart-grid' }));
        const lLbl = svgEl('text', { x: padL - 8, y: yy + 4, 'text-anchor': 'end', class: 'v13-chart-label' });
        lLbl.textContent = fmtCompact(maxViews * frac);
        svg.append(lLbl);
        const rLbl = svgEl('text', { x: W - padR + 8, y: yy + 4, 'text-anchor': 'start', class: 'v13-chart-label' });
        rLbl.textContent = (maxHrs * frac).toFixed(0) + 'h';
        svg.append(rLbl);
      }

      if (!pts.length) return svg;

      const slotW = plotW / pts.length;
      const barW = Math.max(10, Math.min(34, slotW * 0.52));
      const lineCoords = [];

      pts.forEach((p, i) => {
        const cx = padL + i * slotW + slotW / 2;
        const views = Math.max(0, Number(p.views || 0) || 0);
        const hrs = Math.max(0, Number(p.watchHours || 0) || 0);
        const bh = (views / maxViews) * plotH;
        const by = padT + plotH - bh;
        const rect = svgEl('rect', {
          x: (cx - barW / 2).toFixed(1),
          y: by.toFixed(1),
          width: barW.toFixed(1),
          height: Math.max(2, bh).toFixed(1),
          rx: 4,
          class: 'v13-chart-bar'
        });
        const tip = svgEl('title');
        tip.textContent = `${p.date || ''} · ${I18n.number(views)} views · ${hrs.toFixed(1)}h`;
        rect.append(tip);
        svg.append(rect);

        const hy = padT + plotH - (hrs / maxHrs) * plotH;
        lineCoords.push({ x: cx, y: hy, p, hrs });

        const xLbl = svgEl('text', { x: cx.toFixed(1), y: H - 8, 'text-anchor': 'middle', class: 'v13-chart-label' });
        xLbl.textContent = String(p.date || '').slice(5);
        svg.append(xLbl);
      });

      svg.append(svgEl('polyline', {
        points: lineCoords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' '),
        class: 'v13-chart-line'
      }));
      for (const c of lineCoords) {
        const dot = svgEl('circle', { cx: c.x.toFixed(1), cy: c.y.toFixed(1), r: 3.5, class: 'v13-chart-dot' });
        const tip = svgEl('title');
        tip.textContent = `${c.p.date || ''} · ${c.hrs.toFixed(1)}h`;
        dot.append(tip);
        svg.append(dot);
      }

      return svg;
    }

    function renderVideoTable(container, titleText, videos, tableId) {
      const sec = el('section', null, 'v12-section');
      const head = el('div', null, 'v12-section-head');
      head.append(el('h3', titleText), el('span', I18n.number((videos || []).length), 'v12-muted'));
      sec.append(head);

      if (!videos || !videos.length) {
        sec.append(el('p', t('v13.ytVideosEmpty'), 'v12-empty'));
      } else {
        const scroll = el('div', null, 'table-scroll');
        const tbl = el('table', null, 'v12-table');
        tbl.id = tableId;
        const thead = el('thead');
        const htr = el('tr');
        for (const [lbl, cls] of [
          [t('v13.ytColVideoTitle'), ''],
          [t('v13.ytColChannel'), ''],
          [t('v13.ytColViews'), 'v12-num'],
          [t('v13.ytColLikes'), 'v12-num'],
          [t('v13.ytColRetention'), 'v12-num']
        ]) htr.append(el('th', lbl, cls));
        thead.append(htr);
        tbl.append(thead);

        const tbody = el('tbody');
        for (const v of videos.slice(0, 10)) {
          const tr = el('tr');
          tr.append(el('td', v.title || '—'));
          tr.append(el('td', v.channel || '—', 'v12-muted'));
          tr.append(el('td', I18n.number(Number(v.views || 0)), 'v12-num'));
          tr.append(el('td', I18n.number(Number(v.likes || 0)), 'v12-num'));
          const ret = Number(v.retentionPct || 0);
          tr.append(el('td', I18n.number(ret, { maximumFractionDigits: 1 }) + '%', 'v12-num ' + (ret >= 60 ? 'v12-amount-pos' : ret > 0 && ret < 45 ? 'v12-amount-neg' : '')));
          tbody.append(tr);
        }
        tbl.append(tbody);
        scroll.append(tbl);
        sec.append(scroll);
      }
      container.append(sec);
    }

    function renderYoutubePanel() {
      const content = $('panelContent');
      if (!content) return;
      content.replaceChildren();
      content.classList.add('v12-panel');

      const { yt } = currentData();
      const s = yt.summary || {};

      // Top status strip: channel selector, 00:00 schedule badge, action buttons
      const strip = el('section', null, 'v12-mt5-strip');
      strip.id = 'v13YtStatusStrip';
      strip.dataset.status = yt.configured ? 'connected' : 'disconnected';

      const left = el('div', null, 'v12-mt5-main');

      const chSel = el('select');
      chSel.id = 'v13YtChannelSelect';
      chSel.setAttribute('aria-label', t('v13.ytChannelFilterLabel'));
      const optAll = el('option', t('v13.ytAllChannels'));
      optAll.value = '';
      chSel.append(optAll);
      for (const ch of (yt.channels || [])) {
        const o = el('option', ch);
        o.value = ch;
        chSel.append(o);
      }
      chSel.value = selectedYtChannel || '';
      chSel.addEventListener('change', async () => {
        selectedYtChannel = chSel.value;
        if (!isLocalDemo()) {
          await req('POST', '/youtube/sync', { liveFetch: false, channel: selectedYtChannel }).catch(() => null);
          await fetchYoutubeLive();
        } else {
          demoState.yt.selectedChannel = selectedYtChannel;
        }
        if (activePanel === 'youtube') renderYoutubePanel();
      });
      left.append(chSel);

      const schedPill = el('span', null, 'v12-pill ' + (yt.autoMidnight ? 'pos' : ''));
      schedPill.id = 'v13YtScheduleBadge';
      const dot = el('span', null, 'v12-pill-dot');
      dot.setAttribute('aria-hidden', 'true');
      schedPill.append(dot, document.createTextNode(t('v13.ytScheduleBadge')));
      left.append(schedPill);

      if (yt.catchUpPending || yt.catchUpCompletedAt || yt.lastTrigger === 'midnight_auto' || yt.lastTrigger === 'catch_up') {
        left.append(el('span', t('v13.ytCatchUpDone'), 'v12-pill warn'));
      }

      const metaBox = el('div', null, 'v12-mt5-pl');
      const lastTxt = yt.lastRunAt
        ? t('v13.ytLastAnalyzed', { time: I18n.time(yt.lastRunAt) })
        : t('v13.ytNeverAnalyzed');
      const nextDate = yt.nextMidnightIso ? String(yt.nextMidnightIso).slice(0, 10) : '';
      metaBox.append(
        el('span', lastTxt),
        el('span', t('v13.ytNextMidnight', { date: nextDate }))
      );
      left.append(metaBox);

      const tools = el('div', null, 'v12-btn-row');
      const refreshBtn = el('button', t('v13.ytRefreshBtn'), 'v12-btn-compact v12-btn-primary');
      refreshBtn.type = 'button';
      refreshBtn.id = 'v13YtRefreshBtn';
      refreshBtn.disabled = busyYt;
      refreshBtn.addEventListener('click', async () => {
        if (busyYt) return;
        busyYt = true;
        ytNotice = { text: '', kind: '' };
        renderYoutubePanel();
        try {
          if (isLocalDemo()) {
            demoState.yt = buildDemoYoutubeState();
            updateSidebar();
          } else {
            const res = await req('POST', '/youtube/sync', { liveFetch: true, channel: selectedYtChannel });
            if (res?.analytics || res?.state) state.yt = normalizeYoutube(res.analytics || res.state);
            await fetchYoutubeLive();
          }
          onYoutubeSync?.(currentData().yt);
          ytNotice = { text: t('v13.ytSyncDone'), kind: 'ok' };
        } catch (err) {
          ytNotice = { text: err.message, kind: 'error' };
        } finally {
          busyYt = false;
          if (activePanel === 'youtube') renderYoutubePanel();
        }
      });

      const isYtDemo = Boolean(yt.demoMode || yt.source === 'demo');
      const demoBtn = el('button', isYtDemo ? t('v13.ytResetDemoBtn') : t('v13.ytLoadDemoBtn'), 'v12-btn-compact');
      demoBtn.type = 'button';
      demoBtn.id = 'v13YtDemoBtn';
      demoBtn.disabled = busyYt;
      demoBtn.addEventListener('click', async () => {
        if (busyYt) return;
        busyYt = true;
        ytNotice = { text: '', kind: '' };
        const action = isYtDemo ? 'reset' : 'seed';
        try {
          if (isLocalDemo()) {
            demoState.yt = action === 'seed' ? buildDemoYoutubeState() : emptyYoutubeState();
            updateSidebar();
          } else {
            const res = await req('POST', '/youtube/demo', { action });
            if (res?.analytics || res?.state) state.yt = normalizeYoutube(res.analytics || res.state);
            await fetchYoutubeLive();
          }
          onYoutubeSync?.(currentData().yt);
        } catch (err) {
          ytNotice = { text: err.message, kind: 'error' };
        } finally {
          busyYt = false;
          if (activePanel === 'youtube') renderYoutubePanel();
        }
      });

      const studioBtn = el('button', t('v13.ytFocusStudioBtn'), 'v12-btn-compact');
      studioBtn.type = 'button';
      studioBtn.id = 'v13YtFocusStudio';
      studioBtn.addEventListener('click', () => {
        $('panel')?.close();
        onFocusZone?.('studio');
      });

      tools.append(refreshBtn, demoBtn, studioBtn);
      strip.append(left, tools);
      content.append(strip);

      if (ytNotice.text) {
        const note = el('div', ytNotice.text, 'v12-notice' + (ytNotice.kind ? ' ' + ytNotice.kind : ''));
        note.setAttribute('role', 'status');
        content.append(note);
      }

      // 4-cell Hero KPI strip
      const kpi = el('section', null, 'v13-kpi-grid cols-4');
      kpi.id = 'v13YtKpiGrid';
      const kpiItems = [
        {
          label: t('v13.ytKpiSubscribers'),
          value: I18n.number(s.subscribers || 0),
          sub: t('v13.ytKpiSourceSub', { source: yt.source || 'none' })
        },
        {
          label: t('v13.ytKpiTotalViews'),
          value: I18n.number(s.totalViews || 0),
          sub: t('v13.ytKpiVideoCountSub', { count: s.videoCount || 0 })
        },
        {
          label: t('v13.ytKpiAvgViews'),
          value: I18n.number(Math.round(s.avgViews || 0)),
          sub: t('v13.ytKpiDeltaSub', { delta: (s.viewsDelta24h >= 0 ? '+' : '') + I18n.number(s.viewsDelta24h || 0) })
        },
        {
          label: t('v13.ytKpiAvgRetention'),
          value: I18n.number(Number(s.avgRetentionPct || 0), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%',
          cls: (s.avgRetentionPct || 0) >= 55 ? 'pos' : '',
          sub: yt.lastRunDate || '—'
        }
      ];
      for (const item of kpiItems) {
        const c = el('div', null, 'v13-kpi-cell');
        c.append(
          el('span', item.label, 'v12-kpi-label'),
          el('strong', item.value, 'v12-kpi-value' + (item.cls ? ' ' + item.cls : '')),
          el('span', item.sub, 'v12-kpi-sub')
        );
        kpi.append(c);
      }
      content.append(kpi);

      // Daily Trend SVG Chart
      const trendSec = el('section', null, 'v12-section');
      const trendHead = el('div', null, 'v12-section-head');
      trendHead.append(el('h3', t('v13.ytTrendTitle')), el('span', t('v13.ytTrendSubtitle'), 'v12-muted'));
      trendSec.append(trendHead);
      const trendWrap = el('div', null, 'v13-chart-wrap');
      trendWrap.append(buildYoutubeTrendSvg(yt.dailyTrend || []));
      trendSec.append(trendWrap);
      if (!yt.dailyTrend?.length) {
        const emp = el('p', t('v13.ytTrendEmpty'), 'v12-empty');
        emp.style.marginTop = '10px';
        trendSec.append(emp);
      }
      content.append(trendSec);

      // Next-Video Recommendations (3 editorial cards with 1-click "Buat Tugas Short")
      const recSec = el('section', null, 'v12-section');
      const recHead = el('div', null, 'v12-section-head');
      recHead.append(el('h3', t('v13.ytRecTitle')), el('span', t('v13.ytRecSubtitle'), 'v12-muted'));
      recSec.append(recHead);

      const recs = yt.nextVideoRecommendations || [];
      if (!recs.length) {
        recSec.append(el('p', t('v13.ytRecEmpty'), 'v12-empty'));
      } else {
        const recGrid = el('div', null, 'v13-rec-grid');
        recGrid.id = 'v13YtRecGrid';
        for (const rec of recs.slice(0, 3)) {
          const card = el('article', null, 'v13-rec-card');
          const body = el('div', null, 'v13-rec-body');
          const top = el('div', null, 'v13-rec-head');
          top.append(el('h4', rec.title || '—'));
          body.append(top);

          const metaRow = el('div', null, 'v13-chip-row');
          if (rec.channel) metaRow.append(el('span', rec.channel, 'v12-pill'));
          if (rec.targetDurationSec) {
            metaRow.append(el('span', t('v13.ytRecDuration', { sec: rec.targetDurationSec }), 'v12-pill warn'));
          }
          body.append(metaRow);

          for (const [lblKey, val] of [
            ['v13.ytRecHook', rec.hook],
            ['v13.ytRecAngle', rec.angle],
            ['v13.ytRecRationale', rec.rationale]
          ]) {
            if (!val) continue;
            const p = el('p', null, 'v13-rec-detail');
            p.append(el('strong', t(lblKey)), document.createTextNode(String(val)));
            body.append(p);
          }

          const btn = el('button', t('v13.ytRecCreateShortBtn'), 'v12-btn-primary v12-btn-compact v13-rec-short-btn');
          btn.type = 'button';
          btn.dataset.recId = String(rec.id || '');
          btn.disabled = busyYt;
          btn.addEventListener('click', async () => {
            if (busyYt) return;
            busyYt = true;
            ytNotice = { text: '', kind: '' };
            try {
              if (isLocalDemo()) {
                onOpenShorts?.(null, rec);
              } else {
                const res = await req('POST', '/youtube/recommend-to-short', { recommendationId: rec.id });
                const createdId = res?.workflow?.id || res?.id || null;
                onOpenShorts?.(createdId, rec);
              }
            } catch (err) {
              ytNotice = { text: err.message, kind: 'error' };
              if (activePanel === 'youtube') renderYoutubePanel();
            } finally {
              busyYt = false;
            }
          });

          card.append(body, btn);
          recGrid.append(card);
        }
        recSec.append(recGrid);
      }
      content.append(recSec);

      // Top Videos vs Weak Videos (2-col)
      const vidGrid = el('div', null, 'v12-two-col');
      const filterCh = selectedYtChannel;
      const topList = (yt.topVideos || []).filter(v => !filterCh || !v.channel || v.channel === filterCh);
      const weakList = (yt.weakVideos || []).filter(v => !filterCh || !v.channel || v.channel === filterCh);
      renderVideoTable(vidGrid, t('v13.ytTopVideosTitle'), topList, 'v13YtTopTable');
      renderVideoTable(vidGrid, t('v13.ytWeakVideosTitle'), weakList, 'v13YtWeakTable');
      content.append(vidGrid);

      // Collapsible YouTube Source & 00:00 Settings
      const cfg = yt.config || {};
      const det = el('details', null, 'v12-disclosure');
      det.append(el('summary', t('v13.ytConfigSummary')));
      const detBody = el('div', null, 'v12-disclosure-body');

      // Masked API key status bar
      const keyRow = el('div', null, 'v12-key-row');
      keyRow.append(el(
        'span',
        cfg.hasYoutubeApiKey
          ? t('v13.ytConfigKeySet', { hint: cfg.keyHint || '...****' })
          : t('v13.ytConfigKeyNone'),
        'v12-pill ' + (cfg.hasYoutubeApiKey ? 'pos' : '')
      ));
      if (cfg.hasYoutubeApiKey) {
        const clearBtn = el('button', t('v13.ytConfigClearKey'), 'v12-btn-compact v12-btn-danger');
        clearBtn.type = 'button';
        clearBtn.disabled = busyYt;
        clearBtn.addEventListener('click', async () => {
          if (busyYt) return;
          busyYt = true;
          try {
            if (isLocalDemo()) {
              demoState.yt.config.hasYoutubeApiKey = false;
              demoState.yt.config.keyHint = '';
            } else {
              await req('POST', '/youtube/config', { clearYoutubeApiKey: true });
              await fetchYoutubeLive();
            }
            ytNotice = { text: t('v13.ytConfigSaved'), kind: 'ok' };
          } catch (err) {
            ytNotice = { text: err.message, kind: 'error' };
          } finally {
            busyYt = false;
            if (activePanel === 'youtube') renderYoutubePanel();
          }
        });
        keyRow.append(clearBtn);
      }
      detBody.append(keyRow);

      const form = el('form');
      const autoRow = el('label', null, 'v12-check-row');
      autoRow.append(el('span', t('v13.ytConfigAutoMidnight')));
      const autoInput = el('input');
      autoInput.type = 'checkbox';
      autoInput.id = 'v13YtAutoMidnight';
      autoInput.checked = Boolean(cfg.autoMidnight ?? yt.autoMidnight ?? true);
      autoRow.append(autoInput);

      const fGrid = el('div', null, 'v12-form-grid');
      const chFiltWrap = el('div', null, 'v12-field');
      const chFiltLbl = el('label', t('v13.ytConfigChannelFilter'));
      chFiltLbl.htmlFor = 'v13YtCfgChannelFilter';
      const chFiltInput = el('input');
      chFiltInput.type = 'text';
      chFiltInput.id = 'v13YtCfgChannelFilter';
      chFiltInput.value = cfg.channelFilter || '';
      chFiltWrap.append(chFiltLbl, chFiltInput);

      const pyWrap = el('div', null, 'v12-field');
      const pyLbl = el('label', t('v13.ytConfigPythonPath'));
      pyLbl.htmlFor = 'v13YtCfgPythonPath';
      const pyInput = el('input');
      pyInput.type = 'text';
      pyInput.id = 'v13YtCfgPythonPath';
      pyInput.value = cfg.pythonPath || '';
      pyWrap.append(pyLbl, pyInput);

      const cidWrap = el('div', null, 'v12-field');
      const cidLbl = el('label', t('v13.ytConfigChannelId'));
      cidLbl.htmlFor = 'v13YtCfgChannelId';
      const cidInput = el('input');
      cidInput.type = 'text';
      cidInput.id = 'v13YtCfgChannelId';
      cidInput.value = cfg.youtubeChannelId || '';
      cidWrap.append(cidLbl, cidInput);

      const apiWrap = el('div', null, 'v12-field');
      const apiLbl = el('label', t('v13.ytConfigApiKey'));
      apiLbl.htmlFor = 'v13YtCfgApiKey';
      const apiInput = el('input');
      apiInput.type = 'password';
      apiInput.id = 'v13YtCfgApiKey';
      apiInput.autocomplete = 'off';
      apiWrap.append(apiLbl, apiInput);

      fGrid.append(chFiltWrap, pyWrap, cidWrap, apiWrap);

      const saveBtn = el('button', t('v13.ytConfigSaveBtn'), 'v12-btn-primary');
      saveBtn.type = 'submit';
      saveBtn.id = 'v13YtSaveConfig';
      saveBtn.style.marginTop = '12px';
      saveBtn.disabled = busyYt;

      form.addEventListener('submit', async e => {
        e.preventDefault();
        if (busyYt) return;
        const payload = {
          enabled: true,
          autoMidnight: autoInput.checked,
          channelFilter: chFiltInput.value.trim(),
          pythonPath: pyInput.value.trim(),
          youtubeChannelId: cidInput.value.trim()
        };
        const rawKey = apiInput.value.trim();
        if (rawKey) payload.youtubeApiKey = rawKey;
        busyYt = true;
        ytNotice = { text: '', kind: '' };
        try {
          if (isLocalDemo()) {
            demoState.yt.autoMidnight = payload.autoMidnight;
            demoState.yt.config = {
              ...demoState.yt.config,
              ...payload,
              hasYoutubeApiKey: Boolean(rawKey || demoState.yt.config.hasYoutubeApiKey),
              keyHint: rawKey ? ('...' + rawKey.slice(-4)) : demoState.yt.config.keyHint
            };
          } else {
            await req('POST', '/youtube/config', payload);
            await fetchYoutubeLive();
          }
          ytNotice = { text: t('v13.ytConfigSaved'), kind: 'ok' };
        } catch (err) {
          ytNotice = { text: err.message, kind: 'error' };
        } finally {
          busyYt = false;
          if (activePanel === 'youtube') renderYoutubePanel();
        }
      });

      form.append(autoRow, fGrid, saveBtn);
      detBody.append(form);
      det.append(detBody);
      content.append(det);
    }

    // ===== PANEL B: DIRECT FULL-ACCESS AI AGENT PROMPT RUNNER =====
    function startDemoPromptStream(run) {
      if (demoStreamTimer) clearInterval(demoStreamTimer);
      const chunks = [
        `[${run.agentName}] Mode: ${run.fullAccess ? 'FULL ACCESS' : 'PLAN'} · cwd: ${run.cwd || '<workspace>'}\n`,
        `> Menerima instruksi Bos: "${run.prompt.slice(0, 120)}"\n\n`,
        '1. Memeriksa struktur proyek & konteks aturan lokal…\n',
        '2. Menjalankan analisis tanpa hambatan konfirmasi…\n',
        '3. Ringkasan simulasi demo selesai (0 galat). Beralih ke mode LIVE untuk mengeksekusi CLI lokal nyata.\n'
      ];
      let idx = 0;
      onPromptRun?.({
        type: 'prompt_run_started',
        runId: run.id,
        agentId: run.agentId,
        agentName: run.agentName,
        provider: run.provider,
        run
      });
      demoStreamTimer = setInterval(() => {
        if (run.status !== 'running') {
          clearInterval(demoStreamTimer);
          demoStreamTimer = null;
          return;
        }
        if (idx < chunks.length) {
          const chunk = chunks[idx++];
          run.output += chunk;
          updateLiveConsoleInPlace(run);
        } else {
          clearInterval(demoStreamTimer);
          demoStreamTimer = null;
          run.status = 'done';
          run.exitCode = 0;
          run.finishedAt = new Date().toISOString();
          run.durationMs = Math.max(400, Date.now() - Date.parse(run.startedAt));
          updateSidebar();
          onPromptRun?.({
            type: 'prompt_run_done',
            runId: run.id,
            agentId: run.agentId,
            agentName: run.agentName,
            provider: run.provider,
            exitCode: 0,
            run
          });
          if (activePanel === 'prompt' && $('panel')?.open) renderPromptPanel();
        }
      }, 280);
    }

    function updateLiveConsoleInPlace(run) {
      const pre = $('v13PromptConsole');
      if (pre && selectedRunId === run.id) {
        pre.classList.toggle('empty', !run.output);
        pre.textContent = run.output || t('v13.promptConsoleEmpty');
        pre.scrollTop = pre.scrollHeight;
      }
    }

    function formatRunStatusBadge(run) {
      if (!run) return { text: '', cls: '' };
      const st = run.status;
      if (st === 'running') {
        return { text: t('v13.promptStatusRunning', { agent: run.agentName || run.agentId }), cls: 'warn is-live' };
      }
      if (st === 'rate_limited' || run.limitDetected) {
        return {
          text: run.retryAfter
            ? t('agent14.statusLimitRetry', { retry: run.retryAfter })
            : t('agent14.statusLimit'),
          cls: 'warn'
        };
      }
      if (st === 'timed_out') {
        return { text: t('agent14.statusTimeout'), cls: 'neg' };
      }
      if (st === 'cancelled' || st === 'interrupted') {
        return { text: t('v13.promptStatusCancelled'), cls: 'neg' };
      }
      if (st === 'failed' || st === 'error' || (run.exitCode !== null && Number(run.exitCode) !== 0)) {
        return { text: t('v13.promptStatusFailed', { code: run.exitCode ?? 1 }), cls: 'neg' };
      }
      const sec = ((Number(run.durationMs || 0)) / 1000).toFixed(1);
      return { text: t('v13.promptStatusDone', { code: run.exitCode ?? 0, duration: sec }), cls: 'pos' };
    }

    // [Diubah oleh Gemini - 2026-11-21] Bangun pratinjau perintah aktual sesuai penyedia, model, effort, dan status Full Access
    const CODEX_PREVIEW_ALIASES = {
      'sol-m': ['gpt-6.1-sol', 'medium'],
      'sol-h': ['gpt-6.1-sol', 'high'],
      'sol-xh': ['gpt-6.1-sol', 'xhigh'],
      'astra-h': ['gpt-6-astra', 'high'],
      'astra-xh': ['gpt-6-astra', 'xhigh']
    };

    function buildClientCommandPreview(agent, modelStr, isFullAccess, effortStr = '') {
      if (!agent) return '';
      const raw = String(modelStr || '').trim();
      const eff = String(effortStr || '').trim().toLowerCase();
      if (agent.id === 'claude') {
        const flags = ['-p "<prompt>"', '--output-format text'];
        if (raw) flags.push('--model ' + raw);
        if (eff) flags.push('--effort ' + eff);
        flags.push(isFullAccess ? '--dangerously-skip-permissions' : '--permission-mode plan');
        return 'claude ' + flags.join(' ');
      }
      if (agent.id === 'codex') {
        const al = CODEX_PREVIEW_ALIASES[raw.toLowerCase()];
        const m = al ? al[0] : raw;
        const e = eff || (al ? al[1] : '');
        const flags = ['exec', '--skip-git-repo-check', '--color never'];
        if (m) flags.push('-m ' + m);
        if (e) flags.push('-c model_reasoning_effort="' + e + '"');
        flags.push(isFullAccess ? '--dangerously-bypass-approvals-and-sandbox' : '--sandbox read-only');
        flags.push('- < prompt');
        return 'codex ' + flags.join(' ');
      }
      if (agent.id === 'antigravity') {
        const m = raw || agent.defaultModel || 'gemini-4-argon-high';
        return `agy -p "<prompt>" --output-format text --model ${m} ${isFullAccess ? '--dangerously-skip-permissions' : '--mode plan --sandbox'}`;
      }
      if (agent.id === 'opencode') {
        const m = raw ? (raw.includes('/') ? raw : 'opencode-go/' + raw) : (agent.defaultModel || 'opencode-go/claude-haiku-5-5');
        return `opencode run -m ${m}${isFullAccess ? ' --auto' : ''} "<prompt>"`;
      }
      if (agent.id === 'hermes') {
        const e = eff || 'medium';
        const flags = [`chat -Q --oneshot --reasoning ${e}`];
        if (raw) flags.push('-m ' + raw);
        if (isFullAccess) flags.push('--yolo');
        flags.push('--query-file - < prompt');
        return 'hermes ' + flags.join(' ');
      }
      return `POST generativelanguage.googleapis.com (${raw || agent.defaultModel || 'gemini-2.5-flash'})`;
    }

    function agentBadgeInfo(ag) {
      if (ag.kind === 'api') {
        return ag.available
          ? { text: t('agent14.badgeKeyReady'), cls: 'pos' }
          : { text: t('agent14.badgeKeyMissing'), cls: 'warn' };
      }
      if (ag.status === 'service_offline') {
        return { text: t('agent14.badgeServiceOffline'), cls: 'warn' };
      }
      if (ag.status === 'rate_limited') {
        return { text: t('agent14.badgeLimit'), cls: 'warn' };
      }
      return ag.available
        ? { text: t('v13.promptBadgeInstalled'), cls: 'pos' }
        : { text: t('v13.promptBadgeMissing'), cls: 'neg' };
    }

    function agentReasonText(ag) {
      if (!ag) return '';
      switch (ag.statusReasonCode) {
        case 'ready_byok':
          return t('agent14.reasonReadyByok', { hint: ag.byokHint || '****' });
        case 'byok_key_missing':
          return t('agent14.reasonKeyMissing');
        case 'override_not_found':
          return t('agent14.reasonOverrideMissing');
        case 'cli_missing':
          return t('agent14.reasonCliMissing');
        case 'hermes_9router_offline':
          return t('agent14.reasonHermesOffline');
        case 'recent_limit':
          return ag.recentLimit?.retryAfter
            ? t('agent14.reasonRecentLimitRetry', { retry: ag.recentLimit.retryAfter })
            : t('agent14.reasonRecentLimit');
        default:
          return t('agent14.reasonReadyCli');
      }
    }

    function billingLabel(billingType) {
      const map = {
        subscription_claude: 'agent14.billingSubscriptionClaude',
        subscription_chatgpt: 'agent14.billingSubscriptionChatgpt',
        quota_antigravity: 'agent14.billingQuotaAntigravity',
        subscription_opencode: 'agent14.billingSubscriptionOpencode',
        local_9router: 'agent14.billingLocalRouter',
        byok_payg: 'agent14.billingByokPayg'
      };
      return map[billingType] ? t(map[billingType]) : '';
    }

    function formatModelCostHint(catalog, modelId, agent) {
      const bill = billingLabel(catalog?.billingType || agent?.billingType || '');
      let foundModel = null;
      const targetId = String(modelId || catalog?.defaultModel || agent?.defaultModel || '').trim();
      for (const g of (catalog?.groups || [])) {
        const hit = (g.models || []).find(m => m.id === targetId || m.model === targetId);
        if (hit) { foundModel = hit; break; }
      }
      const p = foundModel?.pricing || null;
      if (p && Number.isFinite(p.inputUsd) && Number.isFinite(p.outputUsd)) {
        const rateStr = t('agent14.costRatePair', {
          inUsd: p.inputUsd,
          outUsd: p.outputUsd,
          inIdr: I18n.moneyIDR(p.inputIdr),
          outIdr: I18n.moneyIDR(p.outputIdr)
        });
        return t('agent14.costEstimateLabel', { detail: bill ? `${bill} · ${rateStr}` : rateStr });
      }
      return bill ? t('agent14.costEstimateLabel', { detail: bill }) : '';
    }

    function persistAgentSelectionAsync(agentId, modelVal, effortVal) {
      savedSelectionByAgent[agentId] = { model: modelVal || '', effort: effortVal || '' };
      if (!isLocalDemo()) {
        req('POST', '/prompt/config', {
          lastSelection: { [agentId]: { model: modelVal || '', effort: effortVal || '' } }
        }).catch(() => {});
      }
    }

    function scheduleValidateCwd(pathStr) {
      if (cwdValidateTimer) clearTimeout(cwdValidateTimer);
      const val = String(pathStr || '').trim();
      if (!val) {
        cwdValidation = null;
        const stEl = $('agent14CwdValidation');
        if (stEl) { stEl.textContent = ''; stEl.className = 'agent14-cwd-status'; }
        return;
      }
      if (/(?:^|[\\/])(secrets|\.git|\.env)(?:[\\/]|$)/i.test(val)) {
        cwdValidation = { valid: false, blocked: true, reasonCode: 'blocked_sensitive' };
        const stEl = $('agent14CwdValidation');
        if (stEl) { stEl.textContent = t('agent14.cwdBlockedErr'); stEl.className = 'agent14-cwd-status err'; }
        return;
      }
      if (isLocalDemo()) {
        cwdValidation = { valid: true, blocked: false, reasonCode: 'ok' };
        const stEl = $('agent14CwdValidation');
        if (stEl) { stEl.textContent = t('agent14.cwdValidOk'); stEl.className = 'agent14-cwd-status ok'; }
        return;
      }
      cwdValidateTimer = setTimeout(async () => {
        const res = await req('POST', '/prompt/validate-cwd', { cwd: val }).catch(() => null);
        if (!res) return;
        cwdValidation = res;
        const stEl = $('agent14CwdValidation');
        if (stEl) {
          if (res.valid) {
            stEl.textContent = t('agent14.cwdValidOk');
            stEl.className = 'agent14-cwd-status ok';
          } else if (res.blocked) {
            stEl.textContent = t('agent14.cwdBlockedErr');
            stEl.className = 'agent14-cwd-status err';
          } else {
            stEl.textContent = t('agent14.cwdNotFoundErr');
            stEl.className = 'agent14-cwd-status err';
          }
        }
      }, 220);
    }

    function renderPromptPanel() {
      const content = $('panelContent');
      if (!content) return;
      content.replaceChildren();
      content.classList.add('v12-panel');

      const { prompt } = currentData();
      const agents = prompt.agents && prompt.agents.length ? prompt.agents : DEFAULT_AGENTS;
      if (!agents.some(a => a.id === selectedAgentId)) selectedAgentId = agents[0].id;
      const selectedAgent = agents.find(a => a.id === selectedAgentId) || agents[0];
      const catalog = (prompt.modelsByAgent && prompt.modelsByAgent[selectedAgent.id]) || null;
      const allRuns = prompt.runs || [];
      const activeRun = findRun(selectedRunId);
      if (activeRun && !selectedRunId) selectedRunId = activeRun.id;
      const runningRun = (activeRun && activeRun.status === 'running')
        ? activeRun
        : (allRuns.find(r => r.status === 'running') || null);
      const isRunning = Boolean(sendingPrompt || runningRun);
      const isCancelling = Boolean(cancellingRunId);

      if (promptNotice.text) {
        const note = el('div', promptNotice.text, 'v12-notice' + (promptNotice.kind ? ' ' + promptNotice.kind : ''));
        note.setAttribute('role', 'status');
        content.append(note);
      }

      // Section 1: Agent Selector Strip + Real Status & Connection Test + Integration / Executable Override
      const agSec = el('section', null, 'v12-section');
      const agHead = el('div', null, 'v12-section-head');
      const agHeadLeft = el('div');
      agHeadLeft.append(
        el('h3', t('v13.promptAgentsTitle')),
        el('span', t('v13.promptAgentsSubtitle'), 'v12-muted')
      );
      const agHeadTools = el('div', null, 'v12-btn-row');
      const redetectBtn = el('button', t('agent14.refreshAgentsBtn'), 'v12-btn-compact');
      redetectBtn.type = 'button';
      redetectBtn.id = 'agent14RefreshAgentsBtn';
      redetectBtn.addEventListener('click', async () => {
        if (isLocalDemo()) return;
        redetectBtn.disabled = true;
        await fetchPromptLive({ refreshAgents: true });
        if (activePanel === 'prompt') renderPromptPanel();
      });
      agHeadTools.append(redetectBtn);
      agHead.append(agHeadLeft, agHeadTools);
      agSec.append(agHead);

      const agGrid = el('div', null, 'v13-agent-grid');
      agGrid.id = 'v13PromptAgentGrid';
      for (const ag of agents) {
        const card = el('button', null, 'v13-agent-card');
        card.type = 'button';
        card.dataset.agentId = ag.id;
        card.setAttribute('aria-pressed', String(selectedAgentId === ag.id));
        const top = el('div', null, 'v13-agent-card-top');
        top.append(el('span', ag.name, 'v13-agent-name'));
        const badge = agentBadgeInfo(ag);
        top.append(el('span', badge.text, 'v12-pill ' + badge.cls));

        const subRow = el('div', null, 'agent14-agent-sub');
        const subLeft = ag.kind === 'api'
          ? (ag.available ? (ag.byokHint || 'REST API') : t('agent14.badgeKeyMissing'))
          : (ag.detail || ag.command || ag.id);
        subRow.append(el('span', subLeft, 'v13-agent-cmd'));
        if (ag.version) {
          subRow.append(el('span', ag.version.slice(0, 22), 'agent14-ver-tag'));
        }
        card.append(top, subRow);
        card.addEventListener('click', () => {
          selectedAgentId = ag.id;
          applySavedSelectionForAgent(ag.id);
          if (!isLocalDemo() && !state.prompt.modelsByAgent[ag.id]) {
            fetchAgentModelsLive(ag.id).then(() => {
              if (activePanel === 'prompt' && $('panel')?.open) renderPromptPanel();
            });
          }
          renderPromptPanel();
        });
        agGrid.append(card);
      }
      agSec.append(agGrid);

      // Selected Agent Real Status Bar + Connection Test + Integration Settings / Executable Path
      const statusBar = el('div', null, 'agent14-status-bar');
      statusBar.id = 'agent14AgentStatusBar';
      const stTop = el('div', null, 'agent14-status-top');
      const stMeta = el('div', null, 'agent14-status-meta');
      const verSuffix = selectedAgent.version ? ` · ${selectedAgent.version}` : '';
      stMeta.append(
        el('strong', `${selectedAgent.name}${verSuffix}`),
        el('span', agentReasonText(selectedAgent))
      );
      if (selectedAgent.resolvedPathDisplay) {
        stMeta.append(el('span', t('agent14.pathDetected', { path: selectedAgent.resolvedPathDisplay })));
      }

      const stActions = el('div', null, 'v12-btn-row');
      const testBtn = el(
        'button',
        testingAgentId === selectedAgent.id ? t('agent14.testingConnBtn') : t('agent14.testConnBtn'),
        'v12-btn-compact'
      );
      testBtn.type = 'button';
      testBtn.id = 'agent14TestConnBtn';
      testBtn.disabled = Boolean(testingAgentId) || isRunning;
      testBtn.addEventListener('click', async () => {
        if (testingAgentId) return;
        testingAgentId = selectedAgent.id;
        promptNotice = { text: '', kind: '' };
        renderPromptPanel();
        try {
          if (isLocalDemo()) {
            selectedAgent.lastTest = {
              ok: true,
              latencyMs: 120,
              snippet: 'siap (demo)',
              testedAt: new Date().toISOString()
            };
          } else {
            const res = await req('POST', '/prompt/test', {
              agentId: selectedAgent.id,
              model: promptModel,
              effort: promptEffort,
              cwd: promptCwd || prompt.defaultCwd || ''
            });
            selectedAgent.lastTest = res;
            await fetchPromptRunsOnly().catch(() => {});
          }
        } catch (err) {
          selectedAgent.lastTest = {
            ok: false,
            latencyMs: 0,
            error: err.message,
            testedAt: new Date().toISOString()
          };
        } finally {
          testingAgentId = null;
          if (activePanel === 'prompt') renderPromptPanel();
        }
      });
      stActions.append(testBtn);

      if (selectedAgent.kind === 'api') {
        const intBtn = el('button', t('agent14.openIntegrationBtn'), 'v12-btn-compact v12-btn-primary');
        intBtn.type = 'button';
        intBtn.id = 'agent14OpenIntegrationBtn';
        intBtn.addEventListener('click', () => {
          showIntegrationBox = !showIntegrationBox;
          renderPromptPanel();
        });
        stActions.append(intBtn);
      }

      if (typeof onOpenSetup === 'function') {
        const setupBtn = el('button', t('setup15.btnOpenSetup'), 'v12-btn-compact');
        setupBtn.type = 'button';
        setupBtn.id = 'agent15OpenSetupBtn';
        setupBtn.addEventListener('click', () => {
          close();
          onOpenSetup();
        });
        stActions.append(setupBtn);
      }

      const officeSetBtn = el('button', t('agent14.openOfficeSettingsBtn'), 'v12-btn-compact');
      officeSetBtn.type = 'button';
      officeSetBtn.id = 'agent14OpenSettingsBtn';
      officeSetBtn.addEventListener('click', () => {
        $('panel')?.close();
        $('settingsButton')?.click();
      });
      stActions.append(officeSetBtn);

      stTop.append(stMeta, stActions);
      statusBar.append(stTop);

      // [Diubah oleh Gemini - 2026-11-21] Panduan perbaikan yang bisa ditindaklanjuti saat agen belum terpasang/offline/limit/tanpa API key
      const fixKey =
        selectedAgent.status === 'service_offline'
          ? 'setup15.promptFix9Router'
          : selectedAgent.kind === 'api' && !selectedAgent.available
            ? 'setup15.promptFixApiKey'
            : !selectedAgent.available
              ? 'setup15.promptFixNotInstalled'
              : selectedAgent.lastTest?.status === 'rate_limited'
                ? 'setup15.promptFixLimit'
                : '';
      if (fixKey) {
        const fixBox = el('div', t(fixKey), 'v12-notice warn');
        fixBox.id = 'agent15FixHint';
        statusBar.append(fixBox);
      }

      if (selectedAgent.lastTest) {
        const lt = selectedAgent.lastTest;
        const trBox = el(
          'div',
          lt.ok
            ? t('agent14.testResultOk', { ms: lt.latencyMs || 0, snippet: lt.snippet || 'OK' })
            : t('agent14.testResultFail', { ms: lt.latencyMs || 0, reason: lt.error || lt.snippet || lt.status || 'Error' }),
          'agent14-test-result ' + (lt.ok ? 'is-ok' : 'is-fail')
        );
        trBox.id = 'agent14TestResult';
        statusBar.append(trBox);
      }

      // Inline Integration Settings (Gemini API BYOK Key)
      if (selectedAgent.kind === 'api' && (showIntegrationBox || !selectedAgent.available)) {
        const intDet = el('details', null, 'agent14-inline-details');
        intDet.id = 'agent14IntegrationDetails';
        intDet.open = showIntegrationBox || !selectedAgent.available;
        intDet.append(el('summary', t('agent14.integrationTitle')));
        const row = el('div', null, 'agent14-inline-row');
        const keyInp = el('input');
        keyInp.type = 'password';
        keyInp.id = 'agent14GeminiKeyInput';
        keyInp.autocomplete = 'off';
        keyInp.placeholder = t('agent14.integrationKeyInput');

        const saveKeyBtn = el('button', t('agent14.integrationSaveKey'), 'v12-btn-compact v12-btn-primary');
        saveKeyBtn.type = 'button';
        saveKeyBtn.id = 'agent14SaveGeminiKeyBtn';
        saveKeyBtn.addEventListener('click', async () => {
          const val = keyInp.value.trim();
          if (!val) return;
          saveKeyBtn.disabled = true;
          try {
            if (!isLocalDemo()) {
              await req('POST', '/workflows/config', { geminiApiKey: val });
              await fetchPromptLive({ refreshAgents: true });
            } else {
              selectedAgent.available = true;
              selectedAgent.status = 'byok_ready';
              selectedAgent.statusReasonCode = 'ready_byok';
              selectedAgent.byokHint = '...' + val.slice(-4);
            }
            promptNotice = { text: t('agent14.integrationSaved'), kind: 'ok' };
            showIntegrationBox = false;
          } catch (err) {
            promptNotice = { text: err.message, kind: 'error' };
          } finally {
            if (activePanel === 'prompt') renderPromptPanel();
          }
        });
        row.append(keyInp, saveKeyBtn);

        if (selectedAgent.available) {
          const clearKeyBtn = el('button', t('agent14.integrationClearKey'), 'v12-btn-compact v12-btn-danger');
          clearKeyBtn.type = 'button';
          clearKeyBtn.id = 'agent14ClearGeminiKeyBtn';
          clearKeyBtn.addEventListener('click', async () => {
            clearKeyBtn.disabled = true;
            try {
              if (!isLocalDemo()) {
                await req('POST', '/workflows/config', { clearGeminiKey: true });
                await fetchPromptLive({ refreshAgents: true });
              } else {
                selectedAgent.available = false;
                selectedAgent.status = 'byok_missing';
                selectedAgent.statusReasonCode = 'byok_key_missing';
                selectedAgent.byokHint = '';
              }
              promptNotice = { text: t('agent14.integrationCleared'), kind: 'ok' };
            } catch (err) {
              promptNotice = { text: err.message, kind: 'error' };
            } finally {
              if (activePanel === 'prompt') renderPromptPanel();
            }
          });
          row.append(clearKeyBtn);
        }
        intDet.append(row);
        statusBar.append(intDet);
      }

      // Manual Executable Path Override for CLI agents
      if (selectedAgent.kind === 'cli') {
        const execDet = el('details', null, 'agent14-inline-details');
        execDet.id = 'agent14ExecOverrideDetails';
        if (!selectedAgent.available) execDet.open = true;
        execDet.append(el('summary', t('agent14.execOverrideTitle', { agent: selectedAgent.name })));
        const row = el('div', null, 'agent14-inline-row');
        const execInp = el('input');
        execInp.type = 'text';
        execInp.id = 'agent14ExecOverrideInput';
        execInp.value = selectedAgent.executableOverride || '';
        execInp.placeholder = t('agent14.execOverridePlaceholder');

        const saveExecBtn = el('button', t('agent14.execOverrideSave'), 'v12-btn-compact v12-btn-primary');
        saveExecBtn.type = 'button';
        saveExecBtn.id = 'agent14SaveExecOverrideBtn';
        saveExecBtn.addEventListener('click', async () => {
          saveExecBtn.disabled = true;
          try {
            if (!isLocalDemo()) {
              await req('POST', '/prompt/config', { executableOverrides: { [selectedAgent.id]: execInp.value.trim() } });
              await fetchPromptLive({ refreshAgents: true });
            }
            promptNotice = { text: t('agent14.execOverrideSaved'), kind: 'ok' };
          } catch (err) {
            promptNotice = { text: err.message, kind: 'error' };
          } finally {
            if (activePanel === 'prompt') renderPromptPanel();
          }
        });

        const resetExecBtn = el('button', t('agent14.execOverrideReset'), 'v12-btn-compact');
        resetExecBtn.type = 'button';
        resetExecBtn.id = 'agent14ResetExecOverrideBtn';
        resetExecBtn.addEventListener('click', async () => {
          resetExecBtn.disabled = true;
          try {
            if (!isLocalDemo()) {
              await req('POST', '/prompt/config', { executableOverrides: { [selectedAgent.id]: '' } });
              await fetchPromptLive({ refreshAgents: true });
            }
            promptNotice = { text: t('agent14.execOverrideSaved'), kind: 'ok' };
          } catch (err) {
            promptNotice = { text: err.message, kind: 'error' };
          } finally {
            if (activePanel === 'prompt') renderPromptPanel();
          }
        });

        row.append(execInp, saveExecBtn, resetExecBtn);
        execDet.append(row);
        statusBar.append(execDet);
      }

      agSec.append(statusBar);
      content.append(agSec);

      // Section 2: Boss Prompt Composer + Full Access + Risk Notice + Preview + Quick CWD + Hierarchical Model Picker + Effort + Cost
      const compSec = el('section', null, 'v12-section');
      const compForm = el('form');

      const faBar = el('div', null, 'v12-key-row');
      faBar.style.marginBottom = '10px';
      const faLbl = el('label', null, 'v12-check-row');
      faLbl.style.flex = '1';
      faLbl.style.padding = '0';
      faLbl.append(el('span', t('v13.promptFullAccessLabel')));
      const faInput = el('input');
      faInput.type = 'checkbox';
      faInput.id = 'v13PromptFullAccess';
      faInput.checked = promptFullAccess;
      faInput.disabled = selectedAgent && selectedAgent.supportsFullAccess === false;

      const updatePreviewAndRisk = () => {
        const badge = $('v13PromptFaBadge');
        const effectiveFa = Boolean(faInput.checked && selectedAgent?.supportsFullAccess !== false);
        if (badge) {
          badge.textContent = t(effectiveFa ? 'v13.promptFullAccessBadgeOn' : 'v13.promptFullAccessBadgeOff');
          badge.className = 'v12-pill ' + (effectiveFa ? 'warn' : 'pos');
        }
        const riskBox = $('agent14FullAccessRisk');
        if (riskBox) {
          riskBox.className = 'agent14-risk-box ' + (effectiveFa ? 'is-warn' : 'is-safe');
          riskBox.textContent = effectiveFa
            ? t('agent14.fullAccessRiskOn', { flag: selectedAgent?.fullAccessFlagsOn || 'Full Access' })
            : t('agent14.fullAccessRiskOff', { flag: selectedAgent?.fullAccessFlagsOff || 'Plan / Read-Only' });
        }
        const cmdPrev = $('agent14CommandPreview');
        if (cmdPrev) {
          cmdPrev.textContent = buildClientCommandPreview(selectedAgent, promptModel, effectiveFa, promptEffort);
        }
        const costEl = $('agent14CostHint');
        if (costEl) {
          costEl.textContent = formatModelCostHint(catalog, promptModel, selectedAgent);
        }
      };

      faInput.addEventListener('change', () => {
        promptFullAccess = faInput.checked;
        updatePreviewAndRisk();
      });
      faLbl.append(faInput);
      const effectiveFaInit = Boolean(promptFullAccess && selectedAgent?.supportsFullAccess !== false);
      const faBadge = el(
        'span',
        t(effectiveFaInit ? 'v13.promptFullAccessBadgeOn' : 'v13.promptFullAccessBadgeOff'),
        'v12-pill ' + (effectiveFaInit ? 'warn' : 'pos')
      );
      faBadge.id = 'v13PromptFaBadge';
      faBar.append(faLbl, faBadge);
      compForm.append(faBar);

      // Penjelasan risiko Full Access + pratinjau perintah CLI nyata
      const riskBox = el(
        'div',
        effectiveFaInit
          ? t('agent14.fullAccessRiskOn', { flag: selectedAgent?.fullAccessFlagsOn || 'Full Access' })
          : t('agent14.fullAccessRiskOff', { flag: selectedAgent?.fullAccessFlagsOff || 'Plan / Read-Only' }),
        'agent14-risk-box ' + (effectiveFaInit ? 'is-warn' : 'is-safe')
      );
      riskBox.id = 'agent14FullAccessRisk';
      compForm.append(riskBox);

      const cmdBar = el('div', null, 'agent14-cmd-bar');
      cmdBar.append(el('span', t('agent14.cmdPreviewLabel'), 'v12-muted'));
      const cmdCode = el('code', buildClientCommandPreview(selectedAgent, promptModel, effectiveFaInit, promptEffort));
      cmdCode.id = 'agent14CommandPreview';
      cmdBar.append(cmdCode);
      compForm.append(cmdBar);

      const fGrid = el('div', null, 'v12-form-grid');

      // Working Directory: Quick Selector + Input + Live Path Validation
      const cwdWrap = el('div', null, 'v12-field');
      const cwdLbl = el('label', t('v13.promptFieldCwd'));
      cwdLbl.htmlFor = 'v13PromptCwd';
      const cwdStack = el('div', null, 'agent14-cwd-stack');

      const cwdSel = el('select');
      cwdSel.id = 'agent14CwdPreset';
      cwdSel.setAttribute('aria-label', t('agent14.cwdQuickLabel'));
      const cwdOptions = Array.isArray(prompt.cwdOptions) ? prompt.cwdOptions : [];
      const curCwdVal = promptCwd || prompt.defaultCwd || '';
      const cwdGroups = [
        ['project', t('agent14.cwdGroupProject')],
        ['channels', t('agent14.cwdGroupChannels')],
        ['workspaces', t('agent14.cwdGroupWorkspaces')],
        ['recent', t('agent14.cwdGroupRecent')]
      ];
      // [Diubah oleh Gemini - 2026-11-21] Normalisasi pemisah path (/ vs \) agar pilihan cepat cwd selalu cocok di Windows
      const normPathKey = p => String(p || '').trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
      const curCwdKey = normPathKey(curCwdVal);
      let cwdMatchedPath = '';
      for (const [gk, glabel] of cwdGroups) {
        const items = cwdOptions.filter(o => o.group === gk);
        if (!items.length) continue;
        const og = el('optgroup');
        og.label = glabel;
        for (const it of items) {
          const opt = el('option', `${it.label} — ${it.displayPath || it.path}`);
          opt.value = it.path;
          if (!cwdMatchedPath && normPathKey(it.path) === curCwdKey) cwdMatchedPath = it.path;
          og.append(opt);
        }
        cwdSel.append(og);
      }
      const cwdCustomOpt = el('option', t('agent14.cwdCustomOption'));
      cwdCustomOpt.value = '__custom__';
      cwdSel.append(cwdCustomOpt);
      cwdSel.value = cwdMatchedPath || '__custom__';

      const cwdInput = el('input');
      cwdInput.type = 'text';
      cwdInput.id = 'v13PromptCwd';
      cwdInput.value = curCwdVal;

      const cwdStatus = el('span', '', 'agent14-cwd-status');
      cwdStatus.id = 'agent14CwdValidation';
      if (cwdValidation) {
        cwdStatus.textContent = cwdValidation.valid
          ? t('agent14.cwdValidOk')
          : cwdValidation.blocked ? t('agent14.cwdBlockedErr') : t('agent14.cwdNotFoundErr');
        cwdStatus.className = 'agent14-cwd-status ' + (cwdValidation.valid ? 'ok' : 'err');
      }

      cwdSel.addEventListener('change', () => {
        if (cwdSel.value !== '__custom__') {
          promptCwd = cwdSel.value;
          cwdInput.value = promptCwd;
          scheduleValidateCwd(promptCwd);
          if (!isLocalDemo()) {
            req('POST', '/prompt/config', { lastCwd: promptCwd }).catch(() => {});
          }
        }
      });
      cwdInput.addEventListener('input', () => {
        promptCwd = cwdInput.value;
        const hit = cwdOptions.find(o => normPathKey(o.path) === normPathKey(promptCwd));
        cwdSel.value = hit ? hit.path : '__custom__';
        scheduleValidateCwd(promptCwd);
      });

      cwdStack.append(cwdSel, cwdInput, cwdStatus);
      cwdWrap.append(cwdLbl, cwdStack);

      // Hierarchical Searchable Model Picker + Refresh + Effort + Cost Estimate
      const modWrap = el('div', null, 'v12-field');
      const modBox = el('div', null, 'agent14-model-box');
      const modHead = el('div', null, 'agent14-model-head');
      const modLbl = el('label', t('v13.promptFieldModel'));
      modLbl.htmlFor = 'agent14ModelSelect';
      const modRefreshBtn = el('button', t('agent14.modelRefreshBtn'), 'v12-btn-compact');
      modRefreshBtn.type = 'button';
      modRefreshBtn.id = 'agent14RefreshModelsBtn';
      modRefreshBtn.disabled = refreshingModels || isLocalDemo();
      modRefreshBtn.addEventListener('click', async () => {
        if (refreshingModels || isLocalDemo()) return;
        refreshingModels = true;
        renderPromptPanel();
        try {
          await fetchAgentModelsLive(selectedAgent.id, { forceRefresh: true });
        } finally {
          refreshingModels = false;
          if (activePanel === 'prompt') renderPromptPanel();
        }
      });
      modHead.append(modLbl, modRefreshBtn);

      const modControls = el('div', null, 'agent14-model-controls');
      const modSearch = el('input');
      modSearch.type = 'search';
      modSearch.id = 'agent14ModelSearch';
      modSearch.placeholder = t('agent14.modelSearchPlaceholder');
      modSearch.value = promptModelSearch;

      const modSelect = el('select');
      modSelect.id = 'agent14ModelSelect';

      const allCatalogModels = [];
      for (const g of (catalog?.groups || [])) {
        for (const m of (g.models || [])) allCatalogModels.push(m);
      }

      const populateModelOptions = filterText => {
        const needle = String(filterText || '').trim().toLowerCase();
        modSelect.replaceChildren();

        const defModelName = catalog?.defaultModel || selectedAgent?.defaultModel || '';
        const optDef = el(
          'option',
          defModelName
            ? t('agent14.modelAgentDefault', { model: defModelName })
            : t('agent14.modelAgentDefaultPlain')
        );
        optDef.value = '';
        modSelect.append(optDef);

        let matched = promptModel === '';
        for (const g of (catalog?.groups || [])) {
          const filtered = (g.models || []).filter(m => {
            if (!needle) return true;
            return (
              String(m.id || '').toLowerCase().includes(needle) ||
              String(m.label || '').toLowerCase().includes(needle) ||
              String(m.model || '').toLowerCase().includes(needle)
            );
          });
          if (!filtered.length) continue;
          const og = el('optgroup');
          og.label = g.label || g.id;
          for (const m of filtered) {
            const o = el('option', m.label ? `${m.label} (${m.id})` : m.id);
            o.value = m.id;
            if (m.effort) o.dataset.effort = m.effort;
            if (m.id === promptModel) matched = true;
            og.append(o);
          }
          modSelect.append(og);
        }

        const optCustom = el('option', t('agent14.modelCustomOption'));
        optCustom.value = '__custom__';
        modSelect.append(optCustom);

        if (promptCustomModelMode || (promptModel && !matched)) {
          modSelect.value = '__custom__';
        } else {
          modSelect.value = promptModel || '';
        }
      };

      populateModelOptions(promptModelSearch);

      // Keep #v13PromptModel in DOM (visible when custom entry selected, or synced seamlessly for backward compatibility)
      const modInput = el('input');
      modInput.type = 'text';
      modInput.id = 'v13PromptModel';
      modInput.value = promptModel;
      modInput.placeholder = selectedAgent?.defaultModel
        ? t('agent14.modelDefaultPlaceholder', { model: selectedAgent.defaultModel })
        : '';
      modInput.hidden = modSelect.value !== '__custom__';

      modSearch.addEventListener('input', () => {
        promptModelSearch = modSearch.value;
        populateModelOptions(promptModelSearch);
      });

      modSelect.addEventListener('change', () => {
        if (modSelect.value === '__custom__') {
          promptCustomModelMode = true;
          modInput.hidden = false;
          modInput.focus();
        } else {
          promptCustomModelMode = false;
          promptModel = modSelect.value;
          modInput.value = promptModel;
          modInput.hidden = true;
          const hit = allCatalogModels.find(m => m.id === promptModel);
          if (hit?.effort && selectedAgent.supportsEffort) {
            promptEffort = hit.effort;
            const effSel = $('agent14EffortSelect');
            if (effSel) effSel.value = promptEffort;
          }
          persistAgentSelectionAsync(selectedAgent.id, promptModel, promptEffort);
          updatePreviewAndRisk();
        }
      });

      modInput.addEventListener('input', () => {
        promptModel = modInput.value;
        persistAgentSelectionAsync(selectedAgent.id, promptModel, promptEffort);
        updatePreviewAndRisk();
      });

      modControls.append(modSearch, modSelect);
      modBox.append(modHead, modControls, modInput);

      // Source badge (live vs fallback) + Antigravity hidden low-tier note + Cost/Quota estimate
      const modMeta = el('div', null, 'agent14-model-meta');
      if (catalog) {
        const srcBadge = el(
          'span',
          catalog.source === 'live'
            ? t('agent14.modelSourceLive', { source: catalog.sourceLabel || selectedAgent.id })
            : t('agent14.modelSourceFallback'),
          'v12-pill ' + (catalog.source === 'live' ? 'pos' : 'warn')
        );
        srcBadge.id = 'agent14ModelSourceBadge';
        modMeta.append(srcBadge);
      }
      const costHint = el('span', formatModelCostHint(catalog, promptModel, selectedAgent));
      costHint.id = 'agent14CostHint';
      modMeta.append(costHint);
      modBox.append(modMeta);

      if (selectedAgent?.banLowTier) {
        const lowCount = catalog?.hiddenLowCount || 0;
        modBox.append(
          el(
            'small',
            lowCount > 0 ? t('agent14.agyLowHiddenNote', { count: lowCount }) : t('agent14.agyNoLowHint'),
            'v12-muted'
          )
        );
      }

      modWrap.append(modBox);

      // Effort / Reasoning Selector (only rendered when relevant for selected agent!)
      let effortWrap = null;
      const effortOpts = catalog?.effortOptions?.length ? catalog.effortOptions : (selectedAgent?.effortOptions || []);
      if (selectedAgent?.supportsEffort && effortOpts.length) {
        effortWrap = el('div', null, 'v12-field');
        const effLbl = el('label', t('agent14.effortLabel'));
        effLbl.htmlFor = 'agent14EffortSelect';
        const effSel = el('select');
        effSel.id = 'agent14EffortSelect';
        const defEff = catalog?.defaultEffort || selectedAgent.defaultEffort || '';
        const optEffDef = el(
          'option',
          defEff ? t('agent14.effortDefault', { effort: defEff }) : t('agent14.effortDefaultPlain')
        );
        optEffDef.value = '';
        effSel.append(optEffDef);
        for (const ev of effortOpts) {
          const o = el('option', ev);
          o.value = ev;
          effSel.append(o);
        }
        effSel.value = effortOpts.includes(promptEffort) ? promptEffort : '';
        effSel.addEventListener('change', () => {
          promptEffort = effSel.value;
          persistAgentSelectionAsync(selectedAgent.id, promptModel, promptEffort);
          updatePreviewAndRisk();
        });
        effortWrap.append(effLbl, effSel);
      }

      const txtWrap = el('div', null, 'v12-field full');
      const txtLbl = el('label', t('v13.promptComposerLabel'));
      txtLbl.htmlFor = 'v13PromptText';
      const txtArea = el('textarea');
      txtArea.id = 'v13PromptText';
      txtArea.rows = 4;
      txtArea.maxLength = 12000;
      txtArea.placeholder = t('v13.promptComposerPlaceholder');
      txtArea.value = promptDraft;
      txtArea.addEventListener('input', () => { promptDraft = txtArea.value; });
      txtWrap.append(txtLbl, txtArea);

      fGrid.append(cwdWrap, modWrap);
      if (effortWrap) fGrid.append(effortWrap);
      fGrid.append(txtWrap);
      compForm.append(fGrid);

      const btnRow = el('div', null, 'v12-btn-row');
      btnRow.style.marginTop = '12px';

      const sendBtn = el('button', isRunning ? t('v13.promptRunningBtn') : t('v13.promptSendBtn'), 'v12-btn-primary');
      sendBtn.type = 'submit';
      sendBtn.id = 'v13PromptSendBtn';
      sendBtn.disabled = isRunning || isCancelling;

      const cancelBtn = el('button', t('v13.promptCancelBtn'), 'v12-btn-danger');
      cancelBtn.type = 'button';
      cancelBtn.id = 'v13PromptCancelBtn';
      cancelBtn.disabled = !isRunning || isCancelling;
      cancelBtn.addEventListener('click', async () => {
        if (cancellingRunId) return;
        const target = runningRun || (currentData().prompt.runs || []).find(r => r.status === 'running') || null;
        if (!target) {
          if (sendingPrompt) {
            cancelRequestedDuringSend = true;
            cancellingRunId = '__pending__';
            if (activePanel === 'prompt') renderPromptPanel();
          }
          return;
        }
        cancellingRunId = target.id;
        if (activePanel === 'prompt') renderPromptPanel();
        try {
          if (isLocalDemo()) {
            if (demoStreamTimer) { clearInterval(demoStreamTimer); demoStreamTimer = null; }
            target.status = 'cancelled';
            target.exitCode = -1;
            target.finishedAt = new Date().toISOString();
            updateSidebar();
            onPromptRun?.({ type: 'prompt_run_done', runId: target.id, agentId: target.agentId, provider: target.provider, cancelled: true, run: target });
          } else {
            const cancelRes = await req('POST', '/prompt/runs/' + encodeURIComponent(target.id) + '/cancel', {});
            upsertRunSafe(cancelRes?.run || { ...target, status: 'cancelled', exitCode: 130, finishedAt: new Date().toISOString() }, { select: true });
            await fetchPromptRunsOnly().catch(() => {});
          }
        } catch (err) {
          upsertRunSafe({ ...target, status: 'cancelled', exitCode: 130, finishedAt: new Date().toISOString() }, { select: true });
          await fetchPromptRunsOnly().catch(() => {});
          promptNotice = { text: err.message, kind: 'error' };
        } finally {
          cancellingRunId = null;
          sendingPrompt = false;
          cancelRequestedDuringSend = false;
          updateSidebar();
          if (activePanel === 'prompt') renderPromptPanel();
        }
      });

      btnRow.append(sendBtn, cancelBtn);
      compForm.append(btnRow);

      compForm.addEventListener('submit', async e => {
        e.preventDefault();
        if (sendingPrompt || cancellingRunId || (currentData().prompt.runs || []).some(r => r.status === 'running')) return;
        const text = txtArea.value.trim();
        if (!text) {
          promptNotice = { text: t('v13.promptRequired'), kind: 'error' };
          renderPromptPanel();
          return;
        }
        const chosenModel = modInput.value.trim();
        if (selectedAgentId === 'antigravity' && /(?:^|[-_/])low$/i.test(chosenModel)) {
          promptNotice = { text: t('agent14.agyLowBlocked'), kind: 'error' };
          renderPromptPanel();
          return;
        }
        promptNotice = { text: '', kind: '' };
        const chosen = agents.find(a => a.id === selectedAgentId) || agents[0];
        const payload = {
          agentId: selectedAgentId,
          prompt: text,
          cwd: cwdInput.value.trim(),
          model: chosenModel,
          effort: chosen.supportsEffort ? promptEffort : '',
          fullAccess: faInput.checked,
          mode: isLocalDemo() ? 'demo' : 'live'
        };
        if (isLocalDemo()) {
          const run = normalizeRun({
            id: 'prompt-demo-' + (++demoRunSeq),
            agentId: chosen.id,
            agentName: chosen.name,
            provider: chosen.provider || 'claude',
            prompt: text,
            cwd: payload.cwd || demoState.prompt.defaultCwd,
            model: payload.model,
            effort: payload.effort,
            fullAccess: payload.fullAccess,
            status: 'running',
            output: '',
            startedAt: new Date().toISOString(),
            demo: true
          });
          demoState.prompt.runs.unshift(run);
          if (demoState.prompt.runs.length > 50) demoState.prompt.runs.pop();
          selectedRunId = run.id;
          promptDraft = '';
          updateSidebar();
          renderPromptPanel();
          startDemoPromptStream(run);
          return;
        }

        sendingPrompt = true;
        cancelRequestedDuringSend = false;
        renderPromptPanel();
        try {
          const res = await req('POST', '/prompt/run', payload);
          const run = upsertRunSafe(res?.run || res, { select: true });
          promptDraft = '';
          if (cancelRequestedDuringSend && run && run.status === 'running') {
            const cRes = await req('POST', '/prompt/runs/' + encodeURIComponent(run.id) + '/cancel', {}).catch(() => null);
            upsertRunSafe(cRes?.run || { ...run, status: 'cancelled', exitCode: 130, finishedAt: new Date().toISOString() }, { select: true });
          }
        } catch (err) {
          promptNotice = { text: err.message, kind: 'error' };
        } finally {
          sendingPrompt = false;
          cancelRequestedDuringSend = false;
          if (cancellingRunId === '__pending__') cancellingRunId = null;
          updateSidebar();
          if (activePanel === 'prompt') renderPromptPanel();
        }
      });

      compSec.append(compForm);
      content.append(compSec);

      // Section 3: Live Streaming Output Console (strictly textContent ONLY — safe plain-text DOM)
      const conSec = el('section', null, 'v12-section');
      const conHead = el('div', null, 'v12-section-head');
      const conLeft = el('div', null, 'v13-ws-title');
      conLeft.append(el('h3', t('v13.promptConsoleTitle')));
      if (activeRun) {
        const b = formatRunStatusBadge(activeRun);
        const pill = el('span', null, 'v12-pill ' + b.cls);
        pill.id = 'v13PromptStatusPill';
        if (activeRun.status === 'running') {
          const d = el('span', null, 'v12-pill-dot');
          d.setAttribute('aria-hidden', 'true');
          pill.append(d);
        }
        pill.append(document.createTextNode(b.text));
        conLeft.append(pill);
      }

      const conRight = el('div', null, 'v12-btn-row');
      if (activeRun?.outputFileLabel && !isLocalDemo()) {
        const repBtn = el('button', t('agent14.viewReportBtn', { file: activeRun.outputFileLabel }), 'v12-btn-compact');
        repBtn.type = 'button';
        repBtn.id = 'agent14ViewReportBtn';
        repBtn.addEventListener('click', async () => {
          try {
            const rep = await req('GET', '/prompt/runs/' + encodeURIComponent(activeRun.id) + '/output');
            const preEl = $('v13PromptConsole');
            if (preEl && rep?.reportMarkdown) {
              preEl.classList.remove('empty');
              preEl.textContent = rep.reportMarkdown;
            }
            promptNotice = { text: t('agent14.reportLoaded', { file: rep?.outputFileLabel || activeRun.outputFileLabel }), kind: 'ok' };
          } catch (err) {
            promptNotice = { text: err.message, kind: 'error' };
            if (activePanel === 'prompt') renderPromptPanel();
          }
        });
        conRight.append(repBtn);
      }
      const copyBtn = el('button', t('v13.promptCopyBtn'), 'v12-btn-compact');
      copyBtn.type = 'button';
      copyBtn.id = 'v13PromptCopyBtn';
      copyBtn.disabled = !activeRun?.output;
      copyBtn.addEventListener('click', async () => {
        if (!activeRun?.output) return;
        try {
          await navigator.clipboard?.writeText(activeRun.output);
          promptNotice = { text: t('v13.promptCopied'), kind: 'ok' };
          if (activePanel === 'prompt') renderPromptPanel();
        } catch {}
      });
      conRight.append(copyBtn);
      conHead.append(conLeft, conRight);
      conSec.append(conHead);

      const consoleText = activeRun?.output || activeRun?.error || '';
      const pre = el('pre', consoleText || t('v13.promptConsoleEmpty'), 'v13-console' + (consoleText ? '' : ' empty'));
      pre.id = 'v13PromptConsole';
      conSec.append(pre);
      content.append(conSec);

      // Section 4: Recent Prompt History
      const histSec = el('section', null, 'v12-section');
      const histHead = el('div', null, 'v12-section-head');
      const runs = prompt.runs || [];
      histHead.append(el('h3', t('v13.promptHistoryTitle', { count: runs.length })));
      histSec.append(histHead);

      if (!runs.length) {
        histSec.append(el('p', t('v13.promptHistoryEmpty'), 'v12-empty'));
      } else {
        const list = el('div', null, 'v13-history-list');
        list.id = 'v13PromptHistory';
        for (const r of runs.slice(0, 20)) {
          const item = el('div', null, 'v13-history-item');
          const main = el('div', null, 'v13-history-main');
          main.tabIndex = 0;
          main.setAttribute('role', 'button');
          const stInfo = formatRunStatusBadge(r);
          main.append(
            el('span', r.agentName || r.agentId, 'v12-pill'),
            el('span', r.prompt, 'v13-history-prompt'),
            el('span', stInfo.text, 'v12-pill ' + stInfo.cls)
          );
          const pickRun = () => {
            selectedRunId = r.id;
            renderPromptPanel();
          };
          main.addEventListener('click', pickRun);
          main.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickRun(); }
          });

          const delBtn = el('button', t('v12.btnDelete'), 'v12-btn-compact v12-btn-danger');
          delBtn.type = 'button';
          delBtn.disabled = r.status === 'running';
          delBtn.addEventListener('click', async () => {
            try {
              if (isLocalDemo()) {
                const idx = demoState.prompt.runs.findIndex(x => x.id === r.id);
                if (idx >= 0) demoState.prompt.runs.splice(idx, 1);
                if (selectedRunId === r.id) selectedRunId = demoState.prompt.runs[0]?.id || null;
              } else {
                await req('DELETE', '/prompt/runs/' + encodeURIComponent(r.id));
                if (selectedRunId === r.id) selectedRunId = null;
                await fetchPromptLive();
              }
              updateSidebar();
              if (activePanel === 'prompt') renderPromptPanel();
            } catch (err) {
              promptNotice = { text: err.message, kind: 'error' };
              if (activePanel === 'prompt') renderPromptPanel();
            }
          });

          item.append(main, delBtn);
          list.append(item);
        }
        histSec.append(list);
      }
      content.append(histSec);
    }

    // ===== Public Open / Close / Sync / SSE API =====
    // [Diubah oleh Gemini - 2026-11-21] Delegasikan openYoutube() ke OfficeYoutubeUI V14 (dasbor tertanam utuh) bila tersedia
    async function openYoutube(initialHash) {
      const ytUI = typeof getYoutubeUI === 'function' ? getYoutubeUI() : null;
      if (ytUI && typeof ytUI.openYoutube === 'function') {
        return ytUI.openYoutube(initialHash);
      }
      before?.();
      const g = ++generation;
      activePanel = 'youtube';
      ytNotice = { text: '', kind: '' };
      showModalTitle(t('v13.ytTitle'));
      renderYoutubePanel();
      if (!isLocalDemo()) {
        await fetchYoutubeLive();
        if (g === generation && activePanel === 'youtube' && $('panel')?.open) {
          renderYoutubePanel();
        }
      }
    }

    async function openPrompt() {
      before?.();
      const g = ++generation;
      activePanel = 'prompt';
      promptNotice = { text: '', kind: '' };
      showModalTitle(t('v13.promptTitle'));
      renderPromptPanel();
      if (!isLocalDemo()) {
        await fetchPromptLive();
        if (g === generation && activePanel === 'prompt' && $('panel')?.open) {
          renderPromptPanel();
        }
      }
    }

    function close() {
      generation++;
      activePanel = null;
      $('panelContent')?.classList.remove('v12-panel');
    }

    async function refresh() {
      if (!isLocalDemo()) {
        await Promise.all([fetchYoutubeLive(), fetchPromptLive()]);
      } else {
        updateSidebar();
      }
      if (activePanel === 'youtube' && $('panel')?.open) renderYoutubePanel();
      if (activePanel === 'prompt' && $('panel')?.open) renderPromptPanel();
    }

    function handleEvent(evt) {
      if (!evt || typeof evt !== 'object') return;
      if (evt.type === 'youtube_analytics_updated') {
        if (evt.state || evt.analytics) {
          state.yt = normalizeYoutube(evt.state || evt.analytics);
        } else {
          if (evt.summary && typeof evt.summary === 'object') {
            state.yt.summary = { ...state.yt.summary, ...evt.summary };
          }
          if (evt.lastRunDate) state.yt.lastRunDate = evt.lastRunDate;
          if (evt.selectedChannel !== undefined) state.yt.selectedChannel = evt.selectedChannel || '';
          if (evt.config && typeof evt.config === 'object') {
            state.yt.config = { ...state.yt.config, ...evt.config };
            state.yt.autoMidnight = Boolean(state.yt.config.autoMidnight);
          }
        }
        updateSidebar();
        if (!isLocalDemo() && !(evt.state || evt.analytics)) {
          fetchYoutubeLive().then(() => {
            if (activePanel === 'youtube' && $('panel')?.open) renderYoutubePanel();
          });
        } else if (activePanel === 'youtube' && $('panel')?.open) {
          renderYoutubePanel();
        }
      } else if (evt.type === 'prompt_run_started') {
        upsertRunSafe(evt.run || {
          id: evt.runId,
          agentId: evt.agentId,
          agentName: evt.agentName,
          residentProvider: evt.residentProvider || evt.target || evt.provider,
          prompt: evt.prompt || evt.task || '',
          fullAccess: evt.fullAccess,
          mode: evt.mode,
          status: 'running',
          startedAt: evt.startedAt,
          output: ''
        }, { select: true });
        updateSidebar();
        if (activePanel === 'prompt' && $('panel')?.open) renderPromptPanel();
      } else if (evt.type === 'prompt_run_chunk') {
        const runId = String(evt.runId || evt.id || '');
        const chunk = String(evt.chunk ?? evt.text ?? '');
        const run = state.prompt.runs.find(r => r.id === runId);
        if (run) {
          run.output = (run.output || '') + chunk;
          if (activePanel === 'prompt' && $('panel')?.open) {
            updateLiveConsoleInPlace(run);
          }
        }
      } else if (evt.type === 'prompt_run_done') {
        const runId = String(evt.runId || evt.run?.id || '');
        const prev = state.prompt.runs.find(r => r.id === runId) || {};
        const incoming = evt.run ? normalizeRun(evt.run) : null;
        const doneStatus = incoming?.status || evt.status || (evt.cancelled ? 'cancelled' : (evt.exitCode === 0 ? 'completed' : 'failed'));
        if (runId) {
          upsertRunSafe({
            ...prev,
            ...(incoming || {}),
            id: runId,
            status: doneStatus,
            exitCode: incoming?.exitCode ?? evt.exitCode ?? prev.exitCode,
            durationMs: incoming?.durationMs ?? evt.durationMs ?? prev.durationMs,
            outputFileLabel: incoming?.outputFileLabel || evt.outputFileLabel || prev.outputFileLabel || '',
            limitDetected: Boolean(incoming?.limitDetected ?? evt.limitDetected ?? prev.limitDetected),
            retryAfter: incoming?.retryAfter || evt.retryAfter || prev.retryAfter || '',
            errorCode: incoming?.errorCode || evt.errorCode || prev.errorCode || '',
            error: incoming?.error || evt.error || prev.error || '',
            finishedAt: incoming?.finishedAt || evt.finishedAt || prev.finishedAt || new Date().toISOString(),
            output: incoming?.output ? incoming.output : (prev.output || '')
          }, { select: !selectedRunId });
        }
        if (cancellingRunId === runId || !(state.prompt.runs || []).some(r => r.status === 'running')) {
          cancellingRunId = null;
          sendingPrompt = false;
        }
        updateSidebar();
        if (activePanel === 'prompt' && $('panel')?.open) renderPromptPanel();
      } else if (evt.type === 'usage_updated') {
        updateSidebar();
      }
    }

    $('panel')?.addEventListener('close', () => {
      if (!$('panel')?.open && activePanel) close();
    });

    I18n.subscribe(() => {
      updateSidebar();
      if (!$('panel')?.open) return;
      if (activePanel === 'youtube') {
        if ($('panelTitle')) $('panelTitle').textContent = t('v13.ytTitle');
        renderYoutubePanel();
      } else if (activePanel === 'prompt') {
        if ($('panelTitle')) $('panelTitle').textContent = t('v13.promptTitle');
        renderPromptPanel();
      }
    });

    updateSidebar();

    return {
      openYoutube,
      openPrompt,
      open(kind) {
        if (kind === 'prompt') return openPrompt();
        return openYoutube();
      },
      close,
      refresh,
      handleEvent,
      updateSidebar,
      getState: currentData,
      get active() { return activePanel; }
    };
  }
};
