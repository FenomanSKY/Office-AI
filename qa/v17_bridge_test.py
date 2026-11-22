# [Diubah oleh Codex - 2026-11-21] Static read-only API whitelist and fake math verification.
import ast
import importlib.util
import pathlib
import sys
import types
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('bridge', ROOT / 'mt5_readonly_bridge.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class BridgeTests(unittest.TestCase):
    def test_readonly_api_whitelist(self):
        tree = ast.parse((ROOT / 'mt5_readonly_bridge.py').read_text(encoding='utf-8'))
        calls = {node.func.attr for node in ast.walk(tree) if isinstance(node, ast.Call)
                 and isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name)
                 and node.func.value.id == 'mt5'}
        self.assertLessEqual(calls, {'initialize', 'shutdown', 'positions_get', 'account_info',
                                    'history_deals_get', 'terminal_info', 'symbol_info_tick'})

    def test_net_commission_swap_and_privacy(self):
        p = types.SimpleNamespace(ticket=10, identifier=9, symbol='TEST', type=1, volume=.5,
                                  price_open=100, price_current=98, profit=10, swap=-2, sl=110, tp=90)
        d = types.SimpleNamespace(type=1, entry=0, position_id=9, commission=-4, volume=1)
        fake = types.SimpleNamespace(initialize=lambda **kwargs: True, shutdown=lambda: None,
            account_info=lambda: types.SimpleNamespace(balance=10000, equity=10006, profit=8, currency='USD'),
            positions_get=lambda: [p], history_deals_get=lambda *args, **kwargs: [d])
        sys.modules['MetaTrader5'] = fake
        snap = bridge.fetch_mt5_snapshot()
        self.assertEqual(snap['positions'][0]['net_floating'], 6)
        self.assertEqual(snap['positions'][0]['commission'], -2)
        self.assertEqual(snap['positions'][0]['swap'], -2)
        self.assertNotIn('login', snap['account'])
        fake.history_deals_get = lambda *args, **kwargs: None
        snap = bridge.fetch_mt5_snapshot()
        self.assertIsNone(snap['positions'][0]['commission'])
        self.assertEqual(snap['positions'][0]['net_floating'], 8)
        fake.positions_get = lambda: None
        self.assertEqual(bridge.fetch_mt5_snapshot()['reason'], 'snapshot_unavailable')


if __name__ == '__main__':
    unittest.main()
