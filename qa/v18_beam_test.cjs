/* V18 [Diubah oleh Gemini - 2026-11-21] Pengujian otomatis & bukti visual sinar cahaya emissive V18: latensi <=500ms, partikel transfer bergerak aktif & idle, kometa kembali sampai Bos + percikan, gagal=merah berkedip, preset ketebalan, pola aksesibilitas, walkAnimation off, jeda/lanjut, kedaluwarsa selesai >N detik, 200 alur stabil, draw call <=340, frame time sebelum/sesudah (8 alur aktif), 0 error konsol. */
'use strict';

// Jangan pernah menyentuh terminal MT5 live milik pengguna saat uji & tangkapan layar terisolasi.
process.env.OFFICE_MT5_AUTODETECT = '0';

const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const { startServer } = require(path.join(root, 'embedded_server.js'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const LOCK_FILE = path.join(__dirname, 'v18_browser.lock');
const PEER_LOCKS = [
  'v17_browser.lock',
  'v16c_browser.lock',
  'v16c_g_browser.lock',
  'v16b_g_browser.lock',
  'v16b_c_browser.lock'
];

function findChrome() {
  const localApp = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const candidates = [
    process.env.OFFICE_TEST_CHROME,
    path.join(localApp, 'ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe'),
    path.join(localApp, 'ms-playwright/chromium-1248/chrome-win64/chrome.exe')
  ].filter(Boolean);
  for (const c of candidates) {
    if (fsSync.existsSync(c)) return c;
  }
  throw new Error('Playwright Chromium executable not found');
}

async function acquireLock(task, maxWaitMs = 180000) {
  const start = Date.now();
  while (true) {
    const activePeer = PEER_LOCKS.find(name => fsSync.existsSync(path.join(__dirname, name)));
    if (!activePeer && !fsSync.existsSync(LOCK_FILE)) break;
    if (Date.now() - start > maxWaitMs) {
      throw new Error('Browser lock timeout waiting for: ' + (activePeer || 'v18_browser.lock'));
    }
    await sleep(600);
  }
  await fs.writeFile(LOCK_FILE, JSON.stringify({ pid: process.pid, task, at: new Date().toISOString() }) + '\n', { flag: 'wx' });
  return async () => {
    await fs.rm(LOCK_FILE, { force: true }).catch(() => {});
  };
}

async function openBrowser({ sourceOverrides = {} } = {}) {
  const fixture = await fs.mkdtemp(path.join(__dirname, 'v18-test-'));
  const profile = path.join(fixture, 'chrome');
  await fs.mkdir(profile, { recursive: true });
  const server = await startServer({
    root,
    cwd: fixture,
    dataDir: path.join(fixture, 'data'),
    port: 0,
    maxPort: 0,
    collector: false,
    allowDriveScan: false
  });
  const chrome = spawn(findChrome(), [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-breakpad',
    '--in-process-gpu',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--remote-debugging-port=0',
    '--user-data-dir=' + profile,
    '--window-size=1600,900',
    'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });

  let port = 0;
  let ws = null;
  let seq = 0;
  const events = [];
  const pending = new Map();

  try {
    for (let i = 0; i < 100; i++) {
      try {
        port = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
        if (port) break;
      } catch {}
      await sleep(100);
    }
    if (!port) throw new Error('Headless Chromium CDP startup failed');

    const pages = await fetch('http://127.0.0.1:' + port + '/json').then(r => r.json());
    ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r));

    const call = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (p) msg.error ? p.reject(msg.error) : p.resolve(msg.result);
      } else {
        events.push(msg);
        if (msg.method === 'Fetch.requestPaused') {
          const reqId = msg.params.requestId;
          const pathname = new URL(msg.params.request.url).pathname;
          const src = sourceOverrides[pathname];
          const p = src === undefined
            ? call('Fetch.continueRequest', { requestId: reqId })
            : call('Fetch.fulfillRequest', {
                requestId: reqId,
                responseCode: 200,
                responseHeaders: [{ name: 'Content-Type', value: 'text/javascript; charset=utf-8' }],
                body: Buffer.from(src).toString('base64')
              });
          p.catch(err => events.push({ method: 'Fixture.overrideError', error: String(err) }));
        }
      }
    });

    const ev = async expression => {
      const res = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (res.exceptionDetails) {
        throw new Error('Browser eval failed: ' + JSON.stringify(res.exceptionDetails).slice(0, 1600));
      }
      return res.result?.value;
    };

    for (const domain of ['Runtime', 'Log', 'Page']) await call(domain + '.enable');
    if (Object.keys(sourceOverrides).length) {
      await call('Fetch.enable', {
        patterns: Object.keys(sourceOverrides).map(route => ({ urlPattern: server.origin + route, requestStage: 'Request' }))
      });
    }
    await call('Page.addScriptToEvaluateOnNewDocument', {
      source: 'window.addEventListener("load", () => window.officeQA?.freeze());'
    });

    const api = {
      fixture,
      server,
      events,
      call,
      ev,
      async go(query = '?qa=1') {
        await call('Page.navigate', { url: server.origin + '/' + query });
        let ready = false;
        for (let i = 0; i < 150; i++) {
          await sleep(100);
          if (await ev('!!window.officeQA && !!window.OfficeFlow?.stats().renderer')) {
            ready = true;
            break;
          }
        }
        if (!ready) throw new Error('OfficeFlow renderer startup timeout');
        await ev('officeQA.freeze(); officeQA.auto(false); document.querySelectorAll("dialog[open]").forEach(d => d.close()); officeQA.preset("iso"); 0');
        await api.settle();
      },
      async settle() {
        await ev('document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))');
        await ev('officeQA.tick(0); 0');
      },
      async size(width, height) {
        await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        await api.settle();
      },
      async captureBuffer() {
        await api.settle();
        const data = await call('Page.captureScreenshot', { format: 'png' });
        return Buffer.from(data.data, 'base64');
      },
      async shot(filePath) {
        const buf = await api.captureBuffer();
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, buf);
        return buf;
      },
      async close() {
        await Promise.race([call('Browser.close').catch(() => {}), sleep(1500)]);
        ws?.close();
        chrome.kill();
        await server.close();
        const target = path.resolve(fixture);
        if (path.dirname(target) !== __dirname) throw new Error('Unsafe fixture cleanup path');
        await fs.rm(target, { recursive: true, force: true, maxRetries: 15, retryDelay: 100 });
      }
    };
    return api;
  } catch (err) {
    ws?.close();
    chrome.kill();
    await server.close();
    await fs.rm(fixture, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

async function measureEightFlowsPerf(b) {
  return b.ev(`(() => {
    OfficeFlow.clear();
    const s = OfficeSettings.get();
    s.appearance.theme = 'dark';
    s.appearance.light = 'day';
    s.flow16.enabled = true;
    s.flow16.thickness = 1;
    s.flow16.patterns = true;
    s.flow16.walkAnimation = 'fast';
    s.flow16.maxVisibleEdges = 128;
    OfficeSettings.set(s);
    OfficeFlow.configure(s.flow16);
    officeQA.pose(0.42, 1.02, 44, [-8, 0, -5]);
    const providers = ['claude', 'codex', 'gemini', 'hermes', 'claude', 'codex', 'gemini', 'opencode'];
    const personas = ['Plan', 'Designer', 'Explore', 'frontend dev', 'qa engineer', 'technical-writer', 'Plan', 'Designer'];
    const now = Date.now();
    for (let i = 0; i < 8; i++) {
      const fid = 'perf-flow-' + i;
      OfficeFlow.emit({ type: 'call', source: 'hook', provider: providers[i], session: fid, flow_id: fid, event_id: fid + '-c', agent: 'main-' + i, taskTitle: 'Benchmark flow ' + i, at: now + i });
      OfficeFlow.emit({ type: 'spawn', source: 'hook', provider: providers[i], session: fid, flow_id: fid, event_id: fid + '-s', agent: 'sub-' + i, parent: 'main-' + i, agent_type: personas[i], at: now + i + 2 });
    }
    OfficeFlow.advance(400);
    // Warmup 5 frames
    for (let w = 0; w < 5; w++) OfficeFlow.advance(33);
    const times = [];
    for (let f = 0; f < 30; f++) {
      const t0 = performance.now();
      OfficeFlow.advance(33);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const med = times[Math.floor(times.length / 2)];
    const dbg = officeDebug();
    return {
      avgMs: +avg.toFixed(2),
      medianMs: +med.toFixed(2),
      maxMs: +times[times.length - 1].toFixed(2),
      drawCalls: dbg.drawCalls,
      visibleEdges: dbg.flow?.renderer?.visibleEdges || 0,
      memory: dbg.memory
    };
  })()`);
}

async function setupShowcaseFlow(b, { theme = 'light', light = 'day', width = 1600, height = 900, lang = 'id', id = 'demo' } = {}) {
  await b.size(width, height);
  await b.ev(`(() => {
    const s = OfficeSettings.get();
    s.appearance.theme = ${JSON.stringify(theme)};
    s.appearance.light = ${JSON.stringify(light)};
    s.language = ${JSON.stringify(lang)};
    s.followTask = false;
    s.flow16.enabled = true;
    s.flow16.thickness = 1;
    s.flow16.patterns = true;
    s.flow16.paused = false;
    s.flow16.walkAnimation = 'fast';
    s.flow16.maxVisibleEdges = 128;
    OfficeSettings.set(s);
    I18n.setLanguage(${JSON.stringify(lang)});
    OfficeFlow.configure(s.flow16);
    OfficeFlow.clear();
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
    officeQA.pose(0.42, 1.02, 44, [-8, 0, -5]);
    return true;
  })()`);
  await sleep(160);
  const now = Date.now();
  await b.ev(`(() => {
    const id = ${JSON.stringify(id)};
    const now = ${now};
    OfficeFlow.emit({ type: 'call', source: 'hook', provider: 'claude', session: id, flow_id: id, event_id: id + '-c', agent: 'main-' + id, taskTitle: 'Build glowing beam flow', at: now });
    OfficeFlow.emit({ type: 'spawn', source: 'hook', provider: 'claude', session: id, flow_id: id, event_id: id + '-p1', agent: 'sub-arch-' + id, parent: 'main-' + id, agent_type: 'Plan', at: now + 10 });
    OfficeFlow.emit({ type: 'spawn', source: 'hook', provider: 'claude', session: id, flow_id: id, event_id: id + '-p2', agent: 'sub-ui-' + id, parent: 'main-' + id, agent_type: 'Designer', at: now + 20 });
    OfficeFlow.advance(600);
    officeQA.advance(1.2);
    return true;
  })()`);
}

async function main() {
  const skipShots = process.argv.includes('--no-shots');
  const shotDir = path.join(root, 'qa', 'v18-shots');
  const unlock = await acquireLock('v18_beam_test');
  const out = { ok: false, checks: [], failed: [], perf: {}, latency: {}, shots: [], consoleErrors: [] };
  const check = (name, cond, detail = null) => {
    const rec = { name, ok: Boolean(cond) };
    if (detail !== null) rec.detail = detail;
    out.checks.push(rec);
    if (!cond) {
      out.failed.push(rec);
      console.error('[FAIL]', name, JSON.stringify(detail));
    }
    assert.ok(cond, name + ': ' + JSON.stringify(detail));
  };

  let bBefore = null;
  let b = null;

  try {
    // 0. Baseline SEBELUM (jika cadangan tersedia) untuk perbandingan frame time & tangkapan layar sebelum/sesudah
    const backupFlow3d = path.join(root, 'cadangan', 'v18-gemini', 'office_flow3d.js');
    if (fsSync.existsSync(backupFlow3d)) {
      const oldSrc = await fs.readFile(backupFlow3d, 'utf8');
      bBefore = await openBrowser({ sourceOverrides: { '/office_flow3d.js': oldSrc } });
      await bBefore.go('?qa=1');
      out.perf.before = await measureEightFlowsPerf(bBefore);
      if (!skipShots) {
        await setupShowcaseFlow(bBefore, { theme: 'light', light: 'day', width: 1600, height: 900, id: 'before-l' });
        await bBefore.shot(path.join(shotDir, 'before_light_1600.png'));
        out.shots.push('qa/v18-shots/before_light_1600.png');
        await setupShowcaseFlow(bBefore, { theme: 'dark', light: 'day', width: 1600, height: 900, id: 'before-d' });
        await bBefore.shot(path.join(shotDir, 'before_dark_1600.png'));
        out.shots.push('qa/v18-shots/before_dark_1600.png');
      }
      await bBefore.close();
      bBefore = null;
    }

    // 1. Sesi utama V18 (SESUDAH)
    b = await openBrowser();
    await b.go('?qa=1');
    await b.size(1600, 900);

    const post = async event => {
      const r = await fetch(b.server.origin + '/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event)
      });
      assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
      return r.json();
    };
    const waitUntil = async (expr, ms = 4000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (await b.ev(expr)) return true;
        await sleep(25);
      }
      return b.ev(expr);
    };

    // 1a. Benchmark frame time SESUDAH (8 alur aktif)
    out.perf.after = await measureEightFlowsPerf(b);
    check('8 active flows draw calls <= 340', out.perf.after.drawCalls <= 340, out.perf.after);
    check('8 active flows render all 16+ beams', out.perf.after.visibleEdges >= 16, out.perf.after);

    // 1b. Latensi event nyata -> sinar terlihat <= 500 ms (15 sampel)
    await b.ev('officeQA.auto(false); officeQA.freeze(false); OfficeFlow.clear(); 0');
    const samples = [];
    for (let i = 0; i < 15; i++) {
      await b.ev('OfficeFlow.clear(); 0');
      const evObj = { provider: 'claude', type: 'call', agent: 'main-lat-' + i, session: 'lat-' + i, flow_id: 'lat-' + i, event_id: 'lat-' + i, source: 'hook' };
      await post(evObj);
      const ms = await b.ev('new Promise((resolve, reject) => { const t0 = performance.now(); const poll = () => { const a = OfficeFlow.stats().latencyMs; if (a.length) resolve(Math.max(...a)); else if (performance.now() - t0 > 2500) reject(new Error("latency timeout")); else setTimeout(poll, 16); }; poll(); })');
      samples.push(ms);
      await post({ ...evObj, type: 'report', event_id: 'lat-end-' + i });
    }
    samples.sort((a, c) => a - c);
    out.latency = { count: samples.length, medianMs: +samples[Math.floor(samples.length / 2)].toFixed(2), maxMs: +samples[samples.length - 1].toFixed(2) };
    check('beam visible latency <= 500 ms (median & max)', out.latency.medianMs <= 500 && out.latency.maxMs <= 500, out.latency);

    await b.ev('officeQA.freeze(); OfficeFlow.clear(); 0');

    // Arsipkan laporan sisa uji latensi agar baki bersih sebelum tangkapan layar showcase
    const clearTray = async () => {
      const ids = await fetch(b.server.origin + '/reports').then(r => r.json()).then(r => r.reports.filter(x => !x.archived).map(x => x.id));
      if (ids.length) {
        for (const act of ['read', 'archive']) {
          await fetch(b.server.origin + '/reports/batch/' + act, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids })
          });
        }
        await sleep(160);
      }
    };
    await clearTray();

    // 1c. Partikel transfer bergerak antar bingkai (saat aktif DAN saat idle/bekerja > 1.5 dtk)
    await setupShowcaseFlow(b, { theme: 'dark', light: 'day', width: 1600, height: 900, id: 'motion-test' });
    const s1 = await b.ev('OfficeFlow.stats().renderer');
    const buf1 = await b.captureBuffer();
    await b.ev('OfficeFlow.advance(220); 0');
    const s2 = await b.ev('OfficeFlow.stats().renderer');
    const buf2 = await b.captureBuffer();
    check(
      'active transfer particles advance smoothly between frames (state & pixels)',
      s1.particles > 0 && s2.particles > 0 && JSON.stringify(s1.particleSample) !== JSON.stringify(s2.particleSample) && !buf1.equals(buf2),
      { p1: s1.particleSample, p2: s2.particleSample, particles: s2.particles, pixelChanged: !buf1.equals(buf2) }
    );

    // Idle working motion (> 1.5s after dispatch: continuous shimmer & flowing pulses)
    await b.ev('OfficeFlow.advance(1600); 0');
    const idleSamples = [];
    const idleBufs = [];
    for (let k = 1; k <= 4; k++) {
      const st = await b.ev('OfficeFlow.stats().renderer');
      idleSamples.push(st.particleSample);
      const shotPath = path.join(shotDir, `idle_0${k}.png`);
      const buf = skipShots ? await b.captureBuffer() : await b.shot(shotPath);
      if (!skipShots) out.shots.push(`qa/v18-shots/idle_0${k}.png`);
      idleBufs.push(buf);
      if (k < 4) await b.ev('OfficeFlow.advance(220); 0');
    }
    const idleStateChanges = idleSamples.slice(1).filter((p, idx) => JSON.stringify(p) !== JSON.stringify(idleSamples[idx])).length;
    const idlePixelChanges = idleBufs.slice(1).filter((buf, idx) => !buf.equals(idleBufs[idx])).length;
    check('working/idle beams stay alive (particles & shimmer move across 4 consecutive frames)', idleStateChanges === 3 && idlePixelChanges === 3, { idleStateChanges, idlePixelChanges, idleSamples });

    // 1d. Paket kembali (kometa kepala + ekor + percikan tiba) sampai Bos
    await b.ev('OfficeFlow.clear(); 0');
    const retBase = { provider: 'claude', source: 'hook', agent: 'main-ret', session: 'ret-1', flow_id: 'ret-1', taskTitle: 'Return comet test' };
    await post({ ...retBase, type: 'call', event_id: 'ret-c' });
    await waitUntil('OfficeFlow.snapshot().some(f => f.session === "ret-1")');
    await post({ ...retBase, type: 'spawn', kind: 'subagent', agent: 'sub-arch', parent: retBase.agent, agent_type: 'Plan', event_id: 'ret-s' });
    await waitUntil('OfficeFlow.snapshot().some(f => f.session === "ret-1" && f.nodes.some(n => n.persona === "software-architect"))');
    await b.ev('OfficeFlow.advance(350); 0');
    await post({ ...retBase, type: 'retire', kind: 'subagent', agent: 'sub-arch', parent: retBase.agent, agent_type: 'Plan', event_id: 'ret-r1' });
    await waitUntil('OfficeFlow.snapshot().some(f => f.session === "ret-1" && f.nodes.some(n => n.persona === "software-architect" && n.status === "completed"))');
    await b.ev('OfficeFlow.advance(110); 0');
    const midSubReturn = await b.ev('OfficeFlow.stats().renderer');
    await b.ev('OfficeFlow.advance(160); 0');
    const postSubReturn = await b.ev('OfficeFlow.stats().renderer');
    const doneRes = await post({ ...retBase, type: 'report', event_id: 'ret-done' });
    await waitUntil('OfficeFlow.snapshot().some(f => f.session === "ret-1" && f.status === "completed")');
    await b.ev('OfficeFlow.advance(320); 0');
    const midBossReturn = await b.ev('OfficeFlow.stats().renderer');
    await b.ev('OfficeFlow.advance(240); officeQA.advance(0.1); 0');
    await waitUntil('officeDebug().reports.some(r => r.id === ' + JSON.stringify(doneRes.report.id) + ' && r.inTray)', 4000);
    const bossArrived = await b.ev('({ stats: OfficeFlow.stats().renderer, report: officeDebug().reports.find(r => r.id === ' + JSON.stringify(doneRes.report.id) + '), bossReturn: officeDebug().milestones.some(m => m.stage === "flow-return-boss") })');
    check(
      'return comet travels child -> parent -> Boss with arrival sparks and delivers report to tray',
      midSubReturn.packets >= 1 && postSubReturn.sparks > 0 && midBossReturn.packets >= 1 && bossArrived.report?.inTray === true && bossArrived.bossReturn === true,
      { midSubReturn: { packets: midSubReturn.packets }, postSubReturn: { sparks: postSubReturn.sparks }, midBossReturn: { packets: midBossReturn.packets }, bossArrived }
    );

    // 1e. Alur yang sudah selesai > N detik (2.1s) tidak lagi menampilkan sinar
    await b.ev('OfficeFlow.advance(2300); 0');
    const afterFade = await b.ev('OfficeFlow.stats().renderer');
    check('completed flow beams fade out completely after > N seconds', afterFade.visibleEdges === 0 && afterFade.beams === 0, afterFade);

    // 1f. Gagal / limit = sinar merah berkedip putus-putus & tanpa paket sukses
    await b.ev('OfficeFlow.clear(); 0');
    await b.ev(`(() => {
      const now = Date.now();
      OfficeFlow.emit({ type: 'call', source: 'hook', provider: 'codex', session: 'fail-s', flow_id: 'fail-s', event_id: 'fail-1', agent: 'main-fail', taskTitle: 'Limit check', at: now });
      OfficeFlow.emit({ type: 'spawn', source: 'hook', provider: 'codex', session: 'fail-s', flow_id: 'fail-s', event_id: 'fail-2', agent: 'sub-fail', parent: 'main-fail', agent_type: 'Explore', at: now + 10 });
      OfficeFlow.emit({ type: 'report', source: 'hook', provider: 'codex', session: 'fail-s', flow_id: 'fail-s', event_id: 'fail-3', agent: 'main-fail', status: 'rate_limited', limitDetected: true, at: now + 50 });
      OfficeFlow.advance(280);
      return true;
    })()`);
    const failState = await b.ev('({ stats: OfficeFlow.stats().renderer, failLabels: [...document.querySelectorAll(".office-flow-label[data-status=\\"failed\\"]:not([hidden])")].length })');
    check('failed/rate_limited renders red blinking beams and failed status badges', failState.stats.failedBeams >= 2 && failState.failLabels >= 1, failState);
    if (!skipShots) {
      await b.shot(path.join(shotDir, 'after_failed_dark_1600.png'));
      out.shots.push('qa/v18-shots/after_failed_dark_1600.png');
    }

    // 1g. Preset ketebalan (tipis 0.65 / normal 1 / tebal 1.75) & pola aksesibilitas (ritme + lencana)
    const thickResults = await b.ev(`(() => {
      const res = [];
      for (const th of [0.65, 1, 1.75]) {
        OfficeFlow.clear();
        OfficeFlow.configure({ ...OfficeSettings.get().flow16, thickness: th, patterns: true });
        OfficeFlow.emit({ type: 'call', provider: 'claude', agent: 'main-th', session: 'th-' + th, flow_id: 'th-' + th, at: Date.now() });
        OfficeFlow.advance(320);
        const st = OfficeFlow.stats().renderer;
        res.push({ th, applied: st.thickness, beams: st.beams, particles: st.particles, nodes: st.nodes, draw: officeDebug().drawCalls });
      }
      return res;
    })()`);
    check('thickness presets thin/normal/thick render beams + particles + node flares <= 340 draws', thickResults.every(v => v.applied === v.th && v.beams > 0 && v.particles > 0 && v.nodes > 0 && v.draw <= 340), thickResults);

    const patternDiff = await b.ev(`(() => {
      OfficeFlow.clear();
      const emitGemini = (pats) => {
        OfficeFlow.clear();
        OfficeFlow.configure({ ...OfficeSettings.get().flow16, patterns: pats, thickness: 1 });
        OfficeFlow.emit({ type: 'call', provider: 'gemini', agent: 'main-pat', session: 'pat-' + pats, flow_id: 'pat-' + pats, at: Date.now() });
        OfficeFlow.advance(350);
        return {
          particles: OfficeFlow.stats().renderer.particles,
          badges: document.querySelectorAll('.office-flow-label:not([hidden]) .office-flow-badge').length,
          patternsOn: OfficeFlow.stats().renderer.patterns
        };
      };
      return { on: emitGemini(true), off: emitGemini(false) };
    })()`);
    check('accessibility patterns mode changes particle rhythm & renders label badges', patternDiff.on.patternsOn === true && patternDiff.off.patternsOn === false && patternDiff.on.particles !== patternDiff.off.particles && patternDiff.on.badges >= 3, patternDiff);

    // 1h. walkAnimation: off -> sinar tetap tampil terang tetapi animasi partikel statis
    const walkOffCheck = await b.ev(`(() => {
      OfficeFlow.clear();
      OfficeFlow.configure({ ...OfficeSettings.get().flow16, walkAnimation: 'off', paused: false, enabled: true });
      OfficeFlow.emit({ type: 'call', provider: 'claude', agent: 'main-off', session: 'off-1', flow_id: 'off-1', at: Date.now() });
      OfficeFlow.advance(200);
      const a = OfficeFlow.stats().renderer;
      OfficeFlow.advance(400);
      const b = OfficeFlow.stats().renderer;
      return { a, b };
    })()`);
    check(
      'walkAnimation: off keeps beams visible & bright while holding animation static',
      walkOffCheck.a.visibleEdges >= 2 && walkOffCheck.a.beams >= 2 && walkOffCheck.a.particles > 0 && walkOffCheck.a.animClock === walkOffCheck.b.animClock && JSON.stringify(walkOffCheck.a.particleSample) === JSON.stringify(walkOffCheck.b.particleSample),
      { a: { beams: walkOffCheck.a.beams, animClock: walkOffCheck.a.animClock, sample: walkOffCheck.a.particleSample }, b: { animClock: walkOffCheck.b.animClock, sample: walkOffCheck.b.particleSample } }
    );

    // 1i. Jeda & lanjutkan panel Alur
    const pauseCheck = await b.ev(`(() => {
      OfficeFlow.clear();
      OfficeFlow.configure({ ...OfficeSettings.get().flow16, walkAnimation: 'fast', paused: false, enabled: true });
      OfficeFlow.emit({ type: 'call', provider: 'codex', agent: 'main-p', session: 'p-1', flow_id: 'p-1', at: Date.now() });
      OfficeFlow.advance(300);
      OfficeFlow.setPaused(true);
      const p1 = OfficeFlow.stats().renderer;
      OfficeFlow.advance(600);
      const p2 = OfficeFlow.stats().renderer;
      OfficeFlow.setPaused(false);
      OfficeFlow.advance(300);
      const p3 = OfficeFlow.stats().renderer;
      return { p1, p2, p3 };
    })()`);
    check(
      'pause freezes clock & particle animation, resume restarts smoothly',
      pauseCheck.p1.clock === pauseCheck.p2.clock && pauseCheck.p1.animClock === pauseCheck.p2.animClock && pauseCheck.p3.clock > pauseCheck.p2.clock && pauseCheck.p3.animClock > pauseCheck.p2.animClock,
      { c1: pauseCheck.p1.clock, c2: pauseCheck.p2.clock, c3: pauseCheck.p3.clock, a1: pauseCheck.p1.animClock, a2: pauseCheck.p2.animClock, a3: pauseCheck.p3.animClock }
    );

    // 1j. 200 alur berturut-turut: 0 kebocoran geometri & tekstur, draw call <= 340
    const leakCheck = await b.ev(`(() => {
      const readings = [];
      for (let i = 0; i < 200; i++) {
        OfficeFlow.clear();
        const at = Date.now();
        OfficeFlow.emit({ type: 'call', provider: 'claude', agent: 'main-mem', session: 'mem-' + i, flow_id: 'mem-' + i, at });
        OfficeFlow.emit({ type: 'spawn', provider: 'claude', agent: 'sub-mem', parent: 'main-mem', session: 'mem-' + i, flow_id: 'mem-' + i, agent_type: 'Plan', at: at + 1 });
        OfficeFlow.advance(300, true);
        OfficeFlow.emit({ type: 'report', provider: 'claude', agent: 'main-mem', session: 'mem-' + i, flow_id: 'mem-' + i, at: at + 2 });
        OfficeFlow.advance(800, true);
        if (i === 9 || i === 199) readings.push(officeDebug().memory);
      }
      return { readings, draw: officeDebug().drawCalls, pooledGeometries: OfficeFlow.stats().renderer.pooledGeometries };
    })()`);
    check('200 sequential flows: zero geometry/texture leak & <= 340 draw calls', JSON.stringify(leakCheck.readings[0]) === JSON.stringify(leakCheck.readings[1]) && leakCheck.draw <= 340, leakCheck);

    // 2. Tangkapan layar visual berurutan (tema terang & gelap, 1600x900 & 1280x720 + mode malam)
    if (!skipShots) {
      for (const theme of ['light', 'dark']) {
        await clearTray();
        await b.size(1600, 900);
        await b.ev(`(() => {
          const s = OfficeSettings.get();
          s.appearance.theme = ${JSON.stringify(theme)};
          s.appearance.light = 'day';
          s.language = 'id';
          s.followTask = false;
          s.flow16.enabled = true;
          s.flow16.thickness = 1;
          s.flow16.patterns = true;
          s.flow16.paused = false;
          s.flow16.walkAnimation = 'fast';
          OfficeSettings.set(s);
          I18n.setLanguage('id');
          OfficeFlow.configure(s.flow16);
          OfficeFlow.clear();
          document.querySelectorAll('dialog[open]').forEach(d => d.close());
          officeQA.pose(0.42, 1.02, 44, [-8, 0, -5]);
          return true;
        })()`);
        await sleep(160);
        const sid = 'v18-' + theme;
        const base = { provider: 'claude', source: 'hook', agent: 'main-' + sid, session: sid, flow_id: sid, taskTitle: 'Aktivitas agen' };
        const snap = async n => {
          const rel = `qa/v18-shots/seq_${theme}_1600_0${n}.png`;
          await b.shot(path.join(root, rel));
          out.shots.push(rel);
        };
        await post({ ...base, type: 'call', event_id: sid + '-c' });
        await waitUntil(`OfficeFlow.snapshot().some(f => f.session === ${JSON.stringify(sid)})`);
        await b.ev('OfficeFlow.advance(130); officeQA.advance(0.1); 0'); await snap(1);
        await b.ev('OfficeFlow.advance(210); officeQA.advance(1.0); 0'); await snap(2);
        await post({ ...base, type: 'spawn', kind: 'subagent', agent: 'sub-plan-' + sid, parent: base.agent, agent_type: 'Plan', event_id: sid + '-p1' });
        await waitUntil(`OfficeFlow.snapshot().some(f => f.session === ${JSON.stringify(sid)} && f.nodes.some(n => n.persona === "software-architect"))`);
        await b.ev('OfficeFlow.advance(280); 0'); await snap(3);
        await post({ ...base, type: 'spawn', kind: 'subagent', agent: 'sub-ui-' + sid, parent: base.agent, agent_type: 'Designer', event_id: sid + '-p2' });
        await waitUntil(`OfficeFlow.snapshot().some(f => f.session === ${JSON.stringify(sid)} && f.nodes.some(n => n.persona === "ui-designer"))`);
        await b.ev('OfficeFlow.advance(280); 0'); await snap(4);
        await b.ev('OfficeFlow.advance(320); officeQA.advance(0.6); 0'); await snap(5);
        await post({ ...base, type: 'retire', kind: 'subagent', agent: 'sub-plan-' + sid, parent: base.agent, agent_type: 'Plan', event_id: sid + '-r1' });
        await waitUntil(`OfficeFlow.snapshot().some(f => f.session === ${JSON.stringify(sid)} && f.nodes.some(n => n.persona === "software-architect" && n.status === "completed"))`);
        await b.ev('OfficeFlow.advance(110); 0'); await snap(6);
        await post({ ...base, type: 'report', event_id: sid + '-done' });
        await waitUntil(`OfficeFlow.snapshot().some(f => f.session === ${JSON.stringify(sid)} && f.status === "completed")`);
        await b.ev('OfficeFlow.advance(330); 0'); await snap(7);
        await b.ev('OfficeFlow.advance(260); officeQA.advance(0.1); 0'); await snap(8);
      }

      // 1280x720 light & dark + night lighting dark theme
      await setupShowcaseFlow(b, { theme: 'light', light: 'day', width: 1280, height: 720, id: 'res-l-1280' });
      await b.shot(path.join(shotDir, 'after_light_1280.png'));
      out.shots.push('qa/v18-shots/after_light_1280.png');

      await setupShowcaseFlow(b, { theme: 'dark', light: 'day', width: 1280, height: 720, id: 'res-d-1280' });
      await b.shot(path.join(shotDir, 'after_dark_1280.png'));
      out.shots.push('qa/v18-shots/after_dark_1280.png');

      await setupShowcaseFlow(b, { theme: 'dark', light: 'night', width: 1600, height: 900, id: 'res-night' });
      await b.shot(path.join(shotDir, 'after_dark_night_1600.png'));
      out.shots.push('qa/v18-shots/after_dark_night_1600.png');
    }

    // 3. Nol error / warning konsol
    const errors = b.events.filter(e =>
      e.method === 'Runtime.exceptionThrown' ||
      (e.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(e.params.type)) ||
      (e.method === 'Log.entryAdded' && ['error', 'warning'].includes(e.params.entry.level))
    );
    out.consoleErrors = errors;
    check('zero browser console errors/warnings', errors.length === 0, errors.slice(0, 3));

    out.ok = out.failed.length === 0;
  } finally {
    try {
      await bBefore?.close();
    } catch {}
    try {
      await b?.close();
    } catch {}
    await unlock();
    await fs.writeFile(path.join(__dirname, 'v18_beam_results.json'), JSON.stringify(out, null, 2));
  }

  console.log(JSON.stringify({
    ok: out.ok,
    checks: out.checks.length,
    failed: out.failed.length,
    perf: out.perf,
    latency: out.latency,
    shots: out.shots.length
  }, null, 2));
  if (!out.ok) process.exitCode = 1;
}

main().catch(err => {
  console.error(err.stack || err);
  process.exitCode = 1;
});
