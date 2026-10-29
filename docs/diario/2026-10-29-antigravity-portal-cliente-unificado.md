# 2026-10-29 · Antigravity/Gemini · Portal do cliente unificado + etapas em cores sólidas + redes sociais conectadas

## O que mudou

1. **Interface única para administrador e cliente (`components/kbos/ContentBoard.tsx` e `components/kbos/PortalPosts.tsx`)**:
   - Extraídos e exportados de `components/kbos/ContentBoard.tsx` os componentes reais do calendário editorial administrativo: `SharedCalendarGrid`, `STATUS`, `STEPS`, `STEP_LABEL`, `BrandLogo`, `OpenPost`, `StateIcon`, `StatusTag`, `Stepper`, `buildMonthCells`, `meta`, `FORMAT`, `FORMAT_SHORT`, `BELEM`, `dayKey`, `dayLabel` e `hhmm`.
   - `PortalPosts.tsx` consome diretamente esses componentes compartilhados:
     - Alternância `Calendário | Lista` (`kb-seg`) e seletor de projeto quando o cliente tem acesso a mais de um projeto.
     - Barra de filtro por etapa (`STATUS`) com bolinhas em cores sólidas e contadores por etapa.
     - Barra de filtro por empresa com `BrandLogo` e contadores por empresa.
     - `SharedCalendarGrid` idêntico ao administrativo: cartões ricos no desktop (borda lateral na cor da marca/etapa, `BrandLogo`, `StateIcon` sólido, formato curto, título, link do post publicado e botão `+N mais` / `mostrar menos` dentro da célula) e ícones compactos no mobile com rolagem suave até a lista do dia.
     - `Stepper` em cores sólidas dentro do modal de conteúdo (`ContentEditor`) + bloco `PortalPublications` exibindo o status independente por rede (`kbos_post_publications`) mantendo a contagem única por conteúdo produzido (`1 conteúdo = 1 entrega`).

2. **Identificação visual em cores sólidas sem degradê (`lib/kbos/constants.ts`, `components/kbos/PortalContent.tsx`, `app/admin/projetos/ProjectPanel.tsx`, `app/admin/projetos/KanbanBoard.tsx`, `components/kbos/portal-preview/PortalPreview.tsx`)**:
   - Definidas cores sólidas distintas em `PIPELINE` (`novo: "#9a93a8"`, `briefing: "#4DA3FF"`, `producao: "#8a6cf0"`, `revisao: "#f5c46e"`, `aprovado: "#2dd4bf"`, `entregue: "#22c55e"`) e `POST_STAGES` (`roteiro: "#9a93a8"`, `captacao: "#4DA3FF"`, `edicao: "#8a6cf0"`, `aprovacao: "#f5c46e"`, `aprovado: "#2dd4bf"`, `agendado: "#38bdf8"`, `postado: "#22c55e"`, `erro: "#ef4444"`, `cancelado: "#64748b"`).
   - Removido o degradê `bg-gradient-to-r from-[#4F12C7] to-[#E80EFD]` das barras de etapas de projeto (`PIPELINE`), barra de tarefas e barra de cota mensal no portal e no preview, aplicando as cores sólidas correspondentes e adicionando indicadores sólidos também em `ProjectPanel.tsx` e `KanbanBoard.tsx`.

3. **Cliente conecta suas próprias redes sociais (`components/kbos/social/SocialConnectPanel.tsx`, `lib/kbos/social/routes.ts`, `lib/kbos/social/connections.ts`, `app/api/portal/social/route.ts`, `lib/kbos/social-publish.ts`, `components/kbos/SocialAccounts.tsx`)**:
   - `socialManageableProjectIds(userId)` inclui titulares via empresa (`ownedProjectIds(userId, all)` em `kbos_company_access` da migração `0031`), titulares diretos (`projects.clienteId`), operações filhas e gestores (`managedProjectIds`).
   - `GET /api/portal/social` e `linkAccounts` retornam `scopes`, `expiresAt`, `refreshExpiresAt`, `hasRefresh`, `lastError` e `providerStatus()` sem nunca expor tokens ao cliente.
   - `SocialConnectPanel.tsx` exibe plataforma, conta/perfil (`name` e `@username`), empresa associada (com seletor para vincular à operação correta), status da autorização (`Autorizado` vs `Requer reconexão`), permissões concedidas (traduzidas dos escopos OAuth), expiração/renovação automática, ações de **Conectar**, **Reconectar** e **Desconectar**, e selo explícito **"Pendente de ativação"** quando faltar credencial OAuth no servidor (sem simular conexão).
   - `schedulePost` e `accountFor` exigem conta ativa (`status === "ativo"`); auditoria (`logAudit`) registrada também em `agendar`, `publicar` (com `externalId` e `url`) e `publicar-falhou` (com `motivo`).

## O que falta (dependências externas de credenciais/revisão de apps na VPS)
- Configurar em `/opt/kbos/.env` na VPS as credenciais OAuth das plataformas que serão ativadas em produção (`META_APP_ID`/`META_APP_SECRET`, `TIKTOK_CLIENT_KEY`/`TIKTOK_CLIENT_SECRET`, `GOOGLE_SOCIAL_CLIENT_ID`/`GOOGLE_SOCIAL_CLIENT_SECRET`, `LINKEDIN_CLIENT_ID`/`LINKEDIN_CLIENT_SECRET`, `PINTEREST_APP_ID`/`PINTEREST_APP_SECRET`) e concluir a revisão de permissões de publicação nos respectivos consoles de desenvolvedor.

