// Cliente Drizzle (Neon HTTP — funciona em serverless e edge).
// Conexão preguiçosa: só exige DATABASE_URL quando a primeira query roda,
// então o `next build` e o site público seguem íntegros sem banco.
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle> | null = null;

export function db() {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL não configurada. Crie um Postgres (Neon/Supabase), " +
          "rode `npx drizzle-kit push` e defina a variável de ambiente."
      );
    }
    _db = drizzle(neon(url), { schema });
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
