#!/bin/sh
# Backup do banco do KBOS de hora em hora (serviço `db-backup` do compose).
# - pg_dump em formato custom, conferido com pg_restore --list antes de valer
#   (arquivo parcial nunca aparece como backup bom).
# - Retenção: os de hora em hora ficam BACKUP_KEEP_HOURS (48 h); o das
#   BACKUP_DAILY_HOUR_UTC (03 UTC = 00 h em Belém) fica BACKUP_KEEP_DAYS (30 dias).
# - .last-ok guarda a hora do último backup bom (healthcheck do compose).
# BACKUP_ONCE=1 roda uma vez e sai (teste).
set -u
DIR="${BACKUP_DIR:-/backups}"
KEEP_HOURS="${BACKUP_KEEP_HOURS:-48}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
DAILY_HOUR="${BACKUP_DAILY_HOUR_UTC:-03}"
mkdir -p "$DIR"

log() { echo "[backup] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

run() {
  ts="$(date -u +%Y%m%d-%H%M)"
  tmp="$DIR/.kbos-$ts.dump.part"
  if pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" --file="$tmp" \
    && pg_restore --list "$tmp" >/dev/null; then
    mv "$tmp" "$DIR/kbos-$ts.dump"
    date -u +%s > "$DIR/.last-ok"
    log "ok kbos-$ts.dump ($(du -h "$DIR/kbos-$ts.dump" | cut -f1))"
  else
    rm -f "$tmp"
    log "FALHOU: backup de $ts não foi gravado" >&2
  fi
  # Retenção: de hora em hora (exceto o diário) por KEEP_HOURS; todos por KEEP_DAYS.
  find "$DIR" -maxdepth 1 -name 'kbos-*.dump' ! -name "kbos-*-${DAILY_HOUR}??.dump" -mmin +"$((KEEP_HOURS * 60))" -print -delete | sed 's/^/[backup] apagado /'
  find "$DIR" -maxdepth 1 -name 'kbos-*.dump' -mtime +"$KEEP_DAYS" -print -delete | sed 's/^/[backup] apagado /'
  find "$DIR" -maxdepth 1 -name '.kbos-*.part' -mmin +120 -delete
}

if [ -z "${DATABASE_URL:-}" ]; then log "DATABASE_URL ausente; nada a fazer" >&2; exit 1; fi
run
[ "${BACKUP_ONCE:-}" = "1" ] && exit 0
while true; do
  # dorme até o próximo horário cheio
  now="$(date -u +%s)"
  sleep "$((3600 - now % 3600))"
  run
done
