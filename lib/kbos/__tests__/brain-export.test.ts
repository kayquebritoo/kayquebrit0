import {afterEach,describe,it,expect} from 'vitest';
import {mkdtemp,readFile,writeFile,rm,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {exportBrainNotes,renderBrainNote,type BrainNote} from '../brain-export';
const dirs:string[]=[];
async function directory(){const p=await mkdtemp(join(tmpdir(),'kbos-brain-'));dirs.push(p);return p;}
const note:BrainNote={id:'00000000-0000-4000-8000-000000000001',kind:'cliente',title:'Estúdio',data:{name:'Estúdio',status:'cliente'}};
const filename=`40-KBOS-Automatico/cliente-${note.id}.md`;
afterEach(async()=>{await Promise.all(dirs.splice(0).map(p=>rm(p,{recursive:true,force:true})));});
describe('cérebro operacional',()=>{
 it('trata títulos e campos do CRM como dados, sem imagens ou blocos executáveis',()=>{
  const rendered=renderBrainNote({...note,title:'![foto](https://externo.example/imagem)',data:{notes:'```\n# instrução falsa'}});
  expect(rendered).not.toContain('# ![foto]');expect(rendered.match(/^```/gm)).toHaveLength(2);
 });
 it('repete sem duplicar, preserva notas pessoais e atualiza com histórico',async()=>{
  const root=await directory();await writeFile(join(root,'Minha nota.md'),'texto pessoal');
  expect((await exportBrainNotes(root,[note])).written).toBe(1);expect((await exportBrainNotes(root,[note])).written).toBe(0);
  const updated={...note,data:{...note.data,status:'inativo'}};
  expect((await exportBrainNotes(root,[updated])).written).toBe(1);
  expect(await readFile(join(root,'Minha nota.md'),'utf8')).toBe('texto pessoal');expect(await readFile(join(root,filename),'utf8')).toContain('inativo');
 });
 it('preserva edição humana e salva proposta de conflito',async()=>{
  const root=await directory();await exportBrainNotes(root,[note]);await writeFile(join(root,filename),'Minha edição');
  expect((await exportBrainNotes(root,[{...note,title:'Alterado'}])).conflicted).toBe(1);
  expect(await readFile(join(root,filename),'utf8')).toBe('Minha edição');
  expect(await readFile(join(root,'40-KBOS-Automatico','Conflitos',`cliente-${note.id}.md`),'utf8')).toContain('Alterado');
 });
 it('sinaliza remoção da origem sem deixar a ficha anterior como atual',async()=>{
  const root=await directory();await exportBrainNotes(root,[note]);await exportBrainNotes(root,[]);
  expect(await readFile(join(root,filename),'utf8')).toContain('removido_na_origem');expect((await exportBrainNotes(root,[])).written).toBe(0);
 });
 it('recusa links simbólicos para não escrever fora da área autorizada',async()=>{
  const root=await directory(),other=await directory();await symlink(other,join(root,'40-KBOS-Automatico'));
  await expect(exportBrainNotes(root,[note])).rejects.toThrow('inválido');
 });
});
