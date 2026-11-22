// [Diubah oleh Gemini - 2026-11-21] Suite uji onboarding publik Office AI V15 (penemuan workspace, saluran Channels/*, Pusat Setup, keadaan kosong & terisi Studio Video, Dasbor YouTube terpisah, pesan galat, drawCalls <= 340)
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const { startServer } = require(path.join(root, 'embedded_server.js'));
const discovery = require(path.join(root, 'workspace_discovery.js'));

const sleep = ms => new Promise(r => setTimeout(r, ms));

function findChromeExecutable() {
  const homeDir = process.env.USERPROFILE || os.homedir();
  const localApp = process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local');
  const candidates = [
    process.env.OFFICE_TEST_CHROME,
    path.join(localApp, 'ms-playwright/chromium-1248/chrome-win64/chrome.exe'),
    path.join(localApp, 'ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe')
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      if (require('node:fs').existsSync(c)) return c;
    } catch {}
  }
  throw new Error('Playwright Chromium executable not found (set OFFICE_TEST_CHROME)');
}

async function launchBrowser(profileDir) {
  await fs.mkdir(profileDir, { recursive: true });
  const exe = findChromeExecutable();
  const chrome = spawn(exe, [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-breakpad',
    '--in-process-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--remote-debugging-port=0', '--user-data-dir=' + profileDir, '--window-size=1440,900', 'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });

  let cdpPort = 0;
  for (let i = 0; i < 80; i++) {
    try {
      cdpPort = Number((await fs.readFile(path.join(profileDir, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
      if (cdpPort) break;
    } catch {}
    await sleep(100);
  }
  if (!cdpPort) {
    chrome.kill();
    throw new Error('Chrome CDP startup failed');
  }
  const pages = await (await fetch('http://127.0.0.1:' + cdpPort + '/json')).json();
  const ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  const pending = new Map();
  const consoleErrors = [];
  let seq = 0;
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (p) m.error ? p.reject(m.error) : p.resolve(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(m.params?.exceptionDetails?.text || 'page exception');
    } else if (m.method === 'Log.entryAdded' && m.params?.entry?.level === 'error') {
      consoleErrors.push(m.params.entry.text || 'console error');
    }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const ev = async expression => {
    const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 1200));
    return r.result?.value;
  };
  for (const dom of ['Runtime', 'Log', 'Page']) await call(dom + '.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  return {
    call,
    ev,
    consoleErrors,
    async goto(url) {
      await call('Page.navigate', { url });
      for (let i = 0; i < 120; i++) {
        await sleep(100);
        if (await ev('typeof OfficeSettings !== "undefined" && typeof I18n !== "undefined" && Boolean(document.getElementById("openSetup"))')) break;
      }
      await sleep(350);
    },
    async shot(filePath) {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const res = await call('Page.captureScreenshot', { format: 'png' });
      await fs.writeFile(filePath, Buffer.from(res.data, 'base64'));
    },
    async close() {
      await Promise.race([call('Browser.close').catch(() => {}), sleep(1500)]);
      ws.close();
      chrome.kill();
    }
  };
}

async function run() {
  const out = { ok: false, checks: [], failed: [], metrics: {}, shots: [], consoleErrors: [] };
  const check = (name, pass, detail = null) => {
    const rec = { name, pass: Boolean(pass) };
    if (detail !== null) rec.detail = detail;
    out.checks.push(rec);
    if (!pass) {
      out.failed.push(rec);
      console.error('[FAIL]', name, JSON.stringify(detail));
    }
  };

  let tmpDir = null;
  let server = null;
  let browser = null;

  try {
    tmpDir = await fs.mkdtemp(path.join(root, 'qa', 'v15-test-'));

    // =========================================================================
    // PART 1: workspace_discovery.js UNIT CHECKS
    // =========================================================================
    const parentSingle = path.join(tmpDir, 'single-env');
    const ws1 = path.join(parentSingle, 'CreatorWorkspaceA');
    await fs.mkdir(path.join(ws1, 'Channels', 'AlphaStudio', 'Videos'), { recursive: true });
    await fs.mkdir(path.join(ws1, 'Channels', 'BetaExplainer', 'Videos'), { recursive: true });
    await fs.writeFile(path.join(ws1, 'AGENTS.md'), '# Workspace Rules\n');

    const appSub = path.join(parentSingle, 'AppFolder');
    await fs.mkdir(appSub, { recursive: true });

    // 1a. Blocked paths rejected
    check(
      'workspace_discovery blocks Secrets and .git directories',
      discovery.isBlockedPath(path.join(ws1, 'Secrets')) &&
        discovery.isBlockedPath(path.join(ws1, '.git')) &&
        !discovery.isBlockedPath(ws1)
    );

    // 1b. Single sibling auto-resolves cleanly
    const discSingle = await discovery.discoverWorkspaces({
      savedProjectDir: '',
      savedDashboardDir: '',
      env: {},
      root: appSub,
      cwd: appSub,
      allowDriveScan: false,
      allowSiblingScan: true
    });
    check(
      'Single discovered project workspace auto-resolves without ambiguity',
      discSingle.effectiveProjectDir === path.resolve(ws1) &&
        discSingle.projectNeedsConfirmation === false &&
        discSingle.projectCandidates.length === 1 &&
        discSingle.projectCandidates[0].channelsCount === 2,
      discSingle
    );

    // 1c. Multiple candidates NEVER auto-select!
    const parentMulti = path.join(tmpDir, 'multi-env');
    const wsM1 = path.join(parentMulti, 'StudioOne');
    const wsM2 = path.join(parentMulti, 'StudioTwo');
    const appMulti = path.join(parentMulti, 'AppFolder');
    await fs.mkdir(path.join(wsM1, 'Channels', 'ChanOne', 'Videos'), { recursive: true });
    await fs.mkdir(path.join(wsM2, 'Channels', 'ChanTwo', 'Videos'), { recursive: true });
    await fs.mkdir(appMulti, { recursive: true });

    const discMulti = await discovery.discoverWorkspaces({
      savedProjectDir: '',
      savedDashboardDir: '',
      env: {},
      root: appMulti,
      cwd: appMulti,
      allowDriveScan: false,
      allowSiblingScan: true
    });
    check(
      'Multiple discovered project workspaces NEVER auto-select (needsConfirmation: true)',
      discMulti.effectiveProjectDir === '' &&
        discMulti.projectNeedsConfirmation === true &&
        discMulti.projectCandidates.length === 2,
      discMulti
    );

    // 1d. Env OFFICE_AI_PROJECT takes precedence over multiple siblings
    const discEnv = await discovery.discoverWorkspaces({
      savedProjectDir: '',
      savedDashboardDir: '',
      env: { OFFICE_AI_PROJECT: wsM2 },
      root: appMulti,
      cwd: appMulti,
      allowDriveScan: false,
      allowSiblingScan: true
    });
    check(
      'OFFICE_AI_PROJECT env overrides sibling discovery cleanly',
      discEnv.effectiveProjectDir === path.resolve(wsM2) && discEnv.projectSource === 'env' && discEnv.projectNeedsConfirmation === false,
      discEnv
    );

    // 1e. Separate YouTube Dashboard repo discovery (standalone server.py + static/index.html)
    const dashRepo = path.join(parentSingle, 'YouTube-Studio-Manager');
    await fs.mkdir(path.join(dashRepo, 'static'), { recursive: true });
    await fs.writeFile(path.join(dashRepo, 'server.py'), '# stub\n');
    await fs.writeFile(path.join(dashRepo, 'static', 'index.html'), '<html></html>\n');

    const discDash = await discovery.discoverWorkspaces({
      savedProjectDir: ws1,
      savedDashboardDir: '',
      env: {},
      root: appSub,
      cwd: appSub,
      allowDriveScan: false,
      allowSiblingScan: true
    });
    check(
      'Separate YouTube-Studio-Manager folder discovered automatically when project lacks Tools/dashboard/server.py',
      discDash.effectiveDashboardDir === path.resolve(dashRepo) &&
        discDash.effectiveDashboard?.serverScript === path.join(path.resolve(dashRepo), 'server.py') &&
        discDash.dashboardNeedsConfirmation === false,
      discDash
    );

    // =========================================================================
    // PART 2: EMBEDDED SERVER API CHECKS (EMPTY -> CONFIGURED -> CHANNELS/* FALLBACK)
    // =========================================================================
    const dataDir = path.join(tmpDir, 'data');
    server = await startServer({
      root,
      port: 0,
      maxPort: 0,
      collector: false,
      allowDriveScan: false,
      dataDir
    });

    const html = await fetch(server.origin + '/').then(r => r.text());
    const token = html.match(/name="office-vault-token"\s+content="([^"]+)"/)?.[1] || '';
    const api = async (route, method = 'GET', body) => {
      const headers = { 'X-Office-Token': token };
      const init = { method, headers };
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
      const res = await fetch(server.origin + route, init);
      return { status: res.status, body: await res.json().catch(() => null) };
    };

    // 2a. Fresh server starts clean without fake channels or private defaults
    const initSetup = await api('/setup/status');
    const initChannels = await api('/short/channels');
    const initYt = await api('/youtube/dashboard/status');
    check(
      'Fresh server returns complete /setup/status, 0 channels when unconfigured, and actionable dashboard_not_found errorCode',
      initSetup.status === 200 &&
        initSetup.body?.project?.ready === false &&
        initSetup.body?.setupState?.dismissed === false &&
        Boolean(initSetup.body?.recommendedNextStep?.code) &&
        initChannels.status === 200 &&
        Array.isArray(initChannels.body?.channels) &&
        initChannels.body.channels.length === 0 &&
        initYt.status === 200 &&
        initYt.body?.errorCode === 'dashboard_not_found',
      { setup: initSetup.body?.project, channels: initChannels.body?.channels?.length, yt: initYt.body?.errorCode }
    );

    // 2b. Blocking Secrets on /setup/apply and /youtube/dashboard/config
    const badApply = await api('/setup/apply', 'POST', { localProjectDir: path.join(ws1, 'Secrets') });
    const badDash = await api('/youtube/dashboard/config', 'POST', { dashboardDir: path.join(ws1, 'Secrets') });
    check(
      'Secrets path rejected with HTTP 403 on /setup/apply and /youtube/dashboard/config',
      badApply.status === 403 && badDash.status === 403,
      { badApply: badApply.status, badDash: badDash.status }
    );

    // =========================================================================
    // PART 3: BROWSER ONBOARDING UX (FIRST LAUNCH AUTO-OPEN, EMPTY STATES, POPULATED STATES)
    // =========================================================================
    browser = await launchBrowser(path.join(tmpDir, 'chrome'));
    const shotDir = path.join(root, 'qa', 'v15-shots');

    // 3a. First Live launch WITHOUT ?qa=1 MUST auto-open Setup Center!
    await browser.goto(server.origin + '/');
    await browser.ev(`(() => { I18n.setLanguage('en'); const s = OfficeSettings.get(); s.language = 'en'; s.appearance.theme = 'light'; OfficeSettings.set(s); if (typeof officeQA !== 'undefined') { officeQA.freeze(); officeQA.tick(1); } })()`);
    // Wait up to 4s for first-launch auto-open
    let setupAutoOpened = false;
    for (let i = 0; i < 40; i++) {
      setupAutoOpened = await browser.ev(`Boolean(document.getElementById('panel')?.open && document.getElementById('setup15RowProject'))`);
      if (setupAutoOpened) break;
      await sleep(100);
    }
    const setupDom = await browser.ev(`(() => ({
      open: Boolean(document.getElementById('panel')?.open),
      hasPanel: Boolean(document.getElementById('setup15RowProject')),
      hasNextStep: Boolean(document.getElementById('setup15NextStep')),
      hasRiskNotice: Boolean(document.getElementById('setup15FullAccessNotice')),
      rowCount: document.querySelectorAll('.setup15-row').length,
      hasDismissCheckbox: Boolean(document.getElementById('setup15DontShowChk'))
    }))()`);
    const shotSetup = path.join(shotDir, 'v15_setup_center.png');
    await browser.shot(shotSetup);
    out.shots.push(shotSetup);
    check(
      'First Live launch auto-opens Setup Center with Recommended Next Step, Full Access risk notice, and 6 checklist rows',
      setupAutoOpened && setupDom.hasNextStep && setupDom.hasRiskNotice && setupDom.rowCount === 6 && setupDom.hasDismissCheckbox,
      setupDom
    );

    // 3b. Dismiss Setup Center -> reload -> MUST NOT auto-open again!
    await browser.ev(`document.getElementById('setup15DontShowChk').click(); document.getElementById('setup15FinishBtn').click(); 0`);
    await sleep(350);
    await browser.goto(server.origin + '/');
    await sleep(800);
    const reopenedAfterDismiss = await browser.ev(`Boolean(document.getElementById('panel')?.open && document.getElementById('setup15RowProject'))`);
    check('Dismissed Setup Center stays closed on subsequent launches', reopenedAfterDismiss === false, { reopenedAfterDismiss });

    // 3c. Modal stacking check: open Settings, then open Setup Center via menu button -> Settings MUST close!
    await browser.ev(`document.getElementById('settingsButton').click(); 0`);
    await sleep(200);
    const settingsOpenBefore = await browser.ev(`Boolean(document.getElementById('settingsDialog')?.open)`);
    await browser.ev(`document.getElementById('openSetup').click(); 0`);
    await sleep(250);
    const modalStack = await browser.ev(`({ settingsOpen: Boolean(document.getElementById('settingsDialog')?.open), panelOpen: Boolean(document.getElementById('panel')?.open) })`);
    check(
      'Opening a panel closes Settings dialog (zero modal stacking)',
      settingsOpenBefore === true && modalStack.settingsOpen === false && modalStack.panelOpen === true,
      { settingsOpenBefore, modalStack }
    );
    await browser.ev(`document.getElementById('closePanel').click(); 0`);
    await sleep(150);

    // 3d. Video Studio EMPTY state: no blank white broken selects, disabled reason, guiding structure box!
    await browser.ev(`document.getElementById('shortsCardButton').click(); 0`);
    await sleep(450);
    const studioEmpty = await browser.ev(`(() => {
      const sels = document.querySelectorAll('.short14-composer select');
      const ch = sels[0], fmt = sels[1];
      const startBtn = document.querySelector('.short14-composer button.short14-primary');
      const reason = document.querySelector('.short14-disabled-reason');
      const guide = document.getElementById('short14EmptyGuide');
      return {
        chDisabled: Boolean(ch?.disabled),
        chHasEmptyClass: Boolean(ch?.classList.contains('short14-select-empty')),
        chPlaceholderText: ch?.options?.[0]?.textContent?.trim() || '',
        fmtDisabled: Boolean(fmt?.disabled),
        startDisabled: Boolean(startBtn?.disabled),
        reasonText: reason?.textContent?.trim() || '',
        hasGuide: Boolean(guide),
        guideHasStructure: (guide?.textContent || '').includes('Channels/')
      };
    })()`);
    const shotStudioEmpty = path.join(shotDir, 'v15_studio_empty.png');
    await browser.shot(shotStudioEmpty);
    out.shots.push(shotStudioEmpty);
    check(
      'Video Studio empty state fixes broken dropdowns, explains why Start is disabled, and shows setup guide with Channels/ structure',
      studioEmpty.chDisabled &&
        studioEmpty.chHasEmptyClass &&
        studioEmpty.chPlaceholderText.length > 3 &&
        studioEmpty.fmtDisabled &&
        studioEmpty.startDisabled &&
        studioEmpty.reasonText.length > 8 &&
        studioEmpty.hasGuide &&
        studioEmpty.guideHasStructure,
      studioEmpty
    );
    await browser.ev(`document.getElementById('closePanel').click(); 0`);
    await sleep(150);

    // 3e. YouTube Dashboard EMPTY state: single actionable guide (no duplicate red errors), 3-step install, separate dashboardDir input!
    await browser.ev(`document.getElementById('youtubeCardButton').click(); 0`);
    await sleep(500);
    const ytEmpty = await browser.ev(`(() => {
      const box = document.getElementById('yt14OfflineBox');
      const guide = document.getElementById('yt15InstallGuide');
      const notices = document.querySelectorAll('#panelContent .v12-notice.error').length;
      const input = document.getElementById('yt15DashboardDirInput');
      const setupBtn = document.getElementById('yt15OpenSetupBtn');
      return {
        hasBox: Boolean(box),
        hasInstallGuide: Boolean(guide),
        hasRepoUrl: (guide?.textContent || '').includes('FenomanSKY/YouTube-Studio-Manager'),
        duplicateErrors: notices,
        hasDirInput: Boolean(input),
        hasSetupBtn: Boolean(setupBtn)
      };
    })()`);
    const shotYtEmpty = path.join(shotDir, 'v15_youtube_empty.png');
    await browser.shot(shotYtEmpty);
    out.shots.push(shotYtEmpty);
    check(
      'YouTube Dashboard empty state shows actionable 3-step install guide, repo URL, separate dashboardDir input, and zero duplicate error banners',
      ytEmpty.hasBox &&
        ytEmpty.hasInstallGuide &&
        ytEmpty.hasRepoUrl &&
        ytEmpty.duplicateErrors === 0 &&
        ytEmpty.hasDirInput &&
        ytEmpty.hasSetupBtn,
      ytEmpty
    );
    await browser.ev(`document.getElementById('closePanel').click(); 0`);
    await sleep(150);

    // 3f. Configure workspace via /setup/apply (Channels/* fallback WITHOUT channels.json) + separate dashboardDir -> verify populated Video Studio!
    const applyRes = await api('/setup/apply', 'POST', {
      localProjectDir: ws1,
      dashboardDir: dashRepo,
      geminiApiKey: 'demo-onboarding-test-key-9876'
    });
    const popChannels = await api('/short/channels');
    check(
      'Channels/* fallback populates channels without channels.json, masks Gemini key, and returns 8-stage plan + missingTools warnings',
      applyRes.status === 200 &&
        applyRes.body?.gemini?.hasKey === true &&
        applyRes.body?.gemini?.keyHint === '...9876' &&
        applyRes.body?.dashboard?.serverAvailable === true &&
        popChannels.body?.channels?.length === 2 &&
        Array.isArray(popChannels.body?.stagePlans) &&
        popChannels.body.stagePlans.length === 8 &&
        Array.isArray(popChannels.body?.missingTools) &&
        popChannels.body.missingTools.length > 0,
      {
        gemini: applyRes.body?.gemini,
        dashboard: applyRes.body?.dashboard,
        chCount: popChannels.body?.channels?.length,
        chNames: popChannels.body?.channels?.map(c => c.name),
        stagePlansLen: popChannels.body?.stagePlans?.length,
        missingTools: popChannels.body?.missingTools
      }
    );

    await browser.ev(`document.getElementById('shortsCardButton').click(); 0`);
    await sleep(500);
    const studioPop = await browser.ev(`(() => {
      const sels = document.querySelectorAll('.short14-composer select');
      const ch = sels[0], fmt = sels[1];
      const planRows = document.querySelectorAll('.short14-plan-table tbody tr').length;
      const warnCount = document.querySelectorAll('#short14ToolsWarn, #short14StagePlan .is-warn').length;
      return {
        chDisabled: Boolean(ch?.disabled),
        chOptions: [...(ch?.options || [])].map(o => o.textContent.trim()),
        fmtCount: fmt?.options?.length || 0,
        planRows,
        warnCount
      };
    })()`);
    const shotStudioPop = path.join(shotDir, 'v15_studio_populated.png');
    await browser.shot(shotStudioPop);
    out.shots.push(shotStudioPop);
    check(
      'Populated Video Studio renders Channels/* options, 8-stage pre-run plan table, and honest missing-tool warnings',
      studioPop.chDisabled === false &&
        studioPop.chOptions.length === 2 &&
        studioPop.fmtCount >= 1 &&
        studioPop.planRows === 8 &&
        studioPop.warnCount >= 1,
      studioPop
    );
    await browser.ev(`document.getElementById('closePanel').click(); 0`);
    await sleep(150);

    // 3g. Verify drawCalls <= 340 (via ?qa=1) and 0 console/page errors
    await browser.goto(server.origin + '/?qa=1');
    for (let i = 0; i < 80; i++) {
      if (await browser.ev('typeof officeDebug === "function"')) break;
      await sleep(100);
    }
    const drawCalls = await browser.ev(`officeQA.freeze(); officeQA.tick(1); officeDebug().drawCalls`);
    out.metrics.drawCalls = drawCalls;
    out.consoleErrors = browser.consoleErrors;
    check('3D scene stays within drawCalls <= 340 and 0 console/page errors', drawCalls <= 340 && browser.consoleErrors.length === 0, { drawCalls, consoleErrors: browser.consoleErrors });

    out.ok = out.failed.length === 0;
    console.log(JSON.stringify({ ok: out.ok, summary: { passed: out.checks.length - out.failed.length, total: out.checks.length }, metrics: out.metrics, shots: out.shots, failed: out.failed }, null, 2));
    if (!out.ok) process.exitCode = 1;
  } finally {
    await browser?.close();
    await server?.close();
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

run().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
