// Quantos posts por mês o plano do projeto cobre (carrossel + estático + vídeo somados).
// null no banco = padrão (50 nos projetos de redes sociais, sem limite nos demais); 0 = sem limite; N = limite do plano.
export const DEFAULT_SOCIAL_LIMIT = 50;
export function effectivePostLimit(categoria: string, postLimit: number | null | undefined): number | null {
  if (postLimit === 0) return null;
  if (typeof postLimit === "number" && postLimit > 0) return postLimit;
  return categoria === "social" ? DEFAULT_SOCIAL_LIMIT : null;
}
