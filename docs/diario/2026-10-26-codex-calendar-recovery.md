# Calendário independente — 26/10/2026

Kayque autorizou remover o botão de sincronização mLabs, exportar e guardar cópia no Drive, consolidar o Grupo VIP e cópias com reversão, corrigir o jantar de 17/10 para Em edição e recuperar apenas ausentes do último ICS.

## Alterações
- Tela sem sincronização mLabs, importação ICS mantida. Exportação JSON integral da família (incluindo ocultos e distribuição por rede) sem o limite da lista, e CSV do mês com proteção contra fórmulas.
- Seletor prefere projeto principal com operações. Carga ignora respostas antigas ao trocar projeto/mês.
- Consolidação administrativa com plano versionado, identidade exata e campos complementares, manutenção do status mais avançado e distribuição existente. Divergências e múltiplas distribuições bloqueiam união automática. Cópias ficam vinculadas, sem exclusão.
- Snapshot e vinculação na mesma instrução SQL, guardas de concorrência. Desfazer durável por auditoria, bloqueado após edição posterior.
- Não há publicação de conteúdo nem modificação de contas/credenciais.

## Validação
Teste PostgreSQL descartável: backup com operações/ocultos, preservação de publicado/roteiro/redes, aplicação repetida recusada, reversão, conflito posterior e CSV seguro.

## Operação
GET admin `/api/admin/social/export?projectId=UUID&format=json` baixa backup integral; `format=csv&month=2026-10` baixa mês visível.
A cópia no Drive é feita nesta operação por conexão autorizada; não foi criada integração permanente nem credencial de Drive no servidor. O botão informa que baixa no dispositivo.
Consolidação por mês em Conferir possíveis repetidos; auditorias em `kbos_data_moves` (`consolidar-conteudos`).

Resultados reais de aplicação e links serão registrados após publicação e conferência em produção.
