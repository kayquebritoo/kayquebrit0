import type { ReactNode } from "react";

// Redes nos botões de conexão: rótulo, provedor do login e o ícone vetorial oficial de cada plataforma.
export type NetInfo = {
  network: string;
  provider: string;
  label: string;
  short: string;
  bg: string;
  connectable?: boolean;
};

export const NETS: NetInfo[] = [
  {
    network: "instagram",
    provider: "meta",
    label: "Instagram",
    short: "IG",
    bg: "radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 8%, #fd5949 45%, #d6249f 65%, #285AEB 95%)",
    connectable: true,
  },
  {
    network: "facebook",
    provider: "meta",
    label: "Facebook",
    short: "f",
    bg: "#1877F2",
    connectable: true,
  },
  {
    network: "youtube",
    provider: "youtube",
    label: "YouTube",
    short: "YT",
    bg: "#FF0033",
    connectable: true,
  },
  {
    network: "google",
    provider: "google",
    label: "Perfil da Empresa no Google",
    short: "G",
    bg: "#4285F4",
    connectable: true,
  },
  {
    network: "tiktok",
    provider: "tiktok",
    label: "TikTok",
    short: "TT",
    bg: "#0B0B14",
    connectable: true,
  },
  {
    network: "pinterest",
    provider: "pinterest",
    label: "Pinterest",
    short: "P",
    bg: "#E60023",
    connectable: true,
  },
  {
    network: "linkedin",
    provider: "linkedin",
    label: "LinkedIn",
    short: "in",
    bg: "#0A66C2",
    connectable: true,
  },
  {
    network: "threads",
    provider: "meta",
    label: "Threads",
    short: "@",
    bg: "#14141F",
    connectable: false,
  },
];

export const CONNECTABLE_NETS = NETS.filter((n) => n.connectable !== false);

export const netInfo = (network: string): NetInfo =>
  NETS.find((n) => n.network === network) ?? {
    network,
    provider: network,
    label: network,
    short: network.slice(0, 2).toUpperCase(),
    bg: "#4F12C7",
  };

function NetIconSvg({ network, size }: { network: string; size: number }): ReactNode {
  const s = Math.round(size * 0.54);
  switch (network) {
    case "instagram":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
          <circle cx="12" cy="12" r="4.2" />
          <circle cx="17.6" cy="6.4" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      );
    case "facebook":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
          <path d="M13.6 21v-8.2h2.76l.41-3.2H13.6V7.56c0-.93.26-1.56 1.59-1.56h1.7V3.14c-.3-.04-1.3-.14-2.48-.14-2.45 0-4.13 1.5-4.13 4.24v2.36H7.5v3.2h2.78V21h3.32Z" />
        </svg>
      );
    case "youtube":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
          <path d="M21.58 7.19a2.75 2.75 0 0 0-1.94-1.94C17.92 4.8 12 4.8 12 4.8s-5.92 0-7.64.45a2.75 2.75 0 0 0-1.94 1.94C2 8.9 2 12 2 12s0 3.1.42 4.81c.25.96.98 1.7 1.94 1.94 1.72.45 7.64.45 7.64.45s5.92 0 7.64-.45a2.75 2.75 0 0 0 1.94-1.94C22 15.1 22 12 22 12s0-3.1-.42-4.81ZM10 15.15v-6.3L15.45 12 10 15.15Z" />
        </svg>
      );
    case "google":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
          <path d="M21.35 11.1H12v2.92h5.35c-.23 1.38-1.02 2.55-2.18 3.33v2.77h3.53c2.06-1.9 3.25-4.7 3.25-8.02 0-.67-.06-1.33-.18-1.98l-.42-.02ZM12 21.5c2.97 0 5.46-.98 7.28-2.66l-3.53-2.77c-.98.66-2.24 1.06-3.75 1.06-2.88 0-5.32-1.95-6.2-4.57H2.15v2.86A10.99 10.99 0 0 0 12 21.5ZM5.8 12.56A6.6 6.6 0 0 1 5.45 10.5c0-.72.13-1.41.35-2.06V5.58H2.15a11 11 0 0 0 0 9.84l3.65-2.86ZM12 3.88c1.62 0 3.07.56 4.21 1.65l3.15-3.15C17.45.6 14.97-.5 12-.5A10.99 10.99 0 0 0 2.15 5.58L5.8 8.44c.88-2.62 3.32-4.56 6.2-4.56Z" transform="translate(0 1.5) scale(0.95)" />
        </svg>
      );
    case "tiktok":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
          <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.24-1.48Z" />
        </svg>
      );
    case "pinterest":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.14 2C6.57 2 3.5 5.57 3.5 9.48c0 1.8.99 4.05 2.58 4.76.24.11.37.06.42-.16.05-.17.26-1.05.36-1.46.03-.13.02-.25-.09-.38-.52-.62-.94-1.75-.94-2.81 0-2.72 2.14-5.36 5.78-5.36 3.15 0 5.36 2.04 5.36 4.96 0 3.3-1.74 5.58-4 5.58-1.25 0-2.19-1.03-1.89-2.3.36-1.51 1.06-3.14 1.06-4.23 0-.98-.52-1.79-1.6-1.79-1.27 0-2.3 1.31-2.3 3.07 0 1.12.38 1.88.38 1.88s-1.26 5.33-1.5 6.34c-.26 1.11-.04 2.66-.01 2.8.02.08.11.11.16.04.08-.1 1.09-1.54 1.38-2.58.11-.39.55-2.16.55-2.16.29.55 1.13 1.02 2.02 1.02 2.66 0 4.59-2.4 4.59-5.38C19.81 5.95 16.58 2 12.14 2Z" />
        </svg>
      );
    case "linkedin":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
          <path d="M6.94 8.5H3.56V20h3.38V8.5ZM5.25 3A2.02 2.02 0 0 0 3.2 5.04c0 1.12.9 2.03 2.01 2.03h.03c1.14 0 2.04-.91 2.04-2.03C7.26 3.9 6.38 3 5.25 3ZM20.8 13.4c0-3.47-1.85-5.08-4.33-5.08-1.99 0-2.89 1.1-3.39 1.87V8.5H9.7c.04.96 0 11.5 0 11.5h3.38v-6.42c0-.34.03-.69.13-.93.27-.69.89-1.4 1.93-1.4 1.36 0 1.9 1.04 1.9 2.56V20h3.38v-6.6h.38Z" />
        </svg>
      );
    case "threads":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16.5 12c0 2.48-2.02 4.5-4.5 4.5S7.5 14.48 7.5 12 9.52 7.5 12 7.5c1.8 0 3.35 1.06 4.07 2.59.43.91.43 2.83-.32 3.66-.75.83-2.25.75-2.75-.5V8.5" />
          <path d="M19.2 15.8A8.5 8.5 0 1 1 20.5 12" />
        </svg>
      );
    default:
      return null;
  }
}

export function NetMark({ network, size = 40 }: { network: string; size?: number }) {
  const n = netInfo(network);
  const icon = NetIconSvg({ network: n.network, size });
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-xl border border-white/15 font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.28)]"
      style={{ width: size, height: size, background: n.bg, fontSize: size * 0.36 }}
    >
      {icon ?? n.short}
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
  const label = rede ? (NETS.find((n) => n.network === rede)?.label ?? NETS.find((n) => n.provider === rede)?.label ?? rede) : "a rede";
  const n = Number(sp.get("contas") || 0);
  const map: Record<string, string> = {
    ok: `Pronto! ${n} ${n === 1 ? "conta conectada" : "contas conectadas"} (${label}).`,
    cancelado: "Login cancelado. Nada foi conectado.",
    estado: "O login expirou ou foi aberto em outra aba. Tente de novo.",
    embreve: `${label} ainda não está disponível por aqui.`,
    vazio: "Esse login não trouxe nenhuma conta. Confira se o perfil é profissional e se você é administrador da página.",
    vazio_ig: "Nenhuma conta de Instagram profissional veio nesse login. Certifique-se de marcar os perfis de Instagram na janela de permissão da Meta e de que cada Instagram é conta Profissional vinculada a uma Página do Facebook.",
    erro: `${label} recusou: ${sp.get("msg") || "erro desconhecido"}`,
    projeto: "Escolha a empresa antes de conectar.",
  };
  return map[r] ?? "";
}

export const connectHref = (
  providerOrNet: string,
  q: { project?: string | null; link?: string; back?: string; network?: string | null; prompt?: boolean },
) => {
  const net = NETS.find((n) => n.network === providerOrNet);
  const provider = net ? net.provider : providerOrNet;
  const network = q.network ?? (net && net.provider === "meta" ? net.network : null);
  const qs = new URLSearchParams();
  if (q.link) qs.set("link", q.link);
  if (q.project) qs.set("project", q.project);
  if (q.back) qs.set("back", q.back);
  if (network) qs.set("network", network);
  if (q.prompt) qs.set("prompt", "1");
  return `/api/social/${provider}/connect/?${qs}`;
};
