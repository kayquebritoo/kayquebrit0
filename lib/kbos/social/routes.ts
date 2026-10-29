// Começo e volta do login OAuth de qualquer rede (rotas /api/social/<rede>/connect e /callback).
// Três jeitos de conectar, mesmo fluxo: admin (Ajustes/ficha do projeto), cliente no portal e link de conexão.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { appUrlEnv } from "../email";
import { clientIp } from "../rate-limit";
import { sessionUser, type SessionUser } from "../rbac";
import { clientProjectIds, managedProjectIds, ownedProjectIds } from "../project-members";
import { projects } from "../schema";
import { socialCryptoReady } from "../social-crypto";
import { FLOW_COOKIE, finishFlow, flowCookieOptions, safeBack, startFlow, type FlowTarget } from "./oauth";
import { isProviderId, providerById } from "./providers";
import { resolveConnectLink, saveConnection, type Actor } from "./connections";
import { SocialError } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Sempre pela URL pública: atrás do Caddy o req.url traz o host interno. */
const go = (path: string, q: Record<string, string> = {}) => {
  const u = new URL(path, appUrlEnv());
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  return NextResponse.redirect(u);
};

/** Projetos em que o cliente decide sobre as redes: titular (direto ou por empresa, e as operações dele) ou quem faz a gestão. */
export async function socialManageableProjectIds(userId: string) {
  const all = await clientProjectIds(userId);
  const byCompany = await ownedProjectIds(userId, all);
  const owned = await db().select({ id: projects.id }).from(projects).where(eq(projects.clienteId, userId));
  const ownedIds = [...new Set([...byCompany, ...owned.map((o) => o.id)])];
  const kids = ownedIds.length ? await db().select({ id: projects.id }).from(projects).where(inArray(projects.parentId, ownedIds)) : [];
  return [...new Set([...ownedIds, ...kids.map((k) => k.id), ...(await managedProjectIds(userId))])];
}

async function targetFor(sp: URLSearchParams, user: SessionUser | null): Promise<FlowTarget | { redirect: string }> {
  const linkToken = sp.get("link");
  if (linkToken) {
    const link = await resolveConnectLink(linkToken);
    if (!link) return { redirect: `/conectar/${encodeURIComponent(linkToken.slice(0, 64))}/` };
    return { projectId: link.projectId, linkId: link.id, userId: null, via: "link", back: `/conectar/${linkToken}/` };
  }
  if (!user) return { redirect: "/entrar/" };
  const project = sp.get("project");
  const projectId = project && UUID.test(project) ? project : null;
  if (user.role === "admin") return { projectId, linkId: null, userId: user.id, via: "admin", back: safeBack(sp.get("back"), "/admin/ajustes/") };
  const allowed = await socialManageableProjectIds(user.id);
  const chosen = projectId ?? (allowed.length === 1 ? allowed[0] : null);
  if (!chosen || !allowed.includes(chosen)) return { redirect: "/portal/?redes=projeto" };
  return { projectId: chosen, linkId: null, userId: user.id, via: "portal", back: "/portal/" };
}

export async function socialConnect(req: Request, providerParam: string) {
  const sp = new URL(req.url).searchParams;
  const metaNet = providerParam === "instagram" || providerParam === "facebook"
    ? providerParam
    : (sp.get("network") === "instagram" || sp.get("network") === "facebook" ? (sp.get("network") as "instagram" | "facebook") : null);
  const resolvedId = providerParam === "instagram" || providerParam === "facebook" ? "meta" : providerParam;
  const provider = isProviderId(resolvedId) ? providerById(resolvedId)! : null;
  const user = await sessionUser();
  const target = await targetFor(sp, user);
  if ("redirect" in target) return go(target.redirect);
  if (metaNet) target.network = metaNet;
  if (!provider || !provider.configured() || !socialCryptoReady()) return go(target.back, { redes: "embreve", ...(metaNet ? { rede: metaNet } : {}) });
  const flow = startFlow(provider.id, target, provider.pkce);
  const res = NextResponse.redirect(provider.authUrl({
    redirectUri: flow.redirectUri,
    state: flow.state,
    codeChallenge: flow.challenge,
    network: target.network ?? null,
    prompt: Boolean(target.network || sp.get("prompt")),
  }));
  res.cookies.set(FLOW_COOKIE, flow.cookie, flowCookieOptions());
  return res;
}

export async function socialCallback(req: Request, providerParam: string) {
  const sp = new URL(req.url).searchParams;
  const resolvedId = providerParam === "instagram" || providerParam === "facebook" ? "meta" : providerParam;
  if (!isProviderId(resolvedId)) return go("/portal/", { redes: "estado" });
  const provider = providerById(resolvedId)!;
  const jar = await cookies();
  const flow = finishFlow(provider.id, sp.get("state"), jar.get(FLOW_COOKIE)?.value);
  const rede = flow?.network ?? provider.id;
  const done = (q: Record<string, string>) => {
    const res = go(flow?.back ?? "/portal/", { ...q, rede });
    res.cookies.set(FLOW_COOKIE, "", { ...flowCookieOptions(), maxAge: 0 });
    return res;
  };
  if (!flow) return done({ redes: "estado" });
  if (sp.get("error")) return done({ redes: "cancelado" });
  const code = sp.get("code");
  if (!code) return done({ redes: "estado" });
  // quem voltou é quem começou (sessão) ou o link ainda vale
  const user = await sessionUser();
  if (flow.via === "link") {
    if (!flow.linkId) return done({ redes: "estado" });
  } else if (!user || user.id !== flow.userId) return done({ redes: "estado" });
  const actor: Actor = { kind: flow.via === "link" ? "link" : flow.via === "portal" ? "cliente" : "admin", userId: flow.userId, ip: clientIp(req), userAgent: req.headers.get("user-agent") };
  try {
    const tokens = await provider.exchangeCode({ code, redirectUri: flow.redirectUri, codeVerifier: flow.verifier ?? undefined });
    const accounts = await provider.listAccounts(tokens);
    const list = flow.network ? accounts.filter((a) => a.network === flow.network) : accounts;
    if (!list.length) {
      return done({ redes: flow.network === "instagram" && accounts.length > 0 ? "vazio_ig" : "vazio" });
    }
    const out = await saveConnection(provider.id, tokens, list, flow, actor);
    return done({ redes: "ok", contas: String(out.accounts.length) });
  } catch (e) {
    console.error(`[social] callback ${provider.id}`, e instanceof Error ? e.message : e);
    return done({ redes: "erro", msg: e instanceof SocialError ? e.message.slice(0, 160) : `Falha ao falar com ${provider.label}.` });
  }
}
