import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../schema";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../db", () => ({ db: () => holder.db }));
const queued = vi.hoisted(() => ({ calls: [] as { to: string; text: string; evento?: string }[] }));
vi.mock("../whatsapp", () => ({
  queueWhatsApp: async (to: string, text: string, evento?: string) => {
    queued.calls.push({ to, text, evento });
    await (holder.db as ReturnType<typeof drizzle>).insert(schema.notifications).values({ canal: "whatsapp", destino: to, mensagem: text, evento });
    return { queued: true };
  },
}));
import { notifyChatMessage } from "../chat-notify";

const pg = new PGlite();
const d = drizzle(pg, { schema });
beforeAll(async () => {
  holder.db = d;
  for (const name of readdirSync(join(process.cwd(), "drizzle")).filter((n) => /^\d.*\.sql$/.test(n)).sort()) {
    await pg.exec(readFileSync(join(process.cwd(), "drizzle", name), "utf8"));
  }
}, 30_000);
afterAll(async () => { await pg.close(); });

describe("aviso do chat por WhatsApp", () => {
  it("avisa o cliente quando a equipe escreve e segura repetições por 30 min", async () => {
    const [cli] = await d.insert(schema.users).values({ email: "c@x.com", name: "Cliente", role: "cliente", phone: "5591999990001" }).returning();
    const [adm] = await d.insert(schema.users).values({ email: "a@x.com", name: "Kayque", role: "admin", phone: "5591999990002" }).returning();
    const [p] = await d.insert(schema.projects).values({ titulo: "Site", categoria: "web", clienteId: cli.id }).returning();
    expect(await notifyChatMessage(adm, p.id)).toBe(1);
    expect(queued.calls[0].to).toBe("5591999990001");
    expect(await notifyChatMessage(adm, p.id)).toBe(0);
    // cliente escreve → avisa o admin (outro destinatário, outra janela)
    expect(await notifyChatMessage({ id: cli.id, role: "cliente", name: "Cliente" }, p.id)).toBe(1);
    expect(queued.calls[1].to).toBe("5591999990002");
  });
  it("sem telefone ou projeto, não quebra", async () => {
    expect(await notifyChatMessage({ id: "00000000-0000-0000-0000-000000000000", role: "admin", name: "x" }, "00000000-0000-0000-0000-000000000000")).toBe(0);
  });
});
