// Read just enough of each agent's transcript to know the task and the last reply.
// Formats observed on disk: Claude Code {type, message:{role, content}}, Cursor {role, message:{content}},
// Antigravity steps {type: USER_INPUT|PLANNER_RESPONSE, content}.
import { existsSync, readFileSync, statSync } from "node:fs";
import { loadState, saveState } from "./store.ts";
import type { AgentId, HookEvent } from "./types.ts";

interface Turn { role: "user" | "assistant"; text: string; usageTokens?: number }

const MAX_BYTES = 8 * 1024 * 1024; // only the tail of very large transcripts

function readLines(path: string): string[] {
  if (!path || !existsSync(path)) return [];
  const size = statSync(path).size;
  const buf = readFileSync(path);
  const text = buf.subarray(Math.max(0, size - MAX_BYTES)).toString("utf8");
  return text.split("\n").filter(Boolean);
}

const textOf = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((b: any) => b?.type === "text" && typeof b.text === "string").map((b: any) => b.text).join("\n");
};

function stripWrappers(s: string): string {
  const q = s.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/) ?? s.match(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/);
  return (q ? q[1] : s).trim();
}

export function turns(agent: AgentId, path?: string): Turn[] {
  const out: Turn[] = [];
  for (const line of readLines(path ?? "")) {
    let e: any;
    try { e = JSON.parse(line); } catch { continue; }
    if (agent === "antigravity") {
      if (e.type === "USER_INPUT" && typeof e.content === "string") out.push({ role: "user", text: stripWrappers(e.content) });
      else if (e.type === "PLANNER_RESPONSE" && typeof e.content === "string" && e.content.trim()) out.push({ role: "assistant", text: e.content });
      continue;
    }
    const role = e.message?.role ?? e.role ?? e.type;
    const content = e.message?.content;
    if (role === "user") {
      // Claude Code tool results also arrive as role:user; only keep real prompts.
      if (Array.isArray(content) && content.some((b: any) => b?.type === "tool_result")) continue;
      const t = stripWrappers(textOf(content));
      if (t && !t.startsWith("<command-") && !t.startsWith("<local-command")) out.push({ role: "user", text: t });
    } else if (role === "assistant") {
      const t = textOf(content);
      const u = e.message?.usage;
      const usageTokens = u ? (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) : undefined;
      if (t.trim() || usageTokens) out.push({ role: "assistant", text: t, usageTokens });
    }
  }
  return out;
}

export function lastUserPrompt(agent: AgentId, path?: string): string {
  const t = turns(agent, path).filter((x) => x.role === "user");
  return t.length ? t[t.length - 1].text : "";
}

export function recentUserPrompts(agent: AgentId, path: string | undefined, n: number): string[] {
  return turns(agent, path).filter((x) => x.role === "user").slice(-n).map((x) => x.text);
}

export function lastAssistantText(agent: AgentId, path?: string): string {
  const t = turns(agent, path).filter((x) => x.role === "assistant" && x.text.trim());
  return t.length ? t[t.length - 1].text : "";
}

/** Claude Code only: tokens in context at the last assistant message. */
export function contextTokens(agent: AgentId, path?: string): number | undefined {
  if (agent !== "claude-code") return undefined;
  const t = turns(agent, path).filter((x) => x.usageTokens);
  return t.length ? t[t.length - 1].usageTokens : undefined;
}

/** The current task in a few lines: last prompt plus the one before it. */
export function taskContext(agent: AgentId, path?: string): string {
  const p = recentUserPrompts(agent, path, 2);
  return p.map((s) => s.slice(0, 1500)).join("\n---\n");
}

// At PreToolUse time Claude Code may not have flushed the current prompt to the transcript, and cursor-agent sends no
// transcript_path at all (both seen live). Prompt-submit hooks stash prompts so decisions always know the task.
export function rememberPrompt(sessionId: string, prompt: string): void {
  if (!prompt?.trim()) return;
  const s = loadState<{ prompts: string[] }>(`${sessionId}-prompts`, { prompts: [] });
  saveState(`${sessionId}-prompts`, { prompts: [...s.prompts, stripWrappers(prompt).slice(0, 4000)].slice(-3) });
}

export function taskFor(e: HookEvent): string {
  const stashed = loadState<{ prompts: string[] }>(`${e.sessionId}-prompts`, { prompts: [] }).prompts;
  const fromTranscript = recentUserPrompts(e.agent, e.transcriptPath, 2);
  // Prefer the stash's latest prompt: it is never stale, the transcript can lag one turn.
  const prompts = stashed.length ? stashed.slice(-2) : fromTranscript;
  return prompts.map((s) => s.slice(0, 1500)).join("\n---\n");
}
