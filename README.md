# CursorPlugin

Open-source Cursor plugin **Prasham's development setup.** (`prashams-development-setup`).

GitHub: [PrashamTrivedi/CursorPlugin](https://github.com/PrashamTrivedi/CursorPlugin)

## Publish format

Cursor does **not** accept a zip upload. Plugins are **Git repositories**:

| Surface | What you give Cursor | Zip? |
|---|---|---|
| [Public marketplace](https://cursor.com/marketplace/publish) | Public Git repo URL (GitHub typical) | No |
| Team marketplace | GitHub repo → Dashboard → Plugins → Import from Repo | No |
| Local dev | Folder or symlink at `~/.cursor/plugins/local/<name>` | No |

Submit public listing at https://cursor.com/marketplace/publish after this repo is public.

Cloud Agents still clone **project** git, not your laptop `~/.cursor`. Prefer the shared GHCR base image — see [docs/cloud-agent-image.md](docs/cloud-agent-image.md) (`FROM ghcr.io/prashamtrivedi/cursor-dev-setup:<tag>`). Enable Memory Server / Kshetra / Parakh as Team or personal MCP on [cursor.com/agents](https://cursor.com/agents); the baked `mcp.json` in the image is reference only, not Cloud wiring. For local project vendoring, use `./sync.ts Cursor To Project`.

## Layout

```text
.cursor-plugin/plugin.json
mcp.json
assets/logo.svg  assets/logo.png
rules/          commands/       hooks/          skills/
sync.ts
```

Skills are real files (sync dereferences local Claude/Cursor skill symlinks).

## Sync

Same shape as the old ClaudeCodeSettings `sync.ts`, Cursor-only.

```sh
chmod +x sync.ts
./sync.ts                         # From Central (default)
./sync.ts Cursor From Central     # ~/.cursor + ~/.claude/skills → this repo
./sync.ts Cursor To Central       # symlink plugin + copy mcp/hooks/skills/commands
./sync.ts Cursor To Project       # vendor skills/rules/commands into $PWD/.cursor
./sync.ts Cursor From Central --dry-run
./sync.ts Cursor To Central --force
```

Requires [Bun](https://bun.sh) and `rsync`.

## Local install

```sh
./sync.ts Cursor To Central --force
```

Then Developer: Reload Window. Customize should show **Prasham's development setup.**

Or by hand:

```sh
ln -sfn /path/to/CursorPlugin ~/.cursor/plugins/local/prashams-development-setup
```

## License

MIT
