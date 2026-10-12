<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:kbos-deploy -->
# KBOS — Deploy VPS (persistente entre sessões: não perguntar de novo)

- **VPS**: `109.106.251.173:65002` · código em `/opt/kbos` · prod em `https://kbos.kayquebrito.com.br`
- **Fluxo**: commit + `git push origin main` → GitHub Actions (`.github/workflows/deploy-vps.yml`) publica sozinho. Nada de SSH manual.
- **Se precisar comandar a VPS à mão** (a partir da RAIZ do repo, nunca de `infra/`):
  `docker compose --env-file /opt/kbos/.env -f infra/docker-compose.yml --profile evolution up -d --build`
- **Regras**: NUNCA commitar segredos (`.env*` está no `.gitignore`); schema via `npx drizzle-kit push` contra o Neon; migracões SQL vivem em `drizzle/000N_*.sql` + entrada em `drizzle/meta/_journal.json`.
<!-- END:kbos-deploy -->
