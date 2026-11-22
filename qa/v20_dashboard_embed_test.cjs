// [Diubah oleh Gemini - 2026-11-21] Suite Uji V20: Font/Ikon Lokal (0 permintaan eksternal), Mode Tertanam Office AI (?embed=office), Tema Terang/Gelap Instan, Sinkron Tab & Pemilih Channel, Gulir Tunggal (1280x720 & 1600x900), Regresi Mode Mandiri, Auto-Dismiss Banner & Status Sync
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { root, sleep } = require('./v6c_lib.cjs');
const { resolveProjectRoot } = require('../youtube_dashboard_host.js');
const { startServer } = require('../embedded_server.js');

const LOCK_V18 = path.join(root, 'qa/v18_browser.lock');
const LOCK_V20 = path.join(root, 'qa/v20_browser.lock');
const SHOT_DIR = path.join(root, 'qa/v20-shots');

async function acquireBrowserLock() {
  for (let i = 0; i < 90; i++) {
    try {
      const st = await fs.stat(LOCK_V18);
      if (Date.now() - st.mtimeMs < 180000) {
        await sleep(1000);
        continue;
      }
    } catch {}
    break;
  }
  await fs.writeFile(LOCK_V20, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), 'utf8');
}

async function releaseBrowserLock() {
  await fs.unlink(LOCK_V20).catch(() => {});
}

function parseRgb(str) {
  const m = String(str || '').match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/i);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function relLuminance(rgb) {
  if (!rgb) return 0;
  const toLin = v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLin(rgb[0]) + 0.7152 * toLin(rgb[1]) + 0.0722 * toLin(rgb[2]);
}

function contrastRatio(fgStr, bgStr) {
  const l1 = relLuminance(parseRgb(fgStr));
  const l2 = relLuminance(parseRgb(bgStr));
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

async function startStubDashboard({ staticDir, failChannel = false, port = 0 } = {}) {
  const token = crypto.randomBytes(18).toString('base64url');
  const launchCalls = [];
  let failProjects = false;

  const channels = [
    { key: 'demostudio', title: 'Demo Studio', slot_utc_hour: 20, connected: true, pending: false, has_client: true, chrome_profile: 'Default', oauth_mode: 'testing', language: 'en', color: '#E2B13C' },
    { key: 'explainerlab', title: 'Explainer Lab', slot_utc_hour: 11, connected: true, pending: false, has_client: true, chrome_profile: 'Profile 1', oauth_mode: 'testing', language: 'id', color: '#38BDF8' }
  ];

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    days.push({ day: d, views: 1400 + (6 - i) * 340, estimatedMinutesWatched: 1020 + (6 - i) * 190, subscribersGained: 16 + (6 - i) * 3, subscribersLost: 2 });
  }

  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    const send = (code, body, ctype = 'application/json; charset=utf-8', extra = {}) => {
      const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
      res.writeHead(code, { 'Content-Type': ctype, 'Content-Length': buf.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
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
      return send(200, { ok: true });
    }

    if (u.pathname === '/api/meta') return send(200, { channels, cache_min: 15 });
    if (u.pathname === '/api/quota') {
      return send(200, {
        day: new Date().toISOString().slice(0, 10),
        limit: 10000,
        channels: {
          demostudio: { units: 420, analytics: 12, calls: { videos: 10, channel: 2 } },
          explainerlab: { units: 180, analytics: 6, calls: { videos: 5, channel: 1 } }
        }
      });
    }
    if (u.pathname === '/api/projects') {
      if (failProjects) return send(500, { error: 'simulated projects error' });
      return send(200, [
        { channel: 'demostudio', name: '01-clouds', status: 'ready', title: 'Why Do Clouds Float?', files: { 'description.txt': true, 'thumbnail.jpg': true }, video_mb: 14, modified: '2026-11-21T10:00' },
        { channel: 'explainerlab', name: '02-optics', status: 'animating', title: 'How Mirrors Flip Light', files: { 'description.txt': false, 'thumbnail.jpg': false }, video_mb: null, modified: '2026-11-21T11:15' }
      ]);
    }
    if (u.pathname === '/api/health') {
      const loginAt = new Date(Date.now() - 2 * 86400000).toISOString();
      const expOk = new Date(Date.now() + 5.2 * 86400000).toISOString();
      return send(200, {
        demostudio: { state: 'ok', days_left: 5.2, login_at: loginAt, expires_at: expOk, oauth_mode: 'testing', store: 'vault', checked_at: new Date().toISOString() },
        explainerlab: { state: 'ok', days_left: 4.8, login_at: loginAt, expires_at: expOk, oauth_mode: 'testing', store: 'vault', checked_at: new Date().toISOString() }
      });
    }
    if (u.pathname === '/api/auth-status') return send(200, { demostudio: { state: 'idle' }, explainerlab: { state: 'idle' } });
    if (u.pathname === '/api/chrome-profiles') {
      return send(200, {
        profiles: [{ dir: 'Default', name: 'Default' }, { dir: 'Profile 1', name: 'Creator Profile' }],
        channel_ids: { demostudio: 'UC_DEMO_STUB', explainerlab: 'UC_EXPLAINER_STUB' },
        sessions: { demostudio: { exists: true, emails: ['demo@example.invalid'] }, explainerlab: { exists: true, emails: ['lab@example.invalid'] } }
      });
    }
    if (u.pathname === '/api/account') {
      const ch = u.searchParams.get('ch') || 'demostudio';
      return send(200, {
        key: ch,
        title: ch === 'demostudio' ? 'Demo Studio' : 'Explainer Lab',
        channel_id: ch === 'demostudio' ? 'UC_DEMO_STUB' : 'UC_EXPLAINER_STUB',
        pending: false,
        language: ch === 'demostudio' ? 'en' : 'id',
        slot_utc_hour: ch === 'demostudio' ? 20 : 11,
        oauth_mode: 'testing',
        token_file: 'token_stub.json',
        session: { exists: true, emails: ['demo@example.invalid'] },
        token: { stored: true, login_at: new Date(Date.now() - 86400000).toISOString(), scopes: ['https://www.googleapis.com/auth/youtube.readonly'] },
        client: { exists: true, file: 'client_secret_stub.json', client_id: '1234…stub', client_secret: 'GOC…stub', project_id: 'demo-stub-proj', kind: 'installed' },
        units_today: 420,
        audit: []
      });
    }
    if (u.pathname === '/api/channel') {
      if (failChannel) return send(500, { error: 'simulated channel error' });
      const ch = u.searchParams.get('ch') || 'demostudio';
      const p = ch === 'demostudio';
      return send(200, {
        id: p ? 'UC_DEMO_STUB' : 'UC_EXPLAINER_STUB',
        title: p ? 'Demo Studio' : 'Explainer Lab',
        handle: p ? '@demostudio' : '@explainerlab',
        stats: p ? { subscriberCount: '14800', viewCount: '312400', videoCount: '28' } : { subscriberCount: '6450', viewCount: '149100', videoCount: '19' }
      });
    }
    if (u.pathname === '/api/videos') {
      const ch = u.searchParams.get('ch') || 'demostudio';
      return send(200, [
        { id: ch + '_v1', title: 'What If Gravity Flipped?', privacy: 'public', published: '2026-11-18T03:00:00Z', duration: 'PT48S', stats: { viewCount: '18400', likeCount: '910', commentCount: '24' } },
        { id: ch + '_v2', title: 'Scheduled Short Episode', privacy: 'private', publish_at: '2026-11-24T03:00:00Z', published: '2026-11-20T03:00:00Z', duration: 'PT45S', stats: { viewCount: '0', likeCount: '0', commentCount: '0' } }
      ]);
    }
    if (u.pathname === '/api/analytics') {
      const ch = u.searchParams.get('ch') || 'demostudio';
      return send(200, { videos: [{ video: ch + '_v1', views: 18400, averageViewPercentage: 78.2, averageViewDuration: 37, likes: 910, subscribersGained: 42 }] });
    }
    if (u.pathname === '/api/daily') return send(200, { start: days[0].day, end: days[days.length - 1].day, days });
    if (u.pathname === '/api/sources') {
      return send(200, {
        traffic: [{ insightTrafficSourceType: 'SHORTS', views: 15200 }, { insightTrafficSourceType: 'YT_SEARCH', views: 3200 }],
        countries: [{ country: 'US', views: 9200 }, { country: 'ID', views: 6000 }]
      });
    }
    if (u.pathname === '/api/comments') {
      const ch = u.searchParams.get('ch') || 'demostudio';
      return send(200, [
        { id: ch + '_cm1', author: 'Viewer Demo', text: 'Great animation pacing!', likes: 4, replies: 0, published: '2026-11-20T12:00:00Z', video_id: ch + '_v1', video_title: 'What If Gravity Flipped?' }
      ]);
    }

    // Serve REAL unmodified static files (including local fonts/woff2!)
    const rel = u.pathname === '/' ? 'index.html' : u.pathname.replace(/^\/+/, '');
    const full = path.resolve(staticDir, rel);
    if (full.startsWith(path.resolve(staticDir))) {
      try {
        let buf = await fs.readFile(full);
        const ext = path.extname(full).toLowerCase();
        const ctype = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'text/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.svg': 'image/svg+xml',
          '.woff2': 'font/woff2',
          '.woff': 'font/woff',
          '.txt': 'text/plain; charset=utf-8'
        }[ext] || 'application/octet-stream';
        const extra = {};
        if (rel === 'index.html') {
          buf = Buffer.from(buf.toString('utf8').replace('__TOKEN__', token), 'utf8');
          extra['Content-Security-Policy'] = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' https: data: blob:; connect-src 'self'; frame-ancestors 'self' http://127.0.0.1:* http://localhost:*; base-uri 'self'";
        }
        return send(200, buf, ctype, extra);
      } catch {}
    }
    send(404, { error: 'not found' });
  });

  await new Promise(r => srv.listen(port, '127.0.0.1', r));
  return {
    port: srv.address().port,
    origin: `http://127.0.0.1:${srv.address().port}`,
    getLaunchCalls: () => launchCalls,
    setFailProjects: v => { failProjects = Boolean(v); },
    close: () => new Promise(r => { srv.closeAllConnections?.(); srv.close(r); })
  };
}

(async () => {
  const out = {
    ok: false,
    startedAt: new Date().toISOString(),
    checks: [],
    failed: [],
    shots: [],
    consoleErrors: [],
    pageExceptions: [],
    outboundRequests: []
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

  let fixture = null;
  let stub = null;
  let officeSrv = null;
  let chrome = null;
  let ws = null;

  await acquireBrowserLock();
  try {
    await fs.mkdir(SHOT_DIR, { recursive: true });
    fixture = await fs.mkdtemp(path.join(root, 'qa/v20-test-'));
    await fs.mkdir(path.join(fixture, 'data'), { recursive: true });
    await fs.mkdir(path.join(fixture, 'chrome'), { recursive: true });

    const projInfo = await resolveProjectRoot({ root });
    const staticDir = projInfo.found && projInfo.serverScript ? path.join(path.dirname(projInfo.serverScript), 'static') : '';
    check('Dashboard static directory discovered cleanly via resolveProjectRoot', Boolean(staticDir), { found: projInfo.found, layout: projInfo.layout });
    if (!staticDir) throw new Error('Dashboard static directory not found');

    stub = await startStubDashboard({ staticDir });
    officeSrv = await startServer({
      root,
      collector: false,
      port: 0,
      maxPort: 0,
      dataDir: path.join(fixture, 'data'),
      allowDriveScan: false,
      youtubeDashboard: { port: stub.port, serverScript: path.join(fixture, 'disabled_spawn_server.py') }
    });

    const chromeExe = path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium-1248/chrome-win64/chrome.exe');
    chrome = spawn(chromeExe, [
      '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-breakpad',
      '--in-process-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--remote-debugging-port=0', '--user-data-dir=' + path.join(fixture, 'chrome'),
      '--window-size=1280,720', 'about:blank'
    ], { windowsHide: true, stdio: 'ignore' });

    let cdpPort = 0;
    for (let i = 0; i < 80; i++) {
      try { cdpPort = Number((await fs.readFile(path.join(fixture, 'chrome', 'DevToolsActivePort'), 'utf8')).split('\n')[0]); if (cdpPort) break; } catch {}
      await sleep(100);
    }
    if (!cdpPort) throw new Error('Chrome CDP startup failed');

    const pages = await (await fetch('http://127.0.0.1:' + cdpPort + '/json')).json();
    ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
    const pending = new Map();
    let seq = 0;
    await new Promise(r => ws.addEventListener('open', r));
    const call = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++seq; pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
    ws.addEventListener('message', e => {
      const m = JSON.parse(e.data);
      if (m.id) {
        const p = pending.get(m.id);
        pending.delete(m.id);
        if (p) m.error ? p.reject(m.error) : p.resolve(m.result);
      } else if (m.method === 'Fetch.requestPaused') {
        const url = m.params.request.url;
        out.outboundRequests.push(url);
        call('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' }).catch(() => {});
      } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        out.consoleErrors.push(m.params.args?.map(a => a.value ?? a.description).join(' '));
      } else if (m.method === 'Runtime.exceptionThrown') {
        out.pageExceptions.push(m.params.exceptionDetails?.text || 'exception');
      }
    });
    const ev = async (expression, contextId) => {
      const params = { expression, returnByValue: true, awaitPromise: true };
      if (contextId) params.contextId = contextId;
      const r = await call('Runtime.evaluate', params);
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 1000));
      return r.result.value;
    };

    for (const dom of ['Runtime', 'Page', 'Network']) await call(dom + '.enable');
    // Strictly block ALL https:// requests (simulating Electron main.js zero-external-network sandbox)
    await call('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] });
    await call('Page.addScriptToEvaluateOnNewDocument', { source: 'window.addEventListener("load",()=>window.officeQA?.freeze());' });

    async function getIframeWorld() {
      const ft = await call('Page.getFrameTree');
      const child = ft.frameTree?.childFrames?.[0]?.frame || null;
      if (!child) return null;
      const w = await call('Page.createIsolatedWorld', { frameId: child.id, worldName: 'v20qa' });
      return { frame: child, ctx: w.executionContextId };
    }

    async function snap(name) {
      await sleep(220);
      const r = await call('Page.captureScreenshot', { format: 'png' });
      const file = path.join(SHOT_DIR, name);
      await fs.writeFile(file, Buffer.from(r.data, 'base64'));
      out.shots.push(file);
      return file;
    }

    // =========================================================================
    // 1. EMBEDDED MODE: LIGHT THEME @ 1280x720
    // =========================================================================
    await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await call('Page.navigate', { url: officeSrv.origin + '/?qa=1' });
    for (let i = 0; i < 100; i++) { await sleep(100); if (await ev('typeof officeQA !== "undefined"')) break; }
    await ev('officeQA.freeze(); officeQA.auto(false); OfficeSettings.set({...OfficeSettings.get(), language: "en", appearance: {...OfficeSettings.get().appearance, theme: "light"}}); 0');
    await sleep(300);

    // Open YouTube Dashboard panel (initially stopped -> attaches -> shows ok notice banner -> auto-dismisses after ~4s)
    await ev(`document.getElementById('youtubeCardButton').click(); 0`);
    let noticeSeenInitially = false;
    let fw = null;
    for (let i = 0; i < 50; i++) {
      await sleep(150);
      if (!noticeSeenInitially) {
        noticeSeenInitially = await ev('Boolean(document.getElementById("yt20NoticeBanner"))').catch(() => false);
      }
      fw = await getIframeWorld();
      if (fw && fw.frame.url.includes('embed=office')) {
        const ready = await ev('Boolean(document.querySelector("#view h1") && !document.querySelector("#view [aria-busy=true]"))', fw.ctx).catch(() => false);
        if (ready) break;
      }
    }
    await sleep(500);

    // Inspect fonts, icons, tokens, layout & scroll at 1280x720 Light
    const hostLight1280 = await ev(`(() => {
      const cs = getComputedStyle(document.documentElement);
      const dlg = document.getElementById('panel');
      const pc = document.getElementById('panelContent');
      const frame = document.getElementById('yt14DashboardFrame');
      const syncPill = document.getElementById('yt20SyncPill');
      return {
        theme: document.documentElement.dataset.theme,
        paper: cs.getPropertyValue('--paper').trim(),
        surface: cs.getPropertyValue('--surface').trim(),
        ink: cs.getPropertyValue('--ink').trim(),
        dlgOverflowY: dlg.scrollHeight - dlg.clientHeight,
        pcOverflowY: pc.scrollHeight - pc.clientHeight,
        frameSrc: frame?.src || '',
        frameW: Math.round(frame?.getBoundingClientRect().width || 0),
        frameH: Math.round(frame?.getBoundingClientRect().height || 0),
        syncText: syncPill?.textContent?.trim() || '',
        syncState: syncPill?.dataset.syncState || ''
      };
    })()`);

    const embLight1280 = await ev(`(async () => {
      await document.fonts.ready;
      const loadedFaces = [...document.fonts].filter(f => f.status === 'loaded').map(f => ({ family: f.family.replace(/['"]/g, ''), weight: f.weight }));
      const visibleMs = [...document.querySelectorAll('.ms')].filter(el => el.offsetParent !== null);
      const leakingMs = visibleMs.filter(el => el.scrollWidth > el.getBoundingClientRect().width + 2).map(el => ({ text: el.textContent, w: el.getBoundingClientRect().width, sw: el.scrollWidth }));
      const rail = document.querySelector('#rail');
      const chBar = document.querySelector('#embedChannelBar');
      const bodyCs = getComputedStyle(document.body);
      const card = document.querySelector('.card');
      const cardCs = card ? getComputedStyle(card) : null;
      const h1Cs = getComputedStyle(document.querySelector('#view h1'));
      const leadCs = getComputedStyle(document.querySelector('#view .lead'));
      const syncText = document.querySelector('#syncText')?.textContent?.trim() || '';
      const syncState = document.querySelector('#syncChip')?.dataset.state || '';
      return {
        embedAttr: document.documentElement.dataset.embed,
        themeAttr: document.documentElement.dataset.theme,
        interCheck: document.fonts.check('14px Inter'),
        msCheck: document.fonts.check('20px "Material Symbols Outlined"'),
        hasLoadedInter: loadedFaces.some(f => f.family === 'Inter'),
        hasLoadedMs: loadedFaces.some(f => f.family === 'Material Symbols Outlined'),
        visibleMsCount: visibleMs.length,
        leakingMs,
        railDisplay: rail ? getComputedStyle(rail).display : 'missing',
        chBarVisible: Boolean(chBar && !chBar.hidden && getComputedStyle(chBar).display !== 'none'),
        chButtons: chBar ? chBar.querySelectorAll('button[data-sel]').length : 0,
        bodyBg: bodyCs.backgroundColor,
        bodyColor: bodyCs.color,
        cardBg: cardCs?.backgroundColor || '',
        cardRadius: cardCs?.borderRadius || '',
        h1Color: h1Cs.color,
        leadColor: leadCs.color,
        horizOverflow: document.documentElement.scrollWidth - window.innerWidth,
        syncText,
        syncState
      };
    })()`, fw.ctx);

    await snap('after_light_1280.png');

    // (a) Zero outbound requests & local fonts + zero ligature text leaks
    check(
      '(a) Local Inter & Material Symbols loaded (document.fonts), 0 outbound requests, 0 ligature text leaks',
      out.outboundRequests.length === 0 &&
        embLight1280.interCheck &&
        embLight1280.msCheck &&
        embLight1280.hasLoadedInter &&
        embLight1280.hasLoadedMs &&
        embLight1280.visibleMsCount >= 6 &&
        embLight1280.leakingMs.length === 0,
      {
        outbound: out.outboundRequests,
        hasLoadedInter: embLight1280.hasLoadedInter,
        hasLoadedMs: embLight1280.hasLoadedMs,
        visibleMsCount: embLight1280.visibleMsCount,
        leakingMs: embLight1280.leakingMs
      }
    );

    // Check host-to-iframe Light token match & >=4.5:1 contrast
    const lightTextContrast = contrastRatio(embLight1280.bodyColor, embLight1280.cardBg);
    const lightMutedContrast = contrastRatio(embLight1280.leadColor, embLight1280.bodyBg);
    check(
      '(b1) Embedded Light mode hides sidebar/brand, adopts Office AI light tokens, and keeps >=4.5:1 contrast',
      embLight1280.embedAttr === 'office' &&
        embLight1280.themeAttr === 'light' &&
        embLight1280.railDisplay === 'none' &&
        embLight1280.chBarVisible &&
        embLight1280.chButtons === 3 &&
        embLight1280.bodyBg === 'rgb(246, 248, 245)' &&
        embLight1280.cardBg === 'rgb(255, 255, 255)' &&
        embLight1280.cardRadius === '12px' &&
        lightTextContrast >= 4.5 &&
        lightMutedContrast >= 4.5,
      {
        bodyBg: embLight1280.bodyBg,
        cardBg: embLight1280.cardBg,
        cardRadius: embLight1280.cardRadius,
        lightTextContrast: Number(lightTextContrast.toFixed(2)),
        lightMutedContrast: Number(lightMutedContrast.toFixed(2)),
        railDisplay: embLight1280.railDisplay,
        chButtons: embLight1280.chButtons
      }
    );

    // Check Channels & Sign-in page in Light 1280x720 (verifying SIGNED IN badge icon is crisp, not "VI")
    await ev(`document.querySelector('#yt14PageNav button[data-hash="manager"]')?.click(); 0`);
    await sleep(450);
    const managerCheck = await ev(`(() => {
      const h1 = document.querySelector('#view h1')?.textContent?.trim() || '';
      const visibleMs = [...document.querySelectorAll('.ms')].filter(el => el.offsetParent !== null);
      const leakingMs = visibleMs.filter(el => el.scrollWidth > el.getBoundingClientRect().width + 2).map(el => el.textContent);
      return { h1, visibleMsCount: visibleMs.length, leakingMs };
    })()`, fw.ctx);
    await snap('after_manager_light_1280.png');
    await ev(`document.querySelector('#yt14PageNav button[data-hash="overview"]')?.click(); 0`);
    await sleep(300);

    // =========================================================================
    // 2. LIVE THEME SWITCH LIGHT -> DARK (ZERO RELOAD) @ 1280x720 & 1600x900
    // =========================================================================
    await ev('window.__v20FrameMarker = true; 0', fw.ctx);
    await ev('OfficeSettings.set({...OfficeSettings.get(), appearance: {...OfficeSettings.get().appearance, theme: "dark"}}); 0');
    await sleep(350);

    const embDark1280 = await ev(`(() => {
      const bodyCs = getComputedStyle(document.body);
      const card = document.querySelector('.card');
      const cardCs = card ? getComputedStyle(card) : null;
      const leadCs = getComputedStyle(document.querySelector('#view .lead'));
      return {
        preservedWithoutReload: window.__v20FrameMarker === true,
        themeAttr: document.documentElement.dataset.theme,
        bodyBg: bodyCs.backgroundColor,
        bodyColor: bodyCs.color,
        cardBg: cardCs?.backgroundColor || '',
        leadColor: leadCs.color,
        horizOverflow: document.documentElement.scrollWidth - window.innerWidth
      };
    })()`, fw.ctx);
    await snap('after_dark_1280.png');

    const darkTextContrast = contrastRatio(embDark1280.bodyColor, embDark1280.cardBg);
    const darkMutedContrast = contrastRatio(embDark1280.leadColor, embDark1280.cardBg);
    check(
      '(b2) Live Light -> Dark theme switch updates iframe instantly via postMessage without reload and keeps >=4.5:1 contrast',
      embDark1280.preservedWithoutReload === true &&
        embDark1280.themeAttr === 'dark' &&
        embDark1280.bodyBg === 'rgb(16, 27, 25)' &&
        embDark1280.cardBg === 'rgb(24, 39, 37)' &&
        darkTextContrast >= 4.5 &&
        darkMutedContrast >= 4.5,
      {
        preservedWithoutReload: embDark1280.preservedWithoutReload,
        bodyBg: embDark1280.bodyBg,
        cardBg: embDark1280.cardBg,
        darkTextContrast: Number(darkTextContrast.toFixed(2)),
        darkMutedContrast: Number(darkMutedContrast.toFixed(2))
      }
    );

    // 1600x900 Dark + Light
    await call('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(300);
    const dark1600Scroll = await ev(`(() => ({
      dlgOverflowY: document.getElementById('panel').scrollHeight - document.getElementById('panel').clientHeight,
      pcOverflowY: document.getElementById('panelContent').scrollHeight - document.getElementById('panelContent').clientHeight
    }))()`);
    const dark1600Inner = await ev('({ horizOverflow: document.documentElement.scrollWidth - window.innerWidth })', fw.ctx);
    await snap('after_dark_1600.png');

    await ev('OfficeSettings.set({...OfficeSettings.get(), appearance: {...OfficeSettings.get().appearance, theme: "light"}}); 0');
    await sleep(350);
    const light1600Scroll = await ev(`(() => ({
      dlgOverflowY: document.getElementById('panel').scrollHeight - document.getElementById('panel').clientHeight,
      pcOverflowY: document.getElementById('panelContent').scrollHeight - document.getElementById('panelContent').clientHeight
    }))()`);
    const light1600Inner = await ev('({ horizOverflow: document.documentElement.scrollWidth - window.innerWidth })', fw.ctx);
    await snap('after_light_1600.png');

    check(
      '(d) Single scroll area with zero nested dialog scrollbars and zero horizontal overflow at 1280x720 and 1600x900',
      hostLight1280.dlgOverflowY <= 2 &&
        hostLight1280.pcOverflowY <= 2 &&
        embLight1280.horizOverflow <= 2 &&
        embDark1280.horizOverflow <= 2 &&
        dark1600Scroll.dlgOverflowY <= 2 &&
        dark1600Scroll.pcOverflowY <= 2 &&
        dark1600Inner.horizOverflow <= 2 &&
        light1600Scroll.dlgOverflowY <= 2 &&
        light1600Scroll.pcOverflowY <= 2 &&
        light1600Inner.horizOverflow <= 2,
      { hostLight1280, dark1600Scroll, light1600Scroll, embLight1280H: embLight1280.horizOverflow, dark1600H: dark1600Inner.horizOverflow, light1600H: light1600Inner.horizOverflow }
    );

    // =========================================================================
    // 3. BIDIRECTIONAL TAB SYNC + TOP CHANNEL PICKER + X-TOKEN POST
    // =========================================================================
    const tabSynced = [];
    for (const h of ['compare', 'content', 'schedule', 'comments', 'quota', 'manager', 'overview']) {
      await ev(`document.querySelector('#yt14PageNav button[data-hash="${h}"]')?.click(); 0`);
      await sleep(220);
      const innerPage = await ev('location.hash.slice(1)', fw.ctx);
      if (innerPage === h) tabSynced.push(h);
    }

    // Navigate from INSIDE iframe (click "Open comments" inside Overview) -> host tab MUST update to comments!
    await ev(`document.querySelector('#view [data-page="comments"]')?.click(); 0`, fw.ctx);
    await sleep(300);
    const hostTabAfterInnerClick = await ev(`document.querySelector('#yt14PageNav button[aria-current="page"]')?.dataset.hash || ''`);
    await ev(`document.querySelector('#yt14PageNav button[data-hash="overview"]')?.click(); 0`);
    await sleep(250);

    // Pick a single channel from top channel switcher -> quick actions bar appears & Studio POST works!
    await ev(`document.querySelector('#embedChannelBar button[data-sel="demostudio"]')?.click(); 0`, fw.ctx);
    await sleep(320);
    const chPickCheck = await ev(`(() => {
      const btn = document.querySelector('#embedChannelBar button[data-sel="demostudio"]');
      const menu = document.querySelector('#embedChannelMenu');
      const lead = document.querySelector('#view .lead')?.textContent || '';
      return {
        pressed: btn?.getAttribute('aria-pressed'),
        menuVisible: Boolean(menu && !menu.hidden && menu.querySelectorAll('button').length >= 4),
        leadMentionsDemoOnly: lead.includes('Demo Studio') && !lead.includes('Explainer Lab')
      };
    })()`, fw.ctx);
    await snap('after_channel_selected_light_1600.png');

    await ev(`document.querySelector('#embedChannelMenu button[data-launch="demostudio"]')?.click(); 0`, fw.ctx);
    await sleep(250);
    await ev(`document.querySelector('#embedChannelBar button[data-sel="all"]')?.click(); 0`, fw.ctx);
    await sleep(220);

    check(
      '(c) Bidirectional host <-> iframe tab sync, compact top channel picker + channel quick actions, and X-Token POST work cleanly',
      tabSynced.length === 7 &&
        hostTabAfterInnerClick === 'comments' &&
        chPickCheck.pressed === 'true' &&
        chPickCheck.menuVisible === true &&
        chPickCheck.leadMentionsDemoOnly === true &&
        stub.getLaunchCalls().length >= 1 &&
        managerCheck.h1.includes('Channels') &&
        managerCheck.leakingMs.length === 0,
      { tabSynced, hostTabAfterInnerClick, chPickCheck, launchCalls: stub.getLaunchCalls().length, managerCheck }
    );

    // =========================================================================
    // 4. AUTO-DISMISS BANNER (~4s) & NON-HANGING SYNC STATUS
    // =========================================================================
    const freshSyncBeforeErr = { host: hostLight1280.syncState, iframe: embLight1280.syncState };
    // Simulate Sync click when projects endpoint fails -> MUST settle to ok/partial/error, NEVER hang on Syncing!
    stub.setFailProjects(true);
    await ev(`document.querySelector('#syncBtn')?.click(); 0`, fw.ctx);
    await sleep(500);
    const afterSyncClick = await ev(`({
      syncText: document.querySelector('#syncText')?.textContent?.trim() || '',
      syncState: document.querySelector('#syncChip')?.dataset.state || '',
      btnDisabled: document.querySelector('#syncBtn')?.getAttribute('aria-disabled') || null,
      preservedWithoutReload: window.__v20FrameMarker === true
    })`, fw.ctx);
    stub.setFailProjects(false);

    // Test real offline -> Start Dashboard -> green notice banner appears -> auto-dismisses after ~4s WITHOUT reloading iframe!
    const stubPort = stub.port;
    await ev(`document.getElementById('panel').close(); 0`);
    await sleep(200);
    await stub.close();
    stub = null;
    await ev(`document.getElementById('youtubeCardButton').click(); 0`);
    for (let i = 0; i < 30; i++) {
      await sleep(120);
      if (await ev('Boolean(document.getElementById("yt14StartBtn"))')) break;
    }
    const sawStartBtn = await ev('Boolean(document.getElementById("yt14StartBtn"))');
    // Restart stub on the same port and click Start Dashboard
    stub = await startStubDashboard({ staticDir, port: stubPort });
    await ev(`document.getElementById('yt14StartBtn').click(); 0`);
    let bannerAppearedText = '';
    for (let i = 0; i < 40; i++) {
      await sleep(100);
      const txt = await ev('document.getElementById("yt20NoticeBanner")?.textContent?.trim() || ""');
      if (txt) { bannerAppearedText = txt; break; }
    }
    let fw2 = null;
    for (let i = 0; i < 40; i++) {
      await sleep(150);
      fw2 = await getIframeWorld().catch(() => null);
      if (fw2 && fw2.frame.url.includes('embed=office')) {
        const ok = await ev('Boolean(document.querySelector("#view h1"))', fw2.ctx).catch(() => false);
        if (ok) break;
      }
    }
    if (!fw2) throw new Error('Second iframe did not mount after Start Dashboard');
    await ev('window.__v20BannerFrameMarker = true; 0', fw2.ctx);
    // Wait up to 5s for the 4000ms auto-dismiss timer
    for (let i = 0; i < 30; i++) {
      const dismissed = await ev('Boolean(document.getElementById("yt20NoticeSlot")?.hidden && !document.getElementById("yt20NoticeBanner"))');
      if (dismissed) break;
      await sleep(200);
    }
    const noticeAfterWait = await ev(`(() => ({
      sawStartBtn: ${sawStartBtn},
      bannerAppeared: ${Boolean(bannerAppearedText)},
      slotHidden: Boolean(document.getElementById('yt20NoticeSlot')?.hidden),
      hasBanner: Boolean(document.getElementById('yt20NoticeBanner'))
    }))()`);
    const bannerFrameSurvived = await ev('window.__v20BannerFrameMarker === true', fw2.ctx);

    check(
      '(f) Success banner appears on start/attach then auto-dismisses (~4s) without reloading iframe, and Sync status settles cleanly (never stuck on Syncing…)',
      noticeAfterWait.sawStartBtn === true &&
        noticeAfterWait.bannerAppeared === true &&
        noticeAfterWait.slotHidden === true &&
        noticeAfterWait.hasBanner === false &&
        bannerFrameSurvived === true &&
        freshSyncBeforeErr.iframe === 'ok' &&
        (freshSyncBeforeErr.host === 'fresh' || freshSyncBeforeErr.host === 'idle') &&
        afterSyncClick.syncState !== 'busy' &&
        !afterSyncClick.syncText.includes('Syncing') &&
        afterSyncClick.btnDisabled === null &&
        afterSyncClick.preservedWithoutReload === true,
      { noticeAfterWait, bannerFrameSurvived, freshSyncBeforeErr, afterSyncClick }
    );

    // =========================================================================
    // 5. STANDALONE MODE REGRESSION CHECK (NO ?embed=office)
    // =========================================================================
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await call('Page.navigate', { url: stub.origin + '/#overview' });
    for (let i = 0; i < 60; i++) {
      await sleep(100);
      const ready = await ev('Boolean(document.querySelector("#rail") && document.querySelector("#view h1") && !document.querySelector("#view [aria-busy=true]"))').catch(() => false);
      if (ready) break;
    }
    await sleep(300);

    const afterStandalone = await ev(`(async () => {
      await document.fonts.ready;
      const loadedFaces = [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/['"]/g, ''));
      const visibleMs = [...document.querySelectorAll('.ms')].filter(el => el.offsetParent !== null);
      const leakingMs = visibleMs.filter(el => el.scrollWidth > el.getBoundingClientRect().width + 2).map(el => el.textContent);
      const rail = document.querySelector('#rail');
      const brand = document.querySelector('.brand');
      const chBar = document.querySelector('#embedChannelBar');
      const card = document.querySelector('.card');
      return {
        embedAttr: document.documentElement.dataset.embed || null,
        bodyBg: getComputedStyle(document.body).backgroundColor,
        bodyColor: getComputedStyle(document.body).color,
        railDisplay: getComputedStyle(rail).display,
        railWidth: Math.round(rail.getBoundingClientRect().width),
        brandVisible: getComputedStyle(brand).display !== 'none',
        navLinks: document.querySelectorAll('#rail nav a').length,
        chBarHidden: Boolean(chBar?.hidden),
        cardBg: getComputedStyle(card).backgroundColor,
        cardRadius: getComputedStyle(card).borderRadius,
        hasLoadedInter: loadedFaces.includes('Inter'),
        hasLoadedMs: loadedFaces.includes('Material Symbols Outlined'),
        visibleMsCount: visibleMs.length,
        leakingMs
      };
    })()`);
    await snap('after_standalone.png');

    check(
      '(e) Standalone mode preserves Stitch dark look, 264px sidebar/brand, 8 nav links, hidden embed bar, and crisp local fonts/icons',
      afterStandalone.embedAttr === null &&
        afterStandalone.bodyBg === 'rgb(15, 15, 16)' &&
        afterStandalone.bodyColor === 'rgb(255, 255, 255)' &&
        afterStandalone.railDisplay === 'flex' &&
        afterStandalone.railWidth === 264 &&
        afterStandalone.brandVisible === true &&
        afterStandalone.navLinks === 8 &&
        afterStandalone.chBarHidden === true &&
        afterStandalone.cardBg === 'rgb(24, 24, 27)' &&
        afterStandalone.cardRadius === '8px' &&
        afterStandalone.hasLoadedInter === true &&
        afterStandalone.hasLoadedMs === true &&
        afterStandalone.leakingMs.length === 0,
      afterStandalone
    );

    check(
      'Zero browser console errors, zero page exceptions, and zero outbound network requests across entire suite',
      out.consoleErrors.length === 0 && out.pageExceptions.length === 0 && out.outboundRequests.length === 0,
      { consoleErrors: out.consoleErrors, pageExceptions: out.pageExceptions, outboundRequests: out.outboundRequests }
    );

    out.ok = out.failed.length === 0;
  } catch (err) {
    out.fatalError = err?.stack || (typeof err === 'object' ? JSON.stringify(err) : String(err));
    out.ok = false;
  } finally {
    try { ws?.close(); } catch {}
    try { chrome?.kill(); } catch {}
    await officeSrv?.close().catch(() => {});
    await stub?.close().catch(() => {});
    if (fixture) await fs.rm(fixture, { recursive: true, force: true }).catch(() => {});
    await releaseBrowserLock();
    out.finishedAt = new Date().toISOString();
    await fs.writeFile(path.join(root, 'qa/v20_results.json'), JSON.stringify(out, null, 2) + '\n', 'utf8').catch(() => {});
    console.log(JSON.stringify({
      ok: out.ok,
      passed: out.checks.filter(c => c.pass).length,
      total: out.checks.length,
      failed: out.failed,
      shots: out.shots.map(s => path.basename(s)),
      fatalError: out.fatalError || null
    }, null, 2));
    if (!out.ok) process.exitCode = 1;
  }
})();
