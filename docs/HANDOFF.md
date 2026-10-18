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
**Princípio nº 1 (pedido do Kayque): o KBOS tem que parecer app nativo, nunca "site".** Rápido, transições e microinterações em tudo, waveforms e animações futuristas discretas, sem barra de navegador (testar sempre instalado na tela inicial a partir de kbos.kayquebrito.com.br).
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

**Agente validado em 18/out/2026:** chave OpenAI carregada, webhook protegido
e conversa “Você” testada com “o que tenho hoje?”. O dono confirmou a
resposta no WhatsApp. Após ativar a opção 6, foi necessário sincronizar a
escuta em `GET /api/admin/whatsapp/?repair=1`: a Evolution ainda usava a
configuração anterior e recebia 401. O diário confirmou comando recebido,
processamento e resposta enviada.

Diagnóstico: `GET /api/ai/assistant` (bloco `agent`) e
`GET /api/admin/whatsapp/?log=1` (diário do webhook).

## Acesso e segundo cérebro (18/out)
- Login mobile no padrão: usuário/e-mail e senha; alias admin `kayque`; código
  pelo WhatsApp/e-mail cadastrado para login e recuperação. Migração 0015.
  Google implementado, condicionado às credenciais OAuth. Operação e pendências:
  `docs/LOGIN-SIMPLES.md`. Não trocar credenciais do dono para testar.
- Marca: copy em primeira pessoa revisada contra o PDF original LDP e
  `Voz-e-Tom.md`, preservando o layout autoral. `docs/REVISAO-MARCA-LDP.md`.
- Segundo cérebro: estudo em `docs/SEGUNDO-CEREBRO.md`. Recomenda Sync +
  headless e exportador determinístico KBOS → notas. Não instalado/ativado;
  falta escolher sincronização e medir VPS (SSH expirou nesta sessão).

## Próximas fases (ordem aprovada)
2. Venda conectada implementada: link de aceite no painel de Orçamentos;
   aceite gera projeto (modelo por serviço), cobranças e datas na agenda;
   funil automático; lembrete de cobrança no WhatsApp (2 dias antes e no
   dia). Uso e validação: `docs/VENDA-CONECTADA.md`. Migração 0012 automática
   no boot. Anexos enviados do dispositivo e links externos (migração 0013);
   duração mensal calcula o término automaticamente (01/11 + 5 meses = 01/04).
   Testes com PostgreSQL descartável (PGlite, só desenvolvimento).
   Extensão: dados da empresa, logo e paleta editáveis no aceite; assinatura
   cria planejamento em preparação. Editor de marca/estratégia, publicação
   versionada e aprovação/pedido de ajustes em página mobile-first. Migração
   0014 automática. Uso: `docs/MARCA-E-PLANEJAMENTO.md`. Demonstração em
   `/admin/planejamentos/preview/`. Estratégia é revisada no editor antes de publicar.
3. Ficha do cliente (painel lateral, linha do tempo, próxima ação,
   etiquetas) + busca global ⌘K.
4. Agente: voz própria via VoiceStudio no Mac (API compatível OpenAI em
   `/v1/audio/speech`, configurar `TTS_BASE_URL`).
5. Rentabilidade por projeto, visões lista/kanban/calendário, agendamento.
6. Migrar as telas restantes ao padrão, "+" central, notificações push.

## Contexto pessoal
Segundo cérebro no Obsidian: `Documents/Obsidian Vault` (CONTEXTO-IA,
Voz-e-Tom, Marca, Servicos, KBOS - Visao, logs em `20-Projetos/KBOS/log/`).

## Diário (mais recente em cima)

- 2026-10-18 · Claude · Fase 5 (parte 2): `lib/kbos/relationship.ts` — follow-up de orçamento `sent` sem resposta (3-7 e 10-14 dias da criação) e pedido de depoimento/autorização de portfólio 2-7 dias após `entregue` (sem case do contato); textos aprovados. Roda dentro do job `billing.reminders` (5 em 5 min), com guardas no `handleNotifyWhatsapp` (orçamento ainda `sent`, projeto ainda `entregue`). Lembrete pré-vencimento agora também respeita seg-sáb 9h-19h (Belém) no worker. Falta: renovação de plano mensal (depende de modelar plano), tela para ver quem saiu das campanhas.

- 2026-10-18 · Claude · Fase 5 (parte 1): campanhas com descadastro (`lib/kbos/optout.ts`: SAIR/PARAR/STOP em mensagem inteira → `contacts.marketing_opt_out_at`, migração 0018 + SCHEMA_STEP), rodapé automático e teto diário `CAMPAIGN_DAILY_CAP` (padrão 80). Gancho de 1 linha no webhook da Evolution. Falta: follow-up de orçamento, pedido de depoimento/portfólio pós-entrega e renovação de plano mensal (aguardam textos aprovados); lembrete pré-vencimento sem janela 9h-19h.

- 2026-10-18 · Claude · Escada de cobrança pós-vencimento (`lib/kbos/billing-ladder.ts`): 1 dia gentil, 5 firme, 12 último aviso, textos aprovados pelo Kayque. Roda dentro do job `billing.reminders` (mesmo outbox/guarda do `handleNotifyWhatsapp`), só vendas aceitas com telefone, seg-sáb 9h-19h Belém. Falta: lembrete antes do vencimento ainda dispara à meia-noite (sem janela) e o resumo da manhã é outro mecanismo; unificar.

- 2026-10-18 · Claude · Fase 4: `/admin/relatorios` (resultado do mês por carteira/categoria/frente, lucro por projeto e R$/hora, previsão de caixa 30/60/90, teto do MEI R$ 81 mil). Lógica pura em `lib/kbos/reports.ts`, API `GET /api/admin/reports`. Data de referência = vencimento (não há data de pagamento no schema). Falta: ladder de cobrança pós-vencimento.

- 2026-10-18 · Claude · Fase 3: ficha 360° do cliente (CRM: clique na linha abre linha do tempo + resumo; API `GET /api/admin/contacts/[id]/360`, regras puras em `lib/kbos/client360.ts`) e lista única de serviços por frente (`lib/kbos/fronts.ts`, tag no Kanban de projetos). Falta: frente em transações/relatórios (fase 4), ladder de cobrança pós-vencimento (aguarda textos aprovados).
- 2026-10-18 · Claude · fase 2: cases com autorização do cliente. Tabelas `kbos_showcases` e `kbos_showcase_consents` (migração 0017), regras puras em `lib/kbos/showcase-model.ts` (trava de publicação no servidor: sem autorização válida não publica; mudou o conteúdo = pedir de novo; revogou = sai do ar), tela `/admin/cases`, página do cliente `/autorizacao/[token]`, APIs `/api/admin/cases*` e `/api/consent/[token]`. O site (/trabalho, detalhe, sitemap, /briefing) lê `listPublicCases()`: cases do banco + os antigos de `lib/data.ts` (uma linha no banco com o mesmo slug substitui o antigo). Capa/galeria por link (sem upload ainda). Falta: upload de imagens no case, cadastrar Embratur e Inexo Verde (aguarda material), botão "criar case" a partir do projeto entregue, ficha 360° e lista única de serviços (fase 3).
- 2026-10-18 · Claude · fase 1 de correções: caixa da tela Hoje com seletor Empresa/Pessoal/Tudo (alertas seguem mostrando as duas; conta pessoal vem marcada), briefing matinal separa totais por carteira, projeto manual com prazo + contato do CRM + aviso de e-mail sem conta de portal, PATCH de projeto troca categoria/contato e dá 409 em slug repetido. Plano completo no doc "KBOS — Análise do sistema". Falta: cobrança pós-vencimento (aguarda texto aprovado), cases com aceite do cliente, ficha 360°.
- 2026-10-18 · Claude · copy/posicionamento (Imagem, Marca e Código; frase do hero; metas) + catálogo editável de serviços: tabela `kbos_services` (migração 0016, padrão em `lib/kbos/briefing-forms.ts`), tela `/admin/servicos`, APIs `/api/services` e `/api/admin/services`; site (/briefing) revalida em 60 s e o seletor de orçamentos puxa valor e itens. Prazo vem vazio (preencha no admin). Falta: cases Embratur e Inexo Verde (aguardando fotos/textos), restilizar Inbox/Orçamentos/Projetos/Agenda/Cursos/Campanhas.
- 2026-10-18 · Claude · acabamento app nativo: hero mobile (degradê roxo, ondas visíveis, respiro), ícones sociais 38px (`.soc-row/.soc-btn`), menu com vidro roxo, rosa removido das páginas públicas (`.kb-em`, `PageBackdrop`), KBOS com `kb-page`/`kb-stagger` (entrada escalonada), Shell sem piscar (usuário em cache), toque com escala, Hoje com `Charts.tsx` (CountUp, Ring, AnimatedLine, Bars), anti-zoom (`NativeFeel`, inputs 16px). Falta: migrar telas antigas (`text-white/…`) ao padrão kb-*, conferir visualmente no iPhone instalado.
- 2026-10-18 · Claude · voz clonada 24 h via Fish Audio (TTS_PROVIDER=fish, menu opção 8; cai na voz OpenAI se falhar). Manifesto PWA por domínio (kbos.* abre /entrar → painel). Instalar o app SEMPRE a partir de kbos.kayquebrito.com.br: abrir o outro domínio dentro do app mostra a barra do Safari.
- 2026-10-18 · Claude · agente só atende com “Fala Kayque” (sessão de 5 min; ASSISTANT_TRIGGER) e fala no tom do Kayque. Falta: voz clonada (VoiceStudio no Mac via Tailscale → TTS_BASE_URL/TTS_API_KEY/TTS_VOICE).
- 2026-10-18 · Claude · agente responde em áudio quando você fala por áudio (voz da OpenAI; voz própria via `TTS_BASE_URL` = VoiceStudio); regras de convivência no AGENTS.md.
