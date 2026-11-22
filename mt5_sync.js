// [Diubah oleh Codex - 2026-11-21] V17: bounded discovery and owned persistent read-only bridge.
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');

function exec(exe, args, options = {}) {
  return new Promise(resolve => execFile(exe, args, { windowsHide: true, timeout: 3500,
    maxBuffer: 2 * 1024 * 1024, ...options }, (error, stdout) => {
    try { resolve(JSON.parse(String(stdout).trim())); } catch { resolve(null); }
  }));
}

async function pythonCandidates(saved = '') {
  const safe = !String(saved).split(/[\\/]/).some(p => ['secrets', '.git', '..'].includes(p.toLowerCase()));
  const out = saved && safe ? [{ exe: saved, args: [] }] : [];
  out.push({ exe: 'py', args: ['-3'] }, { exe: 'python', args: [] }, { exe: 'python3', args: [] });
  const bases = [path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python'),
    path.join(process.env.LOCALAPPDATA || '', 'Python'), process.env.ProgramFiles, 'C:\\'];
  for (const base of bases.filter(Boolean)) {
    const dirs = await fs.readdir(base, { withFileTypes: true }).catch(() => []);
    for (const d of dirs.slice(0, 200)) {
      if (!d.isSymbolicLink() && d.isDirectory() && /^(python\d|pythoncore-|Python-)/i.test(d.name)) {
        out.push({ exe: path.join(base, d.name, 'python.exe'), args: [] });
      }
    }
  }
  return out.filter((x, i) => out.findIndex(y => y.exe === x.exe) === i);
}

async function terminalCandidates(saved = '') {
  const out = saved ? [saved] : [];
  if (process.platform === 'win32') {
    // Query executable paths only; no command lines, account files or terminal data directories.
    const running = await exec('powershell.exe', ['-NoProfile', '-Command',
      "@((Get-CimInstance Win32_Process -Filter \"Name='terminal64.exe' OR Name='terminal.exe'\").ExecutablePath) | ConvertTo-Json -Compress"]);
    out.push(...(Array.isArray(running) ? running : typeof running === 'string' ? [running] : []));
  }
  for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'],
    path.join(process.env.LOCALAPPDATA || '', 'Programs')].filter(Boolean)) {
    const dirs = await fs.readdir(base, { withFileTypes: true }).catch(() => []);
    for (const d of dirs.slice(0, 250)) {
      if (d.isDirectory() && !d.isSymbolicLink()) {
        // Broker-branded installations also use terminal64.exe.
        out.push(path.join(base, d.name, 'terminal64.exe'));
      }
    }
  }
  const found = [];
  for (const candidate of [...new Set(out.filter(Boolean))]) {
    if (/(^|[\\/])(Secrets|\.git)([\\/]|$)/i.test(candidate) || candidate.split(/[\\/]/).includes('..')) continue;
    const stat = await fs.lstat(candidate).catch(() => null);
    if (stat?.isFile() && !stat.isSymbolicLink()) found.push(candidate);
  }
  return found;
}

function createMt5Sync({ root, getConfig, onSnapshot, onDetection, onHeartbeat,
  candidates = null, terminals = null, environment = {}, autodetect = true } = {}) {
  const script = path.join(root, 'mt5_readonly_bridge.py');
  let interpreter = null, detection = { checked: false, python: false, module: false, terminal: false };
  let child = null, timer = null, watchdog = null, stopped = false, generation = 0;
  let pending = Promise.resolve(), checking = null, lastLine = 0, failures = 0, startRequest = 0;
  let latestSnapshot = null, applying = false;
  const calls = new Set();
  const env = { ...process.env, ...environment };

  async function detect() {
    if (checking) return checking;
    checking = (async () => {
      if (!autodetect) return detection;
      const config = getConfig();
      const list = candidates || await pythonCandidates(config.pythonPath);
      let hasPython = false;
      interpreter = null;
      // Sequential probes avoid a burst of Python processes and initialize is never called here.
      for (const entry of list) {
        const probe = await exec(entry.exe, [...entry.args, '-I', script, '--probe'], { cwd: root, env });
        hasPython ||= Boolean(probe?.python);
        if (probe?.module) {
          // Resolve launcher shims to the actual interpreter before creating the
          // Windows Job Object; manager-launched processes can escape its tree.
          interpreter = !candidates && typeof probe.executable === 'string'
            ? { exe: probe.executable, args: [] } : entry;
          break;
        }
        if (stopped) break;
      }
      const paths = terminals || await terminalCandidates(config.terminalPath);
      detection = { checked: true, python: hasPython, module: Boolean(interpreter),
        terminal: paths.length > 0, pythonPath: interpreter?.exe || '',
        terminalPath: paths.includes(config.terminalPath) ? config.terminalPath : paths[0] || '' };
      if (!stopped) await onDetection(detection);
      return detection;
    })().finally(() => { checking = null; });
    return checking;
  }

  function command(args, stream) {
    const py = interpreter || { exe: getConfig().pythonPath || 'python', args: [] };
    const bridgeArgs = [...py.args, '-I', script, ...args];
    if (stream && process.platform === 'win32') {
      // V15 Job Object: EOF, server crash and wrapper death kill only our descendants.
      return { exe: py.exe, args: [...py.args, '-I', path.join(root, 'short_process_runner.py'),
        '--parent-pid', String(process.pid), '--', py.exe, ...bridgeArgs], job: true };
    }
    return { exe: py.exe, args: bridgeArgs, job: false };
  }

  function argsFor(opts = {}) {
    const cfg = getConfig(), args = [];
    const terminal = cfg.terminalPath || detection.terminalPath;
    if (terminal && !String(terminal).split(/[\\/]/).some(p => ['secrets', '.git', '..'].includes(p.toLowerCase()))) args.push('--terminal-path', terminal);
    if (opts.historyDays != null) args.push('--history-days', String(Math.max(1, Math.min(365, Number(opts.historyDays) || 30))));
    else args.push('--history-hours', '24');
    return args;
  }

  async function once(opts = {}) {
    if (!autodetect && !candidates) return null;
    if (!interpreter && autodetect) await detect();
    if (autodetect && !interpreter) return null;
    if (stopped) return null;
    const cmd = command(argsFor(opts), false);
    // Also own fallback calls with the V15 wrapper on Windows, including forced parent death.
    const owned = process.platform === 'win32' ? command(argsFor(opts), true) : cmd;
    return new Promise(resolve => {
      const proc = spawn(owned.exe, owned.args, { cwd: root, windowsHide: true, env, stdio: ['pipe', 'pipe', 'pipe'] });
      calls.add(proc);
      const fallbackTimer = setTimeout(() => { proc.stdin.end(); proc.kill(); }, 8000);
      let output = '';
      proc.stdout.on('data', data => { if (output.length < 2 * 1024 * 1024) output += data; });
      proc.stderr.resume();
      proc.on('error', () => {});
      proc.once('close', () => {
        calls.delete(proc);
        clearTimeout(fallbackTimer);
        try { resolve(JSON.parse(output.trim())); } catch { resolve(null); }
      });
    });
  }

  function accept(snapshot) {
    // A slow disk/listener keeps at most one pending snapshot. History is repeated
    // in each snapshot, so coalescing prices does not lose closed-deal booking.
    latestSnapshot = snapshot;
    if (applying) return;
    applying = true;
    pending = (async () => {
      while (!stopped && latestSnapshot) {
        const next = latestSnapshot; latestSnapshot = null;
        try { await onSnapshot(next); } catch { /* keep the stream alive */ }
      }
    })().finally(() => { applying = false; });
  }

  async function halt() {
    generation++;
    clearTimeout(timer); clearInterval(watchdog); timer = watchdog = null;
    const owned = [child, ...calls].filter(Boolean); child = null;
    for (const old of owned) if (old.exitCode === null) {
      await new Promise(resolve => {
        const force = setTimeout(() => old.kill(), 1500);
        old.once('close', () => { clearTimeout(force); resolve(); });
        old.stdin.end();
      });
    }
  }

  async function start() {
    const request = ++startRequest;
    await halt();
    if (stopped || request !== startRequest || !getConfig().enabled) return;
    if (!interpreter && autodetect) await detect();
    if (stopped || request !== startRequest || !getConfig().enabled) return;
    if (!interpreter && autodetect) return;
    const gen = generation;
    if (failures >= 2) {
      // Degrade to serialized spawn polling; try stream again after one minute.
      const fallbackStarted = Date.now();
      const poll = async () => {
        if (stopped || gen !== generation) return;
        const snap = await once();
        if (gen !== generation) return;
        accept(snap || { connected: false, reason: 'stream_unavailable' });
        if (Date.now() - fallbackStarted > 60000) { failures = 0; void start(); }
        else timer = setTimeout(poll, getConfig().pollIntervalMs);
      };
      void poll(); return;
    }
    const cmd = command(['--stream', ...(process.platform === 'win32' ? ['--job-owned'] : []),
      '--interval', String(getConfig().pollIntervalMs / 1000), ...argsFor()], true);
    const proc = child = spawn(cmd.exe, cmd.args, { cwd: root, windowsHide: true, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = '', received = false;
    lastLine = Date.now();
    proc.stderr.resume();
    // The bridge stdin is DEVNULL under the job wrapper; the wrapper owns its lifetime.
    proc.on('error', () => {});
    proc.stdout.on('data', data => {
      if (gen !== generation) return;
      buffer += data.toString();
      if (buffer.length > 2 * 1024 * 1024) { proc.stdin.end(); proc.kill(); return; }
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        try {
          const snap = JSON.parse(line);
          if (!snap || typeof snap !== 'object' || !snap.fetched_at) continue;
          received = true; lastLine = Date.now(); failures = 0; accept(snap);
        } catch { /* malformed line cannot alter live state */ }
      }
    });
    watchdog = setInterval(() => {
      if (gen !== generation || stopped) return;
      onHeartbeat({ lastReceived: new Date(lastLine).toISOString(), transport: 'stream' });
      if (Date.now() - lastLine > 10000) { proc.stdin.end(); proc.kill(); }
    }, 1000);
    watchdog.unref?.();
    proc.once('close', () => {
      if (gen !== generation || stopped) return;
      clearInterval(watchdog); watchdog = null; child = null;
      failures = received ? 1 : failures + 1;
      timer = setTimeout(() => { void start(); }, 1000);
      timer.unref?.();
    });
  }

  return { detect, start, once, getDetection: () => ({ ...detection }),
    async stop() { stopped = true; startRequest++; await halt(); await checking; await pending; } };
}
module.exports = { createMt5Sync, pythonCandidates, terminalCandidates };
