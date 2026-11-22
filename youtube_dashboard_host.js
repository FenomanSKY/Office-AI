// [Diubah oleh Gemini - 2026-11-21] Host Dasbor YouTube Studio Manager tertanam utuh (V14 + V15): mendukung folder dasbor terpisah (dashboardDir), penemuan otomatis generik via workspace_discovery, tanpa hardcode folder pribadi
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const { spawn, execFile } = require('node:child_process');
const {
  inspectDashboardDir,
  discoverWorkspaces,
  formatPortablePath,
  YOUTUBE_DASHBOARD_REPO_URL
} = require('./workspace_discovery');

const DEFAULT_DASHBOARD_PORT = 8765;
const STARTUP_TIMEOUT_MS = 12000;
const PROBE_TIMEOUT_MS = 1500;
const API_TIMEOUT_MS = 8000;
const MAX_STDERR_TAIL = 2000;

function cleanText(val, maxLen = 240) {
  if (val === undefined || val === null) return '';
  return String(val).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLen);
}

function isBlockedPath(targetPath) {
  const norm = String(targetPath || '').replace(/\\/g, '/');
  return norm
    .split('/')
    .filter(Boolean)
    .some(seg => /^(secrets|\.git|\.env)$/i.test(seg));
}

function redactPossibleSecrets(text) {
  return String(text || '')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED]')
    .replace(/ya29\.[0-9A-Za-z._-]{20,}/g, '[REDACTED]')
    .replace(/(?:token|secret|password)\s*[:=]\s*[^\s,'"}]+/gi, '[REDACTED]');
}

function killProcessTreeSafe(childProc) {
  if (!childProc) return;
  const pid = childProc.pid;
  try {
    if (process.platform === 'win32' && pid) {
      execFile(
        'taskkill.exe',
        ['/PID', String(pid), '/T', '/F'],
        { windowsHide: true, shell: false, timeout: 4000 },
        () => {}
      );
    }
    childProc.kill('SIGTERM');
  } catch {
    /* abaikan jika sudah mati */
  }
}

async function isRegularFile(filePath) {
  if (!filePath || isBlockedPath(filePath)) return false;
  try {
    const st = await fs.lstat(filePath);
    return st.isFile() && !st.isSymbolicLink();
  } catch {
    return false;
  }
}

// [Diubah oleh Gemini - 2026-11-21] Deteksi folder Dasbor YouTube secara generik (dashboardDir terpisah -> folder proyek -> penemuan otomatis tanpa hardcode folder pribadi)
async function resolveProjectRoot({
  root,
  getLocalProjectDir,
  getDashboardDir,
  explicitProjectRoot,
  workspaceDiscovery,
  allowDriveScan = true
}) {
  const explicitList = [];
  if (explicitProjectRoot) explicitList.push({ dir: explicitProjectRoot, source: 'explicit' });
  const savedDash = typeof getDashboardDir === 'function' ? cleanText(getDashboardDir(), 300) : '';
  if (savedDash) explicitList.push({ dir: savedDash, source: 'saved' });
  if (process.env.OFFICE_AI_DASHBOARD) explicitList.push({ dir: process.env.OFFICE_AI_DASHBOARD, source: 'env' });

  for (const item of explicitList) {
    if (!item.dir || isBlockedPath(item.dir)) continue;
    const info = await inspectDashboardDir(item.dir);
    if (info.valid) {
      return {
        found: true,
        projectRoot: info.projectRoot,
        serverScript: info.serverScript,
        pythonExe: info.pythonExe,
        hasVenv: info.hasVenv,
        source: item.source,
        layout: info.layout,
        candidates: [info],
        needsConfirmation: false
      };
    }
  }

  const savedProj = typeof getLocalProjectDir === 'function' ? cleanText(getLocalProjectDir(), 300) : '';
  if (savedProj && !isBlockedPath(savedProj)) {
    let cur = path.resolve(savedProj);
    for (let i = 0; i < 4; i++) {
      const info = await inspectDashboardDir(cur);
      if (info.valid) {
        return {
          found: true,
          projectRoot: info.projectRoot,
          serverScript: info.serverScript,
          pythonExe: info.pythonExe,
          hasVenv: info.hasVenv,
          source: 'project',
          layout: info.layout,
          candidates: [info],
          needsConfirmation: false
        };
      }
      const parent = path.dirname(cur);
      if (parent === cur) break;
      cur = parent;
    }
  }

  const disc =
    workspaceDiscovery && typeof workspaceDiscovery.discover === 'function'
      ? await workspaceDiscovery.discover()
      : await discoverWorkspaces({
          savedProjectDir: savedProj,
          savedDashboardDir: savedDash,
          root: root || __dirname,
          allowDriveScan
        });

  if (disc.effectiveDashboard && disc.effectiveDashboard.valid) {
    return {
      found: true,
      projectRoot: disc.effectiveDashboard.projectRoot,
      serverScript: disc.effectiveDashboard.serverScript,
      pythonExe: disc.effectiveDashboard.pythonExe,
      hasVenv: disc.effectiveDashboard.hasVenv,
      source: disc.dashboardSource || 'discovered_single',
      layout: disc.effectiveDashboard.layout || '',
      candidates: disc.dashboardCandidates || [],
      needsConfirmation: false
    };
  }

  return {
    found: false,
    projectRoot: '',
    serverScript: '',
    pythonExe: '',
    hasVenv: false,
    source: disc.dashboardSource || 'none',
    layout: '',
    candidates: disc.dashboardCandidates || [],
    needsConfirmation: Boolean(disc.dashboardNeedsConfirmation)
  };
}

function httpGetJson(urlStr, timeoutMs = API_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(urlStr);
    } catch {
      reject(new Error('URL tidak valid'));
      return;
    }
    if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.protocol !== 'http:') {
      reject(new Error('Hanya loopback HTTP yang diizinkan'));
      return;
    }
    const req = http.get(
      {
        hostname: parsed.hostname,
        port: parsed.port || 80,
        path: parsed.pathname + parsed.search,
        headers: {
          Host: `${parsed.hostname}:${parsed.port || 80}`,
          Accept: 'application/json'
        },
        timeout: timeoutMs
      },
      res => {
        const chunks = [];
        let bytes = 0;
        res.on('data', c => {
          bytes += c.length;
          if (bytes <= 2 * 1024 * 1024) chunks.push(c);
        });
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            json = null;
          }
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json, text });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout menghubungi server dasbor'));
    });
    req.on('error', err => reject(err));
  });
}

async function createYoutubeDashboardHost({
  root = __dirname,
  dataDir,
  port: initialPort,
  projectRoot: explicitProjectRoot = '',
  serverScript: explicitServerScript = '',
  pythonExe: explicitPythonExe = '',
  getLocalProjectDir = () => '',
  getDashboardDir = () => '',
  workspaceDiscovery = null,
  getLegacyAnalyticsState = () => null,
  onEvent = () => {},
  now = Date.now,
  spawnImpl = null
} = {}) {
  const rawPort = Number(initialPort ?? process.env.YSM_PORT ?? process.env.STUDIOPULSE_PORT ?? DEFAULT_DASHBOARD_PORT);
  const port = Number.isInteger(rawPort) && rawPort >= 1024 && rawPort <= 65535 ? rawPort : DEFAULT_DASHBOARD_PORT;
  const origin = `http://127.0.0.1:${port}`;
  const stateFilePath = dataDir ? path.join(dataDir, 'youtube_dashboard_office.json') : null;

  let ownedChild = null;
  let startPromise = null;
  let stderrTail = '';
  let stopped = false;

  // Catatan non-rahasia di sisi kantor: komentar yang sudah terlihat & peringatan login yang sudah disiarkan (TIDAK menyimpan token apa pun)
  let officeTracking = {
    version: 1,
    seenCommentIds: {}, // { [channelKey]: string[] (max 60) }
    lastSummaryAt: null,
    lastMigratedLegacyDate: null
  };

  const alertedLoginKeys = new Set(); // `${ch}:${state}` agar tidak spam event 3D tiap refresh
  let lastStatus = {
    running: false,
    managedByOffice: false,
    mode: 'stopped', // 'stopped' | 'starting' | 'attached' | 'managed' | 'error'
    port,
    origin,
    url: `${origin}/`,
    pid: null,
    serverAvailable: false,
    dashboardDir: '',
    resolvedDashboardDir: '',
    dashboardDisplayPath: '',
    dashboardSource: 'none',
    dashboardCandidates: [],
    needsConfirmation: false,
    repoUrl: YOUTUBE_DASHBOARD_REPO_URL,
    lastCheckedAt: null,
    startedAt: null,
    errorCode: null,
    error: null
  };

  let lastSummary = {
    source: 'offline',
    running: false,
    managedByOffice: false,
    port,
    url: `${origin}/`,
    updatedAt: null,
    totals: {
      subscribers: 0,
      totalViews: 0,
      videoCount: 0,
      connectedChannels: 0,
      totalChannels: 0,
      quotaUsed: 0,
      quotaLimit: 10000,
      quotaMaxPct: 0,
      projectsReady: 0,
      projectsTotal: 0
    },
    channels: [],
    loginWarnings: [],
    recentCommentsCount: 0,
    newCommentsDetected: 0,
    legacy: null,
    error: null
  };

  const nowIso = () => new Date(now()).toISOString();

  function emitSafe(payload) {
    try {
      onEvent(payload);
    } catch {
      /* abaikan error SSE */
    }
  }

  async function loadTracking() {
    if (!stateFilePath) return;
    try {
      const raw = JSON.parse(await fs.readFile(stateFilePath, 'utf8'));
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        officeTracking = {
          version: 1,
          seenCommentIds: raw.seenCommentIds && typeof raw.seenCommentIds === 'object' ? raw.seenCommentIds : {},
          lastSummaryAt: raw.lastSummaryAt || null,
          lastMigratedLegacyDate: raw.lastMigratedLegacyDate || null
        };
      }
    } catch {
      /* berkas baru */
    }
  }

  async function saveTracking() {
    if (!stateFilePath) return;
    try {
      await fs.mkdir(path.dirname(stateFilePath), { recursive: true });
      const tmp = `${stateFilePath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(officeTracking, null, 2) + '\n', 'utf8');
      await fs.rename(tmp, stateFilePath).catch(async () => {
        await fs.copyFile(tmp, stateFilePath);
        await fs.unlink(tmp).catch(() => {});
      });
    } catch {
      /* abaikan error penyimpanan non-kritis */
    }
  }

  await loadTracking();

  async function resolvePaths() {
    if (explicitServerScript) {
      const okScript = await isRegularFile(explicitServerScript);
      const pr = explicitProjectRoot || path.dirname(explicitServerScript);
      return {
        found: okScript,
        projectRoot: pr,
        serverScript: explicitServerScript,
        pythonExe: explicitPythonExe || 'python',
        hasVenv: Boolean(explicitPythonExe),
        source: 'explicit',
        candidates: [],
        needsConfirmation: false
      };
    }
    return resolveProjectRoot({ root, getLocalProjectDir, getDashboardDir, explicitProjectRoot, workspaceDiscovery });
  }

  function getAllowedOrigins() {
    return [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  }

  function isAllowedUrl(rawUrl) {
    try {
      const u = new URL(String(rawUrl || ''));
      return u.protocol === 'http:' && getAllowedOrigins().includes(u.origin);
    } catch {
      return false;
    }
  }

  // Cek ringan tanpa memicu kuota YouTube API (/api/meta hanya membaca channels.json + eksistensi token lokal)
  async function probeDashboard() {
    lastStatus.lastCheckedAt = nowIso();
    try {
      const res = await httpGetJson(`${origin}/api/meta`, PROBE_TIMEOUT_MS);
      if (res.ok && res.json && Array.isArray(res.json.channels)) {
        lastStatus.running = true;
        lastStatus.error = null;
        if (!ownedChild) {
          lastStatus.managedByOffice = false;
          lastStatus.mode = 'attached';
          lastStatus.pid = null;
        } else {
          lastStatus.managedByOffice = true;
          lastStatus.mode = 'managed';
        }
        return { alive: true, meta: res.json };
      }
      return { alive: false, meta: null };
    } catch {
      if (!ownedChild) {
        lastStatus.running = false;
        lastStatus.managedByOffice = false;
        if (lastStatus.mode !== 'error') lastStatus.mode = 'stopped';
      }
      return { alive: false, meta: null };
    }
  }

  function getLegacySnapshot() {
    try {
      const raw = typeof getLegacyAnalyticsState === 'function' ? getLegacyAnalyticsState() : null;
      if (!raw || typeof raw !== 'object') return null;
      const s = raw.summary || {};
      const hasData =
        Boolean(raw.lastRunDate) ||
        (Array.isArray(raw.historyDates) && raw.historyDates.length > 0) ||
        Number(s.totalViews || 0) > 0;
      if (!hasData) return null;
      return {
        migratedFrom: 'v13_youtube_analytics',
        source: raw.source || 'legacy',
        demoMode: Boolean(raw.demoMode),
        lastRunDate: raw.lastRunDate || null,
        historyCount: Array.isArray(raw.historyDates) ? raw.historyDates.length : 0,
        subscribers: Number(s.subscribers || 0) || 0,
        totalViews: Number(s.totalViews || 0) || 0,
        videoCount: Number(s.videoCount || 0) || 0,
        recommendationsCount: Array.isArray(raw.nextVideoRecommendations) ? raw.nextVideoRecommendations.length : 0
      };
    } catch {
      return null;
    }
  }

  async function getStatus({ probe = true } = {}) {
    const paths = await resolvePaths();
    const savedDash = typeof getDashboardDir === 'function' ? cleanText(getDashboardDir(), 300) : '';
    lastStatus.serverAvailable = Boolean(paths.found);
    lastStatus.dashboardDir = savedDash;
    lastStatus.resolvedDashboardDir = paths.found ? paths.projectRoot : '';
    lastStatus.dashboardDisplayPath = paths.found ? formatPortablePath(paths.projectRoot) : '';
    lastStatus.dashboardSource = paths.source || 'none';
    lastStatus.dashboardCandidates = (paths.candidates || []).map(c => ({
      path: c.path,
      displayPath: c.displayPath || formatPortablePath(c.path),
      name: c.name || path.basename(c.path),
      layout: c.layout || '',
      hasVenv: Boolean(c.hasVenv)
    }));
    lastStatus.needsConfirmation = Boolean(paths.needsConfirmation);
    lastStatus.repoUrl = YOUTUBE_DASHBOARD_REPO_URL;
    if (probe) {
      await probeDashboard();
    }
    if (paths.found && (lastStatus.errorCode === 'dashboard_not_found' || lastStatus.errorCode === 'dashboard_ambiguous')) {
      lastStatus.errorCode = null;
      lastStatus.error = null;
      if (lastStatus.mode === 'error') lastStatus.mode = 'stopped';
    } else if (!lastStatus.running && !paths.found) {
      lastStatus.errorCode = paths.needsConfirmation ? 'dashboard_ambiguous' : 'dashboard_not_found';
    }
    return {
      ...lastStatus,
      allowedOrigins: getAllowedOrigins(),
      legacy: getLegacySnapshot()
    };
  }

  // [Diubah oleh Gemini - 2026-11-21] Pastikan dasbor hidup: pakai yang sudah berjalan di port target, atau nyalakan dengan --no-browser & windowsHide
  async function ensureRunning() {
    if (startPromise) return startPromise;
    startPromise = (async () => {
      const probe = await probeDashboard();
      if (probe.alive) {
        lastStatus.errorCode = null;
        lastStatus.error = null;
        const st = await getStatus({ probe: false });
        emitSafe({ type: 'youtube_dashboard_status', status: st });
        return { ok: true, alreadyRunning: true, status: st };
      }

      const paths = await resolvePaths();
      lastStatus.serverAvailable = Boolean(paths.found);
      if (!paths.found || !paths.serverScript) {
        lastStatus.running = false;
        lastStatus.mode = 'error';
        lastStatus.errorCode = paths.needsConfirmation ? 'dashboard_ambiguous' : 'dashboard_not_found';
        lastStatus.error = paths.needsConfirmation
          ? 'Multiple YouTube Dashboard folders found. Select one folder to continue.'
          : 'YouTube Dashboard server script (Tools/dashboard/server.py or dashboard/server.py) not found.';
        const st = await getStatus({ probe: false });
        emitSafe({ type: 'youtube_dashboard_status', status: st });
        return { ok: false, errorCode: lastStatus.errorCode, error: lastStatus.error, status: st };
      }

      stderrTail = '';
      lastStatus.mode = 'starting';
      lastStatus.errorCode = null;
      lastStatus.error = null;
      const spawnFn = typeof spawnImpl === 'function' ? spawnImpl : spawn;
      const args = [paths.serverScript, '--no-browser'];

      let child;
      try {
        child = spawnFn(paths.pythonExe, args, {
          cwd: paths.projectRoot,
          windowsHide: true,
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
            YSM_PORT: String(port),
            PYTHONIOENCODING: 'utf-8'
          }
        });
      } catch (err) {
        lastStatus.running = false;
        lastStatus.mode = 'error';
        lastStatus.error = cleanText(err?.message || 'Gagal menjalankan Python server dasbor', 200);
        const st = await getStatus({ probe: false });
        return { ok: false, error: lastStatus.error, status: st };
      }

      ownedChild = child;
      lastStatus.managedByOffice = true;
      lastStatus.pid = child.pid || null;
      lastStatus.startedAt = nowIso();

      let exitedEarly = false;
      let exitCodeEarly = null;

      if (child.stderr) {
        child.stderr.on('data', chunk => {
          stderrTail = (stderrTail + redactPossibleSecrets(chunk.toString('utf8'))).slice(-MAX_STDERR_TAIL);
        });
      }
      if (child.stdout) {
        child.stdout.on('data', () => {
          /* kuras stdout agar pipa tidak penuh */
        });
      }

      child.on('error', err => {
        exitedEarly = true;
        if (ownedChild === child) {
          ownedChild = null;
          lastStatus.running = false;
          lastStatus.managedByOffice = false;
          lastStatus.pid = null;
          lastStatus.mode = 'error';
          lastStatus.error = cleanText(err?.message || 'Proses dasbor gagal dimulai', 200);
          emitSafe({ type: 'youtube_dashboard_status', status: { ...lastStatus } });
        }
      });

      child.on('exit', code => {
        exitedEarly = true;
        exitCodeEarly = code;
        if (ownedChild === child) {
          ownedChild = null;
          lastStatus.running = false;
          lastStatus.managedByOffice = false;
          lastStatus.pid = null;
          lastStatus.mode = stopped ? 'stopped' : 'error';
          if (!stopped) {
            const tail = cleanText(stderrTail.split(/\r?\n/).filter(Boolean).slice(-2).join(' | '), 180);
            lastStatus.error = tail || `Server dasbor berhenti (kode ${code ?? 'unknown'})`;
          }
          emitSafe({ type: 'youtube_dashboard_status', status: { ...lastStatus } });
        }
      });

      const deadline = Date.now() + STARTUP_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (exitedEarly) break;
        const p = await probeDashboard();
        if (p.alive) {
          lastStatus.running = true;
          lastStatus.managedByOffice = true;
          lastStatus.mode = 'managed';
          lastStatus.error = null;
          const st = await getStatus({ probe: false });
          emitSafe({ type: 'youtube_dashboard_status', status: st });
          return { ok: true, alreadyRunning: false, status: st };
        }
        await new Promise(r => setTimeout(r, 200));
      }

      // Gagal siap sebelum batas waktu -> bersihkan proses milik sendiri
      if (ownedChild === child) {
        killProcessTreeSafe(child);
        ownedChild = null;
      }
      lastStatus.running = false;
      lastStatus.managedByOffice = false;
      lastStatus.pid = null;
      lastStatus.mode = 'error';
      const detail = cleanText(stderrTail.split(/\r?\n/).filter(Boolean).slice(-2).join(' | '), 180);
      lastStatus.error =
        detail ||
        (exitedEarly
          ? `Server dasbor keluar dini (kode ${exitCodeEarly ?? 'unknown'})`
          : 'Server dasbor tidak merespons dalam 12 detik');
      const st = await getStatus({ probe: false });
      emitSafe({ type: 'youtube_dashboard_status', status: st });
      return { ok: false, error: lastStatus.error, status: st };
    })();

    try {
      return await startPromise;
    } finally {
      startPromise = null;
    }
  }

  // [Diubah oleh Gemini - 2026-11-21] Ambil angka non-rahasia dari API dasbor + deteksi komentar baru & login hampir kedaluwarsa untuk kantor 3D
  async function fetchOfficeSummary({
    autoStart = false,
    includeLiveMetrics = false,
    checkHealth = true,
    checkComments = false
  } = {}) {
    if (autoStart) {
      await ensureRunning();
    }
    const legacy = getLegacySnapshot();
    const probe = await probeDashboard();

    if (!probe.alive || !probe.meta) {
      const offlineSummary = {
        ...lastSummary,
        source: legacy ? 'legacy_fallback' : 'offline',
        running: false,
        managedByOffice: false,
        updatedAt: nowIso(),
        totals: {
          ...lastSummary.totals,
          subscribers: legacy && !legacy.demoMode ? legacy.subscribers : lastSummary.totals.subscribers,
          totalViews: legacy && !legacy.demoMode ? legacy.totalViews : lastSummary.totals.totalViews,
          videoCount: legacy && !legacy.demoMode ? legacy.videoCount : lastSummary.totals.videoCount
        },
        legacy,
        error: lastStatus.error
      };
      lastSummary = offlineSummary;
      return offlineSummary;
    }

    const metaChannels = Array.isArray(probe.meta.channels) ? probe.meta.channels : [];
    const [quotaRes, projectsRes, healthRes] = await Promise.all([
      httpGetJson(`${origin}/api/quota`, API_TIMEOUT_MS).catch(() => null),
      httpGetJson(`${origin}/api/projects`, API_TIMEOUT_MS).catch(() => null),
      checkHealth ? httpGetJson(`${origin}/api/health`, API_TIMEOUT_MS).catch(() => null) : Promise.resolve(null)
    ]);

    const quotaObj = quotaRes?.ok && quotaRes.json ? quotaRes.json : { day: null, limit: 10000, channels: {} };
    const projectList = projectsRes?.ok && Array.isArray(projectsRes.json) ? projectsRes.json : [];
    const healthObj = healthRes?.ok && healthRes.json && typeof healthRes.json === 'object' ? healthRes.json : {};

    const quotaLimit = Number(quotaObj.limit || 10000) || 10000;
    let quotaUsedTotal = 0;
    let quotaMaxPct = 0;
    let subsTotal = 0;
    let viewsTotal = 0;
    let videosTotal = 0;
    let liveChannelMetricsLoaded = false;
    let recentCommentsCount = 0;
    let newCommentsDetected = 0;
    const loginWarnings = [];
    const channelsSummary = [];
    let trackingDirty = false;

    for (const ch of metaChannels) {
      const key = String(ch.key || '');
      if (!key) continue;
      const title = cleanText(ch.title || key, 80);
      const connected = Boolean(ch.connected);
      const q = quotaObj.channels?.[key] || { units: 0, analytics: 0 };
      const qUnits = Number(q.units || 0) || 0;
      const qPct = Math.min(100, Math.round((qUnits / quotaLimit) * 100));
      quotaUsedTotal += qUnits;
      if (qPct > quotaMaxPct) quotaMaxPct = qPct;

      const h = healthObj[key] || null;
      const loginState = h?.state ? String(h.state) : connected ? 'unknown' : 'missing';
      const daysLeft = typeof h?.days_left === 'number' && Number.isFinite(h.days_left) ? h.days_left : null;
      const isWarning =
        (connected && ['expiring', 'expired', 'error'].includes(loginState)) ||
        (connected && daysLeft !== null && daysLeft <= 2);

      if (isWarning) {
        const warn = {
          channel: key,
          channelTitle: title,
          state: loginState,
          daysLeft,
          detail: cleanText(h?.detail || '', 160)
        };
        loginWarnings.push(warn);
        const alertSig = `${key}:${loginState}:${daysLeft ?? ''}`;
        if (!alertedLoginKeys.has(alertSig)) {
          alertedLoginKeys.add(alertSig);
          emitSafe({
            type: 'youtube_login_warning',
            channel: key,
            channelTitle: title,
            state: loginState,
            daysLeft,
            detail: warn.detail
          });
        }
      } else if (loginState === 'ok') {
        for (const sig of [...alertedLoginKeys]) {
          if (sig.startsWith(`${key}:`)) alertedLoginKeys.delete(sig);
        }
      }

      let chSubs = null;
      let chViews = null;
      let chVideos = null;

      if (includeLiveMetrics && connected) {
        const chRes = await httpGetJson(`${origin}/api/channel?ch=${encodeURIComponent(key)}`, API_TIMEOUT_MS).catch(() => null);
        if (chRes?.ok && chRes.json?.stats) {
          liveChannelMetricsLoaded = true;
          chSubs = Number(chRes.json.stats.subscriberCount || 0) || 0;
          chViews = Number(chRes.json.stats.viewCount || 0) || 0;
          chVideos = Number(chRes.json.stats.videoCount || 0) || 0;
          subsTotal += chSubs;
          viewsTotal += chViews;
          videosTotal += chVideos;
        }
      }

      let chCommentsNew = 0;
      if (checkComments && connected) {
        const cmRes = await httpGetJson(`${origin}/api/comments?ch=${encodeURIComponent(key)}`, API_TIMEOUT_MS).catch(() => null);
        if (cmRes?.ok && Array.isArray(cmRes.json)) {
          const list = cmRes.json;
          recentCommentsCount += list.length;
          const prevSeen = Array.isArray(officeTracking.seenCommentIds[key]) ? officeTracking.seenCommentIds[key] : null;
          const currentIds = list.map(c => String(c.id || '')).filter(Boolean).slice(0, 60);

          if (prevSeen === null) {
            // Inisialisasi baseline pertama kali tanpa membanjiri notifikasi komentar lama
            officeTracking.seenCommentIds[key] = currentIds;
            trackingDirty = true;
          } else {
            const seenSet = new Set(prevSeen);
            const fresh = list.filter(c => c.id && !seenSet.has(String(c.id)));
            if (fresh.length > 0) {
              chCommentsNew = fresh.length;
              newCommentsDetected += fresh.length;
              officeTracking.seenCommentIds[key] = [...new Set([...currentIds, ...prevSeen])].slice(0, 60);
              trackingDirty = true;
              const newest = fresh[0];
              emitSafe({
                type: 'youtube_new_comment',
                channel: key,
                channelTitle: title,
                count: fresh.length,
                latestAuthor: cleanText(newest.author || '', 60),
                latestVideoTitle: cleanText(newest.video_title || '', 100)
              });
            }
          }
        }
      }

      channelsSummary.push({
        key,
        title,
        color: cleanText(ch.color || '', 16),
        connected,
        pending: Boolean(ch.pending),
        oauthMode: cleanText(ch.oauth_mode || 'testing', 24),
        loginState,
        daysLeft,
        quotaUnits: qUnits,
        quotaPct: qPct,
        subscribers: chSubs,
        totalViews: chViews,
        videoCount: chVideos,
        newComments: chCommentsNew
      });
    }

    // Jika metrik channel live tidak diminta (mode 0-kuota), pakai angka snapshot lokal warisan yang non-demo bila ada
    if (!liveChannelMetricsLoaded && legacy && !legacy.demoMode) {
      subsTotal = legacy.subscribers;
      viewsTotal = legacy.totalViews;
      videosTotal = legacy.videoCount;
    }

    if (legacy && legacy.lastRunDate && officeTracking.lastMigratedLegacyDate !== legacy.lastRunDate) {
      officeTracking.lastMigratedLegacyDate = legacy.lastRunDate;
      trackingDirty = true;
    }

    const projectsReady = projectList.filter(p => p && p.status === 'ready').length;
    const updatedAt = nowIso();
    officeTracking.lastSummaryAt = updatedAt;
    if (trackingDirty) {
      await saveTracking();
    }

    lastSummary = {
      source: liveChannelMetricsLoaded ? 'dashboard_live' : 'dashboard_readonly',
      running: true,
      managedByOffice: Boolean(lastStatus.managedByOffice),
      mode: lastStatus.mode,
      port,
      url: `${origin}/`,
      updatedAt,
      quotaDay: quotaObj.day || null,
      totals: {
        subscribers: subsTotal,
        totalViews: viewsTotal,
        videoCount: videosTotal,
        connectedChannels: channelsSummary.filter(c => c.connected).length,
        totalChannels: channelsSummary.length,
        quotaUsed: quotaUsedTotal,
        quotaLimit,
        quotaMaxPct,
        projectsReady,
        projectsTotal: projectList.length
      },
      channels: channelsSummary,
      loginWarnings,
      recentCommentsCount,
      newCommentsDetected,
      legacy,
      error: null
    };

    emitSafe({
      type: 'youtube_dashboard_summary',
      summary: lastSummary
    });

    return lastSummary;
  }

  // [Diubah oleh Gemini - 2026-11-21] Hentikan proses dasbor HANYA jika Office AI sendiri yang menyalakannya
  async function stopOwned() {
    if (!ownedChild) {
      return { ok: true, stoppedOwned: false, reason: 'not_owned' };
    }
    const child = ownedChild;
    ownedChild = null;
    killProcessTreeSafe(child);
    lastStatus.running = false;
    lastStatus.managedByOffice = false;
    lastStatus.pid = null;
    lastStatus.mode = 'stopped';
    emitSafe({ type: 'youtube_dashboard_status', status: { ...lastStatus } });
    return { ok: true, stoppedOwned: true };
  }

  async function stop() {
    stopped = true;
    await stopOwned();
  }

  return {
    port,
    origin,
    getAllowedOrigins,
    isAllowedUrl,
    getStatus,
    ensureRunning,
    fetchOfficeSummary,
    getLastSummary: () => lastSummary,
    stopOwned,
    stop
  };
}

module.exports = {
  createYoutubeDashboardHost,
  DEFAULT_DASHBOARD_PORT,
  resolveProjectRoot
};
