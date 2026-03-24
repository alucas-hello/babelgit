# CLAUDE.md
## Context for AI Agents Working in This Repository

**Read this file completely before doing anything else.**

---

## What This Repository Is

This is the source code and documentation for **babelgit** — a CLI tool (binary: `babel`) that gives developers and AI agents a shared vocabulary for the lifecycle of code contributions, enforces team working agreements, and creates verified checkpoints when work is attested as good.

The irony is intentional: babelgit is built to solve the exact problems that make AI agent development frustrating. This repo uses the practices babelgit is designed to enforce.

---

## Your Job If You're Here to Build

**Start here:** `docs/build/BUILD-BRIEF.md`

That document tells you exactly what to build, in what order, and how to know when you're done. It links to the two spec documents you need. Do not start coding before reading it.

The build documents are:
```
docs/build/BUILD-BRIEF.md      ← start here
docs/build/MVP-SPEC.md         ← scope definition
docs/build/TECHNICAL-SPEC.md   ← exact specifications
```

---

## Working Agreements for This Repository

1. **Work on feature branches.** Never commit directly to `main`.
2. **One work item per branch.** Name branches: `feature/what-it-does`
3. **Commit messages are descriptive.** Format: `type(scope): description`
   - Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`
4. **Do not modify the docs/strategy/ documents** without explicit instruction. They are the product strategy and are not implementation targets.
5. **New scope goes in NOTES.md first.** If you think something is missing, add it there for the human to review before building it.
6. **All git operations through simple-git.** No `child_process.exec('git ...')`.
7. **Never run raw git commands in this repository.** This repo uses `babel enforce` — git hooks will reject direct git operations. Use `babel` commands or the MCP tools. If you genuinely need a git operation babel doesn't expose, flag it to the human rather than running it directly.

---

## Agent Inbox — Work Items Started from the Extension

When the user clicks **Start Work** in the VSCode extension, the extension writes `.babel/agent-inbox.json` containing the work item ID, description, and branch. A `UserPromptSubmit` hook (`scripts/agent-inbox-hook.js`) fires before the next message you send and injects a notification into the conversation:

```
[babelgit] Work item started from VSCode: BBL-XXX — "description"
Branch: feature/BBL-XXX-...
Please begin implementation now.
```

The file is renamed to `agent-inbox.processed.json` after injection so it only fires once.

**What this means for agents:** If you see this notification at the top of a conversation, a work item is waiting. Begin implementation immediately — do not ask the user to repeat themselves.

---

## Pre-Tool Hook Enforcement (Critical — Read This)

This repository has a Claude Code `PreToolUse` hook installed in `.claude/settings.json`. It runs `babel hook-check-wi` before every `Edit` or `Write` tool call.

**If the hook blocks you, you will see:**

```
✗ Hook blocked: no active work item.

  You have no work item in progress. Start or resume one before editing files.

  babel start "description"   ← begin new work
  babel continue BBL-XXX      ← resume paused work
  babel todo "description"    ← plan it, start later
```

**This is not a bug. This is the product working correctly.**

Do not attempt to:
- Write files before starting a work item
- Bypass the hook by using Bash to write files directly
- Assume the hook is a technical error and try again

Instead, start a work item first:
```bash
babel todo "what you're about to do"   # reserve an ID, then
babel start BBL-XXX                    # or: babel start "description"
```

The hook also fires with a specific message if your current WI is in a non-editable stage (`paused`, `run_session_open`). Follow the message's instructions.

**Why this exists:** Without this hook, an AI agent working in this repo can unknowingly edit files on `main` with no work item. The watch daemon reverts those edits silently, producing a confusing loop where edits appear to fail. The hook fires at the tool-call layer — before any write — and explains the problem in plain language.

## Watch Daemon — Auto-Save Safety Net

If your session ends before you call `babel save`, the watch daemon has you covered. Every minute it checks: does the active work item have uncommitted changes, and has there been no commit in the last 5 minutes? If yes, it commits automatically:

```
auto-save(BBL-XXX): uncommitted changes preserved by watcher
```

**What this means for agents:** Always call `babel save` when you finish a unit of work. But if your session is interrupted — context limit hit, user closed the window, crash — your file writes are not lost. The daemon will commit them within 5 minutes and the next session can see them with `git log`.

---

## The Review Handoff — Critical

When your implementation work is complete, the sequence is:

1. `babel save "what you did"` — checkpoint
2. `babel run` — lock the snapshot, open the review session
3. **STOP.** Do not call `babel keep`, `babel ship`, or any verdict automatically.

Instead, tell the user:
- What you built and what changed
- Which files are worth reviewing
- That the review session is open and they can inspect (e.g. Cmd+R in VSCode)

Then **wait** for the user to provide a verdict and notes. Execute whatever they give you:
- `babel keep "their notes"` — solid, continue
- `babel refine "their notes"` — needs changes
- `babel reject "their reason"` — wrong direction, reverts
- `babel ship "their notes"` → then `babel ship` — ready to merge

**Why this matters:** `babel run` is the human review gate. Chaining it immediately with `babel keep` + `babel ship` bypasses the user's judgment entirely — which defeats the purpose of the product we're building together. The user's verdict, in their words, is the point.

---

## What To Do If You Get Stuck

1. Re-read `docs/build/TECHNICAL-SPEC.md` — the answer is probably there
2. Re-read `docs/strategy/CONSTRAINTS.md` — check you're not violating a constraint
3. Leave a clear comment in the code explaining what's unresolved and why
4. Create a `BLOCKERS.md` file in the root with the question clearly stated
5. Do not guess at behavior that affects data integrity (git operations, checkpoint storage, governance enforcement)

---

## What Not To Do

- Do not add dependencies without leaving a note in NOTES.md
- Do not implement `babel undo` (requires shared checkpoint storage — v0.4)
- Do not call git via shell string interpolation
- Do not print git error messages directly to users — translate them
- Do not add a `--force` flag to anything that bypasses governance
- Do not modify the docs/strategy/ documents without explicit instruction
- Do not attempt to write files when the pre-tool hook blocks you — start a WI first

---

## The Test That Defines Done

```bash
npm install -g .
babel init
babel start "test the whole thing"
# create a file
babel save "added a file"
babel run
babel keep "it works"
babel ship
git log --oneline    # clean commits
git branch -a        # feature branch gone
```

If that passes and the integration test suite is green, v0.1 is done.

---

## Repository Structure

```
babelgit/
├── CLAUDE.md                    ← you are here
├── README.md                    ← product documentation
├── babel.config.yml             ← this repo's own working agreement
├── .claude/
│   └── settings.json            ← Claude Code PreToolUse hook (checked in)
├── docs/
│   ├── build/                   ← build target documents (read these)
│   │   ├── BUILD-BRIEF.md
│   │   ├── MVP-SPEC.md
│   │   └── TECHNICAL-SPEC.md
│   ├── strategy/                ← product strategy (understand, don't change)
│   │   ├── CONSTRAINTS.md
│   │   ├── VOCABULARY.md
│   │   ├── TRUST-MODEL.md
│   │   └── WORKFLOW-STATE-MACHINE.md
│   └── reference/               ← complete git reference (use when needed)
│       ├── 01-CORE-CONCEPTS.md
│       ├── 02-COMMAND-REFERENCE.md
│       ├── 03-WORKFLOWS-HOOKS-INTERNALS.md
│       └── 04-PATTERNS-RECIPES-AGENTS.md
├── src/
│   ├── cli/
│   │   ├── index.ts             ← entry point, all command registration
│   │   ├── display.ts           ← terminal output formatting
│   │   └── commands/            ← one file per command
│   │       ├── init.ts
│   │       ├── start.ts         ← accepts WI ID to start a todo item
│   │       ├── save.ts
│   │       ├── sync.ts
│   │       ├── pause.ts
│   │       ├── continue.ts
│   │       ├── stop.ts
│   │       ├── run.ts
│   │       ├── verdict.ts       ← keep/refine/reject/ship
│   │       ├── state.ts
│   │       ├── history.ts
│   │       ├── ship.ts
│   │       ├── config.ts
│   │       ├── diag.ts
│   │       ├── enforce.ts
│   │       ├── todo.ts          ← babel todo create/push/list
│   │       ├── watch.ts         ← babel watch start/stop/status/install/uninstall
│   │       └── hook.ts          ← babel hook install/uninstall + hook-check-wi
│   ├── core/
│   │   ├── config.ts            ← babel.config.yml read/validate
│   │   ├── governance.ts        ← enforcement layer
│   │   ├── git.ts               ← all git operations via simple-git
│   │   ├── state.ts             ← .babel/state.json read/write
│   │   ├── checkpoint.ts        ← attestation creation and reading
│   │   ├── workitem.ts          ← work item lifecycle, branch naming
│   │   ├── reservation.ts       ← pluggable WI ID reservation (local/linear/jira)
│   │   ├── watch.ts             ← watch daemon: file watcher, polling, spec sync
│   │   ├── scripts.ts           ← run_commands execution via execa
│   │   ├── hooks.ts             ← lifecycle hooks execution
│   │   └── rules.ts             ← rules engine evaluation
│   ├── integrations/
│   │   ├── linear.ts
│   │   ├── github.ts
│   │   └── index.ts
│   ├── mcp/
│   │   ├── index.ts             ← MCP server entry point
│   │   └── tools.ts             ← tool definitions
│   └── types.ts                 ← shared TypeScript types
├── vscode-extension/            ← VSCode sidebar extension
│   ├── src/
│   │   ├── extension.ts         ← activation, command registration
│   │   ├── sidebarProvider.ts   ← Quick Actions + Board view tree providers
│   │   └── stateWatcher.ts      ← watches .babel/ for changes, exposes state
│   └── package.json
├── tests/                       ← vitest unit + integration tests
└── sandbox/                     ← manual test scripts (not committed to prod)
```
