#!/usr/bin/env bash
# Lume — preparo da VPS nova (Ubuntu 24.04). Seguro rodar mais de uma vez.
# Rode como root no terminal web da Hostinger:
#   curl -fsSL https://raw.githubusercontent.com/kayquebritoo/kayquebrit0/claude/lume/infra/lume/bootstrap.sh | bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo "==> Atualizando e instalando base"
apt-get update -y
apt-get install -y ca-certificates curl git ufw fail2ban unattended-upgrades ffmpeg

echo "==> Docker"
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
docker compose version

echo "==> Swap de 4 GB (folga para o modelo de busca)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Firewall (22, 80, 443)"
ufw default deny incoming; ufw default allow outgoing
ufw allow 22/tcp; ufw allow 80/tcp; ufw allow 443/tcp
ufw --force enable
systemctl enable --now fail2ban

echo "==> Código e segredos em /opt/lume"
mkdir -p /opt/lume/data && cd /opt/lume
if [ -d src/.git ]; then git -C src fetch -q origin claude/lume && git -C src reset -q --hard origin/claude/lume
else git clone -q --depth 1 -b claude/lume https://github.com/kayquebritoo/kayquebrit0.git src; fi
if [ ! -f .env ]; then
  umask 077
  echo "LUME_API_TOKEN=$(openssl rand -hex 32)" > .env
fi
chmod 600 .env

echo
echo "==> PRONTO. Memória e disco:"
free -h | sed -n 1,2p; df -h / | tail -1
echo
echo "Token do Lume (guarde; vai no .env do KBOS como LUME_API_TOKEN):"
grep LUME_API_TOKEN .env
