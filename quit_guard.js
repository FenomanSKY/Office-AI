// [Diubah oleh Gemini - 2026-11-21] Penjaga konfirmasi penutupan Office AI saat masih ada agen/pipeline aktif (teruji tanpa menjalankan OfficeAI.exe)
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const localeCache = new Map();

function loadLocaleStrings(language = 'en', rootDir = __dirname) {
  const norm = String(language || 'en').trim();
  const code = ['id', 'en', 'es', 'ja', 'zh-CN', 'ar'].includes(norm)
    ? norm
    : norm.toLowerCase().startsWith('id')
      ? 'id'
      : norm.toLowerCase().startsWith('es')
        ? 'es'
        : norm.toLowerCase().startsWith('ja')
          ? 'ja'
          : norm.toLowerCase().startsWith('zh')
            ? 'zh-CN'
            : norm.toLowerCase().startsWith('ar')
              ? 'ar'
              : 'en';
  const cacheKey = `${rootDir}::${code}`;
  if (localeCache.has(cacheKey)) return localeCache.get(cacheKey);
  const readJson = c => {
    try {
      return JSON.parse(fs.readFileSync(path.join(rootDir, 'locales', `${c}.json`), 'utf8'));
    } catch {
      return {};
    }
  };
  const fallback = readJson('en').setup15 || {};
  const chosen = code === 'en' ? fallback : { ...fallback, ...(readJson(code).setup15 || {}) };
  localeCache.set(cacheKey, chosen);
  return chosen;
}

function fmt(template, params = {}) {
  return String(template || '').replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}

/**
 * Evaluates whether closing Office AI should prompt the user because active agents
 * or Video Studio stages are still running. Never reads or exposes prompt contents.
 */
async function evaluateQuitConfirmation({
  active = null,
  skipQuitConfirm = false,
  language = 'en',
  rootDir = __dirname,
  showConfirmDialog,
  persistSkipQuitConfirm
} = {}) {
  const count = Number(active?.activeCount || 0);
  if (count <= 0 || Boolean(skipQuitConfirm)) {
    return { allowQuit: true, prompted: false, activeCount: count, savedSkip: false };
  }

  const strings = loadLocaleStrings(language, rootDir);
  const items = Array.isArray(active?.items) ? active.items : [];
  const names = items
    .slice(0, 5)
    .map(it => String(it?.label || it?.agentName || it?.kind || 'Agent').trim())
    .filter(Boolean);
  const extra = items.length > names.length ? ` (+${items.length - names.length})` : '';

  const title = strings.quitTitle || 'Agents are still running';
  const message = fmt(
    strings.quitMessage || '{count} agent(s) are still working. Close Office AI and stop all of them?',
    { count }
  );
  const detail = names.length
    ? fmt(strings.quitDetail || 'Active now: {names}. Any unfinished work will be marked interrupted.', {
        names: names.join(', ') + extra
      })
    : strings.quitDetailEmpty || 'Any unfinished work will be marked interrupted when stopped.';
  const confirmBtn = strings.quitConfirmBtn || 'Close and stop all';
  const cancelBtn = strings.quitCancelBtn || 'Keep open';
  const dontAsk = strings.quitDontAsk || "Don't ask again";

  if (typeof showConfirmDialog !== 'function') {
    return { allowQuit: true, prompted: false, activeCount: count, savedSkip: false };
  }

  const res = await showConfirmDialog({
    type: 'warning',
    title,
    message,
    detail,
    buttons: [confirmBtn, cancelBtn],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
    checkboxLabel: dontAsk,
    checkboxChecked: false
  });

  const confirmed = Number(res?.response) === 0;
  let savedSkip = false;
  if (confirmed && Boolean(res?.checkboxChecked) && typeof persistSkipQuitConfirm === 'function') {
    await persistSkipQuitConfirm(true).catch(() => {});
    savedSkip = true;
  }
  return {
    allowQuit: confirmed,
    prompted: true,
    activeCount: count,
    savedSkip
  };
}

module.exports = {
  evaluateQuitConfirmation,
  loadLocaleStrings
};
