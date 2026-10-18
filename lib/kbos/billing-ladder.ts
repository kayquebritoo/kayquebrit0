import { sql } from "drizzle-orm";
import { db } from "./db";
import { DEFAULT_PIX_INFO } from "./constants";
import { localDay } from "./sale-plan";

/** Escada de cobrança pós-vencimento (textos aprovados pelo Kayque em 18/10/2026):
 * 1 dia (gentil) → 5 dias (firme) → 12 dias (último aviso). */
export const LADDER_DAYS = [1, 5, 12] as const;
export type LadderStep = 1 | 2 | 3;

const dayMs = 86_400_000;
const at12 = (day: string) => new Date(`${day}T12:00:00Z`);

/** Qual degrau cabe hoje? (null = nenhum). `dueDay`/`today` são datas locais AAAA-MM-DD. */
export function ladderStep(dueDay: string, today: string): LadderStep | null {
  const late = Math.round((at12(today).getTime() - at12(dueDay).getTime()) / dayMs);
  const i = (LADDER_DAYS as readonly number[]).indexOf(late);
  return i === -1 ? null : ((i + 1) as LadderStep);
}

/** Só manda de segunda a sábado, entre 9h e 19h em Belém. Cobrança de madrugada ou domingo queima relação. */
export function inSendWindow(now = new Date()): boolean {
  const belem = new Date(now.getTime() - 3 * 3_600_000);
  return belem.getUTCDay() !== 0 && belem.getUTCHours() >= 9 && belem.getUTCHours() < 19;
}

const brl = (v: string | number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const firstName = (n: string) => n.trim().split(/\s+/)[0] || n;

export type LadderVars = { nome: string; valor: string | number; servico: string; vencimento: string; hoje: string };

export function ladderMessage(step: LadderStep, v: LadderVars, pix = DEFAULT_PIX_INFO): string {
  const nome = firstName(v.nome);
  const valor = brl(v.valor);
  const venc = dm(v.vencimento);
  const prazoFinal = dm(new Date(at12(v.hoje).getTime() + 2 * dayMs).toISOString().slice(0, 10));
  if (step === 1)
    return `Oi, ${nome}! Tudo bem? Passando só pra lembrar que a parcela de ${valor} do projeto ${v.servico} venceu ontem (${venc}). Às vezes passa mesmo, acontece! Se já pagou, me avisa que eu dou baixa por aqui. Se não, segue o pagamento: ${pix}. Qualquer coisa me chama.`;
  if (step === 2)
    return `Oi, ${nome}. Ainda não identifiquei o pagamento de ${valor} do projeto ${v.servico}, que venceu em ${venc}. Consegue me confirmar até amanhã quando vai ficar resolvido? ${pix}. Se tiver algum problema ou precisar combinar outra data, me fala que a gente resolve junto, mas preciso de um retorno.`;
  return `${nome}, preciso ser direto: o pagamento de ${valor} do projeto ${v.servico} está em aberto desde ${venc}. Se não houver retorno até ${prazoFinal}, vou precisar pausar as entregas e os acessos do projeto até a regularização, conforme o contrato. Prefiro resolver na conversa. ${pix}. Me chama hoje, por favor.`;
}

/** Enfileira (outbox) os avisos de hoje. Mesma regra do lembrete antes do vencimento: só cobranças de
 * venda aceita, com o telefone do contato. A chave de idempotência garante um aviso por degrau. */
export async function handleBillingLadder(now = new Date()) {
  if (!inSendWindow(now)) return { queued: 0 };
  const today = localDay(now);
  const rows = (await db().execute(sql`
    SELECT t.id, t.valor::text AS valor, t.descricao, c.name, coalesce(p.titulo, t.descricao) AS servico,
      (t.vencimento AT TIME ZONE 'America/Belem')::date::text AS due,
      regexp_replace(c.phone, '[^0-9]', '', 'g') AS phone
    FROM kbos_transactions t
    JOIN kbos_contacts c ON c.id = t.contact_id
    JOIN kbos_budget_sales s ON s.project_id = t.project_id AND s.accepted_at IS NOT NULL
    LEFT JOIN kbos_projects p ON p.id = t.project_id
    WHERE t.tipo = 'entrada' AND t.status IN ('pendente', 'vencido') AND t.vencimento IS NOT NULL
      AND length(regexp_replace(coalesce(c.phone,''), '[^0-9]', '', 'g')) BETWEEN 10 AND 15
      AND (t.vencimento AT TIME ZONE 'America/Belem')::date < ${today}::date`)).rows as {
    id: string; valor: string; name: string; servico: string; due: string; phone: string;
  }[];
  let queued = 0;
  for (const r of rows) {
    const step = ladderStep(r.due, today);
    if (!step) continue;
    const destino = r.phone.length <= 11 ? `55${r.phone}` : r.phone;
    const payload = {
      billingTransactionId: r.id,
      billingDueDate: r.due,
      billingReminderDay: today,
      destino,
      mensagem: ladderMessage(step, { nome: r.name, valor: r.valor, servico: r.servico, vencimento: r.due, hoje: today }),
      evento: "billing.ladder",
    };
    const res = await db().execute(sql`
      INSERT INTO kbos_jobs (tipo, payload, idempotency_key)
      VALUES ('notify.whatsapp', ${JSON.stringify(payload)}::jsonb, ${`billing-ladder-${r.id}-${r.due}-${step}`})
      ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`);
    queued += res.rows.length;
  }
  return { queued };
}
