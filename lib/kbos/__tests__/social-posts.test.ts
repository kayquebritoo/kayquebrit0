import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../schema";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../db", () => ({ db: () => holder.db }));
import { parseIcs, parseIcsDate, cleanTitle, detectFormat, detectBrand } from "../social-import";
import { importPosts, previewImport, updatePost, portalPosts, decidePost, listPosts, PostError, createClientRoteiro, suggestScripts, linkScript, dismissOld, overduePosts } from "../social-posts";

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
  holder.db = d;
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
    expect(mine.every((p) => !("script" in p) && !("editor" in p))).toBe(true);
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
    expect((await overduePosts(admin, now)).some((o) => o.id === rot.id)).toBe(true);

    const linked = await linkScript(rot.id, post.id);
    expect(linked.script).toBe("Cena 1: close do prato");
    expect(linked.createdBy).toBe(cli.id);
    expect((await overduePosts(admin, now)).some((o) => o.id === rot.id)).toBe(false);
    expect((await listPosts({ projectId: proj.id })).some((p) => p.id === rot.id)).toBe(false);
    await expect(linkScript(rot.id, post.id)).rejects.toBeInstanceOf(PostError);

    // portal: a cliente vê o roteiro que ela escreveu no post; outra pessoa não vê nada
    const mine = (await portalPosts(cli.id)).find((p) => p.id === post.id)!;
    expect(mine.script).toBe("Cena 1: close do prato");
    expect(mine.mine).toBe(true);
    expect(await portalPosts(out.id)).toEqual([]);

    // limpar antigos dispensa sem apagar e nunca toca em postado
    await d.insert(schema.socialPosts).values({ projectId: proj.id, title: "Velho", format: "outro", status: "roteiro", scheduledAt: new Date("2026-08-01T00:00:00-03:00") });
    await d.insert(schema.socialPosts).values({ projectId: proj.id, title: "Já foi", format: "outro", status: "postado", scheduledAt: new Date("2026-08-01T00:00:00-03:00") });
    expect((await dismissOld(proj.id, 7)).dismissed).toBe(1);
  });
});
