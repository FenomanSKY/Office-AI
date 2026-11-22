"""Uji integrasi lokal; dipanggil verify_desktop.js tanpa menulis bytecode."""
import http.client
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.request

port = int(sys.argv[1])
root = Path(__file__).resolve().parent
base = 'http://127.0.0.1:{}'.format(port)
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

def request(route, payload=None, headers=None, raw=None):
    headers = dict(headers or {})
    data = raw
    if payload is not None:
        data = json.dumps(payload).encode()
        headers.setdefault('Content-Type', 'application/json')
    req = urllib.request.Request(base + route, data=data, headers=headers)
    try:
        with opener.open(req, timeout=3) as result:
            return result.status, result.read(), result.headers
    except urllib.error.HTTPError as error:
        return error.code, error.read(), error.headers

def state():
    code, body, _ = request('/state')
    assert code == 200
    return json.loads(body)

def frame(response):
    while True:
        line = response.readline()
        assert line, 'SSE terputus'
        if line.startswith(b'data: '):
            value = json.loads(line[6:])
            assert response.readline() == b'\n'
            return value

assert state()['agents'] == []
stream = http.client.HTTPConnection('127.0.0.1', port, timeout=3)
stream.request('GET', '/events')
response = stream.getresponse()
assert response.status == 200
assert response.getheader('Content-Type').startswith('text/event-stream')
assert frame(response)['revision'] == 0
sample = dict(agent='test-backend', role='Backend Dev', status='working', task='menjalankan tes', tokens=120, cost_idr=3.5)
assert request('/event', sample)[0] == 200
assert frame(response)['total_tokens'] == 120
sample.update(tokens=80, cost_idr=1.5, status='thinking')
assert request('/event', sample)[0] == 200
s = frame(response)
assert s['revision'] == 2 and s['total_tokens'] == 200 and s['cost_idr_today'] == 5
assert state() == s
response.close()
stream.close()

for field, value in [('tokens', True), ('tokens', -1), ('tokens', 1.2), ('cost_idr', -1), ('cost_idr', float('nan')), ('status', 'bad'), ('task', 'x'*101), ('task', None), ('agent', '')]:
    bad = dict(sample)
    bad[field] = value
    assert request('/event', bad)[0] == 400, field
assert request('/event', raw=b'{', headers={'Content-Type':'application/json'})[0] == 400
assert request('/event', raw=b'a'*16385, headers={'Content-Type':'application/json'})[0] == 413
assert request('/event', raw=b'hello')[0] == 415
assert request('/state', headers={'Origin':'https://example.invalid'})[0] == 403
assert request('/state', headers={'Host':'example.invalid'})[0] == 403
assert request('/state', headers={'Origin':'null'})[2]['Access-Control-Allow-Origin'] == 'null'
for route in ['/REPORT.md', '/server.py', '/hook_send.py', '/package.json', '/../REPORT.md', '/vendor/../REPORT.md']:
    assert request(route)[0] == 404, route
for route in ['/', '/office.js', '/chars.js', '/furniture.js', '/vendor/three.min.js']:
    code, body, _ = request(route)
    assert code == 200 and len(body) > 100

# APPDATA diarahkan oleh runner ke fixture di folder kerja.
port_file = Path(os.environ['APPDATA']) / 'OfficeAI' / 'port.txt'
assert int(port_file.read_text()) == port
hook_path = str(root / 'hook_send.py')
for event in ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'SubagentStart', 'SubagentStop', 'Stop']:
    payload = dict(hook_event_name=event, session_id='integration-test', tool_name='Bash',
                   tool_input={'command':'DO_NOT_SEND_FULL_COMMAND'}, prompt='DO_NOT_SEND_PROMPT')
    if event.startswith('Subagent'):
        payload.update(agent_id='child-1', agent_type='backend')
    result = subprocess.run([sys.executable, '-I', '-B', hook_path], input=json.dumps(payload), text=True, capture_output=True, timeout=5)
    assert result.returncode == 0 and not result.stdout and not result.stderr
s = state()
assert len(s['agents']) == 3 and s['revision'] == 8
assert all(a['status'] == 'done' for a in s['agents'] if a['agent'] != 'test-backend')
assert 'DO_NOT_SEND' not in json.dumps(s)
result = subprocess.run([sys.executable, '-I', '-B', hook_path], input='{', text=True, capture_output=True, timeout=5)
assert result.returncode == 0 and not result.stdout and not result.stderr

# Uji pemilihan port default dan penolakan nilai di luar rentang.
import importlib.util
spec = importlib.util.spec_from_file_location('office_hook', hook_path)
hook = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hook)
for text, expected in [('garbage', 8770), ('9000', 8770), ('8775', 8775)]:
    port_file.write_text(text)
    assert hook.server_port() == expected
port_file.unlink()
assert hook.server_port() == 8770
port_file.write_text(str(port))
for i in range(9):
    assert request('/event', dict(agent='capacity-'+str(i), role='QA Engineer', status='idle'))[0] == 200
assert len(state()['agents']) == 12
assert request('/event', dict(agent='overflow', role='QA Engineer', status='idle'))[0] == 409
print('PASS Python: SSE, POST/state, delta, validasi, allowlist/CORS, enam hook, port file, kapasitas 12.')
