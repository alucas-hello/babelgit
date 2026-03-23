# The Trust Model
## Verified Checkpoints and the babel run Verdict System

> *"How are you supposed to rewind to what was good if you never called anything good?"*
> — Project owner, Session 03

---

## The Verification Gap

Git solves persistence. Git does not solve trust.

Every commit in a git repository looks identical to every other commit. A "WIP: trying something" commit and a "this is solid, ship it" commit are structurally the same object. There is no native concept of a commit that has been **verified** — tested, reviewed, and formally called good by some combination of humans, automation, and agents.

This has always been a problem. It is becoming a crisis.

When human developers write code, they carry implicit knowledge about which states were good. They remember what they tested. They recall which version felt right before things went sideways. Git's reflog works as a recovery tool because there's a human who knows where to look.

When AI agents write code at velocity, that implicit knowledge disappears. The agent produced fifty commits today. Which ones were good? Nobody knows. The reflog exists, but there's no anchor — no moment where something was formally called good and made findable by that designation.

**This is the verification gap.** babelgit closes it.

---

## The Verified Checkpoint

A verified checkpoint is a specific point in history that has been:

1. **Prepared** — babelgit ensured the code was on the right branch, synced, in a clean state
2. **Tested** — the team's configured automation ran against this exact code
3. **Reviewed** — human and/or agent judgment was applied to the running state
4. **Verdicted** — a named outcome was assigned by the collective judgment of all participants
5. **Witnessed** — babelgit signed the checkpoint with: who called it, what verdict they gave, what automation passed, at what time, against what exact code

A verified checkpoint is not just a commit. It is a **named, attested, returnable moment of collective agreement that this state is what it was called.**

The verified checkpoint is the atomic unit of trusted progress in babelgit.

---

## babel run: A Review Session, Not a Test Runner

`babel run` is the mechanism that creates verified checkpoints. It is not a test runner. It is a **structured review session** — a moment where every available source of truth contributes to a verdict.

### What babel run Does

```
babel run
    │
    ├── 1. PREPARE
    │   ├── Verifies current branch is correct for this work item
    │   ├── Syncs to latest team state
    │   ├── Creates a recovery save point (pre-run state preserved)
    │   └── Starts the configured local environment
    │
    ├── 2. AUTOMATE  (runs in parallel with human review)
    │   ├── Unit test suite
    │   ├── Integration tests
    │   ├── End-to-end tests (Playwright, Cypress, etc.)
    │   ├── Linter and type checker
    │   ├── Coverage thresholds
    │   ├── Security scan
    │   └── Any team-configured gates
    │
    ├── 3. REVIEW  (human and/or agent, simultaneously)
    │   ├── Human: clicking through the running application
    │   │         validating what can be seen and felt
    │   │         checking edge cases, UX, business logic
    │   └── Agent: reviewing output against requirements
    │              flagging concerns, confirming intent
    │              checking for regressions in related areas
    │
    └── 4. VERDICT
        All inputs arrive → collective judgment is called
        Verdict is named → verified checkpoint is created
```

### The Participants

`babel run` is designed for **any combination** of these participants:

| Participant | What they contribute |
|-------------|---------------------|
| Human developer | Qualitative judgment — does this feel right, does the UX work, does it meet the requirement |
| Automated test suite | Quantitative verification — did the tests pass, coverage thresholds, no regressions |
| AI agent | Requirement alignment — does this match what was asked for, are there edge cases not covered |
| External systems | CI status, security scans, dependency audits |

Not all participants are required for every run. A solo developer might run with only automation and their own eyes. A team might require both human sign-off and full automation pass. The team config defines what constitutes a valid verdict.

### The Verdict

When `babel run` completes, a verdict is called. The verdict is not pass/fail. It is a **named outcome** that the team defines in their config.

The default verdicts:

---

## The Default Verdicts

### `keep`
**What it means:** This state is solid. Not necessarily ready to ship, but this is a good place to be. We trust this state.

**When to call it:** Automation passes. Review confirms the work is coherent and correct. The work item is making good progress but isn't finished.

**What babelgit does:**
- Creates a verified checkpoint labeled `keep`
- Records all automation results, who called it, and any notes
- Marks this as the current "last good state" for this work item
- Work continues from here

**What it unlocks:** This becomes the target for `babel undo`. If something goes wrong later, "go back to the last keep" is always a valid recovery instruction.

---

### `refine`
**What it means:** Close, but specific things need to change before this can be kept or shipped. We know what's wrong.

**When to call it:** Automation passes but review identified issues. Or automation failed in known, addressable ways. The work is on the right track but not done.

**What babelgit does:**
- Creates a verified checkpoint labeled `refine`
- Captures the refinement notes — what specifically needs to change
- Does NOT replace the last `keep` as the recovery anchor
- Surfaces the refinement notes in `babel state` so they're never forgotten

**What it unlocks:** The refinement notes become context for the agent's next iteration. "What am I trying to fix?" is answered by the notes attached to the `refine` checkpoint.

---

### `reject`
**What it means:** This direction is wrong. The approach needs to change. Revert to the last verified state.

**When to call it:** The approach was fundamentally wrong. The automation results are bad in ways that aren't addressable with small fixes. The human review reveals a misunderstanding of the requirement.

**What babelgit does:**
- Creates a verified checkpoint labeled `reject` (the rejected state is preserved, not destroyed)
- Records why it was rejected
- **Automatically returns to the last `keep` checkpoint**
- Surfaces the rejection reason so the next attempt has context

**What it unlocks:** Recovery without archaeology. `reject` means "go back to what was good and try a different way." The rejected work isn't deleted — it's labeled and preserved in `babel history` so the team can learn from it.

**Critical for AI agents:** An agent that hits `reject` doesn't need human intervention to find a safe state. babelgit returns it to the last `keep` automatically. The agent reads the rejection notes and tries a different approach. The loop is self-correcting.

---

### `ship`
**What it means:** This is ready for production. All participants agree. Send it.

**When to call it:** Automation passes. Review confirms. The work item is complete.

**What babelgit does:**
- Creates a verified checkpoint labeled `ship`
- Triggers the configured ship flow (`babel ship`)
- Records the complete verification record (all automation results, all reviewers, all verdicts in the work item history)
- This verified checkpoint becomes part of the permanent git record

---

### Team-Defined Verdicts

Teams can define additional verdicts in their config. Common examples:

```yaml
# babel.config
run_verdicts:
  - name: keep
    is_default_recovery_anchor: true
  - name: refine  
    capture_notes: required
  - name: reject
    action: revert_to_last_keep
  - name: ship
    triggers: ship_flow
  - name: review    # custom: hand to peer review before deciding
    action: open_pr
    target: team-review-channel
  - name: qa        # custom: automation passed, hand to QA team
    action: notify
    target: qa-channel
```

The verdict names are the team's vocabulary. The structure is babelgit's.

---

## The Checkpoint Record

Every verified checkpoint contains:

```
Checkpoint: PROJ-123 / keep #3
Work item:  auth-fix (PROJ-123)
Called at:  2026-03-23 14:32:07
Called by:  human (alex@company.com)

Automation results:
  ✓ Unit tests:        847 passed, 0 failed
  ✓ Integration tests: 124 passed, 0 failed  
  ✓ Playwright:        38 passed, 0 failed
  ✓ Lint:              clean
  ✓ Coverage:          94.2% (threshold: 90%)
  ✓ Security scan:     no issues

Review notes:
  "Auth flow solid. Token refresh handles the mobile timeout case.
   UX feels right. Tested on Chrome, Safari, mobile viewport."

Git state:
  Branch:  feature/PROJ-123-auth-fix
  Commit:  abc123def456 (signed)
  Parent:  last keep: 789abc (2 hours ago)
```

This record is babelgit's attestation. It answers: *what was true, who verified it, when, and against what exact code.*

---

## How This Anchors the Entire Vocabulary

The verified checkpoint connects every command:

```
babel start    → creates the work item; first save point established

babel save     → captures progress (unverified; not a checkpoint)
babel sync     → updates local state; does not create checkpoint

babel run      → the only command that creates verified checkpoints
                 produces: keep / refine / reject / ship

babel undo     → returns to last verified checkpoint (last keep or ship)
                 not "undo last commit" — "return to last known-good state"

babel continue → resumes from verified checkpoint state
                 agent or human picks up from the last attested good state

babel pause    → requires a verified checkpoint to exist
                 "you cannot pause unverified work"
                 ensures whoever continues finds work in a trusted state

babel state    → shows verified checkpoints in the work item history
                 human-readable narrative of the run/verdict progression

babel ship     → requires a verified checkpoint (ship verdict or recent keep)
                 the checkpoint record travels with the commit to production
```

---

## The Narrative History

Because every `babel run` produces a labeled, attested checkpoint, `babel history` can show the story of a work item in a way that is immediately readable by humans and agents:

```
● PROJ-123  auth-fix  [In Progress]

  14:32  ✓ KEEP    "auth flow solid, token refresh handles mobile timeout"
                    tests: 847/847, coverage: 94%, human: alex
                    
  13:15  ~ REFINE  "login works, timeout edge case failing on mobile viewport"
                    tests: 844/847 (3 failing), human: alex
                    notes: "need to handle the 320px breakpoint differently"
                    
  11:42  ✗ REJECT  "session management approach was wrong — using cookies
                    instead of tokens caused the mobile issue"
                    → reverted to KEEP #1
                    
  10:15  ✓ KEEP    "basic auth flow working, login/logout clean"
                    tests: 821/821, coverage: 91%, human: alex
                    
  10:00  ▶ START   "fix login timeout for mobile users" (PROJ-123)
                    branched from: dev @ commit 789abc
```

An AI agent reading this history knows:
- Where to return if things go wrong (last keep)
- What was tried and rejected (the session management approach)
- What the outstanding refinement note was
- Exactly what automation passed at each verified state

This is the context that makes agents self-correcting rather than self-perpetuating-failure.

---

## Why This Changes the PR Question

Traditional PRs exist because there was no trusted moment earlier in the workflow. Nobody called anything "good" with verifiable evidence until a human reviewed the PR.

With verified checkpoints, that moment exists — before the PR, before the push, on the developer's machine. The PR becomes a question of **governance preference**, not **trust necessity**.

Teams can choose:

```yaml
# High-trust, high-velocity team:
ship_requires:
  verified_checkpoint: keep_or_ship
  automation: all_passing
  pr_required: false   # checkpoint record IS the review

# Mixed team, building trust in the system:  
ship_requires:
  verified_checkpoint: keep_or_ship
  automation: all_passing
  pr_required: true    # PR required but checkpoint makes review trivial
  pr_reviewer_count: 1 # one reviewer, not three — they trust the checkpoint

# Regulated/enterprise team:
ship_requires:
  verified_checkpoint: keep_or_ship
  automation: all_passing
  pr_required: true
  pr_reviewer_count: 2
  compliance_attestation: true
```

The checkpoint doesn't eliminate PRs. It **changes what PRs are for.** Instead of "did this code work," PRs become "do we agree this should ship." That's a much faster, higher-value conversation.

---

## The Integration Pattern

babelgit does not own test execution. It **orchestrates** and **witnesses** what the team's tools produce.

```
babel run calls:         babelgit witnesses:
─────────────────────    ───────────────────────────────
npm test              →  847 passed, 0 failed ✓
npx playwright test   →  38 passed, 0 failed ✓
npm run lint          →  clean ✓
npx gitleaks          →  no secrets ✓
npm run coverage      →  94.2% ✓
[human opens browser] →  [human calls verdict]
[agent reviews diff]  →  [agent contributes to verdict]
```

babelgit's job is to:
1. Ensure the right tools run
2. Record their results faithfully
3. Block progress if required gates fail
4. Combine all inputs into the checkpoint record
5. Sign the checkpoint so it can be trusted

The tools themselves are whatever the team already uses. babelgit doesn't replace them. It makes their results **meaningful** by attaching them to a named, returnable point in history.

---

## Open Design Questions

1. **Checkpoint storage** — Where does the checkpoint record live? In git notes? A `.babel/checkpoints` directory? A hidden ref?
2. **Checkpoint signing** — What is the signing mechanism? GPG? SSH key? babelgit's own attestation format?
3. **Verdict calling UI** — How does a human call a verdict during `babel run`? A TUI overlay? A simple prompt? A separate command (`babel keep`, `babel reject`)?
4. **Agent verdict participation** — How does an AI agent contribute to the verdict? Can it block a `keep`? Can it call `reject` autonomously?
5. **Minimum viable checkpoint** — What is the minimum required for a checkpoint to be valid? Can a team ship without any automation (solo dev, prototype)?
6. **Checkpoint expiry** — Do checkpoints expire? How long is a `keep` valid for before re-verification is required?
7. **Cross-work-item recovery** — Can `babel undo` return to a checkpoint from before `babel start` (i.e., return to the last verified state of the dev branch)?

---

*This document captures the trust model established in Session 03. It is the foundational concept that distinguishes babelgit from every other git tool. The vocabulary, governance, and workflow engine all serve this: making it possible to call something good, provably, so you can always find your way back to it.*
