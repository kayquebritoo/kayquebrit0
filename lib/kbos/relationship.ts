import { sql } from "drizzle-orm";
import { db } from "./db";
import { inSendWindow } from "./billing-ladder";
import { localDay } from "./sale-plan";

/** Automações de relacionamento (textos aprovados pelo Kayque em 18/10/2026):
 * follow-up de orçamento sem resposta (3 e 10 dias) e pedido de depoimento/portfólio após a entrega. */

const firstName = (n: string) => n.trim().split(/\s+/)[0] || n;
const dmy = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

/** Degrau do follow-up pela idade (dias) do orçamento. Janelas fechadas: orçamento antigo não dispara de uma vez. */
export function followupStep(ageDays: number): 1 | 2 | null {
  if (ageDays >= 3 && ageDays < 8) return 1;
  if (ageDays >= 10 && ageDays < 15) return 2;
  return null;
}

export function followupMessage(step: 1 | 2, v: { nome: string; codigo: string; validade?: string | null }): string {
  const nome = firstName(v.nome);
  if (step === 1)
    return `Oi, ${nome}! Tudo bem? Passando pra saber se deu pra dar uma olhada na proposta que te enviei (${v.codigo}). Se ficou alguma dúvida, sobre valores, prazo ou o que está incluso, me chama que eu explico com calma. Se preferir ajustar algo, a gente conversa e adapta.`;
  const ate = v.validade ? ` segue válida até ${dmy(v.validade)}` : " segue válida";
  return `Oi, ${nome}. Sua proposta (${v.codigo})${ate}. Se o momento não é agora, sem problema nenhum, me avisa que eu deixo guardado e a gente retoma quando fizer sentido pra você.`;
}

export function deliveredAskMessage(v: { nome: string; servico: string }): string {
  return `Oi, ${firstName(v.nome)}! O projeto ${v.servico} foi entregue e foi um prazer trabalhar com você. Posso te pedir uma ajuda? Se você curtiu o resultado, um depoimento curtinho (2 ou 3 linhas) me ajuda muito. E se topar, queria te perguntar uma coisa: você me permite usar algumas informações públicas do projeto no meu portfólio? Eu te mando o que seria publicado pra você aprovar antes, nada vai ao ar sem o seu ok.`;
}

type Row = { id: string; name: string; phone: string; code?: string; valid?: string | null; titulo?: string; age: number };
const phoneTo = (p: string) => (p.length <= 11 ? `55${p}` : p);

async function queue(key: string, payload: Record<string, unknown>) {
  const res = await db().execute(sql`
    INSERT INTO kbos_jobs (tipo, payload, idempotency_key)
    VALUES ('notify.whatsapp', ${JSON.stringify(payload)}::jsonb, ${key})
    ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`);
  return res.rows.length;
}

export async function handleRelationship(now = new Date()) {
  if (!inSendWindow(now)) return { queued: 0 };
  const today = localDay(now);
  let queued = 0;

  // 1) Orçamento enviado e sem resposta.
  const budgets = (await db().execute(sql`
    SELECT b.id, c.name, regexp_replace(c.phone, '[^0-9]', '', 'g') AS phone, b.code,
      (b.valid_until AT TIME ZONE 'America/Belem')::date::text AS valid,
      (${today}::date - (b.created_at AT TIME ZONE 'America/Belem')::date) AS age
    FROM kbos_budgets b JOIN kbos_contacts c ON c.id = b.contact_id
    WHERE b.status = 'sent' AND length(regexp_replace(coalesce(c.phone,''), '[^0-9]', '', 'g')) BETWEEN 10 AND 15
      AND (b.valid_until IS NULL OR (b.valid_until AT TIME ZONE 'America/Belem')::date >= ${today}::date)
      AND NOT EXISTS (SELECT 1 FROM kbos_budget_sales s WHERE s.budget_id = b.id AND s.accepted_at IS NOT NULL)`)).rows as unknown as Row[];
  for (const b of budgets) {
    const step = followupStep(Number(b.age));
    if (!step) continue;
    queued += await queue(`budget-followup-${b.id}-${step}`, {
      destino: phoneTo(b.phone),
      mensagem: followupMessage(step, { nome: b.name, codigo: b.code!, validade: b.valid }),
      evento: "budget.followup",
      guardBudgetId: b.id,
    });
  }

  // 2) Projeto entregue há 2-7 dias, sem case no portfólio.
  const delivered = (await db().execute(sql`
    SELECT p.id, c.name, regexp_replace(c.phone, '[^0-9]', '', 'g') AS phone, p.titulo,
      (${today}::date - (p.updated_at AT TIME ZONE 'America/Belem')::date) AS age
    FROM kbos_projects p JOIN kbos_contacts c ON c.id = p.contact_id
    WHERE p.status = 'entregue' AND length(regexp_replace(coalesce(c.phone,''), '[^0-9]', '', 'g')) BETWEEN 10 AND 15
      AND NOT EXISTS (SELECT 1 FROM kbos_showcases s WHERE s.project_id = p.id OR s.contact_id = c.id)`)).rows as unknown as Row[];
  for (const p of delivered) {
    const age = Number(p.age);
    if (age < 2 || age >= 8) continue;
    queued += await queue(`delivery-ask-${p.id}`, {
      destino: phoneTo(p.phone),
      mensagem: deliveredAskMessage({ nome: p.name, servico: p.titulo! }),
      evento: "project.delivery_ask",
      guardProjectId: p.id,
    });
  }
  return { queued };
}

