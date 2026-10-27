import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../schema";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../db", () => ({ db: () => holder.db }));
import { parseIcs, parseIcsDate, cleanTitle, detectFormat, detectBrand } from "../social-import";
import { importPosts, previewImport, updatePost, portalPosts, decidePost, listPosts, PostError, createClientRoteiro, suggestScripts, linkScript, overduePosts } from "../social-posts";

const ICS = [
  "BEGIN:VCALENDAR", "VERSION:2.0",
  "BEGIN:VEVENT", "UID:a", "DTSTART:20261003T000000",
  "SUMMARY:000 HOTEL - Carrossel Como organizar uma viagem para Salinas com crianças",
  "DESCRIPTION:-> check-list de como o hotel ajuda\\, as famílias\\n\\nSegundo parágrafo", "END:VEVENT",
  "BEGIN:VEVENT", "UID:b", "DTSTART:20261017T200000", "SUMMARY:Mora em Salinas? Então esse convite é pra você", "DESCRIPTION:Tem dias que tudo o que a gente quer", "END:VEVENT",
  "BEGIN:VEVENT", "UID:c", "DTSTART:20261017T200000", "SUMMARY:Mora em Salinas? Então esse convite é pra você", "DESCRIPTION:Tem dias que tudo o que a gente quer", "END:VEVENT",
  "BEGIN:VEVENT", "UID:d", "DTSTART:20261003T000000", "SUMMARY:HOTEL - Reels Área de lazer", "DESCRIPTION:# 29 — HOTEL ATALAIA VIP\\n\\n## REELS | ÁREA DE LAZER", "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("ICS do mLabs", () => {
  it("lê datas de Belém e com horário", () => {
    expect(parseIcsDate("20261003T000000")?.date.toISOString()).toBe("2026-10-03T03:00:00.000Z");
    expect(parseIcsDate("20261017T200000")?.hasTime).toBe(true);
    expect(parseIcsDate("lixo")).toBeNull();
  });
  it("detecta marca, formato e título", () => {
    expect(detectBrand("000 HOTEL- Reels", "")).toBe("Hotel");
    expect(detectFormat("HOTEL - Carrossel x", "")).toBe("carrossel");
    expect(detectFormat("000 HOTEL- Reels Círio", "")).toBe("reels");
    expect(cleanTitle("000 HOTEL - Carrossel Como organizar")).toBe("Como organizar");
  });
  it("junta cópias do mesmo dia e separa roteiro de legenda", () => {
    const posts = parseIcs(ICS, "proj");
    expect(posts).toHaveLength(3);
    const caption = posts.find((p) => p.hasTime)!;
    expect(caption.copies).toBe(2);
    expect(caption.status).toBe("agendado");
    expect(caption.caption).toContain("Tem dias");
    const car = posts.find((p) => p.format === "carrossel")!;
    expect(car.status).toBe("roteiro");
    expect(car.script).toContain("check-list de como o hotel ajuda, as famílias\n\nSegundo");
  });
});

const pg = new PGlite();
const d = drizzle(pg, { schema });
beforeAll(async () => {
  // Adapter de batch Neon HTTP sobre uma transação PostgreSQL descartável.
  holder.db = Object.assign(d, {
    batch: (queries: { toSQL(): { sql: string; params: unknown[] } }[]) => pg.transaction(async tx => {
      const results = [];
      for (const query of queries) {
        const { sql, params } = query.toSQL();
        // Neon/Drizzle mapeia os nomes SQL do RETURNING para as propriedades do schema.
        results.push((await tx.query(sql, params)).rows.map(row => Object.fromEntries(Object.entries(row as Record<string, unknown>).map(([key,value]) => [key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase()),value]))));
      }
      return results;
    }),
  });
  for (const name of readdirSync(join(process.cwd(), "drizzle")).filter((n) => /^\d.*\.sql$/.test(n)).sort()) {
    await pg.exec(readFileSync(join(process.cwd(), "drizzle", name), "utf8"));
  }
}, 30_000);
afterAll(async () => { await pg.close(); });

describe("calendário de conteúdo no banco", () => {
  it("importa sem duplicar, protege edição e controla a aprovação", async () => {
    const [cli] = await d.insert(schema.users).values({ email: "t@x.com", name: "Thalita", role: "cliente" }).returning();
    const [outro] = await d.insert(schema.users).values({ email: "o@x.com", name: "Outro", role: "cliente" }).returning();
    const [proj] = await d.insert(schema.projects).values({ titulo: "Atalaia", categoria: "social", clienteId: cli.id }).returning();

    expect((await previewImport(proj.id, ICS)).fresh).toHaveLength(3);
    expect(await importPosts(proj.id, ICS)).toEqual({ total: 3, imported: 3, skipped: 0 });
    expect(await importPosts(proj.id, ICS)).toEqual({ total: 3, imported: 0, skipped: 3 });
    const all = await listPosts({ projectId: proj.id });
    expect(all).toHaveLength(3);

    const post = all.find((p) => p.format === "reels")!;
    await expect(updatePost(post.id, { status: "aprovacao" })).rejects.toBeInstanceOf(PostError);
    await expect(updatePost(post.id, { mediaUrl: "http://inseguro" })).rejects.toBeInstanceOf(PostError);
    const sent = await updatePost(post.id, { mediaUrl: "https://drive.google.com/x", caption: "Legenda", status: "aprovacao" });
    expect(sent.sentToApproval).toBe(true);

    const team = await updatePost(post.id, { scriptBy: "Kayque", captureBy: "Léo", editor: "Ana" });
    expect([team.post.scriptBy, team.post.captureBy, team.post.editor]).toEqual(["Kayque", "Léo", "Ana"]);
    expect((await updatePost(post.id, { status: "erro", errorMessage: "Instagram recusou" })).post.status).toBe("erro");
    await updatePost(post.id, { status: "aprovacao", errorMessage: null });

    // reimportar não desfaz o status
    await importPosts(proj.id, ICS);
    expect((await listPosts({ projectId: proj.id })).find((p) => p.id === post.id)!.status).toBe("aprovacao");

    // portal: só vê o dono, e sem roteiro; roteiros em andamento não aparecem
    const mine = await portalPosts(cli.id);
    expect(mine.map((p) => p.id)).toContain(post.id);
    expect(mine.every((p) => (p.script === null || p.mine) && !("editor" in p))).toBe(true);
    expect(mine.find((p) => p.status === "roteiro")).toBeUndefined();
    expect(await portalPosts(outro.id)).toEqual([]);

    await expect(decidePost(outro.id, post.id, "aprovar")).rejects.toBeInstanceOf(PostError);
    await expect(decidePost(cli.id, post.id, "ajustes", "  ")).rejects.toBeInstanceOf(PostError);
    const adj = await decidePost(cli.id, post.id, "ajustes", "Trocar a música");
    expect(adj.status).toBe("ajustes");
    await expect(decidePost(cli.id, post.id, "aprovar")).rejects.toBeInstanceOf(PostError);

    await updatePost(post.id, { status: "aprovacao" });
    expect((await decidePost(cli.id, post.id, "aprovar")).status).toBe("aprovado");
  });
});

describe("posts atrasados", () => {
  it("00:00 vence só no fim do dia; postado nunca atrasa", async () => {
    const { isOverdue, isResponsible } = await import("../social-posts");
    const day = new Date("2026-10-10T00:00:00-03:00");
    expect(isOverdue({ scheduledAt: day, status: "roteiro" }, new Date("2026-10-10T20:00:00-03:00"))).toBe(false);
    expect(isOverdue({ scheduledAt: day, status: "roteiro" }, new Date("2026-10-11T08:00:00-03:00"))).toBe(true);
    expect(isOverdue({ scheduledAt: new Date("2026-10-10T18:00:00-03:00"), status: "agendado" }, new Date("2026-10-10T19:00:00-03:00"))).toBe(true);
    expect(isOverdue({ scheduledAt: day, status: "postado" }, new Date("2026-11-01T00:00:00-03:00"))).toBe(false);
    expect(isResponsible({ scriptBy: null, captureBy: "Léo Silva", editor: null }, "leo")).toBe(true);
    expect(isResponsible({ scriptBy: "Ana", captureBy: null, editor: null }, "Léo")).toBe(false);
  });
});

describe("tradução da mLabs", () => {
  it("agrupa redes do mesmo post e traduz estados", async () => {
    const { groupSchedules, scheduleStatus, workflowStatus, brandOfProfile } = await import("../mlabs");
    const at = "2026-10-14T15:41:35.000Z";
    const g = groupSchedules(
      [
        { id: "a", content: "Quando a gente fala em sair…\nlinha 2", status: "published", scheduledAt: at, channelSourceKey: "tiktok_business", profileId: "p1" },
        { id: "b", content: "Quando a gente fala em sair…\nlinha 2", status: "failed", scheduledAt: at, channelSourceKey: "pinterest", profileId: "p1" },
        { id: "c", content: "Outro", status: "scheduled", scheduledAt: at, channelSourceKey: "instagram_reels", profileId: "p1" },
        { id: "d", content: "Sem perfil", status: "scheduled", scheduledAt: at },
      ],
      { p1: "Atalaia Vip Lounge" },
    );
    expect(g).toHaveLength(2);
    const first = g.find((x) => x.title.startsWith("Quando"))!;
    expect(first).toMatchObject({ status: "erro", brand: "Lounge", format: "reels" });
    expect(first.networks).toEqual(["tiktok_business", "pinterest"]);
    expect(g.find((x) => x.title === "Outro")!.status).toBe("agendado");
    expect(scheduleStatus("published")).toBe("postado");
    expect(workflowStatus("waiting_external_approve")).toBe("aprovacao");
    expect(workflowStatus("done")).toBe("postado");
    expect(brandOfProfile("Hotel Atalaia Vip")).toBe("Hotel");
    expect(brandOfProfile("Praça de Alimentação")).toBe("Praça");
    expect(brandOfProfile("Novo Perfil")).toBeNull();
  });
});

describe("roteiro ↔ post, atrasados e roteiro do cliente", () => {
  it("vincula o roteiro ao post de outro dia, limpa atrasados e protege o roteiro interno", async () => {
    const [cli] = await d.insert(schema.users).values({ email: "t2@x.com", name: "Thalita Dois", role: "cliente" }).returning();
    const [out] = await d.insert(schema.users).values({ email: "o2@x.com", name: "Outra Pessoa", role: "cliente" }).returning();
    const [proj] = await d.insert(schema.projects).values({ titulo: "Atalaia 2", categoria: "social", clienteId: cli.id }).returning();

    // a cliente cadastra o roteiro; só ela (dona do projeto) pode
    await expect(createClientRoteiro(out.id, { projectId: proj.id, date: "2026-10-05", title: "Camarão", format: "reels" })).rejects.toBeInstanceOf(PostError);
    const rot = await createClientRoteiro(cli.id, { projectId: proj.id, date: "2026-10-05", title: "Camarão na chapa", format: "reels", brand: "Lounge", script: "Cena 1: close do prato" });
    expect(rot).toMatchObject({ status: "roteiro", createdBy: cli.id });

    // o post real foi agendado dias depois (veio da mLabs)
    const [post] = await d.insert(schema.socialPosts).values({ projectId: proj.id, title: "Camarão na chapa", format: "reels", brand: "Lounge", status: "agendado", scheduledAt: new Date("2026-10-09T18:00:00-03:00"), caption: "Legenda" }).returning();
    const sug = await suggestScripts(post.id);
    expect(sug[0].id).toBe(rot.id);

    // antes de vincular, o roteiro velho conta como atrasado
    const now = new Date("2026-10-12T12:00:00-03:00");
    const admin = { id: "x", name: "Kayque", role: "admin" };
    expect((await overduePosts(admin, now)).items.some((o) => o.id === rot.id)).toBe(true);

    const linked = await linkScript(rot.id, post.id);
    expect(linked.script).toBe("Cena 1: close do prato");
    expect(linked.createdBy).toBe(cli.id);
    expect((await overduePosts(admin, now)).items.some((o) => o.id === rot.id)).toBe(false);
    expect((await listPosts({ projectId: proj.id })).some((p) => p.id === rot.id)).toBe(false);
    await expect(linkScript(rot.id, post.id)).rejects.toBeInstanceOf(PostError);

    // portal: a cliente vê o roteiro que ela escreveu no post; outra pessoa não vê nada
    const mine = (await portalPosts(cli.id)).find((p) => p.id === post.id)!;
    expect(mine.script).toBe("Cena 1: close do prato");
    expect(mine.mine).toBe(true);
    expect(await portalPosts(out.id)).toEqual([]);

  });
});

describe("lista de produção colada", () => {
  it("lê dia, marca, formato e situação", async () => {
    const { parseProduction } = await import("../social-production");
    const { lines, postedBefore } = parseProduction([
      "*PRODUÇÃO*",
      "* 14 - LOUNGE - Reels Chapa Mista ✅🟡 _Editado / em aprovação (aguardando retorno da thalita)_",
      "* 15 - COLA - dia do cliente 🟡 _Editando_",
      "* 16 - PRAÇA - Carrosse ❌ _01 - Fila de Espera_",
      "Todos os demais pra trás foram postados",
      "* 06 - HOTEL - Carrossel Final de semana  ✅ Postado",
      "* 10 - LOUNGE - Reels O Lounge pelo olhar 🟡 Falta Material",
    ].join("\n"));
    expect(postedBefore).toBe(true);
    expect(lines.map((l) => [l.day, l.brand, l.format, l.status])).toEqual([
      [14, "Lounge", "reels", "aprovacao"],
      [15, null, null, "producao"],
      [16, "Praça", "carrossel", "producao"],
      [6, "Hotel", "carrossel", "postado"],
      [10, "Lounge", "reels", "captacao"],
    ]);
  });
});

// Arquivo privado opcional: não copiar o calendário do cliente para o repositório.
const realIcsPath = process.env.KBOS_TEST_ICS;
it.skipIf(!realIcsPath)("importa o ICS consolidado real em banco descartável", async () => {
  const text = readFileSync(realIcsPath!, "utf8");
  expect((text.match(/BEGIN:VEVENT/g) ?? []).length).toBe(707);
  const [proj] = await d.insert(schema.projects).values({ titulo: "ICS real descartável", categoria: "social" }).returning();
  const parsed = parseIcs(text, proj.id);
  expect(parsed).toHaveLength(275);
  await d.insert(schema.socialPosts).values(parsed.slice(0, 100).map(p => ({ projectId: proj.id, title: p.title, externalKey: p.key })));
  const preview = await previewImport(proj.id, text);
  expect([preview.parsed.length, preview.fresh.length, preview.existing]).toEqual([275, 175, 100]);
  let result;
  try { result = await importPosts(proj.id, text); }
  catch (error) {
    // Não imprimir query/params com o conteúdo privado do calendário.
    const cause = (error as { cause?: { code?: string; message?: string } }).cause;
    throw new Error(`Importação real falhou: ${cause?.code ?? "sem código"}; ${cause?.message ?? "sem detalhe"}`);
  }
  expect(result).toEqual({ total: 275, imported: 175, skipped: 100 });
  expect(await importPosts(proj.id, text)).toEqual({ total: 275, imported: 0, skipped: 275 });
});

function consolidatedIcs() {
  const events = Array.from({ length: 271 }, (_, i) => [
    "BEGIN:VEVENT", "DTSTART:20261003T180000", `SUMMARY:HOTEL - Reels Conteúdo ${i}`,
    `DESCRIPTION:Antes${i === 105 ? "\u0000" : ""} e depois`, "END:VEVENT",
  ].join("\r\n"));
  return ["BEGIN:VCALENDAR", ...events, ...events, ...events.slice(0, 165), "END:VCALENDAR"].join("\r\n");
}

it("importa 707 eventos/271 posts, remove NUL e preserva registros existentes por inteiro", async () => {
  const text = consolidatedIcs();
  const [proj] = await d.insert(schema.projects).values({ titulo: "Consolidado", categoria: "social" }).returning();
  const parsed = parseIcs(text, proj.id);
  expect(parsed).toHaveLength(271);
  expect(parsed.reduce((n, p) => n + p.copies, 0)).toBe(707);
  expect(parsed).toEqual(parseIcs(text.replace(/\u0000/g, ""), proj.id));
  const existing = await d.insert(schema.socialPosts).values(parsed.slice(0, 100).map(p => ({
    projectId: proj.id, title: "Edição manual", externalKey: p.key, status: "postado",
    caption: "Legenda revisada", scriptBy: "Kayque", mediaUrl: "https://example.com/video",
    linkedTo: proj.id, dismissedAt: new Date("2026-10-01T12:00:00Z"),
  }))).returning();
  expect((await previewImport(proj.id, text)).existing).toBe(100);
  expect(await importPosts(proj.id, text)).toEqual({ total: 271, imported: 171, skipped: 100 });
  const rows = await d.select().from(schema.socialPosts).where(eq(schema.socialPosts.projectId, proj.id));
  for (const old of existing) expect(rows.find(p => p.id === old.id)).toEqual(old);
  expect(rows.find(p => p.externalKey === parsed[105].key)?.caption).toBe("Antes e depois");
  expect(await importPosts(proj.id, text)).toEqual({ total: 271, imported: 0, skipped: 271 });
});

it("reverte todos os lotes se a gravação falhar depois dos primeiros 100", async () => {
  const [proj] = await d.insert(schema.projects).values({ titulo: "Rollback", categoria: "social" }).returning();
  await pg.exec(`ALTER TABLE kbos_social_posts ADD CONSTRAINT test_import_failure CHECK (title <> 'Conteúdo 105') NOT VALID`);
  try {
    await expect(importPosts(proj.id, consolidatedIcs())).rejects.toBeDefined();
    expect((await d.select().from(schema.socialPosts).where(eq(schema.socialPosts.projectId, proj.id))).length).toBe(0);
  } finally {
    await pg.exec("ALTER TABLE kbos_social_posts DROP CONSTRAINT test_import_failure");
  }
  expect(await importPosts(proj.id, consolidatedIcs())).toEqual({ total: 271, imported: 271, skipped: 0 });
});

it("conta apenas inserts confirmados quando outra importação grava a mesma chave", async () => {
  const [proj] = await d.insert(schema.projects).values({ titulo: "Concorrência", categoria: "social" }).returning();
  const key = parseIcs(ICS, proj.id)[0].key;
  const database = holder.db as typeof d & { batch: (queries: { toSQL(): { sql: string; params: unknown[] } }[]) => Promise<unknown[][]> };
  const original = database.batch;
  const spy = vi.spyOn(database, "batch").mockImplementationOnce(async queries => {
    await d.insert(schema.socialPosts).values({ projectId: proj.id, title: "Outra importação", externalKey: key, status: "postado" });
    return original(queries);
  });
  try {
    expect(await importPosts(proj.id, ICS)).toEqual({ total: 3, imported: 2, skipped: 1 });
  } finally {
    spy.mockRestore();
  }
});

function brandCollisionIcs() {
  return ["BEGIN:VCALENDAR", ...["HOTEL", "LOUNGE"].flatMap(brand => [
    "BEGIN:VEVENT", "DTSTART:20261024T180000", `SUMMARY:${brand} - Reels Evento`, "DESCRIPTION:Legenda comum", "END:VEVENT",
  ]), "END:VCALENDAR"].join("\n");
}

it("separa empresas e prioriza a empresa explícita no título", () => {
  const parsed = parseIcs(brandCollisionIcs(), "project");
  expect(parsed).toHaveLength(2);
  expect(new Set(parsed.map(post => post.key)).size).toBe(2);
  expect(parsed[0].legacyKey).toBe(parsed[1].legacyKey);
  expect(detectBrand("LOUNGE - Reels Evento", "O Hotel recebe os convidados")).toBe("Lounge");
  expect(detectBrand("HOTEL E LOUNGE - Reels Evento", "")).toBeNull();
});

it("reconhece chaves antigas editadas sem ocultar o conteúdo da outra empresa", async () => {
  const [proj] = await d.insert(schema.projects).values({ titulo: "Compatibilidade", categoria: "social" }).returning();
  const parsed = parseIcs(brandCollisionIcs(), proj.id);
  const [old] = await d.insert(schema.socialPosts).values({ projectId: proj.id, brand: "Hotel", title: "Título editado", externalKey: parsed[0].legacyKey, status: "postado", linkedTo: proj.id }).returning();
  expect(await importPosts(proj.id, brandCollisionIcs())).toEqual({ total: 2, imported: 1, skipped: 1 });
  expect(await importPosts(proj.id, brandCollisionIcs())).toEqual({ total: 2, imported: 0, skipped: 2 });
  expect((await d.select().from(schema.socialPosts).where(eq(schema.socialPosts.id, old.id)))[0]).toEqual(old);
});

it("reconhece posts movidos de projeto sem reescrever chaves nem status", async () => {
  const [proj] = await d.insert(schema.projects).values({ titulo: "Movidos", categoria: "social" }).returning();
  const parsed = parseIcs(ICS, "projeto-antigo");
  const before = await d.insert(schema.socialPosts).values(parsed.map(post => ({ projectId: proj.id, brand: post.brand, title: post.title, format: post.format, scheduledAt: post.scheduledAt, externalKey: post.legacyKey, status: "postado" }))).returning();
  expect(await importPosts(proj.id, ICS)).toEqual({ total: 3, imported: 0, skipped: 3 });
  const after = await d.select().from(schema.socialPosts).where(eq(schema.socialPosts.projectId, proj.id));
  for (const old of before) expect(after.find(row => row.id === old.id)).toEqual(old);
});

it("sincroniza mLabs sem cruzar empresas, escolher duplicados ou regredir postado", async () => {
  const { MlabsClient, syncFromMlabs } = await import("../mlabs");
  const [proj] = await d.insert(schema.projects).values({ titulo: "mLabs protegida", categoria: "social" }).returning();
  const at = new Date("2026-10-24T15:00:00Z");
  const before = await d.insert(schema.socialPosts).values([
    { projectId: proj.id, brand: "Hotel", title: "Hotel", caption: "Legenda igual", scheduledAt: at, status: "postado" },
    { projectId: proj.id, brand: "Lounge", title: "Lounge", caption: "Legenda igual", scheduledAt: at, status: "roteiro" },
    { projectId: proj.id, brand: "Praça", title: "Praça A", caption: "Legenda igual", scheduledAt: at, status: "roteiro" },
    { projectId: proj.id, brand: "Praça", title: "Praça B", caption: "Legenda igual", scheduledAt: at, status: "roteiro" },
  ]).returning();
  const previous = process.env.MLABS_MCP_TOKEN;
  process.env.MLABS_MCP_TOKEN = "local-test-not-a-real-token";
  const init = vi.spyOn(MlabsClient.prototype, "init").mockResolvedValue(undefined);
  const call = vi.spyOn(MlabsClient.prototype, "call").mockImplementation(async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
    if (name === "list_profiles") return { items: ["Hotel", "Lounge", "Praça"].map(brand => ({ id: brand, name: brand })) } as T;
    return { schedules: [{ id: `schedule-${args.profileId}`, profileId: args.profileId, scheduledAt: at.toISOString(), content: "Legenda igual", status: "scheduled", channelSourceKey: "instagram_reels" }] } as T;
  });
  try {
    expect(await syncFromMlabs(proj.id)).toMatchObject({ found: 3, created: 0, updated: 1, ambiguous: 1 });
    const rows = await d.select().from(schema.socialPosts).where(eq(schema.socialPosts.projectId, proj.id));
    expect(rows).toHaveLength(4);
    expect(rows.find(row => row.id === before[0].id)).toEqual(before[0]);
    expect(rows.find(row => row.id === before[1].id)?.status).toBe("agendado");
    expect(rows.find(row => row.id === before[2].id)).toEqual(before[2]);
  } finally {
    if (previous === undefined) delete process.env.MLABS_MCP_TOKEN; else process.env.MLABS_MCP_TOKEN = previous;
    init.mockRestore(); call.mockRestore();
  }
});

it("classifica uma publicação na operação correta com auditoria sem regredir etapa ou redes", async () => {
  const [root] = await d.insert(schema.projects).values({titulo:"Grupo classificação",categoria:"social"}).returning();
  const [hotel] = await d.insert(schema.projects).values({titulo:"Hotel Atalaia VIP",categoria:"social",parentId:root.id}).returning();
  const [post] = await d.insert(schema.socialPosts).values({projectId:root.id,title:"Hospedagem",status:"postado",networks:["instagram"],caption:"Hospedagem em família"}).returning();
  const result=await updatePost(post.id,{brand:"Hotel"});
  expect(result.post.projectId).toBe(hotel.id); expect(result.post.status).toBe("postado"); expect(result.post.networks).toEqual(["instagram"]);
  const audit=await d.select().from(schema.dataMoves).where(eq(schema.dataMoves.kind,"classificar-conteudo"));
  expect(audit.find(a=>a.payload.postId===post.id)?.payload.before).toEqual({brand:null,projectId:root.id});
});

it("prioriza legenda correspondente e mantém roteiro completo ao ligar versões", async () => {
  const [project]=await d.insert(schema.projects).values({titulo:"Roteiros conferidos",categoria:"social"}).returning();
  const [source,other,target]=await d.insert(schema.socialPosts).values([
    {projectId:project.id,brand:"Hotel",title:"Roteiro completo",status:"roteiro",scheduledAt:new Date("2026-10-03T03:00:00Z"),script:"Cenas, direção e legenda: Dias de descanso no hotel"},
    {projectId:project.id,brand:"Hotel",title:"Mais perto, outro assunto",status:"roteiro",scheduledAt:new Date("2026-10-04T03:00:00Z"),script:"Outra coisa"},
    {projectId:project.id,brand:"Hotel",title:"Dias de descanso",caption:"Dias de descanso no hotel",script:"Dias de descanso no hotel",status:"postado",scheduledAt:new Date("2026-10-04T03:00:00Z")},
  ]).returning();
  expect((await suggestScripts(target.id))[0].id).toBe(source.id);
  const out=await linkScript(source.id,target.id);expect(out.script).toBe(source.script);expect(out.status).toBe("postado");
  expect((await d.select().from(schema.socialPosts).where(eq(schema.socialPosts.id,other.id)))[0].linkedTo).toBeNull();
  const audits=await d.select().from(schema.dataMoves).where(eq(schema.dataMoves.kind,"vincular-roteiro"));
  expect(audits.find(a=>a.payload.sourceId===source.id)?.payload.targetBefore).toMatchObject({script:target.script,status:"postado"});
});
