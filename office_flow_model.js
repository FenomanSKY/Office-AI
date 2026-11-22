/* V16-A: pure bounded event projection. No DOM, timers, IO, or invented workers. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./office_flow_map.json'));
  else root.OfficeFlowModel = factory(null);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (defaultMap) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const text = (value, max = 120) => typeof value === 'string' ? Array.from(value.replace(/[\x00-\x1f\x7f]/g, ' ').trim()).slice(0, max).join('') : '';
  function hash(value) {
    let n = 2166136261;
    for (const c of String(value)) n = Math.imul(n ^ c.codePointAt(0), 16777619);
    return (n >>> 0).toString(16).padStart(8, '0');
  }
  const id = (value, fallback) => typeof value === 'string' && /^[\w.:-]{1,64}$/.test(value) ? value : value ? 'id-' + hash(value) : fallback;
  const bound = (value, fallback, min, max) => Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value))) : fallback;
  const aliases = {
    userpromptsubmit: 'call', user_prompt_submit: 'call', 'user-prompt-submit': 'call', prompt: 'call',
    subagentstart: 'spawn', subagent_start: 'spawn', subagentstop: 'retire', subagent_stop: 'retire',
    stop: 'report', 'turn-ended': 'report', 'agent-turn-complete': 'report', turn_ended: 'report',
    pretooluse: 'tool', posttooluse: 'tool', tool_start: 'tool', tool_end: 'tool',
    failure: 'failed', error: 'failed', stopfailure: 'failed', limit: 'rate_limited',
    prompt_run_started: 'call', prompt_run_done: 'report', persona_call: 'spawn', submit: 'retire',
    pipeline_started: 'call', pipeline_done: 'report'
  };
  const terminal = new Set(['completed', 'failed', 'rate_limited', 'cancelled', 'timed_out', 'expired', 'superseded']);
  const priority = { call: 0, spawn: 1, tool: 2, retire: 3, report: 4, failed: 5, rate_limited: 6, cancelled: 7, timed_out: 8 };
  function timestamp(value, fallback) {
    if (typeof value === 'string') { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : fallback; }
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  }
  function create(options = {}) {
    const map = clone(options.map || defaultMap);
    if (!map || !map.providers || !map.personas || !map.roles) throw new TypeError('office_flow_map.json required');
    const defaultTypes=clone(map.subagentTypes||{}),defaultPersonas=clone(map.personas);let mappingSignature='';
    const limits = {
      maxFlows: bound(options.maxFlows, 64, 1, 256), maxActiveFlows: bound(options.maxActiveFlows, 16, 1, 256),
      maxNodes: bound(options.maxNodes, 64, 3, 256), maxEvents: bound(options.maxEvents, 4096, 16, 16384),
      ttlMs: bound(options.ttlMs, 900000, 1, 86400000), retentionMs: bound(options.retentionMs, 60000, 0, 86400000)
    };
    limits.maxActiveFlows = Math.min(limits.maxActiveFlows, limits.maxFlows);
    // V16-C [Diubah oleh Codex - 2026-11-21] Correlate a report with its exact projected flow, including parallel turns in one session.
    const events = new Map(), eventFlows = new Map();
    let clock = 0, flows = [], dropped = 0;
    function normalize(input, context = {}) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
      context = context && typeof context === 'object' ? context : {};
      if (!input.type && !input.hook_event_name && !['working', 'thinking', 'done', 'error', 'idle'].includes(input.status)) return null;
      const run = input.run && typeof input.run === 'object' ? input.run : {};
      let type = text(input.type || input.hook_event_name || '', 64).toLowerCase();
      type = aliases[type] || type || (['done', 'error'].includes(input.status) ? (input.status === 'done' ? 'report' : 'failed') : 'tool');
      if (!own(priority, type)) return null;
      let provider = text(input.provider || input.engine || input.residentProvider || input.agentId || run.residentProvider || run.agentId || 'other', 32).toLowerCase();
      provider = own(map.providerAliases || {}, provider) ? map.providerAliases[provider] : provider;
      const session = id(input.session || input.session_id, 'local');
      const child = input.kind === 'subagent' || type === 'spawn' || type === 'retire' || !!input.persona;
      const agent = id(input.agent || input.agent_id || input.persona, child ? 'unknown-child' : 'main-' + provider);
      const parent = child ? id(input.parent || input.parent_agent_id, 'main-' + provider) : null;
      const at = timestamp(input.at ?? input.timestamp ?? input.startedAt ?? (input.updated_at ? input.updated_at * 1000 : undefined), context.at ?? (options.now ? options.now() : clock));
      let source = context.source || input.source || (typeof input.type === 'string' && input.type.startsWith('prompt_run_') ? 'panel' : 'hook');
      if (source === 'collector') source = 'log';
      if (!['hook', 'log', 'panel', 'pipeline'].includes(source)) source = 'log';
      let status = input.limitDetected || run.limitDetected ? 'rate_limited' : input.flow_status || input.status || run.status;
      if (['error', 'failure'].includes(status)) status = 'failed';
      if (status === 'done') status = 'completed';
      if (!terminal.has(status)) status = type === 'report' || type === 'retire' ? 'completed' : terminal.has(type) ? type : 'working';
      const normalized = { type, provider, session, agent, parent, child, at, source, status,
        explicit: id(input.flow_id || input.task_id || input.runId || run.id || run.runId, ''),
        title: text(input.taskTitle || input.task_label || input.task || 'Activity'),
        persona: text(input.persona, 64), agentType: text(input.agent_type ?? input.subagent_type ?? input.role, 64),
        agentTypeProvided: typeof input.agent_type === 'string' || typeof input.subagent_type === 'string',
        eventId: id(input.event_id, ''), estimated: input.estimated === true || source === 'log' };
      normalized.key = normalized.eventId ? provider + ':' + normalized.eventId : hash(JSON.stringify(normalized));
      return normalized;
    }
    function personaFor(event) {
      if (own(map.personas, event.persona)) return event.persona;
      const kind = event.agentType.toLowerCase();
      if (own(map.personas, kind)) return kind;
      const result = (map.subagentTypes || {})[kind];
      return result && own(map.personas, result) ? result : 'general';
    }
    const providerStyle = provider => own(map.providers, provider) ? map.providers[provider] : map.providers.other;
    function project(group, flowId) {
      const first = group[0], prompt = group.find(e => e.type === 'call' && !e.child);
      const start = Math.min(...group.map(e => e.at)), last = Math.max(...group.map(e => e.at));
      const main = prompt ? prompt.agent : (group.find(e => !e.child) || {}).agent || first.parent || 'main-' + first.provider;
      const flow = { id: flowId, source: (prompt || first).source, sources: [...new Set(group.map(e => e.source))].sort(),
        provider: first.provider, session: first.session, taskTitle: (prompt || first).title,
        startedAt: start, updatedAt: last, endedAt: null, status: 'working', estimated: group.some(e => e.estimated),
        inferredStart: !prompt, truncated: false, nodes: [], edges: [] };
      const nodes = new Map(), states = new Map(), requested = new Map();
      function node(agent, role, persona, inferred = false) {
        const key = role === 'boss' || role === 'secretary' ? role : 'actor:' + agent;
        if (nodes.has(key)) { if (!inferred) nodes.get(key).inferred = false; return nodes.get(key); }
        if (nodes.size >= limits.maxNodes) { flow.truncated = true; return null; }
        const style = role === 'persona' ? map.personas[persona] || map.personas.general : role === 'agent' ? providerStyle(first.provider) : map.roles[role];
        const value = { id: key, role, label: style.label, agent: role === 'agent' || role === 'persona' ? agent : null,
          persona: role === 'persona' ? persona : null, provider: first.provider, inferred, status: 'working' };
        nodes.set(key, value); return value;
      }
      node(null, 'boss'); node(null, 'secretary'); node(main, 'agent');
      const rootId = 'actor:' + main;
      for (const e of group) {
        if (!e.child || e.agent === main) continue;
        const n = node(e.agent, 'persona', personaFor(e), e.type !== 'spawn');
        if (!n) continue;
        // A late explicit start improves the placeholder's role and label.
        // A stop hook may supply a generic fallback type; an observed start remains the identity authority.
        if (e.type === 'spawn' || e.persona || !own(n, 'agentType') || n.inferred && e.agentTypeProvided) {
          n.persona = personaFor(e); n.label = (map.personas[n.persona] || map.personas.general).label;
          // V21 [Diubah oleh Codex - 2026-11-22] Keep the observed type and identity even when the visual persona is general.
          n.agentType = e.agentType || n.agentType || '';
        }
        const p = e.parent && e.parent !== main ? node(e.parent, 'persona', 'general', true) : nodes.get(rootId);
        if (!p) continue;
        if (!requested.has(n.id) || e.type === 'spawn') requested.set(n.id, p.id);
      }
      const parents = new Map([['secretary', 'boss'], [rootId, 'secretary']]);
      for (const n of [...nodes.values()].filter(n => n.role === 'persona').sort((a, b) => a.id.localeCompare(b.id))) {
        const proposed = requested.get(n.id) || rootId;
        let p = proposed, cyclic = p === n.id, hops = 0;
        while (!cyclic && parents.has(p) && hops++ <= nodes.size) { p = parents.get(p); cyclic = p === n.id; }
        parents.set(n.id, cyclic ? rootId : proposed);
      }
      function edge(from, to, kind, at, end) {
        const target = nodes.get(kind === 'return' ? from : to);
        const failures = ['failed', 'rate_limited', 'timed_out', 'cancelled'];
        const failed = failures.includes(flow.status) || failures.includes(target.status);
        const style = failed ? map.roles.failed : kind === 'return' ? map.roles.return : target.role === 'persona' ? map.personas[target.persona] || map.personas.general : target.role === 'agent' ? providerStyle(first.provider) : map.roles.secretary;
        return { from, to, kind, color: style.color, pattern: style.pattern, startedAt: at, endedAt: end };
      }
      let completedAt = null;
      for (const e of group) {
        const actor = nodes.get('actor:' + e.agent);
        if (!actor) continue;
        const prior = states.get(actor.id);
        if (terminal.has(e.status) && (!prior || !terminal.has(prior.status) || e.at >= prior.at)) states.set(actor.id, { status: e.status, at: e.at });
        if (!e.child && terminal.has(e.status)) { flow.status = e.status; completedAt = e.at; }
      }
      if (completedAt === null && clock - last >= limits.ttlMs) { flow.status = 'expired'; completedAt = last + limits.ttlMs; }
      flow.endedAt = completedAt;
      for (const n of nodes.values()) {
        const s = states.get(n.id);
        n.status = s ? s.status : completedAt !== null ? flow.status : 'working';
        n.inferredEnd = !s && completedAt !== null;
      }
      for (const [childId, parentId] of parents) {
        const s = states.get(childId), end = s ? s.at : completedAt;
        const childEvents = group.filter(e => 'actor:' + e.agent === childId);
        const began = childEvents.length ? Math.min(...childEvents.map(e => e.at)) : start;
        const ended = end === null || end === undefined ? null : Math.max(began, end);
        flow.edges.push(edge(parentId, childId, nodes.get(childId).role === 'persona' ? 'delegate' : 'assign', began, ended));
        if (ended !== null && (s || flow.status !== 'expired')) flow.edges.push(edge(childId, parentId, 'return', ended, ended));
      }
      flow.nodes = [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id));
      flow.edges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.kind.localeCompare(b.kind));
      return flow;
    }
    function rebuild() {
      eventFlows.clear();
      const sorted = [...events.values()].sort((a, b) => a.at - b.at || priority[a.type] - priority[b.type] || a.key.localeCompare(b.key));
      const sessions = new Map(), groups = new Map();
      for (const e of sorted) {
        const key = e.provider + ':' + e.session;
        if (!sessions.has(key)) sessions.set(key, []);
        sessions.get(key).push(e);
      }
      for (const [key, list] of sessions) {
        const prompts = list.filter(e => e.type === 'call' && !e.child);
        for (const e of list) {
          const prompt = [...prompts].reverse().find(p => p.at <= e.at) || prompts[0];
          const flowId = 'flow-' + hash(key + ':' + (e.explicit || (prompt ? prompt.explicit || prompt.key : 'implicit')));
          eventFlows.set(e.key, flowId);
          if (!groups.has(flowId)) groups.set(flowId, []);
          groups.get(flowId).push(e);
        }
      }
      flows = [...groups].map(([flowId, list]) => project(list, flowId)).sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
      let active = 0;
      for (const f of flows) {
        if (!terminal.has(f.status) && ++active > limits.maxActiveFlows) {
          f.status = 'superseded'; f.endedAt = clock;
          for (const n of f.nodes) if (!terminal.has(n.status)) { n.status = 'superseded'; n.inferredEnd = true; }
          for (const e of f.edges) if (e.endedAt === null) e.endedAt = Math.max(e.startedAt, clock);
        }
      }
      flows = flows.filter(f => f.endedAt === null || clock - f.endedAt <= limits.retentionMs).slice(0, limits.maxFlows);
    }
    function ingest(input, context) {
      const e = normalize(input, context);
      if (!e) return { accepted: false, reason: 'ignored' };
      const rank = { hook: 0, panel: 1, pipeline: 2, log: 3 };
      const better = (a, b) => rank[a.source] - rank[b.source] || a.at - b.at || JSON.stringify(a).localeCompare(JSON.stringify(b));
      const sameId = events.get(e.key);
      const twin = sameId || [...events.values()].find(old => old.source !== e.source &&
        ['call', 'spawn', 'retire', 'report'].includes(e.type) && old.type === e.type && old.provider === e.provider &&
        old.agent === e.agent && old.session === e.session && old.explicit === e.explicit && old.status === e.status && Math.abs(old.at - e.at) <= 1000);
      if (twin) {
        const replace = better(e, twin) < 0;
        if (replace) { events.delete(twin.key); events.set(e.key, e); clock = Math.max(clock, e.at); rebuild(); }
        return { accepted: false, reason: 'duplicate', flowId: eventFlows.get(replace ? e.key : twin.key) };
      }
      events.set(e.key, e); clock = Math.max(clock, e.at);
      if (events.size > limits.maxEvents) {
        const oldest = [...events.values()].sort((a, b) => a.at - b.at || a.key.localeCompare(b.key))[0];
        events.delete(oldest.key); dropped++;
      }
      rebuild(); return { accepted: true, flowId: eventFlows.get(e.key), flows: clone(flows) };
    }
    function tick(at) { clock = Math.max(clock, timestamp(at, clock)); rebuild(); return clone(flows); }
    // V16-B [Diubah oleh Codex - 2026-11-21] Editable mapping changes projection only.
    function configure(settings={},personas=[]){
      const overrides=settings?.subagentTypes||{},signature=JSON.stringify([overrides,personas]);if(signature===mappingSignature)return;
      mappingSignature=signature;map.subagentTypes={...defaultTypes};map.personas=clone(defaultPersonas);
      for(const p of personas.slice(0,12))if(p&&/^[a-z0-9-]{1,32}$/.test(p.id)&&/^#[a-f0-9]{6}$/i.test(p.color)&&!own(map.personas,p.id))map.personas[p.id]={label:text(p.name,24),color:p.color,pattern:'dotted'};
      for(const [key,value] of Object.entries(overrides).slice(0,64))if(!['__proto__','constructor','prototype'].includes(key)&&key.length<=64&&own(map.personas,value))map.subagentTypes[key.toLowerCase()]=value;
      rebuild();
    }
    return { ingest, emit: ingest, tick, configure, snapshot: () => clone(flows),
      get: flowId => clone(flows.find(f => f.id === flowId) || null),
      stats: () => ({ events: events.size, flows: flows.length, active: flows.filter(f => !terminal.has(f.status)).length, dropped, now: clock }),
      clear() { events.clear(); eventFlows.clear(); flows = []; clock = 0; dropped = 0; } };
  }
  return Object.freeze({ create, version: 1 });
}));
