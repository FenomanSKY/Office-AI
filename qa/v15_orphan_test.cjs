// [Diubah oleh Gemini - 2026-11-21] Uji agen yatim (orphan) V15: penutupan normal, crash paksa (hanya PID server), kegagalan taskkill, dan logika dialog konfirmasi keluar (tanpa menjalankan OfficeAI.exe / tanpa kuota API)
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFile } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const beforeMode = process.argv.includes('--before');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function execFileAsync(exe, args, opts = {}) {
  return new Promise(resolve => {
    execFile(exe, args, { windowsHide: true, timeout: 15000, ...opts }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err?.code ?? 0, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

async function listMarkedProcesses(marker) {
  if (process.platform === 'win32') {
    const ps = `$m='${marker}'; Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.Contains($m) } | Select-Object ProcessId,Name | ConvertTo-Json -Compress`;
    const r = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', ps]);
    let txt = r.stdout.trim();
    // [Diubah oleh Codex - 2026-11-21] Some sandboxes deny WMI; inspect only exact synthetic markers.
    if ((!r.ok || (!txt && r.stderr.trim())) && process.env.OFFICE_PYTHON) {
      const native = await execFileAsync(process.env.OFFICE_PYTHON,
        ['-I', path.join(root, 'qa/v17_process_probe.py'), marker]);
      if (!native.ok) throw new Error('QA process enumeration unavailable');
      txt = native.stdout.trim();
    }
    if (!txt) return [];
    try {
      const parsed = JSON.parse(txt);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  }
  const r = await execFileAsync('ps', ['-eo', 'pid,args']);
  const out = [];
  for (const line of r.stdout.split(/\r?\n/)) {
    if (line.includes(marker) && !line.includes('ps -eo')) {
      const m = line.trim().match(/^(\d+)\s+/);
      if (m) out.push({ ProcessId: Number(m[1]), Name: 'proc' });
    }
  }
  return out;
}

async function cleanupMarkedProcesses(marker) {
  const procs = await listMarkedProcesses(marker);
  for (const p of procs) {
    const pid = Number(p.ProcessId);
    if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) continue;
    try {
      if (process.platform === 'win32') {
        const killed = await execFileAsync('taskkill.exe', ['/PID', String(pid), '/F']);
        if (!killed.ok) process.kill(pid, 'SIGKILL');
      } else {
        process.kill(pid, 'SIGKILL');
      }
    } catch {}
  }
}

async function waitForCount(marker, predicate, timeoutMs = 5000) {
  const start = Date.now();
  let last = [];
  while (Date.now() - start <= timeoutMs) {
    last = await listMarkedProcesses(marker);
    if (predicate(last.length)) {
      return { matched: true, count: last.length, procs: last, elapsedMs: Date.now() - start };
    }
    await sleep(200);
  }
  return { matched: false, count: last.length, procs: last, elapsedMs: Date.now() - start };
}

async function createThreeLevelFakeAgent(dir, marker) {
  const jsPath = path.join(dir, `fake_agent_${marker}.js`);
  const script = `'use strict';
const { spawn } = require('node:child_process');
const level = Number(process.env.FAKE_AGENT_LEVEL || '1');
const marker = ${JSON.stringify(marker)};
console.log('FAKE_READY_L' + level + ' pid=' + process.pid);
if (level < 3) {
  const child = spawn(process.execPath, [__filename, '--marker=' + marker, '--level=' + (level + 1)], {
    env: { ...process.env, FAKE_AGENT_LEVEL: String(level + 1) },
    stdio: 'inherit',
    windowsHide: true
  });
  child.on('error', () => {});
}
setInterval(() => {}, 5000);
`;
  await fs.writeFile(jsPath, script, 'utf8');
  if (process.platform === 'win32') {
    const cmdPath = path.join(dir, `fake_agent_${marker}.cmd`);
    await fs.writeFile(cmdPath, `@echo off\r\n"${process.execPath}" "${jsPath}" --marker=${marker} --level=1 %*\r\n`, 'utf8');
    return cmdPath;
  }
  const shPath = path.join(dir, `fake_agent_${marker}.sh`);
  await fs.writeFile(shPath, `#!/bin/sh\nexec "${process.execPath}" "${jsPath}" --marker=${marker} --level=1 "$@"\n`, 'utf8');
  await fs.chmod(shPath, 0o755);
  return shPath;
}

async function spawnServerHarness(dataDir, extraEnv = {}) {
  await fs.mkdir(dataDir, { recursive: true });
  const code = `
'use strict';
const { startServer } = require('./embedded_server.js');
(async () => {
  const srv = await startServer({
    port: 0,
    maxPort: 0,
    collector: false,
    allowDriveScan: false,
    dataDir: process.env.OFFICE_AI_DATA_DIR
  });
  console.log('HARNESS_READY ' + JSON.stringify({ origin: srv.origin, port: srv.port, pid: process.pid }));
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', async chunk => {
    if (String(chunk).includes('CLOSE')) {
      try { await srv.close(); console.log('HARNESS_CLOSED'); } catch (e) { console.error(e); }
      process.exit(0);
    }
  });
})();
`;
  const child = spawn(process.execPath, ['-e', code], {
    cwd: root,
    env: { ...process.env, OFFICE_AI_DATA_DIR: dataDir, OFFICE_COLLECTOR: '0', OFFICE_AI_NO_DRIVE_SCAN: '1', ...extraEnv },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  });
  let info = null;
  let stderr = '';
  let closedDone = false;
  let resolveClose = null;
  const closePromise = new Promise(r => { resolveClose = r; });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Harness timeout: ' + stderr)), 12000);
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.stdout.on('data', d => {
      const text = d.toString();
      const m = text.match(/HARNESS_READY (\{[^\r\n]+\})/);
      if (m && !info) {
        info = JSON.parse(m[1]);
        clearTimeout(timer);
        resolve();
      }
      if (text.includes('HARNESS_CLOSED')) {
        closedDone = true;
        resolveClose?.();
      }
    });
    child.on('exit', () => {
      clearTimeout(timer);
      resolveClose?.();
      if (!info) reject(new Error('Harness exited early: ' + stderr));
    });
  });

  const html = await fetch(info.origin + '/').then(r => r.text());
  const token = html.match(/name="office-vault-token"\s+content="([^"]+)"/)?.[1] || '';

  return {
    ...info,
    token,
    child,
    async api(route, method = 'GET', body) {
      const headers = { 'X-Office-Token': token };
      const init = { method, headers };
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
      const res = await fetch(info.origin + route, init);
      return { status: res.status, body: await res.json().catch(() => null) };
    },
    async gracefulClose() {
      try { child.stdin.write('CLOSE\n'); } catch {}
      await Promise.race([closePromise, sleep(8000)]);
      return closedDone;
    },
    async hardKillServerOnly() {
      // Intentionally kill ONLY the server PID (NO /T) to simulate Task Manager crash!
      if (process.platform === 'win32') {
        const killed = await execFileAsync('taskkill.exe', ['/PID', String(info.pid), '/F']);
        if (!killed.ok) child.kill('SIGKILL');
      } else {
        try { process.kill(info.pid, 'SIGKILL'); } catch {}
      }
      await Promise.race([closePromise, sleep(2000)]);
    }
  };
}

async function run() {
  const out = { mode: beforeMode ? 'before' : 'after', ok: false, checks: [], failed: [], measurements: {} };
  const check = (name, pass, detail = null) => {
    const rec = { name, pass: Boolean(pass) };
    if (detail !== null) rec.detail = detail;
    out.checks.push(rec);
    if (!pass) {
      out.failed.push(rec);
      console.error('[FAIL]', name, JSON.stringify(detail));
    }
  };

  const tmpDir = await fs.mkdtemp(path.join(root, 'qa', 'v15-orphan-'));
  const workDir = path.join(tmpDir, 'work');
  await fs.mkdir(workDir, { recursive: true });
  const markers = [];

  try {
    // =========================================================================
    // CASE A: Normal server.close() -> 0 orphans <= 5s & run marked interrupted
    // =========================================================================
    const markA = 'OFFICE_ORPHAN_A_' + crypto.randomBytes(4).toString('hex');
    markers.push(markA);
    const exeA = await createThreeLevelFakeAgent(tmpDir, markA);
    const dataA = path.join(tmpDir, 'data-a');
    const hA = await spawnServerHarness(dataA);
    await hA.api('/prompt/config', 'POST', { executableOverrides: { codex: exeA } });
    const startA = await hA.api('/prompt/run', 'POST', {
      agentId: 'codex',
      prompt: 'Long running orphan test A',
      cwd: workDir,
      mode: 'live',
      fullAccess: false
    });
    const upA = await waitForCount(markA, n => n >= 3, 6000);
    const activeA = await hA.api('/runtime/active');
    await hA.gracefulClose();
    const downA = await waitForCount(markA, n => n === 0, 5000);
    const savedA = JSON.parse(await fs.readFile(path.join(dataA, 'prompt_runs.json'), 'utf8').catch(() => '{"runs":[]}'));
    const runRecA = (savedA.runs || []).find(r => r.id === startA.body?.run?.id);
    out.measurements.caseA_normalClose = {
      spawnedCount: upA.count,
      survivingAfter5s: downA.count,
      elapsedMs: downA.elapsedMs,
      savedStatus: runRecA?.status || null,
      runtimeActiveStatus: activeA.status,
      runtimeActiveCount: activeA.body?.activeCount ?? null
    };
    check(
      'Case A: Normal server.close() leaves 0 orphan processes within <=5s and marks run interrupted',
      upA.count >= 3 && downA.count === 0 && runRecA?.status === 'interrupted',
      out.measurements.caseA_normalClose
    );

    // =========================================================================
    // CASE B: Hard crash (kill ONLY server PID, NO /T) -> 0 orphans <= 5s
    // =========================================================================
    const markB = 'OFFICE_ORPHAN_B_' + crypto.randomBytes(4).toString('hex');
    markers.push(markB);
    const exeB = await createThreeLevelFakeAgent(tmpDir, markB);
    const dataB = path.join(tmpDir, 'data-b');
    const hB = await spawnServerHarness(dataB);
    await hB.api('/prompt/config', 'POST', { executableOverrides: { codex: exeB } });
    const startB = await hB.api('/prompt/run', 'POST', {
      agentId: 'codex',
      prompt: 'Long running orphan test B (hard crash)',
      cwd: workDir,
      mode: 'live',
      fullAccess: false
    });
    const upB = await waitForCount(markB, n => n >= 3, 6000);
    await hB.hardKillServerOnly();
    const downB = await waitForCount(markB, n => n === 0, 5000);

    // Reopen server on dataB to verify crashed "running" entry is recovered as "interrupted"
    let recoveredStatus = null;
    if (!beforeMode) {
      const hB2 = await spawnServerHarness(dataB);
      const runsB2 = await hB2.api('/prompt/runs');
      recoveredStatus = (runsB2.body?.runs || []).find(r => r.id === startB.body?.run?.id)?.status || null;
      await hB2.gracefulClose();
    }
    out.measurements.caseB_hardCrash = {
      spawnedCount: upB.count,
      survivingAfter5s: downB.count,
      elapsedMs: downB.elapsedMs,
      recoveredStatus
    };
    check(
      'Case B: Hard kill (server PID only, no /T) leaves 0 orphan processes within <=5s via Job Object kill-on-close',
      upB.count >= 3 && downB.count === 0 && (beforeMode || recoveredStatus === 'interrupted'),
      out.measurements.caseB_hardCrash
    );

    // =========================================================================
    // CASE C: taskkill failure resilience -> 0 orphans <= 5s
    // =========================================================================
    const markC = 'OFFICE_ORPHAN_C_' + crypto.randomBytes(4).toString('hex');
    markers.push(markC);
    const exeC = await createThreeLevelFakeAgent(tmpDir, markC);
    const dataC = path.join(tmpDir, 'data-c');
    const hC = await spawnServerHarness(dataC, { OFFICE_TEST_FAIL_TASKKILL: '1' });
    await hC.api('/prompt/config', 'POST', { executableOverrides: { codex: exeC } });
    await hC.api('/prompt/run', 'POST', {
      agentId: 'codex',
      prompt: 'Long running orphan test C (taskkill fail)',
      cwd: workDir,
      mode: 'live',
      fullAccess: false
    });
    const upC = await waitForCount(markC, n => n >= 3, 6000);
    await hC.gracefulClose();
    const downC = await waitForCount(markC, n => n === 0, 5000);
    out.measurements.caseC_taskkillFail = {
      spawnedCount: upC.count,
      survivingAfter5s: downC.count,
      elapsedMs: downC.elapsedMs
    };
    check(
      'Case C: Even when taskkill fails, Job Object / stdin-close cleanup leaves 0 orphan processes within <=5s',
      upC.count >= 3 && downC.count === 0,
      out.measurements.caseC_taskkillFail
    );

    // =========================================================================
    // CASE D: /runtime/active + Quit confirmation guard logic (mock IPC, no Electron EXE)
    // =========================================================================
    if (!beforeMode) {
      const quitGuard = require(path.join(root, 'quit_guard.js'));
      const markD = 'OFFICE_ORPHAN_D_' + crypto.randomBytes(4).toString('hex');
      markers.push(markD);
      const exeD = await createThreeLevelFakeAgent(tmpDir, markD);
      const dataD = path.join(tmpDir, 'data-d');
      const hD = await spawnServerHarness(dataD);
      await hD.api('/prompt/config', 'POST', { executableOverrides: { codex: exeD } });
      await hD.api('/prompt/run', 'POST', {
        agentId: 'codex',
        prompt: 'SECRET_PROMPT_TEXT_MUST_NOT_LEAK_TO_RUNTIME_ACTIVE',
        cwd: workDir,
        mode: 'live',
        fullAccess: false
      });
      await waitForCount(markD, n => n >= 3, 6000);

      const activeResp = await hD.api('/runtime/active');
      const rawActive = JSON.stringify(activeResp.body || {});
      check(
        'GET /runtime/active reports active agent run count and safe labels without prompt text',
        activeResp.status === 200 &&
          activeResp.body?.activeCount === 1 &&
          Array.isArray(activeResp.body?.items) &&
          activeResp.body.items.length === 1 &&
          !rawActive.includes('SECRET_PROMPT_TEXT_MUST_NOT_LEAK'),
        activeResp.body
      );

      // Test 1: Active agent + skipQuitConfirm=false -> user clicks "Keep open" (response 1)
      let savedSkip = false;
      const resKeep = await quitGuard.evaluateQuitConfirmation({
        active: activeResp.body,
        skipQuitConfirm: false,
        language: 'en',
        showConfirmDialog: async msg => {
          return { response: 1, checkboxChecked: false, shownTitle: msg.title, shownMessage: msg.message };
        },
        persistSkipQuitConfirm: async v => { savedSkip = Boolean(v); }
      });

      // Test 2: Active agent + user clicks "Close & stop all" (response 0) + checks "Don't ask again"
      const resStopAndSkip = await quitGuard.evaluateQuitConfirmation({
        active: activeResp.body,
        skipQuitConfirm: false,
        language: 'id',
        showConfirmDialog: async msg => {
          return { response: 0, checkboxChecked: true, shownTitle: msg.title, shownMessage: msg.message };
        },
        persistSkipQuitConfirm: async v => { savedSkip = Boolean(v); }
      });

      // Test 3: skipQuitConfirm=true -> closes immediately without prompting
      let dialogCalledWhenSkipped = false;
      const resSkipped = await quitGuard.evaluateQuitConfirmation({
        active: activeResp.body,
        skipQuitConfirm: true,
        language: 'en',
        showConfirmDialog: async () => { dialogCalledWhenSkipped = true; return { response: 1, checkboxChecked: false }; },
        persistSkipQuitConfirm: async () => {}
      });

      // Test 4: 0 active runs -> closes immediately without prompting
      let dialogCalledWhenIdle = false;
      const resIdle = await quitGuard.evaluateQuitConfirmation({
        active: { activeCount: 0, items: [] },
        skipQuitConfirm: false,
        language: 'en',
        showConfirmDialog: async () => { dialogCalledWhenIdle = true; return { response: 1, checkboxChecked: false }; },
        persistSkipQuitConfirm: async () => {}
      });

      // Verify /setup/state persists skipQuitConfirm cleanly
      const saveSkipApi = await hD.api('/setup/state', 'POST', { skipQuitConfirm: true });
      const readSetupApi = await hD.api('/setup/status');

      await hD.gracefulClose();
      await waitForCount(markD, n => n === 0, 5000);

      check(
        'Quit confirmation guard blocks close on Keep Open, stops+saves skipQuitConfirm on Confirm, and bypasses dialog when skipped or idle',
        resKeep.allowQuit === false &&
          resKeep.prompted === true &&
          resStopAndSkip.allowQuit === true &&
          resStopAndSkip.prompted === true &&
          savedSkip === true &&
          resSkipped.allowQuit === true &&
          resSkipped.prompted === false &&
          dialogCalledWhenSkipped === false &&
          resIdle.allowQuit === true &&
          resIdle.prompted === false &&
          dialogCalledWhenIdle === false &&
          saveSkipApi.status === 200 &&
          readSetupApi.body?.setupState?.skipQuitConfirm === true,
        { resKeep, resStopAndSkip, savedSkip, resSkipped, resIdle, apiSkip: readSetupApi.body?.setupState?.skipQuitConfirm }
      );
    }

    out.ok = out.failed.length === 0;
    console.log(JSON.stringify(out, null, 2));
    if (!out.ok && !beforeMode) process.exitCode = 1;
  } finally {
    for (const m of markers) {
      await cleanupMarkedProcesses(m);
    }
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

run().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
