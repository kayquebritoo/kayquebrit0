# Mapa do KBOS (fluxo, relações e regra de menu)

> Para o dono do sistema, não para o cliente final. Atualize **antes** de criar qualquer funcionalidade nova.

## Regra de ouro dos menus
1. **Só vira item de menu o que o dia a dia exige em destaque.** O resto mora dentro de um item principal ou em **Ajustes**.
2. Antes de criar algo novo, responder por escrito: *a qual grupo pertence? com o que se conecta? o que isso substitui?* (acrescentar a resposta neste arquivo).
3. Conexões com apps externos (WhatsApp, Telegram, mLabs, Instagram, Meta…) ficam em **Ajustes → Conexões**, discretas. Nunca no topo de uma tela de trabalho.
4. Dados do próprio usuário (nome, login social) ficam em **Meu acesso**, dentro de Ajustes, nunca num menu.
5. Upload sempre do aparelho (botão amigável). Link só para vídeo externo (YouTube etc.).
6. Um objeto, um lugar: Tarefa pertence a Projeto; Post pertence a Projeto (cliente recorrente de redes); Orçamento pertence a Contato.

## Menu (admin)
| Grupo | Itens | Para quê |
|---|---|---|
| **Hoje** | Hoje | Resumo do dia: atrasos, dinheiro, agenda. |
| **Produção** (destaque) | Projetos e entregas · Tarefas e prazos · Conteúdo e posts · Agenda | Onde o trabalho acontece. Projeto → tarefas → entregas. |
| **Comercial** | Inbox · Funil de vendas · Contatos · Orçamentos e contratos · Campanhas | Conversar, vender, contratar. |
| **Dinheiro** | Fluxo de caixa · Relatórios e MEI | Entradas, saídas, impostos. |
| **Mais** | Lume · Galeria do cliente · Serviços e valores · Cases · Cursos · Ajustes | Acervo, vitrine do site, configurações. |

Cliente vê: Projetos/Portal, Meu acesso, Meus cursos. O admin **não** vê "Portal do cliente".

## Relações (quem se liga a quem)
```
Contato ──< Briefing (formulário do site) ──> Projeto
Contato ──< Orçamento ──aceite──> Planejamento/Marca ──> Projeto
Projeto ──< Tarefas            (tarefa SEMPRE ligada a um projeto; avulsa só se for pessoal)
Projeto ──< Posts (Conteúdo)   (categoria "Redes sociais (recorrente)")
Projeto ──< Arquivos/Aprovação ──> Portal do cliente (cliente aprova)
Projeto ──< Chat do projeto
Projeto ──> Financeiro (cobranças) · Cases (portfólio, com autorização do cliente)
Post: roteiro ─vínculo─> post agendado ─(mLabs)─> publicado
Lume (acervo) ── "achar takes" ──> Post / Projeto
Galeria do cliente (álbum de evento) ── aceite por pessoa (selfie) ──> download
```

## Onde cada coisa mora hoje (e para onde vai)
- Briefings → hoje em Ajustes; **vai para dentro do Contato/Projeto**.
- Marcas e planejamentos → hoje em Ajustes; **vai para dentro do Projeto** (aba "Marca").
- Conexão do WhatsApp/Telegram → Ajustes → Conexões.
- Apresentação do KBOS → Ajustes → Sobre o KBOS (a redesenhar, discreta).
