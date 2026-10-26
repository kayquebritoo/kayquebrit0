import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm";
import { readFileSync, readdirSync } from "node:fs";
import * as schema from "../schema";
const holder=vi.hoisted(()=>({db:null as unknown}));
vi.mock("../db",()=>({db:()=>holder.db}));
import { consolidationPlan, consolidationFor, applyConsolidation, revertConsolidation } from "../content-consolidation";
import { calendarSnapshot, calendarCsv } from "../calendar-export";
const pg=new PGlite(); const d=drizzle(pg,{schema});
beforeAll(async()=>{
  holder.db=new Proxy(d,{get(target,key){if(key==='execute') return async(q: Parameters<PgDialect['sqlToQuery']>[0])=>{const query=new PgDialect().sqlToQuery(q); return pg.query(query.sql,query.params);};return Reflect.get(target,key);}});
  for(const name of readdirSync('drizzle').filter(n=>/^\d.*\.sql$/.test(n)).sort()) await pg.exec(readFileSync(`drizzle/${name}`,'utf8'));
},30000);
afterAll(async()=>{await pg.close();});
describe('calendário independente',()=>{
 it('exporta família e ocultos; consolida atomicamente preservando publicado, texto e redes; desfaz',async()=>{
  const [user]=await d.insert(schema.users).values({name:'Admin',email:'calendar@test.local',role:'admin'}).returning();
  const [root]=await d.insert(schema.projects).values({titulo:'Grupo',categoria:'social'}).returning();
  const [child]=await d.insert(schema.projects).values({titulo:'Hotel',categoria:'social',parentId:root.id}).returning();
  const [a,b]=await d.insert(schema.socialPosts).values([
    {projectId:child.id,brand:'Hotel',title:'Jantar',format:'reels',scheduledAt:new Date('2026-10-17T03:00:00Z'),script:'Roteiro completo',externalKey:'ics2:test'},
    {projectId:child.id,brand:'Hotel',title:'Jantar',format:'reels',scheduledAt:new Date('2026-10-17T03:00:00Z'),status:'postado',caption:'Legenda',networks:['instagram']}
  ]).returning();
  await d.insert(schema.postPublications).values({postId:b.id,network:'instagram',status:'publicado',url:'https://instagram.com/p/test'});
  const snap=await calendarSnapshot(root.id); expect(snap.posts).toHaveLength(2);expect(snap.publications).toHaveLength(1);
  const [plan]=await consolidationFor(root.id,'2026-10');expect(plan.safe).toBe(true);expect(plan.keeperId).toBe(b.id);
  const result=await applyConsolidation(root.id,'2026-10',b.id,plan.version,user.id);expect(result.consolidated).toBe(1);
  const rows=await d.select().from(schema.socialPosts).where(eq(schema.socialPosts.projectId,child.id));
  expect(rows.find(p=>p.id===a.id)?.linkedTo).toBe(b.id);expect(rows.find(p=>p.id===b.id)?.script).toBe('Roteiro completo');expect(rows.find(p=>p.id===b.id)?.status).toBe('postado');
  expect((await calendarSnapshot(root.id)).posts).toHaveLength(2);
  expect((await d.select().from(schema.postPublications))).toHaveLength(1);
  await expect(applyConsolidation(root.id,'2026-10',b.id,plan.version,user.id)).rejects.toThrow();
  expect(await revertConsolidation(String(result.moveId))).toEqual({restored:2});
  expect((await d.select().from(schema.socialPosts).where(eq(schema.socialPosts.id,a.id)))[0].linkedTo).toBeNull();
  expect((await d.select().from(schema.socialPosts).where(eq(schema.socialPosts.id,b.id)))[0].script).toBeNull();
  const [again]=await consolidationFor(root.id,'2026-10');
  const second=await applyConsolidation(root.id,'2026-10',b.id,again.version,user.id);
  await d.update(schema.socialPosts).set({caption:'Alterada',updatedAt:new Date(Date.now()+1000)}).where(eq(schema.socialPosts.id,b.id));
  await expect(revertConsolidation(String(second.moveId))).rejects.toThrow('edições posteriores');
 });
 it('recusa legenda divergente, título apenas semelhante e duas distribuições',async()=>{
  const snap=await d.select().from(schema.socialPosts);const base={...snap[0],linkedTo:null,dismissedAt:null};
  const a={...base,id:'a',title:'Jantar',caption:'A'};const b={...base,id:'b',title:'Jantar',caption:'B'};
  expect(consolidationPlan([a,b],[])[0].safe).toBe(false);
  expect(consolidationPlan([a,{...b,caption:'A',title:'Outro título'}],[])[0].conflicts).toContain('títulos diferentes');
  const full={...a,title:'Jantar especial',caption:'Jantar especial com sobremesa',script:'Roteiro inicial e continuação',format:'reels'};
  const short={...b,title:'Jantar especial com...',caption:full.caption,script:'Roteiro inicial',format:'outro'};
  const prefixPlan=consolidationPlan([full,short],[])[0]; expect(prefixPlan.safe).toBe(true);
  expect(prefixPlan.patch.format).toBe('reels');
  const pub=(id:string)=>({postId:id} as typeof schema.postPublications.$inferSelect);
  expect(consolidationPlan([a,{...b,caption:'A'}],[pub('a'),pub('b')])[0].safe).toBe(false);
 });
 it('CSV protege fórmula e preserva vírgula, aspas e linhas',async()=>{
  const rows=await d.select().from(schema.socialPosts); const csv=calendarCsv([{...rows[0],title:'=SUM(A1)',script:'Linha 1\n"Linha 2"',linkedTo:null}], '2026-10');
  expect(csv).toContain('"\'=SUM(A1)"'); expect(csv).toContain('Linha 1\n""Linha 2""'); expect(csv.startsWith('\uFEFF')).toBe(true);
 });
});
