import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { eq } from "drizzle-orm";
import { createElement } from "react";
import { db } from "@/lib/kbos/db";
import { briefings } from "@/lib/kbos/schema";
import { getCategory } from "@/lib/kbos/briefing-forms";
import ContractPdf from "@/lib/kbos/contract-pdf";
import type { ContractData } from "@/lib/kbos/contract-template";

export const dynamic = "force-dynamic";

// GET: compila o briefing em contrato PDF formatado.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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
    await db().update(briefings).set({ status: "contrato_gerado", updatedAt: new Date() }).where(eq(briefings.id, id));
    const buf = await renderToBuffer(createElement(ContractPdf, { data }) as never);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="contrato-${numero}.pdf"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

