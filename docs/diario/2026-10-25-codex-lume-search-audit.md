# Lume: auditoria e experimento de precisão

Base `35ca3b6`, branch `codex/lume-search-audit`. Código e runtime conferidos,
backup SQLite íntegro, benchmark de sete consultas registrado privadamente na VPS.
Preparados aliases restritos, ranking contrastivo experimental, feedback auditável
com exclusão reversível, benchmark offline e CI Python. 21 testes locais passam.

O ranking especial permanece desligado por padrão: ainda há falsos positivos e
nenhum petit gâteau com recheio confirmado. Controles preservaram top 20 IDs/scores.
Sem merge/deploy/reinício/reindexação ou mudança de dados/credenciais de produção.
Diagnóstico, limites e operação em `docs/LUME-BUSCA-AUDITORIA.md`.

Continuação: proprietário confirmou os dois arquivos selecionados e votados.
Aliases leem votos legados sem migrar produção; âncoras visuais preservam ambos
mesmo quando o texto os rejeitaria. Sete aliases na API HTTP isolada retornam
exatamente os dois confirmados; filtros e escopo do portal passaram. Corrigido
`idx` fora do alcance na checagem de arquivos do portal. 24 testes Python,
527 Vitest aprovados/14 pulados, TypeScript/lint sem erros. Ajustado apenas o
teste não determinístico de substring em ciphertext que havia bloqueado a CI.
Ativação continua pendente de aprovação; produção preservada.

Publicação posterior aprovada e concluída: imagem `lume-review:f6abb430` ativa,
somente aplicação recriada, saudável. Sete aliases validados no HTTPS público
e na interface com os dois confirmados; controles top 20 preservados. Indexador
e Caddy mantiveram os mesmos IDs/StartedAt. Backup/rollback privados em
`/opt/lume/releases/f6abb430`. PR sem merge para não acionar reinício automático
do KBOS; coordenar integração à main em janela própria.
