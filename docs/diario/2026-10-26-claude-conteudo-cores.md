# 2026-10-26 · Claude · Conteúdo: cores das etapas, ícone de postado e próximo para editar

## O que mudou (pedido do Kayque)
- Cores das etapas com matiz bem separado: Em edição roxo `#8a6cf0` × Agendado rosa `#f472b6`; Aprovado turquesa `#2dd4bf` × Postado verde `#22c55e`; Ajustes `#ff8a3d`, Erro `#ff5c5c`. Mesmas cores no portal (`PortalPosts`) e nas publicações (`PostPublications`).
- Linha do tempo (Stepper) no editor: sai o degradê da marca; a linha usa a cor da etiqueta da etapa atual (etapas anteriores a 50%).
- Calendário: no lugar da bolinha, ícone ao lado da logo da casa — ✓ postado, relógio agendado, ! erro, × cancelado, anel na cor da etapa = ainda não foi ao ar.
- Card "Próximo para editar" (mês atual): próximo Reels/Carrossel ainda antes da aprovação (roteiro, captação, edição, ajustes), com data, "hoje/amanhã/em N dias/N dias atrasado", fila e atrasados; toque abre o editor.

## O que falta
- Conferir no celular e no desktop (não deu para renderizar a tela no sandbox; CI valida tipos/lint/testes).
- O card olha só o mês carregado: no fim do mês não enxerga o próximo mês.
