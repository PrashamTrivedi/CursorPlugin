# Cloud Agent base image (`cursor-dev-setup`)

Bake **skills**, **commands**, and **hook scripts** from this repo into a shared GHCR image so product repos only need a thin `FROM` line plus app-specific install steps.

Image: `ghcr.io/prashamtrivedi/cursor-dev-setup:<tag>`

## Layout on the image

| Content | Path | Notes |
|---|---|---|
| Skills | `/home/ubuntu/.cursor/skills/` | Symlink or rsync from `/opt/prasham-cursor/skills` |
| Commands | `/home/ubuntu/.cursor/commands/` | Symlink or rsync from `/opt/prasham-cursor/commands` |
| Hook scripts | `/opt/prasham-cursor/hooks/` | Executable; Bun + Node installed |
| Fallback copies | `/opt/prasham-cursor/{skills,commands,rules,mcp.json}` | Stable reference paths |
| Materialize helper | `/opt/prasham-cursor/bin/materialize-cursor-harness.sh` | Idempotent; safe in `install` |

**Rules** (`/opt/prasham-cursor/rules`) are copied for reference only. Cloud Agents use **user rules** from the dashboard — baking rules is not required.

**MCP:** `mcp.json` under `/opt/prasham-cursor/mcp.json` is documentation only. Enable Memory Server, Kshetra, Parakh, etc. via [cursor.com/agents](https://cursor.com/agents) (Team or personal MCP). Do not treat the baked file as Cloud wiring.

## Build and push

Dockerfile path: **`Dockerfile`** (repo root).

```bash
# From repo root
docker build -t ghcr.io/prashamtrivedi/cursor-dev-setup:local .

# Tag releases as cursor-dev-setup-vX.Y.Z (CI strips prefix for image tag)
git tag cursor-dev-setup-v1.0.0
git push origin cursor-dev-setup-v1.0.0
```

CI (`.github/workflows/publish-ghcr.yml`) builds on tag `cursor-dev-setup-v*` or manual dispatch, pushes `:vX.Y.Z` and `:latest` using `GITHUB_TOKEN` with `packages: write`.

Local push (needs `write:packages` PAT or `gh auth login`):

```bash
echo "$GITHUB_TOKEN" | docker login ghcr.io -u USERNAME --password-stdin
docker tag ghcr.io/prashamtrivedi/cursor-dev-setup:local ghcr.io/prashamtrivedi/cursor-dev-setup:v1.0.0
docker push ghcr.io/prashamtrivedi/cursor-dev-setup:v1.0.0
docker push ghcr.io/prashamtrivedi/cursor-dev-setup:latest
```

### Private package pull

If the GHCR package is private, add a Cursor **build secret** (environment dashboard) so the agent pod can pull the base image during build. Use a PAT or fine-grained token with `read:packages`.

## Consumer repo: `.cursor/Dockerfile`

```dockerfile
FROM ghcr.io/prashamtrivedi/cursor-dev-setup:v1.0.0
# App deps only — no skills/commands/hooks copied here
```

## Consumer repo: `.cursor/environment.json`

```json
{
  "build": {
    "dockerfile": "Dockerfile"
  },
  "install": "/opt/prasham-cursor/bin/materialize-cursor-harness.sh && npm ci",
  "start": "npm run dev",
  "terminals": []
}
```

Adjust `install` / `start` for the product (pnpm, wrangler, Flutter in mobile env, etc.). Keep `materialize-cursor-harness.sh` first so `~/.cursor/{skills,commands}` exist even if the home volume was reset.

## Hooks on Cloud Agents

Cloud **ignores** user-level `~/.cursor/hooks.json`. Options:

1. **Skip hooks on Cloud** (simplest).
2. **Thin project `.cursor/hooks.json`** that invokes scripts under `/opt/prasham-cursor/hooks/`, e.g.:

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      { "command": "/opt/prasham-cursor/hooks/session-start.ts" }
    ]
  }
}
```

Hook scripts require **Bun** (preinstalled in the base image).

## Bumping the shared tag (site-inspection-backend / site-inspection-mobile)

1. Tag and push this repo: `cursor-dev-setup-vX.Y.Z` → CI publishes `ghcr.io/prashamtrivedi/cursor-dev-setup:vX.Y.Z`.
2. Update **both** product environments:

```dockerfile
# .cursor/Dockerfile in each repo
FROM ghcr.io/prashamtrivedi/cursor-dev-setup:vX.Y.Z
```

3. Trigger an environment rebuild in the Cursor dashboard for each product.

Keep backend and mobile on the **same harness tag** unless you intentionally roll one forward first.

## Verify locally

```bash
docker build -t cursor-dev-setup:test .
docker run --rm cursor-dev-setup:test bash -lc '
  test -f /home/ubuntu/.cursor/skills/cloudflare/SKILL.md
  test -f /home/ubuntu/.cursor/commands/startWork.md
  test -x /opt/prasham-cursor/hooks/session-start.ts
  bun --version && node --version && pnpm --version
'
```
