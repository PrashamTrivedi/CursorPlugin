#!/usr/bin/env bun
// Cursor adapter. Events: beforeShellExecution, beforeMCPExecution, preToolUse, postToolUse, postToolUseFailure,
// afterAgentResponse, stop, subagentStart. No preCompact (dropped by design).
// Verified live (2026-10-03): {"permission":"allow"} does not bypass Cursor's own approval; observational hooks ignore bad
// output silently; permission hooks block on malformed output, so neutral is always valid JSON.
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadState, saveState } from "../../core/store.ts";
import { rememberPrompt } from "../../core/transcript.ts";
import type { HookEvent, ToolCall, Verdict } from "../../core/types.ts";
import { flattenOutput, runAdapter, type Adapter } from "../common.ts";

const PERMISSION_EVENTS = new Set(["beforeShellExecution", "beforeMCPExecution", "preToolUse", "subagentStart"]);

const parse = (v: unknown) => {
  if (typeof v !== "string") return v ?? {};
  try { return JSON.parse(v); } catch { return {}; }
};

function tool(event: string, raw: any): ToolCall | undefined {
  if (event === "beforeShellExecution") return { name: "Shell", kind: "shell", input: { command: raw.command }, command: raw.command };
  if (event === "beforeMCPExecution") {
    const args = parse(raw.tool_input);
    return { name: `MCP:${raw.tool_name}`, kind: "mcp", input: args, mcpServer: raw.mcp_server_name, mcpTool: raw.tool_name, mcpArgs: args };
  }
  if (event === "subagentStart") return { name: "Task", kind: "subagent", input: {}, subagentPrompt: raw.task, subagentModel: raw.subagent_model };
  const name: string = raw.tool_name ?? "";
  const i = parse(raw.tool_input) as any;
  let t: ToolCall;
  // Hook payloads use `file_path`; Cursor's own transcripts use `path` (both seen live). Accept either.
  const path = i.file_path ?? i.path;
  if (name === "Shell") t = { name, kind: "shell", input: i, command: i.command, description: i.description };
  else if (name === "Read") t = { name, kind: "read", input: i, path, range: i.offset || i.limit ? { start: i.offset, end: i.limit ? (i.offset ?? 1) + i.limit - 1 : undefined } : undefined };
  else if (name === "Write") t = { name, kind: "write", input: i, path, content: i.contents ?? i.content };
  else if (name === "StrReplace") t = { name, kind: "edit", input: i, path, content: i.new_string };
  else if (name === "WebFetch") t = { name, kind: "fetch", input: i, url: i.url };
  else if (name === "Task") t = { name, kind: "subagent", input: i, subagentPrompt: i.prompt, subagentModel: i.model };
  else if (name.startsWith("MCP:")) {
    const args = i.arguments && typeof i.arguments === "object" ? i.arguments : i;
    t = { name, kind: "mcp", input: i, mcpTool: name.slice(4), mcpServer: i.namespace ?? raw.mcp_server_name, mcpArgs: args };
  } else t = { name, kind: "other", input: i };
  if (raw.tool_output !== undefined) t.output = flattenOutput(raw.tool_output);
  if (raw.error_message) t.error = String(raw.error_message);
  return t;
}

/** preToolUse sends transcript_path: null in cursor-agent, but the file exists at a path keyed by conversation id. */
function findTranscript(conversationId: string): string | undefined {
  if (!/^[0-9a-f-]{8,}$/i.test(conversationId)) return undefined;
  for (const root of [join(homedir(), ".cursor", "projects")]) {
    if (!existsSync(root)) continue;
    for (const proj of readdirSync(root)) {
      const p = join(root, proj, "agent-transcripts", conversationId, `${conversationId}.jsonl`);
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

const KIND: Record<string, HookEvent["kind"]> = {
  beforeShellExecution: "pre_tool", beforeMCPExecution: "pre_tool", preToolUse: "pre_tool",
  postToolUse: "post_tool", postToolUseFailure: "tool_failure", stop: "stop", subagentStart: "subagent_start",
};

const SUPPORTS: Record<string, Verdict["action"][]> = {
  beforeShellExecution: ["ask", "deny"],
  beforeMCPExecution: ["ask", "deny"],
  preToolUse: ["deny", "rewrite"],          // "ask" is not enforced on preToolUse
  postToolUse: ["context", "replace_output"], // replace only lands for MCP tools
  postToolUseFailure: ["context"],
  stop: ["continue"],
  subagentStart: [],                          // deny-only hook; the router logs instead
};

export const cursor: Adapter = {
  neutral: (event) => (PERMISSION_EVENTS.has(event) ? JSON.stringify({ permission: "allow" })
    : event === "beforeSubmitPrompt" ? JSON.stringify({ continue: true }) : "{}"),
  observe(event, raw) {
    if (event === "beforeSubmitPrompt") {
      if (raw.conversation_id && typeof raw.prompt === "string") rememberPrompt(raw.conversation_id, raw.prompt);
      return JSON.stringify({ continue: true });
    }
    if (event !== "afterAgentResponse") return null;
    if (raw.conversation_id && typeof raw.text === "string") saveState(`${raw.conversation_id}-last`, { text: raw.text.slice(-6000) });
    return "{}";
  },
  normalize(event, raw) {
    const kind = KIND[event];
    if (!kind) return null;
    const sessionId = raw.conversation_id ?? "unknown";
    const e: HookEvent = {
      agent: "cursor", kind, sessionId,
      cwd: raw.cwd ?? raw.workspace_roots?.[0] ?? process.cwd(), transcriptPath: raw.transcript_path ?? findTranscript(sessionId),
      tool: kind === "stop" ? undefined : tool(event, raw),
    };
    if (kind === "stop") {
      e.lastAssistantText = loadState<{ text?: string }>(`${sessionId}-last`, {}).text;
      e.reentry = (raw.loop_count ?? 0) > 0 || raw.status !== "completed";
    }
    return e;
  },
  supports(event, v) {
    if (event === "postToolUse" && v.action === "replace_output") return true; // engine can't see the tool; render drops non-MCP
    return SUPPORTS[event]?.includes(v.action) ?? false;
  },
  render(event, m, e) {
    const ctx = m.context.length ? m.context.join("\n") : undefined;
    if (event === "beforeShellExecution" || event === "beforeMCPExecution") {
      if (!m.gate) return JSON.stringify({ permission: "allow" });
      return JSON.stringify({ permission: m.gate.action, user_message: m.gate.reason, agent_message: m.gate.reason });
    }
    if (event === "preToolUse") {
      if (m.gate?.action === "deny") return JSON.stringify({ permission: "deny", user_message: m.gate.reason, agent_message: m.gate.reason });
      if (m.rewrite) return JSON.stringify({ permission: "allow", updated_input: m.rewrite.input, agent_message: m.rewrite.note });
      return JSON.stringify({ permission: "allow" });
    }
    if (event === "postToolUse") {
      const out: any = {};
      if (ctx) out.additional_context = ctx;
      if (m.replace && e.tool?.kind === "mcp") out.updated_mcp_tool_output = { content: [{ type: "text", text: m.replace.output }] };
      return JSON.stringify(out);
    }
    if (event === "postToolUseFailure") return JSON.stringify(ctx ? { additional_context: ctx } : {});
    if (event === "stop") return JSON.stringify(m.cont ? { followup_message: m.cont.reason } : {});
    return this.neutral(event, {});
  },
};

if (import.meta.main) await runAdapter(cursor, process.argv[2]);
