#!/usr/bin/env bun
// Antigravity adapter. Events: PreToolUse, PreInvocation, Stop. No PostToolUse (dropped by design: any output other than
// `{}` there replaces the tool's real result with an error).
// Verified live (2026-10-03): PreToolUse `{}` DENIES the call; `{"decision":"ask"}` is the normal permission flow
// (view_file still read without a prompt); PreInvocation and Stop accept `{}`. Payload keys are camelCase.
import type { HookEvent, ToolCall, Verdict } from "../../core/types.ts";
import { decodeArg, runAdapter, type Adapter } from "../common.ts";

function tool(raw: any): ToolCall | undefined {
  const call = raw.toolCall;
  if (!call?.name) return undefined;
  const a: Record<string, any> = {};
  for (const [k, v] of Object.entries(call.args ?? {})) a[k] = decodeArg(v);
  const name: string = call.name;
  const base = { name, input: a };
  switch (name) {
    case "run_command": return { ...base, kind: "shell", command: a.CommandLine, description: a.toolSummary ?? a.toolAction };
    case "view_file": return { ...base, kind: "read", path: a.AbsolutePath, range: a.StartLine || a.EndLine ? { start: a.StartLine, end: a.EndLine } : undefined };
    case "write_to_file": return { ...base, kind: "write", path: a.TargetFile, content: a.CodeContent };
    case "replace_file_content": return { ...base, kind: "edit", path: a.TargetFile, content: a.ReplacementContent };
    case "call_mcp_tool": {
      const args = decodeArg(a.Arguments);
      return { ...base, kind: "mcp", mcpServer: a.ServerName, mcpTool: a.ToolName, mcpArgs: typeof args === "object" && args ? args : {} };
    }
    case "read_url_content": return { ...base, kind: "fetch", url: a.Url };
    default: return { ...base, kind: "other" };
  }
}

const KIND: Record<string, HookEvent["kind"]> = { PreToolUse: "pre_tool", PreInvocation: "pre_invocation", Stop: "stop" };

const SUPPORTS: Record<string, Verdict["action"][]> = {
  PreToolUse: ["ask", "deny", "rewrite"],
  PreInvocation: ["context"],
  Stop: ["continue"],
};

/** `overwrite` is a shallow merge: send only the top-level keys that changed. */
function changedKeys(before: Record<string, any>, after: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(after)) if (JSON.stringify(before[k]) !== JSON.stringify(v)) out[k] = v;
  return out;
}

export const antigravity: Adapter = {
  neutral: (event) => (event === "PreToolUse" ? JSON.stringify({ decision: "ask" }) : "{}"),
  normalize(event, raw) {
    const kind = KIND[event];
    if (!kind) return null;
    return {
      agent: "antigravity", kind,
      sessionId: raw.conversationId ?? "unknown", cwd: raw.workspacePaths?.[0] ?? process.cwd(), transcriptPath: raw.transcriptPath,
      tool: kind === "pre_tool" ? tool(raw) : undefined,
      reentry: kind === "stop" ? (raw.executionNum ?? 1) > 1 || raw.terminationReason !== "model_stop" : undefined,
    };
  },
  supports: (event, v) => SUPPORTS[event]?.includes(v.action) ?? false,
  render(event, m, e) {
    if (event === "PreToolUse") {
      if (m.gate) return JSON.stringify({ decision: m.gate.action === "deny" ? "deny" : "force_ask", reason: m.gate.reason });
      if (m.rewrite) {
        const overwrite = changedKeys(e.tool?.input ?? {}, m.rewrite.input);
        return JSON.stringify(Object.keys(overwrite).length ? { decision: "ask", reason: m.rewrite.note, overwrite } : { decision: "ask" });
      }
      return JSON.stringify({ decision: "ask" });
    }
    if (event === "PreInvocation") {
      return JSON.stringify(m.context.length ? { injectSteps: m.context.map((t) => ({ ephemeralMessage: t })) } : {});
    }
    if (event === "Stop") return JSON.stringify(m.cont ? { decision: "continue", reason: m.cont.reason } : {});
    return this.neutral(event, {});
  },
};

if (import.meta.main) await runAdapter(antigravity, process.argv[2]);
