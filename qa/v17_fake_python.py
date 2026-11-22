# [Diubah oleh Codex - 2026-11-21] Explicit fake-only interpreter harness. Never imports real MetaTrader5.
import json
import os
import runpy
import sys
import time
import types


def state():
    with open(os.environ['V17_FAKE_STATE'], encoding='utf-8') as handle:
        return json.load(handle)


def record(kind):
    with open(os.environ['V17_FAKE_LOG'], 'a', encoding='utf-8') as handle:
        handle.write(json.dumps({'kind': kind, 'pid': os.getpid(), 'time': time.time()}) + '\n')


mt5 = types.ModuleType('MetaTrader5')


def initialize(**kwargs):
    record('initialize')
    return not state().get('offline', False)


def account_info():
    s = state()
    if s.get('no_account'):
        return None
    return types.SimpleNamespace(**s.get('account', {'balance': 10000, 'equity': 10000, 'profit': 0, 'currency': 'USD'}))


def positions_get():
    s = state()
    if s.get('slow'):
        time.sleep(float(s['slow']))
    if s.get('positions_error'):
        return None
    return tuple(types.SimpleNamespace(**p) for p in s.get('positions', []))


def history_deals_get(*args, **kwargs):
    s = state()
    if kwargs.get('position') and s.get('commission_unavailable'):
        return None
    deals = s.get('deals', [])
    if 'position' in kwargs:
        deals = [d for d in deals if d.get('position_id') == kwargs['position']]
    return tuple(types.SimpleNamespace(**d) for d in deals)


mt5.initialize = initialize
mt5.account_info = account_info
mt5.positions_get = positions_get
mt5.history_deals_get = history_deals_get
mt5.terminal_info = lambda: types.SimpleNamespace(connected=not state().get('offline', False))
mt5.shutdown = lambda: record('shutdown')
sys.modules['MetaTrader5'] = mt5

arguments = [a for a in sys.argv[1:] if a not in ('-I', '-u')]
if arguments and arguments[0] == '--no-module':
    print(json.dumps({'python': True, 'module': False}))
    sys.exit(0)
script, *arguments = arguments
sys.argv = [script, *arguments]
if '--stream' in arguments:
    record('stream')
    if state().get('fail_stream'):
        sys.exit(2)
runpy.run_path(script, run_name='__main__')
