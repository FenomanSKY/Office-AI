"""V16-A hook configuration merger. Commands return JSON; no agent CLI is launched."""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import sys
import tempfile
from datetime import datetime, timezone

EVENTS = {
    'claude': ('UserPromptSubmit', 'SubagentStart', 'SubagentStop', 'Stop', 'StopFailure', 'PreToolUse', 'PostToolUse'),
    'codex': ('SessionStart', 'UserPromptSubmit', 'SubagentStart', 'SubagentStop', 'Stop', 'PreToolUse', 'PostToolUse', 'SessionEnd', 'Interrupt'),
}


def safe_path(path):
    path = Path(path).absolute()
    for part in path.parts:
        if part == '..' or part.lower() in {'secrets', '.git'} or part.lower().startswith('.env') or part.endswith(('.', ' ')) or ':' in part and part != path.anchor:
            raise ValueError('forbidden_path')
    for item in (path, *path.parents):
        reparse = item.exists() and getattr(item.lstat(), 'st_file_attributes', 0) & 0x400
        if item.is_symlink() or reparse or (hasattr(item, 'is_junction') and item.is_junction()):
            raise ValueError('symlink_path')
    return path


def encode(data):
    return (json.dumps(data, ensure_ascii=False, indent=2) + '\n').encode('utf-8')


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def atomic(path, raw):
    safe_path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix='.office-hook-', suffix='.tmp', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def read_config(path):
    if not path.exists():
        return None, {}
    if not path.is_file() or path.stat().st_size > 2 * 1024 * 1024:
        raise ValueError('invalid_config_file')
    raw = path.read_bytes()
    try:
        data = json.loads(raw.decode('utf-8-sig'))
    except (ValueError, UnicodeError):
        raise ValueError('invalid_json') from None
    if not isinstance(data, dict) or not isinstance(data.get('hooks', {}), dict):
        raise ValueError('invalid_hooks_object')
    for groups in data.get('hooks', {}).values():
        if not isinstance(groups, list) or any(not isinstance(g, dict) or not isinstance(g.get('hooks'), list) or any(not isinstance(h, dict) for h in g['hooks']) for g in groups):
            raise ValueError('invalid_hook_entries')
    return raw, data


def command_for(provider, send_prompt_text=False):
    script = safe_path(Path(__file__).with_name('hook_send.py' if provider == 'claude' else 'office_hook_codex.py'))
    # JSON contains the exact executable/script, quoted for the provider's shell.
    # Reject shell metacharacters so Windows cmd and Git Bash both remain safe.
    parts = [str(Path(sys.executable).absolute()), '-I', '-B', str(script), '--office-managed-v16a']
    if send_prompt_text:
        parts.append('--send-prompt-text')
    if any(re.search(r'[\r\n"%!?&|<>^`$]', part) for part in parts):
        raise ValueError('unsupported_command_path')
    if os.name == 'nt':
        return ' '.join('"' + part.replace('\\', '/') + '"' for part in parts)
    return shlex.join(parts)


def managed(handler):
    # Only remove our own explicit marker, never another script with a similar name.
    return bool(re.search(r'''(?:^|\s)["']?--office-managed-v16a["']?(?:\s|$)''', str(handler.get('command', ''))))


def strip_managed(data):
    result = copy.deepcopy(data)
    for event, groups in list(result.get('hooks', {}).items()):
        touched = any(managed(h) for group in groups for h in group['hooks'])
        if not touched:
            continue
        kept = []
        for group in groups:
            handlers = [h for h in group['hooks'] if not managed(h)]
            if handlers or not any(managed(h) for h in group['hooks']):
                kept.append(dict(group, hooks=handlers))
        if kept:
            result['hooks'][event] = kept
        else:
            result['hooks'].pop(event, None)
    if not result.get('hooks'):
        result.pop('hooks', None)
    return result


def configuration(command, provider):
    return {event: [{'matcher': '', 'hooks': [{'type': 'command', 'command': command, 'timeout': 1, 'async': True}]}] for event in EVENTS[provider]}


def operate(action, target, provider='claude', send_prompt_text=False, expected_hash=None):
    if provider not in EVENTS or action not in {'status', 'preview', 'install', 'uninstall'}:
        raise ValueError('invalid_action')
    target = safe_path(target)
    manifest = safe_path(target.with_name(target.name + '.office-v16a.json'))
    raw, data = read_config(target)
    # V16-C [Diubah oleh Codex - 2026-11-21] Bind a web preview to the exact bytes.
    if expected_hash is not None and ('absent' if raw is None else digest(raw)) != expected_hash:
        raise ValueError('concurrent_config_change')
    command = command_for(provider, send_prompt_text)
    wanted = configuration(command, provider)
    actual = [(event, handler) for event, groups in data.get('hooks', {}).items() for group in groups for handler in group['hooks'] if managed(handler)]
    complete = len(actual) == len(wanted) and all(sum(h == wanted[event][0]['hooks'][0] for ev, h in actual if ev == event) == 1 for event in wanted)
    status = 'installed' if complete else 'broken' if actual else 'absent'
    base = {'ok': True, 'provider': provider, 'status': status, 'target': str(target), 'changed': False}
    if action == 'status':
        return base
    if action == 'uninstall':
        if not actual:
            return base
        if not manifest.is_file():
            raise ValueError('missing_restore_manifest')
        meta = json.loads(manifest.read_text(encoding='utf-8'))
        if meta.get('version') != 1 or meta.get('provider') != provider:
            raise ValueError('invalid_restore_manifest')
        # Restore byte-for-byte if the configuration is still exactly our write.
        # Later unrelated edits are preserved by surgically removing our handlers.
        if digest(raw or b'') == meta['installed_hash']:
            if meta['existed']:
                backup_name = meta['backup']
                if Path(backup_name).name != backup_name:
                    raise ValueError('invalid_backup_path')
                backup = safe_path(target.with_name(backup_name))
                original = backup.read_bytes()
                if digest(original) != meta['original_hash']:
                    raise ValueError('backup_integrity_error')
                atomic(target, original)
            else:
                target.unlink()
            restored = 'exact'
        else:
            atomic(target, encode(strip_managed(data)))
            restored = 'merged'
        manifest.unlink()
        return dict(base, status='absent', changed=True, restored=restored)
    merged = strip_managed(data) if actual else copy.deepcopy(data)
    for event, entries in wanted.items():
        merged.setdefault('hooks', {}).setdefault(event, []).extend(entries)
    output = raw if complete else encode(merged)
    if action == 'preview':
        return dict(base, changed=not complete, writes=[] if complete else [{'target': str(target), 'content': output.decode('utf-8-sig')}], backupRequired=not complete and raw is not None)
    if complete:
        return base
    # Partial/corrupt installs must not replace the original recovery record.
    if manifest.exists() or actual:
        raise ValueError('incomplete_install_uninstall_first')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ')
    backup = safe_path(target.with_name(target.name + '.office-v16a.' + stamp + '.bak'))
    meta = {'version': 1, 'provider': provider, 'existed': raw is not None, 'backup': backup.name if raw is not None else None,
            'original_hash': digest(raw or b''), 'installed_hash': digest(output)}
    target.parent.mkdir(parents=True, exist_ok=True)
    # Guard against another editor changing the file after the initial read.
    if (target.read_bytes() if target.exists() else None) != raw:
        raise ValueError('concurrent_config_change')
    if raw is not None:
        atomic(backup, raw)
    atomic(manifest, encode(meta))
    atomic(target, output)
    return dict(base, status='installed', changed=True, backup=backup.name if raw is not None else None)


def main(argv=None):
    class JsonParser(argparse.ArgumentParser):
        def error(self, message):
            print(json.dumps({'ok': False, 'status': 'broken', 'error': 'invalid_arguments'}))
            raise SystemExit(2)
    parser = JsonParser(description='Office AI hook merger (JSON)')
    parser.add_argument('action', choices=['status', 'preview', 'install', 'uninstall'])
    parser.add_argument('--provider', choices=list(EVENTS), default='claude')
    parser.add_argument('--scope', choices=['project', 'global'], required=True)
    parser.add_argument('folder', nargs='?')
    parser.add_argument('--home', help='Alternate home for isolated copies')
    parser.add_argument('--send-prompt-text', action='store_true', help='Allow only a sanitized title, max 120 characters; full prompt is never sent')
    parser.add_argument('--expected-hash', help=argparse.SUPPRESS)
    args = parser.parse_intermixed_args(argv)
    try:
        if args.scope == 'project':
            if not args.folder or args.home:
                raise ValueError('project_folder_required')
            base = safe_path(args.folder)
        else:
            if args.folder:
                raise ValueError('global_has_no_folder')
            base = safe_path(args.home or Path.home())
        target = base / ('.claude/settings.json' if args.provider == 'claude' else '.codex/hooks.json')
        print(json.dumps(operate(args.action, target, args.provider, args.send_prompt_text, args.expected_hash), ensure_ascii=False))
        return 0
    except (OSError, ValueError, KeyError, TypeError):
        # Do not echo file contents, exception paths, commands, or credentials.
        print(json.dumps({'ok': False, 'status': 'broken', 'error': 'configuration_not_safe_or_invalid'}))
        return 1


if __name__ == '__main__':
    sys.exit(main())
