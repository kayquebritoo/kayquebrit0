import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { renderSnapshot, propose, decide, rollback } from './engine.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const snapshot = (title = 'Projeto de teste') => ({ version: 1, contacts: [{ id, name: 'Cliente exemplo', status: 'client', phone: 'SEGREDO', document: 'SEGREDO' }], projects: [{ id, titulo: title, status: 'producao', categoria: 'social', prazo: null }] });
const target = `40-KBOS-Automatico/projetos/${id}.md`;
async function setup(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'brain-export-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const vault = path.join(root, 'vault'); const state = path.join(root, 'state');
  await mkdir(vault); await writeFile(path.join(vault, 'Brain.md'), 'Anotação humana');
  return { root, vault, state, snapshot: snapshot() };
}
const approve = (ctx, proposal) => decide({ state: ctx.state, id: proposal.id, action: 'approve', actor: 'operador-teste', approval: proposal.id });

test('proposta não grava no vault e execução repetida gera o mesmo hash', async t => {
  const ctx = await setup(t); const a = await propose(ctx); const b = await propose(ctx);
  assert.deepEqual(a, b); assert.equal(a.changes, 2);
  assert.deepEqual(await readdir(ctx.vault), ['Brain.md']);
});
test('allowlist omite documentos, telefones, valores, rascunhos e mensagens', () => {
  const data = snapshot(); data.projects[0].valor = 'SEGREDO'; data.projects[0].description = 'SEGREDO';
  data.contacts.push({ id: '22222222-2222-4222-8222-222222222222', status: 'lead', name: 'SEGREDO' });
  data.plans = [{ id, status: 'draft', version: 0, draft: 'SEGREDO' }];
  assert.equal(JSON.stringify(renderSnapshot(data)).includes('SEGREDO'), false);
});
test('títulos são dados de uma linha; não injetam frontmatter ou links', () => {
  const result = renderSnapshot(snapshot('x\n---\n[[outra nota]] <script>'));
  assert.equal(result[target].includes('[[outra nota]]'), false);
  assert.equal(result[target].split('\n---\n').length, 2);
});
test('aprovação ausente ou diferente bloqueia escrita', async t => {
  const ctx = await setup(t); const p = await propose(ctx);
  await assert.rejects(decide({ state: ctx.state, id: p.id, action: 'approve', actor: 'teste' }), /Aprovação/);
  await assert.rejects(decide({ state: ctx.state, id: p.id, action: 'approve', actor: 'teste', approval: 'outro' }), /Aprovação/);
  assert.deepEqual(await readdir(ctx.vault), ['Brain.md']);
});
test('rejeitar preserva notas e impede aprovação posterior da mesma proposta', async t => {
  const ctx = await setup(t); const p = await propose(ctx);
  const args = { state: ctx.state, id: p.id, action: 'reject', actor: 'teste' };
  assert.equal((await decide(args)).status, 'rejected');
  assert.equal((await decide(args)).status, 'rejected');
  await assert.rejects(approve(ctx, p), /já decidida/);
  assert.deepEqual(await readdir(ctx.vault), ['Brain.md']);
});
test('aprovar, repetir e reverter preserva nota humana e restaura ausência dos gerados', async t => {
  const ctx = await setup(t); const p = await propose(ctx);
  assert.equal((await approve(ctx, p)).status, 'applied');
  assert.equal((await approve(ctx, p)).status, 'applied');
  assert.equal(await readFile(path.join(ctx.vault, target), 'utf8'), renderSnapshot(ctx.snapshot)[target]);
  assert.equal((await propose(ctx)).changes, 0);
  assert.equal((await rollback({ ...ctx, id: p.id, actor: 'teste', approval: p.id })).status, 'reverted');
  await assert.rejects(readFile(path.join(ctx.vault, target)), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(ctx.vault, 'Brain.md'), 'utf8'), 'Anotação humana');
});
test('atualização e reversão recuperam bytes anteriores', async t => {
  const ctx = await setup(t); const first = await propose(ctx); await approve(ctx, first);
  const before = await readFile(path.join(ctx.vault, target));
  ctx.snapshot = snapshot('Nova etapa'); const second = await propose(ctx); await approve(ctx, second);
  await rollback({ ...ctx, id: second.id, actor: 'teste', approval: second.id });
  assert.deepEqual(await readFile(path.join(ctx.vault, target)), before);
});
test('edição concorrente bloqueia lote inteiro antes da primeira escrita', async t => {
  const ctx = await setup(t); const first = await propose(ctx); await approve(ctx, first);
  ctx.snapshot = snapshot('Alterado'); const p = await propose(ctx);
  await writeFile(path.join(ctx.vault, target), 'Alteração humana posterior');
  await assert.rejects(approve(ctx, p), /Conflito/);
  assert.equal(await readFile(path.join(ctx.vault, target), 'utf8'), 'Alteração humana posterior');
});
test('reversão não sobrescreve edição humana posterior', async t => {
  const ctx = await setup(t); const p = await propose(ctx); await approve(ctx, p);
  await writeFile(path.join(ctx.vault, target), 'Edição após exportação');
  await assert.rejects(rollback({ ...ctx, id: p.id, actor: 'teste', approval: p.id }), /Conflito/);
  assert.equal(await readFile(path.join(ctx.vault, target), 'utf8'), 'Edição após exportação');
});
test('proposta adulterada é recusada', async t => {
  const ctx = await setup(t); const p = await propose(ctx);
  const file = path.join(ctx.state, p.id + '.json'); const data = JSON.parse(await readFile(file));
  data.changes[0].after += 'adulterado'; await writeFile(file, JSON.stringify(data));
  await assert.rejects(approve(ctx, p), /alterada/);
});
test('links simbólicos e IDs com travessia de pasta são recusados', async t => {
  const ctx = await setup(t);
  await symlink(ctx.root, path.join(ctx.vault, '40-KBOS-Automatico'));
  await assert.rejects(propose(ctx), /simbólicos/);
  const data = snapshot(); data.projects[0].id = '../../Brain';
  assert.throws(() => renderSnapshot(data), /Identificador/);
});
test('fila dentro do vault é recusada', async t => {
  const ctx = await setup(t); ctx.state = path.join(ctx.vault, 'fila');
  await assert.rejects(propose(ctx), /fora do vault/);
});
test('remoção da fonte não apaga nota anteriormente exportada', async t => {
  const ctx = await setup(t); const p = await propose(ctx); await approve(ctx, p);
  ctx.snapshot = { version: 1, contacts: [], projects: [] };
  const next = await propose(ctx); assert.equal(next.changes, 0);
  assert.ok(await readFile(path.join(ctx.vault, target), 'utf8'));
});
test('reversão recupera aplicação interrompida', async t => {
  const ctx = await setup(t); const p = await propose(ctx);
  const proposal = JSON.parse(await readFile(path.join(ctx.state, p.id + '.json')));
  const first = proposal.changes[0]; const file = path.join(ctx.vault, first.path);
  await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, first.after);
  await writeFile(path.join(ctx.state, p.id + '.receipt.json'), JSON.stringify({ status: 'applying' }));
  const r = await rollback({ ...ctx, id: p.id, actor: 'teste', approval: p.id });
  assert.equal(r.status, 'reverted'); await assert.rejects(readFile(file), { code: 'ENOENT' });
});
