#!/usr/bin/env bun
/**
 * Lazy-load nested CLAUDE.md (Claude Code analogue).
 * After a file tool succeeds, walk from that path to the workspace root and
 * inject the nearest CLAUDE.md that is not the repo-root file (already auto-loaded).
 */
import { dirname, join, relative, resolve, sep } from "path";
import { homedir } from "os";
import { conversationId, filePathFromInput, readHookInput, workspaceRoot } from "./lib.ts";

const STATE_DIR = join(homedir(), ".cursor", "hooks-state");

function isInside(child: string, parent: string): boolean {
  const a = resolve(child);
  const b = resolve(parent);
  return a === b || a.startsWith(b + sep);
}

async function nearestNestedClaudeMd(startFile: string, root: string): Promise<string | null> {
  let dir = dirname(resolve(startFile));
  const stop = resolve(root);
  if (!isInside(dir, stop) && dir !== stop) {
    if (!isInside(startFile, stop)) return null;
    dir = dirname(resolve(startFile));
  }

  while (true) {
    const candidate = join(dir, "CLAUDE.md");
    const file = Bun.file(candidate);
    if (await file.exists()) {
      if (dir === stop) return null;
      return candidate;
    }
    if (dir === stop) return null;
    const parent = dirname(dir);
    if (parent === dir) return null;
    if (!isInside(parent, stop) && parent !== stop) return null;
    dir = parent;
  }
}

async function alreadyInjected(convId: string, path: string): Promise<boolean> {
  const stateFile = join(STATE_DIR, `${convId.replace(/[^a-zA-Z0-9._-]/g, "_")}.json`);
  try {
    const raw = await Bun.file(stateFile).text();
    const data = JSON.parse(raw) as { injected?: string[] };
    return Array.isArray(data.injected) && data.injected.includes(path);
  } catch {
    return false;
  }
}

async function markInjected(convId: string, path: string): Promise<void> {
  await Bun.$`mkdir -p ${STATE_DIR}`.quiet();
  const stateFile = join(STATE_DIR, `${convId.replace(/[^a-zA-Z0-9._-]/g, "_")}.json`);
  let injected: string[] = [];
  try {
    const raw = await Bun.file(stateFile).text();
    const data = JSON.parse(raw) as { injected?: string[] };
    if (Array.isArray(data.injected)) injected = data.injected;
  } catch {
    /* first write */
  }
  if (!injected.includes(path)) injected.push(path);
  await Bun.write(stateFile, JSON.stringify({ injected }, null, 2));
}

try {
  const input = await readHookInput();
  const path = filePathFromInput(input);
  if (!path) process.exit(0);

  const root = workspaceRoot(input);
  const found = await nearestNestedClaudeMd(path, root);
  if (!found) process.exit(0);

  const convId = conversationId(input);
  if (await alreadyInjected(convId, found)) process.exit(0);

  const body = (await Bun.file(found).text()).trim();
  if (!body) process.exit(0);

  await markInjected(convId, found);
  const rel = relative(root, found) || found;
  const additional_context = `Nested CLAUDE.md (\`${rel}\`) — apply while working in this directory:\n\n${body}`;
  console.log(JSON.stringify({ additional_context }));
  process.exit(0);
} catch {
  process.exit(0);
}
