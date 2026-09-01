---
allowed-tools: Bash(git:*), Bash(tree:*), Bash(ls:*), Bash(grep:*), Bash(cat:*), Bash(find:*), Bash(gh:*), mcp__memory-server_*, FileSystem
description: Plan and analyze code tasks with comprehensive project understanding
argument-hint: github ticket id | task description
hooks:
  PreToolUse:
    - matcher: "TodoWrite"
      hooks:
        - type: command
          command: sh
          args:
            - "-c"
            - |
              echo 'codePlanner does not use TODO lists. Capture the plan in taskFindings.md instead.' >&2
              exit 2
---

# Purpose

Understand the code and requirements we are working on. Supports single or
multiple requirements with separate reports for each.

## Arguments

- One or more requirements: Can be GitHub ticket IDs, task descriptions, or a
  mix. Multiple requirements should be comma-separated or on separate lines.

---

# Phase 1: Project Context (Run Once)

Gather shared context before processing any requirements.

## Commands to run

- Current directory: `pwd`
- Project structure: `tree -L 3 -I 'node_modules|.git'`

### Git context (if applicable)

- Git status: `git status 2>/dev/null || echo "Not a git repository"`
- Current branch:
  `git branch --show-current 2>/dev/null || echo "Not a git repository"`
- Recent commits:
  `git log --oneline -5 2>/dev/null || echo "Not a git repository"`
- Remote info: `git remote -v 2>/dev/null || echo "Not a git repository"`
- Git files: `git ls-files 2>/dev/null || echo "Not a git repository"`

### Memory lookup

- Check memory-server for any project-level memories relevant to the codebase.

### Output

Store this context mentally - it applies to ALL requirements.

---

# Phase 2: Parse Requirements

From $ARGUMENT, extract the list of requirements.

- Split by comma, newline, or explicit numbering (1. 2. 3.)
- Each item becomes a separate requirement to process
- If only one requirement exists, treat it as a list of one

**Example inputs:**

- Single: `123` or `Add dark mode`
- Multiple: `123, 456, Add caching` or `123\n456\nAdd caching`

---

# Phase 3: Process Each Requirement (Loop)

For EACH requirement in the list, execute the following steps independently.

## Step 3.1: Understand the Requirement

- If GitHub Ticket ID: fetch details using `gh issue view <id>` or the GitHub
  Project Work Planner skill
- If task description: parse and understand the ask
- If both: combine ticket details with additional context

## Step 3.2: Read Relevant Code

- Read code files relevant to THIS specific requirement
- Understand adjacent files structure and style if creating new files
- If requirement involves bugs: use **triage** agent to investigate

## Step 3.3: Intelligence Gathering (per-requirement)

- Memory server: check for memories specific to this requirement's domain
- Web search: use **web-search-specialist** agent if needed for this requirement

## Step 3.4: Determine Output Location

- Directory name: Short name, max 3 words in kebab-case
- Check if upgrading existing functionality:
  - For upgrades: move existing docs to versioned directory (v1) and write new
    in `taskNotes/{directory-name}/`
  - For new: create fresh directory
- Path: `taskNotes/{directory-name}/taskFindings.md`

## Step 3.5: Create Plan

Write the plan in the following format. Enter plan mode ONLY in interactive mode —
in autonomous mode write the file directly, as plan mode would stall the flow.

```markdown
# Purpose

A one liner high level purpose of the task

## Original Ask

Exact original requirements AS IS

## Complexity and the reason behind it

Complexity score out of 5 and reason to chose this score

## Architectural changes required

If none required, simply state that, otherwise write architectural plan

## Backend changes required

If none required, simply state that, otherwise write backend implementation plan

## Frontend changes required

If none required, simply state that, otherwise write frontend implementation
plan

## Acceptance Criteria

For complexity >= 3, enumerate explicit criteria.
For complexity <= 2, the criterion is complete satisfaction of Original Ask —
state it, do not leave the section empty.

## Validation

Write the high level description of what to test and how to test it, Including
commands to run and verify the changes. For frontend, user steps. For backend:
API Flows with cases
```

### Complexity Scoring Rules

- Do not over-score simple fullstack tasks
- Consider your capabilities (greenfield scaffolding, CRUD = lower score)
- Factor in verification difficulty
- For dependency upgrades: consider breaking changes, new features, total
  changes

## Step 3.6: Specs (for complexity >= 3)

- Create specs directory: `taskNotes/{directory-name}/specs/`
- Write breakdown in `specs/specs.md`
- Create individual `taskFindings.md` for each spec item
- Update main taskFindings to reference specs

## Step 3.7: Report Completion

After writing taskFindings.md for this requirement, note it as complete before
moving to the next requirement.

---

# Phase 4: Summary (Run Once)

After ALL requirements are processed:

## If single requirement:

- Present the plan and ask for feedback

## If multiple requirements:

- List all generated reports with paths:
  ```
  Reports generated:
  1. taskNotes/{dir1}/taskFindings.md - [brief description]
  2. taskNotes/{dir2}/taskFindings.md - [brief description]
  ...
  ```
- Ask user which reports to review or if they want to proceed

---

# Iteration

- If user asks to change a plan, read the relevant taskFindings file and update
- Absence of taskFindings = fresh plan (not iteration)
- Any message before `/startWork` is plan iteration

---

# EXIT

## Autonomous mode (`mode: autonomous` in $ARGUMENTS)

- Write all taskFindings files, print their paths, return. Do NOT ask for review.
- Do NOT ask the user to invoke `/startWork` — the caller drives the next phase.

## Interactive mode

- After writing ALL taskFindings files, ask user to review and provide feedback
- When user confirms: present a funny, made-up Star Wars quote
- Ask user to invoke `/startWork` command to begin implementation

## Both modes

- AVOID creating any TODO list
