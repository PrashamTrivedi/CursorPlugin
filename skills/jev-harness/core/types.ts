// Jev wire types and the harness's agent-neutral event/verdict model.

export type Instructions = string | Record<string, unknown> | unknown[];
export type NoulQ = { type: "noul"; instructions: Instructions };
export type ChoiceQ = { type: "choice"; instructions: Instructions; criteria: Record<string, string | null> };
export type ScoreQ = { type: "score"; instructions: Instructions; criteria: string[] };
export type Question = NoulQ | ChoiceQ | ScoreQ;
export type Questions = Record<string, Question>;

export type NoulA = { type: "noul"; noul: number };
export type ChoiceA = { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number };
export type ScoreA = { type: "score"; score: number; probabilities: Record<string, number>; confidence: number };
export type Answer = NoulA | ChoiceA | ScoreA;
export type Answers = Record<string, Answer>;

export interface JevResult {
  answers: Answers;
  model: string;
  inputTokens: number;
  ms: number;
}

export type AgentId = "claude-code" | "cursor" | "antigravity";

export type ToolKind =
  | "shell" | "read" | "write" | "edit" | "mcp" | "fetch" | "subagent" | "browser" | "other";

export type EventKind =
  | "pre_tool"         // before a tool runs (CC PreToolUse, Cursor before*/preToolUse, AG PreToolUse)
  | "post_tool"        // after a tool ran, output available (CC PostToolUse, Cursor postToolUse)
  | "tool_failure"     // a tool failed (CC PostToolUseFailure, Cursor postToolUseFailure)
  | "stop"             // agent is about to stop (CC Stop, Cursor stop, AG Stop)
  | "agent_response"   // final assistant text, observational (Cursor afterAgentResponse)
  | "pre_invocation"   // before the model runs (AG PreInvocation)
  | "subagent_start";  // before a subagent starts (Cursor subagentStart)

export interface ToolCall {
  name: string;               // agent's own tool name
  kind: ToolKind;
  input: Record<string, any>; // agent's own argument object (rewrites go back in this shape)
  command?: string;           // shell
  description?: string;       // shell intent, when the agent gives one
  path?: string;              // read/write/edit target
  content?: string;           // write/edit new content
  range?: { start?: number; end?: number }; // read range already requested, 1-based lines
  url?: string;               // fetch
  mcpServer?: string;
  mcpTool?: string;
  mcpArgs?: Record<string, any>;
  output?: string;            // post_tool
  error?: string;             // tool_failure
  subagentPrompt?: string;
  subagentModel?: string;
}

export interface HookEvent {
  agent: AgentId;
  kind: EventKind;
  sessionId: string;
  cwd: string;
  transcriptPath?: string;
  tool?: ToolCall;
  lastAssistantText?: string; // stop / agent_response
  reentry?: boolean;          // a stop hook already continued this turn
}

export type Verdict =
  | { action: "none" }
  | { action: "ask"; reason: string }
  | { action: "deny"; reason: string }
  | { action: "rewrite"; input: Record<string, any>; note: string }
  | { action: "context"; text: string }
  | { action: "replace_output"; output: string; note: string }
  | { action: "continue"; reason: string }
  | { action: "notify"; message: string };

export const NONE: Verdict = { action: "none" };
