# THE GIT BIBLE
## Part 3: Workflows, Protocols, Hooks & Internals

---

## Table of Contents
1. [Branching Workflows](#branching-workflows)
2. [The Transfer Protocol](#the-transfer-protocol)
3. [Hooks System](#hooks-system)
4. [Merge Strategies Deep Dive](#merge-strategies-deep-dive)
5. [Conflict Resolution Anatomy](#conflict-resolution-anatomy)
6. [Sparse Checkout & Partial Clone](#sparse-checkout--partial-clone)
7. [Git Attributes](#git-attributes)
8. [Rerere (Reuse Recorded Resolution)](#rerere)
9. [Git LFS Concepts](#git-lfs-concepts)
10. [Shallow Clones & Grafts](#shallow-clones--grafts)
11. [The Commit Graph](#the-commit-graph)
12. [Multi-Pack Index (MIDX)](#multi-pack-index)

---

## Branching Workflows

### Git Flow (Nvie Model)

```
main ────────────────────────────────────────── (stable releases, tags)
  │
  └── develop ────────────────────────────────── (integration branch)
        │
        ├── feature/login ───── (from develop, merge back to develop)
        ├── feature/payments ── (from develop, merge back to develop)
        │
        └── release/1.0 ──────── (from develop; only bug fixes; merge to main + develop)
              │
              └── hotfix/1.0.1 ── (from main; merge to main + develop)
```

**Pros**: Clear structure, parallel release cycles
**Cons**: Complex, overhead for small teams, rebase-unfriendly

### GitHub Flow (Simple)

```
main ──────────────────────────────── (always deployable)
  │
  ├── feature/x ── (PR → review → squash/merge to main → deploy)
  ├── fix/y ─────── (PR → review → merge to main → deploy)
  └── experiment/z
```

**Pros**: Simple, CI/CD-friendly, works for continuous delivery
**Cons**: Only one release in production at a time

### GitLab Flow (Environment-based)

```
main ──────────────────────────── (source of truth)
  │
  ├── pre-production ──────────── (merges from main)
  └── production ──────────────── (merges from pre-production)
```

### Trunk-Based Development

```
main/trunk ────────────────────────────────── (everyone commits here)
  │
  └── release/1.0 ──────────────────────────── (cut when ready)
```

Short-lived feature branches (max 1-2 days), feature flags for incomplete features.

### Forking Workflow (Open Source)

```
upstream/main ─────────────────── (authoritative)
     │
     └── (fork) origin/main ───── (your fork)
                   │
                   └── feature ── (PR to upstream)
```

---

## The Transfer Protocol

### Smart HTTP Protocol

```
Client                                    Server
  │                                          │
  ├─ GET /repo.git/info/refs?service=git-upload-pack
  │                                          │
  │  ←── 200 OK (refs advertisement) ────────┤
  │      ref-list: SHA branch-name           │
  │                                          │
  ├─ POST /repo.git/git-upload-pack ─────────┤
  │  want <sha1>                             │
  │  want <sha2>                             │
  │  have <sha3>                             │  ← what client has
  │  done                                    │
  │                                          │
  │  ←── packfile ────────────────────────── │
```

### SSH Protocol

```
git@github.com:user/repo.git
→ ssh git@github.com git-upload-pack user/repo.git
```

### Git Protocol (port 9418, no auth)

```
git://github.com/user/repo.git
→ Direct TCP to git-daemon
```

### Upload Pack (fetch) vs Receive Pack (push)

| Operation | Server-side binary      |
|-----------|-------------------------|
| fetch/clone | `git-upload-pack`     |
| push        | `git-receive-pack`    |

### Ref Advertisement

When the client connects, the server sends all its refs:
```
<sha1> HEAD\0capability1 capability2...
<sha1> refs/heads/main
<sha1> refs/heads/develop
<sha1> refs/tags/v1.0.0
0000                           ← flush packet
```

### Packfile Negotiation

The client sends `want` (desired SHAs) and `have` (known SHAs). The server computes the minimum packfile needed to bridge the difference. This is the core efficiency of git fetch — only new objects are transferred.

### Capabilities (Protocol v2)

Protocol v2 (git 2.26+ default) is significantly more efficient:
- Filtered ref advertisement (client specifies which refs it needs)
- `ls-refs` command for selective ref listing
- `fetch` command for the actual fetch
- Reduces bandwidth for repos with many refs

```bash
GIT_TRACE_PACKET=1 git fetch   # trace protocol packets
GIT_TRACE_CURL=1 git fetch     # trace HTTP
GIT_TRACE=1 git fetch          # general trace
GIT_TRACE2_EVENT=/tmp/trace.json git fetch  # structured trace
```

---

## Hooks System

Hooks are executable scripts in `.git/hooks/`. Git calls them at specific points. If a hook exits non-zero (except post-* hooks), the operation is aborted.

### Client-Side Hooks

#### `pre-commit`
Runs before the commit message is requested. Exit non-zero to abort.
```bash
#!/bin/sh
# Example: run linter
npm run lint
exit $?
```
Bypassed by: `git commit --no-verify`

#### `prepare-commit-msg`
Runs before the editor opens, after default message is created.
Arguments: `$1=file`, `$2=type (message|template|merge|squash|commit)`, `$3=sha (if amend)`
```bash
#!/bin/sh
# Prepend branch name to commit message
BRANCH=$(git branch --show-current)
TICKET=$(echo "$BRANCH" | grep -oE '^[A-Z]+-[0-9]+')
if [ -n "$TICKET" ]; then
  sed -i "1s/^/[$TICKET] /" "$1"
fi
```

#### `commit-msg`
Runs after message is entered. `$1` = path to file containing message.
```bash
#!/bin/sh
# Enforce conventional commits
if ! grep -qE "^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?: .+" "$1"; then
  echo "ERROR: Commit message must follow Conventional Commits format"
  exit 1
fi
```
Bypassed by: `git commit --no-verify`

#### `post-commit`
Runs after commit completes. Cannot abort. Used for notifications.
```bash
#!/bin/sh
echo "Committed: $(git log -1 --oneline)"
```

#### `pre-rebase`
Runs before rebase starts. `$1=upstream`, `$2=branch` (empty if rebasing current).
```bash
#!/bin/sh
# Prevent rebasing published commits
UPSTREAM=$1
BRANCH=${2:-HEAD}
if git merge-base --is-ancestor "$BRANCH" origin/main; then
  echo "ERROR: Don't rebase published commits"
  exit 1
fi
```

#### `post-rewrite`
Runs after commit-rewriting commands (rebase, amend). `$1=command`.
```bash
#!/bin/sh
# Update any notes after rewrite
while read OLD NEW; do
  git notes copy --for-rewrite="$1" "$OLD" "$NEW" 2>/dev/null
done
```

#### `post-checkout`
Runs after `git checkout`/`git switch`. Args: `$1=prev-HEAD`, `$2=new-HEAD`, `$3=flag(1=branch,0=file)`.
```bash
#!/bin/sh
# Auto-install dependencies when switching branches
if [ "$3" = "1" ]; then
  npm install --silent
fi
```

#### `post-merge`
Runs after successful merge. `$1=flag(1=squash merge)`.
```bash
#!/bin/sh
# Rebuild if package.json changed
if git diff-tree --no-commit-id -r --name-only ORIG_HEAD HEAD | grep -q "package.json"; then
  npm install
fi
```

#### `pre-push`
Runs before push. Receives remote-name and URL. Stdin: `<local-ref> <local-sha> <remote-ref> <remote-sha>`.
```bash
#!/bin/sh
# Run tests before pushing
npm test
exit $?
```
Bypassed by: `git push --no-verify`

#### `pre-auto-gc`
Runs before automatic garbage collection. Exit non-zero to cancel gc.

### Server-Side Hooks

#### `pre-receive`
Runs once before any refs are updated. Stdin: `<old-sha> <new-sha> <refname>` per line.
```bash
#!/bin/sh
# Reject force pushes to main
while read OLD NEW REF; do
  if [ "$REF" = "refs/heads/main" ]; then
    if ! git merge-base --is-ancestor "$OLD" "$NEW"; then
      echo "ERROR: Force push to main is not allowed"
      exit 1
    fi
  fi
done
```

#### `update`
Runs once per ref being updated. Args: `$1=refname`, `$2=old-sha`, `$3=new-sha`.
More granular than pre-receive — can allow/deny per-branch.

#### `post-receive`
Runs after all refs are updated. Used for CI triggers, notifications, deployments.
```bash
#!/bin/sh
# Trigger CI on every push
while read OLD NEW REF; do
  curl -X POST https://ci.example.com/trigger \
    -d "ref=$REF&sha=$NEW"
done
```

#### `post-update`
Runs after all refs updated. Arguments: list of ref names. Used by `git update-server-info`.

### Hook Management

```bash
# Make hook executable (required!)
chmod +x .git/hooks/pre-commit

# Use a hooks directory (git 2.9+)
git config core.hooksPath .githooks    # team-shared hooks directory
git config --global core.hooksPath ~/.git-hooks  # global hooks

# Skip all hooks
git commit --no-verify
git push --no-verify
git rebase --no-verify

# Husky (popular Node.js hook manager)
# package.json: "husky": { "hooks": { "pre-commit": "lint-staged" } }

# pre-commit (Python tool)
# .pre-commit-config.yaml defines hooks as code
```

---

## Merge Strategies Deep Dive

### `recursive` (default for 2-branch merge)

The recursive strategy recursively merges common ancestors when there are multiple merge bases (crisscross merges). This handles the octopus of real-world branch histories.

**Options:**
- `ours` — on conflict, keep our version
- `theirs` — on conflict, keep their version
- `patience` — use patience diff algorithm
- `diff-algorithm=histogram` — use histogram algorithm
- `ignore-space-change` — ignore whitespace
- `ignore-all-space` — ignore all whitespace
- `ignore-space-at-eol` — ignore trailing whitespace
- `ignore-cr-at-eol` — ignore carriage returns
- `renormalize` — apply clean filter
- `no-renames` — disable rename detection
- `find-renames[=n]` — set rename threshold
- `subtree[=n]` — subtree merge
- `no-recursive` — don't merge common ancestors
- `no-automerge` — only flag conflicts

### `ort` (default since git 2.34)

"Ostensibly Recursive's Twin" — reimplementation of recursive that is much faster (especially for large repos) and handles some edge cases better. Same options as recursive.

### `octopus`

Default for merging 3+ branches. Cannot handle conflicts — if any exist, it fails.

### `ours`

Complete disregard for "theirs." Keeps our tree entirely, records the merge in history. Different from `-X ours` (which resolves conflicts with ours but merges clean changes normally).

```bash
git merge -s ours abandoned-branch    # absorb branch, discard its changes
```

### `resolve`

Simple two-headed recursive strategy. Faster than recursive but less accurate for crisscross merges.

### `subtree`

For merging a repo into a subdirectory. Git adjusts the tree to match before merging.

---

## Conflict Resolution Anatomy

### Conflict Markers

```
<<<<<<< HEAD (current branch)
line from our version
||||||| merged common ancestor  ← only in diff3 style
line from base version
=======
line from their version
>>>>>>> feature-branch (incoming)
```

Enable diff3 style for better context:
```bash
git config --global merge.conflictstyle diff3
# or zdiff3 (git 2.35+, even cleaner)
git config --global merge.conflictstyle zdiff3
```

### Index Stages During Conflict

```bash
git ls-files -u          # show all conflicted files with stages
# Stage 1: common ancestor (merge base)
# Stage 2: ours (HEAD)
# Stage 3: theirs (MERGE_HEAD)

# Extract individual versions
git show :1:file.txt     # base version
git show :2:file.txt     # our version
git show :3:file.txt     # their version

# Or with checkout/restore
git restore --ours file.txt       # take our version
git restore --theirs file.txt     # take their version

# After editing to resolve
git add file.txt                  # mark as resolved
```

### Merge Tools

```bash
git mergetool                     # open configured tool for all conflicts
git mergetool <file>              # specific file
git mergetool --tool=vimdiff      # specific tool
git mergetool --tool=vscode       # VS Code
git mergetool --no-prompt         # don't ask before each file
git mergetool --tool-help         # list available tools

# Available tools: vimdiff, vimdiff2, vimdiff3, gvimdiff,
# kdiff3, tkdiff, xxdiff, meld, tortoisemerge, diffuse,
# codecompare, smerge, vscode, ecmerge, emerge

# Configure VS Code as merge tool
git config --global merge.tool vscode
git config --global mergetool.vscode.cmd 'code --wait $MERGED'
```

### Abort vs Quit vs Continue

```bash
git merge --abort           # abandon, restore pre-merge state
git rebase --abort          # abandon, restore pre-rebase state
git cherry-pick --abort     # abandon cherry-pick

git merge --continue        # commit after resolving all conflicts
git rebase --continue       # continue rebase after resolving
git cherry-pick --continue  # continue cherry-pick after resolving

git merge --quit            # abandon merge (don't restore)
git rebase --quit           # abandon rebase (leave partial state)
```

---

## Sparse Checkout & Partial Clone

### Sparse Checkout (Limit Working Tree)

```bash
# Enable sparse checkout on existing repo
git sparse-checkout init
git sparse-checkout init --cone    # cone mode (faster, directory-based)

# Set what to include (cone mode: directories)
git sparse-checkout set src/ docs/
git sparse-checkout add tests/

# List current patterns
git sparse-checkout list

# Disable (re-enable all files)
git sparse-checkout disable

# Reapply patterns (after conflicts etc.)
git sparse-checkout reapply

# Non-cone mode (gitignore patterns)
git sparse-checkout set --no-cone
# Then edit .git/info/sparse-checkout directly with patterns

# New repo with sparse checkout
git clone --sparse <url>
git sparse-checkout set src/
```

### Cone Mode vs Non-Cone Mode

**Cone mode** (recommended): Only understands recursive directory inclusions. Much faster because git can skip entire trees without pattern matching each file.

**Non-cone mode**: Full gitignore-style patterns. Flexible but slow for large repos.

### Partial Clone (Limit Object Download)

```bash
# Blobless clone: download history but not file contents
git clone --filter=blob:none <url>
# Fetch blobs on demand when checking out

# Treeless clone: download commits only
git clone --filter=tree:0 <url>
# Fetch trees and blobs on demand

# No filter (normal clone)
git clone <url>

# Combine with sparse checkout for maximum efficiency
git clone --sparse --filter=blob:none <url>
git sparse-checkout set src/
```

### Filter Specifications

```bash
--filter=blob:none              # no blobs (fetch on demand)
--filter=blob:limit=1m          # blobs larger than 1MB on demand
--filter=tree:0                 # no trees or blobs
--filter=object:type=blob       # only blobs matching type
--filter=combine:blob:none+tree:0  # combine filters (git 2.31+)
```

---

## Git Attributes

`.gitattributes` controls per-path settings:

```
# Syntax: pattern  attribute  value
# Common attributes:
*.py        text eol=lf          # Python files: LF endings
*.bat       text eol=crlf        # Batch files: CRLF endings
*.png       binary               # PNG: binary (no eol, no diff driver)
*.pdf       binary
*.docx      binary

# Custom diff drivers
*.py        diff=python
*.md        diff=markdown
*.ipynb     diff=jupyternotebook

# Merge strategies
*.lock      merge=ours           # always use ours for lockfiles
package.json merge=npm           # custom merge driver

# Language identification for syntax highlighting
*.tf        linguist-language=HCL
vendor/     linguist-vendored=true
docs/       linguist-documentation=true

# Export control
.gitattributes  export-ignore    # exclude from git archive
.github/        export-ignore

# Encryption (git-crypt)
secrets.yaml    filter=git-crypt diff=git-crypt

# Large file storage
*.psd       filter=lfs diff=lfs merge=lfs -text
*.zip       filter=lfs diff=lfs merge=lfs -text
```

```bash
git check-attr <attribute> -- <file>   # check attribute value
git check-attr --all -- <file>         # all attributes for file
git ls-files --eol                     # show eol settings
git add --renormalize .                # re-apply eol normalization
```

### Custom Diff Drivers

```bash
# .gitconfig: define a diff driver
git config --global diff.python.xfuncname '^(class|def) .+'
git config --global diff.markdown.xfuncname '^#{1,6} .+'

# .gitattributes: apply it
*.py diff=python
*.md diff=markdown

# Word diff for prose
*.md diff=markdown
git config diff.markdown.wordRegex "[^[:space:]]+"
```

### Custom Merge Drivers

```bash
# Define merge driver in .gitconfig
git config merge.npm.name "npm package.json merge"
git config merge.npm.driver "npm-merge-driver merge %O %A %B %P"

# Apply in .gitattributes
package.json merge=npm
```

---

## Rerere

**Re**use **Re**corded **Re**solution: Git remembers how you resolved conflicts and auto-applies those resolutions next time.

```bash
git config --global rerere.enabled true
git config --global rerere.autoUpdate true  # auto-stage after applying

# Rerere cache lives in .git/rr-cache/
# Keyed by conflict fingerprint (hash of conflict markers)

git rerere                     # apply recorded resolutions
git rerere diff                # show diff being recorded
git rerere status              # show files with recorded resolutions
git rerere remaining           # show unresolved files
git rerere gc                  # clean up old resolutions
git rerere forget <path>       # forget resolution for file

# To share rerere cache with team:
# Commit .git/rr-cache to a notes ref or separate repo
```

---

## Git LFS Concepts

Git LFS (Large File Storage) replaces large files with text pointers in the repo and stores actual content on an LFS server.

### Pointer Format

```
version https://git-lfs.github.com/spec/v1
oid sha256:4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393
size 12345
```

### How It Works

1. `git lfs install` — installs hooks (pre-push, post-checkout, post-merge, post-commit)
2. `git lfs track "*.psd"` — adds rule to `.gitattributes`
3. `git add photo.psd` — stores pointer in index, uploads to LFS server
4. On checkout: post-checkout hook downloads actual file content

```bash
git lfs install                       # install hooks globally
git lfs track "*.psd"                 # track file type
git lfs track "*.psd" --filename      # track specific file
git lfs untrack "*.psd"               # stop tracking
git lfs ls-files                      # list LFS files
git lfs ls-files -l                   # with oids
git lfs status                        # show LFS files status
git lfs env                           # show LFS environment
git lfs logs last                     # show recent LFS log
git lfs fetch                         # fetch LFS objects
git lfs fetch --all                   # fetch all LFS history
git lfs pull                          # fetch + checkout LFS objects
git lfs push origin main              # push LFS objects
git lfs push --all origin             # push all LFS objects
git lfs migrate import --include="*.psd"  # retroactively LFS-ify files
git lfs migrate export --include="*.psd"  # reverse migration
git lfs pointer --file=photo.psd      # show what pointer would look like
git lfs fsck                          # verify LFS objects
git lfs prune                         # remove local LFS objects not referenced
git lfs dedup                         # deduplicate LFS objects
```

---

## Shallow Clones & Grafts

### Shallow Clones

A shallow clone has a truncated history. Commits at the boundary are "grafted" — they appear to have no parents.

```bash
git clone --depth=1 <url>             # only latest commit
git clone --depth=50 <url>            # 50 commits of history
git clone --shallow-since="6 months ago" <url>
git clone --shallow-exclude=v1.0.0 <url>

# Deepen after clone
git fetch --deepen=100                # add 100 more commits
git fetch --shallow-since="1 year ago"
git fetch --unshallow                 # fetch complete history

# Check if shallow
git rev-parse --is-shallow-repository

# Shallow boundary
cat .git/shallow                      # SHA of grafted commits
```

### Grafts (Legacy)

`.git/info/grafts` allows rewriting parentage without altering objects:
```
<commit-sha> <parent-sha>           # pretend commit has parent
<commit-sha>                        # commit has no parents (new root)
```

Modern equivalent: `git replace` (creates actual replacement objects).

---

## The Commit Graph

The commit-graph file (`.git/objects/info/commit-graph`) is a binary cache that accelerates reachability queries. It stores:
- Commit SHAs
- Tree SHAs
- Parent information
- Generation numbers (for faster ancestor checks)
- Bloom filters for changed-path queries

```bash
git commit-graph write                # write commit-graph
git commit-graph write --reachable    # from all reachable commits
git commit-graph write --stdin-commits  # from stdin
git commit-graph write --changed-paths  # include Bloom filters
git commit-graph verify               # verify commit-graph
git commit-graph read                 # read commit-graph info

# Auto-write during fetch/gc
git config --global fetch.writeCommitGraph true
git config --global gc.writeCommitGraph true  # git 2.29+

# Chain mode (incremental)
git commit-graph write --reachable --split  # write incrementally
git commit-graph write --split=merge-if     # merge if needed
```

---

## Multi-Pack Index (MIDX)

The MIDX file provides a single index over all packfiles, reducing the overhead of checking multiple `.idx` files.

```bash
git multi-pack-index write            # write MIDX
git multi-pack-index verify           # verify MIDX
git multi-pack-index expire           # expire redundant packfiles
git multi-pack-index repack           # repack based on MIDX

git config --global core.multiPackIndex true  # enable MIDX
```

---

## Environment Variables

```bash
# Repository location
GIT_DIR=.git                         # override .git location
GIT_WORK_TREE=/path/to/worktree      # override working tree
GIT_COMMON_DIR=.git                  # common dir for worktrees
GIT_INDEX_FILE=.git/index            # override index file
GIT_OBJECT_DIRECTORY=.git/objects    # override object dir
GIT_ALTERNATE_OBJECT_DIRECTORIES=... # colon-separated extra object dirs

# Identity
GIT_AUTHOR_NAME="Name"
GIT_AUTHOR_EMAIL="email"
GIT_AUTHOR_DATE="2024-01-15T10:00:00"
GIT_COMMITTER_NAME="Name"
GIT_COMMITTER_EMAIL="email"
GIT_COMMITTER_DATE="2024-01-15T10:00:00"

# Network
GIT_SSH=ssh                          # SSH binary
GIT_SSH_COMMAND="ssh -i key"         # SSH command
GIT_ASKPASS=askpass-script           # password prompt program
GIT_CURL_VERBOSE=1                   # verbose curl
GIT_SSL_NO_VERIFY=true               # skip SSL verification (DANGER)
GIT_PROXY_COMMAND=...                # proxy command
HTTPS_PROXY=http://proxy:8080
HTTP_PROXY=http://proxy:8080
NO_PROXY=localhost,127.0.0.1

# Behavior
GIT_TERMINAL_PROMPT=0                # disable terminal prompts
GIT_MERGE_VERBOSITY=5                # merge verbosity (0-5)
GIT_PAGER=less                       # override pager
GIT_EDITOR=vim                       # override editor
GIT_SEQUENCE_EDITOR=vim              # editor for interactive rebase
GIT_NOTES_REF=refs/notes/custom      # notes namespace

# Debugging
GIT_TRACE=1                          # general trace
GIT_TRACE=filename                   # trace to file
GIT_TRACE_PACK_ACCESS=1              # packfile access trace
GIT_TRACE_PACKET=1                   # protocol packet trace
GIT_TRACE_CURL=1                     # curl trace
GIT_TRACE_PERFORMANCE=1              # timing trace
GIT_TRACE2=1                         # trace2 (structured)
GIT_TRACE2_EVENT=filename            # trace2 events to file
GIT_TRACE2_PERF=filename             # trace2 performance to file
GIT_FLUSH=1                          # flush after each trace line

# Internals
GIT_REFLOG_ACTION="my operation"     # label for reflog entry
GIT_REDACT_COOKIES=1                 # redact cookies in traces
GIT_ICASE_PATHSPECS=1                # case-insensitive paths
GIT_NOGLOB_PATHSPECS=1               # disable glob in pathspecs
GIT_LITERAL_PATHSPECS=1              # all pathspecs are literal
GIT_GLOB_PATHSPECS=1                 # all pathspecs are globs
GIT_CEILING_DIRECTORIES=/path        # don't look past this for .git
GIT_DISCOVERY_ACROSS_FILESYSTEM=true # cross filesystem boundaries
GIT_OPTIONAL_LOCKS=0                 # skip optional locks (for background tasks)
GIT_ALLOW_PROTOCOL=https:ssh         # whitelist protocols
GIT_NO_REPLACE_OBJECTS=1             # ignore replacement refs
```

---

## Plumbing vs Porcelain

Git distinguishes between:

**Porcelain** (high-level, user-facing): `add`, `commit`, `push`, `pull`, `merge`, `rebase`, `log`, `diff`, `status`, `checkout`, `branch`...

**Plumbing** (low-level, scripting): `hash-object`, `cat-file`, `ls-tree`, `write-tree`, `commit-tree`, `update-index`, `update-ref`, `rev-parse`, `rev-list`, `merge-base`, `for-each-ref`, `pack-objects`, `unpack-objects`, `pack-refs`...

For scripting, **always prefer plumbing commands**. Porcelain commands may change output format across versions. Plumbing commands have stable, machine-parseable output.

```bash
# Stable scripting patterns
git rev-parse HEAD                    # not: git log -1 --format=%H
git for-each-ref --format='...' refs/ # not: git branch -a
git ls-files -s                       # not: git status
git cat-file -t <sha>                 # type of any object
git update-ref refs/heads/main <sha>  # not: git branch -f main <sha>
git symbolic-ref HEAD                 # not: parsing .git/HEAD directly
```

---

## Security & Signing

### Signed Commits

```bash
# Setup GPG signing
gpg --gen-key
gpg --list-secret-keys --keyid-format=long
git config --global user.signingkey <key-id>
git config --global commit.gpgSign true

# Sign a commit
git commit -S -m "signed commit"
git commit --gpg-sign -m "signed"

# Verify
git log --show-signature
git verify-commit HEAD
git verify-commit <sha>

# SSH signing (git 2.34+, simpler than GPG)
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global gpg.ssh.allowedSignersFile ~/.ssh/allowed_signers
```

### Signed Tags

```bash
git tag -s v1.0.0 -m "Signed release"   # sign tag
git tag -v v1.0.0                         # verify tag
git push --follow-tags                    # push commits + annotated tags
```

### Certificate Authority

```bash
# x509 signing (S/MIME)
git config --global gpg.format x509
git config --global gpg.x509.program smimesign
git config --global user.signingkey <cert-fingerprint>
```

---

## Performance Tuning

```bash
# Filesystem monitor (inotify/FSEvents) - huge speedup for large repos
git config --global core.fsmonitor true         # built-in (git 2.37+)
git config core.fsmonitor .git/hooks/fsmonitor  # custom script

# Untracked cache
git config --global core.untrackedCache true    # enabled by default where supported

# Commit graph for faster reachability
git config --global fetch.writeCommitGraph true

# Multi-pack index
git config --global core.multiPackIndex true

# Parallel operations
git config --global submodule.fetchJobs 4
git config --global pack.threads 0              # 0 = use all CPUs

# Compression
git config --global core.compression 0          # no compression (fast write, big)
git config --global core.compression 9          # max compression (slow write, small)
git config --global pack.compression 0          # packfile compression

# Pre-loading index
git config --global index.preloadIndex true     # default on

# Extensions
git config --global extensions.objectFormat sha1  # or sha256
git config --global feature.manyFiles true      # enable features for repos with many files
# feature.manyFiles enables: index.version=4, core.untrackedCache, fetch.writeCommitGraph
```

---

## Wire Protocol Details

### Packfile Format

```
PACK header:
  4 bytes: "PACK"
  4 bytes: version (big-endian, must be 2 or 3)
  4 bytes: number of objects

Per object:
  Variable: size-encoded type+size
    bits 654: type (1=commit, 2=tree, 3=blob, 4=tag, 6=ofs-delta, 7=ref-delta)
    bits 3210: size low bits
    continuation byte: MSB=more data, bits 6543210=size continuation
  For delta objects: base offset or base SHA
  Zlib-compressed data

Trailing:
  20 bytes: SHA-1 of all preceding data
```

### Index File Format (.idx)

Version 2:
```
4 bytes: magic (\377tOc)
4 bytes: version (2)
1024 bytes: fan-out table (256 × 4 bytes)
N × 20 bytes: sorted SHAs
N × 4 bytes: CRCs
N × 4 bytes: offsets (31-bit; MSB=1 means use large offset table)
K × 8 bytes: large offsets (for offsets > 2GB)
20 bytes: packfile SHA
20 bytes: index SHA
```

---

*End of Part 3*
