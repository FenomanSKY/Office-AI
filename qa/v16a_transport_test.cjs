'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..'), base = path.join(__dirname, 'v16a-fixture');
async function main() {
  await fs.mkdir(base, { recursive: true });
  const fixture = await fs.mkdtemp(path.join(base, 'transport-'));
  let mode = 'normal', redirected = 0, requests = [], passed = 0;
  const server = http.createServer(async (req, res) => {
    if (req.url === '/redirected') redirected++;
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const event = JSON.parse(Buffer.concat(chunks).toString()); requests.push(event);
    if (mode === 'redirect') { res.writeHead(307, { Location: '/redirected' }); res.end(); }
    else { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  async function run(script, data, args = [], extra = {}, keepInput = false) {
    const before = requests.length, started = performance.now();
    const child = spawn(process.env.OFFICE_PYTHON || 'python', ['-I', '-B', path.join(root, script), ...args], {
      windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env,
        OFFICE_PORT: String(server.address().port), OFFICE_AI_DATA_DIR: fixture, OFFICE_DATA_DIR: fixture,
        LOCALAPPDATA: fixture, APPDATA: fixture, OFFICE_FLOW_METADATA: '0', ...extra }
    });
    let output = ''; child.stdout.on('data', c => { output += c; }); child.stderr.on('data', c => { output += c; });
    child.stdin.on('error', () => {});
    if (!keepInput) child.stdin.end(typeof data === 'string' ? data : JSON.stringify(data));
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
    assert.equal(code, 0, output); passed++;
    return { events: requests.slice(before), output, elapsed: performance.now() - started };
  }
  try {
    let r = await run('hook_send.py', { hook_event_name: 'UserPromptSubmit', session_id: 's', prompt: 'PRIVATE' });
    assert.equal(r.events.length, 1, 'Claude hook failed to send'); assert.equal(r.output, ''); assert.ok(!JSON.stringify(r.events).includes('PRIVATE')); passed++;
    r = await run('office_hook_codex.py', { type: 'user_prompt_submit', session_id: 'c', turn_id: 't', prompt: 'PRIVATE' });
    assert.equal(r.events.length, 1); assert.equal(r.events[0].type, 'call'); assert.equal(r.output, ''); passed++;
    r = await run('office_hook_codex.py', '', [JSON.stringify({ type: 'agent-turn-complete', 'thread-id': 'notify', 'turn-id': 't' })]);
    assert.equal(r.events[0].type, 'report'); passed++;
    r = await run('office_event.py', '', ['call', '--provider', 'codex', '--task', 'PRIVATE']);
    assert.equal(r.events[0].type, 'call'); assert.ok(!JSON.stringify(r.events).includes('PRIVATE')); passed++;
    r = await run('hook_send.py', { hook_event_name: 'UserPromptSubmit', session_id: 'rich', prompt: 'PRIVATE' }, [], { OFFICE_FLOW_METADATA: '1' });
    assert.equal(r.events[0].source, 'hook'); assert.equal(r.events[0].taskTitle, 'menyiapkan rencana'); passed++;
    r = await run('hook_send.py', { hook_event_name: 'UserPromptSubmit', session_id: 'title', prompt: 'Build a useful screen' }, ['--send-prompt-text'], { OFFICE_FLOW_METADATA: '1' });
    assert.equal(r.events[0].taskTitle, 'Build a useful screen'); passed++;
    await fs.writeFile(path.join(fixture, 'hook_state', 'offsets.lock'), 'fixture');
    r = await run('hook_send.py', { hook_event_name: 'UserPromptSubmit', session_id: 'locked' });
    assert.equal(r.events.length, 1); passed++;
    await fs.unlink(path.join(fixture, 'hook_state', 'offsets.lock'));
    await fs.writeFile(path.join(fixture, 'hook_state', 'offsets.json'), '{broken');
    r = await run('hook_send.py', { hook_event_name: 'UserPromptSubmit', session_id: 'corrupt' });
    assert.equal(r.events.length, 1); passed++;
    mode = 'redirect';
    for (const script of ['hook_send.py', 'office_hook_codex.py', 'office_event.py']) {
      const args = script === 'office_event.py' ? ['call'] : [];
      await run(script, { hook_event_name: 'UserPromptSubmit', session_id: 'redirect' }, args);
      assert.equal(redirected, 0); passed++;
    }
    mode = 'normal';
    r = await run('hook_send.py', '', [], {}, true);
    assert.equal(r.events.length, 0); assert.ok(r.elapsed < 1000); passed++;
    r = await run('office_hook_codex.py', '', [], {}, true);
    assert.equal(r.events.length, 0); assert.ok(r.elapsed < 1000); passed++;
    console.log(JSON.stringify({ ok: true, tests: passed, redirectsFollowed: redirected }));
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (path.dirname(path.resolve(fixture)) !== path.resolve(base)) throw Error('Unsafe cleanup');
    await fs.rm(fixture, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
