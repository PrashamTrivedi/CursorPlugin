---
name: quick-fix
description: Direct implementation for trivial changes (complexity score 1). No planning, no documentation, just fix and verify. For CSS, text, config changes only.
disable-model-invocation: true
---

---
allowed-tools: Bash,  Read, Write, Edit, MultiWrite, MultiEdit, Bash(gh:*)
description: Direct implementation for trivial changes (complexity score 1). No planning, no documentation, just fix and verify. For CSS, text, config changes only.
model: sonnet
---

Execute immediate fix for trivial changes without planning overhead.

## Arguments

Change description: $ARGUMENTS Hub Directory Name: $ARGUMENTS

## Hub

You should work in a proper directory in taskNotes directory.

This directory will be created and passed to you. IMPORTANT: DO NOT CREATE IT.

You should read the relevant files from there and write the relevants file to
there.

## Phase 1: Direct Implementation

Implement the change immediately:

```bash
# Identify files to modify
find . -type f \( -name "*.css" -o -name "*.scss" -o -name "*.tsx" -o -name "*.ts" -o -name "*.json" \) | grep -v node_modules | head -20
```

Make the required changes directly to the identified files.

## Phase 2: Verification

Verify the change works:

```bash
# Check if code compiles
npm run build || echo "No build step configured"

# Run any existing tests
npm test -- --watchAll=false || echo "No tests configured"

# Check for linting issues
npm run lint ||  echo "No linting configured"
```

## Phase 3: Visual Verification (if UI change)

If this is a UI change, capture the result:

```bash
# Start dev server if needed
npm run dev || npm start  &
SERVER_PID=$!

# Wait for server
sleep 5

# Note: Manual visual verification needed
echo "Please verify the visual change at http://localhost:3000"

# Clean up
kill $SERVER_PID 2>/dev/null
```

## Phase 4: Commit Changes

**Important**: If you are not running in a git directory, ask user to initiate
git directory and configure email and name.

```bash
# Stage and commit
git add -A
git status
git commit -m "fix: $ARGUMENTS"

# Show what changed
git show --stat HEAD
```

## Output

Create `quick-fix-summary.md`:

```markdown
# Quick Fix Completed

## Change Summary

[What was changed]

## Files Modified

- [List of modified files]

## Verification

- ✅ Code compiles successfully
- ✅ Tests pass (if applicable)
- ✅ Linting passes (if applicable)
- ✅ Visual verification complete (if UI change)

## Commit

[Commit hash and message]

## Time Spent

[Actual time taken]

No further documentation needed for this trivial change.
```

## Success Criteria

- Change implemented directly
- No planning documents generated
- No architecture review needed
- Completed in < 30 minutes
- Working code verified

**Remember**: This is for TRIVIAL changes only. If you encounter unexpected
complexity, stop and recommend re-running `/triage`.
