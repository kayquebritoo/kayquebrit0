#!/usr/bin/env bash
# Reserva leve de arquivos entre agentes (Claude Code, Codex, OpenCode) na mesma máquina.
# As reservas ficam no diretório comum do git (compartilhado por todos os worktrees,
# fora do versionamento): nada de rede, nada de conflito de merge.
#
#   scripts/agente-lock.sh reservar <agente> <assunto> <caminho> [caminho…]
#   scripts/agente-lock.sh liberar  <assunto>
#   scripts/agente-lock.sh ver
#   scripts/agente-lock.sh checar   <caminho>      # sai 1 se alguém reservou
#
# Caminhos são relativos à raiz do repo; pasta reserva tudo dentro dela.
# Reserva expira em AGENTE_LOCK_TTL segundos (padrão 4 h) para não travar ninguém
# se um agente morrer sem liberar. Compatível com o bash 3.2 do macOS.
set -euo pipefail

TTL="${AGENTE_LOCK_TTL:-14400}"
COMMON="$(git rev-parse --path-format=absolute --git-common-dir)"
DIR="$COMMON/agent-locks"
MUTEX="$DIR/.mutex"
mkdir -p "$DIR"

now() { date +%s; }

slug() { printf '%s' "$1" | tr -c 'A-Za-z0-9._-' '-'; }

# Normaliza "./app/x/" → "app/x"
norm() { local p="${1#./}"; printf '%s' "${p%/}"; }

# Dois caminhos se sobrepõem se um é o outro ou está dentro do outro.
overlap() {
  local a="$1" b="$2"
  [ "$a" = "$b" ] || [ "${a#"$b"/}" != "$a" ] || [ "${b#"$a"/}" != "$b" ]
}

lock_mutex() {
  local i=0
  until mkdir "$MUTEX" 2>/dev/null; do
    i=$((i + 1))
    if [ "$i" -gt 50 ]; then
      # mutex órfão (processo morto): libera depois de ~5 s
      rmdir "$MUTEX" 2>/dev/null || true
      i=0
    fi
    sleep 0.1
  done
  trap 'rmdir "$MUTEX" 2>/dev/null || true' EXIT
}

expired() {
  local created
  created="$(sed -n 's/^criado=//p' "$1/info" 2>/dev/null || echo 0)"
  [ $(( $(now) - ${created:-0} )) -gt "$TTL" ]
}

# Imprime "assunto<TAB>agente<TAB>caminho" das reservas vigentes; apaga as vencidas.
active() {
  local r
  for r in "$DIR"/*/; do
    [ -d "$r" ] || continue
    r="${r%/}"
    if [ ! -f "$r/info" ] || expired "$r"; then
      rm -rf "$r"
      continue
    fi
    local who subj
    who="$(sed -n 's/^agente=//p' "$r/info")"
    subj="$(basename "$r")"
    while IFS= read -r p; do
      [ -n "$p" ] && printf '%s\t%s\t%s\n' "$subj" "$who" "$p"
    done < "$r/caminhos"
  done
}

cmd="${1:-ver}"
case "$cmd" in
  reservar)
    [ $# -ge 4 ] || { echo "uso: $0 reservar <agente> <assunto> <caminho> [caminho…]" >&2; exit 2; }
    agente="$2"; assunto="$(slug "$3")"; shift 3
    lock_mutex
    conflitos=""
    while IFS="$(printf '\t')" read -r s w p; do
      [ "$s" = "$assunto" ] && continue
      for c in "$@"; do
        if overlap "$(norm "$c")" "$p"; then
          conflitos="${conflitos}  $(norm "$c") ← reservado por $w ($s): $p"$'\n'
        fi
      done
    done < <(active)
    if [ -n "$conflitos" ]; then
      printf 'Conflito, nada reservado:\n%s' "$conflitos" >&2
      exit 1
    fi
    r="$DIR/$assunto"
    mkdir -p "$r"
    {
      echo "agente=$agente"
      echo "branch=$(git branch --show-current 2>/dev/null || true)"
      echo "worktree=$(git rev-parse --show-toplevel)"
      echo "criado=$(now)"
    } > "$r/info"
    touch "$r/caminhos"
    for c in "$@"; do
      c="$(norm "$c")"
      grep -qxF "$c" "$r/caminhos" || echo "$c" >> "$r/caminhos"
    done
    echo "Reservado ($agente · $assunto): $*"
    ;;
  liberar)
    [ $# -eq 2 ] || { echo "uso: $0 liberar <assunto>" >&2; exit 2; }
    lock_mutex
    rm -rf "${DIR:?}/$(slug "$2")"
    echo "Liberado: $2"
    ;;
  ver)
    lock_mutex
    out="$(active)"
    if [ -z "$out" ]; then echo "Nenhuma reserva ativa."; else
      printf 'ASSUNTO\tAGENTE\tCAMINHO\n%s\n' "$out" | column -t -s "$(printf '\t')"
    fi
    ;;
  checar)
    [ $# -eq 2 ] || { echo "uso: $0 checar <caminho>" >&2; exit 2; }
    lock_mutex
    alvo="$(norm "$2")"
    achou=0
    while IFS="$(printf '\t')" read -r s w p; do
      if overlap "$alvo" "$p"; then echo "$alvo ← $w ($s): $p"; achou=1; fi
    done < <(active)
    [ "$achou" -eq 0 ] && echo "Livre: $alvo"
    exit "$achou"
    ;;
  *)
    sed -n '2,13p' "$0" >&2; exit 2 ;;
esac
