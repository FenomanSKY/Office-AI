# [Diubah oleh Gemini - 2026-11-22] Office AI persona structure, safety, rubric & SHA-256 manifest validator (Python stdlib only)
"""Validate Office AI specialist personas and manage personas/MANIFEST.json SHA-256 integrity hashes.

Usage (from repository root):
  python -I personas/validate_persona.py <id>
  python -I personas/validate_persona.py --all
  python -I personas/validate_persona.py --update
  python -I personas/validate_persona.py --check
  python -I personas/validate_persona.py --all --check --json
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

SLUG_RE = re.compile(r'^[a-z0-9-]{1,32}$')
RESERVED_IDS = {'_template', '_exports', 'runs', 'secretary', 'archivist', 'boss', 'main'}

REQUIRED_PERSONA_HEADINGS = (
    '## Role & Identity',
    '## Scope & Boundaries',
    '## Working Principles',
    '## Strict Output Contract',
    '## Collaboration & Escalation',
    '## Safety Prohibitions',
)

# Constructed via concatenation so static repository leak scanners never flag the validator's own regex table.
FORBIDDEN_PATTERNS = (
    (re.compile(r'(?i)\bignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions\b'), 'prompt_injection_phrase'),
    (re.compile(r'(?i)\bdisregard\s+(?:all\s+)?(?:system|previous|prior)\s+(?:prompt|instructions)\b'), 'prompt_injection_phrase'),
    (re.compile(r'(?i)\byou\s+are\s+now\s+in\s+developer\s+mode\b'), 'prompt_injection_phrase'),
    (re.compile(r'(?i)\bsystem\s+prompt\s+override\b'), 'prompt_injection_phrase'),
    (re.compile(r'(?i)(?:^|[\s`"(])(?:curl|wget)\s+'), 'shell_download_command'),
    (re.compile(r'(?i)\bInvoke-WebRequest\b'), 'shell_download_command'),
    (re.compile(r'(?i)\bpowershell(?:\.exe)?\s+[^\n]*-(?:enc|encodedcommand)\b'), 'encoded_shell_command'),
    (re.compile(r'(?i)\brm\s+-rf\s+/'), 'destructive_shell_command'),
    (re.compile(r'(?i)https?' + r'://[^\s)>"]+'), 'external_url_link'),
    (re.compile(r'GOCS' + r'PX-[A-Za-z0-9_\-]{6,}'), 'credential_client_secret'),
    (re.compile(r'ya2' + r'9\.[A-Za-z0-9_\-]{10,}'), 'credential_access_token'),
    (re.compile(r'AI' + r'za[0-9A-Za-z_\-]{20,}'), 'credential_api_key'),
    (re.compile(r'1//' + r'0[0-9A-Za-z_\-]{20,}'), 'credential_refresh_token'),
    (re.compile(r'"refresh_' + r'token"\s*:'), 'credential_refresh_token'),
    (re.compile(r'\bsk-' + r'[A-Za-z0-9]{20,}'), 'credential_secret_key'),
    (re.compile(r'\bgh[pousr]_' + r'[A-Za-z0-9]{24,}'), 'credential_github_token'),
    (re.compile(r'-----BEGIN\s+[A-Z ]*PRIVATE\s+KEY-----'), 'credential_private_key'),
    (re.compile(r'[A-Za-z]:[\\/]+Us' + r'ers[\\/]+(?!<)'), 'personal_user_path'),
    (re.compile(r'(?<![A-Za-z0-9])/Us' + r'ers/[A-Za-z0-9._-]+/'), 'personal_user_path'),
    (re.compile(r'(?<![A-Za-z0-9])/ho' + r'me/[A-Za-z0-9._-]+/'), 'personal_user_path'),
    (re.compile(r'[A-Za-z]:[\\/]+(?:Pro' + r'ject|Off' + r'ice|To' + r'wn)\b', re.I), 'personal_drive_path'),
    (re.compile(r'(?i)\b(?:ade' + r'ma|ade' + r'mastita)\b'), 'personal_identifier'),
    (re.compile(r'(?i)\b(?:Pro' + r'ject\s+AI|To' + r'wn\s+AI)\b'), 'personal_workspace_name'),
    (re.compile(r'(?i)\b(?:thin\s*' + r'line|pakai\s*' + r'nalar|ceritanya\s*' + r'begini|lino\'?s\s*' + r'bad|linos' + r'badideas|lantern\s*' + r'bed)\b'), 'personal_channel_name'),
)


def personas_root(custom_root=None):
    if custom_root:
        base = Path(custom_root).resolve()
        return base / 'personas' if (base / 'personas').is_dir() else base
    return Path(__file__).resolve().parent


def discover_persona_ids(p_root):
    if not p_root.is_dir():
        return []
    ids = []
    for entry in sorted(p_root.iterdir(), key=lambda x: x.name):
        if not entry.is_dir() or entry.name.startswith('_') or entry.name.startswith('.'):
            continue
        if entry.name in RESERVED_IDS:
            continue
        ids.append(entry.name)
    return ids


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while True:
            chunk = f.read(65536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def collect_persona_files(p_dir):
    files = []
    for name in ('persona.md', 'checklist.md', 'learnings.md'):
        candidate = p_dir / name
        if candidate.is_file():
            files.append(candidate)
    evals_dir = p_dir / 'evals'
    if evals_dir.is_dir():
        for ev in sorted(evals_dir.glob('*.json'), key=lambda x: x.name):
            if ev.is_file():
                files.append(ev)
    return files


def scan_forbidden_content(file_path, rel_label, text):
    errors = []
    for line_no, line in enumerate(text.splitlines(), 1):
        for rx, reason in FORBIDDEN_PATTERNS:
            if rx.search(line):
                errors.append(f'{rel_label}:{line_no}: forbidden pattern [{reason}]')
                break
    return errors


def validate_one(p_root, persona_id):
    errors = []
    warnings = []
    if not SLUG_RE.fullmatch(persona_id or '') or persona_id in RESERVED_IDS:
        return {
            'persona': persona_id,
            'ok': False,
            'errors': [f'Invalid or reserved persona id slug: {persona_id!r} (expected ^[a-z0-9-]{{1,32}}$)'],
            'warnings': [],
            'eval_count': 0,
            'checklist_count': 0,
        }
    p_dir = p_root / persona_id
    if not p_dir.is_dir():
        return {
            'persona': persona_id,
            'ok': False,
            'errors': [f'Persona folder does not exist: {persona_id}'],
            'warnings': [],
            'eval_count': 0,
            'checklist_count': 0,
        }
    if p_dir.is_symlink():
        errors.append(f'{persona_id}: symlink directories are forbidden')

    persona_md = p_dir / 'persona.md'
    checklist_md = p_dir / 'checklist.md'
    learnings_md = p_dir / 'learnings.md'
    evals_dir = p_dir / 'evals'

    for req_file, min_len, max_len in (
        (persona_md, 350, 30000),
        (checklist_md, 250, 15000),
        (learnings_md, 80, 25000),
    ):
        label = f'{persona_id}/{req_file.name}'
        if not req_file.is_file():
            errors.append(f'{label}: missing required file')
            continue
        if req_file.is_symlink():
            errors.append(f'{label}: symlink file is forbidden')
            continue
        try:
            content = req_file.read_text(encoding='utf-8')
        except (OSError, UnicodeDecodeError) as exc:
            errors.append(f'{label}: unreadable UTF-8 text ({exc})')
            continue
        if len(content.strip()) < min_len:
            errors.append(f'{label}: content too short ({len(content.strip())} chars < {min_len})')
        if len(content) > max_len:
            errors.append(f'{label}: content exceeds max length ({len(content)} chars > {max_len})')
        if re.search(r'\{\{[A-Z0-9_]+\}\}', content):
            errors.append(f'{label}: contains unresolved template placeholder {{{{...}}}}')
        errors.extend(scan_forbidden_content(req_file, label, content))

    checklist_count = 0
    if persona_md.is_file():
        p_text = persona_md.read_text(encoding='utf-8', errors='replace')
        last_idx = -1
        for heading in REQUIRED_PERSONA_HEADINGS:
            idx = p_text.find(heading)
            if idx == -1:
                errors.append(f'{persona_id}/persona.md: missing required section {heading!r}')
            elif idx < last_idx:
                errors.append(f'{persona_id}/persona.md: section {heading!r} is out of canonical order')
            else:
                last_idx = idx
        lower_p = p_text.lower()
        if 'untrusted' not in lower_p or 'data' not in lower_p:
            errors.append(f'{persona_id}/persona.md: Safety Prohibitions must explicitly state the untrusted data boundary')
        if 'secret' not in lower_p:
            errors.append(f'{persona_id}/persona.md: Safety Prohibitions must explicitly prohibit reading secrets')

    if checklist_md.is_file():
        c_text = checklist_md.read_text(encoding='utf-8', errors='replace')
        items = re.findall(r'(?m)^-\s*\[\s*\]\s*\*\*\[CHK-\d+\].*$', c_text)
        checklist_count = len(items)
        if checklist_count < 5:
            errors.append(f'{persona_id}/checklist.md: requires at least 5 checkable - [ ] **[CHK-XX]** items (found {checklist_count})')
        for idx, item in enumerate(items, 1):
            if 'evidence:' not in item.lower():
                errors.append(f'{persona_id}/checklist.md: item #{idx} is missing explicit (Evidence: ...) verification guidance')
        if 'injection' not in c_text.lower() and 'untrusted' not in c_text.lower():
            errors.append(f'{persona_id}/checklist.md: must include a prompt-injection / untrusted-data compliance check item')

    if learnings_md.is_file():
        l_text = learnings_md.read_text(encoding='utf-8', errors='replace')
        if '<!-- office-ai-learnings: v1 -->' not in l_text:
            errors.append(f'{persona_id}/learnings.md: missing <!-- office-ai-learnings: v1 --> header')
        for line_no, line in enumerate(l_text.splitlines(), 1):
            if line.startswith('### Learning ') and ('approved_id:' not in line and 'approved_at:' not in line):
                errors.append(f'{persona_id}/learnings.md:{line_no}: learning entry missing approved_id/approved_at governance metadata')

    eval_count = 0
    if not evals_dir.is_dir():
        errors.append(f'{persona_id}/evals: missing required evals/ directory')
    else:
        eval_files = sorted(evals_dir.glob('*.json'), key=lambda x: x.name)
        eval_count = len(eval_files)
        if eval_count < 4:
            errors.append(f'{persona_id}/evals: requires at least 4 *.json evaluation cases (found {eval_count})')
        seen_eval_ids = set()
        for ev_file in eval_files:
            label = f'{persona_id}/evals/{ev_file.name}'
            try:
                raw_ev = ev_file.read_text(encoding='utf-8')
            except (OSError, UnicodeDecodeError) as exc:
                errors.append(f'{label}: unreadable UTF-8 ({exc})')
                continue
            if re.search(r'\{\{[A-Z0-9_]+\}\}', raw_ev):
                errors.append(f'{label}: contains unresolved template placeholder {{{{...}}}}')
            errors.extend(scan_forbidden_content(ev_file, label, raw_ev))
            try:
                data = json.loads(raw_ev)
            except ValueError as exc:
                errors.append(f'{label}: invalid JSON ({exc})')
                continue
            if not isinstance(data, dict):
                errors.append(f'{label}: root must be a JSON object')
                continue
            for req_key in ('id', 'persona', 'title', 'task_input', 'expected_sections', 'rubric', 'failing_example'):
                if req_key not in data:
                    errors.append(f'{label}: missing required key {req_key!r}')
            ev_id = data.get('id')
            if not isinstance(ev_id, str) or not SLUG_RE.fullmatch(ev_id):
                errors.append(f'{label}: "id" must be a valid slug')
            elif ev_id in seen_eval_ids:
                errors.append(f'{label}: duplicate eval id {ev_id!r}')
            else:
                seen_eval_ids.add(ev_id)
            if data.get('persona') != persona_id:
                errors.append(f'{label}: "persona" field {data.get("persona")!r} does not match folder {persona_id!r}')
            if not isinstance(data.get('task_input'), str) or len(data.get('task_input', '').strip()) < 15:
                errors.append(f'{label}: "task_input" must be a non-empty string (>= 15 chars)')
            exp_sec = data.get('expected_sections')
            if not isinstance(exp_sec, list) or len(exp_sec) < 1 or any(not isinstance(s, str) or not s.strip() for s in exp_sec):
                errors.append(f'{label}: "expected_sections" must be a non-empty list of section heading strings')
            rubric = data.get('rubric')
            if not isinstance(rubric, list) or len(rubric) < 1:
                errors.append(f'{label}: "rubric" must be a non-empty list of criterion objects')
            else:
                for r_idx, item in enumerate(rubric, 1):
                    if not isinstance(item, dict) or not all(isinstance(item.get(k), str) and item.get(k).strip() for k in ('id', 'criterion', 'check')):
                        errors.append(f'{label}: rubric item #{r_idx} requires non-empty string keys "id", "criterion", and "check"')
            fail_ex = data.get('failing_example')
            if not isinstance(fail_ex, dict) or not isinstance(fail_ex.get('output'), str) or not fail_ex.get('output').strip() or not isinstance(fail_ex.get('why_it_fails'), str) or not fail_ex.get('why_it_fails').strip():
                errors.append(f'{label}: "failing_example" requires non-empty "output" and "why_it_fails" strings')

    return {
        'persona': persona_id,
        'ok': len(errors) == 0,
        'errors': errors,
        'warnings': warnings,
        'eval_count': eval_count,
        'checklist_count': checklist_count,
    }


def build_manifest_data(p_root):
    personas_map = {}
    for pid in discover_persona_ids(p_root):
        p_dir = p_root / pid
        files_map = {}
        for fpath in collect_persona_files(p_dir):
            rel = fpath.relative_to(p_root).as_posix()
            files_map[rel] = sha256_file(fpath)
        personas_map[pid] = files_map
    return {
        'version': 1,
        'algorithm': 'sha256',
        'personas': personas_map,
    }


def update_manifest(p_root):
    ids = discover_persona_ids(p_root)
    results = [validate_one(p_root, pid) for pid in ids]
    failed = [r for r in results if not r['ok']]
    if failed:
        return {
            'ok': False,
            'action': 'update_manifest',
            'error': 'Refusing to update MANIFEST.json while one or more personas fail validation',
            'results': results,
        }
    manifest_data = build_manifest_data(p_root)
    manifest_path = p_root / 'MANIFEST.json'
    manifest_path.write_text(json.dumps(manifest_data, indent=2) + '\n', encoding='utf-8', newline='\n')
    total_files = sum(len(v) for v in manifest_data['personas'].values())
    return {
        'ok': True,
        'action': 'update_manifest',
        'manifest': str(manifest_path.name),
        'persona_count': len(manifest_data['personas']),
        'file_count': total_files,
    }


def check_manifest(p_root, target_persona=None):
    manifest_path = p_root / 'MANIFEST.json'
    if not manifest_path.is_file():
        return {
            'ok': False,
            'action': 'check_manifest',
            'mismatches': ['MANIFEST.json is missing; run validate_persona.py --update after reviewing persona files'],
        }
    try:
        saved = json.loads(manifest_path.read_text(encoding='utf-8'))
    except ValueError as exc:
        return {
            'ok': False,
            'action': 'check_manifest',
            'mismatches': [f'MANIFEST.json is not valid JSON: {exc}'],
        }
    saved_personas = saved.get('personas') if isinstance(saved, dict) else None
    if not isinstance(saved_personas, dict):
        return {
            'ok': False,
            'action': 'check_manifest',
            'mismatches': ['MANIFEST.json has invalid schema (missing "personas" object)'],
        }
    current = build_manifest_data(p_root)['personas']
    mismatches = []
    check_ids = [target_persona] if target_persona else sorted(set(saved_personas.keys()) | set(current.keys()))
    for pid in check_ids:
        if pid not in saved_personas:
            mismatches.append(f'{pid}: persona directory is not recorded in MANIFEST.json')
            continue
        if pid not in current:
            mismatches.append(f'{pid}: persona recorded in MANIFEST.json is missing on disk')
            continue
        exp_files = saved_personas[pid]
        cur_files = current[pid]
        for rel, exp_hash in sorted(exp_files.items()):
            if rel not in cur_files:
                mismatches.append(f'{rel}: file missing on disk (expected sha256 {exp_hash[:12]}...)')
            elif cur_files[rel] != exp_hash:
                mismatches.append(f'{rel}: SHA-256 mismatch (expected {exp_hash[:12]}..., got {cur_files[rel][:12]}...)')
        for rel in sorted(cur_files.keys()):
            if rel not in exp_files:
                mismatches.append(f'{rel}: untracked file not recorded in MANIFEST.json')
    return {
        'ok': len(mismatches) == 0,
        'action': 'check_manifest',
        'checked_personas': len(check_ids),
        'mismatches': mismatches,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description='Validate Office AI personas and verify SHA-256 MANIFEST.json integrity.')
    parser.add_argument('persona', nargs='?', help='Persona slug ID to validate (or use --all)')
    parser.add_argument('--all', action='store_true', help='Validate all persona directories in personas/')
    parser.add_argument('--update', '--update-manifest', dest='update_manifest', action='store_true', help='Recompute and write personas/MANIFEST.json for all valid personas')
    parser.add_argument('--check', '--check-manifest', dest='check_manifest', action='store_true', help='Verify personas/MANIFEST.json SHA-256 integrity hashes')
    parser.add_argument('--root', help='Optional repository root or personas directory path')
    parser.add_argument('--json', action='store_true', help='Emit machine-readable JSON only')
    args = parser.parse_args(argv)

    p_root = personas_root(args.root)

    if args.update_manifest:
        res = update_manifest(p_root)
        print(json.dumps(res, indent=2))
        return 0 if res['ok'] else 1

    if not args.persona and not args.all and args.check_manifest:
        res = check_manifest(p_root)
        print(json.dumps(res, indent=2))
        return 0 if res['ok'] else 1

    if not args.persona and not args.all:
        parser.error('Specify a <persona-id>, --all, --update, or --check')

    target_ids = discover_persona_ids(p_root) if args.all else [args.persona]
    if args.all and not target_ids:
        out = {'ok': False, 'error': 'No persona directories found', 'results': []}
        print(json.dumps(out, indent=2))
        return 1

    results = [validate_one(p_root, pid) for pid in target_ids]
    all_ok = all(r['ok'] for r in results)
    manifest_report = None
    if args.check_manifest:
        manifest_report = check_manifest(p_root, None if args.all else args.persona)
        if not manifest_report['ok']:
            all_ok = False

    payload = {
        'ok': all_ok,
        'validated_count': len(results),
        'passed_count': sum(1 for r in results if r['ok']),
        'failed_count': sum(1 for r in results if not r['ok']),
        'results': results,
    }
    if manifest_report is not None:
        payload['manifest'] = manifest_report

    print(json.dumps(payload, indent=2))
    return 0 if all_ok else 1


if __name__ == '__main__':
    sys.exit(main())
