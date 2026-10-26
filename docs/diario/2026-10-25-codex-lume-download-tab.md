# Lume — download preserva a busca

Links de download dos cards e da prévia abrem em nova aba com noopener noreferrer. Removido o atributo download: a rota local já envia Content-Disposition attachment; no modo nuvem há redirecionamento ao Google Drive, que pode exigir confirmação para arquivos grandes.

Validação: JavaScript extraído da interface passou em node --check. Revisados links e Content-Disposition da rota local. Deploy e teste real em produção pendentes de acesso à VPS. Nenhuma alteração de produção nesta sessão.
