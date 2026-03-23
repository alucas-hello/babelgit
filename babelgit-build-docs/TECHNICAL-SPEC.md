# babelgit Technical Specification
## Implementation Guide for v0.1

**Version:** 1.0  
**Status:** Final — implementation target  
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
├── src/
│   ├── cli/
│   │   ├── index.ts              ← entry point, command registration
│   │   ├── commands/
│   │   │   ├── init.ts
│   │   │   ├── start.ts
│   │   │   ├── save.ts
│   │   │   ├── sync.ts
│   │   │   ├── pause.ts
│   │   │   ├── continue.ts
│   │   │   ├── stop.ts
│   │   │   ├── run.ts
│   │   │   ├── verdict.ts        ← handles keep/refine/reject/ship
│   │   │   ├── state.ts
│   │   │   ├── history.ts
│   │   │   └── ship.ts
│   │   └── display.ts            ← all terminal output formatting
│   ├── mcp/
│   │   ├── index.ts              ← MCP server entry point
│   │   └── tools.ts              ← MCP tool definitions
│   ├── core/
│   │   ├── config.ts             ← babel.config.yml read/validate
│   │   ├── governance.ts         ← enforcement layer
│   │   ├── git.ts                ← all git operations via simple-git
│   │   ├── state.ts              ← .babel/ state management
│   │   ├── checkpoint.ts         ← attestation creation and reading
│   │   └── workitem.ts           ← work item lifecycle management
│   └── types.ts                  ← shared TypeScript types
├── tests/
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
└── .babel/                       ← GITIGNORED. Local state only.
    ├── state.json                ← Current work item and session state
    ├── counter.json              ← Incremental ID counter (if no external system)
    ├── checkpoints/              ← Attestation records
    │   ├── WI-001.json
    │   └── WI-002.json
    └── run-session.json          ← Active run session state (exists only during babel run)
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
  id: string                    // "WI-001" or "PROJ-123"
  description: string           // human-readable description
  branch: string                // "feature/WI-001-auth-fix"
  stage: WorkflowStage          // current position in lifecycle
  created_at: string            // ISO timestamp
  created_by: string            // git user.email
  last_checkpoint?: Checkpoint  // most recent verified checkpoint
  paused_by?: string            // set when paused
  paused_at?: string            // set when paused
  paused_notes?: string         // set when paused
}

type WorkflowStage = 
  | 'in_progress'
  | 'paused'
  | 'run_session_open'          // babel run called, waiting for verdict
  | 'shipped'
  | 'stopped'
```

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

**Governance rules enforced in v0.1:**

1. **Protected branch write protection:** No push/merge to protected branches except via `babel ship` with required checkpoints
2. **Agent branch restrictions:** If `caller_type === 'agent'` and `agents.permitted_branch_patterns` is set, operations on non-matching branches are blocked
3. **Checkpoint requirements:** If `require_checkpoint_for.ship: true`, `babel ship` without a valid checkpoint is blocked
4. **Agent attestation requirement:** If `agents.require_attestation_before_pause: true`, agent cannot `babel pause` without a run session verdict

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

## What v0.2 Looks Like (not in scope, captured for continuity)

The things that naturally extend from this foundation:

- **Configured test commands:** `run_commands` in `babel.config.yml` — babel run can optionally start a server, run tests, and capture results
- **Shared checkpoints:** Push checkpoint records as git notes or to a branch so agents on other machines can see them
- **External work item sync:** JIRA/Linear integration for `babel start PROJ-123`
- **PR creation:** `babel test` opens a PR against staging with checkpoint record in the description
- **Checkpoint attestation signing:** GPG/SSH signing of checkpoint records
- **`babel undo`:** Return to last keep checkpoint (requires shared checkpoint storage)
