import { NextResponse } from "next/server";
import { sessionUser } from "@/lib/kbos/rbac";

// GET: sessão atual (usado pelos guards client-side das páginas KBOS).
export async function GET() {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role, username: user.username, googleConnected: !!user.googleSubject },
  });
}

// Nome de usuário é escolhido pelo próprio titular, após comprovar o acesso.
export async function PATCH(req: Request) {
 const user=await sessionUser();
 if(!user)return NextResponse.json({error:'Não autenticado.'},{status:401});
 const { z }=await import('zod');
 const { db }=await import('@/lib/kbos/db');
 const { users }=await import('@/lib/kbos/schema');
 const { eq }=await import('drizzle-orm');
 const { ADMIN_EMAIL }=await import('@/lib/kbos/admin-access');
 try{
  const parsed=z.object({username:z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9._-]{2,29}$/)}).safeParse(await req.json());
  if(!parsed.success)return NextResponse.json({error:'Use de 3 a 30 caracteres: letras, números, ponto, hífen ou sublinhado.'},{status:400});
  if(parsed.data.username==='kayque'&&user.email!==ADMIN_EMAIL)return NextResponse.json({error:'Esse usuário está reservado.'},{status:409});
  await db().update(users).set({username:parsed.data.username}).where(eq(users.id,user.id));
  return NextResponse.json({ok:true,username:parsed.data.username});
 }catch{return NextResponse.json({error:'Não foi possível salvar. Esse usuário pode estar em uso.'},{status:409});}
}
