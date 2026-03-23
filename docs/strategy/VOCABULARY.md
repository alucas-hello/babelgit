# babelgit Vocabulary
## The Command Surface

> *"Every word is a universal English verb a ten-year-old understands. None require git knowledge to interpret."*

---

## The Core Insight

babelgit's vocabulary was designed by asking a different question than git asked. git asked: *what operation do we need to perform on the object model?* babelgit asks: *what is the person actually doing?*

The result is a vocabulary of eight words that cover the complete lifecycle of a piece of work — from inception to production, including handoffs, abandonment, and validation.

---

## The Lifecycle

```
babel start
      │
      ▼
  [work happens]
  babel save    ← checkpoint locally without pausing
  babel sync    ← get current with team
  babel state   ← where am I, what's the situation
      │
      ├──→ babel stop    ← abandon entirely, like it never happened
      │
      ▼
babel pause     ← leave in handoff-ready state
      │
      ▼
babel continue  ← resume (mine or anyone else's paused work)
      │
      ▼
babel run       ← local validation: right branch, right env, enforced tests
      │
      ▼
babel test      ← hand to QA process (human, automated, or both)
      │
      ▼
babel ship      ← get into production responsibly
```

---

## Command Definitions

### `babel start`
**What it means to the user:** I am beginning work on something new.

**What babelgit does:**
- Syncs from the team's shared base (dev branch or equivalent)
- Creates a new branch for this work
- Names the branch according to team convention (ticket number, description, etc.)
- Sets local environment to work-ready state
- Records the start of this work item in babelgit's state

**Receives:** An optional work item identifier or description. If none, prompts.

**Example:**
```bash
babel start auth-fix
babel start "fix login timeout for mobile users"
babel start PROJ-123
```

**git equivalent:** `git fetch && git checkout -b feature/auth-fix origin/dev`

---

### `babel save`
**What it means to the user:** Checkpoint my progress without pausing or sharing.

**What babelgit does:**
- Snapshots all current changes locally
- Does not push to remote
- Does not change the workflow state
- Records a human-readable description of the snapshot

**This is the low-level primitive** — the thing users do repeatedly between `start` and `pause`. It answers "I want to capture where I am right now without stopping."

**Example:**
```bash
babel save
babel save "got the login flow working, tests still failing"
```

**git equivalent:** `git add -A && git commit -m "..."`

---

### `babel sync`
**What it means to the user:** Get current with what the rest of the team has shipped.

**What babelgit does:**
- Fetches from the remote
- Integrates team changes into current work (rebase or merge per team config)
- Reports conflicts in plain language if they occur
- Updates the "last synced" timestamp visible in `babel state`

**When to use:** Before `babel run`, before `babel pause`, whenever you suspect the team has shipped changes you don't have.

**Example:**
```bash
babel sync
```

**git equivalent:** `git fetch && git rebase origin/dev` (or merge, per config)

---

### `babel pause`
**What it means to the user:** I am done for now. Leave this in a state that anyone on the team can pick up.

**What babelgit does:**
- Saves all current progress
- Pushes the branch to the remote
- Verifies the work is in a coherent, resumable state
- Marks the work item as "Paused" in babelgit's state
- Optionally notifies teammates that this work is available to continue

**The implicit contract of `pause`:** This work is safe. It is coherent. It is not broken. Another person — or the same person tomorrow — can `babel continue` from here without confusion or cleanup.

**This is different from `save`.** `save` is a local checkpoint. `pause` is a handoff.

**Example:**
```bash
babel pause
babel pause "got auth working, need help with the token refresh edge case"
```

**git equivalent:** `git add -A && git commit -m "WIP: ..." && git push origin feature/auth-fix`

---

### `babel continue`
**What it means to the user:** Put me back on a track that was paused — mine or someone else's.

**What babelgit does:**
- With no argument: resumes the most recently paused work by the current user
- With an argument: resumes the specified work item
- Syncs the branch to the latest remote state
- Restores the working environment to the state it was paused in
- Marks the work item as "In Progress" again

**This solves a problem git doesn't know it has:** The handoff. Someone paused this work. Another person — or an AI agent — picks it up. babelgit ensures they're on the right branch, with the right code, aware of what state it was left in.

**Example:**
```bash
babel continue               # resume my most recently paused work
babel continue auth-fix      # resume specific work item
babel continue PROJ-123      # resume by ticket number
```

**git equivalent:** `git fetch && git checkout feature/auth-fix && git pull`

---

### `babel stop`
**What it means to the user:** This was a bad idea. Get rid of it like it never happened.

**What babelgit does:**
- Saves the branch to a recovery point (accessible via `babel history` for a configurable period)
- Removes the branch locally and remotely
- Returns to the team's base branch (dev or equivalent)
- Does NOT produce a PR. Does NOT merge anything. This work is abandoned.

**This is the only destructive command in the core vocabulary.** It feels different from all the others because it is different. babelgit will describe what will be removed and ask for confirmation before proceeding.

**The word matters:** `stop` is unambiguous. It is not `pause`. It is not `undo`. It means: this direction is abandoned.

**Example:**
```bash
babel stop
babel stop "taking a completely different approach to this"
```

**git equivalent:** `git checkout dev && git branch -D feature/auth-fix && git push origin --delete feature/auth-fix`

---

### `babel state`
**What it means to the user:** Tell me everything I need to know about the current situation.

**What babelgit shows:**
- What work item I'm on (not what branch — the work item name)
- Where this work is in the team's workflow (In Progress / Paused / In Review / etc.)
- Whether my local work is saved
- Whether I'm current with the team
- Whether there are conflicts or issues to address
- The last few things that happened
- What the natural next command is

**This is not `git status`.** `git status` tells you about files. `babel state` tells you about your work in the context of the team's workflow.

**Example output:**
```
● auth-fix  [In Progress]
  3 saves since last sync, not yet shared with team
  Team has shipped 2 changes since your last sync → run 'babel sync'
  Last save: 23 minutes ago ("got the login flow working")
  
  You are here: In Progress → [Review] → Testing → Ship
  Ready to pause? Run: babel pause
```

**git equivalent:** There is no equivalent. This is new.

---

### `babel run`
**What it means to the user:** Start a review session — right branch, right environment, full automation, and collective judgment — that ends with a named verdict and a verified checkpoint.

**What babelgit does:**
1. Verifies the current branch is correct for this work item
2. Syncs to latest team state
3. Creates a recovery save point before starting
4. Starts the configured local development environment
5. Fires the team's configured automation suite (tests, lint, coverage, security)
6. Waits for human review, agent review, and automation results simultaneously
7. Receives a verdict from the collective judgment of all participants
8. Creates a **verified checkpoint** labeled with the verdict

**The verdict is the checkpoint.** `babel run` doesn't end with "passed" or "failed." It ends with a named outcome — `keep`, `refine`, `reject`, or `ship` — that becomes a labeled, attested, returnable point in history.

**The four default verdicts:**

| Verdict | Meaning | What babelgit does |
|---------|---------|-------------------|
| `keep` | Solid. Not done, but this is a good state. | Creates verified checkpoint; becomes recovery anchor |
| `refine` | Close. Specific things need to change. | Creates checkpoint with notes; does not replace last keep |
| `reject` | Wrong direction. Revert. | Creates labeled record; returns to last keep automatically |
| `ship` | Ready. Send it. | Creates verified checkpoint; triggers ship flow |

**Who calls the verdict:** Any combination of human, AI agent, and automation. The team config defines what inputs are required for a valid verdict. A solo developer might call it alone. A team might require automation passing AND human sign-off.

**Why this matters:** This is how babelgit answers "how do you rewind to what was good?" You can only rewind to good if you called something good. `babel run` is the moment you call it. The checkpoint is the anchor. `babel undo` returns you there. Agents can self-recover without human intervention.

**See:** `docs/strategy/TRUST-MODEL.md` for the complete verified checkpoint design.

**Example:**
```bash
babel run              # starts review session, waits for verdict
babel keep             # call verdict: this state is solid
babel reject           # call verdict: wrong direction, revert to last keep
babel refine "token refresh still failing on 320px viewport"
babel ship             # call verdict: ready for production
```

**git equivalent:** There is no equivalent. This concept does not exist in git.

---

### `babel test`
**What it means to the user:** Send this to whoever needs to test it — human QA, automated pipeline, or both.

**What babelgit does (per team config):**
- Saves and pushes current work
- Opens a PR against the configured test/staging branch
- Triggers the configured test pipeline (CI/CD)
- Notifies the configured QA channel or person
- Moves the work item to the configured testing state
- Enforces that required gates are met before submission (lint, unit tests, etc.)

**This is the team-workflow command.** What `babel test` does is entirely defined by the team config. For a solo developer it might just run the local test suite. For an enterprise team it might open a Jira ticket, assign to a QA engineer, trigger a deployment to a staging environment, and require sign-off before proceeding.

**Example:**
```bash
babel test
babel test "please pay special attention to the token refresh flow"
```

**git equivalent:** `git push && gh pr create --base staging` (plus whatever the team's process requires)

---

### `babel ship`
**What it means to the user:** Get this into production responsibly.

**What babelgit does (per team config):**
- Verifies all required gates have been passed (review approved, tests passing, etc.)
- Merges to the production branch using the team's configured strategy
- Tags the release if configured
- Triggers the configured deployment pipeline
- Notifies the configured channels
- Closes the work item
- Cleans up the feature branch

**`ship` is the final state.** After `babel ship`, the work is done. The branch is cleaned up. The cycle is complete.

**babelgit will refuse to ship if:**
- Required approvals are missing
- Required tests are not passing
- The team config's pre-ship gates are not satisfied

**Example:**
```bash
babel ship
```

**git equivalent:** `git checkout main && git merge --no-ff feature/auth-fix && git push && git tag v1.2.3 && git branch -d feature/auth-fix`

---

## The Structural Primitives vs. Workflow Commands

babelgit has two categories of commands:

**Structural primitives** — always present, same meaning on every team:

| Command | Always means |
|---------|-------------|
| `babel save` | Checkpoint locally |
| `babel sync` | Get current with team |
| `babel state` | Show current situation |
| `babel undo` | Reverse last babelgit operation |
| `babel history` | Show recent operations and recovery options |

**Workflow commands** — meaning defined by team config:

| Command | Means whatever the team defines for this state |
|---------|-----------------------------------------------|
| `babel start` | Begin a new work item |
| `babel pause` | Leave work in handoff-ready state |
| `babel continue` | Resume paused work |
| `babel stop` | Abandon work entirely |
| `babel run` | Local validation loop |
| `babel test` | Submit for testing/review |
| `babel ship` | Deploy to production |

Teams can rename the workflow commands in their config. A team that calls their testing state "QA" can configure `babel qa` to mean what `babel test` means by default. The structure is fixed. The words are theirs.

---

## Validation Against Design Rules

| Rule | Assessment |
|------|-----------|
| V1: Named for what user is doing, not git | ✅ Every command is a human action verb |
| V2: Every command has obvious inverse | ✅ start/stop, pause/continue are natural pairs |
| V3: Destructive operations feel different | ✅ `stop` is unambiguous; nothing else sounds like it |
| V4: Works without git knowledge | ✅ All universal English; zero git terminology |
| V5: Consistency over cleverness | ✅ All verbs, same register, same voice |
| V6: Small surface | ✅ 8 core commands + 2 primitives covers 95% of daily use |

---

## Open Questions on Vocabulary

1. **Work item identity in `continue`** — How does babelgit know which work to continue? Branch naming convention, explicit argument, or board integration?
2. **`babel run` scope** — Where does version control end and development environment begin? How much does babelgit own vs. delegate to team-configured scripts?
3. **Test automation integration** — What is the full design for `babel run`'s enforcement of local test suites?
4. **Renaming workflow commands** — How does the team config rename defaults? What's the syntax?
5. **`babel undo` scope** — What can be undone? Just the last babelgit operation, or a full history?
6. **`babel history` display** — How does this surface the safety net? What does the recovery UI look like?
7. **Agent vocabulary** — Do agents use the same commands? Are there agent-specific commands, or is the vocabulary identical for humans and agents?

---

*This document was produced in Session 03. It supersedes the earlier vocabulary placeholder in CONSTRAINTS.md. The V1-V6 rules from CONSTRAINTS.md informed this design.*
