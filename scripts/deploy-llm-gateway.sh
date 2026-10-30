#!/usr/bin/env bash
#
# deploy-llm-gateway.sh — Adiciona/remove o serviço llm-gateway ao docker-compose
# da VPS de forma reversível. Não afeta containers existentes (web, worker, redis, db, evolution).
#
# Uso:
#   ./deploy-llm-gateway.sh add    # adiciona o serviço ao compose e sobe (após aprovação)
#   ./deploy-llm-gateway.sh remove # remove o serviço e derruba o container (rollback)
#
# Rode a partir de /opt/kbos na VPS. Requer /opt/kbos/.env com OPENROUTER_API_KEY e
# LITELLM_MASTER_KEY preenchidos (valores nunca committados).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

ENV_FILE="/opt/kbos/.env"
COMPOSE_FILE="infra/docker-compose.yml"
GATEWAY_SERVICE="llm-gateway"

log() { printf '[deploy-llm-gateway %s] %s\n' "$(date -u +%FT%TZ)" "$*"; }

require_env_var() {
  local var="$1"
  if ! grep -q "^${var}=" "$ENV_FILE" 2>/dev/null; then
    log "ERRO: ${var} não definido em $ENV_FILE. Abortando."
    exit 1
  fi
}

cmd_add() {
  log "Verificando pré-requisitos…"
  [ -f "$ENV_FILE" ] || { log "ERRO: $ENV_FILE não encontrado. Crie a partir de infra/.env.vps.example."; exit 1; }
  require_env_var OPENROUTER_API_KEY
  require_env_var LITELLM_MASTER_KEY

  log "Verificando se serviço $GATEWAY_SERVICE já existe no compose…"
  if grep -q "^  ${GATEWAY_SERVICE}:" "$COMPOSE_FILE"; then
    log "Serviço $GATEWAY_SERVICE já está no compose. Nada a fazer."
    exit 0
  fi

  log "Inserindo serviço $GATEWAY_SERVICE no compose (antes do serviço whisper)…"
  # Insere o bloco do gateway antes do comentário do whisper.
  # O bloco deve já estar no compose (adicionado neste commit). Só ativamos via up.
  if ! grep -q "llm-gateway" "$COMPOSE_FILE"; then
    log "ERRO: bloco llm-gateway não encontrado em $COMPOSE_FILE. Verifique o commit."
    exit 1
  fi

  log "Subindo container llm-gateway (isolado, porta 127.0.0.1:4000)…"
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build llm-gateway

  log "Aguardando health check (até ~60s)…"
  OK=0
  for _ in $(seq 1 12); do
    if curl -sf http://127.0.0.1:4000/health >/dev/null 2>&1; then OK=1; break; fi
    sleep 5
  done
  if [ "$OK" = 1 ]; then
    log "llm-gateway saudável em http://127.0.0.1:4000/health"
  else
    log "AVISO: health check não respondeu. Ver logs: docker compose logs llm-gateway"
    exit 1
  fi

  log "Validação de bloqueio de modelo pago (deve rejeitar antes da rede)…"
  BLOCKED=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:4000/v1/chat/completions \
    -H "Authorization: Bearer ${LITELLM_MASTER_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"model":"openai/gpt-5.4","messages":[{"role":"user","content":"oi"}]}' 2>/dev/null || true)
  if [ "$BLOCKED" = "400" ]; then
    log "OK: modelo pago bloqueado com 400 (sem chamada de rede)."
  else
    log "AVISO: modelo pago retornou HTTP $BLOCKED (revisar allowlist)."
  fi

  log "Validação de modelo gratuito (deve permitir, custo US$ 0,00)…"
  FREE_OK=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:4000/v1/chat/completions \
    -H "Authorization: Bearer ${LITELLM_MASTER_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"model":"openrouter/cohere/north-mini-code:free","messages":[{"role":"user","content":"oi"}]}' 2>/dev/null || true)
  if [ "$FREE_OK" = "200" ]; then
    log "OK: modelo gratuito acessível (HTTP 200)."
  else
    log "AVISO: modelo gratuito retornou HTTP $FREE_OK (verificar cota OpenRouter)."
  fi
}

cmd_remove() {
  log "Removendo container llm-gateway (rollback)…"
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" stop llm-gateway 2>/dev/null || true
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" rm -f llm-gateway 2>/dev/null || true
  log "llm-gateway removido. Serviços existentes (web, worker, redis, db, evolution) inalterados."
}

case "${1:-}" in
  add)   cmd_add ;;
  remove) cmd_remove ;;
  *)
    echo "Uso: $0 add|remove" >&2
    exit 2
    ;;
esac
