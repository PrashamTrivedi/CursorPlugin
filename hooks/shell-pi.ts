#!/usr/bin/env bun
/** Port of pi-agent skill PreToolUse guard. */
import { allow, ask, deny, readHookInput, shellCommand } from "./lib.ts";

try {
  const input = await readHookInput();
  const cmd = shellCommand(input);
  if (!/\bpi(\s|$)/.test(cmd)) {
    allow();
    process.exit(0);
  }
  if (/--help|--list-models|--version|--mode\s+rpc/.test(cmd)) {
    allow();
    process.exit(0);
  }
  if (!(/ -t /.test(cmd) || / -nt /.test(cmd) || /-nt$/.test(cmd) || /--no-tools|--no-builtin-tools/.test(cmd))) {
    deny(
      "pi runs must scope tools: pass -t <tools> to allow specific tools, or -nt to run with none.",
    );
    process.exit(0);
  }
  if (
    /openai\/gpt-5\.6-luna|openai\/gpt-5\.6-terra|openai\/gpt-5\.6-sol|openai\/gpt-5\.5|openai\/gpt-5\.4|openai\/gpt-5\.3-codex-spark/.test(
      cmd,
    )
  ) {
    ask(
      "This names the bare openai/ provider (per-token API). The same model under openai-codex/ rides the ChatGPT subscription. Switch the prefix unless you specifically want the metered path.",
    );
    process.exit(0);
  }
  allow();
  process.exit(0);
} catch {
  process.exit(0);
}
