/* [Diubah oleh Codex - 2026-11-21] V17 net floating, freshness, connection diagnostics. */
/* [Diubah oleh Gemini - 2026-11-20] Antarmuka Office AI V12: Pemantau MT5 (Baca Saja), Laporan Keuangan Kantor, dan Alur Kerja Video Short */
'use strict';

window.OfficeV12UI = {
  create(opts = {}) {
    const {
      dialog: openDialogFn,
      isDemo = () => true,
      before,
      onDemoTrade,
      onMt5Demo,
      onWorkflowEvent,
      onWorkflowFocus,
      onFocusZone,
      onCameraPreset,
      onOpenSetup,
      onOpenPrompt
    } = opts;

    const $ = id => document.getElementById(id);
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const SOURCES = ['mt5', 'youtube', 'affiliate', 'freelance', 'other'];
    const STAGES = [
      { id: 'brief', persona: 'project-shepherd', hitl: false },
      { id: 'research', persona: 'reality-checker', hitl: false },
      { id: 'script', persona: 'technical-writer', hitl: true },
      { id: 'storyboard', persona: 'ui-designer', hitl: true },
      { id: 'render', persona: 'short-video-editing-coach', hitl: false },
      { id: 'qa_publish', persona: 'social-media-strategist', hitl: true }
    ];

    let activePanel = null; // null | 'finance' | 'shorts'
    let financeTab = 'mt5'; // 'mt5' | 'finance' | 'analytics'
    let analyticsDays = 30;
    let analyticsDemo = false;
    let analyticsSymbol = '';
    let sourceFilter = '';
    let selectedWorkflowId = null;
    let selectedStageId = null;
    let showComposer = false;
    let generation = 0;
    let mt5PushRevision = 0;
    let busyAction = false;
    let financeNotice = { text: '', kind: '' };
    let shortsNotice = { text: '', kind: '' };

    // Honest default state starting at Rp 0 with zero fake transactions or positions.
    const state = {
      mt5: {
        connected: false,
        status: 'disconnected',
        activePositions: [],
        activeSide: null,
        floatingProfit: 0,
        currency: 'USD',
        lastUpdated: null,
        error: null,
        config: {
          enabled: false,
          pollIntervalMs: 5000,
          pythonPath: '',
          terminalPath: '',
          usdToIdr: 16200
        }
      },
      mt5Analytics: {
        periodDays: 30,
        symbolFilter: '',
        currency: 'USD',
        usdToIdr: 16200,
        connected: false,
        lastUpdated: null,
        metrics: {
          totalTrades: 0, wins: 0, losses: 0, breakeven: 0, winRatePct: 0,
          grossProfit: 0, grossLoss: 0, netProfit: 0, netProfitIdr: 0,
          profitFactor: 0, avgWin: 0, avgLoss: 0, expectancy: 0,
          bestTrade: 0, worstTrade: 0, maxDrawdown: 0, maxDrawdownPct: 0
        },
        equityCurve: [],
        bySymbol: [],
        dailyHeatmap: [],
        deals: []
      },
      finance: {
        totalIncomeIdr: 0,
        totalLossIdr: 0,
        netBalanceIdr: 0,
        bySource: { mt5: 0, youtube: 0, affiliate: 0, freelance: 0, other: 0 },
        bySourceDetail: {},
        entryCount: 0,
        entries: []
      },
      shorts: {
        stagesCatalog: STAGES,
        workflows: [],
        actionLog: [],
        workspace: {
          configured: false,
          valid: false,
          rootName: '',
          localProjectDir: '',
          hasRootAgents: false,
          channels: [],
          rulesSummary: [],
          rulesCount: 0,
          syncedAt: null
        },
        config: {
          localProjectDir: '',
          defaultChannel: '',
          geminiModel: 'gemini-2.5-flash',
          hasGeminiKey: false,
          keyHint: '',
          autoApprove: false
        }
      }
    };

    // Separate in-memory Demo state (starts at Rp 0, zero fake entries until user clicks simulate/add).
    let demoSeq = 1;
    const demoState = {
      mt5: {
        connected: false,
        status: 'demo',
        activePositions: [],
        activeSide: null,
        floatingProfit: 0,
        currency: 'USD',
        lastUpdated: null,
        error: null,
        config: {
          enabled: false,
          pollIntervalMs: 5000,
          pythonPath: '',
          terminalPath: '',
          usdToIdr: 16200
        }
      },
      mt5Deals: [],
      entries: [],
      workflows: [],
      actionLog: [],
      workspace: {
        configured: true,
        valid: true,
        rootName: 'Demo Workspace',
        localProjectDir: '',
        hasRootAgents: true,
        channels: [
          {
            name: 'DemoStudio',
            hasAgentsMd: true,
            hasLearningsMd: true,
            activeReels: [
              { slug: '01-infinite-money', hasScript: true, hasStoryboard: true, hasQaReport: true },
              { slug: '02-paradox-choice', hasScript: true, hasStoryboard: false, hasQaReport: false }
            ]
          },
          {
            name: 'ExplainerLab',
            hasAgentsMd: true,
            hasLearningsMd: true,
            activeReels: [
              { slug: '01-bias-kognitif', hasScript: true, hasStoryboard: true, hasQaReport: false }
            ]
          },
          {
            name: 'StoryLab',
            hasAgentsMd: true,
            hasLearningsMd: true,
            activeReels: []
          }
        ],
        rulesSummary: [
          'Hook wajib di 3 detik pertama dengan kontras fakta terukur.',
          'Maksimal 5 kata per layar subtitle, aman dari tombol UI Shorts.',
          'Setiap klaim angka wajib lolos cek fakta Reality Checker.',
          'Upload selalu menunggu persetujuan HITL Bos (autoApprove: false).'
        ],
        rulesCount: 4,
        syncedAt: null
      },
      shortsConfig: {
        localProjectDir: '',
        defaultChannel: '',
        geminiModel: 'gemini-2.5-flash',
        hasGeminiKey: false,
        keyHint: '',
        autoApprove: false
      }
    };

    const emitDemoTrade = payload => {
      onDemoTrade?.(payload);
      onMt5Demo?.(payload);
    };
    const emitWorkflow = payload => {
      onWorkflowEvent?.(payload);
      onWorkflowFocus?.(payload);
    };
    const focusZone = zone => {
      onFocusZone?.(zone);
      onCameraPreset?.(zone);
    };

    const isLocalDemo = () => isDemo() || location.protocol === 'file:';
    const getToken = () => document.querySelector('meta[name="office-vault-token"]')?.content || '';

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

    function el(tag, text, cls) {
      const node = document.createElement(tag);
      if (text !== undefined && text !== null) node.textContent = String(text);
      if (cls) node.className = cls;
      return node;
    }

    function svgEl(tag, attrs = {}) {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      return node;
    }

    function shieldSvg() {
      const s = svgEl('svg', { viewBox: '0 0 24 24', class: 'ic', 'aria-hidden': 'true' });
      s.append(
        svgEl('path', { d: 'M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z' }),
        svgEl('path', { d: 'M9.5 12l1.8 1.8L15 10' })
      );
      return s;
    }

    // [Diubah oleh Gemini - 2026-11-20] Format mata uang bebas drift kurs (pakai usdToIdr store untuk tampilan USD 2 desimal, IDR literal untuk kolom Net (IDR), & nominal asli USD pada Buku Besar)
    function activeUsdToIdr() {
      const cfgRate = isLocalDemo()
        ? Number(demoState.mt5.config.usdToIdr)
        : Number(state.finance.usdToIdr || state.mt5.config.usdToIdr);
      return Number.isFinite(cfgRate) && cfgRate >= 100 ? cfgRate : 16200;
    }

    function detectDisplayCurrency() {
      const sample = String(I18n.moneyIDR(16000) || '');
      if (/IDR|Rp/i.test(sample)) return 'IDR';
      if (/USD|\$/.test(sample)) return 'USD';
      if (/EUR|€/.test(sample)) return 'EUR';
      if (/CNY|CN¥/.test(sample)) return 'CNY';
      if (/JPY|¥|￥/.test(sample)) return 'JPY';
      return 'IDR';
    }

    function fmtIdrLiteral(amount, signed = false) {
      if (amount == null) return t('mt5v17.na');
      const n = Number(amount);
      if (!Number.isFinite(n)) return '—';
      const rounded = Math.round(n);
      if (rounded === 0) return I18n.currency(0, 'IDR', { maximumFractionDigits: 0 });
      const sign = rounded < 0 ? '-' : (signed ? '+' : '');
      return sign + I18n.currency(Math.abs(rounded), 'IDR', { maximumFractionDigits: 0 });
    }

    function fmtRpExact(amount) {
      const n = Number(amount);
      if (!Number.isFinite(n)) return '—';
      const cur = detectDisplayCurrency();
      if (cur === 'USD') {
        const usd = n / activeUsdToIdr();
        const absUsd = Math.abs(usd);
        const formatted = I18n.currency(absUsd, 'USD', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return usd < -0.004 ? '-' + formatted : formatted;
      }
      if (cur === 'IDR') {
        return fmtIdrLiteral(n, false);
      }
      const abs = Math.abs(Math.round(n));
      const dec = cur === 'JPY' ? 0 : 2;
      const formatted = I18n.moneyIDR(abs, { minimumFractionDigits: dec, maximumFractionDigits: dec });
      if (n < 0) return '-' + formatted;
      return formatted;
    }

    function fmtSignedRp(amount) {
      const n = Number(amount);
      if (!Number.isFinite(n)) return '—';
      const cur = detectDisplayCurrency();
      if (cur === 'USD') {
        const usd = n / activeUsdToIdr();
        if (Math.abs(usd) < 0.005) return I18n.currency(0, 'USD', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const sign = usd > 0 ? '+' : '-';
        return sign + I18n.currency(Math.abs(usd), 'USD', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
      if (cur === 'IDR') {
        return fmtIdrLiteral(n, true);
      }
      if (Math.round(n) === 0) return I18n.moneyIDR(0, { maximumFractionDigits: cur === 'JPY' ? 0 : 2 });
      const sign = n > 0 ? '+' : '-';
      const dec = cur === 'JPY' ? 0 : 2;
      return sign + I18n.moneyIDR(Math.abs(Math.round(n)), { minimumFractionDigits: dec, maximumFractionDigits: dec });
    }

    function fmtLedgerAmount(row) {
      const isExp = row?.type === 'expense';
      const sign = isExp ? -1 : 1;
      const orig = Number(row?.amountOriginal);
      const origCur = String(row?.currency || '').toUpperCase();
      if (row?.source === 'mt5' && origCur && Number.isFinite(orig)) return fmtUsd(sign * Math.abs(orig), origCur);
      if (origCur === 'USD' && Number.isFinite(orig) && orig > 0 && detectDisplayCurrency() === 'USD') {
        return fmtUsd(sign * Math.abs(orig), 'USD');
      }
      return fmtSignedRp(sign * Math.abs(Number(row?.amountIdr) || 0));
    }

    function fmtUsd(amount, cur = 'USD') {
      const n = Number(amount);
      if (!Number.isFinite(n)) return '—';
      const sign = n > 0 ? '+' : n < 0 ? '-' : '';
      const val = I18n.number(Math.abs(n), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return sign + (cur === 'USD' ? '$' : cur + ' ') + val;
    }

    function todayISO() {
      const d = new Date();
      return [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0')
      ].join('-');
    }

    function sourceLabel(src) {
      const map = {
        mt5: 'v12.sourceMt5',
        youtube: 'v12.sourceYoutube',
        affiliate: 'v12.sourceAffiliate',
        freelance: 'v12.sourceFreelance',
        other: 'v12.sourceOther'
      };
      return t(map[src] || 'v12.sourceOther');
    }

    function computeDemoFinance() {
      let income = 0;
      let loss = 0;
      const bySource = { mt5: 0, youtube: 0, affiliate: 0, freelance: 0, other: 0 };
      const bySourceDetail = {};
      for (const k of SOURCES) bySourceDetail[k] = { incomeIdr: 0, lossIdr: 0, netIdr: 0, count: 0 };
      for (const e of demoState.entries) {
        const amt = Math.max(0, Math.round(Number(e.amountIdr) || 0));
        const src = SOURCES.includes(e.source) ? e.source : 'other';
        bySourceDetail[src].count++;
        if (e.type === 'expense') {
          loss += amt;
          bySource[src] -= amt;
          bySourceDetail[src].lossIdr += amt;
          bySourceDetail[src].netIdr -= amt;
        } else {
          income += amt;
          bySource[src] += amt;
          bySourceDetail[src].incomeIdr += amt;
          bySourceDetail[src].netIdr += amt;
        }
      }
      return {
        totalIncomeIdr: income,
        totalLossIdr: loss,
        netBalanceIdr: income - loss,
        bySource,
        bySourceDetail,
        entryCount: demoState.entries.length,
        entries: demoState.entries.slice().reverse()
      };
    }

    function normalizeMt5(raw) {
      if (!raw || typeof raw !== 'object') return state.mt5;
      // A delayed HTTP response must never rewind a newer streaming snapshot.
      const incomingAt = Date.parse(raw.lastUpdated || raw.last_updated || raw.fetched_at || '');
      const currentAt = Date.parse(state.mt5.lastUpdated || '');
      if (!raw.demo && Number.isFinite(currentAt) && (!Number.isFinite(incomingAt) || incomingAt < currentAt)) return state.mt5;
      const positions = Array.isArray(raw.activePositions)
        ? raw.activePositions
        : Array.isArray(raw.positions) ? raw.positions : [];
      const activeSide = raw.activeSide || positions[0]?.side || null;
      const status = raw.status || (positions.length ? 'trading' : raw.connected ? 'idle' : 'disconnected');
      return {
        ...raw,
        connected: Boolean(raw.connected),
        status,
        activePositions: positions,
        activeSide,
        floatingProfit: Number(raw.floatingProfit ?? raw.floating_profit ?? 0) || 0,
        currency: raw.currency || 'USD',
        lastUpdated: raw.lastUpdated || raw.last_updated || raw.fetched_at || null,
        error: raw.error || raw.reason || null,
        config: {
          ...state.mt5.config,
          ...(raw.config || {})
        }
      };
    }

    function normalizeFinance(summaryRaw, ledgerRaw) {
      const s = summaryRaw && typeof summaryRaw === 'object' ? summaryRaw : {};
      const entries = Array.isArray(ledgerRaw?.entries)
        ? ledgerRaw.entries
        : Array.isArray(ledgerRaw) ? ledgerRaw : state.finance.entries;
      const bySource = { mt5: 0, youtube: 0, affiliate: 0, freelance: 0, other: 0 };
      const bySourceDetail = {};
      for (const k of SOURCES) bySourceDetail[k] = { incomeIdr: 0, lossIdr: 0, netIdr: 0, count: 0 };
      if (s.bySourceDetail && typeof s.bySourceDetail === 'object') {
        for (const k of SOURCES) {
          const d = s.bySourceDetail[k];
          if (d && typeof d === 'object') {
            bySourceDetail[k] = {
              incomeIdr: Number(d.incomeIdr ?? 0) || 0,
              lossIdr: Number(d.lossIdr ?? 0) || 0,
              netIdr: Number(d.netIdr ?? 0) || 0,
              count: Number(d.count ?? 0) || 0
            };
          }
        }
      }
      if (s.bySource && typeof s.bySource === 'object') {
        for (const k of SOURCES) {
          const val = s.bySource[k];
          if (typeof val === 'number' && Number.isFinite(val)) bySource[k] = val;
          else if (val && typeof val === 'object') {
            bySource[k] = Number(val.net ?? val.netIdr ?? ((val.income || 0) - (val.expense || val.loss || 0))) || 0;
          }
        }
      }
      const totalIncomeIdr = Number(s.totalIncomeIdr ?? 0) || 0;
      const totalLossIdr = Number(s.totalLossIdr ?? 0) || 0;
      const netBalanceIdr = Number(s.netBalanceIdr ?? (totalIncomeIdr - totalLossIdr)) || 0;
      return {
        totalIncomeIdr,
        totalLossIdr,
        netBalanceIdr,
        bySource,
        bySourceDetail,
        entryCount: Number(s.entryCount ?? entries.length) || 0,
        unconvertedCount: Number(s.unconvertedCount) || 0,
        mt5ByCurrency: s.mt5ByCurrency || {},
        usdToIdr: Number(s.usdToIdr || state.mt5.config.usdToIdr || 16200) || 16200,
        entries
      };
    }

    function mapStageStatus(rawStatus) {
      if (rawStatus === 'ready') return 'active';
      if (rawStatus === 'working') return 'running';
      if (['pending', 'active', 'running', 'awaiting_approval', 'revision', 'done'].includes(rawStatus)) return rawStatus;
      return 'pending';
    }

    function mapWorkflowStatus(rawStatus, readyToPublish) {
      if (rawStatus === 'completed' && readyToPublish) return 'ready_to_publish';
      if (rawStatus === 'active') return 'in_progress';
      if (rawStatus === 'revision_requested') return 'revision';
      if (['draft', 'in_progress', 'awaiting_approval', 'revision', 'ready_to_publish', 'completed'].includes(rawStatus)) return rawStatus;
      return 'in_progress';
    }

    function normalizeWorkflow(raw) {
      if (!raw || typeof raw !== 'object') return null;
      const catalog = Array.isArray(state.shorts.stagesCatalog) && state.shorts.stagesCatalog.length
        ? state.shorts.stagesCatalog
        : STAGES;
      const stageMap = {};
      if (Array.isArray(raw.stages)) {
        for (const st of raw.stages) {
          if (st?.id) stageMap[st.id] = st;
        }
      } else if (raw.stages && typeof raw.stages === 'object') {
        Object.assign(stageMap, raw.stages);
      }
      const rawStageId = raw.currentStageId || raw.currentStage || raw.stage;
      const currentIndex = Number.isInteger(raw.currentStageIndex)
        ? raw.currentStageIndex
        : Math.max(0, catalog.findIndex(s => s.id === rawStageId));
      const currentStage = rawStageId || catalog[currentIndex]?.id || 'brief';
      const wfStatus = mapWorkflowStatus(raw.status, raw.readyToPublish);
      const stages = catalog.map((def, idx) => {
        const s = stageMap[def.id] || {};
        const hitl = Boolean(s.hitlGate ?? def.hitlGate ?? def.hitl);
        let status = s.status ? mapStageStatus(s.status) : null;
        if (!status) {
          if (wfStatus === 'completed' || wfStatus === 'ready_to_publish' || idx < currentIndex) status = 'done';
          else if (idx === currentIndex) {
            status = wfStatus === 'awaiting_approval' ? 'awaiting_approval'
              : wfStatus === 'revision' ? 'revision' : 'active';
          } else {
            status = 'pending';
          }
        }
        return {
          id: def.id,
          persona: s.persona || def.persona,
          hitl,
          status,
          output: s.output ?? raw.outputs?.[def.id] ?? '',
          feedback: s.feedback || '',
          engineUsed: s.engineUsed || null,
          revisionCount: Number(s.revisionCount || 0) || 0,
          updatedAt: s.updatedAt || null,
          exportPath: s.exportPath || raw.exportedDir || raw.exportPath || '',
          rulesApplied: Array.isArray(s.rulesApplied)
            ? s.rulesApplied
            : (Array.isArray(raw.rulesApplied) ? raw.rulesApplied : [])
        };
      });
      return {
        id: String(raw.id || 'wf-1'),
        title: String(raw.title || raw.topic || 'Short'),
        topic: String(raw.topic || raw.title || ''),
        channel: String(raw.channel || ''),
        mode: String(raw.mode || 'auto'),
        status: wfStatus,
        currentStage,
        currentStageIndex: currentIndex,
        autoApprove: false,
        stages,
        createdAt: raw.createdAt || null,
        updatedAt: raw.updatedAt || null,
        exportDir: raw.exportedDir || raw.exportDir || ''
      };
    }

    // [Diubah oleh Gemini - 2026-11-20] Normalisasi & perhitungan lokal Analisa Trading MT5 serta Sinkronisasi Workspace V13.
    function normalizeMt5Analytics(raw) {
      if (!raw || typeof raw !== 'object') return state.mt5Analytics;
      const m = raw.metrics && typeof raw.metrics === 'object' ? raw.metrics : {};
      return {
        periodDays: Number(raw.periodDays || analyticsDays) || 30,
        symbolFilter: String(raw.symbolFilter || ''),
        availableSymbols: Array.isArray(raw.availableSymbols) ? raw.availableSymbols : [],
        currency: raw.currency || state.mt5.currency || 'USD',
        usdToIdr: Number(raw.usdToIdr || state.mt5.config.usdToIdr || 16200) || 16200,
        connected: Boolean(raw.connected ?? state.mt5.connected),
        lastUpdated: raw.lastUpdated || state.mt5.lastUpdated || null,
        metrics: {
          totalTrades: Number(m.totalTrades || 0) || 0,
          wins: Number(m.wins || 0) || 0,
          losses: Number(m.losses || 0) || 0,
          breakeven: Number(m.breakeven || 0) || 0,
          winRatePct: Number(m.winRatePct || 0) || 0,
          grossProfit: Number(m.grossProfit || 0) || 0,
          grossLoss: Number(m.grossLoss || 0) || 0,
          netProfit: Number(m.netProfit || 0) || 0,
          netProfitIdr: m.netProfitIdr == null ? null : Number(m.netProfitIdr) || 0,
          profitFactor: m.profitFactor === null ? null : (Number(m.profitFactor || 0) || 0),
          avgWin: Number(m.avgWin || 0) || 0,
          avgLoss: Number(m.avgLoss || 0) || 0,
          expectancy: Number(m.expectancy || 0) || 0,
          bestTrade: Number(m.bestTrade || 0) || 0,
          worstTrade: Number(m.worstTrade || 0) || 0,
          maxDrawdown: Number(m.maxDrawdown || 0) || 0,
          maxDrawdownPct: Number(m.maxDrawdownPct || 0) || 0
        },
        equityCurve: Array.isArray(raw.equityCurve) ? raw.equityCurve : [],
        bySymbol: Array.isArray(raw.bySymbol) ? raw.bySymbol : [],
        dailyHeatmap: Array.isArray(raw.dailyHeatmap) ? raw.dailyHeatmap : [],
        deals: Array.isArray(raw.deals) ? raw.deals : []
      };
    }

    function normalizeWorkspace(raw) {
      if (!raw || typeof raw !== 'object') return state.shorts.workspace;
      const channels = Array.isArray(raw.channels)
        ? raw.channels.map(ch => {
          if (typeof ch === 'string') return { name: ch, hasAgentsMd: false, hasLearningsMd: false, activeReels: [] };
          return {
            name: String(ch.name || ch.id || ch.slug || ''),
            hasAgentsMd: Boolean(ch.hasAgentsMd ?? ch.hasAgents ?? ch.agentsExcerpt),
            hasLearningsMd: Boolean(ch.hasLearningsMd ?? ch.hasLearnings ?? ch.learningsExcerpt),
            activeReels: Array.isArray(ch.activeReels) ? ch.activeReels : []
          };
        }).filter(c => c.name)
        : [];
      const rulesSummary = Array.isArray(raw.rulesSummary) ? raw.rulesSummary : [];
      return {
        configured: Boolean(raw.configured),
        valid: Boolean(raw.valid ?? raw.configured),
        rootName: String(raw.rootName || ''),
        localProjectDir: String(raw.localProjectDir || ''),
        hasRootAgents: Boolean(raw.hasRootAgents),
        channels,
        rulesSummary,
        rulesCount: Number(raw.rulesCount ?? rulesSummary.length) || 0,
        syncedAt: raw.syncedAt || null
      };
    }

    function computeDemoMt5Analytics(days = analyticsDays, symFilter = analyticsSymbol) {
      const rate = Number(demoState.mt5.config.usdToIdr) || 16200;
      const cutoff = Date.now() - (Math.max(1, Number(days) || 30) * 86400000);
      const inPeriod = demoState.mt5Deals
        .filter(d => {
          const ts = Date.parse(d.time || (d.date + 'T12:00:00Z'));
          return !Number.isFinite(ts) || ts >= cutoff;
        })
        .sort((a, b) => String(a.time || a.date).localeCompare(String(b.time || b.date)));
      const availableSymbols = [...new Set(inPeriod.map(d => d.symbol).filter(Boolean))].sort();
      const filtered = symFilter ? inPeriod.filter(d => d.symbol === symFilter) : inPeriod;

      let wins = 0, losses = 0, breakeven = 0;
      let grossProfit = 0, grossLoss = 0, cumulative = 0, peak = 0, maxDd = 0, maxDdPct = 0;
      let bestTrade = 0, worstTrade = 0;
      const equityCurve = [];
      const symMap = new Map();
      const dayMap = new Map();

      filtered.forEach((d, idx) => {
        const net = Number(d.net_profit ?? d.profit ?? 0) || 0;
        const netIdr = Math.round(net * rate);
        if (net > 0) { wins++; grossProfit += net; }
        else if (net < 0) { losses++; grossLoss += Math.abs(net); }
        else breakeven++;
        if (idx === 0 || net > bestTrade) bestTrade = net;
        if (idx === 0 || net < worstTrade) worstTrade = net;
        cumulative = +(cumulative + net).toFixed(2);
        if (cumulative > peak) peak = cumulative;
        const dd = +(peak - cumulative).toFixed(2);
        if (dd > maxDd) {
          maxDd = dd;
          maxDdPct = peak > 0 ? +((dd / peak) * 100).toFixed(2) : (dd > 0 ? 100 : 0);
        }
        const dateStr = String(d.date || d.time || todayISO()).slice(0, 10);
        equityCurve.push({
          index: idx + 1,
          date: dateStr,
          time: d.time || (dateStr + 'T12:00:00Z'),
          ticket: d.ticket,
          symbol: d.symbol,
          side: d.side,
          delta: +net.toFixed(2),
          cumulative,
          cumulativeIdr: Math.round(cumulative * rate)
        });
        const sRec = symMap.get(d.symbol) || { symbol: d.symbol, trades: 0, wins: 0, losses: 0, netProfit: 0 };
        sRec.trades++;
        if (net > 0) sRec.wins++;
        else if (net < 0) sRec.losses++;
        sRec.netProfit = +(sRec.netProfit + net).toFixed(2);
        symMap.set(d.symbol, sRec);

        const dayRec = dayMap.get(dateStr) || { date: dateStr, trades: 0, wins: 0, losses: 0, netProfit: 0 };
        dayRec.trades++;
        if (net > 0) dayRec.wins++;
        else if (net < 0) dayRec.losses++;
        dayRec.netProfit = +(dayRec.netProfit + net).toFixed(2);
        dayMap.set(dateStr, dayRec);
      });

      const totalTrades = filtered.length;
      const netProfit = +(grossProfit - grossLoss).toFixed(2);
      const winRatePct = totalTrades ? +((wins / totalTrades) * 100).toFixed(2) : 0;
      const profitFactor = grossLoss > 0 ? +(grossProfit / grossLoss).toFixed(2) : (grossProfit > 0 ? null : 0);
      const avgWin = wins ? +(grossProfit / wins).toFixed(2) : 0;
      const avgLoss = losses ? +(grossLoss / losses).toFixed(2) : 0;
      const expectancy = totalTrades ? +(netProfit / totalTrades).toFixed(2) : 0;

      return {
        periodDays: days,
        symbolFilter: symFilter,
        availableSymbols,
        currency: 'USD',
        usdToIdr: rate,
        connected: demoState.mt5.connected,
        lastUpdated: demoState.mt5.lastUpdated,
        metrics: {
          totalTrades, wins, losses, breakeven, winRatePct,
          grossProfit: +grossProfit.toFixed(2),
          grossLoss: +grossLoss.toFixed(2),
          netProfit,
          netProfitIdr: Math.round(netProfit * rate),
          profitFactor,
          avgWin,
          avgLoss,
          expectancy,
          bestTrade: totalTrades ? +bestTrade.toFixed(2) : 0,
          worstTrade: totalTrades ? +worstTrade.toFixed(2) : 0,
          maxDrawdown: +maxDd.toFixed(2),
          maxDrawdownPct: +maxDdPct.toFixed(2)
        },
        equityCurve,
        bySymbol: [...symMap.values()].map(r => ({
          ...r,
          winRatePct: r.trades ? +((r.wins / r.trades) * 100).toFixed(1) : 0,
          netProfitIdr: Math.round(r.netProfit * rate)
        })).sort((a, b) => b.netProfit - a.netProfit),
        dailyHeatmap: [...dayMap.values()].map(r => ({
          ...r,
          netProfitIdr: Math.round(r.netProfit * rate)
        })).sort((a, b) => a.date.localeCompare(b.date)),
        deals: filtered.slice().reverse()
      };
    }

    function currentData() {
      if (isLocalDemo()) {
        return {
          mt5: { ...demoState.mt5, realizedToday: demoState.mt5Deals.filter(d => String(d.time).slice(0, 10) === new Date().toISOString().slice(0, 10)).reduce((n, d) => n + Number(d.netProfit ?? d.net_profit ?? 0), 0) },
          mt5Analytics: computeDemoMt5Analytics(analyticsDays, analyticsSymbol),
          finance: computeDemoFinance(),
          shorts: {
            workflows: demoState.workflows.map(normalizeWorkflow).filter(Boolean),
            actionLog: demoState.actionLog.slice().reverse(),
            workspace: demoState.workspace,
            config: demoState.shortsConfig
          }
        };
      }
      return {
        mt5: state.mt5,
        mt5Analytics: state.mt5Analytics,
        finance: state.finance,
        shorts: state.shorts
      };
    }

    function connectionText(mt5) {
      if (!mt5.config?.enabled && mt5.config?.autoSyncDecided) return t('mt5v17.disabled');
      if (mt5.connected) return t('mt5v17.connected');
      const keys = { mt5_unavailable: 'mt5v17.moduleMissing', account_not_logged_in: 'mt5v17.accountMissing',
        terminal_not_found: 'mt5v17.terminalMissing', snapshot_unavailable: 'mt5v17.waiting',
        terminal_not_running: 'mt5v17.waiting' };
      return t(keys[mt5.reason] || 'mt5v17.waiting');
    }

    function updateFreshness(mt5 = currentData().mt5) {
      const age = mt5.lastUpdated ? Math.max(0, Math.floor((Date.now() - Date.parse(mt5.lastUpdated)) / 1000)) : null;
      const fresh = age !== null && Date.now() - Date.parse(mt5.lastUpdated) <= 10000 && mt5.connected;
      for (const id of ['v17Mt5Freshness', 'v17SidebarFreshness']) {
        const node = $(id);
        if (!node) continue;
        node.textContent = (age === null ? t('mt5v17.neverUpdated') : t('mt5v17.updatedAgo', { seconds: age })) + ' · ' + t(fresh ? 'mt5v17.fresh' : 'mt5v17.stale');
        if (id === 'v17SidebarFreshness') node.textContent += ' · ' + connectionText(mt5);
        node.dataset.stale = String(!fresh);
        node.title = connectionText(mt5);
      }
    }

    setInterval(() => updateFreshness(), 1000);

    function updateSidebar() {
      const data = currentData();
      const mt5Badge = $('v12Mt5Badge');
      const netEl = $('v12NetBalance');
      const shortsBadge = $('v12ShortsBadge');

      if (mt5Badge) {
        const st = data.mt5.status;
        const side = data.mt5.activeSide;
        let label = connectionText(data.mt5);
        let visual = 'idle';
        if (st === 'trading' || (data.mt5.activePositions?.length > 0)) {
          label = t('mt5v17.floating') + ' · ' + (side || 'BUY');
          visual = side === 'SELL' ? 'sell' : 'trading';
        } else if (data.mt5.connected || st === 'idle') {
          label = t('mt5v17.realizedToday');
          visual = 'connected';
        } else if (isLocalDemo() || st === 'demo') {
          label = t('v12.mt5StatusDemo');
          visual = 'idle';
        }
        if (!data.mt5.activePositions?.length && !isLocalDemo()) label = t('mt5v17.realizedToday');
        mt5Badge.textContent = label;
        mt5Badge.title = connectionText(data.mt5);
        mt5Badge.dataset.state = visual;
      }

      if (netEl) {
        const open = data.mt5.activePositions?.length > 0;
        const net = open ? Number(data.mt5.netFloating ?? data.mt5.floatingProfit ?? 0) : Number(data.mt5.realizedToday || 0);
        netEl.textContent = fmtUsd(net, data.mt5.currency || 'USD');
        netEl.title = (open ? t('mt5v17.netFloating') : t('mt5v17.realizedToday'));
        netEl.classList.toggle('pos', net > 0);
        netEl.classList.toggle('neg', net < 0);
      }

      if (netEl && !$('v17SidebarFreshness')) {
        const age = el('span', null, 'v12-freshness');
        age.id = 'v17SidebarFreshness';
        netEl.parentElement.append(age);
      }
      updateFreshness(data.mt5);

      if (shortsBadge) {
        const wfs = data.shorts.workflows || [];
        const hitlCount = wfs.filter(w => w.status === 'awaiting_approval').length;
        const activeCount = wfs.filter(w => !['completed', 'ready_to_publish'].includes(w.status)).length;
        if (hitlCount > 0) {
          shortsBadge.textContent = t('v12.summaryWaitingHitl', { count: hitlCount });
          shortsBadge.dataset.state = 'hitl';
        } else {
          shortsBadge.textContent = t('v12.summaryActiveCount', { count: activeCount });
          shortsBadge.dataset.state = activeCount > 0 ? 'connected' : 'idle';
        }
      }
    }

    async function fetchFinanceLive() {
      const pushRevision = mt5PushRevision;
      const q = sourceFilter ? ('?source=' + encodeURIComponent(sourceFilter) + '&limit=100') : '?limit=100';
      const aq = '?days=' + encodeURIComponent(analyticsDays) + (analyticsDemo ? '&demo=1' : '') + (analyticsSymbol ? '&symbol=' + encodeURIComponent(analyticsSymbol) : '');
      const [mt5Res, sumRes, ledRes, anaRes] = await Promise.all([
        req('GET', '/mt5/status').catch(() => null),
        req('GET', '/finance/summary').catch(() => null),
        req('GET', '/finance/ledger' + q).catch(() => null),
        req('GET', '/mt5/analytics' + aq).catch(() => null)
      ]);
      const incomingMt5 = mt5Res || sumRes?.mt5;
      if (incomingMt5 && (pushRevision === mt5PushRevision || Date.parse(incomingMt5.lastUpdated || '') > Date.parse(state.mt5.lastUpdated || ''))) state.mt5 = normalizeMt5(incomingMt5);
      if (sumRes || ledRes) state.finance = normalizeFinance(sumRes, ledRes);
      if (anaRes) state.mt5Analytics = normalizeMt5Analytics(anaRes);
      updateSidebar();
    }

    async function fetchShortsLive() {
      const [res, cfg, wsRes] = await Promise.all([
        req('GET', '/workflows/shorts').catch(() => null),
        req('GET', '/workflows/config').catch(() => null),
        req('GET', '/workflows/workspace').catch(() => null)
      ]);
      if (res) {
        if (Array.isArray(res.stagesCatalog) && res.stagesCatalog.length) {
          state.shorts.stagesCatalog = res.stagesCatalog.map(s => ({
            id: s.id,
            persona: s.persona,
            hitl: Boolean(s.hitlGate ?? s.hitl)
          }));
        }
        const list = Array.isArray(res.workflows) ? res.workflows.map(normalizeWorkflow).filter(Boolean) : [];
        state.shorts.workflows = list;
        state.shorts.actionLog = Array.isArray(res.actionLog) ? res.actionLog : [];
        if (res.config) state.shorts.config = { ...state.shorts.config, ...res.config, autoApprove: false };
      }
      if (cfg && typeof cfg === 'object') {
        state.shorts.config = { ...state.shorts.config, ...cfg, autoApprove: false };
      }
      if (wsRes && typeof wsRes === 'object') {
        state.shorts.workspace = normalizeWorkspace(wsRes);
      }
      updateSidebar();
    }

    // ===== Demo Simulation Logic (100% honest, zero fake pre-populated balances) =====
    function runDemoTrade(phase, side, profitUsd) {
      const rate = Number(demoState.mt5.config.usdToIdr) || 16200;
      const nowIso = new Date().toISOString();
      if (phase === 'reset') {
        demoState.entries = demoState.entries.filter(e => !e.demo);
        demoState.mt5Deals = demoState.mt5Deals.filter(d => !d.demo);
        demoState.mt5.connected = false;
        demoState.mt5.status = 'demo';
        demoState.mt5.activePositions = [];
        demoState.mt5.activeSide = null;
        demoState.mt5.floatingProfit = 0;
        demoState.mt5.netFloating = 0;
        demoState.mt5.lastUpdated = nowIso;
        const summary = computeDemoFinance();
        updateSidebar();
        emitDemoTrade({ phase: 'reset', mt5: demoState.mt5, summary });
        return;
      }
      if (phase === 'seed-analytics') {
        demoState.entries = demoState.entries.filter(e => !e.demo);
        demoState.mt5Deals = demoState.mt5Deals.filter(d => !d.demo);
        const samples = [
          { daysAgo: 9, symbol: 'XAUUSD', side: 'BUY', volume: 0.10, profit: 45.0, commission: -0.7, swap: 0 },
          { daysAgo: 8, symbol: 'EURUSD', side: 'SELL', volume: 0.20, profit: 28.4, commission: -1.4, swap: 0.2 },
          { daysAgo: 7, symbol: 'XAUUSD', side: 'SELL', volume: 0.10, profit: -19.5, commission: -0.7, swap: 0 },
          { daysAgo: 6, symbol: 'GBPUSD', side: 'BUY', volume: 0.15, profit: 36.2, commission: -1.0, swap: -0.3 },
          { daysAgo: 5, symbol: 'USDJPY', side: 'BUY', volume: 0.20, profit: -16.8, commission: -1.4, swap: 0.3 },
          { daysAgo: 4, symbol: 'XAUUSD', side: 'BUY', volume: 0.15, profit: 64.5, commission: -1.0, swap: 0 },
          { daysAgo: 3, symbol: 'BTCUSD', side: 'BUY', volume: 0.05, profit: 41.0, commission: -0.8, swap: -0.4 },
          { daysAgo: 2, symbol: 'EURUSD', side: 'BUY', volume: 0.20, profit: -14.2, commission: -1.4, swap: 0 },
          { daysAgo: 1, symbol: 'GBPUSD', side: 'SELL', volume: 0.15, profit: 31.8, commission: -1.0, swap: 0.1 },
          { daysAgo: 0, symbol: 'XAUUSD', side: 'BUY', volume: 0.10, profit: 34.4, commission: -0.7, swap: 0 }
        ];
        samples.forEach((s, i) => {
          const dt = new Date(Date.now() - s.daysAgo * 86400000);
          const iso = dt.toISOString();
          const net = +(s.profit + s.commission + s.swap).toFixed(2);
          const ticket = 'DEMO-' + (930001 + i);
          demoState.mt5Deals.push({
            ticket,
            time: iso,
            date: iso.slice(0, 10),
            symbol: s.symbol,
            side: s.side,
            volume: s.volume,
            profit: s.profit,
            commission: s.commission,
            swap: s.swap,
            net_profit: net,
            netProfitIdr: Math.round(net * rate),
            demo: true
          });
          demoState.entries.push({
            id: 'demo-seed-' + ticket,
            source: 'mt5',
            type: net >= 0 ? 'income' : 'expense',
            amountIdr: Math.round(Math.abs(net) * rate),
            amountOriginal: net,
            currency: 'USD',
            symbol: s.symbol,
            side: s.side,
            ticket,
            note: s.symbol + ' ' + s.side + ' (' + fmtUsd(net, 'USD') + ')',
            date: iso.slice(0, 10),
            demo: true
          });
        });
        demoState.mt5.lastUpdated = nowIso;
        const summary = computeDemoFinance();
        updateSidebar();
        emitDemoTrade({ phase: 'seed-analytics', mt5: demoState.mt5, summary });
        return;
      }
      if (phase === 'open') {
        const basePrice = side === 'SELL' ? 2644.80 : 2642.10;
        const pos = {
          ticket: 910000 + (++demoSeq),
          symbol: 'XAUUSD',
          side,
          volume: 0.10,
          price_open: basePrice,
          price_current: side === 'SELL' ? basePrice - 1.25 : basePrice + 1.40,
          profit: side === 'SELL' ? 12.50 : 14.00,
          time: nowIso
        };
        demoState.mt5.connected = true;
        demoState.mt5.status = 'trading';
        demoState.mt5.activePositions = [pos];
        demoState.mt5.activeSide = side;
        demoState.mt5.floatingProfit = pos.profit;
        demoState.mt5.netFloating = pos.profit;
        demoState.mt5.lastUpdated = nowIso;
        const summary = computeDemoFinance();
        updateSidebar();
        emitDemoTrade({ phase: 'open', side, symbol: pos.symbol, position: pos, mt5: demoState.mt5, summary });
        return;
      }

      const active = demoState.mt5.activePositions[0];
      const closedSide = active?.side || side || 'BUY';
      const sym = active?.symbol || 'XAUUSD';
      const usd = Number(profitUsd) || 0;
      const idrAbs = Math.round(Math.abs(usd) * rate);
      const ticket = 'DEMO-' + (920000 + (++demoSeq));
      const entry = {
        id: 'demo-mt5-' + demoSeq,
        source: 'mt5',
        type: usd >= 0 ? 'income' : 'expense',
        amountIdr: idrAbs,
        amountOriginal: usd,
        currency: 'USD',
        symbol: sym,
        side: closedSide,
        ticket,
        note: sym + ' ' + closedSide + ' (' + fmtUsd(usd, 'USD') + ')',
        date: todayISO(),
        demo: true
      };
      demoState.entries.push(entry);
      demoState.mt5Deals.push({
        ticket,
        time: nowIso,
        date: todayISO(),
        symbol: sym,
        side: closedSide,
        volume: active?.volume || 0.10,
        profit: usd,
        commission: 0,
        swap: 0,
        net_profit: usd,
        netProfitIdr: Math.round(usd * rate),
        demo: true
      });
      demoState.mt5.activePositions = [];
      demoState.mt5.activeSide = null;
      demoState.mt5.floatingProfit = 0;
        demoState.mt5.netFloating = 0;
      demoState.mt5.status = 'demo';
      demoState.mt5.lastUpdated = nowIso;
      const summary = computeDemoFinance();
      updateSidebar();
      emitDemoTrade({
        phase: 'close',
        side: closedSide,
        symbol: sym,
        profitUsd: usd,
        amountIdr: usd >= 0 ? idrAbs : -idrAbs,
        entry,
        summary,
        mt5: demoState.mt5
      });
    }

    function buildDemoStageOutput(wf, stageId, feedback) {
      const revNote = feedback ? ('\n[Revisi Bos]: ' + feedback + '\n') : '';
      const ch = wf.channel || 'Office AI Shorts';
      const templates = {
        brief: `Judul: ${wf.title}\nChannel: ${ch}\nMode: ${wf.mode}\nDurasi target: 45–55 detik (9:16)\nTujuan: Hook kuat 3 detik pertama, 3 poin padat, CTA ringan.${revNote}`,
        research: `Hasil Riset & Cek Fakta (${wf.title}):\n1. Sudut hook utama: bandingkan kebiasaan umum vs fakta terukur.\n2. Data pendukung: gunakan angka konkret dan analogi visual sederhana.\n3. Risiko klaim: hindari angka tanpa sumber; fokus pada mekanisme nyata.${revNote}`,
        script: `[00:00–00:03 HOOK]\n"${wf.title} — ternyata bukan soal kerja lebih lama."\n\n[00:03–00:35 ISI]\n- Adegan 1: Tunjukkan masalah yang langsung dikenali penonton.\n- Adegan 2: Pecah penyebab utama jadi satu diagram sederhana.\n- Adegan 3: Tunjukkan perubahan nyata dalam 1 langkah praktis.\n\n[00:35–00:48 PENUTUP & CTA]\n"Simpan video ini kalau ingin dicoba hari ini."${revNote}`,
        storyboard: `Shot 1 (0–3s): Close-up judul besar kontras tinggi di latar gelap.\nShot 2 (3–15s): Ilustrasi perbandingan kiri/kanan dengan panah tunggal.\nShot 3 (15–32s): Animasi 3 langkah berurutan, teks maks 5 kata per layar.\nShot 4 (32–48s): Ringkasan 1 kalimat + kartu akhir bersih.${revNote}`,
        render: `Daftar Produksi & Render (${wf.title}):\n- Rasio 1080x1920, 30 fps, audio -14 LUFS.\n- Subtitle aman dari area tombol Shorts (margin bawah 22%).\n- Berkas proyek lokal siap dirender lewat pipeline studio.${revNote}`,
        qa_publish: `Daftar Cek QA & Metadata Siap Unggah:\n- Judul usulan: ${wf.title}\n- Deskripsi: Ringkasan 2 kalimat + tagar relevan (#shorts).\n- Cek visual: Teks terbaca, audio jernih, tidak ada klaim melenceng.\n- Status: Menunggu persetujuan Bos (Upload YouTube tetap manual).${revNote}`
      };
      return templates[stageId] || wf.title;
    }

    function pushDemoLog(message, workflowId, stage) {
      demoState.actionLog.push({
        id: 'log-' + (++demoSeq),
        time: new Date().toISOString(),
        workflowId,
        stage,
        message
      });
      if (demoState.actionLog.length > 200) demoState.actionLog.shift();
    }

    function createDemoWorkflow({ title, channel, mode }) {
      const id = 'short-demo-' + (++demoSeq);
      const nowIso = new Date().toISOString();
      const stages = {};
      for (const s of STAGES) {
        stages[s.id] = {
          id: s.id,
          persona: s.persona,
          status: s.id === 'brief' ? 'done' : s.id === 'research' ? 'active' : 'pending',
          output: s.id === 'brief' ? buildDemoStageOutput({ title, channel, mode }, 'brief', '') : '',
          rulesApplied: s.id === 'brief' ? (demoState.workspace.rulesSummary || []).slice() : [],
          updatedAt: s.id === 'brief' ? nowIso : null
        };
      }
      const wf = {
        id,
        title,
        topic: title,
        channel: channel || demoState.shortsConfig.defaultChannel || 'Main Channel',
        mode: mode || 'auto',
        status: 'in_progress',
        currentStage: 'research',
        currentStageIndex: 1,
        autoApprove: false,
        stages,
        createdAt: nowIso,
        updatedAt: nowIso
      };
      demoState.workflows.unshift(wf);
      pushDemoLog(`Brief dibuat: ${title}`, id, 'brief');
      selectedWorkflowId = id;
      selectedStageId = 'research';
      updateSidebar();
      emitWorkflow({ type: 'workflow_update', workflow: normalizeWorkflow(wf), stage: 'brief', persona: 'project-shepherd' });
      return wf;
    }

    function stepDemoWorkflow(wfId) {
      const wf = demoState.workflows.find(w => w.id === wfId);
      if (!wf) return;
      const idx = wf.currentStageIndex;
      const def = STAGES[idx];
      if (!def) return;
      const st = wf.stages[def.id];
      const nowIso = new Date().toISOString();
      st.output = buildDemoStageOutput(wf, def.id, st.feedback || '');
      st.rulesApplied = (demoState.workspace.rulesSummary || []).slice();
      st.updatedAt = nowIso;
      wf.updatedAt = nowIso;
      if (def.hitl) {
        st.status = 'awaiting_approval';
        wf.status = 'awaiting_approval';
        pushDemoLog(`${t('v12.stage.' + def.id)} selesai — menunggu persetujuan Bos (HITL)`, wf.id, def.id);
      } else {
        st.status = 'done';
        const nextIdx = idx + 1;
        if (nextIdx < STAGES.length) {
          wf.currentStageIndex = nextIdx;
          wf.currentStage = STAGES[nextIdx].id;
          wf.stages[wf.currentStage].status = 'active';
          wf.status = 'in_progress';
          selectedStageId = wf.currentStage;
        } else {
          wf.status = 'ready_to_publish';
        }
        pushDemoLog(`${t('v12.stage.' + def.id)} selesai`, wf.id, def.id);
      }
      updateSidebar();
      emitWorkflow({ type: 'workflow_update', workflow: normalizeWorkflow(wf), stage: def.id, persona: def.persona });
    }

    function approveDemoWorkflow(wfId) {
      const wf = demoState.workflows.find(w => w.id === wfId);
      if (!wf) return;
      const idx = wf.currentStageIndex;
      const def = STAGES[idx];
      if (!def) return;
      wf.stages[def.id].status = 'done';
      wf.stages[def.id].feedback = '';
      wf.updatedAt = new Date().toISOString();
      const nextIdx = idx + 1;
      if (nextIdx < STAGES.length) {
        wf.currentStageIndex = nextIdx;
        wf.currentStage = STAGES[nextIdx].id;
        wf.stages[wf.currentStage].status = 'active';
        wf.status = 'in_progress';
        selectedStageId = wf.currentStage;
      } else {
        wf.status = 'ready_to_publish';
      }
      pushDemoLog(`Bos menyetujui ${t('v12.stage.' + def.id)}`, wf.id, def.id);
      updateSidebar();
      emitWorkflow({ type: 'workflow_update', workflow: normalizeWorkflow(wf), stage: def.id, persona: def.persona, approved: true });
    }

    function rejectDemoWorkflow(wfId, feedback) {
      const wf = demoState.workflows.find(w => w.id === wfId);
      if (!wf) return;
      const def = STAGES[wf.currentStageIndex];
      if (!def) return;
      wf.stages[def.id].status = 'revision';
      wf.stages[def.id].feedback = feedback || '';
      wf.status = 'revision';
      wf.updatedAt = new Date().toISOString();
      pushDemoLog(`Bos meminta revisi ${t('v12.stage.' + def.id)}${feedback ? ': ' + feedback : ''}`, wf.id, def.id);
      updateSidebar();
      emitWorkflow({ type: 'workflow_update', workflow: normalizeWorkflow(wf), stage: def.id, persona: def.persona, rejected: true });
    }

    // ===== Shared Dialog Host =====
    function showModalTitle(titleText) {
      if (typeof openDialogFn === 'function') {
        openDialogFn(titleText);
      } else {
        const panel = $('panel');
        const titleEl = $('panelTitle');
        const body = $('panelContent');
        if (titleEl) titleEl.textContent = titleText;
        if (body) body.replaceChildren();
        if (panel && !panel.open) panel.showModal();
      }
      const content = $('panelContent');
      if (content) {
        content.classList.remove('quality-panel');
        content.classList.add('v12-panel');
      }
    }

    // ===== PANEL 1: MT5 & OFFICE FINANCE =====
    function renderFinancePanel() {
      const content = $('panelContent');
      if (!content) return;
      // Keep the user's expanded connection form and edits while live prices repaint.
      const connectionForm = !busyAction ? content.querySelector('#v17ConnectionConfig[open]') : null;
      const focusedId = connectionForm?.contains(document.activeElement) ? document.activeElement.id : null;
      content.replaceChildren();
      content.classList.add('v12-panel');

      const data = currentData();
      const mt5 = data.mt5;
      const fin = data.finance;
      const analytics = data.mt5Analytics;

      // Top editorial header bar: underline tabs + tools
      const header = el('div', null, 'v12-header-bar');
      const tabs = el('div', null, 'v12-tabs');
      tabs.setAttribute('role', 'tablist');

      for (const tabKey of ['mt5', 'finance', 'analytics']) {
        const keyMap = { mt5: 'v12.tabMt5', finance: 'v12.tabFinance', analytics: 'v13.tabAnalytics' };
        const btn = el('button', t(keyMap[tabKey]), 'v12-tab');
        btn.type = 'button';
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', String(financeTab === tabKey));
        btn.dataset.v12Tab = tabKey;
        btn.addEventListener('click', () => {
          financeTab = tabKey;
          financeNotice = { text: '', kind: '' };
          renderFinancePanel();
          if (tabKey === 'analytics' && !isLocalDemo()) {
            fetchFinanceLive().then(() => {
              if (activePanel === 'finance' && financeTab === 'analytics' && $('panel')?.open) renderFinancePanel();
            });
          }
        });
        tabs.append(btn);
      }

      const tools = el('div', null, 'v12-header-tools');
      if (isLocalDemo() || (financeTab === 'analytics' && analyticsDemo)) {
        tools.append(el('span', t('v12.demoModeTag'), 'v12-pill warn'));
      }
      const freshness = el('span', null, 'v12-freshness');
      freshness.id = 'v17Mt5Freshness';
      tools.append(freshness);
      updateFreshness(mt5);

      const refreshBtn = el('button', t('v12.refresh'), 'v12-btn-compact');
      refreshBtn.type = 'button';
      refreshBtn.id = 'v12RefreshMt5';
      refreshBtn.disabled = busyAction;
      refreshBtn.addEventListener('click', async () => {
        if (busyAction) return;
        busyAction = true;
        financeNotice = { text: '', kind: '' };
        renderFinancePanel();
        try {
          if (!isLocalDemo()) {
            await req('POST', '/mt5/refresh', { historyDays: analyticsDays }).catch(() => null);
            await fetchFinanceLive();
          } else {
            demoState.mt5.lastUpdated = new Date().toISOString();
          }
        } catch (err) {
          financeNotice = { text: err.message, kind: 'error' };
        } finally {
          busyAction = false;
          if (activePanel === 'finance') renderFinancePanel();
        }
      });

      const focusBtn = el('button', t('v12.focusMt5Room'), 'v12-btn-compact');
      focusBtn.type = 'button';
      focusBtn.addEventListener('click', () => {
        $('panel')?.close();
        focusZone('mt5');
      });

      tools.append(refreshBtn, focusBtn);
      header.append(tabs, tools);
      content.append(header);

      if (financeNotice.text) {
        const note = el('div', financeNotice.text, 'v12-notice' + (financeNotice.kind ? ' ' + financeNotice.kind : ''));
        note.setAttribute('role', 'status');
        content.append(note);
      }

      if (financeTab === 'mt5') {
        renderMt5Tab(content, mt5);
        if (connectionForm) {
          $('v17ConnectionConfig')?.replaceWith(connectionForm);
          if (focusedId) $(focusedId)?.focus({ preventScroll: true });
        }
      } else if (financeTab === 'analytics') {
        renderMt5AnalyticsTab(content, analytics, mt5);
      } else {
        renderFinanceTab(content, fin);
      }
    }

    // [Diubah oleh Gemini - 2026-11-20] Grafik SVG Kurva Ekuitas & Tab ke-3 Analisa Trading MT5 V13 (KPI, Performa per Simbol, Heatmap Harian, Riwayat Trade & Ekspor CSV).
    function buildEquityCurveSvg(curve, cur = 'USD') {
      const W = 760, H = 200;
      const padL = 62, padR = 20, padT = 18, padB = 30;
      const plotW = W - padL - padR;
      const plotH = H - padT - padB;
      const svg = svgEl('svg', {
        id: 'v13Mt5EquitySvg',
        viewBox: `0 0 ${W} ${H}`,
        class: 'v13-chart-svg',
        role: 'img',
        'aria-label': t('v13.mt5EquityAria')
      });

      const pts = Array.isArray(curve) ? curve : [];
      const values = [0, ...pts.map(p => Number(p.cumulative ?? 0) || 0)];
      let minV = Math.min(...values);
      let maxV = Math.max(...values);
      if (minV === maxV) { minV -= 10; maxV += 10; }
      const padSpan = (maxV - minV) * 0.1;
      minV -= padSpan;
      maxV += padSpan;
      const span = Math.max(1e-6, maxV - minV);
      const yOf = v => padT + plotH - ((v - minV) / span) * plotH;
      const yZero = yOf(0);

      // Horizontal reference lines (top, zero, bottom) with anti-collision label spacing
      const yMax = yOf(maxV);
      const yMin = yOf(minV);
      const refLines = [
        { v: maxV, y: yMax, isZero: false, showLabel: Math.abs(yZero - yMax) >= 15 },
        { v: 0, y: yZero, isZero: true, showLabel: true },
        { v: minV, y: yMin, isZero: false, showLabel: Math.abs(yMin - yZero) >= 15 }
      ];
      for (const ref of refLines) {
        svg.append(svgEl('line', {
          x1: padL, y1: ref.y, x2: W - padR, y2: ref.y,
          class: ref.isZero ? 'v13-chart-zero' : 'v13-chart-grid'
        }));
        if (ref.showLabel) {
          const lbl = svgEl('text', {
            x: padL - 8, y: ref.y + 4, 'text-anchor': 'end', class: 'v13-chart-label'
          });
          lbl.textContent = fmtUsd(ref.v, cur);
          svg.append(lbl);
        }
      }

      if (!pts.length) {
        return svg;
      }

      const coords = pts.map((p, i) => {
        const x = pts.length === 1 ? padL + plotW / 2 : padL + (i / (pts.length - 1)) * plotW;
        const val = Number(p.cumulative ?? 0) || 0;
        return { x, y: yOf(val), p, val };
      });

      const linePts = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
      const areaD = `M ${coords[0].x.toFixed(1)} ${yZero.toFixed(1)} ` +
        coords.map(c => `L ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ') +
        ` L ${coords[coords.length - 1].x.toFixed(1)} ${yZero.toFixed(1)} Z`;

      svg.append(svgEl('path', { d: areaD, class: 'v13-chart-area' }));
      const finalVal = coords[coords.length - 1].val;
      svg.append(svgEl('polyline', {
        points: linePts,
        class: 'v13-chart-line' + (finalVal < 0 ? ' neg' : '')
      }));

      for (const c of coords) {
        const dot = svgEl('circle', {
          cx: c.x.toFixed(1),
          cy: c.y.toFixed(1),
          r: 3.5,
          class: 'v13-chart-dot' + ((Number(c.p.delta || 0) < 0) ? ' neg' : '')
        });
        const tip = svgEl('title');
        tip.textContent = `#${c.p.ticket || c.p.index} · ${c.p.symbol || ''} ${c.p.side || ''} · ${fmtUsd(c.p.delta || 0, cur)} → ${fmtUsd(c.val, cur)} (${c.p.date || ''})`;
        dot.append(tip);
        svg.append(dot);
      }

      // X-axis first, middle, last date labels
      const labelIdxs = pts.length === 1 ? [0] : pts.length === 2 ? [0, 1] : [0, Math.floor((pts.length - 1) / 2), pts.length - 1];
      for (const idx of new Set(labelIdxs)) {
        const c = coords[idx];
        const xLbl = svgEl('text', {
          x: c.x.toFixed(1),
          y: H - 8,
          'text-anchor': idx === 0 ? 'start' : idx === pts.length - 1 ? 'end' : 'middle',
          class: 'v13-chart-label'
        });
        xLbl.textContent = String(c.p.date || '').slice(5) || ('#' + c.p.index);
        svg.append(xLbl);
      }
      return svg;
    }

    function buildDealsCsv(deals, rate = 16200) {
      const esc = v => {
        const s = String(v ?? '');
        return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const lines = ['ticket,time,symbol,side,volume,profit,commission,swap,net_profit,net_profit_idr,demo'];
      for (const d of (deals || [])) {
        const net = Number(d.net_profit ?? d.netProfit ?? d.profit ?? 0) || 0;
        const netIdr = !['USD', 'IDR'].includes(String(d.currency || 'USD')) ? null : Number(d.netProfitIdr ?? d.net_profit_idr ?? Math.round(net * rate)) || 0;
        lines.push([
          d.ticket ?? '',
          d.time ?? d.date ?? '',
          d.symbol ?? '',
          d.side ?? '',
          d.volume ?? '',
          d.profit ?? 0,
          d.commission ?? 0,
          d.swap ?? 0,
          net,
          netIdr,
          Boolean(d.demo)
        ].map(esc).join(','));
      }
      return lines.join('\r\n') + '\r\n';
    }

    function renderMt5AnalyticsTab(container, analytics, mt5) {
      const m = analytics?.metrics || {};
      const cur = analytics?.currency || mt5?.currency || 'USD';
      const rate = Number(analytics?.usdToIdr || mt5?.config?.usdToIdr || 16200) || 16200;

      // Top controls bar: period selector, symbol filter, load demo data, export CSV
      const bar = el('section', null, 'v12-demo-bar');
      const leftCtrl = el('div', null, 'v12-btn-row');

      const periodSel = el('select');
      periodSel.id = 'v13Mt5PeriodSelect';
      periodSel.setAttribute('aria-label', t('v13.mt5PeriodLabel'));
      for (const [days, key] of [[7, 'v13.mt5Period7'], [30, 'v13.mt5Period30'], [90, 'v13.mt5Period90']]) {
        const o = el('option', t(key));
        o.value = String(days);
        periodSel.append(o);
      }
      periodSel.value = String(analyticsDays);
      periodSel.addEventListener('change', async () => {
        analyticsDays = Number(periodSel.value) || 30;
        if (!isLocalDemo()) await fetchFinanceLive();
        if (activePanel === 'finance') renderFinancePanel();
      });

      const symSel = el('select');
      symSel.id = 'v13Mt5SymbolFilter';
      symSel.setAttribute('aria-label', t('v13.mt5SymbolFilterLabel'));
      const optAll = el('option', t('v13.mt5AllSymbols'));
      optAll.value = '';
      symSel.append(optAll);
      const symSet = new Set([
        ...(Array.isArray(analytics?.availableSymbols) ? analytics.availableSymbols : []),
        ...((analytics?.bySymbol || []).map(r => r.symbol)),
        ...((analytics?.deals || []).map(d => d.symbol)),
        ...(analyticsSymbol ? [analyticsSymbol] : [])
      ].filter(Boolean));
      for (const sym of [...symSet].sort()) {
        const o = el('option', sym);
        o.value = sym;
        symSel.append(o);
      }
      symSel.value = analyticsSymbol;
      symSel.addEventListener('change', async () => {
        analyticsSymbol = symSel.value;
        if (!isLocalDemo()) await fetchFinanceLive();
        if (activePanel === 'finance') renderFinancePanel();
      });

      leftCtrl.append(periodSel, symSel);

      const rightCtrl = el('div', null, 'v12-btn-row');
      const seedBtn = el('button', t(analyticsDemo ? 'mt5v17.realData' : 'v13.mt5LoadDemo'), 'v12-btn-compact');
      seedBtn.type = 'button';
      seedBtn.id = 'v13Mt5SeedDemo';
      seedBtn.disabled = busyAction;
      seedBtn.addEventListener('click', async () => {
        if (busyAction) return;
        busyAction = true;
        financeNotice = { text: '', kind: '' };
        try {
          if (isLocalDemo()) {
            runDemoTrade('seed-analytics');
          } else {
            if (!analyticsDemo) await req('POST', '/finance/demo-trade', { phase: 'seed-analytics' });
            analyticsDemo = !analyticsDemo;
            await fetchFinanceLive();
          }
          financeNotice = { text: t('v13.mt5DemoSeeded'), kind: 'ok' };
        } catch (err) {
          financeNotice = { text: err.message, kind: 'error' };
        } finally {
          busyAction = false;
          if (activePanel === 'finance') renderFinancePanel();
        }
      });

      const exportBtn = el('button', t('v13.mt5ExportCsv'), 'v12-btn-compact v12-btn-primary');
      exportBtn.type = 'button';
      exportBtn.id = 'v13Mt5ExportCsv';
      exportBtn.addEventListener('click', async () => {
        try {
          let csvText = '';
          if (!isLocalDemo()) {
            const url = '/mt5/analytics.csv?days=' + encodeURIComponent(analyticsDays) + (analyticsDemo ? '&demo=1' : '') +
              (analyticsSymbol ? '&symbol=' + encodeURIComponent(analyticsSymbol) : '');
            const res = await fetch(url, { headers: { 'X-Office-Token': getToken() } });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            csvText = await res.text();
          } else {
            csvText = buildDealsCsv(analytics?.deals || [], rate);
          }
          const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = `mt5-analytics-${analyticsDays}d${analyticsSymbol ? '-' + analyticsSymbol : ''}.csv`;
          document.body.append(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(link.href), 1500);
        } catch (err) {
          financeNotice = { text: err.message, kind: 'error' };
          if (activePanel === 'finance') renderFinancePanel();
        }
      });

      rightCtrl.append(seedBtn, exportBtn);
      bar.append(leftCtrl, rightCtrl);
      container.append(bar);

      // 6-cell KPI metric grid
      const kpiGrid = el('section', null, 'v13-kpi-grid');
      kpiGrid.id = 'v13Mt5KpiGrid';
      const pfText = m.profitFactor === null
        ? ((m.wins || 0) > 0 ? '∞' : '0.00')
        : I18n.number(Number(m.profitFactor || 0), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const cells = [
        {
          label: t('v13.mt5KpiWinRate'),
          value: I18n.number(Number(m.winRatePct || 0), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%',
          cls: (m.winRatePct || 0) >= 50 ? 'pos' : ((m.totalTrades || 0) > 0 ? 'neg' : ''),
          sub: t('v13.mt5KpiWinLossSub', { wins: m.wins || 0, losses: m.losses || 0 })
        },
        {
          label: t('v13.mt5KpiProfitFactor'),
          value: pfText,
          cls: (m.profitFactor === null && (m.wins || 0) > 0) || Number(m.profitFactor) >= 1.5 ? 'pos' : (Number(m.profitFactor) > 0 && Number(m.profitFactor) < 1 ? 'neg' : ''),
          sub: t('v13.mt5KpiExpectancySub', { value: fmtUsd(m.expectancy || 0, cur) })
        },
        {
          label: t('v13.mt5KpiDrawdown'),
          value: fmtUsd(-Math.abs(Number(m.maxDrawdown || 0)), cur),
          cls: (m.maxDrawdown || 0) > 0 ? 'neg' : '',
          sub: t('v13.mt5KpiDrawdownSub', { pct: I18n.number(Number(m.maxDrawdownPct || 0), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) })
        },
        {
          label: t('v13.mt5KpiTotalTrades'),
          value: I18n.number(m.totalTrades || 0),
          cls: '',
          sub: t('v13.mt5KpiWinLossSub', { wins: m.wins || 0, losses: m.losses || 0 })
        },
        {
          label: t('v13.mt5KpiAvgWinLoss'),
          value: fmtUsd(m.avgWin || 0, cur) + ' / ' + fmtUsd(-Math.abs(Number(m.avgLoss || 0)), cur),
          cls: '',
          sub: t('v13.mt5KpiBestWorstSub', { best: fmtUsd(m.bestTrade || 0, cur), worst: fmtUsd(m.worstTrade || 0, cur) })
        },
        {
          label: t('v13.mt5KpiNetPlIdr'),
          value: fmtIdrLiteral(m.netProfitIdr, true),
          cls: (m.netProfitIdr || 0) > 0 ? 'pos' : (m.netProfitIdr || 0) < 0 ? 'neg' : '',
          sub: fmtUsd(m.netProfit || 0, cur)
        }
      ];
      for (const c of cells) {
        const cell = el('div', null, 'v13-kpi-cell');
        cell.append(
          el('span', c.label, 'v12-kpi-label'),
          el('strong', c.value, 'v12-kpi-value' + (c.cls ? ' ' + c.cls : '')),
          el('span', c.sub, 'v12-kpi-sub')
        );
        kpiGrid.append(cell);
      }
      container.append(kpiGrid);

      // SVG Equity Curve section
      const eqSec = el('section', null, 'v12-section');
      const eqHead = el('div', null, 'v12-section-head');
      eqHead.append(el('h3', t('v13.mt5EquityTitle')), el('span', t('v13.mt5EquitySubtitle'), 'v12-muted'));
      eqSec.append(eqHead);
      const eqWrap = el('div', null, 'v13-chart-wrap');
      eqWrap.append(buildEquityCurveSvg(analytics?.equityCurve || [], cur));
      eqSec.append(eqWrap);
      if (!analytics?.equityCurve?.length) {
        const emptyNote = el('p', t('v13.mt5EquityEmpty'), 'v12-empty');
        emptyNote.style.marginTop = '10px';
        eqSec.append(emptyNote);
      }
      container.append(eqSec);

      // Two-column: Performance by Symbol + Daily Heatmap
      const mid = el('div', null, 'v12-two-col');

      const symCard = el('section', null, 'v12-section');
      const symHead = el('div', null, 'v12-section-head');
      symHead.append(el('h3', t('v13.mt5BySymbolTitle')));
      symCard.append(symHead);

      const bySym = analytics?.bySymbol || [];
      if (!bySym.length) {
        symCard.append(el('p', t('v13.mt5BySymbolEmpty'), 'v12-empty'));
      } else {
        const scroll = el('div', null, 'table-scroll');
        const tbl = el('table', null, 'v12-table');
        tbl.id = 'v13Mt5SymbolTable';
        const thead = el('thead');
        const htr = el('tr');
        for (const [lbl, cls] of [
          [t('v12.mt5ColSymbol'), ''],
          [t('v13.mt5ColTrades'), 'v12-num'],
          [t('v13.mt5ColWinRate'), 'v12-num'],
          [t('v13.mt5ColNetPl'), 'v12-num']
        ]) htr.append(el('th', lbl, cls));
        thead.append(htr);
        tbl.append(thead);

        const tbody = el('tbody');
        for (const row of bySym) {
          const tr = el('tr');
          tr.append(el('td', row.symbol || '—', 'v12-mono'));
          tr.append(el('td', I18n.number(row.trades || 0), 'v12-num'));
          tr.append(el('td', I18n.number(Number(row.winRatePct || 0), { maximumFractionDigits: 1 }) + '%', 'v12-num'));
          const net = Number(row.netProfit || 0);
          tr.append(el('td', fmtUsd(net, cur), 'v12-num ' + (net > 0 ? 'v12-amount-pos' : net < 0 ? 'v12-amount-neg' : '')));
          tbody.append(tr);
        }
        tbl.append(tbody);
        scroll.append(tbl);
        symCard.append(scroll);
      }

      const heatCard = el('section', null, 'v12-section');
      const heatHead = el('div', null, 'v12-section-head');
      heatHead.append(el('h3', t('v13.mt5HeatmapTitle')));
      heatCard.append(heatHead);

      const heatmap = analytics?.dailyHeatmap || [];
      if (!heatmap.length) {
        heatCard.append(el('p', t('v13.mt5HeatmapEmpty'), 'v12-empty'));
      } else {
        const grid = el('div', null, 'v13-heatmap-grid');
        grid.id = 'v13Mt5Heatmap';
        for (const day of heatmap) {
          const net = Number(day.netProfit || 0);
          const cls = net > 0 ? 'pos' : net < 0 ? 'neg' : 'zero';
          const cell = el('div', null, 'v13-heat-cell ' + cls);
          cell.append(
            el('span', String(day.date || '').slice(5) || '—', 'v13-heat-date'),
            el('strong', fmtUsd(net, cur), 'v13-heat-val'),
            el('span', t('v13.mt5KpiWinLossSub', { wins: day.wins || 0, losses: day.losses || 0 }), 'v13-heat-meta')
          );
          grid.append(cell);
        }
        heatCard.append(grid);
      }

      mid.append(symCard, heatCard);
      container.append(mid);

      // Complete Trade History Table
      const dealsSec = el('section', null, 'v12-section');
      const dealsHead = el('div', null, 'v12-section-head');
      dealsHead.append(
        el('h3', t('v13.mt5DealsTitle')),
        el('span', I18n.number((analytics?.deals || []).length), 'v12-muted')
      );
      dealsSec.append(dealsHead);

      const deals = analytics?.deals || [];
      if (!deals.length) {
        dealsSec.append(el('p', t('v13.mt5DealsEmpty'), 'v12-empty'));
      } else {
        const scroll = el('div', null, 'table-scroll');
        const tbl = el('table', null, 'v12-table');
        tbl.id = 'v13Mt5DealsTable';
        const thead = el('thead');
        const htr = el('tr');
        for (const [lbl, cls] of [
          [t('v13.mt5ColTicket'), ''],
          [t('v13.mt5ColTime'), ''],
          [t('v12.mt5ColSymbol'), ''],
          [t('v12.mt5ColSide'), ''],
          [t('v12.mt5ColVolume'), 'v12-num'],
          [t('v13.mt5ColNetUsd'), 'v12-num'],
          [t('v13.mt5ColNetIdr'), 'v12-num']
        ]) htr.append(el('th', lbl, cls));
        thead.append(htr);
        tbl.append(thead);

        const tbody = el('tbody');
        for (const d of deals.slice(0, 100)) {
          const tr = el('tr');
          const posTicket = d.position_id && String(d.position_id) !== '0' ? String(d.position_id) : String(d.ticket ?? '—');
          const ticketTd = el('td', posTicket, 'v12-mono');
          const tipParts = [];
          if (d.position_id && String(d.position_id) !== '0') tipParts.push('Position #' + d.position_id);
          if (d.ticket && String(d.ticket) !== posTicket) tipParts.push('Deal #' + d.ticket);
          if (d.comment) tipParts.push(d.comment);
          if (tipParts.length) ticketTd.title = tipParts.join(' · ');
          tr.append(ticketTd);
          const timeVal = d.time ? String(d.time).replace('T', ' ').slice(0, 16) : String(d.date || '—');
          tr.append(el('td', timeVal, 'v12-mono'));
          tr.append(el('td', d.symbol || '—', 'v12-mono'));
          const sideTd = el('td');
          const dSide = String(d.side || 'BUY').toUpperCase();
          sideTd.append(el('span', dSide, 'v12-pill ' + (dSide === 'SELL' ? 'neg' : 'pos')));
          tr.append(sideTd);
          tr.append(el('td', I18n.number(Number(d.volume ?? 0), { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 'v12-num'));
          const net = Number(d.net_profit ?? d.netProfit ?? d.profit ?? 0) || 0;
          const netIdr = !['USD', 'IDR'].includes(String(d.currency || analytics?.currency || 'USD')) ? null : Number(d.netProfitIdr ?? d.net_profit_idr ?? Math.round(net * rate)) || 0;
          tr.append(el('td', fmtUsd(net, cur), 'v12-num ' + (net > 0 ? 'v12-amount-pos' : net < 0 ? 'v12-amount-neg' : '')));
          tr.append(el('td', fmtIdrLiteral(netIdr, true), 'v12-num ' + (netIdr > 0 ? 'v12-amount-pos' : netIdr < 0 ? 'v12-amount-neg' : '')));
          tbody.append(tr);
        }
        tbl.append(tbody);
        scroll.append(tbl);
        dealsSec.append(scroll);
      }
      container.append(dealsSec);
    }

    function renderMt5Tab(container, mt5) {
      const positions = mt5.activePositions || [];
      const isTrading = mt5.status === 'trading' || positions.length > 0;
      const side = mt5.activeSide || positions[0]?.side || null;

      // Status strip + strict Read-Only Safety Seal
      const strip = el('section', null, 'v12-mt5-strip');
      strip.dataset.status = isTrading ? 'trading' : (mt5.connected ? 'connected' : 'disconnected');
      if (side) strip.dataset.side = side;

      const left = el('div', null, 'v12-mt5-main');
      const pill = el('span', null, 'v12-pill');
      const dot = el('span', null, 'v12-pill-dot');
      dot.setAttribute('aria-hidden', 'true');
      let statusLabel = connectionText(mt5);
      if (isTrading) {
        statusLabel = t('v12.mt5StatusTrading', { side: side || 'BUY' });
        pill.classList.add(side === 'SELL' ? 'neg' : 'pos', 'is-live');
      } else if (mt5.connected || mt5.status === 'idle') {
        statusLabel = t('v12.mt5StatusConnected');
        pill.classList.add('pos');
      } else if (isLocalDemo() || mt5.status === 'demo') {
        statusLabel = t('v12.mt5StatusDemo');
        pill.classList.add('warn');
      }
      pill.append(dot, document.createTextNode(statusLabel));

      const plBox = el('div', null, 'v12-mt5-pl');
      plBox.append(el('span', t('mt5v17.netFloating')));
      const plNum = Number(mt5.floatingProfit || 0);
      const plStrong = el('strong', fmtUsd(plNum, mt5.currency || 'USD'));
      plStrong.id = 'v17NetFloating';
      if (plNum > 0) plStrong.classList.add('pos');
      else if (plNum < 0) plStrong.classList.add('neg');
      plBox.append(plStrong);

      left.append(pill, plBox);

      const seal = el('div', null, 'v12-readonly-seal');
      seal.append(shieldSvg(), el('span', t('v12.readonlySeal')));
      strip.append(left, seal);
      container.append(strip);
      const compare = el('section', null, 'v17-mt5-compare');
      const terminal = el('strong', mt5.terminalFloating == null ? t('mt5v17.na') : fmtUsd(mt5.terminalFloating, mt5.currency));
      terminal.id = 'v17TerminalFloating';
      compare.append(el('span', t('mt5v17.terminalFloating')), terminal);
      const match = el('span', mt5.floatingMatches == null ? t('mt5v17.na') : mt5.floatingMatches ? t('mt5v17.matches') : t('mt5v17.difference', { amount: fmtUsd(mt5.floatingDifference, mt5.currency) }), 'v12-pill');
      match.id = 'v17FloatingMatch';
      match.classList.add(mt5.floatingMatches ? 'pos' : 'warn');
      compare.append(match);
      if (mt5.terminalProfit != null) compare.append(el('span', t('mt5v17.accountProfit') + ': ' + fmtUsd(mt5.terminalProfit, mt5.currency)));
      if (mt5.floatingProfitIdr != null && mt5.currency === 'USD') compare.append(el('span', t('mt5v17.estimatedIdr', { amount: fmtIdrLiteral(mt5.floatingProfitIdr) })));
      container.append(compare, el('p', t('mt5v17.netHint'), 'v12-muted'));
      if (!mt5.connected && !isLocalDemo()) container.append(el('p', connectionText(mt5) + ' · ' + t('mt5v17.connectionHint'), 'v12-empty'));

      // Active open positions table
      const posSection = el('section', null, 'v12-section');
      const posHead = el('div', null, 'v12-section-head');
      posHead.append(
        el('h3', t('v12.mt5OpenPositions')),
        el('span', t('v12.mt5OpenPositionsCount', { count: positions.length }), 'v12-muted')
      );
      posSection.append(posHead);

      if (!positions.length) {
        posSection.append(el('p', t('v12.mt5EmptyPositions'), 'v12-empty'));
      } else {
        const scroll = el('div', null, 'table-scroll');
        const tbl = el('table', null, 'v12-table');
        tbl.id = 'v17Positions';
        const thead = el('thead');
        const htr = el('tr');
        const cols = [
          [t('mt5v17.ticket'), ''],
          [t('v12.mt5ColSymbol'), ''],
          [t('v12.mt5ColSide'), ''],
          [t('v12.mt5ColVolume'), 'v12-num'],
          [t('v12.mt5ColOpen'), 'v12-num'],
          [t('v12.mt5ColCurrent'), 'v12-num'],
          [t('mt5v17.slTp'), 'v12-num'],
          [t('v12.mt5ColProfit'), 'v12-num'],
          [t('mt5v17.swap'), 'v12-num'],
          [t('mt5v17.commission'), 'v12-num'],
          [t('mt5v17.net'), 'v12-num']
        ];
        for (const [label, cls] of cols) htr.append(el('th', label, cls));
        thead.append(htr);
        tbl.append(thead);

        const tbody = el('tbody');
        for (const p of positions) {
          const tr = el('tr');
          tr.append(el('td', p.ticket || '—', 'v12-mono'));
          tr.append(el('td', p.symbol || '—', 'v12-mono'));
          const sideTd = el('td');
          const pSide = String(p.side || 'BUY').toUpperCase();
          sideTd.append(el('span', pSide, 'v12-pill ' + (pSide === 'SELL' ? 'neg' : 'pos')));
          tr.append(sideTd);
          tr.append(el('td', I18n.number(p.volume ?? 0, { minimumFractionDigits: 2, maximumFractionDigits: 4 }), 'v12-num'));
          tr.append(el('td', I18n.number(p.price_open ?? p.priceOpen ?? 0, { minimumFractionDigits: 2, maximumFractionDigits: 5 }), 'v12-num'));
          tr.append(el('td', I18n.number(p.price_current ?? p.priceCurrent ?? 0, { minimumFractionDigits: 2, maximumFractionDigits: 5 }), 'v12-num'));
          tr.append(el('td', [p.sl || '—', p.tp || '—'].join(' / '), 'v12-num'));
          const prof = Number(p.profit ?? 0);
          const profTd = el('td', fmtUsd(prof, mt5.currency || 'USD'), 'v12-num ' + (prof > 0 ? 'v12-amount-pos' : prof < 0 ? 'v12-amount-neg' : ''));
          tr.append(profTd);
          tr.append(el('td', fmtUsd(p.swap ?? 0, mt5.currency), 'v12-num'));
          tr.append(el('td', p.commission == null ? t('mt5v17.na') : fmtUsd(p.commission, mt5.currency), 'v12-num'));
          tr.append(el('td', fmtUsd(p.net_floating ?? prof, mt5.currency), 'v12-num'));
          tbody.append(tr);
        }
        tbl.append(tbody);
        scroll.append(tbl);
        posSection.append(scroll);
      }
      container.append(posSection);

      // Demo Simulation Controls (explicitly tests 3D Trader + Finance Manager choreography)
      const demoBar = el('section', null, 'v12-demo-bar');
      const demoLbl = el('div', null, 'v12-demo-label');
      demoLbl.append(el('strong', t('mt5v17.demoHeading')), el('span', t('mt5v17.demoHint')));
      const demoBtns = el('div', null, 'v12-btn-row');

      const triggerDemo = async (phase, sideArg, profitUsd) => {
        if (busyAction) return;
        busyAction = true;
        financeNotice = { text: '', kind: '' };
        try {
          if (isLocalDemo()) {
            if (phase === 'close' && !demoState.mt5.activePositions.length) {
              runDemoTrade('open', 'BUY', 0);
            }
            runDemoTrade(phase, sideArg, profitUsd);
          } else {
            const payload = { phase, side: sideArg, symbol: 'XAUUSD', profitUsd };
            const res = await req('POST', '/finance/demo-trade', payload);
            await fetchFinanceLive();
            demoState.mt5 = normalizeMt5(res.mt5);
            demoState.entries = res.summary ? (await req('GET', '/finance/demo')).entries : [];
            financeNotice = { text: t('mt5v17.demoResult', { floating: fmtUsd(res.mt5.floatingProfit, 'USD'), balance: fmtIdrLiteral(res.summary.netBalanceIdr) }), kind: 'ok' };
          }
        } catch (err) {
          financeNotice = { text: err.message, kind: 'error' };
        } finally {
          busyAction = false;
          if (activePanel === 'finance') renderFinancePanel();
        }
      };

      const simSpecs = [
        ['v12SimOpenBuy', t('v12.mt5SimOpenBuy'), 'v12-btn-compact', () => triggerDemo('open', 'BUY', 0)],
        ['v12SimOpenSell', t('v12.mt5SimOpenSell'), 'v12-btn-compact', () => triggerDemo('open', 'SELL', 0)],
        ['v12SimCloseProfit', t('v12.mt5SimCloseProfit'), 'v12-btn-compact v12-btn-primary', () => triggerDemo('close', side || 'BUY', 42.5)],
        ['v12SimCloseLoss', t('v12.mt5SimCloseLoss'), 'v12-btn-compact v12-btn-danger', () => triggerDemo('close', side || 'SELL', -18.0)],
        ['v12SimResetDemo', t('v12.mt5SimReset'), 'v12-btn-compact', () => triggerDemo('reset', 'BUY', 0)]
      ];
      for (const [id, text, cls, handler] of simSpecs) {
        const b = el('button', text, cls);
        b.type = 'button';
        b.id = id;
        b.disabled = busyAction;
        b.addEventListener('click', handler);
        demoBtns.append(b);
      }
      demoBar.append(demoLbl, demoBtns);
      container.append(demoBar);

      // Collapsible MT5 Connection Settings
      const cfg = mt5.config || {};
      const details = el('details', null, 'v12-disclosure');
      details.id = 'v17ConnectionConfig';
      const summary = el('summary', t('v12.mt5ConfigSummary'));
      details.append(summary);

      const body = el('div', null, 'v12-disclosure-body');
      const form = el('form');
      form.addEventListener('submit', async e => {
        e.preventDefault();
        if (busyAction) return;
        const payload = {
          enabled: enableInput.checked,
          pollIntervalMs: Math.max(1000, Math.min(5000, Number(intervalInput.value) || 1000)),
          usdToIdr: Math.max(1000, Number(rateInput.value) || 16200),
          terminalPath: termInput.value.trim(),
          pythonPath: pyInput.value.trim()
        };
        busyAction = true;
        financeNotice = { text: '', kind: '' };
        try {
          if (isLocalDemo()) {
            demoState.mt5.config = { ...demoState.mt5.config, ...payload };
          } else {
            await req('POST', '/mt5/config', payload);
            await fetchFinanceLive();
          }
          financeNotice = { text: t('v12.mt5ConfigSaved'), kind: 'ok' };
        } catch (err) {
          financeNotice = { text: err.message, kind: 'error' };
        } finally {
          busyAction = false;
          if (activePanel === 'finance') renderFinancePanel();
        }
      });

      const enableRow = el('label', null, 'v12-check-row');
      enableRow.append(el('span', t('mt5v17.autoSync')));
      const enableInput = el('input');
      enableInput.type = 'checkbox';
      enableInput.id = 'v12Mt5Enable';
      enableInput.checked = Boolean(cfg.enabled);
      enableRow.append(enableInput);

      const grid = el('div', null, 'v12-form-grid');

      const intervalWrap = el('div', null, 'v12-field');
      const intervalLbl = el('label', t('mt5v17.interval'));
      intervalLbl.htmlFor = 'v12Mt5Interval';
      const intervalInput = el('input');
      intervalInput.type = 'number';
      intervalInput.id = 'v12Mt5Interval';
      intervalInput.min = '1000';
      intervalInput.max = '5000';
      intervalInput.step = '500';
      intervalInput.value = String(cfg.pollIntervalMs || 1000);
      intervalWrap.append(intervalLbl, intervalInput);

      const rateWrap = el('div', null, 'v12-field');
      const rateLbl = el('label', t('v12.mt5ConfigUsdIdr'));
      rateLbl.htmlFor = 'v12Mt5UsdIdr';
      const rateInput = el('input');
      rateInput.type = 'number';
      rateInput.id = 'v12Mt5UsdIdr';
      rateInput.min = '1000';
      rateInput.max = '1000000';
      rateInput.step = '50';
      rateInput.value = String(cfg.usdToIdr || 16200);
      rateWrap.append(rateLbl, rateInput);

      const termWrap = el('div', null, 'v12-field full');
      const termLbl = el('label', t('v12.mt5ConfigTerminal'));
      termLbl.htmlFor = 'v12Mt5Terminal';
      const termInput = el('input');
      termInput.type = 'text';
      termInput.id = 'v12Mt5Terminal';
      termInput.value = cfg.terminalPath || '';
      termWrap.append(termLbl, termInput);

      const pyWrap = el('div', null, 'v12-field full');
      const pyLbl = el('label', t('v12.mt5ConfigPython'));
      pyLbl.htmlFor = 'v12Mt5Python';
      const pyInput = el('input');
      pyInput.type = 'text';
      pyInput.id = 'v12Mt5Python';
      pyInput.value = cfg.pythonPath || '';
      pyWrap.append(pyLbl, pyInput);

      grid.append(intervalWrap, rateWrap, termWrap, pyWrap);
      const saveBtn = el('button', t('v12.mt5ConfigSave'), 'v12-btn-primary');
      saveBtn.type = 'submit';
      saveBtn.style.marginTop = '12px';

      form.append(enableRow, grid, saveBtn);
      body.append(form);
      details.append(body);
      container.append(details);
    }

    function renderFinanceTab(container, fin) {
      if (fin.unconvertedCount) {
        container.append(el('p', t('mt5v17.conversionMissing', { count: fin.unconvertedCount }), 'v12-notice'));
        for (const [currency, amount] of Object.entries(fin.mt5ByCurrency || {})) {
          container.append(el('p', t('v12.sourceMt5') + ' · ' + fmtUsd(amount, currency), 'v12-muted'));
        }
      }
      // Unified 3-column hairline-divided KPI strip (Lead figure + 2 siblings, zero icon circles)
      const kpiStrip = el('section', null, 'v12-kpi-strip');

      const cNet = el('div', null, 'v12-kpi-cell lead');
      cNet.append(el('span', t('v12.kpiNetBalance'), 'v12-kpi-label'));
      const vNet = el('strong', fmtRpExact(fin.netBalanceIdr), 'v12-kpi-value');
      if (fin.netBalanceIdr > 0) vNet.classList.add('pos');
      else if (fin.netBalanceIdr < 0) vNet.classList.add('neg');
      cNet.append(vNet, el('span', fin.entryCount > 0 ? t('v12.kpiEntryCount', { count: fin.entryCount }) : t('v12.kpiHonestZero'), 'v12-kpi-sub'));

      const cInc = el('div', null, 'v12-kpi-cell');
      cInc.append(el('span', t('v12.kpiTotalIncome'), 'v12-kpi-label'));
      const vInc = el('strong', fmtRpExact(fin.totalIncomeIdr), 'v12-kpi-value' + (fin.totalIncomeIdr > 0 ? ' pos' : ''));
      cInc.append(vInc);

      const cLoss = el('div', null, 'v12-kpi-cell');
      cLoss.append(el('span', t('v12.kpiTotalLoss'), 'v12-kpi-label'));
      const vLoss = el('strong', fmtRpExact(fin.totalLossIdr), 'v12-kpi-value' + (fin.totalLossIdr > 0 ? ' neg' : ''));
      cLoss.append(vLoss);

      kpiStrip.append(cNet, cInc, cLoss);
      container.append(kpiStrip);

      // Middle 2-col row: Source Breakdown + Quick Entry Form
      const mid = el('div', null, 'v12-two-col');

      // Left: Source Breakdown Horizontal Bar List
      const srcCard = el('section', null, 'v12-section');
      const srcHead = el('div', null, 'v12-section-head');
      srcHead.append(el('h3', t('v12.sourceBreakdownTitle')));
      srcCard.append(srcHead);

      const barList = el('div', null, 'v12-bar-list');
      const maxAbs = Math.max(1, ...SOURCES.map(k => Math.abs(Number(fin.bySource?.[k]) || 0)));
      for (const k of SOURCES) {
        const val = Number(fin.bySource?.[k]) || 0;
        const cnt = Number(fin.bySourceDetail?.[k]?.count) || 0;
        const item = el('div', null, 'v12-bar-item');
        const meta = el('div', null, 'v12-bar-meta');
        meta.append(el('span', cnt > 0 ? (sourceLabel(k) + ' (' + I18n.number(cnt) + ')') : sourceLabel(k)));
        const valEl = el('strong', fmtSignedRp(val));
        if (val > 0) valEl.classList.add('pos');
        else if (val < 0) valEl.classList.add('neg');
        meta.append(valEl);

        const track = el('div', null, 'v12-bar-track');
        const fill = el('div', null, 'v12-bar-fill' + (val < 0 ? ' neg' : ''));
        // Honest zero: 0% fill, zero stub.
        const pct = val === 0 ? 0 : Math.max(3, Math.min(100, (Math.abs(val) / maxAbs) * 100));
        fill.style.width = pct.toFixed(1) + '%';
        track.append(fill);

        item.append(meta, track);
        barList.append(item);
      }
      srcCard.append(barList);

      // Right: Quick Transaction Entry Form
      const formCard = el('section', null, 'v12-section');
      const formHead = el('div', null, 'v12-section-head');
      formHead.append(el('h3', t('v12.quickEntryTitle')));
      formCard.append(formHead);

      const form = el('form');
      const fGrid = el('div', null, 'v12-form-grid');

      const srcWrap = el('div', null, 'v12-field');
      const srcLbl = el('label', t('v12.fieldSource'));
      srcLbl.htmlFor = 'v12EntrySource';
      const srcSel = el('select');
      srcSel.id = 'v12EntrySource';
      for (const k of SOURCES) {
        const o = el('option', sourceLabel(k));
        o.value = k;
        srcSel.append(o);
      }
      srcWrap.append(srcLbl, srcSel);

      const typeWrap = el('div', null, 'v12-field');
      const typeLbl = el('label', t('v12.fieldType'));
      typeLbl.htmlFor = 'v12EntryType';
      const typeSel = el('select');
      typeSel.id = 'v12EntryType';
      const optIn = el('option', t('v12.typeIncome'));
      optIn.value = 'income';
      const optEx = el('option', t('v12.typeExpense'));
      optEx.value = 'expense';
      typeSel.append(optIn, optEx);
      typeWrap.append(typeLbl, typeSel);

      const amtWrap = el('div', null, 'v12-field');
      const amtLbl = el('label', t('v12.fieldAmountIdr'));
      amtLbl.htmlFor = 'v12EntryAmount';
      const amtInput = el('input');
      amtInput.type = 'number';
      amtInput.id = 'v12EntryAmount';
      amtInput.min = '1';
      amtInput.step = 'any';
      amtInput.required = true;
      amtWrap.append(amtLbl, amtInput);

      const dateWrap = el('div', null, 'v12-field');
      const dateLbl = el('label', t('v12.fieldDate'));
      dateLbl.htmlFor = 'v12EntryDate';
      const dateInput = el('input');
      dateInput.type = 'date';
      dateInput.id = 'v12EntryDate';
      dateInput.value = todayISO();
      dateWrap.append(dateLbl, dateInput);

      const noteWrap = el('div', null, 'v12-field full');
      const noteLbl = el('label', t('v12.fieldNote'));
      noteLbl.htmlFor = 'v12EntryNote';
      const noteInput = el('input');
      noteInput.type = 'text';
      noteInput.id = 'v12EntryNote';
      noteInput.maxLength = 120;
      noteWrap.append(noteLbl, noteInput);

      fGrid.append(srcWrap, typeWrap, amtWrap, dateWrap, noteWrap);
      const submitBtn = el('button', t('v12.btnRecordEntry'), 'v12-btn-primary');
      submitBtn.type = 'submit';
      submitBtn.id = 'v12SubmitEntry';
      submitBtn.style.marginTop = '12px';
      submitBtn.disabled = busyAction;

      form.addEventListener('submit', async e => {
        e.preventDefault();
        if (busyAction) return;
        const amountIdr = Math.round(Number(amtInput.value));
        if (!Number.isFinite(amountIdr) || amountIdr <= 0) {
          financeNotice = { text: t('v12.invalidAmount'), kind: 'error' };
          renderFinancePanel();
          return;
        }
        const entry = {
          source: srcSel.value,
          type: typeSel.value,
          amountIdr,
          date: dateInput.value || todayISO(),
          note: noteInput.value.trim()
        };
        busyAction = true;
        financeNotice = { text: '', kind: '' };
        try {
          if (isLocalDemo()) {
            demoState.entries.push({ id: 'demo-entry-' + (++demoSeq), ...entry });
            updateSidebar();
          } else {
            await req('POST', '/finance/entry', entry);
            await fetchFinanceLive();
          }
          financeNotice = { text: t('v12.entryRecorded'), kind: 'ok' };
        } catch (err) {
          financeNotice = { text: err.message, kind: 'error' };
        } finally {
          busyAction = false;
          if (activePanel === 'finance') renderFinancePanel();
        }
      });

      form.append(fGrid, submitBtn);
      formCard.append(form);
      mid.append(srcCard, formCard);
      container.append(mid);

      // Ledger Table with Source Filter
      const ledCard = el('section', null, 'v12-section');
      const ledHead = el('div', null, 'v12-section-head');
      ledHead.append(el('h3', t('v12.ledgerTitle')));

      const filterSel = el('select');
      filterSel.id = 'v12LedgerFilter';
      filterSel.setAttribute('aria-label', t('v12.filterSourceLabel'));
      const optAll = el('option', t('v12.filterAllSources'));
      optAll.value = '';
      filterSel.append(optAll);
      for (const k of SOURCES) {
        const o = el('option', sourceLabel(k));
        o.value = k;
        filterSel.append(o);
      }
      filterSel.value = sourceFilter;
      filterSel.addEventListener('change', async () => {
        sourceFilter = filterSel.value;
        if (!isLocalDemo()) await fetchFinanceLive();
        if (activePanel === 'finance') renderFinancePanel();
      });
      ledHead.append(filterSel);
      ledCard.append(ledHead);

      const rows = (fin.entries || []).filter(r => !sourceFilter || r.source === sourceFilter);
      if (!rows.length) {
        ledCard.append(el('p', t('v12.ledgerEmpty'), 'v12-empty'));
      } else {
        const scroll = el('div', null, 'table-scroll');
        const tbl = el('table', null, 'v12-table');
        const thead = el('thead');
        const htr = el('tr');
        for (const [lbl, cls] of [
          [t('v12.ledgerColDate'), ''],
          [t('v12.ledgerColSource'), ''],
          [t('v12.ledgerColNote'), ''],
          [t('v12.ledgerColType'), ''],
          [t('v12.ledgerColAmount'), 'v12-num'],
          [t('v12.ledgerColAction'), 'v12-num']
        ]) htr.append(el('th', lbl, cls));
        thead.append(htr);
        tbl.append(thead);

        const tbody = el('tbody');
        for (const row of rows) {
          const tr = el('tr');
          const dVal = row.date ? String(row.date).slice(0, 10) : todayISO();
          tr.append(el('td', dVal, 'v12-mono'));
          const sTd = el('td');
          sTd.append(el('span', sourceLabel(row.source), 'v12-pill'));
          tr.append(sTd);
          tr.append(el('td', row.note || '—'));
          const isExp = row.type === 'expense';
          tr.append(el('td', t(isExp ? 'v12.typeExpense' : 'v12.typeIncome'), 'v12-muted'));
          tr.append(el('td', fmtLedgerAmount(row), 'v12-num ' + (isExp ? 'v12-amount-neg' : 'v12-amount-pos')));

          const actTd = el('td', null, 'v12-num');
          const delBtn = el('button', t('v12.btnDelete'), 'v12-btn-compact v12-btn-danger');
          delBtn.type = 'button';
          delBtn.addEventListener('click', async () => {
            if (busyAction) return;
            busyAction = true;
            try {
              if (isLocalDemo()) {
                const idx = demoState.entries.findIndex(e => e.id === row.id);
                if (idx >= 0) demoState.entries.splice(idx, 1);
                updateSidebar();
              } else {
                await req('DELETE', '/finance/entry/' + encodeURIComponent(row.id));
                await fetchFinanceLive();
              }
              financeNotice = { text: t('v12.entryDeleted'), kind: 'ok' };
            } catch (err) {
              financeNotice = { text: err.message, kind: 'error' };
            } finally {
              busyAction = false;
              if (activePanel === 'finance') renderFinancePanel();
            }
          });
          actTd.append(delBtn);
          tr.append(actTd);
          tbody.append(tr);
        }
        tbl.append(tbody);
        scroll.append(tbl);
        ledCard.append(scroll);
      }
      container.append(ledCard);
    }

    // ===== PANEL 2: VIDEO SHORT AUTOMATION WORKFLOW =====
    function buildPipelineSvg(wf, activeStageId, onSelectStage) {
      const svg = svgEl('svg', {
        viewBox: '0 0 912 138',
        class: 'v12-pipeline-svg',
        role: 'group',
        'aria-label': t('v12.shortsPipelineAria')
      });

      const nodeW = 132;
      const nodeH = 98;
      const gap = 20;
      const startX = 10;
      const y = 20;

      // Connector edges
      for (let i = 0; i < STAGES.length - 1; i++) {
        const st = wf?.stages?.[i];
        const x1 = startX + i * (nodeW + gap) + nodeW;
        const x2 = x1 + gap;
        const cy = y + nodeH / 2;
        const done = st?.status === 'done';
        svg.append(svgEl('line', {
          x1, y1: cy, x2: x2 - 4, y2: cy,
          class: 'v12-edge' + (done ? ' done' : '')
        }));
        svg.append(svgEl('path', {
          d: `M ${x2 - 8} ${cy - 4} L ${x2 - 2} ${cy} L ${x2 - 8} ${cy + 4}`,
          class: 'v12-edge' + (done ? ' done' : '')
        }));
      }

      // 6 interactive specialist stage nodes
      STAGES.forEach((def, i) => {
        const st = wf?.stages?.[i] || { id: def.id, status: 'pending', hitl: def.hitl };
        const x = startX + i * (nodeW + gap);
        const g = svgEl('g', {
          class: 'v12-node' + (activeStageId === def.id ? ' selected' : ''),
          'data-stage': def.id,
          'data-state': st.status,
          tabindex: '0',
          role: 'button',
          'aria-pressed': String(activeStageId === def.id),
          'aria-label': (i + 1) + '. ' + t('v12.stage.' + def.id) + ' · ' + t('v12.stageStatus.' + (st.status || 'pending'))
        });

        g.append(svgEl('rect', {
          x, y, width: nodeW, height: nodeH, rx: 10, ry: 10,
          class: 'v12-node-box'
        }));

        // Stage index + HITL tag
        const idxText = svgEl('text', { x: x + 11, y: y + 20, class: 'v12-node-role' });
        idxText.textContent = String(i + 1);
        g.append(idxText);

        if (def.hitl) {
          g.append(svgEl('rect', {
            x: x + nodeW - 44, y: y + 9, width: 34, height: 16, rx: 4,
            class: 'v12-hitl-tag-bg'
          }));
          const tag = svgEl('text', {
            x: x + nodeW - 27, y: y + 20, 'text-anchor': 'middle', class: 'v12-hitl-tag-text'
          });
          tag.textContent = t('v12.hitlBadge');
          g.append(tag);
        }

        const title = svgEl('text', { x: x + 11, y: y + 46, class: 'v12-node-title' });
        title.textContent = t('v12.stage.' + def.id);
        g.append(title);

        const role = svgEl('text', { x: x + 11, y: y + 64, class: 'v12-node-role' });
        role.textContent = t('v12.stageRole.' + def.id);
        g.append(role);

        const statusLbl = svgEl('text', { x: x + 11, y: y + 85, class: 'v12-node-state' });
        statusLbl.textContent = t('v12.stageStatus.' + (st.status || 'pending'));
        g.append(statusLbl);

        g.addEventListener('click', () => onSelectStage(def.id));
        g.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectStage(def.id);
          }
        });
        svg.append(g);
      });

      return svg;
    }

    function renderShortsPanel() {
      const content = $('panelContent');
      if (!content) return;
      content.replaceChildren();
      content.classList.add('v12-panel');

      const { shorts } = currentData();
      const workflows = shorts.workflows || [];
      let wf = workflows.find(w => w.id === selectedWorkflowId) || workflows[0] || null;
      selectedWorkflowId = wf ? wf.id : null;
      if (wf && (!selectedStageId || !STAGES.some(s => s.id === selectedStageId))) {
        selectedStageId = wf.currentStage || 'brief';
      }

      // Top toolbar: workflow selector + new short button + refresh + focus studio
      const topBar = el('div', null, 'v12-wf-toolbar');
      const selRow = el('div', null, 'v12-wf-select-row');

      if (workflows.length) {
        const sel = el('select');
        sel.id = 'v12ShortSelect';
        sel.setAttribute('aria-label', t('v12.shortsSelectLabel'));
        for (const item of workflows) {
          const opt = el('option', item.title + ' · ' + t('v12.wfStatus.' + (item.status || 'in_progress')));
          opt.value = item.id;
          sel.append(opt);
        }
        sel.value = wf.id;
        sel.addEventListener('change', () => {
          selectedWorkflowId = sel.value;
          const next = workflows.find(w => w.id === selectedWorkflowId);
          selectedStageId = next?.currentStage || 'brief';
          shortsNotice = { text: '', kind: '' };
          renderShortsPanel();
        });
        selRow.append(sel);
      }

      const newBtn = el('button', t('v12.shortsNewToggle'), showComposer || !wf ? 'v12-btn-compact v12-btn-primary' : 'v12-btn-compact');
      newBtn.type = 'button';
      newBtn.id = 'v12ToggleComposer';
      newBtn.addEventListener('click', () => {
        showComposer = !showComposer;
        renderShortsPanel();
      });
      selRow.append(newBtn);

      const tools = el('div', null, 'v12-btn-row');
      if (isLocalDemo()) tools.append(el('span', t('v12.demoModeTag'), 'v12-pill warn'));

      const refBtn = el('button', t('v12.refresh'), 'v12-btn-compact');
      refBtn.type = 'button';
      refBtn.disabled = busyAction;
      refBtn.addEventListener('click', async () => {
        if (!isLocalDemo()) await fetchShortsLive();
        if (activePanel === 'shorts') renderShortsPanel();
      });

      const studioBtn = el('button', t('v12.focusStudioRoom'), 'v12-btn-compact');
      studioBtn.type = 'button';
      studioBtn.addEventListener('click', () => {
        $('panel')?.close();
        focusZone('studio');
      });

      tools.append(refBtn, studioBtn);
      topBar.append(selRow, tools);
      content.append(topBar);

      if (shortsNotice.text) {
        const note = el('div', shortsNotice.text, 'v12-notice' + (shortsNotice.kind ? ' ' + shortsNotice.kind : ''));
        note.setAttribute('role', 'status');
        content.append(note);
      }

      // [Diubah oleh Gemini - 2026-11-20] Banner Sinkronisasi Workspace Proyek (GET /workflows/workspace): tampilkan channel, aturan AGENTS.md/LEARNINGS.md, dan daftar reel lokal aktif.
      const ws = shorts.workspace || {};
      const wsChannels = Array.isArray(ws.channels) ? ws.channels : [];
      const wsBanner = el('section', null, 'v13-ws-banner');
      wsBanner.id = 'v13WorkspaceBanner';

      const wsHead = el('div', null, 'v13-ws-head');
      const wsTitle = el('div', null, 'v13-ws-title');
      wsTitle.append(el('strong', t('v13.wsBannerTitle')));
      const wsSynced = Boolean(ws.configured && ws.valid);
      wsTitle.append(el(
        'span',
        wsSynced ? t('v13.wsStatusSynced', { root: ws.rootName || 'Workspace' }) : t('v13.wsStatusUnconfigured'),
        'v12-pill ' + (wsSynced ? 'pos' : '')
      ));
      const rulesCount = Number(ws.rulesCount ?? ws.rulesSummary?.length ?? 0) || 0;
      if (rulesCount > 0 || wsSynced) {
        wsTitle.append(el('span', t('v13.wsRulesLoaded', { count: rulesCount }), 'v12-pill warn'));
      }

      const wsSyncBtn = el('button', t('v13.wsSyncBtn'), 'v12-btn-compact');
      wsSyncBtn.type = 'button';
      wsSyncBtn.id = 'v13SyncWorkspaceBtn';
      wsSyncBtn.disabled = busyAction;
      wsSyncBtn.addEventListener('click', async () => {
        if (busyAction) return;
        busyAction = true;
        shortsNotice = { text: '', kind: '' };
        try {
          if (!isLocalDemo()) {
            await fetchShortsLive();
          } else {
            demoState.workspace.syncedAt = new Date().toISOString();
          }
          shortsNotice = { text: t('v13.wsSyncedOk'), kind: 'ok' };
        } catch (err) {
          shortsNotice = { text: err.message, kind: 'error' };
        } finally {
          busyAction = false;
          if (activePanel === 'shorts') renderShortsPanel();
        }
      });
      wsHead.append(wsTitle, wsSyncBtn);
      wsBanner.append(wsHead);

      if (wsChannels.length) {
        const chRow = el('div', null, 'v13-chip-row');
        chRow.append(el('span', t('v13.wsChannelsDetected', { count: wsChannels.length }), 'v13-chip-label'));
        for (const ch of wsChannels) {
          const badge = el('button', ch.name, 'v12-pill');
          badge.type = 'button';
          badge.addEventListener('click', () => {
            showComposer = true;
            if (isLocalDemo()) demoState.shortsConfig.defaultChannel = ch.name;
            else state.shorts.config.defaultChannel = ch.name;
            renderShortsPanel();
            const chEl = $('v12ShortChannel');
            if (chEl) chEl.value = ch.name;
          });
          chRow.append(badge);
        }
        wsBanner.append(chRow);

        const activeReels = [];
        for (const ch of wsChannels) {
          for (const r of (ch.activeReels || [])) {
            const slug = typeof r === 'string' ? r : (r?.slug || r?.name || '');
            if (slug) activeReels.push(`${ch.name}/${slug}`);
          }
        }
        if (activeReels.length) {
          const reelRow = el('div', null, 'v13-chip-row');
          reelRow.append(el('span', t('v13.wsActiveReels', { count: activeReels.length }), 'v13-chip-label'));
          for (const item of activeReels.slice(0, 8)) {
            reelRow.append(el('span', item, 'v12-pill'));
          }
          wsBanner.append(reelRow);
        }
      } else {
        wsBanner.append(el('p', t('v13.wsNoChannels'), 'v12-muted'));
      }
      content.append(wsBanner);

      // Interactive 6-Stage SVG Pipeline Graph
      const pipeWrap = el('section', null, 'v12-pipeline-wrap');
      pipeWrap.append(buildPipelineSvg(wf, selectedStageId || 'brief', stageId => {
        selectedStageId = stageId;
        renderShortsPanel();
      }));
      content.append(pipeWrap);

      // Composer form (always visible when no workflow yet, or toggled open)
      if (!wf || showComposer) {
        const comp = el('section', null, 'v12-section');
        const cHead = el('div', null, 'v12-section-head');
        cHead.append(el('h3', t('v12.shortsComposerTitle')));
        comp.append(cHead);

        const form = el('form');
        const grid = el('div', null, 'v12-form-grid');

        const titleWrap = el('div', null, 'v12-field full');
        const titleLbl = el('label', t('v12.shortsFieldTitle'));
        titleLbl.htmlFor = 'v12ShortTitle';
        const titleInput = el('input');
        titleInput.type = 'text';
        titleInput.id = 'v12ShortTitle';
        titleInput.required = true;
        titleInput.maxLength = 140;
        titleWrap.append(titleLbl, titleInput);

        const chWrap = el('div', null, 'v12-field');
        const chLbl = el('label', t('v12.shortsFieldChannel'));
        chLbl.htmlFor = 'v12ShortChannel';
        const chInput = el('input');
        chInput.type = 'text';
        chInput.id = 'v12ShortChannel';
        chInput.value = shorts.config?.defaultChannel || wsChannels[0]?.name || '';
        chInput.maxLength = 64;
        if (wsChannels.length) {
          chInput.setAttribute('list', 'v13WorkspaceChannelList');
          const dl = el('datalist');
          dl.id = 'v13WorkspaceChannelList';
          for (const ch of wsChannels) {
            const opt = el('option');
            opt.value = ch.name;
            dl.append(opt);
          }
          const chQuickSel = el('select');
          chQuickSel.id = 'v13ShortChannelSelect';
          chQuickSel.setAttribute('aria-label', t('v13.wsSelectChannelHint'));
          for (const ch of wsChannels) {
            const o = el('option', ch.name);
            o.value = ch.name;
            chQuickSel.append(o);
          }
          if (wsChannels.some(c => c.name === chInput.value)) {
            chQuickSel.value = chInput.value;
          }
          chQuickSel.addEventListener('change', () => {
            chInput.value = chQuickSel.value;
          });
          chWrap.append(chLbl, chQuickSel, chInput, dl);
        } else {
          chWrap.append(chLbl, chInput);
        }

        const modeWrap = el('div', null, 'v12-field');
        const modeLbl = el('label', t('v12.shortsFieldMode'));
        modeLbl.htmlFor = 'v12ShortMode';
        const modeSel = el('select');
        modeSel.id = 'v12ShortMode';
        for (const [val, key] of [
          ['auto', 'v12.shortsModeAuto'],
          ['gemini', 'v12.shortsModeGemini'],
          ['local', 'v12.shortsModeLocal']
        ]) {
          const o = el('option', t(key));
          o.value = val;
          modeSel.append(o);
        }
        modeWrap.append(modeLbl, modeSel);

        grid.append(titleWrap, chWrap, modeWrap);
        const startBtn = el('button', t('v12.shortsBtnStart'), 'v12-btn-primary');
        startBtn.type = 'submit';
        startBtn.id = 'v12StartShort';
        startBtn.style.marginTop = '12px';
        startBtn.disabled = busyAction;

        form.addEventListener('submit', async e => {
          e.preventDefault();
          if (busyAction) return;
          const title = titleInput.value.trim();
          if (!title) {
            shortsNotice = { text: t('v12.shortsTitleRequired'), kind: 'error' };
            renderShortsPanel();
            return;
          }
          const payload = {
            title,
            topic: title,
            channel: chInput.value.trim(),
            mode: modeSel.value
          };
          busyAction = true;
          shortsNotice = { text: '', kind: '' };
          try {
            if (isLocalDemo()) {
              createDemoWorkflow(payload);
            } else {
              const res = await req('POST', '/workflows/shorts', payload);
              await fetchShortsLive();
              const created = normalizeWorkflow(res?.workflow || res);
              if (created?.id) {
                selectedWorkflowId = created.id;
                selectedStageId = created.currentStage || 'brief';
              }
              emitWorkflow({ type: 'workflow_update', workflow: created });
            }
            showComposer = false;
            shortsNotice = { text: t('v12.shortsCreated'), kind: 'ok' };
          } catch (err) {
            shortsNotice = { text: err.message, kind: 'error' };
          } finally {
            busyAction = false;
            if (activePanel === 'shorts') renderShortsPanel();
          }
        });

        form.append(grid, startBtn);
        comp.append(form);
        content.append(comp);
      }

      // Active Stage Output & HITL Approval Inspector
      if (!wf) {
        content.append(el('p', t('v12.shortsNoWorkflow'), 'v12-empty'));
      } else {
        const stageObj = wf.stages.find(s => s.id === selectedStageId) || wf.stages[wf.currentStageIndex] || wf.stages[0];
        const isCurrentStage = stageObj.id === wf.currentStage;
        const canRunStage = isCurrentStage && !['done', 'awaiting_approval', 'running'].includes(stageObj.status) && !['completed', 'ready_to_publish'].includes(wf.status);
        const needsApproval = stageObj.status === 'awaiting_approval' || (isCurrentStage && wf.status === 'awaiting_approval');

        // HITL Approval Gate (strict autoApprove: false)
        if (needsApproval) {
          const hitl = el('section', null, 'v12-hitl-banner');
          const hHead = el('div', null, 'v12-hitl-head');
          hHead.append(
            el('strong', t('v12.shortsHitlBannerTitle')),
            el('span', t('v12.stage.' + stageObj.id), 'v12-pill warn')
          );
          hitl.append(hHead);
          hitl.append(el('p', stageObj.id === 'qa_publish' ? t('v12.shortsHitlPublishWarning') : t('v12.shortsHitlBannerDesc')));

          const actRow = el('div', null, 'v12-hitl-actions');
          const fbWrap = el('div', null, 'v12-field');
          const fbLbl = el('label', t('v12.shortsFeedbackLabel'));
          fbLbl.htmlFor = 'v12HitlFeedback';
          const fbInput = el('textarea');
          fbInput.id = 'v12HitlFeedback';
          fbInput.maxLength = 500;
          fbWrap.append(fbLbl, fbInput);

          const btns = el('div', null, 'v12-btn-row');
          const approveBtn = el('button', t('v12.shortsBtnApprove'), 'v12-btn-primary');
          approveBtn.type = 'button';
          approveBtn.id = 'v12ApproveStage';
          approveBtn.disabled = busyAction;
          approveBtn.addEventListener('click', async () => {
            if (busyAction) return;
            busyAction = true;
            shortsNotice = { text: '', kind: '' };
            try {
              if (isLocalDemo()) {
                approveDemoWorkflow(wf.id);
              } else {
                const res = await req('POST', '/workflows/shorts/' + encodeURIComponent(wf.id) + '/approve', {});
                await fetchShortsLive();
                const updated = state.shorts.workflows.find(w => w.id === wf.id) || normalizeWorkflow(res?.workflow || res);
                if (updated) selectedStageId = updated.currentStage;
                emitWorkflow({ type: 'workflow_update', workflow: updated, approved: true });
              }
              shortsNotice = { text: t('v12.shortsApproved'), kind: 'ok' };
            } catch (err) {
              shortsNotice = { text: err.message, kind: 'error' };
            } finally {
              busyAction = false;
              if (activePanel === 'shorts') renderShortsPanel();
            }
          });

          const rejectBtn = el('button', t('v12.shortsBtnReject'), 'v12-btn-danger');
          rejectBtn.type = 'button';
          rejectBtn.id = 'v12RejectStage';
          rejectBtn.disabled = busyAction;
          rejectBtn.addEventListener('click', async () => {
            if (busyAction) return;
            const feedback = fbInput.value.trim();
            busyAction = true;
            shortsNotice = { text: '', kind: '' };
            try {
              if (isLocalDemo()) {
                rejectDemoWorkflow(wf.id, feedback);
              } else {
                const res = await req('POST', '/workflows/shorts/' + encodeURIComponent(wf.id) + '/reject', { feedback });
                await fetchShortsLive();
                const updated = state.shorts.workflows.find(w => w.id === wf.id) || normalizeWorkflow(res?.workflow || res);
                emitWorkflow({ type: 'workflow_update', workflow: updated, rejected: true });
              }
              shortsNotice = { text: t('v12.shortsRejected'), kind: 'ok' };
            } catch (err) {
              shortsNotice = { text: err.message, kind: 'error' };
            } finally {
              busyAction = false;
              if (activePanel === 'shorts') renderShortsPanel();
            }
          });

          btns.append(approveBtn, rejectBtn);
          actRow.append(fbWrap, btns);
          hitl.append(actRow);
          content.append(hitl);
        }

        // Stage Detail Card
        const card = el('section', null, 'v12-section');
        const head = el('div', null, 'v12-section-head');
        const leftInfo = el('div');
        leftInfo.append(
          el('h3', t('v12.shortsStageTitle', { stage: t('v12.stage.' + stageObj.id) })),
          el('p', t('v12.shortsOwnerLabel', { owner: t('v12.stageRole.' + stageObj.id) }), 'v12-muted')
        );

        const rightInfo = el('div', null, 'v12-btn-row');
        const pillCls = stageObj.status === 'done' ? 'pos'
          : stageObj.status === 'awaiting_approval' ? 'warn'
          : stageObj.status === 'revision' ? 'neg' : '';
        rightInfo.append(el('span', t('v12.stageStatus.' + (stageObj.status || 'pending')), 'v12-pill ' + pillCls));

        if (canRunStage) {
          const runBtn = el('button', busyAction ? t('v12.shortsRunning') : t('v12.shortsRunStage'), 'v12-btn-primary v12-btn-compact');
          runBtn.type = 'button';
          runBtn.id = 'v12RunStage';
          runBtn.disabled = busyAction;
          runBtn.addEventListener('click', async () => {
            if (busyAction) return;
            busyAction = true;
            shortsNotice = { text: '', kind: '' };
            renderShortsPanel();
            try {
              if (isLocalDemo()) {
                stepDemoWorkflow(wf.id);
              } else {
                const res = await req('POST', '/workflows/shorts/' + encodeURIComponent(wf.id) + '/step', {});
                await fetchShortsLive();
                const updated = state.shorts.workflows.find(w => w.id === wf.id) || normalizeWorkflow(res?.workflow || res);
                if (updated) selectedStageId = updated.currentStage;
                emitWorkflow({ type: 'workflow_update', workflow: updated });
              }
            } catch (err) {
              shortsNotice = { text: err.message, kind: 'error' };
            } finally {
              busyAction = false;
              if (activePanel === 'shorts') renderShortsPanel();
            }
          });
          rightInfo.append(runBtn);
        }

        const delWfBtn = el('button', t('v12.shortsBtnDelete'), 'v12-btn-compact v12-btn-danger');
        delWfBtn.type = 'button';
        delWfBtn.disabled = busyAction;
        delWfBtn.addEventListener('click', async () => {
          if (busyAction) return;
          busyAction = true;
          try {
            if (isLocalDemo()) {
              const idx = demoState.workflows.findIndex(w => w.id === wf.id);
              if (idx >= 0) demoState.workflows.splice(idx, 1);
              selectedWorkflowId = null;
              selectedStageId = null;
              updateSidebar();
            } else {
              await req('DELETE', '/workflows/shorts/' + encodeURIComponent(wf.id));
              selectedWorkflowId = null;
              selectedStageId = null;
              await fetchShortsLive();
            }
            shortsNotice = { text: t('v12.shortsDeleted'), kind: 'ok' };
          } catch (err) {
            shortsNotice = { text: err.message, kind: 'error' };
          } finally {
            busyAction = false;
            if (activePanel === 'shorts') renderShortsPanel();
          }
        });
        rightInfo.append(delWfBtn);

        head.append(leftInfo, rightInfo);
        card.append(head);

        const outputText = typeof stageObj.output === 'string'
          ? stageObj.output.trim()
          : (stageObj.output ? JSON.stringify(stageObj.output, null, 2) : '');
        if (outputText) {
          card.append(el('div', outputText, 'v12-stage-sheet'));
        } else {
          card.append(el('p', t('v12.shortsStagePendingHint'), 'v12-empty'));
        }

        // [Diubah oleh Gemini - 2026-11-20] Tampilkan daftar aturan workspace yang diterapkan (rulesApplied) pada lembar keluaran tahap Video Short.
        const appliedRules = Array.isArray(stageObj.rulesApplied) && stageObj.rulesApplied.length
          ? stageObj.rulesApplied
          : (outputText && Array.isArray(ws.rulesSummary) ? ws.rulesSummary.slice(0, 6) : []);
        if (appliedRules.length) {
          const rulesBox = el('div', null, 'v13-rules-box');
          rulesBox.id = 'v13StageRulesApplied';
          rulesBox.append(el('strong', t('v13.wsRulesAppliedTitle', { count: appliedRules.length })));
          const ul = el('ul', null, 'v13-rules-list');
          for (const rule of appliedRules.slice(0, 8)) {
            const label = typeof rule === 'string' ? rule : (rule?.summary || rule?.rule || rule?.source || JSON.stringify(rule));
            ul.append(el('li', label));
          }
          rulesBox.append(ul);
          card.append(rulesBox);
        }

        const expPath = stageObj.exportPath || wf.exportDir;
        if (expPath) {
          const pNote = el('p', t('v12.shortsExportPath', { path: expPath }), 'v12-muted');
          pNote.style.marginTop = '8px';
          card.append(pNote);
        }
        content.append(card);
      }

      // Collapsible Action Log
      const logs = shorts.actionLog || [];
      const logDetails = el('details', null, 'v12-disclosure');
      logDetails.append(el('summary', t('v12.shortsLogSummary', { count: logs.length })));
      const logBody = el('div', null, 'v12-disclosure-body');
      if (!logs.length) {
        logBody.append(el('p', t('v12.shortsLogEmpty'), 'v12-empty'));
      } else {
        const ul = el('ul', null, 'v12-action-log');
        for (const item of logs.slice(0, 40)) {
          const li = el('li');
          const stamp = item.time || item.at || item.timestamp;
          li.append(
            el('span', stamp ? I18n.time(stamp) : '—', 'v12-log-time'),
            el('span', item.message || item.action || item.summary || String(item.stage || ''))
          );
          ul.append(li);
        }
        logBody.append(ul);
      }
      logDetails.append(logBody);
      content.append(logDetails);

      // Collapsible Dual Integration Settings (Local Project Folder + BYOK Gemini API Key)
      const cfg = shorts.config || {};
      const cfgDetails = el('details', null, 'v12-disclosure');
      cfgDetails.append(el('summary', t('v12.shortsConfigSummary')));
      const cfgBody = el('div', null, 'v12-disclosure-body');

      // Masked key status bar (never displays raw API key!)
      const keyRow = el('div', null, 'v12-key-row');
      const keyBadge = el(
        'span',
        cfg.hasGeminiKey
          ? t('v12.shortsConfigKeyStatusSet', { hint: cfg.keyHint || '…****' })
          : t('v12.shortsConfigKeyStatusNone'),
        'v12-pill ' + (cfg.hasGeminiKey ? 'pos' : '')
      );
      keyRow.append(keyBadge);

      if (cfg.hasGeminiKey) {
        const clearBtn = el('button', t('v12.shortsConfigClearKey'), 'v12-btn-compact v12-btn-danger');
        clearBtn.type = 'button';
        clearBtn.disabled = busyAction;
        clearBtn.addEventListener('click', async () => {
          if (busyAction) return;
          busyAction = true;
          try {
            if (isLocalDemo()) {
              demoState.shortsConfig.hasGeminiKey = false;
              demoState.shortsConfig.keyHint = '';
            } else {
              await req('POST', '/workflows/config', { clearGeminiKey: true });
              await fetchShortsLive();
            }
            shortsNotice = { text: t('v12.shortsConfigSaved'), kind: 'ok' };
          } catch (err) {
            shortsNotice = { text: err.message, kind: 'error' };
          } finally {
            busyAction = false;
            if (activePanel === 'shorts') renderShortsPanel();
          }
        });
        keyRow.append(clearBtn);
      }
      cfgBody.append(keyRow);

      const cfgForm = el('form');
      const cfgGrid = el('div', null, 'v12-form-grid');

      const dirWrap = el('div', null, 'v12-field full');
      const dirLbl = el('label', t('v12.shortsConfigLocalDir'));
      dirLbl.htmlFor = 'v12CfgLocalDir';
      const dirInput = el('input');
      dirInput.type = 'text';
      dirInput.id = 'v12CfgLocalDir';
      dirInput.value = cfg.localProjectDir || '';
      dirWrap.append(dirLbl, dirInput);

      const defChWrap = el('div', null, 'v12-field');
      const defChLbl = el('label', t('v12.shortsConfigChannel'));
      defChLbl.htmlFor = 'v12CfgChannel';
      const defChInput = el('input');
      defChInput.type = 'text';
      defChInput.id = 'v12CfgChannel';
      defChInput.value = cfg.defaultChannel || '';
      defChWrap.append(defChLbl, defChInput);

      const modWrap = el('div', null, 'v12-field');
      const modLbl = el('label', t('v12.shortsConfigModel'));
      modLbl.htmlFor = 'v12CfgModel';
      const modInput = el('input');
      modInput.type = 'text';
      modInput.id = 'v12CfgModel';
      modInput.value = cfg.geminiModel || 'gemini-2.5-flash';
      modWrap.append(modLbl, modInput);

      const keyWrap = el('div', null, 'v12-field full');
      const keyLbl = el('label', t('v12.shortsConfigKey'));
      keyLbl.htmlFor = 'v12CfgGeminiKey';
      const keyInput = el('input');
      keyInput.type = 'password';
      keyInput.id = 'v12CfgGeminiKey';
      keyInput.autocomplete = 'off';
      keyWrap.append(keyLbl, keyInput);

      cfgGrid.append(dirWrap, defChWrap, modWrap, keyWrap);
      const saveCfgBtn = el('button', t('v12.shortsConfigSave'), 'v12-btn-primary');
      saveCfgBtn.type = 'submit';
      saveCfgBtn.id = 'v12SaveShortConfig';
      saveCfgBtn.style.marginTop = '12px';
      saveCfgBtn.disabled = busyAction;

      cfgForm.addEventListener('submit', async e => {
        e.preventDefault();
        if (busyAction) return;
        const payload = {
          localProjectDir: dirInput.value.trim(),
          defaultChannel: defChInput.value.trim(),
          geminiModel: modInput.value.trim() || 'gemini-2.5-flash'
        };
        const rawKey = keyInput.value.trim();
        if (rawKey) payload.geminiApiKey = rawKey;
        busyAction = true;
        shortsNotice = { text: '', kind: '' };
        try {
          if (isLocalDemo()) {
            demoState.shortsConfig.localProjectDir = payload.localProjectDir;
            demoState.shortsConfig.defaultChannel = payload.defaultChannel;
            demoState.shortsConfig.geminiModel = payload.geminiModel;
            if (rawKey) {
              demoState.shortsConfig.hasGeminiKey = true;
              demoState.shortsConfig.keyHint = '...' + rawKey.slice(-4);
            }
          } else {
            await req('POST', '/workflows/config', payload);
            await fetchShortsLive();
          }
          shortsNotice = { text: t('v12.shortsConfigSaved'), kind: 'ok' };
        } catch (err) {
          shortsNotice = { text: err.message, kind: 'error' };
        } finally {
          busyAction = false;
          if (activePanel === 'shorts') renderShortsPanel();
        }
      });

      cfgForm.append(cfgGrid, saveCfgBtn);
      cfgBody.append(cfgForm);
      cfgDetails.append(cfgBody);
      content.append(cfgDetails);
    }

    // ===== Public Open / Close / Sync API =====
    // [Diubah oleh Gemini - 2026-11-20] Panggil before?.() sebelum ++generation agar closeAllPanels() tidak menggugurkan re-render pasca-fetch
    async function openFinance(initialTab = 'mt5') {
      before?.();
      const g = ++generation;
      activePanel = 'finance';
      financeTab = ['mt5', 'finance', 'analytics'].includes(initialTab) ? initialTab : 'mt5';
      financeNotice = { text: '', kind: '' };
      showModalTitle(t('v12.financeTitle'));
      renderFinancePanel();
      if (!isLocalDemo()) {
        await fetchFinanceLive();
        if (g === generation && activePanel === 'finance' && $('panel')?.open) {
          renderFinancePanel();
        }
      }
    }

    // V14-A + V15 [Diubah oleh Gemini - 2026-11-21] Panel nyata untuk mode Live + hubungkan tombol Pusat Setup & Prompt
    let pipelineUI = null;
    async function openShorts(initialWorkflowId = null) {
      if (!isLocalDemo() && window.OfficeShortUI) {
        pipelineUI ||= window.OfficeShortUI.create({dialog: showModalTitle, before, onOpenSetup, onOpenPrompt});
        return pipelineUI.open(initialWorkflowId);
      }
      before?.();
      const g = ++generation;
      activePanel = 'shorts';
      if (initialWorkflowId) {
        selectedWorkflowId = String(initialWorkflowId);
        showComposer = false;
      }
      shortsNotice = { text: '', kind: '' };
      showModalTitle(t('v12.shortsTitle'));
      renderShortsPanel();
      if (!isLocalDemo()) {
        await fetchShortsLive();
        if (initialWorkflowId) {
          const found = state.shorts.workflows.find(w => w.id === String(initialWorkflowId));
          if (found) {
            selectedWorkflowId = found.id;
            selectedStageId = found.currentStage || 'brief';
          }
        }
        if (g === generation && activePanel === 'shorts' && $('panel')?.open) {
          renderShortsPanel();
        }
      }
    }

    function close() {
      pipelineUI?.close(); // V14-A
      generation++;
      activePanel = null;
      $('panelContent')?.classList.remove('v12-panel');
    }

    async function refresh() {
      if (!isLocalDemo()) {
        await Promise.all([fetchFinanceLive(), fetchShortsLive()]);
      } else {
        updateSidebar();
      }
      if (activePanel === 'finance' && $('panel')?.open) renderFinancePanel();
      if (activePanel === 'shorts' && $('panel')?.open) renderShortsPanel();
    }

    function handleEvent(evt) {
      if (!evt || typeof evt !== 'object' || evt.demo) return;
      if (evt.type === 'mt5_heartbeat') {
        const previousAt = Date.parse(state.mt5.lastUpdated || '');
        if (!Number.isFinite(previousAt) || Date.parse(evt.lastUpdated || '') >= previousAt) state.mt5.lastUpdated = evt.lastUpdated;
        updateFreshness(currentData().mt5);
        return;
      }
      if (evt.type === 'mt5_state' && evt.state) {
        mt5PushRevision++;
        state.mt5 = normalizeMt5(evt.state);
        updateSidebar();
        if (activePanel === 'finance' && $('panel')?.open) renderFinancePanel();
      } else if (evt.type === 'mt5_deal_closed' || evt.type === 'finance_updated' || evt.type === 'finance_update') {
        if (evt.summary) state.finance = normalizeFinance(evt.summary, null);
        if (evt.mt5 || evt.summary?.mt5) state.mt5 = normalizeMt5(evt.mt5 || evt.summary.mt5);
        updateSidebar();
        if (!isLocalDemo()) fetchFinanceLive().then(() => {
          if (activePanel === 'finance' && $('panel')?.open) renderFinancePanel();
        });
      } else if (evt.type === 'workflow_update') {
        if (evt.workflow) {
          const wf = normalizeWorkflow(evt.workflow);
          if (wf) {
            const idx = state.shorts.workflows.findIndex(w => w.id === wf.id);
            if (idx >= 0) state.shorts.workflows[idx] = wf;
            else state.shorts.workflows.unshift(wf);
          }
        }
        if (evt.action) state.shorts.actionLog.unshift(evt.action);
        updateSidebar();
        if (activePanel === 'shorts' && $('panel')?.open) renderShortsPanel();
      } else if (evt.type === 'workflow_deleted') {
        if (evt.deletedId) {
          state.shorts.workflows = state.shorts.workflows.filter(w => w.id !== evt.deletedId);
          if (selectedWorkflowId === evt.deletedId) {
            selectedWorkflowId = state.shorts.workflows[0]?.id || null;
            selectedStageId = state.shorts.workflows[0]?.currentStage || null;
          }
        }
        if (evt.action) state.shorts.actionLog.unshift(evt.action);
        updateSidebar();
        if (activePanel === 'shorts' && $('panel')?.open) renderShortsPanel();
      } else if (evt.type === 'workflow_config') {
        if (evt.config && typeof evt.config === 'object') {
          state.shorts.config = { ...state.shorts.config, ...evt.config, autoApprove: false };
        }
        if (evt.action) state.shorts.actionLog.unshift(evt.action);
        updateSidebar();
        if (activePanel === 'shorts' && $('panel')?.open) renderShortsPanel();
      }
    }

    $('panel')?.addEventListener('close', () => {
      if (activePanel) close();
    });

    I18n.subscribe(() => {
      updateSidebar();
      if (!$('panel')?.open) return;
      if (activePanel === 'finance') {
        if ($('panelTitle')) $('panelTitle').textContent = t('v12.financeTitle');
        renderFinancePanel();
      } else if (activePanel === 'shorts') {
        if ($('panelTitle')) $('panelTitle').textContent = t('v12.shortsTitle');
        renderShortsPanel();
      }
    });

    updateSidebar();

    return {
      openFinance,
      openShorts,
      open(kind) {
        if (kind === 'shorts') return openShorts();
        if (kind === 'finance') return openFinance('finance');
        if (kind === 'analytics') return openFinance('analytics');
        return openFinance('mt5');
      },
      createDemoWorkflowFromRecommendation(rec) {
        if (!rec) return null;
        const created = createDemoWorkflow({
          title: rec.title || 'Short Recommendation',
          channel: rec.channel || demoState.workspace?.channels?.[0]?.name || 'DemoStudio',
          mode: 'auto'
        });
        return created;
      },
      close,
      refresh,
      handleEvent,
      updateSidebar,
      getSummary: currentData,
      get active() { return activePanel; }
    };
  }
};
