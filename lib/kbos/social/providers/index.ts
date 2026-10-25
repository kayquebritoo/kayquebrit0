// Registro dos provedores. Rede nova = um arquivo aqui ao lado com a mesma interface + uma linha na lista.
import type { ProviderId, SocialProvider } from "../types";
import { metaProvider } from "./meta";
import { googleBusinessProvider, youtubeProvider } from "./google";
import { tiktokProvider } from "./tiktok";
import { pinterestProvider } from "./pinterest";
import { linkedinProvider } from "./linkedin";

export const PROVIDERS: SocialProvider[] = [metaProvider, youtubeProvider, googleBusinessProvider, tiktokProvider, pinterestProvider, linkedinProvider];
const BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));

export const isProviderId = (v: string): v is ProviderId => BY_ID.has(v as ProviderId);
export const providerById = (id: string) => BY_ID.get(id as ProviderId) ?? null;
/** Provedor que publica numa rede (instagram → meta, youtube → youtube…). */
export const providerForNetwork = (network: string) => PROVIDERS.find((p) => p.networks.includes(network)) ?? null;
/** Redes em que o KBOS sabe publicar (com ou sem chave configurada). */
export const PUBLISH_NETWORKS = PROVIDERS.filter((p) => p.canPublish).flatMap((p) => p.networks);
