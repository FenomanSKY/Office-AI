// [Diubah oleh Gemini - 2026-11-21] Panel "Alur" Office AI V16: daftar alur aktif/terbaru, pohon delegasi dapat diperluas, filter agen, jeda/lanjut animasi, legenda warna+pola aksesibel, dan sinkronisasi facade window.OfficeFlow
'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.OfficeFlowUI = api;
    if (typeof document !== 'undefined') api.autoBoot();
  }
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';

  const FALLBACK_MAP = {
    version: 1,
    patterns: ['solid', 'dashed', 'dotted'],
    roles: {
      boss: { color: '#687787', pattern: 'solid' },
      secretary: { color: '#967029', pattern: 'dashed' },
      return: { color: '#23875f', pattern: 'dotted' },
      failed: { color: '#c44e59', pattern: 'dashed' }
    },
    providers: {
      claude: { color: '#b6673e', pattern: 'solid' },
      codex: { color: '#258675', pattern: 'dashed' },
      gemini: { color: '#6076c6', pattern: 'dotted' },
      opencode: { color: '#9270b7', pattern: 'dashed' },
      hermes: { color: '#a17424', pattern: 'dotted' },
      other: { color: '#687787', pattern: 'solid' }
    },
    providerAliases: { antigravity: 'gemini', 'gemini-api': 'gemini', agy: 'gemini' },
    personas: {
      general: { color: '#687787', pattern: 'dotted' },
      researcher: { color: '#258675', pattern: 'dotted' },
      'software-architect': { color: '#9270b7', pattern: 'dashed' },
      'frontend-developer': { color: '#347fc0', pattern: 'solid' },
      'mobile-app-builder': { color: '#27898a', pattern: 'dashed' },
      'desktop-app-engineer': { color: '#687787', pattern: 'solid' },
      'ui-designer': { color: '#b15c99', pattern: 'solid' },
      'reality-checker': { color: '#c44e59', pattern: 'dashed' },
      'social-media-strategist': { color: '#a17424', pattern: 'dotted' },
      'short-video-editing-coach': { color: '#967029', pattern: 'solid' },
      'technical-writer': { color: '#7f74b9', pattern: 'dotted' },
      'project-shepherd': { color: '#9b7358', pattern: 'dashed' }
    },
    subagentTypes: {
      explore: 'researcher',
      research: 'researcher',
      researcher: 'researcher',
      plan: 'software-architect',
      'general-purpose': 'general',
      'kerja-berat': 'software-architect',
      'kerja-sedang': 'frontend-developer',
      'kerja-ringan': 'technical-writer',
      'claude-code-guide': 'technical-writer',
      designer: 'ui-designer',
      pentester: 'reality-checker'
    }
  };

  const TERMINAL = new Set(['completed', 'failed', 'rate_limited', 'cancelled', 'timed_out', 'expired', 'superseded']);
  const FAILURE = new Set(['failed', 'rate_limited', 'cancelled', 'timed_out']);
  const PROVIDERS = ['claude', 'codex', 'gemini', 'opencode', 'hermes', 'other'];
  const SVG_NS = 'http://www.w3.org/2000/svg';

  let singleton = null;

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  // V18 [Diubah oleh Gemini - 2026-11-21] Perbarui swatch legenda ke gaya sinar cahaya menyala + ritme denyut/partikel + kometa kembali berekor
  function renderPatternSvg(color, pattern, isReturn = false) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 38 14');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('flow16-swatch-svg');
    const col = color || '#687787';

    // Lapisan halo sinar lembut
    const halo = document.createElementNS(SVG_NS, 'line');
    halo.setAttribute('x1', '3');
    halo.setAttribute('y1', '7');
    halo.setAttribute('x2', '35');
    halo.setAttribute('y2', '7');
    halo.setAttribute('stroke', col);
    halo.setAttribute('stroke-width', '5.5');
    halo.setAttribute('stroke-linecap', 'round');
    halo.setAttribute('opacity', '0.28');
    svg.appendChild(halo);

    // Lapisan sinar berwarna utama (kontinu, bukan blok putus kaku)
    const beam = document.createElementNS(SVG_NS, 'line');
    beam.setAttribute('x1', '3');
    beam.setAttribute('y1', '7');
    beam.setAttribute('x2', '35');
    beam.setAttribute('y2', '7');
    beam.setAttribute('stroke', col);
    beam.setAttribute('stroke-width', '2.4');
    beam.setAttribute('stroke-linecap', 'round');
    beam.setAttribute('opacity', pattern === 'dotted' ? '0.68' : '0.92');
    svg.appendChild(beam);

    // Inti cahaya terang + ritme denyut / partikel sesuai pola aksesibilitas
    if (isReturn) {
      const tail = document.createElementNS(SVG_NS, 'line');
      tail.setAttribute('x1', '26');
      tail.setAttribute('y1', '7');
      tail.setAttribute('x2', '12');
      tail.setAttribute('y2', '7');
      tail.setAttribute('stroke', '#ffffff');
      tail.setAttribute('stroke-width', '1.8');
      tail.setAttribute('stroke-linecap', 'round');
      tail.setAttribute('opacity', '0.85');
      const outer = document.createElementNS(SVG_NS, 'circle');
      outer.setAttribute('cx', '11');
      outer.setAttribute('cy', '7');
      outer.setAttribute('r', '4.4');
      outer.setAttribute('fill', col);
      const inner = document.createElementNS(SVG_NS, 'circle');
      inner.setAttribute('cx', '11');
      inner.setAttribute('cy', '7');
      inner.setAttribute('r', '2.2');
      inner.setAttribute('fill', '#ffffff');
      svg.append(tail, outer, inner);
    } else if (pattern === 'dashed') {
      // Ritme pasangan denyut cahaya memanjang
      for (const [x1, x2] of [[5, 11], [13.5, 18.5], [24, 30]]) {
        const seg = document.createElementNS(SVG_NS, 'line');
        seg.setAttribute('x1', String(x1));
        seg.setAttribute('y1', '7');
        seg.setAttribute('x2', String(x2));
        seg.setAttribute('y2', '7');
        seg.setAttribute('stroke', '#ffffff');
        seg.setAttribute('stroke-width', '1.6');
        seg.setAttribute('stroke-linecap', 'round');
        seg.setAttribute('opacity', '0.92');
        svg.appendChild(seg);
      }
    } else if (pattern === 'dotted') {
      // Ritme manik-manik cahaya rapat
      for (const cx of [6, 12.5, 19, 25.5, 32]) {
        const dot = document.createElementNS(SVG_NS, 'circle');
        dot.setAttribute('cx', String(cx));
        dot.setAttribute('cy', '7');
        dot.setAttribute('r', '1.65');
        dot.setAttribute('fill', '#ffffff');
        dot.setAttribute('stroke', col);
        dot.setAttribute('stroke-width', '0.8');
        svg.appendChild(dot);
      }
    } else {
      // Solid: inti filamen terang kontinu dengan titik pulsa halus
      const core = document.createElementNS(SVG_NS, 'line');
      core.setAttribute('x1', '4');
      core.setAttribute('y1', '7');
      core.setAttribute('x2', '34');
      core.setAttribute('y2', '7');
      core.setAttribute('stroke', '#ffffff');
      core.setAttribute('stroke-width', '1.15');
      core.setAttribute('stroke-linecap', 'round');
      core.setAttribute('opacity', '0.88');
      const pulse = document.createElementNS(SVG_NS, 'circle');
      pulse.setAttribute('cx', '20');
      pulse.setAttribute('cy', '7');
      pulse.setAttribute('r', '2.1');
      pulse.setAttribute('fill', '#ffffff');
      svg.append(core, pulse);
    }
    return svg;
  }

  function formatDuration(ms, tr) {
    const val = Math.max(0, Number(ms) || 0);
    if (val < 1000) return tr('flow16.durMs', { n: Math.round(val) });
    if (val < 60000) return tr('flow16.durSec', { n: (val / 1000).toFixed(1) });
    const mins = Math.floor(val / 60000);
    const secs = Math.floor((val % 60000) / 1000);
    return tr('flow16.durMinSec', { m: mins, s: String(secs).padStart(2, '0') });
  }

  function buildTree(flow) {
    const nodesById = new Map();
    for (const n of flow.nodes || []) nodesById.set(n.id, n);
    const children = new Map();
    const incomingEdge = new Map();
    const returnEdge = new Map();

    for (const e of flow.edges || []) {
      if (e.kind === 'return') {
        returnEdge.set(e.from + '->' + e.to, e);
        continue;
      }
      if (!children.has(e.from)) children.set(e.from, []);
      children.get(e.from).push(e.to);
      incomingEdge.set(e.to, e);
    }

    const roots = [];
    for (const n of flow.nodes || []) {
      if (!incomingEdge.has(n.id)) roots.push(n.id);
    }
    if (!roots.length && nodesById.has('boss')) roots.push('boss');
    return { nodesById, children, incomingEdge, returnEdge, roots };
  }

  function create(opts = {}) {
    const {
      dialog: openDialogFn,
      before,
      isDemo,
      getFlows,
      getFlowMap,
      isPaused,
      setPaused,
      onOpenSettings,
      onOpenSetupHooks,
      onRunDemoFlow,
      onFocusNode,
      stateUrl = '/flow/state'
    } = opts;

    const $ = id => document.getElementById(id);
    const tr = (key, params) => (window.I18n?.t ? window.I18n.t(key, params) : key);
    const checkDemo = () => {
      if (typeof isDemo === 'function') return Boolean(isDemo());
      const badge = $('mode');
      return badge ? badge.textContent.trim().toUpperCase() === 'DEMO' : location.protocol === 'file:';
    };

    let active = false;
    let generation = 0;
    let filterProvider = 'all';
    let legendOpen = false;
    let localPaused = false;
    let mapCache = null;
    let fetchedFlows = null;
    let liveFlowsFromEvent = null;
    let localModel = null;
    let renderTimer = null;
    const expandedIds = new Set();

    function el(tag, text, cls) {
      const node = document.createElement(tag);
      if (text !== undefined && text !== null) node.textContent = String(text);
      if (Array.isArray(cls)) {
        for (const c of cls) if (c) node.classList.add(c);
      } else if (cls) {
        node.classList.add(cls);
      }
      return node;
    }

    function btn(label, onClick, cls = ['v12-btn-compact']) {
      const b = el('button', label, cls);
      b.type = 'button';
      b.addEventListener('click', onClick);
      return b;
    }

    function hostFacade() {
      return window.OfficeFlow || window.officeQA?.flow || null;
    }

    function currentMap() {
      const custom = getFlowMap?.();
      if (custom && custom.providers && custom.personas && custom.roles) return custom;
      const hostMap = hostFacade()?.map;
      if (hostMap && hostMap.providers && hostMap.personas && hostMap.roles) return hostMap;
      return mapCache || FALLBACK_MAP;
    }

    async function loadMap() {
      if (mapCache || getFlowMap?.() || hostFacade()?.map) return currentMap();
      if (typeof location === 'undefined' || location.protocol === 'file:') {
        mapCache = clone(FALLBACK_MAP);
        return mapCache;
      }
      try {
        const res = await fetch('/office_flow_map.json');
        if (res.ok) {
          const parsed = await res.json();
          if (parsed && parsed.providers && parsed.personas && parsed.roles) {
            mapCache = parsed;
            return mapCache;
          }
        }
      } catch {}
      mapCache = clone(FALLBACK_MAP);
      return mapCache;
    }

    function ensureLocalModel() {
      if (localModel) return localModel;
      if (window.OfficeFlowModel?.create) {
        localModel = window.OfficeFlowModel.create({ map: currentMap(), now: () => Date.now() });
      }
      return localModel;
    }

    function readFlows() {
      if (Array.isArray(fetchedFlows)) return fetchedFlows;
      const custom = getFlows?.();
      if (Array.isArray(custom)) return custom;
      const facade = hostFacade();
      if (facade && typeof facade.snapshot === 'function') {
        try {
          const snap = facade.snapshot();
          if (Array.isArray(snap)) return snap;
        } catch {}
      }
      if (Array.isArray(liveFlowsFromEvent)) return liveFlowsFromEvent;
      if (localModel) return localModel.snapshot();
      return [];
    }

    function readFlowSettings() {
      const s = window.OfficeSettings?.get?.();
      return s?.flow16 || { enabled: true, patterns: true, paused: false, walkAnimation: 'fast', maxVisibleEdges: 128, thickness: 1, subagentTypes: {} };
    }

    function pausedNow() {
      if (typeof isPaused === 'function') return Boolean(isPaused());
      const fs = readFlowSettings();
      return Boolean(fs.paused || localPaused);
    }

    function togglePause() {
      const next = !pausedNow();
      localPaused = next;
      if (typeof setPaused === 'function') setPaused(next);
      else hostFacade()?.setPaused?.(next);
      if (window.OfficeSettings?.get && window.OfficeSettings?.set) {
        try {
          const s = window.OfficeSettings.get();
          if (s.flow16) {
            s.flow16.paused = next;
            window.OfficeSettings.set(s);
          }
        } catch {}
      }
      window.dispatchEvent(new CustomEvent('office-flow-pause', { detail: { paused: next } }));
      render();
    }

    function togglePatterns() {
      if (window.OfficeSettings?.get && window.OfficeSettings?.set) {
        try {
          const s = window.OfficeSettings.get();
          if (s.flow16) {
            s.flow16.patterns = !s.flow16.patterns;
            window.OfficeSettings.set(s);
          }
        } catch {}
      }
      render();
    }

    function runFallbackDemoFlow() {
      if (typeof onRunDemoFlow === 'function') {
        onRunDemoFlow();
        scheduleRender();
        return;
      }
      const now = Date.now();
      const fid = 'demo-turn-' + (now % 100000);
      const events = [
        {
          type: 'call', source: 'hook', provider: 'claude', session: 'demo-session',
          agent: 'main-claude', flow_id: fid, event_id: fid + '-1',
          taskTitle: tr('flow16.demoSampleTitle'), at: now - 2200
        },
        {
          type: 'spawn', source: 'hook', provider: 'claude', session: 'demo-session',
          agent: 'sub-arch', parent: 'main-claude', agent_type: 'kerja-berat',
          flow_id: fid, event_id: fid + '-2', at: now - 1800
        },
        {
          type: 'spawn', source: 'hook', provider: 'claude', session: 'demo-session',
          agent: 'sub-ui', parent: 'main-claude', agent_type: 'ui-designer',
          flow_id: fid, event_id: fid + '-3', at: now - 1600
        },
        {
          type: 'retire', source: 'hook', provider: 'claude', session: 'demo-session',
          agent: 'sub-ui', parent: 'main-claude', agent_type: 'ui-designer',
          flow_id: fid, event_id: fid + '-4', status: 'completed', at: now - 500
        }
      ];
      const facade = hostFacade();
      if (facade && typeof facade.emit === 'function') {
        for (const ev of events) facade.emit(ev);
        fetchedFlows = null;
        const latest = facade.snapshot?.()?.[0];
        if (latest?.id) expandedIds.add(latest.id);
        render();
        return;
      }
      const m = ensureLocalModel();
      if (!m) return;
      for (const ev of events) m.ingest(ev);
      m.tick(now);
      fetchedFlows = null;
      const latest = m.snapshot()[0];
      if (latest?.id) expandedIds.add(latest.id);
      render();
    }

    function providerLabel(id) {
      const slot = PROVIDERS.includes(id) && id !== 'other' ? id : 'fallback';
      const key = 'flow16.provider.' + slot;
      const translated = tr(key);
      if (translated !== key) return translated;
      return currentMap().providers?.[id]?.label || id || tr('flow16.provider.fallback');
    }

    function roleLabel(role) {
      if (role === 'return') return tr('flow16.result');
      if (role === 'failed') return tr('flow16.failed');
      const key = 'flow16.role.' + role;
      const translated = tr(key);
      return translated !== key ? translated : role;
    }

    function statusLabel(status) {
      if (status === 'failed') return tr('flow16.failed');
      if (status === 'rate_limited') return tr('flow16.rate_limited');
      const allowed = ['working', 'completed', 'cancelled', 'timed_out', 'expired', 'superseded'];
      const safe = allowed.includes(status) ? status : 'working';
      return tr('flow16.status.' + safe);
    }

    function statusPillKind(status) {
      if (status === 'completed') return 'pos';
      if (FAILURE.has(status)) return 'neg';
      if (status === 'expired' || status === 'superseded') return 'warn';
      return '';
    }

    function patternLabel(pattern) {
      const safe = ['solid', 'dashed', 'dotted'].includes(pattern) ? pattern : 'solid';
      return tr('flow16.pattern.' + safe);
    }

    function sourceInfo(source, estimated) {
      const isDelayed = source === 'log' || source === 'collector' || estimated;
      const safe = ['hook', 'panel', 'pipeline', 'log'].includes(source) ? source : 'log';
      return {
        label: tr('flow16.source.' + safe),
        timeliness: isDelayed ? tr('flow16.badgeDelayed') : tr('flow16.badgeRealtime'),
        delayed: isDelayed
      };
    }

    function personaDisplayName(node) {
      if (node.role === 'boss') return roleLabel('boss');
      if (node.role === 'secretary') return roleLabel('secretary');
      if (node.role === 'agent') return providerLabel(node.provider);
      // V21 [Diubah oleh Codex - 2026-11-22] The tree and the worker use the same observed type; retain every child ID.
      if (node.agentType) return node.agentType;
      const roster = window.OfficeSettings?.get?.()?.personas || [];
      const found = roster.find(p => p.id === node.persona);
      if (found?.name) return found.name;
      const key = 'flow16.persona.' + (node.persona || 'general');
      const translated = tr(key);
      if (translated !== key) return translated;
      return currentMap().personas?.[node.persona]?.label || node.label || tr('flow16.persona.general');
    }

    function buildLegendSection(map) {
      const details = el('details', null, ['flow16-disclosure', 'flow16-legend']);
      details.id = 'flow16Legend';
      details.open = legendOpen;
      details.addEventListener('toggle', () => {
        legendOpen = details.open;
      });

      const summary = el('summary');
      summary.append(
        el('span', tr('flow16.legendTitle'), 'flow16-legend-summary-title'),
        el('span', tr('flow16.legendHint'), 'flow16-legend-summary-hint')
      );
      details.append(summary);

      const body = el('div', null, 'flow16-legend-body');
      const topRow = el('div', null, 'flow16-legend-top');

      // Group 1: Core roles & return/error
      const colRoles = el('div', null, 'flow16-legend-col');
      colRoles.append(el('p', tr('flow16.legendRoles'), 'flow16-legend-heading'));
      const listRoles = el('ul', null, 'flow16-legend-list');
      listRoles.setAttribute('role', 'list');
      for (const [rk, rv] of Object.entries(map.roles || {})) {
        const li = el('li', null, 'flow16-legend-item');
        const left = el('span', null, 'flow16-legend-name');
        left.append(renderPatternSvg(rv.color, rv.pattern, rk === 'return'), el('span', roleLabel(rk)));
        li.append(left, el('span', patternLabel(rv.pattern), 'flow16-pattern-tag'));
        listRoles.append(li);
      }
      colRoles.append(listRoles);

      // Group 2: Providers
      const colProv = el('div', null, 'flow16-legend-col');
      colProv.append(el('p', tr('flow16.legendProviders'), 'flow16-legend-heading'));
      const listProv = el('ul', null, 'flow16-legend-list');
      listProv.setAttribute('role', 'list');
      for (const [pk, pv] of Object.entries(map.providers || {})) {
        const li = el('li', null, 'flow16-legend-item');
        const left = el('span', null, 'flow16-legend-name');
        left.append(renderPatternSvg(pv.color, pv.pattern, false), el('span', providerLabel(pk)));
        li.append(left, el('span', patternLabel(pv.pattern), 'flow16-pattern-tag'));
        listProv.append(li);
      }
      colProv.append(listProv);
      topRow.append(colRoles, colProv);

      // Group 3: Specialist personas (compact 3-column grid, balanced rows)
      const colPers = el('div', null, 'flow16-legend-col');
      colPers.append(el('p', tr('flow16.legendPersonas'), 'flow16-legend-heading'));
      const listPers = el('ul', null, ['flow16-legend-list', 'is-personas']);
      listPers.setAttribute('role', 'list');
      const roster = window.OfficeSettings?.get?.()?.personas || [];
      for (const [sk, sv] of Object.entries(map.personas || {})) {
        const li = el('li', null, 'flow16-legend-item');
        const left = el('span', null, 'flow16-legend-name');
        const pKey = 'flow16.persona.' + sk;
        const pTr = tr(pKey);
        const rosterMatch = roster.find(p => p.id === sk);
        const name = pTr !== pKey ? pTr : (rosterMatch?.name || sv.label || sk);
        left.append(renderPatternSvg(sv.color, sv.pattern, false), el('span', name));
        li.append(left, el('span', patternLabel(sv.pattern), 'flow16-pattern-tag'));
        listPers.append(li);
      }
      colPers.append(listPers);

      body.append(topRow, colPers);
      details.append(body);
      return details;
    }

    function renderTreeNode(nodeId, tree, flow, map, depth) {
      const node = tree.nodesById.get(nodeId);
      if (!node) return null;
      const li = el('li');
      li.dataset.nodeId = node.id;
      if (node.agent) { li.dataset.agent = node.agent; li.title = node.agent; }
      const inEdge = tree.incomingEdge.get(nodeId);
      const retEdge = inEdge ? tree.returnEdge.get(nodeId + '->' + inEdge.from) : null;
      const style = inEdge
        ? { color: inEdge.color, pattern: inEdge.pattern }
        : (map.roles?.[node.role] || map.roles.boss);

      const row = el('div', null, 'flow16-node-row');
      const left = el('div', null, 'flow16-node-left');
      const dispName = personaDisplayName(node);
      const rName = roleLabel(node.role);
      left.append(
        renderPatternSvg(style.color, style.pattern, false),
        el('span', dispName, 'flow16-node-name')
      );
      if (dispName !== rName) {
        left.append(el('span', rName, 'flow16-node-role'));
      }
      if (node.inferred || node.inferredEnd) {
        left.append(el('span', tr('flow16.estimated'), 'flow16-inferred-tag'));
      }

      const right = el('div', null, 'flow16-node-right');
      if (retEdge) {
        const ret = el('span', tr('flow16.returnPacket'), 'flow16-return-tag');
        right.append(ret);
      }
      const stPill = el('span', statusLabel(node.status), ['v12-pill', statusPillKind(node.status)]);
      right.append(stPill);
      if (inEdge) {
        const endTs = inEdge.endedAt ?? Date.now();
        right.append(el('span', formatDuration(Math.max(0, endTs - inEdge.startedAt), tr), 'flow16-duration'));
      }
      if (typeof onFocusNode === 'function' && (node.role === 'agent' || node.role === 'persona' || node.role === 'secretary' || node.role === 'boss')) {
        const fBtn = btn(tr('flow16.focus3d'), () => onFocusNode(node), ['v12-btn-compact']);
        fBtn.setAttribute('aria-label', tr('flow16.focus3dAria', { name: personaDisplayName(node) }));
        right.append(fBtn);
      }

      row.append(left, right);
      li.append(row);

      const kids = tree.children.get(nodeId) || [];
      if (kids.length && depth < 8) {
        const sub = el('ul', null, 'flow16-tree-children');
        sub.setAttribute('role', 'list');
        for (const kid of kids) {
          const childEl = renderTreeNode(kid, tree, flow, map, depth + 1);
          if (childEl) sub.append(childEl);
        }
        if (sub.childNodes.length) li.append(sub);
      }
      return li;
    }

    function renderFlowItem(flow, map) {
      const details = el('details', null, ['flow16-disclosure', 'flow16-item']);
      details.dataset.flowId = flow.id;
      details.dataset.provider = flow.provider;
      details.dataset.status = flow.status;
      details.open = expandedIds.has(flow.id);
      details.addEventListener('toggle', () => {
        if (details.open) expandedIds.add(flow.id);
        else expandedIds.delete(flow.id);
      });

      const pStyle = FAILURE.has(flow.status)
        ? (map.roles?.failed || FALLBACK_MAP.roles.failed)
        : (map.providers?.[flow.provider] || map.providers?.other || FALLBACK_MAP.providers.other);

      const summary = el('summary');
      const sumGrid = el('div', null, 'flow16-item-summary');
      const sw = el('span', null, 'flow16-swatch');
      sw.append(renderPatternSvg(pStyle.color, pStyle.pattern, false));

      const branches = (flow.nodes || []).filter(n => n.role === 'persona').length;
      const main = el('div', null, 'flow16-item-main');
      main.append(el('span', flow.taskTitle || tr('flow16.defaultTitle'), 'flow16-item-title'));
      const sub = el('span', null, 'flow16-item-sub');
      sub.append(
        el('span', providerLabel(flow.provider)),
        el('span', tr('flow16.branchCount', { count: branches }))
      );
      if (flow.estimated || flow.inferredStart) {
        sub.append(el('span', tr('flow16.estimated'), 'flow16-inferred-tag'));
      }
      main.append(sub);

      const src = sourceInfo(flow.source, flow.estimated);
      const right = el('div', null, 'flow16-item-right');
      const srcBadge = el('span', src.label + ' · ' + src.timeliness, ['flow16-source-badge', src.delayed ? 'is-delayed' : 'is-realtime']);
      const stPill = el('span', statusLabel(flow.status), ['v12-pill', statusPillKind(flow.status), !TERMINAL.has(flow.status) ? 'is-live' : '']);
      if (!TERMINAL.has(flow.status)) {
        const dot = el('span', null, 'v12-pill-dot');
        dot.setAttribute('aria-hidden', 'true');
        stPill.prepend(dot);
      }
      const durMs = Math.max(0, (flow.endedAt ?? Math.max(Date.now(), flow.updatedAt || flow.startedAt || 0)) - (flow.startedAt || 0));
      const dur = el('span', formatDuration(durMs, tr), 'flow16-duration');

      right.append(srcBadge, stPill, dur);
      sumGrid.append(sw, main, right);
      summary.append(sumGrid);
      details.append(summary);

      const body = el('div', null, 'flow16-item-body');
      const tree = buildTree(flow);
      const treeList = el('ul', null, 'flow16-tree');
      treeList.setAttribute('role', 'list');
      for (const rootId of tree.roots) {
        const nodeEl = renderTreeNode(rootId, tree, flow, map, 0);
        if (nodeEl) treeList.append(nodeEl);
      }
      body.append(treeList);

      const meta = el('div', null, 'flow16-meta-bar');
      const idSpan = el('span');
      idSpan.append(el('span', tr('flow16.metaFlowId') + ' '), el('code', flow.id));
      const srcList = (flow.sources && flow.sources.length ? flow.sources : [flow.source])
        .map(s => sourceInfo(s, false).label)
        .join(', ');
      const metaRight = el('span', tr('flow16.metaSources', { sources: srcList }));
      meta.append(idSpan, metaRight);
      body.append(meta);

      details.append(body);
      return details;
    }

    function updateSidebarBadge() {
      const badge = $('v16FlowBadge');
      if (!badge) return;
      const all = readFlows();
      const activeCount = all.filter(f => !TERMINAL.has(f.status)).length;
      if (activeCount > 0) {
        badge.textContent = tr('flow16.sidebarActive', { count: activeCount });
        badge.dataset.state = 'connected';
      } else if (all.length > 0) {
        badge.textContent = tr('flow16.sidebarRecent', { count: all.length });
        badge.dataset.state = '';
      } else {
        badge.textContent = tr('flow16.sidebarStandby');
        badge.dataset.state = '';
      }
    }

    function openSettingsFlowTab() {
      $('panel')?.close();
      if (typeof onOpenSettings === 'function') {
        onOpenSettings('flow');
        return;
      }
      $('settingsButton')?.click();
      setTimeout(() => $('tab-flow')?.click(), 30);
    }

    function openSetupHooksSection() {
      $('panel')?.close();
      if (typeof onOpenSetupHooks === 'function') {
        onOpenSetupHooks();
        return;
      }
      window.__officeScrollToHooks = true;
      $('openSetup')?.click();
    }

    function render() {
      updateSidebarBadge();
      if (!active) return;
      const content = $('panelContent');
      if (!content) return;

      const map = currentMap();
      const allFlows = readFlows();
      const activeCount = allFlows.filter(f => !TERMINAL.has(f.status)).length;
      const filtered = filterProvider === 'all' ? allFlows : allFlows.filter(f => f.provider === filterProvider);
      const flowSettings = readFlowSettings();
      const paused = pausedNow();

      content.replaceChildren();
      content.classList.remove('quality-panel', 'short14-panel', 'yt14-panel', 'setup15-panel');
      content.classList.add('v12-panel', 'flow16-panel');

      // Toolbar
      const bar = el('div', null, 'flow16-toolbar');
      const left = el('div', null, 'flow16-toolbar-left');

      const stats = el('div', null, 'flow16-stat-strip');
      stats.id = 'flow16Stats';
      const activeCell = el('span', null, ['flow16-stat-cell', activeCount > 0 ? 'is-active' : '']);
      activeCell.append(el('span', tr('flow16.statActive')), el('strong', String(activeCount)));
      const totalCell = el('span', null, 'flow16-stat-cell');
      totalCell.append(el('span', tr('flow16.statRecent')), el('strong', String(allFlows.length)));
      stats.append(activeCell, totalCell);

      const filterWrap = el('label', null, 'flow16-filter-label');
      filterWrap.htmlFor = 'flow16ProviderFilter';
      filterWrap.append(el('span', tr('flow16.filterLabel')));
      const sel = el('select');
      sel.id = 'flow16ProviderFilter';
      const optAll = el('option', tr('flow16.filterAll'));
      optAll.value = 'all';
      sel.append(optAll);
      for (const p of PROVIDERS) {
        const o = el('option', providerLabel(p));
        o.value = p;
        sel.append(o);
      }
      sel.value = filterProvider;
      sel.addEventListener('change', () => {
        filterProvider = sel.value;
        render();
      });
      filterWrap.append(sel);
      left.append(stats, filterWrap);

      const right = el('div', null, 'flow16-toolbar-right');
      const pauseBtn = btn(paused ? tr('flow16.resumeAnim') : tr('flow16.pauseAnim'), togglePause, ['v12-btn-compact', 'flow16-toggle-btn']);
      pauseBtn.id = 'flow16PauseBtn';
      pauseBtn.setAttribute('aria-pressed', String(paused));

      const patBtn = btn(tr('flow16.patternsToggle'), togglePatterns, ['v12-btn-compact', 'flow16-toggle-btn']);
      patBtn.id = 'flow16PatternsBtn';
      patBtn.setAttribute('aria-pressed', String(Boolean(flowSettings.patterns !== false)));

      const setBtn = btn(tr('flow16.openSettings'), openSettingsFlowTab, ['v12-btn-compact']);
      setBtn.id = 'flow16OpenSettingsBtn';

      const hooksBtn = btn(tr('flow16.openSetupHooks'), openSetupHooksSection, ['v12-btn-compact']);
      hooksBtn.id = 'flow16OpenHooksBtn';

      right.append(pauseBtn, patBtn, setBtn, hooksBtn);
      bar.append(left, right);
      content.append(bar);

      if (flowSettings.enabled === false) {
        const disabledNote = el('div', tr('flow16.linesDisabledNotice'), ['v12-notice', 'warn']);
        disabledNote.setAttribute('role', 'status');
        content.append(disabledNote);
      }

      // Collapsible Legend
      content.append(buildLegendSection(map));

      // Flow list or empty state
      if (!filtered.length) {
        const empty = el('section', null, 'flow16-empty');
        empty.id = 'flow16EmptyState';
        empty.setAttribute('role', 'status');
        if (allFlows.length > 0 && filterProvider !== 'all') {
          empty.append(
            el('h3', tr('flow16.emptyFilterTitle')),
            el('p', tr('flow16.emptyFilterBody', { provider: providerLabel(filterProvider) }))
          );
          const row = el('div', null, 'v12-btn-row');
          const resetBtn = btn(tr('flow16.resetFilter'), () => {
            filterProvider = 'all';
            render();
          }, ['v12-btn-compact', 'v12-btn-primary']);
          row.append(resetBtn);
          empty.append(row);
        } else {
          empty.append(
            el('h3', tr('flow16.emptyTitle')),
            el('p', tr('flow16.emptyBody')),
            el('p', tr('flow16.emptySourcesNote'))
          );
          const row = el('div', null, 'v12-btn-row');
          const setupCta = btn(tr('flow16.emptyInstallHooksBtn'), openSetupHooksSection, ['v12-btn-compact', 'v12-btn-primary']);
          setupCta.id = 'flow16EmptyHooksBtn';
          row.append(setupCta);
          if (checkDemo() || typeof onRunDemoFlow === 'function' || hostFacade() || window.OfficeFlowModel) {
            const demoCta = btn(tr('flow16.emptyDemoBtn'), runFallbackDemoFlow, ['v12-btn-compact']);
            demoCta.id = 'flow16EmptyDemoBtn';
            row.append(demoCta);
          }
          empty.append(row);
        }
        content.append(empty);
      } else {
        const list = el('div', null, 'flow16-list');
        list.id = 'flow16List';
        for (const flow of filtered) {
          list.append(renderFlowItem(flow, map));
        }
        content.append(list);
      }
    }

    function scheduleRender() {
      updateSidebarBadge();
      if (!active) return;
      if (renderTimer) return;
      renderTimer = setTimeout(() => {
        renderTimer = null;
        if (active && $('panel')?.open) render();
      }, 150);
    }

    async function fetchRemoteState() {
      if (typeof getFlows === 'function' || hostFacade() || checkDemo() || location.protocol === 'file:') return;
      try {
        const res = await fetch(stateUrl);
        if (!res.ok) return;
        const data = await res.json();
        if (data?.map && data.map.providers) mapCache = data.map;
        if (Array.isArray(data?.flows)) fetchedFlows = data.flows;
      } catch {}
    }

    function openNativePanelDialog(titleText) {
      const settingsDlg = $('settingsDialog');
      if (settingsDlg?.open) settingsDlg.close();
      const menu = $('officeMenu');
      const menuBtn = $('officeMenuButton');
      if (menu && !menu.hidden) {
        menu.hidden = true;
        menuBtn?.setAttribute('aria-expanded', 'false');
      }
      const panel = $('panel');
      if (!panel) return;
      if (panel.open) panel.close();
      const titleEl = $('panelTitle');
      const contentEl = $('panelContent');
      if (titleEl) titleEl.textContent = titleText;
      if (contentEl) contentEl.replaceChildren();
      panel.showModal();
    }

    async function openFlow(flowId) {
      if (typeof flowId === 'string') expandedIds.add(flowId);
      before?.();
      const g = ++generation;
      if (typeof openDialogFn === 'function') openDialogFn(tr('flow16.panelTitle'));
      else openNativePanelDialog(tr('flow16.panelTitle'));
      active = true;
      $('panel')?.classList.add('flow16-dialog');
      render();
      await Promise.all([loadMap(), fetchRemoteState()]);
      if (g === generation && active && $('panel')?.open) render();
    }

    function close() {
      generation++;
      active = false;
      if (renderTimer) {
        clearTimeout(renderTimer);
        renderTimer = null;
      }
      $('panel')?.classList.remove('flow16-dialog');
      $('panelContent')?.classList.remove('flow16-panel');
    }

    $('panel')?.addEventListener('close', () => {
      if (active) close();
    });

    window.addEventListener('office-flow-ready', () => {
      fetchedFlows = null;
      scheduleRender();
    });

    window.addEventListener('office-flow-update', ev => {
      if (Array.isArray(ev?.detail?.flows)) liveFlowsFromEvent = ev.detail.flows;
      fetchedFlows = null;
      scheduleRender();
    });

    window.addEventListener('office-flow-updated', () => scheduleRender());

    window.I18n?.subscribe?.(() => {
      updateSidebarBadge();
      if (active && $('panel')?.open) {
        if ($('panelTitle')) $('panelTitle').textContent = tr('flow16.panelTitle');
        render();
      }
    });

    window.OfficeSettings?.subscribe?.(() => {
      if (active && $('panel')?.open) scheduleRender();
    });

    singleton = {
      open: openFlow,
      openFlow,
      close,
      refresh: scheduleRender,
      setFlows(list) {
        fetchedFlows = Array.isArray(list) ? list : [];
        scheduleRender();
      },
      emit(evt, ctx) {
        const facade = hostFacade();
        if (facade && typeof facade.emit === 'function') {
          fetchedFlows = null;
          const out = facade.emit(evt, ctx);
          scheduleRender();
          return out;
        }
        const m = ensureLocalModel();
        if (!m) return null;
        const res = m.ingest(evt, ctx);
        fetchedFlows = null;
        scheduleRender();
        return res;
      },
      getMap: currentMap,
      get active() { return active; }
    };
    return singleton;
  }

  function autoBoot() {
    const wire = () => {
      if (!singleton) create({});
      const openBtn = document.getElementById('openFlow');
      const cardBtn = document.getElementById('flowCardButton');
      const handler = () => singleton.openFlow();
      if (openBtn && !openBtn.dataset.flow16Bound) {
        openBtn.dataset.flow16Bound = '1';
        openBtn.addEventListener('click', handler);
      }
      if (cardBtn && !cardBtn.dataset.flow16Bound) {
        cardBtn.dataset.flow16Bound = '1';
        cardBtn.addEventListener('click', handler);
      }
      singleton.refresh();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire, { once: true });
    else setTimeout(wire, 0);
  }

  return { create, autoBoot, get instance() { return singleton; }, DEFAULT_MAP: FALLBACK_MAP, renderPatternSvg, formatDuration };
});
