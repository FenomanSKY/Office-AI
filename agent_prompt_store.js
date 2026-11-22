// [Diubah oleh Gemini - 2026-11-21] V14: Audit & integrasi penuh Eksekutor Prompt Agen AI (6 penyedia, runAgent terprogram, deteksi PATH+lokasi umum Windows untuk aplikasi terpaket, jalur eksekutabel manual, daftar model nyata bertingkat + cache 10 menit + effort + perkiraan biaya, daftar cepat cwd + validasi, uji koneksi minimal, blokir tier -low Antigravity, deteksi usage limit, timeout per-panggilan, simpan hasil laporan, strip ANSI, precheck 9router Hermes)
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const http = require('node:http');
const { spawn, execFile } = require('node:child_process');

const MAX_OUTPUT_BYTES = 256 * 1024; // 256 KB per run
const MAX_RUNS_HISTORY = 50;
const RUN_TIMEOUT_MS = 10 * 60 * 1000; // 10 menit default
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 60 * 60 * 1000; // 60 menit maks untuk pipeline berat
const MAX_PROMPT_CHARS = 32000;
const MODEL_CACHE_TTL_MS = 10 * 60 * 1000; // Cache daftar model & versi 10 menit
const LAUNCHER_CACHE_TTL_MS = 60 * 1000;
const FORBIDDEN_PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MODEL_SLUG_RE = /^[a-zA-Z0-9._:/#-]{2,96}$/;
const EFFORT_VALUES = Object.freeze(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
const ANSI_ESCAPE_RE = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))/g;

// [Diubah oleh Gemini - 2026-11-21] Daftar bawaan non-low Antigravity (cadangan saat `agy models` tidak tersedia; melarang keras tier `-low`)
const ANTIGRAVITY_FALLBACK_CATALOG = Object.freeze([
  { id: 'gemini-4-neon-xhigh', label: 'Gemini 4 Neon (XHigh)', group: 'gemini4', recommended: true },
  { id: 'gemini-4-neon-high', label: 'Gemini 4 Neon (High)', group: 'gemini4', recommended: true },
  { id: 'gemini-4-argon-high', label: 'Gemini 4 Argon (High)', group: 'gemini4', recommended: true },
  { id: 'gemini-4-hydrogen-high', label: 'Gemini 4 Hydrogen (High)', group: 'gemini4', recommended: true },
  { id: 'gemini-4-hydrogen-xhigh', label: 'Gemini 4 Hydrogen (XHigh)', group: 'gemini4' },
  { id: 'gemini-4-neon-medium', label: 'Gemini 4 Neon (Medium)', group: 'gemini4' },
  { id: 'gemini-4-argon-medium', label: 'Gemini 4 Argon (Medium)', group: 'gemini4' },
  { id: 'gemini-4-hydrogen-medium', label: 'Gemini 4 Hydrogen (Medium)', group: 'gemini4' },
  { id: 'gemini-3.8-flash-high', label: 'Gemini 3.8 Flash (High)', group: 'flash', recommended: true },
  { id: 'gemini-3.8-flash-medium', label: 'Gemini 3.8 Flash (Medium)', group: 'flash' },
  { id: 'claude-opus-5-5-high', label: 'Claude Opus 5.5 (High)', group: 'claude' },
  { id: 'claude-opus-5-5-medium', label: 'Claude Opus 5.5 (Medium)', group: 'claude' },
  { id: 'claude-sonnet-5-5-high', label: 'Claude Sonnet 5.5 (High)', group: 'claude' },
  { id: 'claude-sonnet-5-5-medium', label: 'Claude Sonnet 5.5 (Medium)', group: 'claude' },
  { id: 'gpt-oss-120b-medium', label: 'GPT-OSS 120B (Medium)', group: 'other' }
]);

const ANTIGRAVITY_RECOMMENDED_MODELS = Object.freeze(ANTIGRAVITY_FALLBACK_CATALOG.map(m => m.id));

// [Diubah oleh Gemini - 2026-11-21] Alias standar cx_run.py (Codex) & oc_run.py (OpenCode Go)
const CODEX_DEFAULT_ALIASES = Object.freeze({
  'sol-m': { model: 'gpt-6.1-sol', effort: 'medium', label: 'sol-m · GPT-6.1 Sol (Medium)' },
  'sol-h': { model: 'gpt-6.1-sol', effort: 'high', label: 'sol-h · GPT-6.1 Sol (High)' },
  'sol-xh': { model: 'gpt-6.1-sol', effort: 'xhigh', label: 'sol-xh · GPT-6.1 Sol (XHigh)' },
  'astra-h': { model: 'gpt-6-astra', effort: 'high', label: 'astra-h · GPT-6 Astra (High)' },
  'astra-xh': { model: 'gpt-6-astra', effort: 'xhigh', label: 'astra-xh · GPT-6 Astra (XHigh)' }
});

const OPENCODE_MODEL_ALIASES = Object.freeze({
  cepat: 'opencode-go/claude-haiku-5-5',
  naskah: 'opencode-go/gemini-4-argon',
  naskah2: 'opencode-go/glm-5.3',
  umum: 'opencode-go/qwen3.8-flash',
  kode: 'opencode-go/kimi-k2.7-code',
  ringan: 'opencode-go/minimax-m3'
});

const OPENCODE_FALLBACK_MODELS = Object.freeze([
  'opencode-go/claude-haiku-5-5',
  'opencode-go/gemini-4-argon',
  'opencode-go/glm-5.3',
  'opencode-go/deepseek-v4-pro',
  'opencode-go/deepseek-v4.1-flash',
  'opencode-go/qwen3.8-flash',
  'opencode-go/qwen3.8-max',
  'opencode-go/kimi-k2.7-code',
  'opencode-go/kimi-k3.1-pro',
  'opencode-go/gpt-6-luna',
  'opencode-go/grok-4.7',
  'opencode-go/minimax-m3'
]);

const CLAUDE_MODELS = Object.freeze([
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', group: 'claude55', recommended: true },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', group: 'claude55', recommended: true },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', group: 'claude55' }
]);

function stripAnsi(str) {
  return String(str || '').replace(ANSI_ESCAPE_RE, '');
}

function isLowTierModel(model) {
  return /(?:^|[-_/])low$/i.test(String(model || '').trim());
}

// [Diubah oleh Gemini - 2026-11-21] Validasi model Antigravity: tolak tier `-low` secara ketat sesuai aturan proyek
function validateAntigravityModel(model) {
  const m = String(model || '').trim();
  if (!m) return { ok: true, resolved: 'gemini-4-argon-high' };
  if (!MODEL_SLUG_RE.test(m)) {
    return { ok: false, code: 'invalid_model', error: 'Format slug model Antigravity tidak valid' };
  }
  if (isLowTierModel(m)) {
    return {
      ok: false,
      code: 'forbidden_low_tier_model',
      error:
        'Model tier low dilarang untuk Antigravity (aturan proyek). Gunakan tier high/xhigh/medium seperti gemini-4-argon-high atau gemini-4-neon-xhigh.'
    };
  }
  return { ok: true, resolved: m };
}

function resolveOpencodeModel(rawModel) {
  const m = String(rawModel || '').trim();
  if (!m) return 'opencode-go/claude-haiku-5-5';
  const alias = OPENCODE_MODEL_ALIASES[m.toLowerCase()];
  if (alias) return alias;
  if (m.includes('/')) return m;
  return 'opencode-go/' + m;
}

function resolveCodexModelAndEffort(rawModel, rawEffort) {
  const m = String(rawModel || '').trim();
  const explicitEffort = String(rawEffort || '').trim().toLowerCase();
  const aliasEntry = m ? CODEX_DEFAULT_ALIASES[m.toLowerCase()] : null;
  if (aliasEntry) {
    return {
      model: aliasEntry.model,
      effort: explicitEffort || aliasEntry.effort,
      aliasUsed: m.toLowerCase()
    };
  }
  return {
    model: m,
    effort: explicitEffort,
    aliasUsed: ''
  };
}

function normalizeEffortForAgent(agentId, rawEffort) {
  const e = String(rawEffort || '').trim().toLowerCase();
  if (!e) return '';
  if (!EFFORT_VALUES.includes(e)) return '';
  if (agentId === 'claude') return ['low', 'medium', 'high', 'max'].includes(e) ? e : '';
  if (agentId === 'codex') return ['low', 'medium', 'high', 'xhigh', 'max'].includes(e) ? e : '';
  if (agentId === 'hermes') return ['none', 'minimal', 'low', 'medium', 'high'].includes(e) ? e : '';
  return '';
}

// [Diubah oleh Gemini - 2026-11-21] Deteksi pesan usage limit / rate limit / HTTP 429 lintas penyedia + ekstraksi waktu pulih
const STRONG_LIMIT_PATTERNS = [
  /semua akun[^\n]{0,40}kena limit/i,
  /\busage limit\b/i,
  /\bhit your\b[^\n]{0,40}\blimit\b/i,
  /\blimit reached\b/i,
  /\breached your\b[^\n]{0,40}\blimit\b/i,
  /\bquota exceeded\b/i,
  /\bexceeded your\b[^\n]{0,40}\b(?:quota|limit)\b/i,
  /\binsufficient_quota\b/i,
  /\bresource_exhausted\b/i,
  /\btoo many requests\b/i,
  /\bhttp\s*(?:error\s*)?429\b/i
];

const GENERAL_LIMIT_PATTERNS = [
  ...STRONG_LIMIT_PATTERNS,
  /\brate[\s-]*limit(?:ed)?\b/i,
  /\btry again (?:in|at|after)\b/i,
  /\bstatus[:\s]+429\b/i,
  /\b429\b[^\n]{0,40}\b(?:limit|quota|requests|exhausted)\b/i,
  /\bquota\b[^\n]{0,40}\b(?:exceeded|exhausted|depleted|habis)\b/i
];

function extractRetryAfter(text) {
  const s = String(text || '');
  const patterns = [
    /try again (?:in|at|after)\s+([0-9]{1,2}:[0-9]{2}(?:\s*(?:AM|PM|WIB|UTC))?|[0-9]+\s*(?:s|sec|seconds?|m|min|minutes?|h|hr|hours?|d|days?)(?:\s+[0-9]+\s*(?:m|min|minutes?|s|sec))?)/i,
    /retry[- ]?after[:\s]+([0-9]+(?:\s*(?:s|sec|seconds?|m|min|h|hr))?)/i,
    /resets?\s+(?:at|in)\s+([0-9]{1,2}:[0-9]{2}(?:\s*(?:AM|PM|WIB|UTC))?|[0-9]+\s*(?:m|min|minutes?|h|hr|hours?))/i
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

function detectUsageLimit(text, exitCode = 0) {
  const clean = stripAnsi(text || '');
  const isErrorExit = exitCode !== null && exitCode !== undefined && Number(exitCode) !== 0;
  if (Number(exitCode) === 429) {
    return { limited: true, retryAfter: extractRetryAfter(clean), matched: 'HTTP 429' };
  }
  const patterns = isErrorExit ? GENERAL_LIMIT_PATTERNS : STRONG_LIMIT_PATTERNS;
  if (!isErrorExit && clean.trim().length > 600) {
    return { limited: false, retryAfter: null, matched: null };
  }
  for (const re of patterns) {
    const m = clean.match(re);
    if (m) {
      return { limited: true, retryAfter: extractRetryAfter(clean), matched: m[0] };
    }
  }
  return { limited: false, retryAfter: null, matched: null };
}

// [Diubah oleh Gemini - 2026-11-21] Daftar ketat 6 agen yang diizinkan + argumen Windows nyata terverifikasi (`--help`) + dukungan effort & Full Access eksplisit
const WHITELISTED_AGENTS = Object.freeze({
  claude: {
    id: 'claude',
    name: 'Claude Code',
    binary: 'claude',
    residentProvider: 'claude',
    supportsFullAccess: true,
    supportsEffort: true,
    effortOptions: ['low', 'medium', 'high', 'max'],
    defaultModel: '',
    defaultEffort: '',
    billingType: 'subscription_claude',
    fullAccessFlagsOn: '--dangerously-skip-permissions',
    fullAccessFlagsOff: '--permission-mode plan',
    buildInvocation({ prompt, model, effort, fullAccess }) {
      const safePrompt = prompt.startsWith('-') ? ' ' + prompt : prompt;
      const args = ['-p', safePrompt, '--output-format', 'text'];
      if (model) args.push('--model', model);
      const eff = normalizeEffortForAgent('claude', effort);
      if (eff) args.push('--effort', eff);
      if (fullAccess) {
        args.push('--dangerously-skip-permissions');
      } else {
        args.push('--permission-mode', 'plan');
      }
      return { args, stdinText: null, resolvedModel: model || '', resolvedEffort: eff };
    },
    buildArgs(params) {
      return this.buildInvocation(params).args;
    },
    buildPreview({ model, effort, fullAccess }) {
      const flags = ['-p "<prompt>"', '--output-format text'];
      if (model) flags.push(`--model ${model}`);
      const eff = normalizeEffortForAgent('claude', effort);
      if (eff) flags.push(`--effort ${eff}`);
      flags.push(fullAccess ? '--dangerously-skip-permissions' : '--permission-mode plan');
      return `claude ${flags.join(' ')}`;
    }
  },
  codex: {
    id: 'codex',
    name: 'Codex CLI',
    binary: 'codex',
    residentProvider: 'codex',
    supportsFullAccess: true,
    supportsEffort: true,
    effortOptions: ['low', 'medium', 'high', 'xhigh', 'max'],
    defaultModel: '',
    defaultEffort: '',
    billingType: 'subscription_chatgpt',
    fullAccessFlagsOn: '--dangerously-bypass-approvals-and-sandbox',
    fullAccessFlagsOff: '--sandbox read-only',
    buildInvocation({ prompt, model, effort, fullAccess }) {
      const resolved = resolveCodexModelAndEffort(model, effort);
      const eff = normalizeEffortForAgent('codex', resolved.effort);
      const args = ['exec', '--skip-git-repo-check', '--color', 'never'];
      if (resolved.model) args.push('-m', resolved.model);
      if (eff) args.push('-c', `model_reasoning_effort="${eff}"`);
      if (fullAccess) {
        args.push('--dangerously-bypass-approvals-and-sandbox');
      } else {
        args.push('--sandbox', 'read-only');
      }
      args.push('-');
      return { args, stdinText: prompt, resolvedModel: resolved.model || '', resolvedEffort: eff };
    },
    buildArgs(params) {
      return this.buildInvocation(params).args;
    },
    buildPreview({ model, effort, fullAccess }) {
      const resolved = resolveCodexModelAndEffort(model, effort);
      const eff = normalizeEffortForAgent('codex', resolved.effort);
      const flags = ['exec', '--skip-git-repo-check', '--color never'];
      if (resolved.model) flags.push(`-m ${resolved.model}`);
      if (eff) flags.push(`-c model_reasoning_effort="${eff}"`);
      flags.push(fullAccess ? '--dangerously-bypass-approvals-and-sandbox' : '--sandbox read-only');
      flags.push('- < prompt');
      return `codex ${flags.join(' ')}`;
    }
  },
  antigravity: {
    id: 'antigravity',
    name: 'Antigravity (agy)',
    binary: 'agy',
    residentProvider: 'gemini',
    supportsFullAccess: true,
    supportsEffort: false,
    effortOptions: [],
    defaultModel: 'gemini-4-argon-high',
    defaultEffort: '',
    billingType: 'quota_antigravity',
    recommendedModels: ANTIGRAVITY_RECOMMENDED_MODELS,
    fullAccessFlagsOn: '--dangerously-skip-permissions',
    fullAccessFlagsOff: '--mode plan --sandbox',
    buildInvocation({ prompt, model, fullAccess }) {
      const check = validateAntigravityModel(model);
      if (!check.ok) {
        throw httpError(400, check.code, check.error);
      }
      const resolvedModel = check.resolved;
      const safePrompt = prompt.startsWith('-') ? ' ' + prompt : prompt;
      const args = ['-p', safePrompt, '--output-format', 'text', '--model', resolvedModel];
      if (fullAccess) {
        args.push('--dangerously-skip-permissions');
      } else {
        args.push('--mode', 'plan', '--sandbox');
      }
      return { args, stdinText: null, resolvedModel, resolvedEffort: '' };
    },
    buildArgs(params) {
      return this.buildInvocation(params).args;
    },
    buildPreview({ model, fullAccess }) {
      const resolved = String(model || '').trim() || 'gemini-4-argon-high';
      const flags = ['-p "<prompt>"', '--output-format text', `--model ${resolved}`];
      flags.push(fullAccess ? '--dangerously-skip-permissions' : '--mode plan --sandbox');
      return `agy ${flags.join(' ')}`;
    }
  },
  opencode: {
    id: 'opencode',
    name: 'OpenCode',
    binary: 'opencode',
    residentProvider: 'codex',
    supportsFullAccess: true,
    supportsEffort: false,
    effortOptions: [],
    defaultModel: 'opencode-go/claude-haiku-5-5',
    defaultEffort: '',
    billingType: 'subscription_opencode',
    fullAccessFlagsOn: '--auto',
    fullAccessFlagsOff: '(tanpa --auto · izin standar)',
    buildInvocation({ prompt, model, fullAccess }) {
      const resolvedModel = resolveOpencodeModel(model);
      const args = ['run', '-m', resolvedModel];
      if (fullAccess) args.push('--auto');
      args.push(prompt);
      return { args, stdinText: null, resolvedModel, resolvedEffort: '' };
    },
    buildArgs(params) {
      return this.buildInvocation(params).args;
    },
    buildPreview({ model, fullAccess }) {
      const resolved = resolveOpencodeModel(model);
      const flags = ['run', `-m ${resolved}`];
      if (fullAccess) flags.push('--auto');
      flags.push('"<prompt>"');
      return `opencode ${flags.join(' ')}`;
    }
  },
  hermes: {
    id: 'hermes',
    name: 'Hermes Agent',
    binary: 'hermes',
    residentProvider: 'hermes',
    supportsFullAccess: true,
    supportsEffort: true,
    effortOptions: ['none', 'minimal', 'low', 'medium', 'high'],
    defaultModel: '',
    defaultEffort: 'medium',
    billingType: 'local_9router',
    fullAccessFlagsOn: '--yolo',
    fullAccessFlagsOff: '(tanpa --yolo · konfirmasi alat)',
    buildInvocation({ prompt, model, effort, fullAccess, cwd, timeoutMs }) {
      const budgetSec = Math.max(15, Math.min(300, Math.floor((timeoutMs || 60000) / 1000)));
      const eff = normalizeEffortForAgent('hermes', effort) || 'medium';
      const args = ['chat', '-Q', '--oneshot', '--reasoning', eff, '--run-budget', String(budgetSec)];
      if (cwd) args.push('--in', cwd);
      if (model) args.push('-m', model);
      if (fullAccess) args.push('--yolo');
      args.push('--query-file', '-');
      return { args, stdinText: prompt, resolvedModel: model || '', resolvedEffort: eff };
    },
    buildArgs(params) {
      return this.buildInvocation(params).args;
    },
    buildPreview({ model, effort, fullAccess }) {
      const eff = normalizeEffortForAgent('hermes', effort) || 'medium';
      const flags = [`chat -Q --oneshot --reasoning ${eff}`];
      if (model) flags.push(`-m ${model}`);
      if (fullAccess) flags.push('--yolo');
      flags.push('--query-file - < prompt');
      return `hermes ${flags.join(' ')}`;
    }
  },
  'gemini-api': {
    id: 'gemini-api',
    name: 'Gemini API (BYOK)',
    binary: 'gemini-api',
    residentProvider: 'gemini',
    supportsFullAccess: false,
    supportsEffort: false,
    effortOptions: [],
    defaultModel: 'gemini-2.5-flash',
    defaultEffort: '',
    billingType: 'byok_payg',
    // [Diubah oleh Gemini - 2026-11-21] Gunakan label netral agar konsisten lintas bahasa
    fullAccessFlagsOn: 'REST API (no shell/file access)',
    fullAccessFlagsOff: 'REST API (no shell/file access)',
    buildInvocation({ model }) {
      return { args: [], stdinText: null, resolvedModel: model || 'gemini-2.5-flash', resolvedEffort: '' };
    },
    buildArgs() {
      return [];
    },
    buildPreview({ model }) {
      return `POST generativelanguage.googleapis.com (${model || 'gemini-2.5-flash'})`;
    }
  }
});

function httpError(status, code, message) {
  const err = new Error(message || code);
  err.status = status;
  err.code = code;
  return err;
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function assertSafeObject(obj) {
  if (!isPlainObject(obj)) {
    throw httpError(400, 'invalid_payload', 'Payload harus berupa objek JSON');
  }
  for (const k of Object.getOwnPropertyNames(obj)) {
    if (FORBIDDEN_PROTO_KEYS.has(k)) {
      throw httpError(400, 'forbidden_prototype_key', 'Properti prototipe tidak diizinkan');
    }
  }
}

function cleanText(val, maxLen = 400) {
  if (val === undefined || val === null) return '';
  return String(val).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLen);
}

function isBlockedCwd(targetPath) {
  const norm = String(targetPath || '').replace(/\\/g, '/');
  return norm
    .split('/')
    .filter(Boolean)
    .some(seg => /^(secrets|\.git|\.env)$/i.test(seg));
}

function isInsideDir(baseDir, candidatePath) {
  const rel = path.relative(path.resolve(baseDir), path.resolve(candidatePath));
  return Boolean(rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

// [Diubah oleh Gemini - 2026-11-21] Ekspansi variabel lingkungan Windows & ~ secara aman untuk jalur eksekutabel manual
function expandPortablePath(rawPath) {
  const cleaned = cleanText(rawPath, 320);
  if (!cleaned) return '';
  let out = cleaned;
  const home = os.homedir() || process.env.USERPROFILE || '';
  if (out.startsWith('~/') || out.startsWith('~\\')) {
    out = path.join(home, out.slice(2));
  }
  const envMap = {
    LOCALAPPDATA: process.env.LOCALAPPDATA || '',
    APPDATA: process.env.APPDATA || '',
    USERPROFILE: process.env.USERPROFILE || home,
    PROGRAMFILES: process.env.ProgramFiles || '',
    'PROGRAMFILES(X86)': process.env['ProgramFiles(x86)'] || ''
  };
  out = out.replace(/%([A-Za-z0-9_()]+)%/g, (full, key) => {
    const val = envMap[key.toUpperCase()];
    return val ? val : full;
  });
  return path.resolve(out);
}

// [Diubah oleh Gemini - 2026-11-21] Format jalur untuk tampilan UI/API tanpa membocorkan nama akun pengguna OS
function formatPortablePath(absPath) {
  if (!absPath) return '';
  const norm = path.resolve(absPath);
  const replacements = [
    [process.env.LOCALAPPDATA, '%LOCALAPPDATA%'],
    [process.env.APPDATA, '%APPDATA%'],
    [process.env.USERPROFILE || os.homedir(), '~']
  ].filter(([prefix]) => prefix && prefix.length > 3);
  const low = norm.toLowerCase();
  for (const [prefix, token] of replacements) {
    const pNorm = path.resolve(prefix);
    const pLow = pNorm.toLowerCase();
    if (low === pLow) return token;
    if (low.startsWith(pLow + path.sep)) {
      return token + norm.slice(pNorm.length);
    }
  }
  return norm;
}

// [Diubah oleh Gemini - 2026-11-21] Daftar lokasi instalasi CLI umum Windows/POSIX agar Electron terpaket tetap menemukan `agy`, `claude`, `codex`, `opencode`, `hermes` walau PATH minim
function getCommonCliDirs(binaryName = '') {
  const dirs = [];
  const add = d => {
    if (d && !dirs.some(x => x.toLowerCase() === d.toLowerCase())) dirs.push(d);
  };
  const localApp = process.env.LOCALAPPDATA || '';
  const appData = process.env.APPDATA || '';
  const home = process.env.USERPROFILE || os.homedir() || '';
  const progFiles = process.env.ProgramFiles || '';

  if (process.platform === 'win32') {
    if (localApp) {
      if (binaryName === 'agy') add(path.join(localApp, 'agy', 'bin'));
      if (binaryName === 'hermes') add(path.join(localApp, 'hermes', 'bin'));
      add(path.join(localApp, 'agy', 'bin'));
      add(path.join(localApp, 'hermes', 'bin'));
      add(path.join(localApp, 'Microsoft', 'WinGet', 'Links'));
      if (binaryName) {
        add(path.join(localApp, 'Programs', binaryName));
        add(path.join(localApp, 'Programs', binaryName, 'bin'));
      }
      add(path.join(localApp, 'Programs', 'Antigravity', 'bin'));
      add(path.join(localApp, 'Programs', 'claude-code'));
      add(path.join(localApp, 'Volta', 'bin'));
    }
    if (appData) {
      add(path.join(appData, 'npm'));
    }
    if (home) {
      add(path.join(home, '.local', 'bin'));
      add(path.join(home, '.claude', 'local'));
      add(path.join(home, '.claude', 'bin'));
      add(path.join(home, '.opencode', 'bin'));
      add(path.join(home, '.bun', 'bin'));
      add(path.join(home, '.cargo', 'bin'));
      add(path.join(home, 'scoop', 'shims'));
    }
    if (progFiles) {
      add(path.join(progFiles, 'nodejs'));
    }
  } else {
    if (home) {
      add(path.join(home, '.local', 'bin'));
      add(path.join(home, '.npm-global', 'bin'));
      add(path.join(home, '.bun', 'bin'));
      add(path.join(home, '.cargo', 'bin'));
    }
    add('/usr/local/bin');
    add('/opt/homebrew/bin');
  }
  return dirs;
}

function buildAugmentedPathEnv(extraDirs = []) {
  const sep = process.platform === 'win32' ? ';' : ':';
  const current = String(process.env.PATH || process.env.Path || '')
    .split(sep)
    .map(s => s.trim())
    .filter(Boolean);
  const seen = new Set(current.map(s => s.toLowerCase()));
  const merged = [...current];
  for (const d of [...extraDirs, ...getCommonCliDirs()]) {
    if (!d) continue;
    const key = d.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(d);
    }
  }
  return merged.join(sep);
}

async function fileExistsExecutable(filePath) {
  if (!filePath) return false;
  try {
    const st = await fs.stat(filePath);
    return st.isFile();
  } catch {
    return false;
  }
}

function runWhereExe(binaryName, envPath = null) {
  return new Promise(resolve => {
    const checker = process.platform === 'win32' ? 'where.exe' : 'which';
    const env = envPath ? { ...process.env, PATH: envPath, Path: envPath } : process.env;
    execFile(
      checker,
      [binaryName],
      { windowsHide: true, shell: false, timeout: 4000, env },
      (err, stdout) => {
        if (err || !stdout) {
          resolve([]);
          return;
        }
        const lines = String(stdout)
          .split(/\r?\n/)
          .map(l => l.trim())
          .filter(Boolean);
        resolve(lines);
      }
    );
  });
}

// [Diubah oleh Gemini - 2026-11-21] Cek ringan 9router lokal (127.0.0.1:20128) + ambil daftar model bila aktif
function probeLocal9RouterModels(timeoutMs = 600) {
  return new Promise(resolve => {
    const req = http.get(
      {
        hostname: '127.0.0.1',
        port: 20128,
        path: '/v1/models',
        timeout: timeoutMs
      },
      res => {
        let body = '';
        res.on('data', c => {
          if (body.length < 65536) body += c.toString('utf8');
        });
        res.on('end', () => {
          const ok = res.statusCode >= 200 && res.statusCode < 500;
          let models = [];
          try {
            const parsed = JSON.parse(body);
            if (Array.isArray(parsed?.data)) {
              models = parsed.data.map(m => String(m?.id || '').trim()).filter(Boolean);
            }
          } catch {}
          resolve({ ok, models });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, models: [] });
    });
    req.on('error', () => resolve({ ok: false, models: [] }));
  });
}

async function probeLocal9Router(timeoutMs = 600) {
  const res = await probeLocal9RouterModels(timeoutMs);
  return res.ok;
}

// [Diubah oleh Gemini - 2026-11-21] Bongkar shim .cmd/.exe Windows ke eksekutabel langsung tanpa shell, aman untuk Electron terpaket
async function resolveSingleCandidate(candidatePath, sourceTag = 'path', envPath = null) {
  if (!candidatePath || !(await fileExistsExecutable(candidatePath))) return null;

  if (/\.exe$/i.test(candidatePath)) {
    return {
      installed: true,
      executable: candidatePath,
      prefixArgs: [],
      resolvedLabel: path.basename(candidatePath),
      resolvedDisplay: formatPortablePath(candidatePath),
      source: sourceTag
    };
  }

  if (process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(candidatePath)) {
    try {
      const cmdDir = path.dirname(candidatePath);
      const content = await fs.readFile(candidatePath, 'utf8');

      // Shim memanggil binary .exe di bawah %dp0% (mis. opencode.exe)
      const exeMatch = content.match(/"%(?:~)?dp0%\\([^"]+\.exe)"/i);
      if (exeMatch) {
        const innerExe = path.join(cmdDir, exeMatch[1]);
        if (await fileExistsExecutable(innerExe)) {
          return {
            installed: true,
            executable: innerExe,
            prefixArgs: [],
            resolvedLabel: path.basename(innerExe),
            resolvedDisplay: formatPortablePath(innerExe),
            source: sourceTag
          };
        }
      }

      // Shim memanggil script Node .js/.mjs/.cjs di bawah %dp0% (mis. codex.js)
      const jsMatch = content.match(/"%(?:~)?dp0%\\([^"]+\.(?:c|m)?js)"/i);
      if (jsMatch) {
        const innerJs = path.join(cmdDir, jsMatch[1]);
        if (await fileExistsExecutable(innerJs)) {
          const bundledNode = path.join(cmdDir, 'node.exe');
          const progNode = process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'nodejs', 'node.exe') : '';
          let nodeExe = (await fileExistsExecutable(bundledNode))
            ? bundledNode
            : (progNode && (await fileExistsExecutable(progNode)))
              ? progNode
              : null;
          if (!nodeExe) {
            const nodeWhere = await runWhereExe('node', envPath);
            nodeExe = nodeWhere.find(m => /\.exe$/i.test(m)) || nodeWhere[0] || process.execPath;
          }
          return {
            installed: true,
            executable: nodeExe,
            prefixArgs: [innerJs],
            resolvedLabel: path.basename(innerJs),
            resolvedDisplay: formatPortablePath(candidatePath),
            source: sourceTag
          };
        }
      }
    } catch {
      /* lanjut ke wrapper cmd.exe /d /c */
    }

    const comspec = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
    return {
      installed: true,
      executable: comspec,
      prefixArgs: ['/d', '/c', candidatePath],
      resolvedLabel: path.basename(candidatePath),
      resolvedDisplay: formatPortablePath(candidatePath),
      source: sourceTag
    };
  }

  return {
    installed: true,
    executable: candidatePath,
    prefixArgs: [],
    resolvedLabel: path.basename(candidatePath),
    resolvedDisplay: formatPortablePath(candidatePath),
    source: sourceTag
  };
}

// [Diubah oleh Gemini - 2026-11-21] Resolusi launcher multi-lapis: Override manual -> PATH + lokasi umum Windows -> where.exe + PATHEXT
async function resolveWindowsCliLauncher(binaryName, { overridePath = '', extraDirs = [], envPathOverride = null } = {}) {
  // 1. Cek jalur eksekutabel manual bila disetel user
  if (overridePath) {
    const expanded = expandPortablePath(overridePath);
    if (expanded && !isBlockedCwd(expanded)) {
      const resolvedOverride = await resolveSingleCandidate(expanded, 'override', envPathOverride);
      if (resolvedOverride) return { ...resolvedOverride, overrideInvalid: false };
    }
    return {
      installed: false,
      executable: null,
      prefixArgs: [],
      resolvedLabel: '',
      resolvedDisplay: formatPortablePath(expanded || overridePath),
      source: 'override_missing',
      overrideInvalid: true
    };
  }

  const augPath = envPathOverride || buildAugmentedPathEnv(extraDirs);
  const pathExts =
    process.platform === 'win32'
      ? ['.exe', '.cmd', '.bat', ...String(process.env.PATHEXT || '').split(';').map(s => s.trim().toLowerCase()).filter(Boolean)]
      : [''];
  const uniqueExts = [...new Set(pathExts)];

  // 2. Cek where.exe di PATH saat ini + PATH diperkaya
  const rawMatches = await runWhereExe(binaryName, augPath);
  if (rawMatches.length === 0 && process.platform === 'win32') {
    const cmdMatches = await runWhereExe(`${binaryName}.cmd`, augPath);
    rawMatches.push(...cmdMatches);
  }

  // Utamakan .exe langsung, lalu .cmd/.bat, lalu lainnya
  const ordered = [
    ...rawMatches.filter(m => /\.exe$/i.test(m)),
    ...rawMatches.filter(m => /\.(?:cmd|bat)$/i.test(m)),
    ...rawMatches.filter(m => !/\.(?:exe|cmd|bat)$/i.test(m))
  ];
  for (const cand of ordered) {
    const resolved = await resolveSingleCandidate(cand, 'path', augPath);
    if (resolved) return resolved;
  }

  // 3. Pindai langsung lokasi umum Windows/POSIX (penting saat berjalan dari Electron terpaket dengan PATH minim!)
  const commonDirs = [...extraDirs, ...getCommonCliDirs(binaryName)];
  for (const dir of commonDirs) {
    for (const ext of uniqueExts) {
      const cand = path.join(dir, ext ? `${binaryName}${ext}` : binaryName);
      const resolved = await resolveSingleCandidate(cand, 'common_dir', augPath);
      if (resolved) return resolved;
    }
  }

  return {
    installed: false,
    executable: null,
    prefixArgs: [],
    resolvedLabel: '',
    resolvedDisplay: '',
    source: 'none',
    overrideInvalid: false
  };
}

function runQuickCliCommand(launcher, args, { timeoutMs = 6000 } = {}) {
  return new Promise(resolve => {
    if (!launcher || !launcher.installed || !launcher.executable) {
      resolve({ ok: false, stdout: '', stderr: '', code: 127 });
      return;
    }
    const execDir = path.dirname(launcher.executable);
    const env = {
      ...process.env,
      PATH: buildAugmentedPathEnv([execDir]),
      Path: buildAugmentedPathEnv([execDir]),
      NO_COLOR: '1',
      FORCE_COLOR: '0',
      PYTHONIOENCODING: 'utf-8'
    };
    execFile(
      launcher.executable,
      [...(launcher.prefixArgs || []), ...args],
      { windowsHide: true, shell: false, timeout: timeoutMs, maxBuffer: 512 * 1024, env },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          stdout: stripAnsi(String(stdout || '')),
          stderr: stripAnsi(String(stderr || '')),
          code: err ? (typeof err.code === 'number' ? err.code : 1) : 0
        });
      }
    );
  });
}

// [Diubah oleh Gemini - 2026-11-21] Resolve Python lokal (melewati alias kosong WindowsApps) untuk runner Job Object Windows
let cachedJobRunnerPython = undefined;
function resolveJobRunnerPython() {
  if (cachedJobRunnerPython !== undefined) return cachedJobRunnerPython;
  const fsSync = require('node:fs');
  const { execFileSync } = require('node:child_process');
  const envPy = String(process.env.OFFICE_PYTHON || '').trim();
  if (envPy && !/WindowsApps[\\/]python\.exe$/i.test(envPy) && fsSync.existsSync(envPy)) {
    cachedJobRunnerPython = envPy;
    return cachedJobRunnerPython;
  }
  if (process.platform === 'win32') {
    try {
      const out = execFileSync('where.exe', ['python'], { encoding: 'utf8', windowsHide: true, timeout: 3000 });
      for (const line of out.split(/\r?\n/).map(s => s.trim()).filter(Boolean)) {
        if (!/WindowsApps[\\/]python\.exe$/i.test(line) && fsSync.existsSync(line)) {
          cachedJobRunnerPython = line;
          return cachedJobRunnerPython;
        }
      }
    } catch {}
    const home = process.env.USERPROFILE || os.homedir() || '';
    const localApp = process.env.LOCALAPPDATA || (home ? path.join(home, 'AppData', 'Local') : '');
    const common = [
      path.join(localApp, 'Python', 'bin', 'python.exe'),
      path.join(localApp, 'Programs', 'Python', 'Python314', 'python.exe'),
      path.join(localApp, 'Programs', 'Python', 'Python313', 'python.exe'),
      path.join(localApp, 'Programs', 'Python', 'Python312', 'python.exe'),
      path.join(localApp, 'Programs', 'Python', 'Python311', 'python.exe')
    ];
    for (const c of common) {
      if (c && fsSync.existsSync(c)) {
        cachedJobRunnerPython = c;
        return cachedJobRunnerPython;
      }
    }
    cachedJobRunnerPython = '';
    return '';
  }
  cachedJobRunnerPython = 'python3';
  return cachedJobRunnerPython;
}

// [Diubah oleh Gemini - 2026-11-21] Penghentian pohon proses terverifikasi (tutup pipa Job Object + taskkill 10s + tunggu keluar)
function killProcessTreeSafe(childProc, { usingJobRunner = false } = {}) {
  if (!childProc) return Promise.resolve({ ok: true, exited: true });
  const pid = childProc.pid;
  const alreadyGone = () => childProc.exitCode !== null || childProc.signalCode !== null;
  if (alreadyGone()) return Promise.resolve({ ok: true, exited: true });

  return new Promise(resolve => {
    let settled = false;
    const done = res => {
      if (settled) return;
      settled = true;
      resolve(res);
    };

    const waitExit = new Promise(resExit => {
      if (alreadyGone()) return resExit(true);
      const onEnd = () => {
        clearTimeout(t);
        resExit(true);
      };
      const t = setTimeout(() => {
        childProc.off?.('exit', onEnd);
        childProc.off?.('close', onEnd);
        resExit(alreadyGone());
      }, 3800);
      if (typeof t.unref === 'function') t.unref();
      childProc.once?.('exit', onEnd);
      childProc.once?.('close', onEnd);
    });

    // 1. Tutup pipa kendali stdin runner Job Object agar kernel Windows langsung memanggil TerminateJobObject
    if (usingJobRunner && childProc.stdin && typeof childProc.stdin.end === 'function') {
      try {
        childProc.stdin.end();
      } catch {}
    }

    // 2. Jalankan taskkill /T /F dengan timeout 10s (kecuali simulasi uji kegagalan taskkill) lalu verifikasi
    const skipTaskkill = process.env.OFFICE_TEST_FAIL_TASKKILL === '1';
    const runTaskkill = () =>
      new Promise(resTk => {
        if (skipTaskkill || process.platform !== 'win32' || !pid || alreadyGone()) {
          return resTk(false);
        }
        try {
          execFile(
            'taskkill.exe',
            ['/PID', String(pid), '/T', '/F'],
            { windowsHide: true, shell: false, timeout: 10000 },
            err => resTk(!err)
          );
        } catch {
          resTk(false);
        }
      });

    (async () => {
      // Beri kesempatan singkat Job Object menutup seluruh pohon proses dengan bersih lewat stdin EOF
      if (usingJobRunner) {
        await Promise.race([waitExit, new Promise(r => setTimeout(r, 450))]);
      }
      if (!alreadyGone()) {
        await runTaskkill();
      }
      if (!alreadyGone()) {
        try {
          childProc.kill('SIGKILL');
        } catch {
          try {
            childProc.kill('SIGTERM');
          } catch {}
        }
      }
      const exited = await waitExit;
      done({ ok: exited, exited });
    })();
  });
}

// [Diubah oleh Gemini - 2026-11-21] Cari perkiraan harga dari pricing.json berdasarkan exact / strip effort / prefix
function lookupModelPricing(pricingData, modelId, agentId) {
  if (!pricingData || !isPlainObject(pricingData.models)) return null;
  const models = pricingData.models;
  const usdIdr = Number(pricingData.usd_idr) || Number(pricingData.rates?.IDR) || 16000;
  let key = String(modelId || '').trim();
  if (!key) return null;
  if (agentId === 'codex' && CODEX_DEFAULT_ALIASES[key.toLowerCase()]) {
    key = CODEX_DEFAULT_ALIASES[key.toLowerCase()].model;
  }
  if (agentId === 'opencode') {
    const resolved = resolveOpencodeModel(key);
    key = resolved.includes('/') ? resolved.split('/').slice(1).join('/') : resolved;
  }

  const candidates = [
    key,
    key.replace(/-(?:xhigh|high|medium|low|max)$/i, '')
  ];
  let hit = null;
  for (const c of candidates) {
    if (c && Object.hasOwn(models, c)) {
      hit = models[c];
      break;
    }
  }
  if (!hit) {
    const lower = key.toLowerCase();
    for (const [k, v] of Object.entries(models)) {
      if (lower.startsWith(k.toLowerCase()) || k.toLowerCase().startsWith(lower)) {
        hit = v;
        break;
      }
    }
  }
  if (!hit || hit.input === null || hit.output === null) return null;
  return {
    inputUsd: Number(hit.input),
    outputUsd: Number(hit.output),
    usdIdr,
    inputIdr: Math.round(Number(hit.input) * usdIdr),
    outputIdr: Math.round(Number(hit.output) * usdIdr)
  };
}

function parseAgyModelsOutput(stdout) {
  const items = [];
  let hiddenLowCount = 0;
  const seen = new Set();
  for (const rawLine of String(stdout || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^fetching/i.test(line)) continue;
    const parts = line.split(/\t+|\s{2,}/);
    const id = (parts[0] || '').trim();
    if (!id || !MODEL_SLUG_RE.test(id) || seen.has(id)) continue;
    seen.add(id);
    if (isLowTierModel(id)) {
      hiddenLowCount += 1;
      continue;
    }
    const label = (parts[1] || id).trim();
    let group = 'other';
    if (/^gemini-4-/i.test(id)) group = 'gemini4';
    else if (/^gemini-3\.8-flash/i.test(id)) group = 'flash';
    else if (/^claude-/i.test(id)) group = 'claude';
    else if (/orchestrator/i.test(id)) group = 'orchestrator';
    const recommended = /^(?:gemini-4-(?:argon|neon|hydrogen)-(?:high|xhigh)|gemini-3\.8-flash-high)$/i.test(id);
    items.push({ id, label, group, recommended });
  }
  return { items, hiddenLowCount };
}

async function readCodexConfigModels() {
  const cfgPath = path.join(os.homedir() || '', '.codex', 'config.toml');
  try {
    const raw = await fs.readFile(cfgPath, 'utf8');
    // Hanya baca baris top-level model dan model_reasoning_effort (tidak pernah membaca key/token/auth)
    const modelMatch = raw.match(/^\s*model\s*=\s*["']([^"'\r\n]+)["']/m);
    const effortMatch = raw.match(/^\s*model_reasoning_effort\s*=\s*["']([^"'\r\n]+)["']/m);
    return {
      found: true,
      model: modelMatch ? cleanText(modelMatch[1], 80) : '',
      effort: effortMatch ? cleanText(effortMatch[1], 24).toLowerCase() : ''
    };
  } catch {
    return { found: false, model: '', effort: '' };
  }
}

async function readCodexAliasesFromScript(projectRoot) {
  if (!projectRoot) return null;
  const scriptPath = path.join(projectRoot, 'Tools', 'cx_run.py');
  try {
    const raw = await fs.readFile(scriptPath, 'utf8');
    const blockMatch = raw.match(/ALIAS\s*=\s*\{([\s\S]*?)\}/);
    if (!blockMatch) return null;
    const found = {};
    const pairRe = /['"]([a-z0-9_-]+)['"]\s*:\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([a-z]+)['"]\s*\)/gi;
    let m;
    while ((m = pairRe.exec(blockMatch[1])) !== null) {
      const alias = m[1].toLowerCase();
      const model = m[2];
      const effort = m[3].toLowerCase();
      found[alias] = {
        model,
        effort,
        label: `${alias} · ${model} (${effort})`
      };
    }
    return Object.keys(found).length ? found : null;
  } catch {
    return null;
  }
}

async function readOpencodeAliasesFromScript(projectRoot) {
  if (!projectRoot) return null;
  const scriptPath = path.join(projectRoot, 'Tools', 'oc_run.py');
  try {
    const raw = await fs.readFile(scriptPath, 'utf8');
    const blockMatch = raw.match(/ALIAS\s*=\s*\{([\s\S]*?)\}/);
    if (!blockMatch) return null;
    const found = {};
    const pairRe = /['"]([a-z0-9_-]+)['"]\s*:\s*['"]([^'"]+)['"]/gi;
    let m;
    while ((m = pairRe.exec(blockMatch[1])) !== null) {
      const alias = m[1].toLowerCase();
      const target = m[2].includes('/') ? m[2] : `opencode-go/${m[2]}`;
      found[alias] = target;
    }
    return Object.keys(found).length ? found : null;
  } catch {
    return null;
  }
}

async function readClaudeSettingsNonSecret() {
  const cfgPath = path.join(os.homedir() || '', '.claude', 'settings.json');
  try {
    const parsed = JSON.parse(await fs.readFile(cfgPath, 'utf8'));
    return {
      found: true,
      model: cleanText(parsed?.model || '', 64),
      effort: cleanText(parsed?.modelSettings?.effortLevel || '', 24).toLowerCase()
    };
  } catch {
    return { found: false, model: '', effort: '' };
  }
}

async function readHermesConfigNonSecret() {
  const cfgPath = path.join(os.homedir() || '', '.hermes', 'config.yaml');
  try {
    const raw = await fs.readFile(cfgPath, 'utf8');
    const defMatch = raw.match(/^\s*default\s*:\s*["']?([^"'\r\n#]+)["']?/m);
    const provMatch = raw.match(/^\s*provider\s*:\s*["']?([^"'\r\n#]+)["']?/m);
    return {
      found: true,
      defaultModel: defMatch ? cleanText(defMatch[1], 80) : 'herme-agent',
      provider: provMatch ? cleanText(provMatch[1], 40) : 'custom'
    };
  } catch {
    return { found: false, defaultModel: 'herme-agent', provider: '' };
  }
}

async function createAgentPromptStore({
  root = __dirname,
  dataDir,
  getDefaultCwd = () => '',
  getGeminiConfig = () => ({ apiKey: '', model: 'gemini-2.5-flash', hasGeminiKey: false }),
  getPricing = null,
  workspaceDiscovery = null,
  onGeminiUsage = null,
  onEvent = () => {},
  now = Date.now,
  fetchImpl = globalThis.fetch,
  spawnImpl = null,
  cliProbeImpl = null,
  hermesRouterProbe = probeLocal9Router
} = {}) {
  const storeFilePath = path.join(dataDir, 'prompt_runs.json');
  const configFilePath = path.join(dataDir, 'prompt_config.json');
  const outputsDirPath = path.join(dataDir, 'prompt_outputs');
  let writeQueue = Promise.resolve();
  const activeProcesses = new Map();
  const launcherCache = new Map(); // agentId -> { at, info }
  const versionCache = new Map(); // agentId -> { at, exe, version }
  const modelsCache = new Map(); // agentId -> { at, data }
  let runs = [];
  let promptConfig = {
    version: 1,
    lastSelection: {}, // { [agentId]: { model, effort } }
    lastCwd: '',
    recentCwds: [],
    executableOverrides: {}, // { [agentId]: rawPath }
    resolvedPaths: {}, // { [agentId]: absPath } (disimpan lokal untuk aplikasi terpaket)
    lastTests: {} // { [agentId]: { ok, status, latencyMs, snippet, errorCode, error, testedAt } }
  };

  const nowIso = () => new Date(now()).toISOString();

  async function ensureDirs() {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.mkdir(outputsDirPath, { recursive: true });
  }

  async function writeTextAtomic(targetPath, textContent) {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    const tmp = `${targetPath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    await fs.writeFile(tmp, textContent, 'utf8');
    let lastErr = null;
    for (let i = 0; i < 5; i++) {
      try {
        await fs.rename(tmp, targetPath);
        return;
      } catch (err) {
        lastErr = err;
        if (err && (err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EEXIST')) {
          await new Promise(r => setTimeout(r, 20 * (i + 1)));
          continue;
        }
        break;
      }
    }
    await fs.unlink(tmp).catch(() => {});
    throw lastErr || new Error('Gagal menyimpan berkas secara atomik');
  }

  async function writeJsonAtomic(targetPath, obj) {
    await ensureDirs();
    return writeTextAtomic(targetPath, JSON.stringify(obj, null, 2) + '\n');
  }

  await ensureDirs();
  let hadRecoveredRuns = false;
  try {
    const raw = JSON.parse(await fs.readFile(storeFilePath, 'utf8'));
    if (isPlainObject(raw) && Array.isArray(raw.runs)) {
      runs = raw.runs
        .filter(r => isPlainObject(r) && typeof r.id === 'string')
        .slice(0, MAX_RUNS_HISTORY)
        .map(r => {
          if (r.status === 'running') {
            hadRecoveredRuns = true;
            return { ...r, status: 'interrupted', errorCode: 'interrupted', finishedAt: nowIso(), error: 'Sesi server dimulai ulang' };
          }
          return r;
        });
    }
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      await fs.rename(storeFilePath, `${storeFilePath}.corrupt.${Date.now()}`).catch(() => {});
    }
    await writeJsonAtomic(storeFilePath, { version: 2, runs: [] });
  }
  if (hadRecoveredRuns) {
    await writeJsonAtomic(storeFilePath, { version: 2, runs: runs.slice(0, MAX_RUNS_HISTORY) }).catch(() => {});
  }

  try {
    const rawCfg = JSON.parse(await fs.readFile(configFilePath, 'utf8'));
    if (isPlainObject(rawCfg)) {
      if (isPlainObject(rawCfg.lastSelection)) promptConfig.lastSelection = rawCfg.lastSelection;
      if (typeof rawCfg.lastCwd === 'string') promptConfig.lastCwd = cleanText(rawCfg.lastCwd, 260);
      if (Array.isArray(rawCfg.recentCwds)) {
        promptConfig.recentCwds = rawCfg.recentCwds
          .filter(x => typeof x === 'string' && x.trim() && !isBlockedCwd(x))
          .slice(0, 8);
      }
      if (isPlainObject(rawCfg.executableOverrides)) promptConfig.executableOverrides = rawCfg.executableOverrides;
      if (isPlainObject(rawCfg.resolvedPaths)) promptConfig.resolvedPaths = rawCfg.resolvedPaths;
      if (isPlainObject(rawCfg.lastTests)) promptConfig.lastTests = rawCfg.lastTests;
    }
  } catch {
    /* file baru dibuat saat ada perubahan konfigurasi */
  }

  function queueSaveRuns() {
    const copy = {
      version: 2,
      runs: runs.slice(0, MAX_RUNS_HISTORY)
    };
    const next = writeQueue.then(() => writeJsonAtomic(storeFilePath, copy));
    writeQueue = next.catch(() => {});
    return next;
  }

  function queueSaveConfig() {
    const copy = JSON.parse(JSON.stringify(promptConfig));
    const next = writeQueue.then(() => writeJsonAtomic(configFilePath, copy));
    writeQueue = next.catch(() => {});
    return next;
  }

  function emitSafe(payload) {
    try {
      onEvent(payload);
    } catch {
      /* abaikan error listener SSE */
    }
  }

  async function loadPricingSafe() {
    if (typeof getPricing === 'function') {
      try {
        const p = getPricing();
        if (p && isPlainObject(p.models)) return p;
      } catch {}
    }
    for (const cand of [path.join(root, 'pricing.json'), path.join(__dirname, 'pricing.json')]) {
      try {
        const parsed = JSON.parse(await fs.readFile(cand, 'utf8'));
        if (parsed && isPlainObject(parsed.models)) return parsed;
      } catch {}
    }
    return { usd_idr: 16000, models: {} };
  }

  // [Diubah oleh Gemini - 2026-11-21] Deteksi folder proyek generik lewat workspace_discovery (tanpa hardcode nama folder pribadi)
  async function detectProjectRootSafe() {
    const configured = cleanText(typeof getDefaultCwd === 'function' ? getDefaultCwd() : '', 260);
    if (configured && !isBlockedCwd(configured)) {
      const abs = path.resolve(configured);
      try {
        const st = await fs.lstat(abs);
        if (st.isDirectory() && !st.isSymbolicLink()) return abs;
      } catch {}
    }
    if (workspaceDiscovery && typeof workspaceDiscovery.discover === 'function') {
      try {
        const d = await workspaceDiscovery.discover();
        if (d.effectiveProjectDir) return d.effectiveProjectDir;
      } catch {}
    }
    return configured || '';
  }

  // [Diubah oleh Gemini - 2026-11-21] Simpan hasil setiap eksekusi ke berkas laporan di <dataDir>/prompt_outputs/<runId>.md (+ outputPath opsional)
  async function persistRunOutputFiles(run, customOutputPath = null) {
    const fileName = `${run.id}.md`;
    const internalPath = path.join(outputsDirPath, fileName);
    const mdLines = [
      `# Laporan Prompt Agen — ${run.agentName}`,
      '',
      `- **Run ID:** \`${run.id}\``,
      `- **Agen:** \`${run.agentId}\` (${run.agentName})`,
      `- **Model:** \`${run.model || '(default)'}\`${run.effort ? ` · **Effort:** \`${run.effort}\`` : ''}`,
      `- **Mode:** \`${run.mode}\` · **Full Access:** \`${run.fullAccess ? 'ON' : 'OFF'}\``,
      `- **Status:** \`${run.status}\` · **Exit Code:** \`${run.exitCode ?? 'n/a'}\``,
      `- **Usage Limit:** \`${run.limitDetected ? 'YA' + (run.retryAfter ? ' (' + run.retryAfter + ')' : '') : 'tidak'}\``,
      `- **Mulai:** ${run.startedAt}`,
      `- **Selesai:** ${run.finishedAt || ''}`,
      `- **Durasi:** ${run.durationMs} ms`,
      '',
      '## Prompt',
      '',
      run.prompt,
      '',
      '## Keluaran',
      '',
      run.output || run.error || '(kosong)',
      ''
    ];
    try {
      await writeTextAtomic(internalPath, mdLines.join('\n'));
      run.outputFileLabel = fileName;
    } catch {
      run.outputFileLabel = '';
    }

    let finalPath = run.outputFileLabel ? internalPath : null;
    if (customOutputPath) {
      await writeTextAtomic(customOutputPath, String(run.output || ''));
      finalPath = customOutputPath;
    }
    return finalPath;
  }

  async function getLauncherForAgent(agentId, forceRefresh = false) {
    const spec = WHITELISTED_AGENTS[agentId];
    if (!spec) return { installed: false, executable: null, prefixArgs: [], resolvedLabel: '', resolvedDisplay: '', source: 'none' };
    if (agentId === 'gemini-api') {
      const gem = typeof getGeminiConfig === 'function' ? getGeminiConfig() : null;
      const hasKey = Boolean(gem && gem.apiKey);
      return {
        installed: hasKey,
        executable: 'gemini-rest-api',
        prefixArgs: [],
        resolvedLabel: hasKey ? `REST API (${gem.model || 'gemini-2.5-flash'})` : 'REST API',
        resolvedDisplay: hasKey ? `BYOK (${gem.keyHint || '****'})` : '',
        source: hasKey ? 'byok' : 'none'
      };
    }

    const overridePath = cleanText(promptConfig.executableOverrides?.[agentId] || '', 320);
    const cached = launcherCache.get(agentId);
    if (!forceRefresh && cached && cached.overridePath === overridePath && now() - cached.at < LAUNCHER_CACHE_TTL_MS) {
      return cached.info;
    }

    // Jika sebelumnya pernah ketemu jalur absolut (mis. dari sesi sebelumnya), ikutkan direktori itu sebagai kandidat prioritas
    const prevAbs = cleanText(promptConfig.resolvedPaths?.[agentId] || '', 320);
    const extraDirs = prevAbs ? [path.dirname(prevAbs)] : [];

    const info = await resolveWindowsCliLauncher(spec.binary, { overridePath, extraDirs });
    launcherCache.set(agentId, { at: now(), overridePath, info });

    // Simpan jalur absolut yang ketemu secara internal agar aplikasi terpaket selalu punya referensi cepat
    if (info.installed && info.executable && promptConfig.resolvedPaths[agentId] !== info.executable) {
      promptConfig.resolvedPaths[agentId] = info.executable;
      queueSaveConfig().catch(() => {});
    }
    return info;
  }

  async function getCliVersion(agentId, launcher, forceRefresh = false) {
    if (!launcher || !launcher.installed || agentId === 'gemini-api') return '';
    const cached = versionCache.get(agentId);
    if (!forceRefresh && cached && cached.exe === launcher.executable && now() - cached.at < MODEL_CACHE_TTL_MS) {
      return cached.version;
    }
    let res;
    if (typeof cliProbeImpl === 'function') {
      res = await cliProbeImpl(agentId, ['--version'], launcher).catch(() => ({ ok: false, stdout: '' }));
    } else if (typeof spawnImpl === 'function') {
      return '';
    } else {
      res = await runQuickCliCommand(launcher, ['--version'], { timeoutMs: 3000 });
    }
    const line = String(res?.stdout || res?.stderr || '')
      .split(/\r?\n/)
      .map(s => s.trim())
      .find(Boolean) || '';
    const cleanVer = cleanText(line, 56);
    versionCache.set(agentId, { at: now(), exe: launcher.executable, version: cleanVer });
    return cleanVer;
  }

  function findRecentLimitForAgent(agentId) {
    const cutoff = now() - 15 * 60 * 1000;
    const hit = runs.find(
      r => r.agentId === agentId && (r.status === 'rate_limited' || r.limitDetected) && (Date.parse(r.finishedAt || r.startedAt) || 0) >= cutoff
    );
    return hit ? { limited: true, retryAfter: hit.retryAfter || null, at: hit.finishedAt || hit.startedAt } : null;
  }

  // [Diubah oleh Gemini - 2026-11-21] Daftar model bertingkat dari sumber nyata per agen + cache 10 menit + tanda sumber nyata / bawaan
  async function getAgentModels(agentId, { forceRefresh = false } = {}) {
    const spec = WHITELISTED_AGENTS[agentId];
    if (!spec) {
      throw httpError(400, 'invalid_agent_id', 'Agen AI tidak valid');
    }
    const cached = modelsCache.get(agentId);
    if (!forceRefresh && cached && now() - cached.at < MODEL_CACHE_TTL_MS) {
      return { ...cached.data, cached: true };
    }

    const pricingData = await loadPricingSafe();
    const projectRoot = await detectProjectRootSafe();
    const enrichPricing = item => {
      const p = lookupModelPricing(pricingData, item.model || item.id, agentId);
      return {
        ...item,
        pricing: p
      };
    };

    let result = null;
    const fetchedAt = nowIso();

    if (agentId === 'antigravity') {
      const launcher = await getLauncherForAgent('antigravity', forceRefresh);
      let parsed = { items: [], hiddenLowCount: 0 };
      let liveOk = false;
      if (launcher.installed) {
        let probeRes;
        if (typeof cliProbeImpl === 'function') {
          probeRes = await cliProbeImpl('antigravity', ['models'], launcher).catch(() => ({ ok: false, stdout: '' }));
        } else if (typeof spawnImpl !== 'function') {
          probeRes = await runQuickCliCommand(launcher, ['models'], { timeoutMs: 8000 });
        }
        if (probeRes && probeRes.stdout) {
          parsed = parseAgyModelsOutput(probeRes.stdout);
          if (parsed.items.length > 0) liveOk = true;
        }
      }
      const items = liveOk ? parsed.items : ANTIGRAVITY_FALLBACK_CATALOG.map(m => ({ ...m }));
      const hiddenLowCount = liveOk ? parsed.hiddenLowCount : 5;
      const groupOrder = [
        ['gemini4', 'Gemini 4'],
        ['flash', 'Gemini 3.8 Flash'],
        ['claude', 'Claude (Antigravity)'],
        ['orchestrator', 'Orchestrator'],
        ['other', 'Lainnya']
      ];
      const groups = groupOrder
        .map(([gid, glabel]) => ({
          id: gid,
          label: glabel,
          models: items.filter(m => m.group === gid).map(enrichPricing)
        }))
        .filter(g => g.models.length > 0);
      result = {
        agentId,
        source: liveOk ? 'live' : 'fallback',
        sourceLabel: liveOk ? 'agy models' : 'fallback',
        fetchedAt,
        defaultModel: spec.defaultModel,
        supportsEffort: false,
        effortOptions: [],
        defaultEffort: '',
        banLowTier: true,
        hiddenLowCount,
        billingType: spec.billingType,
        groups
      };
    } else if (agentId === 'codex') {
      const [scriptAliases, codexCfg] = await Promise.all([
        readCodexAliasesFromScript(projectRoot),
        readCodexConfigModels()
      ]);
      const aliases = scriptAliases || CODEX_DEFAULT_ALIASES;
      const aliasModels = Object.entries(aliases).map(([alias, info]) =>
        enrichPricing({
          id: alias,
          model: info.model,
          effort: info.effort,
          label: info.label || `${alias} · ${info.model} (${info.effort})`,
          recommended: alias === 'sol-h' || alias === 'sol-m'
        })
      );
      const groups = [{ id: 'cx_aliases', label: 'Alias cx_run.py', models: aliasModels }];
      if (codexCfg.found && codexCfg.model) {
        groups.push({
          id: 'codex_config',
          label: '~/.codex/config.toml',
          models: [
            enrichPricing({
              id: codexCfg.model,
              effort: codexCfg.effort || '',
              label: `${codexCfg.model}${codexCfg.effort ? ` (${codexCfg.effort})` : ''}`,
              recommended: true
            })
          ]
        });
      }
      const directList = ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-5.6-sol', 'gpt-5-mini']
        .filter(m => m !== codexCfg.model)
        .map(m => enrichPricing({ id: m, label: m }));
      groups.push({ id: 'codex_direct', label: 'Model Codex', models: directList });

      const liveOk = Boolean(scriptAliases || codexCfg.found);
      result = {
        agentId,
        source: liveOk ? 'live' : 'fallback',
        sourceLabel: scriptAliases && codexCfg.found
          ? 'Tools/cx_run.py + ~/.codex/config.toml'
          : scriptAliases
            ? 'Tools/cx_run.py'
            : codexCfg.found
              ? '~/.codex/config.toml'
              : 'fallback',
        fetchedAt,
        defaultModel: codexCfg.model || '',
        supportsEffort: true,
        effortOptions: spec.effortOptions,
        defaultEffort: codexCfg.effort || 'medium',
        banLowTier: false,
        hiddenLowCount: 0,
        billingType: spec.billingType,
        groups
      };
    } else if (agentId === 'claude') {
      const claudeCfg = await readClaudeSettingsNonSecret();
      const groups = [
        {
          id: 'claude_55',
          label: 'Claude 5.5',
          models: CLAUDE_MODELS.map(m => enrichPricing({ ...m }))
        },
        {
          id: 'claude_aliases',
          label: 'Alias CLI',
          models: [
            enrichPricing({ id: 'opus', model: 'claude-opus-5-5', label: 'opus (Claude Opus)' }),
            enrichPricing({ id: 'sonnet', model: 'claude-sonnet-5-5', label: 'sonnet (Claude Sonnet)' }),
            enrichPricing({ id: 'haiku', model: 'claude-haiku-5-5', label: 'haiku (Claude Haiku)' })
          ]
        }
      ];
      result = {
        agentId,
        source: claudeCfg.found ? 'live' : 'fallback',
        sourceLabel: claudeCfg.found ? '~/.claude/settings.json' : 'fallback',
        fetchedAt,
        defaultModel: claudeCfg.model || 'claude-sonnet-5-5',
        supportsEffort: true,
        effortOptions: spec.effortOptions,
        defaultEffort: claudeCfg.effort || 'medium',
        banLowTier: false,
        hiddenLowCount: 0,
        billingType: spec.billingType,
        groups
      };
    } else if (agentId === 'opencode') {
      const [scriptAliases, launcher] = await Promise.all([
        readOpencodeAliasesFromScript(projectRoot),
        getLauncherForAgent('opencode', forceRefresh)
      ]);
      const aliases = scriptAliases || OPENCODE_MODEL_ALIASES;
      let liveModels = [];
      let liveCliOk = false;
      if (launcher.installed) {
        let probeRes;
        if (typeof cliProbeImpl === 'function') {
          probeRes = await cliProbeImpl('opencode', ['models'], launcher).catch(() => ({ ok: false, stdout: '' }));
        } else if (typeof spawnImpl !== 'function') {
          probeRes = await runQuickCliCommand(launcher, ['models'], { timeoutMs: 10000 });
        }
        if (probeRes && probeRes.stdout) {
          const parsed = String(probeRes.stdout)
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(l => /^opencode-go\/[a-zA-Z0-9._-]+$/.test(l));
          if (parsed.length > 0) {
            liveModels = [...new Set(parsed)];
            liveCliOk = true;
          }
        }
      }
      const goModels = liveCliOk ? liveModels : [...OPENCODE_FALLBACK_MODELS];
      const aliasGroup = Object.entries(aliases).map(([al, target]) =>
        enrichPricing({
          id: al,
          model: target,
          label: `${al} -> ${target.replace(/^opencode-go\//, '')}`,
          recommended: al === 'cepat' || al === 'naskah'
        })
      );
      const goGroup = goModels.map(id =>
        enrichPricing({
          id,
          label: id.replace(/^opencode-go\//, '') + ' (opencode-go)'
        })
      );
      const liveOk = liveCliOk || Boolean(scriptAliases);
      result = {
        agentId,
        source: liveOk ? 'live' : 'fallback',
        sourceLabel: liveCliOk ? 'opencode models + oc_run.py' : scriptAliases ? 'Tools/oc_run.py' : 'fallback',
        fetchedAt,
        defaultModel: spec.defaultModel,
        supportsEffort: false,
        effortOptions: [],
        defaultEffort: '',
        banLowTier: false,
        hiddenLowCount: 0,
        billingType: spec.billingType,
        groups: [
          { id: 'oc_aliases', label: 'Alias OpenCode Go (oc_run.py)', models: aliasGroup },
          { id: 'oc_go', label: 'Model OpenCode Go', models: goGroup }
        ]
      };
    } else if (agentId === 'hermes') {
      const [hCfg, routerInfo] = await Promise.all([
        readHermesConfigNonSecret(),
        typeof spawnImpl !== 'function' ? probeLocal9RouterModels(600) : Promise.resolve({ ok: false, models: [] })
      ]);
      const seen = new Set();
      const models = [];
      const pushM = (id, label, recommended = false) => {
        if (!id || seen.has(id)) return;
        seen.add(id);
        models.push(enrichPricing({ id, label: label || id, recommended }));
      };
      if (hCfg.defaultModel) pushM(hCfg.defaultModel, `${hCfg.defaultModel} (9router default)`, true);
      for (const rm of routerInfo.models || []) {
        pushM(rm, `${rm} (9router)`);
      }
      if (!models.length) pushM('herme-agent', 'herme-agent (9router lokal)', true);
      const liveOk = hCfg.found || routerInfo.ok;
      result = {
        agentId,
        source: liveOk ? 'live' : 'fallback',
        sourceLabel: routerInfo.ok ? '9router (:20128) + ~/.hermes/config.yaml' : hCfg.found ? '~/.hermes/config.yaml' : 'fallback',
        fetchedAt,
        defaultModel: hCfg.defaultModel || 'herme-agent',
        supportsEffort: true,
        effortOptions: spec.effortOptions,
        defaultEffort: 'medium',
        banLowTier: false,
        hiddenLowCount: 0,
        billingType: spec.billingType,
        groups: [{ id: 'hermes_local', label: 'Hermes / 9Router', models }]
      };
    } else if (agentId === 'gemini-api') {
      const gem = typeof getGeminiConfig === 'function' ? getGeminiConfig() : null;
      const pricingModels = Object.entries(pricingData.models || {})
        .filter(([, meta]) => meta && meta.provider === 'gemini')
        .map(([id]) => id);
      const mainRest = [];
      const extraSeries = [];
      for (const id of pricingModels) {
        if (isLowTierModel(id)) continue;
        const item = enrichPricing({
          id,
          label: id,
          recommended: id === 'gemini-2.5-flash' || id === 'gemini-2.5-pro'
        });
        if (/^gemini-2\.5-/i.test(id)) mainRest.push(item);
        else extraSeries.push(item);
      }
      if (!mainRest.length) {
        mainRest.push(
          enrichPricing({ id: 'gemini-2.5-flash', label: 'gemini-2.5-flash', recommended: true }),
          enrichPricing({ id: 'gemini-2.5-flash-lite', label: 'gemini-2.5-flash-lite' }),
          enrichPricing({ id: 'gemini-2.5-pro', label: 'gemini-2.5-pro', recommended: true })
        );
      }
      const groups = [{ id: 'gemini_rest', label: 'Gemini 2.5 (REST API)', models: mainRest }];
      if (extraSeries.length) groups.push({ id: 'gemini_pricing', label: 'pricing.json (Gemini)', models: extraSeries });
      const liveOk = pricingModels.length > 0;
      result = {
        agentId,
        source: liveOk ? 'live' : 'fallback',
        sourceLabel: liveOk ? 'pricing.json' : 'fallback',
        fetchedAt,
        defaultModel: gem?.model || spec.defaultModel,
        supportsEffort: false,
        effortOptions: [],
        defaultEffort: '',
        banLowTier: false,
        hiddenLowCount: 0,
        billingType: spec.billingType,
        groups
      };
    }

    modelsCache.set(agentId, { at: now(), data: result });
    return { ...result, cached: false };
  }

  async function getModels({ agentId = '', forceRefresh = false } = {}) {
    if (agentId) {
      const cleanId = cleanText(agentId, 32).toLowerCase();
      const catalog = await getAgentModels(cleanId, { forceRefresh });
      return { ok: true, agentId: cleanId, catalog };
    }
    const entries = await Promise.all(
      Object.keys(WHITELISTED_AGENTS).map(async id => [id, await getAgentModels(id, { forceRefresh })])
    );
    return {
      ok: true,
      modelsByAgent: Object.fromEntries(entries)
    };
  }

  // [Diubah oleh Gemini - 2026-11-21] Daftar pilihan cepat folder kerja generik (Proyek Lokal, Channels/*, workspace sekitar, terakhir dipakai) + validasi path
  async function validateCwd(rawPath) {
    const raw = cleanText(rawPath, 260);
    if (!raw) {
      return { ok: false, valid: false, blocked: false, reasonCode: 'empty', resolvedPath: '', displayPath: '' };
    }
    const expanded = expandPortablePath(raw);
    if (isBlockedCwd(expanded)) {
      return {
        ok: false,
        valid: false,
        blocked: true,
        reasonCode: 'blocked_sensitive',
        resolvedPath: '',
        displayPath: formatPortablePath(expanded)
      };
    }
    try {
      const st = await fs.lstat(expanded);
      if (!st.isDirectory() || st.isSymbolicLink()) {
        return {
          ok: false,
          valid: false,
          blocked: false,
          reasonCode: st.isSymbolicLink() ? 'symlink_blocked' : 'not_directory',
          resolvedPath: expanded,
          displayPath: formatPortablePath(expanded)
        };
      }
      return {
        ok: true,
        valid: true,
        blocked: false,
        reasonCode: 'ok',
        resolvedPath: expanded,
        displayPath: formatPortablePath(expanded)
      };
    } catch {
      return {
        ok: false,
        valid: false,
        blocked: false,
        reasonCode: 'not_found',
        resolvedPath: expanded,
        displayPath: formatPortablePath(expanded)
      };
    }
  }

  async function listQuickCwds() {
    const items = [];
    const seen = new Set();
    const pushDir = async (dirPath, label, group) => {
      if (!dirPath) return;
      const abs = path.resolve(dirPath);
      const key = abs.toLowerCase();
      if (seen.has(key) || isBlockedCwd(abs)) return;
      const check = await validateCwd(abs);
      if (!check.valid) return;
      seen.add(key);
      items.push({
        path: abs,
        displayPath: formatPortablePath(abs),
        label: label || path.basename(abs) || abs,
        group
      });
    };

    const projectRoot = await detectProjectRootSafe();
    if (projectRoot) {
      await pushDir(projectRoot, `${path.basename(projectRoot)} (Project)`, 'project');
      const channelsDir = path.join(projectRoot, 'Channels');
      try {
        const chEntries = await fs.readdir(channelsDir, { withFileTypes: true });
        for (const ent of chEntries.sort((a, b) => a.name.localeCompare(b.name))) {
          if (!ent.isDirectory() || ent.name.startsWith('.') || ent.name.startsWith('_')) continue;
          await pushDir(path.join(channelsDir, ent.name), `Channels/${ent.name}`, 'channels');
        }
      } catch {}
    }

    // [Diubah oleh Gemini - 2026-11-21] Temukan folder workspace secara generik berdasarkan folder yang ada (tanpa nama tetap/pribadi)
    const { discoverSiblingWorkspaces } = require('./workspace_discovery');
    const discoveredWorkspaces = await discoverSiblingWorkspaces({ root, projectDir: projectRoot, maxItems: 6 }).catch(() => []);
    for (const ws of discoveredWorkspaces) {
      await pushDir(ws.path, ws.label, 'workspaces');
    }

    // Folder terakhir yang pernah dipakai
    const recentList = [promptConfig.lastCwd, ...(promptConfig.recentCwds || [])].filter(Boolean);
    for (const rc of recentList) {
      await pushDir(rc, `${path.basename(rc) || rc}`, 'recent');
    }

    return {
      ok: true,
      defaultCwd: items[0]?.path || cleanText(typeof getDefaultCwd === 'function' ? getDefaultCwd() : '', 260),
      lastCwd: promptConfig.lastCwd || '',
      options: items
    };
  }

  function getConfig() {
    const safeOverrides = {};
    for (const [k, v] of Object.entries(promptConfig.executableOverrides || {})) {
      if (WHITELISTED_AGENTS[k] && v) safeOverrides[k] = formatPortablePath(v);
    }
    return {
      ok: true,
      lastSelection: { ...(promptConfig.lastSelection || {}) },
      lastCwd: promptConfig.lastCwd || '',
      recentCwds: [...(promptConfig.recentCwds || [])],
      executableOverrides: safeOverrides,
      lastTests: { ...(promptConfig.lastTests || {}) }
    };
  }

  async function updateConfig(rawPayload) {
    assertSafeObject(rawPayload);

    if (isPlainObject(rawPayload.lastSelection)) {
      assertSafeObject(rawPayload.lastSelection);
      for (const [agId, sel] of Object.entries(rawPayload.lastSelection)) {
        if (!WHITELISTED_AGENTS[agId] || !isPlainObject(sel)) continue;
        const m = cleanText(sel.model, 96);
        const eff = normalizeEffortForAgent(agId, sel.effort);
        if (agId === 'antigravity' && m && isLowTierModel(m)) {
          throw httpError(400, 'forbidden_low_tier_model', 'Model tier low dilarang untuk Antigravity');
        }
        promptConfig.lastSelection[agId] = { model: m, effort: eff };
      }
    }

    if (rawPayload.lastCwd !== undefined) {
      const cwdStr = cleanText(rawPayload.lastCwd, 260);
      if (cwdStr) {
        const check = await validateCwd(cwdStr);
        if (check.blocked) {
          throw httpError(403, 'forbidden_cwd', 'Direktori kerja tidak boleh mengarah ke Secrets, .git, atau .env');
        }
        if (check.valid) {
          promptConfig.lastCwd = check.resolvedPath;
          promptConfig.recentCwds = [
            check.resolvedPath,
            ...(promptConfig.recentCwds || []).filter(x => x.toLowerCase() !== check.resolvedPath.toLowerCase())
          ].slice(0, 8);
        }
      }
    }

    if (isPlainObject(rawPayload.executableOverrides)) {
      assertSafeObject(rawPayload.executableOverrides);
      for (const [agId, rawExe] of Object.entries(rawPayload.executableOverrides)) {
        if (!WHITELISTED_AGENTS[agId] || agId === 'gemini-api') continue;
        const val = cleanText(rawExe, 320);
        if (!val) {
          delete promptConfig.executableOverrides[agId];
        } else {
          const expanded = expandPortablePath(val);
          if (isBlockedCwd(expanded)) {
            throw httpError(403, 'forbidden_executable_path', 'Jalur eksekutabel tidak boleh mengarah ke Secrets, .git, atau .env');
          }
          promptConfig.executableOverrides[agId] = val;
        }
        launcherCache.delete(agId);
        versionCache.delete(agId);
        modelsCache.delete(agId);
      }
    }

    await queueSaveConfig();
    return getConfig();
  }

  async function detectAgents({ forceRefresh = false } = {}) {
    if (forceRefresh) {
      launcherCache.clear();
      versionCache.clear();
    }
    const hermesRouterUp = typeof hermesRouterProbe === 'function' ? await hermesRouterProbe().catch(() => false) : true;
    const gemCfg = typeof getGeminiConfig === 'function' ? getGeminiConfig() : null;
    const specs = Object.values(WHITELISTED_AGENTS);

    const list = await Promise.all(
      specs.map(async spec => {
        const info = await getLauncherForAgent(spec.id, forceRefresh);
        const isByok = spec.id === 'gemini-api';
        const isHermes = spec.id === 'hermes';
        const recentLimit = findRecentLimitForAgent(spec.id);
        const version = info.installed && !isByok ? await getCliVersion(spec.id, info, forceRefresh) : '';

        let status = 'ready';
        let statusReasonCode = 'ready_cli';
        if (isByok) {
          status = info.installed ? 'byok_ready' : 'byok_missing';
          statusReasonCode = info.installed ? 'ready_byok' : 'byok_key_missing';
        } else if (!info.installed) {
          status = 'missing';
          statusReasonCode = info.overrideInvalid ? 'override_not_found' : 'cli_missing';
        } else if (isHermes && !hermesRouterUp) {
          status = 'service_offline';
          statusReasonCode = 'hermes_9router_offline';
        } else if (recentLimit) {
          status = 'rate_limited';
          statusReasonCode = 'recent_limit';
        }

        const defaultModel = isByok ? (gemCfg?.model || spec.defaultModel) : spec.defaultModel;
        const savedSel = promptConfig.lastSelection?.[spec.id] || {};
        const effectiveModel = savedSel.model !== undefined ? savedSel.model : '';
        const effectiveEffort = savedSel.effort !== undefined ? savedSel.effort : spec.defaultEffort || '';

        return {
          id: spec.id,
          name: spec.name,
          binary: spec.binary,
          residentProvider: spec.residentProvider,
          kind: isByok ? 'api' : 'cli',
          installed: Boolean(info.installed),
          serviceReady: isHermes ? Boolean(info.installed && hermesRouterUp) : Boolean(info.installed),
          status,
          statusReasonCode,
          version,
          resolvedBinary: info.resolvedLabel || spec.binary,
          resolvedPathDisplay: info.resolvedDisplay || '',
          launcherSource: info.source || 'none',
          executableOverride: promptConfig.executableOverrides?.[spec.id]
            ? formatPortablePath(promptConfig.executableOverrides[spec.id])
            : '',
          byokHint: isByok ? (gemCfg?.keyHint || '') : '',
          supportsFullAccess: spec.supportsFullAccess,
          supportsEffort: Boolean(spec.supportsEffort),
          effortOptions: [...(spec.effortOptions || [])],
          defaultEffort: spec.defaultEffort || '',
          billingType: spec.billingType || '',
          fullAccessFlagsOn: spec.fullAccessFlagsOn || '',
          fullAccessFlagsOff: spec.fullAccessFlagsOff || '',
          commandPreviewOn: spec.buildPreview({ model: effectiveModel || defaultModel, effort: effectiveEffort, fullAccess: true }),
          commandPreviewOff: spec.buildPreview({ model: effectiveModel || defaultModel, effort: effectiveEffort, fullAccess: false }),
          defaultModel,
          savedModel: effectiveModel,
          savedEffort: effectiveEffort,
          recommendedModels: spec.recommendedModels ? [...spec.recommendedModels] : [],
          banLowTier: spec.id === 'antigravity',
          recentLimit,
          lastTest: promptConfig.lastTests?.[spec.id] || null,
          serviceNote:
            isHermes && info.installed && !hermesRouterUp
              ? '9router lokal (127.0.0.1:20128) belum aktif'
              : ''
        };
      })
    );

    const defaultCwd = cleanText(promptConfig.lastCwd || (typeof getDefaultCwd === 'function' ? getDefaultCwd() : ''), 260);
    return {
      agents: list,
      defaultCwd,
      config: getConfig()
    };
  }

  function listRuns() {
    return {
      runs: runs.slice(0, MAX_RUNS_HISTORY)
    };
  }

  async function getRunOutput(runId) {
    const cleanId = cleanText(runId, 64);
    const run = runs.find(r => r.id === cleanId);
    if (!run) {
      throw httpError(404, 'run_not_found', 'Riwayat eksekusi prompt tidak ditemukan');
    }
    let fileContent = '';
    if (run.outputFileLabel && /^prun_[a-f0-9]+\.md$/i.test(run.outputFileLabel)) {
      const target = path.join(outputsDirPath, run.outputFileLabel);
      fileContent = await fs.readFile(target, 'utf8').catch(() => '');
    }
    return {
      ok: true,
      runId: run.id,
      agentId: run.agentId,
      agentName: run.agentName,
      model: run.model,
      effort: run.effort || '',
      status: run.status,
      exitCode: run.exitCode,
      limitDetected: Boolean(run.limitDetected),
      retryAfter: run.retryAfter || null,
      outputFileLabel: run.outputFileLabel || '',
      output: run.output || '',
      reportMarkdown: fileContent || run.output || ''
    };
  }

  function appendChunkToRun(run, textChunk) {
    if (!textChunk) return;
    const str = stripAnsi(String(textChunk));
    if (!str) return;
    const currentBytes = Buffer.byteLength(run.output, 'utf8');
    if (currentBytes >= MAX_OUTPUT_BYTES) {
      run.truncated = true;
      return;
    }
    const remaining = MAX_OUTPUT_BYTES - currentBytes;
    const chunkBuf = Buffer.from(str, 'utf8');
    const sliceStr =
      chunkBuf.length > remaining
        ? chunkBuf.subarray(0, remaining).toString('utf8')
        : str;
    if (chunkBuf.length > remaining) {
      run.truncated = true;
    }
    run.output += sliceStr;

    const active = activeProcesses.get(run.id);
    if (active && typeof active.onChunk === 'function') {
      try {
        active.onChunk(sliceStr, { ...run });
      } catch {}
    }

    emitSafe({
      type: 'prompt_run_chunk',
      runId: run.id,
      agentId: run.agentId,
      agentName: run.agentName,
      residentProvider: run.residentProvider,
      target: run.residentProvider,
      chunk: sliceStr
    });
  }

  function buildRunResult(run, outputFilePath) {
    return {
      ok: run.status === 'completed' && run.exitCode === 0 && !run.limitDetected,
      runId: run.id,
      agentId: run.agentId,
      agentName: run.agentName,
      residentProvider: run.residentProvider,
      model: run.model,
      effort: run.effort || '',
      fullAccess: run.fullAccess,
      status: run.status,
      exitCode: run.exitCode,
      output: run.output,
      outputFile: outputFilePath || (run.outputFileLabel ? path.join(outputsDirPath, run.outputFileLabel) : null),
      outputFileLabel: run.outputFileLabel || '',
      truncated: Boolean(run.truncated),
      limitDetected: Boolean(run.limitDetected),
      retryAfter: run.retryAfter || null,
      errorCode: run.errorCode || null,
      error: run.error || null,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      durationMs: run.durationMs
    };
  }

  async function finalizeRun(run, { status, exitCode = 0, error = null, errorCode = null, limitInfo = null }) {
    const active = activeProcesses.get(run.id);
    if (active) {
      if (active.timer) clearTimeout(active.timer);
      if (active.abortCleanup) active.abortCleanup();
      activeProcesses.delete(run.id);
    }

    const lim =
      limitInfo ||
      (status !== 'cancelled' && status !== 'timed_out'
        ? detectUsageLimit(`${run.output}\n${error || ''}`, exitCode)
        : { limited: false, retryAfter: null, matched: null });

    let finalStatus = status;
    let finalErrorCode = errorCode;
    let finalError = error;

    if (lim && lim.limited) {
      finalStatus = 'rate_limited';
      finalErrorCode = 'usage_limit';
      finalError =
        finalError ||
        (lim.retryAfter
          ? `Terkena batas penggunaan (usage limit · coba lagi: ${lim.retryAfter})`
          : 'Terkena batas penggunaan / kuota (usage limit)');
    }

    run.status = finalStatus;
    run.exitCode = exitCode;
    run.limitDetected = Boolean(lim && lim.limited);
    run.retryAfter = (lim && lim.retryAfter) || null;
    run.errorCode = finalErrorCode || (finalStatus === 'completed' ? null : 'non_zero_exit');
    run.error = finalError ? cleanText(finalError, 240) : null;
    run.finishedAt = nowIso();
    const startMs = Date.parse(run.startedAt) || now();
    run.durationMs = Math.max(0, now() - startMs);

    const outputFilePath = await persistRunOutputFiles(run, active?.customOutputPath || null).catch(() => null);
    await queueSaveRuns().catch(() => {});

    emitSafe({
      type: 'prompt_run_done',
      flow: run.flow || null,
      runId: run.id,
      agentId: run.agentId,
      agentName: run.agentName,
      residentProvider: run.residentProvider,
      target: run.residentProvider,
      provider: run.residentProvider,
      persona: run.persona || null,
      status: run.status,
      cancelled: run.status === 'cancelled',
      limitDetected: run.limitDetected,
      retryAfter: run.retryAfter,
      errorCode: run.errorCode,
      outputFileLabel: run.outputFileLabel || '',
      exitCode: run.exitCode,
      durationMs: run.durationMs,
      error: run.error,
      finishedAt: run.finishedAt,
      run: { ...run }
    });

    const result = buildRunResult(run, outputFilePath);
    if (active && Array.isArray(active.waiters)) {
      for (const resolveWaiter of active.waiters) {
        try {
          resolveWaiter(result);
        } catch {}
      }
    }
    return result;
  }

  async function validateOutputPath(rawOutputPath, resolvedCwd) {
    if (!rawOutputPath) return null;
    const cleaned = cleanText(rawOutputPath, 400);
    const resolved = path.resolve(cleaned);
    if (isBlockedCwd(resolved)) {
      throw httpError(403, 'forbidden_output_path', 'Path berkas output tidak boleh mengarah ke Secrets, .git, atau .env');
    }
    const allowed = isInsideDir(resolvedCwd, resolved) || isInsideDir(dataDir, resolved);
    if (!allowed) {
      throw httpError(403, 'forbidden_output_path', 'Path berkas output harus berada di dalam cwd atau dataDir');
    }
    const parentDir = path.dirname(resolved);
    const parentStat = await fs.lstat(parentDir).catch(() => null);
    if (parentStat && parentStat.isSymbolicLink()) {
      throw httpError(403, 'forbidden_output_path', 'Folder output tidak boleh berupa symlink');
    }
    return resolved;
  }

  // [Diubah oleh Gemini - 2026-11-21] Mesin eksekusi bersama untuk startRun (HTTP streaming), runAgent (internal Promise), dan testConnection
  async function executeRun(rawPayload, internalOpts = {}) {
    assertSafeObject(rawPayload);

    const agentId = cleanText(rawPayload.agentId, 32).toLowerCase();
    const spec = WHITELISTED_AGENTS[agentId];
    if (!spec) {
      throw httpError(
        400,
        'invalid_agent_id',
        'Agen AI tidak valid. Pilih salah satu dari: claude, codex, antigravity, opencode, hermes, gemini-api'
      );
    }

    const rawPrompt = typeof rawPayload.prompt === 'string' ? rawPayload.prompt.trim() : '';
    if (!rawPrompt || rawPrompt.length < 1 || rawPrompt.length > MAX_PROMPT_CHARS) {
      throw httpError(400, 'invalid_prompt', `Prompt wajib diisi (1 hingga ${MAX_PROMPT_CHARS} karakter)`);
    }
    const cleanPrompt = rawPrompt.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

    const rawModel = cleanText(rawPayload.model, 96);
    if (rawModel && !MODEL_SLUG_RE.test(rawModel)) {
      throw httpError(400, 'invalid_model', 'Format slug model tidak valid');
    }
    if (agentId === 'antigravity') {
      const agyCheck = validateAntigravityModel(rawModel);
      if (!agyCheck.ok) {
        throw httpError(400, agyCheck.code, agyCheck.error);
      }
    }
    const rawEffort = normalizeEffortForAgent(agentId, rawPayload.effort);

    const defaultFa = internalOpts.defaultFullAccess !== undefined ? Boolean(internalOpts.defaultFullAccess) : true;
    const fullAccess = rawPayload.fullAccess !== undefined ? Boolean(rawPayload.fullAccess) : defaultFa;
    const mode = String(rawPayload.mode || 'live').toLowerCase() === 'demo' ? 'demo' : 'live';

    const rawTimeout = Number(rawPayload.timeoutMs ?? internalOpts.timeoutMs);
    const timeoutMs = Number.isFinite(rawTimeout)
      ? Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, Math.floor(rawTimeout)))
      : RUN_TIMEOUT_MS;

    const fallbackCwd = cleanText(typeof getDefaultCwd === 'function' ? getDefaultCwd() : '', 260) || process.cwd();
    const rawCwd = cleanText(rawPayload.cwd, 260) || fallbackCwd;
    const resolvedCwd = expandPortablePath(rawCwd);

    if (isBlockedCwd(resolvedCwd)) {
      throw httpError(403, 'forbidden_cwd', 'Direktori kerja (cwd) tidak boleh mengarah ke folder Secrets, .git, atau .env');
    }

    let cwdStat = null;
    try {
      cwdStat = await fs.lstat(resolvedCwd);
    } catch {
      cwdStat = null;
    }
    if (!cwdStat || !cwdStat.isDirectory() || cwdStat.isSymbolicLink()) {
      throw httpError(400, 'invalid_cwd', 'Direktori kerja (cwd) tidak ditemukan atau bukan folder reguler');
    }

    const customOutputPath = await validateOutputPath(internalOpts.outputPath || rawPayload.outputPath, resolvedCwd);
    const taskLabel = cleanText(internalOpts.taskLabel || rawPayload.taskLabel, 80);
    const persona = cleanText(internalOpts.persona || rawPayload.persona, 40) || null;

    // Ingat pilihan terakhir per agen & folder kerja terakhir saat dipicu dari UI
    if (internalOpts.rememberSelection !== false && mode !== 'demo') {
      promptConfig.lastSelection[agentId] = { model: rawModel, effort: rawEffort };
      promptConfig.lastCwd = resolvedCwd;
      promptConfig.recentCwds = [
        resolvedCwd,
        ...(promptConfig.recentCwds || []).filter(x => x.toLowerCase() !== resolvedCwd.toLowerCase())
      ].slice(0, 8);
      queueSaveConfig().catch(() => {});
    }

    let preResolvedLauncher = null;
    if (mode !== 'demo' && agentId !== 'gemini-api') {
      preResolvedLauncher =
        typeof spawnImpl === 'function'
          ? { installed: true, executable: spec.binary, prefixArgs: [], resolvedLabel: spec.binary }
          : await getLauncherForAgent(agentId);
    }

    const invocation = spec.buildInvocation({
      prompt: cleanPrompt,
      model: rawModel,
      effort: rawEffort,
      fullAccess,
      cwd: resolvedCwd,
      timeoutMs
    });

    const runId = 'prun_' + crypto.randomBytes(6).toString('hex');
    const startedAt = nowIso();
    const run = {
      id: runId,
      // V16-C [Diubah oleh Codex - 2026-11-21] Internal correlation only; HTTP payload cannot choose this source.
      flow: internalOpts.flowSource === 'pipeline' && /^[\w.:-]{1,120}$/.test(internalOpts.flowTaskId || '')
        ? { source:'pipeline', taskId:internalOpts.flowTaskId, parent:/^[\w.:-]{1,64}$/.test(internalOpts.flowParent || '') ? internalOpts.flowParent : null } : null,
      agentId: spec.id,
      agentName: spec.name,
      residentProvider: spec.residentProvider,
      persona,
      prompt: cleanPrompt,
      cwdLabel: path.basename(resolvedCwd) || '.',
      model: invocation.resolvedModel || rawModel || spec.defaultModel || '',
      effort: invocation.resolvedEffort || rawEffort || '',
      fullAccess: spec.supportsFullAccess ? fullAccess : false,
      mode,
      timeoutMs,
      commandPreview: spec.buildPreview({ model: rawModel || invocation.resolvedModel, effort: rawEffort || invocation.resolvedEffort, fullAccess }),
      status: 'running',
      output: '',
      outputFileLabel: '',
      truncated: false,
      limitDetected: false,
      retryAfter: null,
      errorCode: null,
      exitCode: null,
      startedAt,
      finishedAt: null,
      durationMs: 0,
      error: null
    };

    runs.unshift(run);
    if (runs.length > MAX_RUNS_HISTORY) {
      runs = runs.slice(0, MAX_RUNS_HISTORY);
    }

    let resolveDone = null;
    const donePromise = new Promise(resolve => {
      resolveDone = resolve;
    });

    const registerActive = (killFn, timer = null) => {
      let abortCleanup = null;
      if (internalOpts.signal) {
        if (internalOpts.signal.aborted) {
          queueMicrotask(() => cancelRun(run.id).catch(() => {}));
        } else {
          const onAbort = () => cancelRun(run.id).catch(() => {});
          internalOpts.signal.addEventListener('abort', onAbort, { once: true });
          abortCleanup = () => internalOpts.signal.removeEventListener('abort', onAbort);
        }
      }
      activeProcesses.set(run.id, {
        kill: killFn,
        timer,
        waiters: [resolveDone],
        onChunk: typeof internalOpts.onChunk === 'function' ? internalOpts.onChunk : null,
        customOutputPath,
        abortCleanup
      });
    };

    const emitStarted = () => {
      emitSafe({
        type: 'prompt_run_started',
        flow: run.flow || null,
        runId: run.id,
        agentId: run.agentId,
        agentName: run.agentName,
        residentProvider: run.residentProvider,
        target: run.residentProvider,
        provider: run.residentProvider,
        persona: run.persona,
        fullAccess: run.fullAccess,
        mode: run.mode,
        task: taskLabel || `Prompt Bos · ${run.agentName}`,
        startedAt: run.startedAt,
        run: { ...run }
      });
    };

    // MODE DEMO
    if (mode === 'demo') {
      const demoChunks = [
        `[${spec.name} · Mode Demo · ${run.fullAccess ? 'Full Access' : 'Standard'}]\n`,
        `Perintah: ${run.commandPreview}\n`,
        `Direktori Kerja: ${run.cwdLabel}\n`,
        `Menerima instruksi Bos: "${cleanPrompt.slice(0, 120)}${cleanPrompt.length > 120 ? '...' : ''}"\n\n`,
        `1. Memeriksa struktur berkas & aturan workspace secara otomatis...\n`,
        `2. Menyusun eksekusi & verifikasi untuk tugas yang diminta...\n`,
        `Selesai: Tugas simulasi berhasil dijalankan oleh ${spec.name} dengan 0 error.\n`
      ];
      let idx = 0;
      const stepTimer = setInterval(() => {
        if (run.status !== 'running') {
          clearInterval(stepTimer);
          return;
        }
        if (idx < demoChunks.length) {
          appendChunkToRun(run, demoChunks[idx]);
          idx += 1;
        } else {
          clearInterval(stepTimer);
          finalizeRun(run, { status: 'completed', exitCode: 0 });
        }
      }, 60);
      if (typeof stepTimer.unref === 'function') stepTimer.unref();
      registerActive(() => clearInterval(stepTimer), null);
      await queueSaveRuns();
      emitStarted();
      return { ok: true, run, donePromise };
    }

    // MODE LIVE — Cabang 1: Gemini API BYOK
    if (agentId === 'gemini-api') {
      const gem = typeof getGeminiConfig === 'function' ? getGeminiConfig() : null;
      if (!gem || !gem.apiKey || typeof fetchImpl !== 'function') {
        registerActive(() => {}, null);
        emitStarted();
        appendChunkToRun(
          run,
          'Error: Gemini API Key (BYOK) belum disimpan. Buka Pengaturan Integrasi untuk menyimpan Kunci API terlebih dahulu.\n'
        );
        await finalizeRun(run, {
          status: 'failed',
          exitCode: 1,
          errorCode: 'byok_missing',
          error: 'Kunci API Gemini belum diisi'
        });
        return { ok: true, run, donePromise };
      }

      const usedModel = rawModel || gem.model || 'gemini-2.5-flash';
      run.model = usedModel;
      const controller = new AbortController();
      const apiTimeout = Math.min(timeoutMs, 180000);
      let timedOut = false;
      const timeoutTimer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, apiTimeout);
      if (typeof timeoutTimer.unref === 'function') timeoutTimer.unref();

      registerActive(() => controller.abort(), timeoutTimer);
      await queueSaveRuns();
      emitStarted();

      (async () => {
        try {
          if (run.status !== 'running') return;
          appendChunkToRun(run, `[Gemini REST API · Model: ${usedModel}]\nMengirim prompt...\n\n`);
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(usedModel)}:generateContent`;
          const resp = await fetchImpl(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': gem.apiKey
            },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: cleanPrompt }] }],
              generationConfig: { temperature: 0.5, maxOutputTokens: 2048 }
            }),
            signal: controller.signal
          });
          if (run.status !== 'running') return;
          if (!resp.ok) {
            const errBody = await resp.text().catch(() => '');
            appendChunkToRun(run, `\nHTTP Error ${resp.status} dari Gemini API.\n${errBody.slice(0, 400)}\n`);
            const lim = detectUsageLimit(`HTTP ${resp.status} ${errBody}`, resp.status);
            await finalizeRun(run, {
              status: 'failed',
              exitCode: resp.status,
              errorCode: lim.limited ? 'usage_limit' : 'http_error',
              error: `Gemini HTTP ${resp.status}`,
              limitInfo: lim
            });
            return;
          }
          const data = await resp.json();
          if (run.status !== 'running') return;
          if (data?.usageMetadata && typeof onGeminiUsage === 'function') {
            try {
              await onGeminiUsage({
                provider: 'gemini',
                model: usedModel,
                usageMetadata: data.usageMetadata,
                agent: 'gemini-api',
                task: cleanPrompt.slice(0, 80)
              });
            } catch {}
          }
          if (run.status !== 'running') return;
          const replyText =
            data?.candidates?.[0]?.content?.parts
              ?.map(p => p?.text || '')
              .join('\n')
              .trim() || '(Respons kosong)';
          appendChunkToRun(run, replyText + '\n');
          if (data?.usageMetadata) {
            const inTok = data.usageMetadata.promptTokenCount || 0;
            const outTok = data.usageMetadata.candidatesTokenCount || 0;
            appendChunkToRun(run, `\n--- Token: input ${inTok}, output ${outTok} ---\n`);
          }
          await finalizeRun(run, { status: 'completed', exitCode: 0 });
        } catch (err) {
          if (run.status !== 'running') return;
          if (timedOut) {
            appendChunkToRun(run, `\n[Batas waktu ${Math.round(apiTimeout / 1000)} dtk tercapai]\n`);
            await finalizeRun(run, {
              status: 'timed_out',
              exitCode: 124,
              errorCode: 'timeout',
              error: 'Melebihi batas waktu permintaan Gemini API'
            });
            return;
          }
          const msg = cleanText(err?.message || 'Koneksi Gemini API terputus', 160);
          appendChunkToRun(run, `\nGagal: ${msg}\n`);
          await finalizeRun(run, { status: 'failed', exitCode: 1, errorCode: 'network_error', error: msg });
        }
      })();

      return { ok: true, run, donePromise };
    }

    // MODE LIVE — Cabang 2: 5 Agen CLI Lokal
    const launcher = preResolvedLauncher || { installed: false, executable: null, prefixArgs: [], resolvedLabel: '' };

    if (!launcher.installed || !launcher.executable) {
      registerActive(() => {}, null);
      emitStarted();
      appendChunkToRun(
        run,
        `Error: CLI "${spec.binary}" (${spec.name}) tidak ditemukan di PATH maupun lokasi instalasi umum Windows.\n` +
          'Anda dapat menetapkan "Jalur eksekutabel" manual untuk agen ini di Panel Prompt.\n'
      );
      await finalizeRun(run, {
        status: 'failed',
        exitCode: 127,
        errorCode: 'cli_missing',
        error: `CLI ${spec.binary} belum ditemukan`
      });
      return { ok: true, run, donePromise };
    }

    // Fail-fast Hermes bila 9router lokal mati
    if (agentId === 'hermes' && !rawModel && typeof spawnImpl !== 'function' && typeof hermesRouterProbe === 'function') {
      const routerUp = await hermesRouterProbe().catch(() => false);
      if (!routerUp) {
        registerActive(() => {}, null);
        emitStarted();
        appendChunkToRun(
          run,
          'Error: Layanan 9router lokal (http://127.0.0.1:20128) belum aktif sehingga Hermes CLI akan menggantung.\n' +
            'Jalankan terlebih dahulu: 9router --tray --no-browser --skip-update (atau pilih model/provider eksternal).\n'
        );
        await finalizeRun(run, {
          status: 'failed',
          exitCode: 69,
          errorCode: 'service_offline',
          error: '9router lokal (:20128) belum aktif untuk Hermes'
        });
        return { ok: true, run, donePromise };
      }
    }

    const cliArgs = [...(launcher.prefixArgs || []), ...invocation.args];
    const spawnFn = typeof spawnImpl === 'function' ? spawnImpl : spawn;
    const useStdin = typeof invocation.stdinText === 'string';
    const augPath = buildAugmentedPathEnv([path.dirname(launcher.executable)]);

    // [Diubah oleh Gemini - 2026-11-21] Jalankan CLI Windows nyata di bawah Job Object (short_process_runner.py) agar 0 proses yatim saat server mati normal maupun crash paksa
    const runnerScript = path.join(root, 'short_process_runner.py');
    const runnerPy = typeof spawnImpl !== 'function' && process.platform === 'win32' ? resolveJobRunnerPython() : '';
    let usingJobRunner = false;
    let stdinTempFile = '';
    let spawnExe = launcher.executable;
    let spawnArgs = cliArgs;
    let spawnStdio = [useStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'];

    if (runnerPy && require('node:fs').existsSync(runnerScript)) {
      usingJobRunner = true;
      if (useStdin) {
        await ensureDirs();
        stdinTempFile = path.join(outputsDirPath, `.stdin_${run.id}_${crypto.randomBytes(4).toString('hex')}.tmp`);
        await fs.writeFile(stdinTempFile, invocation.stdinText, 'utf8');
      }
      spawnExe = runnerPy;
      spawnArgs = [
        '-I',
        runnerScript,
        '--parent-pid',
        String(process.pid),
        ...(stdinTempFile ? ['--stdin-file', stdinTempFile] : []),
        '--',
        launcher.executable,
        ...cliArgs
      ];
      spawnStdio = ['pipe', 'pipe', 'pipe'];
    }

    const cleanupStdinTemp = () => {
      if (!stdinTempFile) return;
      const p = stdinTempFile;
      stdinTempFile = '';
      fs.unlink(p).catch(() => {});
    };

    try {
      const child = spawnFn(spawnExe, spawnArgs, {
        cwd: resolvedCwd,
        windowsHide: true,
        shell: false,
        stdio: spawnStdio,
        env: {
          ...process.env,
          PATH: augPath,
          Path: augPath,
          NO_COLOR: '1',
          FORCE_COLOR: '0',
          PYTHONIOENCODING: 'utf-8'
        }
      });

      const timeoutTimer = setTimeout(() => {
        if (run.status !== 'running') return;
        const sec = Math.round(timeoutMs / 1000);
        appendChunkToRun(run, `\n[Batas waktu ${sec} detik tercapai — menghentikan pohon proses...]\n`);
        void killProcessTreeSafe(child, { usingJobRunner }).finally(cleanupStdinTemp);
        finalizeRun(run, {
          status: 'timed_out',
          exitCode: 124,
          errorCode: 'timeout',
          error: `Melebihi batas waktu ${sec} detik`
        });
      }, timeoutMs);
      if (typeof timeoutTimer.unref === 'function') timeoutTimer.unref();

      registerActive(() => killProcessTreeSafe(child, { usingJobRunner }).finally(cleanupStdinTemp), timeoutTimer);
      await queueSaveRuns();
      emitStarted();

      if (usingJobRunner && child.stdin) {
        child.stdin.on('error', () => {});
      } else if (useStdin && child.stdin && typeof child.stdin.end === 'function') {
        child.stdin.on('error', () => {});
        child.stdin.end(invocation.stdinText, 'utf8');
      }

      if (child.stdout) {
        child.stdout.on('data', chunk => {
          if (run.status !== 'running') return;
          appendChunkToRun(run, chunk.toString('utf8'));
        });
      }
      if (child.stderr) {
        child.stderr.on('data', chunk => {
          if (run.status !== 'running') return;
          appendChunkToRun(run, chunk.toString('utf8'));
        });
      }

      child.on('error', err => {
        cleanupStdinTemp();
        if (run.status !== 'running') return;
        const msg = cleanText(err?.message || 'Gagal menjalankan proses CLI', 180);
        appendChunkToRun(run, `\n[Error Proses]: ${msg}\n`);
        finalizeRun(run, { status: 'failed', exitCode: 1, errorCode: 'spawn_error', error: msg });
      });

      child.on('close', code => {
        cleanupStdinTemp();
        if (run.status !== 'running') return;
        const exitCode = typeof code === 'number' ? code : 0;
        finalizeRun(run, {
          status: exitCode === 0 ? 'completed' : 'failed',
          exitCode,
          errorCode: exitCode === 0 ? null : 'non_zero_exit',
          error: exitCode === 0 ? null : `Proses berhenti dengan kode keluar ${exitCode}`
        });
      });
    } catch (err) {
      cleanupStdinTemp();
      registerActive(() => {}, null);
      emitStarted();
      const msg = cleanText(err?.message || 'Gagal melakukan spawn CLI', 180);
      appendChunkToRun(run, `\n[Error Spawn]: ${msg}\n`);
      await finalizeRun(run, { status: 'failed', exitCode: 1, errorCode: 'spawn_error', error: msg });
    }

    return { ok: true, run, donePromise };
  }

  async function startRun(rawPayload) {
    const { ok, run } = await executeRun(rawPayload, { defaultFullAccess: true });
    return { ok, run };
  }

  // [Diubah oleh Gemini - 2026-11-21] Uji koneksi minimal ("balas satu kata: siap") atas permintaan user
  async function testConnection(rawPayload) {
    assertSafeObject(rawPayload);
    const agentId = cleanText(rawPayload.agentId, 32).toLowerCase();
    if (!WHITELISTED_AGENTS[agentId]) {
      throw httpError(400, 'invalid_agent_id', 'Agen AI tidak valid');
    }
    const started = now();
    const { donePromise } = await executeRun(
      {
        agentId,
        prompt: 'balas satu kata: siap',
        cwd: rawPayload.cwd,
        model: rawPayload.model,
        effort: rawPayload.effort,
        fullAccess: false,
        mode: rawPayload.mode || 'live',
        timeoutMs: Math.min(35000, Math.max(5000, Number(rawPayload.timeoutMs) || 25000)),
        taskLabel: 'Uji Koneksi'
      },
      {
        defaultFullAccess: false,
        rememberSelection: false,
        timeoutMs: 25000,
        taskLabel: 'Uji Koneksi'
      }
    );
    const res = await donePromise;
    const summary = {
      ok: Boolean(res.ok),
      agentId,
      runId: res.runId,
      model: res.model,
      effort: res.effort || '',
      status: res.status,
      exitCode: res.exitCode,
      latencyMs: Math.max(1, res.durationMs || now() - started),
      snippet: cleanText(res.output || res.error || '', 120),
      limitDetected: Boolean(res.limitDetected),
      retryAfter: res.retryAfter || null,
      errorCode: res.errorCode || null,
      error: res.error || null,
      testedAt: nowIso()
    };
    promptConfig.lastTests[agentId] = summary;
    await queueSaveConfig().catch(() => {});
    return summary;
  }

  // [Diubah oleh Gemini - 2026-11-21] Fungsi internal runAgent sesuai kontrak docs/briefs/V14_AGENT_CONTRACT.md
  async function runAgent(agentId, prompt, opts = {}) {
    assertSafeObject(opts);
    const { donePromise } = await executeRun(
      {
        agentId,
        prompt,
        cwd: opts.cwd,
        model: opts.model,
        effort: opts.effort,
        fullAccess: opts.fullAccess !== undefined ? Boolean(opts.fullAccess) : false,
        mode: opts.mode || 'live',
        timeoutMs: opts.timeoutMs,
        taskLabel: opts.taskLabel,
        persona: opts.persona
      },
      {
        defaultFullAccess: false,
        rememberSelection: false,
        timeoutMs: opts.timeoutMs,
        outputPath: opts.outputPath,
        signal: opts.signal,
        onChunk: opts.onChunk,
        taskLabel: opts.taskLabel,
        persona: opts.persona,
        flowSource: opts.flowSource, flowTaskId: opts.flowTaskId, flowParent: opts.flowParent
      }
    );
    return donePromise;
  }

  async function cancelRun(runId) {
    const cleanId = cleanText(runId, 64);
    const run = runs.find(r => r.id === cleanId);
    if (!run) {
      throw httpError(404, 'run_not_found', 'Riwayat eksekusi prompt tidak ditemukan');
    }
    const active = activeProcesses.get(run.id);
    if (active) {
      try {
        active.kill();
      } catch {}
    }
    if (run.status === 'running') {
      appendChunkToRun(run, '\n[Dihentikan oleh Bos]\n');
      await finalizeRun(run, {
        status: 'cancelled',
        exitCode: 130,
        errorCode: 'cancelled',
        error: 'Dihentikan oleh pengguna'
      });
    }
    return { ok: true, run: { ...run } };
  }

  async function deleteRun(runId) {
    const cleanId = cleanText(runId, 64);
    const idx = runs.findIndex(r => r.id === cleanId);
    if (idx === -1) {
      throw httpError(404, 'run_not_found', 'Riwayat eksekusi prompt tidak ditemukan');
    }
    const target = runs[idx];
    if (target.status === 'running') {
      await cancelRun(cleanId).catch(() => {});
    }
    runs.splice(idx, 1);
    if (target.outputFileLabel && /^prun_[a-f0-9]+\.md$/i.test(target.outputFileLabel)) {
      await fs.unlink(path.join(outputsDirPath, target.outputFileLabel)).catch(() => {});
    }
    await queueSaveRuns();
    return { ok: true, deletedId: cleanId };
  }

  // [Diubah oleh Gemini - 2026-11-21] Kembalikan daftar run agen yang sedang aktif (tanpa isi prompt) untuk /runtime/active
  function getActiveRuns() {
    const items = [];
    for (const runId of activeProcesses.keys()) {
      const run = runs.find(r => r.id === runId);
      if (!run || run.status !== 'running') continue;
      items.push({
        id: run.id,
        kind: 'prompt',
        agentId: run.agentId,
        agentName: run.agentName,
        label: run.agentName || run.agentId,
        mode: run.mode,
        startedAt: run.startedAt || null
      });
    }
    return items;
  }

  async function stop() {
    const killPromises = [];
    for (const [runId, active] of activeProcesses.entries()) {
      if (active.timer) clearTimeout(active.timer);
      if (active.abortCleanup) active.abortCleanup();
      const run = runs.find(r => r.id === runId);
      if (run && run.status === 'running') {
        run.status = 'interrupted';
        run.errorCode = 'interrupted';
        run.error = 'Dihentikan saat Office AI ditutup';
        run.finishedAt = nowIso();
        const res = buildRunResult(run, null);
        for (const w of active.waiters || []) {
          try {
            w(res);
          } catch {}
        }
      }
      try {
        const p = active.kill();
        if (p && typeof p.then === 'function') killPromises.push(p);
      } catch {}
    }
    activeProcesses.clear();
    if (killPromises.length > 0) {
      await Promise.allSettled(killPromises);
    }
    await queueSaveRuns();
    await writeQueue;
  }

  return {
    WHITELISTED_AGENTS,
    ANTIGRAVITY_RECOMMENDED_MODELS,
    detectAgents,
    getAgentModels,
    getModels,
    listQuickCwds,
    validateCwd,
    getConfig,
    updateConfig,
    testConnection,
    listRuns,
    getActiveRuns,
    getRunOutput,
    startRun,
    runAgent,
    cancelRun,
    deleteRun,
    stop
  };
}

module.exports = {
  createAgentPromptStore,
  WHITELISTED_AGENTS,
  ANTIGRAVITY_RECOMMENDED_MODELS,
  CODEX_DEFAULT_ALIASES,
  OPENCODE_MODEL_ALIASES,
  detectUsageLimit,
  validateAntigravityModel,
  resolveOpencodeModel,
  resolveCodexModelAndEffort,
  resolveWindowsCliLauncher,
  formatPortablePath,
  expandPortablePath,
  parseAgyModelsOutput,
  stripAnsi
};
