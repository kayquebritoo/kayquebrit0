#!/bin/bash
# Deploy do portfólio na Hostinger (hospedagem compartilhada, sem Node).
# Fluxo: build estático local -> rsync de `out/` -> verificação ao vivo.
# Pré-requisito: chave ~/.ssh/kayque_hostinger autorizada no servidor
# (hPanel -> SSH Access -> Gerenciar chaves SSH -> Adicionar a chave pública).
#
# Uso: ./scripts/deploy-hostinger.sh
set -euo pipefail

SSH_HOST="109.106.251.173"
SSH_PORT="65002"
SSH_USER="u263277580"
SSH_KEY="$HOME/.ssh/kayque_hostinger"
REMOTE_DIR="domains/kayquebrito.com.br/public_html"
DOMAIN="https://kayquebrito.com.br"

green() { printf "\033[1;32m%s\033[0m\n" "$1"; }
red() { printf "\033[1;31m%s\033[0m\n" "$1"; }
step() { printf "\n\033[1;34m==>\033[0m \033[1m%s\033[0m\n" "$1"; }

[ -f "$SSH_KEY" ] || { red "Chave $SSH_KEY não encontrada."; exit 1; }
command -v rsync >/dev/null || { red "rsync não instalado (brew install rsync)."; exit 1; }

step "1/3 — build estático"
unset VERCEL
npm run build >/tmp/kb-deploy-build.log 2>&1 || { red "Build falhou. Log: /tmp/kb-deploy-build.log"; tail -20 /tmp/kb-deploy-build.log; exit 1; }
[ -f out/index.html ] || { red "out/index.html não gerado."; exit 1; }
green "build ok ($(du -sh out | cut -f1))"

step "2/3 — upload (sem --delete: pastas existentes preservadas)"
rsync -az --chmod=D755,F644 \
  -e "ssh -i $SSH_KEY -p $SSH_PORT -o StrictHostKeyChecking=no" \
  out/ "$SSH_USER@$SSH_HOST:$REMOTE_DIR/"
green "upload ok"

step "3/3 — verificação ao vivo"
check() {
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 25 "$1")
  [ "$code" = "$2" ] && green "OK $code $1" || { red "FALHOU ($code, esperado $2) $1"; return 1; }
}
check "$DOMAIN/" 200
curl -s --max-time 25 "$DOMAIN/" | grep -q "Tecnólogo" && green "OK conteúdo home" || { red "FALHOU conteúdo home"; exit 1; }
check "$DOMAIN/trabalho/" 200
check "$DOMAIN/trabalho/mana-fest/" 200
check "$DOMAIN/portfolio-details-clauamaral.html" 200
check "https://passo.kayquebrito.com.br/" 200

green "Deploy concluído 🎉"
