# Conexões de redes sociais por cliente

Guia do Kayque para criar os apps de cada rede, registrar as URIs certas e saber o que cada conexão publica hoje. Chaves entram sempre pelo `scripts/kbos-config.sh` (digitadas escondidas, nada vai para o git).

Domínio: `https://kbos.kayquebrito.com.br`. Link público dos arquivos que as redes baixam: `https://kbos.kayquebrito.com.br/api/public/social-media/<token>/arquivo.ext`.

## Como funciona para o cliente

- **No portal:** o cliente abre `/portal`, vai em "Suas redes sociais" e toca no botão da rede.
- **Por link:** você gera "Enviar link de conexão" em Ajustes > Redes sociais ou no painel do projeto. O link vale 7 dias e é de um cliente só.
- O login acontece no site oficial da rede. O KBOS nunca pede nem vê a senha.
- Tokens ficam cifrados (AES-256-GCM) com `SOCIAL_TOKEN_KEY`. Trocar essa chave obriga a reconectar tudo; o script gera sozinho e não mostra.
- A renovação dos tokens é automática.
- "Desconectar" revoga o acesso na rede. No Pinterest o cliente também precisa remover o app nas configurações dele.
- Todo conectar, desconectar e publicar vai para o log de auditoria em Ajustes.

## Resumo

| Rede | Opção do script | Publica hoje |
|---|---|---|
| Meta (Instagram + Facebook) | 9 | Posts em Página do Facebook e Instagram profissional |
| YouTube | 10 | Somente vídeo |
| Perfil da Empresa (Google) | 10 | Foto + texto |
| TikTok | 11 | Vídeo (privado "Só eu" até a auditoria) |
| Pinterest | 12 | Somente imagem (pin) |
| LinkedIn | 13 | Somente imagem + texto (perfil pessoal) |

## Meta (Instagram e Facebook) — opção 9

1. Em https://developers.facebook.com/apps crie um app do tipo Empresa.
2. Adicione o produto Login do Facebook. Em Configurações, "URIs de redirecionamento do OAuth válidos":
   - `https://kbos.kayquebrito.com.br/api/social/meta/callback/`
   - A antiga `https://kbos.kayquebrito.com.br/api/admin/social/meta/callback/` ainda funciona e pode ficar.
3. ID e Chave Secreta: Configurações do app > Básico.
4. Rode a opção 9. O script testa o par na Meta antes de gravar.

Permissões pedidas: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `read_insights`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`, `business_management`.

Publica: foto/vídeo no Instagram e post na Página do Facebook.

Revisão:
- **Modo desenvolvimento:** publica só em Páginas que o Kayque administra.
- **Clientes cujas Páginas você não administra:** precisa de Acesso Avançado (App Review) e Verificação da Empresa. Confira no painel da Meta.
- O Instagram precisa ser conta profissional e estar vinculado a uma Página.

## YouTube e Perfil da Empresa no Google — opção 10

1. Em https://console.cloud.google.com crie ou escolha um projeto.
2. Ative: YouTube Data API v3 e as APIs do Business Profile (Account Management, Business Information e a API de posts locais).
3. Tela de consentimento OAuth: preencha e adicione os escopos abaixo.
4. Credenciais > Criar ID do cliente OAuth > Aplicativo da Web, com as duas URIs:
   - `https://kbos.kayquebrito.com.br/api/social/youtube/callback/`
   - `https://kbos.kayquebrito.com.br/api/social/google/callback/`
5. Rode a opção 10. É um cliente separado do `GOOGLE_CLIENT_ID` do login; o script oferece reaproveitar o do login (só se ele tiver as duas URIs acima).

Escopos: YouTube `youtube.upload` e `youtube.readonly`; Perfil da Empresa `business.manage`.

Publica: YouTube somente vídeo; Perfil da Empresa foto + texto.

Revisão e limites:
- `youtube.upload` é escopo sensível: exige verificação da tela de consentimento. Antes disso o app fica em teste (só usuários de teste cadastrados).
- Cota padrão da YouTube Data API é 10 mil unidades por dia, ou seja, uns 6 uploads por dia. Confira no painel; dá para pedir aumento.
- A Business Profile API exige formulário de solicitação de acesso e começa com cota 0 até aprovarem.

## TikTok — opção 11

1. Em https://developers.tiktok.com crie um app.
2. Adicione Login Kit e Content Posting API. Redirect URI:
   - `https://kbos.kayquebrito.com.br/api/social/tiktok/callback/`
3. Verifique o domínio/prefixo de URL `https://kbos.kayquebrito.com.br/api/public/social-media/` no portal do TikTok (o envio é por PULL_FROM_URL, o TikTok baixa o vídeo do nosso link).
4. Client key e Client secret: página do app. Rode a opção 11; ela pergunta se o app já passou na auditoria (`TIKTOK_AUDITED`).

Escopos: `user.info.basic`, `video.publish`.

Publica: vídeo.

Revisão:
- A Content Posting API precisa de aprovação (app review).
- Publicação direta exige auditoria. Até lá, todo post sai privado ("Só eu"). Depois de aprovado, rode a opção 11 de novo e responda "sim" para `TIKTOK_AUDITED=1`.

## Pinterest — opção 12

1. Em https://developers.pinterest.com/apps crie um app.
2. Redirect URI: `https://kbos.kayquebrito.com.br/api/social/pinterest/callback/`
3. App ID e App secret na página do app. Rode a opção 12.

Escopos: `user_accounts:read`, `boards:read`, `pins:read`, `pins:write`.

Publica: somente imagem (pin).

Revisão: o app começa em acesso Trial; para postar em público é preciso pedir acesso Standard. Confira no painel da rede. Para desconectar, o cliente remove o app nas configurações do Pinterest.

## LinkedIn — opção 13

1. Em https://www.linkedin.com/developers/apps crie um app (precisa de uma Página da empresa associada).
2. Aba Products: peça "Share on LinkedIn" e "Sign In with OpenID Connect" (liberação direta).
3. Aba Auth: Authorized redirect URL: `https://kbos.kayquebrito.com.br/api/social/linkedin/callback/`
4. Client ID e Primary Client Secret ficam em Auth. Rode a opção 13. Versão da API: `LINKEDIN_VERSION` (padrão 202506).

Escopos: `openid`, `profile`, `w_member_social`.

Publica: somente imagem + texto, no perfil pessoal do cliente.

Revisão: postar como Página da empresa exige a Community Management API, que passa por análise do LinkedIn. Confira no painel da rede.

## O que o Kayque precisa fazer

1. **Meta primeiro:** o segredo gravado está inválido. Rode `bash /opt/kbos/scripts/kbos-config.sh`, opção 9, e cole o ID e a Chave Secreta de novo (Configurações do app > Básico). Registre também a URI nova.
2. Conectar uma Página sua de teste e publicar um post para validar o fluxo.
3. Se for atender clientes com Páginas que você não administra: Acesso Avançado e Verificação da Empresa na Meta.
4. Google (opção 10): criar o cliente, enviar a tela de consentimento para verificação e pedir acesso à Business Profile API.
5. TikTok (opção 11): verificar o prefixo de URL, pedir a aprovação da Content Posting API e depois a auditoria.
6. Pinterest (opção 12): criar o app e pedir acesso Standard.
7. LinkedIn (opção 13): criar o app e, se precisar de Página da empresa, pedir a Community Management API.
8. Guardar a `SOCIAL_TOKEN_KEY` em um backup seguro do `.env`: perdê-la obriga todos os clientes a reconectar.
