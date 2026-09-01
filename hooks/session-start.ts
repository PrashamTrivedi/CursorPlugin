#!/usr/bin/env bun
/**
 * Port of ~/.claude/hookScripts/sessionStart.ts
 * Skips a full `tree` when the workspace is $HOME to avoid dumping the entire home into context.
 */
import { homedir } from "os";
import { readHookInput, workspaceRoot } from "./lib.ts";

async function run(cmd: string[], cwd: string): Promise<string> {
  try {
    const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    return output.trim();
  } catch {
    return "";
  }
}

try {
  const input = await readHookInput();
  const projectDir = workspaceRoot(input);
  const home = homedir();
  const isHomeWorkspace = projectDir === home || projectDir === "/root";

  const [gitRemote, gitStatus, treeOutput] = await Promise.all([
    run(["git", "remote", "-v"], projectDir),
    run(["git", "status", "--short"], projectDir),
    isHomeWorkspace
      ? Promise.resolve("")
      : run(
          ["tree", "--dirsfirst", "--charset=ascii", "-L", "3", "-I", "node_modules|.git|dist|build|__pycache__|.venv"],
          projectDir,
        ),
  ]);

  let context = `# Project: ${projectDir.split("/").pop()}\n`;
  if (gitRemote) context += `\n## Remote\n\`\`\`\n${gitRemote}\n\`\`\`\n`;
  if (gitStatus) {
    context += `\n## Changes (${gitStatus.split("\n").length} files)\n\`\`\`\n${gitStatus}\n\`\`\`\n`;
  } else {
    context += `\n## Changes\nWorking tree clean (or not a git repo)\n`;
  }
  if (treeOutput) {
    const lines = treeOutput.split("\n").slice(0, 80).join("\n");
    context += `\n## Structure\n\`\`\`\n${lines}\n\`\`\`\n`;
  }

  console.log(JSON.stringify({ additional_context: context }));
  process.exit(0);
} catch {
  process.exit(0);
}
