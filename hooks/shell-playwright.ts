#!/usr/bin/env bun
/** Port of playwright-cli skill PreToolUse guard. */
import { allow, deny, readHookInput, shellCommand } from "./lib.ts";

try {
  const input = await readHookInput();
  const cmd = shellCommand(input);
  if (!/\bplaywright-cli\b/.test(cmd)) {
    allow();
    process.exit(0);
  }
  const isOpen = /(?:^|\s)open(?:\s|$)/.test(cmd.replace(/^.*playwright-cli\s+/, "playwright-cli "));
  if (!isOpen) {
    allow();
    process.exit(0);
  }
  if (/--config=/.test(cmd)) {
    allow();
    process.exit(0);
  }
  deny("playwright-cli open needs --config=/root/.playwright/cli.config.json, otherwise the session starts with the wrong config.");
  process.exit(0);
} catch {
  process.exit(0);
}
