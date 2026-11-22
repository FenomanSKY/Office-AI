"""Claude Code hook: metadata singkat saja; kegagalan selalu exit 0."""
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import socket
import threading
import time


# V16-A: only an explicitly enabled, redacted title can contain prompt text.
def prompt_title(value):
    if not isinstance(value, str) or re.search(r'(?i)secret|password|token|api.?key|bearer|sk-|AIza|ya29\.|[\w.+-]+@[\w.-]+|[a-z]:[\\/]|(?:^|\s)[/~]|-----BEGIN', value):
        return 'Aktivitas agen'
    return ''.join(list(re.sub(r'[\x00-\x1f\x7f]+', ' ', value).strip())[:120]) or 'Aktivitas agen'


def wire_payload(payload):
    # [Diubah oleh Codex - 2026-11-21] V16 server accepts metadata by default; 0 keeps old wire compatibility.
    if os.environ.get('OFFICE_FLOW_METADATA') != '0':
        return payload
    return {key: value for key, value in payload.items() if key not in {'source', 'agent_type', 'taskTitle', 'flow_id', 'at', 'limitDetected', 'flow_status'}}


# V16-C [Diubah oleh Codex - 2026-11-21] Preserve safe custom type IDs for the editable mapping.
def agent_type(value, fallback='general-purpose'):
    return value if isinstance(value, str) and re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9 _.-]{0,47}', value) and '..' not in value and prompt_title(value) == value else fallback


def send_payload(payload, deadline):
    # Fixed IPv4 loopback, no DNS, proxy or redirects. Avoid urllib's costly
    # TLS/email imports for this tiny local HTTP message (measured by V16-A QA).
    port = server_port()
    body = json.dumps(wire_payload(payload)).encode('utf-8')
    headers = ('POST /event HTTP/1.1\r\nHost: 127.0.0.1:{}\r\n'
               'Content-Type: application/json\r\nContent-Length: {}\r\n'
               'Connection: close\r\n\r\n').format(port, len(body)).encode('ascii')
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as connection:
        connection.settimeout(max(0.02, min(0.18, deadline - time.monotonic())))
        connection.connect(('127.0.0.1', port))
        connection.sendall(headers + body)
        response = b''
        while b'\r\n\r\n' not in response and len(response) < 4096:
            block = connection.recv(256)
            if not block:
                break
            response += block
        if not response.startswith(b'HTTP/1.1 200 ') and not response.startswith(b'HTTP/1.0 200 '):
            raise OSError('office_event_rejected')

ROLES = {
    'backend': 'Backend Dev', 'frontend': 'Frontend Dev',
    'full-stack': 'Full-Stack Dev', 'fullstack': 'Full-Stack Dev',
    'qa': 'QA Engineer', 'test': 'QA Engineer', 'devops': 'DevOps',
    'pentest': 'Pentester', 'security': 'Pentester',
    'design': 'Designer', 'explore': 'Researcher', 'research': 'Researcher',
    'plan': 'Project Manager', 'general': 'Full-Stack Dev',
}


def role_for(kind):
    kind = str(kind).lower()
    for key, role in ROLES.items():
        if key in kind:
            return role
    return 'Full-Stack Dev'


def short_id(value):
    return hashlib.sha256(str(value).encode('utf-8')).hexdigest()[:16]


def basename(value):
    if not isinstance(value, str):
        return ''
    parts = value.replace('\\', '/').split('/')
    if any(re.search(r'secret|token|password|\.env', p, re.I) for p in parts):
        return ''
    name = parts[-1]
    return re.sub(r'[^\w. -]', '', name)[:48] if name not in ('', '.', '..') else ''


def command_category(cmd):
    """Kategori dari NAMA biner/ekstensi saja (sama dengan collector.js); perintah tidak pernah dikirim."""
    if not isinstance(cmd, str):
        return 'terminal'
    media = None
    for word in re.findall(r'[^\s"\'`|&;<>(){}=,]+', cmd[:4000]):
        base = re.split(r'[\\/]', word)[-1].lower()
        base = base[:-4] if base.endswith('.exe') else base
        if re.match(r'^(ffmpeg|ffprobe|ffplay|mpv|vlc|handbrakecli)$', base):
            return 'video'
        if re.match(r'^(blender|remotion|hyperframes|chrome-headless-shell|make\.ps1|make\.sh)$', base) or re.match(r'^[\w.-]*render[\w.-]*\.(js|cjs|mjs|py|ps1|sh)$', base):
            return 'render'
        if re.match(r'^(sox|edge-tts|whisper|voice\.ps1|humanize\.ps1|rekam\.py)$', base):
            return 'audio'
        if re.match(r'^(magick|inkscape|gimp|make_thumbnail\.py)$', base):
            return 'design'
        if base in ('curl', 'wget'):
            return 'browse'
        if base in ('sqlite3', 'duckdb', 'psql', 'mysql'):
            return 'data'
        ext = base.rsplit('.', 1)[-1] if '.' in base else ''
        if media is None and ext in ('mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'):
            media = 'video'
        if media is None and ext in ('wav', 'mp3', 'flac', 'ogg', 'm4a', 'aac', 'opus'):
            media = 'audio'
    return media or 'terminal'


def summarize(data, flow_metadata=False, send_prompt_text=False):
    event = data.get('hook_event_name', '')
    if event not in {'PreToolUse', 'PostToolUse', 'SubagentStart', 'SubagentStop', 'Stop', 'StopFailure', 'UserPromptSubmit'}:
        return None
    session = short_id(data.get('session_id', 'local'))
    child = data.get('agent_id')
    identity = 'sub-' + short_id(session + ':' + str(child)) if child else 'main-' + session
    role = role_for(data.get('agent_type', 'general')) if child else 'Claude'
    status, task, category = 'working', 'menyiapkan pekerjaan', None
    if event == 'UserPromptSubmit':
        status, task = 'thinking', 'menyiapkan rencana'
    elif event == 'SubagentStart':
        task = 'memulai tugas agen'
    elif event in {'SubagentStop', 'Stop'}:
        status, task = 'done', 'tugas selesai'
    elif event == 'StopFailure':
        status, task = 'error', 'Aktivitas agen'
    else:
        tool = str(data.get('tool_name', ''))
        if tool in {'Edit', 'MultiEdit', 'Write', 'NotebookEdit'}:
            params = data.get('tool_input')
            params = params if isinstance(params, dict) else {}
            name = basename(params.get('file_path', params.get('notebook_path', '')))
            task = 'mengedit ' + name if name else 'mengedit berkas'
        elif tool in {'Read', 'Grep', 'Glob'}:
            params = data.get('tool_input')
            params = params if isinstance(params, dict) else {}
            name = basename(params.get('file_path', ''))
            task = 'membaca ' + name if name else 'membaca kode'
        elif tool in {'Bash', 'PowerShell', 'Shell'}:
            task = 'menjalankan perintah'
            params = data.get('tool_input')
            category = command_category(params.get('command') if isinstance(params, dict) else None)
        elif tool in {'Agent', 'Task'}:
            task = 'mendelegasikan tugas'
        elif tool in {'WebFetch', 'WebSearch'}:
            task = 'meneliti referensi'
        else:
            task = 'menggunakan alat'
        if event == 'PostToolUse':
            task = 'selesai: ' + task
    payload = {'agent': identity, 'role': role, 'kind': 'subagent' if child else 'main', 'status': status, 'task': task, 'provider': 'claude', 'session': session}
    kind = {'UserPromptSubmit': 'call', 'SubagentStart': 'spawn', 'SubagentStop': 'retire', 'Stop': 'report', 'StopFailure': 'report'}.get(event)
    if category and event != 'PostToolUse':
        payload['category'] = category
    if kind:
        payload['type'] = kind
    if child:
        payload['parent'] = 'main-' + session
    if flow_metadata:
        payload['source'] = 'hook'
        # Type IDs are bounded/redacted before the configurable server mapping.
        payload['agent_type'] = agent_type(data.get('agent_type'), role)
        payload['taskTitle'] = prompt_title(data.get('prompt')) if send_prompt_text else task[:120]
        turn = data.get('turn_id')
        if turn:
            payload['flow_id'] = short_id(session + ':' + str(turn))
        payload['at'] = round(time.time() * 1000)
    stable = data.get('event_id') or data.get('tool_use_id') or data.get('turn_id')
    if stable:
        payload['event_id'] = short_id(session + ':' + event + ':' + str(stable) + ':' + identity)
    return payload


def server_port():
    # Berkas ini dibuat Office AI; abaikan nilai invalid dan pakai port lama.
    try:
        override = os.environ.get('OFFICE_PORT')
        if override and 1 <= int(override) <= 65535:
            return int(override)
        dev_data = Path(os.environ.get('OFFICE_AI_DATA_DIR') or os.environ.get('OFFICE_DATA_DIR') or str(Path(__file__).parent / 'data'))
        try:
            value = int((dev_data / 'port.txt').read_text(encoding='utf-8').strip())
            if 1 <= value <= 65535:
                return value
        except (OSError, ValueError):
            pass
        if os.environ.get('OFFICE_AI_DATA_DIR') or os.environ.get('OFFICE_DATA_DIR'):
            return 8770  # Isolated runs never fall back to the owner's AppData.
        appdata = os.environ.get('APPDATA')
        if appdata:
            with (Path(appdata) / 'OfficeAI' / 'port.txt').open(encoding='utf-8') as stream:
                value = int(stream.read(32).strip())
            if 8770 <= value <= 8775:
                return value
    except (OSError, ValueError):
        pass
    return 8770


# Tidak menyimpan isi/path transkrip: hanya hash sesi, offset byte, ID pesan hash,
# angka usage terakhir per pesan, dan waktu awal. Lock nonblocking menghindari lost update.
FIELDS = ('input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens')


def usage_delta(data, record, deadline):
    value = data.get('transcript_path')
    if not isinstance(value, str):
        return None
    source = Path(value)
    if any(re.search(r'secret|token|password|\.env', part, re.I) for part in source.parts):
        return None
    # Tolak symlink pada seluruh komponen sebelum membuka transkrip.
    for part in [source, *source.parents]:
        if part.is_symlink() or getattr(part.lstat(), 'st_file_attributes', 0) & 0x400:
            return None
    resolved = source.resolve()
    if any(re.search(r'secret|token|password|\.env', part, re.I) for part in resolved.parts):
        return None
    identity = short_id(str(resolved))
    st = resolved.stat()
    positions = record.setdefault('positions', {})
    position = positions.setdefault(identity, {'offset': 0})
    if st.st_size < position['offset']:
        position['offset'] = 0
    record.update(source=identity, offset=position['offset'])
    seen = record.setdefault('seen', {})
    delta = dict.fromkeys(FIELDS, 0)
    found = False
    with resolved.open('rb') as stream:
        stream.seek(record.get('offset', 0))
        scanned = 0
        while time.monotonic() < deadline and scanned < 8 * 1024 * 1024:
            pos = stream.tell()
            line = stream.readline(512 * 1024 + 1)
            if not line:
                break
            scanned += len(line)
            if len(line) > 512 * 1024:
                # Lewati record besar tanpa menahan isinya. Batas ini dilaporkan di README.
                while line and not line.endswith(b'\n') and time.monotonic() < deadline:
                    line = stream.readline(512 * 1024 + 1)
                record['offset'] = stream.tell()
                continue
            if not line.endswith(b'\n'):
                stream.seek(pos)
                break
            record['offset'] = stream.tell()
            try:
                item = json.loads(line)
                if item.get('type') != 'assistant':
                    continue
                message = item.get('message', {})
                usage = message.get('usage', item.get('usage'))
                mid = message.get('id', item.get('uuid'))
                if not mid or not isinstance(usage, dict):
                    continue
                key = short_id(mid)
                prior = seen.setdefault(key, {})
                for field in FIELDS:
                    count = usage.get(field)
                    if type(count) is int and 0 <= count <= 10**12:
                        found = True
                        old = prior.get(field, 0)
                        delta[field] += max(0, count - old)
                        prior[field] = max(old, count)
            except (ValueError, TypeError, AttributeError):
                continue
    position['offset'] = record['offset']
    record['known'] = record.get('known', False) or found
    return delta if record['known'] else None


def main():
    # Watchdog mencakup stdin, IO dan HTTP; daemon, tidak menahan exit normal.
    watchdog = threading.Timer(0.5, lambda: os._exit(0))
    watchdog.daemon = True
    watchdog.start()
    lock = None
    lock_path = None
    try:
        deadline = time.monotonic() + 0.30
        raw = sys.stdin.buffer.read(262145)
        if len(raw) > 262144:
            return
        data = json.loads(raw)
        if not isinstance(data, dict):
            return
        payload = summarize(data, flow_metadata=True, send_prompt_text='--send-prompt-text' in sys.argv)
        if payload is None:
            return
        isolated = os.environ.get('OFFICE_AI_DATA_DIR') or os.environ.get('OFFICE_DATA_DIR')
        folder = Path(isolated) / 'hook_state' if isolated else Path(os.environ.get('LOCALAPPDATA', str(Path(__file__).parent / 'data'))) / 'OfficeAI'
        folder.mkdir(parents=True, exist_ok=True)
        offset_file = folder / 'offsets.json'
        lock_path = folder / 'offsets.lock'
        try:
            lock = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError:
            if time.time() - lock_path.stat().st_mtime > 5:
                lock_path.unlink()
            # A busy usage lock must never discard the visual lifecycle event.
            send_payload(payload, deadline)
            return
        try:
            offsets = json.loads(offset_file.read_text(encoding='utf-8'))
        except (FileNotFoundError, ValueError, UnicodeError):
            offsets = {}
        if not isinstance(offsets, dict):
            offsets = {}
        session = payload['session']
        record = offsets.setdefault(session, {'offset': 0, 'seen': {}})
        event = data.get('hook_event_name')
        if event == 'UserPromptSubmit':
            record['started'] = time.time()
        extra = None
        if event == 'SubagentStop' and isinstance(data.get('agent_transcript_path'), str):
            delta = usage_delta({'transcript_path': data['agent_transcript_path']}, record, deadline)
            if delta is not None:
                extra = dict(payload, type='usage', tokens=delta, event_id=short_id('usage:' + session + ':' + str(record.get('source')) + ':' + str(record.get('offset'))))
        if event == 'Stop':
            payload['duration_s'] = round(max(0, time.time() - record.get('started', time.time())), 3)
            delta = usage_delta(data, record, deadline)
            if delta is not None:
                payload['tokens'] = delta
            payload['task'] = 'Tugas selesai'
            payload['event_id'] = short_id(session + ':' + str(record.get('source')) + ':' + str(record.get('offset')) + ':' + str(record.get('started')))
        for outgoing in ([extra, payload] if extra else [payload]):
            send_payload(outgoing, deadline)
        temp = folder / ('offsets.' + str(os.getpid()) + '.tmp')
        temp.write_text(json.dumps(offsets, separators=(',', ':')), encoding='utf-8')
        os.replace(str(temp), str(offset_file))
    except BaseException:
        pass
    finally:
        if lock is not None:
            os.close(lock)
            try:
                lock_path.unlink()
            except OSError:
                pass
        watchdog.cancel()


if __name__ == '__main__':
    main()
    sys.exit(0)
