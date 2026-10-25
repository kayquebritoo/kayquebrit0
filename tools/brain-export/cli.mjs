import { readFile } from 'node:fs/promises';
import { propose, decide, rollback } from './engine.mjs';

const [command, state, ...args] = process.argv.slice(2);
try {
  let result;
  if (command === 'propose') {
    const [vault, snapshotFile] = args;
    if (!state || !vault || !snapshotFile) throw new Error('Uso: propose STATE VAULT SNAPSHOT');
    result = await propose({ state, vault, snapshot: JSON.parse(await readFile(snapshotFile, 'utf8')) });
  } else if (command === 'approve' || command === 'reject') {
    const [id, actor, approval] = args;
    result = await decide({ state, id, actor, action: command, approval });
  } else if (command === 'rollback') {
    const [id, actor, approval] = args;
    result = await rollback({ state, id, actor, approval });
  } else throw new Error('Comando inválido');
  console.log(JSON.stringify(result));
} catch (error) { console.error(error.message); process.exitCode = 1; }
