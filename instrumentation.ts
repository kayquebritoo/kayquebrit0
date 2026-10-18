// Roda uma vez quando o servidor sobe: garante as colunas novas do banco
// antes de atender requisições (o deploy da VPS não roda drizzle-kit).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.DATABASE_URL) return;
  try {
    const { ensureSchema } = await import("./lib/kbos/migrations");
    // Teto de 20s: banco lento não pode segurar o boot para sempre.
    await Promise.race([ensureSchema(), new Promise((r) => setTimeout(r, 20_000))]);
  } catch (e) {
    console.error("[kbos] ensureSchema no boot falhou:", e);
  }
}
