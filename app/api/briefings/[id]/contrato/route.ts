import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { and, eq, inArray } from "drizzle-orm";
import { createElement } from "react";
import { db } from "@/lib/kbos/db";
import { briefings } from "@/lib/kbos/schema";
import { getCategory } from "@/lib/kbos/briefing-forms";
import ContractPdf from "@/lib/kbos/contract-pdf";
import type { ContractData } from "@/lib/kbos/contract-template";
import { checkId } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";

export const dynamic = "force-dynamic";

// GET: compila o briefing em contrato PDF formatado.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const bad = checkId(id);
    if (bad) return bad;
    const row = (await db().select().from(briefings).where(eq(briefings.id, id)).limit(1))[0];
    if (!row) return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
    const cat = getCategory(row.categoria);
    const numero = `${new Date().getFullYear()}-${row.id.slice(0, 8).toUpperCase()}`;
    const byName = new Map((cat?.fields ?? []).map((f) => [f.name, f.label]));
    const data: ContractData = {
      numero,
      data: new Date().toLocaleDateString("pt-BR"),
      contratanteNome: row.clienteNome,
      contratanteEmail: row.clienteEmail,
      contratanteTel: row.clienteTel || "—",
      objeto: `serviços de ${cat?.label ?? row.categoria}`,
      categoria: cat?.label ?? row.categoria,
      prazo: String(row.respostas.prazo || row.respostas.data_evento || row.respostas.data_gravacao || "a combinar"),
      valor: String(row.respostas.orcamento ? `faixa informada: R$ ${row.respostas.orcamento}` : "a definir em proposta"),
      resumoBriefing: Object.entries(row.respostas).map(([k, v]) => ({
        pergunta: byName.get(k) ?? k,
        resposta: v,
      })),
    };
    // Rota pública (link por capacidade): só AVANÇA o funil — nunca reabre um
    // briefing arquivado ao ser acessado de novo pelo cliente.
    await db()
      .update(briefings)
      .set({ status: "contrato_gerado", updatedAt: new Date() })
      .where(and(eq(briefings.id, id), inArray(briefings.status, ["novo", "em_analise", "aprovado"])));
    const buf = await renderToBuffer(createElement(ContractPdf, { data }) as never);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="contrato-${numero}.pdf"`,
      },
    });
  } catch (e) {
    return serverError(e);
  }
}

