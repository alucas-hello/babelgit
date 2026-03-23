# babelgit — Build Brief
## Instructions for Claude Code: Build v0.1

**Read this first. Then read MVP-SPEC.md. Then read TECHNICAL-SPEC.md. Then build.**

---

## What You Are Building

A Node.js CLI tool called `babelgit` (binary: `babel`) that gives developers and AI agents a shared, human-language vocabulary for the lifecycle of a piece of code — from starting work to shipping it — while enforcing team working agreements defined in a config file.

It ships as a single npm package with both a CLI and an MCP server.

**The full strategic context is in the docs/strategy/ directory.** Read it if you need to understand why a decision was made. For what to build, this document and the two spec documents are the source of truth.

---

## Orientation: The Docs That Matter

```
docs/
├── build/
│   ├── BUILD-BRIEF.md          ← you are here
│   ├── MVP-SPEC.md             ← what v0.1 is and isn't
│   └── TECHNICAL-SPEC.md      ← exact command behaviors, data structures, MCP tools
└── strategy/
    ├── CONSTRAINTS.md          ← the constitutional rules, never violate these
    ├── VOCABULARY.md           ← why the commands are named what they are
    ├── TRUST-MODEL.md          ← why babel run works the way it does
    └── WORKFLOW-STATE-MACHINE.md ← why team config is designed this way
```

---

## The Six Non-Negotiable Constraints

From `docs/strategy/CONSTRAINTS.md`. These override any other decision:

1. **Always produces standard git output.** The repo babelgit manages is always a valid git repo that works with raw git forever, even if babelgit is uninstalled.

2. **Separate binary with its own vocabulary.** The user types `babel`, never `git`. The vocabulary is designed around intent, not git operations.

3. **Never hides what it's doing.** Every git command babelgit executes is printed to stdout. Users learn git by watching babelgit work.

4. **Standard git is always the escape hatch.** Raw git always works in the same repo alongside babelgit.

5. **babelgit owns the interface, git owns the data.** No new git object types. No parallel data stores that affect git's operation.

6. **Working agreements are enforced, not suggested.** `babel.config.yml` is enforced at execution time. No bypass flag.

---

## Start Here: Repository Scaffold

```bash
mkdir babelgit && cd babelgit
git init
npm init -y
```

**Dependencies:**
```json
{
  "dependencies": {
    "simple-git": "^3.x",
    "commander": "^12.x",
    "chalk": "^5.x",
    "inquirer": "^9.x",
    "zod": "^3.x",
    "@modelcontextprotocol/sdk": "latest"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "@types/node": "^20.x",
    "tsx": "^4.x",
    "vitest": "^1.x"
  }
}
```

**`package.json` bin field:**
```json
{
  "bin": {
    "babel": "./dist/cli/index.js"
  }
}
```

---

## Build Order

Build in this sequence. Each step should be committed before moving to the next.

### Step 1: Foundation
- [x] TypeScript config (`tsconfig.json`)
- [x] Project structure (`src/cli`, `src/core`, `src/mcp`)
- [x] `src/types.ts` — all shared types from TECHNICAL-SPEC.md
- [x] `src/core/git.ts` — wrapper around `simple-git`. All git operations go here. No git calls outside this file.
- [x] `src/core/config.ts` — read and validate `babel.config.yml` with zod
- [x] `src/core/state.ts` — read/write `.babel/state.json`
- [x] `src/core/checkpoint.ts` — create and read checkpoint records
- [x] `src/cli/display.ts` — all terminal output. Nothing else prints directly.

### Step 2: Governance
- [x] `src/core/governance.ts` — the enforcement layer. Every command calls this before executing.
- [x] Unit tests for governance rules

### Step 3: Core Commands (build in lifecycle order)
- [x] `babel init`
- [x] `babel start`
- [x] `babel save`
- [x] `babel sync`
- [x] `babel state`
- [x] `babel pause`
- [x] `babel continue`
- [x] `babel run`
- [x] `babel keep` / `babel refine` / `babel reject` / `babel ship` (verdict commands — one handler, different verdicts)
- [x] `babel stop`
- [x] `babel history`
- [x] `babel ship`

### Step 4: MCP Server
- [x] `src/mcp/index.ts` — MCP server entry point (tools defined inline)
- [x] `babel mcp` command to start the server
- [x] Verify `babel_state` returns correct JSON structure
- [x] Verify `babel_attest` works correctly for agent verdicts

### Step 5: Integration Tests
- [x] Full lifecycle test (see TECHNICAL-SPEC.md testing requirements)
- [x] Governance enforcement tests
- [x] MCP tool tests

### Step 6: Polish
- [x] `babel help` — clean, minimal help output
- [x] Error message quality pass — every git error translated to plain English
- [x] `README.md` — installation and quick start

### Step 7: v0.2 — Integrations & Scripting (added after v0.1 completion)
- [x] `src/core/scripts.ts` — `run_commands` execution (foreground + background via execa)
- [x] `src/core/hooks.ts` — lifecycle hooks (before/after save, run, ship)
- [x] `src/core/rules.ts` — rules engine (commit_message_pattern, path_restriction, files_changed, script)
- [x] `src/integrations/linear.ts` — Linear GraphQL client, issue lifecycle
- [x] `src/integrations/github.ts` — Octokit client, draft PRs, checkpoint comments
- [x] `src/integrations/index.ts` — IntegrationManager coordinating all integrations
- [x] `src/cli/commands/config.ts` — `babel config show/validate`
- [x] `src/cli/commands/diag.ts` — `babel diag` environment check
- [x] Workflow templates in `babel init` (solo, standard, cd, enterprise)
- [x] MCP expansion: `babel_config`, `babel_create_work_item`
- [x] `sandbox/` — lifecycle test scripts
- [x] Tests: scripts, rules, linear (mocked), github (mocked + live gate)

---

## Critical Implementation Notes

### On `simple-git`
Use `simple-git` for all git operations. Never use `child_process.exec('git ...')` with string interpolation — it's a security risk and harder to error-handle. Import `simpleGit` and use its typed API.

```typescript
// Good
import simpleGit from 'simple-git'
const git = simpleGit(repoPath)
await git.fetch()
await git.checkoutBranch(branchName, remoteBranch)

// Never do this
exec(`git checkout -b ${branchName}`)
```

### On displaying git commands
After every git operation, print what was run:
```typescript
// In display.ts
export function showGitCommand(cmd: string) {
  console.log(chalk.dim(`  → ${cmd}`))
}

// In git.ts, after every operation:
showGitCommand(`git fetch origin`)
await git.fetch()
```

### On `babel run` session model
`babel run` exits after locking the snapshot. It does NOT stay running.
The session state lives in `.babel/run-session.json`.
When a verdict command (`keep`, `refine`, etc.) runs, it checks for this file.
If no session file exists, verdict commands print an error: "No active run session. Run 'babel run' first."

### On the `reject` verdict
`reject` must:
1. Find the commit SHA from the last `keep` or `ship` checkpoint
2. `git reset --hard {sha}`
3. This rewrites local history — print a clear warning
4. Update state to reflect revert

### On agent detection
Detect agent context from environment variables:
```typescript
function detectCallerType(): 'human' | 'agent' {
  if (process.env.CLAUDE_CODE || 
      process.env.CURSOR_AGENT ||
      process.env.BABELGIT_AGENT ||   // explicit opt-in
      process.env.CI) {
    return 'agent'
  }
  return 'human'
}
```

Agents can also set `BABELGIT_AGENT=true` explicitly to identify themselves.

### On `babel.config.yml` defaults
If a field is missing from `babel.config.yml`, use these defaults — never throw an error for missing optional fields:
```typescript
const defaults = {
  base_branch: 'main',
  protected_branches: ['main'],
  branch_pattern: 'feature/{id}-{slug}',
  work_item_id: { source: 'local', prefix: 'WI' },
  require_checkpoint_for: { pause: false, ship: true },
  sync_strategy: 'rebase',
  agents: {
    permitted_branch_patterns: ['feature/*', 'fix/*'],
    require_attestation_before_pause: true
  }
}
```

### On the `.babel/` directory
- Always gitignore it on `babel init`
- Create it if it doesn't exist on first command after init
- `state.json` is the source of truth for work item lifecycle
- `checkpoints/` contains one JSON file per work item, each an array of checkpoint records
- `run-session.json` exists only when a session is open; delete it after verdict

### On branch slug generation
When generating a branch name from a description:
```typescript
function toSlug(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40)  // max 40 chars for the slug portion
}
// "Fix login timeout for mobile users" → "fix-login-timeout-for-mobile-users"
```

---

## What Done Looks Like

A developer should be able to:

```bash
# Install
npm install -g babelgit

# In an existing git repo:
babel init
babel start "fix the login timeout on mobile"
# ... edit files ...
babel save "got the auth flow working"
babel sync
babel run
# ... go test the app in another terminal ...
babel keep "tested on mobile, all good"
babel ship
```

And have never typed `git ___`.

An AI agent should be able to call:
```
babel_state()
babel_start("fix login timeout", "PROJ-123")
babel_save("auth flow working")
babel_run()
babel_attest("keep", "reviewed against requirements, no regressions")
babel_ship()
```

And be blocked from doing anything that violates `babel.config.yml`.

---

## Questions You Should Not Have to Ask

**Q: Should I support Windows?**
A: Yes. Use `path.join()` everywhere, never `/`. Use `simple-git` (cross-platform).

**Q: What if there's no `babel.config.yml`?**
A: Print: "No babel.config.yml found. Run 'babel init' to set up babelgit in this repository." Then exit.

**Q: What if git isn't installed?**
A: Print: "git is required. Install git from https://git-scm.com" Then exit.

**Q: Should `babel save` create an empty commit if there's nothing to save?**
A: No. Print: "Nothing to save — no changes since last save." and exit cleanly.

**Q: Should agents be able to call `babel stop`?**
A: Yes, but `reason` is required for agents (enforced by governance layer). Governance may block it based on config.

**Q: What format should checkpoint filenames use?**
A: `.babel/checkpoints/{work_item_id}.json` — one file per work item, containing an array of all checkpoints for that item.

**Q: Should `babel ship` delete the remote branch?**
A: Yes, by default. Add `keep_branch_after_ship: true` to config to disable.

**Q: What if the user calls a verdict command after the codebase changed since `babel run`?**
A: Warn: "Your code changed since the run session was opened. The checkpoint will record the current commit, not the locked commit. Continue? (y/N)"

---

## The One Thing That Must Be True

When this is done, hand it the following test:

1. Create a fresh git repository
2. Run `babel init`
3. Run `babel start "test the whole thing"`
4. Create a file, save some content
5. Run `babel save "added a file"`
6. Run `babel run`
7. Run `babel keep "it works"`
8. Run `babel ship`
9. Run `git log --oneline`
10. Run `git branch -a`

The git log should show clean, readable commits.
The branch should be gone (merged and deleted).
The repository should be in a state a git expert would consider clean and correct.

**If that test passes, v0.1 is done.**
