// [Diubah oleh Gemini - 2026-11-21] Modul penemuan otomatis folder proyek (Channels/*) & folder dasbor YouTube terpisah (Office AI V15)
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const YOUTUBE_DASHBOARD_REPO_URL = 'https://github.com/FenomanSKY/YouTube-Studio-Manager';

const IGNORE_DIRS = new Set([
  'node_modules',
  'windows',
  'program files',
  'program files (x86)',
  'programdata',
  '$recycle.bin',
  'system volume information',
  'appdata',
  'users',
  'recovery',
  'perflogs',
  'msocache',
  'boot',
  'efi',
  'intel',
  'amd',
  'nvidia',
  'secrets',
  '.git',
  '.hg',
  '.svn',
  '.cache',
  '.venv',
  'venv',
  '__pycache__',
  'cadangan',
  'aplikasi',
  'qa',
  'logs',
  'shots',
  'runtime',
  'dist',
  'build',
  'coverage',
  'temp',
  'tmp',
  'cache',
  'vendor',
  'locales',
  'downloads',
  'appdata',
  'onedrive',
  'pictures',
  'music',
  'videos',
  'saved games',
  'favorites',
  'links',
  'searches',
  'contacts'
]);

const PROJECT_CONTAINER_HINTS = new Set([
  'projects',
  'project',
  'workspace',
  'workspaces',
  'repos',
  'repo',
  'dev',
  'code',
  'github',
  'gitlab',
  'work',
  'studio',
  'youtube',
  'documents',
  'desktop',
  'src'
]);

const WORKSPACE_MARKERS = ['AGENTS.md', 'package.json', 'Channels', 'pyproject.toml', 'README.md', '.git'];

function cleanText(val, maxLen = 300) {
  if (val === undefined || val === null) return '';
  return String(val).replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLen);
}

function isBlockedPath(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') return true;
  if (/[\u0000-\u001F\u007F]/.test(targetPath)) return true;
  const norm = targetPath.replace(/\\/g, '/');
  const segs = norm.split('/').filter(Boolean);
  return segs.some(seg => seg === '..' || /^(?:secrets|\.git|\.env(?:\..*)?|auth\.json)$/i.test(seg));
}

function isIgnoredDirName(name) {
  const n = String(name || '').trim();
  if (!n) return true;
  const low = n.toLowerCase();
  if (low.startsWith('.') || low.startsWith('_') || low.startsWith('$') || low.startsWith('.pack-stage-')) return true;
  return IGNORE_DIRS.has(low);
}

function formatPortablePath(rawPath, env = process.env) {
  const s = cleanText(rawPath, 400);
  if (!s) return '';
  const home = cleanText(env.USERPROFILE || env.HOME || os.homedir?.() || '', 260);
  const localApp = cleanText(env.LOCALAPPDATA || '', 260);
  const appData = cleanText(env.APPDATA || '', 260);
  const pairs = [
    [localApp, '%LOCALAPPDATA%'],
    [appData, '%APPDATA%'],
    [home, '%USERPROFILE%']
  ].filter(([prefix]) => prefix.length >= 3);
  const normS = s.replace(/\//g, '\\');
  for (const [prefix, token] of pairs) {
    const normP = prefix.replace(/\//g, '\\').replace(/\\+$/, '');
    if (normS.toLowerCase() === normP.toLowerCase()) return token;
    if (normS.toLowerCase().startsWith(normP.toLowerCase() + '\\')) {
      return token + normS.slice(normP.length);
    }
  }
  return s;
}

function expandPortablePath(rawPath, env = process.env) {
  const s = cleanText(rawPath, 400);
  if (!s) return '';
  const home = cleanText(env.USERPROFILE || env.HOME || os.homedir?.() || '', 260);
  const localApp = cleanText(env.LOCALAPPDATA || '', 260);
  const appData = cleanText(env.APPDATA || '', 260);
  let out = s
    .replace(/^~(?=[\\/]|$)/, home || '~')
    .replace(/%LOCALAPPDATA%/gi, localApp || '%LOCALAPPDATA%')
    .replace(/%APPDATA%/gi, appData || '%APPDATA%')
    .replace(/%USERPROFILE%/gi, home || '%USERPROFILE%');
  return path.resolve(out);
}

async function isRegularDir(dirPath) {
  if (!dirPath || isBlockedPath(dirPath)) return false;
  try {
    const st = await fs.lstat(dirPath);
    return st.isDirectory() && !st.isSymbolicLink();
  } catch {
    return false;
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

async function detectVenvPython(baseDir) {
  const candidates = [
    path.join(baseDir, 'Tools', 'youtube', '.venv', 'Scripts', 'python.exe'),
    path.join(baseDir, '.venv', 'Scripts', 'python.exe'),
    path.join(baseDir, 'venv', 'Scripts', 'python.exe'),
    path.join(baseDir, 'Tools', 'youtube', '.venv', 'bin', 'python'),
    path.join(baseDir, '.venv', 'bin', 'python'),
    path.join(baseDir, 'venv', 'bin', 'python')
  ];
  for (const c of candidates) {
    if (await isRegularFile(c)) {
      return { pythonExe: c, hasVenv: true };
    }
  }
  return { pythonExe: 'python', hasVenv: false };
}

// [Diubah oleh Gemini - 2026-11-21] Periksa apakah suatu folder cocok dengan tanda tangan Dasbor YouTube Studio Manager
async function inspectDashboardDir(dirPath, env = process.env) {
  if (!dirPath || isBlockedPath(dirPath)) {
    return { valid: false, path: '', displayPath: '', name: '', projectRoot: '', serverScript: '', pythonExe: '', hasVenv: false, layout: '' };
  }
  const abs = path.resolve(dirPath);
  if (!(await isRegularDir(abs))) {
    return { valid: false, path: abs, displayPath: formatPortablePath(abs, env), name: path.basename(abs), projectRoot: '', serverScript: '', pythonExe: '', hasVenv: false, layout: '' };
  }

  // Jangan pernah mengira folder root Office AI sendiri (server.py warisan) sebagai Dasbor YouTube
  const isOfficeAppRoot = await isRegularFile(path.join(abs, 'embedded_server.js'));

  const checks = [
    { rel: path.join('Tools', 'dashboard', 'server.py'), layout: 'tools_dashboard', root: abs },
    { rel: path.join('dashboard', 'server.py'), layout: 'dashboard_sub', root: abs }
  ];
  if (!isOfficeAppRoot) {
    checks.push({ rel: 'server.py', layout: 'standalone_root', root: abs, requireStatic: true });
  }

  for (const item of checks) {
    const scriptPath = path.join(abs, item.rel);
    if (!(await isRegularFile(scriptPath))) continue;
    if (item.requireStatic) {
      const staticIdx = path.join(abs, 'static', 'index.html');
      if (!(await isRegularFile(staticIdx))) continue;
    }
    const py = await detectVenvPython(item.root);
    // Jika pengguna memilih subfolder dashboard langsung, juga cek venv pada folder induk (mis. repo induk)
    let pyResolved = py;
    if (!py.hasVenv) {
      const parentPy = await detectVenvPython(path.dirname(item.root));
      if (parentPy.hasVenv) pyResolved = parentPy;
    }
    const isNamedYsm = /youtube[-_\s]?studio[-_\s]?manager/i.test(path.basename(abs));
    const score =
      (item.layout === 'tools_dashboard' ? 30 : item.layout === 'dashboard_sub' ? 25 : 20) +
      (pyResolved.hasVenv ? 15 : 0) +
      (isNamedYsm ? 12 : 0);

    return {
      valid: true,
      path: abs,
      displayPath: formatPortablePath(abs, env),
      name: path.basename(abs) || abs,
      projectRoot: item.root,
      serverScript: scriptPath,
      pythonExe: pyResolved.pythonExe,
      hasVenv: pyResolved.hasVenv,
      layout: item.layout,
      score
    };
  }

  return {
    valid: false,
    path: abs,
    displayPath: formatPortablePath(abs, env),
    name: path.basename(abs) || abs,
    projectRoot: '',
    serverScript: '',
    pythonExe: '',
    hasVenv: false,
    layout: '',
    score: 0
  };
}

// [Diubah oleh Gemini - 2026-11-21] Periksa tanda tangan folder proyek video: wajib memiliki subfolder Channels/<nama>/
async function inspectProjectDir(dirPath, env = process.env) {
  if (!dirPath || isBlockedPath(dirPath)) {
    return { valid: false, path: '', displayPath: '', name: '', channelsCount: 0, channelNames: [], hasAgentsMd: false, hasChannelsJson: false, hasDashboard: false, dashboardScript: '', hasTools: false, score: 0 };
  }
  const abs = path.resolve(dirPath);
  if (!(await isRegularDir(abs))) {
    return { valid: false, path: abs, displayPath: formatPortablePath(abs, env), name: path.basename(abs), channelsCount: 0, channelNames: [], hasAgentsMd: false, hasChannelsJson: false, hasDashboard: false, dashboardScript: '', hasTools: false, score: 0 };
  }

  const channelsDir = path.join(abs, 'Channels');
  if (!(await isRegularDir(channelsDir))) {
    return { valid: false, path: abs, displayPath: formatPortablePath(abs, env), name: path.basename(abs), channelsCount: 0, channelNames: [], hasAgentsMd: false, hasChannelsJson: false, hasDashboard: false, dashboardScript: '', hasTools: false, score: 0 };
  }

  let channelNames = [];
  try {
    const entries = await fs.readdir(channelsDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory() || ent.isSymbolicLink()) continue;
      if (ent.name.startsWith('.') || ent.name.startsWith('_') || /^(secrets|\.git)$/i.test(ent.name)) continue;
      channelNames.push(ent.name);
    }
    channelNames.sort((a, b) => a.localeCompare(b));
  } catch {
    channelNames = [];
  }

  if (channelNames.length === 0) {
    return { valid: false, path: abs, displayPath: formatPortablePath(abs, env), name: path.basename(abs), channelsCount: 0, channelNames: [], hasAgentsMd: false, hasChannelsJson: false, hasDashboard: false, dashboardScript: '', hasTools: false, score: 0 };
  }

  const [hasAgentsMd, hasChannelsJson, hasTools, dashInfo] = await Promise.all([
    isRegularFile(path.join(abs, 'AGENTS.md')),
    isRegularFile(path.join(abs, 'Tools', 'youtube', 'channels.json')),
    isRegularDir(path.join(abs, 'Tools')),
    inspectDashboardDir(abs, env)
  ]);

  const score =
    channelNames.length * 10 +
    (hasChannelsJson ? 35 : 0) +
    (hasAgentsMd ? 20 : 0) +
    (hasTools ? 10 : 0) +
    (dashInfo.valid ? 15 : 0);

  return {
    valid: true,
    path: abs,
    displayPath: formatPortablePath(abs, env),
    name: path.basename(abs) || abs,
    channelsCount: channelNames.length,
    channelNames,
    hasAgentsMd,
    hasChannelsJson,
    hasDashboard: dashInfo.valid,
    dashboardScript: dashInfo.serverScript || '',
    hasTools,
    score
  };
}

async function listDriveRoots(extraPaths = []) {
  const roots = new Set();
  for (const p of extraPaths) {
    if (!p) continue;
    try {
      const r = path.parse(path.resolve(p)).root;
      if (r) roots.add(r);
    } catch {}
  }
  if (process.platform === 'win32') {
    const letters = ['C', 'D', 'E', 'F', 'G', 'H'];
    await Promise.all(
      letters.map(async ch => {
        const drv = `${ch}:\\`;
        try {
          const st = await fs.stat(drv);
          if (st.isDirectory()) roots.add(drv);
        } catch {}
      })
    );
  } else {
    roots.add(os.homedir?.() || '/');
  }
  return [...roots];
}

// [Diubah oleh Gemini - 2026-11-21] Penemuan otomatis bertingkat: saved -> env -> naik dari app/cwd -> pindai akar drive & USERPROFILE (dibatasi waktu & kedalaman)
async function discoverWorkspaces({
  savedProjectDir = '',
  savedDashboardDir = '',
  root = __dirname,
  cwd = process.cwd(),
  env = process.env,
  timeBudgetMs = 3500,
  maxDirsVisited = 420,
  allowDriveScan = true,
  allowSiblingScan = null
} = {}) {
  const started = Date.now();
  const deadline = started + Math.max(200, Math.min(5000, Number(timeBudgetMs) || 1400));
  const envNoScan = env.OFFICE_AI_NO_DRIVE_SCAN === '1' || env.OFFICE_AI_NO_DRIVE_SCAN === 'true';
  const canScanDrives = Boolean(allowDriveScan) && !envNoScan;
  const canScanSiblings = allowSiblingScan === null ? canScanDrives : Boolean(allowSiblingScan);

  const projectMap = new Map();
  const dashboardMap = new Map();
  const visitedDirs = new Set();
  let dirsChecked = 0;
  let timedOut = false;

  const normKey = p => path.resolve(p).toLowerCase();

  async function testCandidate(dirPath, originTag) {
    if (!dirPath || isBlockedPath(dirPath)) return null;
    const abs = path.resolve(dirPath);
    const key = normKey(abs);
    if (visitedDirs.has(key)) {
      return {
        project: projectMap.get(key) || null,
        dashboard: dashboardMap.get(key) || null
      };
    }
    visitedDirs.add(key);
    dirsChecked++;

    const [proj, dash] = await Promise.all([
      inspectProjectDir(abs, env),
      inspectDashboardDir(abs, env)
    ]);
    if (proj.valid && !projectMap.has(key)) {
      projectMap.set(key, { ...proj, discoveredBy: originTag });
    }
    if (dash.valid && !dashboardMap.has(key)) {
      dashboardMap.set(key, { ...dash, discoveredBy: originTag });
    }
    return { project: proj.valid ? proj : null, dashboard: dash.valid ? dash : null };
  }

  async function scanChildren(parentDir, depth, maxDepth, originTag) {
    if (Date.now() >= deadline || dirsChecked >= maxDirsVisited) {
      timedOut = true;
      return;
    }
    if (!parentDir || isBlockedPath(parentDir)) return;
    let entries;
    try {
      entries = await fs.readdir(parentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (Date.now() >= deadline || dirsChecked >= maxDirsVisited) {
        timedOut = true;
        return;
      }
      if (!ent.isDirectory() || ent.isSymbolicLink()) continue;
      if (isIgnoredDirName(ent.name)) continue;
      const childPath = path.join(parentDir, ent.name);
      await testCandidate(childPath, originTag);
      if (depth < maxDepth) {
        const low = ent.name.toLowerCase();
        const worthDescending =
          PROJECT_CONTAINER_HINTS.has(low) ||
          /youtube|studio|video|project|work|repo|dev|code/i.test(low);
        if (worthDescending) {
          await scanChildren(childPath, depth + 1, maxDepth, originTag);
        }
      }
    }
  }

  // 1. Pengaturan tersimpan
  let savedProjectValid = null;
  const cleanSavedProj = cleanText(savedProjectDir, 300);
  if (cleanSavedProj && !isBlockedPath(cleanSavedProj)) {
    const absSaved = expandPortablePath(cleanSavedProj, env);
    const res = await testCandidate(absSaved, 'saved');
    if (res?.project) savedProjectValid = res.project;
    // Jika pengguna memilih subfolder di dalam proyek (mis. Channels/X/Videos), telusuri naik 3 tingkat
    if (!savedProjectValid) {
      let cur = path.dirname(absSaved);
      for (let i = 0; i < 3; i++) {
        if (!cur || cur === path.dirname(cur)) break;
        const upRes = await testCandidate(cur, 'saved_ancestor');
        if (upRes?.project) {
          savedProjectValid = upRes.project;
          break;
        }
        cur = path.dirname(cur);
      }
    }
  }

  let savedDashboardValid = null;
  const cleanSavedDash = cleanText(savedDashboardDir, 300);
  if (cleanSavedDash && !isBlockedPath(cleanSavedDash)) {
    const absDash = expandPortablePath(cleanSavedDash, env);
    const res = await testCandidate(absDash, 'saved');
    if (res?.dashboard) savedDashboardValid = res.dashboard;
  }

  // 2. Variabel lingkungan eksplisit
  let envProjectValid = null;
  const envProjRaw = cleanText(env.OFFICE_AI_PROJECT || env.OFFICE_PROJECT_ROOT || '', 300);
  if (envProjRaw && !isBlockedPath(envProjRaw)) {
    const res = await testCandidate(expandPortablePath(envProjRaw, env), 'env');
    if (res?.project) envProjectValid = res.project;
  }

  let envDashboardValid = null;
  const envDashRaw = cleanText(env.OFFICE_AI_DASHBOARD || '', 300);
  if (envDashRaw && !isBlockedPath(envDashRaw)) {
    const res = await testCandidate(expandPortablePath(envDashRaw, env), 'env');
    if (res?.dashboard) envDashboardValid = res.dashboard;
  }

  // 3. Telusuri naik dari folder aplikasi (root) dan cwd (+ saudara langsung 1 tingkat)
  const startAnchors = [];
  if (root && !String(root).toLowerCase().includes('.asar')) startAnchors.push(path.resolve(root));
  if (cwd) startAnchors.push(path.resolve(cwd));

  for (const anchor of startAnchors) {
    let cur = anchor;
    for (let level = 0; level < 4; level++) {
      if (Date.now() >= deadline) { timedOut = true; break; }
      await testCandidate(cur, 'walk_up');
      const parent = path.dirname(cur);
      if (canScanSiblings && level <= 1 && parent && parent !== cur) {
        // Cek folder saudara pada level dekat (depth 1 saja)
        await scanChildren(parent, 1, 1, 'sibling');
      }
      if (!parent || parent === cur) break;
      cur = parent;
    }
  }

  // 4. Pindai akar drive & %USERPROFILE% secara breadth-first: depth 1 semua akar (drive aktif dulu) lalu depth 2 bila masih dalam anggaran waktu
  if (canScanDrives && Date.now() < deadline) {
    const homeDir = cleanText(env.USERPROFILE || env.HOME || os.homedir?.() || '', 260);
    const activeDrive = (() => {
      const m = path.resolve(root || cwd || '').match(/^([A-Za-z]:[\\/])/);
      return m ? m[1].toUpperCase() : '';
    })();
    const rawDrives = await listDriveRoots([root, cwd, homeDir]);
    const driveRoots = [
      ...rawDrives.filter(d => d.toUpperCase() === activeDrive),
      ...rawDrives.filter(d => d.toUpperCase() !== activeDrive)
    ];
    // Pass 1 (breadth-first depth 1): cepat menemukan folder tingkat atas di drive aktif, drive lain, dan homeDir
    for (const drv of driveRoots) {
      if (Date.now() >= deadline || dirsChecked >= maxDirsVisited) { timedOut = true; break; }
      await scanChildren(drv, 1, 1, 'drive_scan');
    }
    if (homeDir && Date.now() < deadline && dirsChecked < maxDirsVisited && (await isRegularDir(homeDir))) {
      await scanChildren(homeDir, 1, 1, 'home_scan');
    }
    // Pass 2 (depth 2 pada folder kontainer proyek saja, mis. Projects/Work/Repos/Documents)
    for (const drv of driveRoots) {
      if (Date.now() >= deadline || dirsChecked >= maxDirsVisited) { timedOut = true; break; }
      await scanChildren(drv, 1, 2, 'drive_scan');
    }
    if (homeDir && Date.now() < deadline && dirsChecked < maxDirsVisited && (await isRegularDir(homeDir))) {
      await scanChildren(homeDir, 1, 2, 'home_scan');
    }
  }

  const projectCandidates = [...projectMap.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const dashboardCandidates = [...dashboardMap.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  // Aturan pemilihan otomatis: JANGAN pernah pilih otomatis tanpa konfirmasi bila kandidat > 1
  let effectiveProjectDir = '';
  let projectSource = 'none';
  let projectNeedsConfirmation = false;

  if (savedProjectValid) {
    effectiveProjectDir = savedProjectValid.path;
    projectSource = 'saved';
  } else if (cleanSavedProj) {
    // Pengguna menyimpan path secara eksplisit namun tidak punya Channels/*: hormati sebagai saved_invalid agar UI menjelaskan alasannya
    effectiveProjectDir = '';
    projectSource = 'saved_invalid';
    projectNeedsConfirmation = projectCandidates.length > 0;
  } else if (envProjectValid) {
    effectiveProjectDir = envProjectValid.path;
    projectSource = 'env';
  } else if (projectCandidates.length === 1) {
    effectiveProjectDir = projectCandidates[0].path;
    projectSource = 'discovered_single';
  } else if (projectCandidates.length > 1) {
    effectiveProjectDir = '';
    projectSource = 'ambiguous';
    projectNeedsConfirmation = true;
  }

  let effectiveDashboard = null;
  let dashboardSource = 'none';
  let dashboardNeedsConfirmation = false;

  if (savedDashboardValid) {
    effectiveDashboard = savedDashboardValid;
    dashboardSource = 'saved';
  } else if (envDashboardValid) {
    effectiveDashboard = envDashboardValid;
    dashboardSource = 'env';
  } else if (effectiveProjectDir) {
    const projDash = dashboardMap.get(normKey(effectiveProjectDir));
    if (projDash) {
      effectiveDashboard = projDash;
      dashboardSource = 'project';
    }
  }
  if (!effectiveDashboard) {
    if (cleanSavedDash) {
      dashboardSource = 'saved_invalid';
      dashboardNeedsConfirmation = dashboardCandidates.length > 0;
    } else if (dashboardCandidates.length === 1) {
      effectiveDashboard = dashboardCandidates[0];
      dashboardSource = 'discovered_single';
    } else if (dashboardCandidates.length > 1) {
      effectiveDashboard = null;
      dashboardSource = 'ambiguous';
      dashboardNeedsConfirmation = true;
    }
  }

  return {
    savedProjectDir: cleanSavedProj,
    effectiveProjectDir,
    effectiveProjectDisplay: formatPortablePath(effectiveProjectDir, env),
    projectSource,
    projectNeedsConfirmation,
    projectCandidates,
    savedDashboardDir: cleanSavedDash,
    effectiveDashboardDir: effectiveDashboard?.path || '',
    effectiveDashboardDisplay: formatPortablePath(effectiveDashboard?.path || '', env),
    effectiveDashboard,
    dashboardSource,
    dashboardNeedsConfirmation,
    dashboardCandidates,
    repoUrl: YOUTUBE_DASHBOARD_REPO_URL,
    stats: {
      dirsChecked,
      elapsedMs: Date.now() - started,
      timedOut,
      driveScanEnabled: canScanDrives
    }
  };
}

// [Diubah oleh Gemini - 2026-11-21] Penemuan folder kerja saudara secara generik (tanpa hardcode nama folder pribadi)
async function discoverSiblingWorkspaces({
  root = __dirname,
  projectDir = '',
  env = process.env,
  maxItems = 8
} = {}) {
  const results = [];
  const seen = new Set();

  async function tryPush(dirPath, kind) {
    if (!dirPath || isBlockedPath(dirPath) || results.length >= maxItems) return;
    const abs = path.resolve(dirPath);
    const key = abs.toLowerCase();
    if (seen.has(key)) return;
    if (!(await isRegularDir(abs))) return;
    seen.add(key);
    results.push({
      path: abs,
      displayPath: formatPortablePath(abs, env),
      label: path.basename(abs) || abs,
      kind
    });
  }

  async function hasWorkspaceMarker(dirPath) {
    for (const m of WORKSPACE_MARKERS) {
      try {
        await fs.lstat(path.join(dirPath, m));
        return true;
      } catch {}
    }
    return false;
  }

  const appDir = root && !String(root).toLowerCase().includes('.asar') ? path.resolve(root) : '';
  if (appDir) {
    await tryPush(appDir, 'app');
  }

  const parents = new Set();
  if (appDir && path.dirname(appDir) !== appDir) parents.add(path.dirname(appDir));
  if (projectDir) {
    const absProj = path.resolve(projectDir);
    if (path.dirname(absProj) !== absProj) parents.add(path.dirname(absProj));
  }

  for (const parent of parents) {
    if (results.length >= maxItems) break;
    let entries;
    try {
      entries = await fs.readdir(parent, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const ent of entries) {
      if (results.length >= maxItems) break;
      if (!ent.isDirectory() || ent.isSymbolicLink() || isIgnoredDirName(ent.name)) continue;
      const full = path.join(parent, ent.name);
      if (seen.has(full.toLowerCase()) || isBlockedPath(full)) continue;
      if (await hasWorkspaceMarker(full)) {
        await tryPush(full, 'sibling');
      }
    }
  }

  return results;
}

function createWorkspaceDiscovery({
  root = __dirname,
  cwd = process.cwd(),
  env = process.env,
  getSavedProjectDir = () => '',
  getSavedDashboardDir = () => '',
  allowDriveScan = true,
  cacheTtlMs = 20000
} = {}) {
  let cache = null;
  let cacheKey = '';
  let cacheAt = 0;
  let inflight = null;
  let inflightKey = '';

  // [Diubah oleh Gemini - 2026-11-21] Gabungkan pemindaian paralel (inflight) & jangan tahan cache lama bila pemindaian sempat timeout tanpa hasil
  async function discover({ forceRefresh = false } = {}) {
    const savedProjectDir = cleanText(typeof getSavedProjectDir === 'function' ? getSavedProjectDir() : '', 300);
    const savedDashboardDir = cleanText(typeof getSavedDashboardDir === 'function' ? getSavedDashboardDir() : '', 300);
    const key = `${savedProjectDir}|${savedDashboardDir}`;
    const effectiveTtl = cache?.stats?.timedOut && !cache?.effectiveProjectDir ? Math.min(2000, cacheTtlMs) : cacheTtlMs;
    if (!forceRefresh && cache && cacheKey === key && Date.now() - cacheAt < effectiveTtl) {
      return cache;
    }
    if (!forceRefresh && inflight && inflightKey === key) {
      return inflight;
    }
    inflightKey = key;
    const job = discoverWorkspaces({
      savedProjectDir,
      savedDashboardDir,
      root,
      cwd,
      env,
      allowDriveScan
    }).then(res => {
      cache = res;
      cacheKey = key;
      cacheAt = Date.now();
      return res;
    }).finally(() => {
      if (inflight === job) inflight = null;
    });
    inflight = job;
    return job;
  }

  function invalidate() {
    cache = null;
    cacheAt = 0;
    inflight = null;
  }

  return {
    discover,
    invalidate,
    isBlockedPath,
    inspectProjectDir: dir => inspectProjectDir(dir, env),
    inspectDashboardDir: dir => inspectDashboardDir(dir, env),
    discoverSiblingWorkspaces: opts => discoverSiblingWorkspaces({ root, env, ...opts }),
    formatPortablePath: p => formatPortablePath(p, env),
    expandPortablePath: p => expandPortablePath(p, env),
    repoUrl: YOUTUBE_DASHBOARD_REPO_URL
  };
}

module.exports = {
  YOUTUBE_DASHBOARD_REPO_URL,
  IGNORE_DIRS,
  isBlockedPath,
  formatPortablePath,
  expandPortablePath,
  inspectProjectDir,
  inspectDashboardDir,
  discoverWorkspaces,
  discoverSiblingWorkspaces,
  createWorkspaceDiscovery
};
