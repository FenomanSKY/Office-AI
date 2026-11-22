"""Fixture-only tests: never open the owner's hook/configuration directories."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / 'qa' / 'v16a-fixture'
FIXTURE.mkdir(exist_ok=True)


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


hooks = module('v16a_hooks', 'office_hooks.py')
claude = module('v16a_claude', 'hook_send.py')
codex = module('v16a_codex', 'office_hook_codex.py')


class HookTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='hooks-', dir=FIXTURE)
        self.folder = Path(self.temp.name)
        self.target = self.folder / '.claude' / 'settings.json'

    def tearDown(self):
        self.temp.cleanup()

    def write(self, raw):
        self.target.parent.mkdir(parents=True, exist_ok=True)
        self.target.write_bytes(raw)

    def cli(self, *args, input_data=None):
        env = dict(os.environ, PYTHONDONTWRITEBYTECODE='1', OFFICE_AI_DATA_DIR=str(self.folder),
                   OFFICE_DATA_DIR=str(self.folder), LOCALAPPDATA=str(self.folder), APPDATA=str(self.folder),
                   CODEX_HOME=str(self.folder / 'codex-home'))
        return subprocess.run([sys.executable, '-I', '-B', str(ROOT / 'office_hooks.py'), *args],
                              input=input_data, capture_output=True, text=True, env=env, timeout=3)

    def test_preview_no_write(self):
        result = hooks.operate('preview', self.target)
        self.assertTrue(result['changed'])
        self.assertFalse(self.target.parent.exists())

    def test_preview_exact(self):
        preview = hooks.operate('preview', self.target)['writes'][0]['content']
        hooks.operate('install', self.target)
        self.assertEqual(self.target.read_bytes(), preview.encode())

    def test_install_status(self):
        hooks.operate('install', self.target)
        self.assertEqual(hooks.operate('status', self.target)['status'], 'installed')

    def test_no_config_restore_absence(self):
        hooks.operate('install', self.target)
        self.assertEqual(hooks.operate('uninstall', self.target)['restored'], 'exact')
        self.assertFalse(self.target.exists())

    def test_idempotent(self):
        hooks.operate('install', self.target)
        original = self.target.read_bytes()
        files = sorted(self.target.parent.iterdir())
        self.assertFalse(hooks.operate('install', self.target)['changed'])
        self.assertEqual(original, self.target.read_bytes())
        self.assertEqual(files, sorted(self.target.parent.iterdir()))

    def test_merge_other_hook(self):
        original = {'theme': 'dark', 'hooks': {'Stop': [{'matcher': '', 'hooks': [{'type': 'command', 'command': 'echo other'}]}]}}
        self.write(json.dumps(original).encode())
        hooks.operate('install', self.target)
        current = json.loads(self.target.read_bytes())
        self.assertEqual(current['hooks']['Stop'][0], original['hooks']['Stop'][0])
        self.assertEqual(current['theme'], 'dark')

    def test_restore_exact_bytes_bom_whitespace(self):
        raw = b'\xef\xbb\xbf{ "theme": "dark", "hooks": {} }\r\n'
        self.write(raw)
        hooks.operate('install', self.target)
        hooks.operate('uninstall', self.target)
        self.assertEqual(raw, self.target.read_bytes())

    def test_backup_timestamp_and_content(self):
        raw = b'{"hooks":{}}'
        self.write(raw)
        result = hooks.operate('install', self.target)
        self.assertRegex(result['backup'], r'office-v16a\.\d{8}T\d{6}\.\d{6}Z\.bak$')
        self.assertEqual((self.target.parent / result['backup']).read_bytes(), raw)

    def test_preserve_later_edit_on_uninstall(self):
        self.write(b'{"hooks":{"Unused":[]},"theme":"light"}')
        hooks.operate('install', self.target)
        edited = json.loads(self.target.read_bytes())
        edited['theme'] = 'dark'
        edited['hooks']['Extra'] = [{'matcher': '', 'hooks': []}]
        self.target.write_bytes(hooks.encode(edited))
        self.assertEqual(hooks.operate('uninstall', self.target)['restored'], 'merged')
        result = json.loads(self.target.read_bytes())
        self.assertEqual(result, {'theme': 'dark', 'hooks': {'Unused': [], 'Extra': [{'matcher': '', 'hooks': []}]}})

    def test_invalid_json_untouched(self):
        self.write(b'{broken')
        for action in ['preview', 'install', 'status', 'uninstall']:
            with self.assertRaises(ValueError):
                hooks.operate(action, self.target)
        self.assertEqual(self.target.read_bytes(), b'{broken')
        self.assertEqual(len(list(self.target.parent.iterdir())), 1)

    def test_invalid_shapes(self):
        for raw in [b'[]', b'{"hooks":[]}', b'{"hooks":{"Stop":{}}}', b'{"hooks":{"Stop":[{}]}}']:
            self.write(raw)
            with self.assertRaises(ValueError):
                hooks.operate('install', self.target)

    def test_partial_install_reported(self):
        hooks.operate('install', self.target)
        current = json.loads(self.target.read_bytes())
        del current['hooks']['Stop']
        self.target.write_bytes(hooks.encode(current))
        self.assertEqual(hooks.operate('status', self.target)['status'], 'broken')
        with self.assertRaises(ValueError):
            hooks.operate('install', self.target)
        hooks.operate('uninstall', self.target)

    def test_tampered_backup_rejected(self):
        self.write(b'{}')
        installed = hooks.operate('install', self.target)
        (self.target.parent / installed['backup']).write_bytes(b'changed')
        current = self.target.read_bytes()
        with self.assertRaises(ValueError):
            hooks.operate('uninstall', self.target)
        self.assertEqual(self.target.read_bytes(), current)

    def test_missing_restore_manifest_rejected(self):
        hooks.operate('install', self.target)
        self.target.with_name(self.target.name + '.office-v16a.json').unlink()
        with self.assertRaises(ValueError):
            hooks.operate('uninstall', self.target)

    def test_timeout_async(self):
        hooks.operate('install', self.target)
        for groups in json.loads(self.target.read_bytes())['hooks'].values():
            h = groups[0]['hooks'][0]
            self.assertEqual(h['timeout'], 1)
            self.assertTrue(h['async'])
            self.assertNotIn('--send-prompt-text', h['command'])

    def test_explicit_title_option(self):
        hooks.operate('install', self.target, send_prompt_text=True)
        self.assertIn('--send-prompt-text', self.target.read_text())

    def test_marker_quoted_windows(self):
        self.assertTrue(hooks.managed({'command': '"python" "--office-managed-v16a"'}))
        self.assertFalse(hooks.managed({'command': 'echo --office-managed-v16a-other'}))

    def test_codex_schema_events(self):
        target = self.folder / '.codex' / 'hooks.json'
        hooks.operate('install', target, 'codex')
        data = json.loads(target.read_bytes())
        self.assertIn('UserPromptSubmit', data['hooks'])
        self.assertIn('SubagentStart', data['hooks'])
        self.assertNotIn('user_prompt_submit', data['hooks'])
        self.assertIn('office_hook_codex.py', data['hooks']['Stop'][0]['hooks'][0]['command'])
        hooks.operate('uninstall', target, 'codex')

    def test_cli_project(self):
        result = self.cli('preview', '--scope', 'project', str(self.folder))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(json.loads(result.stdout)['ok'])

    def test_cli_global_fixture(self):
        result = self.cli('install', '--provider', 'codex', '--scope', 'global', '--home', str(self.folder))
        self.assertEqual(result.returncode, 0, result.stderr)
        result = self.cli('uninstall', '--provider', 'codex', '--scope', 'global', '--home', str(self.folder))
        self.assertEqual(result.returncode, 0)

    def test_cli_error_json(self):
        self.write(b'invalid')
        result = self.cli('install', '--scope', 'project', str(self.folder))
        self.assertEqual(result.returncode, 1)
        self.assertFalse(json.loads(result.stdout)['ok'])
        self.assertNotIn('invalid', result.stderr)

    def test_forbidden_paths_without_reading(self):
        for value in ['Secrets/settings.json', '.git/settings.json', 'nested/../settings.json']:
            with self.assertRaises(ValueError):
                hooks.operate('status', self.folder / value)

    def test_symlink_rejected(self):
        link = self.folder / 'linked'
        try:
            link.symlink_to(self.target.parent, target_is_directory=True)
        except OSError:
            # Also exercise the guard on Windows without symlink privilege.
            with patch.object(Path, 'is_symlink', return_value=True):
                with self.assertRaises(ValueError):
                    hooks.safe_path(self.target)
        else:
            with self.assertRaises(ValueError):
                hooks.safe_path(link / 'settings.json')

    def test_uninstall_absent(self):
        self.assertFalse(hooks.operate('uninstall', self.target)['changed'])


class EventTests(unittest.TestCase):
    def test_codex_prompt_aliases(self):
        for name in ['UserPromptSubmit', 'user_prompt_submit', 'user-prompt-submit', 'turn_started']:
            result = codex.summarize({'hook_event_name': name, 'session_id': 's', 'prompt': 'DO NOT SEND'})
            self.assertEqual(result['type'], 'call')
            self.assertEqual(result['source'], 'hook')
            self.assertNotIn('DO NOT SEND', json.dumps(result))

    def test_codex_session_not_task(self):
        for name in ['session_start', 'SessionStart']:
            self.assertIsNone(codex.summarize({'type': name}))

    def test_codex_notify_completion(self):
        event = codex.summarize({'type': 'agent-turn-complete', 'thread-id': 's', 'turn-id': 't', 'last-assistant-message': 'DO NOT SEND'})
        self.assertEqual(event['type'], 'report')
        self.assertEqual(event['status'], 'done')
        self.assertNotIn('DO NOT SEND', json.dumps(event))

    def test_codex_children_and_parent(self):
        child = codex.summarize({'type': 'subagent_start', 'agent_id': 'c', 'parent_agent_id': 'p', 'agent_type': 'Explore'})
        self.assertEqual(child['type'], 'spawn')
        self.assertTrue(child['parent'].startswith('sub-codex-'))
        self.assertEqual(child['agent_type'], 'Explore')
        self.assertNotEqual(child['parent'], child['agent'])

    def test_codex_failure(self):
        for name in ['turn_failed', 'rate_limited']:
            self.assertEqual(codex.summarize({'type': name})['status'], 'error')

    def test_codex_limit_cancel_evidence(self):
        self.assertTrue(codex.summarize({'type': 'rate_limited'})['limitDetected'])
        self.assertEqual(codex.summarize({'type': 'Interrupt'})['flow_status'], 'cancelled')

    def test_claude_failure(self):
        event = claude.summarize({'hook_event_name': 'StopFailure'}, True)
        self.assertEqual(event['status'], 'error')
        self.assertEqual(event['type'], 'report')

    def test_claude_child_event_ids_differ(self):
        data = {'hook_event_name': 'SubagentStart', 'session_id': 's', 'turn_id': 't'}
        self.assertNotEqual(claude.summarize(dict(data, agent_id='a'))['event_id'], claude.summarize(dict(data, agent_id='b'))['event_id'])

    def test_codex_tools(self):
        event = codex.summarize({'hook_event_name': 'PreToolUse', 'tool_name': 'Shell', 'tool_input': {'command': 'PRIVATE'}})
        self.assertNotIn('type', event)
        self.assertNotIn('PRIVATE', json.dumps(event))

    def test_codex_unknown(self):
        for data in [None, [], 'x', {}, {'type': 'unknown'}]:
            self.assertIsNone(codex.summarize(data))

    def test_event_ids_stable(self):
        data = {'type': 'user_prompt_submit', 'thread-id': 's', 'turn-id': 't'}
        self.assertEqual(codex.summarize(data)['event_id'], codex.summarize(data)['event_id'])

    def test_default_wire_compatibility(self):
        payload = codex.summarize({'type': 'turn-ended', 'turn_id': 't'})
        with patch.dict(os.environ, {'OFFICE_FLOW_METADATA': '0'}):
            wire = claude.wire_payload(payload)
        for key in ['source', 'flow_id', 'at', 'agent_type', 'taskTitle']:
            self.assertNotIn(key, wire)

    def test_rich_wire_opt_in(self):
        with patch.dict(os.environ, {'OFFICE_FLOW_METADATA': '1'}):
            self.assertEqual(claude.wire_payload({'source': 'hook'}), {'source': 'hook'})

    def test_claude_backward_shape(self):
        event = claude.summarize({'hook_event_name': 'SubagentStart', 'session_id': 's', 'agent_id': 'c', 'agent_type': 'Explore'})
        self.assertEqual(event['type'], 'spawn')
        self.assertEqual(event['role'], 'Researcher')
        self.assertNotIn('source', event)

    def test_claude_rich_metadata(self):
        event = claude.summarize({'hook_event_name': 'UserPromptSubmit', 'session_id': 's', 'turn_id': 't', 'prompt': 'PRIVATE'}, True)
        self.assertEqual(event['source'], 'hook')
        self.assertNotIn('PRIVATE', json.dumps(event))
        self.assertIn('flow_id', event)

    def test_usage_deltas_and_partial_lines(self):
        with tempfile.TemporaryDirectory(prefix='usage-', dir=FIXTURE) as folder:
            transcript = Path(folder, 'transcript.jsonl')
            item = {'type': 'assistant', 'message': {'id': 'message-demo', 'usage': {'input_tokens': 10, 'output_tokens': 4}}}
            transcript.write_text(json.dumps(item) + '\n', encoding='utf-8')
            record = {}
            delta = claude.usage_delta({'transcript_path': str(transcript)}, record, time.monotonic() + 1)
            self.assertEqual(delta['input_tokens'], 10)
            self.assertEqual(delta['output_tokens'], 4)
            self.assertEqual(sum(claude.usage_delta({'transcript_path': str(transcript)}, record, time.monotonic() + 1).values()), 0)
            item['message']['usage']['input_tokens'] = 12
            with transcript.open('a', encoding='utf-8') as stream:
                stream.write(json.dumps(item) + '\n{"partial"')
            delta = claude.usage_delta({'transcript_path': str(transcript)}, record, time.monotonic() + 1)
            self.assertEqual(delta['input_tokens'], 2)
            self.assertEqual(delta['output_tokens'], 0)

    def test_usage_forbidden_path_rejected_before_io(self):
        with patch.object(Path, 'stat', side_effect=AssertionError('Must not touch forbidden path')):
            self.assertIsNone(claude.usage_delta({'transcript_path': 'Secrets/never-open.jsonl'}, {}, time.monotonic() + 1))

    def test_usage_symlink_rejected_before_open(self):
        with patch.object(Path, 'is_symlink', return_value=True):
            self.assertIsNone(claude.usage_delta({'transcript_path': 'transcript.jsonl'}, {}, time.monotonic() + 1))

    def test_title_length(self):
        self.assertEqual(len(claude.prompt_title('a' * 200)), 120)

    def test_title_redaction(self):
        for value in ['password=demo', 'secret value', 'api_key=demo', 'mail@example.test', '/private/file', 'token demo', 'sk-example', 'Bearer example']:
            self.assertEqual(claude.prompt_title(value), 'Aktivitas agen')

    def test_isolated_port_discovery(self):
        with tempfile.TemporaryDirectory(prefix='port-', dir=FIXTURE) as folder:
            Path(folder, 'port.txt').write_text('12345')
            with patch.dict(os.environ, {'OFFICE_AI_DATA_DIR': folder, 'OFFICE_PORT': ''}):
                self.assertEqual(claude.server_port(), 12345)
            Path(folder, 'port.txt').unlink()
            with patch.dict(os.environ, {'OFFICE_AI_DATA_DIR': folder, 'OFFICE_PORT': ''}):
                self.assertEqual(claude.server_port(), 8770)

    def test_offline_quiet(self):
        with tempfile.TemporaryDirectory(prefix='offline-', dir=FIXTURE) as folder:
            env = dict(os.environ, OFFICE_AI_DATA_DIR=folder, OFFICE_PORT='1', LOCALAPPDATA=folder, APPDATA=folder)
            for filename in ['hook_send.py', 'office_hook_codex.py']:
                start = time.monotonic()
                result = subprocess.run([sys.executable, '-I', '-B', str(ROOT / filename)], input='{"hook_event_name":"UserPromptSubmit"}',
                                        capture_output=True, text=True, env=env, timeout=2)
                self.assertEqual(result.returncode, 0)
                self.assertEqual(result.stdout + result.stderr, '')
                self.assertLess(time.monotonic() - start, 1)

    def test_malformed_payload_quiet(self):
        for filename in ['hook_send.py', 'office_hook_codex.py']:
            result = subprocess.run([sys.executable, '-I', '-B', str(ROOT / filename)], input='{invalid', capture_output=True, text=True, timeout=2)
            self.assertEqual((result.returncode, result.stdout, result.stderr), (0, '', ''))


if __name__ == '__main__':
    unittest.main(verbosity=1)
