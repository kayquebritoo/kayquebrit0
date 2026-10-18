// Diário do webhook da Evolution: as últimas 50 chamadas (evento + resultado),
// no Redis, para diagnosticar "as mensagens não chegam" sem acesso ao servidor.
// Não guarda conteúdo de mensagem — só o tipo do evento, o resultado e o final
// do número (privacidade). Best-effort: nunca derruba o webhook.
import { ensureRedis, getRedis } from "./jobs";

const KEY = "kbos:webhook:evolution:log";
const MAX = 50;

export type HookLog = { at: string; event: string; result: string; detail?: string };

/** Mascara um JID/telefone: mantém só os 4 últimos dígitos. */
export function maskChat(chatId: string | null | undefined): string | undefined {
  if (!chatId) return undefined;
  const digits = chatId.replace(/\D/g, "");
  const kind = chatId.includes("@g.us") ? "grupo" : chatId.includes("@lid") ? "lid" : "contato";
  return digits ? `${kind} …${digits.slice(-4)}` : kind;
}

export async function logHook(entry: Omit<HookLog, "at">): Promise<void> {
  try {
    if (!(await ensureRedis(800))) return;
    const r = getRedis();
    await r.lpush(KEY, JSON.stringify({ at: new Date().toISOString(), ...entry }));
    await r.ltrim(KEY, 0, MAX - 1);
  } catch {
    /* diagnóstico nunca derruba o webhook */
  }
}

export async function readHookLog(): Promise<HookLog[] | null> {
  try {
    if (!(await ensureRedis(1200))) return null;
    const rows = await getRedis().lrange(KEY, 0, MAX - 1);
    return rows.flatMap((s) => {
      try {
        return [JSON.parse(s) as HookLog];
      } catch {
        return [];
      }
    });
  } catch {
    return null;
  }
}
