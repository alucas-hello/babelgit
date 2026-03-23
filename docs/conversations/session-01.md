# Session 01 — Project Inception
**Date:** 2026-03-22  
**Status:** Complete  
**Participants:** Project owner, Claude (Sonnet 4.6)

---

## What Was Decided in This Session

This was the founding session. Everything from project concept through naming was established here.

---

## 1. The Core Concept

**Decision:** Build a translation layer on top of git, not a replacement for git.

The project started from a specific insight: git is a phenomenal data model with a catastrophic user interface. It was designed from the model outward, not from use cases inward. The goal is a layer that accepts human and AI agent intent and translates it to correct git operations — making the gap invisible.

**Key framing:** This is the Babel Fish from Douglas Adams' *Hitchhiker's Guide to the Galaxy*. The fish sits between you and an incomprehensible language and makes the translation disappear. You stop thinking about the language and start thinking about what's being said.

**Critical constraint from the Babel Fish analogy:** Someone on the team still needs to know Vogon. The layer must be translucent, not opaque. False confidence is worse than no confidence. babelgit must never hide the git operation it's performing — it shows the translation, doesn't just do it silently.

---

## 2. The Knowledge Foundation Built

Before any design or code, we built:

### The Git Bible (`docs/reference/`)
27,000+ words across four documents:
- `01-CORE-CONCEPTS.md` — Object model, four git objects, three trees, HEAD, refs, packfiles, .git anatomy, revision syntax
- `02-COMMAND-REFERENCE.md` — Every porcelain and plumbing command with all flags
- `03-WORKFLOWS-HOOKS-INTERNALS.md` — Branching workflows, transfer protocol, hooks, merge strategies, sparse checkout, attributes, performance tuning
- `04-PATTERNS-RECIPES-AGENTS.md` — Golden rules, power recipes, anti-patterns, aliases, safe scripting, AI agent guidance, disaster recovery, decision trees

### The UX Research Report (`docs/research/`)
5,600+ words synthesizing hundreds of real-world sources — Stack Overflow, developer forums, ohshitgit.com, non-programmer guides, AI agent failure analyses.

**The five systemic failure modes identified:**
1. The Vocabulary Wall (terminology leaks internals)
2. The Invisible State Problem (wrong state, invisible safety net)
3. The Four-Location Confusion (users expect 2 locations, git has 4)
4. The Inconsistent Command API (`checkout` does 3 things, etc.)
5. The Recovery Paradox (mistakes easy, recovery requires vocabulary learned only after mistakes)

---

## 3. Repository Structure Decisions

**Decision:** Use a Claude Code-friendly structure from day one.

```
babelgit/
├── CLAUDE.md              ← AI agent context file (read first)
├── README.md              ← Public description
├── docs/
│   ├── reference/         ← Git Bible (ground truth)
│   ├── research/          ← UX research (ground truth)
│   ├── strategy/          ← Design decisions
│   └── conversations/     ← Session logs (this directory)
├── src/                   ← Implementation (Phase 3)
├── tests/
└── scripts/
```

**Rationale for CLAUDE.md:** Claude Code reads this file first. It must contain enough context that any AI agent (or new human) can get up to speed without reading every document. It's the project's source of truth for intent, constraints, and status.

**Rationale for conversations/:** Planning happens in Claude Projects (chat), but decisions need to persist in the repo so Claude Code can reference them. Every significant planning session gets logged here.

---

## 4. Naming History

**Considered and rejected:**
- `gitwise` — taken by at least 4 existing GitHub repos, including an active Linux Git GUI client (FlynnFc/gitwise)
- `gitmatic` — taken by paincompiler/gitmatic (2017, dormant shell script)
- `rosetta` — taken by Apple (architecture translator, same metaphor)
- Various non-git names (`grove`, `waypoint`, `grok`, etc.)

**The Git trademark issue discovered:**  
Software Freedom Conservancy holds a registered trademark on "Git" (US Reg. 4680534). Their policy explicitly prohibits using "git" as a syllable in a portmanteau without written permission. Examples given in the policy: "Gitalicious", "Gitpedia". This technically covers both `gitmatic` and `gitwise` — and `babelgit`.

**Decision:** Use `babelgit` now. The risk is low (enforcement targets impersonators, not ecosystem tools; hundreds of "git-" named tools operate without issue). If the project ever goes public, do proper trademark research and rename if necessary at that point.

**Why `babelgit` won:** The name directly encodes the core metaphor. It signals what the product does — translation — rather than what technology it sits on top of. It's memorable and the story is immediately legible to anyone who's read Douglas Adams.

---

## 5. Planning vs. Building Decision

**Decision:** Continue strategic planning in this Claude Project. Create the repo now but don't move to Claude Code until we have a clear enough design to start building.

**Rationale:** Claude Projects are optimized for long-form planning with persistent context. Claude Code is optimized for agentic software development. The transition point is when we stop asking "what should this be?" and start asking "how do we build it?"

**For the transition:** The repo structure, CLAUDE.md, and conversation logs are specifically designed to make the Claude Code handoff clean. When we open Claude Code against this repo, it will have full context.

---

## 6. iPad Constraint

The project owner is working from an iPad. This means:
- GitHub repo creation and auth must wait until they're on a real machine
- All file work happens through Claude's container and outputs
- Strategy and planning work continues uninterrupted

---

## 7. Open Questions Carried Forward

These were not resolved in this session and need to be addressed in strategy:

- **Implementation language/runtime** — What does babelgit run as?
- **Primary interface** — CLI? Library? Both? Something else?
- **Human-first or agent-first?** — Who is the primary user we design for initially?
- **Distribution mechanism** — How do people get it?
- **The "someone still needs to know Vogon" question** — How does babelgit handle the cases where the translation fails or where git expertise is genuinely required?

---

## 8. Design Principles Established

Ten principles that every implementation decision must be evaluated against:

1. Express user intent, not git operations
2. Make state visible
3. Opinionated defaults, escapable
4. Progressive disclosure
5. Describe consequences, not mechanisms
6. Pre-flight checks
7. Graceful state recovery
8. Human-readable history
9. The safety net should be visible
10. Agent-safe by default

---

## Next Session Goals

- Resolve the open questions above (implementation language, interface type, primary user)
- Begin architecture document in `docs/strategy/`
- Define what "version 0.1" looks like — the smallest thing that demonstrates the core value

---

## Artifacts Produced This Session

| File | Description |
|------|-------------|
| `docs/reference/01-CORE-CONCEPTS.md` | Git Bible Part 1 |
| `docs/reference/02-COMMAND-REFERENCE.md` | Git Bible Part 2 |
| `docs/reference/03-WORKFLOWS-HOOKS-INTERNALS.md` | Git Bible Part 3 |
| `docs/reference/04-PATTERNS-RECIPES-AGENTS.md` | Git Bible Part 4 |
| `docs/research/05-UX-RESEARCH-REPORT.md` | UX Research Report |
| `README.md` | Project introduction |
| `CLAUDE.md` | AI agent context file |
| `docs/conversations/session-01.md` | This document |
