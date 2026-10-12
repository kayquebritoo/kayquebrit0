#!/usr/bin/env bash
set -e
cd /opt/kbos
git pull origin main
cd infra
docker compose --env-file /opt/kbos/.env -f docker-compose.yml --profile evolution down
docker compose --env-file /opt/kbos/.env -f docker-compose.yml --profile evolution up -d --build
echo "Deploy concluído com sucesso em $(date)"
