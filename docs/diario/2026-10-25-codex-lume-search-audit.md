# Lume: auditoria e experimento de precisão

Base `35ca3b6`, branch `codex/lume-search-audit`. Código e runtime conferidos,
backup SQLite íntegro, benchmark de sete consultas registrado privadamente na VPS.
Preparados aliases restritos, ranking contrastivo experimental, feedback auditável
com exclusão reversível, benchmark offline e CI Python. 21 testes locais passam.

O ranking especial permanece desligado por padrão: ainda há falsos positivos e
nenhum petit gâteau com recheio confirmado. Controles preservaram top 20 IDs/scores.
Sem merge/deploy/reinício/reindexação ou mudança de dados/credenciais de produção.
Diagnóstico, limites e operação em `docs/LUME-BUSCA-AUDITORIA.md`.
