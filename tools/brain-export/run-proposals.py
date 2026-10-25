#!/usr/bin/env python3
"""Host scheduler: SELECT in existing worker; propose with a read-only vault mount."""
import datetime
import fcntl
import hashlib
import json
import os
import pathlib
import subprocess
import tempfile

CODE = pathlib.Path('/opt/kbos-brain-proposals/releases/da7d29e')
STATE = pathlib.Path('/var/lib/kbos-brain-proposals')
VAULT = pathlib.Path('/var/lib/docker/volumes/kbos_brain-vault/_data')


def atomic_json(name, data):
    with tempfile.NamedTemporaryFile(mode='w', dir=STATE, delete=False) as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        temp = handle.name
    os.chmod(temp, 0o600)
    os.replace(temp, STATE / name)


def audit(data):
    log = STATE / 'runs.jsonl'
    if log.exists() and log.stat().st_size > 1024 * 1024:
        os.replace(log, STATE / 'runs.previous.jsonl')
    with log.open('a') as handle:
        handle.write(json.dumps(data) + '\n')


def main():
    os.umask(0o077)
    STATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (STATE / 'scheduler.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        started = datetime.datetime.now(datetime.timezone.utc).isoformat()
        try:
            # The collector has no UPDATE/INSERT; environment stays inside the worker.
            source = (CODE / 'collect-eval.ts').read_text()
            read = subprocess.run(
                ['docker', 'exec', '-e', 'KBOS_BRAIN_EXPORT_ENABLED=1',
                 'kbos-worker-1', 'node_modules/.bin/tsx', '-e', source],
                capture_output=True, timeout=60, check=True)
            if len(read.stdout) > 10 * 1024 * 1024:
                raise ValueError('Snapshot too large')
            snapshot = json.loads(read.stdout)
            assert snapshot['version'] == 1
            counts = {key: len(snapshot.get(key, [])) for key in ['contacts', 'projects', 'tasks', 'plans']}
            with tempfile.TemporaryDirectory(prefix='collect-', dir=STATE) as work:
                snapshot_file = pathlib.Path(work) / 'snapshot.json'
                snapshot_file.write_bytes(read.stdout)
                snapshot_file.chmod(0o600)
                command = ['docker', 'run', '--rm', '--network', 'none', '--read-only',
                           '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
                           '--cpus', '0.5', '--memory', '256m',
                           '--tmpfs', '/tmp:rw,nosuid,size=32m',
                           '--mount', f'type=bind,source={CODE},target=/work,readonly',
                           '--mount', f'type=bind,source={STATE},target=/state',
                           '--mount', f'type=bind,source={VAULT},target=/vault,readonly',
                           '--mount', f'type=bind,source={snapshot_file},target=/input/snapshot.json,readonly',
                           '--workdir', '/work', '--entrypoint', 'node', 'kbos-worker',
                           'cli.mjs', 'propose', '/state/proposals', '/vault', '/input/snapshot.json']
                proposal = subprocess.run(command, capture_output=True, timeout=60, check=True)
                result = json.loads(proposal.stdout)
                receipt = STATE / 'proposals' / (result['id'] + '.receipt.json')
                result['decision'] = json.loads(receipt.read_text()).get('status') if receipt.exists() else 'pending'
            # Check the proposer did not have a write-capable mount to the real vault.
            assert any(str(VAULT) in item and item.endswith(',readonly') for item in command)
            outcome = {'status': 'ok', 'started_at': started,
                       'finished_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                       'counts': counts, 'proposal': result, 'mode': 'proposals_only',
                       'vault_mount': 'readonly', 'code_revision': 'da7d29e',
                       'snapshot_sha256': hashlib.sha256(read.stdout).hexdigest()}
            atomic_json('status.json', outcome)
            audit(outcome)
            print(json.dumps(outcome))
        except Exception:
            # Never log subprocess stderr (could contain database URLs or row content).
            failure = {'status': 'failed', 'started_at': started,
                       'mode': 'proposals_only', 'error': 'Collection failed; inspect locally without exposing secrets'}
            atomic_json('status.json', failure)
            audit(failure)
            raise SystemExit(1)


if __name__ == '__main__':
    main()
