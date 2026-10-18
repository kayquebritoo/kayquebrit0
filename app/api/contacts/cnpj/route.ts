import { NextResponse } from "next/server";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { cleanDocument, isValidCNPJ } from "@/lib/kbos/document";
import { withRateLimit } from "@/lib/kbos/rate-limit";

const STAFF = ["admin", "designer", "editor", "fotografo", "programador"] as const;

type BrasilApiCnpj = {
  razao_social?: string;
  nome_fantasia?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  ddd_telefone_1?: string;
  email?: string | null;
  descricao_situacao_cadastral?: string;
};

const title = (s?: string) =>
  (s || "")
    .toLowerCase()
    .replace(/(^|\s|\/|-)(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase())
    .replace(/\b(Da|De|Do|Das|Dos|E)\b/g, (w) => w.toLowerCase())
    .replace(/\b(Ltda|Me|Epp|Eireli|S\/a|Sa)\b/gi, (w) => w.toUpperCase());

// GET /api/contacts/cnpj?doc=00.000.000/0001-00 — preenche o cadastro pela
// Receita (via BrasilAPI, pública e gratuita). Nada é gravado aqui.
export async function GET(req: Request) {
  const user = await sessionUser();
  const denied = deny(user, ...STAFF);
  if (denied) return denied;
  const limited = await withRateLimit(req, "contacts:cnpj");
  if (limited) return limited;
  const doc = cleanDocument(new URL(req.url).searchParams.get("doc") || "");
  if (!isValidCNPJ(doc)) return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${doc}`, { signal: AbortSignal.timeout(8000) });
    if (res.status === 404) return NextResponse.json({ error: "CNPJ não encontrado na Receita." }, { status: 404 });
    if (!res.ok) return NextResponse.json({ error: "Consulta à Receita indisponível agora. Preencha à mão." }, { status: 502 });
    const j = (await res.json()) as BrasilApiCnpj;
    const street = [title(j.logradouro), j.numero, title(j.complemento)].filter(Boolean).join(", ");
    const address = [street, title(j.bairro)].filter(Boolean).join(" — ");
    const phone = (j.ddd_telefone_1 || "").replace(/\D/g, "");
    return NextResponse.json({
      legalName: title(j.razao_social) || null,
      company: title(j.nome_fantasia) || title(j.razao_social) || null,
      address: address || null,
      city: title(j.municipio) || null,
      state: j.uf || null,
      zipCode: j.cep ? String(j.cep).replace(/^(\d{5})(\d{3})$/, "$1-$2") : null,
      phone: phone.length >= 10 ? phone : null,
      email: j.email ? j.email.toLowerCase() : null,
      situation: j.descricao_situacao_cadastral || null,
    });
  } catch {
    return NextResponse.json({ error: "Consulta à Receita demorou demais. Preencha à mão." }, { status: 504 });
  }
}
