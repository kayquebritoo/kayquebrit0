# Memória controlada — preparação em testes

## Estado

Implementação isolada, sem ativação na VPS, cron, alterações de containers, segredos ou escrita no MCP. A sincronização pontual do ZIP do Mac para as 25 notas da VPS foi concluída separadamente em 24/10/2026, com backup e conferência SHA-256. Ela não é uma conexão contínua com o Mac.

## Escopo da primeira versão

- `collect.ts` consulta o banco exclusivamente com SELECT e lista explícita de colunas: clientes (não todos os leads), projetos, tarefas e metadados de versões publicadas de planejamento.
- Não exporta CPF/CNPJ, endereços, telefones, e-mails, senhas, tokens, valores financeiros, mensagens, descrição livre, rascunhos de planejamento ou o conteúdo do planejamento. Títulos e nomes selecionados continuam sendo dados privados: a fila é privada e fica fora de diretórios públicos e do Git.
- `propose` converte o snapshot em Markdown determinístico e salva somente uma proposta na fila. Não altera o vault. Conteúdo é marcado como dado não confiável.
- As únicas notas editáveis pela ferramenta ficam em `40-KBOS-Automatico/{clientes,projetos,tarefas,planejamentos}/<uuid>.md`. As 25 notas humanas permanecem fora desse namespace.
- Ausência na fonte não exclui arquivos. Avisos de remoção e reconciliação de registros arquivados são evolução futura.
- O hash inclui o caminho do vault e os bytes anteriores/propostos. Aprovação exige esse hash exato e identificação do operador; rejeição e reversão ficam registradas.
- Identificar o operador por texto não autentica uma pessoa. A CLI deve permanecer restrita a operadores autorizados no sistema operacional. Não é uma API pública, serviço de aprovação ou ferramenta MCP; não concede novas permissões.

## Execução manual em ambiente isolado

Pré-requisitos: Node 22+, dependências do repositório, vault de teste separado e fila privada fora dele. Não apontar estes exemplos ao vault de produção sem revisão e autorização específica da proposta.

```sh
node --test tools/brain-export/engine.checks.mjs
KBOS_BRAIN_EXPORT_ENABLED=1 npx tsx tools/brain-export/collect.ts /caminho/privado/snapshot-unico.json
node tools/brain-export/cli.mjs propose /caminho/privado/fila /caminho/vault-teste /caminho/privado/snapshot-unico.json
```

`collect` não sobrescreve o arquivo de saída existente. Cada execução exige caminho novo; proteção contra substituir uma cópia previamente revisada. O retorno contém apenas quantidades. Nenhuma chave deve ser passada por argumento ou impressa; o processo deve receber o ambiente já configurado pelo operador.

O operador revisa integralmente `<hash>.json` na fila privada. Depois, para uma proposta específica:

```sh
node tools/brain-export/cli.mjs approve /caminho/privado/fila HASH OPERADOR HASH
node tools/brain-export/cli.mjs reject /caminho/privado/fila HASH OPERADOR
node tools/brain-export/cli.mjs rollback /caminho/privado/fila HASH OPERADOR HASH
```

Os comandos são alternativas de decisão; uma proposta rejeitada não pode ser aprovada depois. Uma proposta já aplicada retorna o mesmo recibo, sem reaplicar. Para nova decisão, gerar nova proposta após mudança real ou revisão do processo; não editar recibos manualmente para contornar uma rejeição.

## Garantias e limites

A fila preserva os conteúdos anteriores como backup, com permissões privadas e recibos de decisão. Arquivos são trocados por renomeação; não se promete atomicidade simultânea de vários arquivos. Antes de escrever, a ferramenta verifica os bytes anteriores e bloqueia divergências. O namespace gerado deve ter um único responsável pela escrita: o lock coordena apenas esta ferramenta, não outros editores. Se um arquivo mudar no pequeno intervalo entre a conferência e a renomeação, não há comparação-e-troca transacional do filesystem.

Se houver interrupção, o recibo `applying`/`reverting` identifica operação incompleta. `rollback` aceita apenas arquivos ainda iguais à versão anterior ou proposta e preserva divergências posteriores. Um lock de operação pode sobreviver a falha abrupta; um operador deve confirmar que não existe processo em execução e revisar recibos antes de removê-lo. Nunca remover lock automaticamente com base apenas em tempo.

Falha após uma gravação tenta restaurar apenas arquivos modificados por esta operação; edição posterior é preservada e registrada como `failed_needs_review`. A fila contém histórico privado local; isso não substitui backup externo/restauração testada. O diretório de estado e o vault não podem ser compartilhados com usuários não confiáveis.

## Próxima implantação

1. Validar o coletor com SELECT real em uma cópia ou execução de leitura autorizada; conferir contagens sem imprimir dados.
2. Gerar e revisar a primeira proposta real fora do vault.
3. Usar ambiente de testes para validar o ciclo completo com os mesmos dados e restringir o usuário do serviço às pastas necessárias.
4. Preparar agendamento que apenas colete e proponha. Aprovação continua por lote explícito; não programar `approve`.
5. Ativar em produção após conferir armazenamento, backup externo e política de acesso. Esta branch não altera compose, worker, banco nem crontab.
6. Conectar o Mac separadamente quando houver acesso local e mecanismo escolhido; a VPS permanece fonte central. O ZIP é um retrato, não um canal de sincronização.
