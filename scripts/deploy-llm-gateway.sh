#!/usr/bin/env bash
# deploy-llm-gateway.sh - sobe/remove SOMENTE o servico llm-gateway (reversivel).
# Nao toca web, worker, redis, db, evolution. Rode de qualquer lugar.
#   add    -> build + up -d do llm-gateway e testes (pago=400, gratuito=200)
#   test   -> so os testes
#   remove -> para e remove o container llm-gateway (rollback)
# Nunca imprime chaves.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
ENV_FILE="${ENV_FILE:-/opt/kbos/.env}"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f infra/docker-compose.yml)
SVC=llm-gateway
URL=http://127.0.0.1:4000
log() { printf '[llm-gateway %s] %s\n' "$(date -u +%FT%TZ)" "$*"; }
env_val() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
filled() { [ -n "$(env_val "$1")" ] && echo sim || echo nao; }

cmd_test() {
  local mk; mk="$(env_val LITELLM_MASTER_KEY)"
  local c
  c=$(curl -s -o /dev/null -w '%{http_code}' "$URL/health/liveliness" || true); log "liveliness: HTTP $c"
  c=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $mk" "$URL/health/readiness" || true); log "readiness: HTTP $c"
  c=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/v1/chat/completions" -H "Authorization: Bearer $mk" -H 'Content-Type: application/json' -d '{"model":"openai/gpt-5.4","messages":[{"role":"user","content":"oi"}]}' || true)
  log "modelo pago (esperado 400): HTTP $c"
  c=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/v1/chat/completions" -H "Authorization: Bearer $mk" -H 'Content-Type: application/json' -d '{"model":"openrouter/cohere/north-mini-code:free","messages":[{"role":"user","content":"oi"}],"max_tokens":16}' || true)
  log "modelo gratuito (esperado 200): HTTP $c"
}

cmd_add() {
  [ -f "$ENV_FILE" ] || { log "ERRO: $ENV_FILE nao existe"; exit 1; }
  log "LITELLM_MASTER_KEY preenchido: $(filled LITELLM_MASTER_KEY)"
  log "OPENROUTER_API_KEY preenchido: $(filled OPENROUTER_API_KEY)"
  [ "$(filled LITELLM_MASTER_KEY)" = sim ] || { log "ERRO: LITELLM_MASTER_KEY vazio"; exit 1; }
  "${COMPOSE[@]}" up -d --build --no-deps "$SVC"
  log "aguardando liveliness (ate 120s)..."
  for _ in $(seq 1 24); do
    curl -sf "$URL/health/liveliness" >/dev/null 2>&1 && { log "no ar"; cmd_test; return 0; }
    sleep 5
  done
  log "ERRO: nao respondeu. Logs: ${COMPOSE[*]} logs $SVC"; exit 1
}

cmd_remove() {
  "${COMPOSE[@]}" stop "$SVC" || true
  "${COMPOSE[@]}" rm -f "$SVC" || true
  log "llm-gateway removido; demais servicos intactos."
}

case "${1:-}" in
  add) cmd_add ;; test) cmd_test ;; remove) cmd_remove ;;
  *) echo "Uso: $0 add|test|remove" >&2; exit 2 ;;
esac
