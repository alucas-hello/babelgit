# GIT UX RESEARCH REPORT
## A Complete Usability Study: Why Git Fails People (And Exactly How)

> *"Git documentation has this chicken and egg problem where you can't search for how to get yourself out of a mess, unless you already know the name of the thing you need to know about in order to fix your problem."*
> — Katie Sylor-Miller, ohshitgit.com

---

## EXECUTIVE SUMMARY

This report synthesizes findings from hundreds of real-world sources — Stack Overflow threads, developer forums, blog posts, academic research, tutorials for non-programmers, AI agent failure analysis, and the viral "Oh Shit, Git" corpus — to map exactly where, why, and how git fails its users.

**The core finding:** Git's UX problems are not random. They cluster into five systemic failure modes:

1. **The Vocabulary Wall** — Terminology that leaks internal implementation details to users
2. **The Invisible State Problem** — Users cannot see where they are, and wrong-state operations fail cryptically
3. **The Four-Location Confusion** — Git tracks files in 4 places; users expect 2
4. **The Inconsistent Command API** — Commands that do wildly different things based on arguments
5. **The Recovery Paradox** — Undoing things is harder than doing them, and harder still to discover

Git is not broken. It is a phenomenal data model with a catastrophic user interface. The mental model it exposes is the mental model of its internals, not the mental model of the jobs users are trying to do.

---

## PART 1: THE CORE DIAGNOSIS

### 1.1 Designed from the Model Outward, Not the Use Case Inward

The most astute diagnosis comes from a developer in a community thread:

> *"Git is a brilliant data model that we hack into being a code repo. It was designed from the model backwards, not the use cases inwards."*

Git was built by Linus Torvalds to solve the Linux kernel's specific distributed collaboration problem. The commands reflect the needs of that specific workflow and the internals of that specific data model — not the general needs of a team shipping a product.

What this means in practice:
- Commands are named for what they do to git's internals (`checkout`, `reset`), not what users are trying to accomplish (`switch branch`, `undo change`)
- The same command does radically different things depending on context (the `checkout` problem)
- Edge cases in the data model surface as regular user-facing operations (detached HEAD)
- There are 10+ ways to undo things, each appropriate for a slightly different situation

### 1.2 The SVN Mental Model Transfer Problem

Millions of developers learned version control with SVN or similar centralized systems. Git's distributed model is fundamentally different, and the mismatch creates predictable, specific confusion patterns:

| User Expects (SVN model) | Git Reality |
|--------------------------|-------------|
| 2 places: local + server | 4+ places: working tree, index, local repo, remote |
| Commit = publish | Commit is local; push is separate |
| Branch = expensive, avoid | Branch = trivial, encouraged |
| History is fixed | History is rewritable (and rewriting is sometimes required) |
| One repo | Distributed: every clone is a full repo |
| Checkout = get latest from server | Checkout = switch branches (or restore files, or detach HEAD) |

One developer captures the dislocation precisely:
> *"In SVN there are only two different places source can exist: your local directory and the remote repository. All our interactions back and forth are between these two places. This is not too difficult to understand. Git has many more places for source to exist."*

### 1.3 The Cost Nobody Counts

From the developer community:
> *"People vastly underestimate the real cost of ownership of Git, the confusion, problems, research, lookups etc. that it ultimately creates. To the point that I consider it a borderline liability."*

The real-world cost is invisible because it's distributed as individual lookup time:
- 5 minutes searching Stack Overflow to remember how to unstage a file
- 20 minutes untangling a diverged branch on a Monday morning
- An afternoon lost to a bad rebase on a shared branch
- The onboarding cost for every new team member
- The opportunity cost of never using 80% of git's power because it's too scary

This is the user cost that a better UX layer could eliminate.

---

## PART 2: THE VOCABULARY WALL

### 2.1 The Terminology Audit

Julia Evans surveyed her developer community (Mastodon, 2023) specifically asking which git terms confused people. The response was overwhelming. Every single major concept in git has a terminology problem.

**Terms users consistently find confusing or misleading:**

| Term | Why It Fails |
|------|-------------|
| `HEAD` | Sounds technical/internal; capitalized like a constant; means "current commit/branch" which is actually simple |
| `heads` (as in refs/heads/) | "heads" are branches — why not just call them branches? |
| Detached HEAD | Anatomical horror metaphor for a normal operational state |
| `origin` | Arbitrary conventional name that sounds like "the original" but is just a remote alias; breaks people's mental model when forking |
| `upstream` | Used in 3 different ways: (1) the remote a branch tracks, (2) the original repo you forked from, (3) an alias for push.default setting. Same word, wildly different meanings in context. |
| `fast-forward` | A VHS metaphor. What does tape playback have to do with merging code? |
| `index` / `staging area` / `cached` | Three names for one thing; `--cached` and `--staged` are synonyms; `--index` is different from `--cached` |
| `reset` / `revert` / `restore` | Three words that all sound like "undo" but do entirely different things |
| `checkout` | Does 3 different things: switch branch, restore file, detach HEAD |
| `remote-tracking branch` | Local reference to last known state of remote — deeply confusing name |
| `refspec` | The `+refs/heads/main:refs/remotes/origin/main` thing in config — essentially undocumented for 99% of users |
| `tree-ish` | Man page jargon meaning "a commit or reference to a commit" — why not just say that? |
| `ours` / `theirs` during rebase | Counterintuitively reversed vs. merge — `ours` is the branch you're rebasing onto, not your branch |
| `HEAD~` vs `HEAD^` | Both mean "parent" most of the time; differ only for merge commits; most users don't know the difference exists |
| `..` vs `...` | Different in `git log` vs `git diff`; the meaning flips depending on the command |
| `cherry-pick` | Whimsical metaphor that doesn't communicate "apply this commit's changes to current branch" |
| `stash` | Relatively clear, but "stash" has a pop/apply distinction users constantly confuse |
| `Working tree is clean` | Means "nothing staged and no modifications" — "clean" obscures what's being tested |
| `Your branch is up to date with 'origin/main'` | Misleadingly implies you're actually up to date; actually means "as of your last fetch" |

### 2.2 The "Upstream" Problem in Detail

The word "upstream" has three completely incompatible meanings in git's ecosystem:

1. **Tracking upstream**: `git branch --set-upstream-to=origin/main` — the remote branch a local branch is configured to track
2. **Fork upstream**: GitHub/community convention to name the original repo `upstream` when you've forked it
3. **Push.default "upstream"**: A push.default setting (renamed from "tracking" to "upstream" in git 2.0)

From a developer's blog:
> *"I find the term upstream confusing. GitHub help recommends: 'to keep track of the original repo [you forked from], you need to add another remote named upstream.' So when someone says to push upstream, it's ambiguous. I'm not sure if this usage is typical of Git in general or just GitHub, but it sure left me confused for a while."*

### 2.3 The "Ours/Theirs" Inversion Bug

This is documented widely as a recurring source of merge conflict mistakes:

**During a merge:**
- `ours` = current branch (what you're merging into)
- `theirs` = branch being merged in

**During a rebase:**
- `ours` = target branch (what you're rebasing onto)
- `theirs` = your current branch (what you're rebasing)

This is backwards from what users expect. During rebase, "my stuff" is "theirs." The reason is a valid internal one (rebase works by merging commits onto a copy of the target), but the external consequence is that users resolving conflicts during rebase consistently pick the wrong side.

VSCode tried to fix this by renaming them to "Current Change" and "Incoming Change" — and users report it is "confusing in the exact same way."

---

## PART 3: THE FOUR-LOCATION CONFUSION

### 3.1 The Core Problem Statement

From HighFlux's analysis:
> *"When I'm working on a file, I mostly think about 'my' version (what I'm working on in my editor) and 'the team's' version (what the file looks like on GitHub). Unfortunately, git has two more versions that I need to keep in mind: the one in the 'index' (or 'staging area') and the one in the HEAD commit in my local repository."*

Users have a 2-location mental model. Git has a 4-location reality.

```
User's mental model:
  MY VERSION ←————————————————→ TEAM'S VERSION

Git's actual model:
  Working Tree → Index → Local Repo → Remote Repo
  (editor)       (staged)  (committed)  (pushed)
```

This explains why beginners are perpetually confused about `add` vs `commit` vs `push`. From the user's perspective, these are all just "saving my work." From git's perspective, they are three separate operations against three separate locations.

### 3.2 The Three-Step Tax

Every single file change requires **three separate commands** before it reaches the team:

```bash
git add file.txt          # working tree → index
git commit -m "message"   # index → local repo  
git push                  # local repo → remote
```

This three-step process exists for powerful reasons (atomic staging, local history before sharing). But for the vast majority of everyday operations, it is pure tax. The user's intent is "share my changes." The required sequence is designed around git's internals.

### 3.3 How "Diverged" Happens (The Core Sync Problem)

The most common real-world git emergency, generating thousands of Stack Overflow posts:

```
Your branch and 'origin/main' have diverged,
and have 2 and 3 different commits each, respectively.
```

This happens because:

1. Local repo and remote repo are **separate repositories** that synchronize explicitly
2. Users forget this, or don't know it
3. Meanwhile, the remote gets commits (from teammates, CI, GitHub UI edits, etc.)
4. The local repo gets commits from the user's work
5. They're now two different histories

What makes this hard to recover from:
- The error message requires understanding "fast-forward" to interpret
- The solution depends on intent (merge vs rebase vs reset vs force push)
- Each solution has different implications for teammates
- There is no single right answer — it depends on team workflow

From Julia Evans:
> *"If you git pull when my branches have diverged, I get this error message:*
> ```
> hint: You have divergent branches and need to specify how to reconcile them.
> hint: git config pull.rebase false  # merge
> hint: git config pull.rebase true   # rebase  
> hint: git config pull.ff only       # fast-forward only
> ```
> *There's no single clear way to handle it — what you need to do depends on the situation and your git workflow."*

The error message itself represents the problem: git asks users to make an architectural decision (rebase vs merge policy) to resolve what feels like a routine sync operation.

---

## PART 4: THE INCONSISTENT COMMAND API

### 4.1 The `git checkout` Problem

`git checkout` is git's most confusing command because it does three completely unrelated things:

**Use 1: Switch branches**
```bash
git checkout main
```

**Use 2: Restore a file from history (discard working changes)**
```bash
git checkout -- file.txt
```
*(The `--` is required to prevent git from thinking the filename is a branch name)*

**Use 3: Detach HEAD (time-travel to a specific commit)**
```bash
git checkout abc123f
```

The third form silently puts users in "detached HEAD state" — a mode where commits they make are orphaned. Users doing innocent historical exploration (`git checkout v1.0.0`) can accidentally leave uncommitted work floating in the void.

From a teaching post by software carpentry:
> *"I feel that git checkout is very confusing for learners and could probably be skipped. Here are the main arguments against it: confusing, dangerous (detached head mess), not-so-useful, replaceable."*

**Git's own acknowledgment:** In 2019, git shipped `git switch` and `git restore` specifically to split checkout's responsibilities. But this created a new problem: now there are *more commands to learn*, and the old command still works, so tutorials contradict each other.

### 4.2 The `git reset` Problem

`git reset` has three modes that do fundamentally different things:

```bash
git reset --soft HEAD~1   # undo commit, keep changes staged
git reset --mixed HEAD~1  # undo commit, unstage changes (default)
git reset --hard HEAD~1   # undo commit, DESTROY changes
```

The `--hard` flag is the one that destroys work. It's one word away from the safer versions. There is no confirmation prompt. There is no warning that this is irreversible.

From Steve Bennett's "10 things I hate about git":
> *"The various options of 'git reset' do completely different things."*

A 2022 survey of 4,000+ developers found: **"accidentally losing work" is the most common source of frustration with git.** `git reset --hard` and `git clean -fd` are the most frequent causes.

### 4.3 The `reset`/`revert`/`restore` Disambiguation Failure

Three words that all sound like "undo":

| Command | What it actually does |
|---------|----------------------|
| `git reset` | Moves HEAD (and optionally the index/working tree) — modifies history |
| `git revert` | Creates a new commit that undoes a previous commit — preserves history |
| `git restore` | Restores files in working tree or index — doesn't touch commits |

Users regularly use these interchangeably because they all sound like "undo." The consequences range from benign (git revert instead of git reset — history is just noisier) to catastrophic (git reset --hard instead of git restore — changes destroyed).

### 4.4 The `..` vs `...` Flip Problem

```bash
git log main..feature    # commits IN feature NOT IN main
git log main...feature   # commits in either, NOT in both

git diff main..feature   # diff the tips of both branches  
git diff main...feature  # diff feature against common ancestor
```

The same syntax (`..` vs `...`) means the OPPOSITE thing depending on whether you're using it with `log` or `diff`. This is documented in the manual pages but understood by almost no one.

### 4.5 Commands That Changed Meaning

| Old command | Problem | New command |
|-------------|---------|-------------|
| `git checkout branch` | Also does file restore, detach | `git switch branch` |
| `git checkout -- file` | Confusing `--` syntax | `git restore file` |
| `git branch -d` | Doesn't tell you why delete fails | Same, but more confusing |
| `git pull` | Secretly merges OR rebases depending on config | Depends on configuration set up |

The proliferation of commands to solve command confusion is itself a source of confusion: new developers in 2024 encounter tutorials using `checkout`, `switch`, `restore` interchangeably, with no clear answer about which is "correct."

---

## PART 5: THE RECOVERY PARADOX

### 5.1 The Discovery Problem

From ohshitgit.com (translated into 28 languages, 5M+ visitors):
> *"Git is hard: screwing up is easy, and figuring out how to fix your mistakes is fucking impossible. Git documentation has this chicken and egg problem where you can't search for how to get yourself out of a mess, unless you already know the name of the thing you need to know about in order to fix your problem."*

This is the sharpest articulation of git's core UX failure: **the recovery vocabulary is opaque.** To find help, you must already know the vocabulary. To know the vocabulary, you must have already learned git. To learn git, you must survive the errors.

### 5.2 The Real Scenarios People Encounter (Direct from ohshitgit.com)

Every single one of these is a common, real-world situation:

1. "I committed something to main that should have been on a new branch"
2. "I committed to the wrong branch"
3. "I ran `diff` but nothing happened" *(answer: you staged the files, need `--cached`)*
4. "I need to undo a commit from 5 commits ago"
5. "I need to undo changes to just one file"
6. "I did something terribly wrong, I don't know what, please help"
7. "I need to change the message on my last commit"
8. "I committed and realized I need to make one small change"
9. "I need to nuke everything and start from the remote"

For item 6, the answer is `git reflog` — but almost nobody knows `reflog` exists until they're already in trouble. The safety net is invisible.

### 5.3 The Reflog Gap

`git reflog` is one of the most powerful recovery tools in git. It records every HEAD movement in the repository. Nearly anything can be recovered from it within ~90 days.

**The problem:** it's barely documented in any tutorial, it doesn't appear in any beginner guide, and developers only discover it after a catastrophe.

> *"Many developers are unaware of reflog's existence, missing out on a powerful tool for recovering lost commits or understanding changes in the repository."* — GeeksforGeeks

The reflog gap represents a systematic UX failure: a safety net exists but is invisible. The terrified user deleting their entire repo and recloning ("the nuclear option," memorialized in ohshitgit.com) doesn't know that recovery was trivial.

### 5.4 The Undo Decision Tree

When users want to "undo something" in git, they face a decision tree they don't know exists:

```
What do I want to undo?
│
├── Not committed yet?
│   ├── Staged changes → git restore --staged (or git reset HEAD)
│   └── Unstaged changes → git restore (DESTROYS WORK)
│
├── Committed locally, not pushed?
│   ├── Want to keep changes → git reset --soft HEAD~
│   ├── Want to unstage changes → git reset HEAD~  
│   └── Want to destroy changes → git reset --hard HEAD~
│
├── Committed and pushed?
│   ├── Safe (creates new commit) → git revert <sha>
│   └── Dangerous (rewrites history) → git push --force
│
└── A specific file only?
    └── git restore --source=<commit> <file>
```

Users have no idea this decision tree exists. They search "how to undo git commit" and get different answers depending on which article Google shows first — some of which are dangerous and some safe.

### 5.5 The Force Push Culture of Fear

`git push --force` is among the most feared commands in git. The fear is partially warranted: force pushing to a shared branch can destroy teammates' work.

But:
- `--force-with-lease` is a much safer alternative that almost nobody knows
- Force pushing to your own feature branch (after rebase) is perfectly fine and often necessary
- The fear means many developers never rebase, accumulate messy histories, and develop workarounds

The UX failure: there's a dangerous tool (`--force`) and a safe alternative (`--force-with-lease`), but the dangerous one is shorter and therefore more likely to be used.

---

## PART 6: THE NON-PROGRAMMER BARRIER

### 6.1 The Assumption of Programming Fluency

Git's documentation, error messages, and community resources assume:
- Familiarity with the command line
- Understanding of file system paths
- Experience with version control concepts
- Patience for technical documentation

None of these are universal. Writers, designers, data scientists, project managers, legal teams, and academic researchers all have legitimate use cases for git, and all face the same vocabulary wall.

From a programmer teaching git to artists:
> *"I have had a hard time finding resources to jump-start someone into git. When I do find a tutorial, they often assume technical understanding above my peers. Or the tutorial gets right into the meat of HOW to use it, but never explains WHY to use it, or WHAT is going on in the background."*

### 6.2 The "This Should Be Simple" Experience

What users actually want to do, in plain language:

```
"Save my work" → requires: git add + git commit
"Share my work" → requires: git add + git commit + git push  
"Get my teammate's work" → requires: git fetch + git merge (or git pull)
"Try something without breaking things" → requires: understand branches
"Undo my last change" → requires: understand which of 10 undo commands applies
"See what changed" → requires: understand diff vs status vs log
```

The gap between "what the user wants to say" and "what git requires them to type" is the core product problem.

### 6.3 The Google Doc Comparison (Recurring in the Wild)

Across dozens of articles, the same comparison appears independently:

> *"What if code version management was like collaborating in a Google Doc? That would be nice and easy for everyone to understand."*

Google Docs has solved real-time collaboration, version history, and access control for billions of non-technical users. The same underlying problem. The dramatically different UX.

Git solves a harder problem (offline-first, distributed, code-centric, merge-conflict-capable), but the UX gap reveals that much of git's complexity is *accidental* rather than *inherent*.

---

## PART 7: AI AGENT FAILURE PATTERNS

### 7.1 How AI Agents Fail with Git

AI coding agents face a superset of human git problems, plus unique failure modes:

**Human problems that also affect agents:**
- Misunderstanding the current branch state
- Operating on wrong branches (the agent equivalent of "committed to main")
- Push rejections due to diverged branches
- Force-push operations that destroy others' work

**Agent-specific failure patterns:**

1. **Permanent mistake commits**: Agents commit intermediate debugging states, failed experiments, and "thinking out loud" commits that pollute history. From Simon Willison's *Agentic Engineering Patterns*: "Permanently recording mistakes and cancelled directions can sometimes be useful, but repository authors can make editorial decisions about what to keep."

2. **State blindness**: Agents can't easily feel "something is wrong here" the way humans notice a weird interface state. They execute commands, get unexpected output, and may not recognize the significance.

3. **In-progress state pollution**: If an agent starts a rebase or merge and fails mid-operation, the repository is left in an intermediate state (`.git/REBASE_HEAD`, `.git/MERGE_HEAD`) that subsequent commands fail on in confusing ways.

4. **Branch confusion under automation**: When multiple agents operate on the same repo, branch naming, concurrent pushes, and racing creates conflicts that neither human nor automated systems handle gracefully.

5. **The "commit everything" instinct**: Agents frequently `git add .` and commit everything in the working directory, including build artifacts, environment files, IDE settings — the same mistake beginners make, but worse because agents work faster.

### 7.2 What Agents Need That Git Doesn't Provide

From analysis of AI agent git usage:

- **Atomic, declarative operations**: "Make the repo look like X" instead of "run these 4 commands in order"
- **Safe-by-default commands**: Force push with lease, not force push
- **State verification before action**: "Am I on the right branch? Is the tree clean? Is remote up to date?" as pre-flight checks
- **Structured error information**: Machine-parseable error output, not human-readable prose
- **Transaction semantics**: "Do all of this or none of it"
- **Rollback capability**: "This operation failed mid-way; restore to pre-operation state"

GitHub's own guidance for AI agents (from their 2,500-repository agents.md analysis) identifies **git workflow** as one of six core areas agents need explicit instructions on — because agents reliably make git mistakes without them.

### 7.3 The Compounding Error Problem

From Stack Overflow's research on AI coding agents (2025):
> *"We're past the days of code completion. People are using AI agents and running them autonomously now, sometimes for very long periods of time. Any mistakes — hallucinations, errors in context, even slight missteps — compound over the running time of the agent. By the end, those mistakes are baked into the code."*

Git's lack of guardrails means agent mistakes aren't just point failures — they accumulate in history, in branch state, and in remote repositories.

---

## PART 8: THE PATTERN CATALOG

### 8.1 The 15 Most Common Git Emergencies

Compiled from ohshitgit.com, Stack Overflow, developer surveys, and tutorial themes. These are the situations people actually get into, ranked by frequency:

1. **Committed to main instead of a branch** — Nearly universal beginner/distracted developer failure
2. **Push rejected (non-fast-forward)** — After rebasing, amending, or diverging from remote
3. **Branches have diverged** — After teammate pushed while you were working
4. **Committed wrong/incomplete changes** — Need to amend the last commit
5. **Merge conflict, confused about resolution** — Don't understand ours/theirs or conflict markers
6. **Wrong branch during commit** — Committed to feature-A when on feature-B
7. **Staged everything accidentally** — `git add .` caught files that shouldn't be committed
8. **Committed sensitive data** — API keys, passwords, `.env` files
9. **Lost commits after reset --hard** — Destroyed work with destructive reset
10. **Detached HEAD confusion** — Wandered into detached state, don't know how to get back
11. **Can't diff staged files** — Need `git diff --cached`, don't know it
12. **git pull fails with diverged error** — Unclear which reconciliation strategy to use
13. **Interactive rebase went wrong** — Dropped commits, squashed wrong things
14. **Accidentally deleted a branch** — Need to recover from reflog
15. **git stash pop caused conflicts** — Applied stash to wrong branch or conflicting state

### 8.2 The Anti-Pattern Hall of Fame

Patterns that recur in codebases and developer horror stories:

| Anti-Pattern | Root Cause | Impact |
|-------------|-----------|--------|
| Committing directly to main | No branch workflow understanding | Team disruption, deployment risk |
| WIP/misc/update commit messages | Don't understand commit's role in history | Unusable history, hard blame/bisect |
| Giant multi-purpose commits | `git add .` habit | Hard to revert, review, cherry-pick |
| `node_modules` / `.env` in repo | No .gitignore discipline | Repo bloat, security exposure |
| `git push --force` on shared branches | Fear vs knowledge | Destroyed teammate work |
| Never pulling before pushing | Not understanding distributed model | Diverged branches, rejected pushes |
| Rebasing shared branches | Rebase misunderstanding | Duplicate commits, confused history |
| Nuclear reclone | Unknown recovery path | Wasted time, lost local changes |
| Copy-pasting commands without understanding | Stack Overflow cargo-culting | Unpredictable failures |
| Using the wrong git account | SSH key / config confusion | Commits attributed to wrong identity |

### 8.3 What Users Actually Search For (The Real Vocabulary)

When users are in trouble, here's how they describe their problem. Contrast with the git vocabulary required:

| User's Natural Language | Required Git Vocabulary |
|------------------------|------------------------|
| "Undo my last commit" | `git reset --soft HEAD~` or `git revert HEAD` |
| "Go back to yesterday" | `git checkout <commit>`, `git reflog`, `git reset` |
| "My push didn't work" | non-fast-forward error, diverged branches, force push |
| "My branches are out of sync" | diverged, rebase, merge, fast-forward |
| "Get the latest from GitHub" | `git pull`, `git fetch` + `git merge` |
| "Save my work without committing" | `git stash` |
| "I'm in a weird state" | detached HEAD, merge in progress, rebase in progress |
| "See what changed" | `git diff`, `git status`, `git log` — different tools for different questions |
| "Move a commit to a different branch" | `git cherry-pick`, then `git reset` from original |
| "Remove a file from git but keep it locally" | `git rm --cached` |

The gulf between "user intent vocabulary" and "git command vocabulary" is the entire design problem.

---

## PART 9: THE "PLACES MODEL" — WHERE CONFUSION LIVES

The most useful mental model for understanding git confusion was articulated in a 2014 blog post:

> *"One of the reasons why going from the SVN model to the Git model can be so complicated comes from the fact that there are many more places for source to exist."*

```
SVN User's World:
┌─────────────────┐           ┌─────────────────┐
│   My Machine    │ ←commit→  │     Server      │
└─────────────────┘           └─────────────────┘

Git User's World:
┌────────────────────────────────────────────────┐
│                  My Machine                    │
│  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │
│  │ Working  │  │  Index   │  │  Local Repo │  │
│  │  Tree   │→│(Staging) │→│  (.git/)    │  │
│  └──────────┘  └──────────┘  └──────┬──────┘  │
└─────────────────────────────────────│──────────┘
                                      │ push/pull
┌─────────────────────────────────────│──────────┐
│             Remote (GitHub)         │          │
│  ┌──────────────────────────────────▼──────┐   │
│  │              Remote Repo                │   │
│  └─────────────────────────────────────────┘   │
└────────────────────────────────────────────────┘
```

Every git command is essentially an operation that moves data between these locations. Understanding *which* locations a command touches is the entire skill of using git. But this is nowhere in the basic documentation, and the commands don't make it obvious.

---

## PART 10: DESIGN PRINCIPLES FOR A BETTER LAYER

Based on the research, a better git UX layer should be guided by these principles:

### Principle 1: Express User Intent, Not Git Operations
Users think in terms of: save, share, get, undo, branch, see history. The layer should speak that language and translate to git commands internally.

### Principle 2: Make the State Visible
The biggest source of errors is operating in the wrong state. The UI should always show: current branch, sync status with remote, working tree state, and any in-progress operations.

### Principle 3: Opinionated Defaults, Escapable
Pick one way to do things (e.g., rebase-based workflow). Make it the default. Make it easy to diverge when needed. Don't present all 10 undo options — present the right one for the situation.

### Principle 4: Progressive Disclosure
Show beginners 5 operations. Show intermediate users 15. Expert mode exposes everything. The full git power is always there, just not in the face of someone who just wants to save and push.

### Principle 5: Describe Consequences, Not Mechanisms
"This will overwrite remote history. 2 commits will be deleted from the shared branch. Your teammates will need to update their copies." Not: "this will force push."

### Principle 6: Pre-flight Checks
Before destructive operations, check: are you on the right branch? Is anyone else likely to have this branch? Are there uncommitted changes? The answers should gate the operation.

### Principle 7: Graceful State Recovery
When the repo is in an intermediate state (merging, rebasing, detached HEAD), the UI should explain what happened and offer clear "continue" or "abort" paths — not leave users staring at cryptic error messages.

### Principle 8: Human-Readable History
The reflog and commit log should be readable without git expertise. "3 hours ago you amended a commit, before that you merged feature/auth" — not raw SHA hashes.

### Principle 9: The Safety Net Should Be Visible
The reflog's existence and contents should be surfaced prominently as "recent actions you can undo." The idea that almost nothing is truly destroyed should be the first thing users learn, not the last.

### Principle 10: Agent-Safe by Default
For AI agents, every operation should check state, verify branch, prefer non-destructive alternatives, commit atomically, and report in machine-parseable formats.

---

## APPENDIX A: COMMUNITY QUOTES ARCHIVE

*Direct quotes from real users, for reference in design work:*

**On the fundamental problem:**
> *"In git the regularly used simple things are hard and the seldomly used hard things are simple."*

> *"git is about version control; in nutshell it's just check in and check out. It becomes more difficult than it sounds is because people want to do things in different ways."*

> *"The fact of the matter is that Git is incredibly powerful but also complex and hard to learn. This isn't a bash on Git at all. It's ok! Sometimes complicated things are just that, complicated."*

**On the learning curve:**
> *"I thought git was about branches? 'Oh no good lord, branches are evil my dear.' Ok then, so how does this git thing work…"*

> *"Most people learn Git through years of trial and error or copying and pasting commands from Stack Overflow and ChatGPT."*

> *"Once I encountered anything outside [a] super basic flow, I fell apart."*

**On documentation:**
> *"If you're brand new to Git, I just tell people to read through git-scm.com/book/en/v2 and do what it says. I don't find Git very hard... but then again, I may have survivorship bias."*

> *"I remember thinking the same when I started with Git. Sometimes I think I should take a course on it."*

**On commands:**
> *"The command line syntax is completely arbitrary and inconsistent."*

> *"It even uses different words for the same thing — sometimes remove, sometimes rm, sometimes -d."*

> *"Common actions often require obscure command lines, like 'make a new branch' which is `git checkout -b` instead of just 'git branch'."*

> *"On what fucking planet does `checkout --` make sense as the best way to undo a file?"* — ohshitgit.com

**On the mental model problem:**
> *"Using Git is like drawing a vector image on the screen using graphic commands such as LineTo, Point, etc."*

> *"The single thing that made everything 'click' together is that most things are just pointers to commits: branch names, HEAD, tags, all of them are pointers."*

**On rescue:**
> *"You can use this to get back stuff you accidentally deleted, or just to remove some stuff you tried that broke the repo... I use reflog A LOT."*

> *"I also knew it was time for me to actually understand how to use Git."*

---

## APPENDIX B: KEY SOURCES

- **ohshitgit.com** — Katie Sylor-Miller's catalog of git disasters and fixes; 5M+ visitors, translated into 28 languages. The most popular single git troubleshooting resource on the internet.
- **Julia Evans, "Confusing git terminology"** (jvns.ca, 2023) — Community survey of confusing terminology; comprehensive first-person catalog.
- **Julia Evans, "Dealing with diverged git branches"** (jvns.ca, 2024) — Detailed analysis of the most common sync problem.
- **Steve Bennett, "10 things I hate about git"** (2012) — Still the most comprehensive UX critique.
- **HighFlux, "What makes Git hard to use"** (2022) — Four-location analysis.
- **Atlassian, "Merging vs. Rebasing"** — Industry-standard explanation of the merge/rebase tradeoff.
- **Mark Longair, "The most confusing git terminology"** — Deep dive on "upstream" ambiguity.
- **Simon Willison, "Using Git with coding agents"** — Current state of AI agent + git integration.
- **Stack Overflow, "Are bugs and incidents inevitable with AI coding agents?"** (2025) — Data on AI agent git failure modes.
- **GitHub Blog, "How to write a great agents.md"** (2025) — Git workflow as a required agent constraint.
- **Changelog.com, "Git is simply too hard"** — Community thread with dozens of first-person testimonies.
- **The "Places Model" blog post** (merrigrove.blogspot.com, 2014) — Best conceptual frame for why git confuses SVN users.

---

*This document is living research. Add to it as you encounter new patterns, new user quotes, or new failure modes from AI agents.*
