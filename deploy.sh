#!/usr/bin/env bash
#
# KBOS — deploy idempotente na VPS (pull-based: dispensa SSH de fora).
#
#   ./deploy.sh              # publica origin/main agora
#   ./deploy.sh --auto       # modo cron: só age se houver novidade
#   ./deploy.sh --sha <sha>  # publica um commit específico (40 hex)
#
# Automação: o cron da VPS chama `--auto` a cada ~3 min; o GitHub Actions só
# avisa o commit novo via POST /api/admin/deploy (Bearer DEPLOY_TOKEN, salvo
# em `kbos:deploy:want` no Redis) e aguarda o /api/health reportar o SHA.
# SEMPRE rode a partir da raiz do repo (/opt/kbos na VPS).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
LOG() { printf '[deploy %s] %s\n' "$(date -u +%FT%TZ)" "$*"; }

MODE="--deploy"
SHA=""
while [ $# -gt 0 ]; do
  case "$1" in
    --auto) MODE="--auto"; shift ;;
    --deploy) MODE="--deploy"; shift ;;
    --sha) SHA="${2:-}"; MODE="--sha"; shift 2 ;;
    -h|--help) awk 'NR>1 && /^set -euo/{exit} NR>1' "$0"; exit 0 ;;
    *) LOG "argumento desconhecido: $1 (use --help)"; exit 2 ;;
  esac
done

# Anti-sobreposição: o cron pode chamar com um build ainda rodando.
exec 9>/tmp/kbos-deploy.lock
flock -n 9 || { LOG "já há um deploy em curso; saindo."; exit 0; }

COMPOSE=(docker compose)
if [ -f /opt/kbos/.env ]; then COMPOSE+=(--env-file /opt/kbos/.env); fi
COMPOSE+=(-f "$ROOT/infra/docker-compose.yml")

WANT_KEY="kbos:deploy:want"
STATE_KEY="kbos:deploy:state"

redis_get() { "${COMPOSE[@]}" exec -T redis redis-cli --raw GET "$1" 2>/dev/null || true; }
redis_set() { "${COMPOSE[@]}" exec -T redis redis-cli SET "$1" "$2" >/dev/null 2>&1 || true; }
redis_del() { "${COMPOSE[@]}" exec -T redis redis-cli DEL "$1" >/dev/null 2>&1 || true; }

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  LOG "sem repo git em $ROOT; abortando."
  exit 1
fi

if ! git fetch origin 2>&1 | head -5; then
  LOG "git fetch falhou (rede?) — próxima execução tenta de novo."
  exit 0
fi

HEAD="$(git rev-parse HEAD)"
WANT="$(redis_get "$WANT_KEY" | head -c 40 | tr -d '[:space:]')"

TARGET=""
if [ "$MODE" = "--sha" ]; then
  [[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { LOG "sha inválido: '$SHA'"; exit 2; }
  git cat-file -e "$SHA^{commit}" 2>/dev/null || { LOG "commit $SHA ausente após fetch."; exit 1; }
  TARGET="$SHA"
elif [[ "$WANT" =~ ^[0-9a-f]{40}$ ]] && git cat-file -e "$WANT^{commit}" 2>/dev/null; then
  TARGET="$WANT" # pedido explícito via POST /api/admin/deploy (vale 1h)
else
  TARGET="$(git rev-parse origin/main)"
fi

# Compara com o que está NO AR (último deploy ok), não com o HEAD: um
# `git pull` manual na VPS deixava HEAD = origin/main e o cron achava que
# não havia novidade, mesmo com a imagem antiga rodando.
DEPLOYED="$(redis_get "$STATE_KEY" | grep -o '"sha":"[0-9a-f]*' | cut -d'"' -f4)"
CURRENT="${DEPLOYED:-$HEAD}"
if [ "$MODE" = "--auto" ] && [ "$CURRENT" = "$TARGET" ]; then
  [ "$WANT" = "$TARGET" ] && redis_del "$WANT_KEY"
  LOG "já publicado em $CURRENT; nada a fazer."
  exit 0
fi

LOG "publicando $TARGET (atual: $HEAD)…"
git reset --hard "$TARGET"

export GIT_SHA="$TARGET"
# shellcheck disable=SC2155
export COMPOSE_PROFILES="evolution"
"${COMPOSE[@]}" --profile evolution up -d --build
"${COMPOSE[@]}" ps

OK=0
for _ in $(seq 1 36); do
  if curl -sf http://localhost:3000/api/health/ >/dev/null 2>&1; then OK=1; break; fi
  sleep 5
done

STATE="{\"sha\":\"$TARGET\",\"at\":\"$(date -u +%FT%TZ)\",\"ok\":$([ "$OK" = 1 ] && echo true || echo false)}"
redis_set "$STATE_KEY" "$STATE"
[ "$WANT" = "$TARGET" ] && redis_del "$WANT_KEY"

if [ "$OK" = 1 ]; then
  LOG "deploy ok: $TARGET"
else
  LOG "containers subiram, mas /api/health não respondeu em ~3 min — ver logs."
  exit 1
fi
