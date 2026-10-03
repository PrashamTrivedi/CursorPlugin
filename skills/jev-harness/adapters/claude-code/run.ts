#!/usr/bin/env bun
// Claude Code adapter. Events: PreToolUse, PostToolUse, PostToolUseFailure, Stop.
// Verified live (2026-10-03): updatedToolOutput must match the tool's own output shape (a plain string on Bash is ignored).
import { rememberPrompt } from "../../core/transcript.ts";
import type { HookEvent, ToolCall, Verdict } from "../../core/types.ts";
import { flattenOutput, runAdapter, type Adapter } from "../common.ts";

const KIND: Record<string, HookEvent["kind"]> = {
  PreToolUse: "pre_tool", PostToolUse: "post_tool", PostToolUseFailure: "tool_failure", Stop: "stop",
};

function tool(raw: any): ToolCall | undefined {
  const name: string = raw.tool_name;
  if (!name) return undefined;
  const i = raw.tool_input ?? {};
  const base = { name, input: i };
  let t: ToolCall;
  if (name === "Bash") t = { ...base, kind: "shell", command: i.command, description: i.description };
  else if (name === "Read") t = { ...base, kind: "read", path: i.file_path, range: i.offset || i.limit ? { start: i.offset, end: i.limit ? (i.offset ?? 1) + i.limit - 1 : undefined } : undefined };
  else if (name === "Write") t = { ...base, kind: "write", path: i.file_path, content: i.content };
  else if (name === "Edit") t = { ...base, kind: "edit", path: i.file_path, content: i.new_string };
  else if (name === "MultiEdit") t = { ...base, kind: "edit", path: i.file_path, content: (i.edits ?? []).map((x: any) => x.new_string).join("\n") };
  else if (name === "WebFetch") t = { ...base, kind: "fetch", url: i.url };
  else if (name === "Agent" || name === "Task") t = { ...base, kind: "subagent", subagentPrompt: i.prompt, subagentModel: i.model };
  else if (name.startsWith("mcp__")) {
    const [, server, ...rest] = name.split("__");
    t = { ...base, kind: "mcp", mcpServer: server, mcpTool: rest.join("__"), mcpArgs: i };
  } else t = { ...base, kind: "other" };
  if (raw.tool_response !== undefined) t.output = flattenOutput(raw.tool_response);
  if (raw.error) t.error = String(raw.error);
  return t;
}

/** Replacement must match the shape Claude Code gave us. */
function shaped(original: unknown, text: string): unknown {
  if (typeof original === "string") return text;
  if (Array.isArray(original)) return [{ type: "text", text }];
  const o = original as any;
  if (o && Array.isArray(o.content)) return { ...o, content: [{ type: "text", text }] };
  if (o && ("stdout" in o)) return { ...o, stdout: text, stderr: "" };
  return text;
}

const SUPPORTS: Record<string, Verdict["action"][]> = {
  PreToolUse: ["ask", "deny", "rewrite", "context"],
  PostToolUse: ["context", "replace_output"],
  PostToolUseFailure: ["context"],
  Stop: ["continue", "notify"],
};

export const claudeCode: Adapter = {
  neutral: () => "",
  observe(event, raw) {
    if (event !== "UserPromptSubmit") return null;
    if (raw.session_id && typeof raw.prompt === "string") rememberPrompt(raw.session_id, raw.prompt);
    return "";
  },
  normalize(event, raw) {
    const kind = KIND[event];
    if (!kind) return null;
    return {
      agent: "claude-code", kind,
      sessionId: raw.session_id ?? "unknown", cwd: raw.cwd ?? process.cwd(), transcriptPath: raw.transcript_path,
      tool: tool(raw), lastAssistantText: raw.last_assistant_message, reentry: !!raw.stop_hook_active,
    };
  },
  supports: (event, v) => SUPPORTS[event]?.includes(v.action) ?? false,
  render(event, m, _e, raw) {
    const ctx = m.context.length ? m.context.join("\n") : undefined;
    if (event === "PreToolUse") {
      const h: any = { hookEventName: "PreToolUse" };
      if (m.gate) { h.permissionDecision = m.gate.action; h.permissionDecisionReason = m.gate.reason; }
      else if (m.rewrite) h.updatedInput = m.rewrite.input; // no permissionDecision: normal permission rules still apply
      const notes = [m.rewrite?.note, ctx].filter(Boolean).join("\n");
      if (notes) h.additionalContext = notes;
      return JSON.stringify({ hookSpecificOutput: h });
    }
    if (event === "PostToolUse" || event === "PostToolUseFailure") {
      const h: any = { hookEventName: event };
      if (ctx) h.additionalContext = ctx;
      if (event === "PostToolUse" && m.replace) h.updatedToolOutput = shaped(raw.tool_response, m.replace.output);
      return JSON.stringify({ hookSpecificOutput: h });
    }
    if (event === "Stop") {
      const out: any = {};
      if (m.cont) { out.decision = "block"; out.reason = m.cont.reason; }
      if (m.notify.length) out.systemMessage = m.notify.join("\n");
      return JSON.stringify(out);
    }
    return "";
  },
};

if (import.meta.main) await runAdapter(claudeCode, process.argv[2]);
