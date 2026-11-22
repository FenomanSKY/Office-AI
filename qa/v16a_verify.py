"""Compile, privacy-scan and compare metadata, writing evidence only in our fixture."""
import hashlib
import importlib.util
import json
from pathlib import Path
import py_compile
import re
import subprocess
import sys
from datetime import datetime

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / 'qa' / 'v16a-fixture'
FILES = ['office_flow_model.js', 'office_flow_map.json', 'office_hooks.py', 'office_hook_codex.py', 'hook_send.py', 'office_event.py']
FILES += [p.relative_to(ROOT).as_posix() for p in (ROOT / 'qa').glob('v16a_*.cjs')]
FILES += [p.relative_to(ROOT).as_posix() for p in (ROOT / 'qa').glob('v16a_*.py')]
FILES += [p.relative_to(ROOT).as_posix() for p in (ROOT / 'docs' / 'briefs').glob('V16A_*.md') if p.name != 'V16A_FONDASI_TANPA_BENTROK.md']
FILES += ['docs/briefs/V16_PATCHES.md', 'qa/v16a_progress.md', 'qa/v16a_report.md']


def main():
    FIXTURE.mkdir(exist_ok=True)
    compiled = FIXTURE / 'compiled'
    compiled.mkdir(exist_ok=True)
    for name in FILES:
        if name.endswith('.py'):
            py_compile.compile(str(ROOT / name), cfile=str(compiled / (Path(name).name + '.pyc')), dfile=name, doraise=True)
    for name in FILES:
        if name.endswith(('.js', '.cjs')):
            subprocess.run(['node', '--check', str(ROOT / name)], check=True, capture_output=True)
    spec = importlib.util.spec_from_file_location('v16a_public_scan', ROOT / 'publish_repo.py')
    public = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(public)
    existing = [name for name in sorted(set(FILES)) if (ROOT / name).is_file()]
    hits = public.scan(existing)
    dry = subprocess.run([sys.executable, '-I', '-B', str(ROOT / 'publish_repo.py')], cwd=ROOT, capture_output=True, text=True, encoding='utf-8')
    baseline = json.loads((ROOT / 'cadangan' / 'v16a-codex' / 'baseline.json').read_text(encoding='utf-8-sig'))
    shared_changed = []
    unchanged = 0
    for before in baseline:
        if before['path'] in {'hook_send.py', 'office_event.py'}:
            continue
        file = ROOT / before['path']
        if not file.exists():
            shared_changed.append({'path': before['path'], 'missing': True})
            continue
        changed_hash = hashlib.sha256(file.read_bytes()).hexdigest().upper() != before['hash']
        # PowerShell records 100 ns ISO times. Compare integer seconds separately;
        # hashes provide exact content evidence even when timestamp resolution differs.
        stamp = re.sub(r'(\.\d{6})\d+', r'\1', before['mtime'].replace('Z', '+00:00'))
        previous = datetime.fromisoformat(stamp).timestamp()
        changed_time = abs(file.stat().st_mtime - previous) > .00001
        if changed_hash or changed_time:
            shared_changed.append({'path': before['path'], 'contentChanged': changed_hash, 'mtimeChanged': changed_time})
        else:
            unchanged += 1
    result = {'ok': not hits, 'syntax': True, 'ownFilesScanned': len(existing), 'ownPrivacyHits': [{'path': row[0], 'line': row[1], 'reason': row[2]} for row in hits],
              'publishDryRun': {'returnCode': dry.returncode, 'summary': dry.stdout.splitlines()[0] if dry.stdout else 'no output'},
              'sharedBaseline': {'unchanged': unchanged, 'changedSinceStart': shared_changed,
                                 'note': 'Shared edits can belong to the parallel V15 agent; only the two backed-up Python files were edited by Agent C.'}}
    (FIXTURE / 'verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
