import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../db", () => ({ db: () => holder.db }));
process.env.META_APP_SECRET = "segredo-de-teste-123456";
process.env.META_APP_ID = "12345";
process.env.APP_URL = "https://kbos.test";
const dir = mkdtempSync(join(tmpdir(), "kbos-social-"));
process.env.GALLERY_DIR = dir;
import { seal, unseal } from "../social-crypto";
import { MetaError, exchangeCode, listMetaAccounts, publishFacebook, publishInstagram } from "../meta";
import { appendMedia, listMedia, mediaKind, openPublicMedia, startMedia } from "../social-media";
import { accountFor, handleSocialTick, saveMetaAccounts, schedulePost, sendPublication } from "../social-publish";
import { syncPublications } from "../content-cycle";

const JPG = Buffer.concat([Buffer.from("ffd8ffe0", "hex"), Buffer.alloc(2000, 1)]);
const MP4 = Buffer.concat([Buffer.from("00000018", "hex"), Buffer.from("ftypmp42"), Buffer.alloc(3000, 2)]);

/** Meta de mentira: responde por caminho e guarda as chamadas. */
function fakeMeta(routes: Record<string, (body: URLSearchParams) => unknown>) {
  const calls: { method: string; path: string; body: URLSearchParams }[] = [];
  const f = (async (input: string | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    const path = u.pathname.replace(/^\/v[\d.]+/, "");
    const body = init?.body instanceof URLSearchParams ? init.body : u.searchParams;
    const method = init?.method ?? "GET";
    calls.push({ method, path, body });
    const key = Object.keys(routes).find((k) => k === `${method} ${path}`) ?? Object.keys(routes).find((k) => new RegExp(`^${k.replace(/:\w+/g, "[^/]+")}$`).test(`${method} ${path}`));
    if (!key) return new Response(JSON.stringify({ error: { message: `sem rota ${method} ${path}`, code: 100 } }), { status: 400 });
    return new Response(JSON.stringify(routes[key](body)), { status: 200 });
  }) as typeof fetch;
  return { f, calls };
}
const noWait = async () => undefined;

describe("token criptografado", () => {
  it("abre com o mesmo segredo e recusa adulteração ou outro segredo", () => {
    const s = seal("EAAG-token");
    expect(s).not.toContain("EAAG");
    expect(unseal(s)).toBe("EAAG-token");
    expect(() => unseal(s.slice(0, -2) + "xx")).toThrow();
    expect(() => unseal(s, "outro-segredo-qualquer-123")).toThrow();
  });
});

describe("Meta (respostas simuladas)", () => {
  it("login: troca o código pelo token longo e lista Páginas + Instagram ligado", async () => {
    const { f } = fakeMeta({
      "GET /oauth/access_token": (b) => (b.get("grant_type") ? { access_token: "LONG", expires_in: 5_000_000 } : { access_token: "SHORT" }),
      "GET /me/accounts": () => ({ data: [{ id: "p1", name: "Hotel Atalaia VIP", access_token: "PT1", instagram_business_account: { id: "ig1", username: "hotelatalaiavip" } }, { id: "p2", name: "Lounge", access_token: "PT2" }] }),
    });
    const { token } = await exchangeCode("CODE", "https://kbos.test/cb/", f);
    expect(token).toBe("LONG");
    const acc = await listMetaAccounts(token, f);
    expect(acc.map((a) => [a.network, a.externalId, a.pageId, a.token])).toEqual([["facebook", "p1", "p1", "PT1"], ["instagram", "ig1", "p1", "PT1"], ["facebook", "p2", "p2", "PT2"]]);
  });
  it("Instagram: Reels espera processar; carrossel cria os itens; imagem simples", async () => {
    let polls = 0;
    const { f, calls } = fakeMeta({
      "POST /ig1/media": (b) => ({ id: b.get("media_type") === "CAROUSEL" ? "car" : `c${calls.length}` }),
      "GET /:id": (b) => (b.get("fields") === "permalink" ? { permalink: "https://instagram.com/p/xyz" } : { status_code: ++polls < 3 ? "IN_PROGRESS" : "FINISHED" }),
      "POST /ig1/media_publish": () => ({ id: "m1" }),
    });
    const reel = await publishInstagram("ig1", "T", { format: "reels", caption: "oi", media: [{ kind: "video", url: "https://x/v.mp4" }] }, f, noWait);
    expect(reel).toEqual({ externalId: "m1", url: "https://instagram.com/p/xyz" });
    expect(calls.find((c) => c.path === "/ig1/media")!.body.get("media_type")).toBe("REELS");
    expect(calls.every((c) => c.body.get("appsecret_proof"))).toBe(true);
    calls.length = 0;
    await publishInstagram("ig1", "T", { format: "carrossel", caption: "c", media: [{ kind: "image", url: "https://x/1.jpg" }, { kind: "image", url: "https://x/2.jpg" }] }, f, noWait);
    const created = calls.filter((c) => c.path === "/ig1/media");
    expect(created.map((c) => c.body.get("is_carousel_item") ?? c.body.get("media_type"))).toEqual(["true", "true", "CAROUSEL"]);
    await expect(publishInstagram("ig1", "T", { format: "reels", caption: "", media: [] }, f, noWait)).rejects.toThrow(/arquivo final/);
  });
  it("Facebook: foto, vídeo e várias fotos num post só", async () => {
    const { f, calls } = fakeMeta({
      "POST /p1/photos": (b) => (b.get("published") === "false" ? { id: `ph${calls.length}` } : { id: "ph", post_id: "p1_9" }),
      "POST /p1/videos": () => ({ id: "v9" }),
      "POST /p1/feed": () => ({ id: "p1_10" }),
      "GET /:id": () => ({ permalink_url: "https://facebook.com/p1/posts/9" }),
    });
    expect((await publishFacebook("p1", "T", { format: "estatico", caption: "a", media: [{ kind: "image", url: "https://x/1.jpg" }] }, f)).externalId).toBe("p1_9");
    expect((await publishFacebook("p1", "T", { format: "reels", caption: "a", media: [{ kind: "video", url: "https://x/v.mp4" }] }, f)).externalId).toBe("v9");
    await publishFacebook("p1", "T", { format: "carrossel", caption: "a", media: [{ kind: "image", url: "https://x/1.jpg" }, { kind: "image", url: "https://x/2.jpg" }] }, f);
    const feed = calls.find((c) => c.path === "/p1/feed")!;
    expect(JSON.parse(feed.body.get("attached_media[1]")!)).toHaveProperty("media_fbid");
    await expect(publishFacebook("p1", "T", { format: "story", caption: "", media: [{ kind: "image", url: "https://x/1.jpg" }] }, f)).rejects.toThrow(/Story/);
  });
  it("token vencido vira MetaError expirado", async () => {
    const f = (async () => new Response(JSON.stringify({ error: { message: "Session has expired", code: 190 } }), { status: 400 })) as typeof fetch;
    const e = await publishInstagram("ig1", "T", { format: "estatico", caption: "", media: [{ kind: "image", url: "https://x" }] }, f, noWait).catch((x) => x);
    expect(e).toBeInstanceOf(MetaError);
    expect(e.expired).toBe(true);
  });
});

const pg = new PGlite(), d = drizzle(pg, { schema });
let grupo: string, hotel: string, post: string;
beforeAll(async () => { holder.db = d; for (const f of readdirSync("drizzle").filter((f) => /^\d.*\.sql$/.test(f)).sort()) await pg.exec(readFileSync(`drizzle/${f}`, "utf8")); }, 30000);
beforeEach(async () => {
  await pg.exec("TRUNCATE kbos_users, kbos_projects, kbos_social_accounts CASCADE");
  const [g] = await d.insert(schema.projects).values({ titulo: "Grupo VIP", categoria: "social" }).returning();
  const [h] = await d.insert(schema.projects).values({ titulo: "Hotel Atalaia VIP", categoria: "social", parentId: g.id }).returning();
  grupo = g.id; hotel = h.id;
  const [p] = await d.insert(schema.socialPosts).values({ projectId: hotel, title: "Piscina", format: "reels", status: "aprovado", caption: "Bom dia", scheduledAt: new Date("2026-11-02T18:00:00-03:00") }).returning();
  post = p.id;
});
afterAll(async () => { await pg.close(); rmSync(dir, { recursive: true, force: true }); });

describe("arquivo final em pedaços", () => {
  it("só JPG/MP4 de verdade; junta os pedaços no lugar certo e serve pelo token", async () => {
    expect(mediaKind("a.jpg", JPG).kind).toBe("image");
    expect(mediaKind("a.mp4", MP4).kind).toBe("video");
    expect(() => mediaKind("a.png", JPG)).toThrow(/JPG/);
    expect(() => mediaKind("a.jpg", MP4)).toThrow();
    const first = MP4.subarray(0, 1000), rest = MP4.subarray(1000);
    const s = await startMedia(post, "piscina.mp4", MP4.length, first);
    expect(s.done).toBe(false);
    expect((await appendMedia(post, s.id, 0, rest)).resumeAt).toBe(1000); // offset errado: pede para retomar de onde parou
    const done = await appendMedia(post, s.id, 1000, rest);
    expect(done.done).toBe(true);
    const [m] = await listMedia(post);
    expect(m).toMatchObject({ status: "pronto", size: MP4.length, kind: "video" });
    const open = await openPublicMedia(m.publicToken);
    expect(open!.size).toBe(MP4.length);
    await open!.fh.close();
    expect(await openPublicMedia("token-que-nao-existe-123456")).toBeNull();
  });
});

describe("agendar e publicar", () => {
  async function ready() {
    const s = await startMedia(post, "piscina.mp4", MP4.length, MP4);
    expect(s.done).toBe(true);
    await syncPublications(post, ["instagram", "facebook"]);
  }
  it("barra sem arquivo, sem rede, sem conta; conta do principal vale para a operação", async () => {
    await expect(schedulePost(post, { at: new Date() })).rejects.toThrow(/arquivo final/);
    await startMedia(post, "piscina.mp4", MP4.length, MP4);
    await expect(schedulePost(post, { at: new Date() })).rejects.toThrow(/Instagram/);
    await syncPublications(post, ["instagram", "facebook"]);
    await expect(schedulePost(post, { at: new Date() })).rejects.toThrow(/Falta ligar a conta/);
    await saveMetaAccounts([{ network: "instagram", externalId: "ig1", pageId: "p1", name: "Hotel", username: "hotel", pictureUrl: null, token: "PT" }, { network: "facebook", externalId: "p9", pageId: "p9", name: "Grupo", username: null, pictureUrl: null, token: "PT9" }], null);
    expect((await d.select().from(schema.socialAccounts)).every((a) => !a.tokenEnc.includes("PT"))).toBe(true);
    await d.update(schema.socialAccounts).set({ projectId: hotel }).where(eq(schema.socialAccounts.externalId, "ig1"));
    await d.update(schema.socialAccounts).set({ projectId: grupo }).where(eq(schema.socialAccounts.externalId, "p9"));
    expect((await accountFor(hotel, "facebook"))!.externalId).toBe("p9"); // do principal
    expect(await schedulePost(post, { at: new Date("2026-11-02T18:00:00-03:00") })).toBe(2);
    expect((await d.select().from(schema.socialPosts).where(eq(schema.socialPosts.id, post)))[0].status).toBe("agendado");
  });
  it("verificador publica só o que venceu, uma vez; post vira postado quando todas as redes saem", async () => {
    await ready();
    await saveMetaAccounts([{ network: "instagram", externalId: "ig1", pageId: "p1", name: "Hotel", username: null, pictureUrl: null, token: "PT" }, { network: "facebook", externalId: "p1", pageId: "p1", name: "Hotel", username: null, pictureUrl: null, token: "PT" }], null);
    await d.update(schema.socialAccounts).set({ projectId: hotel });
    await schedulePost(post, { at: new Date("2026-11-02T18:00:00-03:00") });
    const sent: string[] = [];
    const publisher = async (network: string, acc: { token: string }, input: { caption: string; media: { url: string }[] }) => {
      expect(acc.token).toBe("PT");
      expect(input.caption).toBe("Bom dia");
      expect(input.media[0].url).toMatch(/^https:\/\/kbos\.test\/api\/public\/social-media\/.+\/arquivo\.mp4$/);
      sent.push(network);
      return { externalId: `${network}-1`, url: `https://${network}.com/p/1` };
    };
    expect(await handleSocialTick(new Date("2026-11-02T17:00:00-03:00"), publisher)).toEqual([]); // ainda não venceu
    const out = await handleSocialTick(new Date("2026-11-02T18:00:30-03:00"), publisher);
    expect(out.map((o) => o.result)).toEqual(["publicado", "publicado"]);
    expect(sent.sort()).toEqual(["facebook", "instagram"]);
    expect(await handleSocialTick(new Date("2026-11-02T18:05:00-03:00"), publisher)).toEqual([]); // não repete
    const [p] = await d.select().from(schema.socialPosts).where(eq(schema.socialPosts.id, post));
    expect(p.status).toBe("postado");
    expect(p.postedUrl).toMatch(/^https:/);
  });
  it("trava contra envio duplo; erro de rede tenta de novo até 3 vezes; erro da Meta não", async () => {
    await ready();
    await saveMetaAccounts([{ network: "instagram", externalId: "ig1", pageId: "p1", name: "Hotel", username: null, pictureUrl: null, token: "PT" }, { network: "facebook", externalId: "p1", pageId: "p1", name: "Hotel", username: null, pictureUrl: null, token: "PT" }], null);
    await d.update(schema.socialAccounts).set({ projectId: hotel });
    await schedulePost(post, { at: new Date("2026-11-01T10:00:00-03:00") });
    const [ig] = await d.select().from(schema.postPublications).where(eq(schema.postPublications.network, "instagram"));
    const t0 = new Date("2026-11-02T10:00:00-03:00");
    let release!: () => void;
    const slow = () => new Promise<{ externalId: string; url: string | null }>((r) => { release = () => r({ externalId: "x", url: null }); });
    const first = sendPublication(ig.id, t0, slow);
    await new Promise((r) => setTimeout(r, 30));
    expect((await sendPublication(ig.id, t0, slow)).result).toBe("ocupado");
    release(); expect((await first).result).toBe("publicado");
    const [fb] = await d.select().from(schema.postPublications).where(eq(schema.postPublications.network, "facebook"));
    const boom = async () => { throw new Error("ECONNRESET"); };
    expect((await sendPublication(fb.id, t0, boom)).result).toBe("tentar-de-novo");
    expect((await sendPublication(fb.id, t0, boom)).result).toBe("tentar-de-novo");
    expect((await sendPublication(fb.id, t0, boom)).result).toBe("erro");
    const [after] = await d.select().from(schema.postPublications).where(eq(schema.postPublications.id, fb.id));
    expect(after).toMatchObject({ status: "erro", attempts: 3 });
    // erro da Meta (ex.: vídeo fora do padrão) não fica tentando; token vencido marca a conta
    await d.update(schema.postPublications).set({ status: "agendado", attempts: 0, sendingAt: null }).where(eq(schema.postPublications.id, fb.id));
    const expired = async () => { throw new MetaError("Session has expired", 190, true); };
    expect((await sendPublication(fb.id, t0, expired)).result).toBe("erro");
    const acc = (await d.select().from(schema.socialAccounts).where(eq(schema.socialAccounts.network, "facebook")))[0];
    expect(acc.status).toBe("expirado");
  });
});
