// Os números do mês (total, publicados, atrasados) precisam ser IGUAIS em todas as telas, para o Kayque e para o cliente:
// relatório do mês, Kanban de projetos, calendário do admin, aviso de atrasados (admin e cliente), plano "X de 50" e portal.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../schema";
const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../db", () => ({ db: () => holder.db }));
import { contentFlags, cycleReport, monthMetricsByProject } from "../content-cycle";
import { isLate } from "../content-model";
import { listPosts, monthUsage, overduePosts } from "../social-posts";
import { summarizeContent } from "../content-summary";

const pg = new PGlite(), d = drizzle(pg, { schema });
// 20/out/2026, 12h em Belém
const NOW = new Date("2026-10-20T12:00:00-03:00");
const MONTH = "2026-10";
let grupo: string, hotel: string, cliente: string;

beforeAll(async () => {
  holder.db = d;
  for (const f of readdirSync("drizzle").filter((f) => /^\d.*\.sql$/.test(f)).sort()) await pg.exec(readFileSync(`drizzle/${f}`, "utf8"));
  const [u] = await d.insert(schema.users).values({ name: "Dhonny", email: "dhonny@example.com", role: "cliente" }).returning();
  cliente = u.id;
  const [g] = await d.insert(schema.projects).values({ titulo: "Grupo", categoria: "social", clienteId: cliente, postLimit: 10 }).returning();
  grupo = g.id;
  const [h] = await d.insert(schema.projects).values({ titulo: "Hotel", categoria: "social", parentId: grupo }).returning();
  hotel = h.id;
  const post = async (v: Partial<typeof schema.socialPosts.$inferInsert> & { title: string }, pubs: [string, string][] = []) => {
    const [row] = await d.insert(schema.socialPosts).values({ projectId: hotel, format: "reels", status: "agendado", ...v }).returning();
    if (pubs.length) await d.insert(schema.postPublications).values(pubs.map(([network, status]) => ({ postId: row.id, network, status })));
    return row;
  };
  // 1) publicado em todas as redes → publicado, não atrasado
  await post({ title: "ok", status: "postado", scheduledAt: new Date("2026-10-05T18:00:00-03:00") }, [["instagram", "publicado"], ["facebook", "publicado"]]);
  // 2) "postado" mas o Facebook não saiu → NÃO publicado e atrasado
  await post({ title: "parcial", status: "postado", scheduledAt: new Date("2026-10-06T18:00:00-03:00") }, [["instagram", "publicado"], ["facebook", "pendente"]]);
  // 3) roteiro vencido (no principal) → atrasado; o cliente não vê o roteiro, mas o número conta
  await post({ title: "roteiro vencido", status: "roteiro", projectId: grupo, scheduledAt: new Date("2026-10-07T00:00:00-03:00") });
  // 4) post do dia de hoje sem horário (00:00) → vence só no fim do dia: não atrasado
  await post({ title: "hoje", status: "aprovacao", mediaUrl: "https://x", scheduledAt: new Date("2026-10-20T00:00:00-03:00") });
  // 5) futuro → não atrasado
  await post({ title: "futuro", status: "producao", scheduledAt: new Date("2026-10-28T18:00:00-03:00") });
  // 6) cancelado → fora de tudo
  await post({ title: "cancelado", status: "cancelado", scheduledAt: new Date("2026-10-03T18:00:00-03:00") });
  // 7) dispensado e 8) roteiro já realizado → fora de tudo
  await post({ title: "dispensado", status: "roteiro", scheduledAt: new Date("2026-10-02T18:00:00-03:00"), dismissedAt: new Date() });
  await post({ title: "realizado", status: "roteiro", scheduledAt: new Date("2026-10-02T18:00:00-03:00"), linkedTo: grupo });
  // 9) colab Hotel + Lounge → conta uma vez
  await post({ title: "colab", status: "postado", brand: "Hotel", collabBrands: ["Lounge"], scheduledAt: new Date("2026-10-10T18:00:00-03:00") }, [["instagram", "publicado"]]);
  // 10) outro mês → fora
  await post({ title: "novembro", status: "roteiro", scheduledAt: new Date("2026-11-02T18:00:00-03:00") });
}, 30000);
afterAll(() => pg.close());

// Esperado para outubro: 6 conteúdos (1,2,3,4,5,9) · 2 publicados (1,9) · 2 atrasados (2,3)
const EXPECTED = { total: 6, publicados: 2, atrasados: 2 };

describe("números do mês iguais em todas as telas", () => {
  it("relatório do mês (admin e portal) e Kanban do principal", async () => {
    const rep = (await cycleReport(grupo, MONTH, NOW))!;
    expect({ total: rep.metrics.previstos, publicados: rep.metrics.publicados, atrasados: rep.metrics.atrasados }).toEqual(EXPECTED);
    const kanban = (await monthMetricsByProject([grupo], MONTH, NOW)).get(grupo)!;
    expect({ total: kanban.previstos, publicados: kanban.publicados, atrasados: kanban.atrasados }).toEqual(EXPECTED);
  });

  it("calendário do admin (mesma lista, fase calculada no servidor)", async () => {
    const { from, to } = { from: new Date("2026-10-01T00:00:00-03:00"), to: new Date("2026-11-01T00:00:00-03:00") };
    const s = summarizeContent(await contentFlags(await listPosts({ projectId: grupo, from, to }), NOW));
    expect({ total: s.total, publicados: s.published, atrasados: s.late }).toEqual(EXPECTED);
  });

  it("plano do mês (\"X de 10\") usa o mesmo total", async () => {
    expect((await monthUsage(grupo, MONTH)).used).toBe(EXPECTED.total);
  });

  it("aviso de atrasados: admin e cliente veem o mesmo número; o cliente só lista o que pode ver", async () => {
    const admin = await overduePosts({ id: "x", name: "Kayque", role: "admin" }, NOW);
    expect(admin.total).toBe(EXPECTED.atrasados);
    expect(admin.items.map((i) => i.title).sort()).toEqual(["parcial", "roteiro vencido"]);
    const cli = await overduePosts({ id: cliente, name: "Dhonny", role: "cliente" }, NOW);
    expect(cli.total).toBe(EXPECTED.atrasados);
    expect(cli.items.map((i) => i.title)).toEqual(["parcial"]);
    expect(cli.hidden).toBe(1);
  });

  it("regra única de atraso: horário do post, 00:00 vence no fim do dia, olha cada rede", () => {
    const day = new Date("2026-10-20T00:00:00-03:00");
    expect(isLate({ status: "roteiro", scheduledAt: day }, [], new Date("2026-10-20T23:00:00-03:00"))).toBe(false);
    expect(isLate({ status: "roteiro", scheduledAt: day }, [], new Date("2026-10-21T00:30:00-03:00"))).toBe(true);
    expect(isLate({ status: "postado", scheduledAt: day }, [{ network: "facebook", status: "pendente" }], new Date("2026-10-22T00:00:00-03:00"))).toBe(true);
    expect(isLate({ status: "postado", scheduledAt: day }, [], new Date("2026-10-22T00:00:00-03:00"))).toBe(false);
  });
});
