# Classificação de outubro e fila de edição

Kayque autorizou ler os 16 registros sem empresa de outubro, decidir entre Hotel/Lounge/Praça e aplicar a classificação, com contagem de conteúdos pendentes de edição.

## Código
- Campo Empresa no editor administrativo; mudança de empresa encaminha o conteúdo à operação correspondente do mesmo projeto principal. Snapshot de marca/projeto anterior e posterior em `kbos_data_moves`, na mesma transação da atualização.
- Sugestões de roteiro priorizam a legenda efetivamente presente no roteiro, preservando o escopo de família.
- Vínculo de roteiro passa a registrar os dois retratos e executar atualização/vínculo/auditoria em transação. Roteiros completos não são substituídos por trechos curtos; versões diferentes são preservadas no texto e no histórico.
- Não altera status de publicação nem dispara publicações.

## Conferência editorial
14 dos 16 registros têm somente legenda; dois têm roteiro. As legendas e os roteiros correspondentes permitem classificar as operações. COLABs continuam sendo um conteúdo, com operação principal de organização.
## Resultado aplicado e verificado
- Os 16 registros de outubro foram classificados: Hotel 7, Lounge 5 e Praça 4. Zero registros visíveis de outubro sem empresa.
- Nos COLABs do Dia do Cliente e Dia Internacional do Chefe, Lounge é a operação principal por decisão editorial; mantida a identificação de colaboração, uma única entrega. A homenagem de Salinas segue o roteiro principal do Hotel.
- Corrigido também um Reels já marcado como Lounge cujo roteiro inteiro identifica a Praça (pizza e encontro de amigos).
- Vinculados 25 roteiros a 24 conteúdos prontos: 22 por legenda integral correspondente; três por revisão editorial de briefing/produtos/estrutura/CTA e legenda adaptada (fruta/drink, fim de semana e Você pediu). Um conteúdo tinha roteiro integral e cópia curta, ambos preservados.
- Nenhum ID anterior perdido e nenhum status Postado regredido. Redes existentes preservadas. Vínculos e classificações auditados no banco.
- Outubro: 56 registros visíveis, 25 no estágio roteiro (um é somente o marcador HOTEL, sem tema/roteiro), um em edição, 20 agendados e dez postados.
- Fila real de conteúdo definido: 25 = Lounge 9 + Hotel 8 + Praça 8; 19 Reels e seis carrosséis. Inclui um vídeo em edição (jantar de 17/10): são 24 conteúdos a iniciar e um a concluir. Marcador HOTEL vazio não contado nem apagado.
- Há roteiros com datas de novembro no texto e data estruturada de outubro no calendário; mantida a data estruturada solicitada, sem remarcar por suposição.
- Backup integral e CSV atuais do Drive substituídos preservando IDs e histórico; relatório privado de decisões, vínculos e pendências guardado na mesma pasta. Nenhuma sincronização contínua ou permissão nova foi configurada.
- Código publicado no commit 6266cf7a3f72b127bb6d481dab532907c42c2565, health ok/sem degradação. Validação: 533 testes aprovados, 14 pulados, TypeScript/lint sem erros e CI verde.

## Validação
Testes PostgreSQL descartáveis verificam encaminhamento à operação, auditoria, manutenção de status/redes, prioridade de correspondência e preservação do roteiro completo.
