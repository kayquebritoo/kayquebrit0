import { NextResponse } from "next/server";
import { z } from "zod";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { commitStatement } from "@/lib/kbos/statement-import-db";

export const dynamic = "force-dynamic";
const body = z.object({
  scope: z.enum(["pessoal", "empresa"]),
  rows: z.array(z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    descricao: z.string().min(1).max(200),
    valor: z.number().positive().max(100_000_000),
    tipo: z.enum(["entrada", "saida"]),
    categoria: z.string().max(60).nullable(),
  })).max(5000),
});

// POST: grava os lançamentos novos (os repetidos são ignorados pela chave).
export async function POST(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  try {
    const parsed = await readBody(req, body);
    if ("error" in parsed) return parsed.error;
    const r = await commitStatement(parsed.data.rows, parsed.data.scope);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return serverError(e);
  }
}
