#!/usr/bin/env bash
# Idempotently ensure ~/.cursor/{skills,commands} exist from /opt/prasham-cursor/.
# Also link project .cursor/commands — Cloud Agents load slash commands from the
# repo, not from $HOME/.cursor/commands.
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

exclude_git() {
  local root="$1"
  local pattern="$2"
  [[ -d "$root/.git" ]] || return 0
  mkdir -p "$root/.git/info"
  local exclude="$root/.git/info/exclude"
  grep -qxF "$pattern" "$exclude" 2>/dev/null || echo "$pattern" >> "$exclude"
}

# Cloud slash commands come from the repo, not ~/.cursor/commands.
# Skills already load from $HOME (skillCount matches the harness); do not
# duplicate them into the project tree.
materialize_project_commands() {
  local src="$OPT_ROOT/commands"
  if [[ ! -d "$src" ]]; then
    echo "materialize-cursor-harness: skip project commands (missing source): $src" >&2
    return 0
  fi

  local root=""
  if [[ -n "${CURSOR_WORKSPACE:-}" && -d "${CURSOR_WORKSPACE}" ]]; then
    root="${CURSOR_WORKSPACE}"
  elif [[ -d /workspace/.git || -d /workspace/.cursor ]]; then
    root="/workspace"
  elif git rev-parse --show-toplevel >/dev/null 2>&1; then
    root="$(git rev-parse --show-toplevel)"
  else
    echo "materialize-cursor-harness: skip project commands (no workspace)" >&2
    return 0
  fi

  local dest="$root/.cursor/commands"
  mkdir -p "$root/.cursor"

  if [[ -e "$dest" && ! -L "$dest" ]]; then
    echo "materialize-cursor-harness: skip project commands (exists, not a symlink): $dest" >&2
    return 0
  fi

  if [[ -L "$dest" ]]; then
    local target
    target="$(readlink -f "$dest")"
    if [[ "$target" == "$(readlink -f "$src")" ]]; then
      exclude_git "$root" ".cursor/commands"
      return 0
    fi
    rm -f "$dest"
  fi

  ln -sfn "$src" "$dest"
  exclude_git "$root" ".cursor/commands"
  echo "materialize-cursor-harness: linked project $dest -> $src"
}

materialize_dir skills
materialize_dir commands
materialize_project_commands
