import { NextResponse } from "next/server";
import { z } from "zod";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { parseStatement } from "@/lib/kbos/statement-import";
import { previewStatement } from "@/lib/kbos/statement-import-db";

export const dynamic = "force-dynamic";
const body = z.object({ text: z.string().min(1).max(6_000_000) });

// POST: lê o CSV/OFX do extrato e mostra o que é novo e o que já foi importado.
export async function POST(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, "admin");
  if (denied) return denied;
  try {
    const parsed = await readBody(req, body);
    if ("error" in parsed) return parsed.error;
    const rows = parseStatement(parsed.data.text).slice(0, 5000);
    if (rows.length === 0) return NextResponse.json({ error: "Não encontrei lançamentos. Use o extrato em CSV ou OFX (com colunas de data e valor)." }, { status: 400 });
    const items = await previewStatement(rows);
    return NextResponse.json({ items, fresh: items.filter((i) => !i.duplicate).length, duplicates: items.filter((i) => i.duplicate).length });
  } catch (e) {
    return serverError(e);
  }
}
