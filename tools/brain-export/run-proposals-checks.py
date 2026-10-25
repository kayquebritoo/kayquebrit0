import contextlib
import importlib.util
import io
import json
import pathlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('runner', pathlib.Path(__file__).with_name('run-proposals.py'))
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class SchedulerChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = pathlib.Path(self.temp.name)
        runner.CODE = root / 'code'
        runner.STATE = root / 'state'
        runner.VAULT = root / 'vault'
        runner.CODE.mkdir()
        runner.VAULT.mkdir()
        (runner.CODE / 'collect-eval.ts').write_text('// synthetic collector')
        (runner.VAULT / 'Brain.md').write_text('human')

    def test_only_select_collection_and_readonly_vault_proposal(self):
        calls = []
        def execute(command, **kwargs):
            calls.append(command)
            if command[1] == 'exec':
                return subprocess.CompletedProcess(command, 0, json.dumps({'version': 1, 'contacts': [], 'projects': [], 'tasks': [], 'plans': []}).encode(), b'')
            self.assertIn(f'type=bind,source={runner.VAULT},target=/vault,readonly', command)
            self.assertIn('--network', command)
            self.assertEqual(command[-4:], ['propose', '/state/proposals', '/vault', '/input/snapshot.json'])
            return subprocess.CompletedProcess(command, 0, json.dumps({'id': 'a'*64, 'changes': 0, 'records': 0}).encode(), b'')
        with patch.object(runner.subprocess, 'run', execute), contextlib.redirect_stdout(io.StringIO()):
            runner.main()
        status = json.loads((runner.STATE / 'status.json').read_text())
        self.assertEqual(status['status'], 'ok')
        self.assertEqual(status['proposal']['decision'], 'pending')
        self.assertEqual((runner.VAULT / 'Brain.md').read_text(), 'human')
        self.assertEqual(len(calls), 2)
        self.assertEqual(list(runner.STATE.glob('collect-*')), [])

    def test_failure_is_sanitized_and_does_not_attempt_proposal(self):
        error = subprocess.CalledProcessError(1, 'docker', stderr=b'credential-must-not-leak')
        with patch.object(runner.subprocess, 'run', side_effect=error) as mocked:
            with self.assertRaises(SystemExit):
                runner.main()
        status = (runner.STATE / 'status.json').read_text()
        self.assertNotIn('credential-must-not-leak', status)
        self.assertEqual(mocked.call_count, 1)
        self.assertEqual(json.loads(status)['status'], 'failed')

    def test_snapshot_limit_stops_before_proposal(self):
        result = subprocess.CompletedProcess('docker', 0, b'x'*(10*1024*1024+1), b'')
        with patch.object(runner.subprocess, 'run', return_value=result) as mocked:
            with self.assertRaises(SystemExit):
                runner.main()
        self.assertEqual(mocked.call_count, 1)
        self.assertEqual(json.loads((runner.STATE / 'status.json').read_text())['status'], 'failed')


if __name__ == '__main__':
    unittest.main()
