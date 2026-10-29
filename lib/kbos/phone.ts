/** Telefone BR → só dígitos com DDI 55 (o login por WhatsApp exige 12–15 dígitos). */
export function normalizePhone(raw: string | null | undefined): string | null {
  const d = (raw || "").replace(/\D/g, "");
  if (!d) return null;
  const full = d.length === 10 || d.length === 11 ? `55${d}` : d;
  return /^\d{12,15}$/.test(full) ? full : null;
}
