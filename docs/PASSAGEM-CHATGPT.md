# Passagem de bastão: Claude → ChatGPT/Codex (20/10/2026, ~02h)

Leia antes: `AGENTS.md` (regras do repo, convivência Claude × Codex) e `docs/HANDOFF.md` (Diário).
Dono: Kayque Brito (sempre "Kayque", com Y). PT-BR, direto, quer qualidade "impecável" e cara de app nativo (skill/gosto: `kbos-design-taste`).
**Nunca peça nem cole tokens, senhas ou chaves no chat. `.env*` nunca vai pro git.**

## 1. Estado atual (tudo já está na `main` e no ar)
- **Importação de contatos** (CRM → botão "Importar"): fontes Google (OAuth), WhatsApp conectado (Evolution) e arquivo `.vcf/.csv`.
  Código: `lib/kbos/contact-import*.ts`, `lib/kbos/google-contacts.ts`, `app/api/admin/contacts/import/{preview,commit,google/start,google/callback}`, UI `components/kbos/ImportContacts.tsx`, `CrmBoard.tsx`, `Client360.tsx` (cabeçalho estilo perfil). Migração `drizzle/0020_contatos_importacao.sql`.
  Regra do número atual: WhatsApp verificado > fonte whatsapp > existente > google/arquivo; os antigos ficam em `former_phones` só para reconhecer a pessoa.
- **Lista do CRM** carrega até 3000 contatos (`/api/contacts?limit=`), antes eram 300 e a importação do WhatsApp escondia os clientes.
- Deploy da VPS estava travado por tipo de rota; corrigido. Contagem atual no CRM: ~1903 contatos (1896 leads, 7 clientes, 14 arquivados).

## 2. PENDENTE A: importar do Google ainda não foi confirmado
Configuração no Google Cloud (projeto `crm-site-kayque`, cliente OAuth "KBOS — Login de clientes"): People API ativada, escopo `contacts.readonly` no "Acesso a dados", URIs de redirecionamento `https://kbos.kayquebrito.com.br/api/auth/google/callback/` e `.../api/admin/contacts/import/google/callback/`, app em modo **Testando** com testador `kayquebrito21@gmail.com`. Dois secrets ativos (ver Google Cloud; não registrar aqui).
Sintoma: "O Google recusou a conexão". O log (`[contacts-import] token do Google recusado: 401 invalid_client … client secret is invalid`) provou que o container recebia um secret ERRADO, embora o `.env` estivesse certo.
**Causa provável (já corrigida, falta o Kayque testar):** o terminal da VPS tinha o `.env` carregado com `set -a; . ./.env` (variáveis exportadas no shell), e o `docker compose` dá prioridade às variáveis do shell sobre o `--env-file`. O container foi recriado às ~02h de um shell limpo. **Próximo passo:** pedir ao Kayque para tentar de novo (CRM → Importar → Google Contatos → Avançado → continuar); se falhar, ler o log (comando abaixo).
Se funcionar: conferir prévia, duplicatas e a regra do número atual com contatos reais.

## 3. PENDENTE B: login com `contato@kayquebrito.com.br` não entra
O Google Cloud recusa adicionar esse e-mail como testador: "precisa estar associado a uma Conta Google ativa, Workspace ou Cloud Identity". Ou seja, não é conta Google. Opções: (a) o Kayque cria uma Conta Google usando esse e-mail (cadastro com e-mail existente) e então adicionamos como testador; (b) usar o login por código no WhatsApp/e-mail que já existe; (c) publicar o app OAuth (exige verificação do Google por causa do escopo de contatos). Não crie contas por ele.

## 4. PENDENTE C: contato "Caio" aparece só com número
O Kayque relatou que o Caio aparece sem nome, só com o número salvo. Há "Caio Leonel · Açaí Norte Mix" (cliente) e "Caio Pere…" (lead vindo do WhatsApp, só número). A importação do WhatsApp usa `pushName` do Evolution (`listWhatsappContacts` em `lib/kbos/evolution.ts`), que vem vazio para muita gente; nesses casos o contato é criado com o próprio número como nome. Investigar: (1) de onde veio o nome vazio (webhook `app/api/webhooks/evolution` e `lib/kbos/inbox.ts` também criam contatos); (2) usar `verifiedName`/nome do contato salvo se o Evolution expuser; (3) ao importar do Google, o nome do Google deve SUBSTITUIR um "nome" que seja só o número (hoje `planImport` só completa campos vazios, confira em `contact-import.ts` se o nome-número conta como vazio); (4) considerar um botão "completar nomes a partir do Google" para os já importados.

## 5. Dívida da importação do WhatsApp
1896 leads vieram do WhatsApp de uma vez, a maioria sem nome. Sugestão: filtro/visão "sem nome", ação em lote para arquivar e opção de importar só quem já conversou. NÃO apague nada sem o OK do Kayque.

## 6. Próximos pedidos aprovados (ordem sugerida)
1. Portal privado do cliente (perfil moderno com capa/foto, projetos, tarefas, faturas, notificações) + chat privado/grupo com a equipe do projeto (novas tabelas threads/membros/mensagens). Perfil público e conversas entre usuários = fase 2.
2. Notificação push (explicar a limitação do PWA no iPhone).
3. Assistente do KBOS usando o Lume (acervo de fotos/vídeos).
4. Importador de extrato PicPay (CSV/OFX, categorização por IA, dedupe, marcador "pessoal").
5. App do celular usar o mesmo "cérebro" do agente do WhatsApp (`lib/kbos/agent.ts`, área sensível; só com WhatsApp estável).
6. Apontar o Lume para a pasta própria no Drive (`LUME_DRIVE_PASTA`) quando o SSD terminar de subir; rotacionar `LUME_API_TOKEN`; conferir `RESEND_API_KEY`; testar o acesso da Thalita; rota de saúde para UptimeRobot.

## 7. Como operar a VPS (179.236.67.19, `/opt/kbos`) sem tropeçar
- Acesso: hPanel Hostinger → VPS KBOS → "Web console" (terminal no navegador). Não há SSH daqui.
- **Nunca faça `. ./.env` / `source .env`**: linhas com valores sem aspas executam como comando e imprimem chaves na tela (já aconteceu uma vez com uma chave da OpenAI; vale o Kayque trocá-la). Para ler uma variável: `grep -m1 '^NOME=' .env | cut -d= -f2-` e imprima só o tamanho.
- Nunca exporte variáveis no shell antes de rodar `docker compose`/`deploy.sh` (o shell vence o `.env`).
- Deploy: cron `*/3 * * * * /opt/kbos/deploy.sh --auto` (a linha está triplicada no crontab, inofensivo por causa do lock; vale limpar). Forçar: `cd /opt/kbos && ./deploy.sh`. Leva ~3–4 min; o site dá 502 breve.
- Se o deploy não anda: `grep -a "#13 " /var/log/kbos-deploy.log | grep -a -i error`. O `next build` da VPS valida tipos de rota (`.next/types/validator.ts`) que o CI NÃO pega (ex.: rota que devolve `Response | null`). Padrão correto: `if (denied) return denied; if (!user) return 401`.
- Reiniciar só o web com o `.env` atual: `docker compose --env-file .env -f infra/docker-compose.yml --profile evolution up -d web`.
- Log do importador: `docker compose --env-file .env -f infra/docker-compose.yml logs web --since 40m 2>&1 | grep -a contacts-import | tail`.
- Segredo novo no `.env` sem aparecer no chat: `read -s -p "Cole: " S && printf "\nNOME=%s\n" "$S" >> .env` (o Kayque cola; nunca você).

## 8. Convenções do repo
Branch por tarefa (`codex/<assunto>`), CI verde (tsc, eslint, vitest), rebase em `origin/main`, push em `main`, linha no Diário do `docs/HANDOFF.md`. ESLint do React 19 tem a regra `react-hooks/set-state-in-effect` (use `// eslint-disable-next-line … -- motivo` quando o setState no effect for intencional). Next.js 16 com mudanças: leia `node_modules/next/dist/docs/` antes de mexer em API/rota.
Áreas sensíveis (só com testes): `lib/kbos/agent.ts`, `lib/kbos/inbox.ts`, `app/api/webhooks/evolution`, `lib/kbos/migrations.ts`, `infra/docker-compose.yml`, `deploy.sh`. Não mexer em cobrança.
Paleta: fundo `#11101E`, tinta `#EDE6EC`, acentos `#4F12C7 → #E80EFD` (rosa só no fim de degradê); componentes `kb-*`; vidro só sobre fundo abstrato.
