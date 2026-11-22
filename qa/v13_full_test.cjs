// [Diubah oleh Codex - 2026-11-21] V17: request isolated demo analytics explicitly.
// [Diubah oleh Gemini - 2026-11-21] Suite Uji End-to-End Revisi 13 (V13): Estimasi Biaya Gemini, MT5 Full Analytics + CSV, Sinkronisasi Workspace Proyek, Analisa YouTube 00:00 + Catch-Up + Recommend-to-Short, dan Prompt Agen Lokal Akses Penuh + Koreografi 3D
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { open, sleep, root } = require('./v6c_lib.cjs');
const { createData } = require('../office_data.js');
const { createYoutubeAnalyticsStore } = require('../youtube_analytics_store.js');
const { createMt5FinanceStore } = require('../mt5_finance_store.js');

(async () => {
  const out = {
    ok: false,
    startedAt: new Date().toISOString(),
    checks: [],
    failed: [],
    metrics: {},
    consoleErrors: [],
    pageExceptions: []
  };

  function check(name, pass, detail = null) {
    const rec = { name, pass: Boolean(pass) };
    if (detail !== null) rec.detail = detail;
    out.checks.push(rec);
    if (!pass) out.failed.push(rec);
  }

  let b = null;
  let wsFixture = null;
  let unitDir = null;

  try {
    // =========================================================================
    // 1. GEMINI TOKEN COST ESTIMATION & recordExternalUsage()
    // =========================================================================
    unitDir = await fs.mkdtemp(path.join(root, 'qa/v13-unit-'));
    const dataStore = await createData({ dataDir: path.join(unitDir, 'office-data') });

    const sampleUsage = { input_tokens: 10000, output_tokens: 2000, cache_read_input_tokens: 5000 };
    const cArgon = dataStore.cost(sampleUsage, 'gemini-4-argon-high', 'gemini');
    const cNeon = dataStore.cost(sampleUsage, 'gemini-4-neon-xhigh', 'gemini');
    const cFlash = dataStore.cost(sampleUsage, 'gemini-2.5-flash', 'gemini');
    const cPrefix = dataStore.cost(sampleUsage, 'gemini-4-argon-preview-2026', 'gemini');

    check(
      'Gemini pricing resolves exact, effort-stripped, and prefix variants to non-null IDR',
      cArgon > 0 && cNeon > 0 && cFlash > 0 && cPrefix > 0 && cArgon > cNeon && cNeon > cFlash,
      { cArgon, cNeon, cFlash, cPrefix }
    );

    const extRec = await dataStore.recordExternalUsage({
      provider: 'gemini',
      model: 'gemini-4-argon-high',
      usageMetadata: {
        promptTokenCount: 2400,
        candidatesTokenCount: 600,
        cachedContentTokenCount: 400
      },
      agent: 'gemini-api',
      task: 'V13 E2E Test'
    });
    const dailyAfter = dataStore.daily(1).days[0];
    check(
      'recordExternalUsage() persists tokens & live IDR cost into office_data daily()',
      extRec.tokens === 3400 &&
        extRec.cost_idr > 0 &&
        dailyAfter.providers.gemini.tokens === 3400 &&
        dailyAfter.providers.gemini.cost_idr === extRec.cost_idr,
      { extRec, dailyGemini: dailyAfter.providers.gemini }
    );

    // =========================================================================
    // 2. SYNTHETIC WORKSPACE FIXTURE (Channels/DemoChannel + Secrets skip)
    // =========================================================================
    wsFixture = path.join(unitDir, 'workspace');
    await fs.mkdir(path.join(wsFixture, 'Channels', 'DemoChannel', 'Videos', 'reel-1', 'qa'), { recursive: true });
    await fs.mkdir(path.join(wsFixture, 'Channels', 'DemoChannel', 'Videos', '_misc'), { recursive: true });
    await fs.mkdir(path.join(wsFixture, 'Channels', 'DemoChannel', 'Data', 'snapshots'), { recursive: true });
    await fs.mkdir(path.join(wsFixture, 'Secrets'), { recursive: true });
    await fs.writeFile(path.join(wsFixture, 'Secrets', 'token_secret.txt'), 'SENSITIVE_SECRET_MARKER_V13');
    await fs.writeFile(
      path.join(wsFixture, 'AGENTS.md'),
      '# Workspace Rules\n- Always verify facts before scripting.\n- Never upload automatically without Boss approval.\n'
    );
    await fs.writeFile(path.join(wsFixture, 'ACTIVE.md'), '# Active\n- Producing reel-1 for DemoChannel\n');
    await fs.writeFile(
      path.join(wsFixture, 'Channels', 'DemoChannel', 'AGENTS.md'),
      '# DemoChannel Rules\n- Keep contrast high with warm gold #FFD23F accents.\n- Open with a visual action hook within 2.5 seconds.\n'
    );
    await fs.writeFile(
      path.join(wsFixture, 'Channels', 'DemoChannel', 'LEARNINGS.md'),
      '# Learnings\n- Fix retention drop between seconds 3-10 by changing shots every 3s.\n- Connect final narration seamlessly to frame 1 loop.\n'
    );
    await fs.writeFile(path.join(wsFixture, 'Channels', 'DemoChannel', 'Videos', 'reel-1', 'script.json'), '{"scenes":[]}');
    await fs.writeFile(path.join(wsFixture, 'Channels', 'DemoChannel', 'Videos', 'reel-1', 'storyboard.jpg'), 'stub');
    await fs.writeFile(path.join(wsFixture, 'Channels', 'DemoChannel', 'Videos', 'reel-1', 'qa', 'qa_report.md'), 'PASS');
    await fs.writeFile(path.join(wsFixture, 'Channels', 'DemoChannel', 'Videos', 'reel-1', 'upload.json'), '{"title":"Demo Reel 1"}');
    await fs.writeFile(path.join(wsFixture, 'Channels', 'DemoChannel', 'Videos', 'reel-1', 'thumbnail.jpg'), 'stub');
    await fs.writeFile(
      path.join(wsFixture, 'Channels', 'DemoChannel', 'Data', 'snapshots', '2026-11-19.json'),
      JSON.stringify({
        taken: '2026-11-19T00:05:00',
        channel: { id: 'UC_DEMO', title: 'Demo Channel', stats: { subscriberCount: '850', viewCount: '18400', videoCount: '9' } },
        videos: [
          { id: 'vid_top_1', title: 'What If Gravity Flipped For 3 Seconds?', published: '2026-11-15', duration: 'PT46S', stats: { viewCount: '5400', likeCount: '165', commentCount: '18' } },
          { id: 'vid_weak_1', title: 'Slow Intro Experiment', published: '2026-11-10', duration: 'PT55S', stats: { viewCount: '380', likeCount: '8', commentCount: '0' } }
        ],
        analytics: {
          videos: [
            { video: 'vid_top_1', views: 5400, averageViewPercentage: 65.4, likes: 165 },
            { video: 'vid_weak_1', views: 380, averageViewPercentage: 43.2, likes: 8 }
          ]
        }
      })
    );

    // Verify YouTube 00:00 Midnight Auto-Cycle + Catch-Up preserves archived snapshots
    let fakeNow = Date.parse('2026-11-19T12:00:00Z');
    const ytCatch = await createYoutubeAnalyticsStore({
      dataDir: path.join(unitDir, 'yt-catchup'),
      getLocalProjectDir: () => wsFixture,
      now: () => fakeNow
    });
    await ytCatch.syncNow({ trigger: 'manual' });
    const day1 = ytCatch.getState().lastRunDate;
    fakeNow += 24 * 3600 * 1000;
    await ytCatch.checkMidnightAutoCycle();
    const afterCatch = ytCatch.getState();
    const snapFiles = await fs.readdir(path.join(unitDir, 'yt-catchup', 'yt_snapshots'));
    await ytCatch.stop();
    check(
      'YouTube 00:00 catch-up archives previous day & preserves both daily snapshots in yt_snapshots/',
      afterCatch.lastRunDate !== day1 &&
        afterCatch.lastTrigger === 'midnight_auto' &&
        snapFiles.includes(`${day1}.json`) &&
        snapFiles.includes(`${afterCatch.lastRunDate}.json`),
      { day1, day2: afterCatch.lastRunDate, snapFiles }
    );

    // Verify MT5 ledger auto-reconciliation (SELL side, Position ID, EA comment, & ISO broker date heatmap)
    const mt5UnitDir = path.join(unitDir, 'mt5-reconcile');
    await fs.mkdir(mt5UnitDir, { recursive: true });
    await fs.writeFile(
      path.join(mt5UnitDir, 'mt5_finance.json'),
      JSON.stringify({
        version: 1,
        config: { enabled: false, pollIntervalMs: 5000, pythonPath: '', terminalPath: '', usdToIdr: 16200 },
        recordedDealTickets: ['4717324591'],
        mt5HistoryDeals: [],
        entries: [
          {
            id: 'fin_old_wrong',
            source: 'mt5',
            type: 'income',
            category: 'profit',
            amountIdr: 1166886,
            amountOriginal: 72.03,
            currency: 'USD',
            note: 'MT5 BUY XAUUSDm (#4717324591)',
            symbol: 'XAUUSDm',
            side: 'BUY',
            ticket: '4717324591',
            date: '2026-11-20T00:00:03+00:00',
            createdAt: '2026-11-20T06:00:00.000Z',
            demo: false
          }
        ]
      })
    );
    const mt5RecStore = await createMt5FinanceStore({
      dataDir: mt5UnitDir,
      root,
      now: () => Date.parse('2026-11-20T11:00:00Z'),
      bridgeRunner: async () => ({
        ok: true,
        connected: true,
        readonly: true,
        account: { balance: 10346.4, equity: 10346.4, profit: 0, currency: 'USD', margin_free: 10346.4, server_masked: 'Dem***01' },
        positions: [],
        closed_deals: [
          {
            ticket: '4709224905',
            position_id: '5446337252',
            symbol: 'XAUUSDm',
            side: 'SELL',
            entry: 'out',
            volume: 0.01,
            price: 3725.106,
            profit: 42.41,
            commission: 0,
            swap: 0,
            net_profit: 42.41,
            comment: 'NY_Momentum',
            time: '2026-11-18T21:00:00+00:00'
          },
          {
            ticket: '4717324591',
            position_id: '5454959715',
            symbol: 'XAUUSDm',
            side: 'SELL',
            entry: 'out',
            volume: 0.01,
            price: 3605.235,
            profit: 72.03,
            commission: 0,
            swap: 0,
            net_profit: 72.03,
            comment: 'Drift2',
            time: '2026-11-20T00:00:03+00:00'
          }
        ],
        fetched_at: '2026-11-20T11:00:00Z'
      })
    });
    await mt5RecStore.refresh({ historyDays: 30 });
    const recLedger = mt5RecStore.getLedger({ source: 'mt5' }).entries;
    const recOld = recLedger.find(e => e.ticket === '4717324591');
    const recAna = mt5RecStore.getMt5Analytics({ days: 30 });
    mt5RecStore.stop();
    check(
      'MT5 sync auto-reconciles old BUY/deal-ticket ledger notes to SELL + Position ID + EA comment & keeps ISO heatmap date (11-18 21:00 -> 11-18)',
      recOld?.side === 'SELL' &&
        recOld?.positionId === '5454959715' &&
        recOld?.note === 'MT5 SELL XAUUSDm (#5454959715 · Drift2)' &&
        recAna.dailyHeatmap.some(d => d.date === '2026-11-18' && d.netProfit === 42.41),
      { recOldNote: recOld?.note, recOldSide: recOld?.side, heatmapDates: recAna.dailyHeatmap.map(d => `${d.date}:${d.netProfit}`) }
    );

    // =========================================================================
    // 3. OPEN HEADLESS GUI CHROMIUM ON LIVE EMBEDDED SERVER (?qa=1)
    // =========================================================================
    b = await open({serverOptions:{agentPrompt:{
      spawnImpl: () => {
        const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
        const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();
        child.exitCode=null;child.signalCode=null;
        child.kill=()=>{if(child.exitCode!==null)return true;child.exitCode=130;child.signalCode='SIGTERM';child.stdout.end();child.stderr.end();child.stdin.end();child.emit('exit',130);child.emit('close',130);return true;};
        return child;
      },
      cliProbeImpl:async()=>({ok:true,stdout:'QA fake CLI 1.0'})
    }}});
    b.events.length = 0;
    await b.go('?qa=1');
    await sleep(300);

    const token = await b.ev(`document.querySelector('meta[name="office-vault-token"]')?.content || ''`);
    check('office-vault-token injected (64 hex)', /^[a-f0-9]{64}$/.test(token));

    const api = async (route, method = 'GET', body = undefined, tok = token) => {
      const headers = {};
      if (tok !== null) headers['X-Office-Token'] = tok;
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const r = await fetch(b.server.origin + route, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
      const text = await r.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* non-JSON */
      }
      return { status: r.status, contentType: r.headers.get('content-type') || '', text, json };
    };

    // =========================================================================
    // 4. MT5 FULL ANALYTICS (API + CSV + Anti-Duplicate + 403 Guard + UI SVG)
    // =========================================================================
    const mt5Forbid = await api('/mt5/refresh', 'POST', { order_send: true, lot_size: 0.5 });
    check('MT5 read-only guard rejects order_send/lot_size with HTTP 403', mt5Forbid.status === 403);

    const seed1 = await api('/finance/demo-trade', 'POST', { phase: 'seed-analytics' });
    const seed2 = await api('/finance/demo-trade', 'POST', { phase: 'seed-analytics' });
    const mt5An = await api('/mt5/analytics?days=30&demo=1');
    const mt5Csv = await api('/mt5/analytics.csv?days=30&demo=1');
    check(
      'MT5 seed-analytics is idempotent (anti-duplicate tickets = 10), computes KPIs, equityCurve & CSV',
      seed1.status === 200 &&
        seed2.status === 200 &&
        mt5An.status === 200 &&
        mt5An.json.metrics.totalTrades === 10 &&
        mt5An.json.metrics.winRatePct === 70 &&
        mt5An.json.equityCurve.length === 10 &&
        mt5An.json.dailyHeatmap.length === 10 &&
        mt5Csv.status === 200 &&
        mt5Csv.contentType.includes('text/csv') &&
        mt5Csv.text.split(/\r?\n/).filter(Boolean).length === 11,
      { metrics: mt5An.json?.metrics, csvLines: mt5Csv.text.split(/\r?\n/).filter(Boolean).length }
    );

    // Open Finance -> Analisa Trading tab in Chromium UI
    await b.ev(`document.getElementById('openFinance').click(); 0`);
    await sleep(400);
    await b.ev(`(() => {
      const tabs = [...document.querySelectorAll('#panel .v12-tab')];
      if (tabs[2]) tabs[2].click();
    })()`);
    await sleep(450);
    await b.ev("document.getElementById('v13Mt5SeedDemo').click()");
    await sleep(450);
    const mt5Ui = await b.ev(`(() => ({
      kpiCards: document.querySelectorAll('#v13Mt5KpiGrid > *').length,
      svgExists: !!document.getElementById('v13Mt5EquitySvg'),
      svgPoints: document.querySelectorAll('#v13Mt5EquitySvg circle').length,
      heatmapCells: document.querySelectorAll('#v13Mt5Heatmap > *').length,
      symbolRows: document.querySelectorAll('#v13Mt5SymbolTable tbody tr').length,
      dealRows: document.querySelectorAll('#v13Mt5DealsTable tbody tr').length,
      firstDealIdrCell: document.querySelector('#v13Mt5DealsTable tbody tr td:last-child')?.textContent || ''
    }))()`);
    check(
      'UI MT5 Analisa Trading renders 6 KPI cards, SVG Equity Curve (10 pts), Heatmap (10 cells), Symbol & Deals tables with literal IDR column',
      mt5Ui.kpiCards >= 6 &&
        mt5Ui.svgExists &&
        mt5Ui.svgPoints >= 10 &&
        mt5Ui.heatmapCells >= 10 &&
        mt5Ui.dealRows === 10 &&
        /Rp|IDR/i.test(mt5Ui.firstDealIdrCell),
      mt5Ui
    );

    // =========================================================================
    // 5. WORKSPACE RULES SYNC + CHANNEL RULES INJECTION IN SHORTS
    // =========================================================================
    const wsBlock = await api('/workflows/config', 'POST', { localProjectDir: path.join(wsFixture, 'Secrets') });
    check('Workspace config rejects Secrets folder with HTTP 403', wsBlock.status === 403);

    const wsSave = await api('/workflows/config', 'POST', { localProjectDir: wsFixture, defaultChannel: 'DemoChannel' });
    const wsScan = await api('/workflows/workspace');
    check(
      'GET /workflows/workspace scans DemoChannel (AGENTS/LEARNINGS/Videos/reel-1) & skips Secrets/',
      wsSave.status === 200 &&
        wsScan.status === 200 &&
        wsScan.json.valid === true &&
        wsScan.json.hasRootAgents === true &&
        wsScan.json.channels.length === 1 &&
        wsScan.json.channels[0].name === 'DemoChannel' &&
        wsScan.json.channels[0].activeReels.length === 1 &&
        wsScan.json.channels[0].activeReels[0].slug === 'reel-1' &&
        wsScan.json.channels[0].activeReels[0].hasScript === true &&
        wsScan.json.channels[0].activeReels[0].hasQaReport === true &&
        !JSON.stringify(wsScan.json).includes('SENSITIVE_SECRET_MARKER_V13'),
      { rulesCount: wsScan.json?.rulesCount, channel: wsScan.json?.channels?.[0]?.name }
    );

    const wfNew = await api('/workflows/shorts', 'POST', {
      title: 'Mengapa Gravitasi Terasa Konstan?',
      topic: 'Mekanika gravitasi dan percepatan',
      channel: 'DemoChannel',
      mode: 'local'
    });
    const wfStep1 = await api(`/workflows/shorts/${wfNew.json.workflow.id}/step`, 'POST', {});
    check(
      'Short workflow stage injects workspace root + DemoChannel AGENTS/LEARNINGS rules into prompt & rulesApplied',
      wfNew.status === 200 &&
        wfStep1.status === 200 &&
        Array.isArray(wfStep1.json.stage.rulesApplied) &&
        wfStep1.json.stage.rulesApplied.length >= 4 &&
        wfStep1.json.stage.prompt.includes('DemoChannel/AGENTS.md') &&
        wfStep1.json.stage.prompt.includes('DemoChannel/LEARNINGS.md'),
      { rulesAppliedCount: wfStep1.json?.stage?.rulesApplied?.length }
    );

    // V14-A [Diubah oleh Codex - 2026-11-21] UI Live diganti studio; aturan workspace/API lama tetap diuji di atas.
    await b.ev(`document.getElementById('openShorts').click(); 0`);
    await sleep(350);
    const shortsUi = await b.ev(`(() => ({
      composer: !!document.querySelector('.short14-composer'),
      settings: !!document.querySelector('.short14-settings input'),
      projectFolder: document.querySelector('.short14-settings input')?.value || ''
    }))()`);
    check('V14 studio replaces old workspace banner and retains configured project folder',
      shortsUi.composer && shortsUi.settings && shortsUi.projectFolder === wsFixture, shortsUi);

    // =========================================================================
    // 6. YOUTUBE 00:00 ANALYTICS UI + DEMO + 1-CLICK RECOMMEND-TO-SHORT
    // =========================================================================
    const ytDemo = await api('/youtube/demo', 'POST', { action: 'seed' });
    check(
      'POST /youtube/demo seeds YouTube analytics with 3 Next-Video Recommendations',
      ytDemo.status === 200 && ytDemo.json.source === 'demo' && ytDemo.json.nextVideoRecommendations.length === 3
    );

    // V14-A: panel demo analitik lama diganti dasbor penuh oleh Agen B; data dan endpoint V13 tetap kompatibel.
    await b.ev(`window.officeQA.v13.openYoutube(); 0`);
    await sleep(500);
    const ytUi = await b.ev(`(() => ({
      toolbar: !!document.getElementById('yt14Toolbar'),
      status: !!document.getElementById('yt14StatusPill'),
      panel: !!document.querySelector('#panelContent.yt14-panel')
    }))()`);
    check('V14 embedded YouTube dashboard replaces legacy analytics panel and exposes host status',
      ytUi.toolbar && ytUi.status && ytUi.panel, ytUi);
    const firstRecTitle = ytDemo.json.nextVideoRecommendations[0].title;
    const recommendation = ytDemo.json.nextVideoRecommendations[0];
    const recCreate = await api('/youtube/recommend-to-short', 'POST', {recommendationId: recommendation.id});
    const shortsAfterRec = await api('/workflows/shorts');
    const createdRecWf = shortsAfterRec.json.workflows.find(w => w.title === firstRecTitle);
    check('Legacy recommend-to-short API creates a workflow without starting paid production',
      recCreate.status === 200 && Boolean(createdRecWf), {createdWorkflowId: createdRecWf?.id, firstRecTitle});

    // =========================================================================
    // 7. DIRECT FULL-ACCESS LOCAL CLI PROMPT RUNNER + 3D CHOREOGRAPHY
    // =========================================================================
    const agentsRes = await api('/prompt/agents');
    // [Diubah oleh Gemini - 2026-11-21] Gunakan username OS dinamis agar bebas nama pribadi di repo publik
    const osUserLower = (require('node:os').userInfo?.().username || '').toLowerCase();
    check(
      'GET /prompt/agents returns all 6 whitelisted agents without leaking personal paths',
      agentsRes.status === 200 &&
        agentsRes.json.agents.length === 6 &&
        (!osUserLower || !JSON.stringify(agentsRes.json.agents).toLowerCase().includes(osUserLower)),
      agentsRes.json?.agents?.map(a => `${a.id}:${a.status}`)
    );

    check(
      'POST /prompt/run rejects unwhitelisted agent with HTTP 400',
      (await api('/prompt/run', 'POST', { agentId: 'bash-evil', prompt: 'whoami', mode: 'demo' })).status === 400
    );
    check(
      'POST /prompt/run rejects Secrets cwd with HTTP 403',
      (await api('/prompt/run', 'POST', { agentId: 'claude', prompt: 'check', cwd: path.join(wsFixture, 'Secrets'), mode: 'demo' })).status === 403
    );
    check(
      'POST /prompt/run rejects missing X-Office-Token with HTTP 403',
      (await api('/prompt/run', 'POST', { agentId: 'claude', prompt: 'check', mode: 'demo' }, null)).status === 403
    );

    // Open Prompt panel & execute demo run via API while watching live SSE console + 3D choreography
    await b.ev(`window.officeQA.v13.openPrompt(); 0`);
    await sleep(300);

    const runStart = await api('/prompt/run', 'POST', {
      agentId: 'claude',
      prompt: 'Audit kesehatan proyek dan tampilkan ringkasan singkat',
      cwd: wsFixture,
      fullAccess: true,
      mode: 'demo'
    });
    check('POST /prompt/run demo starts cleanly with fullAccess: true', runStart.status === 200 && runStart.json.run.fullAccess === true);

    await sleep(150);
    await b.ev(`officeQA.advance(15); 0`);
    await sleep(550);
    await b.ev(`officeQA.advance(10); 0`);

    const promptCheck = await b.ev(`(() => {
      const dbg = officeDebug();
      return {
        agentCards: document.querySelectorAll('#v13PromptAgentGrid button').length,
        fullAccessChecked: !!document.getElementById('v13PromptFullAccess')?.checked,
        consoleText: document.getElementById('v13PromptConsole')?.textContent || '',
        hasPromptStartedMilestone: dbg.milestones.some(m => m.stage === 'v13-prompt-started'),
        drawCalls: dbg.drawCalls
      };
    })()`);
    check(
      'UI Prompt Runner shows 6 agents, Full Access ON, streams output, triggers 3D v13-prompt-started, drawCalls <= 340',
      promptCheck.agentCards === 6 &&
        promptCheck.fullAccessChecked &&
        promptCheck.consoleText.includes('Claude Code') &&
        promptCheck.hasPromptStartedMilestone &&
        promptCheck.drawCalls <= 340,
      {
        agentCards: promptCheck.agentCards,
        fullAccessChecked: promptCheck.fullAccessChecked,
        consoleLen: promptCheck.consoleText.length,
        hasPromptStartedMilestone: promptCheck.hasPromptStartedMilestone,
        drawCalls: promptCheck.drawCalls
      }
    );

    // Test cancel & delete run + interactive UI cancel -> immediate unlock & re-send
    const runCancelStart = await api('/prompt/run', 'POST', {
      agentId: 'antigravity',
      prompt: 'Tugas untuk dibatalkan',
      cwd: wsFixture,
      fullAccess: true,
      mode: 'demo'
    });
    const runCancelled = await api(`/prompt/runs/${runCancelStart.json.run.id}/cancel`, 'POST', {});
    const runDeleted = await api(`/prompt/runs/${runStart.json.run.id}`, 'DELETE');
    check(
      'POST /prompt/runs/:id/cancel and DELETE /prompt/runs/:id work cleanly',
      runCancelled.status === 200 &&
        runCancelled.json.run.status === 'cancelled' &&
        runDeleted.status === 200 &&
        runDeleted.json.deletedId === runStart.json.run.id
    );

    // Interactive UI Send -> Mid-run Cancel -> Re-Send verification (prevents stuck loading after cancel)
    await b.ev(`(() => {
      const cwd = document.getElementById('v13PromptCwd');
      if (cwd) { cwd.value = ${JSON.stringify(wsFixture)}; cwd.dispatchEvent(new Event('input', { bubbles: true })); }
      const ta = document.getElementById('v13PromptText');
      if (ta) { ta.value = 'Prompt pertama lalu cancel'; ta.dispatchEvent(new Event('input', { bubbles: true })); }
      document.getElementById('v13PromptSendBtn')?.click();
    })()`);
    await sleep(60);
    await b.ev(`document.getElementById('v13PromptCancelBtn')?.click(); 0`);
    await sleep(900);
    const afterUiCancel = await b.ev(`({
      sendDisabled: document.getElementById('v13PromptSendBtn')?.disabled,
      cancelDisabled: document.getElementById('v13PromptCancelBtn')?.disabled,
      pill: document.getElementById('v13PromptStatusPill')?.textContent || ''
    })`);
    // Immediately send a 2nd prompt after cancel and verify it starts & cancels cleanly
    await b.ev(`(() => {
      const ta = document.getElementById('v13PromptText');
      if (ta) { ta.value = 'Prompt kedua pasca cancel'; ta.dispatchEvent(new Event('input', { bubbles: true })); }
      document.getElementById('v13PromptSendBtn')?.click();
    })()`);
    await sleep(250);
    const duringSecond = await b.ev(`({
      sendDisabled: document.getElementById('v13PromptSendBtn')?.disabled,
      cancelDisabled: document.getElementById('v13PromptCancelBtn')?.disabled
    })`);
    await b.ev(`document.getElementById('v13PromptCancelBtn')?.click(); 0`);
    await sleep(900);
    const afterSecondCancel = await b.ev(`({
      sendDisabled: document.getElementById('v13PromptSendBtn')?.disabled,
      cancelDisabled: document.getElementById('v13PromptCancelBtn')?.disabled
    })`);
    check(
      'UI Prompt Cancel unlocks Send immediately (no stuck loading) and allows sending a new prompt cleanly',
      afterUiCancel.sendDisabled === false &&
        afterUiCancel.cancelDisabled === true &&
        duringSecond.sendDisabled === true &&
        duringSecond.cancelDisabled === false &&
        afterSecondCancel.sendDisabled === false &&
        afterSecondCancel.cancelDisabled === true,
      { afterUiCancel, duringSecond, afterSecondCancel }
    );

    // =========================================================================
    // 8. CONSOLE ERRORS, PAGE EXCEPTIONS & DRAW CALLS
    // =========================================================================
    const consoleErrors = b.events
      .filter(
        e =>
          (e.method === 'Runtime.consoleAPICalled' && e.params?.type === 'error') ||
          (e.method === 'Log.entryAdded' && e.params?.entry?.level === 'error')
      )
      .map(e => JSON.stringify(e.params).slice(0, 2000));
    const pageExceptions = b.events
      .filter(e => e.method === 'Runtime.exceptionThrown')
      .map(e => JSON.stringify(e.params).slice(0, 2000));

    out.consoleErrors = consoleErrors;
    out.pageExceptions = pageExceptions;
    out.metrics.drawCalls = promptCheck.drawCalls;

    check('0 console errors and 0 page exceptions during full V13 browser test', consoleErrors.length === 0 && pageExceptions.length === 0, {
      consoleErrors,
      pageExceptions
    });

    out.ok = out.failed.length === 0;
  } catch (err) {
    out.exception = err?.stack || String(err);
    out.ok = false;
  } finally {
    if (b) {
      await b.close().catch(() => {});
      await fs.rm(b.fixture, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }).catch(() => {});
    }
    if (unitDir) {
      await fs.rm(unitDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }).catch(() => {});
    }
    out.finishedAt = new Date().toISOString();
    out.summary = { passed: out.checks.length - out.failed.length, total: out.checks.length };
    await fs.writeFile(path.join(root, 'qa/v13_full_results.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');
    console.log(JSON.stringify({ ok: out.ok, summary: out.summary, metrics: out.metrics, failed: out.failed }, null, 2));
    if (!out.ok) process.exitCode = 1;
  }
})();
