// Redes nos botões de conexão: rótulo, provedor do login e a marquinha colorida (só o selo pequeno usa a cor da rede).
export type NetInfo = { network: string; provider: string; label: string; short: string; bg: string };

export const NETS: NetInfo[] = [
  { network: "instagram", provider: "meta", label: "Instagram", short: "IG", bg: "linear-gradient(135deg,#F58529,#DD2A7B 55%,#8134AF)" },
  { network: "facebook", provider: "meta", label: "Facebook", short: "f", bg: "#1877F2" },
  { network: "youtube", provider: "youtube", label: "YouTube", short: "▶", bg: "#FF0033" },
  { network: "google", provider: "google", label: "Perfil da Empresa no Google", short: "G", bg: "linear-gradient(135deg,#4285F4,#34A853 60%,#FBBC05)" },
  { network: "tiktok", provider: "tiktok", label: "TikTok", short: "♪", bg: "linear-gradient(135deg,#111,#25F4EE 140%)" },
  { network: "pinterest", provider: "pinterest", label: "Pinterest", short: "P", bg: "#E60023" },
  { network: "linkedin", provider: "linkedin", label: "LinkedIn", short: "in", bg: "#0A66C2" },
];
export const netInfo = (network: string) => NETS.find((n) => n.network === network) ?? { network, provider: network, label: network, short: network.slice(0, 2), bg: "#4F12C7" };

export function NetMark({ network, size = 40 }: { network: string; size?: number }) {
  const n = netInfo(network);
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-xl font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.25)]" style={{ width: size, height: size, background: n.bg, fontSize: size * 0.36 }}>
      {n.short}
    </span>
  );
}

export type ProviderInfo = { id: string; label: string; networks: string[]; canPublish: boolean; configured: boolean; scopes?: string[] };
export type SocialAccount = {
  id: string; projectId?: string | null; project?: string | null; network: string; provider?: string | null; name: string; username: string | null; pictureUrl: string | null;
  status: string; lastError?: string | null; via?: string | null; connectedAt?: string | null; connectedBy?: string | null; scopes?: string | null;
};

/** Volta do login (?redes=…): frase curta para quem acabou de conectar. */
export function returnMessage(sp: URLSearchParams) {
  const r = sp.get("redes");
  if (!r) return "";
  const rede = sp.get("rede");
  const label = rede ? NETS.find((n) => n.provider === rede)?.label ?? rede : "a rede";
  const n = Number(sp.get("contas") || 0);
  const map: Record<string, string> = {
    ok: `Pronto! ${n} ${n === 1 ? "conta conectada" : "contas conectadas"}.`,
    cancelado: "Login cancelado. Nada foi conectado.",
    estado: "O login expirou ou foi aberto em outra aba. Tente de novo.",
    embreve: `${label} ainda não está disponível por aqui.`,
    vazio: "Esse login não trouxe nenhuma conta. Confira se o perfil é profissional e se você é administrador da página.",
    erro: `${label} recusou: ${sp.get("msg") || "erro desconhecido"}`,
    projeto: "Escolha a empresa antes de conectar.",
  };
  return map[r] ?? "";
}

export const connectHref = (provider: string, q: { project?: string | null; link?: string; back?: string }) => {
  const qs = new URLSearchParams();
  if (q.link) qs.set("link", q.link);
  if (q.project) qs.set("project", q.project);
  if (q.back) qs.set("back", q.back);
  return `/api/social/${provider}/connect/?${qs}`;
};
