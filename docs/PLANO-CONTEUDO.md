# KBOS Conteúdo — plano para tirar a mLabs da operação

> Documento vivo. Cada fase termina com: o que foi feito, como testar, o que falta. Atualize ao fechar uma etapa
> e registre uma linha no Diário do `HANDOFF.md`.

## Objetivo
O KBOS faz sozinho o que hoje depende da mLabs: calendário editorial, aprovação pelo cliente, publicação em várias
redes, relatórios e comparativo com concorrentes. Começa pelo Grupo VIP e serve para qualquer cliente recorrente.

Papéis: **Thalita (gerente de marketing do Grupo VIP)** planeja, roteiriza, escolhe os takes e aprova. **Kayque e a
equipe** captam, editam, publicam. O cliente titular acompanha e paga.

## Auditoria (25/out/2026, pelo código; banco de produção ainda não lido)
| Módulo | Onde | Estado encontrado |
|---|---|---|
| Projetos | `kbos_projects`, `app/admin/projetos` | Status em pipeline (novo→entregue), prazo único. Sem recorrência, sem ciclo mensal, sem hierarquia. Kanban marcava "Atrasado" por prazo, inclusive contrato mensal. |
| Calendário | `kbos_social_posts`, `components/kbos/ContentBoard.tsx` | 1 linha por conteúdo, `networks` (lista), status `roteiro→postado/erro`, `brand` (Hotel/Lounge/Praça), import ICS, espelho mLabs **somente leitura** (`lib/kbos/mlabs.ts`), conciliação de duplicados que só sinaliza (`social-reconciliation.ts`). |
| Duplicidade por rede | `mlabs.ts → groupSchedules` | A mLabs cria um agendamento por rede; o KBOS já agrupa por perfil+legenda+horário em **um** post (`networks` = redes). ICS antigo podia trazer cópias (`copies`). Nada é mesclado por título semelhante. |
| Grupo VIP | 1 projeto com as 3 marcas no campo `brand` | Não existem os projetos Hotel/Restaurante/Lounge. Financeiro e contrato ligados a esse projeto. |
| Portal | `components/kbos/PortalPosts.tsx` | Cliente via só a partir de "aguardando aprovação"; criava roteiro. Membro (acesso compartilhado) = mesma visão. |
| Lume | servidor próprio (`infra/lume/server`) | Cliente abre só a pasta da empresa (cookie `lume_c`). Não havia seleção de takes para um post. |
| Financeiro | `kbos_transactions` | **Não alterado** (regra da missão). |

Pendente de auditoria em produção (precisa da sua autorização para leitura no banco, ou rode no painel):
contagem real por marca/mês/status, posts sem marca, posts com mais de uma rede, projetos atuais.
O painel já mostra isso sem gravar nada: **Projetos → Grupo VIP → "Separar por operação"** (só leitura até você confirmar)
e **Conteúdo → Revisar duplicidades** (já existia).

## Decisões de arquitetura (aprovadas na missão)
- **Cliente → Projeto → Ciclo mensal → Conteúdo → Publicação por rede.**
- Cliente principal = projeto pai (`projects.parent_id = null`), que guarda contrato e financeiro. Operações = filhos
  (`parent_id` → pai), cada uma com calendário, responsáveis e indicadores. Um nível só.
- Recorrente (`projects.recurring`, ou categoria `social`) nunca fica "atrasado" por prazo; cada mês é um ciclo em
  `kbos_project_cycles`. Fechar o mês guarda o retrato dos números e **não encerra o projeto**; não se cria projeto por mês.
- **Unidade de entrega = conteúdo.** Cada rede tem o próprio status em `kbos_post_publications`
  (pendente/agendado/publicado/erro/cancelado). A fase geral é derivada em `lib/kbos/content-model.ts → contentState`:
  só é "Publicado" quando todas as redes ativas saíram; parcial fica "Agendado" com `partial`. O post vira `postado`
  sozinho quando a última rede sai (e volta a `agendado` se uma rede reabrir).
- Fases exibidas: Planejado · Em produção · Aguardando aprovação · Aprovado · Agendado · Publicado · Cancelado
  (mapa dos status antigos em `BY_STATUS`). `cancelado` não conta no plano nem nos atrasados.
- Acesso ao principal vale para as operações dele (titular e membros). Gestão (`project_members.access = 'gestao'`)
  no principal também vale para as operações.

## Fases
### Fase 1 — Base de dados e gestão de conteúdo ✅ (branch `claude/conteudo-plataforma`, aguardando sua aprovação para publicar)
- Migração `drizzle/0028_conteudo_ciclos.sql` + passos `conteudo.ciclos.*` em `migrations.ts`. **Só acrescenta**
  colunas/tabelas com padrão; nenhum registro existente é alterado.
- Gestão de conteúdo no portal: membro com nível "Gestão de conteúdo" vê o calendário inteiro (com roteiro, responsáveis,
  takes), cria conteúdo com redes e legenda, edita data/título/formato/empresa/roteiro/legenda/redes de qualquer post do
  projeto, cancela e reativa. Produção e publicação continuam com a equipe. Quem só acompanha segue como antes.
  Rotas: `PATCH /api/portal/posts/:id`, `POST /api/portal/posts` (redes/legenda), nível em `PATCH /api/admin/projects/:id/members`.
- Takes do Lume: `GET /api/portal/lume/takes` busca no Lume **como o cliente** (cookie `lume_c` assinado pelo KBOS,
  o próprio Lume força a pasta da empresa), miniaturas por `GET /api/portal/lume/thumb/:id`, escolha salva em
  `social_posts.takes` (`PUT /api/portal/posts/:id/takes`). A equipe vê os takes no editor do post e abre cada um no Lume.
- Publicações por rede: `GET/PUT/PATCH /api/admin/social/:id/publications`; editor do post (admin) com status e link por rede.
- Ciclo mensal: `GET/POST /api/admin/projects/:id/cycle` (indicadores, fechar/reabrir), card no painel do projeto;
  relatório do mês no portal (`GET /api/portal/report`). Indicadores: previstos, produzidos, aprovados, publicados,
  pendentes, atrasados, cancelados, publicações feitas/total, % de cumprimento (sobre o plano, se houver), por operação,
  por marca e por responsável.
- Kanban: selo "Recorrente" no lugar do prazo, barra "mês" (publicados/previstos) separada da barra de tarefas,
  operação mostra o principal acima do título.
- Separação do Grupo VIP por operação, **reversível**: `GET /api/admin/social/split` (só leitura), `POST` com
  `confirm: "SEPARAR"` e o nome de cada operação, `DELETE ?moveId=` desfaz. Registro em `kbos_data_moves`.
- Testes: `lib/kbos/__tests__/content-cycle.test.ts` (fase derivada, 1 conteúdo = 1 entrega, ciclos, consolidado,
  gestão no portal, takes, separação e desfazer, cookie do Lume no formato do Python).

### Fase 2 — Migrar o Grupo VIP (precisa da sua aprovação)
1. Publicar a Fase 1 (merge em `main` → deploy automático; a migração 0028 roda no boot).
2. No painel, abrir Grupo VIP → Separar por operação → conferir o plano (posts por empresa e meses).
3. Mapa confirmado pelo Kayque (25/out): o restaurante é do Hotel (fica dentro da operação Hotel); não há operação
   "Restaurante". Operações: **Hotel → Hotel Atalaia VIP**, **Lounge → Atalaia VIP Lounge** (receptivo de praia do hotel),
   **Praça → Praça de Alimentação Atalaia VIP**. Conferir o plano no painel antes de aplicar.
4. Dar à Thalita o nível "Gestão de conteúdo" no Grupo VIP (vale para as 3 operações).
5. Definir posts por mês de cada operação (campo "Posts por mês no plano").
6. Rollback: botão "Desfazer separação" (devolve os posts e apaga só operações criadas que ficaram vazias).
   Backup antes: snapshot/branch do Neon (Console → Branches) ou `pg_dump` de `kbos_social_posts` e `kbos_projects`.

### Fase 3 — Publicar nas redes pelo KBOS (substitui o agendador da mLabs)
- Instagram e Facebook: Meta Graph API (Content Publishing: imagem, carrossel, Reels; Páginas do Facebook). Exige app
  Meta com revisão (`instagram_content_publish`, `pages_manage_posts`), contas Business e token de longa duração.
- TikTok: Content Posting API (exige app aprovado; "direct post" depois de auditoria).
- YouTube Shorts: YouTube Data API (upload), cota diária.
- LinkedIn (opcional): Posts API.
- Fila BullMQ que já existe (`worker/`): job `social.publish` por **publicação** (por rede), com nova tentativa,
  e o status volta para `kbos_post_publications` (o post vira "postado" sozinho pela regra da Fase 1).
- Mídia: arquivo final do Drive/Lume baixado no worker; legenda por rede (opcional), primeiro comentário, horário.
- Segredos só no `/opt/kbos/.env` pelo menu de configuração. **Precisa de você:** criar os apps (Meta, TikTok, Google)
  e autorizar as contas do Grupo VIP.

### Fase 4 — Relatórios para o cliente
- Métricas por publicação (alcance, impressões, curtidas, comentários, salvamentos, compartilhamentos, views de Reels)
  via Insights das APIs, coletadas diariamente pelo worker → tabela `kbos_post_metrics`.
- Relatório mensal: entregas do ciclo (Fase 1) + desempenho + melhores posts, no portal e em PDF (padrão visual KBOS),
  enviado ao fechar o mês.

### Fase 5 — Comparativo com concorrentes
- Instagram Business Discovery (Graph API) lê seguidores, posts e engajamento públicos de contas Business/Creator
  concorrentes. Cadastro de concorrentes por operação, coleta semanal, gráfico de evolução e ranking no relatório.

### Fase 6 — Desligar a mLabs
- Quando Fases 3–5 rodarem um ciclo inteiro em paralelo sem divergência: parar o espelho (`MLABS_MCP_TOKEN` vazio),
  manter os dados importados (chaves `mlabs:` preservadas), cancelar a assinatura.

## Rollback da Fase 1
O código pode voltar com `git revert` do merge. As colunas e tabelas novas são inertes para o código antigo.
Para remover de vez (só se necessário, depois de backup):
```sql
DROP TABLE IF EXISTS kbos_post_publications, kbos_project_cycles, kbos_data_moves;
ALTER TABLE kbos_social_posts DROP COLUMN IF EXISTS takes;
ALTER TABLE kbos_projects DROP COLUMN IF EXISTS recurring, DROP COLUMN IF EXISTS parent_id;
ALTER TABLE kbos_project_members DROP COLUMN IF EXISTS access;
```
(Status `cancelado` é texto: posts cancelados voltam a `roteiro` com `UPDATE kbos_social_posts SET status='roteiro' WHERE status='cancelado'`.)

## Limites respeitados
Sem mudança em credenciais, DNS, permissões de servidor, infraestrutura, financeiro ou Obsidian. Nenhum registro
existente alterado. Nada publicado em produção sem sua aprovação.
