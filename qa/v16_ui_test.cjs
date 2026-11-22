// [Diubah oleh Gemini - 2026-11-21] Suite uji UI Office AI V16-B: panel Alur, filter, legenda, pengaturan tersimpan & termigrasi, bagian Hook Office AI (memakai fixture), i18n 6 bahasa + RTL Arab, keyboard, dan tangkapan layar qa/v16-shots/ui_*.png
'use strict';

const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const { startServer } = require(path.join(root, 'embedded_server.js'));
const OfficeSettings = require(path.join(root, 'office_settings.js'));
const domProbe = require(path.join(__dirname, 'v6i_dom_probe.cjs'));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const C_LOCK = path.join(root, 'qa', 'v16b_c_browser.lock');
const G_LOCK = path.join(root, 'qa', 'v16b_g_browser.lock');

function findChromeExecutable() {
  const homeDir = process.env.USERPROFILE || os.homedir();
  const localApp = process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local');
  const candidates = [
    process.env.OFFICE_TEST_CHROME,
    path.join(localApp, 'ms-playwright/chromium-1248/chrome-win64/chrome.exe'),
    path.join(localApp, 'ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe')
  ].filter(Boolean);
  for (const c of candidates) {
    if (fsSync.existsSync(c)) return c;
  }
  throw new Error('Playwright Chromium executable not found');
}

async function acquireBrowserLock(maxWaitMs = 180000) {
  const start = Date.now();
  while (fsSync.existsSync(C_LOCK)) {
    if (Date.now() - start > maxWaitMs) break;
    await sleep(1000);
  }
  await fs.writeFile(G_LOCK, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + '\n');
}

async function releaseBrowserLock() {
  await fs.rm(G_LOCK, { force: true }).catch(() => {});
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
    async size(width, height) {
      await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await sleep(120);
    },
    async goto(url) {
      await call('Page.navigate', { url });
      for (let i = 0; i < 120; i++) {
        await sleep(100);
        if (await ev('typeof OfficeSettings !== "undefined" && typeof OfficeFlowUI !== "undefined" && typeof I18n !== "undefined" && Boolean(document.getElementById("openFlow"))')) break;
      }
      await sleep(300);
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
  const out = { ok: false, checks: [], failed: [], shots: [], consoleErrors: [], domMatrix: [] };
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
    tmpDir = await fs.mkdtemp(path.join(root, 'qa', 'v6c-test-v16ui-'));
    const dataDir = path.join(tmpDir, 'data');
    const fixtureProject = path.join(tmpDir, 'demo-project');
    const fixtureHome = path.join(tmpDir, 'demo-home');
    await fs.mkdir(path.join(fixtureProject, '.claude'), { recursive: true });
    await fs.mkdir(path.join(fixtureProject, 'Channels', 'DemoChannel', 'Videos'), { recursive: true });
    await fs.mkdir(fixtureHome, { recursive: true });
    const existingClaudeCfg = JSON.stringify({
      hooks: {
        Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'echo existing-hook' }] }]
      }
    }, null, 2) + '\n';
    const claudeCfgPath = path.join(fixtureProject, '.claude', 'settings.json');
    await fs.writeFile(claudeCfgPath, existingClaudeCfg, 'utf8');

    // =========================================================================
    // 1. SETTINGS SCHEMA VALIDATION & MIGRATION (UNIT)
    // =========================================================================
    const def = OfficeSettings.defaults();
    check(
      'Default settings include flow16 contract fields',
      def.flow16 &&
        def.flow16.enabled === true &&
        def.flow16.maxVisibleEdges === 128 &&
        def.flow16.thickness === 1 &&
        def.flow16.walkAnimation === 'fast' &&
        def.flow16.patterns === true &&
        def.flow16.paused === false &&
        typeof def.flow16.subagentTypes === 'object',
      def.flow16
    );

    const legacyNoFlow = JSON.parse(JSON.stringify(def));
    delete legacyNoFlow.flow16;
    const migratedNoFlow = OfficeSettings.validate(legacyNoFlow);
    check('Legacy settings without flow16 migrate seamlessly', migratedNoFlow.flow16?.walkAnimation === 'fast' && migratedNoFlow.flow16?.enabled === true, migratedNoFlow.flow16);

    const legacyWalking = JSON.parse(JSON.stringify(def));
    delete legacyWalking.flow16.walkAnimation;
    legacyWalking.flow16.walking = 'off';
    const migratedWalking = OfficeSettings.validate(legacyWalking);
    check('Legacy flow16.walking migrates to flow16.walkAnimation', migratedWalking.flow16.walkAnimation === 'off' && !Object.hasOwn(migratedWalking.flow16, 'walking'), migratedWalking.flow16);

    const invalidCases = [
      s => { s.flow16.maxVisibleEdges = 200; },
      s => { s.flow16.maxVisibleEdges = 4; },
      s => { s.flow16.thickness = 0.2; },
      s => { s.flow16.thickness = 4; },
      s => { s.flow16.walkAnimation = 'turbo'; },
      s => { s.flow16.enabled = 'yes'; },
      s => { s.flow16.extraKey = 1; },
      s => { s.flow16.subagentTypes['../evil'] = 'general'; },
      s => { s.flow16.subagentTypes['UpperCase'] = 'general'; },
      s => { s.flow16.subagentTypes['valid-key'] = 'nonexistent-persona'; },
      s => { for (let i = 0; i < 65; i++) s.flow16.subagentTypes['k' + i] = 'general'; }
    ];
    let rejectedAll = true;
    for (const mut of invalidCases) {
      const copy = JSON.parse(JSON.stringify(def));
      mut(copy);
      try {
        OfficeSettings.validate(copy);
        rejectedAll = false;
      } catch {}
    }
    check('Settings validator rejects all invalid flow16 values & bounds', rejectedAll);

    // =========================================================================
    // 2. SERVER START (ISOLATED DATA DIR + ISOLATED HOOK HOME)
    // =========================================================================
    server = await startServer({
      root,
      port: 0,
      maxPort: 0,
      collector: false,
      allowDriveScan: false,
      dataDir,
      flowHooksHome: fixtureHome
    });
    const html = await fetch(server.origin + '/').then(r => r.text());
    const token = html.match(/name="office-vault-token"\s+content="([^"]+)"/)?.[1] || '';

    // Verify PUT /settings persistence with flow16 custom subagentTypes
    const validPut = JSON.parse(JSON.stringify(def));
    validPut.flow16.walkAnimation = 'off';
    validPut.flow16.maxVisibleEdges = 64;
    validPut.flow16.subagentTypes = { 'code-reviewer': 'reality-checker', explore: 'software-architect' };
    const putRes = await fetch(server.origin + '/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Office-Token': token },
      body: JSON.stringify(validPut)
    });
    const getAfterPut = await fetch(server.origin + '/settings').then(r => r.json());
    check(
      'PUT /settings saves flow16 settings and custom subagentTypes persistently',
      putRes.status === 200 &&
        getAfterPut.flow16?.walkAnimation === 'off' &&
        getAfterPut.flow16?.maxVisibleEdges === 64 &&
        getAfterPut.flow16?.subagentTypes?.['code-reviewer'] === 'reality-checker',
      getAfterPut.flow16
    );

    // Reset settings back to defaults before browser tests
    await fetch(server.origin + '/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Office-Token': token },
      body: JSON.stringify(def)
    });

    // =========================================================================
    // 3. BROWSER UI QA (WAIT FOR PEER LOCK FIRST!)
    // =========================================================================
    await acquireBrowserLock();
    browser = await launchBrowser(path.join(tmpDir, 'chrome'));
    const shotDir = path.join(root, 'qa', 'v16-shots');

    await browser.goto(server.origin + '/?qa=1');
    await browser.ev(`(() => { I18n.setLanguage('en'); const s = OfficeSettings.get(); s.language = 'en'; s.appearance.theme = 'light'; OfficeSettings.set(s); if (typeof officeQA !== 'undefined') { officeQA.freeze(); officeQA.tick(1); } })()`);
    await sleep(250);

    // 3a. Open Live Flow panel in empty state -> check guidance & legend
    await browser.ev(`document.getElementById('openFlow').click(); 0`);
    await sleep(250);
    const emptyState = await browser.ev(`(() => ({
      panelOpen: Boolean(document.getElementById('panel')?.open),
      hasEmpty: Boolean(document.getElementById('flow16EmptyState')),
      hasHooksCta: Boolean(document.getElementById('flow16EmptyHooksBtn')),
      legendExists: Boolean(document.getElementById('flow16Legend')),
      legendSwatches: document.querySelectorAll('#flow16Legend .flow16-swatch-svg').length
    }))()`);
    check(
      'Live Flow panel opens in empty state with hook install guidance and full color+pattern legend',
      emptyState.panelOpen && emptyState.hasEmpty && emptyState.hasHooksCta && emptyState.legendExists && emptyState.legendSwatches >= 20,
      emptyState
    );

    // 3b. Inject multi-provider flows (real-time hook with 2 personas + return, delayed log, failed)
    await browser.ev(`(() => {
      const now = Date.now();
      const target = window.OfficeFlow || OfficeFlowUI.instance;
      const emit = e => target.emit(e);
      emit({ type: 'call', source: 'hook', provider: 'claude', session: 's1', agent: 'main-claude', flow_id: 'f-claude', event_id: 'e1', taskTitle: 'Refactor UI flow panel', at: now - 4200 });
      emit({ type: 'spawn', source: 'hook', provider: 'claude', session: 's1', agent: 'sub-arch', parent: 'main-claude', agent_type: 'kerja-berat', flow_id: 'f-claude', event_id: 'e2', at: now - 3800 });
      emit({ type: 'spawn', source: 'hook', provider: 'claude', session: 's1', agent: 'sub-ui', parent: 'main-claude', agent_type: 'ui-designer', flow_id: 'f-claude', event_id: 'e3', at: now - 3500 });
      emit({ type: 'retire', source: 'hook', provider: 'claude', session: 's1', agent: 'sub-ui', parent: 'main-claude', agent_type: 'ui-designer', flow_id: 'f-claude', event_id: 'e4', status: 'completed', at: now - 1200 });
      emit({ type: 'call', source: 'log', provider: 'codex', session: 's2', agent: 'main-codex', flow_id: 'f-codex', event_id: 'e5', taskTitle: 'Check session log task', at: now - 2500 });
      emit({ type: 'call', source: 'panel', provider: 'gemini', session: 's3', agent: 'main-gemini', flow_id: 'f-gem', event_id: 'e6', taskTitle: 'Audit accessibility', at: now - 1900 });
      emit({ type: 'report', source: 'panel', provider: 'gemini', session: 's3', agent: 'main-gemini', flow_id: 'f-gem', event_id: 'e7', status: 'failed', at: now - 400 });
      OfficeFlowUI.instance.refresh();
      return true;
    })()`);
    await sleep(300);

    // Expand Claude multi-branch flow & open legend for visual inspection
    await browser.ev(`(() => {
      const leg = document.getElementById('flow16Legend');
      if (leg) leg.open = true;
      const claudeItem = document.querySelector('#flow16List details[data-provider="claude"]');
      if (claudeItem) claudeItem.open = true;
      return true;
    })()`);
    await sleep(180);

    const flowPanelData = await browser.ev(`(() => {
      const items = [...document.querySelectorAll('#flow16List details.flow16-item')];
      const claudeItem = document.querySelector('#flow16List details[data-provider="claude"]');
      const claudeNodes = claudeItem ? claudeItem.querySelectorAll('.flow16-node-row').length : 0;
      const hasRealtime = Boolean(document.querySelector('.flow16-source-badge.is-realtime'));
      const hasDelayed = Boolean(document.querySelector('.flow16-source-badge.is-delayed'));
      const hasReturn = Boolean(document.querySelector('.flow16-return-tag'));
      return { count: items.length, claudeNodes, hasRealtime, hasDelayed, hasReturn };
    })()`);
    check(
      'Live Flow renders expandable tree, real-time vs delayed badges, and return packet indicator',
      flowPanelData.count === 3 && flowPanelData.claudeNodes >= 5 && flowPanelData.hasRealtime && flowPanelData.hasDelayed && flowPanelData.hasReturn,
      flowPanelData
    );

    const shotFlowLight = path.join(shotDir, 'ui_flow_panel_light.png');
    await browser.shot(shotFlowLight);
    out.shots.push(shotFlowLight);

    // Dark theme screenshot
    await browser.ev(`(() => { const s = OfficeSettings.get(); s.appearance.theme = 'dark'; OfficeSettings.set(s); })()`);
    await sleep(220);
    const shotFlowDark = path.join(shotDir, 'ui_flow_panel_dark.png');
    await browser.shot(shotFlowDark);
    out.shots.push(shotFlowDark);

    // Filter & Pause & Pattern toggle checks
    const filterAndToggles = await browser.ev(`(() => {
      const sel = document.getElementById('flow16ProviderFilter');
      sel.value = 'codex';
      sel.dispatchEvent(new Event('change'));
      const codexCount = document.querySelectorAll('#flow16List details.flow16-item').length;
      sel.value = 'hermes';
      sel.dispatchEvent(new Event('change'));
      const hermesEmpty = Boolean(document.getElementById('flow16EmptyState'));
      sel.value = 'all';
      sel.dispatchEvent(new Event('change'));
      const allCount = document.querySelectorAll('#flow16List details.flow16-item').length;
      document.getElementById('flow16PauseBtn').click();
      const pausedPressed = document.getElementById('flow16PauseBtn').getAttribute('aria-pressed');
      document.getElementById('flow16PauseBtn').click();
      const resumedPressed = document.getElementById('flow16PauseBtn').getAttribute('aria-pressed');
      document.getElementById('flow16PatternsBtn').click();
      const patOff = document.getElementById('flow16PatternsBtn').getAttribute('aria-pressed');
      document.getElementById('flow16PatternsBtn').click();
      const patOn = document.getElementById('flow16PatternsBtn').getAttribute('aria-pressed');
      return { codexCount, hermesEmpty, allCount, pausedPressed, resumedPressed, patOff, patOn };
    })()`);
    check(
      'Provider filter, Pause/Resume toggle, and Line Patterns toggle work interactively',
      filterAndToggles.codexCount === 1 &&
        filterAndToggles.hermesEmpty === true &&
        filterAndToggles.allCount === 3 &&
        filterAndToggles.pausedPressed === 'true' &&
        filterAndToggles.resumedPressed === 'false' &&
        filterAndToggles.patOff === 'false' &&
        filterAndToggles.patOn === 'true',
      filterAndToggles
    );

    // 3c. Keyboard accessibility: Escape closes panel, Enter opens details
    await browser.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await browser.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(180);
    const closedByEsc = await browser.ev(`Boolean(document.getElementById('panel')?.open) === false`);
    check('Keyboard Escape closes Live Flow modal cleanly', closedByEsc);

    // 3d. Settings -> Flow tab: editable subagent mapping table + validation + reset
    await browser.ev(`(() => { const s = OfficeSettings.get(); s.appearance.theme = 'light'; OfficeSettings.set(s); document.getElementById('settingsButton').click(); document.getElementById('tab-flow').click(); })()`);
    await sleep(250);
    const settingsFlowCheck = await browser.ev(`(() => {
      const inp = document.getElementById('flow16MapNewKey');
      const psel = document.getElementById('flow16MapNewPersona');
      const add = document.getElementById('flow16MapAddBtn');
      inp.value = '../BadKey';
      add.click();
      const errShown = Boolean(document.getElementById('flow16MapError'));
      const inp2 = document.getElementById('flow16MapNewKey');
      const psel2 = document.getElementById('flow16MapNewPersona');
      inp2.value = 'qa-bot';
      psel2.value = 'reality-checker';
      document.getElementById('flow16MapAddBtn').click();
      const added = OfficeSettings.get().flow16.subagentTypes['qa-bot'] === 'reality-checker';
      const walkSel = document.getElementById('setting-flow16-walkAnimation');
      walkSel.value = 'off';
      walkSel.dispatchEvent(new Event('change'));
      const walkSaved = OfficeSettings.get().flow16.walkAnimation === 'off';
      return { errShown, added, walkSaved };
    })()`);
    check(
      'Settings -> Flow validates bad mapping, saves custom subagent->persona mapping, and updates walkAnimation',
      settingsFlowCheck.errShown && settingsFlowCheck.added && settingsFlowCheck.walkSaved,
      settingsFlowCheck
    );
    const shotSetLight = path.join(shotDir, 'ui_settings_flow_light.png');
    await browser.shot(shotSetLight);
    out.shots.push(shotSetLight);

    await browser.ev(`(() => { const s = OfficeSettings.get(); s.appearance.theme = 'dark'; OfficeSettings.set(s); })()`);
    await sleep(200);
    const shotSetDark = path.join(shotDir, 'ui_settings_flow_dark.png');
    await browser.shot(shotSetDark);
    out.shots.push(shotSetDark);

    // Restore defaults check
    await browser.ev(`document.getElementById('flow16ResetBtn').click(); 0`);
    await sleep(200);
    const afterReset = await browser.ev(`({ walk: OfficeSettings.get().flow16.walkAnimation, keys: Object.keys(OfficeSettings.get().flow16.subagentTypes).length })`);
    check('Restore flow defaults resets walkAnimation and custom mappings', afterReset.walk === 'fast' && afterReset.keys === 0, afterReset);

    await browser.ev(`document.getElementById('settingsDialog')?.close(); 0`);
    await sleep(150);

    // 3e. Setup Center -> Office AI Hooks (FIXTURE PROJECT + FIXTURE GLOBAL HOME ONLY!)
    await browser.ev(`(() => { const s = OfficeSettings.get(); s.appearance.theme = 'light'; OfficeSettings.set(s); document.getElementById('openSetup').click(); })()`);
    await sleep(450);

    // Verify zero auto-read on load
    const hookInit = await browser.ev(`({
      hasSection: Boolean(document.getElementById('setup16HooksSection')),
      claudeStatus: document.getElementById('setup16HookStatus-claude')?.textContent?.trim(),
      codexStatus: document.getElementById('setup16HookStatus-codex')?.textContent?.trim(),
      hasPreviewBox: Boolean(document.getElementById('setup16HookPreviewBox')),
      setupRowsCount: document.querySelectorAll('.setup15-row').length
    })`);
    check(
      'Setup Center renders Office AI Hooks section without auto-reading user config and keeps 6 V15 checklist rows',
      hookInit.hasSection && hookInit.hasPreviewBox === false && hookInit.setupRowsCount === 6,
      hookInit
    );

    // Enter fixture project folder -> Check -> Preview -> Install (Confirm) -> Uninstall (Confirm)
    const hookFlow = await browser.ev(`(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const fInp = document.getElementById('setup16HookFolder');
      fInp.value = ${JSON.stringify(fixtureProject)};
      fInp.dispatchEvent(new Event('input'));
      document.getElementById('setup16HookCheck-claude').click();
      await wait(450);
      const stBefore = document.getElementById('setup16HookStatus-claude')?.textContent?.trim();
      document.getElementById('setup16HookPreview-claude').click();
      await wait(550);
      const previewCode = document.getElementById('setup16HookPreviewCode')?.textContent || '';
      document.getElementById('setup16HookInstall-claude').click();
      await wait(150);
      const hasConfirm = Boolean(document.getElementById('setup16HookConfirmBox'));
      return { stBefore, hasPreviewCode: previewCode.includes('--office-managed-v16a') && previewCode.includes('existing-hook'), hasConfirm };
    })()`);
    const shotHooks = path.join(shotDir, 'ui_setup_hooks_light.png');
    await browser.ev(`document.getElementById('setup16HooksSection')?.scrollIntoView({ behavior: 'auto', block: 'start' }); 0`);
    await sleep(150);
    await browser.shot(shotHooks);
    out.shots.push(shotHooks);

    const hookInstallUninstall = await browser.ev(`(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      document.getElementById('setup16HookConfirmOk').click();
      await wait(650);
      const stInstalled = document.getElementById('setup16HookStatus-claude')?.textContent?.trim();
      document.getElementById('setup16HookUninstall-claude').click();
      await wait(550);
      const hasUninstallConfirm = Boolean(document.getElementById('setup16HookConfirmBox'));
      document.getElementById('setup16HookConfirmOk').click();
      await wait(650);
      const stAfterUninstall = document.getElementById('setup16HookStatus-claude')?.textContent?.trim();
      return { stInstalled, hasUninstallConfirm, stAfterUninstall };
    })()`);
    const restoredContent = await fs.readFile(claudeCfgPath, 'utf8');
    check(
      'Setup Center Hook installer previews exact JSON, requires confirmation, installs cleanly, and uninstalls back to exact original fixture',
      hookFlow.hasPreviewCode &&
        hookFlow.hasConfirm &&
        hookInstallUninstall.hasUninstallConfirm &&
        hookInstallUninstall.stInstalled !== hookFlow.stBefore &&
        restoredContent === existingClaudeCfg,
      { hookFlow, hookInstallUninstall, restoredExact: restoredContent === existingClaudeCfg }
    );

    // Check Global scope risk notice & isolated fixture home preview (Codex)
    const codexGlobalPreview = await browser.ev(`(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const scopeSel = document.getElementById('setup16HookScope');
      scopeSel.value = 'global';
      scopeSel.dispatchEvent(new Event('change'));
      await wait(100);
      const riskWarn = document.getElementById('setup16HookScopeRisk')?.classList.contains('warn');
      document.getElementById('setup16HookPreview-codex').click();
      await wait(550);
      const previewText = document.getElementById('setup16HookPreviewCode')?.textContent || '';
      return { riskWarn, hasCodexHook: previewText.includes('office_hook_codex.py') };
    })()`);
    check(
      'Global scope displays explicit risk warning and previews Codex hook cleanly against isolated fixture home',
      codexGlobalPreview.riskWarn && codexGlobalPreview.hasCodexHook,
      codexGlobalPreview
    );

    await browser.ev(`document.getElementById('panel')?.close(); 0`);
    await sleep(150);

    // 3f. 6-Language + Arabic RTL DOM layout audit at 1280x720
    await browser.size(1280, 720);
    for (const lang of ['en', 'id', 'es', 'ja', 'zh-CN', 'ar']) {
      await browser.ev(`(() => { I18n.setLanguage(${JSON.stringify(lang)}); const s = OfficeSettings.get(); s.language = ${JSON.stringify(lang)}; s.appearance.theme = 'light'; OfficeSettings.set(s); })()`);
      await sleep(120);
      await browser.ev(`document.getElementById('openFlow').click(); 0`);
      await sleep(220);
      const probeFlow = await browser.ev(domProbe);
      out.domMatrix.push({ lang, surface: 'flow', dir: probeFlow.dir, overflow: probeFlow.overflow.length, outside: probeFlow.outside.length, overlap: probeFlow.overlap.length, selectClipped: probeFlow.selectClipped.length, missing: probeFlow.missing.length });
      if (lang === 'ar') {
        const shotRtl = path.join(shotDir, 'ui_flow_panel_ar_rtl.png');
        await browser.shot(shotRtl);
        out.shots.push(shotRtl);
      }
      await browser.ev(`document.getElementById('panel')?.close(); document.getElementById('settingsButton').click(); document.getElementById('tab-flow').click(); 0`);
      await sleep(220);
      const probeSet = await browser.ev(domProbe);
      out.domMatrix.push({ lang, surface: 'settings-flow', dir: probeSet.dir, overflow: probeSet.overflow.length, outside: probeSet.outside.length, overlap: probeSet.overlap.length, selectClipped: probeSet.selectClipped.length, missing: probeSet.missing.length });
      await browser.ev(`document.getElementById('settingsDialog')?.close(); 0`);
      await sleep(100);
    }

    const domFailures = out.domMatrix.filter(r => r.overflow || r.outside || r.overlap || r.selectClipped || r.missing);
    const arRtlOk = out.domMatrix.some(r => r.lang === 'ar' && r.dir === 'rtl');
    check(
      '6-language + Arabic RTL DOM matrix (1280x720) passes with 0 overflow/outside/overlap/missing keys',
      domFailures.length === 0 && arRtlOk,
      { domFailures, arRtlOk }
    );

    out.consoleErrors = browser.consoleErrors;
    check('Zero console/page errors during all V16 UI tests', browser.consoleErrors.length === 0, browser.consoleErrors);

    out.ok = out.failed.length === 0;
    console.log(JSON.stringify({ ok: out.ok, summary: { passed: out.checks.length - out.failed.length, total: out.checks.length }, shots: out.shots, domMatrix: out.domMatrix, failed: out.failed }, null, 2));
    if (!out.ok) process.exitCode = 1;
  } finally {
    await browser?.close();
    await releaseBrowserLock();
    await server?.close();
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

run().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
