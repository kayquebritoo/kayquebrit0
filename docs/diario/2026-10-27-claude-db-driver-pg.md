# 2026-10-27 · Claude · Driver PostgreSQL convencional (incidente Neon P0)

**O que mudou** (branch `claude/db-driver-pg`, sem merge/deploy):
- `lib/kbos/db.ts`: `DATABASE_DRIVER=pg` usa `drizzle-orm/node-postgres` com Pool;
  sem a variável, continua Neon HTTP (produção inalterada).
- `db().batch([...])` no driver pg roda numa transação real na mesma conexão
  (AsyncLocalStorage roteia as queries do batch para o cliente com BEGIN):
  mesmo contrato atômico do Neon, nenhum ponto de chamada mudou.
- `end()` exposto (o worker já chama no shutdown).
- Teste `db-pg.int.test.ts` (só com `KBOS_TEST_PG_URL` de banco descartável).
- Dependências: `pg` e `@types/pg`.

**O que falta**: aprovação do Kayque para o plano de restauração/corte
(banco PostgreSQL 18 isolado na VPS, backup de 25/10 + dump novo do Neon
após a renovação da cota em 01/11). Ver relatório do incidente.
