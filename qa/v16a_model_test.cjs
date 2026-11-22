'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Model = require('../office_flow_model');
const map = require('../office_flow_map.json');
let passed = 0;
const test = (name, fn) => { try { fn(); passed++; } catch (error) { console.error(name); throw error; } };
const event = (type, rest = {}) => ({ type, provider: 'claude', session: 's', agent: 'main', at: 100, ...rest });
const build = (items, options) => { const m = Model.create(options); items.forEach(e => m.ingest(e)); return m; };
const one = m => { assert.equal(m.snapshot().length, 1); return m.snapshot()[0]; };
function valid(m) {
  for (const f of m.snapshot()) {
    assert.ok([...f.taskTitle].length <= 120);
    const nodes = new Set(f.nodes.map(n => n.id));
    assert.equal(nodes.size, f.nodes.length);
    const forward = f.edges.filter(e => e.kind !== 'return'), parents = new Map();
    assert.equal(forward.length, f.nodes.length - 1);
    for (const e of f.edges) {
      assert.ok(nodes.has(e.from) && nodes.has(e.to)); assert.notEqual(e.from, e.to);
      assert.ok(/^#[0-9a-f]{6}$/i.test(e.color)); assert.ok(map.patterns.includes(e.pattern));
      assert.ok(e.endedAt === null || e.endedAt >= e.startedAt);
      if (e.kind === 'return') assert.ok(forward.some(a => a.from === e.to && a.to === e.from));
    }
    for (const e of forward) { assert.ok(!parents.has(e.to)); parents.set(e.to, e.from); }
    for (const n of nodes) {
      const seen = new Set(); let p = n;
      while (parents.has(p)) { assert.ok(!seen.has(p), 'forward cycle'); seen.add(p); p = parents.get(p); }
      assert.equal(p, 'boss');
    }
  }
}
test('prompt spine', () => { const f = one(build([event('call')])); assert.equal(f.nodes.length, 3); assert.equal(f.edges.length, 2); });
test('source hook', () => assert.equal(one(build([event('call')])).source, 'hook'));
for (const source of ['log', 'panel', 'pipeline']) test('source ' + source, () => assert.equal(one(build([event('call', { source })])).source, source));
test('collector normalized', () => assert.equal(one(build([event('call', { source: 'collector' })])).source, 'log'));
test('source context', () => assert.equal(one(build([event('call')], {})).source, 'hook'));
test('Unicode title bounded', () => assert.equal([...one(build([event('call', { taskTitle: '🙂'.repeat(150) })])).taskTitle].length, 120));
test('title controls removed', () => assert.equal(one(build([event('call', { taskTitle: 'a\nb' })])).taskTitle, 'a b'));
test('prompt content ignored', () => assert.ok(!JSON.stringify(build([event('call', { prompt: 'PRIVATE' })]).snapshot()).includes('PRIVATE')));
test('event id duplicate', () => { const m = build([event('call', { event_id: 'x' })]); assert.equal(m.ingest(event('call', { event_id: 'x', at: 200 })).reason, 'duplicate'); });
test('semantic duplicate', () => { const m = build([event('call')]); assert.equal(m.ingest(event('call')).reason, 'duplicate'); });
test('provider namespace ids', () => { const m = build([event('call', { event_id: 'x' }), event('call', { provider: 'codex', event_id: 'x' })]); assert.equal(m.stats().flows, 2); });
test('parallel sessions', () => assert.equal(build([event('call'), event('call', { session: 's2' })]).stats().active, 2));
test('explicit parallel tasks', () => assert.equal(build([event('call', { flow_id: 'a' }), event('call', { flow_id: 'b' })]).stats().active, 2));
test('explicit parent propagation', () => { const m = build([event('call', { flow_id: 'a' }), event('spawn', { agent: 'child', parent: 'main', at: 110 })]); assert.equal(one(m).nodes.length, 4); });
test('successive turns', () => assert.equal(build([event('call'), event('report', { at: 200 }), event('call', { at: 300 })]).stats().flows, 2));
for (const [kind, persona] of Object.entries(map.subagentTypes)) test('mapping ' + kind, () => {
  const f = one(build([event('call'), event('spawn', { agent: 'c', parent: 'main', agent_type: kind })]));
  assert.equal(f.nodes.find(n => n.role === 'persona').persona, persona);
});
test('unknown type general', () => assert.equal(one(build([event('spawn', { agent: 'c', agent_type: 'unknown' })])).nodes.find(n => n.role === 'persona').persona, 'general'));
test('explicit persona', () => assert.equal(one(build([event('spawn', { agent: 'c', persona: 'ui-designer' })])).nodes.find(n => n.role === 'persona').persona, 'ui-designer'));
test('retire missing spawn', () => { const m = build([event('retire', { agent: 'c', parent: 'main' })]); valid(m); assert.ok(one(m).nodes.find(n => n.role === 'persona').inferred); });
test('report missing prompt', () => { const f = one(build([event('report')])); assert.ok(f.inferredStart); assert.equal(f.status, 'completed'); assert.equal(f.edges.filter(e => e.kind === 'return').length, 2); });
test('late spawn terminal sticky', () => { const m = build([event('retire', { agent: 'c', at: 300 }), event('spawn', { agent: 'c', at: 200 })]); assert.equal(one(m).nodes.find(n => n.agent === 'c').status, 'completed'); valid(m); });
test('nested delegation', () => { const m = build([event('call'), event('spawn', { agent: 'a', parent: 'main' }), event('spawn', { agent: 'b', parent: 'a' })]); valid(m); assert.ok(one(m).edges.some(e => e.from === 'actor:a' && e.to === 'actor:b')); });
test('cyclic parent repaired', () => valid(build([event('spawn', { agent: 'a', parent: 'b' }), event('spawn', { agent: 'b', parent: 'a' })])));
test('self parent repaired', () => valid(build([event('spawn', { agent: 'a', parent: 'a' })])));
for (const status of ['failed', 'rate_limited', 'cancelled', 'timed_out']) test('terminal ' + status, () => assert.equal(one(build([event('call'), event('report', { status, at: 200 })])).status, status));
test('error without type', () => assert.equal(one(build([event(undefined, { status: 'error' })])).status, 'failed'));
test('limit detected', () => assert.equal(one(build([event('report', { limitDetected: true })])).status, 'rate_limited'));
test('failed child has failed return while parent works', () => { const f = one(build([event('call'), event('retire', { agent: 'c', status: 'error', at: 200 })])); assert.equal(f.status, 'working'); const edge = f.edges.find(e => e.kind === 'return'); assert.equal(edge.color, map.roles.failed.color); assert.equal(edge.pattern, 'dashed'); });
test('usage ignored', () => assert.equal(build([event('usage')]).stats().flows, 0));
test('chunk ignored', () => assert.equal(build([event('prompt_run_chunk', { output: 'PRIVATE' })]).stats().flows, 0));
for (const input of [null, false, 'text', [], {}, { type: 'unknown' }]) test('invalid ' + JSON.stringify(input), () => assert.equal(Model.create().ingest(input).accepted, false));
test('expire automatically on tick', () => { const m = build([event('call')], { ttlMs: 10 }); m.tick(110); assert.equal(one(m).status, 'expired'); valid(m); });
test('old completed removed', () => { const m = build([event('report')], { retentionMs: 10 }); m.tick(111); assert.equal(m.stats().flows, 0); });
test('active bound', () => { const m = build(Array.from({ length: 10 }, (_, i) => event('call', { session: 's' + i })), { maxActiveFlows: 2 }); assert.equal(m.stats().active, 2); });
test('total flow bound', () => assert.equal(build(Array.from({ length: 10 }, (_, i) => event('call', { session: 's' + i })), { maxFlows: 3 }).stats().flows, 3));
test('node bound', () => { const m = build([event('call'), ...Array.from({ length: 20 }, (_, i) => event('spawn', { agent: 'c' + i }))], { maxNodes: 5 }); assert.equal(one(m).nodes.length, 5); assert.ok(one(m).truncated); valid(m); });
test('journal bound', () => { const m = build(Array.from({ length: 40 }, (_, i) => event('tool', { at: i })), { maxEvents: 16 }); assert.equal(m.stats().events, 16); assert.equal(m.stats().dropped, 24); });
test('snapshot isolated', () => { const m = build([event('call')]); m.snapshot()[0].nodes.length = 0; assert.equal(one(m).nodes.length, 3); });
test('clear', () => { const m = build([event('call')]); m.clear(); assert.equal(m.stats().events, 0); assert.equal(m.stats().flows, 0); });
test('get isolated', () => { const m = build([event('call')]), f = one(m); assert.equal(m.get(f.id).id, f.id); assert.equal(m.get('absent'), null); });
test('antigravity alias', () => assert.equal(one(build([event('call', { provider: 'antigravity' })])).provider, 'gemini'));
test('unknown provider fallback', () => valid(build([event('call', { provider: '__proto__' })])));
test('hook names', () => { const m = Model.create(); m.ingest({ hook_event_name: 'UserPromptSubmit', provider: 'claude', session_id: 's' }); assert.equal(one(m).nodes.length, 3); });
test('panel run', () => { const m = build([{ type: 'prompt_run_started', run: { id: 'r', residentProvider: 'codex' } }]); assert.equal(one(m).source, 'panel'); });
test('browser UMD no DOM', () => { const context = {}; vm.runInNewContext(fs.readFileSync(require.resolve('../office_flow_model'), 'utf8'), context); const m = context.OfficeFlowModel.create({ map }); m.ingest(event('call')); assert.equal(m.snapshot().length, 1); });
test('deterministic replay', () => { const items = [event('call'), event('spawn', { agent: 'c', at: 200 }), event('retire', { agent: 'c', at: 300 }), event('report', { at: 400 })]; assert.deepEqual(build(items).snapshot(), build([...items].reverse()).snapshot()); });
test('cross source duplicate deterministic', () => { const items = [event('call', { source: 'hook', event_id: 'h' }), event('call', { source: 'collector', event_id: 'l', at: 150 })]; assert.deepEqual(build(items).snapshot(), build([...items].reverse()).snapshot()); assert.equal(build(items).stats().events, 1); });
test('duplicate id source preference', () => { const items = [event('call', { source: 'log', event_id: 'same' }), event('call', { source: 'hook', event_id: 'same' })]; assert.deepEqual(build(items).snapshot(), build([...items].reverse()).snapshot()); });
test('late child after report remains valid', () => valid(build([event('report'), event('spawn', { agent: 'c', at: 200 })])));
test('expiry is no fabricated result', () => { const m = build([event('call')], { ttlMs: 10 }); m.tick(110); assert.equal(one(m).edges.filter(e => e.kind === 'return').length, 0); });
test('malformed type/context safe', () => { const m = Model.create(); m.ingest({ type: {}, status: 'working' }, null); valid(m); });
function luminance(hex) { const rgb = hex.slice(1).match(/../g).map(n => parseInt(n, 16) / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4); return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722; }
test('palette contrast both themes >=3', () => { for (const style of [...Object.values(map.providers), ...Object.values(map.personas), ...Object.values(map.roles)]) for (const background of [map.contrast.lightBackground, map.contrast.darkBackground]) { const a = luminance(style.color), b = luminance(background); assert.ok((Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 3, style.color + ' / ' + background); } });
let seed = 1234567;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
test('random replay: 120 shuffled trees', () => {
  for (let trial = 0; trial < 120; trial++) {
    const items = [event('call', { event_id: 'call' })];
    for (let i = 0; i < 8; i++) {
      const parent = i && random() > .3 ? 'c' + Math.floor(random() * i) : 'main';
      if (random() > .2) items.push(event('spawn', { agent: 'c' + i, parent, at: 200 + i, event_id: 's' + i }));
      items.push(event('retire', { agent: 'c' + i, parent, at: 400 + i, event_id: 'r' + i }));
    }
    items.push(event('report', { at: 600, event_id: 'report' }));
    const reference = build(items).snapshot(), shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
    const m = Model.create();
    for (const e of shuffled) { m.ingest(e); valid(m); if (random() > .5) m.ingest(e); }
    assert.deepEqual(m.snapshot(), reference);
  }
});
console.log(JSON.stringify({ ok: true, tests: passed, shuffledTrees: 120 }));
