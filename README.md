# babelgit

> A better UX layer on top of git. Not a new git — a smarter interface to the one that already exists.

---

## What This Is

Git is a phenomenal data model with a catastrophic user interface. It was designed from the model outward, not from use cases inward — and it shows. Millions of developers lose hours every week to cryptic error messages, invisible state, inconsistent commands, and a vocabulary that leaks internal implementation details at every turn.

**babelgit** is a helper layer that sits between users (human and AI) and git. It speaks the language of intent, not the language of internals. It makes state visible. It prevents the most common disasters before they happen. And when things go wrong, it explains what happened and what to do — in plain language.

This is not a GUI. This is not a replacement for git. This is a better interface to git's full power, accessible to everyone from first-time developers to AI coding agents running autonomously in production.

---

## The Problem We're Solving

Five systemic failures in git's UX, documented in full in our research:

1. **The Vocabulary Wall** — Terminology that exposes internals instead of communicating intent (`HEAD`, `detached HEAD`, `fast-forward`, `index/staged/cached`, `upstream` meaning three different things)
2. **The Invisible State Problem** — Users constantly operate in the wrong state without knowing it; the safety net (reflog) is invisible until after disaster
3. **The Four-Location Confusion** — Users have a 2-location mental model (my machine / GitHub); git has 4 locations (working tree / index / local repo / remote)
4. **The Inconsistent Command API** — `checkout` does three unrelated things; `reset` destroys work or doesn't based on one flag; `..` and `...` mean opposite things in `log` vs `diff`
5. **The Recovery Paradox** — Mistakes are easy; recovery requires vocabulary you only learn *after* the mistake

---

## Project Structure

```
babelgit/
│
├── docs/
│   ├── build/              ← Build spec documents
│   │   ├── BUILD-BRIEF.md
│   │   ├── MVP-SPEC.md
│   │   └── TECHNICAL-SPEC.md
│   ├── reference/          ← The Git Bible: complete technical reference
│   │   ├── 01-CORE-CONCEPTS.md
│   │   ├── 02-COMMAND-REFERENCE.md
│   │   ├── 03-WORKFLOWS-HOOKS-INTERNALS.md
│   │   └── 04-PATTERNS-RECIPES-AGENTS.md
│   ├── research/           ← UX research: why git fails people and how
│   │   └── 05-UX-RESEARCH-REPORT.md
│   └── strategy/           ← Design decisions, constraints, vocabulary
│
├── src/                    ← Implementation
├── vscode-extension/       ← VSCode sidebar extension
├── tests/                  ← Test suite
└── .claude/                ← Claude Code hook config (pre-tool enforcement)
```

---

## Installation

```bash
npm install -g babelgit
```

Requires Node.js >= 18 and git >= 2.28.

---

## Quick Start

```bash
# In any git repository:
babel init

# Plan work before starting a branch
babel todo "redesign login screen"

# Start working on something (new or from your todo list)
babel start "fix login timeout on mobile"
# or: babel start WI-001  ← picks up a todo item by ID

# Save progress as you go
babel save "auth flow working"

# Open a review session — locks your snapshot
babel run

# Call a verdict when you're ready
babel keep "tested on mobile, looks good"

# Ship it
babel ship
```

You never typed `git ___`.

---

## Commands

### Core lifecycle

| Command | What it does |
|---------|-------------|
| `babel init` | Set up babelgit in a repository |
| `babel todo "description"` | Plan a work item — reserves an ID, no branch yet |
| `babel todo push WI-XXX` | Push todo spec to GitHub branch (makes it visible as a planned item) |
| `babel todo list` | List all planned items |
| `babel start [id-or-description]` | Begin a work item (new, or pick up a todo by ID) |
| `babel save "notes"` | Checkpoint progress locally |
| `babel sync` | Get current with the team |
| `babel pause "notes"` | Leave work in handoff-ready state |
| `babel continue [WI-XXX]` | Resume paused work |
| `babel stop "reason"` | Abandon work entirely |
| `babel run` | Open a review session; lock the snapshot |
| `babel keep/refine/reject/ship "notes"` | Call a verdict; create verified checkpoint |
| `babel ship` | Deliver work to production |

### Observability & tooling

| Command | What it does |
|---------|-------------|
| `babel state [WI-XXX]` | Show current situation |
| `babel history [WI-XXX]` | Show work item history and checkpoints |
| `babel enforce [on\|off\|status]` | Manage git operation enforcement hooks |
| `babel config show/validate` | Inspect or validate your config |
| `babel diag` | Check that your environment is set up correctly |

### Watch daemon

| Command | What it does |
|---------|-------------|
| `babel watch start` | Start the file watcher daemon |
| `babel watch stop` | Stop the daemon |
| `babel watch status` | Show daemon status and recent events |
| `babel watch install` | Install as a launchd agent (macOS) — auto-starts on login, restarts on crash |
| `babel watch uninstall` | Remove the launchd agent |

### Claude Code integration

| Command | What it does |
|---------|-------------|
| `babel hook install` | Write PreToolUse hook config to `.claude/settings.json` |
| `babel hook uninstall` | Remove hook config |
| `babel hook-check-wi` | Hook command invoked by Claude Code before Edit/Write tool calls |

---

## Planning with `babel todo`

`babel todo` adds a lightweight planning layer before work begins. A todo item has an ID and a spec file but no branch, so it's tracked without cluttering your branch list.

```bash
babel todo "add dark mode support"
# → BBL-042: add dark mode support
# → Branch reserved on GitHub: feature/BBL-042-add-dark-mode-support
# → Spec file: .babel/notes/BBL-042.md
```

**ID reservation is atomic.** babelgit immediately pushes a branch to GitHub to claim the ID — first writer wins. If you're offline, it assigns a temporary `DRAFT-{hex}` ID. The watch daemon resolves drafts to permanent IDs the next time connectivity is available.

**GitHub as your board.** Push a spec once and GitHub's branch list becomes your planning board — every todo item has a branch, every branch has a spec commit in `docs/specs/`. No external tracker needed.

**The watch daemon auto-syncs specs.** When you edit `.babel/notes/BBL-XXX.md`, the daemon detects it and pushes the updated spec to the branch automatically (3-second debounce).

**Starting a todo item** promotes it from planned to in-progress:

```bash
babel start BBL-042        # picks up the todo, checks out its branch
```

---

## The Watch Daemon

`babel watch` runs a persistent background daemon that monitors the repository:

| What it watches | What it does |
|-----------------|-------------|
| File edits with no active work item | Reverts them immediately |
| `.babel/notes/WI-XXX.md` changes | Auto-syncs spec to GitHub branch (3s debounce) |
| Uncommitted changes on active WI after 5min inactivity | **Auto-saves** with `auto-save(BBL-XXX)` commit |
| External commits on your branch | Logs an alert |
| CI failures (requires `GITHUB_TOKEN`) | Logs an alert |
| `DRAFT-*` work items | Resolves to permanent IDs when connectivity returns |

**Auto-save protects against session loss.** If an AI agent writes files and the session ends before `babel save` is called, the daemon commits those changes within 5 minutes. This prevents the ironic case where babelgit — a tool designed to preserve work — loses work due to an agent session ending mid-task. Auto-save events appear as green entries in the VSCode extension's Watcher panel.

**macOS persistent install:**

```bash
babel watch install    # installs as launchd agent — survives reboots
babel watch uninstall  # removes it
```

The launchd agent uses `KeepAlive: true` — if the daemon crashes, launchd restarts it. State is exposed via `.babel/watch-status.json` and `.babel/watch-events.json` for the VSCode extension to read.

---

## Enforcement — Blocking Direct Git Operations

### Git-level enforcement

By default, `babel init` installs git hooks that **block any git operation not initiated by babel**. This applies equally to humans typing `git commit` in a terminal, AI agents using shell tools, and any other automation.

```
  ✗ Direct git operation blocked.

  This repository uses babelgit for all git operations.
  Use babel commands instead of raw git.

  To disable enforcement: babel enforce off
```

**How it works:** Every `babel` process sets a `BABEL_ACTIVE` environment variable before running git. The hooks check for this variable. If it's absent, the operation is rejected.

| Git operation | Blocked? | Hook |
|---------------|----------|------|
| `git commit` | ✓ | `pre-commit` |
| `git push` | ✓ | `pre-push` |
| `git rebase` | ✓ | `pre-rebase` |
| `git fetch` | — | No git hook point |
| `git checkout` | — | No git hook point |

### Claude Code pre-tool enforcement

`babel hook install` adds a second enforcement layer specifically for AI agents using Claude Code. It installs a `PreToolUse` hook in `.claude/settings.json` that fires before every `Edit` or `Write` tool call, and a `UserPromptSubmit` hook that bridges the extension and the agent session:

```
✗ Hook blocked: no active work item.

  You have no work item in progress. Start or resume one before editing files.

  babel start "description"   ← begin new work
  babel continue BBL-XXX      ← resume paused work
  babel todo "description"    ← plan it, start later
```

This hook is **already installed** in this repository. The hook fires at the tool-call layer, before any file is written, producing an actionable message rather than a silent revert.

**Managing enforcement:**

```bash
babel enforce           # interactive — shows status, prompts to toggle
babel hook install      # install Claude Code pre-tool hook
babel hook uninstall    # remove it
babel diag              # includes both enforcement statuses
```

---

## Configuration

`babel init` creates a `babel.config.yml` in your repo. Commit it — it's your team's working agreement.

```yaml
version: 1
base_branch: main

# Work item ID reservation
work_item_id:
  source: local          # "local" | "linear" | "jira"
  prefix: "BBL"          # → BBL-001, BBL-002, ...

# Require a verified checkpoint before shipping
require_checkpoint_for:
  ship: true

# Rename verdicts to match your team's vocabulary
verdicts:
  keep: keep
  refine: refine
  reject: reject
  ship: deploy           # e.g. for a CD workflow

# Run scripts during babel run
run_commands:
  - name: tests
    command: npm test
    required: true
  - name: dev-server
    command: npm run dev
    background: true

# Lifecycle hooks
hooks:
  before_ship:
    - npm run build

# Enforce rules at save/pause/ship
rules:
  - name: conventional-commits
    type: commit_message_pattern
    pattern: "^(feat|fix|chore|docs|test|refactor):"
    apply_to: [save]

# Integrations
integrations:
  linear:
    enabled: true
    team_id: YOUR_TEAM_ID
    create_issue_on_start: true
  github:
    enabled: true
    create_draft_pr_on_pause: true
```

---

## MCP Server (for AI agents)

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

Agents call `babel_state()` first, then operate within `permitted_operations`. They can never violate `babel.config.yml`.

---

## VSCode Extension

The babelgit VSCode extension (`vscode-extension/`) provides a sidebar with two panels:

**Quick Actions** — context-sensitive commands for the current work item: save, run, pause, continue, ship, and (if not yet initialized) init.

**Board** — all work items grouped by stage:

| Bucket | Contents |
|--------|----------|
| Todo | Planned items with Start and Push to GitHub actions |
| In Progress | Active work items |
| Paused | Paused items with Continue action |
| Review Open | Items in `babel run` session |
| Complete / Deployed | Shipped items (label uses `verdicts.ship` from config) |
| Stopped | Abandoned items |
| Team (in In Progress) | Teammate branches parsed from `git branch -r` — visible but not actionable |

**DRAFT items** in the Todo bucket display with a spinning indicator and "Waiting for ID reservation…" — Start and Push are disabled until the daemon resolves the ID.

**Todo item actions:**
- Click the item label → opens `.babel/notes/WI-XXX.md` spec locally
- Start — runs `babel start WI-XXX`
- Push spec / Sync spec — runs `babel todo push WI-XXX`
- View on GitHub — opens branch on github.com (shown after first push)

---

## Status

**v0.1 — Core CLI & MCP server ✅**
- ✅ Full 12-command CLI (init through ship)
- ✅ Governance layer — config enforcement, agent restrictions, checkpoint requirements
- ✅ MCP server — 13 tools for AI agent use
- ✅ 80 passing tests

**v0.2 — Integrations, scripting, rules ✅**
- ✅ Runtime scripting (`run_commands`, foreground and background)
- ✅ Hooks system (8 lifecycle points)
- ✅ Linear integration (creates issues, transitions on ship, checkpoint comments)
- ✅ GitHub integration (draft PRs on pause, ship-via-PR, checkpoint comments)
- ✅ Rules engine (commit message, path restriction, file change, script rules)
- ✅ Workflow templates (solo, standard, CD, enterprise) in `babel init`
- ✅ `babel config show/validate` and `babel diag`

**v0.3 — Planning layer, watch daemon, AI enforcement ✅**
- ✅ `babel todo` — plan work items before starting a branch
- ✅ Atomic WI ID reservation via GitHub branch push (first writer wins)
- ✅ `DRAFT-{hex}` offline fallback with automatic resolution on reconnect
- ✅ Pluggable ID sources: local, Linear, Jira (local implemented; Linear/Jira via same interface)
- ✅ `babel watch` — persistent file watcher daemon
- ✅ macOS launchd integration (`babel watch install`) — auto-restart on crash, persists across reboots
- ✅ Spec auto-sync: daemon pushes `.babel/notes/*.md` changes to GitHub branches
- ✅ VSCode extension with board view (stage buckets, todo actions, team visibility)
- ✅ `babel hook install` — Claude Code `PreToolUse` enforcement hook
- ✅ Hook blocks `Edit`/`Write` tool calls with no active work item; readable error replaces silent revert
- ✅ `UserPromptSubmit` hook — extension writes `.babel/agent-inbox.json` on Start Work; next Claude message auto-injects the work item context

**v0.4 — Planned**
- [ ] Shared checkpoint storage (push checkpoint records to git notes or branch)
- [ ] `babel undo` — return to last keep checkpoint
- [ ] Checkpoint signing (GPG/SSH)
- [ ] Multi-repo / monorepo support

---

## Design Principles

The UX research distills into ten principles that guide everything we build:

1. **Express user intent, not git operations** — speak the language of "save, share, get, undo"
2. **Make state visible** — always show branch, sync status, tree state, in-progress operations
3. **Opinionated defaults, escapable** — one clear way to do things; power always accessible
4. **Progressive disclosure** — 5 operations for beginners, 15 for intermediate, everything for experts
5. **Describe consequences, not mechanisms** — "this will overwrite 2 commits on the shared branch" not "force push"
6. **Pre-flight checks** — verify state before destructive operations
7. **Graceful state recovery** — mid-operation states get clear continue/abort paths
8. **Human-readable history** — recent actions described in plain language, not raw SHAs
9. **The safety net should be visible** — reflog surfaced as "recent actions you can undo"
10. **Agent-safe by default** — every operation checks state, verifies branch, prefers non-destructive, commits atomically

---

## The Philosophy

Git's user interface was never designed — it accumulated. Commands were added for immediate needs, flags were bolted on for edge cases, and the result is a tool where `git checkout` can switch a branch, restore a file, or silently drop you into a stateless void, all depending on what arguments you pass.

The underlying data model is brilliant. The object graph, the DAG, the content-addressable storage — this is genuinely elegant engineering. The problem is that the commands expose the model, not the jobs users are trying to do.

babelgit is the translation layer between those two things. A user who wants to "save my work and share it with the team" should not need to understand the difference between working tree, index, local repo, and remote. A user who wants to "undo my last change" should not need to choose between `reset --soft`, `reset --mixed`, `reset --hard`, `revert`, and `restore`. An AI agent that wants to "commit these changes safely" should not need to manually check branch protection, dirty state, and remote divergence before every operation.

The commands stay. Git stays. What changes is the conversation.
