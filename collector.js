'use strict';
// Kolektor penggunaan dan aktivitas agen lokal (Claude Code, Codex, Antigravity/Gemini, Hermes).
// BACA SAJA terhadap direktori agen: tidak pernah menulis, mengubah, atau menghapus berkas agen.
// Yang disimpan/dikirim hanya angka, status, kategori, nama model, basename berkas yang aman, dan hash ID.
// Teks prompt, isi tool, perintah penuh, dan path penuh tidak pernah keluar dari fungsi pembaca baris.
const fs = require('node:fs'), fsp = require('node:fs/promises'), path = require('node:path');
const os = require('node:os'), crypto = require('node:crypto'), { pathToFileURL } = require('node:url');

const CATEGORIES = Object.freeze(['code','terminal','video','render','doc','notes','browse','data','design','chat','audio','idle']);
const PROVIDERS = Object.freeze(['claude','codex','gemini','hermes']);
const ROLE = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini', hermes: 'Hermes' };
const IDLE_MS = 20000, SUB_RETIRE_MS = 30000, LIVE_MS = 120000, TURN_MAX_MS = 30 * 60000;
const MAX_LINE = 4 * 1024 * 1024, CHUNK = 1024 * 1024, LIVE_BUDGET = 8 * 1024 * 1024;
const MAX_DB=256*1024*1024;
const sensitive=p=>String(p).split(/[\\/]/).some(n=>/secret|token|password|^\.env|^\.git$/i.test(n));
async function safePath(file){if(sensitive(file))throw Error('sumber ditolak');let p=path.resolve(file);while(true){const st=await fsp.lstat(p);if(st.isSymbolicLink())throw Error('tautan ditolak');const up=path.dirname(p);if(up===p)break;p=up;}return file;}
async function sourceStat(file){await safePath(file);return fsp.lstat(file);}
async function sourceDirs(dir){await safePath(dir);return fsp.readdir(dir,{withFileTypes:true});}
const TICK_MS = 1500, LIST_MS = 10000, DB_MS = 3000, HERMES_MS = 5000;
const FIELDS = ['input_tokens','output_tokens','cache_read_input_tokens','cache_creation_input_tokens'];

const h = (s, n = 16) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, n);
const localDay = ms => { const d = new Date(ms); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); };
const startOfDay = (ms, back = 0) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - back); return d.getTime(); };
const safeModel = m => typeof m === 'string' && /^[a-zA-Z0-9_.:-]{1,64}$/.test(m) ? m : undefined;
const count = v => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 1e12 ? v : 0;
const tsOf = v => { const n = typeof v === 'number' ? v : Date.parse(v); return Number.isFinite(n) ? n : NaN; };

// ---------- kategori dari NAMA tool + ekstensi + nama biner saja ----------
const EXT = { code: 'py js cjs mjs ts tsx jsx css scss less html htm vue svelte go rs java kt c cc cpp h hpp cs rb php ps1 psm1 sh bash bat cmd lua toml yaml yml ini cfg xml sql',
  data: 'csv tsv json jsonl ndjson xlsx xls parquet sqlite sqlite3 db', doc: 'md mdx docx doc pdf rtf odt pptx', notes: 'txt log',
  video: 'mp4 mov mkv webm avi m4v', audio: 'wav mp3 flac ogg m4a aac opus', design: 'png jpg jpeg gif svg psd fig ai webp ico bmp tif tiff sketch xd', render: 'blend' };
const EXT_CAT = new Map(); for (const [c, list] of Object.entries(EXT)) for (const e of list.split(' ')) EXT_CAT.set(e, c);
const BIN = [['video', /^(ffmpeg|ffprobe|ffplay|mpv|vlc|handbrakecli)$/], ['render', /^(blender|remotion|hyperframes|chrome-headless-shell|make\.ps1|make\.sh)$|^[\w.-]*render[\w.-]*\.(js|cjs|mjs|py|ps1|sh)$/],
  ['audio', /^(sox|edge-tts|whisper|voice\.ps1|humanize\.ps1|rekam\.py)$/], ['design', /^(magick|inkscape|gimp|make_thumbnail\.py)$/],
  ['browse', /^(curl|wget)$/], ['data', /^(sqlite3|duckdb|psql|mysql)$/]];
const extOf = name => { const m = /\.([a-z0-9]{1,8})$/i.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; };
function commandCategory(cmd) {
  if (typeof cmd !== 'string') { if (Array.isArray(cmd)) cmd = cmd.filter(x => typeof x === 'string').join(' '); else return 'terminal'; }
  const words = cmd.slice(0, 4000).match(/[^\s"'`|&;<>(){}=,]+/g) || [];
  let media = null;
  for (const w of words) {
    const base = w.split(/[\\/]/).pop().toLowerCase().replace(/\.exe$/, '');
    for (const [c, re] of BIN) if (re.test(base)) return c;
    const c = EXT_CAT.get(extOf(base)); if (!media && (c === 'video' || c === 'audio')) media = c;
  }
  return media || 'terminal';
}
function categoryFor(tool, info = {}) {
  const t = String(tool || '').toLowerCase();
  if (!t) return 'chat';
  if (/(^|_)(todo|todowrite|update_plan|memory|plan)($|_)/.test(t)) return 'notes';
  if (/^(bash|powershell|shell|exec|exec_command|local_shell|local_shell_call|terminal|execute_code|run_command|shell_command|process_manage)$/.test(t) || /shell|terminal|command/.test(t)) return commandCategory(info.command);
  if (/web|fetch|browser|navigate|playwright|chrome|url/.test(t)) return 'browse';
  if (info.file) { const c = EXT_CAT.get(extOf(info.file)); if (c) return c; }
  if (/(edit|write|patch|notebook|read|grep|glob|file|search_files|list_dir|view)/.test(t)) return /image/.test(t) ? 'design' : 'code';
  if (/image|vision|draw|design|figma/.test(t)) return 'design';
  if (/audio|tts|speech|voice/.test(t)) return 'audio';
  if (/sql|sheet|csv|data/.test(t)) return 'data';
  return 'chat';
}
function taskFor(tool, file) {
  const t = String(tool || '').toLowerCase(), name = safeName(file);
  if (/(edit|write|patch|notebook)/.test(t)) return name ? 'mengedit ' + name : 'mengedit berkas';
  if (/(read|grep|glob|view|search_files|list_dir)/.test(t) && !/web/.test(t)) return name ? 'membaca ' + name : 'membaca kode';
  if (/bash|powershell|shell|exec|terminal|command|process/.test(t)) return 'menjalankan perintah';
  if (/^(agent|task)$|delegate|spawn/.test(t)) return 'mendelegasikan tugas';
  if (/web|fetch|browser|navigate|search/.test(t)) return 'meneliti referensi';
  return 'menggunakan alat';
}
// Basename saja, maksimal 40 karakter, ekstensi yang diterima server; nama sensitif tidak pernah dikirim.
function safeName(value) {
  if (typeof value !== 'string' || !value) return '';
  const parts = value.replace(/\\/g, '/').split('/');
  if (parts.some(p => /secret|token|password|\.env/i.test(p))) return '';
  const name = parts.pop().replace(/[^\w. -]/g, '');
  if (!name || name.length > 40 || !/\.(js|cjs|mjs|ts|tsx|jsx|py|md|html|css|json|txt|yaml|yml)$/i.test(name)) return '';
  return name;
}
const ROLES = [['backend','Backend Dev'],['frontend','Frontend Dev'],['full-stack','Full-Stack Dev'],['fullstack','Full-Stack Dev'],['qa','QA Engineer'],['test','QA Engineer'],['devops','DevOps'],['pentest','Pentester'],['security','Pentester'],['design','Designer'],['explore','Researcher'],['research','Researcher'],['plan','Project Manager'],['general','Full-Stack Dev']];
const roleFor = kind => { kind = String(kind || '').toLowerCase(); for (const [k, r] of ROLES) if (kind.includes(k)) return r; return 'Full-Stack Dev'; };

// ---------- protobuf generik (hanya untuk angka usage Antigravity) ----------
function pbFields(buf) {
  const out = [], n = buf.length; let i = 0;
  const varint = () => { let r = 0, m = 1; for (let k = 0; k < 10; k++) { if (i >= n) throw 0; const b = buf[i++]; r += (b & 127) * m; m *= 128; if (b < 128) return r; } throw 0; };
  try {
    while (i < n) {
      const key = varint(), f = Math.floor(key / 8), t = key % 8;
      if (f < 1) return null;
      if (t === 0) out.push([f, 0, varint()]);
      else if (t === 1) i += 8; else if (t === 5) i += 4;
      else if (t === 2) { const len = varint(); if (i + len > n) return null; out.push([f, 2, buf.subarray(i, i + len)]); i += len; }
      else return null;
    }
  } catch { return null; }
  return i === n ? out : null;
}
// gen_metadata.data: 1 = generation, 1.4 = ModelUsageStats {2 input, 3 output, 4 cache_write, 5 cache_read, 11 response_id}, 1.19 = model.
function geminiUsage(blob) {
  if (!Buffer.isBuffer(blob) && !(blob instanceof Uint8Array)) return null;
  const top = pbFields(Buffer.from(blob)); const g = top && top.find(x => x[0] === 1 && x[1] === 2); if (!g) return null;
  const f = pbFields(g[2]); if (!f) return null;
  const u = f.find(x => x[0] === 4 && x[1] === 2); if (!u) return null;
  const fu = pbFields(u[2]); if (!fu) return null;
  const v = k => { const x = fu.find(y => y[0] === k && y[1] === 0); return x && x[2] <= 1e10 ? x[2] : 0; };
  const tokens = { input_tokens: v(2), output_tokens: v(3), cache_creation_input_tokens: v(4), cache_read_input_tokens: v(5) };
  const m = f.find(x => x[0] === 19 && x[1] === 2), rid = fu.find(y => y[0] === 11 && y[1] === 2);
  return { tokens, model: m ? safeModel(m[2].toString('utf8')) : undefined, rid: rid ? h(rid[2].toString('latin1'), 12) : null };
}

function addTokens(target, tokens) { for (const k of FIELDS) if (tokens[k]) target[k] = (target[k] || 0) + tokens[k]; return target; }
const nonzero = t => FIELDS.some(k => t[k] > 0);
const clean = t => { const o = {}; for (const k of FIELDS) if (t[k] > 0) o[k] = t[k]; return o; };

// Baca hanya byte baru sejak rec.offset. Offset maju hanya sampai newline terakhir, jadi baris terpotong
// dibaca ulang setelah lengkap. Baris > MAX_LINE dilewati tanpa diparse.
async function readNew(file, rec, budget, onLine) {
  await safePath(file);const before=await fsp.lstat(file);if(!before.isFile())throw Error('bukan log');const fh = await fsp.open(file, 'r'); let read = 0;
  try {
    const st = await fh.stat();if(st.ino!==before.ino||st.dev!==before.dev)throw Error('sumber berubah');if(rec.ino!==undefined&&(rec.ino!==st.ino||rec.dev!==st.dev)){rec.offset=0;rec.skip=false;rec.resets=(rec.resets||0)+1;}rec.ino=st.ino;rec.dev=st.dev;
    if (st.size < (rec.offset || 0)) { rec.offset = 0; rec.skip = false; rec.resets = (rec.resets || 0) + 1; }
    let pos = rec.offset || 0, carry = null;
    while (pos < st.size && read < budget) {
      const len = Math.min(CHUNK, st.size - pos), buf = Buffer.allocUnsafe(len);
      const { bytesRead } = await fh.read(buf, 0, len, pos); if (!bytesRead) break;
      read += bytesRead;
      const base = pos - (carry ? carry.length : 0), data = carry ? Buffer.concat([carry, buf.subarray(0, bytesRead)]) : buf.subarray(0, bytesRead);
      pos += bytesRead; carry = null;
      let start = 0, nl;
      while ((nl = data.indexOf(10, start)) !== -1) {
        if (rec.skip) rec.skip = false; else if (nl - start <= MAX_LINE) onLine(data.subarray(start, nl), base + start); else rec.skipped=(rec.skipped||0)+1;
        start = nl + 1; rec.offset = base + start;
      }
      const rest = data.length - start;
      if (rest > 0) { if (rec.skip || rest > MAX_LINE) { if(!rec.skip)rec.skipped=(rec.skipped||0)+1;rec.skip = true; rec.offset = base + data.length; } else carry = Buffer.from(data.subarray(start)); }
    }
    rec.size = st.size; rec.mtime = st.mtimeMs;
  } finally { await fh.close(); }
  return read;
}
function parse(buf) { try { return JSON.parse(buf.toString('utf8')); } catch { return null; } }

function loadSqlite() { try { return require('node:sqlite').DatabaseSync; } catch { return null; } }

function createCollector({ dataDir, now = Date.now, sink, roots = {}, enabled: initial = {}, log = () => {}, onUsageFile = () => {} } = {}) {
  if (!dataDir || typeof sink !== 'function') throw Error('dataDir dan sink wajib');
  const home = os.homedir(), local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  roots = { claude: path.join(home, '.claude', 'projects'), codex: path.join(home, '.codex', 'sessions'),
    gemini: [path.join(home, '.gemini', 'antigravity-cli'), path.join(home, '.gemini', 'antigravity')], hermes: path.join(local, 'hermes'), ...roots };
  if (!Array.isArray(roots.gemini)) roots.gemini = [roots.gemini];
  // Codex juga jalan dengan CODEX_HOME lain: akun terkelola Orca (dipakai cx_run.py failover) di %APPDATA%/orca/codex-accounts/<id>/home.
  if (roots.codexAccounts === undefined) roots.codexAccounts = path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'orca', 'codex-accounts');
  // v6-C: akun/profil hanya sebagai id hash (tanpa nama folder/path), untuk memetakan agen ke sumber tertentu.
  const codexAccount = new Map(), sources = new Map();
  function source(id, provider, kind, t) { const s = sources.get(id) || { id, provider, kind, last: 0 }; if (kind) s.kind = kind; if (Number.isFinite(t)) s.last = Math.max(s.last, t); sources.set(id, s); return id; }
  async function codexRoots() {
    const list = [roots.codex];
    if (roots.codexAccounts) { try { for (const e of await sourceDirs(roots.codexAccounts)) if (e.isDirectory() && /^[A-Za-z0-9-]{1,64}$/.test(e.name)) list.push(path.join(roots.codexAccounts, e.name, 'home', 'sessions')); } catch {} }
    const ok = []; for (const r of list) { try { if ((await sourceStat(r)).isDirectory()) { ok.push(r); if (!codexAccount.has(r)) codexAccount.set(r, r === roots.codex ? 'codex-default' : 'codex-' + h(path.basename(path.dirname(path.dirname(r))), 8)); source(codexAccount.get(r), 'codex', r === roots.codex ? 'default' : 'orca'); } } catch {} } return ok;
  }
  const stateFile = path.join(dataDir, 'collector_state.json'), tmpDir = path.join(dataDir, 'collector_tmp');
  const DatabaseSync = loadSqlite();
  const enabled = Object.fromEntries(PROVIDERS.map(p => [p, initial[p] !== false]));
  const info = Object.fromEntries(PROVIDERS.map(p => [p, { found: false, files: new Map(), last: 0, lastList: 0, lastDb: 0, errors: 0, reason: null, tokensSeen: false }]));
  let state = { version: 1, since: {}, backfilled: {}, files: {}, hermes: {}, last: {} };
  const agents = new Map(), bySession = new Map();
  let out = [], timer = null, watchers = [], busy = false, dirty = false, lastSave = 0, running = false, ticks = 0, hint = new Set(), loaded = null;

  async function load() {
    try { const st=await fsp.lstat(stateFile);if(!st.isFile()||st.isSymbolicLink()||st.size>8*1024*1024)throw 0;const v = JSON.parse(await fsp.readFile(stateFile, 'utf8')); if (v && v.version === 1 && v.files && typeof v.files === 'object') state = { since: {}, backfilled: {}, hermes: {}, last: {}, ...v }; for (const p of PROVIDERS) info[p].last = Number(state.last[p]) || 0; } catch { /* baru / rusak: mulai dari backfill */ }
  }
  async function save(force) {
    if (!dirty && !force) return; const t = now(); if (!force && t - lastSave < 2000) return;
    // Pangkas entri lama agar berkas status tetap kecil.
    for (const [k, r] of Object.entries(state.files)) if (r.mtime && t - r.mtime > 10 * 86400000) delete state.files[k];
    await fsp.mkdir(dataDir, { recursive: true });
    const tmp = stateFile + '.' + crypto.randomUUID() + '.tmp';
    try { await fsp.writeFile(tmp, JSON.stringify(state), { flag: 'wx' }); await fsp.rename(tmp, stateFile); dirty = false; lastSave = t; }
    finally { await fsp.unlink(tmp).catch(() => {}); }
  }

  // ---------- agen dan giliran ----------
  const autoEnd = p => p === 'gemini' || p === 'hermes';
  function base(a) { const e = { provider: a.provider, agent: a.id, role: a.role, kind: a.kind, session: a.session }; if (a.parent) e.parent = a.parent; if (a.account) e.account = a.account; return e; }
  function agent(id, init) {
    let a = agents.get(id);
    if (!a) { a = { id, provider: init.provider, role: init.role, kind: id.startsWith('main-') ? 'main' : 'subagent', parent: init.parent, session: init.session, last: 0, status: null, task: null, category: null, turn: null, spawned: false, lastEmit: 0, sessKey: init.sessKey }; agents.set(id, a); }
    else { if (init.session) a.session = init.session; if (init.sessKey) a.sessKey = init.sessKey; if (init.role) a.role = init.role; }
    return a;
  }
  // Pemimpin provider = sesi aktif pertama; sesi lain yang aktif bersamaan menjadi subagen.
  function pooled(provider, sessKey, t, account) {
    const key = provider + ':' + sessKey, have = bySession.get(key); if (have && agents.has(have)) { const a = agents.get(have); if (account) a.account = account; return a; }
    const leaderId = 'main-' + provider, leader = agents.get(leaderId);
    const busyLeader = leader && leader.sessKey !== sessKey && (t - leader.last) < IDLE_MS && leader.status !== 'idle' && leader.status !== 'done';
    let a;
    if (!busyLeader) { if (leader && leader.sessKey) bySession.delete(provider + ':' + leader.sessKey); a = agent(leaderId, { provider, role: ROLE[provider], session: h(sessKey), sessKey }); if (leader && leader.sessKey !== sessKey) leader.turn = null; }
    else a = agent('sub-' + provider + '-' + h(sessKey, 12), { provider, role: ROLE[provider], parent: leaderId, session: h(sessKey), sessKey });
    if (account) a.account = account; bySession.set(key, a.id); return a;
  }
  // Agen pemimpin untuk atribusi usage historis (backfill/backlog), tanpa mengubah sesi pemimpin yang hidup.
  const leader = p => agents.get('main-' + p) || agent('main-' + p, { provider: p, role: ROLE[p], session: h('leader:' + p) });
  // Baris dihitung bila sejak awal pencatatan dan tidak lebih tua dari 9 hari (entri berkas dipangkas setelah 10 hari diam,
  // jadi sesi lama yang dilanjutkan tidak menghitung ulang baris yang dulu sudah dihitung).
  const countable = (ts, since, t) => Number.isFinite(ts) && ts >= since && ts >= t - 9 * 86400000;
  const push = (event, opts = {}) => out.push({ event, opts });
  function spawn(a) { if (a.kind === 'subagent' && !a.spawned) { a.spawned = true; push({ ...base(a), type: 'spawn', status: 'working', task: 'memulai tugas agen', category: 'chat' }); } }
  function call(a, t, eid) {
    spawn(a); a.turn = { start: t, tokens: {}, model: null }; a.status = 'thinking'; a.task = 'menyiapkan rencana'; a.category = 'chat'; a.last = Math.max(a.last, t); a.lastEmit = t;
    const e = { ...base(a), type: 'call', status: 'thinking', task: 'menyiapkan rencana', category: 'chat' }; if (eid) e.event_id = eid; push(e);
  }
  function work(a, t, task, category, implicitCall) {
    if (!a.turn) { if (implicitCall) return call(a, t), work(a, t, task, category, false); a.turn = { start: t, tokens: {}, model: null, implicit: true }; }
    spawn(a); a.last = Math.max(a.last, t);
    if (a.status !== 'working' || task !== a.task || category !== a.category || t - a.lastEmit > 5000) {
      a.status = 'working'; a.task = task; a.category = category; a.lastEmit = t; push({ ...base(a), status: 'working', task, category });
    }
  }
  function end(a, t, durationS, eid) {
    const turn = a.turn || { start: t, tokens: {}, model: null };
    const e = { ...base(a), type: 'report', status: 'done', task: 'tugas selesai', category: 'idle', duration_s: Math.round(Math.max(0, durationS ?? (t - turn.start) / 1000) * 1000) / 1000 };
    if (nonzero(turn.tokens)) e.tokens = clean(turn.tokens); if (turn.model) e.model = turn.model; if (eid) e.event_id = eid;
    push(e, { count: false }); a.turn = null; a.pending = false; a.status = 'done'; a.task = 'tugas selesai'; a.category = 'idle'; a.last = Math.max(a.last, t);
  }
  function sweep(t) {
    for (const a of [...agents.values()]) {
      const quiet = t - a.last;
      if (a.turn && quiet > TURN_MAX_MS) a.turn = null;
      // Tool yang belum mengembalikan hasil (render/ffmpeg panjang) = masih bekerja, maksimal 15 menit.
      if (a.pending && quiet < 15 * 60000) continue;
      if ((a.status === 'working' || a.status === 'thinking') && quiet > IDLE_MS) {
        if (a.turn && autoEnd(a.provider)) end(a, a.last, (a.last - a.turn.start) / 1000);
        else { a.status = 'idle'; a.task = 'Aktivitas agen'; a.category = 'idle'; push({ ...base(a), status: 'idle', task: 'Aktivitas agen', category: 'idle' }); }
      }
      if (a.kind === 'subagent' && a.spawned && quiet > SUB_RETIRE_MS) {
        push({ ...base(a), type: 'retire', status: 'done', task: 'tugas selesai', category: 'idle' });
        agents.delete(a.id); if (a.sessKey) bySession.delete(a.provider + ':' + a.sessKey);
      } else if (quiet > 3600000 && a.status !== 'working') { agents.delete(a.id); if (a.sessKey) bySession.delete(a.provider + ':' + a.sessKey); }
    }
  }

  // ---------- akumulasi usage per berkas+agen+model+tanggal ----------
  let acc = new Map();
  function usage(provider, a, tokens, model, date, idParts, live, account) {
    if (!nonzero(tokens)) return;
    info[provider].tokensSeen = true;
    const key = a.id + '|' + (model || '') + '|' + date + '|' + (account || ''), cur = acc.get(key) || { provider, a, model, date, tokens: {}, ids: [], account };
    addTokens(cur.tokens, tokens); if (idParts) cur.ids.push(idParts); acc.set(key, cur);
    if (live && a.turn) { addTokens(a.turn.tokens, tokens); if (model) a.turn.model = model; }
  }
  function flushUsage(backfill) {
    for (const u of acc.values()) {
      const e = { ...base(u.a), type: 'usage', status: 'working', task: 'Aktivitas agen', tokens: clean(u.tokens) }; if (u.account) e.account = u.account;
      if (u.model) e.model = u.model;
      if (!backfill && u.ids.length) e.event_id = 'u-' + h(u.ids.join(','), 24);
      push(e, { count: true, date: u.date, usageOnly: true, backfill: !!backfill });
    }
    acc = new Map();
  }
  async function emit() { if (!out.length) return; const items = out; out = []; await sink(items); }

  // ---------- Claude Code ----------
  async function listClaude(t, P) {
    const root = roots.claude, files = [];
    let dirs; try { dirs = await sourceDirs(root); } catch { P.found = false; return files; }
    P.found = true;
    for (const d of dirs) {
      if (!d.isDirectory()) continue; const dir = path.join(root, d.name);
      let ents; try { ents = await sourceDirs(dir); } catch { continue; }
      for (const e of ents) {
        if (!e.isFile() || !e.name.endsWith('.jsonl')) continue;
        const file = path.join(dir, e.name), sessionId = e.name.slice(0, -6);
        let st; try { st = await sourceStat(file); } catch { continue; }
        files.push({ file, st, sessionId });
        if (t - st.mtimeMs < 6 * 3600000) {
          const subDir = path.join(dir, sessionId, 'subagents');
          let subs; try { subs = await sourceDirs(subDir); } catch { continue; }
          for (const s of subs) {
            const m = /^agent-([A-Za-z0-9_-]{1,64})\.jsonl$/.exec(s.name); if (!s.isFile() || !m) continue;
            const sf = path.join(subDir, s.name); let sst; try { sst = await sourceStat(sf); } catch { continue; }
            files.push({ file: sf, st: sst, sessionId, agentId: m[1], subDir });
          }
        }
      }
    }
    return files;
  }
  async function claudeRole(f) {
    try { const meta = path.join(f.subDir, 'agent-' + f.agentId + '.meta.json'), st = await sourceStat(meta); if (st.size > 8192) return 'Full-Stack Dev'; const v = JSON.parse(await fsp.readFile(meta, 'utf8')); return roleFor(v && v.agentType); } catch { return 'Full-Stack Dev'; }
  }
  async function scanClaudeFile(f, t, backfill) {
    onUsageFile('claude',f);
    const P = info.claude, key = h('claude:' + f.file, 20), since = state.since.claude;
    const rec = state.files[key] || (state.files[key] = { offset: 0, seen: {}, order: [] });
    if (rec.size === f.st.size && rec.mtime === f.st.mtimeMs && !rec.skip && rec.offset>=f.st.size) return;
    const sess = h(f.sessionId), mainId = 'main-' + sess;
    const a = f.agentId ? agent('sub-' + h(sess + ':' + f.agentId), { provider: 'claude', role: rec.role || (rec.role = await claudeRole(f)), parent: mainId, session: sess })
      : agent(mainId, { provider: 'claude', role: 'Claude', session: sess });
    const start = rec.offset || 0;
    await readNew(f.file, rec, LIVE_BUDGET, (buf, at) => {
      if (buf[0] !== 123) return;
      const head = buf.subarray(0, 24).toString('latin1');
      if (head.startsWith('{"type":"') && !/^\{"type":"(user|assistant|system)"/.test(head)) return;
      const d = parse(buf); if (!d || typeof d !== 'object') { P.errors++; return; }
      const ts = tsOf(d.timestamp), live = !backfill && ts >= t - LIVE_MS;
      if (d.type === 'assistant' && d.message && typeof d.message === 'object') {
        const m = d.message, u = m.usage, id = m.id || d.requestId;
        if (u && typeof u === 'object' && id && Number.isFinite(ts)) {
          const k = h(id, 12), prior = rec.seen[k] || (rec.seen[k] = [0, 0, 0, 0], rec.order.push(k), rec.seen[k]), delta = {};
          FIELDS.forEach((field, i) => { const c = count(u[field]); if (c > prior[i]) { delta[field] = c - prior[i]; prior[i] = c; } });
          while (rec.order.length > 600) delete rec.seen[rec.order.shift()];
          if (countable(ts, since, t)) usage('claude', a, delta, safeModel(m.model), localDay(ts), at, live);
        }
        if (live && (f.agentId || !d.isSidechain)) {
          const tools = Array.isArray(m.content) ? m.content.filter(x => x && x.type === 'tool_use') : [];
          if (tools.length) { const x = tools[tools.length - 1], inp = x.input && typeof x.input === 'object' ? x.input : {}, file = inp.file_path || inp.notebook_path || inp.path;
            work(a, ts, taskFor(x.name, file), categoryFor(x.name, { file, command: inp.command }), false); a.pending = true; }
          else { work(a, ts, 'menyiapkan pekerjaan', 'chat', false); a.pending = false; }
        }
      } else if (d.type === 'user' && live && !d.isMeta && d.message) {
        const c = d.message.content, human = typeof c === 'string' || (Array.isArray(c) && c.some(x => x && (x.type === 'text' || x.type === 'image')) && !c.some(x => x && x.type === 'tool_result'));
        if (Array.isArray(c) && c.some(x => x && x.type === 'tool_result')) { a.pending = false; a.last = Math.max(a.last, ts); }
        if (human && !d.isSidechain && !f.agentId) call(a, ts, 'c-' + h(key + ':' + at, 20));
        else if (human && f.agentId) spawn(a), work(a, ts, 'memulai tugas agen', 'chat', false);
      } else if (d.type === 'system' && d.subtype === 'turn_duration' && live && !f.agentId) {
        end(a, ts, count(d.durationMs) / 1000, 'r-' + h(key + ':' + at, 20));
      }
      if (Number.isFinite(ts)) P.last = Math.max(P.last, ts);
    });
    if (rec.offset !== start) dirty = true;
  }

  // ---------- Codex ----------
  async function listCodex(t, P) {
    const files = [];
    const rs = await codexRoots(); P.found = rs.length > 0; P.roots = rs.length;
    for (const root of rs) for (let back = 0; back < 8; back++) {
      const d = new Date(startOfDay(t, back)), dir = path.join(root, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'));
      let ents; try { ents = await sourceDirs(dir); } catch { continue; }
      for (const e of ents) { if (!e.isFile() || !/^rollout-.*\.jsonl$/.test(e.name)) continue; const file = path.join(dir, e.name); try { files.push({ file, st: await sourceStat(file), account: codexAccount.get(root) }); } catch {} }
    }
    return files;
  }
  async function scanCodexFile(f, t, backfill) {
    onUsageFile('codex',f);
    const P = info.codex, key = h('codex:' + f.file, 20), since = state.since.codex;
    const rec = state.files[key] || (state.files[key] = { offset: 0, total: [0, 0, 0, 0], model: null, sess: null });
    if (rec.size === f.st.size && rec.mtime === f.st.mtimeMs && !rec.skip && rec.offset>=f.st.size) return;
    const start = rec.offset || 0;
    const sessKey = () => rec.sess || key;
    await readNew(f.file, rec, LIVE_BUDGET, (buf, at) => {
      const head = buf.subarray(0, 160).toString('latin1');
      if (/"type":"response_item","payload":\{"type":"(reasoning|message)"/.test(head) || head.includes('"type":"world_state"') || head.includes('"type":"token_usage_record"')) return;
      const d = parse(buf); if (!d || typeof d !== 'object') { P.errors++; return; }
      const p = d.payload && typeof d.payload === 'object' ? d.payload : {}, ts = tsOf(d.timestamp), live = !backfill && ts >= t - LIVE_MS;
      if (d.type === 'session_meta') { if (p.id) rec.sess = h(p.id, 20); return; }
      if (d.type === 'turn_context') { rec.model = safeModel(p.model) || rec.model; return; }
      if (Number.isFinite(ts)) P.last = Math.max(P.last, ts);
      if (d.type === 'event_msg' && p.type === 'token_count') {
        const tot = p.info && p.info.total_token_usage; if (!tot || typeof tot !== 'object') return;
        // input_tokens Codex sudah termasuk cached_input_tokens; dipecah agar cache tidak dihitung dua kali.
        const cur = [count(tot.input_tokens), count(tot.output_tokens), count(tot.cached_input_tokens), count(tot.cache_write_input_tokens)];
        let prev = rec.total || [0, 0, 0, 0]; if (cur.some((v, i) => v < prev[i])) prev = [0, 0, 0, 0];
        const dIn = cur[0] - prev[0], dCache = cur[2] - prev[2];
        const delta = { input_tokens: Math.max(0, dIn - dCache), output_tokens: cur[1] - prev[1], cache_read_input_tokens: dCache, cache_creation_input_tokens: cur[3] - prev[3] };
        rec.total = cur;
        const ua = live ? pooled('codex', sessKey(), t, f.account) : leader('codex');
        if (f.account) source(f.account, 'codex', f.account === 'codex-default' ? 'default' : 'orca', ts);
        if (countable(ts, since, t)) usage('codex', ua, delta, rec.model, localDay(ts), at, live, f.account);
        // Langkah model baru = agen masih bekerja (penalaran panjang tanpa tool tidak dianggap diam).
        if (live) work(ua, t, ua.status === 'working' ? ua.task : 'menyiapkan pekerjaan', ua.status === 'working' ? ua.category : 'chat', false);
        return;
      }
      if (!live) return;
      const a = pooled('codex', sessKey(), t, f.account); if (f.account) source(f.account, 'codex', f.account === 'codex-default' ? 'default' : 'orca', ts);
      if (d.type === 'event_msg' && p.type === 'task_started') call(a, t, 'c-' + h(key + ':' + at, 20));
      else if (d.type === 'event_msg' && p.type === 'task_complete') end(a, t, count(p.duration_ms) / 1000, 'r-' + h(key + ':' + at, 20));
      else if (d.type === 'response_item' && /call$/.test(String(p.type || ''))) {
        const name = p.name || p.type, input = typeof p.input === 'string' ? p.input : typeof p.arguments === 'string' ? p.arguments : p.action && p.action.command;
        const patch = typeof input === 'string' ? /\*\*\* (?:Update|Add) File: ([^\n]{1,400})/.exec(input) : null;
        const file = patch ? patch[1].trim() : undefined, tool = patch ? 'apply_patch' : name;
        work(a, t, taskFor(tool, file), categoryFor(tool, { file, command: input }), false); a.pending = true;
      } else if (d.type === 'response_item' && /call_output$/.test(String(p.type || ''))) { a.pending = false; a.last = Math.max(a.last, t);
      } else if (d.type === 'event_msg' && (p.type === 'agent_message' || p.type === 'item_completed')) work(a, t, a.task && a.status === 'working' ? a.task : 'menyiapkan pekerjaan', a.category && a.status === 'working' ? a.category : 'chat', false);
    });
    if (rec.offset !== start) dirty = true;
  }

  // ---------- Antigravity (Gemini) ----------
  function openRO(file) { const u = pathToFileURL(file); u.search = '?immutable=1'; return new DatabaseSync(u, { readOnly: true }); }
  async function listGemini(t, P) {
    const files = []; let any = false;
    for (const root of roots.gemini) {
      const dir = path.join(root, 'conversations');
      let ents; try { ents = await sourceDirs(dir); any = true; } catch { continue; }
      // Percakapan terbuka menulis ke -wal (mtime .db tetap): stat -wal saja (tidak dibuka) sebagai tanda aktivitas.
      const names = new Set(ents.map(e => e.name));
      for (const e of ents) { if (!e.isFile() || !/^[A-Za-z0-9-]{1,80}\.db$/.test(e.name)) continue; const file = path.join(dir, e.name);
        try { const st = await sourceStat(file); let wal = 0; if (names.has(e.name + '-wal')) { try { wal = (await sourceStat(file + '-wal')).mtimeMs; } catch {} } files.push({ file, st, wal, act: Math.max(st.mtimeMs, wal) }); } catch {} }
    }
    P.found = any; return files;
  }
  async function scanGeminiFile(f, t, backfill) {
    onUsageFile('gemini',f);
    const P = info.gemini, key = h('gemini:' + f.file, 20), since = state.since.gemini;
    let rec = state.files[key];
    if (rec && rec.mtime === f.st.mtimeMs && rec.size === f.st.size) {
      if (f.wal && f.wal !== rec.wal) { rec.wal = f.wal; dirty = true; if (!backfill && t - f.wal < LIVE_MS) { work(pooled('gemini', key, t), t, 'menyiapkan pekerjaan', 'chat', true); P.last = Math.max(P.last, f.wal); } }
      return;
    }
    if (!DatabaseSync) { P.reason = 'node:sqlite tidak tersedia di runtime ini'; return; }
    const fresh = !rec; rec = rec || (state.files[key] = { maxIdx: -1, rids: [] });
    // Percakapan lama (sebelum awal pencatatan, atau dibuat > 9 hari lalu lalu entrinya dipangkas): hanya patokan idx.
    const baseline = fresh && (f.st.mtimeMs < since || (!backfill && f.st.birthtimeMs && f.st.birthtimeMs < t - 9 * 86400000));
    let rows = [], db;
    try { await safePath(f.file);if(f.st.size>MAX_DB)throw Error('limit');db = openRO(f.file);
      if (baseline) { const m = db.prepare('select max(idx) m from gen_metadata').get(); rec.maxIdx = m && Number.isInteger(m.m) ? m.m : -1; }
      else rows = db.prepare('select idx, case when length(data)<=1048576 then data else null end data from gen_metadata where idx > ? order by idx limit 64').all(rec.maxIdx);
    } catch { P.errors++; if (fresh) delete state.files[key]; return; } finally { try { db && db.close(); } catch {} }
    rec.mtime = f.st.mtimeMs; rec.size = f.st.size; rec.wal = f.wal || 0; dirty = true;
    if (rows.length === 64) rec.mtime = -1; // sisa baris dibaca pada tick berikutnya
    if (baseline) return;
    const live = !backfill && t - (f.act || f.st.mtimeMs) < LIVE_MS;
    const a = live ? pooled('gemini', key, t) : leader('gemini');
    if (live) work(a, t, 'menyiapkan pekerjaan', 'chat', true);
    let parsed = 0;
    for (const r of rows) {
      rec.maxIdx = Math.max(rec.maxIdx, Number(r.idx));
      const u = geminiUsage(r.data); if (!u) continue; parsed++;
      if (u.rid) { if (rec.rids.includes(u.rid)) continue; rec.rids.push(u.rid); if (rec.rids.length > 200) rec.rids.shift(); }
      usage('gemini', a, u.tokens, u.model, localDay(live ? t : f.st.mtimeMs), key + ':' + r.idx, live);
    }
    if (rows.length && !parsed) P.reason = 'format gen_metadata tidak dikenali; token n/a';
    P.last = Math.max(P.last, f.st.mtimeMs);
  }

  // ---------- Hermes ----------
  async function listHermes(t, P) {
    const root = roots.hermes, dbs = [];
    for (const s of sources.values()) if(s.provider==='hermes')s.found=false;
    try { await sourceStat(path.join(root, 'state.db')); dbs.push({ file: path.join(root, 'state.db'), profile: 'default' }); } catch {}
    try { for (const e of await sourceDirs(path.join(root, 'profiles'))) if (e.isDirectory() && /^[\w.-]{1,40}$/.test(e.name)) { const file = path.join(root, 'profiles', e.name, 'state.db'); try { await sourceStat(file); dbs.push({ file, profile: e.name }); } catch {} } } catch {}
    for(const f of dbs){const id=f.profile==='default'?'hermes-default':'hermes-'+h(f.profile,8);f.account=source(id,'hermes',f.profile==='default'?'default':'profile');Object.assign(sources.get(id),{found:true,name:f.profile,reason:!DatabaseSync?'sqlite_unavailable':null});}
    P.found = dbs.length > 0; return dbs;
  }
  async function scanHermesDb(f, t, backfill) {
    onUsageFile('hermes',f);
    const P = info.hermes, key = h('hermes:' + f.file, 20), since = state.since.hermes;
    if (!DatabaseSync) { P.reason = 'node:sqlite tidak tersedia di runtime ini'; return; }
    const sig = []; for (const s of ['', '-wal']) { try { const st = await sourceStat(f.file + s); sig.push(st.size, st.mtimeMs); } catch { sig.push(0, 0); } }
    const rec = state.hermes[key] || (state.hermes[key] = { sig: null, maxMsg: -1, usage: {} });
    if (rec.sig === sig.join(':')) { sources.get(f.account).last=Number(rec.last)||0; return; }
    // Basis data WAL tidak dibuka langsung (membaca WAL bisa menulis -shm milik Hermes): salin ke folder data aplikasi.
    await fsp.mkdir(tmpDir, { recursive: true });
    const copy = path.join(tmpDir, 'hermes-' + key + '.db');
    for (const s of ['', '-wal', '-shm', '-journal']) await fsp.unlink(copy + s).catch(() => {});
    let db, rowsU, rowsM;
    try {
      const st=await sourceStat(f.file);if(!st.isFile()||st.size>MAX_DB){sources.get(f.account).reason='database_limit';throw Error('limit');}await fsp.copyFile(f.file, copy);try{const wal=await sourceStat(f.file+'-wal');if(!wal.isFile()||wal.size>MAX_DB)throw Error('limit');await fsp.copyFile(f.file+'-wal',copy+'-wal');}catch(e){if(e.code!=='ENOENT')throw e;}
      db = new DatabaseSync(copy);
      rowsU = db.prepare('select session_id s, model m, sum(input_tokens) i, sum(output_tokens) o, sum(cache_read_tokens) cr, sum(cache_write_tokens) cw, sum(reasoning_tokens) r, max(last_seen) ls from session_model_usage group by session_id, model limit 20001').all();
      if(rowsU.length>20000)throw Error('limit');rowsM = db.prepare('select id, role, tool_name tool, timestamp ts from messages where id > ? order by id limit 5000').all(rec.maxMsg);
    } catch { P.errors++; P.reason = 'skema state.db Hermes tidak dikenal atau sedang dikunci'; sources.get(f.account).reason||='database_unreadable'; return; }
    finally { try { db && db.close(); } catch {} for (const s of ['', '-wal', '-shm', '-journal']) await fsp.unlink(copy + s).catch(() => {}); }
    P.reason = null; sources.get(f.account).reason=null; rec.sig = rowsM.length >= 5000 ? null : sig.join(':'); dirty = true;
    const first = rec.maxMsg < 0 && !Object.keys(rec.usage).length;
    const lead = f.profile === 'default' ? agent('main-hermes', { provider: 'hermes', role: 'Hermes', session: h(key) })
      : agent('sub-hermes-' + h(f.profile, 12), { provider: 'hermes', role: 'Hermes', parent: 'main-hermes', session: h(key) });
    lead.account = source(f.profile === 'default' ? 'hermes-default' : 'hermes-' + h(f.profile, 8), 'hermes', f.profile === 'default' ? 'default' : 'profile');
    for (const m of rowsM) {
      rec.maxMsg = Math.max(rec.maxMsg, Number(m.id)); const ts = Number(m.ts) * 1000;
      if (Number.isFinite(ts)) { P.last = Math.max(P.last, ts); rec.last=Math.max(Number(rec.last)||0,ts); source(lead.account, 'hermes', null, ts); }
      if (backfill || first || !(ts >= t - LIVE_MS)) continue;
      if (m.role === 'user') call(lead, t, 'c-' + h(key + ':' + m.id, 20));
      else if (m.role === 'assistant' || m.role === 'tool') work(lead, t, m.tool ? taskFor(m.tool) : 'menyiapkan pekerjaan', m.tool ? categoryFor(m.tool) : 'chat', true);
    }
    for (const u of rowsU) {
      const k = h(u.s + '|' + u.m, 16), cur = [count(u.i), count(u.o) + count(u.r), count(u.cr), count(u.cw)], prev = rec.usage[k];
      const ls = Number(u.ls) * 1000; rec.usage[k] = cur;
      // Baris lama: dipakai sebagai patokan; baris yang aktif sejak `since` dihitung penuh pada tanggal terakhir dipakai (perkiraan).
      const base0 = prev || (first && !(ls >= since) ? cur : [0, 0, 0, 0]);
      if (!prev && !first && !(ls >= since)) continue;
      const delta = { input_tokens: Math.max(0, cur[0] - base0[0]), output_tokens: Math.max(0, cur[1] - base0[1]), cache_read_input_tokens: Math.max(0, cur[2] - base0[2]), cache_creation_input_tokens: Math.max(0, cur[3] - base0[3]) };
      const live = !backfill && !first;
      usage('hermes', lead, delta, safeModel(u.m), localDay(live ? t : (Number.isFinite(ls) ? ls : t)), k + ':' + cur.join('.'), live, lead.account);
    }
  }

  const listers = { claude: listClaude, codex: listCodex, gemini: listGemini, hermes: listHermes };
  const scanners = { claude: scanClaudeFile, codex: scanCodexFile, gemini: scanGeminiFile, hermes: scanHermesDb };
  async function provider(p, t) {
    const P = info[p];
    if (!enabled[p]) return;
    const backfill = !state.backfilled[p];
    if (backfill) state.since[p] = startOfDay(t, p === 'claude' ? 0 : 6);
    const due = backfill || t - P.lastList >= LIST_MS || (p === 'gemini' && t - P.lastDb >= DB_MS) || (p === 'hermes' && t - P.lastDb >= HERMES_MS) || [...hint].some(x => x.startsWith(p + ':'));
    if (due) {
      const list = await listers[p](t, P); P.files = new Map(list.map(f => [f.file, f])); P.lastList = t; P.lastDb = t;
      for (const x of [...hint]) if (x.startsWith(p + ':')) hint.delete(x);
    } else if (p === 'claude' || p === 'codex') {
      // Di antara pemindaian direktori: stat ulang hanya berkas yang berubah dalam 10 menit terakhir.
      for (const f of P.files.values()) if (t - f.st.mtimeMs < 600000) { try { f.st = await sourceStat(f.file); } catch {} }
    }
    if (!P.found) { P.reason = p === 'gemini' ? 'folder Antigravity tidak ditemukan' : 'folder log ' + p + ' tidak ditemukan'; return; }
    if (P.reason && P.reason.startsWith('folder')) P.reason = null;
    const since = state.since[p]; let active = 0;
    const all=[...P.files.values()],start=P.cursor||0,started=Date.now();let scanned=0;
    for(let n=0;n<all.length;n++){const index=(start+n)%all.length,f=all[index];P.cursor=(index+1)%all.length;
      const act = p === 'hermes' ? 0 : (f.act || f.st.mtimeMs);
      if (p !== 'hermes' && act < since && !(p === 'gemini' && backfill)) continue;
      if (p !== 'hermes' && t - act < 60000) active++;
      try { await scanners[p](f, t, backfill); } catch { P.errors++; }
      if(++scanned>=128||Date.now()-started>350)break;await new Promise(r=>setImmediate(r));
    }
    if (p === 'gemini') for (const f of P.files.values()) if (f.act && f.act >= since) P.last = Math.max(P.last, f.act);
    if (P.last && P.last !== state.last[p]) { state.last[p] = P.last; dirty = true; }
    P.active = p === 'hermes' ? (t - P.last < 60000 ? 1 : 0) : active;
    flushUsage(backfill);
    if (backfill) {
      out.unshift({ event: null, opts: { replace: { provider: p, from: localDay(since) } } });
      await emit(); state.backfilled[p] = true; dirty = true; await save(true);
      log('kolektor ' + p + ': backfill selesai');
    }
  }
  async function tick() {
    if (busy || !running && ticks) return; busy = true; ticks++;
    try {
      const t = now();
      for (const p of PROVIDERS) { try { await provider(p, t); } catch { info[p].errors++; } }
      sweep(t); await emit(); await save();
    } catch { /* tick berikutnya mencoba lagi */ } finally { busy = false; }
  }
  async function watch() {
    for (const [p, root] of [['claude', roots.claude], ...(await codexRoots()).map(r => ['codex', r])]) {
      try { const w = fs.watch(root, { recursive: true, persistent: false }, (_e, name) => { if (name && /\.jsonl$/.test(String(name))) { hint.add(p + ':'); schedule(); } }); w.on('error', () => { try { w.close(); } catch {} }); watchers.push(w); } catch { /* polling tetap jalan */ }
    }
  }
  let soon = null;
  function schedule() { if (soon || !running) return; soon = setTimeout(() => { soon = null; tick(); }, 300); soon.unref?.(); }
  return {
    async start() { if (running) return; await load(); running = true; await watch(); loaded = tick(); timer = setInterval(tick, TICK_MS); timer.unref?.(); await loaded; },
    async stop() { running = false; clearInterval(timer); clearTimeout(soon); for (const w of watchers) try { w.close(); } catch {} watchers = []; while (busy) await new Promise(r => setTimeout(r, 20)); await save(true).catch(() => {}); },
    tick: async () => { while (busy) await new Promise(r => setTimeout(r, 10)); const was = running; running = true; await tick(); running = was; },
    // Claude dinyalakan lagi: lompat ke akhir berkas, karena selama mati token Claude dihitung dari hook.
    configure(next) { for (const p of PROVIDERS) if (typeof next?.[p] === 'boolean') { if (p === 'claude' && next[p] && !enabled[p]) { for (const f of info[p].files.values()) { const r = state.files[h(p + ':' + f.file, 20)]; if (r && f.st) { r.offset = f.st.size; r.size = undefined; r.skip = false; } } } enabled[p] = next[p]; } },
    covers: p => PROVIDERS.includes(p) && enabled[p] && info[p].found,
    status(tokensToday = () => null) {
      const providers = {};
      for (const p of PROVIDERS) {
        const P = info[p], tokens = P.reason || !P.found ? 'n/a' : 'ya';
        providers[p] = { enabled: enabled[p], found: P.found, active_files: P.active || 0, tracked_files: P.files.size,
          last_activity: P.last ? new Date(P.last).toISOString() : null, tokens_today: tokensToday(p), tokens,
          backfilled: !!state.backfilled[p], errors: P.errors,
          reason: !enabled[p] ? 'dimatikan di Pengaturan' : !P.found ? (P.reason || 'sumber tidak ditemukan') : P.reason };
      }
      // v6-C: sumber per akun/profil = id hash + jenis + aktivitas terakhir; tanpa path atau nama folder.
      const index = {}, list = [...sources.values()].sort((a, b) => a.provider.localeCompare(b.provider) || (a.kind === 'default' ? -1 : b.kind === 'default' ? 1 : a.id.localeCompare(b.id)));
      const out = list.map(s => ({ id: s.id, provider: s.provider, kind: s.kind || 'profile', name:s.name||null, found:s.found!==false, tokens:s.reason?'n/a':'ya', reason_code:s.reason||null, reason:s.reason||null, index: (index[s.provider] = (index[s.provider] || 0) + 1), last_activity: s.last ? new Date(s.last).toISOString() : null, active: s.last > now() - LIVE_MS }));
      return { running, sqlite: !!DatabaseSync, providers, sources: out };
    }
  };
}

// [Diubah oleh Codex - 2026-11-22] V22 import uses the same read-only guards and usage formats.
// File checkpoints and their daily buckets are committed together. No conversations are retained.
function createUsageImporter({dataDir,store,getPricing,roots={},now=Date.now}={}) {
  const {addRow,hash,day}=require('./usage_history_store');
  const home=os.homedir(),local=process.env.LOCALAPPDATA||path.join(home,'AppData','Local');
  roots={claude:path.join(home,'.claude','projects'),codex:path.join(home,'.codex','sessions'),codexAccounts:path.join(process.env.APPDATA||path.join(home,'AppData','Roaming'),'orca','codex-accounts'),gemini:[path.join(home,'.gemini','antigravity-cli'),path.join(home,'.gemini','antigravity')],hermes:path.join(local,'hermes'),...roots};
  const queue=new Map();let stopped=false,paused=false,busy=false,timer=null,discovery=null,full=false,worker=null;
  function enqueue(provider,f){if(stopped||store.importStatus().error||!PROVIDERS.includes(provider)||!f?.file)return;const id=hash(provider+':'+path.resolve(f.file)),cp=store.fingerprint(id);if(f.st&&provider!=='hermes'&&cp?.finished&&cp.size===f.st.size&&cp.mtime===f.st.mtimeMs&&cp.ino===f.st.ino)return;if(!queue.has(id))queue.set(id,{provider,...f,id});schedule();}
  function schedule(){if(stopped||paused||timer||busy)return;timer=setTimeout(()=>{timer=null;step().catch(()=>{});},40);timer.unref?.();}
  async function* walk(dir,depth,maxDepth,match){let handle;try{await safePath(dir);handle=await fsp.opendir(dir);}catch{return;}try{for await(const e of handle){if(stopped||paused)return;if(e.isSymbolicLink()||sensitive(e.name)||e.name==='.git')continue;const file=path.join(dir,e.name);if(e.isDirectory()&&depth<maxDepth)yield* walk(file,depth+1,maxDepth,match);else if(e.isFile()&&match.test(e.name))yield file;}}catch{/* inaccessible source is skipped */}}
  async function discover(){
    const groups=[['claude',roots.claude,4,/\.jsonl$/],['codex',roots.codex,3,/^rollout-.*\.jsonl$/]];
    if(roots.codexAccounts)try{for(const e of await sourceDirs(roots.codexAccounts))if(e.isDirectory()&&/^[\w-]{1,64}$/.test(e.name))groups.push(['codex',path.join(roots.codexAccounts,e.name,'home','sessions'),3,/^rollout-.*\.jsonl$/]);}catch{}
    for(const r of [].concat(roots.gemini))groups.push(['gemini',path.join(r,'conversations'),0,/^[\w-]{1,80}\.db$/]);
    groups.push(['hermes',roots.hermes,2,/^state\.db$/]);let visited=0;
    for(const [provider,dir,depth,pattern]of groups)for await(const file of walk(dir,0,depth,pattern)){
      while(queue.size>=256&&!stopped&&!paused)await new Promise(r=>setTimeout(r,40));if(stopped||paused)break;
      enqueue(provider,{file});visited++;if(visited%16===0){await store.setImport({files:visited});await new Promise(r=>setTimeout(r,20));}if(stopped||paused)break;
    }
    await store.setImport({state:paused?'paused':'running',files:visited});
  }
  function parseLine(provider,buf,cp,rows,f) {
    const head=buf.subarray(0,180).toString('latin1');
    if(provider==='claude'&&!head.includes('assistant')&&!buf.includes(Buffer.from('"usage"')))return;
    if(provider==='codex'&&!head.includes('token_count')&&!head.includes('turn_context'))return;
    const d=parse(buf);if(!d){cp.errors=(cp.errors||0)+1;return;}
    const ts=tsOf(d.timestamp);if(provider==='codex'&&d.type==='turn_context'){cp.model=safeModel(d.payload?.model)||cp.model;return;}
    if(!Number.isFinite(ts)||ts>now()+86400000)return;
    let usage,model;
    if(provider==='claude'){
      const m=d.message;if(d.type!=='assistant'||!m?.usage||!m.id)return;model=safeModel(m.model);cp.seen ||= {};cp.order ||= [];
      const id=hash(m.id),prior=cp.seen[id]||[0,0,0,0],cur=FIELDS.map(k=>count(m.usage[k]));usage={};FIELDS.forEach((k,i)=>usage[k]=Math.max(0,cur[i]-prior[i]));
      if(!cp.seen[id])cp.order.push(id);cp.seen[id]=cur.map((v,i)=>Math.max(v,prior[i]));while(cp.order.length>4096)delete cp.seen[cp.order.shift()];
    }else{
      const p=d.payload,tot=p?.info?.total_token_usage;if(d.type!=='event_msg'||p.type!=='token_count'||!tot)return;
      model=cp.model;const cur=[count(tot.input_tokens),count(tot.output_tokens),count(tot.cached_input_tokens),count(tot.cache_write_input_tokens)];let prev=cp.total||[0,0,0,0];if(cur.some((v,i)=>v<prev[i]))prev=[0,0,0,0];
      const cache=Math.max(0,cur[2]-prev[2]);usage={input_tokens:Math.max(0,cur[0]-prev[0]-cache),output_tokens:cur[1]-prev[1],cache_read_input_tokens:cache,cache_creation_input_tokens:cur[3]-prev[3]};cp.total=cur;
    }
    addRow(rows,{date:day(ts),provider,model,source:f.id,usage},getPricing());
  }
  async function sqliteChunk(f,value,st){
    const {Worker}=require('node:worker_threads');
    // SQLite work and filesystem snapshots stay off the HTTP/UI thread. The only selected columns are numeric usage metadata.
    const script=`const {parentPort,workerData:w}=require('node:worker_threads');const fs=require('node:fs'),path=require('node:path');let db;const copies=[];try{const {DatabaseSync}=require('node:sqlite');let source=w.file;if(w.provider==='hermes'){source=path.join(w.dir,'import-'+w.id+'.db');for(const s of ['','-wal']){try{const st=fs.lstatSync(w.file+s);if(!st.isFile()||st.isSymbolicLink()||st.size>268435456)throw Error('limit');fs.copyFileSync(w.file+s,source+s);copies.push(source+s);}catch(e){if(e.code!=='ENOENT')throw e;}}db=new DatabaseSync(source);}else {const u=require('node:url').pathToFileURL(source);u.search='?immutable=1';db=new DatabaseSync(u,{readOnly:true});}let rows;if(w.provider==='gemini')rows=db.prepare('select idx, case when length(data)<=1048576 then data else null end data from gen_metadata where idx > ? order by idx limit 64').all(w.cursor);else rows=db.prepare('select session_id s, model m, sum(input_tokens) i, sum(output_tokens) o, sum(cache_read_tokens) cr, sum(cache_write_tokens) cw, sum(reasoning_tokens) r, max(last_seen) ls from session_model_usage group by session_id, model order by session_id, model limit 128 offset ?').all(w.cursor);parentPort.postMessage({rows});}catch{parentPort.postMessage({error:'source_unreadable'});}finally{try{db?.close();}catch{}for(const p of copies.concat([w.dir+'/import-'+w.id+'.db-shm',w.dir+'/import-'+w.id+'.db-journal']))try{fs.unlinkSync(p);}catch{}}`;
    const cp=value.checkpoint,gem=f.provider==='gemini',cursor=gem?(cp.maxIdx??-1):(cp.page||0),snapshotDir=path.join(dataDir,'collector_tmp');await fsp.mkdir(snapshotDir,{recursive:true});
    const result=await new Promise((resolve,reject)=>{worker=new Worker(script,{eval:true,workerData:{file:f.file,provider:f.provider,dir:snapshotDir,id:f.id,cursor}});worker.once('message',resolve);worker.once('error',reject);worker.once('exit',code=>{if(code)reject(Error('sqlite_worker'));});});worker=null;
    if(result.error)throw Error(result.error);const rows=result.rows;
    for(const r of rows){let usage,model,date=day(st.mtimeMs);
      if(gem){cp.maxIdx=Math.max(cp.maxIdx??-1,Number(r.idx));const u=geminiUsage(r.data);if(!u)continue;cp.rids ||= [];if(u.rid&&cp.rids.includes(u.rid))continue;if(u.rid){cp.rids.push(u.rid);if(cp.rids.length>4096)cp.rids.shift();}usage=u.tokens;model=u.model;}
      else {cp.seen ||= {};const id=hash(r.s+'|'+r.m),cur=[count(r.i),count(r.o)+count(r.r),count(r.cr),count(r.cw)],prior=cp.seen[id]||[0,0,0,0];usage=Object.fromEntries(FIELDS.map((k,i)=>[k,Math.max(0,cur[i]-prior[i])]));cp.seen[id]=cur;if(Number.isFinite(Number(r.ls)))date=day(Number(r.ls)*1000);model=safeModel(r.m);}
      addRow(value.rows,{date,provider:f.provider,model,source:f.id,usage,estimatedDate:true},getPricing());
    }
    const more=rows.length===(gem?64:128);if(!gem)cp.page=more?cursor+rows.length:0;return more;
  }
  async function processFile(f){
    const st=await sourceStat(f.file);if(!st.isFile())return false;let walSig='';if(f.provider==='hermes')try{const w=await sourceStat(f.file+'-wal');walSig=w.size+':'+w.mtimeMs;}catch{}
    const value=store.source(f.id),cp=value.checkpoint;
    if(cp.finished&&cp.size===st.size&&cp.mtime===st.mtimeMs&&cp.ino===st.ino&&(f.provider!=='hermes'||cp.walSig===walSig))return false;
    if(f.provider==='claude'||f.provider==='codex'){
      const start=cp.offset||0;await readNew(f.file,cp,MAX_LINE+CHUNK,(buf)=>parseLine(f.provider,buf,cp,value.rows,f));
      // A trailing partial line waits for an append, rather than spinning forever.
      cp.finished=cp.offset>=st.size||cp.offset===start;await store.commitSource(f.id,value);return !cp.finished;
    }
    if(st.size>MAX_DB)throw Error('source_limit');const more=await sqliteChunk(f,value,st);Object.assign(cp,{size:st.size,mtime:st.mtimeMs,ino:st.ino,walSig,finished:!more});await store.commitSource(f.id,value);return more;
  }
  async function step(){if(stopped||paused||busy)return;busy=true;
    try{const entry=queue.entries().next().value;if(entry){const [id,f]=entry;queue.delete(id);let more=false;try{more=await processFile(f);}catch{if(full)await store.setImport({errors:(store.importStatus().errors||0)+1});}
      if(more)queue.set(id,f);else if(full)await store.setImport({completed:(store.importStatus().completed||0)+1});
      if(full)await store.setImport({bytes:(store.importStatus().bytes||0)+MAX_LINE+CHUNK});
    }else if(full&&!discovery){full=false;await store.setImport({state:'complete',finished_at:new Date(now()).toISOString()});}}
    finally{busy=false;if(queue.size||full)schedule();}
  }
  return {enqueue,status:()=>store.importStatus(),
    async action(action){if(!['start','pause','status'].includes(action))throw Error('invalid_import_action');if(action==='status')return this.status();if(store.importStatus().error)throw Error('history_unavailable');
      if(action==='pause'){paused=true;clearTimeout(timer);timer=null;await store.setImport({state:'paused'});return this.status();}
      if(full&&!paused)return this.status();paused=false;full=true;await store.setImport({state:'discovering',completed:0,files:0,bytes:0,errors:0});
      discovery=discover().catch(async()=>{paused=true;full=false;await store.setImport({state:'error'}).catch(()=>{});}).finally(()=>{discovery=null;schedule();});schedule();return this.status();},
    async stop(){stopped=true;clearTimeout(timer);timer=null;while(busy)await new Promise(r=>setTimeout(r,20));await discovery;if(full)await store.setImport({state:'paused'}).catch(()=>{});await store.idle();}
  };
}
module.exports = { createCollector, createUsageImporter, categoryFor, commandCategory, taskFor, safeName, geminiUsage, pbFields, CATEGORIES, PROVIDERS };

if (require.main === module && process.argv.includes('--selftest')) {
  // Uji cepat read-only terhadap sumber nyata: hanya mencetak angka dan status, tanpa server.
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-collector-'));
  let n = 0, tokens = {}; const c = createCollector({ dataDir, sink: async items => { for (const { event, opts } of items) { if (!event) continue; n++; if (opts.usageOnly) tokens[event.provider] = (tokens[event.provider] || 0) + Object.values(event.tokens).reduce((a, b) => a + b, 0); } } });
  c.start().then(() => c.stop()).then(() => { console.log(JSON.stringify({ events: n, tokens_backfill: tokens, status: c.status() }, null, 1)); fs.rmSync(dataDir, { recursive: true, force: true }); });
}
