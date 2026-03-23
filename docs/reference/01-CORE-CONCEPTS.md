# THE GIT BIBLE
## Part 1: Core Concepts & The Object Model

> *"Git is not a version control system. Git is a content-addressable filesystem with a version control system built on top of it."*
> — Linus Torvalds

---

## Table of Contents
1. [The Mental Model](#the-mental-model)
2. [The Four Objects](#the-four-objects)
3. [The Three Trees](#the-three-trees)
4. [References, Branches, and Tags](#references-branches-and-tags)
5. [The HEAD Pointer](#the-head-pointer)
6. [The Index (Staging Area)](#the-index-staging-area)
7. [The Reflog](#the-reflog)
8. [Packfiles and Storage](#packfiles-and-storage)
9. [The .git Directory Anatomy](#the-git-directory-anatomy)

---

## The Mental Model

Before a single command, internalize this: **Git stores snapshots, not diffs.**

Every commit is a complete snapshot of your entire project at that moment in time. Git is efficient about this (via content-addressed deduplication), but conceptually: each commit knows exactly what every file looked like.

The second truth: **almost everything in Git is local.** Your entire project history lives on your machine. Network operations (push/pull/fetch) are explicit synchronization steps, not continuous connections.

The third truth: **Git only adds data.** Destructive operations feel scary because they're rare — but most "deletions" just move the HEAD pointer. The data persists in the reflog for ~90 days by default.

### The Directed Acyclic Graph (DAG)

Git history is a DAG. Each commit points to its parent(s). This means:
- Linear history: A ← B ← C
- Branch: A ← B ← C, A ← B ← D
- Merge: A ← B ← C ← E, A ← B ← D ← E (E has two parents)

The arrows point **backward** — children know their parents, parents do not know their children. This is fundamental. You can always find ancestors; finding descendants requires searching.

---

## The Four Objects

Git's entire history is made of exactly four object types, stored in `.git/objects/`. Every object is identified by its SHA-1 hash (40 hex chars). Git 2.29+ supports SHA-256 experimentally.

### 1. Blob (File Content)

A blob stores the raw content of a file — **no filename, no permissions, just bytes**.

```
blob <size>\0<content>
```

Two files with identical content across your entire history are stored as **one blob**. This is the deduplication mechanism.

```bash
# Inspect a blob
git cat-file -t <sha>       # prints "blob"
git cat-file -p <sha>       # prints raw content
git cat-file blob HEAD:path/to/file
```

### 2. Tree (Directory)

A tree maps names and permissions to blobs or other trees. It represents a directory snapshot.

```
tree <size>\0
<mode> <name>\0<binary-sha>
<mode> <name>\0<binary-sha>
...
```

Modes:
| Mode    | Meaning            |
|---------|--------------------|
| `100644`| Regular file       |
| `100755`| Executable file    |
| `120000`| Symbolic link      |
| `040000`| Directory (subtree)|
| `160000`| Gitlink (submodule)|

```bash
git cat-file -p HEAD^{tree}           # root tree of HEAD
git cat-file -p HEAD^{tree}:src       # subtree
git ls-tree HEAD                      # human-readable listing
git ls-tree -r HEAD                   # recursive, all files
git ls-tree -r --name-only HEAD       # just filenames
```

### 3. Commit

A commit ties together: a root tree, parent commit(s), author, committer, and message.

```
commit <size>\0
tree <tree-sha>
parent <parent-sha>          (zero or more parent lines)
author <name> <email> <unix-timestamp> <tz>
committer <name> <email> <unix-timestamp> <tz>
gpgsig <signature>           (optional, for signed commits)

<blank line>
<commit message>
```

Key distinction: **author** (who wrote the change) vs **committer** (who applied the commit). They differ after rebases, cherry-picks, or applying patches from email.

```bash
git cat-file -p HEAD                  # inspect commit object
git log --format=raw                  # show raw commit data
git show --format=raw HEAD            # with diff
```

### 4. Tag Object (Annotated Tag)

Annotated tags are full objects with a tagger, date, message, and optional GPG signature. Lightweight tags are just refs (pointers), not objects.

```
tag <size>\0
object <sha>
type commit
tag <tagname>
tagger <name> <email> <timestamp> <tz>

<message>
<gpgsig>
```

```bash
git cat-file -p v1.0.0               # inspect annotated tag object
git cat-file tag v1.0.0              # same
```

### Object Storage Layout

```
.git/objects/
  ab/                            ← first 2 chars of SHA
    cdef1234...                  ← remaining 38 chars
  pack/
    pack-<sha>.pack              ← packfile
    pack-<sha>.idx               ← packfile index
  info/
```

```bash
# Manually hash content as git would
echo -n "hello" | git hash-object --stdin
# Hash and store
echo "hello" | git hash-object -w --stdin
# Walk all objects
git cat-file --batch-all-objects --batch-check
```

---

## The Three Trees

Git manages three distinct "trees" (collections of files):

```
┌─────────────────┐    git add     ┌─────────────────┐   git commit   ┌─────────────────┐
│   Working Tree  │ ─────────────> │  Index (Stage)  │ ─────────────> │   HEAD Commit   │
│  (your files)   │                │  (.git/index)   │                │   (history)     │
└─────────────────┘                └─────────────────┘                └─────────────────┘
        ↑                                                                      │
        └──────────────────────── git checkout / restore ─────────────────────┘
```

| Tree         | Location          | Description                              |
|--------------|-------------------|------------------------------------------|
| Working Tree | Project directory | What you see and edit                    |
| Index        | `.git/index`      | Staged snapshot; next commit's content   |
| HEAD         | `.git/HEAD`       | Last commit; what was last committed     |

Understanding which tree each command reads/writes is the key to mastering Git.

---

## References, Branches, and Tags

### What a Branch Actually Is

A branch is **just a text file containing a 40-character SHA-1**. That's it.

```
.git/refs/heads/main  →  contents: "a1b2c3d4e5f6..."
```

When you commit, Git:
1. Creates the commit object
2. **Writes the new SHA to the current branch file**

That's the entire mechanism. Branches are extraordinarily cheap: ~41 bytes on disk.

```bash
cat .git/refs/heads/main              # the raw pointer
git rev-parse main                    # same via API
git rev-parse --symbolic-full-name HEAD  # what HEAD points to
```

### Packed Refs

After many refs, Git packs them into `.git/packed-refs` for performance:

```
# pack-refs with: peeled fully-peeled sorted
a1b2c3... refs/heads/main
^d4e5f6... refs/tags/v1.0.0    ← ^ = dereferenced tag object SHA
```

### Ref Namespaces

| Namespace             | Meaning                              |
|-----------------------|--------------------------------------|
| `refs/heads/*`        | Local branches                       |
| `refs/remotes/*`      | Remote-tracking branches             |
| `refs/tags/*`         | Tags                                 |
| `refs/stash`          | The stash                            |
| `refs/notes/*`        | Git notes                            |
| `refs/replace/*`      | Git replace                          |

### Tag Types

**Lightweight tag**: just a ref pointer to a commit SHA. No object created.
```bash
git tag v1.0.0                        # lightweight: just a ref
```

**Annotated tag**: creates a tag object; points to that object which points to commit.
```bash
git tag -a v1.0.0 -m "Release 1.0"   # annotated: full object
git tag -s v1.0.0 -m "Signed"        # signed: GPG signature
```

Always use annotated tags for releases. They carry metadata and can be signed.

---

## The HEAD Pointer

`HEAD` is a special reference in `.git/HEAD`. It usually points to a branch:

```
ref: refs/heads/main
```

When you commit, the branch moves; HEAD follows because HEAD points to the branch, not directly to a commit.

### Detached HEAD

When HEAD points directly to a commit SHA (not a branch):

```
a1b2c3d4e5f6...   ← detached HEAD
```

This happens after:
- `git checkout <sha>`
- `git checkout v1.0.0` (tag)
- `git rebase` (during operation)
- `git bisect`

In detached HEAD, commits you make are **not reachable from any branch**. They'll be garbage collected eventually. To save them: `git branch new-branch-name`.

```bash
git symbolic-ref HEAD                 # errors if detached
git rev-parse --abbrev-ref HEAD       # prints "HEAD" if detached
git branch --show-current             # empty if detached (git 2.22+)
```

---

## The Index (Staging Area)

The index (`.git/index`) is a binary file that tracks:
- Staged file content (as blob SHAs)
- Stat data (mtime, ctime, dev, ino, uid, gid, size)
- Merge state (for conflict resolution)

The stat data is how Git quickly detects modifications without hashing every file.

### Index States per File

Each file in the index can be in one of several states during a merge conflict:

| Stage | Meaning         |
|-------|-----------------|
| 0     | Normal (no conflict) |
| 1     | Common ancestor (base) |
| 2     | "Ours" (current branch) |
| 3     | "Theirs" (merging branch) |

```bash
git ls-files                          # list tracked files
git ls-files -s                       # with stage info and SHAs
git ls-files -u                       # unmerged (conflicted) files
git ls-files -o                       # untracked files
git ls-files -d                       # deleted files
git ls-files --eol                    # line ending info
git diff --cached                     # diff index vs HEAD
git diff                              # diff working tree vs index
```

---

## The Reflog

The reflog is your safety net. Git records every movement of HEAD and branch tips.

```bash
git reflog                            # HEAD reflog
git reflog show main                  # branch reflog
git reflog --all                      # all reflogs
git reflog expire --expire=90.days    # manual expiry
```

Reflog entries use syntax like:
```
HEAD@{0}   ← current
HEAD@{1}   ← one step ago
HEAD@{2}   ← two steps ago
main@{yesterday}
main@{2.weeks.ago}
HEAD@{5.minutes.ago}
```

**The reflog is local and private.** It does not clone, push, or pull.

---

## Packfiles and Storage

Git uses two storage strategies:

**Loose objects**: One file per object in `.git/objects/ab/cdef...`. Used for new objects.

**Packfiles**: Many objects delta-compressed into one `.pack` file + `.idx` index. Created by:
- `git gc`
- `git repack`
- After fetch/push operations
- Automatically when loose object count exceeds `gc.auto` (default: 6700)

### Delta Compression

Packfiles store objects as deltas against similar objects (not necessarily parent commits — Git finds the most similar object in the window). This is why `git clone` is often much smaller than the sum of all snapshots.

```bash
git count-objects -v                  # loose vs packed stats
git gc                                # run garbage collection + repack
git gc --aggressive                   # more aggressive repacking
git repack -a -d --depth=250 --window=250  # maximum compression
git verify-pack -v .git/objects/pack/pack-*.idx  # inspect packfile
```

---

## The .git Directory Anatomy

```
.git/
├── HEAD                    ← current branch or commit SHA
├── config                  ← local repo configuration
├── description             ← used by GitWeb, mostly ignored
├── index                   ← staging area (binary)
├── packed-refs             ← packed refs file
│
├── objects/                ← object database
│   ├── info/
│   ├── pack/               ← packfiles (.pack + .idx)
│   └── [0-9a-f][0-9a-f]/  ← loose objects (2-char prefix dirs)
│
├── refs/
│   ├── heads/              ← local branches
│   ├── remotes/            ← remote-tracking branches
│   │   └── origin/
│   └── tags/               ← tags
│
├── logs/                   ← reflogs
│   ├── HEAD
│   └── refs/
│       ├── heads/
│       └── remotes/
│
├── hooks/                  ← hook scripts
│   ├── pre-commit.sample
│   ├── commit-msg.sample
│   └── ...
│
├── info/
│   └── exclude             ← local gitignore (not committed)
│
├── COMMIT_EDITMSG          ← last commit message (temp)
├── MERGE_HEAD              ← SHA of commit being merged (during merge)
├── MERGE_MSG               ← draft merge commit message
├── MERGE_MODE              ← merge mode flag
├── CHERRY_PICK_HEAD        ← SHA during cherry-pick
├── REVERT_HEAD             ← SHA during revert
├── REBASE_HEAD             ← SHA during rebase
│
├── rebase-merge/           ← interactive rebase state
│   ├── git-rebase-todo
│   ├── onto
│   ├── head-name
│   └── ...
│
└── shallow                 ← shallow clone boundary SHAs
```

---

## Commit Ranges and Revision Syntax

Git has a rich syntax for specifying commits and ranges:

### Single Commit Specifiers

| Syntax           | Meaning                                          |
|------------------|--------------------------------------------------|
| `HEAD`           | Current commit                                   |
| `HEAD~`          | First parent of HEAD                             |
| `HEAD~2`         | Grandparent (first-parent chain)                 |
| `HEAD^`          | First parent (same as `~`)                       |
| `HEAD^2`         | Second parent (for merges)                       |
| `HEAD^^^`        | Three levels up via first parents                |
| `HEAD~3^2`       | Second parent of the 3rd ancestor                |
| `@`              | Shorthand for HEAD                               |
| `@{upstream}`    | Upstream of current branch                       |
| `@{push}`        | Push destination                                 |
| `main@{3}`       | Main branch 3 reflog entries ago                 |
| `main@{yesterday}` | Main branch at yesterday midnight             |
| `v1.0.0^{}`      | Dereference tag to commit                        |
| `v1.0.0^{commit}`| Same as above                                   |
| `:/fix bug`      | Most recent commit matching "fix bug"            |
| `HEAD:path/file` | File content at HEAD                             |
| `:path/file`     | File content in index                            |
| `:1:path/file`   | File in index stage 1 (merge base)               |

### Range Specifiers

| Syntax      | Meaning                                                      |
|-------------|--------------------------------------------------------------|
| `A..B`      | Commits reachable from B but NOT from A (exclusive start)    |
| `A...B`     | Symmetric difference: in A or B but not both                 |
| `^A B`      | Commits reachable from B but not A (same as `A..B`)          |
| `A..`       | Commits from A's tip to HEAD                                 |
| `..B`       | Commits from beginning to B not in current branch            |
| `--ancestry-path A..B` | Only commits on paths between A and B           |

```bash
git log main..feature              # commits in feature not in main
git log main...feature             # commits in either, not both
git log HEAD~5..HEAD               # last 5 commits
git log --left-right main...feature  # with < > markers showing side
```

---
*End of Part 1*
