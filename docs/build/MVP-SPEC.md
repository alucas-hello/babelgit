# babelgit MVP Specification
## v0.1 — What Gets Built, What Doesn't, Why

**Version:** 1.0
**Status:** ✅ Complete — v0.1 shipped. v0.2 also complete (see below).
**Purpose:** Defines the exact scope of v0.1. Everything outside this document is v0.2 or later.

---

## The One-Paragraph Definition of v0.1

babelgit v0.1 is a TypeScript/Node.js CLI (invoked as `babel`) that gives developers and AI agents a shared vocabulary for the lifecycle of a piece of work, enforces team working agreements through a versioned config file, and creates attested checkpoints when someone declares a verdict after `babel run`. It ships with an MCP server that exposes the same functionality to AI agents. It produces standard git output. It requires no services, no accounts, and no infrastructure beyond Node.js and git.

---

## The Problem v0.1 Solves

**For the human:** Never type `git ___` for normal development work. Always know where you are. Never accidentally violate the team's working agreements.

**For the AI agent:** Always know what work item is in flight, what state it's in, what is permitted, and where the last safe state was. Sign a consistent attestation that "I tested this" before work leaves the agent's hands.

**The root problem both solve:** Working agreements live in documents that agents ignore and humans forget. babelgit moves them into the binary.

---

## The MVP Command Set

These twelve commands are everything v0.1 ships. No more.

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

---

## What v0.1 Is Not Responsible For

These are explicitly out of scope. They are not "future features to design now." They are not mentioned in the codebase. They do not appear in help text.

| Not in v0.1 | Belongs in | Status |
|-------------|-----------|--------|
| Running test commands automatically | Configuration extension (v0.2) | ✅ Built — `run_commands` in config |
| Capturing test output | Integration layer (v0.2) | ✅ Built — results in checkpoint records |
| Playwright / CI integration | Integration layer (v0.2) | Partially — `run_commands` supports arbitrary scripts |
| JIRA / Linear ticket creation | Integration layer (v0.2) | ✅ Built — Linear integration |
| Slack / notification systems | Integration layer (v0.2) | Not yet |
| Shared checkpoint storage | Infrastructure layer (v0.2) | Not yet — v0.3 |
| PR creation and management | Platform layer (v0.2) | ✅ Built — GitHub integration |
| Merge conflict resolution | Advanced workflows (v0.2) | Not yet |
| GUI / TUI interface | Separate product decision | Not yet |
| Multi-repo / monorepo support | Advanced configuration (v0.3) | Not yet |
| Checkpoint signing / cryptography | Trust infrastructure (v0.2) | Not yet — v0.3 |
| Work item creation in external systems | Integration layer (v0.2) | ✅ Built — Linear creates issues on `babel start` |

If a feature is not in the command table above, it is not in v0.1.

---

## The MVP Mental Model

v0.1 presents users with three things:

**1. A lifecycle vocabulary**
Ten verbs that cover everything a contributor does. Universal English. No git knowledge required.

**2. A governance layer**
A `babel.config.yml` in the repository root. Committed. Version controlled. The same for everyone. Enforced by the binary.

**3. A checkpoint record**
When `babel run` is called, the filesystem state is locked. When a verdict is called (`keep`, `refine`, `reject`, `ship`), an attestation is created: this person or agent, this verdict, this exact code, this timestamp. Stored locally in `.babel/checkpoints/`. That's it.

These three things, working together, solve the problems we set out to solve. Everything else is extension.

---

## Definition of Done for v0.1

v0.1 is complete when:

1. ✅ A developer can clone a repository, run `babel init`, and complete a full work item lifecycle (`start` → `save` → `run` → `keep` → `ship`) without typing `git ___`
2. ✅ The repository produced is a valid standard git repository that works normally with raw git
3. ✅ An AI agent using the MCP server can do the same lifecycle programmatically
4. ✅ If an agent or human attempts an operation that violates `babel.config.yml`, the operation is blocked with a plain-language explanation
5. ✅ `babel state` returns accurate, human-readable current situation at any point in the lifecycle
6. ✅ `babel history` shows a human-readable narrative of a work item's checkpoint history
7. ✅ All git commands executed are printed to stdout (translucent, not opaque)

---

## The Success Criterion

A developer or AI agent who has never used git can contribute to a team repository, have their working agreements enforced, and leave behind a verified attestation that they tested their work — all without knowing what git is doing underneath.

A traditional developer on the same team can use raw git in the same repository without any interference, migration, or cleanup.

Both of these must be true simultaneously.
