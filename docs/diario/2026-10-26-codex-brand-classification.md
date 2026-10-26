# Classificação de outubro e fila de edição

Kayque autorizou ler os 16 registros sem empresa de outubro, decidir entre Hotel/Lounge/Praça e aplicar a classificação, com contagem de conteúdos pendentes de edição.

## Código
- Campo Empresa no editor administrativo; mudança de empresa encaminha o conteúdo à operação correspondente do mesmo projeto principal. Snapshot de marca/projeto anterior e posterior em `kbos_data_moves`, na mesma transação da atualização.
- Sugestões de roteiro priorizam a legenda efetivamente presente no roteiro, preservando o escopo de família.
- Vínculo de roteiro passa a registrar os dois retratos e executar atualização/vínculo/auditoria em transação. Roteiros completos não são substituídos por trechos curtos; versões diferentes são preservadas no texto e no histórico.
- Não altera status de publicação nem dispara publicações.

## Conferência editorial
14 dos 16 registros têm somente legenda; dois têm roteiro. As legendas e os roteiros correspondentes permitem classificar as operações. COLABs continuam sendo um conteúdo, com operação principal de organização.
Classificação e resultados reais serão registrados após aplicar e conferir no painel.

## Validação
Testes PostgreSQL descartáveis verificam encaminhamento à operação, auditoria, manutenção de status/redes, prioridade de correspondência e preservação do roteiro completo.
