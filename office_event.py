"""Pengirim event Office AI lintas provider; Python stdlib, metadata saja."""
import argparse
import hashlib
import json
import re
import sys
import urllib.request
import uuid
import importlib.util
from pathlib import Path

# Jalur eksplisit mendukung python -I tanpa mengubah sys.path.
_hook_spec = importlib.util.spec_from_file_location('office_local_hook', Path(__file__).with_name('hook_send.py'))
_hook = importlib.util.module_from_spec(_hook_spec)
_hook_spec.loader.exec_module(_hook)
server_port = _hook.server_port


class QuietParser(argparse.ArgumentParser):
    def error(self, message):
        raise SystemExit(0)  # Otomasi tidak boleh terganggu oleh input tidak sah.


def main():
    p = QuietParser(description='Kirim metadata generik Office AI lokal')
    p.add_argument('type', choices=['call', 'report', 'spawn', 'retire', 'usage', 'persona_call', 'submit', 'inspect_start', 'verdict', 'revise', 'learn', 'escalate'])
    # v6-C: provider bawaan atau slug agen kustom yang terdaftar di Pengaturan > Agen di kantor.
    def provider_id(value):
        if not re.fullmatch(r'[a-z0-9-]{1,24}', value or ''):
            raise argparse.ArgumentTypeError('provider: huruf kecil/angka/tanda hubung, maks 24')
        return value
    def account_id(value):
        if not re.fullmatch(r'[a-z0-9-]{1,40}', value or ''):
            raise argparse.ArgumentTypeError('account: huruf kecil/angka/tanda hubung, maks 40')
        return value
    p.add_argument('--provider', type=provider_id, default='codex')
    p.add_argument('--account', type=account_id, help='Id sumber/akun (opsional, lihat Pengaturan > Agen di kantor)')
    p.add_argument('--task', default='Tugas selesai', help='Diganti ringkasan generik; teks bebas tidak dikirim')
    p.add_argument('--tokens', type=int)
    p.add_argument('--input-tokens', type=int)
    p.add_argument('--output-tokens', type=int)
    p.add_argument('--cache-read', type=int)
    p.add_argument('--cache-write', type=int)
    p.add_argument('--duration-s', type=float, default=0)
    p.add_argument('--agent', default='utama')
    p.add_argument('--parent', default='utama')
    p.add_argument('--session', default='local')
    p.add_argument('--model')
    p.add_argument('--agent-type', help='Id jenis subagen untuk pemetaan persona')
    p.add_argument('--persona', help='Id persona yang terdaftar (slug maks 32)')
    p.add_argument('--engine', choices=['claude','codex','gemini','hermes','opencode','other'])
    p.add_argument('--task-id', help='Identitas tugas generik; dihash sebelum dikirim')
    p.add_argument('--round', type=int, choices=[1,2,3], default=1)
    p.add_argument('--result', choices=['pass','fail','unsure'])
    p.add_argument('--checks-passed', type=int)
    p.add_argument('--checks-total', type=int)
    p.add_argument('--category', choices=['code','terminal','video','render','doc','notes','browse','data','design','chat','audio','idle'])
    p.add_argument('--status', choices=['pending','approved'])
    args = p.parse_args()
    fields = dict(zip(['input_tokens','output_tokens','cache_read_input_tokens','cache_creation_input_tokens'], [args.input_tokens,args.output_tokens,args.cache_read,args.cache_write]))
    fields = {k:v for k,v in fields.items() if v is not None}
    if any(v < 0 or v > 10**12 for v in [*fields.values(), *([] if args.tokens is None else [args.tokens])]) or not 0 <= args.duration_s <= 1e9:
        p.error('angka harus nonnegatif dan terbatas')
    if fields and args.tokens is not None:
        p.error('pilih --tokens atau rincian token')
    digest = lambda value: hashlib.sha256(value.encode()).hexdigest()[:16]
    aid = lambda value: 'main-' + args.provider + '-' + digest(value)
    event = {'type':args.type,'provider':args.provider,'agent':aid(args.agent),'parent':aid(args.parent),'session':digest(args.session),'role':args.provider.capitalize() if args.provider != 'other' else 'Agent','task':'Tugas selesai' if args.type == 'report' else 'Aktivitas agen','duration_s':args.duration_s,'event_id':uuid.uuid4().hex}
    # [Diubah oleh Codex - 2026-11-21] V16 metadata enabled; explicit 0 supports older servers.
    if _hook.os.environ.get('OFFICE_FLOW_METADATA') != '0':
        event.update(source='hook', taskTitle=event['task'])
        if args.task_id:
            event['flow_id'] = digest(args.task_id)
        if args.agent_type:
            event['agent_type'] = _hook.agent_type(args.agent_type)
    if args.type in ('spawn','retire'):
        event['agent'] = 'sub-' + args.provider + '-' + digest(args.agent)
        event['kind'] = 'subagent'
    if fields or args.tokens is not None:
        event['tokens'] = fields or args.tokens
    if args.model:
        event['model'] = args.model
    if args.account:
        event['account'] = args.account
    if args.persona or args.type in ('persona_call','submit','inspect_start','verdict','revise','learn','escalate'):
        if not re.fullmatch(r'[a-z0-9-]{1,32}', args.persona or '') or not args.task_id:
            p.error('gunakan --persona id-slug dan --task-id id-generik')
        event = {'type':args.type,'persona':args.persona,'engine':args.engine or args.provider,'task_id':digest(args.task_id),'round':args.round,'event_id':uuid.uuid4().hex}
        if args.category:
            event['category'] = args.category
        if args.duration_s:
            event['duration_s'] = args.duration_s
        if fields or args.tokens is not None:
            event['tokens'] = fields or args.tokens
        if args.type == 'verdict':
            if args.result is None or args.checks_passed is None or args.checks_total is None or not 0 <= args.checks_passed <= args.checks_total <= 200:
                p.error('verdict membutuhkan --result dan --checks-passed/--checks-total 0..200')
            event.update(result=args.result, checks_passed=args.checks_passed, checks_total=args.checks_total)
        if args.type == 'learn':
            if args.status is None:
                p.error('learn membutuhkan --status pending atau approved')
            event['status'] = args.status
    elif args.category:
        event['category'] = args.category
    try:
        req = urllib.request.Request('http://127.0.0.1:{}/event'.format(server_port()), data=json.dumps(event).encode(), headers={'Content-Type':'application/json'}, method='POST')
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                return None
        with urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect()).open(req, timeout=0.7) as response:
            print(json.dumps({'ok':response.status == 200,'type':args.type,'provider':args.provider}))
        return 0
    except Exception:
        return 0  # Integrasi hook gagal diam; tidak mengganggu pekerjaan agen.


if __name__ == '__main__':
    sys.exit(main())
