import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { createHmac } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../db", () => ({ db: () => holder.db }));
import { closeCycle, contentState, cycleMetrics, cycleReport, isRecurring, listCycles, projectLate, reopenCycle, syncPublications, updatePublication } from "../content-cycle";
import { addProjectMember } from "../project-members";
import { createClientRoteiro, portalPosts, setPostTakes, updateClientPost, isOverdue, monthUsage } from "../social-posts";
import { SCHEMA_STEPS } from "../migrations";
import { lumeClientCookie, toTakes } from "../lume";

const at = (s: string) => new Date(s);
const NOW = at("2026-11-20T12:00:00-03:00");

describe("fase do conteúdo (pura)", () => {
  it("sem redes cadastradas vale o status do post", () => {
    expect(contentState({ status: "roteiro", scheduledAt: null }).phase).toBe("planejado");
    expect(contentState({ status: "producao", scheduledAt: null }).phase).toBe("producao");
    expect(contentState({ status: "ajustes", scheduledAt: null }).phase).toBe("aprovacao");
    expect(contentState({ status: "postado", scheduledAt: null }).phase).toBe("publicado");
    expect(contentState({ status: "cancelado", scheduledAt: null }, [{ network: "instagram", status: "publicado" }]).phase).toBe("cancelado");
  });
  it("publicado só quando todas as redes ativas saíram; parcial fica agendado", () => {
    const post = { status: "aprovado", scheduledAt: null };
    expect(contentState(post, [{ network: "instagram", status: "publicado" }, { network: "tiktok", status: "pendente" }])).toMatchObject({ phase: "agendado", partial: true, published: 1, networks: 2 });
    expect(contentState(post, [{ network: "instagram", status: "publicado" }, { network: "tiktok", status: "cancelado" }])).toMatchObject({ phase: "publicado", partial: false, networks: 1 });
    // o post diz "postado", mas há rede pendente: não presumir
    expect(contentState({ status: "postado", scheduledAt: null }, [{ network: "facebook", status: "pendente" }]).phase).toBe("agendado");
    // ainda em produção: agendar uma rede não pula a aprovação
    expect(contentState({ status: "producao", scheduledAt: null }, [{ network: "instagram", status: "agendado" }]).phase).toBe("producao");
  });
  it("1 Reels em 3 redes = 1 entrega e 3 publicações", () => {
    const pubs = ["instagram", "facebook", "tiktok"].map((network) => ({ network, status: "publicado" }));
    const m = cycleMetrics([{ post: { status: "agendado", scheduledAt: at("2026-11-02T18:00:00-03:00") }, pubs }], NOW);
    expect(m).toMatchObject({ previstos: 1, publicados: 1, publicacoes: 3, publicacoesFeitas: 3, cumprimento: 100, atrasados: 0 });
  });
  it("indicadores do mês: produzidos, aprovados, atrasados, cancelados e meta do plano", () => {
    const d = (day: string) => at(`2026-11-${day}T00:00:00-03:00`);
    const rows = [
      { post: { status: "roteiro", scheduledAt: d("25") }, pubs: [] },
      { post: { status: "producao", scheduledAt: d("10") }, pubs: [] },
      { post: { status: "aprovacao", scheduledAt: d("21") }, pubs: [] },
      { post: { status: "aprovado", scheduledAt: d("15") }, pubs: [] },
      { post: { status: "postado", scheduledAt: d("05") }, pubs: [] },
      { post: { status: "cancelado", scheduledAt: d("06") }, pubs: [] },
    ];
    const m = cycleMetrics(rows, NOW, 10);
    expect(m).toMatchObject({ previstos: 5, produzidos: 3, aprovados: 2, publicados: 1, pendentes: 4, atrasados: 2, cancelados: 1, limite: 10, cumprimento: 10 });
  });
  it("recorrente não fica atrasado por prazo", () => {
    expect(isRecurring({ categoria: "social" })).toBe(true);
    expect(projectLate({ categoria: "social", prazo: "2026-01-01", status: "producao" }, NOW)).toBe(false);
    expect(projectLate({ categoria: "video", recurring: true, prazo: "2026-01-01", status: "producao" }, NOW)).toBe(false);
    expect(projectLate({ categoria: "video", prazo: "2026-01-01", status: "producao" }, NOW)).toBe(true);
    expect(isOverdue({ status: "cancelado", scheduledAt: at("2026-01-01T00:00:00-03:00") }, NOW)).toBe(false);
  });
});

describe("Lume como cliente", () => {
  it("cookie no mesmo formato do Python (sessao_cliente)", () => {
    const c = lumeClientCookie("segredo", "Atalaia", 1000);
    const [, v] = c.split("=");
    const [exp, b64, sig] = v.split(".");
    expect(exp).toBe("1300");
    expect(Buffer.from(b64, "base64url").toString()).toBe("Atalaia");
    expect(sig).toBe(createHmac("sha256", "segredo").update("cliente:1300:Atalaia").digest("hex"));
  });
  it("takes: tira lixo e repetição do mesmo ponto do vídeo", () => {
    const t = toTakes({ resultados: [{ id: 3, caminho: "/a/Hotel/piscina.mp4", tipo: "video", segundo: 12.2 }, { id: 4, nome: "piscina.mp4", tipo: "video", segundo: 12.4 }, { id: "x" }] });
    expect(t.map((x) => x.id)).toEqual([3]);
    expect(t[0].nome).toBe("piscina.mp4");
  });
});

const pg = new PGlite(), d = drizzle(pg, { schema });
let thalita: string, viewer: string, grupo: string, hotel: string, lounge: string;
beforeAll(async () => { holder.db = d; for (const f of readdirSync("drizzle").filter((f) => /^\d.*\.sql$/.test(f)).sort()) await pg.exec(readFileSync(`drizzle/${f}`, "utf8")); }, 30000);
beforeEach(async () => {
  await pg.exec("TRUNCATE kbos_users, kbos_projects CASCADE");
  const [dono, t, v] = await d.insert(schema.users).values([
    { name: "Dona", email: "dona@example.com", role: "cliente" },
    { name: "Thalita", email: "thalita@example.com", role: "cliente" },
    { name: "Vê", email: "ve@example.com", role: "cliente" },
  ]).returning();
  thalita = t.id; viewer = v.id;
  const [g] = await d.insert(schema.projects).values({ titulo: "Grupo VIP", categoria: "social", clienteId: dono.id }).returning();
  const [h, l] = await d.insert(schema.projects).values([{ titulo: "Hotel", categoria: "social", parentId: g.id, postLimit: 12 }, { titulo: "Lounge", categoria: "social", parentId: g.id, postLimit: 8 }]).returning();
  grupo = g.id; hotel = h.id; lounge = l.id;
  await addProjectMember(hotel, "thalita@example.com", "gestao");
  await addProjectMember(hotel, "ve@example.com");
});
afterAll(() => pg.close());

describe("ciclo mensal e visão consolidada", () => {
  it("consolida as operações sem perder a visão de cada uma e fecha o mês sem encerrar o projeto", async () => {
    const [p1] = await d.insert(schema.socialPosts).values([
      { projectId: hotel, brand: "Hotel", title: "Piscina", format: "reels", status: "aprovado", scheduledAt: at("2026-11-03T18:00:00-03:00") },
      { projectId: lounge, brand: "Lounge", title: "Drinks", format: "carrossel", status: "postado", scheduledAt: at("2026-11-04T18:00:00-03:00") },
      { projectId: hotel, brand: "Hotel", title: "Outro mês", format: "reels", status: "roteiro", scheduledAt: at("2026-12-04T18:00:00-03:00") },
    ]).returning();
    await syncPublications(p1.id, ["instagram", "facebook", "tiktok"]);
    await updatePublication(p1.id, "instagram", { status: "publicado", url: "https://instagram.com/p/x" });
    let rep = (await cycleReport(grupo, "2026-11", NOW))!;
    expect(rep.recurring).toBe(true);
    expect(rep.operacoes.map((o) => [o.titulo, o.metrics.previstos, o.metrics.publicados, o.metrics.limite])).toEqual([["Hotel", 1, 0, 12], ["Lounge", 1, 1, 8]]);
    expect(rep.metrics).toMatchObject({ previstos: 2, publicados: 1, publicacoes: 3, publicacoesFeitas: 1, limite: 20 });
    expect(rep.porMarca.map((b) => b.brand)).toEqual(["Hotel", "Lounge"]);
    // as outras duas redes saem: o post vira "postado" sozinho
    await updatePublication(p1.id, "facebook", { status: "publicado" });
    const r = await updatePublication(p1.id, "tiktok", { status: "publicado" });
    expect(r.state.phase).toBe("publicado");
    expect((await d.select().from(schema.socialPosts).where(eq(schema.socialPosts.id, p1.id)))[0].status).toBe("postado");
    const closed = await closeCycle(grupo, "2026-11", null, "Mês fechado");
    expect(closed.status).toBe("fechado");
    expect((closed.summary as { publicados: number }).publicados).toBe(2);
    expect((await d.select().from(schema.projects).where(eq(schema.projects.id, grupo)))[0].status).toBe("novo");
    await reopenCycle(grupo, "2026-11");
    expect((await listCycles(grupo)).map((c) => [c.month, c.status])).toEqual([["2026-11", "aberto"]]);
    rep = (await cycleReport(grupo, "2026-12", NOW))!;
    expect(rep.metrics.previstos).toBe(1);
  });
  it("tirar uma rede cancela sem apagar; o que já saiu nunca é cancelado", async () => {
    const [p] = await d.insert(schema.socialPosts).values({ projectId: hotel, title: "X", format: "reels", status: "aprovado", scheduledAt: NOW }).returning();
    await syncPublications(p.id, ["instagram", "tiktok"]);
    await updatePublication(p.id, "instagram", { status: "publicado" });
    const pubs = await syncPublications(p.id, ["facebook"]);
    expect(pubs.map((x) => [x.network, x.status])).toEqual([["facebook", "pendente"], ["instagram", "publicado"], ["tiktok", "cancelado"]]);
    await expect(updatePublication(p.id, "youtube", { status: "publicado" })).rejects.toThrow();
  });
});

describe("gestão de conteúdo no portal (gerente de marketing)", () => {
  it("gestão vê o calendário inteiro com roteiro; quem só acompanha vê a partir da aprovação", async () => {
    await d.insert(schema.socialPosts).values([
      { projectId: hotel, title: "Em roteiro", format: "reels", status: "roteiro", script: "cena 1", scriptBy: "Léo", scheduledAt: NOW },
      { projectId: hotel, title: "Na aprovação", format: "reels", status: "aprovacao", script: "interno", scheduledAt: NOW },
    ]);
    const mgr = await portalPosts(thalita);
    expect(mgr.map((p) => p.title).sort()).toEqual(["Em roteiro", "Na aprovação"]);
    expect(mgr.find((p) => p.title === "Em roteiro")).toMatchObject({ script: "cena 1", manage: true, people: { scriptBy: "Léo" } });
    const v = await portalPosts(viewer);
    expect(v.map((p) => p.title)).toEqual(["Na aprovação"]);
    expect(v[0]).toMatchObject({ script: null, manage: false, people: null });
  });
  it("gestão cria com redes e legenda, edita qualquer post, cancela e escolhe takes; quem acompanha não", async () => {
    const post = await createClientRoteiro(thalita, { projectId: hotel, date: "2026-11-10", title: "Café da manhã", format: "reels", networks: ["instagram", "tiktok"], caption: "Bom dia" });
    expect(post.caption).toBe("Bom dia");
    expect((await d.select().from(schema.postPublications)).map((x) => x.network).sort()).toEqual(["instagram", "tiktok"]);
    const [team] = await d.insert(schema.socialPosts).values({ projectId: hotel, title: "Da equipe", format: "reels", status: "producao", scheduledAt: at("2026-11-12T19:30:00-03:00") }).returning();
    const moved = await updateClientPost(thalita, team.id, { date: "2026-11-14", script: "novo roteiro" });
    expect(moved.scheduledAt!.toISOString()).toBe(at("2026-11-14T19:30:00-03:00").toISOString());
    await expect(updateClientPost(viewer, team.id, { title: "invadir" })).rejects.toThrow();
    await expect(updateClientPost(thalita, team.id, { status: "roteiro" })).rejects.toThrow(); // não volta produção para trás
    expect((await updateClientPost(thalita, team.id, { status: "cancelado" })).status).toBe("cancelado");
    expect((await monthUsage(hotel, "2026-11")).used).toBe(1); // cancelado não ocupa vaga
    const withTakes = await setPostTakes(post.id, [{ id: 7, nome: "piscina.mp4", thumb: null, t: 12, by: null, at: "" }], { userId: thalita, name: "Thalita" });
    expect(withTakes.takes).toEqual([expect.objectContaining({ id: 7, t: 12, by: "Thalita" })]);
    await expect(setPostTakes(post.id, [], { userId: viewer, name: "Vê" })).rejects.toThrow();
    // quem acompanha edita só o próprio roteiro, sem legenda nem redes
    const own = await createClientRoteiro(viewer, { projectId: hotel, date: "2026-11-11", title: "Ideia", format: "carrossel" });
    expect((await updateClientPost(viewer, own.id, { title: "Ideia melhor" })).title).toBe("Ideia melhor");
    await expect(updateClientPost(viewer, own.id, { caption: "x" })).rejects.toThrow();
    // sem acesso ao Lounge, nada feito lá
    await expect(createClientRoteiro(thalita, { projectId: lounge, date: "2026-11-10", title: "Fora", format: "reels" })).rejects.toThrow();
  });
  it("adicionar de novo sem nível não rebaixa a gestão", async () => {
    await addProjectMember(hotel, "thalita@example.com");
    expect((await portalPosts(thalita)).length).toBe(0);
    const [m] = await d.select().from(schema.projectMembers).where(eq(schema.projectMembers.userId, thalita));
    expect(m.access).toBe("gestao");
  });
  it("passos de boot criam o mesmo que a migração SQL", async () => {
    const steps = SCHEMA_STEPS.filter((s) => s.id.startsWith("conteudo.ciclos."));
    expect(steps.length).toBeGreaterThanOrEqual(9);
    for (const s of steps) await pg.exec(s.sql);
  });
});

describe("separar o Grupo VIP por operação (reversível)", () => {
  it("plano só lê; aplicar move só marca exata, mantém sem-marca no principal; desfazer devolve tudo", async () => {
    const { planFor, applySplit, revertSplit } = await import("../content-split");
    await d.insert(schema.socialPosts).values([
      { projectId: grupo, brand: "Hotel", title: "A", format: "reels", status: "postado", scheduledAt: at("2026-10-03T18:00:00-03:00") },
      { projectId: grupo, brand: "Hotel", title: "B", format: "reels", status: "roteiro", scheduledAt: at("2026-11-03T18:00:00-03:00"), dismissedAt: NOW },
      { projectId: grupo, brand: "Praça", title: "C", format: "carrossel", status: "aprovado", scheduledAt: at("2026-11-05T18:00:00-03:00") },
      { projectId: grupo, brand: null, title: "Sem marca", format: "outro", status: "roteiro", scheduledAt: at("2026-11-06T18:00:00-03:00") },
    ]);
    const plan = await planFor(grupo);
    expect(plan).toMatchObject({ total: 4, semMarca: 1 });
    expect(plan.marcas.map((m) => [m.brand, m.total, m.ocultos, m.de, m.ate])).toEqual([["Hotel", 2, 1, "2026-10", "2026-11"], ["Praça", 1, 0, "2026-11", "2026-11"]]);
    await expect(applySplit(grupo, [{ brand: "Lounge", titulo: "Lounge VIP" }], null)).rejects.toThrow(); // marca sem posts
    await expect(applySplit(hotel, [{ brand: "Hotel", titulo: "X" }], null)).rejects.toThrow(); // já é operação
    // "Hotel" reaproveita a operação que já existe; "Praça" cria o Restaurante
    const r = await applySplit(grupo, [{ brand: "Hotel", titulo: "hotel" }, { brand: "Praça", titulo: "Restaurante Atalaia VIP" }], null);
    expect(r).toMatchObject({ created: 1, moved: 3 });
    const all = await d.select().from(schema.socialPosts);
    expect(all.filter((p) => p.projectId === hotel).map((p) => p.title).sort()).toEqual(["A", "B"]);
    expect(all.find((p) => p.title === "Sem marca")!.projectId).toBe(grupo);
    const rest = (await d.select().from(schema.projects).where(eq(schema.projects.titulo, "Restaurante Atalaia VIP")))[0];
    expect(rest).toMatchObject({ parentId: grupo, recurring: true });
    // a gestora do principal passa a ver e gerir a operação nova
    await addProjectMember(grupo, "thalita@example.com", "gestao");
    expect((await portalPosts(thalita)).map((p) => p.title)).toContain("C");
    await d.delete(schema.projectMembers).where(eq(schema.projectMembers.projectId, grupo));
    const back = await revertSplit(r.moveId);
    expect(back).toEqual({ back: 3, removed: 1 });
    expect((await d.select().from(schema.socialPosts)).every((p) => p.projectId === grupo)).toBe(true);
    await expect(revertSplit(r.moveId)).rejects.toThrow();
  });
});

describe("família principal + operações e plano compartilhado", () => {
  it("post novo com empresa vai para a operação; calendário do principal mostra a família", async () => {
    const { projectFamily, operationFor } = await import("../project-family");
    const { listPosts } = await import("../social-posts");
    const [praca] = await d.insert(schema.projects).values({ titulo: "Praça de Alimentação Atalaia VIP", categoria: "social", parentId: grupo }).returning();
    const fam = await projectFamily(grupo);
    expect(fam.route("Hotel")).toBe(hotel);
    expect(fam.route("Praça")).toBe(praca.id);
    expect(fam.route("Lounge")).toBe(lounge);
    expect(fam.route(null)).toBe(grupo);
    expect(operationFor([{ id: "a", titulo: "Hotel A" }, { id: "b", titulo: "Hotel B" }], "Hotel")).toBeNull(); // ambíguo fica no principal
    await d.insert(schema.socialPosts).values([{ projectId: hotel, title: "H", format: "reels", status: "roteiro", scheduledAt: NOW }, { projectId: grupo, title: "G", format: "reels", status: "roteiro", scheduledAt: NOW }]);
    expect((await listPosts({ projectId: grupo })).map((p) => p.title).sort()).toEqual(["G", "H"]);
    expect((await listPosts({ projectId: hotel })).map((p) => p.title)).toEqual(["H"]);
  });
  it("16 por empresa dentro de 48: remanejar exige tirar de outra; parte cheia barra novo conteúdo", async () => {
    const { planPool, setOperationLimits, assertRoom } = await import("../plan-pool");
    await d.update(schema.projects).set({ postLimit: 32 }).where(eq(schema.projects.id, grupo));
    await setOperationLimits(grupo, { [hotel]: 16, [lounge]: 16 });
    await expect(setOperationLimits(grupo, { [hotel]: 17 })).rejects.toThrow(/passa do plano/);
    await setOperationLimits(grupo, { [lounge]: 14 });
    await setOperationLimits(grupo, { [hotel]: 18 });
    await expect(setOperationLimits(hotel, { [hotel]: 1 })).rejects.toThrow(); // só no principal
    await expect(setOperationLimits(grupo, { [lounge]: 0 })).rejects.toThrow();
    await d.update(schema.projects).set({ postLimit: 1 }).where(eq(schema.projects.id, lounge));
    await createClientRoteiro(thalita, { projectId: hotel, date: "2026-11-10", title: "Primeiro", format: "reels" }).catch(() => undefined); // Thalita só tem o Hotel
    await d.insert(schema.socialPosts).values({ projectId: lounge, title: "L1", format: "reels", status: "roteiro", scheduledAt: at("2026-11-04T00:00:00-03:00") });
    await expect(assertRoom(lounge, "2026-11")).rejects.toThrow(/parte dele no plano/);
    await expect(assertRoom(hotel, "2026-11")).resolves.toBeUndefined();
    const pool = (await planPool(hotel, "2026-11"))!;
    expect(pool).toMatchObject({ rootId: grupo, limit: 32, used: 2 });
    expect(pool.ops.map((o) => [o.titulo, o.limit, o.used])).toEqual([["Hotel", 18, 1], ["Lounge", 1, 1]]);
  });
});
