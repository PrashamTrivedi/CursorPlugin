import type { Decision } from "../core/decision.ts";
import { compactAdvisor } from "./compact-advisor.ts";
import { failureTriage } from "./failure-triage.ts";
import { injectionScreen } from "./injection-screen.ts";
import { loopDetector } from "./loop-detector.ts";
import { mcpTrim } from "./mcp-trim.ts";
import { memoryHygiene } from "./memory-hygiene.ts";
import { outboundLeak } from "./outbound-leak.ts";
import { promiseContinue } from "./promise-continue.ts";
import { readBudget } from "./read-budget.ts";
import { screenshotGate } from "./screenshot-gate.ts";
import { semanticLint } from "./semantic-lint.ts";
import { shellSafety } from "./shell-safety.ts";
import { subagentRouter } from "./subagent-router.ts";

export const DECISIONS: Decision[] = [
  shellSafety, outboundLeak, failureTriage, promiseContinue, readBudget, mcpTrim, loopDetector,
  memoryHygiene, compactAdvisor, screenshotGate, semanticLint, subagentRouter, injectionScreen,
];
