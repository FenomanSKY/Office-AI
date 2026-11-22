// [Diubah oleh Gemini - 2026-11-21] Suite Uji V14 Agen B: Dasbor YouTube Studio Manager Tertanam Utuh (Stub UI Asli + Uji Baca-Saja Server Nyata 0-Kuota), Data Kantor & Event 3D, serta Audit & Kontrak runAgent 6 Penyedia Prompt
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const EventEmitter = require('node:events');
const { PassThrough } = require('node:stream');
const { open, sleep, root } = require('./v6c_lib.cjs');
const { createYoutubeDashboardHost, resolveProjectRoot } = require('../youtube_dashboard_host.js');
const {
  createAgentPromptStore,
  detectUsageLimit,
  validateAntigravityModel,
  resolveWindowsCliLauncher,
  formatPortablePath
} = require('../agent_prompt_store.js');

function createFakeChild({ stdoutChunks = [], stderrChunks = [], exitCode = 0, delayMs = 30, hang = false, captureStdin = null } = {}) {
  const child = new EventEmitter();
  child.pid = Math.floor(40000 + Math.random() * 10000);
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  let stdinBuf = '';
  child.stdin.on('data', c => { stdinBuf += c.toString('utf8'); });
  child.stdin.on('end', () => { if (captureStdin) captureStdin(stdinBuf); });

  let closed = false;
  const timers = [];

  child.kill = () => {
    if (closed) return;
    closed = true;
    for (const tm of timers) clearTimeout(tm);
    child.stdout.end();
    child.stderr.end();
    setTimeout(() => child.emit('close', 130), 10);
  };

  if (!hang) {
    let t = delayMs;
    for (const ch of stdoutChunks) {
      timers.push(setTimeout(() => { if (!closed) child.stdout.write(ch); }, t));
      t += delayMs;
    }
    for (const ch of stderrChunks) {
      timers.push(setTimeout(() => { if (!closed) child.stderr.write(ch); }, t));
      t += delayMs;
    }
    timers.push(setTimeout(() => {
      if (closed) return;
      closed = true;
      child.stdout.end();
      child.stderr.end();
      child.emit('close', exitCode);
    }, t + 10));
  } else {
    timers.push(setTimeout(() => { if (!closed) child.stdout.write('menunggu proses panjang...\n'); }, 20));
  }

  return child;
}

// Server dasbor stub yang menyajikan static/ asli YouTube Studio Manager + data API tiruan (tanpa Secrets/login/kuota)
async function startStubDashboardServer({ staticDir = '', port = 0 } = {}) {
  const token = crypto.randomBytes(18).toString('base64url');
  let extraComments = [];
  let launchCalls = [];
  let replyCalls = [];
  let healthMode = 'expiring';

  // [Diubah oleh Gemini - 2026-11-21] Gunakan nama channel stub generik untuk kebersihan repo publik
  const channels = [
    { key: 'demostudio', title: 'Demo Studio', slot_utc_hour: 20, connected: true, pending: false, has_client: true, chrome_profile: 'Default', oauth_mode: 'testing', language: 'en', color: '#FFD23F' },
    { key: 'explainerlab', title: 'Explainer Lab', slot_utc_hour: 11, connected: true, pending: false, has_client: true, chrome_profile: 'Profile 1', oauth_mode: 'testing', language: 'id', color: '#38BDF8' }
  ];

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    days.push({ day: d, views: 1200 + (6 - i) * 320, estimatedMinutesWatched: 950 + (6 - i) * 180, subscribersGained: 14 + (6 - i) * 3, subscribersLost: 2 });
  }

  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    const send = (code, body, ctype = 'application/json; charset=utf-8') => {
      const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
      res.writeHead(code, { 'Content-Type': ctype, 'Content-Length': buf.length, 'Cache-Control': 'no-store' });
      res.end(buf);
    };

    if (req.method === 'POST') {
      if (req.headers['x-token'] !== token) return send(403, { error: 'bad token' });
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      if (u.pathname === '/api/launch') {
        launchCalls.push(body);
        return send(200, { ok: true, launched: body.ch, kind: body.kind || 'channel' });
      }
      if (u.pathname === '/api/reply') {
        replyCalls.push(body);
        return send(200, { ok: true, id: 'rep_' + replyCalls.length });
      }
      return send(200, { ok: true });
    }

    if (u.pathname === '/api/meta') return send(200, { channels, cache_min: 15 });
    if (u.pathname === '/api/quota') {
      return send(200, {
        day: new Date().toISOString().slice(0, 10),
        limit: 10000,
        channels: {
          demostudio: { units: 420, analytics: 12, calls: { videos: 10 } },
          explainerlab: { units: 180, analytics: 6, calls: { videos: 5 } }
        }
      });
    }
    if (u.pathname === '/api/projects') {
      return send(200, [
        { channel: 'demostudio', name: '01-gravity-flip', status: 'ready', title: 'What If Gravity Flipped?', files: { 'description.txt': true, 'thumbnail.jpg': true }, video_mb: 14, modified: '2026-11-21T10:00' },
        { channel: 'explainerlab', name: '02-ilusi-waktu', status: 'animating', title: 'Kenapa Waktu Terasa Cepat?', files: { 'description.txt': false, 'thumbnail.jpg': false }, video_mb: null, modified: '2026-11-21T11:30' }
      ]);
    }
    if (u.pathname === '/api/health') {
      const loginAt = new Date(Date.now() - 2 * 86400000).toISOString();
      const expOk = new Date(Date.now() + 5.4 * 86400000).toISOString();
      const expWarn = new Date(Date.now() + 1.2 * 86400000).toISOString();
      return send(200, {
        demostudio: { state: 'ok', days_left: 5.4, login_at: loginAt, expires_at: expOk, oauth_mode: 'testing', store: 'vault' },
        explainerlab: healthMode === 'expiring'
          ? { state: 'expiring', days_left: 1.2, login_at: loginAt, expires_at: expWarn, oauth_mode: 'testing', store: 'vault', detail: 'refresh token mati dalam 1.2 hari' }
          : { state: 'ok', days_left: 6.0, login_at: loginAt, expires_at: expOk, oauth_mode: 'testing', store: 'vault' }
      });
    }
    if (u.pathname === '/api/auth-status') return send(200, { demostudio: { state: 'idle' }, explainerlab: { state: 'idle' } });
    if (u.pathname === '/api/chrome-profiles') {
      return send(200, { profiles: [{ dir: 'Default', name: 'Default' }], channel_ids: { demostudio: 'UC_DEMO_STUB', explainerlab: 'UC_EXPLAINER_STUB' }, sessions: { demostudio: { exists: true }, explainerlab: { exists: true } } });
    }
    if (u.pathname === '/api/channel') {
      const ch = u.searchParams.get('ch') || 'demostudio';
      const isPrimary = ch === 'demostudio';
      return send(200, {
        id: isPrimary ? 'UC_DEMO_STUB' : 'UC_EXPLAINER_STUB',
        title: isPrimary ? 'Demo Studio' : 'Explainer Lab',
        handle: isPrimary ? '@demostudio' : '@explainerlab',
        stats: isPrimary ? { subscriberCount: '8420', viewCount: '142500', videoCount: '24' } : { subscriberCount: '4150', viewCount: '68900', videoCount: '15' }
      });
    }
    if (u.pathname === '/api/videos') {
      const ch = u.searchParams.get('ch') || 'demostudio';
      return send(200, [
        { id: ch + '_v1', title: 'What If You Never Slept?', privacy: 'public', published: '2026-11-18T03:00:00Z', duration: 'PT48S', stats: { viewCount: '14200', likeCount: '820', commentCount: '21' } },
        { id: ch + '_v2', title: 'Scheduled Short Episode', privacy: 'private', publish_at: '2026-11-24T03:00:00Z', published: '2026-11-20T03:00:00Z', duration: 'PT45S', stats: { viewCount: '0', likeCount: '0', commentCount: '0' } }
      ]);
    }
    if (u.pathname === '/api/analytics') {
      const ch = u.searchParams.get('ch') || 'demostudio';
      return send(200, { videos: [{ video: ch + '_v1', views: 14200, averageViewPercentage: 76.4, averageViewDuration: 36, likes: 820 }] });
    }
    if (u.pathname === '/api/daily') return send(200, { start: days[0].day, end: days[days.length - 1].day, days });
    if (u.pathname === '/api/sources') {
      return send(200, {
        traffic: [{ insightTrafficSourceType: 'SHORTS', views: 12100 }, { insightTrafficSourceType: 'YT_SEARCH', views: 2100 }],
        countries: [{ country: 'ID', views: 7400 }, { country: 'US', views: 4700 }]
      });
    }
    if (u.pathname === '/api/comments') {
      const ch = u.searchParams.get('ch') || 'demostudio';
      const base = [
        { id: ch + '_cm1', author: 'Penonton Uji', text: 'Visualnya tajam sekali!', likes: 5, published: '2026-11-20T12:00:00Z', replied: false, video_id: ch + '_v1', video_title: 'What If You Never Slept?' }
      ];
      return send(200, [...extraComments.filter(c => c.ch === ch), ...base]);
    }

    // Sajikan berkas statis asli YouTube Studio Manager (tanpa font eksternal agar 0 error jaringan di headless offline)
    if (staticDir) {
      const rel = u.pathname === '/' ? 'index.html' : u.pathname.replace(/^\/+/, '');
      const full = path.resolve(staticDir, rel);
      if (full.startsWith(path.resolve(staticDir))) {
        try {
          let buf = await fs.readFile(full);
          const ext = path.extname(full).toLowerCase();
          const ctype = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' }[ext] || 'application/octet-stream';
          if (rel === 'index.html') {
            let html = buf.toString('utf8').replace('__TOKEN__', token);
            // Sembunyikan teks ligatur .ms pada stub offline bila font ikon Google tidak dimuat
            html = html
              .replace(/<link[^>]*fonts\.googleapis\.com[^>]*>/gi, '')
              .replace('</head>', '<style>.ms{display:none!important}</style></head>');
            buf = Buffer.from(html, 'utf8');
          }
          return send(200, buf, ctype);
        } catch {}
      }
    }
    send(404, { error: 'not found' });
  });

  await new Promise(resolve => srv.listen(port, '127.0.0.1', resolve));
  const actualPort = srv.address().port;

  return {
    port: actualPort,
    origin: `http://127.0.0.1:${actualPort}`,
    token,
    addComment: c => extraComments.unshift(c),
    setHealthMode: m => { healthMode = m; },
    getLaunchCalls: () => launchCalls,
    getReplyCalls: () => replyCalls,
    close: () => new Promise(resolve => { srv.closeAllConnections?.(); srv.close(resolve); })
  };
}

(async () => {
  const out = {
    ok: false,
    startedAt: new Date().toISOString(),
    checks: [],
    failed: [],
    metrics: {},
    shots: [],
    consoleErrors: [],
    pageExceptions: []
  };

  function check(name, pass, detail = null) {
    const rec = { name, pass: Boolean(pass) };
    if (detail !== null) rec.detail = detail;
    out.checks.push(rec);
    if (!pass) {
      out.failed.push(rec);
      console.error('[FAIL]', name, JSON.stringify(detail));
    }
  }

  let unitDir = null;
  let stubExt = null;
  let stubUi = null;
  let ownedHost = null;
  let realHost = null;
  let browser = null;

  try {
    unitDir = await fs.mkdtemp(path.join(root, 'qa/v14b-unit-'));
    const workDir = path.join(unitDir, 'work');
    const secretsDir = path.join(unitDir, 'Secrets');
    await fs.mkdir(workDir, { recursive: true });
    await fs.mkdir(secretsDir, { recursive: true });

    const projInfo = await resolveProjectRoot({ root });
    const realStaticDir = projInfo.found ? path.join(projInfo.projectRoot, 'Tools', 'dashboard', 'static') : '';

    // =========================================================================
    // PART A: youtube_dashboard_host.js LIFECYCLE, OWNERSHIP, METRICS & 3D EVENTS
    // =========================================================================
    stubExt = await startStubDashboardServer({ staticDir: realStaticDir });
    const hostEvents = [];
    const extHost = await createYoutubeDashboardHost({
      root,
      dataDir: path.join(unitDir, 'yt-ext-data'),
      port: stubExt.port,
      getLegacyAnalyticsState: () => ({
        source: 'workspace',
        demoMode: false,
        lastRunDate: '2026-11-20',
        historyDates: ['2026-11-19', '2026-11-20'],
        summary: { subscribers: 500, totalViews: 9900, videoCount: 7 },
        nextVideoRecommendations: [{ id: 'r1', title: 'Legacy' }]
      }),
      onEvent: e => hostEvents.push(e)
    });

    const attachRes = await extHost.ensureRunning();
    check(
      'Dashboard host attaches to already-running external server (managedByOffice: false)',
      attachRes.ok && attachRes.alreadyRunning === true && attachRes.status.managedByOffice === false && attachRes.status.mode === 'attached',
      attachRes.status
    );

    // Fetch summary #1: login warning + live totals + baseline comments
    const sum1 = await extHost.fetchOfficeSummary({ includeLiveMetrics: true, checkHealth: true, checkComments: true });
    // Add new comment -> fetch summary #2 -> triggers youtube_new_comment event
    stubExt.addComment({ ch: 'demostudio', id: 'cm_fresh_v14', author: 'Budi', text: 'Keren banget!', likes: 1, published: '2026-11-21T06:00:00Z', video_id: 'demostudio_v1', video_title: 'What If You Never Slept?' });
    const sum2 = await extHost.fetchOfficeSummary({ includeLiveMetrics: true, checkHealth: true, checkComments: true });

    const officeTrackRaw = await fs.readFile(path.join(unitDir, 'yt-ext-data', 'youtube_dashboard_office.json'), 'utf8').catch(() => '');
    check(
      'Dashboard summary pulls non-secret totals/quota/loginWarnings, preserves legacy archive, emits 3D comment & login events, and stores 0 tokens',
      sum1.totals.subscribers === 12570 &&
        sum1.totals.totalViews === 211400 &&
        sum1.totals.quotaUsed === 600 &&
        sum1.loginWarnings.length === 1 &&
        sum1.loginWarnings[0].channel === 'explainerlab' &&
        sum1.legacy?.lastRunDate === '2026-11-20' &&
        sum2.newCommentsDetected === 1 &&
        hostEvents.some(e => e.type === 'youtube_login_warning' && e.channel === 'explainerlab') &&
        hostEvents.some(e => e.type === 'youtube_new_comment' && e.channel === 'demostudio' && e.count === 1) &&
        !officeTrackRaw.includes(stubExt.token) &&
        !officeTrackRaw.includes('ya29'),
      { totals: sum1.totals, warnings: sum1.loginWarnings.length, newComments: sum2.newCommentsDetected }
    );

    // Stopping external host MUST NOT stop the external server!
    const stopExt = await extHost.stopOwned();
    await extHost.stop();
    const stillAlive = await fetch(stubExt.origin + '/api/meta').then(r => r.ok).catch(() => false);
    check('Dashboard host NEVER kills an external dashboard it did not start', stopExt.stoppedOwned === false && stillAlive === true, { stopExt, stillAlive });

    // Owned child lifecycle test: spawn a real Node child script listening on YSM_PORT & accepting --no-browser
    const stubChildScript = path.join(unitDir, 'stub_dash_child.cjs');
    await fs.writeFile(stubChildScript, `
      const http = require('node:http');
      const port = Number(process.env.YSM_PORT || 0);
      const hasNoBrowser = process.argv.includes('--no-browser');
      const s = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ channels: [{ key: 'demo', title: 'Owned Stub', connected: false }], noBrowser: hasNoBrowser }));
      });
      s.listen(port, '127.0.0.1');
    `);
    const freePort = await new Promise(resolve => {
      const s = http.createServer();
      s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
    });
    ownedHost = await createYoutubeDashboardHost({
      root,
      dataDir: path.join(unitDir, 'yt-owned-data'),
      port: freePort,
      serverScript: stubChildScript,
      pythonExe: process.execPath
    });
    const startedOwned = await ownedHost.ensureRunning();
    const metaOwned = await fetch(`http://127.0.0.1:${freePort}/api/meta`).then(r => r.json());
    const stoppedOwned = await ownedHost.stopOwned();
    await sleep(300);
    const deadAfterStop = await fetch(`http://127.0.0.1:${freePort}/api/meta`).then(() => false).catch(() => true);
    check(
      'Dashboard host spawns child with --no-browser & YSM_PORT when offline, and stops ONLY its own process cleanly',
      startedOwned.ok && startedOwned.alreadyRunning === false && startedOwned.status.managedByOffice === true && metaOwned.noBrowser === true && stoppedOwned.stoppedOwned === true && deadAfterStop === true,
      { startedOwned: startedOwned.status, noBrowser: metaOwned.noBrowser, stoppedOwned, deadAfterStop }
    );

    // =========================================================================
    // PART B: agent_prompt_store.js & runAgent CONTRACT (ALL 6 PROVIDERS)
    // =========================================================================
    const spawnedCalls = [];
    let capturedStdin = '';
    const promptEvents = [];
    const promptStore = await createAgentPromptStore({
      dataDir: path.join(unitDir, 'prompt-data'),
      getDefaultCwd: () => workDir,
      getGeminiConfig: () => ({ apiKey: 'TEST_BYOK_DUMMY_KEY_1234', model: 'gemini-2.5-flash', hasGeminiKey: true }),
      onEvent: e => promptEvents.push(e),
      hermesRouterProbe: async () => false,
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(init.body || '{}');
        const txt = body?.contents?.[0]?.parts?.[0]?.text || '';
        if (txt.includes('TRIGGER_429')) {
          return { ok: false, status: 429, text: async () => 'RESOURCE_EXHAUSTED: quota exceeded, try again in 15m' };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: 'siap-byok' }] } }],
            usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 4 }
          })
        };
      },
      spawnImpl: (exe, args, opts) => {
        spawnedCalls.push({ exe, args: [...args], cwd: opts.cwd, windowsHide: opts.windowsHide, shell: opts.shell });
        const joined = args.join(' ');
        if (joined.includes('TRIGGER_TIMEOUT')) return createFakeChild({ hang: true });
        if (joined.includes('TRIGGER_CANCEL')) return createFakeChild({ hang: true });
        if (joined.includes('TRIGGER_LIMIT')) {
          return createFakeChild({ stderrChunks: ['Error: You hit your usage limit. Please try again at 19:45 WIB.\n'], exitCode: 1 });
        }
        return createFakeChild({
          stdoutChunks: ['\x1b[32mbaris 1: ', 'siap\x1b[0m\n'],
          exitCode: 0,
          captureStdin: s => { capturedStdin = s; }
        });
      }
    });

    // Verify Antigravity -low tier ban
    const lowModels = ['gemini-4-argon-low', 'gemini-4-neon-low', 'gemini-3.8-flash-low', 'claude-sonnet-5-5-low'];
    let allLowBlocked = true;
    for (const m of lowModels) {
      if (validateAntigravityModel(m).ok) allLowBlocked = false;
      try {
        await promptStore.runAgent('antigravity', 'hi', { cwd: workDir, model: m });
        allLowBlocked = false;
      } catch (err) {
        if (err.status !== 400 || err.code !== 'forbidden_low_tier_model') allLowBlocked = false;
      }
    }
    check('Antigravity strictly rejects all -low tier models with HTTP 400 forbidden_low_tier_model', allLowBlocked);

    // Verify flags for all CLI providers (Full Access ON & OFF) + ANSI strip + saved report file + custom outputPath
    const customOutFile = path.join(workDir, 'custom_stage_out.txt');
    const chunksSeen = [];
    const rClaudeOn = await promptStore.runAgent('claude', 'halo', { cwd: workDir, fullAccess: true, outputPath: customOutFile, onChunk: c => chunksSeen.push(c) });
    const rClaudeOff = await promptStore.runAgent('claude', 'halo', { cwd: workDir, fullAccess: false });
    const rCodexOn = await promptStore.runAgent('codex', 'kode codex', { cwd: workDir, fullAccess: true });
    const rCodexOff = await promptStore.runAgent('codex', 'kode codex', { cwd: workDir, fullAccess: false });
    const rAgyOn = await promptStore.runAgent('antigravity', 'cek fakta', { cwd: workDir, fullAccess: true });
    const rAgyOff = await promptStore.runAgent('antigravity', 'cek fakta', { cwd: workDir, fullAccess: false, model: 'gemini-4-neon-xhigh' });
    const rOcOn = await promptStore.runAgent('opencode', 'naskah', { cwd: workDir, fullAccess: true });
    const rOcOff = await promptStore.runAgent('opencode', 'naskah', { cwd: workDir, fullAccess: false, model: 'naskah' });
    const rHermesOn = await promptStore.runAgent('hermes', 'cek', { cwd: workDir, fullAccess: true });
    const rGemOk = await promptStore.runAgent('gemini-api', 'halo', { cwd: workDir });
    const rGem429 = await promptStore.runAgent('gemini-api', 'TRIGGER_429', { cwd: workDir });

    const customOutText = await fs.readFile(customOutFile, 'utf8').catch(() => '');
    const reportOutObj = await promptStore.getRunOutput(rClaudeOn.runId);
    const hasArg = (call, flag) => call && call.args.includes(flag);

    check(
      'All 6 providers pass verified Full Access ON/OFF flags, strip ANSI, save outputFile + custom outputPath, and run windowsHide/no-shell',
      rClaudeOn.ok &&
        rClaudeOn.output.includes('baris 1: siap') &&
        !rClaudeOn.output.includes('\x1b[') &&
        chunksSeen.length >= 2 &&
        customOutText.includes('baris 1: siap') &&
        reportOutObj.reportMarkdown.includes('Laporan Prompt Agen') &&
        spawnedCalls.every(c => c.windowsHide === true && c.shell === false) &&
        hasArg(spawnedCalls[0], '--dangerously-skip-permissions') &&
        hasArg(spawnedCalls[1], '--permission-mode') &&
        hasArg(spawnedCalls[2], '--skip-git-repo-check') &&
        hasArg(spawnedCalls[2], '--dangerously-bypass-approvals-and-sandbox') &&
        hasArg(spawnedCalls[3], '--sandbox') &&
        capturedStdin.length > 0 &&
        hasArg(spawnedCalls[4], 'gemini-4-argon-high') &&
        hasArg(spawnedCalls[4], '--dangerously-skip-permissions') &&
        hasArg(spawnedCalls[5], 'gemini-4-neon-xhigh') &&
        hasArg(spawnedCalls[5], '--mode') &&
        hasArg(spawnedCalls[6], 'opencode-go/claude-haiku-5-5') &&
        hasArg(spawnedCalls[6], '--auto') &&
        hasArg(spawnedCalls[7], 'opencode-go/gemini-4-argon') &&
        !hasArg(spawnedCalls[7], '--auto') &&
        hasArg(spawnedCalls[8], '--yolo') &&
        hasArg(spawnedCalls[8], '--query-file') &&
        rGemOk.ok && rGemOk.output.includes('siap-byok') &&
        !rGem429.ok && rGem429.status === 'rate_limited' && rGem429.limitDetected === true && rGem429.retryAfter === '15m',
      {
        claudeOnArgs: spawnedCalls[0]?.args,
        codexOnArgs: spawnedCalls[2]?.args,
        agyOnArgs: spawnedCalls[4]?.args,
        agyOffArgs: spawnedCalls[5]?.args,
        ocOnArgs: spawnedCalls[6]?.args,
        ocOffArgs: spawnedCalls[7]?.args,
        hermesOnArgs: spawnedCalls[8]?.args,
        gem429: { status: rGem429.status, limitDetected: rGem429.limitDetected, retryAfter: rGem429.retryAfter }
      }
    );

    // Usage limit detection, timeout, AbortSignal cancel, and Secrets rejection
    const rLimit = await promptStore.runAgent('claude', 'TRIGGER_LIMIT', { cwd: workDir });
    const rTimeout = await promptStore.runAgent('claude', 'TRIGGER_TIMEOUT', { cwd: workDir, timeoutMs: 1000 });
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 120);
    const rAbort = await promptStore.runAgent('claude', 'TRIGGER_CANCEL', { cwd: workDir, signal: ac.signal });

    let secretsBlocked = false;
    try {
      await promptStore.runAgent('claude', 'hi', { cwd: secretsDir });
    } catch (err) {
      secretsBlocked = err.status === 403 && err.code === 'forbidden_cwd';
    }
    let outTraversalBlocked = false;
    try {
      await promptStore.runAgent('claude', 'hi', { cwd: workDir, outputPath: path.join(secretsDir, 'leak.txt') });
    } catch (err) {
      outTraversalBlocked = err.status === 403 && err.code === 'forbidden_output_path';
    }

    check(
      'runAgent detects usage limit + retryAfter, enforces timeoutMs, cancels cleanly via AbortSignal, and blocks Secrets cwd/outputPath (403)',
      !rLimit.ok && rLimit.status === 'rate_limited' && rLimit.limitDetected === true && rLimit.retryAfter === '19:45 WIB' &&
        !rTimeout.ok && rTimeout.status === 'timed_out' && rTimeout.exitCode === 124 &&
        !rAbort.ok && rAbort.status === 'cancelled' && rAbort.exitCode === 130 &&
        secretsBlocked && outTraversalBlocked &&
        detectUsageLimit('SEMUA akun codex kena limit; tunggu reset', 1).limited === true,
      { limit: rLimit.retryAfter, timeout: rTimeout.status, abort: rAbort.status, secretsBlocked, outTraversalBlocked }
    );

    // Hermes fail-fast when 9router offline (without spawnImpl override)
    const hermesOfflineStore = await createAgentPromptStore({
      dataDir: path.join(unitDir, 'hermes-off-data'),
      getDefaultCwd: () => workDir,
      hermesRouterProbe: async () => false
    });
    const detH = await hermesOfflineStore.detectAgents();
    const hSpec = detH.agents.find(a => a.id === 'hermes');
    const hRun = hSpec?.installed ? await hermesOfflineStore.runAgent('hermes', 'halo', { cwd: workDir, timeoutMs: 5000 }) : { status: 'failed', errorCode: 'service_offline' };
    await hermesOfflineStore.stop();
    check(
      'Hermes detects offline 9router (:20128) and fails fast (service_offline) instead of hanging',
      (!hSpec?.installed || (hSpec.status === 'service_offline' && hRun.errorCode === 'service_offline' && hRun.durationMs < 3000)),
      { hStatus: hSpec?.status, errorCode: hRun.errorCode, durationMs: hRun.durationMs }
    );

    // Verify Windows packaged-app launcher discovery (empty PATH still finds agy.exe via %LOCALAPPDATA%\agy\bin + manual executable override + no username leak)
    const agyEmptyPath = await resolveWindowsCliLauncher('agy', { envPathOverride: '' });
    const fakeOverrideExe = path.join(workDir, 'custom_fake_cli.exe');
    await fs.writeFile(fakeOverrideExe, 'stub-exe');
    const overrideRes = await resolveWindowsCliLauncher('agy', { overridePath: fakeOverrideExe });
    const agyPortable = formatPortablePath(agyEmptyPath.executable || '');
    const osUserLower = (require('node:os').userInfo?.().username || '').toLowerCase();
    check(
      'Windows launcher finds agy.exe even with empty Electron PATH, supports manual executable override, and sanitizes user profile path',
      agyEmptyPath.installed === true &&
        /agy\.exe$/i.test(agyEmptyPath.executable || '') &&
        overrideRes.installed === true &&
        overrideRes.source === 'override' &&
        (!osUserLower || !agyPortable.toLowerCase().includes(osUserLower)),
      { agySource: agyEmptyPath.source, agyPortable, overrideSource: overrideRes.source }
    );

    // Verify hierarchical models catalog, effort support, quick CWDs, CWD validation, and minimal connection test
    const catalogAll = await promptStore.getModels({ forceRefresh: true });
    const agyCat = catalogAll.modelsByAgent?.antigravity;
    const codexCat = catalogAll.modelsByAgent?.codex;
    const gemCat = catalogAll.modelsByAgent?.['gemini-api'];
    const agyHasLow = (agyCat?.groups || []).some(g => (g.models || []).some(m => /-low$/i.test(m.id)));
    const quickCwds = await promptStore.listQuickCwds();
    const cwdOk = await promptStore.validateCwd(workDir);
    const cwdSec = await promptStore.validateCwd(secretsDir);
    const connTest = await promptStore.testConnection({ agentId: 'codex', model: 'sol-h', cwd: workDir });
    const lastCodexCall = spawnedCalls.at(-1);
    check(
      'Model catalogs (hierarchical + pricing + no Antigravity -low), quick CWDs + validation, Codex alias effort expansion, and testConnection work cleanly',
      !agyHasLow &&
        (agyCat?.groups?.length || 0) >= 2 &&
        codexCat?.supportsEffort === true &&
        (codexCat?.groups?.[0]?.models || []).some(m => m.id === 'sol-h') &&
        (gemCat?.groups?.length || 0) >= 1 &&
        (quickCwds.options?.length || 0) >= 1 &&
        cwdOk.valid === true &&
        cwdSec.blocked === true &&
        connTest.ok === true &&
        hasArg(lastCodexCall, '-m') &&
        hasArg(lastCodexCall, 'gpt-6.1-sol') &&
        lastCodexCall.args.some(a => a.includes('model_reasoning_effort="high"')),
      {
        agyGroups: agyCat?.groups?.length,
        agyHasLow,
        codexSource: codexCat?.sourceLabel,
        gemGroups: gemCat?.groups?.length,
        cwdCount: quickCwds.options?.length,
        connTestOk: connTest.ok
      }
    );

    await promptStore.stop();

    // =========================================================================
    // PART C: HEADLESS CHROMIUM E2E (EMBEDDED DASHBOARD UI + PROMPT UI + 3D + SHOTS)
    // =========================================================================
    stubUi = await startStubDashboardServer({ staticDir: realStaticDir });
    const uiDir = path.join(unitDir, 'browser-fixture');
    await fs.mkdir(path.join(uiDir, 'data'), { recursive: true });
    await fs.mkdir(path.join(uiDir, 'vault'), { recursive: true });
    await fs.writeFile(path.join(uiDir, 'vault', 'Demo.md'), '# QA');
    await fs.writeFile(path.join(uiDir, 'data', 'config.json'), JSON.stringify({ vaultRoot: path.join(uiDir, 'vault') }));

    // Jalankan embedded_server dengan injeksi stub dashboard & stub prompt runner
    const { startServer } = require('../embedded_server.js');
    const customServer = await startServer({
      root,
      collector: false,
      port: 0,
      maxPort: 0,
      dataDir: path.join(uiDir, 'data'),
      youtubeDashboard: { port: stubUi.port },
      agentPrompt: {
        getDefaultCwd: () => workDir,
        hermesRouterProbe: async () => false,
        spawnImpl: (_exe, args) => {
          // V16-C [Diubah oleh Gemini - 2026-11-21] Beri durasi stub cukup (delayMs: 700) agar tidak selesai sebelum pengecekan duringPrompt3d pada mesin SwiftShader lambat
          return createFakeChild({
            stdoutChunks: ['[Stub Codex] Memproses tugas...\n', 'Hasil audit selesai: siap!\n'],
            exitCode: 0,
            delayMs: 700
          });
        }
      }
    });

    // Pakai launcher Chromium dari v6c_lib secara langsung (terhubung ke customServer)
    const { spawn } = require('node:child_process');
    const profile = path.join(uiDir, 'chrome');
    await fs.mkdir(profile, { recursive: true });
    const chromeExe = path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1248/chrome-win64/chrome.exe');
    const chrome = spawn(chromeExe, [
      '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-breakpad',
      '--in-process-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=1440,900', 'about:blank'
    ], { windowsHide: true, stdio: 'ignore' });

    let cdpPort = 0;
    for (let i = 0; i < 80; i++) {
      try { cdpPort = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); if (cdpPort) break; } catch {}
      await sleep(100);
    }
    if (!cdpPort) throw new Error('Chrome CDP startup failed');
    const pages = await (await fetch('http://127.0.0.1:' + cdpPort + '/json')).json();
    const ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
    const pending = new Map();
    const cdpEvents = [];
    let seq = 0;
    await new Promise(r => ws.addEventListener('open', r));
    ws.addEventListener('message', e => {
      const m = JSON.parse(e.data);
      if (m.id) { const p = pending.get(m.id); pending.delete(m.id); if (p) m.error ? p.reject(m.error) : p.resolve(m.result); }
      else cdpEvents.push(m);
    });
    const call = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++seq; pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
    const ev = async expression => {
      const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 1200));
      return r.result.value;
    };
    browser = {
      async close() {
        await Promise.race([call('Browser.close').catch(() => {}), sleep(1500)]);
        ws.close();
        chrome.kill();
        await customServer.close();
      }
    };

    for (const dom of ['Runtime', 'Log', 'Page']) await call(dom + '.enable');
    await call('Page.addScriptToEvaluateOnNewDocument', { source: 'window.addEventListener("load",()=>window.officeQA?.freeze());' });
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    // Verify CSP header on Office AI root page
    const rootResp = await fetch(customServer.origin + '/');
    const rootCsp = rootResp.headers.get('content-security-policy') || '';
    const rootXfo = rootResp.headers.get('x-frame-options') || '';
    check(
      'Office AI CSP allows loopback dashboard frame-src while preserving frame-ancestors none & X-Frame-Options DENY',
      rootCsp.includes(`frame-src 'self' http://127.0.0.1:${stubUi.port}`) && rootCsp.includes("frame-ancestors 'none'") && rootXfo === 'DENY',
      { rootCsp, rootXfo }
    );

    await call('Page.navigate', { url: customServer.origin + '/?qa=1' });
    for (let i = 0; i < 100; i++) {
      await sleep(100);
      if (await ev('typeof officeQA !== "undefined"')) break;
    }
    await ev('officeQA.freeze(); officeQA.auto(false); officeQA.preset("iso"); officeQA.tick(1);');
    await sleep(300);

    const token = await ev(`document.querySelector('meta[name="office-vault-token"]')?.content || ''`);

    // Refresh dashboard summary via API (simulating live feed -> triggers login warning + populates office pill)
    const ref1 = await fetch(customServer.origin + '/youtube/dashboard/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Office-Token': token },
      body: JSON.stringify({ includeLiveMetrics: true, checkHealth: true, checkComments: true })
    }).then(r => r.json());
    // Add new comment and refresh again -> triggers 3D youtube_new_comment event!
    stubUi.addComment({ ch: 'demostudio', id: 'cm_ui_live_1', author: 'Sari', text: 'Mantap!', likes: 2, published: '2026-11-21T06:30:00Z', video_id: 'demostudio_v1', video_title: 'What If You Never Slept?' });
    await fetch(customServer.origin + '/youtube/dashboard/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Office-Token': token },
      body: JSON.stringify({ includeLiveMetrics: true, checkHealth: true, checkComments: true })
    });
    await sleep(350);
    await ev('officeQA.advance(1); 0');

    const pillAnd3d = await ev(`(() => {
      const pill = document.getElementById('yt14OfficePill');
      const dbg = officeDebug();
      return {
        menuText: document.getElementById('openYoutube')?.textContent?.trim() || '',
        cardText: document.getElementById('youtubeCardButton')?.textContent?.trim() || '',
        pillHidden: pill ? pill.hidden : true,
        pillText: pill?.textContent || '',
        hasLoginMilestone: dbg.milestones.some(m => m.stage === 'v14-yt-login-warning'),
        hasCommentMilestone: dbg.milestones.some(m => m.stage === 'v14-yt-new-comment'),
        drawCalls: dbg.drawCalls
      };
    })()`);
    check(
      'Office HUD displays non-secret YouTube pill and 3D reacts to new comment & login warning SSE events (drawCalls <= 340)',
      ref1.ok &&
        pillAnd3d.pillHidden === false &&
        pillAnd3d.pillText.length > 10 &&
        pillAnd3d.hasLoginMilestone &&
        pillAnd3d.hasCommentMilestone &&
        pillAnd3d.drawCalls <= 340,
      pillAnd3d
    );

    // Open embedded YouTube Dashboard panel & verify iframe renders real dashboard UI + pages + POST with X-Token!
    await ev(`document.getElementById('youtubeCardButton').click(); 0`);
    await sleep(1000);

    const iframeCheck = await ev(`(() => {
      const dlg = document.getElementById('panel');
      const frame = document.getElementById('yt14DashboardFrame');
      const rect = frame?.getBoundingClientRect();
      return {
        dialogOpen: Boolean(dlg?.open),
        hasFullClass: Boolean(dlg?.classList.contains('yt14-full-dialog')),
        frameSrc: frame?.src || '',
        frameW: Math.round(rect?.width || 0),
        frameH: Math.round(rect?.height || 0),
        pageNavCount: document.querySelectorAll('#yt14PageNav button').length,
        statusPill: document.getElementById('yt14StatusPill')?.textContent || '',
        warnBanner: document.getElementById('yt14LoginWarnBanner')?.textContent || ''
      };
    })()`);

    // Capture screenshot of embedded YouTube Dashboard (Overview)
    const shotDir = path.join(root, 'qa', 'v14-shots');
    await fs.mkdir(shotDir, { recursive: true });
    const shot1 = await call('Page.captureScreenshot', { format: 'png' });
    const shot1Path = path.join(shotDir, 'yt_dashboard_embedded_overview.png');
    await fs.writeFile(shot1Path, Buffer.from(shot1.data, 'base64'));
    out.shots.push(shot1Path);

    // Navigate through all 7 dashboard pages via #yt14PageNav & verify iframe hash updates cleanly
    const visitedHashes = [];
    for (const h of ['compare', 'content', 'schedule', 'comments', 'quota', 'manager', 'overview']) {
      await ev(`document.querySelector('#yt14PageNav button[data-hash="${h}"]')?.click(); 0`);
      await sleep(180);
      const curSrc = await ev(`document.getElementById('yt14DashboardFrame')?.src || ''`);
      if (curSrc.endsWith('#' + h)) visitedHashes.push(h);
    }

    // Verify POST with X-Token works inside the iframe's actual execution context (CDP Page.getFrameTree + isolated/frame eval)
    const frameTree = await call('Page.getFrameTree');
    const childFrame = frameTree.frameTree?.childFrames?.[0]?.frame || null;
    let iframeInner = { loaded: false, postOk: false, title: '', navLinks: 0 };
    if (childFrame) {
      const world = await call('Page.createIsolatedWorld', { frameId: childFrame.id, worldName: 'v14qa' });
      const r1 = await call('Runtime.evaluate', {
        contextId: world.executionContextId,
        returnByValue: true,
        awaitPromise: true,
        expression: `(() => ({
          loaded: Boolean(document.querySelector('#rail') && document.querySelector('#view')),
          title: document.title,
          h1: document.querySelector('#view h1')?.textContent || '',
          navLinks: document.querySelectorAll('#rail nav a').length,
          hasStudioBtn: Boolean(document.querySelector('[data-yt="channel"]'))
        }))()`
      });
      iframeInner = r1.result?.value || iframeInner;
      // Click Studio button inside the real dashboard page to prove POST /api/launch with X-Token works from inside the iframe!
      await call('Runtime.evaluate', {
        contextId: world.executionContextId,
        returnByValue: true,
        expression: `document.querySelector('[data-yt="channel"]')?.click(); 0`
      });
      await sleep(250);
      iframeInner.launchCalls = stubUi.getLaunchCalls().length;
    }

    check(
      'Embedded YouTube Dashboard renders full-panel iframe with real dashboard UI, all 7 pages navigable, and X-Token POST (/api/launch) works inside iframe',
      iframeCheck.dialogOpen &&
        iframeCheck.hasFullClass &&
        iframeCheck.frameW >= 900 &&
        iframeCheck.frameH >= 400 &&
        iframeCheck.pageNavCount === 7 &&
        visitedHashes.length === 7 &&
        iframeInner.loaded &&
        iframeInner.navLinks >= 7 &&
        iframeInner.launchCalls >= 1,
      { iframeCheck, visitedHashes, iframeInner }
    );

    // Close YouTube panel -> Open Prompt panel -> verify integrated model picker, effort, quick CWD, BYOK status, Full Access risk, live preview, test connection, stub run, saved report, and 3D movement!
    await ev(`document.getElementById('panel').close(); 0`);
    await sleep(180);
    await ev(`document.getElementById('promptCardButton').click(); 0`);
    await sleep(450);

    // Verify Gemini API (BYOK) card shows "API Key Missing" (NOT "Not Installed") and offers Integration Settings button
    await ev(`document.querySelector('#v13PromptAgentGrid button[data-agent-id="gemini-api"]')?.click(); 0`);
    await sleep(220);
    const byokUi = await ev(`(() => {
      const card = document.querySelector('#v13PromptAgentGrid button[data-agent-id="gemini-api"]');
      return {
        badge: card?.querySelector('.v12-pill')?.textContent?.trim() || '',
        hasIntegrationBtn: Boolean(document.getElementById('agent14OpenIntegrationBtn')),
        hasEffortField: Boolean(document.getElementById('agent14EffortSelect')),
        modelOptCount: document.querySelectorAll('#agent14ModelSelect option').length
      };
    })()`);

    // Pick Antigravity card -> confirm hierarchical model list hides -low tier and shows ready status
    await ev(`document.querySelector('#v13PromptAgentGrid button[data-agent-id="antigravity"]')?.click(); 0`);
    await sleep(220);
    const agyUi = await ev(`(() => {
      const opts = [...document.querySelectorAll('#agent14ModelSelect option')].map(o => o.value);
      return {
        hasLowOption: opts.some(v => /-low$/i.test(v)),
        optCount: opts.length,
        hasEffortField: Boolean(document.getElementById('agent14EffortSelect')),
        costText: document.getElementById('agent14CostHint')?.textContent || ''
      };
    })()`);

    // Pick codex card, inspect hierarchical models + effort selector + Full Access ON/OFF risk & preview + quick CWD
    await ev(`document.querySelector('#v13PromptAgentGrid button[data-agent-id="codex"]')?.click(); 0`);
    await sleep(220);
    const promptBeforeToggle = await ev(`({
      riskOn: document.getElementById('agent14FullAccessRisk')?.textContent || '',
      cmdOn: document.getElementById('agent14CommandPreview')?.textContent || '',
      hasEffortField: Boolean(document.getElementById('agent14EffortSelect')),
      cwdPresetCount: document.querySelectorAll('#agent14CwdPreset option').length,
      hasTestBtn: Boolean(document.getElementById('agent14TestConnBtn'))
    })`);
    await ev(`(() => {
      const sel = document.getElementById('agent14ModelSelect');
      if (sel && [...sel.options].some(o => o.value === 'sol-h')) {
        sel.value = 'sol-h';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const cb = document.getElementById('v13PromptFullAccess');
      cb.checked = false;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await sleep(120);
    const promptAfterToggle = await ev(`({
      riskOff: document.getElementById('agent14FullAccessRisk')?.textContent || '',
      cmdOff: document.getElementById('agent14CommandPreview')?.textContent || '',
      effortVal: document.getElementById('agent14EffortSelect')?.value || ''
    })`);

    // Record codex resident state BEFORE running prompt
    const codexBefore = await ev(`(() => {
      const a = officeDebug().actors.find(x => x.id === 'codex');
      return { x: a?.x, z: a?.z, activity: a?.activity, busy: a?.busy };
    })()`);

    // Run stub prompt via UI
    // V16-C [Diubah oleh Gemini - 2026-11-21] Mode V16 'fast' langsung menandai agen bekerja & memunculkan garis alur tanpa menunggu 6 detik koreografi berjalan; advance(1) cukup & cegah race wall-clock SwiftShader
    await ev(`(() => {
      const ta = document.getElementById('v13PromptText');
      ta.value = 'Audit singkat otomatis V14';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('v13PromptSendBtn').click();
    })()`);
    await sleep(220);
    await ev('officeQA.advance(1); 0');
    const duringPrompt3d = await ev(`(() => {
      const dbg = officeDebug();
      const a = dbg.actors.find(x => x.id === 'codex');
      const flowActive = Boolean(window.OfficeFlow?.snapshot?.().some(f => f.provider === 'codex' && f.source === 'panel' && f.status === 'working'));
      return {
        started: dbg.milestones.some(m => m.stage === 'v13-prompt-started' && m.detail === 'codex'),
        handoff: dbg.milestones.some(m => m.stage === 'v13-prompt-handoff' && m.detail === 'codex'),
        flowActive,
        codexBusy: Boolean(a?.busy),
        codexActivity: a?.activity
      };
    })()`);
    await sleep(1600);
    await ev('officeQA.advance(1); 0');
    const afterPrompt3d = await ev(`(() => {
      const dbg = officeDebug();
      const a = dbg.actors.find(x => x.id === 'codex');
      const flowDone = Boolean(window.OfficeFlow?.snapshot?.().some(f => f.provider === 'codex' && f.source === 'panel' && f.status === 'completed'));
      return {
        done: dbg.milestones.some(m => m.stage === 'v13-prompt-done' && m.detail === 'codex'),
        flowDone,
        codexBusy: Boolean(a?.busy)
      };
    })()`);

    // Click saved report button
    const reportLoaded = await ev(`(async () => {
      const btn = document.getElementById('agent14ViewReportBtn');
      if (!btn) return { hasBtn: false, sendText: document.getElementById('v13PromptSendBtn')?.textContent || '' };
      btn.click();
      await new Promise(r => setTimeout(r, 250));
      return {
        hasBtn: true,
        btnText: btn.textContent,
        consoleText: document.getElementById('v13PromptConsole')?.textContent || ''
      };
    })()`);

    // Capture screenshot of upgraded Prompt Agen AI panel
    const shot2 = await call('Page.captureScreenshot', { format: 'png' });
    const shot2Path = path.join(shotDir, 'prompt_agent_v14_panel.png');
    await fs.writeFile(shot2Path, Buffer.from(shot2.data, 'base64'));
    out.shots.push(shot2Path);

    check(
      'Integrated Prompt UI shows BYOK API-key-missing + integration link, hierarchical models (no agy -low), effort, quick CWD, Full Access preview, report viewer, and 3D codex movement',
      byokUi.badge !== 'Not Installed' &&
        byokUi.hasIntegrationBtn === true &&
        byokUi.hasEffortField === false &&
        byokUi.modelOptCount >= 3 &&
        agyUi.hasLowOption === false &&
        agyUi.optCount >= 5 &&
        agyUi.hasEffortField === false &&
        promptBeforeToggle.hasEffortField === true &&
        promptBeforeToggle.cwdPresetCount >= 2 &&
        promptBeforeToggle.hasTestBtn === true &&
        promptBeforeToggle.cmdOn.includes('--dangerously-bypass-approvals-and-sandbox') &&
        promptAfterToggle.cmdOff.includes('--sandbox read-only') &&
        promptAfterToggle.cmdOff.includes('gpt-6.1-sol') &&
        promptAfterToggle.effortVal === 'high' &&
        promptBeforeToggle.riskOn !== promptAfterToggle.riskOff &&
        duringPrompt3d.started === true &&
        duringPrompt3d.flowActive === true &&
        duringPrompt3d.codexBusy === true &&
        afterPrompt3d.done === true &&
        afterPrompt3d.flowDone === true &&
        afterPrompt3d.codexBusy === false &&
        reportLoaded.hasBtn === true &&
        reportLoaded.consoleText.includes('Laporan Prompt Agen') &&
        reportLoaded.consoleText.includes('Hasil audit selesai: siap!'),
      { byokUi, agyUi, promptBeforeToggle, promptAfterToggle, codexBefore, duringPrompt3d, afterPrompt3d, reportLoaded: { hasBtn: reportLoaded.hasBtn, sendText: reportLoaded.sendText, len: reportLoaded.consoleText?.length } }
    );

    // Check 0 console errors & 0 page exceptions
    const consoleErrors = cdpEvents
      .filter(
        e =>
          (e.method === 'Runtime.consoleAPICalled' && e.params?.type === 'error') ||
          (e.method === 'Log.entryAdded' && e.params?.entry?.level === 'error')
      )
      .map(e => JSON.stringify(e.params).slice(0, 240));
    const pageExceptions = cdpEvents
      .filter(e => e.method === 'Runtime.exceptionThrown')
      .map(e => JSON.stringify(e.params).slice(0, 240));
    out.consoleErrors = consoleErrors;
    out.pageExceptions = pageExceptions;
    out.metrics.drawCalls = pillAnd3d.drawCalls;

    check('0 console errors and 0 page exceptions during full V14 browser test', consoleErrors.length === 0 && pageExceptions.length === 0, {
      consoleErrors,
      pageExceptions
    });

    // =========================================================================
    // PART D: REAL YOUTUBE STUDIO MANAGER READ-ONLY TEST (ZERO LOGIN, ZERO QUOTA)
    // =========================================================================
    if (projInfo.found) {
      const realTestPort = await new Promise(resolve => {
        const s = http.createServer();
        s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
      });
      realHost = await createYoutubeDashboardHost({
        root,
        dataDir: path.join(unitDir, 'yt-real-data'),
        port: realTestPort
      });
      const realStart = await realHost.ensureRunning();
      let htmlOk = false;
      let noXfoBlock = false;
      let metaCount = 0;
      let quotaUnitsBefore = -1;
      let quotaUnitsAfter = -1;
      let summaryZeroQuotaOk = false;

      if (realStart.ok) {
        const hRes = await fetch(`http://127.0.0.1:${realTestPort}/`);
        const hTxt = await hRes.text();
        htmlOk = hRes.ok && hTxt.includes('YouTube Studio') && hTxt.includes('window.API_TOKEN');
        noXfoBlock = !hRes.headers.get('x-frame-options');
        const mRes = await fetch(`http://127.0.0.1:${realTestPort}/api/meta`).then(r => r.json());
        metaCount = Array.isArray(mRes.channels) ? mRes.channels.length : 0;
        const q1 = await fetch(`http://127.0.0.1:${realTestPort}/api/quota`).then(r => r.json());
        quotaUnitsBefore = Object.values(q1.channels || {}).reduce((a, c) => a + (Number(c.units) || 0), 0);
        // Panggil fetchOfficeSummary dengan mode 0-kuota & tanpa refresh login!
        const rSum = await realHost.fetchOfficeSummary({ includeLiveMetrics: false, checkHealth: false, checkComments: false });
        summaryZeroQuotaOk = rSum.running === true && rSum.totals.totalChannels === metaCount;
        const q2 = await fetch(`http://127.0.0.1:${realTestPort}/api/quota`).then(r => r.json());
        quotaUnitsAfter = Object.values(q2.channels || {}).reduce((a, c) => a + (Number(c.units) || 0), 0);
      }
      const realStop = await realHost.stopOwned();
      await sleep(300);
      const realClosed = await fetch(`http://127.0.0.1:${realTestPort}/api/meta`).then(() => false).catch(() => true);

      check(
        'Real YouTube Studio Manager (server.py) starts with --no-browser, serves frameable HTML + 0-quota read-only APIs, spends 0 quota, and stops cleanly',
        realStart.ok && htmlOk && noXfoBlock && metaCount > 0 && summaryZeroQuotaOk && quotaUnitsBefore === quotaUnitsAfter && realStop.stoppedOwned === true && realClosed,
        { realPort: realTestPort, htmlOk, noXfoBlock, metaCount, quotaUnitsBefore, quotaUnitsAfter, realClosed }
      );
    }

    out.ok = out.failed.length === 0;
  } catch (err) {
    out.exception = err?.stack || String(err);
    out.ok = false;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (realHost) await realHost.stop().catch(() => {});
    if (ownedHost) await ownedHost.stop().catch(() => {});
    if (stubUi) await stubUi.close().catch(() => {});
    if (stubExt) await stubExt.close().catch(() => {});
    if (unitDir) await fs.rm(unitDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }).catch(() => {});
    out.finishedAt = new Date().toISOString();
    out.summary = { passed: out.checks.length - out.failed.length, total: out.checks.length };
    await fs.writeFile(path.join(root, 'qa/v14_youtube_agents_results.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');
    console.log(JSON.stringify({ ok: out.ok, summary: out.summary, metrics: out.metrics, shots: out.shots, failed: out.failed }, null, 2));
    if (!out.ok) process.exitCode = 1;
  }
})();
