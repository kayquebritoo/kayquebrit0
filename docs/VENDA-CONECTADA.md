# Fase 2 — Venda conectada

Em **Admin → Orçamentos → Link de aceite**, escolha modelo de serviço,
negociação (ou crie uma nova), início e entrega final. Anexe o Manual de
Identidade e referências usando **Enviar arquivos** ou **Adicionar link**. Vincule o orçamento ao contato do CRM e escolha a
condição de pagamento antes de publicar. Para planos mensais, informe o
início e a **Duração do plano (meses)**: o término é calculado automaticamente.
Exemplo: 01/11/2026 + cinco meses = 01/04/2027, com cinco mensalidades.
As datas dos itens devem estar dentro desse período.

O link publica uma cópia das condições e leva a negociação para Proposta.
Compartilhe o link com o cliente após revisá-lo. Não há envio automático
da proposta. Gerar um novo link revoga o anterior. Editar ou cancelar o
orçamento invalida o link publicado; gere outro após as alterações.
O link expira em até sete dias, limitado pela validade do orçamento e pelo
primeiro dia de execução (fim do dia em Belém).

O cliente lê o escopo, o cronograma, as cláusulas e o Manual de Identidade,
informa seu nome e confirma os dois aceites. O servidor grava uma assinatura
eletrônica simples: nome, data, contrato e manual aceitos, com a cópia exata
da proposta e o link do manual. O link é uma capacidade de acesso; somente
o hash do token aleatório fica no banco.

O aceite executa uma única instrução transacional no Postgres:

- Aprova o orçamento e preserva o documento contra edição e exclusão.
- Cria um projeto em Briefing ligado ao orçamento e ao contato.
- Cria tarefas do modelo Branding, Site, Audiovisual ou Plano mensal.
- Cria cobranças de entrada pendentes (não registra pagamento).
- Cria agenda para as datas dos itens e para a entrega final, sem duplicar datas.
- Promove o contato a Cliente e a negociação a Ganho.

Cliques repetidos retornam o aceite existente. Se qualquer etapa falhar,
todos os registros são revertidos. Orçamentos publicados não são excluídos:
cancele os não aceitos para invalidar o link. Após o aceite, alterações
comerciais exigem outra proposta.

## Arquivos e links

O botão **Enviar arquivos** aceita seleção múltipla: PDF, DOC/DOCX,
PPT/PPTX, XLS/XLSX, JPEG, PNG, WebP, GIF, documentos OpenDocument, TXT,
CSV e RTF. Limites: 10 MB por arquivo, 50 MB armazenados por orçamento e
20 materiais selecionados (arquivos + links) por proposta. Arquivos enviados
podem ser reutilizados ao reabrir o formulário, sem novo upload.

Marque pelo menos um arquivo ou link como **Manual de Identidade**. Os
outros podem ser referências. O cliente recebe a lista na proposta e pode
baixar cada arquivo. Nenhum arquivo tem endereço público avulso: o download
exige o token da proposta e o vínculo do anexo à versão publicada. Nome,
tamanho e hash são congelados na proposta; o binário é imutável e permanece
no Postgres após o deploy. Links antigos de manual continuam funcionando.
Remover um item da seleção apenas o desvincula dessa proposta, preservando
o arquivo enviado para reutilização e os aceites anteriores.

## Cobrança

Avulso: à vista com o desconto de 10% já oferecido pelo orçamento, cartão
integral ou 50% no aceite e 50% na data da entrega. Valores são calculados
em centavos. Mensal: mensalidade integral pré-paga, a primeira no aceite,
as seguintes no dia 5 dos meses subsequentes ao início; sem desconto à
vista e sem entrada/saldo. O projeto e o funil guardam o total contratado.
O início da execução continua sujeito aos pagamentos e materiais combinados.

O worker executa `billing.reminders` a cada cinco minutos. Dois dias antes
e no dia do vencimento (America/Belem), grava uma saída durável em
`kbos_jobs`; o sweeper a envia à fila existente. A chave inclui cobrança,
data e antecedência, evitando repetição por varredura. Não há lembrete
sem telefone válido. Antes do envio, o worker confere se a cobrança ainda
está aberta, com a mesma data, e se o lembrete ainda é do dia corrente.
O transporte mantém a semântica de retry existente (uma falha após a
entrega no provedor pode ocasionar reenvio).

## Publicação e validação

As migrações `0012_venda_conectada.sql` e `0013_arquivos_proposta.sql` estão espelhadas em `migrations.ts` e
`schema.ts`. O servidor as aplica no boot. Não há nova chave ou serviço de
produção: usa Neon, Redis e Evolution existentes.

`npm test` inclui Postgres descartável em memória (PGlite, só dependência
de desenvolvimento), aplicando todas as migrações SQL. Os testes cobrem
aceite, concorrência, rollback, revogação, expiração, cancelamento,
mensalidades e lembretes. Nunca usam o banco de produção.

Após publicar, emita uma proposta interna de teste, revise o link,
registre o aceite como cliente de teste e confira Orçamentos, Projetos,
Tarefas, Financeiro, Agenda e CRM. Para verificar a entrega de um lembrete,
use um contato e telefone de teste controlados pelo administrador.
