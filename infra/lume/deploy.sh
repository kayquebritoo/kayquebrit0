#!/usr/bin/env bash
#
# Lume — deploy automático na VPS do Lume (pull-based, igual ao KBOS: sem SSH de fora).
#
#   ./deploy.sh --install   # uma vez: cria o cron (a cada 5 min) e já faz o primeiro deploy
#   ./deploy.sh --auto      # modo cron: só age se a pasta infra/lume mudou na origin/main
#   ./deploy.sh             # reconstrói agora, mesmo sem mudança
#
# Roda em /opt/lume (onde ficam .env, data/ e src/). Só o conteúdo de infra/lume entra na imagem,
# então o gatilho é o hash da árvore dessa pasta (mudança em docs/ ou no KBOS não reinicia o Lume).
# Nunca lê nem imprime o .env.
set -euo pipefail

BASE="${LUME_BASE:-/opt/lume}"
SRC="$BASE/src"
STATE="$BASE/.deployed-tree"
LOG() { printf '[lume-deploy %s] %s\n' "$(date -u +%FT%TZ)" "$*"; }

MODE="--deploy"
case "${1:-}" in
  --auto) MODE="--auto" ;;
  --install) MODE="--install" ;;
  "" ) ;;
  -h|--help) awk 'NR>1 && /^set -euo/{exit} NR>1' "$0"; exit 0 ;;
  *) LOG "argumento desconhecido: $1"; exit 2 ;;
esac

if [ "$MODE" = "--install" ]; then
  CRON="*/5 * * * * $SRC/infra/lume/deploy.sh --auto >> /var/log/lume-deploy.log 2>&1"
  # Sem crontab ainda, `crontab -l` e o `grep -v` saem com erro: tolera (|| true) para não abortar com set -e.
  { { crontab -l 2>/dev/null || true; } | { grep -v 'lume/deploy.sh' || true; }; echo "$CRON"; } | crontab -
  chmod +x "$SRC/infra/lume/deploy.sh"
  LOG "cron instalado: $CRON"
  MODE="--deploy"
fi

exec 9>/tmp/lume-deploy.lock
flock -n 9 || { LOG "já há um deploy em curso; saindo."; exit 0; }

cd "$SRC"
if ! git fetch -q origin +refs/heads/main:refs/remotes/origin/main 2>&1 | head -3; then
  LOG "git fetch falhou (rede?) — tenta de novo na próxima."; exit 0
fi
WANT_TREE="$(git rev-parse origin/main:infra/lume)"
HAVE_TREE="$(cat "$STATE" 2>/dev/null || true)"
if [ "$MODE" = "--auto" ] && [ "$WANT_TREE" = "$HAVE_TREE" ]; then
  exit 0
fi

LOG "atualizando para $(git rev-parse --short origin/main) (pasta infra/lume ${WANT_TREE:0:8})"
git checkout -q -B main origin/main
git reset -q --hard origin/main
cd "$SRC/infra/lume"
docker compose --env-file "$BASE/.env" up -d --build lume indexador caddy
# O servidor precisa responder antes de dar o deploy por bom.
for i in $(seq 1 30); do
  if docker compose --env-file "$BASE/.env" exec -T lume python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8765/health',timeout=5)" >/dev/null 2>&1; then
    echo "$WANT_TREE" > "$STATE"
    LOG "ok: Lume respondeu /health."
    exit 0
  fi
  sleep 10
done
LOG "AVISO: o Lume não respondeu /health em 5 min; confira 'docker compose logs lume'. Tentarei de novo no próximo ciclo."
exit 1
