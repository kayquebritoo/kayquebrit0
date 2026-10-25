// Instagram + Facebook pela Meta: o login traz as Páginas e o Instagram profissional ligado a cada uma.
// A Meta não usa PKCE no fluxo web com segredo; o state assinado + cookie protege contra CSRF.
import { exchangeCode, listMetaAccounts, META_SCOPES, metaConfigured, metaLoginUrl, publishFacebook, publishInstagram, revokeMeta } from "../../meta";
import type { SocialProvider } from "../types";

export const metaProvider: SocialProvider = {
  id: "meta",
  label: "Instagram e Facebook",
  networks: ["instagram", "facebook"],
  scopes: META_SCOPES,
  pkce: false,
  canPublish: true,
  configured: metaConfigured,
  authUrl: ({ redirectUri, state }) => metaLoginUrl(redirectUri, state),
  async exchangeCode({ code, redirectUri }, f) {
    const t = await exchangeCode(code, redirectUri, f);
    return { accessToken: t.token, expiresAt: t.expiresAt, scopes: META_SCOPES };
  },
  // O token de usuário longo (~60 dias) não renova sem a pessoa; os tokens de Página tirados dele não vencem.
  listAccounts: (t, f) => listMetaAccounts(t.accessToken, f),
  revoke: (token, f) => revokeMeta(token, f),
  publish: (network, acc, input, f) => (network === "instagram" ? publishInstagram(acc.externalId, acc.token, input, f) : publishFacebook(acc.pageId ?? acc.externalId, acc.token, input, f)),
};
