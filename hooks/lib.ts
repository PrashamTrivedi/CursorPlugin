#!/usr/bin/env bun

export type HookInput = Record<string, any>;

export async function readHookInput(): Promise<HookInput> {
  const text = await Bun.stdin.text();
  if (!text?.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export function workspaceRoot(input: HookInput): string {
  const roots = input.workspace_roots || input.workspaceRoots;
  if (Array.isArray(roots) && roots[0]) return String(roots[0]);
  return process.env.CURSOR_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

export function conversationId(input: HookInput): string {
  return String(
    input.conversation_id ||
      input.conversationId ||
      input.session_id ||
      input.sessionId ||
      "unknown",
  );
}

export function toolName(input: HookInput): string {
  return String(input.tool_name || input.toolName || input.tool || "");
}

export function toolInput(input: HookInput): Record<string, any> {
  const inner = input.tool_input || input.toolInput || input.arguments || input.params;
  if (inner && typeof inner === "object") return inner;
  return input;
}

export function shellCommand(input: HookInput): string {
  const inner = toolInput(input);
  return String(input.command || inner.command || "");
}

export function filePathFromInput(input: HookInput): string {
  const inner = toolInput(input);
  const candidates = [
    inner.file_path,
    inner.filePath,
    inner.path,
    inner.absolute_path,
    inner.absolutePath,
    inner.target_directory,
    inner.targetDirectory,
    input.file_path,
    input.path,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return "";
}

export function deny(userMessage: string, agentMessage?: string) {
  console.log(
    JSON.stringify({
      permission: "deny",
      user_message: userMessage,
      agent_message: agentMessage || userMessage,
    }),
  );
}

export function ask(userMessage: string, agentMessage?: string) {
  console.log(
    JSON.stringify({
      permission: "ask",
      user_message: userMessage,
      agent_message: agentMessage || userMessage,
    }),
  );
}

export function allow(extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ permission: "allow", ...extra }));
}
