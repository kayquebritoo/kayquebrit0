<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:kbos-deploy -->
# KBOS — Ecossistema de Gestão Comercial e Automação (Kayque Brito)

> **Comece por `docs/HANDOFF.md`**: estado atual, como publicar, pegadinhas e próximos passos.

## Convivência entre agentes (Claude Code, Codex, OpenCode, ChatGPT)
Vários agentes trabalham neste repo ao mesmo tempo, na mesma máquina. Quem faz o quê (por custo): `docs/AGENTES.md`.
1. **Uma tarefa = um worktree próprio + uma branch** (`claude/`, `codex/` ou `opencode/<assunto>`), criado de `origin/main`:
   `git fetch origin && git worktree add -b claude/<assunto> ../APP-<assunto> origin/main`.
   **Nunca** rode `git checkout`, `reset --hard`, `stash` ou `clean` numa pasta com mudanças que não são suas (a pasta `APP/` principal é compartilhada). Nada de commit direto em `main`.
2. **Reserve antes de editar:** `scripts/agente-lock.sh reservar <agente> <assunto> <caminhos…>`; ao terminar, `scripts/agente-lock.sh liberar <assunto>`. Se `scripts/agente-lock.sh ver` mostrar reserva no mesmo caminho, não mexa: pegue outra tarefa ou avise o Kayque.
3. **Migração nova:** reserve `drizzle/00NN` no lock antes de criar o arquivo (o número colide entre branches).
4. **Publicar:** CI verde na branch → `git fetch` → rebase em `origin/main` → merge fast-forward. Se `main` andou e há conflito, resolva preservando o trabalho do outro agente.
5. **Não reescreva** o que o outro agente fez sem motivo; se precisar mudar, explique no commit.
6. **Ao terminar:** crie `docs/diario/AAAA-MM-DD-<agente>-<assunto>.md` (o que mudou · o que falta), um arquivo por entrada. O Diário do `HANDOFF.md` vira só histórico. Depois do merge: `git worktree remove ../APP-<assunto>`.
7. Áreas sensíveis — só Claude Code, com cuidado e testes: `lib/kbos/agent.ts`, `lib/kbos/inbox.ts`, `app/api/webhooks/evolution`, `lib/kbos/migrations.ts`, `infra/docker-compose.yml`, `deploy.sh`.

- **Profissional**: Kayque Brito (Desenvolvedor de Software, Designer e Produtor Audiovisual).
- **VPS**: `179.236.67.19` · código em `/opt/kbos` · prod em `https://kbos.kayquebrito.com.br`
- **Fluxo de Deploy**: branch → CI verde → merge em `main` → o cron da VPS (`deploy.sh --auto`) publica sozinho. Forçar na VPS: `./deploy.sh` (não `git pull`).
- **Se precisar comandar a VPS à mão** (a partir da RAIZ do repo, nunca de `infra/`):
  `docker compose --env-file /opt/kbos/.env -f infra/docker-compose.yml --profile evolution up -d --build`
- **Regras Técnicas**: NUNCA commitar segredos (`.env*` está no `.gitignore`); schema via `npx drizzle-kit push` contra o Neon; migrações SQL vivem em `drizzle/000N_*.sql` + entrada em `drizzle/meta/_journal.json`.

## DNA da Marca e Diretrizes de Design (LDP Design)
- **Arquétipos**: O Criador (*"Se pode ser imaginado, poderá ser criado"*) e O Explorador (*"Não levante cercas à minha volta"*)[cite: 20].
- **Personalidade & Pilares**: Líder, Sábia, Técnica, Criativa, Futurista e Atual[cite: 13]. Pilares: **Agilidade, Inovação e Inteligência**[cite: 17].
- **Paleta Oficial (Dark Theme)**: 
  - Fundo principal: `#11101E` (Blackweb)[cite: 26]
  - Destaques / Acentos: `#E80EFD` (PurpleMag) e `#4F12C7` / `#350C85` (BluePurple / BlueEnergy)[cite: 26]
  - Neutros: `#EDE6EC` (Off White) e `#BDB7BC` (GrayKay)[cite: 26]
- **Tipografia**: Cottorway Pro (apoio/títulos)[cite: 25] e fontes limpas de alta legibilidade.

## Regras de Negócio e Arquitetura do KBOS
- **Orçamentos e Contratos**: Todo orçamento recorrente ou estruturado deve ser gerado no formato de **2 páginas** via `pdf-generator.tsx` (Página 1: Resumo Comercial e Itens; Página 2: Instrumento Particular de Prestação de Serviços com 7 cláusulas de salvaguarda e assinatura digital simples).
- **Padrão Visual**: Tema dark sofisticado (`#11101E` / `#0B0B1E`), gradientes com identidade visual consistente, componentes responsivos e alto padrão de UI/UX.
- **Paleta aplicada (out/2026)**: site público, painel `/admin` e PDF usam a paleta oficial — fundo `#11101E`, tinta `#EDE6EC`, acento `#E80EFD`, gradientes `#4F12C7 → #E80EFD` (tokens `brand-*` no `@theme` de `app/globals.css`). O modo claro ("Papel Quente") troca o acento por `#4F12C7` e depende das classes literais (`bg-[#11101E]`, `text-[#E80EFD]`, `text-[#EDE6EC]`) por correspondência de substring: ao mudar uma cor literal, atualize também o seletor `html.light` correspondente.
- **Direção de Trabalho**: Validação obrigatória de Brand Guidelines (paleta de cores, fontes, tom de voz) integrada aos briefings dos clientes para evitar retrabalho e alinhar expectativas.
<!-- END:kbos-deploy -->