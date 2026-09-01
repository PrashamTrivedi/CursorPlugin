#!/usr/bin/env bun
/** Port of parakh-testing skill: block localhost evidence. */
import { allow, deny, readHookInput, toolInput, toolName } from "./lib.ts";

try {
  const input = await readHookInput();
  const name = toolName(input);
  const inner = toolInput(input);
  const looksLikeParakh =
    /parakh/i.test(name) && /run_test|runTest/i.test(name + JSON.stringify(inner));
  if (!looksLikeParakh && !/run_test/.test(name)) {
    allow();
    process.exit(0);
  }
  const code = String(inner.testCode || inner.test_code || inner.code || "");
  if (/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(code)) {
    deny(
      "Parakh evidence must be captured against a deployed API, not localhost. Point testCode at the deployed base URL and run again.",
    );
    process.exit(0);
  }
  allow();
  process.exit(0);
} catch {
  process.exit(0);
}
