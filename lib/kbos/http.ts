// Respostas de erro padronizadas p/ Route Handlers.
//
// Regra: mensagens internas (Postgres/Neon, Redis, provedores externos) NUNCA
// vão para o cliente em produção — ficam no log do servidor. Só o que for
// lançado como `PublicError` (mensagem escrita para o usuário) é exposto.
import { NextResponse } from "next/server";

/** Erro com mensagem segura para o usuário final (ex.: validação de domínio). */
export class PublicError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = "PublicError";
  }
}

const GENERIC = "Erro interno. Tente novamente em instantes.";

/** Converte uma exceção em resposta JSON (loga o detalhe, expõe só o seguro). */
export function serverError(e: unknown, status = 500) {
  if (e instanceof PublicError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  const msg = e instanceof Error ? e.message : String(e ?? "");
  console.error("[KBOS api]", e);
  if (msg.includes("DATABASE_URL")) {
    return NextResponse.json({ error: "Banco de dados indisponível." }, { status: 503 });
  }
  // Em dev, o detalhe acelera o diagnóstico; em produção, só a mensagem genérica.
  const expose = process.env.NODE_ENV !== "production" && msg;
  return NextResponse.json({ error: expose || GENERIC }, { status });
}
