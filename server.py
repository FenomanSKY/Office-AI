"""Server lokal Agent Office; Python stdlib, state di memori."""
import json
import math
import mimetypes
import queue
import threading
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
STATUSES = {'working', 'thinking', 'idle', 'meeting', 'error', 'done'}
PUBLIC = {'index.html', 'office.js', 'chars.js', 'furniture.js', 'vendor/three.min.js'}
ORIGINS = {'null', 'http://127.0.0.1:8770', 'http://localhost:8770'}
LOCK = threading.RLock()
AGENTS = {}
CLIENTS = set()
TOTAL_TOKENS = 0
COST_TODAY = 0.0
DAY = datetime.now().astimezone().date().isoformat()
REVISION = 0


def snapshot():
    global DAY, COST_TODAY
    today = datetime.now().astimezone().date().isoformat()
    if DAY != today:
        DAY, COST_TODAY = today, 0.0
    now = time.time()
    rows = []
    for agent in AGENTS.values():
        row = dict(agent)
        if now - row['updated_at'] > 600:
            row['status'] = 'idle'
        rows.append(row)
    return {'agents': rows, 'total_tokens': TOTAL_TOKENS,
            'cost_idr_today': round(COST_TODAY, 4), 'date': DAY,
            'revision': REVISION}


def encode(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False).encode('utf-8')


def validate(data):
    if not isinstance(data, dict):
        raise ValueError('JSON harus berupa objek')
    result = {}
    for name, limit in [('agent', 64), ('role', 40), ('task', 100)]:
        value = data.get(name, '' if name == 'task' else None)
        if not isinstance(value, str) or len(value) > limit or (name != 'task' and not value.strip()):
            raise ValueError(name + ' tidak valid')
        if any(ord(c) < 32 for c in value):
            raise ValueError(name + ' mengandung karakter kontrol')
        result[name] = value
    if not isinstance(data.get('status'), str) or data['status'] not in STATUSES:
        raise ValueError('status tidak valid')
    result['status'] = data['status']
    tokens, cost = data.get('tokens', 0), data.get('cost_idr', 0)
    if type(tokens) is not int or not 0 <= tokens <= 10**12:
        raise ValueError('tokens harus integer nonnegatif')
    if type(cost) not in (int, float) or not math.isfinite(cost) or not 0 <= cost <= 10**12:
        raise ValueError('cost_idr harus angka nonnegatif')
    result.update(tokens=tokens, cost_idr=cost)
    return result


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *_):
        pass

    def allowed(self):
        return (self.headers.get('Origin') in ORIGINS | {None}
                and self.headers.get('Host') in {'127.0.0.1:8770', 'localhost:8770'})

    def common(self):
        origin = self.headers.get('Origin')
        if origin in ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')

    def reply(self, code, value):
        body = encode(value)
        self.send_response(code)
        self.common()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        if not self.allowed():
            self.reply(403, {'error': 'origin/host ditolak'})
            return
        self.send_response(204)
        self.common()
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        if not self.allowed():
            self.reply(403, {'error': 'origin/host ditolak'})
            return
        route = urlsplit(self.path).path
        if route == '/state':
            with LOCK:
                self.reply(200, snapshot())
        elif route == '/events':
            self.events()
        else:
            name = 'index.html' if route == '/' else route.lstrip('/')
            if name not in PUBLIC:
                self.reply(404, {'error': 'tidak ditemukan'})
                return
            path = ROOT / name
            # Allowlist dan tolak symlink; tidak menyajikan berkas privat.
            if path.is_symlink() or path.parent.is_symlink() or not path.is_file():
                self.reply(404, {'error': 'tidak ditemukan'})
                return
            body = path.read_bytes()
            self.send_response(200)
            self.common()
            self.send_header('Content-Type', mimetypes.guess_type(name)[0] or 'application/octet-stream')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    def events(self):
        inbox = queue.Queue(maxsize=32)
        with LOCK:
            if len(CLIENTS) >= 24:
                self.reply(503, {'error': 'terlalu banyak klien'})
                return
            CLIENTS.add(inbox)
            inbox.put(snapshot())
        try:
            self.send_response(200)
            self.common()
            self.send_header('Content-Type', 'text/event-stream; charset=utf-8')
            self.send_header('Connection', 'keep-alive')
            self.end_headers()
            self.connection.settimeout(5)
            while True:
                try:
                    state = inbox.get(timeout=10)
                except queue.Empty:
                    with LOCK:
                        state = snapshot()
                self.wfile.write(b'event: state\ndata: ' + encode(state) + b'\n\n')
                self.wfile.flush()
        except (OSError, TimeoutError):
            pass
        finally:
            with LOCK:
                CLIENTS.discard(inbox)

    def do_POST(self):
        global TOTAL_TOKENS, COST_TODAY, REVISION
        self.close_connection = True
        if not self.allowed():
            self.reply(403, {'error': 'origin/host ditolak'})
            return
        if urlsplit(self.path).path != '/event':
            self.reply(404, {'error': 'tidak ditemukan'})
            return
        if self.headers.get('Content-Type', '').split(';')[0].strip() != 'application/json':
            self.reply(415, {'error': 'gunakan application/json'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 16384:
                self.reply(413, {'error': 'ukuran payload tidak valid'})
                return
            self.connection.settimeout(2)
            event = validate(json.loads(self.rfile.read(length)))
        except (ValueError, UnicodeError, OSError, OverflowError):
            self.reply(400, {'error': 'payload tidak valid'})
            return
        with LOCK:
            if event['agent'] not in AGENTS and len(AGENTS) >= 12:
                self.reply(409, {'error': 'kapasitas maksimal 12 agen'})
                return
            snapshot()  # Reset biaya sebelum menambahkan delta hari ini.
            TOTAL_TOKENS += event.pop('tokens')
            COST_TODAY += event.pop('cost_idr')
            event['updated_at'] = time.time()
            AGENTS[event['agent']] = event
            REVISION += 1
            state = snapshot()
            for inbox in CLIENTS:
                if inbox.full():
                    inbox.get_nowait()
                inbox.put_nowait(state)
            self.reply(200, {'ok': True, 'revision': REVISION})


if __name__ == '__main__':
    server = ThreadingHTTPServer(('127.0.0.1', 8770), Handler)
    server.daemon_threads = True
    print('Agent Office: http://127.0.0.1:8770/ (Ctrl+C untuk berhenti)', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
