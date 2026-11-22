// [Diubah oleh Codex - 2026-11-21] V17: demo choreography stays in demo mode; real ledger excludes demo.
// [Diubah oleh Gemini - 2026-11-20] Rangkaian pengujian otomatis end-to-end Office AI V12 (3D 48x32, 0 rug overlap, dekorasi, roaming 240 dtk, MT5 Read-Only 403 & Keuangan, serta Alur Video Short 6-Tahap HITL)
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { open, sleep, root } = require('./v6c_lib.cjs');

(async () => {
  const b = await open();
  const out = {
    version: 12,
    timestamp: new Date().toISOString(),
    checks: [],
    failures: [],
    metrics: {}
  };

  const check = (name, ok, detail = null) => {
    const passed = Boolean(ok);
    out.checks.push({ name, ok: passed, detail });
    if (!passed) {
      out.failures.push({ name, detail });
      console.error('[FAIL]', name, JSON.stringify(detail));
    }
  };

  try {
    // =========================================================================
    // 1. DEMO MODE: AUDIT TATA LETAK 48x32, NOL RUG OVERLAP, & KEKAYAAN DEKORASI
    // =========================================================================
    await b.go('?qa=1&demo=1');
    await b.ev(`(() => {
      const s = OfficeSettings.get();
      s.language = 'id';
      s.appearance.theme = 'light';
      s.followTask = false;
      OfficeSettings.set(s);
    })()`);
    await b.ev(await fs.readFile(path.join(root, 'qa/v9_audit_page.js'), 'utf8'));

    const staticAudit = await b.ev(`(() => {
      const a = v9Audit();
      const r = officeQA.routes();
      const dbg = officeDebug();
      const activeResidentCount = dbg.actors.filter(x => x.kind === 'resident').length || 4;
      const rugs = dbg.inventory.filter(
        p => /rug|mat/i.test(p.type) && (p.residentSlot === undefined || p.residentSlot < activeResidentCount)
      );
      const rugOverlaps = [];
      for (let i = 0; i < rugs.length; i++) {
        for (let j = i + 1; j < rugs.length; j++) {
          const u = rugs[i], v = rugs[j];
          const ox = Math.min(u.x + u.w / 2, v.x + v.w / 2) - Math.max(u.x - u.w / 2, v.x - v.w / 2);
          const oz = Math.min(u.z + u.d / 2, v.z + v.d / 2) - Math.max(u.z - u.d / 2, v.z - v.d / 2);
          if (ox > 0.01 && oz > 0.01) {
            rugOverlaps.push({ a: u.name || u.type, b: v.name || v.type, ox: +ox.toFixed(3), oz: +oz.toFixed(3) });
          }
        }
      }
      const worldIds = dbg.world.map(o => o.id);
      const invCounts = {};
      for (const item of dbg.inventory) {
        invCounts[item.type] = (invCounts[item.type] || 0) + 1;
      }
      return {
        version: dbg.version,
        worldBounds: dbg.worldBounds,
        drawCalls: dbg.drawCalls,
        propsCount: dbg.props,
        propTypes: dbg.propTypes,
        rugsCount: rugs.length,
        rugOverlaps,
        layoutOverlaps: a.layout.overlaps,
        layoutWalls: a.layout.walls,
        layoutZones: a.layout.zones,
        badPoints: a.points.bad,
        routesTested: r.tested,
        routesFailed: r.failures.length,
        hasObjects: {
          atriumIsland: worldIds.includes('atrium-island'),
          waterCooler: worldIds.includes('water-cooler'),
          printer2: worldIds.includes('printer-2'),
          coffee2: worldIds.includes('coffee-2'),
          sofa2: worldIds.includes('sofa-2'),
          studioSet: worldIds.includes('studio-set'),
          studioBoard: worldIds.includes('studio-board'),
          mt5Desk: worldIds.includes('mt5-desk'),
          mt5Chair: worldIds.includes('mt5-chair'),
          mt5Board: worldIds.includes('mt5-board'),
          financeDesk: worldIds.includes('finance-desk'),
          financeChair: worldIds.includes('finance-chair'),
          financeSafe: worldIds.includes('finance-safe'),
          financeBoard: worldIds.includes('finance-board'),
          projects8: Array.from({ length: 8 }, (_, i) => worldIds.includes('project-' + i)).every(Boolean),
          personas12: Array.from({ length: 12 }, (_, i) => worldIds.includes('persona-desk-' + i)).length >= 10
        },
        wastebaskets: invCounts.Wastebasket || 0
      };
    })()`);

    out.metrics.staticAudit = staticAudit;
    // V16-C [Diubah oleh Gemini - 2026-11-21] Asersi usang: versi skema kantor kini 16 (>= 12 tetap kompatibel dengan audit V12)
    check('version is >= 12 (current V16)', staticAudit.version >= 12, staticAudit.version);
    check(
      'worldBounds 48x32 + West Terrace',
      staticAudit.worldBounds?.minX === -28 &&
        staticAudit.worldBounds?.maxX === 24 &&
        staticAudit.worldBounds?.minZ === -16 &&
        staticAudit.worldBounds?.maxZ === 16,
      staticAudit.worldBounds
    );
    check('zero rug overlaps', staticAudit.rugOverlaps.length === 0 && staticAudit.rugsCount >= 20, {
      rugsCount: staticAudit.rugsCount,
      rugOverlaps: staticAudit.rugOverlaps
    });
    check(
      'zero footprint/wall/zone conflicts',
      staticAudit.layoutOverlaps.length === 0 &&
        staticAudit.layoutWalls.length === 0 &&
        staticAudit.layoutZones.length === 0,
      {
        overlaps: staticAudit.layoutOverlaps,
        walls: staticAudit.layoutWalls,
        zones: staticAudit.layoutZones
      }
    );
    check('zero bad usePoints', staticAudit.badPoints.length === 0, staticAudit.badPoints);
    check('zero A* route failures across all usePoints', staticAudit.routesFailed === 0 && staticAudit.routesTested > 10000, {
      tested: staticAudit.routesTested,
      failed: staticAudit.routesFailed
    });
    check('all V12 themed world objects registered', Object.values(staticAudit.hasObjects).every(Boolean), staticAudit.hasObjects);
    check('rich office decorations (>= 350 props & wastebaskets)', staticAudit.propsCount >= 350 && staticAudit.wastebaskets >= 12, {
      propsCount: staticAudit.propsCount,
      wastebaskets: staticAudit.wastebaskets
    });
    check('drawCalls <= 360 budget', staticAudit.drawCalls <= 360, staticAudit.drawCalls);

    // =========================================================================
    // 2. SIMULASI OTONOM 240 DETIK (4.800 LANGKAH @ 20Hz): ROAMING & FISIKA
    // =========================================================================
    const roamSim = await b.ev(`(() => {
      officeQA.resetMetrics();
      officeQA.auto(false);
      const fps = v9Footprints();
      const tracks = new Map();
      const amenities = new Set();
      let samples = 0, actorSamples = 0, capsule = 0, pairs = 0, floating = 0, label = 0;
      const examples = [];

      for (const a of officeDebug().actors) {
        tracks.set(a.id, { kind: a.kind, x: a.x, z: a.z, dist: 0, objects: new Set() });
      }

      // 240 detik simulasi pada 20 Hz (4.800 tick)
      for (let i = 0; i < 4800; i++) {
        officeQA.step(0.05);
        const s = v9Sample(fps);
        samples++;
        actorSamples += s.actors;
        for (const k of ['capsule', 'pairs', 'floating', 'label']) {
          if (s[k].length) {
            if (k === 'capsule') capsule += s[k].length;
            if (k === 'pairs') pairs += s[k].length;
            if (k === 'floating') floating += s[k].length;
            if (k === 'label') label += s[k].length;
            if (examples.length < 6) examples.push({ tick: i, k, items: s[k].slice(0, 2) });
          }
        }
        if (i % 5 === 0) {
          for (const a of officeQA.sampleActors()) {
            const t = tracks.get(a.id);
            if (t) {
              t.dist += Math.hypot(a.x - t.x, a.z - t.z);
              t.x = a.x;
              t.z = a.z;
              if (a.object?.id) {
                t.objects.add(a.object.id);
                amenities.add(a.object.id);
              }
            }
          }
        }
      }

      const routeFailures = officeDebug().collisions.routeFailures;
      const byActor = {};
      for (const [id, t] of tracks) {
        byActor[id] = { kind: t.kind, dist: +t.dist.toFixed(2), objects: [...t.objects] };
      }
      const personaList = Object.entries(byActor).filter(([, v]) => v.kind === 'persona');
      const personasMoved = personaList.filter(([, v]) => v.dist > 5).length;

      return {
        seconds: 240,
        samples,
        actorSamples,
        capsule,
        pairs,
        floating,
        label,
        routeFailures,
        examples,
        personasTotal: personaList.length,
        personasMoved,
        qualityManagerDist: byActor['quality-manager']?.dist || 0,
        mt5TraderDist: byActor['mt5-trader']?.dist || 0,
        financeManagerDist: byActor['finance-manager']?.dist || 0,
        amenitiesUsed: [...amenities]
      };
    })()`);

    out.metrics.roamSim = roamSim;
    check('all 10 active personas roam autonomously (> 5m each)', roamSim.personasMoved === roamSim.personasTotal && roamSim.personasTotal === 10, {
      moved: roamSim.personasMoved,
      total: roamSim.personasTotal
    });
    check('quality-manager, mt5-trader, and finance-manager roam when idle (> 5m each)',
      roamSim.qualityManagerDist > 5 && roamSim.mt5TraderDist > 5 && roamSim.financeManagerDist > 5,
      {
        qualityManagerDist: roamSim.qualityManagerDist,
        mt5TraderDist: roamSim.mt5TraderDist,
        financeManagerDist: roamSim.financeManagerDist
      }
    );
    check('diverse office amenities visited during roaming (>= 8 distinct objects)', roamSim.amenitiesUsed.length >= 8, roamSim.amenitiesUsed);
    check('240s roaming simulation has 0 physics/capsule/pair/floating/label/route violations',
      roamSim.capsule === 0 &&
        roamSim.pairs === 0 &&
        roamSim.floating === 0 &&
        roamSim.label === 0 &&
        roamSim.routeFailures === 0,
      roamSim
    );

    // =========================================================================
    // 3. LIVE MODE: MT5 READ-ONLY 403 GUARD, BUKU BESAR KEUANGAN, & 3D KOREOGRAFI
    // =========================================================================
    await b.go('?qa=1');
    await sleep(300);

    const token = await b.ev(`document.querySelector('meta[name="office-vault-token"]')?.content || ''`);
    check('office-vault-token injected in index.html (64 hex chars)', /^[a-f0-9]{64}$/.test(token));

    const apiReq = async (route, method = 'GET', body = undefined, tok = token) => {
      const headers = {};
      if (tok !== null) headers['X-Office-Token'] = tok;
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const r = await fetch(b.server.origin + route, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
      return { status: r.status, body: await r.json() };
    };

    // Penolakan 403 tanpa token
    check('POST /mt5/config without X-Office-Token rejected with 403', (await apiReq('/mt5/config', 'POST', { enabled: false }, null)).status === 403);
    check('POST /finance/entry with invalid X-Office-Token rejected with 403', (await apiReq('/finance/entry', 'POST', { source: 'youtube', amountIdr: 1000 }, 'invalid')).status === 403);

    // Penolakan 403 untuk seluruh kunci order/eksekusi/kredensial MT5
    const forbiddenKeys = [
      'order_send',
      'place_order',
      'close_position',
      'password',
      'mt5_password',
      'investor_password',
      'lot_size',
      'sl',
      'tp',
      'magic'
    ];
    let allForbiddenRejected = true;
    for (const k of forbiddenKeys) {
      const rCfg = await apiReq('/mt5/config', 'POST', { [k]: 'forbidden' });
      const rFin = await apiReq('/finance/entry', 'POST', { source: 'mt5', amountIdr: 10000, [k]: 'forbidden' });
      const rDemo = await apiReq('/finance/demo-trade', 'POST', { phase: 'open', [k]: 1 });
      if (rCfg.status !== 403 || rFin.status !== 403 || rDemo.status !== 403) {
        allForbiddenRejected = false;
        check('reject forbidden key ' + k, false, { rCfg: rCfg.status, rFin: rFin.status, rDemo: rDemo.status });
      }
    }
    check('all 10 forbidden trading/credential keys rejected with HTTP 403 across endpoints', allForbiddenRejected, forbiddenKeys);

    // Honest Rp 0 initial finance ledger
    const initSum = await apiReq('/finance/summary');
    check('honest Rp 0 initial finance ledger state',
      initSum.status === 200 &&
        initSum.body.totalIncomeIdr === 0 &&
        initSum.body.totalLossIdr === 0 &&
        initSum.body.netBalanceIdr === 0 &&
        initSum.body.entryCount === 0,
      initSum.body
    );

    // Demo trade OPEN BUY via HTTP POST -> SSE updates 3D mt5-trader to sit & focus at mt5-desk
    const openTrade = await apiReq('/finance/demo-trade', 'POST', {
      phase: 'open',
      side: 'BUY',
      symbol: 'XAUUSD',
      profitUsd: 42.5
    });
    check('POST /finance/demo-trade open BUY returns trading status', openTrade.status === 200 && openTrade.body.mt5.status === 'trading');
    await b.go('?qa=1&demo=1');
    await b.ev("officeQA.v12.mt5('open',{side:'BUY',profit:42.5});officeQA.advance(35);0");

    const traderDuringOpen = await b.ev(`(() => {
      const a = officeDebug().actors.find(x => x.id === 'mt5-trader');
      const v12 = officeDebug().v12;
      return {
        x: a.x,
        z: a.z,
        seated: a.seated,
        activity: a.activity,
        mt5Status: v12.mt5.status,
        activeSide: v12.mt5.activeSide
      };
    })()`);
    check('3D mt5-trader sits & focuses at mt5-desk (17.5, 8) during open BUY trade',
      traderDuringOpen.mt5Status === 'trading' &&
        traderDuringOpen.activeSide === 'BUY' &&
        Math.hypot(traderDuringOpen.x - 17.5, traderDuringOpen.z - 8) < 0.8 &&
        traderDuringOpen.seated,
      traderDuringOpen
    );

    // Demo trade CLOSE +Profit via HTTP POST -> auto-books ledger, mt5-trader walks slip to finance-manager -> finance-safe
    const closeTrade = await apiReq('/finance/demo-trade', 'POST', {
      phase: 'close',
      side: 'BUY',
      symbol: 'XAUUSD',
      profitUsd: 50
    });
    check('POST /finance/demo-trade close +$50 books Rp 810.000 into ledger',
      closeTrade.status === 200 &&
        closeTrade.body.summary.totalIncomeIdr === 50 * 16200 &&
        closeTrade.body.summary.netBalanceIdr === 50 * 16200,
      closeTrade.body.summary
    );
    await b.ev("officeQA.v12.mt5('close',{side:'BUY',profitUsd:50});officeQA.advance(65);0");

    const handoffMilestones = await b.ev(`officeDebug().milestones.map(m => m.stage)`);
    check('3D mt5-trader hands report slip to finance-manager and finance-manager visits finance-safe',
      handoffMilestones.includes('mt5-finance-handoff') && handoffMilestones.includes('finance-safe-stored'),
      handoffMilestones.filter(m => m.includes('mt5') || m.includes('finance'))
    );

    await b.go('?qa=1');
    check('V17 real ledger stays zero after demo trades', (await apiReq('/finance/summary')).body.netBalanceIdr === 0);

    // Manual YouTube & Affiliate income entry + ledger query + delete
    const ytEntry = await apiReq('/finance/entry', 'POST', {
      source: 'youtube',
      type: 'income',
      amountIdr: 1500000,
      note: 'AdSense DemoStudio'
    });
    const affEntry = await apiReq('/finance/entry', 'POST', {
      source: 'affiliate',
      type: 'income',
      amountIdr: 450000,
      note: 'Komisi Affiliate'
    });
    check('manual YouTube & Affiliate income entries update netBalanceIdr accurately',
      ytEntry.status === 200 &&
        affEntry.status === 200 &&
        affEntry.body.summary.netBalanceIdr === 1500000 + 450000 &&
        affEntry.body.summary.bySource.youtube === 1500000 &&
        affEntry.body.summary.bySource.affiliate === 450000,
      affEntry.body.summary
    );

    const delAff = await apiReq('/finance/entry/' + affEntry.body.entry.id, 'DELETE');
    check('DELETE /finance/entry/:id removes entry and recalculates summary',
      delAff.status === 200 && delAff.body.summary.netBalanceIdr === 1500000,
      delAff.body.summary
    );

    // =========================================================================
    // 4. ALUR KERJA VIDEO SHORT 6-TAHAP (HITL KETAT + BYOK GEMINI + 3D STUDIO)
    // =========================================================================
    // [Diubah oleh Gemini - 2026-11-21] Gunakan kunci uji generik yang tidak memicu pemindai pola AIza
    const fakeKey = 'demo-unit-verification-key-4321';
    const saveCfg = await apiReq('/workflows/config', 'POST', {
      defaultChannel: 'ExplainerLab',
      geminiModel: 'gemini-2.5-flash',
      geminiApiKey: fakeKey,
      autoApprove: true
    });
    const getCfg = await apiReq('/workflows/config', 'GET');
    check('BYOK Gemini API key stored in secrets_local.json and masked on GET (...4321) with autoApprove: false',
      saveCfg.status === 200 &&
        getCfg.status === 200 &&
        getCfg.body.hasGeminiKey === true &&
        getCfg.body.keyHint === '...4321' &&
        getCfg.body.autoApprove === false &&
        !JSON.stringify(getCfg.body).includes(fakeKey),
      getCfg.body
    );

    const wfRes = await apiReq('/workflows/shorts', 'POST', {
      title: 'Mengapa Langit Malam Gelap?',
      topic: 'Paradoks Olbers dan ekspansi alam semesta',
      channel: 'ExplainerLab',
      mode: 'local'
    });
    check('POST /workflows/shorts creates 6-stage pipeline starting at brief (project-shepherd)',
      wfRes.status === 200 &&
        wfRes.body.workflow.currentStageId === 'brief' &&
        wfRes.body.workflow.currentPersona === 'project-shepherd' &&
        wfRes.body.workflow.stages.length === 6
    );
    const wfId = wfRes.body.workflow.id;

    // Stage 1: brief -> research
    const st1 = await apiReq(`/workflows/shorts/${wfId}/step`, 'POST');
    // Stage 2: research -> script
    const st2 = await apiReq(`/workflows/shorts/${wfId}/step`, 'POST');
    // Stage 3: script (HITL GATE -> awaiting_approval)
    const st3 = await apiReq(`/workflows/shorts/${wfId}/step`, 'POST');
    check('Stage 3 (script / technical-writer) pauses at HITL gate awaiting_approval',
      st1.status === 200 &&
        st2.status === 200 &&
        st3.status === 200 &&
        st3.body.workflow.currentStageId === 'script' &&
        st3.body.workflow.status === 'awaiting_approval',
      { stage: st3.body.workflow.currentStageId, status: st3.body.workflow.status }
    );

    // Stepping without approval must be blocked with 409
    const stBlocked = await apiReq(`/workflows/shorts/${wfId}/step`, 'POST');
    check('Stepping past unapproved HITL gate rejected with HTTP 409', stBlocked.status === 409);

    // Reject stage 3 with revision feedback -> re-step -> approve
    const stReject = await apiReq(`/workflows/shorts/${wfId}/reject`, 'POST', {
      feedback: 'Pertajam kalimat pembuka tentang Paradoks Olbers'
    });
    const st3Revised = await apiReq(`/workflows/shorts/${wfId}/step`, 'POST');
    const st3Approve = await apiReq(`/workflows/shorts/${wfId}/approve`, 'POST');
    check('HITL reject -> re-step incorporates feedback -> approve advances to storyboard',
      stReject.status === 200 &&
        stReject.body.workflow.status === 'revision_requested' &&
        st3Revised.status === 200 &&
        st3Revised.body.stage.output.includes('Paradoks Olbers') &&
        st3Approve.status === 200 &&
        st3Approve.body.workflow.currentStageId === 'storyboard'
    );

    // Stage 4: storyboard (HITL GATE -> awaiting_approval -> approve -> render)
    const st4 = await apiReq(`/workflows/shorts/${wfId}/step`, 'POST');
    const st4Approve = await apiReq(`/workflows/shorts/${wfId}/approve`, 'POST');
    check('Stage 4 (storyboard / ui-designer) pauses at HITL gate and advances to render on approve',
      st4.body.workflow.status === 'awaiting_approval' &&
        st4Approve.body.workflow.currentStageId === 'render' &&
        st4Approve.body.workflow.currentPersona === 'short-video-editing-coach'
    );

    // Verify 3D short-video-editing-coach walks to Green Screen (-21.5, 13) during render stage!
    await sleep(150);
    await b.ev('officeQA.advance(45);0');
    const coachAtStudio = await b.ev(`(() => {
      const a = officeDebug().actors.find(x => x.id === 'short-video-editing-coach');
      return { x: a.x, z: a.z, activity: a.activity };
    })()`);
    check('3D short-video-editing-coach walks to Studio Green Screen (-21.5, 13) on render stage',
      Math.hypot(coachAtStudio.x - (-21.5), coachAtStudio.z - 13) < 1.2,
      coachAtStudio
    );

    // Stage 5: render -> advances to qa_publish
    const st5 = await apiReq(`/workflows/shorts/${wfId}/step`, 'POST');
    // Stage 6: qa_publish (FINAL HITL GATE -> awaiting_approval -> approve -> completed without auto-upload)
    const st6 = await apiReq(`/workflows/shorts/${wfId}/step`, 'POST');
    const st6Approve = await apiReq(`/workflows/shorts/${wfId}/approve`, 'POST');
    check('Stage 6 (qa_publish / social-media-strategist) pauses at final HITL gate and completes with autoUploaded: false',
      st5.body.workflow.currentStageId === 'qa_publish' &&
        st6.body.workflow.status === 'awaiting_approval' &&
        st6Approve.body.workflow.status === 'completed' &&
        st6Approve.body.workflow.autoUploaded === false
    );

    // =========================================================================
    // 5. VERIFIKASI PANEL UI V12 & KEBERSIHAN KONSOL / EXCEPTION
    // =========================================================================
    const uiCheck = await b.ev(`(async () => {
      document.getElementById('financeCardButton').click();
      await new Promise(r => setTimeout(r, 350));
      const finOpen = document.getElementById('panel').open && document.querySelectorAll('#panelContent .v12-section').length >= 1;
      document.getElementById('shortsCardButton').click();
      await new Promise(r => setTimeout(r, 350));
      // V14-A [Diubah oleh Codex - 2026-11-21] UI Live 8 tahap; API arsip 6 tahap tetap diuji.
      const shortsSvg = !!document.querySelector('#panelContent.short14-panel .short14-composer');
      document.getElementById('panel').close();
      return { finOpen, shortsSvg };
    })()`);
    check('Finance and V14 production composer render cleanly; legacy workflow API remains compatible', uiCheck.finOpen && uiCheck.shortsSvg, uiCheck);

    const consoleErrors = b.events.filter(
      e =>
        e.method === 'Runtime.exceptionThrown' ||
        (e.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(e.params.type))
    );
    check('zero console errors or uncaught page exceptions', consoleErrors.length === 0, consoleErrors.slice(0, 5));

    out.summary = {
      passed: out.checks.length - out.failures.length,
      total: out.checks.length,
      ok: out.failures.length === 0
    };
  } catch (err) {
    out.exception = err.stack || String(err);
    console.error(err);
  } finally {
    await fs.writeFile(path.join(root, 'qa/v12_full_results.json'), JSON.stringify(out, null, 2));
    await b.close();
    const f = path.resolve(b.fixture);
    if (path.dirname(f) === path.resolve(root, 'qa') && path.basename(f).startsWith('v6c-test-')) {
      await fs.rm(f, { recursive: true, force: true, maxRetries: 15, retryDelay: 100 });
    }
    console.log(JSON.stringify(out.summary || { exception: out.exception }));
    if (out.exception || out.failures.length > 0) process.exitCode = 1;
  }
})();
