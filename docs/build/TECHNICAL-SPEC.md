# babelgit Technical Specification
## Implementation Guide for v0.1

**Version:** 2.0
**Status:** ✅ Complete — v0.1 and v0.2 implemented.

**Language:** TypeScript / Node.js  
**Binary name:** `babel`

---

## Technology Decisions

### Language: TypeScript / Node.js
- Single language for CLI + MCP server
- `simple-git` for all git operations (never shell out to git with string concatenation)
- `commander` for CLI argument parsing
- `@anthropic-ai/mcp-sdk` for MCP server
- `chalk` for terminal output formatting
- `inquirer` for interactive prompts (`babel init`)
- `zod` for config file validation

### Distribution
- `npm install -g babelgit` installs the `babel` binary globally
- Requires: Node.js >= 18, git >= 2.28
- Package name: `babelgit` (npm), binary name: `babel`

### No External Services
v0.1 requires nothing beyond Node.js and git. No accounts, no servers, no network calls except git remote operations.

---

## Repository Structure (babelgit's own repo)

```
babelgit/
├── .claude/
│   └── settings.json             ← Claude Code PreToolUse hook (checked in)
├── src/
│   ├── cli/
│   │   ├── index.ts              ← entry point, command registration
│   │   ├── commands/
│   │   │   ├── init.ts           ← includes 4 workflow templates
│   │   │   ├── start.ts          ← accepts WI ID to start a todo item
│   │   │   ├── save.ts
│   │   │   ├── sync.ts
│   │   │   ├── pause.ts
│   │   │   ├── continue.ts
│   │   │   ├── stop.ts
│   │   │   ├── run.ts
│   │   │   ├── verdict.ts        ← handles keep/refine/reject/ship
│   │   │   ├── state.ts
│   │   │   ├── history.ts
│   │   │   ├── ship.ts
│   │   │   ├── config.ts         ← babel config show/validate
│   │   │   ├── diag.ts           ← babel diag environment check
│   │   │   ├── enforce.ts        ← babel enforce on/off/status
│   │   │   ├── todo.ts           ← babel todo create/push/list
│   │   │   ├── watch.ts          ← babel watch start/stop/status/install/uninstall
│   │   │   └── hook.ts           ← babel hook install/uninstall + hook-check-wi
│   │   └── display.ts            ← all terminal output formatting
│   ├── mcp/
│   │   ├── index.ts              ← MCP server entry point
│   │   └── tools.ts              ← tool definitions (13+ tools)
│   ├── core/
│   │   ├── config.ts             ← babel.config.yml read/validate
│   │   ├── governance.ts         ← enforcement layer
│   │   ├── git.ts                ← all git operations via simple-git
│   │   ├── state.ts              ← .babel/ state management
│   │   ├── checkpoint.ts         ← attestation creation and reading
│   │   ├── workitem.ts           ← work item lifecycle, branch naming
│   │   ├── reservation.ts        ← pluggable WI ID reservation (local/linear/jira)
│   │   ├── watch.ts              ← watch daemon: file watcher, polling, spec sync
│   │   ├── scripts.ts            ← run_commands execution via execa
│   │   ├── hooks.ts              ← lifecycle hooks execution
│   │   └── rules.ts              ← rules engine evaluation
│   ├── integrations/
│   │   ├── linear.ts             ← Linear GraphQL client
│   │   ├── github.ts             ← GitHub Octokit client
│   │   └── index.ts              ← IntegrationManager
│   └── types.ts                  ← shared TypeScript types
├── vscode-extension/             ← VSCode sidebar extension
│   ├── src/
│   │   ├── extension.ts          ← activation, command registration
│   │   ├── sidebarProvider.ts    ← Quick Actions + Board view tree providers
│   │   └── stateWatcher.ts       ← watches .babel/, exposes state and verdicts
│   └── package.json
├── tests/
├── sandbox/                      ← manual test scripts and scratch space
├── package.json
├── tsconfig.json
└── README.md
```

---

## File Layout in User Repositories

When babelgit is used in a project, it creates/manages these files:

```
user-project/
├── babel.config.yml              ← COMMITTED. Team config. The working agreement.
├── .claude/
│   └── settings.json             ← COMMITTED (if babel hook install run). PreToolUse hook config.
└── .babel/                       ← GITIGNORED. Local state only.
    ├── state.json                ← Current work item and session state
    ├── counter.json              ← Incremental ID counter (if no external system)
    ├── checkpoints/              ← Attestation records
    │   ├── WI-001.json
    │   └── WI-002.json
    ├── notes/                    ← Living spec files (one per work item, Claude-maintained)
    │   ├── WI-001.md
    │   └── WI-002.md
    ├── run-session.json          ← Active run session state (exists only during babel run)
    ├── watch.pid                 ← Presence indicates daemon is running; contains PID
    ├── watch-status.json         ← Daemon status snapshot (running, last_check, alerts)
    └── watch-events.json         ← Append-only event log, capped at 200 entries
```

**On GitHub branches** (committed, visible in branch history):
```
docs/specs/WI-001.md              ← spec file committed to feature/WI-001-* branch by babel todo push
```

### `.gitignore` management
`babel init` adds `.babel/` to `.gitignore` automatically.
`babel.config.yml` is committed and never gitignored.

---

## `babel.config.yml` — Full Schema

```yaml
# babel.config.yml
# This file is the team's working agreement. 
# Commit it. Review changes to it. It applies equally to everyone.

version: 1

# The branch everyone starts from and syncs to
base_branch: dev                    # default: main

# Branches that cannot be pushed to directly
protected_branches:
  - main
  - production

# Branch naming for new work items
# Supports: {prefix}, {id}, {slug}
branch_pattern: "feature/{id}-{slug}"   # default

# Work item ID configuration
work_item_id:
  source: local                     # "local" | "jira" | "linear"
  prefix: "WI"                      # prefix for local IDs → WI-001, WI-002
  # For jira/linear: project key used to validate ticket format

# What a verified checkpoint requires before certain operations
require_checkpoint_for:
  pause: false                      # default: false. Set true to require keep/ship before pause
  ship: true                        # default: true. Always require a checkpoint before ship

# Agent-specific restrictions
agents:
  permitted_branch_patterns:        # agents can only operate on branches matching these
    - "feature/*"
    - "fix/*"
    - "dev"
  require_attestation_before_pause: true   # agents must babel run + verdict before pausing

# Operations that require human confirmation (interactive only, not enforced for agents)
require_confirmation:
  - stop
  - ship

# How to integrate changes from base_branch
sync_strategy: rebase               # "rebase" | "merge"  default: rebase

# Custom workflow states (optional — uses defaults if omitted)
# These rename the default verdicts. Structure is fixed. Words are yours.
verdicts:
  keep: keep                        # rename to whatever your team calls "this is good"
  refine: refine
  reject: reject  
  ship: ship
```

### v0.2 additions to `babel.config.yml`

```yaml
# Scripts executed during babel run (v0.2)
run_commands:
  - name: tests
    command: npm test
    required: true          # if true, failure blocks keep/ship verdicts
    capture_output: true    # include stdout/stderr in checkpoint record
  - name: dev-server
    command: npm run dev
    background: true        # starts in background, killed after verdict

# Lifecycle hooks (v0.2)
hooks:
  before_save:
    - npm run lint --fix
  after_save: []
  before_run: []
  after_run: []
  before_ship:
    - npm run build
  after_ship: []
  before_pause: []
  after_pause: []

# Governance rules (v0.2)
rules:
  - name: conventional-commits
    type: commit_message_pattern
    pattern: "^(feat|fix|chore|docs|test|refactor):"
    apply_to: [save]
    message: "Commit must start with feat:, fix:, chore:, docs:, test:, or refactor:"
    blocking: true

  - name: no-agent-infra-changes
    type: path_restriction
    blocked_paths: [".github/**", "*.config.*", "package.json"]
    caller: agent
    apply_to: [save, ship]

  - name: tests-required-with-source
    type: files_changed
    if_changed: "src/**/*.ts"
    require_also_changed: "tests/**/*.test.ts"
    apply_to: [save]

  - name: custom-script-check
    type: script
    command: node scripts/validate.js
    apply_to: [ship]

# Integration credentials come from environment variables, not this file (v0.2)
integrations:
  linear:
    enabled: true
    team_id: "YOUR_TEAM_ID"
    api_key_env: LINEAR_API_KEY         # default: LINEAR_API_KEY
    create_issue_on_start: true
    transition_on_ship: true
    add_checkpoint_comments: true

  github:
    enabled: true
    token_env: GITHUB_TOKEN             # default: GITHUB_TOKEN
    create_draft_pr_on_pause: true
    ship_via_pr: false                  # if true, ship merges via PR instead of direct merge
    add_checkpoint_comments: true
```

### Minimal valid `babel.config.yml`
```yaml
version: 1
base_branch: main
```
Everything else has sensible defaults.

---

## Data Structures

### Work Item (`WorkItem`)
```typescript
interface WorkItem {
  id: string                    // "WI-001", "PROJ-123", or "DRAFT-{hex}" if offline
  description: string           // human-readable description
  branch?: string               // "feature/WI-001-auth-fix" — absent for todo items until pushed
  stage: WorkflowStage          // current position in lifecycle
  created_at: string            // ISO timestamp
  created_by: string            // git user.email
  planned_at?: string           // set when created via babel todo
  last_checkpoint?: Checkpoint  // most recent verified checkpoint
  paused_by?: string            // set when paused
  paused_at?: string            // set when paused
  paused_notes?: string         // set when paused
}

type WorkflowStage =
  | 'todo'                      // planned, spec written, no branch or branch reserved but not started
  | 'in_progress'
  | 'paused'
  | 'run_session_open'          // babel run called, waiting for verdict
  | 'shipped'
  | 'stopped'
```

**Notes on `todo` stage:**
- `branch` is initially `null` but is set when `babel todo push` runs (or when `reserveWorkItemId` pushes the reservation branch)
- `id` may be `DRAFT-{hex}` if the machine was offline when `babel todo` was called — the watch daemon resolves these to permanent IDs when connectivity returns
- `babel start WI-XXX` transitions a `todo` item to `in_progress` and checks out its branch

### Checkpoint (Attestation Record)
```typescript
interface Checkpoint {
  id: string                    // "WI-001-keep-3"
  work_item_id: string
  verdict: Verdict
  notes: string
  called_at: string             // ISO timestamp
  called_by: string             // git user.email or agent identifier
  caller_type: 'human' | 'agent'
  
  // The exact state that was attested
  git_commit: string            // SHA of commit when babel run was called
  git_branch: string
  filesystem_hash: string       // hash of working tree state at run time
                                // computed as: hash of `git status --porcelain`
                                // empty string if tree was clean
  
  // Recovery reference
  is_recovery_anchor: boolean   // true for keep and ship verdicts
  previous_keep?: string        // id of the checkpoint this was built on
}

type Verdict = 'keep' | 'refine' | 'reject' | 'ship'
```

### Run Session
```typescript
interface RunSession {
  work_item_id: string
  started_at: string
  locked_commit: string         // git SHA when session opened
  locked_filesystem_hash: string
  status: 'open' | 'completed'
}
```

### State File (`.babel/state.json`)
```typescript
interface BabelState {
  current_work_item_id?: string   // what's active right now
  work_items: Record<string, WorkItem>
  next_local_id: number           // counter for WI-001, WI-002, etc.
}
```

---

## Command Specifications

### `babel init`

**Preconditions:** Must be run in a git repository.

**Behavior:**
1. Check if `babel.config.yml` already exists → if yes, confirm overwrite or exit
2. Interactive prompts:
   - Base branch? (default: detected from repo, or `main`)
   - Protected branches? (default: `main`, `production` if exists)
   - Work item prefix? (default: `WI`)
3. Write `babel.config.yml`
4. Create `.babel/` directory
5. Write initial `.babel/state.json`
6. Add `.babel/` to `.gitignore` (create if needed)
7. Print: what was created, next step: `babel start`
8. Show the git commands that were run

**Does NOT:** commit the config. User decides when to commit it.

---

### `babel start [id-or-description]`

**Preconditions:**
- Valid `babel.config.yml` exists
- No other work item currently `in_progress` (if one exists, show it and ask to `babel pause` first)

**Behavior:**
1. Parse argument:
   - If matches work item ID pattern (e.g., `PROJ-123`, `WI-001`) → use as ID, prompt for description if none stored
   - If free text → generate local ID (WI-XXX), use text as description
   - If no argument → prompt interactively
2. Check governance: is current branch permitted? Is there a clean starting state?
3. `git fetch origin`
4. `git checkout -b {branch_pattern} origin/{base_branch}`
5. Create work item record in `.babel/state.json`
6. Set as current work item
7. Print: work item created, branch name, what to do next

**Git commands shown to user:**
```
→ git fetch origin
→ git checkout -b feature/WI-001-auth-fix origin/dev
```

---

### `babel save [notes]`

**Preconditions:** Current work item exists and is `in_progress`.

**Behavior:**
1. `git add -A`
2. Generate commit message: `save(WI-001): {notes or timestamp}`
3. `git commit -m "{message}"`
4. Does NOT push
5. Print: what was saved, commit SHA (short), how many saves since last sync

**If nothing to save:** Print friendly message, don't create empty commit.

---

### `babel sync`

**Preconditions:** Current work item exists.

**Behavior:**
1. `git fetch origin`
2. If `sync_strategy: rebase`: `git rebase origin/{base_branch}`
3. If `sync_strategy: merge`: `git merge origin/{base_branch}`
4. On conflict: stop, print conflict explanation in plain language, list conflicting files, tell user to resolve then `babel sync --continue`
5. Update "last synced" in state
6. Print: what changed, any conflicts, confirmation if clean

---

### `babel pause [notes]`

**Preconditions:**
- Current work item is `in_progress`
- If `require_checkpoint_for.pause: true` → must have a `keep` or `ship` checkpoint

**Behavior:**
1. Check governance: checkpoint requirement
2. `git add -A` (save any unsaved work)
3. `git commit -m "pause(WI-001): {notes or 'paused'}"` (if anything to commit)
4. `git push origin {branch}`
5. Update work item: stage → `paused`, paused_by, paused_at, paused_notes
6. Clear current_work_item_id from state
7. Print: paused, branch pushed, how to resume (`babel continue WI-001`)

---

### `babel continue [work-item-id]`

**Preconditions:** Valid config exists.

**Behavior:**
1. If no argument: find most recently paused work item by current user → use that
2. If argument: find matching work item by ID or description fuzzy match
3. If multiple paused items and no argument: list them, prompt selection
4. `git fetch origin`
5. `git checkout {branch}` (or `git checkout -b {branch} origin/{branch}` if not local)
6. `git pull origin {branch}`
7. Update work item: stage → `in_progress`
8. Set as current_work_item_id
9. Print: work item description, last checkpoint, paused notes if any, what to do next

---

### `babel stop [reason]`

**Preconditions:** Current work item exists.

**Behavior:**
1. Governance check: `require_confirmation` → if human context, confirm interactively
2. Print what will be removed, ask for confirmation (unless `--force`)
3. `git checkout {base_branch}`
4. `git branch -D {branch}` (local)
5. `git push origin --delete {branch}` (if exists on remote)
6. Update work item: stage → `stopped`, record reason
7. Clear current_work_item_id
8. Print: stopped, branch removed, work item archived locally in history

**The stopped work item remains in `.babel/state.json` as historical record.**
**Recovery:** Stopped work is in git reflog for the configured retention period. `babel history` shows it.

---

### `babel run`

**Preconditions:** 
- Current work item is `in_progress`
- No existing open run session

**Behavior:**
1. `git add -A && git stash` if dirty (save any uncommitted changes — they're part of what's being reviewed)
   - Actually: `git add -A && git commit -m "run-snapshot(WI-001): pre-run state"` to lock it
2. Record locked_commit (current HEAD SHA)
3. Record locked_filesystem_hash (hash of `git status --porcelain` output — should be clean after commit)
4. Write `.babel/run-session.json`
5. Update work item: stage → `run_session_open`

6. Print the run session header:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  babel run  ●  WI-001: fix login timeout for mobile
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Session open. Your code is locked at: abc123f
  
  Do whatever you need to do:
    → start your dev server
    → run your test suite  
    → click through the app
    → review the diff
    → ask an AI to review it
  
  When you're ready to call it:
  
    babel keep   "notes"    ← this is solid, good recovery point
    babel refine "notes"    ← close, needs specific changes
    babel reject "reason"   ← wrong direction, revert to last keep
    babel ship   "notes"    ← ready for production
  
  Last verified checkpoint: keep #2 — "auth flow working" (1h ago)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

7. **Process exits.** The session is recorded. The user does their work in other terminals/tools. They come back and call a verdict command when ready.

**Important:** `babel run` does NOT stay running. It opens the session and exits. The session state is in `.babel/run-session.json`. Verdict commands check for an open session.

---

### `babel keep [notes]` / `babel refine [notes]` / `babel reject [reason]` / `babel ship [notes]`

**Preconditions:** An open run session exists in `.babel/run-session.json`.

**Behavior for all verdicts:**
1. Read open run session
2. Verify current HEAD still matches locked_commit (if not: warn that code changed during session, confirm to proceed)
3. Identify caller: git user.email + check if running in known agent context (env vars: `CLAUDE_CODE`, `CURSOR_AGENT`, etc. → caller_type: 'agent')
4. Create checkpoint record
5. Write to `.babel/checkpoints/{work_item_id}.json` (append to array)
6. Remove `.babel/run-session.json`

**Verdict-specific behavior:**

**`keep`:**
- `is_recovery_anchor: true`
- Update work item: stage → `in_progress`, last_checkpoint updated
- Print: checkpoint created, this is now the recovery anchor

**`refine`:**
- `is_recovery_anchor: false`
- Update work item: stage → `in_progress`, last_checkpoint updated
- Print: checkpoint created with notes, recovery anchor unchanged (still last keep)

**`reject`:**
- `is_recovery_anchor: false`
- Find last `keep` or `ship` checkpoint
- `git reset --hard {last_keep_commit}`
- Update work item: stage → `in_progress`, revert to last keep checkpoint
- Print: reverted to last keep, what that state was, what the rejection notes say

**`ship`:**
- `is_recovery_anchor: true`
- Does NOT immediately merge to production
- Update work item: stage → `in_progress` with ship-ready flag
- Triggers `babel ship` flow automatically if governance allows
- OR: marks ready for `babel ship` and prompts user to run it

---

### `babel state [work-item-id?]`

**Behavior:**
No argument: shows current work item and repo state.
With argument: shows state of specific work item.

**Output format (human):**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  WI-001  fix login timeout for mobile users
  Status: In Progress  ●  branch: feature/WI-001-auth-fix
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Progress
  ─────────────────────────────────────────────
  Unsaved changes:    3 files modified
  Saves since sync:   4 commits ahead of dev
  Last sync:          47 minutes ago
  Last checkpoint:    keep #2 — "auth flow working" (1h ago)
  
  Workflow
  ─────────────────────────────────────────────
  You are here:  [In Progress] → Run → Ship
  
  Suggested next:  babel run

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Output format (JSON — for MCP and `--json` flag):**
```json
{
  "work_item": {
    "id": "WI-001",
    "description": "fix login timeout for mobile users",
    "branch": "feature/WI-001-auth-fix",
    "stage": "in_progress"
  },
  "git": {
    "uncommitted_files": 3,
    "commits_ahead_of_base": 4,
    "last_synced_minutes_ago": 47,
    "has_conflicts": false
  },
  "last_checkpoint": {
    "verdict": "keep",
    "sequence": 2,
    "notes": "auth flow working",
    "minutes_ago": 60,
    "commit": "abc123f"
  },
  "run_session": null,
  "permitted_operations": ["save", "sync", "run", "pause", "stop"],
  "blocked_operations": {
    "ship": "no ship-verdict checkpoint exists"
  },
  "suggested_next": "babel run"
}
```

---

### `babel history [work-item-id?]`

**Behavior:**
Shows checkpoint history for current or specified work item.

**Output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  WI-001  fix login timeout for mobile users
  Started: 3 hours ago  ●  6 events
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  14:32  ✓ KEEP    "auth flow solid, tested on mobile"
                    human: alex@company.com
                    commit: abc123f  ← recovery anchor
  
  13:15  ~ REFINE  "token refresh edge case on 320px"
                    human: alex@company.com
                    commit: def456a

  11:42  ✗ REJECT  "wrong approach to session management"
                    human: alex@company.com
                    → reverted to KEEP #1 (commit 789abc)
  
  10:15  ✓ KEEP    "basic auth flow, login/logout working"
                    human: alex@company.com
                    commit: 789abc  ← recovery anchor

  10:00  ▶ START   "fix login timeout for mobile users"
                    branched from: dev @ 111aaa

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Recovery: babel undo → returns to KEEP #2 (abc123f)
```

---

### `babel ship`

**Preconditions:**
- Current work item has a `ship` verdict checkpoint OR `require_checkpoint_for.ship: false`
- Current branch is not a protected branch
- Governance check passes

**Behavior:**
1. Governance check: all required conditions met
2. `git fetch origin`
3. `git checkout {base_branch}`
4. `git pull origin {base_branch}`
5. `git merge --no-ff {work_branch}` (or rebase, per config)
6. `git push origin {base_branch}`
7. `git branch -d {work_branch}` (local cleanup)
8. `git push origin --delete {work_branch}` (remote cleanup)
9. Update work item: stage → `shipped`
10. Clear current_work_item_id
11. Print: shipped, what branch was merged where, work item closed

**If governance blocks ship:** Print exactly which requirement is not met and how to meet it.

---

## The Governance Layer

All commands pass through governance before execution. Governance checks:

```typescript
interface GovernanceCheck {
  operation: string
  branch?: string
  caller: 'human' | 'agent'
}

interface GovernanceResult {
  permitted: boolean
  reason?: string             // plain English if blocked
  suggestion?: string         // what to do instead
}
```

**Governance rules enforced:**

1. **Protected branch write protection:** No push/merge to protected branches except via `babel ship` with required checkpoints
2. **Agent branch restrictions:** If `caller_type === 'agent'` and `agents.permitted_branch_patterns` is set, operations on non-matching branches are blocked
3. **Checkpoint requirements:** If `require_checkpoint_for.ship: true`, `babel ship` without a valid checkpoint is blocked
4. **Agent attestation requirement:** If `agents.require_attestation_before_pause: true`, agent cannot `babel pause` without a run session verdict
5. **Run session lock:** `babel sync` is blocked when a run session is open — syncing would change the code state after the snapshot was locked
6. **Git operation enforcement hooks** (v0.2 — see below)

---

## Git Operation Enforcement (v0.2)

This is the mechanism that prevents any tool — human, AI agent, or automation — from running git operations outside of babel.

### The Problem

The governance layer only activates when `babel` is invoked. Nothing in git itself prevents an agent or developer from running `git commit` directly, bypassing every working agreement.

### The Mechanism

Every `babel` process (CLI and MCP server) sets `BABEL_ACTIVE=1` as the first thing it does, before any git operation. Git hooks installed in `.git/hooks/` check for this variable. If absent, the operation is rejected:

```
  ✗ Direct git operation blocked.

  This repository uses babelgit for all git operations.
  Use babel commands instead of raw git.

  To disable enforcement: babel enforce off
```

Because `BABEL_ACTIVE` is an environment variable on the babel process, it is inherited by every git subprocess babel spawns. Any git invocation not started by babel will not have it set.

### Hooks Installed

| Hook | Blocks |
|------|--------|
| `pre-commit` | `git commit` |
| `pre-push` | `git push` |
| `pre-rebase` | `git rebase` |

`git fetch`, `git checkout`, and `git pull` have no blocking hook points in git's hook system. These operations are non-destructive to shared history, so the gap is acceptable.

### Lifecycle

- **`babel init`** installs enforcement hooks by default — on from inception
- **`babel enforce on/off`** toggles hooks on an existing repo
- **`babel enforce status`** shows which hooks are installed without prompting
- **`babel diag`** reports enforcement status as part of the environment check
- Hooks that already exist with non-babel content are **never overwritten** — babel skips those slots and reports the conflict

### Implementation

```typescript
// src/cli/index.ts and src/mcp/index.ts — first line before any imports
process.env.BABEL_ACTIVE = '1'
```

```bash
# .git/hooks/pre-commit (and pre-push, pre-rebase)
#!/bin/sh
# babelgit-enforce
if [ -z "$BABEL_ACTIVE" ]; then
  echo "  ✗ Direct git operation blocked."
  echo "  Use babel commands. To disable: babel enforce off"
  exit 1
fi
```

The marker string `# babelgit-enforce` in the hook file is how babel identifies hooks it owns, enabling clean removal with `babel enforce off` without touching hooks from other tools.

**Governance failure output:**
```
✗ Operation blocked: ship

  Reason: babel.config.yml requires a verified checkpoint before shipping.
  You haven't run a review session for WI-001 yet.
  
  Fix: run 'babel run' and call a verdict, then try babel ship again.
  
  To change this requirement: update require_checkpoint_for.ship in babel.config.yml
```

---

## The MCP Server

### Transport
stdio (standard input/output) — the default for Claude Code integration.

### Registration (for Claude Code / claude_desktop_config.json)
```json
{
  "mcpServers": {
    "babelgit": {
      "command": "babel",
      "args": ["mcp"]
    }
  }
}
```

### MCP Tools

All tools return structured JSON. All tools show the git commands they execute (included in response).

```typescript
// babel_state — call this before every other operation
babel_state(work_item_id?: string): StateResponse

// babel_start
babel_start(description: string, id?: string): WorkItemResponse

// babel_save
babel_save(notes?: string): SaveResponse

// babel_sync
babel_sync(): SyncResponse

// babel_pause
babel_pause(notes?: string): PauseResponse

// babel_continue
babel_continue(work_item_id?: string): ContinueResponse

// babel_stop
babel_stop(reason: string): StopResponse   // reason required for agents

// babel_run — locks snapshot, opens attestation session
babel_run(): RunSessionResponse

// babel_attest — replaces the interactive verdict commands for agents
babel_attest(
  verdict: 'keep' | 'refine' | 'reject' | 'ship',
  notes: string              // required for agents, optional for humans
): CheckpointResponse

// babel_ship
babel_ship(): ShipResponse

// babel_history
babel_history(work_item_id?: string): HistoryResponse

// babel_config — returns effective config as JSON (v0.2)
babel_config(): ConfigResponse

// babel_create_work_item — for agents with a pre-known ID (v0.2)
babel_create_work_item(id: string, description: string): WorkItemResponse
```

### Agent Usage Pattern

The correct pattern for a Claude Code agent is:

```
1. babel_state()              ← always call first. Always.
2. [read permitted_operations and current context]
3. [do work using editor/file tools]
4. babel_save("progress notes")
5. babel_run()
6. [review own work, check requirements, run whatever tests it can]
7. babel_attest("keep", "verified X, Y, Z against requirements")
8. [continue work or babel_ship()]
```

### What babel_state() Returns for Agents

The `permitted_operations` and `blocked_operations` fields are the agent's guardrails. An agent that always calls `babel_state()` before acting and respects `permitted_operations` cannot violate the team's working agreements.

```json
{
  "permitted_operations": ["save", "sync", "run", "pause"],
  "blocked_operations": {
    "ship": "no ship-verdict checkpoint exists — call babel_run then babel_attest ship"
  },
  "suggested_next": "babel run",
  "last_checkpoint": { ... },
  "work_item": { ... }
}
```

This is the answer to the 14-hour problem: the agent can always know where it is, what it's allowed to do, and where the last safe state was — without any human intervention.

---

## Output Principles

**Every command prints the git operations it executes:**
```
  → git fetch origin
  → git checkout -b feature/WI-001-auth-fix origin/dev
```

**Use `--quiet` to suppress git command display.**
**Use `--json` to get machine-readable output from any command.**

**Never print git error messages directly.** Catch git errors and translate:
```
# Instead of:
fatal: not a git repository (or any of the parent directories): .git

# Print:
✗ No git repository found.
  Run this command from inside a git repository, or run 'git init' first.
```

---

---

## v0.3 Command Specifications

### `babel todo [action] [args]`

**Actions:** `create` (default), `push`, `list`

#### `babel todo "description"` (create)

**Preconditions:** Valid `babel.config.yml` exists.

**Behavior:**
1. Call `reserveWorkItemId(description, config, repoPath)`:
   - Attempts `git fetch origin --prune` (8s timeout)
   - If offline/no remote: returns `{ id: 'DRAFT-{hex}', branch: null, isDraft: true }`
   - If online: finds highest existing WI number on remote, tries `git push origin {baseRef}:refs/heads/{branch}` atomically — first writer wins
   - If slot taken (rejected/already exists): increments and retries up to 10 times
2. Create work item in `.babel/state.json` with `stage: 'todo'`
3. Create `.babel/notes/{id}.md` as the living spec file
4. Print: ID (permanent or draft), branch (if reserved), next steps

**Draft resolution:** The watch daemon calls `resolveDrafts()` on a 30-second interval. When connectivity returns, each DRAFT item attempts reservation and the state entry and notes file are renamed to the permanent ID.

**ID reservation contract:**
- `src/core/reservation.ts` dispatches by `config.work_item_id.source`
- Source `'local'`: atomic branch push to claim number
- Source `'linear'` / `'jira'`: will create issue via API (not yet implemented — falls through to local with a warning)
- Interface: `ReservationResult { id: string; branch: string | null; isDraft: boolean }`

#### `babel todo push WI-XXX`

1. Build branch name from WI ID and description
2. If branch already exists on remote: use git worktree to update `docs/specs/{id}.md` and push
3. If branch doesn't exist: create branch from base using git worktree, commit spec, push
4. Update work item `branch` field in state

**Spec file location:** `docs/specs/{id}.md` on the feature branch (committed, visible on GitHub). Source is `.babel/notes/{id}.md`.

#### `babel todo list`

Lists all `todo`-stage work items with IDs, descriptions, and whether pushed.

---

### `babel watch [action]`

**Actions:** `start` (default), `stop`, `status`, `install`, `uninstall`

The watch daemon (`src/core/watch.ts`) runs as a background process and monitors the repository.

#### What the daemon does

| Trigger | Response |
|---------|----------|
| File edit on tracked file, no active WI | Reverts via `git checkout -- {file}` |
| `.babel/notes/{id}.md` change | Waits 3s (debounce), then pushes updated spec to GitHub branch via git worktree |
| External commit on current branch | Logs `external_commit` event |
| CI failure (requires `GITHUB_TOKEN`) | Logs `ci_failure` event |
| `DRAFT-*` items in state | Attempts `resolveDrafts()` every 30s |

**IPC files** (all in `.babel/`):
- `watch.pid` — daemon PID; presence means running
- `watch-status.json` — `{ running, pid, started_at, last_check, alerts[] }`
- `watch-events.json` — append-only log, capped at 200 entries

#### `babel watch install` / `babel watch uninstall` (macOS)

Installs a launchd plist at `~/Library/LaunchAgents/com.babelgit.watch.{slug}.plist` with `KeepAlive: true` and `RunAtLoad: true`. The daemon auto-starts on login and is restarted by launchd if it crashes.

---

### `babel hook install` / `babel hook uninstall`

Writes/removes a `PreToolUse` hook config in `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{ "type": "command", "command": "babel hook-check-wi" }]
      }
    ]
  }
}
```

### `babel hook-check-wi`

Invoked by Claude Code before every `Edit` or `Write` tool call. Walks up from `process.cwd()` to find `.babel/state.json`.

- If no babel repo found: exit 0 (allow)
- If active WI with `stage: 'in_progress'`: exit 0 (allow)
- If active WI with any other stage: exit 2, print stage-specific message
- If no active WI: exit 2, print what to do next

Exit 2 causes Claude Code to block the tool call and surface the message to the agent.

---

## Error Handling Philosophy

Every error message must answer:
1. What went wrong (plain English)
2. Why it went wrong (if not obvious)
3. What to do about it

Never print a stack trace to the user. Log it to `.babel/error.log` if needed for debugging.

---

## Testing Requirements

Before shipping v0.1, the following must have integration tests:

1. Full lifecycle: `init → start → save → sync → run → keep → ship`
2. Governance blocks: attempt push to protected branch, attempt agent operation outside permitted branches
3. `babel reject` correctly reverts to last `keep` commit
4. `babel continue` correctly finds and restores paused work
5. MCP server returns valid JSON for all tools
6. All commands work in a repo with no prior babelgit history
7. All commands work in a repo mid-lifecycle (simulating resuming work)

---

## What v0.2 Delivered

All items from the original v0.2 wishlist that have been implemented:

- ✅ **`run_commands`:** `babel run` executes configured scripts, captures results in checkpoint records
- ✅ **Hooks:** 8 lifecycle hook points (`before/after_save`, `before/after_run`, `before/after_ship`, `before/after_pause`)
- ✅ **Linear integration:** `babel start` creates/links issues; `babel ship` transitions to Done; checkpoints post as comments
- ✅ **GitHub integration:** `babel pause` creates draft PRs; `babel ship` can ship via PR; checkpoints post as PR comments
- ✅ **Rules engine:** Four rule types enforced by governance at the right lifecycle point
- ✅ **Workflow templates:** `babel init` offers four preset configs (solo, standard, cd, enterprise)
- ✅ **`babel config` and `babel diag`:** DX tooling for inspecting and validating the environment
- ✅ **Git operation enforcement:** `babel enforce` + hooks installed at `babel init` — blocks direct git from any source (see "Git Operation Enforcement" section above)
- ✅ **Run session lock on sync:** `babel sync` blocked during open run session to preserve snapshot integrity

## What v0.3 Looks Like

- **Shared checkpoints:** Push checkpoint records as git notes or to a branch so other machines can see them
- **`babel undo`:** Return to last keep checkpoint (requires shared checkpoint storage)
- **Checkpoint signing:** GPG/SSH signing of checkpoint records
- **Multi-repo / monorepo support**
- **JIRA integration** (Linear is done; JIRA follows same pattern)
