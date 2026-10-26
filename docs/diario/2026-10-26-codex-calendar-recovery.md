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

## Resultado verificado em produção
- Código publicado no commit `c3fc2b75e0c1e7ea375fe272f4deeeff9141a2eb`; health ok, sem degradação.
- Backup integral anterior: 382 registros, 39 ocultos/vinculados. Fontes originais e backups antes/depois guardados no Drive por conexão autorizada, sem alterar compartilhamento.
- 47 uniões reversíveis: 11 em setembro e 36 em outubro. Nenhum registro excluído; o vínculo anterior do roteiro da Chapa Mista com o principal permanece intacto.
- Recuperados somente quatro registros ausentes no ICS de julho a setembro (196 conteúdos; 192 existentes). Todos os 79 conteúdos do ICS de outubro já existiam.
- Resultado integral: 386 registros, 300 visíveis, 86 ocultos/vinculados. Outubro tem 81 registros visíveis; isto NÃO comprova que todos sejam entregas únicas ou publicadas: permanecem itens sem empresa e roteiros sem vínculo comprovado com uma publicação.
- Zero candidatos restantes sob as regras conservadoras de identidade; zero ausentes no cruzamento das duas fontes; zero IDs anteriores perdidos, status Postado regredidos ou listas de redes alteradas.
- Jantar do Hotel de 17/10 salvo como Em edição. Status existentes preservados, inclusive carrossel do Lounge de 16/10.
- Backup final JSON integral e CSV de outubro salvos e conferidos no Drive. Download CSV pelo botão em produção validado.
- Validação final: 531 testes aprovados/14 pulados, tipos e lint sem erros; CI verde nas revisões de código.

## Limites preservados
A origem legada informa status geral e lista de redes, mas não há linhas de publicação por rede no snapshot atual. Não foram fabricados estados individuais. O modelo existente oferece distribuição por rede para novos conteúdos. Não foi configurada sincronização contínua com Drive nem novas permissões OAuth; a cópia deste calendário está salva e o botão baixa arquivos no dispositivo.
