#!/usr/bin/env bun
/**
 * Port of ~/.claude/hookScripts/preToolUse.ts
 * Blocks .env access, dangerous rm, force-push, hard reset, secret git add.
 */
import { allow, deny, filePathFromInput, readHookInput, shellCommand, toolInput, toolName } from "./lib.ts";

function isDangerousRmCommand(command: string): boolean {
  const normalized = command.toLowerCase().split(/\s+/).join(" ");
  const patterns = [
    /\brm\s+.*-[a-z]*r[a-z]*f/,
    /\brm\s+.*-[a-z]*f[a-z]*r/,
    /\brm\s+--recursive\s+--force/,
    /\brm\s+--force\s+--recursive/,
    /\brm\s+-r\s+.*-f/,
    /\brm\s+-f\s+.*-r/,
  ];
  for (const pattern of patterns) {
    if (pattern.test(normalized)) return true;
  }
  const dangerousPaths = [/^\/$/, /^\/\*$/, /\s~\s/, /\s~\//, /\$HOME/, /\s\.\.\s/, /\s\*\s/, /\s\.\s*$/];
  if (/\brm\s+.*-[a-z]*r/.test(normalized)) {
    for (const path of dangerousPaths) {
      if (path.test(normalized)) return true;
    }
  }
  return false;
}

function isEnvFileAccess(name: string, inner: Record<string, any>, command: string): boolean {
  const fileAccessTools = [
    "Read",
    "Edit",
    "MultiEdit",
    "Write",
    "StrReplace",
    "read_file",
    "write_file",
    "replace",
    "TabRead",
    "TabWrite",
  ];
  if (fileAccessTools.includes(name)) {
    const filePath = inner.file_path || inner.absolute_path || inner.path || "";
    if (
      filePath &&
      filePath.includes(".env") &&
      !filePath.endsWith(".env.sample") &&
      !filePath.endsWith(".env.example")
    ) {
      return true;
    }
  }

  if (name === "Bash" || name === "Shell" || name === "run_shell_command" || command) {
    const envPatterns = [
      /\b\.env\b(?!\.sample)(?!\.example)/,
      /cat\s+.*\.env\b(?!\.sample)(?!\.example)/,
      /echo\s+.*>\s*.*\.env\b(?!\.sample)(?!\.example)/,
      /touch\s+.*\.env\b(?!\.sample)(?!\.example)/,
      /cp\s+.*\.env\b(?!\.sample)(?!\.example)/,
      /mv\s+.*\.env\b(?!\.sample)(?!\.example)/,
    ];
    for (const pattern of envPatterns) {
      if (pattern.test(command)) return true;
    }
  }
  return false;
}

function isDangerousGitCommand(command: string): { dangerous: boolean; reason: string } {
  const normalized = command.toLowerCase();
  if (/git\s+push\s+.*--force/.test(normalized) || /git\s+push\s+-f\b/.test(normalized)) {
    if (!/--force-with-lease/.test(normalized)) {
      return { dangerous: true, reason: "Force push detected. Use --force-with-lease if you must force push." };
    }
  }
  const protectedBranches = ["main", "master", "production", "prod", "release"];
  if (/git\s+reset\s+--hard/.test(normalized) && !/git\s+reset\s+--hard\s+[a-f0-9]{7,}/.test(normalized)) {
    return { dangerous: true, reason: "Hard reset without specific commit SHA is risky. Specify a commit hash." };
  }
  if (/git\s+branch\s+.*-[dD]\s+/.test(normalized)) {
    for (const branch of protectedBranches) {
      if (normalized.includes(branch)) {
        return { dangerous: true, reason: `Deletion of protected branch '${branch}' is blocked.` };
      }
    }
  }
  if (
    /git\s+clean\s+.*-[a-z]*f[a-z]*d[a-z]*x/.test(normalized) ||
    /git\s+clean\s+.*-[a-z]*f[a-z]*x[a-z]*d/.test(normalized)
  ) {
    return {
      dangerous: true,
      reason: "git clean -fdx removes all untracked files including ignored ones. Be more specific.",
    };
  }
  return { dangerous: false, reason: "" };
}

function hasSecretsInGitAdd(command: string): { hasSecrets: boolean; reason: string } {
  if (!/git\s+(add|commit)/.test(command.toLowerCase())) {
    return { hasSecrets: false, reason: "" };
  }
  const secretFilePatterns = [
    /\.env$/,
    /\.env\.local$/,
    /\.env\.production$/,
    /credentials\.json/,
    /service[-_]?account[-_]?key/i,
    /\.pem$/,
    /\.key$/,
    /id_rsa/,
    /id_ed25519/,
    /\.aws\/credentials/,
    /\.ssh\//,
  ];
  for (const pattern of secretFilePatterns) {
    if (pattern.test(command)) {
      return { hasSecrets: true, reason: `Potential secret file detected in git command: ${pattern}` };
    }
  }
  return { hasSecrets: false, reason: "" };
}

try {
  const input = await readHookInput();
  const name = toolName(input);
  const inner = toolInput(input);
  const command = shellCommand(input);
  const event = String(input.hook_event_name || input.hookEventName || "");

  if (isEnvFileAccess(name, inner, command)) {
    deny(
      "Access to .env files containing sensitive data is prohibited. Use .env.sample or .env.example instead.",
    );
    process.exit(0);
  }

  const isShell =
    name === "Bash" ||
    name === "Shell" ||
    name === "run_shell_command" ||
    event === "beforeShellExecution" ||
    Boolean(command && (event.includes("Shell") || !name));

  if (isShell && command) {
    if (isDangerousRmCommand(command)) {
      deny("Dangerous rm command detected and prevented.");
      process.exit(0);
    }
    const gitCheck = isDangerousGitCommand(command);
    if (gitCheck.dangerous) {
      deny(gitCheck.reason);
      process.exit(0);
    }
    const secretsCheck = hasSecretsInGitAdd(command);
    if (secretsCheck.hasSecrets) {
      deny(`${secretsCheck.reason} Ensure this file is in .gitignore or remove it from staging.`);
      process.exit(0);
    }
  }

  const warnings: string[] = [];
  const filePath = filePathFromInput(input) || command;
  const prodPatterns = [
    { pattern: /wrangler\.(jsonc?|toml)/, label: "Cloudflare Workers config" },
    { pattern: /docker-compose\.prod/, label: "production Docker Compose" },
    { pattern: /\.github\/workflows\//, label: "CI/CD pipeline" },
    { pattern: /Dockerfile/, label: "Docker build" },
    { pattern: /terraform\/|\.tf$/, label: "Terraform infrastructure" },
    { pattern: /pulumi\/|Pulumi\.(yaml|ts)/, label: "Pulumi infrastructure" },
  ];
  for (const { pattern, label } of prodPatterns) {
    if (pattern.test(filePath)) {
      warnings.push(`Touching ${label} — changes may affect live/deployed systems.`);
      break;
    }
  }
  if (/migrat(e|ion)/i.test(filePath) && /\.(sql|ts|js)$/.test(filePath)) {
    warnings.push("Database migration file — verify this is reversible and won't break production data.");
  }

  if (warnings.length > 0) {
    allow({ agent_message: warnings.join("\n") });
  } else {
    allow();
  }
  process.exit(0);
} catch {
  process.exit(0);
}
