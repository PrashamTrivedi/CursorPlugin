#!/usr/bin/env bash
# Idempotently ensure ~/.cursor/{skills,commands} exist from /opt/prasham-cursor/.
# Safe to run from Cloud Agent environment.json "install" on every boot.
set -euo pipefail

CURSOR_HOME="${CURSOR_HOME:-${HOME}/.cursor}"
OPT_ROOT="${PRASHAM_CURSOR_ROOT:-/opt/prasham-cursor}"

mkdir -p "$CURSOR_HOME"

materialize_dir() {
  local name="$1"
  local dest="$CURSOR_HOME/$name"
  local src="$OPT_ROOT/$name"

  if [[ ! -d "$src" ]]; then
    echo "materialize-cursor-harness: skip (missing source): $src" >&2
    return 0
  fi

  if [[ ! -e "$dest" ]]; then
    ln -sfn "$src" "$dest"
    echo "materialize-cursor-harness: linked $dest -> $src"
    return 0
  fi

  if [[ -L "$dest" ]]; then
    local target
    target="$(readlink -f "$dest")"
    if [[ "$target" == "$src" ]]; then
      return 0
    fi
    rm -f "$dest"
    ln -sfn "$src" "$dest"
    echo "materialize-cursor-harness: re-linked $dest -> $src"
    return 0
  fi

  mkdir -p "$dest"
  rsync -a --delete "$src/" "$dest/"
  echo "materialize-cursor-harness: rsynced $src/ -> $dest/"
}

materialize_dir skills
materialize_dir commands
