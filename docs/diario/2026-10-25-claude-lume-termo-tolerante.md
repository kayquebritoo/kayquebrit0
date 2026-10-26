# 2026-10-25 · claude · Lume: termo tolerante nas referências

**O que mudou**
- `Referencias.termo_parecido(termo, escopo)` (infra/lume/server/acervo_referencias.py): exato primeiro; senão compara por palavras (sem acento, sem stopwords PT, plural simples). Casa se as palavras da busca contêm as da referência ou Jaccard >= 0.6; busca de 1 palavra não casa referência com várias; vence maior Jaccard, depois mais palavras em comum.
- `Referencias.vetores` usa esse casamento. `/buscar` (acervo.py) usa o termo realmente casado no feedback e na mensagem "interpretacao".
- Testes novos em test_referencias.py.

**O que falta**
- Plurais irregulares (ex.: camarões/camarão) não são tratados.
- Conferir em produção após o deploy automático (cron da VPS).
