"""V16-A Codex hooks/legacy notify -> metadata-only Office events, always exit 0."""
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import threading
import time

_spec = importlib.util.spec_from_file_location('office_codex_transport', Path(__file__).with_name('hook_send.py'))
_hook = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_hook)


def summarize(data, send_prompt_text=False):
    if not isinstance(data, dict):
        return None
    name = data.get('hook_event_name') or data.get('type') or data.get('event')
    key = re.sub(r'[^a-z]', '', name.lower()) if isinstance(name, str) else ''
    aliases = {'sessionstart': 'session', 'userpromptsubmit': 'call', 'turnstarted': 'call',
               'turnended': 'report', 'agentturncomplete': 'report', 'stop': 'report',
               'sessionend': 'report', 'subagentstart': 'spawn', 'subagentstop': 'retire',
               'pretooluse': 'tool', 'posttooluse': 'tool', 'interrupt': 'report',
               'turnfailed': 'report', 'ratelimited': 'report'}
    kind = aliases.get(key)
    # Session creation is not evidence of a task. Never fabricate a prompt flow.
    if not kind or kind == 'session':
        return None
    session = _hook.short_id(data.get('session_id') or data.get('thread-id') or data.get('thread_id') or 'local')
    child = data.get('agent_id') or data.get('subagent_id')
    parent = data.get('parent_agent_id')
    identity = 'sub-codex-' + _hook.short_id(session + ':' + str(child)) if child else 'main-codex-' + session
    subagent = bool(child) or kind in {'spawn', 'retire'}
    if subagent and not child:
        identity = 'sub-codex-' + _hook.short_id(session + ':unknown')
    failed = key in {'turnfailed', 'ratelimited', 'interrupt'} or data.get('status') in {'failed', 'rate_limited'} or data.get('limitDetected') is True
    status = 'error' if failed else 'done' if kind in {'report', 'retire'} else 'thinking' if kind == 'call' else 'working'
    task = 'tugas selesai' if status == 'done' else 'menyiapkan rencana' if kind == 'call' else 'menggunakan alat' if kind == 'tool' else 'Aktivitas agen'
    result = {'provider': 'codex', 'source': 'hook', 'agent': identity, 'session': session,
              'role': 'Agent' if subagent else 'Codex', 'kind': 'subagent' if subagent else 'main',
              'status': status, 'task': task, 'taskTitle': task, 'at': round(time.time() * 1000)}
    if kind != 'tool':
        result['type'] = kind
    if key == 'ratelimited' or data.get('status') == 'rate_limited' or data.get('limitDetected') is True:
        result['limitDetected'] = True
    if key == 'interrupt':
        result['flow_status'] = 'cancelled'
    if subagent:
        result['parent'] = 'sub-codex-' + _hook.short_id(session + ':' + str(parent)) if parent else 'main-codex-' + session
    turn = data.get('turn_id') or data.get('turn-id')
    stable = data.get('event_id') or data.get('tool_use_id') or turn
    if turn:
        result['flow_id'] = _hook.short_id(session + ':' + str(turn))
    if stable:
        result['event_id'] = _hook.short_id(session + ':' + key + ':' + str(stable) + ':' + identity)
    # V16-C [Diubah oleh Codex - 2026-11-21] Safe custom IDs survive until server mapping.
    result['agent_type'] = _hook.agent_type(data.get('agent_type'))
    if send_prompt_text:
        result['taskTitle'] = _hook.prompt_title(data.get('prompt'))
    return result


def main():
    watchdog = threading.Timer(0.5, lambda: os._exit(0))
    watchdog.daemon = True
    watchdog.start()
    try:
        # Legacy notify appends JSON as an argument; normal hooks send it on stdin.
        args = [arg for arg in sys.argv[1:] if not arg.startswith('--')]
        raw = args[-1] if args else sys.stdin.buffer.read(262145)
        if len(raw) > 262144:
            return
        payload = summarize(json.loads(raw), '--send-prompt-text' in sys.argv)
        if payload:
            _hook.send_payload(payload, time.monotonic() + 0.3)
    except BaseException:
        pass
    finally:
        watchdog.cancel()


if __name__ == '__main__':
    main()
    sys.exit(0)
