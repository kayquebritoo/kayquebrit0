#!/usr/bin/env bash
# Configura o KBOS sem editar o .env à mão.
# Uso (na VPS):  bash /opt/kbos/scripts/kbos-config.sh
# - Chaves são digitadas escondidas (não aparecem na tela nem no histórico).
# - Antes de mudar, guarda uma cópia: /opt/kbos/.env.bak.<data>
# - No fim, reinicia só o que precisa.
set -euo pipefail

ROOT=/opt/kbos
ENV_FILE="$ROOT/.env"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$ROOT/infra/docker-compose.yml")

if [ ! -f "$ENV_FILE" ]; then
  echo "Não achei $ENV_FILE. Rode este script na VPS do KBOS."
  exit 1
fi
cd "$ROOT"
cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%Y%m%d-%H%M%S)"
chmod 600 "$ENV_FILE" "$ENV_FILE".bak.* 2>/dev/null || true

# Grava (ou troca) NOME=valor no .env, sem quebrar com caracteres especiais.
setvar() {
  local tmp
  tmp=$(mktemp)
  K="$1" V="$2" awk 'BEGIN{k=ENVIRON["K"]; v=ENVIRON["V"]; done=0}
    index($0, k"=")==1 {print k"="v; done=1; next} {print}
    END{if(!done) print k"="v}' "$ENV_FILE" >"$tmp"
  cat "$tmp" >"$ENV_FILE"
  rm -f "$tmp"
}
getvar() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true; }

ask_secret() {
  local prompt="$1" val=""
  read -r -s -p "$prompt" val
  echo
  printf '%s' "$val"
}

# Garante a chave que cifra os tokens das redes sociais (nunca é impressa).
ensure_social_key() {
  local cur
  cur=$(getvar SOCIAL_TOKEN_KEY); cur=${cur//\"/}
  if [ ${#cur} -lt 32 ]; then
    setvar SOCIAL_TOKEN_KEY "$(openssl rand -hex 32)"
    echo "Chave de criptografia dos tokens gerada e guardada (não precisa anotar)."
  fi
}

# Testa o par ID/segredo do app da Meta. O segredo vai pelo stdin (não aparece no ps)
# e a resposta (que traz um token) nunca é impressa. Retorno 0 = válido.
meta_secret_ok() {
  local id="$1" secret="$2" resp msg
  resp=$(printf 'client_id=%s&client_secret=%s&grant_type=client_credentials' "$id" "$secret" \
    | curl -s -m 15 -X POST --data @- https://graph.facebook.com/oauth/access_token 2>/dev/null) || resp=""
  if printf '%s' "$resp" | grep -q '"access_token"'; then
    echo "válido"
    return 0
  fi
  echo "INVÁLIDO"
  msg=$(printf '%s' "$resp" | sed -n 's/.*"message" *: *"\([^"]*\)".*/\1/p' | head -1)
  if [ -n "$msg" ]; then echo "  Meta respondeu: $msg"; elif [ -z "$resp" ]; then echo "  (sem resposta da Meta: confira a internet da VPS)"; fi
  return 1
}

profiles=(--profile evolution)
[ "$(getvar STT_BASE_URL)" = "http://whisper:8000/v1" ] && profiles+=(--profile voz)

apply() {
  echo
  echo "Aplicando… (leva até 1 minuto)"
  GIT_SHA=$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo local) "${COMPOSE[@]}" "${profiles[@]}" up -d >/dev/null
  echo "Pronto. Confira em https://kbos.kayquebrito.com.br/admin/"
}

while true; do
  echo
  echo "════════ Configuração do KBOS ════════"
  echo " 1) Cérebro do assistente (chave da IA)"
  echo " 2) Ouvido local: transcrição de áudio na própria VPS (grátis)"
  echo " 3) Trocar a senha da Evolution (gera uma forte sozinho)"
  echo " 4) Meu número de WhatsApp (dono do assistente)"
  echo " 5) Ver o que está configurado (sem mostrar chaves)"
  echo " 6) Ligar o assistente no WhatsApp (protege o webhook com senha)"
  echo " 7) Ativar login com Google"
  echo " 8) Minha voz no assistente (Fish Audio, 24 h no ar)"
  echo " 9) Publicar no Instagram/Facebook (app da Meta)"
 echo "10) YouTube e Perfil da Empresa no Google"
 echo "11) TikTok"
 echo "12) Pinterest"
 echo "13) LinkedIn"
  echo " 0) Sair"
  read -r -p "Escolha: " opt
  case "$opt" in
    1)
      echo
      echo "Qual provedor?"
      echo " a) OpenAI"
      echo " b) Outro compatível com o padrão OpenAI (informo a URL)"
      read -r -p "Escolha [a]: " p
      if [ "${p:-a}" = "b" ]; then
        read -r -p "URL base (ex.: https://…/v1): " url
        setvar AI_BASE_URL "$url"
      else
        setvar AI_BASE_URL "https://api.openai.com/v1"
      fi
      key=$(ask_secret "Cole a chave (não aparece na tela) e dê Enter: ")
      key=$(printf '%s' "$key" | tr -d '[:space:]"')
      if [ ${#key} -ge 20 ]; then
        setvar AI_API_KEY "$key"
        echo "Chave recebida (termina em …${key: -4})."
      else
        echo "Não recebi a chave (veio vazia ou curta). Tente de novo: copie a chave e cole com Cmd+V."
        continue
      fi
      read -r -p "Modelo [$(getvar AI_MODEL | sed 's/^$/gpt-4o-mini/')]: " model
      [ -n "$model" ] && setvar AI_MODEL "$model"
      apply
      ;;
    2)
      setvar STT_BASE_URL "http://whisper:8000/v1"
      setvar STT_MODEL "Systran/faster-whisper-small"
      profiles=(--profile evolution --profile voz)
      echo "Na primeira vez ele baixa o modelo (~500 MB); o primeiro áudio pode demorar."
      apply
      ;;
    3)
      new=$(openssl rand -hex 24)
      setvar EVOLUTION_API_KEY "$new"
      echo "Senha nova gerada e salva (ninguém precisa digitá-la)."
      apply
      echo "Se o WhatsApp mostrar desconectado no painel, abra Conexão do WhatsApp e toque em Reparar."
      ;;
    4)
      read -r -p "Seu número com DDI e DDD (ex.: 5591993743109): " phone
      phone=$(printf '%s' "$phone" | tr -cd '0-9')
      if [ ${#phone} -lt 12 ]; then echo "Número curto demais."; continue; fi
      setvar ASSISTANT_OWNER_PHONE "$phone"
      apply
      ;;
    5)
      echo
      for k in AI_BASE_URL AI_MODEL STT_BASE_URL STT_MODEL TTS_PROVIDER TTS_VOICE ASSISTANT_OWNER_PHONE; do
        printf ' %-22s %s\n' "$k" "$(getvar "$k" | sed 's/^$/—/')"
      done
      for k in AI_API_KEY OPENAI_API_KEY TTS_API_KEY EVOLUTION_API_KEY EVOLUTION_WEBHOOK_TOKEN; do
        v=$(getvar "$k")
        v=${v//\"/}
        if [ ${#v} -lt 4 ]; then s="não configurada"; elif [ "$v" = "kbos-dev-key" ]; then s="PADRÃO (troque: opção 3)"; else s="configurada (…${v: -4})"; fi
        printf ' %-22s %s\n' "$k" "$s"
      done
      for k in GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET META_APP_ID META_APP_SECRET; do
        v=$(getvar "$k"); v=${v//\"/}
        if [ -n "$v" ]; then s="configurado"; else s="não configurado"; fi
        printf ' %-22s %s\n' "$k" "$s"
      done
      for k in SOCIAL_TOKEN_KEY GOOGLE_SOCIAL_CLIENT_ID GOOGLE_SOCIAL_CLIENT_SECRET TIKTOK_CLIENT_KEY TIKTOK_CLIENT_SECRET PINTEREST_APP_ID PINTEREST_APP_SECRET LINKEDIN_CLIENT_ID LINKEDIN_CLIENT_SECRET; do
        v=$(getvar "$k"); v=${v//\"/}
        if [ -n "$v" ]; then s="configurado"; else s="não configurado"; fi
        printf ' %-28s %s\n' "$k" "$s"
      done
      printf ' %-28s %s\n' "TIKTOK_AUDITED" "$(getvar TIKTOK_AUDITED | sed 's/^$/0/')"
      mid=$(getvar META_APP_ID); mid=${mid//\"/}; msec=$(getvar META_APP_SECRET); msec=${msec//\"/}
      if [ -n "$mid" ] && [ -n "$msec" ]; then
        printf ' %-28s ' "Meta (ID + segredo)"
        meta_secret_ok "$mid" "$msec" | head -1 || true
      fi
      unset mid msec
      ;;
    6)
      cur=$(getvar EVOLUTION_WEBHOOK_TOKEN); cur=${cur//\"/}
      # Vazio ou "" (linha antiga do .env.example) conta como sem senha.
      if [ ${#cur} -lt 8 ]; then
        setvar EVOLUTION_WEBHOOK_TOKEN "$(openssl rand -hex 24)"
      fi
      echo "Webhook protegido. O KBOS reaplica a senha na Evolution sozinho ao reiniciar (~20 s)."
      apply
      echo "Agora mande uma mensagem para você mesmo no WhatsApp (conversa 'Você'), ex.: 'o que tenho hoje?'"
      ;;
    7)
      echo
      echo "No Google Cloud, crie um cliente OAuth do tipo Aplicativo da Web."
      echo "URI de redirecionamento autorizada (copie exatamente):"
      echo "https://kbos.kayquebrito.com.br/api/auth/google/callback/"
      echo
      read -r -p "ID do cliente Google: " google_id
      google_id=$(printf '%s' "$google_id" | tr -d '[:space:]\"')
      if [[ ! "$google_id" =~ ^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$ ]]; then
        echo "O ID não parece ser de um cliente OAuth Google. Nada foi alterado."
        continue
      fi
      google_secret=$(ask_secret "Segredo do cliente (não aparece na tela): ")
      google_secret=$(printf '%s' "$google_secret" | tr -d '[:space:]\"')
      if [[ ! "$google_secret" =~ ^[A-Za-z0-9._-]{10,}$ ]]; then
        echo "Segredo vazio ou em formato inesperado. Nada foi alterado."
        unset google_secret
        continue
      fi
      setvar GOOGLE_CLIENT_ID "$google_id"
      setvar GOOGLE_CLIENT_SECRET "$google_secret"
      setvar APP_URL "https://kbos.kayquebrito.com.br"
      unset google_secret
      apply
      echo "Configuração salva. Abra o login e teste Continuar com Google."
      echo "Se o Google usa outro e-mail, conecte-o em Mais > Meu acesso antes de sair da conta."
      ;;
    8)
      echo
      echo "1. Em https://fish.audio crie um modelo de voz com 15–30 s de você falando."
      echo "2. Copie o ID do modelo (está na URL da página do modelo)."
      echo "3. Em https://fish.audio/app/api-keys crie uma chave de API e adicione crédito."
      echo
      read -r -p "ID do modelo de voz: " voice_id
      voice_id=$(printf '%s' "$voice_id" | tr -d '[:space:]"')
      if [ ${#voice_id} -lt 8 ]; then echo "ID curto demais. Nada foi alterado."; continue; fi
      fkey=$(ask_secret "Chave da API do Fish Audio (não aparece na tela): ")
      fkey=$(printf '%s' "$fkey" | tr -d '[:space:]"')
      if [ ${#fkey} -lt 16 ]; then echo "Não recebi a chave. Nada foi alterado."; continue; fi
      setvar TTS_PROVIDER "fish"
      setvar TTS_VOICE "$voice_id"
      setvar TTS_API_KEY "$fkey"
      echo "Chave recebida (termina em …${fkey: -4})."
      unset fkey
      apply
      echo "Pronto. No WhatsApp mande um áudio: 'Fala Kayque, o que tenho hoje?' — a resposta vem na sua voz."
      ;;
    9)
      echo
      echo "Em https://developers.facebook.com/apps crie um app (tipo Empresa) e, em Login do Facebook > Configurações,"
      echo "cole em 'URIs de redirecionamento do OAuth válidos' (exatamente):"
      echo "https://kbos.kayquebrito.com.br/api/social/meta/callback/"
      echo "(a URI antiga .../api/admin/social/meta/callback/ pode continuar lá, ainda funciona)"
      echo "O ID e a Chave Secreta ficam em Configurações do app > Básico."
      echo
      cur_id=$(getvar META_APP_ID); cur_id=${cur_id//\"/}
      cur_sec=$(getvar META_APP_SECRET); cur_sec=${cur_sec//\"/}
      if [ -n "$cur_id" ] && [ -n "$cur_sec" ]; then
        printf 'Testando o par gravado na Meta… '
        if meta_secret_ok "$cur_id" "$cur_sec"; then
          echo "O par gravado está válido. Você pode colar de novo só se quiser trocar."
        else
          echo ">> O segredo gravado está INVÁLIDO: cole de novo."
        fi
      fi
      unset cur_sec
      read -r -p "ID do app da Meta: " meta_id
      meta_id=$(printf '%s' "$meta_id" | tr -cd '0-9')
      if [ ${#meta_id} -lt 8 ]; then echo "O ID do app é só número (uns 15 dígitos). Nada foi alterado."; continue; fi
      meta_secret=$(ask_secret "Chave secreta do app (não aparece na tela): ")
      meta_secret=$(printf '%s' "$meta_secret" | tr -d '[:space:]"')
      if [[ ! "$meta_secret" =~ ^[a-f0-9]{32}$ ]]; then echo "A chave secreta tem 32 letras/números (0-9, a-f). Nada foi alterado."; unset meta_secret; continue; fi
      printf 'Validando o novo par na Meta… '
      if ! meta_secret_ok "$meta_id" "$meta_secret"; then
        echo "!!! ATENÇÃO: a Meta recusou esse ID/segredo. Confira se copiou o ID e a chave do MESMO app (Configurações > Básico)."
        read -r -p "Gravar mesmo assim? [s/N] " force
        if [[ ! "${force:-n}" =~ ^[sSyY]$ ]]; then echo "Nada foi alterado."; unset meta_secret; continue; fi
      fi
      setvar META_APP_ID "$meta_id"
      setvar META_APP_SECRET "$meta_secret"
      setvar APP_URL "https://kbos.kayquebrito.com.br"
      ensure_social_key
      echo "Chave recebida (termina em …${meta_secret: -4})."
      unset meta_secret
      apply
      echo "Agora abra https://kbos.kayquebrito.com.br/admin/ajustes/ e toque em 'Conectar com a Meta'."
      ;;
    10)
      echo
      echo "No Google Cloud (console.cloud.google.com > APIs e serviços > Credenciais), crie um cliente OAuth"
      echo "do tipo Aplicativo da Web e cadastre as DUAS URIs de redirecionamento (exatamente):"
      echo "https://kbos.kayquebrito.com.br/api/social/youtube/callback/"
      echo "https://kbos.kayquebrito.com.br/api/social/google/callback/"
      echo "Ative também as APIs: YouTube Data API v3 e as do Perfil da Empresa (Business Profile)."
      echo
      g_id=""; g_secret=""
      lid=$(getvar GOOGLE_CLIENT_ID); lid=${lid//\"/}; lsec=$(getvar GOOGLE_CLIENT_SECRET); lsec=${lsec//\"/}
      if [ -n "$lid" ] && [ -n "$lsec" ]; then
        read -r -p "Reaproveitar o cliente do login com Google? (precisa ter as 2 URIs acima) [s/N] " reuse
        if [[ "${reuse:-n}" =~ ^[sSyY]$ ]]; then g_id="$lid"; g_secret="$lsec"; fi
      fi
      unset lsec
      if [ -z "$g_id" ]; then
        read -r -p "ID do cliente Google: " g_id
        g_id=$(printf '%s' "$g_id" | tr -d '[:space:]\"')
        if [[ ! "$g_id" =~ ^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$ ]]; then
          echo "O ID não parece ser de um cliente OAuth Google. Nada foi alterado."
          continue
        fi
        g_secret=$(ask_secret "Segredo do cliente (não aparece na tela): ")
        g_secret=$(printf '%s' "$g_secret" | tr -d '[:space:]\"')
        if [[ ! "$g_secret" =~ ^[A-Za-z0-9._-]{10,}$ ]]; then
          echo "Segredo vazio ou em formato inesperado. Nada foi alterado."
          unset g_secret
          continue
        fi
      fi
      setvar GOOGLE_SOCIAL_CLIENT_ID "$g_id"
      setvar GOOGLE_SOCIAL_CLIENT_SECRET "$g_secret"
      setvar APP_URL "https://kbos.kayquebrito.com.br"
      ensure_social_key
      unset g_secret
      apply
      echo "Salvo. Conecte o cliente pelo portal ou por 'Enviar link de conexão'."
      echo "Dica: YouTube pede verificação do app (escopo youtube.upload) e o Perfil da Empresa pede liberação de acesso. Veja docs/CONEXOES-REDES.md."
      ;;
    11)
      echo
      echo "Em https://developers.tiktok.com crie um app, adicione os produtos Login Kit e Content Posting API"
      echo "e cadastre a URI de redirecionamento (exatamente):"
      echo "https://kbos.kayquebrito.com.br/api/social/tiktok/callback/"
      echo "Verifique também o prefixo de URL https://kbos.kayquebrito.com.br/api/public/social-media/ (necessário para postar por link)."
      echo "Client key e Client secret ficam na página do app."
      echo
      read -r -p "Client key do TikTok: " tt_key
      tt_key=$(printf '%s' "$tt_key" | tr -d '[:space:]"')
      if [[ ! "$tt_key" =~ ^[A-Za-z0-9]{8,}$ ]]; then echo "Client key vazia ou em formato inesperado. Nada foi alterado."; continue; fi
      tt_secret=$(ask_secret "Client secret (não aparece na tela): ")
      tt_secret=$(printf '%s' "$tt_secret" | tr -d '[:space:]"')
      if [[ ! "$tt_secret" =~ ^[A-Za-z0-9]{16,}$ ]]; then echo "Client secret vazio ou em formato inesperado. Nada foi alterado."; unset tt_secret; continue; fi
      read -r -p "O app já passou na auditoria de publicação direta do TikTok? [s/N] " tt_aud
      if [[ "${tt_aud:-n}" =~ ^[sSyY]$ ]]; then aud=1; else aud=0; echo "Sem auditoria os posts saem privados ('Só eu')."; fi
      setvar TIKTOK_CLIENT_KEY "$tt_key"
      setvar TIKTOK_CLIENT_SECRET "$tt_secret"
      setvar TIKTOK_AUDITED "$aud"
      setvar APP_URL "https://kbos.kayquebrito.com.br"
      ensure_social_key
      echo "Secret recebido (termina em …${tt_secret: -4})."
      unset tt_secret
      apply
      ;;
    12)
      echo
      echo "Em https://developers.pinterest.com/apps crie um app e cadastre a URI de redirecionamento (exatamente):"
      echo "https://kbos.kayquebrito.com.br/api/social/pinterest/callback/"
      echo "App ID e App secret ficam na página do app."
      echo
      read -r -p "App ID do Pinterest: " pin_id
      pin_id=$(printf '%s' "$pin_id" | tr -cd '0-9')
      if [ ${#pin_id} -lt 5 ]; then echo "O App ID é só número. Nada foi alterado."; continue; fi
      pin_secret=$(ask_secret "App secret (não aparece na tela): ")
      pin_secret=$(printf '%s' "$pin_secret" | tr -d '[:space:]"')
      if [[ ! "$pin_secret" =~ ^[A-Za-z0-9]{16,}$ ]]; then echo "App secret vazio ou em formato inesperado. Nada foi alterado."; unset pin_secret; continue; fi
      setvar PINTEREST_APP_ID "$pin_id"
      setvar PINTEREST_APP_SECRET "$pin_secret"
      setvar APP_URL "https://kbos.kayquebrito.com.br"
      ensure_social_key
      echo "Secret recebido (termina em …${pin_secret: -4})."
      unset pin_secret
      apply
      echo "Em modo Trial os pins só aparecem para você; para postar em público peça acesso Standard."
      ;;
    13)
      echo
      echo "Em https://www.linkedin.com/developers/apps crie um app, ative os produtos"
      echo "'Share on LinkedIn' e 'Sign In with OpenID Connect' e, em Auth, cadastre a URL de redirecionamento (exatamente):"
      echo "https://kbos.kayquebrito.com.br/api/social/linkedin/callback/"
      echo "Client ID e Primary Client Secret ficam na aba Auth."
      echo
      read -r -p "Client ID do LinkedIn: " li_id
      li_id=$(printf '%s' "$li_id" | tr -d '[:space:]"')
      if [[ ! "$li_id" =~ ^[A-Za-z0-9]{8,}$ ]]; then echo "Client ID vazio ou em formato inesperado. Nada foi alterado."; continue; fi
      li_secret=$(ask_secret "Client secret (não aparece na tela): ")
      li_secret=$(printf '%s' "$li_secret" | tr -d '[:space:]"')
      if [[ ! "$li_secret" =~ ^[A-Za-z0-9=_-]{8,}$ ]]; then echo "Client secret vazio ou em formato inesperado. Nada foi alterado."; unset li_secret; continue; fi
      setvar LINKEDIN_CLIENT_ID "$li_id"
      setvar LINKEDIN_CLIENT_SECRET "$li_secret"
      setvar APP_URL "https://kbos.kayquebrito.com.br"
      ensure_social_key
      echo "Secret recebido (termina em …${li_secret: -4})."
      unset li_secret
      apply
      echo "Postar como Página da empresa exige aprovação da Community Management API; perfil pessoal funciona direto."
      ;;
    0) exit 0 ;;
    *) echo "Opção inválida." ;;
  esac
done
