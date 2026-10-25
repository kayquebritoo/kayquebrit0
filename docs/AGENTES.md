# Agentes do KBOS — quem faz o quê

Regras de convivência: `AGENTS.md` (worktree próprio, reserva, diário). Este arquivo diz **quem pega cada tarefa**, pensando em gastar o mínimo de token pago.

## Fila de tarefas = GitHub Issues
Cada pedido vira uma issue com **briefing autocontido**: objetivo, arquivos envolvidos (`arquivo.ts:linha`), critério de pronto e como testar. O agente que pegar a issue não deve precisar explorar o repo de novo.

| Label | Quem executa | Modelo | Exemplos |
|---|---|---|---|
| `tipo:plano` | **ChatGPT** (assinatura) | — | quebrar pedido em issues, escrever briefing, revisar PR, pesquisar |
| `nivel:mapa` | **OpenCode** (grátis), agente `explorador` | `opencode/deepseek-v4.1-flash-free` | achar arquivos/rotas e anexar `arquivo:linha` na issue |
| `nivel:simples` | **OpenCode** (grátis), agente `executor` | `opencode/mimo-v2.6-flash-free` | texto, CSS, docs, renomear, lint, diário |
| `nivel:medio` | **Codex** | padrão do Codex | tela, rota, feature comum, teste |
| `nivel:complexo` | **Claude Code** | Opus decide; subagentes Sonnet executam | arquitetura, bug difícil, integração |
| `area:sensivel` | **Claude Code** | Opus | `agent.ts`, `inbox.ts`, webhook Evolution, `migrations.ts`, docker, `deploy.sh` |
| `escalar` | sobe um nível | — | o executor falhou 2 vezes |
| `agente:claude` · `agente:codex` · `agente:opencode` · `agente:chatgpt` | quem está com a tarefa | — | marque ao pegar |

Revisão antes do merge: **outro** agente que não o autor (Claude revisa Codex e vice-versa; diff pequeno pode ser revisado pelo OpenCode).

## Regras que economizam token
1. **Começa pelo mais barato:** mapa e tarefa simples sempre no OpenCode grátis. Só sobe de nível (`escalar`) depois de 2 falhas.
2. **Briefing completo na issue:** o agente caro recebe os caminhos prontos (do `nivel:mapa`) em vez de procurar.
3. **CI é o testador:** localmente, só `npx tsc --noEmit` e o `vitest` do arquivo afetado; a suíte inteira roda no CI.
4. **Contexto curto:** comece por `docs/MAPA-DO-SISTEMA.md` (índice) e o estado atual do `docs/HANDOFF.md`. Não leia o Diário antigo inteiro.
5. **Uma tarefa = um worktree = uma sessão:** terminou, feche a sessão e remova o worktree.

## Como rodar cada um
- **OpenCode:** `opencode` na pasta do worktree (lê `AGENTS.md` e `opencode.json`). Sem argumento usa o modelo grátis padrão; `@explorador` / `@executor` chamam os subagentes. Modelos `muse-spark` do OpenRouter **não** são `:free`: confira o preço antes.
- **Codex:** `codex` no worktree; subagentes em `.codex/agents/`.
- **Claude Code:** `claude` no worktree; subagentes em `.claude/agents/`.
- **ChatGPT:** lê o repo pelo conector do GitHub e as notas/status pelo MCP `https://mcp.kayquebrito.com.br/mcp` (só leitura). Não faz commit: escreve issues e revisões.

## Memória compartilhada
Contexto de negócio (clientes, marca, decisões) fica no cofre do Obsidian, repositório privado `kbos-cerebro`. Agentes **não editam notas finais**: propõem mudanças (branch `propostas/…` ou motor de propostas do `tools/brain-export`), o Kayque aprova.
