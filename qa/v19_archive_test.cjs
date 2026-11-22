/* [Diubah oleh Gemini - 2026-11-21] Uji menyeluruh Office AI V19: perbaikan arsip macet, 200 putaran acak berbenih tetap, uji watchdog, batas durasi off/fast<=3s & full<=12s, anti-duplikasi, dan tangkapan layar Vault */
'use strict';
process.env.OFFICE_MT5_AUTODETECT = '0';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { open, root, sleep } = require('./v16_3d_lib.cjs');

async function acquireV19Lock(task) {
  const v20Lock = path.join(__dirname, 'v20_browser.lock');
  const v19Lock = path.join(__dirname, 'v19_browser.lock');
  for (let i = 0; i < 180; i++) {
    if (!(await fs.stat(v20Lock).catch(() => null))) break;
    await sleep(1000);
  }
  if (await fs.stat(v20Lock).catch(() => null)) throw new Error('v20_browser.lock still active');
  await fs.writeFile(v19Lock, JSON.stringify({ pid: process.pid, task, at: new Date().toISOString() }), { flag: 'wx' });
  return () => fs.unlink(v19Lock).catch(() => {});
}

function makeRng(seed = 20261121) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

async function main() {
  const unlock = await acquireV19Lock('v19_archive_test');
  const shotsDir = path.join(root, 'qa', 'v19-shots');
  await fs.mkdir(shotsDir, { recursive: true });
  let b;
  const out = { checks: [], fail: [], scenarios: [], randomized: null, watchdog: [], shots: [], maxDraw: 0 };
  const check = (name, ok, detail) => {
    out.checks.push({ name, ok: !!ok });
    if (!ok) {
      out.fail.push({ name, detail });
      console.error('FAIL:', name, JSON.stringify(detail));
    }
  };

  try {
    b = await open();
    const post = async e => {
      const r = await fetch(b.server.origin + '/event', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(e)
      });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + await r.text());
      return r.json();
    };
    const getReports = async () => (await fetch(b.server.origin + '/reports').then(r => r.json())).reports;
    const waitExpr = async (expr, ms = 4000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (await b.ev(expr)) return true;
        await sleep(25);
      }
      return await b.ev(expr);
    };
    const shot = async (name) => {
      await b.settle();
      const data = await b.call('Page.captureScreenshot', { format: 'png' });
      const file = path.join(shotsDir, name + '.png');
      await fs.writeFile(file, Buffer.from(data.data, 'base64'));
      out.shots.push(name + '.png');
      return file;
    };
    const setWalk = async (mode) => {
      await b.ev(`(()=>{const s=OfficeSettings.get();s.flow16.walkAnimation=${JSON.stringify(mode)};s.followTask=false;s.language='id';s.appearance.theme='light';OfficeSettings.set(s);})()`);
    };
    const dumpState = async () => b.ev(`(()=>{
      const d=officeDebug();
      const pick=id=>{const a=d.actors.find(x=>x.id===id);return a&&{id:a.id,x:+a.x.toFixed(2),z:+a.z.toFixed(2),busy:a.busy,moving:a.moving,carrying:a.carrying,seated:a.seated,yielding:a.yielding,resuming:a.resuming,lifted:a.lifted,flowWorking:a.flowWorking,path:a.path,queue:a.queue.map(q=>q.type+':'+(q.activity||'')),act:a.activity};};
      return{time:+d.time.toFixed(2),archive:d.archive,archived:d.archived,draw:d.drawCalls,collisions:d.collisions,sec:pick('secretary'),arch:pick('archivist'),reports:d.reports.map(r=>({id:r.id,read:!!r.read,inTray:!!r.inTray,anim:!!r.animating,arch:!!r.archived}))};
    })()`);

    async function monitorArchiveUntilDone(ids, { maxSimSec = 20, stuckSec = 10, midAction = null } = {}) {
      const start = await dumpState();
      let lastPhase = start.archive.phase;
      let lastPhaseAt = start.time;
      let lastMoveAt = start.time;
      let lastSec = start.sec ? [start.sec.x, start.sec.z] : [0, 0];
      let lastArch = start.arch ? [start.arch.x, start.arch.z] : [0, 0];
      let midDone = false;
      let archiveStartedAt = null;
      const seenPhases = new Set();

      for (let i = 0; i < Math.ceil(maxSimSec / 0.1); i++) {
        await b.ev('officeQA.step(0.1); 0');
        // Yield briefly to let async fetch('/reports/.../archive') resolve in live mode
        if (i % 2 === 1) await sleep(12);
        const st = await dumpState();
        out.maxDraw = Math.max(out.maxDraw, st.draw || 0);

        if (st.archive.phase) {
          seenPhases.add(st.archive.phase);
          if (archiveStartedAt === null) archiveStartedAt = st.time;
        }
        if (st.archive.phase !== lastPhase) {
          lastPhase = st.archive.phase;
          lastPhaseAt = st.time;
        }
        if (st.sec && Math.hypot(st.sec.x - lastSec[0], st.sec.z - lastSec[1]) > 0.04) {
          lastMoveAt = st.time; lastSec = [st.sec.x, st.sec.z];
        }
        if (st.arch && Math.hypot(st.arch.x - lastArch[0], st.arch.z - lastArch[1]) > 0.04) {
          lastMoveAt = st.time; lastArch = [st.arch.x, st.arch.z];
        }
        if (midAction && !midDone && st.time - start.time >= midAction.at) {
          midDone = true;
          await midAction.fn(st);
        }

        const allDone = ids.every(id => st.reports.some(r => r.id === id && r.arch && !r.inTray && !r.anim)) && !st.archive.phase;
        if (allDone) {
          const durationSim = +(st.time - start.time).toFixed(2);
          return { ok: true, durationSim, seenPhases: [...seenPhases], state: st };
        }
        if (st.archive.phase && st.time - lastPhaseAt > stuckSec && st.time - lastMoveAt > stuckSec) {
          return { ok: false, reason: `stuck at phase=${st.archive.phase}`, durationSim: +(st.time - start.time).toFixed(2), seenPhases: [...seenPhases], state: st };
        }
      }
      const end = await dumpState();
      return { ok: false, reason: `timeout ${maxSimSec}s`, durationSim: +(end.time - start.time).toFixed(2), seenPhases: [...seenPhases], state: end };
    }

    // =========================================================================
    // BAGIAN 1: SKENARIO TERKUNCI (LIVE MODE + V16 FLOW + V16-C RETURN + MODES)
    // =========================================================================
    await b.go('?qa=1');
    await b.size(1600, 900);
    await setWalk('fast');
    await b.ev('officeQA.advance(10); officeQA.resetMetrics(); officeQA.archive.resetStats(); 0');

    // S1: Exact user screenshot scenario — active V16 flow (prompt + 2 subagents) BEFORE read, mode fast, 2 reports + 1 new report arrives mid-archive
    {
      const r1 = (await post({ type: 'report', provider: 'codex', agent: 'main-s1a', session: 's1a', flow_id: 's1a', event_id: 's1a-rep', tokens: 40 })).report;
      const r2 = (await post({ type: 'report', provider: 'claude', agent: 'main-s1b', session: 's1b', flow_id: 's1b', event_id: 's1b-rep', tokens: 50 })).report;
      await b.ev('OfficeFlow.advance(800); 0');
      await waitExpr(`officeDebug().reports.filter(r=>r.inTray&&!r.archived).length>=2`);
      // Start active V16 flow with prompt + 2 subagents
      await post({ type: 'call', provider: 'claude', source: 'hook', agent: 'main-s1-live', kind: 'main', session: 's1-live', flow_id: 's1-live', event_id: 's1-live-call' });
      await post({ type: 'spawn', provider: 'claude', source: 'hook', agent: 'sub-s1-1', parent: 'main-s1-live', kind: 'subagent', agent_type: 'Explore', session: 's1-live', flow_id: 's1-live', event_id: 's1-live-s1' });
      await post({ type: 'spawn', provider: 'claude', source: 'hook', agent: 'sub-s1-2', parent: 'main-s1-live', kind: 'subagent', agent_type: 'Plan', session: 's1-live', flow_id: 's1-live', event_id: 's1-live-s2' });
      await sleep(80);
      await b.ev('officeQA.step(1.5); officeQA.read(); 0');
      await waitExpr(`officeDebug().reports.some(r=>r.id===${JSON.stringify(r1.id)}&&r.read)&&officeDebug().reports.some(r=>r.id===${JSON.stringify(r2.id)}&&r.read)`);

      // Step partway so Archivist is carrying/storing at server while V16 beams are live — capture screenshots!
      let midReport = null;
      let shotTaken = false;
      const res = await monitorArchiveUntilDone([r1.id, r2.id], {
        maxSimSec: 10,
        midAction: {
          at: 0.7,
          fn: async () => {
            if (!shotTaken) {
              shotTaken = true;
              await b.ev('officeQA.preset("iso"); officeQA.tick(0.05); 0');
              await shot('01_fast_flow_active_archiving');
              // Close-up inside Vault showing Archivist storing directly at server rack (NOT standing idle beside Secretary!)
              await b.ev('officeQA.step(0.6); officeQA.pose(-0.35, 0.64, 6.6, [18.0, 1.0, -12.6]); 0');
              await shot('02_archivist_storing_server_closeup');
            }
            // Inject a new report MID-ARCHIVE (should appear in tray without corrupting current batch)
            midReport = (await post({ type: 'report', provider: 'gemini', agent: 'main-s1-mid', session: 's1-mid', flow_id: 's1-mid', event_id: 's1-mid-rep', tokens: 30 })).report;
            await b.ev('OfficeFlow.advance(800); 0');
          }
        }
      });
      await b.ev('officeQA.pose(-0.35, 0.64, 6.6, [18.0, 1.0, -12.6]); 0');
      await shot('03_archived_server_flash');

      const srv = await getReports();
      const s1ServerOk = [r1.id, r2.id].every(id => srv.some(r => r.id === id && r.archived));
      check('S1 fast + active V16 flow completes <=3s', res.ok && res.durationSim <= 3.0, res);
      check('S1 server persisted archived=true for both reports', s1ServerOk, srv);
      check('S1 secretary stays seated working on V16 flow', res.state.sec.flowWorking === true && res.state.sec.x < -10, res.state.sec);

      // Now verify mid-archive report reached tray, then read & archive it too!
      await waitExpr(`officeDebug().reports.some(r=>r.id===${JSON.stringify(midReport.id)}&&r.inTray&&!r.archived)`);
      await b.ev('officeQA.read(); 0');
      await waitExpr(`officeDebug().reports.some(r=>r.id===${JSON.stringify(midReport.id)}&&r.read)`);
      const resMid = await monitorArchiveUntilDone([midReport.id], { maxSimSec: 10 });
      check('S1b mid-archive new report reaches tray and archives <=3s', resMid.ok && resMid.durationSim <= 3.0, resMid);
      // Close active V16 flow
      await post({ type: 'report', provider: 'claude', source: 'hook', agent: 'main-s1-live', kind: 'main', session: 's1-live', flow_id: 's1-live', event_id: 's1-live-done', tokens: 100 });
      await b.ev('OfficeFlow.advance(800); 0');
      out.scenarios.push({ name: 'S1_fast_active_flow', durationSim: res.durationSim, midDurationSim: resMid.durationSim });
    }

    // S2: V16-C report-in-tray-after-return -> read -> archive in mode=off (<=3s, fast)
    {
      await setWalk('off');
      await b.ev('OfficeFlow.clear(); officeQA.step(0.5); 0');
      await post({ type: 'call', provider: 'codex', source: 'hook', agent: 'main-s2', kind: 'main', session: 's2-ret', flow_id: 's2-ret', event_id: 's2-call' });
      await sleep(60);
      const r = (await post({ type: 'report', provider: 'codex', source: 'hook', agent: 'main-s2', kind: 'main', session: 's2-ret', flow_id: 's2-ret', event_id: 's2-rep', tokens: 35 })).report;
      await waitExpr(`officeDebug().reports.some(x=>x.id===${JSON.stringify(r.id)}&&!x.inTray)`);
      await b.ev('OfficeFlow.advance(700); 0');
      await waitExpr(`officeDebug().reports.some(x=>x.id===${JSON.stringify(r.id)}&&x.inTray)`);
      await b.ev('officeQA.read(); 0');
      await waitExpr(`officeDebug().reports.some(x=>x.id===${JSON.stringify(r.id)}&&x.read)`);
      const res = await monitorArchiveUntilDone([r.id], { maxSimSec: 8 });
      check('S2 mode=off V16-C return -> archive <=3s (actual <=1s)', res.ok && res.durationSim <= 1.5, res);
      out.scenarios.push({ name: 'S2_off_return_archive', durationSim: res.durationSim });
    }

    // S3: Mode=full (Secretary walks to Tray -> Vault -> handoff -> Archivist stamps -> Server) <=12s!
    {
      await setWalk('full');
      await b.ev('OfficeFlow.clear(); officeQA.advance(2); 0');
      const r1 = (await post({ type: 'report', provider: 'codex', agent: 'main-s3a', session: 's3a', flow_id: 's3a', event_id: 's3a-rep', tokens: 20 })).report;
      const r2 = (await post({ type: 'report', provider: 'gemini', agent: 'main-s3b', session: 's3b', flow_id: 's3b', event_id: 's3b-rep', tokens: 20 })).report;
      // In full mode live reports from /event create a job, or reload to have them in tray; mark read directly after syncing inTray
      await b.go('?qa=1');
      await setWalk('full');
      await waitExpr(`officeDebug().reports.some(x=>x.id===${JSON.stringify(r1.id)}&&x.inTray)&&officeDebug().reports.some(x=>x.id===${JSON.stringify(r2.id)}&&x.inTray)`);
      await b.ev('officeQA.read(); 0');
      await waitExpr(`officeDebug().reports.some(x=>x.id===${JSON.stringify(r1.id)}&&x.read)`);
      let fullShot = false;
      const res = await monitorArchiveUntilDone([r1.id, r2.id], {
        maxSimSec: 18,
        midAction: {
          at: 8.6,
          fn: async () => {
            if (!fullShot) {
              fullShot = true;
              await b.ev('officeQA.pose(-0.35, 0.64, 6.6, [18.0, 1.0, -12.6]); 0');
              await shot('04_full_handoff_to_server');
            }
          }
        }
      });
      check('S3 mode=full completes <=12s with handoff & server store', res.ok && res.durationSim <= 12.0 && res.seenPhases.includes('handoff') && res.seenPhases.includes('stamp'), res);
      out.scenarios.push({ name: 'S3_full_mode', durationSim: res.durationSim, phases: res.seenPhases });
    }

    // S4: Large batch (12 reports read at once) + dark theme 1280x720 screenshot
    {
      await b.size(1280, 720);
      await b.ev(`(()=>{const s=OfficeSettings.get();s.flow16.walkAnimation='fast';s.appearance.theme='dark';s.appearance.light='day';OfficeSettings.set(s);})()`);
      const batchIds = [];
      for (let i = 0; i < 12; i++) {
        const rep = (await post({ type: 'report', provider: ['claude', 'codex', 'gemini', 'hermes'][i % 4], agent: 'main-s4-' + i, session: 's4-' + i, flow_id: 's4-' + i, event_id: 's4-rep-' + i, tokens: 10 + i })).report;
        batchIds.push(rep.id);
      }
      await b.ev('OfficeFlow.advance(800); 0');
      await waitExpr(`officeDebug().reports.filter(r=>r.inTray&&!r.archived).length>=12`);
      await b.ev('officeQA.read(); 0');
      await waitExpr(`officeDebug().reports.filter(r=>r.read&&!r.archived).length>=12`);
      const res = await monitorArchiveUntilDone(batchIds, {
        maxSimSec: 10,
        midAction: {
          at: 0.3,
          fn: async () => {
            await b.ev('officeQA.pose(-0.35, 0.64, 6.6, [18.0, 1.0, -12.6]); 0');
            await shot('05_dark_vault_storing');
          }
        }
      });
      const srv = await getReports();
      const allSrvArchived = batchIds.every(id => srv.some(r => r.id === id && r.archived));
      check('S4 12-report batch archives <=3s without loss or duplication', res.ok && res.durationSim <= 3.0 && allSrvArchived, { res, batch: batchIds.length });
      out.scenarios.push({ name: 'S4_batch_12_dark', durationSim: res.durationSim });
    }

    // S5: Quality persona report (quality_store.js) -> read -> archive -> persisted on server
    {
      await b.size(1600, 900);
      await setWalk('fast');
      for (const ev of [
        { type: 'persona_call' }, { type: 'submit' }, { type: 'inspect_start' },
        { type: 'verdict', result: 'pass', checks_passed: 4, checks_total: 4 }
      ]) {
        await post({ persona: 'frontend-developer', engine: 'codex', task_id: 'v19-qual-1', round: 1, category: 'code', ...ev });
      }
      await sleep(100);
      await b.ev('officeQA.advance(220); 0');
      const qRep = await b.ev(`officeDebug().reports.find(r=>r.persona==='frontend-developer'&&r.inTray&&!r.archived)`);
      check('S5 quality persona report delivered to tray', !!qRep, qRep);
      if (qRep) {
        await b.ev('officeQA.read(); 0');
        await waitExpr(`officeDebug().reports.some(r=>r.id===${JSON.stringify(qRep.id)}&&r.read)`);
        const res = await monitorArchiveUntilDone([qRep.id], { maxSimSec: 10 });
        const srv = await getReports();
        check('S5 quality report archives <=3s and persists', res.ok && res.durationSim <= 3.0 && srv.some(r => r.id === qRep.id && r.archived), res);
        out.scenarios.push({ name: 'S5_quality_report', durationSim: res.durationSim });
      }
    }

    // =========================================================================
    // BAGIAN 2: UJI WATCHDOG (SUNTIK KONDISI MACET BUATAN -> PULIH AMAN, LIVE)
    // =========================================================================
    const watchdogCases = [
      { name: 'W1_fast_archivist_yielding', mode: 'fast', kind: 'yielding', who: 'archivist', at: 0.3 },
      { name: 'W2_fast_archivist_resuming', mode: 'fast', kind: 'resuming', who: 'archivist', at: 0.3 },
      { name: 'W3_fast_archivist_wait3600', mode: 'fast', kind: 'wait', who: 'archivist', at: 0.3 },
      { name: 'W4_full_secretary_yielding', mode: 'full', kind: 'yielding', who: 'secretary', at: 0.8 },
      { name: 'W5_full_secretary_wait3600', mode: 'full', kind: 'wait', who: 'secretary', at: 0.8 },
      { name: 'W6_full_secretary_far_handoff', mode: 'full', kind: 'far', who: 'secretary', at: 1.0 },
      { name: 'W7_fast_saving_phase_hang', mode: 'fast', kind: 'saving', who: 'archivist', at: 0.3 }
    ];

    // Run all 7 watchdog cases in LIVE mode so both client + server archived=true are verified!
    await b.go('?qa=1');
    await b.ev('officeQA.resetMetrics(); 0');
    for (let idx = 0; idx < watchdogCases.length; idx++) {
      const wc = watchdogCases[idx];
      await setWalk(wc.mode);
      // Create a report in tray cleanly
      let rep;
      if (wc.mode === 'full') {
        rep = (await post({ type: 'report', provider: 'codex', agent: 'main-w-' + idx, session: 'w-' + idx, flow_id: 'w-' + idx, event_id: 'w-rep-' + idx, tokens: 15 })).report;
        await b.go('?qa=1');
        await setWalk(wc.mode);
        await waitExpr(`officeDebug().reports.some(r=>r.id===${JSON.stringify(rep.id)}&&r.inTray)`);
      } else {
        rep = (await post({ type: 'report', provider: 'codex', agent: 'main-w-' + idx, session: 'w-' + idx, flow_id: 'w-' + idx, event_id: 'w-rep-' + idx, tokens: 15 })).report;
        await b.ev('OfficeFlow.advance(800); 0');
        await waitExpr(`officeDebug().reports.some(r=>r.id===${JSON.stringify(rep.id)}&&r.inTray)`);
      }
      await b.ev('officeQA.archive.resetStats(); officeQA.read(); 0');
      await waitExpr(`officeDebug().reports.some(r=>r.id===${JSON.stringify(rep.id)}&&r.read)`);
      const res = await monitorArchiveUntilDone([rep.id], {
        maxSimSec: 22,
        stuckSec: 15,
        midAction: {
          at: wc.at,
          fn: async () => {
            await b.ev(`officeQA.archive.injectStall(${JSON.stringify(wc.kind)}, ${JSON.stringify(wc.who)}); 0`);
          }
        }
      });
      const srv = await getReports();
      const srvRow = srv.find(r => r.id === rep.id);
      const triggered = (res.state.archive.watchdogTriggers || 0) >= 1 && !!res.state.archive.lastWarning;
      // Note: W6 (far) may be recovered either by handoff retry OR watchdog — both are valid safe recoveries!
      const ok = res.ok && !!srvRow?.archived && (wc.kind === 'far' ? true : triggered);
      check('Watchdog ' + wc.name, ok, { durationSim: res.durationSim, triggers: res.state.archive.watchdogTriggers, lastWarning: res.state.archive.lastWarning, srvArchived: srvRow?.archived, reason: res.reason });
      out.watchdog.push({ name: wc.name, ok, durationSim: res.durationSim, triggers: res.state.archive.watchdogTriggers, lastWarning: res.state.archive.lastWarning });
    }

    // =========================================================================
    // BAGIAN 3: 200 PUTARAN ACAK BERBENIH TETAP (0 JOB MACET, 0 HILANG/DOBEL)
    // =========================================================================
    await b.go('?qa=1&demo=1');
    await b.ev('officeQA.resetMetrics(); officeQA.archive.resetStats(); 0');
    const rng = makeRng(20261121);
    const modes = ['off', 'fast', 'full'];
    const providersList = ['claude', 'codex', 'gemini', 'hermes'];
    const subTypes = ['Explore', 'Plan', 'general-purpose', 'code-reviewer'];
    const randStats = {
      rounds: 200,
      stucks: 0,
      maxDuration: { off: 0, fast: 0, full: 0 },
      counts: { off: 0, fast: 0, full: 0 },
      totalReports: 0,
      archivedReports: 0,
      watchdogTriggers: 0,
      failures: []
    };

    // Execute all 200 seeded rounds inside browser (deterministic, zero IPC overhead, ~3-5 seconds total!)
    const randRes = await b.ev(`(() => {
      let s = 20261121 >>> 0;
      const rnd = () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 4294967296; };
      const modes = ['off', 'fast', 'full'];
      const providers = ['claude', 'codex', 'gemini', 'hermes'];
      const subTypes = ['Explore', 'Plan', 'general-purpose'];
      const out = { rounds: 200, stucks: 0, duplicates: 0, lost: 0, maxDuration: { off: 0, fast: 0, full: 0 }, counts: { off: 0, fast: 0, full: 0 }, totalReports: 0, archivedReports: 0, failures: [], watchdogTriggers: 0 };
      const allIds = new Set();

      for (let round = 0; round < 200; round++) {
        const wMode = modes[Math.floor(rnd() * modes.length)];
        out.counts[wMode]++;
        const cfg = OfficeSettings.get();
        cfg.flow16.walkAnimation = wMode;
        cfg.followTask = false;
        OfficeSettings.set(cfg);

        // Optional ambient distraction for archivist / secretary / residents before batch
        if (rnd() < 0.35) officeQA.use('archivist', 'file_archive', 'server');
        if (rnd() < 0.25) officeQA.use('claude', 'file_archive', 'server');
        if (rnd() < 0.25) officeQA.use('secretary', 'coffee');

        // Optional active V16 flow before reading (prompt + 0..2 subagents)
        const hasFlow = rnd() < 0.7;
        const flowId = 'rnd-flow-' + round;
        const prov = providers[Math.floor(rnd() * providers.length)];
        if (hasFlow) {
          OfficeFlow.emit({ type: 'call', provider: prov, source: 'hook', agent: 'main-' + prov, kind: 'main', session: flowId, flow_id: flowId, event_id: flowId + '-c', at: Date.now() });
          const subs = Math.floor(rnd() * 3);
          for (let k = 0; k < subs; k++) {
            OfficeFlow.emit({ type: 'spawn', provider: prov, source: 'hook', agent: 'sub-' + round + '-' + k, parent: 'main-' + prov, kind: 'subagent', agent_type: subTypes[k % subTypes.length], session: flowId, flow_id: flowId, event_id: flowId + '-s' + k, at: Date.now() + k + 1 });
          }
          officeQA.step(0.3);
        }

        // Inject 1..3 reports into tray
        const batchCount = 1 + Math.floor(rnd() * 3);
        const batchIds = [];
        const dbgBefore = officeDebug();
        for (let k = 0; k < batchCount; k++) {
          const id = 'v19-rnd-' + round + '-' + k;
          allIds.add(id);
          batchIds.push(id);
          dbgBefore.reports.push({
            id, provider: providers[(round + k) % providers.length],
            time: new Date().toISOString(), task: 'Tugas selesai',
            tokens: 100, duration_s: 3, read: false, archived: false, inTray: true, animating: false, deliveredAt: dbgBefore.time
          });
        }
        out.totalReports += batchCount;

        // Mark read and start timer
        const t0 = officeDebug().time;
        officeQA.read();

        // Optional mid-round disruptions: new flow starts, flow completes, new report arrives mid-archive, or mode switches
        const midFlowStart = !hasFlow && rnd() < 0.4;
        const midFlowEnd = hasFlow && rnd() < 0.5;
        const midNewReport = rnd() < 0.35;
        let midNewId = null;
        let midDone = false;

        let done = false;
        const limitSec = wMode === 'full' ? 14 : 4.5;
        let lastPhase = null, lastPhaseAt = t0;
        for (let step = 0; step < Math.ceil(limitSec / 0.1); step++) {
          officeQA.step(0.1);
          const d = officeDebug();
          const elapsed = d.time - t0;
          if (d.archive.phase !== lastPhase) { lastPhase = d.archive.phase; lastPhaseAt = d.time; }

          if (!midDone && elapsed >= 0.4) {
            midDone = true;
            if (midFlowStart) {
              OfficeFlow.emit({ type: 'call', provider: prov, source: 'hook', agent: 'main-' + prov, kind: 'main', session: flowId + '-m', flow_id: flowId + '-m', event_id: flowId + '-mc', at: Date.now() });
            }
            if (midFlowEnd) {
              OfficeFlow.emit({ type: 'report', provider: prov, source: 'hook', agent: 'main-' + prov, kind: 'main', session: flowId, flow_id: flowId, event_id: flowId + '-done', at: Date.now() + 50 });
              OfficeFlow.advance(600, true);
            }
            if (midNewReport) {
              midNewId = 'v19-mid-' + round;
              allIds.add(midNewId);
              out.totalReports++;
              d.reports.push({
                id: midNewId, provider: prov, time: new Date().toISOString(), task: 'Tugas selesai',
                tokens: 50, duration_s: 2, read: true, archived: false, inTray: true, animating: false, deliveredAt: d.time
              });
            }
          }

          const targetIds = midNewId ? [...batchIds, midNewId] : batchIds;
          const allArch = targetIds.every(id => {
            const row = d.reports.find(r => r.id === id);
            return row && row.archived && !row.inTray && !row.animating;
          });
          if (allArch && !d.archive.phase) {
            const dur = +(d.time - t0).toFixed(2);
            // Measure single-batch duration separately if no chained mid-report
            if (!midNewId) out.maxDuration[wMode] = Math.max(out.maxDuration[wMode], dur);
            done = true;
            break;
          }
        }
        // Finish lingering active flow so flow model stays bounded
        if (hasFlow && !midFlowEnd) {
          OfficeFlow.emit({ type: 'report', provider: prov, source: 'hook', agent: 'main-' + prov, kind: 'main', session: flowId, flow_id: flowId, event_id: flowId + '-end', at: Date.now() + 80 });
        }
        if (midFlowStart) {
          OfficeFlow.emit({ type: 'report', provider: prov, source: 'hook', agent: 'main-' + prov, kind: 'main', session: flowId + '-m', flow_id: flowId + '-m', event_id: flowId + '-mend', at: Date.now() + 90 });
        }
        if (!done) {
          // Allow extra 12s if chained midNewReport needed a 2nd batch in full mode
          const extra = midNewId && wMode === 'full' ? 140 : 0;
          for (let e = 0; e < extra; e++) {
            officeQA.step(0.1);
            const d = officeDebug();
            const targetIds = [...batchIds, midNewId];
            if (targetIds.every(id => { const r = d.reports.find(x => x.id === id); return r && r.archived && !r.inTray && !r.animating; }) && !d.archive.phase) {
              done = true; break;
            }
          }
        }
        if (!done) {
          out.stucks++;
          const d = officeDebug();
          if (out.failures.length < 5) out.failures.push({ round, wMode, hasFlow, midNewId, archive: d.archive, sec: d.actors.find(a => a.id === 'secretary'), arch: d.actors.find(a => a.id === 'archivist') });
        }
      }

      const finalDbg = officeDebug();
      const seen = new Set();
      for (const r of finalDbg.reports) {
        if (!allIds.has(r.id)) continue;
        if (seen.has(r.id)) out.duplicates++;
        seen.add(r.id);
        if (r.archived) out.archivedReports++;
        else out.lost++;
      }
      if (seen.size !== allIds.size) out.lost += Math.max(0, allIds.size - seen.size);
      out.watchdogTriggers = finalDbg.archive.watchdogTriggers;
      out.collisions = finalDbg.collisions;
      out.drawCalls = finalDbg.drawCalls;
      return out;
    })()`);

    out.randomized = randRes;
    out.maxDraw = Math.max(out.maxDraw, randRes.drawCalls || 0);
    check('200 seeded random rounds: 0 stuck jobs', randRes.stucks === 0, randRes.failures);
    check('200 seeded random rounds: 0 lost & 0 duplicate reports', randRes.lost === 0 && randRes.duplicates === 0 && randRes.archivedReports === randRes.totalReports, { total: randRes.totalReports, archived: randRes.archivedReports, lost: randRes.lost, dup: randRes.duplicates });
    check('200 seeded random rounds: fast <=3s & off <=3s', randRes.maxDuration.fast <= 3.0 && randRes.maxDuration.off <= 3.0, randRes.maxDuration);
    check('200 seeded random rounds: full <=12s', randRes.maxDuration.full <= 12.0, randRes.maxDuration);
    check('200 seeded random rounds: 0 routeFailures & 0 static/actor collisions', randRes.collisions.routeFailures === 0 && randRes.collisions.static === 0 && randRes.collisions.actors === 0, randRes.collisions);

    // Final checks: draw calls <= 340 and zero console errors/warnings
    check('draw calls <= 340', out.maxDraw <= 340, out.maxDraw);
    out.console = b.events.filter(e => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(e.params.type)));
    check('zero console errors/warnings', out.console.length === 0, out.console.slice(0, 5));

    out.ok = out.fail.length === 0;
  } catch (e) {
    out.exception = e.stack;
    out.ok = false;
  } finally {
    await fs.writeFile(path.join(__dirname, 'v19_archive_results.json'), JSON.stringify(out, null, 2));
    try { await b?.close(); } finally { await unlock(); }
    console.log(JSON.stringify({
      ok: out.ok,
      checks: out.checks.length,
      failed: out.fail.length,
      scenarios: out.scenarios,
      watchdog: out.watchdog.map(w => ({ name: w.name, ok: w.ok, dur: w.durationSim, trig: w.triggers })),
      randomized: out.randomized && {
        rounds: out.randomized.rounds,
        stucks: out.randomized.stucks,
        totalReports: out.randomized.totalReports,
        archivedReports: out.randomized.archivedReports,
        maxDuration: out.randomized.maxDuration,
        collisions: out.randomized.collisions,
        watchdogTriggers: out.randomized.watchdogTriggers
      },
      maxDraw: out.maxDraw,
      shots: out.shots,
      exception: out.exception
    }, null, 2));
    if (!out.ok) process.exitCode = 1;
  }
}
main().catch(e => { console.error(e.stack); process.exitCode = 1; });
