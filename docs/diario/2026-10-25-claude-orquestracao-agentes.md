# 2026-10-25 · Claude · orquestração dos agentes

**Mudou**
- `AGENTS.md`: convivência v2 — worktree próprio por tarefa (fim do `reset --hard` em pasta compartilhada), reserva com `scripts/agente-lock.sh`, reserva de número de migração, diário em arquivos, prefixo `opencode/`.
- `scripts/agente-lock.sh`: reserva atômica de caminhos no diretório comum do git (vale para todos os worktrees, expira em 4 h). Testado: conflito entre worktrees, prefixo de pasta, liberar, expiração.
- `docs/AGENTES.md`: quem faz o quê por custo (labels de issue → ChatGPT / OpenCode grátis / Codex / Claude).
- `opencode.json`: modelo padrão grátis + subagentes `explorador` e `executor` (validado com `opencode debug config`).
- `docs/PASSAGEM-CHATGPT.md`: removidos client_id e finais de secret do Google (o repo é público).
- Labels criadas no GitHub (`nivel:*`, `agente:*`, `tipo:plano`, `area:sensivel`, `escalar`).

**Falta**
- Etapa 0 (quando a pasta `APP/` estiver livre): commitar/resgatar as mudanças sem dono em `codex/cadastro-portal-cerebro`; versionar `.claude/agents` e `.codex/agents` (corrigir `Codex/` → `codex/` no executor); tirar `kbos-ics-fix/` e `lib/kbos/team.ts.bak` da árvore; consertar o worktree do Codex (`~/.codex/worktrees/551c`, caminho antigo).
- Cofre em git privado `kbos-cerebro` + PR #5 (exportador) apontando para ele; VPS precisa de acesso.
- Decidir se o repo do app deve ficar privado (hoje é público).
- Ajuste: modelo grátis padrão do OpenCode trocado para `openrouter/cohere/north-mini-code:free` (os `opencode/*-free` esgotaram o limite diário em 25/10; o padrão do usuário é pago e está sem crédito).
