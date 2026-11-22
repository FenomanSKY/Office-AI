/* [Diubah oleh Gemini - 2026-11-21] Antarmuka Office AI V14+V15+V20: Panel Dasbor YouTube Studio Manager Tertanam Utuh dengan Mode Tertanam (?embed=office), Jembatan Tema/Token Langsung, Auto-Dismiss Banner, & Status Sinkronisasi Segar/Basi */
'use strict';

window.OfficeYoutubeUI = {
  create(opts = {}) {
    const {
      dialog: openDialogFn,
      isDemo = () => true,
      before,
      onFocusZone,
      onSummaryUpdate,
      onOpenSetup
    } = opts;

    const $ = id => document.getElementById(id);
    const isLocalDemo = () => isDemo() || location.protocol === 'file:';
    const getToken = () => document.querySelector('meta[name="office-vault-token"]')?.content || '';

    const DASHBOARD_PAGES = [
      { hash: 'overview', labelKey: 'yt14.pageOverview' },
      { hash: 'compare', labelKey: 'yt14.pageCompare' },
      { hash: 'content', labelKey: 'yt14.pageContent' },
      { hash: 'schedule', labelKey: 'yt14.pageSchedule' },
      { hash: 'comments', labelKey: 'yt14.pageComments' },
      { hash: 'quota', labelKey: 'yt14.pageQuota' },
      { hash: 'manager', labelKey: 'yt14.pageManager' }
    ];

    const NOTICE_AUTO_DISMISS_MS = 4000;
    const SYNC_BUSY_TIMEOUT_MS = 30000;

    let activePanel = false;
    let generation = 0;
    let busy = false;
    let currentHash = 'overview';
    let notice = { text: '', kind: '' };
    let noticeTimer = null;
    let freshnessTimer = null;
    let mountedFrameOrigin = '';
    let iframeSync = { state: 'idle', syncedAt: null, busySince: 0, cacheMin: 15, error: '' };

    const state = {
      status: {
        running: false,
        managedByOffice: false,
        mode: 'stopped',
        port: 8765,
        origin: 'http://127.0.0.1:8765',
        url: 'http://127.0.0.1:8765/',
        serverAvailable: false,
        error: null,
        legacy: null
      },
      summary: {
        source: 'offline',
        running: false,
        managedByOffice: false,
        port: 8765,
        url: 'http://127.0.0.1:8765/',
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
      }
    };

    function el(tag, text, cls) {
      const node = document.createElement(tag);
      if (text !== undefined && text !== null) node.textContent = String(text);
      if (cls) node.className = Array.isArray(cls) ? cls.filter(Boolean).join(' ') : cls;
      return node;
    }

    function fmtCompact(n) {
      const val = Number(n);
      if (!Number.isFinite(val)) return '0';
      return I18n.number(val, { notation: 'compact', maximumFractionDigits: 1 });
    }

    function fmtShortTime(iso) {
      if (!iso) return '';
      try {
        return new Intl.DateTimeFormat(I18n.locale || 'en', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
      } catch {
        return '';
      }
    }

    async function req(method, url, body) {
      const headers = { 'X-Office-Token': getToken() };
      const init = { method, headers };
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
      const res = await fetch(url, init);
      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (!res.ok) {
        const msg = data?.error || data?.message || ('HTTP ' + res.status);
        throw new Error(t('v12.apiError', { message: msg }));
      }
      return data;
    }

    // [Diubah oleh Gemini - 2026-11-21] Kumpulkan token desain CSS Office AI terkini untuk diteruskan ke dasbor tertanam (?embed=office + postMessage)
    function collectOfficeThemePayload() {
      const rootEl = document.documentElement;
      const cs = getComputedStyle(rootEl);
      const read = name => (cs.getPropertyValue(name) || '').trim();
      const theme = rootEl.dataset.theme === 'dark' ? 'dark' : 'light';
      const motion = rootEl.dataset.motion === 'reduced' ? 'reduced' : 'normal';
      const tokens = {
        paper: read('--paper'),
        surface: read('--surface'),
        surfaceAlt: read('--surface-alt'),
        ink: read('--ink'),
        muted: read('--muted'),
        line: read('--line'),
        accent: read('--accent'),
        onAccent: read('--on-accent'),
        accentSoft: read('--accent-soft'),
        hover: read('--hover'),
        focus: read('--focus'),
        green: read('--green'),
        red: read('--red'),
        link: read('--link'),
        posBg: read('--v12-pos-bg'),
        posInk: read('--v12-pos-ink'),
        posLine: read('--v12-pos-line'),
        negBg: read('--v12-neg-bg'),
        negInk: read('--v12-neg-ink'),
        negLine: read('--v12-neg-line'),
        warnBg: read('--v12-warn-bg'),
        warnInk: read('--v12-warn-ink'),
        warnLine: read('--v12-warn-line'),
        neuBg: read('--v12-neu-bg'),
        neuInk: read('--v12-neu-ink'),
        neuLine: read('--v12-neu-line'),
        primaryBg: read('--v12-primary-bg'),
        primaryInk: read('--v12-primary-ink'),
        primaryHover: read('--v12-primary-hover'),
        rS: read('--r-s'),
        r: read('--r'),
        rL: read('--r-l'),
        sh1: read('--sh-1'),
        sh2: read('--sh-2'),
        font: read('--font'),
        uiSize: read('--ui-size')
      };
      return { theme, motion, tokens };
    }

    function getDashboardOrigin() {
      try {
        return new URL(state.status.url || state.status.origin || `http://127.0.0.1:${state.status.port}`).origin;
      } catch {
        return `http://127.0.0.1:${state.status.port || 8765}`;
      }
    }

    function buildEmbedUrl(rawBaseUrl, hash) {
      const cleanBase = String(rawBaseUrl || `http://127.0.0.1:${state.status.port || 8765}/`).split('#')[0].split('?')[0];
      const payload = collectOfficeThemePayload();
      const coreTokens = {
        paper: payload.tokens.paper,
        surface: payload.tokens.surface,
        surfaceAlt: payload.tokens.surfaceAlt,
        ink: payload.tokens.ink,
        muted: payload.tokens.muted,
        line: payload.tokens.line,
        accent: payload.tokens.accent,
        onAccent: payload.tokens.onAccent,
        accentSoft: payload.tokens.accentSoft,
        hover: payload.tokens.hover,
        focus: payload.tokens.focus,
        primaryBg: payload.tokens.primaryBg,
        primaryInk: payload.tokens.primaryInk,
        primaryHover: payload.tokens.primaryHover,
        posBg: payload.tokens.posBg,
        posInk: payload.tokens.posInk,
        posLine: payload.tokens.posLine,
        warnBg: payload.tokens.warnBg,
        warnInk: payload.tokens.warnInk,
        warnLine: payload.tokens.warnLine,
        negBg: payload.tokens.negBg,
        negInk: payload.tokens.negInk,
        negLine: payload.tokens.negLine
      };
      const params = new URLSearchParams();
      params.set('embed', 'office');
      params.set('theme', payload.theme);
      if (location.origin && /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d{1,5})?$/.test(location.origin)) {
        params.set('hostOrigin', location.origin);
      }
      params.set('tokens', JSON.stringify(coreTokens));
      return `${cleanBase}?${params.toString()}#${hash || 'overview'}`;
    }

    function postToDashboard(msg) {
      const frame = $('yt14DashboardFrame');
      if (!frame || !frame.contentWindow) return;
      try {
        frame.contentWindow.postMessage(msg, getDashboardOrigin());
      } catch {
        /* abaikan bila iframe belum siap */
      }
    }

    function pushThemeToIframe() {
      if (!activePanel || !state.status.running) return;
      const payload = collectOfficeThemePayload();
      postToDashboard({ type: 'office-yt-theme', ...payload });
    }

    function clearNoticeTimer() {
      if (noticeTimer) {
        clearTimeout(noticeTimer);
        noticeTimer = null;
      }
    }

    function setNotice(text, kind = '', { autoDismissMs = 0 } = {}) {
      clearNoticeTimer();
      notice = { text: text || '', kind: kind || '' };
      updateNoticeInPlace();
      if (notice.text && autoDismissMs > 0) {
        noticeTimer = setTimeout(() => {
          noticeTimer = null;
          notice = { text: '', kind: '' };
          updateNoticeInPlace();
        }, autoDismissMs);
      }
    }

    function applyStatus(raw) {
      if (!raw || typeof raw !== 'object') return;
      state.status = { ...state.status, ...raw };
    }

    function applySummary(raw) {
      if (!raw || typeof raw !== 'object') return;
      state.summary = {
        ...state.summary,
        ...raw,
        totals: { ...state.summary.totals, ...(raw.totals || {}) },
        channels: Array.isArray(raw.channels) ? raw.channels : state.summary.channels,
        loginWarnings: Array.isArray(raw.loginWarnings) ? raw.loginWarnings : state.summary.loginWarnings
      };
      if (raw.running !== undefined) state.status.running = Boolean(raw.running);
      if (raw.managedByOffice !== undefined) state.status.managedByOffice = Boolean(raw.managedByOffice);
      if (raw.url) state.status.url = raw.url;
      if (raw.port) state.status.port = raw.port;
      onSummaryUpdate?.(state.summary);
    }

    function ensureOfficePill() {
      let pill = $('yt14OfficePill');
      if (!pill) {
        const notify = $('notify');
        if (!notify) return null;
        pill = el('button', null, 'yt14-office-pill');
        pill.type = 'button';
        pill.id = 'yt14OfficePill';
        pill.hidden = true;
        pill.addEventListener('click', () => openYoutube());
        notify.append(pill);
      }
      return pill;
    }

    function updateOfficePill() {
      const pill = ensureOfficePill();
      if (!pill) return;
      if (isLocalDemo()) {
        pill.hidden = true;
        return;
      }
      const s = state.summary;
      const tot = s.totals || {};
      const warns = Array.isArray(s.loginWarnings) ? s.loginWarnings : [];
      const hasAnything = Boolean(s.running || tot.totalChannels > 0 || warns.length > 0 || s.newCommentsDetected > 0);
      if (!hasAnything) {
        pill.hidden = true;
        return;
      }

      pill.hidden = false;
      pill.replaceChildren();
      const dot = el('span', null, 'yt14-pill-dot');
      dot.setAttribute('aria-hidden', 'true');
      dot.dataset.state = warns.length > 0 ? 'warn' : s.running ? 'ok' : 'idle';

      const parts = [];
      parts.push(t('yt14.pillChannels', { count: tot.connectedChannels || 0 }));
      if (tot.subscribers > 0 || tot.totalViews > 0) {
        parts.push(t('yt14.pillAudience', { subs: fmtCompact(tot.subscribers || 0), views: fmtCompact(tot.totalViews || 0) }));
      }
      parts.push(t('yt14.pillQuota', { used: fmtCompact(tot.quotaUsed || 0), pct: tot.quotaMaxPct || 0 }));
      if (warns.length > 0) {
        parts.push(t('yt14.pillLoginWarn', { count: warns.length }));
      } else if (s.newCommentsDetected > 0) {
        parts.push(t('yt14.pillNewComments', { count: s.newCommentsDetected }));
      } else {
        parts.push(t('yt14.pillLoginOk'));
      }

      pill.dataset.warn = String(warns.length > 0);
      pill.append(dot, el('span', parts.join(' · ')));
      pill.setAttribute('aria-label', t('yt14.pillAria'));
    }

    function updateSidebar() {
      const badge = $('v13YoutubeBadge');
      if (badge) {
        if (isLocalDemo()) {
          badge.textContent = t('yt14.sidebarDemo');
          badge.dataset.state = 'idle';
        } else {
          const s = state.summary;
          const tot = s.totals || {};
          const warns = Array.isArray(s.loginWarnings) ? s.loginWarnings : [];
          if (warns.length > 0) {
            badge.textContent = t('yt14.sidebarLoginWarn', { count: warns.length });
            badge.dataset.state = 'hitl';
          } else if (s.running) {
            badge.textContent = t('yt14.sidebarLive', {
              channels: tot.connectedChannels || 0,
              pct: tot.quotaMaxPct || 0
            });
            badge.dataset.state = 'connected';
          } else if (state.status.error) {
            badge.textContent = t('yt14.sidebarError');
            badge.dataset.state = 'sell';
          } else if (!state.status.serverAvailable && state.status.lastCheckedAt) {
            badge.textContent = t('setup15.ytSidebarSetup');
            badge.dataset.state = 'idle';
          } else {
            badge.textContent = t('yt14.sidebarReady');
            badge.dataset.state = 'idle';
          }
        }
      }
      updateOfficePill();
    }

    async function fetchStatusAndSummary({ includeLive = false, checkComments = false, checkHealth = true } = {}) {
      if (isLocalDemo()) {
        updateSidebar();
        return;
      }
      const q = new URLSearchParams();
      if (includeLive) q.set('live', '1');
      if (checkComments) q.set('comments', '1');
      if (!checkHealth) q.set('health', '0');
      const [stRes, sumRes] = await Promise.all([
        req('GET', '/youtube/dashboard/status').catch(() => null),
        req('GET', '/youtube/dashboard/summary' + (q.toString() ? '?' + q.toString() : '')).catch(() => null)
      ]);
      if (stRes) applyStatus(stRes);
      if (sumRes) applySummary(sumRes);
      updateSidebar();
    }

    async function startDashboardServer() {
      if (busy || isLocalDemo()) return;
      busy = true;
      setNotice('', '');
      if (activePanel && $('panel')?.open) renderPanel();
      try {
        const res = await req('POST', '/youtube/dashboard/start', {});
        if (res?.status) applyStatus(res.status);
        if (!res?.ok) {
          if (res?.errorCode !== 'dashboard_not_found' && res?.errorCode !== 'dashboard_ambiguous') {
            setNotice(res?.error || t('yt14.startFailed'), 'error');
          }
        } else {
          await fetchStatusAndSummary({ includeLive: false, checkHealth: true, checkComments: false });
          // [Diubah oleh Gemini - 2026-11-21] Hilangkan otomatis banner sukses server (~4 detik) agar tidak menetap
          setNotice(res.alreadyRunning ? t('yt14.attachedOk') : t('yt14.startedOk'), 'ok', { autoDismissMs: NOTICE_AUTO_DISMISS_MS });
        }
      } catch (err) {
        setNotice(err.message, 'error');
      } finally {
        busy = false;
        updateSidebar();
        if (activePanel && $('panel')?.open) renderPanel();
      }
    }

    async function saveDashboardFolder(dirPath, autoStart = true) {
      if (busy || isLocalDemo()) return;
      busy = true;
      setNotice('', '');
      if (activePanel && $('panel')?.open) renderPanel();
      try {
        const res = await req('POST', '/youtube/dashboard/config', { dashboardDir: String(dirPath || '').trim() });
        if (res?.status) applyStatus(res.status);
        setNotice(t('setup15.savedOk'), 'ok', { autoDismissMs: NOTICE_AUTO_DISMISS_MS });
      } catch (err) {
        setNotice(err.message, 'error');
        busy = false;
        updateSidebar();
        if (activePanel && $('panel')?.open) renderPanel();
        return;
      }
      busy = false;
      updateSidebar();
      if (activePanel && $('panel')?.open) renderPanel();
      if (autoStart && state.status.serverAvailable && !state.status.running) {
        await startDashboardServer();
      }
    }

    async function stopOwnedServer() {
      if (busy || isLocalDemo() || !state.status.managedByOffice) return;
      busy = true;
      setNotice('', '');
      try {
        const res = await req('POST', '/youtube/dashboard/stop', {});
        if (res?.status) applyStatus(res.status);
        state.summary.running = false;
        state.summary.managedByOffice = false;
        mountedFrameOrigin = '';
        iframeSync = { state: 'idle', syncedAt: null, busySince: 0, cacheMin: 15, error: '' };
        setNotice(t('yt14.stoppedOk'), 'ok', { autoDismissMs: NOTICE_AUTO_DISMISS_MS });
      } catch (err) {
        setNotice(err.message, 'error');
      } finally {
        busy = false;
        updateSidebar();
        if (activePanel && $('panel')?.open) renderPanel();
      }
    }

    function updatePageNavInPlace() {
      const nav = $('yt14PageNav');
      if (!nav) return;
      for (const btn of nav.querySelectorAll('button[data-hash]')) {
        const active = btn.dataset.hash === currentHash;
        btn.setAttribute('aria-pressed', String(active));
        if (active) {
          btn.setAttribute('aria-current', 'page');
          btn.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        } else {
          btn.removeAttribute('aria-current');
        }
      }
    }

    function setIframePage(hash) {
      currentHash = hash || 'overview';
      const frame = $('yt14DashboardFrame');
      if (frame && state.status.running) {
        const noHash = (frame.src || buildEmbedUrl(state.status.url, currentHash)).split('#')[0];
        frame.src = `${noHash}#${currentHash}`;
        postToDashboard({ type: 'office-yt-nav', page: currentHash });
      }
      updatePageNavInPlace();
    }

    function computeSyncBadgeModel() {
      const s = iframeSync;
      const nowMs = Date.now();
      if (s.state === 'busy' && s.busySince && nowMs - s.busySince > SYNC_BUSY_TIMEOUT_MS) {
        s.state = s.syncedAt ? 'stale' : 'idle';
      }
      if (s.state === 'busy') {
        return { text: t('yt20.syncSyncing'), cls: ['v12-pill', 'warn', 'is-live'], state: 'busy' };
      }
      if (s.state === 'error') {
        return { text: t('yt20.syncError'), cls: ['v12-pill', 'neg'], state: 'error' };
      }
      if (s.state === 'partial') {
        return { text: t('yt20.syncPartial'), cls: ['v12-pill', 'warn'], state: 'partial' };
      }
      const refIso = s.syncedAt || state.summary.updatedAt;
      if (refIso) {
        const ageMin = Math.floor((nowMs - new Date(refIso).getTime()) / 60000);
        const limitMin = Math.max(1, Number(s.cacheMin || 15));
        if (s.state === 'stale' || (Number.isFinite(ageMin) && ageMin >= limitMin)) {
          return { text: t('yt20.syncStale', { mins: Math.max(1, ageMin) }), cls: ['v12-pill', 'warn'], state: 'stale' };
        }
        const tm = fmtShortTime(refIso);
        return { text: t('yt20.syncFresh', { time: tm || '—' }), cls: ['v12-pill', 'pos'], state: 'fresh' };
      }
      return { text: t('yt20.syncIdle'), cls: ['v12-pill'], state: 'idle' };
    }

    function buildToolbarContent(topBar) {
      topBar.replaceChildren();
      const st = state.status;
      const sum = state.summary;
      const tot = sum.totals || {};
      const warns = Array.isArray(sum.loginWarnings) ? sum.loginWarnings : [];

      const leftInfo = el('div', null, 'yt14-toolbar-left');
      const stPill = el('span', null, ['v12-pill', st.running ? 'pos' : st.mode === 'starting' || busy ? 'warn is-live' : st.error ? 'neg' : '']);
      stPill.id = 'yt14StatusPill';
      const dot = el('span', null, 'v12-pill-dot');
      dot.setAttribute('aria-hidden', 'true');
      const stLabel = isLocalDemo()
        ? t('yt14.statusDemo')
        : busy || st.mode === 'starting'
          ? t('yt14.statusStarting')
          : st.running
            ? st.managedByOffice
              ? t('yt14.statusManaged', { port: st.port })
              : t('yt14.statusAttached', { port: st.port })
            : t('yt14.statusStopped');
      stPill.append(dot, document.createTextNode(stLabel));
      leftInfo.append(stPill);

      if (!isLocalDemo() && st.running) {
        const syncMod = computeSyncBadgeModel();
        const syncPill = el('span', null, syncMod.cls);
        syncPill.id = 'yt20SyncPill';
        syncPill.dataset.syncState = syncMod.state;
        const sDot = el('span', null, 'v12-pill-dot');
        sDot.setAttribute('aria-hidden', 'true');
        syncPill.append(sDot, document.createTextNode(syncMod.text));
        leftInfo.append(
          syncPill,
          el('span', t('yt14.metricChannels', { connected: tot.connectedChannels || 0, total: tot.totalChannels || 0 }), 'v12-pill'),
          el('span', t('yt14.metricQuota', { used: I18n.number(tot.quotaUsed || 0), limit: I18n.number(tot.quotaLimit || 10000) }), ['v12-pill', (tot.quotaMaxPct || 0) >= 80 ? 'warn' : '']),
          el('span', warns.length > 0 ? t('yt14.metricLoginWarn', { count: warns.length }) : t('yt14.metricLoginOk'), ['v12-pill', warns.length > 0 ? 'warn' : 'pos'])
        );
      }

      const actions = el('div', null, 'v12-btn-row');
      if (!isLocalDemo()) {
        if (!st.running) {
          const startBtn = el('button', busy ? t('yt14.btnStarting') : t('yt14.btnStart'), ['v12-btn-compact', 'v12-btn-primary']);
          startBtn.type = 'button';
          startBtn.id = 'yt14StartBtn';
          startBtn.disabled = busy;
          startBtn.addEventListener('click', () => startDashboardServer());
          actions.append(startBtn);
        } else {
          const reloadBtn = el('button', t('yt14.btnReload'), ['v12-btn-compact', 'v12-btn-primary']);
          reloadBtn.type = 'button';
          reloadBtn.id = 'yt14ReloadBtn';
          reloadBtn.disabled = busy;
          reloadBtn.addEventListener('click', async () => {
            if (busy) return;
            busy = true;
            updateToolbarInPlace();
            try {
              await fetchStatusAndSummary({ includeLive: false, checkHealth: true, checkComments: false });
              postToDashboard({ type: 'office-yt-sync', fresh: false });
            } finally {
              busy = false;
              updateToolbarInPlace();
              updateWarnBannerInPlace();
            }
          });
          actions.append(reloadBtn);

          if (st.managedByOffice) {
            const stopBtn = el('button', t('yt14.btnStopOwned'), ['v12-btn-compact', 'v12-btn-danger']);
            stopBtn.type = 'button';
            stopBtn.id = 'yt14StopBtn';
            stopBtn.disabled = busy;
            stopBtn.addEventListener('click', () => stopOwnedServer());
            actions.append(stopBtn);
          }
        }
      }

      const studioBtn = el('button', t('v13.ytFocusStudioBtn'), 'v12-btn-compact');
      studioBtn.type = 'button';
      studioBtn.id = 'yt14FocusStudioBtn';
      studioBtn.addEventListener('click', () => {
        $('panel')?.close();
        onFocusZone?.('studio');
      });
      actions.append(studioBtn);

      topBar.append(leftInfo, actions);
    }

    function updateToolbarInPlace() {
      const topBar = $('yt14Toolbar');
      if (topBar) buildToolbarContent(topBar);
    }

    function updateNoticeInPlace() {
      const slot = $('yt20NoticeSlot');
      if (!slot) return;
      slot.replaceChildren();
      if (!notice.text) {
        slot.hidden = true;
        return;
      }
      slot.hidden = false;
      const note = el('div', null, ['v12-notice', 'yt20-notice', notice.kind || '']);
      note.id = 'yt20NoticeBanner';
      note.setAttribute('role', 'status');
      const txt = el('span', notice.text);
      const closeBtn = el('button', '×', 'yt20-notice-close');
      closeBtn.type = 'button';
      closeBtn.setAttribute('aria-label', t('yt20.dismissNotice'));
      closeBtn.addEventListener('click', () => setNotice('', ''));
      note.append(txt, closeBtn);
      slot.append(note);
    }

    function updateWarnBannerInPlace() {
      const slot = $('yt20WarnSlot');
      if (!slot) return;
      slot.replaceChildren();
      const warns = Array.isArray(state.summary.loginWarnings) ? state.summary.loginWarnings : [];
      if (warns.length === 0 || isLocalDemo()) {
        slot.hidden = true;
        return;
      }
      slot.hidden = false;
      const warnBanner = el('div', null, ['v12-notice', 'warn']);
      warnBanner.id = 'yt14LoginWarnBanner';
      warnBanner.setAttribute('role', 'status');
      const listTxt = warns
        .map(w => `${w.channelTitle} (${w.state}${w.daysLeft !== null ? ', ' + w.daysLeft + 'd' : ''})`)
        .join(', ');
      warnBanner.textContent = t('yt14.loginWarnDetail', { list: listTxt });
      slot.append(warnBanner);
    }

    function showDialogShell() {
      const dlg = $('panel');
      const content = $('panelContent');
      if (dlg) dlg.classList.add('yt14-full-dialog');
      if (typeof openDialogFn === 'function') {
        openDialogFn(t('yt14.title'));
      } else {
        const titleEl = $('panelTitle');
        if (titleEl) titleEl.textContent = t('yt14.title');
        if (content) content.replaceChildren();
        if (dlg && !dlg.open) dlg.showModal();
      }
      if (dlg) dlg.classList.add('yt14-full-dialog');
      if (content) {
        content.classList.remove('quality-panel');
        content.classList.add('v12-panel', 'yt14-panel');
      }
    }

    function renderPanel({ forceRebuild = false } = {}) {
      const content = $('panelContent');
      if (!content) return;
      const st = state.status;
      const sum = state.summary;
      const targetOrigin = getDashboardOrigin();

      // [Diubah oleh Gemini - 2026-11-21] Jangan hancurkan iframe yang sudah aktif saat hanya memperbarui toolbar/banner/tab
      const existingFrame = $('yt14DashboardFrame');
      if (!forceRebuild && !isLocalDemo() && st.running && existingFrame && mountedFrameOrigin === targetOrigin) {
        content.classList.remove('is-scrollable');
        updateToolbarInPlace();
        updateNoticeInPlace();
        updateWarnBannerInPlace();
        updatePageNavInPlace();
        pushThemeToIframe();
        return;
      }

      mountedFrameOrigin = '';
      content.replaceChildren();
      content.classList.add('v12-panel', 'yt14-panel');
      content.classList.toggle('is-scrollable', isLocalDemo() || !st.running);

      // Bilah status & kontrol dasbor bergaya Office AI
      const topBar = el('section', null, 'yt14-toolbar');
      topBar.id = 'yt14Toolbar';
      buildToolbarContent(topBar);
      content.append(topBar);

      const noticeSlot = el('div', null, 'yt20-slot');
      noticeSlot.id = 'yt20NoticeSlot';
      content.append(noticeSlot);
      updateNoticeInPlace();

      const warnSlot = el('div', null, 'yt20-slot');
      warnSlot.id = 'yt20WarnSlot';
      content.append(warnSlot);
      updateWarnBannerInPlace();

      if (isLocalDemo()) {
        const demoBox = el('section', null, ['v12-section', 'yt14-placeholder']);
        demoBox.id = 'yt14DemoNotice';
        demoBox.append(
          el('h3', t('yt14.demoHeading')),
          el('p', t('yt14.demoBody')),
          el('p', t('yt14.urlHint', { url: st.url || 'http://127.0.0.1:8765/' }), 'v12-muted')
        );
        content.append(demoBox);
        return;
      }

      // Pembungkus terpadu Office AI: tab garis bawah + ruang kerja iframe tanpa gulir bersarang
      if (st.running) {
        const shell = el('div', null, 'yt20-embed-shell');
        shell.id = 'yt20FrameShell';

        const navBar = el('nav', null, ['yt14-page-nav', 'yt20-tabs']);
        navBar.id = 'yt14PageNav';
        navBar.setAttribute('aria-label', t('yt14.navAria'));
        for (const p of DASHBOARD_PAGES) {
          const btn = el('button', t(p.labelKey), 'yt20-tab');
          btn.type = 'button';
          btn.dataset.hash = p.hash;
          const active = currentHash === p.hash;
          btn.setAttribute('aria-pressed', String(active));
          if (active) btn.setAttribute('aria-current', 'page');
          btn.addEventListener('click', () => setIframePage(p.hash));
          navBar.append(btn);
        }
        shell.append(navBar);

        const frameWrap = el('div', null, 'yt14-frame-wrap');
        const iframe = el('iframe', null, 'yt14-iframe');
        iframe.id = 'yt14DashboardFrame';
        iframe.title = t('yt14.iframeTitle');
        iframe.referrerPolicy = 'no-referrer';
        iframe.addEventListener('load', () => {
          pushThemeToIframe();
        });
        iframe.src = buildEmbedUrl(st.url || `http://127.0.0.1:${st.port}/`, currentHash);
        mountedFrameOrigin = targetOrigin;
        frameWrap.append(iframe);
        shell.append(frameWrap);
        content.append(shell);
      } else {
        // Keadaan kosong / offline V15 tetap dipertahankan penuh
        const offBox = el('section', null, ['v12-section', 'yt14-placeholder', 'yt15-setup-box']);
        offBox.id = 'yt14OfflineBox';
        const isMissing = !st.serverAvailable && !busy;
        const isAmbig = st.errorCode === 'dashboard_ambiguous' || Boolean(st.needsConfirmation);
        offBox.append(
          el('h3', busy ? t('yt14.startingHeading') : isAmbig ? t('setup15.ytAmbiguousTitle') : isMissing ? t('setup15.ytEmptyTitle') : t('yt14.offlineHeading')),
          el('p', isAmbig ? t('setup15.ytAmbiguousBody') : isMissing ? t('setup15.ytEmptyWhat') : (st.error || t('yt14.offlineBody')))
        );

        if (!busy && !isMissing && st.error) {
          offBox.append(el('p', t('setup15.ytErrOfflineHint'), 'v12-muted'));
        }

        if (Array.isArray(st.dashboardCandidates) && st.dashboardCandidates.length > 0) {
          const cWrap = el('div', null, 'setup15-candidates');
          cWrap.append(el('small', t(isAmbig ? 'setup15.ytAmbiguousBody' : 'setup15.candidatesHint'), 'v12-muted'));
          const cRow = el('div', null, 'v12-btn-row');
          for (const cand of st.dashboardCandidates) {
            const cb = el('button', `${cand.name} — ${cand.displayPath}`, ['v12-btn-compact', 'v12-btn-primary']);
            cb.type = 'button';
            cb.disabled = busy;
            cb.addEventListener('click', () => saveDashboardFolder(cand.path, true));
            cRow.append(cb);
          }
          cWrap.append(cRow);
          offBox.append(cWrap);
        }

        const folderField = el('div', null, 'v12-field');
        folderField.append(el('label', t('setup15.ytFolderLabel')));
        const fRow = el('div', null, 'setup15-input-row');
        const fInput = el('input');
        fInput.type = 'text';
        fInput.id = 'yt15DashboardDirInput';
        fInput.value = st.dashboardDir || st.resolvedDashboardDir || '';
        fInput.placeholder = t('setup15.ytFolderPlaceholder');
        fRow.append(fInput);
        if (window.officeDesktop?.pickFolder) {
          const pickBtn = el('button', t('setup15.btnPickFolder'), 'v12-btn-compact');
          pickBtn.type = 'button';
          pickBtn.addEventListener('click', async () => {
            try {
              const r = await window.officeDesktop.pickFolder({ title: t('setup15.ytFolderLabel'), defaultPath: fInput.value });
              if (r && !r.canceled && r.path) {
                fInput.value = r.path;
                await saveDashboardFolder(r.path, true);
              }
            } catch {}
          });
          fRow.append(pickBtn);
        }
        const saveStartBtn = el('button', t('setup15.ytSaveAndStart'), ['v12-btn-compact', 'v12-btn-primary']);
        saveStartBtn.type = 'button';
        saveStartBtn.id = 'yt15SaveStartBtn';
        saveStartBtn.disabled = busy;
        saveStartBtn.addEventListener('click', () => saveDashboardFolder(fInput.value, true));
        fRow.append(saveStartBtn);
        if (typeof onOpenSetup === 'function') {
          const setupBtn = el('button', t('setup15.btnOpenSetup'), 'v12-btn-compact');
          setupBtn.type = 'button';
          setupBtn.id = 'yt15OpenSetupBtn';
          setupBtn.addEventListener('click', () => {
            close();
            onOpenSetup();
          });
          fRow.append(setupBtn);
        }
        folderField.append(fRow);
        offBox.append(folderField);

        if (isMissing) {
          const guide = el('div', null, 'yt15-install-guide');
          guide.id = 'yt15InstallGuide';
          guide.append(
            el('strong', t('setup15.ytInstallTitle')),
            el('p', t('setup15.ytInstallStep1')),
            el('p', t('setup15.ytInstallStep2')),
            el('p', t('setup15.ytInstallStep3'))
          );
          const repoRow = el('div', null, 'v12-btn-row');
          const repoUrl = st.repoUrl || 'https://github.com/FenomanSKY/YouTube-Studio-Manager';
          const urlCode = el('code', repoUrl);
          const copyBtn = el('button', t('setup15.btnCopy'), 'v12-btn-compact');
          copyBtn.type = 'button';
          copyBtn.addEventListener('click', () => {
            navigator.clipboard?.writeText?.(repoUrl).then(() => {
              copyBtn.textContent = t('setup15.copied');
              setTimeout(() => { copyBtn.textContent = t('setup15.btnCopy'); }, 1500);
            }).catch(() => {});
          });
          repoRow.append(urlCode, copyBtn);
          guide.append(repoRow);
          offBox.append(guide);
        }

        content.append(offBox);
      }

      // Catatan migrasi data Analisa YouTube V13 lama (baca-saja, ringkas)
      const legacy = sum.legacy || st.legacy;
      if (legacy) {
        const foot = el('div', null, 'yt14-legacy-foot');
        foot.id = 'yt14LegacyNote';
        foot.textContent = t('yt14.legacyNote', {
          date: legacy.lastRunDate || '—',
          snapshots: legacy.historyCount || 0,
          views: I18n.number(legacy.totalViews || 0)
        });
        content.append(foot);
      }
    }

    function startFreshnessTimer() {
      stopFreshnessTimer();
      freshnessTimer = setInterval(() => {
        if (activePanel && state.status.running && $('panel')?.open) {
          updateToolbarInPlace();
        }
      }, 15000);
    }

    function stopFreshnessTimer() {
      if (freshnessTimer) {
        clearInterval(freshnessTimer);
        freshnessTimer = null;
      }
    }

    async function openYoutube(initialHash) {
      before?.();
      const g = ++generation;
      activePanel = true;
      mountedFrameOrigin = '';
      if (initialHash) currentHash = String(initialHash).replace(/^#/, '');
      clearNoticeTimer();
      notice = { text: '', kind: '' };
      showDialogShell();
      renderPanel({ forceRebuild: true });
      startFreshnessTimer();
      if (!isLocalDemo()) {
        await fetchStatusAndSummary({ includeLive: false, checkHealth: false, checkComments: false });
        if (g !== generation || !activePanel || !$('panel')?.open) return;
        if (!state.status.running) {
          // [Diubah oleh Gemini - 2026-11-21] Hanya auto-start saat serverAvailable; bila belum terpasang langsung tampilkan panduan V15 tanpa flash "Starting..."
          if (state.status.serverAvailable) {
            await startDashboardServer();
          } else if (g === generation && activePanel && $('panel')?.open) {
            renderPanel();
          }
        } else {
          await fetchStatusAndSummary({ includeLive: false, checkHealth: true, checkComments: false });
          if (g === generation && activePanel && $('panel')?.open) renderPanel();
        }
      }
    }

    function close() {
      generation++;
      activePanel = false;
      mountedFrameOrigin = '';
      clearNoticeTimer();
      stopFreshnessTimer();
      $('panel')?.classList.remove('yt14-full-dialog');
      $('panelContent')?.classList.remove('v12-panel', 'yt14-panel', 'is-scrollable');
    }

    async function refresh() {
      if (!isLocalDemo()) {
        await fetchStatusAndSummary({ includeLive: false, checkHealth: false, checkComments: false });
      } else {
        updateSidebar();
      }
      if (activePanel && $('panel')?.open) renderPanel();
    }

    function handleEvent(evt) {
      if (!evt || typeof evt !== 'object') return;
      if (evt.type === 'youtube_dashboard_status' && evt.status) {
        applyStatus(evt.status);
        updateSidebar();
        if (activePanel && $('panel')?.open) renderPanel();
      } else if (evt.type === 'youtube_dashboard_summary' && evt.summary) {
        applySummary(evt.summary);
        updateSidebar();
        if (activePanel && $('panel')?.open && !busy) {
          updateOfficePill();
          updateToolbarInPlace();
          updateWarnBannerInPlace();
        }
      } else if (evt.type === 'youtube_login_warning') {
        const exists = state.summary.loginWarnings.some(w => w.channel === evt.channel);
        if (!exists) {
          state.summary.loginWarnings.push({
            channel: evt.channel,
            channelTitle: evt.channelTitle || evt.channel,
            state: evt.state || 'expiring',
            daysLeft: evt.daysLeft ?? null,
            detail: evt.detail || ''
          });
        }
        updateSidebar();
        if (activePanel && $('panel')?.open) {
          updateToolbarInPlace();
          updateWarnBannerInPlace();
        }
      } else if (evt.type === 'youtube_new_comment') {
        state.summary.newCommentsDetected = (state.summary.newCommentsDetected || 0) + (Number(evt.count) || 1);
        updateSidebar();
      }
    }

    // [Diubah oleh Gemini - 2026-11-21] Terima status halaman & sinkronisasi dua arah dari iframe dasbor loopback
    window.addEventListener('message', e => {
      if (!activePanel || !state.status.running) return;
      if (e.origin !== getDashboardOrigin()) return;
      const msg = e.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'office-yt-ready') {
        pushThemeToIframe();
        if (msg.page && DASHBOARD_PAGES.some(p => p.hash === msg.page)) {
          currentHash = msg.page;
          updatePageNavInPlace();
        }
      } else if (msg.type === 'office-yt-state') {
        if (msg.page) {
          if (DASHBOARD_PAGES.some(p => p.hash === msg.page)) {
            currentHash = msg.page;
          } else {
            currentHash = msg.page;
          }
          updatePageNavInPlace();
        }
        if (msg.syncState) {
          const prevState = iframeSync.state;
          iframeSync = {
            state: msg.syncState,
            syncedAt: msg.syncedAt || iframeSync.syncedAt,
            busySince: msg.syncState === 'busy' ? (prevState === 'busy' ? iframeSync.busySince : Date.now()) : 0,
            cacheMin: Number(msg.cacheMin || iframeSync.cacheMin || 15),
            error: msg.syncError || ''
          };
          updateToolbarInPlace();
        }
      }
    });

    // [Diubah oleh Gemini - 2026-11-21] Sinkronisasi tema terang/gelap/motion Office AI ke iframe secara instan tanpa reload
    window.OfficeSettings?.subscribe?.(() => {
      if (activePanel && state.status.running && $('panel')?.open) {
        pushThemeToIframe();
      }
    });
    if (typeof MutationObserver === 'function') {
      const themeObs = new MutationObserver(() => {
        if (activePanel && state.status.running && $('panel')?.open) {
          pushThemeToIframe();
        }
      });
      themeObs.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme', 'data-text-size', 'data-motion']
      });
    }

    $('panel')?.addEventListener('close', () => {
      if (activePanel) close();
    });

    I18n.subscribe(() => {
      updateSidebar();
      if (activePanel && $('panel')?.open) {
        if ($('panelTitle')) $('panelTitle').textContent = t('yt14.title');
        const nav = $('yt14PageNav');
        if (nav) {
          for (const p of DASHBOARD_PAGES) {
            const btn = nav.querySelector(`button[data-hash="${p.hash}"]`);
            if (btn) btn.textContent = t(p.labelKey);
          }
          nav.setAttribute('aria-label', t('yt14.navAria'));
        }
        updateToolbarInPlace();
        updateNoticeInPlace();
        updateWarnBannerInPlace();
      }
    });

    updateSidebar();

    return {
      openYoutube,
      open: openYoutube,
      close,
      refresh,
      handleEvent,
      updateSidebar,
      setPage: setIframePage,
      pushTheme: pushThemeToIframe,
      getState: () => ({ status: { ...state.status }, summary: { ...state.summary }, sync: { ...iframeSync } }),
      get active() { return activePanel; }
    };
  }
};
