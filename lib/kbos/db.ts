// Cliente Drizzle com dois drivers:
// - "neon" (padrão): Neon HTTP — o que a produção usa hoje.
// - "pg": PostgreSQL convencional (node-postgres), para o banco próprio na VPS.
// O driver vem de DATABASE_DRIVER; sem ela, nada muda em produção.
// Conexão preguiçosa: só exige DATABASE_URL quando a primeira query roda,
// então o `next build` e o site público seguem íntegros sem banco.
import { AsyncLocalStorage } from "node:async_hooks";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

type NeonDb = ReturnType<typeof drizzleNeon<typeof schema>>;

let _db: NeonDb | null = null;

export function dbDriver(): "neon" | "pg" {
  return process.env.DATABASE_DRIVER === "pg" ? "pg" : "neon";
}

/**
 * Pool que, dentro de um `batch`, manda todas as queries para a mesma
 * conexão (aberta com BEGIN). Fora do batch, comporta-se como Pool normal.
 * Assim `db().batch([...])` continua atômico como no Neon HTTP, sem mudar
 * nenhum ponto de chamada nem o mapeamento de colunas do Drizzle.
 */
const batchClient = new AsyncLocalStorage<pg.PoolClient>();

class RoutedPool extends pg.Pool {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(...args: any[]): any {
    const client = batchClient.getStore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return client ? (client.query as any)(...args) : (super.query as any)(...args);
  }
}

function makePgDb(url: string): NeonDb {
  const pool = new RoutedPool({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on("error", (e) => console.error("[kbos] pool pg:", e.message));
  const d = drizzlePg(pool, { schema });

  // Mesmo contrato do batch do Neon HTTP: executa em ordem, numa transação,
  // e devolve o resultado de cada query. Falhou uma, nenhuma fica gravada.
  async function batch(queries: readonly PromiseLike<unknown>[]) {
    if (batchClient.getStore()) throw new Error("batch aninhado não é suportado");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const results = await batchClient.run(client, async () => {
        const out: unknown[] = [];
        for (const q of queries) out.push(await q);
        return out;
      });
      await client.query("COMMIT");
      return results;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  // node-postgres e Neon HTTP devolvem `{ rows }` em execute(); select/insert/
  // update/delete têm a mesma forma. O tipo exposto segue o do Neon para não
  // mexer em 100+ arquivos; a diferença real (batch) é coberta acima.
  return Object.assign(d, { batch, end: () => pool.end() }) as unknown as NeonDb;
}

export function db() {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL não configurada. Crie um Postgres (Neon/Supabase), " +
          "rode `npx drizzle-kit push` e defina a variável de ambiente."
      );
    }
    _db = dbDriver() === "pg" ? makePgDb(url) : drizzleNeon(neon(url), { schema });
  }
  return _db;
}

export type Db = ReturnType<typeof db>;

/** Erro 23505 (unique violation) — o Drizzle embrulha em DrizzleQueryError.cause. */
export function isConflict(e: unknown) {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur && typeof cur === "object"; i++) {
    if ((cur as { code?: string }).code === "23505") return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}
