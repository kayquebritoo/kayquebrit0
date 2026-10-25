# 2026-10-25 · Claude · Conexões de redes sociais por cliente + correção do callback da Meta

**Mudou**
- Bug: o callback da Meta mandava para `https://0.0.0.0:3000/...` (redirect montado com `req.url` atrás do Caddy).
  Todos os redirects de OAuth agora usam a URL pública (`appUrlEnv()`): Meta, Google contatos, Lume; o magic link
  usa `appUrl(req)` (host encaminhado) no lugar de `url.origin`.
- Provedores em `lib/kbos/social/providers/` com a mesma interface (authUrl, exchangeCode, refresh, listAccounts,
  revoke, publish): Meta (Instagram/Facebook, migrada sem mudar o comportamento), YouTube, Perfil da Empresa no Google,
  TikTok, Pinterest, LinkedIn. Rede nova = um arquivo + uma linha em `providers/index.ts`.
- Login: `/api/social/<rede>/connect/` → `/api/social/<rede>/callback/`. State assinado + cookie de 10 min
  criptografado com o PKCE (Google S256, TikTok hex). A URI antiga da Meta segue funcionando.
- Migração 0030 (aditiva): `kbos_social_connections` (token + refresh criptografados), `kbos_social_connect_links`
  (só o hash do token, 7 dias, um cliente), `kbos_social_audit` (quem, quando, escopos, IP). Contas ganharam
  `provider`/`connection_id`; `token_enc` da conta aceita nulo (nas redes novas o token fica na conexão).
- `social-crypto.ts` v2 com chave própria `SOCIAL_TOKEN_KEY` (gerada pelo menu); v1 (segredo da Meta) ainda abre.
- `social.tick` renova sozinho o que vence em 30 min; publicar usa o provedor da rede e o token da conta do cliente.
- Desconectar revoga na rede quando é a última conta do login (Pinterest não tem revogação por API: aviso ao cliente).
- Telas: card "Suas redes sociais" no portal; `/conectar/<token>/` (link do WhatsApp, sem senha do KBOS);
  Ajustes → Redes sociais (conectar por cliente, criar "Kayque Brito (pessoal)", contas por cliente, Enviar link
  de conexão, auditoria); ficha do projeto com as redes do cliente. Rede sem chave = "Em breve".
- `scripts/kbos-config.sh`: opções 10–13 (Google, TikTok, Pinterest, LinkedIn); opção 9 testa o segredo da Meta
  (`client_credentials`, segredo pelo stdin) antes e depois de colar.
- `docs/CONEXOES-REDES.md`: passo a passo por rede, URIs exatas, escopos e revisões.
- Testes: `social-providers.test.ts` (72) e `social-connections.test.ts` (37). Suite inteira verde.

**Falta**
- Kayque: colar de novo o segredo da Meta (opção 9: o gravado está inválido) e criar os apps das outras redes
  (`docs/CONEXOES-REDES.md`). Revisões: Meta Advanced Access + verificação da empresa (Páginas que ele não
  administra), auditoria do TikTok (antes disso sai "Só eu"), Pinterest Standard, verificação OAuth do Google,
  acesso à API do Perfil da Empresa, Community Management do LinkedIn (páginas de empresa).
- Publicar vídeo no Pinterest/LinkedIn e Story no Facebook; métricas por post (fase 4).
- Olhar as telas no celular (portal, /conectar, Ajustes) e ajustar o visual se precisar.
