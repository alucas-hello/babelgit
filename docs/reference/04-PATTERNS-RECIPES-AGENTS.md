# THE GIT BIBLE
## Part 4: Patterns, Anti-Patterns, Recipes & AI Agent Guidance

> *The difference between a git master and a novice is not knowing more commands — it's knowing which command to never run.*

---

## Table of Contents
1. [The Golden Rules](#the-golden-rules)
2. [Power Recipes](#power-recipes)
3. [Common Anti-Patterns](#common-anti-patterns)
4. [Aliases: The Essential Collection](#aliases-the-essential-collection)
5. [Scripting Git Safely](#scripting-git-safely)
6. [AI Agent Git Guidance](#ai-agent-git-guidance)
7. [Disaster Recovery Handbook](#disaster-recovery-handbook)
8. [Repository Hygiene](#repository-hygiene)
9. [Commit Message Mastery](#commit-message-mastery)
10. [The Decision Trees](#the-decision-trees)

---

## The Golden Rules

### Rule 1: Never Rewrite Shared History

```
SAFE to rewrite (local or solo branch):
  - git commit --amend (not yet pushed)
  - git rebase -i (not yet pushed)
  - git reset (local commits)

DANGEROUS (rewrites public history):
  - git push --force on main/master
  - git rebase after pushing
  - git filter-branch on pushed history

SAFER force push when necessary:
  - git push --force-with-lease (checks remote hasn't changed)
  - ALWAYS tell your team first
  - NEVER on protected/main branches
```

### Rule 2: Commits Should Be Atomic

One commit = one logical change. Each commit should:
- Build without errors
- Pass all tests
- Be understandable in isolation
- Be revertable without breaking other things

### Rule 3: Main/Master Is Sacred

The main branch should always be deployable. Enforce:
- Branch protection rules on the server
- Require PR review before merge
- Require CI to pass
- Disallow direct pushes
- Disallow force pushes

### Rule 4: Write Commit Messages for Your Future Self

Six months from now, you won't remember. Your message should answer:
- **What** changed?
- **Why** it was changed?
- **How** to understand the change?

### Rule 5: Fetch Before You Branch

```bash
git fetch --prune      # always before creating branches or starting work
git switch -c feature  # now from an up-to-date base
```

### Rule 6: Small Branches Live Fast, Die Young

The longer a branch lives, the more divergent it becomes from main, and the harder it merges. Target: branches merged within 1-3 days.

---

## Power Recipes

### Finding Things

```bash
# Find the commit that introduced a string
git log -S "the_function_name" --all --source

# Find all commits touching a file (even if renamed)
git log --follow --all -- path/to/file.py

# Find which branches contain a commit
git branch --all --contains <sha>
git tag --contains <sha>

# Find commits that are in one branch but not another
git log main..feature               # in feature, not main
git log feature..main               # in main, not feature
git log --left-right --oneline main...feature  # symmetric difference

# Find when a line was added (even if now deleted)
git log -S "exact line content" --all

# Find deleted files
git log --all --full-history -- "**/filename.py"

# Find the merge commit that merged a feature branch
git log --merges --ancestry-path feature..main | head -1

# Find the root commit (first commit ever)
git rev-list --max-parents=0 HEAD

# Find all commits with no children (tips)
git branch -a --format='%(objectname)' | sort -u

# Search commit messages with grep
git log --all --oneline --grep="TICKET-123"

# Find large files in history
git rev-list --objects --all | \
  git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' | \
  awk '/^blob/ {print substr($0,6)}' | \
  sort --numeric-sort --key=2 | \
  tail -20 | \
  cut -c 1-12,42-
```

### Cleaning Things Up

```bash
# Interactive rebase last N commits
git rebase -i HEAD~5

# Squash everything since branching from main
git rebase -i $(git merge-base HEAD main)

# Edit older commits without interactive rebase
git rebase -i HEAD~5
# Mark commit as 'e' (edit)
# make changes
git commit --amend --no-edit
git rebase --continue

# Remove a file from ALL history (use git-filter-repo instead)
git filter-repo --path secret.env --invert-paths

# Clean up merged branches (local)
git branch --merged main | grep -v "main\|master\|develop" | xargs git branch -d

# Clean up merged branches (remote)
git fetch --prune
git branch -r --merged main | grep -v "main\|master\|develop" | \
  sed 's/origin\///' | xargs -I {} git push origin --delete {}

# Remove all untracked files and directories (DANGEROUS)
git clean -fdx    # -f=force, -d=dirs, -x=ignored too
git clean -fdn    # dry run first!

# Reset hard to remote state (DANGEROUS)
git fetch origin
git reset --hard origin/main

# Completely nuclear: repo to clean state matching remote
git fetch --all
git reset --hard origin/main
git clean -fdx
```

### Branching Patterns

```bash
# Create branch and push in one step
git switch -c feature/my-feature
git push -u origin HEAD               # push current branch

# Rename branch everywhere
OLD=old-name
NEW=new-name
git branch -m $OLD $NEW
git push origin :$OLD $NEW
git push origin -u $NEW

# Create orphan branch (no history - useful for gh-pages)
git switch --orphan gh-pages
git rm -rf .
echo "Hello" > index.html
git add .
git commit -m "Initial gh-pages"

# Sync fork with upstream
git fetch upstream
git switch main
git merge upstream/main
git push origin main

# Stacked branches (dependent PRs)
git switch -c base-feature
# ... make changes ...
git switch -c extension-feature    # branches from base-feature
# ... make changes ...
# When base-feature is merged to main:
git switch extension-feature
git rebase --onto main base-feature extension-feature

# Create branch from a specific state in reflog
git branch recovery HEAD@{10}
```

### Patching and Applying Changes

```bash
# Create patch from last 3 commits
git format-patch HEAD~3

# Create patch from specific commit
git format-patch -1 <sha>

# Apply patch (with tracking)
git am < patch-file.patch
git am *.patch

# Apply patch (without commit metadata)
git apply patch-file.patch

# Cherry-pick range from another repo
git remote add other /path/to/other/repo
git fetch other
git cherry-pick other/main~5..other/main

# Apply changes from another branch without committing
git diff main..feature | git apply --index
```

### Working with Remotes

```bash
# Add multiple push remotes
git remote set-url --add origin git@gitlab.com:user/repo.git
git push                           # pushes to both GitHub and GitLab

# Fetch from all configured remotes
git fetch --all --prune

# Track remote branch
git branch --set-upstream-to=origin/main main
git branch -u origin/feature feature

# Compare local with remote without fetching
git fetch origin
git diff HEAD origin/main          # what's on remote we don't have
git diff origin/main HEAD          # what we have that remote doesn't

# Push to multiple remotes simultaneously
git remote | xargs -I {} git push {}

# Mirror repo to another remote
git push --mirror backup-remote
```

### Rewriting History

```bash
# Change author of last commit
git commit --amend --author="Name <email>" --no-edit

# Change author of multiple commits (use filter-repo for better approach)
git rebase -i HEAD~5
# For each commit, mark 'e', then:
git commit --amend --author="New Name <new@email.com>" --no-edit
git rebase --continue

# Split a commit into multiple
git rebase -i HEAD~3
# Mark the commit as 'e'
git reset HEAD~           # unstage the commit's changes
git add -p                # stage first logical unit
git commit -m "first part"
git add -p                # stage second logical unit
git commit -m "second part"
git rebase --continue

# Insert a commit between two existing commits
git rebase -i HEAD~3
# Mark commit BEFORE the insertion point as 'e'
git add -p                # stage your new changes
git commit -m "inserted commit"
git rebase --continue

# Change oldest commit message
git rebase -i --root      # interactive rebase from the very beginning
# Mark first commit as 'r' (reword)

# Remove sensitive data (proper way)
# Install git-filter-repo first
git filter-repo --path secret.key --invert-paths
git filter-repo --replace-text <(echo "password123==>REDACTED")
```

### Inspecting State

```bash
# Full state of working tree and index
git status -uall -vv

# What exactly is staged?
git diff --cached

# What changed in last N commits (full diff)
git show HEAD~3..HEAD

# Who changed what line (blame with context)
git blame -C -C -C -L 50,80 file.py     # detect moves across all files

# Show all changes to a function
git log -p -L :my_function:file.py

# All commits on this branch not in main
git log --oneline main..HEAD

# Interdiff: how a commit changes between two rebases
git range-diff origin/main old-branch new-branch

# Show what would happen on merge
git merge --no-commit --no-ff branch
git diff --cached                    # review the merge result
git merge --abort                    # clean up

# Find the merge base
git merge-base HEAD main
git merge-base --is-ancestor main HEAD && echo "main is ancestor"

# Show all stashes as patches
git stash list | awk '{print $1}' | sed 's/://' | xargs -I {} git stash show -p {}
```

---

## Common Anti-Patterns

### ❌ `git push --force` on shared branches

```bash
# WRONG
git push --force origin main

# RIGHT: use --force-with-lease
git push --force-with-lease origin feature-branch
# RIGHT: only force push to your own branches, never shared ones
```

### ❌ Committing directly to main

```bash
# WRONG
git switch main
git add feature.py
git commit -m "added feature"
git push

# RIGHT: always use branches
git switch -c feature/my-feature
git add feature.py
git commit -m "feat: add my feature"
git push -u origin HEAD
# then open PR
```

### ❌ Giant commits ("WIP" / "misc fixes")

```bash
# WRONG
git add .
git commit -m "WIP"
git add .
git commit -m "stuff"

# RIGHT: stage and commit logically
git add -p               # interactive: choose related hunks
git commit -m "fix: resolve null pointer in user auth"
```

### ❌ Committing generated files, dependencies, secrets

```bash
# WRONG: committed node_modules, .env, *.pyc

# RIGHT: maintain .gitignore
# .gitignore:
node_modules/
.env
*.pyc
__pycache__/
.DS_Store
*.log
dist/
build/

# If you accidentally committed something:
git rm -r --cached node_modules
git commit -m "chore: remove node_modules from tracking"
echo "node_modules/" >> .gitignore
git add .gitignore
git commit -m "chore: add node_modules to gitignore"
```

### ❌ `git reset --hard` without checking reflog

```bash
# WRONG: lost work
git reset --hard HEAD~5

# RIGHT: check what you're about to do
git log --oneline HEAD~5..HEAD  # see what you'll lose
git reflog                       # always recoverable within 90 days
```

### ❌ Rebase on a public branch

```bash
# WRONG: rebasing main that others have pulled
git switch main
git rebase feature    # rewrites main history

# RIGHT: merge instead (or only rebase feature onto main)
git switch feature
git rebase main       # rewrite feature (private) onto main (public)
```

### ❌ Using `git checkout` for everything

```bash
# CONFUSING (old style)
git checkout feature          # switch branch
git checkout -- file.txt      # discard file changes
git checkout HEAD~5 -- file.txt  # restore file from history

# CLEAR (modern)
git switch feature             # switch branch
git restore file.txt           # discard file changes
git restore --source=HEAD~5 file.txt  # restore from history
```

### ❌ Not pruning remote tracking branches

```bash
# WRONG: stale remote refs accumulate
git fetch

# RIGHT
git fetch --prune
# or configure permanently:
git config --global fetch.prune true
```

### ❌ `git add .` in the wrong directory

```bash
# RISKY: stages everything including junk
git add .

# BETTER: be explicit
git add src/feature.py tests/test_feature.py

# OR: use interactive staging
git add -p    # review every change before staging
```

---

## Aliases: The Essential Collection

Add to `~/.gitconfig`:

```ini
[alias]
  # Navigation
  st = status -sb
  co = checkout
  sw = switch
  br = branch

  # Logging
  lg = log --oneline --graph --decorate --all
  ll = log --oneline --decorate
  lp = log --oneline --decorate --graph
  la = log --oneline --decorate --all --graph
  hist = log --pretty=format:'%C(yellow)%h%Creset %C(bold blue)%an%Creset %C(green)%ar%Creset %s %C(red)%d%Creset' --graph --all
  last = log -1 HEAD --stat
  changes = log --oneline --reverse
  
  # Diff
  dc = diff --cached
  ds = diff --staged
  dw = diff --word-diff
  dp = diff --patch
  
  # Commit shortcuts
  ci = commit
  ca = commit --amend
  can = commit --amend --no-edit
  cm = commit -m
  cam = commit -am
  fixup = commit --fixup
  squash = commit --squash
  
  # Branch management  
  branches = branch -vvla
  recent = for-each-ref --sort=-committerdate --format='%(refname:short)' refs/heads/ --count=10
  merged-branches = branch --merged main
  
  # Remote
  publish = push -u origin HEAD
  unpublish = push origin --delete
  
  # Reset helpers
  unstage = restore --staged
  discard = restore
  uncommit = reset --soft HEAD~
  
  # Stash
  save = stash push -u
  pop = stash pop
  
  # Inspection
  who = shortlog -sne --all
  contributors = shortlog -sne
  files = ls-tree -r HEAD --name-only
  tags = tag -l --sort=-version:refname
  remotes = remote -v
  
  # Cleanup
  cleanup = "!git branch --merged main | grep -v 'main\\|master\\|develop' | xargs git branch -d"
  prune-all = "!git fetch --all --prune && git remote prune origin"
  
  # Utilities
  root = rev-parse --show-toplevel
  aliases = config --get-regexp '^alias\\.'
  whoami = "!git config user.name && git config user.email"
  
  # Advanced
  rank = shortlog -sn --all --no-merges
  graphviz = "!f() { echo 'digraph git {' ; git log --pretty='format:  %h -> { %p }' \"$@\" | sed 's/[0-9a-f][0-9a-f]*/\"&\"/g' ; echo '}'; }; f"
  
  # Undo operations
  undo = reset --soft HEAD~1                  # undo last commit, keep changes staged
  undohard = reset --hard HEAD~1              # undo last commit, discard changes
  
  # Work in progress
  wip = "!git add -A && git commit -m 'WIP: work in progress'"
  unwip = "!git log -n 1 | grep -q -c WIP && git reset HEAD~1"
  
  # Show ignored files
  ignored = ls-files --others -i --exclude-standard
  
  # Sync fork
  sync = "!git fetch upstream && git rebase upstream/main"
  
  # Interactive rebase from merge base
  ri = "!git rebase -i $(git merge-base HEAD main)"
  
  # Snapshot stash (save + pop)
  snapshot = "!git stash && git stash show -p | git apply --reverse"
```

---

## Scripting Git Safely

### Always Use Plumbing Commands

```bash
# FRAGILE: porcelain output may change
BRANCH=$(git branch | grep "^*" | cut -d' ' -f2)

# STABLE: plumbing output is guaranteed stable
BRANCH=$(git rev-parse --abbrev-ref HEAD)
SHA=$(git rev-parse HEAD)
ROOT=$(git rev-parse --show-toplevel)
```

### Exit Code Discipline

```bash
# Check if in git repo
git rev-parse --git-dir > /dev/null 2>&1 || { echo "Not a git repo"; exit 1; }

# Check if working tree is clean
if ! git diff-index --quiet HEAD --; then
  echo "Working tree is dirty"
  exit 1
fi

# Check if branch exists
git rev-parse --verify refs/heads/main > /dev/null 2>&1 && echo "main exists"

# Check if file is tracked
git ls-files --error-unmatch file.txt > /dev/null 2>&1 && echo "tracked"

# Check if commit exists
git cat-file -e <sha> && echo "commit exists"

# Check if branch is ancestor
git merge-base --is-ancestor base derived && echo "base is ancestor of derived"
```

### Null-Safe Output Parsing

```bash
# Use -z for null-delimited output (handles spaces in filenames)
git ls-files -z | while IFS= read -r -d '' file; do
  echo "processing: $file"
done

# Parse for-each-ref safely
git for-each-ref --format='%(refname:short)%00%(objectname)' refs/heads/ | \
  while IFS=$'\0' read -r branch sha; do
    echo "Branch: $branch SHA: $sha"
  done

# Porcelain v2 for scripting status
git status --porcelain=v2 --branch | while IFS= read -r line; do
  case "$line" in
    "#"*) : ;; # branch info
    "1 "* | "2 "* | "u "* | "?"*) echo "changed: $line" ;;
  esac
done
```

### Atomic Operations

```bash
# Create branch atomically (fails if exists)
git update-ref refs/heads/new-branch HEAD 0000000000000000000000000000000000000000

# Delete branch atomically (fails if not at expected SHA)
EXPECTED_SHA=$(git rev-parse old-branch)
git update-ref -d refs/heads/old-branch $EXPECTED_SHA

# Atomic push (all refs or none)
git push --atomic origin main feature-a feature-b
```

---

## AI Agent Git Guidance

This section is specifically for AI agents that programmatically interact with git repositories.

### Principles for Agents

**1. Always verify state before acting**
```bash
# Before any operation, understand where you are
git rev-parse --show-toplevel          # confirm repo root
git rev-parse --abbrev-ref HEAD        # confirm current branch
git status --porcelain=v2              # confirm working tree state
git diff-index --quiet HEAD || echo "DIRTY"  # check for uncommitted changes
```

**2. Never destructively operate on main/master/develop without explicit instruction**
```bash
# Safe branch check before any destructive operation
CURRENT=$(git rev-parse --abbrev-ref HEAD)
PROTECTED="main master develop production"
for p in $PROTECTED; do
  if [ "$CURRENT" = "$p" ]; then
    echo "ERROR: On protected branch $p. Aborting."
    exit 1
  fi
done
```

**3. Always create a branch for changes**
```bash
# Never commit directly to main
BRANCH="agent/$(date +%Y%m%d-%H%M%S)-$(echo $TASK | tr ' ' '-' | head -c 30)"
git switch -c "$BRANCH"
```

**4. Use atomic commits with precise messages**
```bash
# Each commit = one logical change
# Format: type(scope): description
git commit -m "fix(auth): handle null token in validateUser"
git commit -m "feat(api): add rate limiting middleware"
git commit -m "refactor(db): extract connection pooling logic"
git commit -m "test(auth): add edge cases for token expiry"
git commit -m "docs(api): document rate limit headers"
```

**5. Always fetch before pushing**
```bash
git fetch origin
git rebase origin/main  # or merge
git push -u origin HEAD
```

**6. Verify before force operations**
```bash
# Before force push: verify only your branch is affected
git log --oneline origin/feature..feature  # confirm what will be rewritten
git push --force-with-lease origin feature  # safer than --force
```

**7. Use machine-readable output for parsing**
```bash
# For status: use porcelain
git status --porcelain=v2

# For branches: use for-each-ref
git for-each-ref --format='%(refname:short) %(objectname:short) %(upstream:short)' refs/heads/

# For commits: use log with explicit format
git log --format='%H|%h|%an|%ae|%ai|%s' HEAD~5..HEAD

# For files: use ls-files
git ls-files -s --format='%(objectmode) %(objectname) %(stage)\t%(path)'
```

**8. Validate SHAs before using them**
```bash
SHA="$1"
# Validate it's a valid SHA
if ! git cat-file -e "$SHA" 2>/dev/null; then
  echo "ERROR: Invalid SHA: $SHA"
  exit 1
fi
# Get the type
TYPE=$(git cat-file -t "$SHA")
if [ "$TYPE" != "commit" ]; then
  echo "ERROR: $SHA is a $TYPE, not a commit"
  exit 1
fi
```

**9. Handle in-progress states**
```bash
# Check if a merge/rebase/cherry-pick is in progress
check_clean_state() {
  if [ -f .git/MERGE_HEAD ]; then
    echo "ERROR: merge in progress"
    return 1
  fi
  if [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ]; then
    echo "ERROR: rebase in progress"
    return 1
  fi
  if [ -f .git/CHERRY_PICK_HEAD ]; then
    echo "ERROR: cherry-pick in progress"
    return 1
  fi
  return 0
}
```

**10. Stash before switching contexts**
```bash
# Safe context switch
safe_switch() {
  TARGET_BRANCH="$1"
  
  # Stash if dirty
  if ! git diff-index --quiet HEAD --; then
    git stash push -m "auto-stash before switching to $TARGET_BRANCH"
    STASHED=true
  fi
  
  git switch "$TARGET_BRANCH"
  
  # Note: don't auto-pop stash - leave that decision to the agent
  if [ "$STASHED" = "true" ]; then
    echo "INFO: changes stashed as stash@{0}"
  fi
}
```

### Agent Commit Convention

Agents should prefix commits to distinguish from human commits:

```
agent(scope): description

# Examples:
agent(fix): resolve failing test in auth module
agent(refactor): extract database connection pool
agent(feat): implement rate limiting per user tier
agent(docs): generate API documentation from types
agent(test): add unit tests for edge cases in parser
agent(chore): update dependency versions

# With task ID:
agent(fix)[TASK-123]: resolve null pointer in auth validator
```

### Safe Operations Matrix

```
OPERATION                    SAFE?   CONDITIONS
─────────────────────────────────────────────────────────────────
git status                   ✅ ALWAYS
git log                      ✅ ALWAYS  
git diff                     ✅ ALWAYS
git fetch                    ✅ ALWAYS
git branch (listing)         ✅ ALWAYS
git show                     ✅ ALWAYS
git grep                     ✅ ALWAYS
git blame                    ✅ ALWAYS
git cat-file                 ✅ ALWAYS
git ls-files                 ✅ ALWAYS
git rev-parse                ✅ ALWAYS
git for-each-ref             ✅ ALWAYS

git add                      ✅ SAFE   (reversible with restore --staged)
git commit                   ✅ SAFE   (reversible with reset --soft HEAD~)
git stash push               ✅ SAFE   (reversible with stash pop)
git switch -c (new branch)   ✅ SAFE   (on unprotected branches)
git branch -c (copy)         ✅ SAFE

git merge                    ⚠️ CAREFUL  (can be aborted)
git rebase                   ⚠️ CAREFUL  (can be aborted; don't on shared branches)
git cherry-pick              ⚠️ CAREFUL  (can be aborted)
git push                     ⚠️ CAREFUL  (verify branch/remote)
git pull                     ⚠️ CAREFUL  (modifies working state)

git reset --soft             ⚠️ CAREFUL  (reversible via reflog)
git reset --mixed            ⚠️ CAREFUL  (reversible via reflog)
git stash pop                ⚠️ CAREFUL  (conflicts possible)
git restore --staged         ⚠️ CAREFUL  (reversible via reflog, not if not committed)

git push --force-with-lease  🔶 RESTRICTED  (only on feature branches you own)
git reset --hard             🔶 RESTRICTED  (verify via reflog that recovery is possible)
git clean -fd                🔶 RESTRICTED  (untracked files gone forever)
git revert                   🔶 RESTRICTED  (creates new commits, verify intent)
git branch -D                🔶 RESTRICTED  (check merged status first)

git push --force             🚫 PROHIBITED  (use --force-with-lease instead)
git filter-branch            🚫 PROHIBITED  (use git-filter-repo)
git reset --hard on main     🚫 PROHIBITED
git push --mirror            🚫 PROHIBITED  (unless explicitly mirroring)
git update-ref -d (branch)   🚫 PROHIBITED  (on protected branches)
rm -rf .git                  🚫 PROHIBITED  (obviously)
```

---

## Disaster Recovery Handbook

### "I accidentally committed to main"

```bash
# Scenario: You committed to main instead of a branch
# Step 1: Create branch at current state
git branch feature/my-work

# Step 2: Reset main back
git reset --hard origin/main

# Step 3: Switch to branch
git switch feature/my-work

# Step 4: Verify
git log --oneline main..feature/my-work
```

### "I accidentally ran `git reset --hard`"

```bash
# Git doesn't delete the commits, just moves HEAD
git reflog                    # find the SHA before the reset
git reset --hard HEAD@{1}     # go back one reflog entry
# OR
git reset --hard <sha>        # specific SHA from reflog
```

### "I deleted a branch I needed"

```bash
git reflog                    # find the last commit on that branch
git branch recovered-branch <sha>  # recreate it
# OR
git checkout -b recovered-branch <sha>
```

### "I lost uncommitted changes"

```bash
# If you ran git stash without saving stash name:
git stash list                # check stash list
git stash pop                 # pop the last one

# If git clean -fd removed files:
# Sorry — untracked files are truly gone unless you have backups
# This is why you should always run git clean -fdn (dry run) first

# If git checkout -- file removed changes:
# Also gone — uncommitted changes not in stash are truly unrecoverable
# (The index version may still be accessible if you staged it)
git fsck --lost-found         # sometimes finds dangling blobs
```

### "I force-pushed and overwrote remote history"

```bash
# On your local machine: find the old SHA in reflog
git reflog show origin/main

# If someone else has a copy:
# Ask them to push their version back:
git push --force-with-lease origin main

# If using GitHub: check if there's a "Recently deleted branches" backup
# GitHub keeps pushes for 90 days after deletion
```

### "My rebase went wrong"

```bash
# If still in progress:
git rebase --abort            # go back to pre-rebase state

# If completed but wrong:
git reflog                    # find the SHA before rebase (look for "rebase: start")
git reset --hard <pre-rebase-sha>

# Specifically: ORIG_HEAD is set before rebase
git reset --hard ORIG_HEAD
```

### "My merge is a mess"

```bash
# If not committed:
git merge --abort

# If committed:
git revert -m 1 <merge-sha>   # revert the merge commit
# This keeps the merge in history but adds a revert

# Or (DANGEROUS: rewrites history):
git reset --hard <pre-merge-sha>
git push --force-with-lease   # only if branch not shared
```

### "I committed a secret/password"

```bash
# Step 1: Immediately rotate the secret (this is urgent, do it NOW)

# Step 2: Remove from recent history (if not pushed to public)
git rebase -i HEAD~5          # drop or edit the commit

# Step 3: If pushed to GitHub/GitLab, use their secret scanning tools
# GitHub: Settings → Security → Secret scanning

# Step 4: Remove from entire history
pip install git-filter-repo
git filter-repo --replace-text <(echo "actual_secret==>REDACTED")
git filter-repo --path secrets.env --invert-paths
git push --force-with-lease --all

# Step 5: Tell everyone who cloned to re-clone
# The old history exists in their repos and in GitHub's network
```

### "I need to undo the last N commits but keep the changes"

```bash
# Soft reset: uncommit but keep changes staged
git reset --soft HEAD~3       # undo 3 commits, keep changes staged

# Mixed reset: uncommit, unstage, but keep working tree
git reset HEAD~3              # undo 3 commits, changes in working tree

# Hard reset: discard everything
git reset --hard HEAD~3       # DANGER: lose the changes
```

### "I have merge conflicts I can't resolve"

```bash
# Strategy 1: Use a merge tool
git mergetool

# Strategy 2: Understand each version
git show :1:file.txt          # base (common ancestor)
git show :2:file.txt          # ours
git show :3:file.txt          # theirs

# Strategy 3: Take one side entirely
git checkout --ours file.txt   # take our version
git checkout --theirs file.txt # take their version
git add file.txt
git commit

# Strategy 4: Abort and rethink
git merge --abort
git rebase --abort

# Strategy 5: Use rerere (for recurring conflicts)
git config rerere.enabled true
# Next time the same conflict appears, git resolves it automatically
```

---

## Repository Hygiene

### Regular Maintenance Schedule

**Daily (automated):**
```bash
git fetch --all --prune     # sync with remote, clean stale tracking branches
```

**Weekly (manual):**
```bash
git branch --merged main | grep -v "main\|master\|develop" | xargs git branch -d
git gc --auto               # usually a no-op unless thresholds exceeded
```

**Monthly:**
```bash
git gc                      # full garbage collection
git repack -a -d            # optimize packfiles
git fsck                    # check integrity
```

**After importing/bulk operations:**
```bash
git gc --aggressive         # maximum optimization
```

### Large Repo Strategies

```bash
# Enable filesystem monitor
git config core.fsmonitor true

# Enable commit graph
git config fetch.writeCommitGraph true

# Enable multi-pack index
git config core.multiPackIndex true

# Enable untracked cache
git config core.untrackedCache true

# Enable sparse checkout (if only need part of repo)
git sparse-checkout init --cone
git sparse-checkout set src/

# Shallow clone for CI
git clone --depth=1 --single-branch --branch main <url>

# Partial clone for large media repos
git clone --filter=blob:none <url>

# Blob-less + sparse for maximum efficiency
git clone --filter=blob:none --sparse <url>
git sparse-checkout set src/
```

---

## Commit Message Mastery

### The Anatomy of a Perfect Commit Message

```
<type>(<scope>): <subject>            ← line 1: 50 chars max
                                       ← line 2: blank
<body>                                 ← lines 3+: 72 chars per line max, explain what/why
                                       ← blank line before footer
<footer>                               ← refs, breaking changes, co-authors
```

### Conventional Commits (v1.0.0)

```
feat:      A new feature
fix:       A bug fix
docs:      Documentation only changes
style:     Formatting, no logic change
refactor:  Refactoring: no feature, no fix
perf:      Performance improvement
test:      Adding or updating tests
build:     Build system, dependencies
ci:        CI/CD configuration
chore:     Other changes that don't modify src/test
revert:    Reverts a previous commit

BREAKING CHANGE: in footer (or ! after type) = major version bump
feat!: breaking feature change
fix!:  breaking fix

Examples:
feat(auth): add OAuth2 login via Google
fix(api): return 404 when user not found instead of 500
docs(readme): add development setup instructions
refactor(db)!: change connection pool API

BREAKING CHANGE: poolSize option renamed to maxConnections
```

### Subject Line Rules

```
✅ DO:
- Use imperative mood: "add feature" not "added feature"
- Capitalize first word
- No period at end
- Max 50 characters
- Reference issue number: "fix(auth): handle expired tokens (closes #123)"

❌ DON'T:
- "WIP"
- "misc"
- "stuff"
- "update"
- "fix bug"
- "oops"
- Include issue URL (use number only)
```

### Body Rules

```
- Explain the WHAT and WHY, not the HOW
- The code shows how; the message explains why
- Wrap at 72 characters
- Use blank lines between paragraphs

Bad body:
  Changed the timeout value from 30 to 60.

Good body:
  Increase connection timeout from 30s to 60s.

  Users on mobile networks were experiencing intermittent failures
  during large uploads because the 30s timeout was insufficient for
  3G connections. 60s accommodates 95th percentile mobile upload times
  without significantly impacting fast-path performance.

  See: https://github.com/example/repo/issues/456
```

### Footers

```
Refs: #123, #456
Closes: #789
BREAKING CHANGE: <description>
Co-authored-by: Name <email>
Reviewed-by: Name <email>
Signed-off-by: Name <email>
```

---

## The Decision Trees

### Should I Merge or Rebase?

```
Is the branch public (others have pulled it)?
├─ YES → MERGE (never rebase public history)
└─ NO  → Is this a feature branch being integrated into main?
         ├─ YES → REBASE (creates clean, linear history)
         └─ NO  → Is this a long-running release branch?
                  ├─ YES → MERGE (preserve history)
                  └─ NO  → REBASE (for cleanliness)
```

### Should I Amend or Create a New Commit?

```
Is this commit already pushed to a remote?
├─ YES → Create new commit (or revert)
└─ NO  → Is it only the message that needs changing?
         ├─ YES → git commit --amend
         └─ NO  → Do you want to add changes?
                  ├─ YES → git commit --amend (add changes first)
                  └─ NO  → Create a new commit
```

### How Do I Undo?

```
What do I want to undo?
├─ A committed change (already pushed) → git revert <sha>
├─ A committed change (NOT pushed) → git reset (soft/mixed/hard)
├─ Staged changes → git restore --staged <file>
├─ Working tree changes → git restore <file>
├─ An entire merge (already committed) → git revert -m 1 <merge-sha>
├─ A rebase → git reset --hard ORIG_HEAD
└─ Something from 3 hours ago I can't find → git reflog
```

### How Destructive Is This Operation?

```
git restore --staged    → LOW: changes go back to working tree
git restore (file)      → MEDIUM: working tree changes gone (not in stash)
git reset --soft        → LOW: changes staged
git reset --mixed       → LOW: changes in working tree
git reset --hard        → HIGH: changes gone (recoverable from reflog)
git clean -fd           → VERY HIGH: untracked files gone FOREVER
git push --force        → VERY HIGH: remote history overwritten
git filter-repo         → EXTREME: rewrites entire history
```

---

## Quick Reference: All Reset Modes

```
               HEAD        Index       Working Tree
reset --soft    ✓ moves     ✗ keeps      ✗ keeps
reset --mixed   ✓ moves     ✓ resets     ✗ keeps
reset --hard    ✓ moves     ✓ resets     ✓ resets

restore --staged              ✓ resets    ✗ keeps
restore                       ✗ keeps     ✓ resets
restore -SW                   ✓ resets    ✓ resets
```

## Quick Reference: Detached HEAD States

```
Enters detached HEAD:
  git checkout <sha>
  git checkout v1.0.0
  git bisect (during)
  git rebase (during each commit)
  git worktree add --detach

Exits detached HEAD:
  git switch main          → go to branch
  git switch -c new-branch → save work in new branch
  git checkout -            → go to previous location
```

---

*End of Part 4 — The Git Bible is complete.*

---

## Master Index

| Topic                        | Part | Section                              |
|------------------------------|------|--------------------------------------|
| Object Model (blob/tree/commit/tag) | 1 | The Four Objects               |
| DAG structure                | 1   | The Mental Model                      |
| Three trees                  | 1   | The Three Trees                       |
| Branches as pointers         | 1   | References, Branches, and Tags        |
| HEAD pointer                 | 1   | The HEAD Pointer                      |
| Index/staging area           | 1   | The Index                             |
| Reflog                       | 1   | The Reflog                            |
| Packfiles                    | 1   | Packfiles and Storage                 |
| .git directory               | 1   | The .git Directory Anatomy            |
| All git commands             | 2   | Complete Command Reference            |
| Branching workflows          | 3   | Branching Workflows                   |
| Transfer protocol            | 3   | The Transfer Protocol                 |
| Hooks system                 | 3   | Hooks System                          |
| Merge strategies             | 3   | Merge Strategies Deep Dive            |
| Conflict resolution          | 3   | Conflict Resolution Anatomy           |
| Sparse checkout              | 3   | Sparse Checkout & Partial Clone       |
| .gitattributes               | 3   | Git Attributes                        |
| Rerere                       | 3   | Rerere                                |
| Environment variables        | 3   | Environment Variables                 |
| Performance tuning           | 3   | Performance Tuning                    |
| Signing & security           | 3   | Security & Signing                    |
| Golden rules                 | 4   | The Golden Rules                      |
| Power recipes                | 4   | Power Recipes                         |
| Anti-patterns                | 4   | Common Anti-Patterns                  |
| Aliases                      | 4   | Aliases                               |
| Scripting safely             | 4   | Scripting Git Safely                  |
| AI agent guidance            | 4   | AI Agent Git Guidance                 |
| Disaster recovery            | 4   | Disaster Recovery Handbook            |
| Repository hygiene           | 4   | Repository Hygiene                    |
| Commit messages              | 4   | Commit Message Mastery                |
| Decision trees               | 4   | The Decision Trees                    |
