'use strict';
// Real HTTP/SSE + Python processes, isolated state, sequential samples, no UI/CLI agents.
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), base = path.join(__dirname, 'v16a-fixture');
const short = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
const round = value => Math.round(value * 100) / 100;
function summary(samples) {
  const sorted = [...samples].sort((a, b) => a - b), percentile = p => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
  return { count: samples.length, medianMs: round(percentile(.5)), p95Ms: round(percentile(.95)), maxMs: round(sorted.at(-1)) };
}
async function main() {
  await fs.mkdir(base, { recursive: true });
  const fixture = await fs.mkdtemp(path.join(base, 'latency-'));
  const previous = {};
  for (const key of ['OFFICE_AI_DATA_DIR', 'OFFICE_DATA_DIR', 'OFFICE_AI_NO_DRIVE_SCAN', 'OFFICE_COLLECTOR']) previous[key] = process.env[key];
  Object.assign(process.env, { OFFICE_AI_DATA_DIR: fixture, OFFICE_DATA_DIR: fixture, OFFICE_AI_NO_DRIVE_SCAN: '1', OFFICE_COLLECTOR: '0' });
  const python = process.env.OFFICE_PYTHON || 'python';
  let server, stream, request;
  const pending = new Map(), sseTimes = [], stateTimes = [], records = [], observed = [];
  try {
    server = await require('../embedded_server').startServer({ root, dataDir: fixture, port: 0, maxPort: 0, collector: false, allowDriveScan: false });
    const ready = new Promise((resolve, reject) => {
      request = http.get(server.origin + '/events', response => {
        stream = response; stream.setEncoding('utf8'); let buffer = '';
        response.on('data', chunk => {
          buffer += chunk;
          let boundary;
          while ((boundary = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
            resolve();
            if (!frame.includes('event: office-event')) continue;
            const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
            const event = JSON.parse(data), wait = pending.get(event.agent);
            observed.push(event.agent);
            if (wait) { pending.delete(event.agent); wait.resolve({ event, elapsed: performance.now() - wait.start }); }
          }
        });
        response.on('error', reject);
      });
      request.on('error', reject);
    });
    await ready;
    const count = Math.max(5, Math.min(80, Number(process.env.V16A_SAMPLES) || 30));
    for (let i = 0; i < count; i++) {
      const session = 'latency-' + i, agent = 'main-' + short(session), hook = i % 5 === 4 ? 'Stop' : 'UserPromptSubmit';
      let timer;
      const received = new Promise((resolve, reject) => {
        timer = setTimeout(() => { pending.delete(agent); reject(Error('Hook event did not reach SSE: sample ' + i + ', observed=' + observed.length)); }, 3000);
        pending.set(agent, { start: performance.now(), resolve, reject });
      });
      const started = pending.get(agent).start;
      const child = spawn(python, ['-I', '-B', path.join(root, 'hook_send.py')], {
        cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, OFFICE_PORT: String(server.port), OFFICE_FLOW_METADATA: '0', LOCALAPPDATA: fixture, APPDATA: fixture }
      });
      let stderr = '', stdout = '';
      child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
      const done = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => code === 0 ? resolve() : reject(Error('Hook failed'))); });
      child.stdin.on('error', () => {});
      child.stdin.end(JSON.stringify({ hook_event_name: hook, session_id: session, turn_id: 'turn-' + i, prompt: 'fixture content must not be transmitted' }));
      let result;
      try { [result] = await Promise.all([received, done]); } finally { clearTimeout(timer); }
      assert.equal(stderr + stdout, '', 'Hook must be quiet');
      assert.equal(result.event.source, 'hook');
      assert.ok(!JSON.stringify(result.event).includes('fixture content'));
      sseTimes.push(result.elapsed);
      const state = await (await fetch(server.origin + '/state')).json();
      assert.ok(state.agents.some(a => a.agent === agent));
      // Measure /state separately from the same process start, after SSE notification.
      stateTimes.push(performance.now() - started);
      records.push({ hook, sseMs: round(result.elapsed), stateMs: round(stateTimes.at(-1)) });
    }
    // A held accounting lock must still deliver a lifecycle event.
    const folder = path.join(fixture, 'hook_state'); await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, 'offsets.lock'), 'fixture');
    const lockAgent = 'main-' + short('locked');
    let lockTimer;
    const received = new Promise((resolve, reject) => { lockTimer = setTimeout(() => reject(Error('Locked hook dropped visual event')), 3000); pending.set(lockAgent, { start: performance.now(), resolve, reject }); });
    const child = spawn(python, ['-I', '-B', path.join(root, 'hook_send.py')], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'], env: { ...process.env, OFFICE_PORT: String(server.port), OFFICE_FLOW_METADATA: '0', LOCALAPPDATA: fixture, APPDATA: fixture } });
    child.stdin.on('error', () => {}); child.stdin.end(JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 'locked' }));
    const exit = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => code === 0 ? resolve() : reject(Error('Hook failed'))); });
    try { await Promise.all([received, exit]); } finally { clearTimeout(lockTimer); }
    const metrics = { ok: true, measurement: 'Python spawn requested -> office-event SSE received', platform: process.platform,
      ...summary(sseTimes), state: summary(stateTimes), targetMs: 150, withinTarget: Math.max(...sseTimes) <= 150, lockLifecycleDelivered: true, records };
    await fs.writeFile(path.join(base, 'latency.json'), JSON.stringify(metrics, null, 2) + '\n');
    console.log(JSON.stringify(metrics));
  } finally {
    stream?.destroy(); request?.destroy();
    if (server) await server.close();
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    const absolute = path.resolve(fixture);
    if (path.dirname(absolute) !== path.resolve(base)) throw Error('Unsafe fixture cleanup');
    await fs.rm(absolute, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
