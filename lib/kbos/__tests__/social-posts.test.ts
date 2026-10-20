import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../schema";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../db", () => ({ db: () => holder.db }));
import { parseIcs, parseIcsDate, cleanTitle, detectFormat, detectBrand } from "../social-import";
import { importPosts, previewImport, updatePost, portalPosts, decidePost, listPosts, PostError } from "../social-posts";

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
