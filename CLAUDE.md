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

## What To Do If You Get Stuck

1. Re-read `docs/build/TECHNICAL-SPEC.md` — the answer is probably there
2. Re-read `docs/strategy/CONSTRAINTS.md` — check you're not violating a constraint
3. Leave a clear comment in the code explaining what's unresolved and why
4. Create a `BLOCKERS.md` file in the root with the question clearly stated
5. Do not guess at behavior that affects data integrity (git operations, checkpoint storage, governance enforcement)

---

## What Not To Do

- Do not add dependencies without leaving a note in NOTES.md
- Do not implement `babel undo` (requires shared checkpoint storage — v0.3)
- Do not call git via shell string interpolation
- Do not print git error messages directly to users — translate them
- Do not add a `--force` flag to anything that bypasses governance
- Do not modify the docs/strategy/ documents without explicit instruction

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
├── src/                         ← write your code here
│   ├── cli/commands/            ← one file per command
│   ├── core/                    ← git, config, state, checkpoint, governance, scripts, hooks, rules
│   ├── integrations/            ← linear, github, index
│   ├── mcp/                     ← MCP server
│   └── types.ts
├── tests/                       ← vitest unit + integration tests
└── sandbox/                     ← manual test scripts and scratch space (not committed to prod)
```
