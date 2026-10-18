// Agente pessoal do Kayque no WhatsApp.
//
// Só o dono (ASSISTANT_OWNER_PHONE) conversa com ele — na conversa
// "mensagem para mim" do próprio número ou de outro aparelho. Cliente
// nunca fala com o agente: segue para o inbox normal.
//
// Fluxo de um turno:
//   texto (ou áudio → Whisper) → LLM com ferramentas do KBOS →
//   leitura roda na hora; ESCRITA fica pendente e o agente pergunta
//   "Confirma?" → "sim" executa, "não" cancela.
// Segurança: só age quando o webhook vem com o token
// (EVOLUTION_WEBHOOK_TOKEN), para ninguém forjar uma mensagem "do dono".
import { and, asc, desc, eq, ilike, lt, lte, or, sql } from "drizzle-orm";
import { db } from "./db";
import { contacts, events, projects, tasks, transactions } from "./schema";
import { evoConfig } from "./evolution";
import { ensureRedis, getRedis } from "./jobs";
import { fetchInboundMedia, onlyDigits, type InboundMessage } from "./inbox";
import { llmConfig, transcribeAudio } from "./assistant";
import { documentKind, formatDocument } from "./document";
import { queueWhatsApp } from "./whatsapp";
import { logHook } from "./webhook-log";

export const AGENT_PREFIX = "🤖 ";
const TZ = "America/Belem";
const HISTORY_MAX = 12;

/* ───────────────────────── partes puras (testadas) ───────────────────────── */

/** Mesmo telefone BR, com ou sem 55 e com ou sem o 9º dígito. */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (v: string) => {
    let d = onlyDigits(v);
    if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
    if (d.length === 11 && d[2] === "9") d = d.slice(0, 2) + d.slice(3);
    return d;
  };
  if (!a || !b) return false;
  const x = norm(a);
  return x.length >= 10 && x === norm(b);
}

export const isYes = (t: string) => /^\s*(sim|s|ss|confirmo|confirma|pode|ok|okay|isso|manda|beleza|bora|👍|✅)\b/i.test(t);
export const isNo = (t: string) => /^\s*(n[aã]o|nao|n|cancela|cancelar|para|deixa)\b/i.test(t);

export type PendingAction = { tool: string; args: Record<string, unknown>; at: number };

const brl = (v: unknown) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dt = (v: unknown) => {
  const s = typeof v === "string" ? v : "";
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "sem data";
};

/** Resumo legível do que vai ser gravado, para o "Confirma?". */
export function describeAction(p: Pick<PendingAction, "tool" | "args">): string {
  const a = p.args;
  switch (p.tool) {
    case "cadastrar_cliente":
      return `cadastrar *${a.nome}*${a.empresa ? ` (${a.empresa})` : ""}${a.telefone ? ` · ${a.telefone}` : ""}${a.documento ? ` · ${a.documento}` : ""}`;
    case "atualizar_cliente":
      return `atualizar o cliente ${a.nome_atual ?? ""}: ${Object.entries(a)
        .filter(([k]) => !["id", "nome_atual"].includes(k))
        .map(([k, v]) => `${k} → ${v}`)
        .join(", ")}`;
    case "criar_tarefa":
      return `criar a tarefa *${a.titulo}* para ${dt(a.prazo)}${a.responsavel ? ` (${a.responsavel})` : ""}${a.prioridade === "alta" ? " · prioridade alta" : ""}`;
    case "atualizar_tarefa":
      return `atualizar a tarefa ${a.titulo_atual ?? ""}${a.status ? ` → ${a.status === "done" ? "feita" : a.status === "doing" ? "fazendo" : "a fazer"}` : ""}${a.prazo ? ` · novo prazo ${dt(a.prazo)}` : ""}`;
    case "lancar_financeiro":
      return `lançar ${a.tipo === "entrada" ? "entrada" : "despesa"} *${a.descricao}* de ${brl(a.valor)} · ${a.conta === "pessoal" ? "pessoal" : "empresa"} · ${a.pago ? "pago" : `vence ${dt(a.data)}`}${a.recorrencia ? ` · repete ${a.recorrencia}` : ""}`;
    case "atualizar_projeto":
      return `mudar o projeto ${a.titulo_atual ?? ""} para *${a.status}*`;
    case "enviar_mensagem":
      return `mandar para ${a.nome_contato ?? "o contato"}: “${String(a.texto ?? "").slice(0, 300)}”`;
    default:
      return p.tool;
  }
}

/* ───────────────────────── ferramentas ───────────────────────── */

const WRITE_TOOLS = new Set([
  "cadastrar_cliente",
  "atualizar_cliente",
  "criar_tarefa",
  "atualizar_tarefa",
  "lancar_financeiro",
  "atualizar_projeto",
  "enviar_mensagem",
]);

const str = { type: "string" } as const;
const TOOLS = [
  { name: "resumo_do_dia", description: "Tarefas de hoje e atrasadas, contas a pagar/receber até 2 dias, compromissos de hoje.", parameters: { type: "object", properties: {} } },
  { name: "buscar_clientes", description: "Procura contatos por nome, empresa, telefone ou CNPJ/CPF.", parameters: { type: "object", properties: { busca: str }, required: ["busca"] } },
  {
    name: "cadastrar_cliente",
    description: "Cadastra um contato novo. Pergunte o que faltar do essencial (nome e telefone ou empresa).",
    parameters: {
      type: "object",
      properties: { nome: str, telefone: str, email: str, empresa: str, documento: { type: "string", description: "CPF ou CNPJ" }, status: { type: "string", enum: ["lead", "client", "partner"] }, notas: str },
      required: ["nome"],
    },
  },
  {
    name: "atualizar_cliente",
    description: "Atualiza dados de um contato existente (use buscar_clientes antes para achar o id).",
    parameters: {
      type: "object",
      properties: { id: str, nome_atual: str, nome: str, telefone: str, email: str, empresa: str, documento: str, status: { type: "string", enum: ["lead", "client", "partner", "archived"] }, notas: str },
      required: ["id"],
    },
  },
  { name: "listar_tarefas", description: "Lista tarefas abertas.", parameters: { type: "object", properties: { filtro: { type: "string", enum: ["hoje", "atrasadas", "semana", "todas"] } } } },
  {
    name: "criar_tarefa",
    description: "Cria uma tarefa. Prazo em AAAA-MM-DD (converta 'amanhã', 'sexta' etc. pela data de hoje).",
    parameters: {
      type: "object",
      properties: { titulo: str, prazo: str, responsavel: str, prioridade: { type: "string", enum: ["normal", "alta"] }, cliente_id: str, detalhes: str },
      required: ["titulo"],
    },
  },
  {
    name: "atualizar_tarefa",
    description: "Conclui, reabre ou muda o prazo de uma tarefa (use listar_tarefas para achar o id).",
    parameters: { type: "object", properties: { id: str, titulo_atual: str, status: { type: "string", enum: ["todo", "doing", "done"] }, prazo: str }, required: ["id"] },
  },
  {
    name: "lancar_financeiro",
    description: "Lança despesa ou entrada. Valor em reais (número). Data AAAA-MM-DD. Conta empresa (padrão) ou pessoal.",
    parameters: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: ["entrada", "saida"] },
        descricao: str,
        valor: { type: "number" },
        data: str,
        pago: { type: "boolean" },
        conta: { type: "string", enum: ["empresa", "pessoal"] },
        categoria: str,
        recorrencia: { type: "string", enum: ["mensal", "anual"] },
        forma: str,
      },
      required: ["tipo", "descricao", "valor"],
    },
  },
  { name: "listar_projetos", description: "Lista projetos abertos com status e prazo.", parameters: { type: "object", properties: {} } },
  {
    name: "atualizar_projeto",
    description: "Muda o status de um projeto.",
    parameters: { type: "object", properties: { id: str, titulo_atual: str, status: { type: "string", enum: ["novo", "briefing", "producao", "revisao", "aprovado", "entregue"] } }, required: ["id", "status"] },
  },
  {
    name: "enviar_mensagem",
    description: "Manda uma mensagem de WhatsApp para um contato do CRM (use buscar_clientes para o id). Escreva no tom do Kayque.",
    parameters: { type: "object", properties: { contato_id: str, nome_contato: str, texto: str }, required: ["contato_id", "texto"] },
  },
].map((f) => ({ type: "function" as const, function: f }));

const todayKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const plusDays = (n: number) => new Date(Date.now() + n * 86_400_000);
const noonUTC = (k: string) => new Date(`${k}T12:00:00.000Z`);
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

async function runTool(name: string, a: Record<string, unknown>): Promise<unknown> {
  const d = db();
  switch (name) {
    case "resumo_do_dia": {
      const end = plusDays(2);
      const [tks, trx, evs] = await Promise.all([
        d.select({ titulo: tasks.titulo, dueAt: tasks.dueAt, prioridade: tasks.priority }).from(tasks)
          .where(and(sql`${tasks.status} <> 'done'`, lte(tasks.dueAt, noonUTC(todayKey())))).orderBy(asc(tasks.dueAt)).limit(15),
        d.select({ tipo: transactions.tipo, descricao: transactions.descricao, valor: transactions.valor, vencimento: transactions.vencimento }).from(transactions)
          .where(and(eq(transactions.status, "pendente"), lte(transactions.vencimento, end))).orderBy(asc(transactions.vencimento)).limit(15),
        d.select({ titulo: events.title, inicio: events.startTime, local: events.location }).from(events)
          .where(and(sql`${events.startTime} >= now() - interval '2 hours'`, lte(events.startTime, plusDays(1)))).orderBy(asc(events.startTime)).limit(10),
      ]);
      return { hoje: todayKey(), tarefas: tks, contas: trx, agenda: evs };
    }
    case "buscar_clientes": {
      const like = `%${String(a.busca ?? "").trim()}%`;
      return d.select({ id: contacts.id, nome: contacts.name, empresa: contacts.company, telefone: contacts.phone, documento: contacts.document, status: contacts.status })
        .from(contacts)
        .where(or(ilike(contacts.name, like), ilike(contacts.company, like), ilike(contacts.phone, like), ilike(contacts.document, like)))
        .orderBy(desc(contacts.updatedAt)).limit(6);
    }
    case "listar_tarefas": {
      const f = a.filtro ?? "todas";
      const k = todayKey();
      const cond =
        f === "hoje" ? sql`date(${tasks.dueAt}) = ${k}::date`
        : f === "atrasadas" ? lt(tasks.dueAt, noonUTC(k))
        : f === "semana" ? lte(tasks.dueAt, plusDays(7))
        : undefined;
      return d.select({ id: tasks.id, titulo: tasks.titulo, prazo: tasks.dueAt, status: tasks.status, responsavel: tasks.assignee, prioridade: tasks.priority })
        .from(tasks).where(cond ? and(sql`${tasks.status} <> 'done'`, cond) : sql`${tasks.status} <> 'done'`)
        .orderBy(asc(sql`coalesce(${tasks.dueAt}, 'infinity'::timestamptz)`)).limit(20);
    }
    case "listar_projetos":
      return d.select({ id: projects.id, titulo: projects.titulo, status: projects.status, prazo: projects.prazo })
        .from(projects).where(sql`${projects.status} <> 'entregue'`).orderBy(asc(projects.prazo)).limit(20);
    default:
      throw new Error(`Ferramenta desconhecida: ${name}`);
  }
}

/** Executa uma ação de escrita já confirmada. Devolve a frase de confirmação. */
export async function executeAction(p: Pick<PendingAction, "tool" | "args">): Promise<string> {
  const a = p.args;
  const d = db();
  switch (p.tool) {
    case "cadastrar_cliente": {
      const doc = typeof a.documento === "string" && a.documento.trim() ? a.documento.trim() : null;
      if (doc && !documentKind(doc)) return "Esse CPF/CNPJ não confere. Me manda de novo que eu cadastro.";
      const rows = await d.insert(contacts).values({
        name: String(a.nome),
        phone: (a.telefone as string) || null,
        email: (a.email as string)?.toLowerCase() || null,
        company: (a.empresa as string) || null,
        document: doc ? formatDocument(doc) : null,
        kind: doc && documentKind(doc) === "pj" ? "pj" : "pf",
        status: (a.status as "lead" | "client" | "partner") || "lead",
        notes: (a.notas as string) || null,
        source: "assistente",
      }).returning({ id: contacts.id });
      return rows[0] ? `Pronto, ${a.nome} cadastrado. ✅` : "Não consegui cadastrar agora.";
    }
    case "atualizar_cliente": {
      const map: Record<string, string> = { nome: "name", telefone: "phone", email: "email", empresa: "company", status: "status", notas: "notes" };
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const [k, col] of Object.entries(map)) if (a[k] !== undefined) patch[col] = a[k];
      if (typeof a.documento === "string") {
        if (!documentKind(a.documento)) return "Esse CPF/CNPJ não confere. Não alterei nada.";
        patch.document = formatDocument(a.documento);
      }
      await d.update(contacts).set(patch).where(eq(contacts.id, String(a.id)));
      return "Cliente atualizado. ✅";
    }
    case "criar_tarefa":
      await d.insert(tasks).values({
        titulo: String(a.titulo),
        dueAt: isDay(a.prazo) ? noonUTC(a.prazo) : null,
        assignee: (a.responsavel as string) || null,
        priority: a.prioridade === "alta" ? "alta" : "normal",
        contactId: (a.cliente_id as string) || null,
        description: (a.detalhes as string) || null,
      });
      return `Tarefa criada${isDay(a.prazo) ? ` para ${dt(a.prazo)}` : ""}. ✅`;
    case "atualizar_tarefa": {
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (a.status) {
        patch.status = a.status;
        patch.doneAt = a.status === "done" ? new Date() : null;
      }
      if (isDay(a.prazo)) patch.dueAt = noonUTC(a.prazo);
      await d.update(tasks).set(patch).where(eq(tasks.id, String(a.id)));
      return a.status === "done" ? "Tarefa concluída. ✅" : "Tarefa atualizada. ✅";
    }
    case "lancar_financeiro": {
      const valor = Number(a.valor);
      if (!Number.isFinite(valor) || valor <= 0) return "O valor não ficou claro. Me diz de novo?";
      await d.insert(transactions).values({
        tipo: a.tipo === "entrada" ? "entrada" : "saida",
        descricao: String(a.descricao),
        valor: valor.toFixed(2),
        vencimento: isDay(a.data) ? noonUTC(a.data) : noonUTC(todayKey()),
        status: a.pago === false ? "pendente" : "pago",
        scope: a.conta === "pessoal" ? "pessoal" : "empresa",
        categoria: (a.categoria as string) || null,
        recurrence: a.recorrencia === "mensal" || a.recorrencia === "anual" ? a.recorrencia : null,
        paymentMethod: (a.forma as string) || null,
      });
      return `Lançado: ${a.descricao}, ${brl(valor)}. ✅`;
    }
    case "atualizar_projeto":
      await d.update(projects).set({ status: a.status as "novo", updatedAt: new Date() }).where(eq(projects.id, String(a.id)));
      return "Projeto atualizado. ✅";
    case "enviar_mensagem": {
      const c = (await d.select({ phone: contacts.phone, name: contacts.name }).from(contacts).where(eq(contacts.id, String(a.contato_id))).limit(1))[0];
      const phone = onlyDigits(c?.phone ?? "");
      if (phone.length < 10) return `${c?.name ?? "Esse contato"} não tem WhatsApp cadastrado.`;
      await queueWhatsApp(phone.startsWith("55") ? phone : `55${phone}`, String(a.texto), "assistente");
      return `Mensagem enviada para ${c?.name}. ✅`;
    }
    default:
      return "Não sei fazer isso ainda.";
  }
}

/* ───────────────────────── memória e envio ───────────────────────── */

type ChatMsg = { role: "system" | "user" | "assistant" | "tool"; content: string | null; tool_calls?: unknown; tool_call_id?: string };

const K = (o: string) => ({ hist: `kbos:agent:${o}:hist`, pend: `kbos:agent:${o}:pending`, sent: `kbos:agent:sent`, lock: `kbos:agent:lock:` });

async function sendToOwner(owner: string, text: string): Promise<void> {
  const { url, key, instance } = evoConfig();
  const res = await fetch(`${url.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(instance)}`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ number: owner, text: `${AGENT_PREFIX}${text}` }),
    signal: AbortSignal.timeout(15_000),
  });
  const raw = await res.text().catch(() => "");
  let j: { key?: { id?: string } } = {};
  try {
    j = JSON.parse(raw);
  } catch {
    /* corpo não-JSON */
  }
  const id = j.key?.id;
  await logHook({
    event: "agente",
    result: res.ok ? "resposta enviada ao dono" : `falha ao enviar resposta (${res.status})`,
    detail: res.ok ? undefined : raw.slice(0, 160),
  });
  // Marca o que o agente mandou: o eco "fromMe" disso não pode virar comando.
  if (id) await getRedis().set(`${K(owner).sent}:${id}`, "1", "EX", 86_400).catch(() => {});
}

export function ownerPhone(): string | null {
  const p = onlyDigits(process.env.ASSISTANT_OWNER_PHONE || "");
  return p.length >= 12 ? p : null;
}

/** Esta mensagem é um comando do dono para o agente? */
export function isAgentMessage(inb: InboundMessage, owner: string | null, authorized: boolean): boolean {
  if (!owner || !authorized || inb.isGroup || !inb.phoneDigits) return false;
  if (!samePhone(inb.phoneDigits, owner)) return false;
  if ((inb.content || "").startsWith(AGENT_PREFIX.trim())) return false;
  return inb.messageType === "text" || inb.messageType === "audio";
}

/* ───────────────────────── turno ───────────────────────── */

function systemPrompt(): string {
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: TZ, weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  return [
    "Você é o assistente pessoal do Kayque Brito dentro do KBOS, o sistema do estúdio dele (design, vídeo, foto e software em Belém/PA).",
    `Hoje é ${hoje} (data ${todayKey()}, fuso de Belém).`,
    "Fale como ele: português do Brasil, direto, caloroso, sem formalidade e sem cara de robô. Respostas curtas, prontas para WhatsApp (pode usar *negrito*).",
    "Use as ferramentas para agir no sistema. Para qualquer ação que grava algo, chame a ferramenta direto: o sistema pede a confirmação ao Kayque, você não precisa perguntar 'posso?'.",
    "Se faltar uma informação essencial, pergunte só ela, em uma frase. Não invente dados, valores, telefones nem datas.",
    "Antes de atualizar ou mandar mensagem a um cliente, ache o id com buscar_clientes; se vier mais de um, pergunte qual.",
    "Datas sempre em AAAA-MM-DD nas ferramentas. Valores em reais como número (1.500,00 → 1500).",
  ].join(" ");
}

async function llmCall(messages: ChatMsg[]) {
  const llm = llmConfig();
  const res = await fetch(`${llm.url}/chat/completions`, {
    method: "POST",
    headers: { ...(llm.key ? { Authorization: `Bearer ${llm.key}` } : {}), "Content-Type": "application/json" },
    body: JSON.stringify({ model: llm.model, messages, tools: TOOLS, tool_choice: "auto", temperature: 0.3, max_tokens: 600 }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
  const j = (await res.json()) as { choices?: { message?: { content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[] };
  return j.choices?.[0]?.message ?? { content: null };
}

/** Processa uma mensagem do dono. Nunca lança: qualquer erro vira resposta. */
export async function runAgentTurn(inb: InboundMessage): Promise<void> {
  const owner = ownerPhone();
  if (!owner) return;
  if (!(await ensureRedis(1500))) {
    console.error("[KBOS agente] Redis fora do ar");
    return;
  }
  await logHook({ event: "agente", result: "pensando…", detail: inb.messageType });
  const r = getRedis();
  const keys = K(owner);
  if (inb.externalId) {
    if (await r.get(`${keys.sent}:${inb.externalId}`)) return; // eco do próprio agente
    const fresh = await r.set(`${keys.lock}${inb.externalId}`, "1", "EX", 3600, "NX");
    if (!fresh) return; // reentrega do webhook
  }
  try {
    // 1) Texto: digitado ou áudio transcrito.
    let text = (inb.content || "").trim();
    if (inb.messageType === "audio" && inb.externalId) {
      const media = await fetchInboundMedia({ externalId: inb.externalId, chatId: inb.chatId, fromMe: inb.fromMe, messageType: "audio" });
      if (media) {
        const t = await transcribeAudio({ audioBase64: media.bytes.toString("base64"), audioMime: media.mime });
        text = (t.text || "").trim();
      }
      if (!text) return sendToOwner(owner, "Não consegui entender o áudio. Pode mandar de novo ou escrever?");
    }
    if (!text) return;

    // 2) Resposta a um "Confirma?" pendente.
    const pendRaw = await r.get(keys.pend);
    if (pendRaw) {
      const pend = JSON.parse(pendRaw) as PendingAction;
      if (isYes(text)) {
        await r.del(keys.pend);
        const done = await executeAction(pend);
        await remember(owner, text, done);
        return sendToOwner(owner, done);
      }
      if (isNo(text)) {
        await r.del(keys.pend);
        await remember(owner, text, "Cancelado.");
        return sendToOwner(owner, "Beleza, cancelei. 👍");
      }
      await r.del(keys.pend); // mudou de assunto: descarta a pendência
    }

    // 3) Sem cérebro configurado.
    if (!llmConfig().enabled) {
      return sendToOwner(owner, "Ainda não tenho cérebro ligado 😅 Coloca a chave da IA no menu de configuração (opção 1) que eu começo a trabalhar.");
    }

    // 4) Conversa com ferramentas (até 4 voltas).
    const hist = (await r.lrange(keys.hist, 0, -1)).map((s) => JSON.parse(s) as ChatMsg);
    const msgs: ChatMsg[] = [{ role: "system", content: systemPrompt() }, ...hist, { role: "user", content: text }];
    for (let i = 0; i < 4; i++) {
      const m = await llmCall(msgs);
      const calls = m.tool_calls ?? [];
      if (!calls.length) {
        const reply = (m.content || "").trim() || "Feito.";
        await remember(owner, text, reply);
        return sendToOwner(owner, reply);
      }
      msgs.push({ role: "assistant", content: m.content ?? null, tool_calls: calls });
      for (const c of calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(c.function.arguments || "{}");
        } catch {
          /* argumentos inválidos: segue vazio */
        }
        if (WRITE_TOOLS.has(c.function.name)) {
          const pend: PendingAction = { tool: c.function.name, args, at: Date.now() };
          await r.set(keys.pend, JSON.stringify(pend), "EX", 1800);
          const ask = `Vou ${describeAction(pend)}. Confirma? (sim/não)`;
          await remember(owner, text, ask);
          return sendToOwner(owner, ask);
        }
        let out: unknown;
        try {
          out = await runTool(c.function.name, args);
        } catch (e) {
          out = { erro: e instanceof Error ? e.message : "falhou" };
        }
        msgs.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(out).slice(0, 6000) });
      }
    }
    return sendToOwner(owner, "Me enrolei aqui. Pode reformular em uma frase?");
  } catch (e) {
    console.error("[KBOS agente]", e);
    await logHook({ event: "agente", result: "erro no turno", detail: e instanceof Error ? e.message.slice(0, 160) : String(e) });
    await sendToOwner(owner, "Deu um erro do meu lado agora. Tenta de novo em instantes?").catch(() => {});
  }
}

async function remember(owner: string, user: string, assistant: string) {
  const r = getRedis();
  const key = K(owner).hist;
  await r.rpush(key, JSON.stringify({ role: "user", content: user }), JSON.stringify({ role: "assistant", content: assistant }));
  await r.ltrim(key, -HISTORY_MAX, -1);
  await r.expire(key, 3 * 86_400);
}
