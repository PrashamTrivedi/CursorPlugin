---
name: tree
description: Create, manage, and synchronize git worktrees with branch isolation
disable-model-invocation: true
---

---
allowed-tools: Bash(git:*), FileSystem, Bash(find:*), Bash(ls:*), Bash(cp:*), Bash(mkdir:*)
description: Create, manage, and synchronize git worktrees with branch isolation
model: sonnet
---

# Create and manage git worktrees

## Context and Setup

- Current git status: `git status --porcelain`
- Current branch: `git branch --show-current`
- Existing worktrees: `git worktree list`
- Main branch detection:
  `git branch -r | grep -E 'origin/(main|master)' | head -1 | cut -d'/' -f2`
- Remote branches: `git branch -r | grep -v HEAD | cut -d'/' -f2 | sort`
- Root .env file: `ls -la .env 2>/dev/null || echo "No .env file found"`
- Trees directory: `ls -la trees/ 2>/dev/null || echo "No trees directory"`

## Variables

- **comma_separated_branch_names**: $ARGUMENTS
- **tree_directory**: `trees/`
- **main_branch**: Detected from context (main or master)
- **subcommand**: Parsed from first argument
  - `none` (Default) - Create new worktrees
  - `merge` - Merge specified branches into main and cleanup
  - `push` - Push specified branches to remote
  - `clean` - Remove specified worktrees
  - `sync` - Sync worktrees with remote changes
  - `status` - Show status of all worktrees

## Examples

```bash
/tree feature1,feature2,feature3        # Create worktrees
/tree merge feature1                    # Merge feature1 into main
/tree push feature1,feature2            # Push branches to remote
/tree clean feature1                    # Remove feature1 worktree
/tree sync                              # Sync all worktrees
/tree status                            # Show worktree status
```

````
## Validation and Safety Checks

- Verify git repository is clean or stash changes
- Check if main branch exists and is up to date
- Validate branch names (no spaces, special chars)
- Ensure no conflicting worktrees exist
- Check remote connectivity for push/merge operations
- Verify sufficient disk space for worktrees

## Process Flow

### Default (Create Worktrees)

1. Parse comma-separated branch names
2. Create `trees/` directory if it doesn't exist
3. For each branch:
   - Check if branch exists locally or remotely
   - Create worktree: `git worktree add trees/{branch_name} {branch_name}`
   - If branch doesn't exist:
     `git worktree add -b {branch_name} trees/{branch_name}`
   - Copy `.env` file if exists: `cp .env trees/{branch_name}/.env`
   - Copy other config files: `.nvmrc`, `.vscode/`, etc.

### Merge Subcommand

1. Validate worktree exists in `trees/{branch_name}`
2. Navigate to worktree directory
3. Sync with remote: `git fetch origin && git rebase origin/{main_branch}`
4. Run pre-merge checks (tests, lint if available)
5. Switch to main branch and merge
6. Push merged changes to remote
7. Remove worktree and local branch
8. Report merge status

### Push Subcommand

1. For each specified branch:
   - Validate worktree exists
   - Navigate to worktree
   - Sync with remote: `git fetch origin`
   - Push branch: `git push origin {branch_name}`
   - Set upstream if first push
2. Report push status for each branch

### Clean Subcommand

1. For each specified branch:
   - Remove worktree: `git worktree remove trees/{branch_name}`
   - Optionally delete local branch
   - Remove copied config files
2. Report cleanup results

### Sync Subcommand

1. For each existing worktree:
   - Navigate to worktree
   - Fetch latest: `git fetch origin`
   - Rebase on main: `git rebase origin/{main_branch}`
   - Report sync status

### Status Subcommand

1. List all worktrees with their status
2. Show uncommitted changes in each
3. Show sync status with remote
4. Show disk usage of worktrees

## Enhanced Features

### Smart Branch Detection

- Auto-detect if branch exists locally or remotely
- Suggest similar branch names if typos detected
- Handle branch name conflicts gracefully

### Environment Management

- Copy multiple config files: `.env`, `.env.local`, `.nvmrc`
- Template-based environment setup
- Environment variable validation

### Development Workflow Integration

- Run `npm install` or `yarn install` in new worktrees
- Copy `node_modules` symlinks if possible
- Pre-commit hook setup in worktrees

### Parallel Operations

- Process multiple branches concurrently where safe
- Show progress indicators for long operations
- Batch operations for efficiency

## Error Handling and Recovery

- Provide clear error messages with suggested fixes
- Automatic cleanup on failed operations
- Recovery commands for corrupted worktrees
- Backup important changes before destructive operations

## Report Format

```
🌳 Git Worktrees Report
========================

Created Worktrees:
├── trees/feature1 → feature1 branch
│   ├── .env copied ✓
│   └── Status: Ready for development
├── trees/feature2 → feature2 branch (new)
│   ├── .env copied ✓
│   └── Status: Ready for development

Summary:
- 2 worktrees created
- 2 .env files copied
- 0 errors
- Total disk usage: 45.2 MB

Next Steps:
- cd trees/feature1 && npm install
- cd trees/feature2 && npm install
```

## Advanced Configuration

CREDIT: IndyDevDan on YouTube - Original concept Enhanced for production
workflow management
````
