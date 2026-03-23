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
│   ├── reference/          ← The Git Bible: complete technical reference
│   │   ├── 01-CORE-CONCEPTS.md
│   │   ├── 02-COMMAND-REFERENCE.md
│   │   ├── 03-WORKFLOWS-HOOKS-INTERNALS.md
│   │   └── 04-PATTERNS-RECIPES-AGENTS.md
│   │
│   ├── research/           ← UX research: why git fails people and how
│   │   └── 05-UX-RESEARCH-REPORT.md
│   │
│   └── strategy/           ← Design decisions, architecture, roadmap
│
├── src/                    ← Implementation (when we get there)
├── tests/                  ← Test suite
└── scripts/                ← Utilities and dev tooling
```

---

## The Documentation Foundation

Before writing a line of code, we built an exhaustive knowledge base. These documents are the ground truth for every design decision and implementation choice in this project.

### The Git Bible (`docs/reference/`)

**27,000+ words.** The most complete single-source git reference assembled. Every command, every flag, every internal — with explanations of why things work the way they do, not just how to use them.

| File | Contents |
|------|----------|
| `01-CORE-CONCEPTS.md` | Object model, three trees, HEAD, refs, packfiles, the .git directory, revision syntax |
| `02-COMMAND-REFERENCE.md` | Every porcelain and plumbing command with all flags documented |
| `03-WORKFLOWS-HOOKS-INTERNALS.md` | Branching workflows, transfer protocol, hooks system, merge strategies, sparse checkout, attributes, performance |
| `04-PATTERNS-RECIPES-AGENTS.md` | Golden rules, power recipes, anti-patterns, aliases, safe scripting, AI agent guidance, disaster recovery |

### The UX Research (`docs/research/`)

**5,600+ words.** A complete usability study synthesizing hundreds of sources — Stack Overflow threads, developer forums, non-programmer guides, AI agent failure analyses, the ohshitgit.com corpus — into a clear diagnosis of exactly where, why, and how git fails its users.

Contains: the five failure modes, the full terminology audit, the four-location model, the 15 most common git emergencies, the anti-pattern hall of shame, the natural-language-to-git-vocabulary gap, design principles for the solution, and AI agent failure patterns.

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

# Start working on something
babel start "fix login timeout on mobile"

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

| Command | What it does |
|---------|-------------|
| `babel init` | Set up babelgit in a repository |
| `babel start` | Begin a new work item |
| `babel save` | Checkpoint progress locally |
| `babel sync` | Get current with the team |
| `babel pause` | Leave work in handoff-ready state |
| `babel continue` | Resume paused work |
| `babel stop` | Abandon work entirely |
| `babel run` | Open a review session; lock the snapshot |
| `babel keep/refine/reject/ship` | Call a verdict; create verified checkpoint |
| `babel state` | Show current situation |
| `babel history` | Show work item history and checkpoints |
| `babel ship` | Deliver work to production |
| `babel enforce [on\|off\|status]` | Manage git operation enforcement hooks |
| `babel config show/validate` | Inspect or validate your config |
| `babel diag` | Check that your environment is set up correctly |

---

## Enforcement — Blocking Direct Git Operations

By default, `babel init` installs git hooks that **block any git operation not initiated by babel**. This applies equally to humans typing `git commit` in a terminal, AI agents using shell tools, and any other automation.

```
  ✗ Direct git operation blocked.

  This repository uses babelgit for all git operations.
  Use babel commands instead of raw git.

  To disable enforcement: babel enforce off
```

**How it works:** Every `babel` process — CLI or MCP server — sets a `BABEL_ACTIVE` environment variable before running git. The hooks check for this variable. If it's absent, the operation is rejected. No tool, no agent, and no brand of AI assistant can bypass it without explicitly disabling enforcement.

**What's covered:**

| Git operation | Blocked? | Hook |
|---------------|----------|------|
| `git commit` | ✓ | `pre-commit` |
| `git push` | ✓ | `pre-push` |
| `git rebase` | ✓ | `pre-rebase` |
| `git fetch` | — | No git hook point |
| `git checkout` | — | No git hook point |
| `git pull` | — | No git hook point |

fetch/checkout/pull are read operations or non-destructive to shared history, so the gap is acceptable.

**Managing enforcement:**

```bash
babel enforce           # interactive — shows status and prompts to toggle
babel enforce on        # install hooks
babel enforce off       # remove hooks
babel enforce status    # show current status without prompting
babel diag              # includes enforcement status in environment check
```

Enforcement hooks live in `.git/hooks/`, which is local to each machine and not committed. Each developer gets hooks installed when they run `babel init`. If a hook slot already has non-babel content (e.g., a linting pre-commit), babel skips that slot rather than overwriting it and reports the conflict in `babel diag`.

---

## Configuration

`babel init` creates a `babel.config.yml` in your repo. Commit it — it's your team's working agreement.

```yaml
version: 1
base_branch: main

# Require a verified checkpoint before shipping
require_checkpoint_for:
  ship: true

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

## Status

**v0.1 — Core CLI & MCP server ✅**
- ✅ Git Bible: complete technical reference
- ✅ UX Research: usability study and failure mode analysis
- ✅ Architecture and vocabulary design
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

**v0.3 — Planned**
- [ ] Shared checkpoint storage (push checkpoint records to git notes or branch)
- [ ] `babel undo` — return to last keep checkpoint
- [ ] Checkpoint signing (GPG/SSH)
- [ ] Multi-repo / monorepo support

---

## The Philosophy

Git's user interface was never designed — it accumulated. Commands were added for immediate needs, flags were bolted on for edge cases, and the result is a tool where `git checkout` can switch a branch, restore a file, or silently drop you into a stateless void, all depending on what arguments you pass.

The underlying data model is brilliant. The object graph, the DAG, the content-addressable storage — this is genuinely elegant engineering. The problem is that the commands expose the model, not the jobs users are trying to do.

babelgit is the translation layer between those two things. A user who wants to "save my work and share it with the team" should not need to understand the difference between working tree, index, local repo, and remote. A user who wants to "undo my last change" should not need to choose between `reset --soft`, `reset --mixed`, `reset --hard`, `revert`, and `restore`. An AI agent that wants to "commit these changes safely" should not need to manually check branch protection, dirty state, and remote divergence before every operation.

The commands stay. Git stays. What changes is the conversation.
