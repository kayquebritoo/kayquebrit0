# KBOS — passagem de bastão (estado em 18/out/2026)

Leia isto antes de mexer. Vale para qualquer IA (Claude, ChatGPT/Codex, Gemini).
Fale com o Kayque (com Y) em PT-BR, direto e humano, sem cara de robô. Ele
usa ditado por voz: interprete pelo contexto.

## O que é
KBOS = sistema único do estúdio Kayque Brito (Belém/PA): CRM, inbox de
WhatsApp, orçamentos/contratos em PDF, projetos e tarefas, financeiro
(empresa × pessoal), agenda, cursos, portal do cliente e um agente pessoal
no WhatsApp. Produção: https://kbos.kayquebrito.com.br (painel em /admin).

## Stack
Next.js 16 (App Router, `trailingSlash: true`, `proxy.ts`), React 19,
Tailwind v4, Drizzle + Neon Postgres, Zod 4, BullMQ/Redis, @react-pdf.
Docker Compose na VPS (2 vCPU, 8 GB): web, worker, redis, db, evolution
(Evolution API v2.3.7 = WhatsApp), evo-db, whisper (transcrição local, perfil `voz`).

## Como publicar (NÃO pule)
1. Branch → push → CI (`.github/workflows/ci.yml`: tsc, eslint, vitest).
2. CI verde → merge fast-forward em `main` → push.
3. A VPS publica sozinha (cron `deploy.sh --auto`, ~3–15 min). Confira o
   commit em `/api/health` (campo `commit`).
- Na VPS, para forçar: `cd /opt/kbos && ./deploy.sh`. **Não use `git pull`
  na VPS** para publicar (só baixa código, não reconstrói).
- O workflow "Deploy VPS" do GitHub falha por falta de segredos: ignore.
- Segredos só no `/opt/kbos/.env`, editado pelo menu
  `bash /opt/kbos/scripts/kbos-config.sh`. Nunca commitar `.env*`, nunca
  pedir chave/senha no chat.

## Banco
Migrações idempotentes em `lib/kbos/migrations.ts`, aplicadas no boot
(`instrumentation.ts`) e em `POST /api/admin/migrate`. Espelho SQL em
`drizzle/00NN_*.sql` + `drizzle/meta/_journal.json`. Coluna nova = adicionar
nos três (migrations.ts, schema.ts, SQL).

## Pegadinhas já resolvidas (não desfaça)
- Evolution v2 lê `CACHE_REDIS_*` (com `REDIS_URI` as mensagens não chegam).
- Webhook interno `http://web:3000/api/webhooks/evolution/` (barra final!),
  com `?token=` quando `EVOLUTION_WEBHOOK_TOKEN` existe; o boot reaplica.
- Mídia do WhatsApp é criptografada: servir pelo proxy
  `/api/conversations/[id]/messages/[msgId]/media/` (getBase64FromMediaMessage).
- Grupo = conversa própria (`is_group`, `title`), nunca cria contato.
- Dinheiro aceita formato BR ("1.234,56") via `normalizeMoney`.
- Datas de prazo gravadas ao meio-dia UTC (não "voltam um dia" em Belém).
- Modo claro depende de classes literais (`bg-[#11101E]` etc.) — ao trocar
  uma cor literal, atualize o seletor `html.light` em `app/globals.css`.
- Animações com `fill-mode: backwards` (com `both`, modais `fixed` ficam presos).

## Regras de negócio
- Plano mensal: pré-pago por mês, vigência (ex.: 5 meses), sem multa
  rescisória, sem 50/50 nem desconto à vista.
- Avulso (ex.: branding): à vista com desconto ou 50% início / 50% entrega.
- Contrato + aceite do Manual de Identidade obrigatórios antes de começar.
- PDF de orçamento sempre em 2 páginas (`lib/kbos/pdf-generator.tsx`).

## Design (padrão para todas as telas)
Fundo `#11101E`, vidro, acento BluePurple `#4F12C7`; rosa `#E80EFD` só no
fim de degradê / um destaque por tela. Mobile-first, toque 48 px, inputs
16 px. Use as classes `kb-*` de `app/globals.css` (kb-glass, kb-row, kb-seg,
kb-field/kb-control, kb-modal-back/kb-modal, kb-btn, kb-tag, kb-chip).
Telas já no padrão: Hoje, Financeiro, Contatos, Tarefas. As demais ainda
usam `text-white/…` (antigo) e precisam migrar. Regras completas no doc
"KBOS — Benchmark de CRM, ERP e gestão de projetos" (seção Padrão de interface).

## Estado agora
Feito e no ar: inbox com grupos/mídia; CRM com CPF/CNPJ (+ busca na
Receita); financeiro mobile com recorrência; tarefas com prazo no quadro do
Hoje; PDF com degradê; menu de configuração; agente no WhatsApp
(`lib/kbos/agent.ts`).

**Pendente imediato — ligar o agente:**
1. Na VPS: `cd /opt/kbos && ./deploy.sh` (publica `1a34afc` ou mais novo).
2. `bash scripts/kbos-config.sh` → 1 (colar chave OpenAI; deve aparecer
   "Chave recebida …xxxx") → 6 (protege o webhook) → 0.
3. Testar no WhatsApp, conversa "Você": "o que tenho hoje?".
4. Diagnóstico: `GET /api/ai/assistant` (bloco `agent`) e
   `GET /api/admin/whatsapp/?log=1` (diário do webhook).

## Próximas fases (ordem aprovada)
2. Venda conectada: link de aceite do orçamento; aceite gera projeto (modelo
   por serviço), cobranças e datas na agenda; funil automático; lembrete de
   cobrança no WhatsApp (2 dias antes e no dia).
3. Ficha do cliente (painel lateral, linha do tempo, próxima ação,
   etiquetas) + busca global ⌘K.
4. Agente: voz própria via VoiceStudio no Mac (API compatível OpenAI em
   `/v1/audio/speech`, configurar `TTS_BASE_URL`).
5. Rentabilidade por projeto, visões lista/kanban/calendário, agendamento.
6. Migrar as telas restantes ao padrão, "+" central, notificações push.

## Contexto pessoal
Segundo cérebro no Obsidian: `Documents/Obsidian Vault` (CONTEXTO-IA,
Voz-e-Tom, Marca, Servicos, KBOS - Visao, logs em `20-Projetos/KBOS/log/`).
