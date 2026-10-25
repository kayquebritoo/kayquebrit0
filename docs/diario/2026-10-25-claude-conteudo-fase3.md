# 2026-10-25 · Claude · Grupo VIP separado + fase 3 (publicar no Instagram/Facebook)

**Mudou**
- Grupo VIP separado em 3 operações com o código testado (`applySplit`), backup antes: Hotel Atalaia VIP (117 posts),
  Atalaia VIP Lounge (96), Praça de Alimentação Atalaia VIP (94); 75 sem empresa ficaram no Grupo; total 382 preservado.
  Desfazer: botão no painel do Grupo (`kbos_data_moves` 3a977ebc-b0be-4bec-8dfd-5b6c4bba4b05).
- Plano compartilhado: Grupo = 48/mês, 16 por operação; a gestão (Thalita) remaneja no portal (+/−) sem passar de 48
  (`lib/kbos/plan-pool.ts`, `PUT /api/portal/plan`).
- Família principal + operações (`lib/kbos/project-family.ts`): mLabs, ICS, lista de produção, conciliação e calendário
  procuram na família inteira e post novo com empresa cai na operação dela (nada volta duplicado depois da separação).
- Fase 3, migração 0029 (aditiva): `kbos_social_accounts` (token criptografado), `kbos_post_media` (arquivo final em
  `/data/gallery/social`, upload em pedaços de 8 MB), colunas de envio em `kbos_post_publications`.
  `lib/kbos/meta.ts` (login, Páginas + Instagram, publicar imagem/carrossel/Reels/Story no IG e foto/fotos/vídeo no FB),
  `lib/kbos/social-publish.ts` (agendar, trava contra envio duplo, novas tentativas, token vencido), cron `social.tick`
  (1 min) no worker, Ajustes → Redes sociais, editor do post → arquivo final + Agendar no KBOS / Publicar agora.
- `infra/docker-compose.yml`: META_APP_ID, META_APP_SECRET, META_GRAPH_VERSION no web e no worker (vazias = desligado).
  `scripts/kbos-config.sh`: opção 9 para colar as chaves da Meta.
- Testes: `social-publish.test.ts` (Meta simulada) e família/plano em `content-cycle.test.ts`.

**Falta**
- Kayque: criar o app da Meta e conectar (passo a passo em `docs/PLANO-CONTEUDO.md`, Fase 3). Depois, primeiro post
  real com "Publicar agora" para validar ponta a ponta.
- Revisar os 75 posts sem empresa do Grupo (espelho mLabs em pares agendado/postado e COLABs).
- O projeto Grupo está na etapa "Entregue" no Kanban; como é recorrente, mover para "Em produção" se quiser.
- Próximo: TikTok e YouTube, métricas por post (Insights) e relatório mensal, concorrentes, desligar a mLabs.
