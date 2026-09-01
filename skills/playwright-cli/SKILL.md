---
name: playwright-cli
description: Automates browser interactions for web testing, form filling, screenshots, and data extraction. Use when the user needs to navigate websites, interact with web pages, fill forms, take screenshots, test web applications, or extract information from web pages.
allowed-tools: Bash(playwright-cli:*)
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          if: "Bash(playwright-cli *)"
          command: sh
          args:
            - "-c"
            - |
              payload=$(cat)
              if command -v jq >/dev/null 2>&1; then
                cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // ""')
              else
                cmd=$payload
              fi
              # Only a session-starting `open` needs the config; later commands
              # attach to the session it created.
              case "$cmd" in
                *" open "*|*" open") ;;
                *) exit 0 ;;
              esac
              case "$cmd" in
                *--config=*) exit 0 ;;
              esac
              echo 'playwright-cli open needs --config=/root/.playwright/cli.config.json, otherwise the session starts with the wrong config.' >&2
              exit 2
---

# Browser Automation with playwright-cli

## Non-negotiable

- Always pass `--config=/root/.playwright/cli.config.json`. Without it the session
  starts with the wrong config.
- Artifacts land in `.playwright-cli/`. Confirm with the user that it should be
  gitignored before you generate a pile of them.

## The model

Every command prints a snapshot of the page afterwards, and the snapshot is where
element refs (`e5`, `e15`) come from. So the loop is always: act, read the
snapshot, use the refs it gave you for the next action. Never guess a ref.

```bash
playwright-cli --config=/root/.playwright/cli.config.json open https://example.com/form
playwright-cli snapshot
playwright-cli fill e1 "user@example.com"
playwright-cli click e3
playwright-cli close
```

Snapshots auto-name by timestamp. Pass `--filename=` only when the file is part
of the deliverable rather than a step along the way. Same for `screenshot` and
`pdf`.

## Commands

`playwright-cli --help` lists every command with its argument shape — read it
rather than guessing. The groups are: core interaction (`click`, `fill`, `type`,
`select`, `check`, `upload`, `drag`, `hover`, `eval`), navigation, keyboard,
mouse, tabs, storage (cookies, localStorage, sessionStorage, `state-save`/
`state-load`), network (`route`, `unroute`), and devtools (`console`, `network`,
`tracing-start`/`stop`, `video-start`/`stop`, `run-code`).

Useful `open` flags: `--browser=chrome|firefox|webkit|msedge`, `--persistent` (or
`--profile=<dir>`) for a profile that survives close, `--extension` to attach to
a running browser.

## Sessions

Default is one unnamed session. Name one with `-s=` when you need several browsers
at once, and remember the flag on every subsequent call:

```bash
playwright-cli -s=mysession open example.com --persistent
playwright-cli -s=mysession click e6
playwright-cli -s=mysession close
```

`list` shows live sessions, `close-all` stops them, `kill-all` force-kills the
processes, `delete-data` wipes a persistent profile.

## When the binary is missing

If the global `playwright-cli` fails, fall back to `npx playwright-cli` with the
same arguments.

## Deeper topics

* **Request mocking** [references/request-mocking.md](references/request-mocking.md)
* **Running Playwright code** [references/running-code.md](references/running-code.md)
* **Browser session management** [references/session-management.md](references/session-management.md)
* **Storage state (cookies, localStorage)** [references/storage-state.md](references/storage-state.md)
* **Test generation** [references/test-generation.md](references/test-generation.md)
* **Tracing** [references/tracing.md](references/tracing.md)
* **Video recording** [references/video-recording.md](references/video-recording.md)
