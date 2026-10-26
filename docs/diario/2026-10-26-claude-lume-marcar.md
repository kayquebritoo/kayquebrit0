# 2026-10-26 · Claude · Lume: marcar casa e prato nas fotos

## O que mudou
- `acervo_marcacoes.py` + tabela `marcacoes` (criada no arranque, sem migração externa): por arquivo, casa (Hotel/Lounge/Praça), pratos do cardápio, onde, quando e observação.
- `POST /marcar` (só equipe; até 300 arquivos por vez; campo ausente mantém, "" apaga) e `GET /marcacao?id=`.
- Filtro de casa (`p=Hotel|Lounge|Praça`) acha também os arquivos marcados com a casa, mesmo fora da pasta dela (busca, acervo, conceito e parecidos — `Indice.na_pasta`).
- Busca de um prato: arquivos marcados com ele vêm primeiro (bônus 2,0 > qualquer semelhança).
- Resultados trazem `marcacao`; interface mostra chips (casa, pratos, onde · quando) e tem "Marcar casa/prato" na seleção e na prévia.
- Testes: `python3 -m unittest test_marcacoes`.

## O que falta
- Marcar as fotos de outubro (pastas sem casa) — feito pela equipe na interface.
- Upload de fotos novas pelo Lume com as mesmas perguntas (hoje só marca o que já está indexado do Drive).
