# Lume — download preserva a busca

Links de download dos cards e da prévia abrem em nova aba com noopener noreferrer. Removido o atributo download: a rota local já envia Content-Disposition attachment; no modo nuvem há redirecionamento ao Google Drive, que pode exigir confirmação para arquivos grandes.

Validação: JavaScript extraído da interface passou em node --check. Revisados links e Content-Disposition da rota local.

Aplicado na VPS Lume em 25/10/2026 (Belém), por atualização restrita da interface do container lume-lume-1. Backup e arquivo corrigido em /opt/lume/backups/download-tab-20261026. Nenhum container reiniciado; StartedAt permaneceu 2026-10-26T01:56:03.901520308Z. Mantidas melhorias de busca do runtime.

Após recarregar e restaurar a busca, os links dos cards e da prévia tinham target=_blank e rel=noopener noreferrer, sem atributo download. Clique real em Baixar proxy ZVe10.4092_Proxy.mov preservou URL /, consulta Filé à Moda da Casa, 60 resultados e Seleção 2. Não confirmada conclusão do download no gerenciador do Chrome.

PR #8 ainda sem merge. A correção no runtime permanece ao reiniciar o mesmo container, mas uma recriação a partir de imagem antiga pode perdê-la até integração deste PR e reconstrução normal. Não alterar Caddy, índice, credenciais ou configurações de busca para este ajuste.
