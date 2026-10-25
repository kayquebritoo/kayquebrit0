import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, lstat, unlink } from 'node:fs/promises';
import path from 'node:path';

const hash = value => createHash('sha256').update(value).digest('hex');
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const targetPattern = /^40-KBOS-Automatico\/(clientes|projetos|tarefas|planejamentos)\/[a-f0-9-]{36}\.md$/i;
const text = value => String(value ?? '').replace(/[\r\n\x00-\x1f]/g, ' ').replace(/[<>\[\]`]/g, '').slice(0, 500);
const date = value => value ? new Date(value).toISOString() : null;
const digest = value => value === null ? null : hash(value);

async function safePath(root, relative) {
  if (!targetPattern.test(relative)) throw new Error('Caminho fora da pasta gerada');
  root = path.resolve(root);
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) throw new Error('Caminho inválido');
  for (let cursor = target; ; cursor = path.dirname(cursor)) {
    try {
      const stat = await lstat(cursor);
      if (stat.isSymbolicLink()) throw new Error('Links simbólicos não permitidos');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (cursor === path.dirname(cursor)) break;
  }
  return target;
}

async function content(file) {
  try { return await readFile(file, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function atomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = file + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(tmp, value, { flag: 'wx', mode: 0o600 });
    await rename(tmp, file);
  } finally { await unlink(tmp).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}

async function locked(state, fn) {
  await mkdir(state, { recursive: true, mode: 0o700 });
  const lock = path.join(state, 'operation.lock');
  await mkdir(lock, { mode: 0o700 });
  try { return await fn(); }
  finally { const { rmdir } = await import('node:fs/promises'); await rmdir(lock); }
}

function note(kind, row, fields) {
  if (!uuid.test(row.id)) throw new Error('Identificador inválido');
  const body = fields.map(([label, value]) => `- ${label}: ${text(value)}`).join('\n');
  return `---\nfonte: KBOS\ntipo: ${kind}\nkbos_id: ${row.id}\natualizado_na_fonte: ${JSON.stringify(date(row.updatedAt))}\nconteudo_nao_confiavel: true\n---\n\n# ${text(row.name ?? row.titulo ?? kind)}\n\n${body}\n\nDados operacionais copiados do KBOS. Alterar esta nota não altera o sistema.\n`;
}

/** Allowlist explícita: campos extras do banco nunca são serializados. */
export function renderSnapshot(snapshot) {
  if (snapshot?.version !== 1) throw new Error('Versão de snapshot inválida');
  const notes = {};
  const add = (folder, row, fields) => {
    const key = `40-KBOS-Automatico/${folder}/${row.id}.md`;
    if (Object.hasOwn(notes, key)) throw new Error('Identificador duplicado');
    notes[key] = note(folder, row, fields);
  };
  for (const row of snapshot.contacts ?? []) {
    if (row.status !== 'cliente') continue;
    add('clientes', row, [['Nome', row.name], ['Empresa', row.company], ['Situação', row.status]]);
  }
  for (const row of snapshot.projects ?? []) add('projetos', row, [
    ['Título', row.titulo], ['Categoria', row.categoria], ['Etapa', row.status],
    ['Prazo', date(row.prazo)], ['Cliente ID', row.contactId],
  ]);
  for (const row of snapshot.tasks ?? []) add('tarefas', row, [
    ['Título', row.titulo], ['Etapa', row.status], ['Prazo', date(row.dueAt)],
    ['Projeto ID', row.projectId], ['Prioridade', row.priority],
  ]);
  for (const row of snapshot.plans ?? []) {
    if (!(row.version > 0) || row.status === 'draft') continue;
    add('planejamentos', row, [['Projeto ID', row.projectId], ['Versão publicada', row.version], ['Situação', row.status], ['Aprovado em', date(row.approvedAt)]]);
  }
  return Object.fromEntries(Object.entries(notes).sort(([a], [b]) => a.localeCompare(b)));
}

/** Propor não grava no vault. Arquivos ausentes na fonte nunca são apagados. */
export async function propose({ vault, state, snapshot }) {
  vault = path.resolve(vault); state = path.resolve(state);
  if (state === vault || state.startsWith(vault + path.sep)) throw new Error('Fila deve ficar fora do vault');
  return locked(state, async () => {
    const notes = renderSnapshot(snapshot);
    const changes = [];
    for (const [relative, after] of Object.entries(notes)) {
      const before = await content(await safePath(vault, relative));
      if (before !== after) changes.push({ path: relative, before, after });
    }
    const proposal = { version: 1, vault, changes };
    const id = hash(JSON.stringify(proposal));
    const file = path.join(state, id + '.json');
    if (await content(file) === null) await atomic(file, JSON.stringify(proposal, null, 2));
    return { id, changes: changes.length, records: Object.keys(notes).length };
  });
}

async function load(state, id) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('ID de proposta inválido');
  const proposal = JSON.parse(await readFile(path.join(state, id + '.json'), 'utf8'));
  if (hash(JSON.stringify(proposal)) !== id || proposal.version !== 1) throw new Error('Proposta alterada');
  return proposal;
}

function reviewer(actor) {
  if (typeof actor !== 'string' || !actor.trim() || actor.length > 100) throw new Error('Revisor obrigatório');
  return actor.trim();
}

/** Interface de operador local: não constitui API pública nem ferramenta MCP. */
export async function decide({ state, id, action, actor, approval }) {
  state = path.resolve(state); actor = reviewer(actor);
  if (!['approve', 'reject'].includes(action)) throw new Error('Decisão inválida');
  return locked(state, async () => {
    const proposal = await load(state, id);
    const receiptPath = path.join(state, id + '.receipt.json');
    const oldReceipt = await content(receiptPath);
    if (oldReceipt) {
      const receipt = JSON.parse(oldReceipt);
      if (receipt.status === (action === 'reject' ? 'rejected' : 'applied')) return receipt;
      throw new Error('Proposta já decidida ou interrompida; revisar antes de continuar');
    }
    const receipt = { id, actor, at: new Date().toISOString(), status: 'rejected' };
    if (action === 'reject') { await atomic(receiptPath, JSON.stringify(receipt)); return receipt; }
    if (approval !== id) throw new Error('Aprovação explícita do hash da proposta obrigatória');
    const files = [];
    for (const change of proposal.changes) {
      const file = await safePath(proposal.vault, change.path);
      if (await content(file) !== change.before) throw new Error('Conflito: nota mudou após revisão');
      files.push({ ...change, file });
    }
    receipt.status = 'applying';
    await atomic(receiptPath, JSON.stringify(receipt));
    const written = [];
    try {
      for (const change of files) {
        if (await content(change.file) !== change.before) throw new Error('Conflito durante aplicação');
        await atomic(change.file, change.after);
        written.push(change);
      }
      for (const change of files) if (digest(await content(change.file)) !== digest(change.after)) throw new Error('Verificação após gravação falhou');
    } catch (error) {
      let conflict = false;
      for (const change of written.reverse()) {
        if (await content(change.file) !== change.after) { conflict = true; continue; }
        if (change.before === null) await unlink(change.file).catch(e => { if (e.code !== 'ENOENT') throw e; });
        else await atomic(change.file, change.before);
      }
      receipt.status = conflict ? 'failed_needs_review' : 'failed_rolled_back';
      await atomic(receiptPath, JSON.stringify(receipt));
      throw error;
    }
    receipt.status = 'applied';
    await atomic(receiptPath, JSON.stringify(receipt));
    return receipt;
  });
}

/** Reversão também verifica concorrência antes de tocar qualquer arquivo. */
export async function rollback({ state, id, actor, approval }) {
  state = path.resolve(state); actor = reviewer(actor);
  if (approval !== id) throw new Error('Reversão exige confirmação do hash');
  return locked(state, async () => {
    const proposal = await load(state, id);
    const file = path.join(state, id + '.receipt.json');
    const receipt = JSON.parse(await readFile(file, 'utf8'));
    if (receipt.status === 'reverted') return receipt;
    if (!['applied', 'applying', 'reverting'].includes(receipt.status)) throw new Error('Proposta não aplicada');
    const files = [];
    for (const change of proposal.changes) {
      const target = await safePath(proposal.vault, change.path);
      const current = await content(target);
      if (current !== change.after && current !== change.before) throw new Error('Conflito: preservar edição posterior');
      files.push({ ...change, file: target });
    }
    receipt.status = 'reverting';
    await atomic(file, JSON.stringify(receipt));
    for (const change of files) {
      if (change.before === null) await unlink(change.file).catch(e => { if (e.code !== 'ENOENT') throw e; });
      else await atomic(change.file, change.before);
    }
    receipt.status = 'reverted'; receipt.revertedBy = actor; receipt.revertedAt = new Date().toISOString();
    await atomic(file, JSON.stringify(receipt));
    return receipt;
  });
}
