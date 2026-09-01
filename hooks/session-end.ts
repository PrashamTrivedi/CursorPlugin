#!/usr/bin/env bun
/**
 * Port of ~/.claude/hookScripts/stop.ts — Obsidian daily note + session metadata.
 */
import { join } from "path";
import { mkdir, stat, appendFile, writeFile } from "fs/promises";
import { conversationId, readHookInput, workspaceRoot } from "./lib.ts";

try {
  const input = await readHookInput();
  if (input.stop_hook_active) process.exit(0);

  const sessionId = conversationId(input);
  const transcriptPath = String(input.transcript_path || input.transcriptPath || "");
  const projectDir = workspaceRoot(input);

  const obsidianVaultPath = `${process.env.HOME}/NoteVaults/Prasham's Notes`;
  const dailyNotesDir = `${obsidianVaultPath}/DailyNotes`;

  try {
    await mkdir(dailyNotesDir, { recursive: true });
    const today = new Date();
    const dateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const timeString = `${String(today.getHours()).padStart(2, "0")}:${String(today.getMinutes()).padStart(2, "0")}`;
    const todayFilePath = `${dailyNotesDir}/${dateString}.md`;
    const projectName = projectDir.split("/").pop() || "unknown";
    const sessionSummary = transcriptPath
      ? `- **Project**: ${projectName}\n- **Time**: ${timeString}\n- **Transcript**: [[${transcriptPath}]]`
      : `- **Project**: ${projectName}\n- **Time**: ${timeString}`;

    let fileExists = false;
    try {
      await stat(todayFilePath);
      fileExists = true;
    } catch {
      fileExists = false;
    }
    const contentToAppend = `${fileExists ? "\n\n---\n\n" : ""}## Cursor Session - ${timeString}\n\n${sessionSummary}\n`;
    await appendFile(todayFilePath, contentToAppend);
  } catch (err) {
    console.error("[session-end] Obsidian:", err);
  }

  try {
    if (sessionId !== "unknown") {
      const memoryDir = `${process.env.HOME}/.cursor/session-memories`;
      await mkdir(memoryDir, { recursive: true });
      await writeFile(
        join(memoryDir, `${sessionId}.json`),
        JSON.stringify(
          {
            session_id: sessionId,
            project: projectDir,
            ended_at: new Date().toISOString(),
            transcript: transcriptPath,
            harness: "cursor",
          },
          null,
          2,
        ),
      );
    }
  } catch (err) {
    console.error("[session-end] memory:", err);
  }

  process.exit(0);
} catch {
  process.exit(0);
}
