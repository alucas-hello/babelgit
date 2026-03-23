# babelgit: Architectural Constraints & Design Principles
## The Rules That Govern Every Decision

> This document is the constitutional layer of babelgit. Before any feature is designed, any command is named, any line of code is written — check it against what's written here. If something conflicts with this document, either don't do it or update this document deliberately and with full awareness of what you're changing and why.

**Version:** 0.2  
**Status:** Active  
**Last updated:** Session 03

---

## Part 1: What babelgit Is

### 1.1 The One-Sentence Definition

babelgit is a workflow execution engine that makes team working agreements executable — connecting agile board states to git operations, enforcing team-defined transitions for humans and agents alike, and always producing standard git output that works without babelgit on the receiving end.

### 1.2 The Three-Layer Value Proposition

babelgit delivers value at three distinct layers:

**The Translation Layer** — Humans and agents speak intent in their team's vocabulary. Babel speaks git. The vocabulary wall disappears.

**The Governance Layer** — Teams define working agreements. Babel enforces them. At the tool level. Without exception. For everyone.

**The Workflow Layer** — Team agile board states (columns) map directly to babelgit commands. `babel testing` means exactly what the team's "In Testing" column means — triggering the gates, checks, and git operations the team has defined for that transition.

### 1.3 The Babel Fish Principle

The name is precise. The Babel Fish translates any language to any other without the listener needing to understand the source language. babelgit does the same: the user speaks intent, babelgit speaks git, the result is indistinguishable from a human who knows git well.

**Critical corollary:** Someone on the team still needs to know Vogon. babelgit does not eliminate the need for git expertise — it eliminates the need for *everyone* to have it. The translation layer must be translucent, not opaque. Users can always see what git commands babelgit is executing on their behalf. They learn git by using babelgit, not in spite of it.

### 1.4 The Primary User

babelgit is designed first and foremost for **the new class of technical contributor** — product managers, SMEs, business analysts, and AI-augmented generalists who can now produce high-quality code faster than traditional engineering workflows can absorb it.

This user has:
- Enough technical foundation to understand what they're doing
- Real business context and product judgment
- AI agents producing high-quality work on their behalf
- No time or patience for git's implementation-level complexity
- A need to participate in team repositories responsibly and safely

This user does **not** have:
- Daily git command-line fluency
- Years of muscle memory for git edge cases
- A mental model of git's internal object structure
- Time to spend 14 hours debugging git instead of shipping product

**The secondary user is the AI agent** operating on behalf of this person. The agent's git failures — chasing itself in circles, ignoring working agreements, attempting to merge to main without direction — are exactly what babelgit prevents. The agent operates within the lanes babelgit defines. It cannot violate them, regardless of what it's been instructed to do.

**The tertiary user is the traditional developer** on the team who may use babelgit, raw git, or both. babelgit must never break their workflow or force them to change tools. It must earn their trust by producing clean, standard git output.

### 1.5 What babelgit Is Not

| Not this | Because |
|----------|---------|
| A git replacement | git is the engine. babelgit is the interface. |
| A GUI | It is a CLI. Terminal-native. |
| A git plugin or extension | It is a separate binary. You never type `git` when using it. |
| A git alias system | Aliases remap commands. babelgit remaps vocabulary and intent. |
| A walled garden | The output is always standard git. Escape is always possible. |
| A simplification that removes power | The full power of git is always accessible. babelgit adds a better on-ramp, not a ceiling. |
| A tutorial or learning tool | Though learning is a side effect, the goal is productive work. |

---

## Part 2: The Non-Negotiable Constraints

These are inviolable. They are not defaults. They are not preferences. Nothing overrides them.

### Constraint 1: babelgit Always Produces Standard Git Output

The repository produced by babelgit is always, without exception, a valid, standard git repository. This means:

- Any git client (raw git, GitHub Desktop, GitKraken, etc.) can clone it and work with it normally
- Any git host (GitHub, GitLab, Bitbucket, a bare server, a local path) can receive it
- Any collaborator using raw git can pull from it, push to it, branch it, and bisect it
- No babelgit installation is required on the receiving end — ever
- `git log`, `git diff`, `git blame` run against a babelgit-managed repo return exactly what they'd return if a git expert had managed the repo by hand

**The test:** If babelgit disappeared tomorrow, every repository it ever touched must continue to work perfectly with raw git. Forever.

### Constraint 2: babelgit Is a Separate Binary With Its Own Vocabulary

- The user-facing command is `babel`, not `git babel`, not `git-babel`, not `babel-git`
- babelgit has its own subcommand vocabulary designed around user intent
- The vocabulary is designed independently of git's vocabulary — similarity to git commands is not a design goal and is not an achievement
- Users do not need to know git terminology to use babelgit
- babelgit never requires the user to type a raw git command as part of a normal workflow

### Constraint 3: babelgit Never Hides What It's Doing

Every babelgit operation shows the user what git commands it's executing, unless the user explicitly opts into a quiet mode. The translation is always visible, always inspectable.

This is not just good UX — it's the mechanism by which babelgit is safe. A user who can see "babel store → git push --force-with-lease origin main" learns git. A user who cannot see it is flying blind when something goes wrong.

**The transparency rule:** babelgit may abstract the complexity, but it never conceals the mechanics.

### Constraint 4: Standard Git Is Always the Escape Hatch

At any point, a user can abandon babelgit and use raw git in the same repository without any migration, conversion, or cleanup. The repository is always in a state that raw git can take over from immediately.

This constraint exists to:
- Eliminate adoption risk (you can always get out)
- Force babelgit to stay honest (if the output isn't clean git, this constraint is violated)
- Support advanced users who occasionally need raw git power

### Constraint 5: babelgit Owns the Interface, Git Owns the Data

babelgit decides how users interact with version control. git decides how version control data is stored, transferred, and structured. These responsibilities never cross.

babelgit does not:
- Invent new object types
- Create non-git storage formats
- Maintain state that is required for the repository to be valid

babelgit may:
- Store its own metadata locally (never in a way that affects git's operation)
- Use git's own facilities (git notes, refs, config) for optional enrichment — but only in ways that raw git ignores gracefully if babelgit is absent

### Constraint 6: Team Working Agreements Are Enforced, Not Suggested

This is the constraint that makes babelgit fundamentally different from every other git tool.

Working agreements — which branches are protected, when PRs are required, what operations agents are allowed to perform, which lanes each contributor works in — are defined in a per-repository configuration file and enforced by the babelgit binary. They are not documented conventions. They are not CLAUDE.md instructions an agent might ignore. They are not polite suggestions. They are hard constraints at the execution layer.

**What this means in practice:**

- If the team config says PRs are required before main, `babel` cannot push to main. Not for humans. Not for agents. Not for anyone.
- If the team config says agents work only on `dev` and `feature/*` branches, an agent invoking babelgit cannot operate on any other branch — regardless of what it has been instructed to do upstream.
- If the team config says certain operations require human confirmation, those operations pause and wait. Always.

**The team config is version controlled.** It lives in the repository. It is committed, reviewed, and changed through the same process as any other team agreement. It is the same for everyone on the team.

**No operation bypasses team config.** There is no `--force` flag for governance. There is no override mode. If a constraint needs to change, the config is updated through the normal process. This is not a limitation — it is the entire point.

**The config defines what is possible, not just what is recommended.** This is the distinction that makes babelgit trustworthy. A junior developer cannot make the mistakes they used to make. An AI agent cannot violate the working agreement. The rules are in the tool, not in a document someone might not read.

---

## Part 3: The Architecture

### 3.1 The Four Layers

```
┌─────────────────────────────────────────────────┐
│                  User Layer                     │
│         babel store / babel snapshot            │
│         Intent-based vocabulary                 │
│         Human language, not git language        │
└─────────────────────┬───────────────────────────┘
                      │ intent
┌─────────────────────▼───────────────────────────┐
│             Governance Layer                    │
│         Team config enforcement                 │
│         Branch protection rules                 │
│         Agent lane restrictions                 │
│         Operation permission checks             │
└─────────────────────┬───────────────────────────┘
                      │ permitted operations only
┌─────────────────────▼───────────────────────────┐
│             Translation Layer                   │
│         State verification (pre-flight)         │
│         Intent → operation mapping              │
│         Consequence description                 │
│         Error translation                       │
│         Output formatting                       │
└─────────────────────┬───────────────────────────┘
                      │ standard git commands
┌─────────────────────▼───────────────────────────┐
│                  Git Layer                      │
│         Standard git operations                 │
│         Standard git repository output          │
│         Standard git remote protocol            │
└─────────────────────────────────────────────────┘
```

**Governance sits above translation.** An operation that is not permitted by the team config never reaches the translation layer. It is stopped before it starts, with a plain-language explanation of what rule it would violate and how to change the rule if that is appropriate.

### 3.2 What Each Layer Owns

**User Layer:** The vocabulary. The words users type. The intent they express. This is babelgit's primary design surface.

**Governance Layer:** The team config. What is permitted and what is not. Who can do what, on which branches, under which conditions. This layer runs before anything else. It does not negotiate.

**Translation Layer:** The translation logic. State checks. Pre-flight verification. Consequence description before destructive operations. Error message translation from git-speak to plain language. This is where most of babelgit's day-to-day value lives.

**Git Layer:** The actual version control operations. babelgit calls git (or git's libraries). The git layer is treated as an engine — powerful, reliable, not user-facing.

### 3.3 How It Executes

babelgit translates intent into git commands and executes them using git's own machinery. The user repository is always a real git repository. babelgit does not maintain a parallel data store for repository state.

**On babelgit's own metadata (TBD — to be decided in architecture phase):**

Whether and how babelgit stores additional context is an open design question. The options include:

| Approach | Trade-offs |
|----------|-----------|
| Pure translator — no metadata | Most elegant, least powerful |
| Local-only metadata (never pushed) | Safe, enables undo/safety features |
| git notes for intent annotations | Visible in git history, optional |
| `.babelgit/` directory in repo | Explicit, transparent, adds files |
| `refs/babelgit/*` hidden ref namespace | Invisible to most users, always present |

**Whatever approach is chosen must satisfy Constraint 1.** The repository remains valid git regardless. This decision is deferred to the architecture phase.

### 3.4 The Team Config

Every babelgit-managed repository contains a team configuration file (exact name TBD — `babel.config` or `.babelgit/config`). This file is:

- **Version controlled** — committed in the repo, changed through normal PR/review process
- **The same for everyone** — one config per repo, applies equally to all humans and agents
- **Enforced at execution time** — not a hint, not a preference, not overridable

The config defines things like:

```yaml
# Example — syntax TBD, illustrative only
protected_branches:
  - main
  - production

require_pr_for:
  - main
  - production

default_branch: dev

agent_permitted_branches:
  - dev
  - feature/*
  - fix/*

human_confirmation_required_for:
  - any operation touching protected_branches
  - history rewrite of any kind

auto_sync:
  source: dev
  on: branch_switch
```

The exact schema is a design exercise for the architecture phase. The principle is fixed: **the config is the working agreement, and the working agreement is enforced.**

---

### 4.1 The Vocabulary Is the UX

The words babelgit uses are its most important design decision. The command surface is the product. These rules govern how the vocabulary is designed.

### 4.2 Vocabulary Rules

**Rule V1: Commands are named for what the user is doing, not what git is doing**

The user is *storing* their work, not *pushing* it. The user is *sharing* a snapshot, not *committing*. The user is *getting* the latest, not *fetching and merging*.

**Rule V2: Every command has an obvious inverse**

If there is a `babel store`, there is a `babel retrieve` (or equivalent). Users must be able to reason about undoing any operation from the command name alone.

**Rule V3: Destructive operations require a different word than non-destructive ones**

git's problem is that `reset --hard` and `reset --soft` are one typo apart. babelgit's vocabulary must make destructive operations feel different, not just look different.

**Rule V4: The vocabulary must work without git knowledge to interpret**

A user who has never used git should be able to read a babelgit command and have a reasonable guess at what it does. `babel store` passes this test. `babel rebase` does not.

**Rule V5: Consistency over cleverness**

The vocabulary should be internally consistent. If saving work locally is `babel save`, then saving work to the remote should follow the same pattern — not a different metaphor.

**Rule V6: The vocabulary is small by default**

The default command surface should be small enough to hold in working memory (target: ~8-10 commands for 90% of daily use). Advanced operations are accessible but not in the face of everyday users.

### 4.3 The Vocabulary Is Not Yet Decided

The exact command names are a design exercise that comes after the architecture is settled. This document establishes the rules for that exercise, not the results. No command names should be treated as final until a vocabulary design session produces a complete, internally consistent set that has been tested against these rules.

---

## Part 5: The State Visibility Requirement

### 5.1 Users Are Always Oriented

One of the five core failures of git's UX is the Invisible State Problem — users operate in the wrong state without knowing it. babelgit's primary obligation to its users, before any command is executed, is to make the current state visible and legible.

Every babelgit prompt or command invocation must be able to answer:

1. What branch am I on?
2. Is my work saved locally?
3. Is my local work synced with the remote?
4. Is anything in an intermediate state (mid-merge, mid-rebase, detached)?
5. What did I just do, and can I undo it?

These are not optional features. They are the foundation.

### 5.2 Pre-Flight Checks Are Mandatory for Destructive Operations

Before any operation that can cause data loss or rewrite history, babelgit must:

1. Verify the current state is what the user likely intends
2. Describe in plain language what the operation will do and what cannot be undone
3. Confirm before proceeding (with a clear way to abort)

This is not a prompt to type "yes I understand the risks." It is a plain language description: *"This will replace 2 commits on the shared branch. Your teammates will need to update their copies."*

---

## Part 6: The Safety Net Principle

### 6.1 The Reflog Is Visible

One of git's most powerful recovery tools (the reflog) is nearly invisible to users. babelgit surfaces it as a first-class feature. Users should know, from their first interaction with babelgit, that almost nothing is permanently destroyed.

### 6.2 The Undo Stack Is Human-Readable

babelgit presents recent operations in plain language, not raw git syntax. "3 hours ago you saved a snapshot called 'auth-fix'" not "HEAD@{3}: commit: fix(auth): handle null token."

### 6.3 Recovery Is a First-Class Workflow

Getting out of bad states is not an advanced topic in babelgit. It is a primary workflow, accessible from the default command surface, described in plain language.

---

## Part 7: Agent Requirements

### 7.1 babelgit Is Agent-Safe by Default

babelgit is designed from the start to be used by AI agents, not retrofitted for that use later. Every design decision considers both human users and AI agent users simultaneously.

### 7.2 Agent-Specific Requirements

- All operations are atomic: they succeed completely or fail completely with no intermediate state left behind
- All output is available in machine-parseable format (structured JSON or similar) alongside human-readable output
- Pre-flight state verification is built into every operation, not optional
- Protected branches (main, master, production) are protected by default with no way to accidentally operate on them without explicit override
- Every operation that modifies history requires explicit acknowledgment that history is being modified
- The safe operations matrix from the Git Bible (`docs/reference/04-PATTERNS-RECIPES-AGENTS.md`) informs the default permission model

### 7.3 Agent Commit Convention

Work performed by AI agents through babelgit is distinguishable from human work in the git history. The exact mechanism is TBD, but the principle is: agent-authored commits are always attributable as such.

---

## Part 8: What We Are Not Building

Stating explicitly what babelgit is not, to prevent scope creep and design drift:

- **Not a GitHub/GitLab client.** babelgit operates on repositories. It is not a platform client for PRs, issues, CI, etc.
- **Not a merge conflict resolver.** babelgit can surface conflicts clearly and guide resolution, but it does not automatically resolve conflicts on the user's behalf.
- **Not a code reviewer.** babelgit is version control UX, not development workflow tooling.
- **Not an AI-powered commit message generator.** babelgit may assist with structure, but it does not generate content.
- **Not a visual/graphical tool.** It is a CLI. GUI is a separate product decision, not in scope.
- **Not a git host.** babelgit talks to hosts. It is not one.
- **Not a git reimplementation.** git is the engine. We are not rewriting git.

---

## Part 9: Decision Log

Significant decisions made against this document are logged here as they occur.

| Decision | Rationale | Session |
|----------|-----------|---------|
| Standalone binary `babel`, not a git plugin | Cleaner vocabulary, no git knowledge required to invoke | 02 |
| Output is always standard git | Enables adoption without lock-in; raw git as permanent escape hatch | 02 |
| Show git commands by default | Translucent not opaque; users learn git through babelgit | 02 |
| Vocabulary designed around intent not git operations | The vocabulary IS the UX — must not inherit git's naming failures | 02 |
| babelgit owns the interface, git owns the data | Clean separation of concerns; prevents architectural corruption | 02 |
| Exact command vocabulary deferred | Names are a design exercise that follows architecture, not precedes it | 02 |
| babelgit's own metadata approach deferred | Must satisfy Constraint 1 regardless of approach chosen | 02 |
| Human-first interface design | Tighter feedback loop; feel the product before optimizing for agents | 03 |
| Agent-ready architecture from day one | MCP extension must not require rework; structure output for parseability | 03 |
| Governance layer is a first-class product layer | Working agreements in documents fail; enforcement must be in the tool | 03 |
| Team config is version controlled in the repo | Config is a team artifact, not an individual setting; subject to review | 03 |
| No bypass for governance constraints | The point of enforcement is that it enforces; overrides defeat the purpose | 03 |
| Primary user is the AI-augmented technical contributor | Designed for the PM/SME/generalist with a technical foundation using AI agents | 03 |
| Agents operate within team-defined lanes | Agents cannot violate working agreements regardless of upstream instruction | 03 |
| Vocabulary is team-defined, not universal | Teams use their own column names; babelgit executes the transitions they define | 03 |
| babelgit is a workflow engine, not just a git interface | Agile board states map to executable commands; git is the persistence layer | 03 |
| Ship default workflow configs, not blank slate | Teams need a best-practice starting point, not a design exercise at setup | 03 |
| MCP tool is babel_transition, not babel_push | Agents participate in team workflow, not just git operations | 03 |

---

## Part 10: Open Questions

Questions that are explicitly unresolved and must be resolved before implementation begins:

1. **Implementation language/runtime** — What does the `babel` binary run as?
2. **Metadata strategy** — Does babelgit store its own context, where, and how?
3. **Vocabulary design** — What are the actual command names?
4. **Minimum viable surface** — What is the smallest set of commands that demonstrates core value?
5. **Distribution** — How do users get and install babelgit?
6. **The expert escape hatch UX** — When a user needs raw git, how does babelgit hand off gracefully?
7. **Team config schema** — What does the config file look like? What is it called? What is the minimal required set of fields?
8. **Config initialization** — How does a team set up their config for the first time? What are the sensible defaults?
9. **Multi-agent coordination** — When multiple agents operate in the same repo simultaneously, how does the governance layer handle race conditions?
10. **MCP extension shape** — How does the human CLI map to MCP tool definitions? What additional surface does MCP need beyond what the CLI exposes?
11. **Default workflow configs** — What are the full default templates (Solo, Standard Agile, Continuous Delivery, Enterprise)? What are their columns, transitions, gates, and git operations?
12. **Transition config schema** — What can a transition definition do? Gates, external integrations, branch operations, notifications?
13. **Work item identity** — How does babelgit know what work item it's operating on? Branch naming convention, explicit declaration, or board integration?
14. **Proactive sync / watch mode** — Should babelgit include a background process that monitors upstream changes and auto-syncs per team config?
15. **Structural primitives** — What are the built-in commands every team has regardless of workflow config (save, sync, status, undo, history)?

**Resolved in Session 03:**
- ~~Human-first or agent-first?~~ → Human-first interface, agent-ready architecture.

---

*This document is a living constitution. It should be updated deliberately, with entries in the Decision Log when changes are made. It should never be edited casually. When in doubt, add to the Open Questions section rather than guessing.*
