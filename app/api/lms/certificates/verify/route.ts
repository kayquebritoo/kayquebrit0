import { NextResponse } from "next/server";
import { verifyCertificate } from "@/lib/kbos/lms";

// GET ?codigo=KBOS-XXXX-XXXX — verificação pública de autenticidade.
export async function GET(req: Request) {
  const codigo = new URL(req.url).searchParams.get("codigo") || "";
  if (!codigo.trim()) {
    return NextResponse.json({ valido: false, error: "Informe o código." }, { status: 400 });
  }
  try {
    const result = await verifyCertificate(codigo);
    if (!result.valido) {
      return NextResponse.json({ valido: false }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
