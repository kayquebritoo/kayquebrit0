import { NextResponse } from "next/server";
import { deny, sessionUser } from "@/lib/kbos/rbac";
import { companyBody, readBody } from "@/lib/kbos/validators";
import { serverError } from "@/lib/kbos/http";
import { createCompany, listCompanies } from "@/lib/kbos/companies";

export const dynamic = "force-dynamic";

// GET /api/admin/companies — empresas com acessos e projetos ligados.
export async function GET() {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  try {
    return NextResponse.json({ items: await listCompanies() });
  } catch (e) {
    return serverError(e);
  }
}

// POST /api/admin/companies { name, parentId?, contactId?, lumePasta?, brandPlanId? }
export async function POST(req: Request) {
  const denied = deny(await sessionUser(), "admin");
  if (denied) return denied;
  try {
    const parsed = await readBody(req, companyBody);
    if ("error" in parsed) return parsed.error;
    return NextResponse.json({ item: await createCompany(parsed.data) }, { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
