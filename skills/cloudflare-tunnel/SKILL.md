---
name: cloudflare-tunnel
description: Expose localhost to the internet via Cloudflare Tunnel. Use when user says "open the tunnel", "use the tunnel", "start the tunnel", "close the tunnel", "stop the tunnel", "kill the tunnel". The word "tunnel" is the key trigger.
allowed-tools: Bash(cloudflared:*), Bash(lsof:*), Bash(kill:*), Bash(ps:*), Bash(pkill:*), Bash(nohup:*), Bash(yq:*), Read, Edit, Grep, Glob
---

# Cloudflare Tunnel — Config-Based Setup

All tunnel routing is managed via `~/.cloudflared/config.yml`. The tunnel is always a named tunnel (`cloudflared tunnel run`).

## Setup: Ensure Current Project Is in Config

### Step 1: Determine the project hostname

Read `wrangler.jsonc` / `wrangler.toml` / `wrangler.json` in the current project to find:
- Check `routes` or custom domain config for a `*.prashamhtrivedi.app` URL — if found, extract the subdomain part (without `.prashamhtrivedi.app`) and use `localhost-<subdomain>.prashamhtrivedi.app` as the hostname.
- Otherwise, use the worker `name` field and set hostname to `localhost-<name>.prashamhtrivedi.app`.

### Step 2: Read `~/.cloudflared/config.yml`

Check if the hostname from Step 1 already exists in the ingress rules.

- **If it exists:** Note its port. Done — proceed to running the tunnel.
- **If it does NOT exist:** Add it. Follow the port rules below.

### Step 3: Port assignment

Read all existing ingress entries in `~/.cloudflared/config.yml`:
- **Exactly one** project may use port `8787`. If no project currently uses `8787`, assign it to this project.
- If `8787` is already taken, pick the next available port starting from `8788` (check existing entries to avoid collisions).
- Add the new ingress entry **before** the catch-all `- service: http_status:404` line.

### Step 4: Update `package.json`

If the assigned port is NOT `8787`, ensure the project's `package.json` dev script includes the correct `--port <assigned-port>` flag. Update the `dev` script (or `start` script) accordingly.

## Opening a Tunnel

```bash
nohup cloudflared tunnel run > /tmp/cloudflared-tunnel.log 2>&1 &
echo $! > /tmp/cloudflared-tunnel.pid
```

Wait a few seconds, then verify:
```bash
sleep 3 && tail -20 /tmp/cloudflared-tunnel.log
```

Report to user: **Tunnel open at `https://<hostname>`**

## Closing a Tunnel

```bash
if [ -f /tmp/cloudflared-tunnel.pid ]; then
  kill $(cat /tmp/cloudflared-tunnel.pid) 2>/dev/null
  rm /tmp/cloudflared-tunnel.pid
fi
pkill -f "cloudflared tunnel" 2>/dev/null
```

## Checking Tunnel Status

```bash
ps aux | grep 'cloudflared tunnel' | grep -v grep
tail -10 /tmp/cloudflared-tunnel.log 2>/dev/null
```
