# Session 02 — Architecture & The Governance Layer
**Date:** 2026-03-23  
**Status:** Complete  
**Participants:** Project owner, Claude (Sonnet 4.6)

---

## What Was Decided in This Session

Two sessions worth of decisions are combined here. Session 02 established the architecture. Session 03 (same day, continued conversation) surfaced the governance layer and defined the primary user through the project owner's direct experience.

---

## Session 02: Architecture Decisions

### The Binary and Vocabulary

**Decision:** babelgit is a standalone binary invoked as `babel`. Not `git babel`. Not a plugin. Not a wrapper that exposes git's command surface.

The user never types `git` when using babelgit in a normal workflow. The command surface is entirely babelgit's own vocabulary, designed around intent.

**Decision:** The vocabulary is designed from scratch, independently of git's vocabulary. Similarity to git commands is not a design goal and not an achievement. Commands are named for what the user is doing, not what git is doing.

Examples of what this means:
- `git push` → `babel store` (illustrative, not final)
- `git commit` → `babel snapshot` (illustrative, not final)
- Not: `babel push`, `babel commit`

The exact vocabulary is explicitly deferred to a design exercise that follows architecture decisions.

### The Three-Layer Architecture (updated to four in Session 03)

Originally established as three layers:
1. User Layer — vocabulary, intent
2. babelgit Layer — translation, pre-flight, error translation
3. Git Layer — standard git operations, standard output

Updated to four layers in Session 03 when the Governance Layer was identified as distinct and first-class.

### The Non-Negotiable Constraints Established

Five constraints were formalized:

1. **Always produces standard git output** — The repository is always valid git. If babelgit disappeared, everything continues working forever.
2. **Separate binary with its own vocabulary** — `babel`, not git-prefixed. Own command surface.
3. **Never hides what it's doing** — Shows git commands being executed. Translucent, not opaque.
4. **Standard git is always the escape hatch** — Any user can drop to raw git at any moment without migration.
5. **babelgit owns the interface, git owns the data** — No new object types, no parallel data stores required for validity.

### Constraint 3 Rationale: Why Transparency Matters

This was discussed at length. The Babel Fish analogy cuts both ways — a fish that conceals the translation is dangerous, not helpful. When something goes wrong at the git level, a user who has never seen the underlying commands is helpless. 

The transparency rule serves two purposes:
1. Safety — users can debug at the git level when needed
2. Education — users learn git by watching babelgit work

This is the "someone still needs to know Vogon" principle applied practically.

---

## Session 03: The Governance Layer and the Real User

### The Most Important Conversation So Far

The project owner shared their direct experience that reframed the entire product.

**The lived problem:** As a product manager in their 40s with a strong technical foundation from earlier in their career, the owner has been transformed by AI coding agents. Claude Code produces high-quality work extremely fast. But 14 hours were lost in a single day to Claude chasing itself in circles on git — repeatedly trying to merge to main without direction, failing to maintain a simple working agreement (keep dev branch current, work from it, ship PRs when called).

The tools tried: additional skills, memory persistence, CLAUDE.md instructions, explicit chastising. None held. Claude ignored or forgot the working agreement repeatedly.

**The insight:** This is not a git knowledge problem. Claude demonstrably understands git. This is a **working agreement enforcement problem.** There was no authoritative, enforced contract between Claude and the repository's rules. Everything provided was a suggestion. Nothing was enforcement.

### The Governance Layer

**Decision:** babelgit is not just a translation layer. It is a governance layer. These are two distinct, first-class product layers.

The **Governance Layer** sits above the Translation Layer in the architecture. It enforces team working agreements at the execution level. An operation that violates the team config never reaches the translation layer.

**What governance enforcement means:**
- Rules are in the binary, not in documents
- Rules apply equally to humans and agents
- There is no bypass flag, no override mode
- If the rule needs to change, the config is updated through the normal process

**The team config:**
- Lives in the repository
- Is version controlled
- Is committed and reviewed like any other team artifact
- Applies identically to everyone — human or agent

### Constraint 6: Team Working Agreements Are Enforced, Not Suggested

This became the sixth non-negotiable constraint, and arguably the most important one for the primary use case.

Working agreements defined in the team config are enforced by the binary. Not suggested. Not documented. Enforced.

A team that says "PRs required before main" gets a babelgit where pushing to main is literally not possible without a PR. Not warned. Not discouraged. Not possible.

### The Primary User

**Decision:** The primary user is the **AI-augmented technical contributor** — product managers, SMEs, business analysts, and generalists who can now produce high-quality code through AI agents faster than traditional engineering workflows can absorb.

This person has:
- Enough technical foundation to understand what they're doing
- Real business context and product judgment
- AI agents producing quality work on their behalf
- No time or patience for git's implementation-level complexity
- A genuine need to participate in team repositories responsibly

This person is **not** a beginner. They are not "non-technical." They are a highly capable contributor who is being held back by tooling that was designed for a different era.

**The secondary user is the AI agent.** The agent's failures — chasing itself in git circles, ignoring working agreements, attempting forbidden operations — are exactly what babelgit prevents. The agent cannot violate the working agreement regardless of what it has been instructed to do upstream.

**The tertiary user is the traditional developer.** They must not be disrupted. babelgit must earn their trust through clean, standard git output. They may use babelgit or raw git — their choice.

### Human-First, Agent-Ready

**Decision:** Build human-first. Ship MCP second.

**Rationale:**
- Human interface gives a tighter feedback loop — you can feel whether the vocabulary is right
- CLI with structured output is architecturally halfway to an MCP server already
- Designing for agents before you can use the tool yourself means optimizing for an interface you can't feel

**Architecture implication:** Output must be structured from day one — even in the human interface — because the MCP layer will need to parse it. This is not a future concern. It shapes the output format of every command.

The sequencing:
- v0.1 — Human CLI with full governance layer
- v0.2 — MCP server exposing same operations as tools

### The Larger Vision

Beyond the immediate use case, the project owner articulated a broader shift:

*"No amount of git expertise can close the gap between the overhead required for code submission, approval, and deployment and the extreme productivity we're now experiencing. It's time for a fundamental shift in how we see working together as teams and how we define our working agreements with CI/CD tools."*

babelgit is infrastructure for that shift. It doesn't force teams to abandon their working agreements — it makes those agreements enforceable in the new reality where contributors include AI agents and non-traditional technical contributors moving at previously impossible velocity.

---

## Artifacts Updated This Session

| File | Changes |
|------|---------|
| `docs/strategy/CONSTRAINTS.md` | Updated to v0.2: added governance layer, Constraint 6, four-layer architecture, primary user definition, team config sketch, updated decision log and open questions |
| `docs/conversations/session-02.md` | This document |

---

## Open Questions Added This Session

- Team config schema — what does it look like, what's the minimal required set?
- Config initialization — how does a new team set up their config?
- Multi-agent coordination — how does governance handle concurrent agents?
- MCP extension shape — how does CLI map to MCP tools?

---

## Next Session Goals

- Implementation language decision
- Minimum viable surface — the 8-10 commands for 90% of daily use
- Vocabulary design session — actual command names against the V1-V6 rules
- What does v0.1 look like, concretely?
