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
      for k in AI_BASE_URL AI_MODEL STT_BASE_URL STT_MODEL TTS_BASE_URL ASSISTANT_OWNER_PHONE; do
        printf ' %-22s %s\n' "$k" "$(getvar "$k" | sed 's/^$/—/')"
      done
      for k in AI_API_KEY OPENAI_API_KEY EVOLUTION_API_KEY EVOLUTION_WEBHOOK_TOKEN; do
        v=$(getvar "$k")
        v=${v//\"/}
        if [ ${#v} -lt 4 ]; then s="não configurada"; elif [ "$v" = "kbos-dev-key" ]; then s="PADRÃO (troque: opção 3)"; else s="configurada (…${v: -4})"; fi
        printf ' %-22s %s\n' "$k" "$s"
      done
      for k in GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET; do
        v=$(getvar "$k"); v=${v//\"/}
        if [ -n "$v" ]; then s="configurado"; else s="não configurado"; fi
        printf ' %-22s %s\n' "$k" "$s"
      done
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
    0) exit 0 ;;
    *) echo "Opção inválida." ;;
  esac
done
