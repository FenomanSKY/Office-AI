// [Diubah oleh Codex - 2026-11-21] V17 auto-sync, net reconciliation, isolated demo ledger.
// [Diubah oleh Gemini - 2026-11-20] Penyimpanan Pemantau MT5 Baca-Saja & Buku Besar Keuangan Kantor untuk Office AI V12
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createMt5Sync } = require('./mt5_sync');

const VALID_SOURCES = new Set(['mt5', 'youtube', 'affiliate', 'freelance', 'other']);
const VALID_TYPES = new Set(['income', 'expense']);
const FORBIDDEN_PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// Daftar kunci terlarang: menolak segala percobaan pengiriman perintah order/eksekusi/kredensial dengan HTTP 403
const FORBIDDEN_TRADE_OR_CREDENTIAL_KEYS = new Set([
  'order_send',
  'ordersend',
  'order_check',
  'ordercheck',
  'place_order',
  'placeorder',
  'close_position',
  'closeposition',
  'close_order',
  'closeorder',
  'modify_order',
  'modifyorder',
  'execute_trade',
  'executetrade',
  'password',
  'mt5_password',
  'mt5password',
  'investor_password',
  'investorpassword',
  'broker_password',
  'passwd',
  'pwd',
  'login',
  'account_login',
  'lot_size',
  'lotsize',
  'sl',
  'tp',
  'stop_loss',
  'stoploss',
  'take_profit',
  'takeprofit',
  'magic',
  'magic_number',
  'api_secret',
  'private_key'
]);

function httpError(status, code, message) {
  const err = new Error(message || code);
  err.status = status;
  err.code = code;
  return err;
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// [Diubah oleh Gemini - 2026-11-20] Penjaga keamanan keras 403 terhadap payload eksekusi order atau kredensial MT5
function assertReadOnlyPayload(val, depth = 0) {
  if (depth > 8) {
    throw httpError(400, 'invalid_payload_depth', 'Kedalaman objek JSON melebihi batas aman');
  }
  if (val === null || val === undefined || typeof val !== 'object') return;
  if (Array.isArray(val)) {
    for (const item of val) assertReadOnlyPayload(item, depth + 1);
    return;
  }
  for (const key of Object.getOwnPropertyNames(val)) {
    if (FORBIDDEN_PROTO_KEYS.has(key)) {
      throw httpError(400, 'forbidden_prototype_key', 'Properti prototipe tidak diizinkan');
    }
    const normalized = String(key).trim().toLowerCase();
    if (FORBIDDEN_TRADE_OR_CREDENTIAL_KEYS.has(normalized)) {
      throw httpError(
        403,
        'mt5_readonly_violation',
        `Ditolak (403 Read-Only): Office AI tidak mengizinkan eksekusi trading atau kredensial (${key})`
      );
    }
    assertReadOnlyPayload(val[key], depth + 1);
  }
}

function cleanString(val, maxLen = 160) {
  if (val === undefined || val === null) return '';
  return String(val).replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLen);
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// [Diubah oleh Gemini - 2026-11-20] Gunakan tanggal ISO broker/UTC secara konsisten agar Heatmap Harian, Kurva Ekuitas, & tabel MT5 History selalu sinkron
function isoDateFromIso(isoStr) {
  const s = String(isoStr || '').trim();
  const direct = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  const ts = Date.parse(s);
  const d = Number.isFinite(ts) ? new Date(ts) : new Date();
  return d.toISOString().slice(0, 10);
}

// [Diubah oleh Gemini - 2026-11-20] Susun catatan transaksi MT5 sinkron dengan MT5 History (arah posisi asli, simbol, nomor tiket posisi, dan komentar EA bila ada)
function buildMt5Note(deal, fallbackTicket = '') {
  const side = String(deal?.side || 'TRADE').trim().toUpperCase() || 'TRADE';
  const symbol = cleanString(deal?.symbol || '', 24);
  const posId = cleanString(deal?.position_id || '', 48);
  const displayTicket = posId && posId !== '0' ? posId : cleanString(deal?.ticket || fallbackTicket || '', 48);
  const comment = cleanString(deal?.comment || '', 64);
  const metaParts = [];
  if (displayTicket) metaParts.push(`#${displayTicket}`);
  if (comment) metaParts.push(comment);
  const meta = metaParts.length ? ` (${metaParts.join(' · ')})` : '';
  return `MT5 ${side}${symbol ? ' ' + symbol : ''}${meta}`.trim();
}

function csvCell(val, isNumeric = false) {
  if (val === null || val === undefined) return '';
  if (isNumeric) {
    const n = Number(val);
    return Number.isFinite(n) ? String(n) : '0';
  }
  let s = String(val).replace(/[\r\n]+/g, ' ').trim();
  if (/^[=+\-@]/.test(s)) {
    s = "'" + s;
  }
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// [Diubah oleh Gemini - 2026-11-20] Tambah mt5HistoryDeals[] terdeduplikasi berdasarkan ticket (maks 2000 deal) untuk Analisa Trading V13
function defaultPersistedState() {
  return {
    version: 1,
    config: {
      enabled: false,
      autoSyncDecided: false,
      pollIntervalMs: 1000,
      pythonPath: '',
      terminalPath: '',
      usdToIdr: 16200
    },
    recordedDealTickets: [],
    mt5HistoryDeals: [],
    entries: []
  };
}

async function createMt5FinanceStore({
  dataDir,
  root = __dirname,
  onEvent = () => {},
  now = Date.now,
  bridgeRunner = null,
  demoMode = false,
  syncOptions = {}
} = {}) {
  const filePath = path.join(dataDir, demoMode ? 'mt5_demo.json' : 'mt5_finance.json');
  const bridgeScriptPath = path.join(root, 'mt5_readonly_bridge.py');
  let writeQueue = Promise.resolve();
  let pollTimer = null;
  let stopped = false, demoStore = null;
  let snapshotQueue = Promise.resolve();

  const nowIso = () => new Date(now()).toISOString();

  function normalizeDealRecord(rawDeal, fallbackIso = nowIso(), defaultCurrency = 'USD') {
    const ticket = cleanString(rawDeal?.ticket || '', 48);
    if (!ticket) return null;
    const symbol = cleanString(rawDeal?.symbol || 'XAUUSD', 24).toUpperCase() || 'XAUUSD';
    const side = String(rawDeal?.side || 'BUY').trim().toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
    const entry = String(rawDeal?.entry || 'out').trim().toLowerCase() === 'inout' ? 'inout' : 'out';
    const volume = Math.max(0.01, Math.round((Number(rawDeal?.volume) || 0.1) * 10000) / 10000);
    const price = Math.round((Number(rawDeal?.price) || 0) * 100000) / 100000;
    const profit = round2(Number(rawDeal?.profit ?? rawDeal?.net_profit ?? 0) || 0);
    const commission = round2(Number(rawDeal?.commission) || 0);
    const swap = round2(Number(rawDeal?.swap) || 0);
    const net_profit = rawDeal?.net_profit !== undefined
      ? round2(Number(rawDeal.net_profit) || 0)
      : round2(profit + commission + swap);
    const currency = cleanString(rawDeal?.currency || defaultCurrency || 'USD', 8).toUpperCase() || 'USD';
    const rate = currency === 'IDR' ? 1 : currency === 'USD' ? (persisted?.config?.usdToIdr || 16200) : null;
    const net_profit_idr = rate === null ? null : Math.round(net_profit * rate);
    const parsedTime = Date.parse(String(rawDeal?.time || fallbackIso || ''));
    const time = Number.isFinite(parsedTime) ? new Date(parsedTime).toISOString() : fallbackIso;
    return {
      ticket,
      position_id: cleanString(rawDeal?.position_id || ticket, 48),
      symbol,
      side,
      entry,
      volume,
      price,
      profit,
      commission,
      swap,
      net_profit,
      net_profit_idr,
      currency,
      comment: cleanString(rawDeal?.comment || '', 64),
      time,
      demo: Boolean(rawDeal?.demo)
    };
  }

  async function ensureDir() {
    await fs.mkdir(dataDir, { recursive: true });
  }

  async function saveState(stateObj) {
    await ensureDir();
    const tmp = path.join(
      dataDir,
      `.mt5_finance.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
    );
    const content = JSON.stringify(stateObj, null, 2) + '\n';
    await fs.writeFile(tmp, content, 'utf8');
    let lastErr = null;
    for (let i = 0; i < 5; i++) {
      try {
        await fs.rename(tmp, filePath);
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
    throw lastErr || new Error('Gagal menyimpan mt5_finance.json');
  }

  function queueSave() {
    const snapshotToSave = {
      version: 1,
      config: { ...persisted.config },
      recordedDealTickets: [...recordedDealTickets].slice(-2000),
      mt5HistoryDeals: persisted.mt5HistoryDeals.slice(-2000),
      entries: persisted.entries.slice(-5000)
    };
    const next = writeQueue.then(() => saveState(snapshotToSave));
    writeQueue = next.catch(() => {});
    return next;
  }

  let persisted = defaultPersistedState();
  await ensureDir();
  try {
    const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
    if (isPlainObject(raw) && Array.isArray(raw.entries)) {
      persisted = {
        version: 1,
        config: {
          enabled: Boolean(raw.config?.enabled),
          // Legacy defaults are undecided; customized legacy configurations are preserved conservatively.
          autoSyncDecided: raw.config?.autoSyncDecided === true || raw.config?.enabled === true ||
            (raw.config?.autoSyncDecided === undefined && Boolean(raw.config?.pythonPath || raw.config?.terminalPath ||
              raw.config?.userConfigured || raw.config?.updatedAt ||
              (raw.config?.pollIntervalMs && raw.config.pollIntervalMs !== 5000) ||
              (raw.config?.usdToIdr && raw.config.usdToIdr !== 16200))),
          pollIntervalMs: raw.config?.autoSyncDecided === undefined ? 1000 :
            Math.max(1000, Math.min(5000, Number(raw.config?.pollIntervalMs) || 1000)),
          pythonPath: cleanString(raw.config?.pythonPath, 260),
          terminalPath: cleanString(raw.config?.terminalPath, 260),
          usdToIdr: Math.max(100, Math.min(1000000, Number(raw.config?.usdToIdr) || 16200))
        },
        recordedDealTickets: Array.isArray(raw.recordedDealTickets)
          ? raw.recordedDealTickets.map(t => String(t))
          : [],
        mt5HistoryDeals: [],
        entries: raw.entries.filter(e => isPlainObject(e) && typeof e.id === 'string')
      };
      if (Array.isArray(raw.mt5HistoryDeals)) {
        const dedup = new Map();
        for (const item of raw.mt5HistoryDeals) {
          const norm = normalizeDealRecord(item);
          if (norm) dedup.set(norm.ticket, norm);
        }
        persisted.mt5HistoryDeals = [...dedup.values()].slice(-2000);
      }
    }
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      await fs.rename(filePath, `${filePath}.corrupt.${Date.now()}`).catch(() => {});
    }
    // [Diubah oleh Gemini - 2026-11-20] Default buku besar mulai jujur di Rp 0 tanpa saldo/transaksi palsu
    persisted = defaultPersistedState();
    await saveState(persisted);
  }

  if (!demoMode && (persisted.entries.some(e => e.demo) || persisted.mt5HistoryDeals.some(d => d.demo))) {
    const demoFile = path.join(dataDir, 'mt5_demo.json');
    let previous = defaultPersistedState();
    try { previous = JSON.parse(await fs.readFile(demoFile, 'utf8')); } catch {}
    const entries = [...new Map([...(previous.entries || []), ...persisted.entries.filter(e => e.demo)].map(e => [e.id, e])).values()];
    const deals = [...new Map([...(previous.mt5HistoryDeals || []), ...persisted.mt5HistoryDeals.filter(d => d.demo)].map(d => [d.ticket, d])).values()];
    const tmp = demoFile + '.migration.tmp';
    await fs.writeFile(tmp, JSON.stringify({ ...previous, entries, mt5HistoryDeals: deals }), 'utf8');
    await fs.rename(tmp, demoFile);
    const demoTickets = new Set([...entries.map(e => e.ticket), ...deals.map(d => d.ticket)]);
    persisted.entries = persisted.entries.filter(e => !e.demo);
    persisted.mt5HistoryDeals = persisted.mt5HistoryDeals.filter(d => !d.demo);
    persisted.recordedDealTickets = persisted.recordedDealTickets.filter(t => !demoTickets.has(t));
    await saveState(persisted);
  }

  const recordedDealTickets = new Set(persisted.recordedDealTickets);
  for (const e of persisted.entries) {
    if (e.ticket) recordedDealTickets.add(String(e.ticket));
  }
  for (const d of persisted.mt5HistoryDeals) {
    if (d.ticket) recordedDealTickets.add(String(d.ticket));
  }

  function upsertHistoryDeal(rawDeal, fallbackIso = nowIso(), defaultCurrency = 'USD') {
    const norm = normalizeDealRecord(rawDeal, fallbackIso, defaultCurrency);
    if (!norm) return null;
    const idx = persisted.mt5HistoryDeals.findIndex(d => d.ticket === norm.ticket);
    let inserted = false;
    let updated = false;
    if (idx >= 0) {
      const prev = persisted.mt5HistoryDeals[idx];
      if (
        prev.side !== norm.side ||
        prev.position_id !== norm.position_id ||
        prev.comment !== norm.comment ||
        prev.net_profit !== norm.net_profit ||
        prev.net_profit_idr !== norm.net_profit_idr ||
        prev.symbol !== norm.symbol
      ) {
        updated = true;
      }
      persisted.mt5HistoryDeals[idx] = { ...prev, ...norm };
    } else {
      persisted.mt5HistoryDeals.push(norm);
      inserted = true;
    }
    persisted.mt5HistoryDeals.sort((a, b) => {
      const ta = Date.parse(a.time || '') || 0;
      const tb = Date.parse(b.time || '') || 0;
      return ta - tb || String(a.ticket).localeCompare(String(b.ticket));
    });
    if (persisted.mt5HistoryDeals.length > 2000) {
      persisted.mt5HistoryDeals.splice(0, persisted.mt5HistoryDeals.length - 2000);
    }
    return { deal: norm, inserted, updated };
  }

  const mt5State = {
    connected: false,
    readonly: true,
    status: 'disconnected',
    activePositions: [],
    activeSide: null,
    floatingProfit: 0,
    floatingProfitIdr: 0,
    netFloating: 0,
    terminalFloating: null,
    terminalProfit: null,
    floatingDifference: null,
    floatingMatches: null,
    commissionComplete: false,
    currency: 'USD',
    account: null,
    reason: 'not_polled',
    lastUpdated: null,
    error: null
  };

  function emitSafe(payload) {
    try {
      onEvent(payload);
    } catch {
      /* abaikan error listener SSE */
    }
  }

  function getStatus() {
    return {
      ...mt5State,
      detection: sync.getDetection(),
      demo: demoMode,
      realizedToday: round2(persisted.mt5HistoryDeals.filter(d => !d.demo && d.currency === mt5State.currency && isoDateFromIso(d.time) === isoDateFromIso(nowIso())).reduce((n, d) => n + d.net_profit, 0)),
      activePositions: mt5State.activePositions.map(p => ({ ...p })),
      config: { ...persisted.config }
    };
  }

  function getSummary() {
    let totalIncomeIdr = 0;
    let totalLossIdr = 0;
    const bySource = {
      mt5: 0,
      youtube: 0,
      affiliate: 0,
      freelance: 0,
      other: 0
    };
    const bySourceDetail = {
      mt5: { incomeIdr: 0, lossIdr: 0, netIdr: 0, count: 0 },
      youtube: { incomeIdr: 0, lossIdr: 0, netIdr: 0, count: 0 },
      affiliate: { incomeIdr: 0, lossIdr: 0, netIdr: 0, count: 0 },
      freelance: { incomeIdr: 0, lossIdr: 0, netIdr: 0, count: 0 },
      other: { incomeIdr: 0, lossIdr: 0, netIdr: 0, count: 0 }
    };

    for (const entry of persisted.entries) {
      const src = VALID_SOURCES.has(entry.source) ? entry.source : 'other';
      const amt = Math.round(Math.abs(Number(entry.amountIdr) || 0));
      const detail = bySourceDetail[src];
      detail.count += 1;
      if (entry.type === 'expense') {
        totalLossIdr += amt;
        detail.lossIdr += amt;
        detail.netIdr -= amt;
      } else {
        totalIncomeIdr += amt;
        detail.incomeIdr += amt;
        detail.netIdr += amt;
      }
      bySource[src] = detail.netIdr;
    }

    return {
      totalIncomeIdr,
      totalLossIdr,
      netBalanceIdr: totalIncomeIdr - totalLossIdr,
      bySource,
      bySourceDetail,
      entryCount: persisted.entries.length,
      unconvertedCount: persisted.entries.filter(e => e.amountIdr === null).length,
      mt5ByCurrency: persisted.entries.filter(e => e.source === 'mt5').reduce((totals, e) => {
        totals[e.currency] = round2((totals[e.currency] || 0) + (e.type === 'expense' ? -1 : 1) * e.amountOriginal);
        return totals;
      }, {}),
      usdToIdr: persisted.config.usdToIdr,
      mt5: getStatus()
    };
  }

  function getLedger({ source = '', limit = 100 } = {}) {
    const cleanSource = String(source || '').trim().toLowerCase();
    const maxItems = Math.max(1, Math.min(1000, Number(limit) || 100));
    const filtered = persisted.entries.filter(e => {
      if (cleanSource && cleanSource !== 'all' && VALID_SOURCES.has(cleanSource)) {
        return e.source === cleanSource;
      }
      return true;
    });
    const sorted = [...filtered].sort((a, b) => {
      const ta = Date.parse(a.date || a.createdAt || '') || 0;
      const tb = Date.parse(b.date || b.createdAt || '') || 0;
      return tb - ta;
    });
    return {
      entries: sorted.slice(0, maxItems),
      totalCount: filtered.length,
      summary: getSummary()
    };
  }

  async function addEntry(rawPayload) {
    if (!isPlainObject(rawPayload)) {
      throw httpError(400, 'invalid_payload', 'Payload transaksi harus berupa objek JSON');
    }
    assertReadOnlyPayload(rawPayload);
    if (!demoMode && rawPayload.demo === true) return (await getDemoStore()).addEntry(rawPayload);

    const source = String(rawPayload.source || 'other').trim().toLowerCase();
    if (!VALID_SOURCES.has(source)) {
      throw httpError(400, 'invalid_source', 'Sumber harus mt5, youtube, affiliate, freelance, atau other');
    }

    const rawType = String(rawPayload.type || rawPayload.category || 'income').trim().toLowerCase();
    let type = 'income';
    if (rawType === 'expense' || rawType === 'loss' || rawType === 'rugi' || rawType === 'biaya') {
      type = 'expense';
    } else if (rawType === 'income' || rawType === 'profit' || rawType === 'pemasukan') {
      type = 'income';
    } else if (!VALID_TYPES.has(rawType)) {
      throw httpError(400, 'invalid_type', 'Jenis transaksi harus income atau expense');
    }

    const currency = cleanString(rawPayload.currency || 'IDR', 8).toUpperCase() || 'IDR';
    const usdRate = persisted.config.usdToIdr || 16200;
    let amountOriginal = Number(rawPayload.amountOriginal ?? rawPayload.amount ?? rawPayload.amountIdr);
    let amountIdr = Number(rawPayload.amountIdr);

    if (!Number.isFinite(amountIdr) || amountIdr <= 0) {
      if (!Number.isFinite(amountOriginal) || amountOriginal <= 0) {
        throw httpError(400, 'invalid_amount', 'Nominal transaksi harus angka positif (> 0)');
      }
      amountIdr = currency === 'USD' ? Math.round(amountOriginal * usdRate) : Math.round(amountOriginal);
    } else {
      amountIdr = Math.round(amountIdr);
      if (!Number.isFinite(amountOriginal) || amountOriginal <= 0) {
        amountOriginal = currency === 'USD' ? round2(amountIdr / usdRate) : amountIdr;
      }
    }

    if (amountIdr <= 0 || amountIdr > 1e15) {
      throw httpError(400, 'invalid_amount', 'Nominal Rp di luar rentang yang diizinkan');
    }

    const stamp = nowIso();
    let dateIso = stamp;
    if (rawPayload.date) {
      const parsedDate = Date.parse(String(rawPayload.date));
      if (!Number.isFinite(parsedDate)) {
        throw httpError(400, 'invalid_date', 'Format tanggal transaksi tidak valid');
      }
      dateIso = new Date(parsedDate).toISOString();
    }

    const entry = {
      id: 'fin_' + crypto.randomBytes(6).toString('hex'),
      source,
      type,
      category: type === 'income' ? 'profit' : 'loss',
      amountIdr,
      amountOriginal: round2(amountOriginal),
      currency,
      note: cleanString(rawPayload.note || '', 200),
      symbol: cleanString(rawPayload.symbol || '', 24),
      side: cleanString(rawPayload.side || '', 8).toUpperCase(),
      ticket: cleanString(rawPayload.ticket || '', 48),
      date: dateIso,
      createdAt: stamp,
      demo: Boolean(rawPayload.demo)
    };

    if (entry.ticket) {
      recordedDealTickets.add(entry.ticket);
      if (source === 'mt5') {
        const signedNet = type === 'expense' ? -Math.abs(entry.amountOriginal) : Math.abs(entry.amountOriginal);
        upsertHistoryDeal(
          {
            ticket: entry.ticket,
            symbol: entry.symbol || 'XAUUSD',
            side: entry.side || 'BUY',
            volume: rawPayload.volume || 0.1,
            profit: signedNet,
            commission: 0,
            swap: 0,
            net_profit: signedNet,
            time: entry.date,
            demo: entry.demo
          },
          entry.date,
          entry.currency
        );
      }
    }
    persisted.entries.push(entry);
    await queueSave();

    const summary = getSummary();
    emitSafe({ type: 'finance_updated', entry, summary });
    return { ok: true, entry, summary };
  }

  async function deleteEntry(id) {
    const cleanId = cleanString(id, 48);
    const idx = persisted.entries.findIndex(e => e.id === cleanId);
    if (idx === -1) {
      throw httpError(404, 'entry_not_found', 'Transaksi tidak ditemukan');
    }
    const [removed] = persisted.entries.splice(idx, 1);
    if (removed.ticket) {
      persisted.mt5HistoryDeals = persisted.mt5HistoryDeals.filter(d => d.ticket !== removed.ticket);
      recordedDealTickets.delete(removed.ticket);
    }
    await queueSave();
    const summary = getSummary();
    emitSafe({ type: 'finance_updated', deletedId: removed.id, summary });
    return { ok: true, deletedId: removed.id, summary };
  }

  const sync = createMt5Sync({
    root, getConfig: () => persisted.config,
    autodetect: !demoMode && !bridgeRunner && process.env.OFFICE_MT5_AUTODETECT !== '0',
    ...syncOptions,
    onSnapshot: snapshot => ingest(snapshot),
    onHeartbeat: () => emitSafe({ type: 'mt5_heartbeat', lastUpdated: mt5State.lastUpdated, connected: mt5State.connected }),
    onDetection: async detection => {
      if (stopped) return;
      if (!persisted.config.autoSyncDecided && detection.module && detection.terminal) {
        persisted.config.enabled = true;
        persisted.config.autoSyncDecided = true;
        await queueSave();
      }
      mt5State.reason = detection.module ? (detection.terminal ? 'terminal_not_running' : 'terminal_not_found') : 'mt5_unavailable';
      emitSafe({ type: 'mt5_state', state: getStatus() });
    }
  });

  function ingest(snapshot) {
    const job = snapshotQueue.then(() => stopped ? getStatus() : applySnapshot(snapshot));
    snapshotQueue = job.catch(() => {});
    return job;
  }

  async function refresh(opts = {}) {
    assertReadOnlyPayload(opts);
    const snapshot = bridgeRunner ? await bridgeRunner({ ...persisted.config, bridgeScriptPath,
      historyDays: opts.historyDays ?? (opts.lightPoll ? null : 30), historyHours: opts.historyHours || 24 }) : await sync.once(opts);
    return ingest(snapshot || { connected: false, reason: 'mt5_unavailable', fetched_at: nowIso() });
  }

  async function testNow() {
    await sync.detect();
    if (persisted.config.enabled) await sync.start();
    return refresh({ lightPoll: true });
  }

  async function applySnapshot(snapshot = {}) {
    const previous = JSON.stringify({ ...mt5State, lastUpdated: null });
    const fetchedAt = snapshot.fetched_at || nowIso();
    if (mt5State.lastUpdated && Date.parse(fetchedAt) < Date.parse(mt5State.lastUpdated)) return getStatus();

    if (snapshot && snapshot.ok && snapshot.connected) {
      const positions = Array.isArray(snapshot.positions) ? snapshot.positions : [];
      const currency = cleanString(snapshot.account?.currency || 'USD', 8).toUpperCase() || 'USD';
      const floatingProfit = round2(
        positions.reduce((acc, p) => acc + (Number(p.profit) || 0) + (Number(p.swap) || 0) + (Number(p.commission) || 0), 0)
      );
      const rate = currency === 'IDR' ? 1 : currency === 'USD' ? (persisted.config.usdToIdr || 16200) : null;

      mt5State.connected = true;
      mt5State.readonly = true;
      mt5State.activePositions = positions.map(p => ({
        ticket: String(p.ticket || ''),
        symbol: cleanString(p.symbol || '', 24),
        side: String(p.side || 'BUY').toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
        volume: Math.round((Number(p.volume) || 0) * 10000) / 10000,
        price_open: Number(p.price_open) || 0,
        price_current: Number(p.price_current) || 0,
        profit: round2(Number(p.profit) || 0),
        swap: round2(Number(p.swap) || 0),
        commission: p.commission == null ? null : round2(Number(p.commission) || 0),
        net_floating: round2((Number(p.profit) || 0) + (Number(p.swap) || 0) + (Number(p.commission) || 0)),
        sl: Number(p.sl) || null,
        tp: Number(p.tp) || null,
        time: p.time || fetchedAt
      }));
      mt5State.status = mt5State.activePositions.length > 0 ? 'trading' : 'idle';
      mt5State.activeSide = mt5State.activePositions.length > 0 ? mt5State.activePositions[0].side : null;
      mt5State.floatingProfit = floatingProfit;
      mt5State.floatingProfitIdr = rate === null ? null : Math.round(floatingProfit * rate);
      mt5State.netFloating = floatingProfit;
      mt5State.commissionComplete = positions.every(p => p.commission != null);
      const balance = snapshot.account?.balance, equity = snapshot.account?.equity;
      mt5State.terminalFloating = Number.isFinite(balance) && Number.isFinite(equity) ? round2(equity - balance) : null;
      mt5State.terminalProfit = Number.isFinite(snapshot.account?.profit) ? round2(snapshot.account.profit) : null;
      mt5State.floatingDifference = mt5State.terminalFloating === null ? null : round2(floatingProfit - mt5State.terminalFloating);
      mt5State.floatingMatches = mt5State.floatingDifference === null ? null : Math.abs(mt5State.floatingDifference) <= 0.02;
      mt5State.currency = currency;
      mt5State.account = snapshot.account || null;
      mt5State.reason = null;
      mt5State.error = null;
      mt5State.lastUpdated = fetchedAt;

      const deals = Array.isArray(snapshot.closed_deals) ? snapshot.closed_deals : [];
      let stateChanged = false;
      let reconciledLedger = false;
      for (const deal of deals) {
        const ticket = String(deal.ticket || '').trim();
        if (!ticket) continue;
        const upserted = upsertHistoryDeal(deal, fetchedAt, currency);
        if (upserted?.inserted || upserted?.updated) stateChanged = true;

        const netVal = Number(deal.net_profit ?? deal.profit) || 0;
        const isProfit = netVal >= 0;
        const amountOriginal = round2(Math.abs(netVal));
        const amountIdr = rate === null ? null : Math.round(amountOriginal * rate);
        const sideNorm = String(deal.side || '').trim().toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
        const symNorm = cleanString(deal.symbol || '', 24);
        const posIdNorm = cleanString(deal.position_id || ticket, 48);
        const commentNorm = cleanString(deal.comment || '', 64);
        const syncedNote = buildMt5Note({ ...deal, side: sideNorm, symbol: symNorm, position_id: posIdNorm, comment: commentNorm }, ticket);
        const entryType = isProfit ? 'income' : 'expense';
        const entryCat = isProfit ? 'profit' : 'loss';
        const dealTime = deal.time || fetchedAt;

        // [Diubah oleh Gemini - 2026-11-20] Rekonsiliasi entri MT5 yang sudah tercatat agar catatan (note), arah (SELL/BUY), nomor tiket posisi, komentar EA, & nominal selalu sinkron dengan MT5 History
        const existingEntry = persisted.entries.find(e => e.source === 'mt5' && e.ticket === ticket);
        if (existingEntry) {
          recordedDealTickets.add(ticket);
          if (
            existingEntry.side !== sideNorm ||
            existingEntry.note !== syncedNote ||
            existingEntry.positionId !== posIdNorm ||
            existingEntry.comment !== commentNorm ||
            existingEntry.symbol !== symNorm ||
            existingEntry.amountOriginal !== amountOriginal ||
            existingEntry.amountIdr !== amountIdr ||
            existingEntry.type !== entryType ||
            existingEntry.currency !== currency
          ) {
            existingEntry.side = sideNorm;
            existingEntry.symbol = symNorm;
            existingEntry.positionId = posIdNorm;
            existingEntry.comment = commentNorm;
            existingEntry.note = syncedNote;
            existingEntry.amountOriginal = amountOriginal;
            existingEntry.amountIdr = amountIdr;
            existingEntry.type = entryType;
            existingEntry.category = entryCat;
            existingEntry.currency = currency;
            existingEntry.date = dealTime;
            stateChanged = true;
            reconciledLedger = true;
          }
          continue;
        }
        if (recordedDealTickets.has(ticket)) {
          continue;
        }
        recordedDealTickets.add(ticket);
        const entry = {
          id: 'fin_' + crypto.randomBytes(6).toString('hex'),
          source: 'mt5',
          type: entryType,
          category: entryCat,
          amountIdr,
          amountOriginal,
          currency,
          note: syncedNote,
          symbol: symNorm,
          side: sideNorm,
          ticket,
          positionId: posIdNorm,
          comment: commentNorm,
          date: dealTime,
          createdAt: nowIso(),
          demo: false
        };
        persisted.entries.push(entry);
        stateChanged = true;
        emitSafe({
          type: 'mt5_deal_closed',
          deal: upserted?.deal || deal,
          entry,
          summary: getSummary()
        });
      }
      if (stateChanged) {
        await queueSave();
        if (reconciledLedger) {
          emitSafe({ type: 'finance_updated', reconciled: true, summary: getSummary() });
        }
      }
    } else {
      mt5State.connected = false;
      mt5State.readonly = true;
      mt5State.status = 'disconnected';
      mt5State.activePositions = [];
      mt5State.activeSide = null;
      mt5State.floatingProfit = 0;
      mt5State.floatingProfitIdr = 0;
      mt5State.account = null;
      mt5State.netFloating = 0;
      mt5State.terminalFloating = null;
      mt5State.terminalProfit = null;
      mt5State.floatingDifference = null;
      mt5State.floatingMatches = null;
      mt5State.reason = snapshot?.reason || 'mt5_unavailable';
      mt5State.error = snapshot?.error || 'Terminal MetaTrader 5 tidak aktif.';
      mt5State.lastUpdated = fetchedAt;
    }

    if (previous !== JSON.stringify({ ...mt5State, lastUpdated: null })) {
      emitSafe({ type: 'mt5_state', state: getStatus() });
    } else {
      emitSafe({ type: 'mt5_heartbeat', lastUpdated: mt5State.lastUpdated, connected: mt5State.connected });
    }

    return getStatus();
  }

  async function applyPollTimer() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    if (demoMode || stopped) return;
    if (bridgeRunner && persisted.config.enabled) {
      let busy = false;
      pollTimer = setInterval(async () => {
        if (busy) return;
        busy = true;
        try { await refresh({ lightPoll: true }); } finally { busy = false; }
      }, persisted.config.pollIntervalMs);
      pollTimer.unref?.();
    } else await sync.start();
  }

  async function updateConfig(rawConfig) {
    if (!isPlainObject(rawConfig)) {
      throw httpError(400, 'invalid_config', 'Konfigurasi MT5 harus objek JSON');
    }
    assertReadOnlyPayload(rawConfig);
    const config = { ...persisted.config };
    for (const key of ['pythonPath', 'terminalPath']) {
      const value = String(rawConfig[key] || '');
      if (value.split(/[\\/]/).some(part => ['secrets', '.git', '..'].includes(part.toLowerCase()))) {
        throw httpError(403, 'forbidden_path', 'Lokasi konfigurasi MT5 ditolak');
      }
    }

    if (rawConfig.enabled !== undefined) {
      config.enabled = Boolean(rawConfig.enabled);
      config.autoSyncDecided = true;
    }
    if (rawConfig.pollIntervalMs !== undefined) {
      const ms = Number(rawConfig.pollIntervalMs);
      if (!Number.isFinite(ms) || ms < 1000 || ms > 5000) {
        throw httpError(400, 'invalid_poll_interval', 'Interval polling harus 1000..5000 ms');
      }
      config.pollIntervalMs = Math.round(ms);
    }
    if (rawConfig.pythonPath !== undefined) {
      config.pythonPath = cleanString(rawConfig.pythonPath, 260);
    }
    if (rawConfig.terminalPath !== undefined) {
      config.terminalPath = cleanString(rawConfig.terminalPath, 260);
    }
    if (rawConfig.usdToIdr !== undefined) {
      const rate = Number(rawConfig.usdToIdr);
      if (!Number.isFinite(rate) || rate < 100 || rate > 1000000) {
        throw httpError(400, 'invalid_fx_rate', 'Kurs USD ke IDR harus antara 100 hingga 1.000.000');
      }
      config.usdToIdr = Math.round(rate);
    }

    persisted.config = config;
    await queueSave();
    if (rawConfig.pythonPath !== undefined || rawConfig.terminalPath !== undefined) await sync.detect();
    await applyPollTimer();
    emitSafe({ type: 'mt5_state', state: getStatus() });
    return getStatus();
  }

  // [Diubah oleh Gemini - 2026-11-20] Mesin Analisa Trading MT5 V13 (Win Rate, Profit Factor, Equity Curve, Drawdown, Per-Simbol, Heatmap Harian, CSV)
  function getMt5Analytics({ days = 30, symbol = '' } = {}) {
    const periodDays = Math.max(1, Math.min(365, Math.round(Number(days) || 30)));
    const rawSym = cleanString(symbol || '', 24).toUpperCase();
    const symbolFilter = rawSym === 'ALL' || rawSym === '*' ? '' : rawSym;
    const currency = (mt5State.connected ? mt5State.currency : persisted.mt5HistoryDeals.at(-1)?.currency) || mt5State.currency || 'USD';
    const usdToIdr = persisted.config.usdToIdr || 16200;
    const rate = currency === 'IDR' ? 1 : currency === 'USD' ? usdToIdr : null;
    const cutoffMs = now() - periodDays * 86400 * 1000;

    // Pastikan setiap entry MT5 yang memiliki ticket ikut terwakili di mt5HistoryDeals
    const knownTickets = new Set(persisted.mt5HistoryDeals.map(d => d.ticket));
    const allDeals = [...persisted.mt5HistoryDeals];
    for (const e of persisted.entries) {
      if (e.source === 'mt5' && e.ticket && !knownTickets.has(e.ticket)) {
        const signed = e.type === 'expense' ? -Math.abs(Number(e.amountOriginal) || 0) : Math.abs(Number(e.amountOriginal) || 0);
        const norm = normalizeDealRecord(
          {
            ticket: e.ticket,
            symbol: e.symbol || 'XAUUSD',
            side: e.side || 'BUY',
            volume: 0.1,
            profit: signed,
            commission: 0,
            swap: 0,
            net_profit: signed,
            time: e.date || e.createdAt,
            demo: e.demo
          },
          e.date || e.createdAt,
          e.currency || currency
        );
        if (norm) {
          knownTickets.add(norm.ticket);
          allDeals.push(norm);
        }
      }
    }

    const availableSymbols = [...new Set(allDeals.map(d => String(d.symbol || '').toUpperCase()).filter(Boolean))].sort();

    const filtered = allDeals
      .filter(d => {
        if (d.currency && d.currency !== currency) return false;
        const tMs = Date.parse(d.time || '') || 0;
        if (tMs > 0 && tMs < cutoffMs) return false;
        if (symbolFilter && String(d.symbol || '').toUpperCase() !== symbolFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const ta = Date.parse(a.time || '') || 0;
        const tb = Date.parse(b.time || '') || 0;
        return ta - tb || String(a.ticket).localeCompare(String(b.ticket));
      });

    const totalTrades = filtered.length;
    let wins = 0;
    let losses = 0;
    let breakeven = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let bestTrade = 0;
    let worstTrade = 0;
    let cumulative = 0;
    let peak = 0;
    let maxDrawdown = 0;

    const equityCurve = [];
    const symbolMap = new Map();
    const dailyMap = new Map();

    for (let i = 0; i < filtered.length; i++) {
      const d = filtered[i];
      const delta = round2(Number(d.net_profit ?? d.profit) || 0);
      if (i === 0 || delta > bestTrade) bestTrade = delta;
      if (i === 0 || delta < worstTrade) worstTrade = delta;

      if (delta > 0) {
        wins += 1;
        grossProfit = round2(grossProfit + delta);
      } else if (delta < 0) {
        losses += 1;
        grossLoss = round2(grossLoss + Math.abs(delta));
      } else {
        breakeven += 1;
      }

      cumulative = round2(cumulative + delta);
      if (cumulative > peak) peak = cumulative;
      const dd = round2(peak - cumulative);
      if (dd > maxDrawdown) maxDrawdown = dd;

      const dateStr = isoDateFromIso(d.time);
      const cumulativeIdr = (rate === null ? null : Math.round(cumulative * rate));

      equityCurve.push({
        index: i + 1,
        date: dateStr,
        time: d.time,
        ticket: d.ticket,
        symbol: d.symbol,
        side: d.side,
        delta,
        cumulative,
        cumulativeIdr
      });

      const symKey = d.symbol || 'XAUUSD';
      const symAgg = symbolMap.get(symKey) || { symbol: symKey, trades: 0, wins: 0, losses: 0, netProfit: 0 };
      symAgg.trades += 1;
      if (delta > 0) symAgg.wins += 1;
      else if (delta < 0) symAgg.losses += 1;
      symAgg.netProfit = round2(symAgg.netProfit + delta);
      symbolMap.set(symKey, symAgg);

      const dayAgg = dailyMap.get(dateStr) || { date: dateStr, trades: 0, wins: 0, losses: 0, netProfit: 0 };
      dayAgg.trades += 1;
      if (delta > 0) dayAgg.wins += 1;
      else if (delta < 0) dayAgg.losses += 1;
      dayAgg.netProfit = round2(dayAgg.netProfit + delta);
      dailyMap.set(dateStr, dayAgg);
    }

    const netProfit = round2(grossProfit - grossLoss);
    const netProfitIdr = (rate === null ? null : Math.round(netProfit * rate));
    const winRatePct = totalTrades > 0 ? round2((wins / totalTrades) * 100) : 0;
    const profitFactor = grossLoss > 0
      ? round2(grossProfit / grossLoss)
      : (grossProfit > 0 ? round2(grossProfit) : 0);
    const avgWin = wins > 0 ? round2(grossProfit / wins) : 0;
    const avgLoss = losses > 0 ? round2(grossLoss / losses) : 0;
    const expectancy = totalTrades > 0 ? round2(netProfit / totalTrades) : 0;
    const ddDenom = peak > 0 ? peak : (grossProfit + grossLoss > 0 ? grossProfit + grossLoss : 0);
    const maxDrawdownPct = maxDrawdown > 0 && ddDenom > 0
      ? round2(Math.min(100, (maxDrawdown / ddDenom) * 100))
      : 0;

    const bySymbol = [...symbolMap.values()]
      .map(s => ({
        symbol: s.symbol,
        trades: s.trades,
        wins: s.wins,
        losses: s.losses,
        winRatePct: s.trades > 0 ? round2((s.wins / s.trades) * 100) : 0,
        netProfit: s.netProfit,
        netProfitIdr: (rate === null ? null : Math.round(s.netProfit * rate))
      }))
      .sort((a, b) => b.netProfit - a.netProfit || b.trades - a.trades);

    const dailyHeatmap = [...dailyMap.values()]
      .map(d => ({
        date: d.date,
        trades: d.trades,
        wins: d.wins,
        losses: d.losses,
        netProfit: d.netProfit,
        netProfitIdr: (rate === null ? null : Math.round(d.netProfit * rate))
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const deals = [...filtered]
      .reverse()
      .slice(0, 500)
      .map(d => ({
        ...d,
        net_profit_idr: (rate === null ? null : Math.round((Number(d.net_profit ?? d.profit) || 0) * rate))
      }));

    return {
      periodDays,
      symbolFilter,
      availableSymbols,
      currency,
      usdToIdr,
      connected: Boolean(mt5State.connected),
      lastUpdated: mt5State.lastUpdated,
      metrics: {
        totalTrades,
        wins,
        losses,
        breakeven,
        winRatePct,
        grossProfit,
        grossLoss,
        netProfit,
        netProfitIdr,
        profitFactor,
        avgWin,
        avgLoss,
        expectancy,
        bestTrade: totalTrades > 0 ? bestTrade : 0,
        worstTrade: totalTrades > 0 ? worstTrade : 0,
        maxDrawdown,
        maxDrawdownPct
      },
      equityCurve,
      bySymbol,
      dailyHeatmap,
      deals
    };
  }

  function exportMt5AnalyticsCsv({ days = 30, symbol = '' } = {}) {
    const analytics = getMt5Analytics({ days, symbol });
    const header = 'ticket,time,symbol,side,volume,profit,commission,swap,net_profit,net_profit_idr,demo';
    const lines = [header];
    for (const d of analytics.deals) {
      lines.push([
        csvCell(d.ticket),
        csvCell(d.time),
        csvCell(d.symbol),
        csvCell(d.side),
        csvCell(d.volume, true),
        csvCell(d.profit, true),
        csvCell(d.commission, true),
        csvCell(d.swap, true),
        csvCell(d.net_profit, true),
        csvCell(d.net_profit_idr, true),
        csvCell(d.demo ? 'true' : 'false')
      ].join(','));
    }
    return lines.join('\r\n') + '\r\n';
  }

  async function simulateDemoTradeInner(rawPayload = {}) {
    if (!isPlainObject(rawPayload)) {
      throw httpError(400, 'invalid_payload', 'Payload simulasi demo harus objek JSON');
    }
    assertReadOnlyPayload(rawPayload);

    const phase = String(rawPayload.phase || 'open').trim().toLowerCase();
    const symbol = cleanString(rawPayload.symbol || 'XAUUSD', 24).toUpperCase() || 'XAUUSD';
    const side = String(rawPayload.side || 'BUY').trim().toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
    const usdRate = persisted.config.usdToIdr || 16200;
    const stamp = nowIso();

    if (phase === 'reset') {
      const removedDemoTickets = new Set([
        ...persisted.entries.filter(e => e.demo && e.ticket).map(e => e.ticket),
        ...persisted.mt5HistoryDeals.filter(d => d.demo && d.ticket).map(d => d.ticket)
      ]);
      for (const t of removedDemoTickets) {
        recordedDealTickets.delete(t);
      }
      persisted.entries = persisted.entries.filter(e => !e.demo);
      persisted.mt5HistoryDeals = persisted.mt5HistoryDeals.filter(d => !d.demo);
      mt5State.connected = false;
      mt5State.status = 'disconnected';
      mt5State.activePositions = [];
      mt5State.activeSide = null;
      mt5State.floatingProfit = 0;
      mt5State.netFloating = 0;
      mt5State.floatingProfitIdr = 0;
      mt5State.lastUpdated = stamp;
      await queueSave();
      const summary = getSummary();
      emitSafe({ type: 'mt5_state', state: getStatus(), demo: true });
      emitSafe({ type: 'finance_updated', summary, demo: true });
      return { ok: true, phase: 'reset', mt5: getStatus(), summary, analytics: getMt5Analytics({ days: 30 }) };
    }

    if (phase === 'seed-analytics') {
      // Hapus seed demo sebelumnya agar pemanggilan berulang idempoten tanpa duplikasi
      const seedPrefix = 'DEMO-SEED-';
      for (const t of [...recordedDealTickets]) {
        if (String(t).startsWith(seedPrefix)) recordedDealTickets.delete(t);
      }
      persisted.entries = persisted.entries.filter(e => !(e.demo && String(e.ticket || '').startsWith(seedPrefix)));
      persisted.mt5HistoryDeals = persisted.mt5HistoryDeals.filter(d => !(d.demo && String(d.ticket || '').startsWith(seedPrefix)));

      const baseMs = now();
      const seedSpecs = [
        { idx: '01', daysAgo: 9, symbol: 'XAUUSD', side: 'BUY', volume: 0.1, price: 2632.4, profit: 45.0, commission: -0.7, swap: 0.0 },
        { idx: '02', daysAgo: 8, symbol: 'EURUSD', side: 'SELL', volume: 0.2, price: 1.0842, profit: 28.5, commission: -1.0, swap: -0.2 },
        { idx: '03', daysAgo: 7, symbol: 'XAUUSD', side: 'SELL', volume: 0.1, price: 2641.1, profit: -22.0, commission: -0.7, swap: 0.0 },
        { idx: '04', daysAgo: 6, symbol: 'GBPUSD', side: 'BUY', volume: 0.15, price: 1.2965, profit: -14.5, commission: -0.8, swap: -0.1 },
        { idx: '05', daysAgo: 5, symbol: 'XAUUSD', side: 'BUY', volume: 0.15, price: 2655.8, profit: 64.0, commission: -1.0, swap: 0.5 },
        { idx: '06', daysAgo: 4, symbol: 'USDJPY', side: 'BUY', volume: 0.2, price: 153.45, profit: 31.2, commission: -1.0, swap: 0.8 },
        { idx: '07', daysAgo: 3, symbol: 'BTCUSD', side: 'BUY', volume: 0.05, price: 91250.0, profit: 52.0, commission: -1.2, swap: -0.5 },
        { idx: '08', daysAgo: 2, symbol: 'EURUSD', side: 'BUY', volume: 0.2, price: 1.0815, profit: -18.0, commission: -1.0, swap: 0.0 },
        { idx: '09', daysAgo: 1, symbol: 'XAUUSD', side: 'SELL', volume: 0.1, price: 2662.0, profit: 38.4, commission: -0.7, swap: -0.2 },
        { idx: '10', daysAgo: 0, symbol: 'GBPUSD', side: 'SELL', volume: 0.15, price: 1.3012, profit: 29.0, commission: -0.8, swap: 0.0 }
      ];

      const seededDeals = [];
      for (const sp of seedSpecs) {
        const ticket = `${seedPrefix}${sp.idx}`;
        const dealTime = new Date(baseMs - sp.daysAgo * 86400 * 1000 - 3600 * 1000).toISOString();
        const netProfit = round2(sp.profit - Math.abs(sp.commission) + sp.swap);
        const up = upsertHistoryDeal(
          {
            ticket,
            position_id: ticket,
            symbol: sp.symbol,
            side: sp.side,
            entry: 'out',
            volume: sp.volume,
            price: sp.price,
            profit: sp.profit,
            commission: sp.commission,
            swap: sp.swap,
            net_profit: netProfit,
            comment: 'Demo Analytics Seed',
            time: dealTime,
            demo: true
          },
          dealTime,
          'USD'
        );
        if (up?.deal) seededDeals.push(up.deal);
        recordedDealTickets.add(ticket);

        const isProfit = netProfit >= 0;
        const amountOriginal = round2(Math.abs(netProfit));
        const amountIdr = Math.max(1, Math.round(amountOriginal * usdRate));
        persisted.entries.push({
          id: 'fin_' + crypto.randomBytes(6).toString('hex'),
          source: 'mt5',
          type: isProfit ? 'income' : 'expense',
          category: isProfit ? 'profit' : 'loss',
          amountIdr,
          amountOriginal,
          currency: 'USD',
          note: `[Simulasi Demo] MT5 ${sp.side} ${sp.symbol} (${isProfit ? '+' : '-'}$${amountOriginal})`,
          symbol: sp.symbol,
          side: sp.side,
          ticket,
          date: dealTime,
          createdAt: stamp,
          demo: true
        });
      }

      mt5State.connected = true;
      mt5State.readonly = true;
      mt5State.status = 'idle';
      mt5State.currency = 'USD';
      mt5State.reason = 'demo_simulation';
      mt5State.error = null;
      mt5State.lastUpdated = stamp;

      await queueSave();
      const summary = getSummary();
      const analytics = getMt5Analytics({ days: 30 });
      emitSafe({ type: 'mt5_state', state: getStatus(), demo: true });
      emitSafe({ type: 'finance_updated', summary, demo: true });
      return {
        ok: true,
        phase: 'seed-analytics',
        seededCount: seededDeals.length,
        deals: seededDeals,
        mt5: getStatus(),
        summary,
        analytics
      };
    }

    if (phase === 'open') {
      const floating = round2(Number(rawPayload.profitUsd ?? 18.5));
      const demoPos = {
        ticket: 'DEMO-' + String(now()).slice(-6),
        symbol,
        side,
        volume: round2(Number(rawPayload.volume) || 0.1),
        price_open: symbol === 'XAUUSD' ? 2645.5 : 1.085,
        price_current: symbol === 'XAUUSD' ? 2647.35 : 1.0868,
        profit: floating,
        time: stamp,
        demo: true
      };
      mt5State.connected = true;
      mt5State.readonly = true;
      mt5State.status = 'trading';
      mt5State.activePositions = [demoPos];
      mt5State.activeSide = side;
      mt5State.floatingProfit = floating;
      mt5State.netFloating = floating;
      mt5State.floatingProfitIdr = Math.round(floating * usdRate);
      mt5State.currency = 'USD';
      mt5State.reason = 'demo_simulation';
      mt5State.error = null;
      mt5State.lastUpdated = stamp;

      emitSafe({ type: 'mt5_state', state: getStatus(), demo: true });
      return { ok: true, phase: 'open', position: demoPos, mt5: getStatus(), summary: getSummary() };
    }

    if (phase === 'close') {
      const prevPos = mt5State.activePositions[0] || {
        ticket: 'DEMO-' + String(now()).slice(-6),
        symbol,
        side,
        volume: 0.1
      };
      const profitUsd = round2(Number(rawPayload.profitUsd ?? 35.0));
      const dealTicket = 'DEAL-' + String(now()).slice(-6) + '-' + crypto.randomBytes(2).toString('hex');
      const deal = {
        ticket: dealTicket,
        position_id: prevPos.ticket,
        symbol: prevPos.symbol || symbol,
        side: prevPos.side || side,
        entry: 'out',
        volume: prevPos.volume || 0.1,
        price: prevPos.price_current || (symbol === 'XAUUSD' ? 2647.35 : 1.0868),
        profit: profitUsd,
        commission: 0,
        swap: 0,
        net_profit: profitUsd,
        comment: 'Demo Simulation Close',
        time: stamp,
        demo: true
      };

      mt5State.connected = true;
      mt5State.status = 'idle';
      mt5State.activePositions = [];
      mt5State.activeSide = null;
      mt5State.floatingProfit = 0;
      mt5State.netFloating = 0;
      mt5State.floatingProfitIdr = 0;
      mt5State.lastUpdated = stamp;

      upsertHistoryDeal(deal, stamp, 'USD');

      let entry = null;
      if (rawPayload.recordLedger !== false) {
        const isProfit = profitUsd >= 0;
        const amountOriginal = round2(Math.abs(profitUsd));
        const amountIdr = Math.round(amountOriginal * usdRate);
        entry = {
          id: 'fin_' + crypto.randomBytes(6).toString('hex'),
          source: 'mt5',
          type: isProfit ? 'income' : 'expense',
          category: isProfit ? 'profit' : 'loss',
          amountIdr: Math.max(1, amountIdr),
          amountOriginal,
          currency: 'USD',
          note: `[Simulasi Demo] MT5 ${deal.side} ${deal.symbol} (${isProfit ? '+' : '-'}$${amountOriginal})`,
          symbol: deal.symbol,
          side: deal.side,
          ticket: dealTicket,
          date: stamp,
          createdAt: stamp,
          demo: true
        };
        recordedDealTickets.add(dealTicket);
        persisted.entries.push(entry);
      }
      await queueSave();

      const summary = getSummary();
      emitSafe({ type: 'mt5_state', state: getStatus(), demo: true });
      emitSafe({ type: 'mt5_deal_closed', deal, entry, summary, demo: true });
      return { ok: true, phase: 'close', deal, entry, mt5: getStatus(), summary };
    }

    throw httpError(400, 'invalid_demo_phase', 'Phase simulasi demo harus open, close, seed-analytics, atau reset');
  }

  async function getDemoStore() {
    if (!demoStore) demoStore = createMt5FinanceStore({ dataDir, root, now, demoMode: true,
      onEvent: event => emitSafe({ ...event, demo: true }) });
    return demoStore;
  }

  async function simulateDemoTrade(payload) {
    assertReadOnlyPayload(payload);
    if (demoMode) return simulateDemoTradeInner(payload);
    return (await getDemoStore()).simulateDemoTrade(payload);
  }

  async function stop() {
    stopped = true;
    if (pollTimer) clearInterval(pollTimer);
    await sync.stop();
    await snapshotQueue;
    if (demoStore) await (await demoStore).stop();
    await writeQueue;
  }

  const ready = (!demoMode && !bridgeRunner ? sync.detect() : Promise.resolve())
    .then(() => stopped ? null : applyPollTimer()).catch(() => {});

  return {
    assertReadOnlyPayload,
    getStatus,
    getDemoStore,
    testNow,
    ready,
    getMt5Status: getStatus,
    refresh,
    refreshMt5: refresh,
    updateConfig,
    updateMt5Config: updateConfig,
    getSummary,
    getLedger,
    addEntry,
    deleteEntry,
    simulateDemoTrade,
    getMt5Analytics,
    exportMt5AnalyticsCsv,
    stop
  };
}

module.exports = {
  createMt5FinanceStore,
  assertReadOnlyPayload
};
