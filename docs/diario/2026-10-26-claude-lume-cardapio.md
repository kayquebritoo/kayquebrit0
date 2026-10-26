# 2026-10-26 · Claude · Lume reconhece os pratos do Grupo VIP

## O que mudou
- `infra/lume/server/cardapio.json`: 137 pratos/drinks das 3 casas (Praça, Lounge, Hotel + café da manhã do Hotel), transcritos dos PDFs enviados pelo Kayque. Cada prato tem casas onde existe, versões por casa (categoria, ingredientes, porção, preço), descrição visual e alertas de nomes parecidos.
- `acervo_cardapio.py`: reconhece o prato digitado (nome exato, nome dentro da frase ou nome incompleto → pergunta "Qual destes pratos?"), filtra por casa e avisa quando o prato não existe na casa filtrada.
- `/buscar`: devolve `cardapio` (prato ou candidatos); quando o texto é um prato, o motor busca pela descrição visual (nome + ingredientes); referência ensinada para outro prato de nome parecido é ignorada (filé de carne × filé de peixe à moda).
- `GET /cardapio?empresa=Lounge&q=camarão`: lista de pratos (liberado também para clientes, só leitura).
- Correção confirmada pelo Kayque: a referência "file a moda da casa" é renomeada no arranque para "file de peixe a moda da casa" (`renomear_referencias` no JSON; idempotente).
- Interface: card "Cardápio" acima dos resultados (casas, ingredientes por casa, alertas, aviso de casa errada, botões quando ambíguo).
- Testes: `python3 -m unittest test_cardapio` (11 testes).

## O que falta
- Revisão da Talita na planilha `Catalogo_Pratos_Grupo_Atalaia_VIP.xlsx`; ajustes entram editando `cardapio.json`.
- A casa de cada FOTO ainda depende da pasta do Drive (filtro `p`); fotos em pastas sem casa (ex.: "OUTUBRO EDITADAS") não sabem de onde vieram — o upload com perguntas deve registrar a casa.
- Ensinar fotos de referência dos pratos principais (começando pelo Filé de Peixe à Moda da Casa e Chapa Mista Completa).
