# THE GIT BIBLE
## Part 2: Complete Command Reference

> Every flag. Every option. Every behavior. This is the complete map.

---

## Table of Contents
1. [Setup & Configuration](#setup--configuration)
2. [Repository Creation](#repository-creation)
3. [Staging & Snapshotting](#staging--snapshotting)
4. [Branching & Merging](#branching--merging)
5. [Sharing & Updating (Remotes)](#sharing--updating-remotes)
6. [Inspection & Comparison](#inspection--comparison)
7. [Patching & Rewriting](#patching--rewriting)
8. [Debugging & Searching](#debugging--searching)
9. [Advanced Plumbing](#advanced-plumbing)
10. [Administration](#administration)

---

## Setup & Configuration

### `git config`

Git has three configuration scopes, each overriding the previous:

| Scope      | Flag       | File location                          |
|------------|------------|----------------------------------------|
| System     | `--system` | `/etc/gitconfig`                       |
| Global     | `--global` | `~/.gitconfig` or `~/.config/git/config` |
| Local      | `--local`  | `.git/config`                          |
| Worktree   | `--worktree` | `.git/config.worktree`               |

```bash
# Reading
git config --list                          # all config, all scopes
git config --list --show-origin            # with file source
git config --list --show-scope             # with scope label
git config user.name                       # read single value
git config --global --get-all core.excludesfile  # multi-value

# Writing
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
git config --local core.autocrlf false
git config --global --unset http.proxy     # remove value
git config --global --remove-section alias # remove section
git config --global --rename-section "old" "new"

# Edit raw file
git config --global --edit
```

### Essential Configuration

```bash
# Identity (required)
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
git config --global user.signingkey <gpg-key-id>

# Core behavior
git config --global core.editor "vim"
git config --global core.autocrlf input      # mac/linux: input, windows: true
git config --global core.eol lf
git config --global core.whitespace fix
git config --global core.filemode true       # track executable bit
git config --global core.ignorecase false    # case-sensitive
git config --global core.longpaths true      # windows: long paths

# Pager
git config --global core.pager "less -FRX"
git config --global pager.log false          # disable pager for log

# Diff & Merge
git config --global diff.tool vimdiff
git config --global merge.tool vimdiff
git config --global diff.algorithm histogram  # histogram|patience|minimal|myers
git config --global merge.conflictstyle diff3 # or zdiff3 (git 2.35+)

# Pull strategy
git config --global pull.rebase true          # rebase instead of merge on pull
git config --global pull.ff only              # fail if not fast-forward

# Push
git config --global push.default current      # simple|current|upstream|matching|nothing
git config --global push.autoSetupRemote true # git 2.37+
git config --global push.followTags true      # push tags with commits

# Fetch
git config --global fetch.prune true          # auto-prune stale remote-tracking
git config --global fetch.prunetags true      # git 2.17+
git config --global fetch.parallel 0          # 0 = auto-parallelism

# Rebase
git config --global rebase.autoStash true     # stash before rebase
git config --global rebase.autoSquash true    # honor fixup! and squash! messages
git config --global rebase.updateRefs true    # git 2.38+: update stacked branches

# Signing
git config --global commit.gpgSign true
git config --global tag.gpgSign true
git config --global gpg.format ssh            # ssh|openpgp|x509

# Colors
git config --global color.ui auto
git config --global color.diff.old "red"
git config --global color.diff.new "green"

# Rerere (Reuse Recorded Resolution)
git config --global rerere.enabled true
git config --global rerere.autoUpdate true

# Aliases (covered in Part 4)
git config --global alias.st status
git config --global alias.co checkout
git config --global alias.lg "log --oneline --graph --decorate --all"
```

---

## Repository Creation

### `git init`

```bash
git init                              # init current dir
git init <directory>                  # init new dir
git init --bare                       # bare repo (no working tree; for servers)
git init --bare repo.git
git init --shared=group               # set group permissions (for servers)
git init --shared=0664                # octal permissions
git init -b main                      # set initial branch name (git 2.28+)
git init --object-format=sha256       # use SHA-256 (git 2.29+, experimental)
git init --template=<dir>             # use custom template directory
```

### `git clone`

```bash
git clone <url>                       # clone into dir named from URL
git clone <url> <directory>           # clone into specific dir
git clone --depth=1 <url>             # shallow: only latest snapshot
git clone --depth=1 --no-single-branch <url>  # shallow but all branches
git clone --branch main <url>         # clone specific branch
git clone --branch v1.0.0 <url>       # clone at tag
git clone --single-branch <url>       # only clone one branch
git clone --no-tags <url>             # skip fetching tags
git clone --bare <url>                # bare clone
git clone --mirror <url>              # mirror: includes all refs + config
git clone --sparse <url>              # sparse checkout (no files)
git clone --filter=blob:none <url>    # blobless: history without file content
git clone --filter=tree:0 <url>       # treeless: no trees or blobs
git clone --recurse-submodules <url>  # clone with submodules
git clone --jobs 4 <url>              # parallel submodule fetch
git clone -o upstream <url>           # name remote "upstream" instead of "origin"
git clone --local /path/to/repo       # hard-link local clone (fast)
git clone --dissociate --reference /path/to/repo <url>  # borrow then dissociate
```

---

## Staging & Snapshotting

### `git status`

```bash
git status                            # full status
git status -s                         # short format
git status -sb                        # short + branch info
git status --porcelain                # machine-readable (v1)
git status --porcelain=v2             # machine-readable (v2, more info)
git status -u                         # show untracked files (default: normal)
git status -uno                       # don't show untracked
git status -uall                      # show all files in untracked dirs
git status --ignored                  # show ignored files
git status --renames                  # show renames explicitly
git status -v                         # show diff of staged changes
git status -vv                        # also show diff of unstaged changes
```

Short format codes:
```
XY PATH
XY ORIG_PATH -> PATH

X = index status, Y = working tree status
? = untracked
! = ignored
M = modified
A = added
D = deleted
R = renamed
C = copied
U = updated but unmerged
```

### `git add`

```bash
git add <file>                        # stage specific file
git add <dir>                         # stage directory recursively
git add .                             # stage all changes in current dir
git add -A                            # stage all changes (add + delete + modify)
git add --all                         # same as -A
git add -u                            # stage modifications + deletions (no new files)
git add -p                            # interactive patch staging (most powerful)
git add --patch                       # same as -p
git add -i                            # full interactive staging menu
git add --interactive                 # same as -i
git add -N <file>                     # intent-to-add: track as empty
git add --intent-to-add <file>        # same
git add -f <file>                     # force add (override .gitignore)
git add --force <file>                # same
git add --dry-run                     # show what would be added
git add -n                            # same as --dry-run
git add --chmod=+x <file>             # stage with executable bit change
git add --chmod=-x <file>             # stage without executable bit
git add --renormalize .               # re-apply line ending normalization
git add --sparse                      # update sparse-checkout index
git add --edit                        # open diff in editor to stage hunks
```

**Interactive patch mode sub-commands:**
```
y - stage this hunk
n - do not stage this hunk
q - quit (don't stage this or any remaining)
a - stage this and all remaining hunks
d - don't stage this or any remaining in this file
s - split into smaller hunks
e - manually edit the hunk
? - help
```

### `git commit`

```bash
git commit                            # open editor for message
git commit -m "message"               # inline message
git commit -m "title" -m "body"       # multi-paragraph (each -m is a paragraph)
git commit -a                         # auto-stage modified+deleted tracked files
git commit -am "message"              # -a + -m combined
git commit --amend                    # modify last commit (message + content)
git commit --amend --no-edit          # amend without changing message
git commit --amend --author="Name <email>"  # change author
git commit --amend --reset-author     # reset author to current user
git commit -C HEAD                    # reuse last commit message
git commit -c HEAD                    # reuse + edit last commit message
git commit --squash=HEAD~             # create squash commit (for autosquash rebase)
git commit --fixup=HEAD~              # create fixup commit (for autosquash rebase)
git commit --fixup=reword:HEAD~       # reword fixup (git 2.32+)
git commit --fixup=amend:HEAD~        # amend fixup (git 2.32+)
git commit --allow-empty              # commit with no changes
git commit --allow-empty-message      # commit with empty message
git commit --no-verify                # skip pre-commit and commit-msg hooks
git commit --dry-run                  # show what would be committed
git commit -S                         # GPG-sign the commit
git commit -S --gpg-sign=<keyid>      # sign with specific key
git commit --no-gpg-sign              # don't sign even if configured
git commit --date="2024-01-15 10:00"  # set author date
git commit --date="@1705312800"       # unix timestamp
git commit --trailer "Co-authored-by: Name <email>"  # add trailer
git commit --verbose                  # show diff in editor
git commit -v                         # same
git commit -vv                        # diff index and working tree in editor
git commit --only <file>              # commit only specific file (bypass index)
git commit --include <file>           # add file to index and commit
git commit --pathspec-from-file=<file> # read paths from file
git commit -e                         # edit message regardless of -m
git commit --reset-author             # use committer info as author
```

### `git restore` (Git 2.23+)

```bash
git restore <file>                    # discard working tree changes
git restore .                         # discard all working tree changes
git restore --staged <file>           # unstage (keep working tree changes)
git restore --staged .                # unstage everything
git restore --staged --worktree <file> # unstage AND discard working tree
git restore -SW <file>                # same as above
git restore --source=HEAD~2 <file>    # restore to 2 commits ago
git restore --source=<sha> <file>     # restore to specific commit
git restore --source=<branch> <file>  # restore from another branch
git restore -p <file>                 # interactive: choose hunks
git restore --patch <file>            # same
git restore --ours <file>             # use "ours" version during conflict
git restore --theirs <file>           # use "theirs" version during conflict
git restore --merge <file>            # recreate merge conflict markers
git restore --conflict=diff3 <file>   # use diff3 conflict style
git restore --worktree <file>         # explicit working tree only
git restore -W <file>                 # same
git restore --no-overlay              # also delete files not in source
git restore --overlay                 # don't delete, just update
```

### `git rm`

```bash
git rm <file>                         # remove file from index AND working tree
git rm -r <dir>                       # recursive removal
git rm --cached <file>                # remove from index ONLY (keep in working tree)
git rm --cached -r .                  # un-track everything (git rm from index)
git rm -f <file>                      # force if modified or staged
git rm --force <file>                 # same
git rm -n                             # dry run
git rm --dry-run                      # same
git rm --ignore-unmatch               # don't error if file doesn't exist
git rm -q                             # quiet
```

### `git mv`

```bash
git mv <old> <new>                    # rename/move file
git mv -f <old> <new>                 # force (overwrite if target exists)
git mv -n                             # dry run
git mv -v                             # verbose
```

### `.gitignore`

```bash
# .gitignore pattern rules:
# - Blank lines and lines starting with # are ignored
# - A pattern matches relative to .gitignore location
# - / at start = anchored to directory containing .gitignore
# - / at end = matches only directories
# - ! negates a pattern
# - ** matches any number of directories

# Examples
*.log            # ignore all .log files
!important.log   # except this one
/TODO            # only /TODO at root, not subdir/TODO
build/           # ignore build directory
doc/**/*.pdf     # ignore pdfs anywhere under doc/
**/logs          # ignore logs dir anywhere

# Priority (highest to lowest):
# 1. Command-line patterns (-x flag)
# 2. .gitignore in same directory
# 3. .gitignore in parent directories (up to repo root)
# 4. $GIT_DIR/info/exclude (local, not committed)
# 5. core.excludesFile (~/.gitignore_global)

git check-ignore -v <file>            # why is this file ignored?
git check-ignore --no-index <file>    # check even if tracked
git ls-files --others --ignored --exclude-standard  # list all ignored
```

---

## Branching & Merging

### `git branch`

```bash
# Listing
git branch                            # local branches
git branch -r                         # remote-tracking branches
git branch -a                         # all (local + remote)
git branch -v                         # with last commit info
git branch -vv                        # with upstream tracking info
git branch --show-current             # current branch (git 2.22+)
git branch --list "feature/*"         # filter by pattern
git branch --sort=-committerdate      # sort by recent commit
git branch --sort=refname             # alphabetical
git branch --format="%(refname:short) %(upstream:short)"  # custom format
git branch --merged                   # branches merged into HEAD
git branch --no-merged                # branches NOT merged into HEAD
git branch --merged main              # branches merged into main
git branch --contains <sha>           # branches containing commit

# Creating
git branch <name>                     # create at HEAD
git branch <name> <sha>               # create at specific commit
git branch <name> <remote>/<branch>   # create tracking a remote

# Deleting
git branch -d <name>                  # delete (safe: checks merged)
git branch -D <name>                  # force delete
git branch -d -r origin/feature       # delete remote-tracking ref locally
git push origin --delete <branch>     # delete branch on remote

# Moving/Renaming
git branch -m <old> <new>             # rename branch
git branch -m <new>                   # rename current branch
git branch -M <new>                   # force rename (overwrite)
git push origin -u <new>              # push renamed branch
git push origin --delete <old>        # delete old remote branch

# Upstream tracking
git branch --set-upstream-to=origin/main main
git branch -u origin/main             # short form
git branch --unset-upstream           # remove tracking
git branch --track <name> <remote>/<branch>  # create with tracking
git branch --no-track <name>          # create without tracking
```

### `git switch` (Git 2.23+)

```bash
git switch <branch>                   # switch to branch
git switch -                          # switch to previous branch
git switch -c <new-branch>            # create and switch
git switch -C <new-branch>            # force create (overwrite if exists) and switch
git switch -c <new> <sha>             # create from specific commit
git switch -c <new> origin/feature    # create tracking remote branch
git switch --track origin/feature     # create matching remote (same name)
git switch --no-track -c feature origin/feature  # no tracking
git switch -d <sha>                   # detach HEAD at SHA
git switch --detach <sha>             # same
git switch --orphan <new-branch>      # create branch with no history
git switch -m <branch>                # merge current changes into branch
git switch --merge <branch>           # same
git switch --conflict=diff3 <branch>  # use diff3 conflict style
git switch --discard-changes          # discard local changes
git switch -q                         # quiet
```

### `git checkout` (classic, still works)

```bash
# Branch operations
git checkout <branch>                 # switch branch
git checkout -                        # switch to previous
git checkout -b <new>                 # create and switch
git checkout -B <new>                 # force create and switch
git checkout -b <new> origin/feature  # create from remote
git checkout --orphan <name>          # new branch, no history
git checkout --detach <branch>        # detach at branch tip

# File operations (use git restore for these in modern git)
git checkout -- <file>                # discard working tree changes
git checkout HEAD -- <file>           # restore from HEAD
git checkout <sha> -- <file>          # restore file from commit
git checkout <branch> -- <file>       # restore file from other branch
git checkout -p <sha> -- <file>       # interactive patch restore
git checkout --ours <file>            # resolve conflict with ours
git checkout --theirs <file>          # resolve conflict with theirs

# Flags
git checkout -m <branch>              # merge instead of overwrite
git checkout --conflict=diff3         # change conflict style
git checkout --no-guess               # don't guess remote branch
git checkout -q                       # quiet
git checkout --progress               # show progress
```

### `git merge`

```bash
git merge <branch>                    # merge branch into current
git merge <sha>                       # merge specific commit
git merge origin/main                 # merge remote-tracking branch
git merge --ff-only <branch>          # only if fast-forward possible
git merge --no-ff <branch>            # always create merge commit
git merge --squash <branch>           # squash all commits into staged changes
git merge --squash --no-commit        # squash + don't auto-commit
git merge --no-commit <branch>        # merge but don't commit
git merge --edit <branch>             # open editor for merge commit message
git merge --no-edit <branch>          # use default merge commit message
git merge -m "message" <branch>       # custom merge commit message
git merge --abort                     # abort in-progress merge
git merge --quit                      # abandon in-progress merge
git merge --continue                  # continue after resolving conflicts
git merge -X ours <branch>            # on conflict, prefer ours
git merge -X theirs <branch>          # on conflict, prefer theirs
git merge -X ignore-space-change      # ignore whitespace in conflict
git merge -X ignore-all-space         # ignore all whitespace
git merge --allow-unrelated-histories # merge repos with no common ancestor
git merge --strategy=recursive        # default strategy (2 heads)
git merge --strategy=octopus          # default for 3+ heads
git merge --strategy=ours             # keep ours entirely (discard theirs)
git merge --strategy=subtree          # subtree merge
git merge --strategy-option=ours      # same as -X ours
git merge --verify-signatures         # require signed merge branch tip
git merge --log=50                    # populate commit list in merge message
git merge --stat                      # show diffstat after merge
git merge --no-stat                   # suppress diffstat
git merge --autostash                 # stash, merge, pop
git merge --into-name <branch>        # pretend merging into this branch
git merge --overwrite-ignore          # overwrite ignored files
git merge --progress                  # show progress
```

**Fast-forward vs. Merge Commit:**
```
Fast-forward (--ff):          Merge commit (--no-ff):
A → B → C (main)              A → B → C → M (main)
              ↑                         ↑   ↗
              feature               feature D → E
     result: A → B → C → D → E
```

### `git rebase`

```bash
git rebase <branch>                   # rebase current onto branch
git rebase <upstream> <branch>        # rebase branch onto upstream
git rebase --onto <newbase> <upstream> <branch>  # transplant
git rebase --onto main feature~3 feature  # replay last 3 commits onto main
git rebase -i HEAD~3                  # interactive: last 3 commits
git rebase -i HEAD~10                 # interactive: last 10 commits
git rebase -i <sha>                   # interactive: from sha (exclusive)
git rebase -i --root                  # interactive: entire history
git rebase --autosquash               # honor fixup!/squash! prefixes
git rebase --autostash                # stash + rebase + unstash
git rebase --no-autosquash            # disable autosquash
git rebase --abort                    # abort in-progress rebase
git rebase --continue                 # continue after resolving conflicts
git rebase --skip                     # skip current patch
git rebase --quit                     # abandon rebase (don't restore)
git rebase --edit-todo                # edit todo list mid-rebase
git rebase --show-current-patch       # show current patch being applied
git rebase -x "make test"             # exec command after each commit
git rebase --exec "npm test"          # same
git rebase -X ours                    # strategy option
git rebase -X theirs                  # strategy option
git rebase --merge                    # use merge strategies
git rebase --strategy=recursive       # explicit strategy
git rebase --strategy-option=ours     # strategy option
git rebase --empty=drop               # drop commits that become empty
git rebase --empty=keep               # keep empty commits
git rebase --empty=ask                # ask (interactive mode)
git rebase --no-reapply-cherry-picks  # skip already-applied commits
git rebase --reapply-cherry-picks     # force reapply all
git rebase --committer-date-is-author-date  # preserve author date
git rebase --ignore-date              # reset author date to committer date
git rebase --reset-author-date        # same
git rebase --no-verify                # skip hooks
git rebase --verify                   # run hooks
git rebase --fork-point               # use fork-point to find diverge
git rebase --no-fork-point            # don't use fork-point
git rebase --reschedule-failed-exec   # reschedule failed exec commands
git rebase --keep-empty               # keep commits that result in empty tree
git rebase --update-refs              # update stacked branches (git 2.38+)
```

**Interactive rebase commands:**
```
p, pick <commit>     = use commit
r, reword <commit>   = use commit, but edit message
e, edit <commit>     = use commit, but stop for amending
s, squash <commit>   = meld into previous commit
f, fixup <commit>    = like squash, but discard this message
f, fixup -C <commit> = use this message, discard previous
x, exec <command>    = run shell command
b, break             = stop here (continue with --continue)
d, drop <commit>     = remove commit
l, label <label>     = label current HEAD
t, reset <label>     = reset HEAD to a label
m, merge [-C <commit>] <label>  = create a merge commit
```

### `git cherry-pick`

```bash
git cherry-pick <sha>                 # apply commit to current branch
git cherry-pick <sha1> <sha2>         # apply multiple commits
git cherry-pick <sha1>..<sha2>        # apply range (exclusive start)
git cherry-pick <sha1>^..<sha2>       # apply range (inclusive start)
git cherry-pick -n <sha>              # apply changes but don't commit
git cherry-pick --no-commit <sha>     # same
git cherry-pick -e <sha>              # edit commit message
git cherry-pick -x <sha>              # append "(cherry picked from...)"
git cherry-pick -s <sha>              # append signed-off-by
git cherry-pick --allow-empty         # allow empty commits
git cherry-pick --allow-empty-message # allow empty message
git cherry-pick --keep-redundant-commits  # keep even if already applied
git cherry-pick -m 1 <merge-sha>      # cherry-pick a merge commit (parent 1)
git cherry-pick --abort               # abort in-progress cherry-pick
git cherry-pick --continue            # continue after conflict resolution
git cherry-pick --quit                # abandon cherry-pick
git cherry-pick --skip                # skip current commit
git cherry-pick --strategy=recursive  # explicit strategy
git cherry-pick -X ours               # prefer ours on conflict
git cherry-pick --no-gpg-sign         # don't sign
git cherry-pick -S                    # GPG sign result
```

### `git revert`

```bash
git revert <sha>                      # create commit undoing sha
git revert HEAD                       # revert last commit
git revert HEAD~3..HEAD               # revert range of commits
git revert <sha1> <sha2>              # revert multiple
git revert -n <sha>                   # stage revert, don't commit
git revert --no-commit <sha>          # same
git revert -m 1 <merge-sha>           # revert a merge commit (keep parent 1)
git revert --abort                    # abort in-progress revert
git revert --continue                 # continue after conflict
git revert --quit                     # abandon revert
git revert --skip                     # skip this revert
git revert --no-edit                  # don't open editor
git revert -S                         # GPG sign revert commit
```

### `git stash`

```bash
git stash                             # stash modified tracked files
git stash push                        # explicit push (same as above)
git stash push -m "description"       # with message
git stash push -u                     # include untracked files
git stash push --include-untracked    # same
git stash push -a                     # include untracked + ignored
git stash push --all                  # same
git stash push -p                     # interactive: choose hunks
git stash push --patch                # same
git stash push -S                     # staged only
git stash push --staged               # same
git stash push --keep-index           # stash unstaged, keep staged
git stash push -- <path>              # stash specific files only
git stash push -m "msg" -- <path>     # message + specific files

git stash list                        # list all stashes
git stash list --stat                 # with file stats
git stash list -p                     # with full diff
git stash show                        # show stash@{0} diff
git stash show -p                     # show full diff
git stash show stash@{2}              # show specific stash
git stash show --stat stash@{1}       # show stat

git stash pop                         # apply stash@{0} + drop
git stash pop stash@{2}               # apply specific + drop
git stash pop --index                 # also restore staged state
git stash pop --quiet                 # suppress output
git stash apply                       # apply without dropping
git stash apply stash@{2}             # apply specific
git stash apply --index               # restore staged state

git stash drop                        # drop stash@{0}
git stash drop stash@{2}              # drop specific
git stash clear                       # remove ALL stashes
git stash branch <branchname>         # create branch from stash
git stash branch <branchname> stash@{1}  # from specific stash
git stash create                      # create stash object without storing ref
git stash store -m "msg" <sha>        # store pre-created stash
```

---

## Sharing & Updating (Remotes)

### `git remote`

```bash
git remote                            # list remote names
git remote -v                         # list with URLs
git remote add origin <url>           # add remote
git remote add upstream <url>         # add second remote
git remote remove origin              # remove remote
git remote rm origin                  # same
git remote rename origin upstream     # rename
git remote set-url origin <newurl>    # change URL
git remote set-url --add origin <url> # add push URL
git remote set-url --delete origin <url>  # remove push URL
git remote get-url origin             # show fetch URL
git remote get-url --push origin      # show push URL
git remote get-url --all origin       # show all URLs
git remote show origin                # detailed info: branches, tracking
git remote update                     # fetch all remotes
git remote update --prune             # fetch + prune all remotes
git remote prune origin               # remove stale remote-tracking refs
git remote set-head origin main       # set default branch for remote
git remote set-head origin --auto     # auto-detect default branch
git remote set-branches origin main develop  # limit branches fetched
git remote set-branches --add origin feat    # add to tracked set
```

### `git fetch`

```bash
git fetch                             # fetch from tracking remote
git fetch origin                      # fetch all branches from origin
git fetch origin main                 # fetch specific branch
git fetch origin main:refs/remotes/origin/main  # explicit refspec
git fetch --all                       # fetch all remotes
git fetch --multiple origin upstream  # fetch multiple remotes
git fetch --prune                     # remove stale remote-tracking
git fetch --prune --prune-tags        # also prune remote tags
git fetch --tags                      # fetch all tags
git fetch --no-tags                   # don't fetch tags
git fetch --depth=1                   # shallow fetch
git fetch --deepen=10                 # deepen shallow by 10 commits
git fetch --shallow-since="2024-01-01"  # fetch since date
git fetch --shallow-exclude=<sha>     # exclude commit + ancestors
git fetch --unshallow                 # convert shallow to full clone
git fetch --update-shallow            # update grafts for shallow
git fetch --jobs=4                    # parallel submodule fetch
git fetch --recurse-submodules        # fetch submodules too
git fetch --recurse-submodules=yes    # force recurse
git fetch --recurse-submodules=no     # disable
git fetch --set-upstream              # set upstream if not set
git fetch --dry-run                   # show what would be fetched
git fetch --verbose                   # more output
git fetch --quiet                     # less output
git fetch --force                     # force update tracking branches
git fetch --append                    # append to FETCH_HEAD
git fetch --update-head-ok            # allow updating checked out branch
git fetch --ipv4                      # use only IPv4
git fetch --ipv6                      # use only IPv6
```

### `git pull`

```bash
git pull                              # fetch + merge current tracking
git pull origin main                  # fetch + merge specific
git pull --rebase                     # fetch + rebase (preferred workflow)
git pull --rebase=preserve            # rebase preserving local merges
git pull --rebase=merges              # rebase including merges
git pull --rebase=interactive         # interactive rebase during pull
git pull --no-rebase                  # force merge even if configured
git pull --ff-only                    # fail if not fast-forward
git pull --no-ff                      # create merge commit always
git pull --squash                     # squash into one commit
git pull --autostash                  # auto stash/unstash
git pull --no-commit                  # don't auto-commit
git pull --depth=1                    # shallow pull
git pull --unshallow                  # unshallow
git pull --tags                       # fetch tags
git pull --no-tags                    # don't fetch tags
git pull --prune                      # prune stale tracking
git pull --verbose                    # verbose
git pull --quiet                      # quiet
git pull -X ours                      # strategy option
git pull -X theirs                    # strategy option
git pull --allow-unrelated-histories  # merge unrelated repos
git pull --recurse-submodules         # pull submodules too
git pull -j4                          # parallel jobs for submodules
git pull --set-upstream               # set upstream if not set
```

### `git push`

```bash
git push                              # push to tracking upstream
git push origin                       # push to origin
git push origin main                  # push branch to same-named remote
git push origin main:main             # explicit refspec
git push origin feature:main          # push local feature to remote main
git push origin HEAD                  # push current branch
git push origin HEAD:main             # push HEAD to remote main
git push -u origin main               # push + set upstream tracking
git push --set-upstream origin main   # same
git push --all                        # push all local branches
git push --branches                   # same as --all
git push --tags                       # push all tags
git push --follow-tags                # push commits + annotated tags
git push --force                      # force push (DANGEROUS: rewrites remote)
git push -f                           # same
git push --force-with-lease           # force only if remote unchanged (SAFER)
git push --force-with-lease=main:<sha>  # force with specific expected SHA
git push --force-if-includes          # force only if remote tip is in fetch log
git push --no-force-with-lease        # disable lease check
git push --delete origin feature      # delete remote branch
git push origin :feature              # same (empty src = delete)
git push origin --delete v1.0.0       # delete remote tag
git push origin :refs/tags/v1.0.0     # same
git push --dry-run                    # simulate push
git push -n                           # same
git push --verbose                    # verbose
git push --quiet                      # quiet
git push --progress                   # show progress
git push --no-progress                # hide progress
git push --prune                      # remove remote branches not in local
git push --mirror                     # mirror all refs
git push --atomic                     # all-or-nothing for multiple refs
git push --signed                     # sign the push
git push --signed=if-asked            # sign if server requests
git push --no-signed                  # don't sign
git push --receive-pack="git-receive-pack"  # explicit receive-pack
git push --repo=origin                # explicit repository
git push --recurse-submodules=check   # verify submodules are pushed
git push --recurse-submodules=on-demand  # push submodules automatically
git push --recurse-submodules=no      # don't recurse
git push --push-option="ci.skip"      # server-side option
git push -o ci.skip                   # same
git push --ipv4                       # use IPv4
git push --ipv6                       # use IPv6
```

---

## Inspection & Comparison

### `git log`

```bash
# Basic
git log                               # full log
git log --oneline                     # abbreviated
git log --oneline --graph             # ASCII graph
git log --oneline --graph --all       # all branches
git log --oneline --graph --decorate  # with refs
git log --oneline --graph --decorate --all  # THE CANONICAL GRAPH VIEW
git log -n 5                          # last 5 commits
git log -5                            # same
git log --skip=10 -5                  # commits 10-15

# Format
git log --pretty=oneline              # sha + full message
git log --pretty=short                # sha + author + short message
git log --pretty=medium               # default
git log --pretty=full                 # includes committer
git log --pretty=fuller               # includes all dates
git log --pretty=raw                  # raw object format
git log --pretty=email                # email patch format
git log --pretty=reference            # short reference format
git log --format="%H %s"              # custom format
git log --format="%h %an %ar %s"      # common custom
git log --format="%C(yellow)%h%Creset %s %C(green)(%ar)%Creset %C(bold blue)<%an>%Creset"

# Format placeholders
# %H  full commit hash        %h  abbreviated hash
# %T  tree hash               %t  abbreviated tree hash
# %P  parent hashes           %p  abbreviated parent hashes
# %an author name             %ae author email
# %ad author date             %ar author date relative
# %ai author date ISO         %aI author date strict ISO
# %cn committer name          %ce committer email
# %cd committer date          %cr committer date relative
# %s  subject                 %b  body
# %f  sanitized subject (for filenames)
# %e  encoding                %N  notes
# %D  ref names (no wrapping) %d  ref names
# %n  newline                 %x00 any byte as hex
# %(trailers) commit trailers

# Time filtering
git log --since="2024-01-01"          # after date
git log --after="1 week ago"          # relative
git log --until="2024-12-31"          # before date
git log --before="yesterday"          # relative
git log --since="2 weeks ago" --until="1 week ago"

# Author/committer filtering
git log --author="Alice"              # filter by author name (regex)
git log --author="alice@example.com"  # filter by email
git log --committer="Bob"             # filter by committer
git log --grep="fix"                  # filter by commit message (regex)
git log --grep="fix" --grep="bug"     # either pattern (OR)
git log --all-match --grep="fix" --grep="typo"  # both patterns (AND)
git log --invert-grep --grep="WIP"    # exclude matching

# Content filtering
git log -S "function_name"            # pickaxe: added/removed string
git log -S "function_name" --pickaxe-all  # show all files in commit
git log -G "regex_pattern"            # pickaxe with regex
git log -L 10,20:file.txt             # log for line range in file
git log -L :function_name:file.txt    # log for function

# Path filtering
git log -- <path>                     # commits touching path
git log -- <dir>/                     # commits touching dir
git log --follow -- <file>            # follow renames
git log --diff-filter=D -- <file>     # only deletion commits

# Diff output
git log -p                            # show patch
git log --patch                       # same
git log -p -U5                        # patch with 5 lines context
git log --stat                        # show file stats
git log --shortstat                   # one-line stats
git log --summary                     # show mode changes etc.
git log --name-only                   # show changed filenames
git log --name-status                 # show filenames + change type
git log --diff-filter=M               # only modified files (M/A/D/R/C/T/U/X)
git log --dirstat                     # directory change percentages

# Branch/merge
git log --merges                      # only merge commits
git log --no-merges                   # exclude merge commits
git log --min-parents=2               # commits with 2+ parents
git log --max-parents=1               # commits with exactly 1 parent (= no-merges)
git log --first-parent                # only first parent (main line)
git log --left-right A...B            # with < > side markers
git log --cherry-pick A...B           # omit equivalent commits
git log --cherry-mark A...B           # mark equivalent with =

# Output control
git log --decorate                    # show ref names
git log --decorate=full               # full ref names
git log --decorate=no                 # no ref names
git log --source                      # show source ref
git log --use-mailmap                 # use .mailmap for names/emails
git log --full-diff                   # show full diff not just affected files
git log --topo-order                  # topological order
git log --date-order                  # by committer date
git log --author-date-order           # by author date
git log --reverse                     # oldest first
git log --walk-reflogs                # walk reflog not ancestry
git log --simplify-by-decoration      # only commits at refs
git log --show-notes                  # include notes
git log --abbrev-commit               # short SHAs
git log --abbrev=8                    # 8-char SHAs
git log --no-abbrev-commit            # full SHAs
git log --relative-date               # relative dates
git log --date=format:"%Y-%m-%d"      # custom date format
git log --date=iso                    # ISO 8601
git log --date=iso-strict             # strict ISO 8601
git log --date=rfc                    # RFC 2822
git log --date=short                  # YYYY-MM-DD
git log --date=relative               # "2 hours ago"
git log --date=unix                   # unix timestamp
git log --date=local                  # in local timezone
```

### `git diff`

```bash
# What's changed (three trees)
git diff                              # working tree vs index
git diff --cached                     # index vs HEAD (staged changes)
git diff --staged                     # same as --cached
git diff HEAD                         # working tree vs HEAD

# Between commits
git diff <sha1> <sha2>                # between two commits
git diff <sha1>..<sha2>               # same
git diff main feature                 # tips of two branches
git diff HEAD~3 HEAD                  # last 3 commits

# Three-dot diff (vs common ancestor)
git diff main...feature               # changes in feature since branching from main

# Specific files
git diff -- <file>                    # specific file
git diff HEAD -- <file>               # file vs HEAD
git diff <sha> -- <file>              # file at commit

# Statistics
git diff --stat                       # files + insertions/deletions
git diff --shortstat                  # one line summary
git diff --numstat                    # tab-separated numbers (machine readable)
git diff --name-only                  # just filenames
git diff --name-status                # filenames with change type
git diff --summary                    # mode/new/deleted changes
git diff --dirstat                    # directory-level percentages
git diff --dirstat=lines,5            # cumulative lines, threshold 5%
git diff --cumulative                 # cumulative dirstat

# Format control
git diff -p                           # patch format (default)
git diff --patch-with-stat            # patch + stat
git diff -U5                          # 5 lines of context (default: 3)
git diff --unified=5                  # same
git diff --no-color                   # disable colors
git diff --color=always               # force colors
git diff --color-moved                # show moved code blocks differently
git diff --color-moved=zebra          # alternating color for moved lines
git diff --color-words                # word-level diff
git diff --word-diff                  # word-level with {+ +} markers
git diff --word-diff=plain            # with markers
git diff --word-diff=color            # color-only word diff
git diff --word-diff=porcelain        # machine readable
git diff --word-diff-regex=<re>       # custom word regex
git diff --indent-heuristic           # better hunk placement (default)
git diff --no-indent-heuristic        # disable heuristic
git diff --histogram                  # histogram diff algorithm
git diff --patience                   # patience diff algorithm
git diff --minimal                    # minimal diff
git diff --diff-algorithm=histogram   # explicit algorithm
git diff -b                           # ignore whitespace changes
git diff -w                           # ignore all whitespace
git diff --ignore-space-at-eol        # ignore EOL whitespace
git diff --ignore-space-change        # same as -b
git diff --ignore-all-space           # same as -w
git diff --ignore-blank-lines         # ignore blank line changes
git diff --ignore-cr-at-eol           # ignore CR at end of line

# Filtering
git diff --diff-filter=M              # only Modified (M/A/D/R/C/T/U/X/B)
git diff --diff-filter=d              # exclude Deleted (lowercase = exclude)

# Binary files
git diff --binary                     # show binary diffs
git diff --text                       # treat all files as text
git diff --no-ext-diff                # ignore external diff drivers

# Submodules
git diff --submodule                  # show submodule commit changes
git diff --submodule=log              # show submodule log
git diff --submodule=short            # show sha range (default)
git diff --submodule=diff             # show actual submodule diff

# Rename detection
git diff -M                           # detect renames
git diff -M90%                        # rename threshold 90%
git diff -C                           # detect copies
git diff --find-copies-harder         # look everywhere for copies
git diff -D                           # omit preimage for deletes

# Output
git diff --inter-hunk-context=2       # show context between hunks
git diff --function-context           # show whole function
git diff -W                           # show whole function (same as above)
git diff --ext-diff                   # use external diff tool
git diff --no-prefix                  # no a/ b/ prefixes
git diff --src-prefix=<p>             # custom src prefix
git diff --dst-prefix=<p>             # custom dst prefix
git diff --line-prefix=<p>            # prefix every line
git diff --output=<file>              # write to file
git diff --output-indicator-new=#     # custom change indicators
```

### `git show`

```bash
git show                              # show HEAD commit + diff
git show <sha>                        # show commit
git show HEAD~3                       # 3 commits ago
git show v1.0.0                       # show tag
git show HEAD:path/to/file            # show file at HEAD
git show <sha>:path/to/file           # show file at commit
git show --stat                       # show stat
git show --name-only                  # show changed files
git show --name-status                # show files + change type
git show -p                           # show patch (default)
git show --no-patch                   # no patch
git show --format="%s%n%b"            # custom format
git show --pretty=short               # short format
git show --abbrev-commit              # short SHA
git show --word-diff                  # word-level diff
```

### `git blame`

```bash
git blame <file>                      # blame entire file
git blame -L 10,20 <file>             # blame lines 10-20
git blame -L 10,+10 <file>            # blame 10 lines starting at 10
git blame -L /regex/ <file>           # blame from regex match
git blame -L :function <file>         # blame function (needs funcname regex)
git blame <sha> -- <file>             # blame at specific commit
git blame HEAD~5 -- <file>            # blame 5 commits ago
git blame -C <file>                   # detect moved code within file
git blame -CC <file>                  # detect moved code from other files
git blame -CCC <file>                 # detect from any commit
git blame -M <file>                   # detect code moved within file
git blame -w <file>                   # ignore whitespace
git blame --since=2.weeks <file>      # ignore older changes
git blame -e <file>                   # show email instead of name
git blame -n <file>                   # show line numbers
git blame -s <file>                   # suppress author name and timestamp
git blame -t <file>                   # show raw timestamp
git blame --date=short <file>         # short date format
git blame --show-stats <file>         # show copy stats
git blame --color-lines <file>        # color repeated SHA
git blame --color-by-age <file>       # color by commit age
git blame --abbrev=8 <file>           # 8-char SHA
git blame -p <file>                   # porcelain (machine readable)
git blame --porcelain <file>          # same
git blame --incremental <file>        # streaming output
git blame --ignore-rev <sha> <file>   # ignore a specific commit
git blame --ignore-revs-file .git-blame-ignore-revs <file>  # file of revs to ignore
```

---

## Patching & Rewriting

### `git format-patch`

```bash
git format-patch HEAD~3               # patches for last 3 commits
git format-patch origin/main..HEAD    # patches not in origin/main
git format-patch -1 <sha>             # single commit patch
git format-patch -o /tmp/patches HEAD~5  # output to directory
git format-patch --stdout HEAD~3      # to stdout (for piping)
git format-patch --cover-letter HEAD~3  # add cover letter
git format-patch -n HEAD~3            # numbered patches [PATCH n/N]
git format-patch --subject-prefix="PATCH v2"  # custom subject prefix
git format-patch --no-stat HEAD~3     # exclude diff stats
git format-patch -p HEAD~3            # include patch (default)
git format-patch --binary HEAD~3      # include binary diffs
git format-patch -s HEAD~3            # add signed-off-by
git format-patch --signoff HEAD~3     # same
git format-patch --from                # add From header
git format-patch --attach             # attach patch as MIME
git format-patch --inline             # inline patch in email
git format-patch --thread             # thread replies
git format-patch --thread=shallow     # shallow threading
git format-patch --in-reply-to=<msgid>  # reply to message ID
git format-patch --cc=<email>         # CC recipient
git format-patch --to=<email>         # TO recipient
git format-patch --range-diff HEAD~3  # include range-diff
git format-patch -U5                  # context lines
git format-patch --progress           # show progress
```

### `git apply`

```bash
git apply <patch>                     # apply patch to working tree
git apply --cached <patch>            # apply to index only
git apply --index <patch>             # apply to both
git apply --3way <patch>              # three-way merge (fallback to conflict)
git apply -3 <patch>                  # same
git apply --stat <patch>              # show what would change
git apply --check <patch>             # verify patch applies cleanly
git apply --dry-run                   # same
git apply -p1 <patch>                 # strip 1 leading dir component (default)
git apply -p0 <patch>                 # don't strip
git apply --directory=<dir>           # prepend directory to paths
git apply --include=<pattern>         # only apply to matching files
git apply --exclude=<pattern>         # exclude matching files
git apply --whitespace=fix            # fix whitespace issues
git apply --whitespace=warn           # warn only
git apply --whitespace=nowarn         # silence warnings
git apply --whitespace=error          # error on whitespace issues
git apply --whitespace=error-all      # error on all whitespace
git apply -R                          # apply in reverse
git apply --reverse                   # same
git apply --recount                   # do not trust line counts
git apply --inaccurate-eof            # workaround for missing trailing newline
git apply --binary                    # handle binary patches
git apply --allow-overlap             # allow overlapping hunks
git apply --reject                    # store rejected hunks as .rej files
git apply --no-add                    # don't add new files
git apply --unidiff-zero              # zero-context unidiff
git apply --verbose                   # verbose output
git apply --unsafe-paths              # don't strip leading slashes
```

### `git am`

```bash
git am <mbox>                         # apply mailbox of patches
git am *.patch                        # apply multiple patch files
git am --skip                         # skip current patch
git am --continue                     # continue after resolving conflict
git am --abort                        # abort and restore original state
git am --quit                         # abandon am
git am --show-current-patch           # show current patch
git am -3                             # three-way merge on conflict
git am --3way                         # same
git am -i                             # interactive
git am --interactive                  # same
git am -s                             # add signed-off-by
git am --signoff                      # same
git am -S<keyid>                      # GPG sign commits
git am --no-verify                    # skip hooks
git am --scissors                     # allow -- >8 -- cutting lines
git am --no-scissors                  # disable scissors
git am -p1                            # strip path prefix
git am --directory=<dir>              # prepend directory
git am --reject                       # leave .rej files on conflict
git am --whitespace=fix               # fix whitespace
git am --patch-format=mbox            # explicit format
git am --patch-format=mboxrd          # MBOXRD format
git am --patch-format=stgit           # StGit format
git am --patch-format=stgit-series    # StGit series
git am --keep                         # keep subject brackets
git am --keep-cr                      # keep CR in messages
git am --no-keep-cr                   # strip CR
git am --utf8                         # re-encode to UTF-8
git am --no-utf8                      # don't re-encode
git am --resolvemsg=<msg>             # message on conflict
git am --message-id                   # add Message-ID trailer
git am --quoted-cr=nowarn             # don't warn about quoted CR
git am --empty=drop                   # drop empty commits
git am --empty=keep                   # keep empty commits
git am --empty=stop                   # stop on empty
```

### `git filter-branch` (LEGACY — prefer git-filter-repo)

```bash
# WARNING: git filter-branch is slow, error-prone, and deprecated
# Use git filter-repo (external tool) instead for all history rewriting

# Examples for reference:
git filter-branch --tree-filter 'rm -f passwords.txt' HEAD
git filter-branch --msg-filter 'sed "s/old/new/"' HEAD
git filter-branch --env-filter '
  if [ "$GIT_AUTHOR_EMAIL" = "old@email.com" ]; then
    export GIT_AUTHOR_EMAIL="new@email.com"
  fi' HEAD
git filter-branch --subdirectory-filter src HEAD  # extract subdir as root
git filter-branch --index-filter 'git rm --cached --ignore-unmatch secret.txt' HEAD
```

### `git filter-repo` (Modern replacement — external tool)

```bash
# Install: pip install git-filter-repo
git filter-repo --path src/ --path lib/  # keep only these paths
git filter-repo --path secret.txt --invert-paths  # remove file
git filter-repo --to-subdirectory-filter prefix/  # move everything to subdir
git filter-repo --subdirectory-filter src/  # make src/ the new root
git filter-repo --path-regex '\.log$' --invert-paths  # remove by regex
git filter-repo --email-callback '...'  # rename emails
git filter-repo --name-callback '...'   # rename authors
git filter-repo --commit-callback '...' # arbitrary commit modifications
git filter-repo --strip-blobs-bigger-than 10M  # remove large files
git filter-repo --strip-blobs-with-ids <file>  # remove by object id
git filter-repo --replace-refs delete-no-add  # clean up replaced refs
```

---

## Debugging & Searching

### `git bisect`

```bash
git bisect start                      # begin bisect session
git bisect bad                        # mark HEAD as bad
git bisect bad <sha>                  # mark specific commit as bad
git bisect good <sha>                 # mark commit as good
git bisect good v1.0.0                # mark tag as good
git bisect skip                       # skip current commit (can't test)
git bisect skip <sha>                 # skip specific commit
git bisect skip <sha1>..<sha2>        # skip range
git bisect reset                      # end bisect, return to original
git bisect reset <branch>             # end + checkout branch
git bisect log                        # show bisect log
git bisect replay <log>               # replay from log file
git bisect visualize                  # open gitk
git bisect view                       # same
git bisect run <script>               # automatic bisect (exit 0=good, 1-127=bad, 125=skip)

# Typical automated bisect:
git bisect start
git bisect bad HEAD
git bisect good v1.0.0
git bisect run npm test               # runs test suite for each commit
git bisect reset
```

### `git grep`

```bash
git grep "pattern"                    # search working tree (tracked files)
git grep "pattern" HEAD               # search at HEAD
git grep "pattern" HEAD~5             # search at commit
git grep "pattern" -- "*.js"          # search only .js files
git grep -n "pattern"                 # show line numbers
git grep --line-number "pattern"      # same
git grep -l "pattern"                 # show only filenames
git grep --files-with-matches         # same
git grep -L "pattern"                 # files WITHOUT match
git grep --files-without-match        # same
git grep -c "pattern"                 # count matches per file
git grep --count                      # same
git grep -i "pattern"                 # case-insensitive
git grep --ignore-case                # same
git grep -v "pattern"                 # invert match
git grep --invert-match               # same
git grep -w "pattern"                 # whole word match
git grep --word-regexp                # same
git grep -E "reg.+exp"                # extended regex
git grep --extended-regexp            # same
git grep -P "perl.+regex"             # Perl regex (if PCRE enabled)
git grep --perl-regexp                # same
git grep -F "literal.string"          # fixed string (no regex)
git grep --fixed-strings              # same
git grep -e "pattern1" -e "pattern2"  # OR patterns
git grep --and -e "pattern1" -e "pattern2"  # AND patterns
git grep --or -e "p1" -e "p2"         # OR (same as -e -e)
git grep --not -e "pattern"           # NOT pattern
git grep -A2 "pattern"                # 2 lines after match
git grep -B2 "pattern"                # 2 lines before match
git grep -C2 "pattern"                # 2 lines context
git grep --after-context=2            # same as -A
git grep -h "pattern"                 # suppress filename headers
git grep -H "pattern"                 # always show filenames (default)
git grep --no-index "pattern"         # search non-git directory
git grep --untracked "pattern"        # include untracked files
git grep --cached "pattern"           # only index (no working tree)
git grep --recurse-submodules         # include submodules
git grep -p "pattern"                 # show function context
git grep --show-function              # same
git grep -W "pattern"                 # show whole function
git grep --function-context           # same
git grep --break                      # print blank line between files
git grep --heading                    # print filename above matches
git grep --color                      # colorize output
git grep --color=never                # disable color
git grep --null                       # null-separated output
git grep -z                           # same
git grep -O                           # open in pager per file
git grep --open-files-in-pager        # same
git grep -q "pattern"                 # quiet (just exit code)
git grep --quiet                      # same
git grep --threads=4                  # worker threads
```

### `git log -S / -G` (Pickaxe)

```bash
git log -S "function_name"            # commits that change count of this string
git log -S "secret_key" --all         # search all branches
git log -S "string" --diff-filter=D   # only where string was removed
git log -G "regex.*pattern"           # commits where diff matches regex
git log -G "TODO|FIXME"               # any line with TODO or FIXME
```

---

## Advanced Plumbing

### `git rev-parse`

```bash
git rev-parse HEAD                    # resolve HEAD to SHA
git rev-parse main                    # branch tip SHA
git rev-parse v1.0.0                  # tag SHA
git rev-parse v1.0.0^{}              # tag dereferenced to commit
git rev-parse HEAD~3                  # ancestor SHA
git rev-parse HEAD^{tree}             # root tree SHA
git rev-parse HEAD:path/file          # blob SHA
git rev-parse --abbrev-ref HEAD       # branch name or "HEAD"
git rev-parse --symbolic-full-name HEAD  # "refs/heads/main"
git rev-parse --show-toplevel         # absolute path to repo root
git rev-parse --git-dir               # path to .git directory
git rev-parse --git-common-dir        # common git dir (for worktrees)
git rev-parse --absolute-git-dir      # absolute .git path
git rev-parse --is-inside-work-tree   # true/false
git rev-parse --is-inside-git-dir     # true/false
git rev-parse --is-bare-repository    # true/false
git rev-parse --is-shallow-repository # true/false
git rev-parse --show-prefix           # relative path from repo root
git rev-parse --show-cdup             # path to go up from current dir to root
git rev-parse --short HEAD            # short SHA
git rev-parse --short=8 HEAD          # 8-char short SHA
git rev-parse --verify HEAD           # verify object exists
git rev-parse --verify --quiet HEAD   # no output, just exit code
git rev-parse --sq-quote "string"     # shell-quote
git rev-parse --local-env-vars        # list local env vars
git rev-parse --parseopt -- "$@"      # parse options for scripts
```

### `git cat-file`

```bash
git cat-file -t <sha>                 # type: blob/tree/commit/tag
git cat-file -s <sha>                 # size in bytes
git cat-file -p <sha>                 # pretty-print content
git cat-file blob <sha>               # raw blob content
git cat-file commit <sha>             # raw commit content
git cat-file tree <sha>               # raw tree content (binary)
git cat-file tag <sha>                # raw tag content
git cat-file --batch                  # stdin: sha\n → type size\ncontent\n
git cat-file --batch-check            # stdin: sha\n → type size (no content)
git cat-file --batch-check="%(objecttype) %(objectsize)"  # custom format
git cat-file --batch-all-objects      # all objects in repo
git cat-file --batch-all-objects --batch-check  # all + check
git cat-file -e <sha>                 # check existence (exit code)
git cat-file --follow-symlinks -p HEAD:link  # follow symlinks
git cat-file --allow-unknown-type -t <sha>   # allow damaged objects
git cat-file --unordered --batch-all-objects  # faster unordered output
```

### `git ls-tree`

```bash
git ls-tree HEAD                      # list root tree at HEAD
git ls-tree HEAD src/                 # list specific directory
git ls-tree -r HEAD                   # recursive
git ls-tree -r --name-only HEAD       # just filenames
git ls-tree -r -t HEAD                # include trees in output
git ls-tree -l HEAD                   # with object sizes
git ls-tree --long HEAD               # same as -l
git ls-tree -d HEAD                   # only trees (directories)
git ls-tree -z HEAD                   # null-separated output
git ls-tree --full-name HEAD          # full path from repo root
git ls-tree --full-tree HEAD          # don't abbreviate paths
git ls-tree --abbrev=8 HEAD           # abbreviated SHAs
git ls-tree --format="%(path)" HEAD   # custom format (git 2.36+)
git ls-tree <sha>                     # list tree at specific commit
```

### `git ls-files`

```bash
git ls-files                          # list tracked files
git ls-files -s                       # with stage info (mode sha stage name)
git ls-files --stage                  # same
git ls-files -u                       # unmerged (conflicted) files
git ls-files --unmerged               # same
git ls-files -m                       # modified files
git ls-files --modified               # same
git ls-files -d                       # deleted files
git ls-files --deleted                # same
git ls-files -o                       # untracked files
git ls-files --others                 # same
git ls-files -o --exclude-standard    # untracked, respecting .gitignore
git ls-files -i --exclude-standard    # ignored files
git ls-files --ignored --exclude-standard  # same
git ls-files -c                       # cached (same as default)
git ls-files --cached                 # same
git ls-files -k                       # kill list (files to be removed)
git ls-files --killed                 # same
git ls-files -t                       # with status tag
git ls-files --tag                    # same
git ls-files -v                       # with lowercase for skip-worktree
git ls-files -f                       # with lowercase for assume-unchanged
git ls-files -z                       # null-terminated output
git ls-files --eol                    # show eol attributes
git ls-files --full-name              # full path from repo root
git ls-files --error-unmatch <file>   # error if not tracked
git ls-files --with-tree=<sha>        # add files from tree
git ls-files --recurse-submodules     # include submodule files
git ls-files -- <path>                # limit to path
```

### `git update-index`

```bash
git update-index --assume-unchanged <file>   # don't check for changes
git update-index --no-assume-unchanged <file> # reset
git update-index --skip-worktree <file>       # sparse checkout marker
git update-index --no-skip-worktree <file>    # reset
git update-index --add <file>                 # add file to index
git update-index --remove <file>              # remove from index
git update-index --chmod=+x <file>            # set executable bit
git update-index --chmod=-x <file>            # clear executable bit
git update-index --refresh                    # refresh stat cache
git update-index --really-refresh             # refresh, don't lie
git update-index --index-info                 # read index info from stdin
git update-index --cacheinfo <mode>,<sha>,<path>  # add blob to index
git update-index --split-index                # split index for large repos
git update-index --untracked-cache            # enable untracked cache
git update-index --fsmonitor                  # enable fsmonitor
```

### `git hash-object`

```bash
git hash-object <file>                # compute hash without storing
git hash-object -w <file>             # compute hash AND store in object db
git hash-object --stdin               # hash stdin
git hash-object --stdin-paths         # hash files from stdin paths
git hash-object -t blob <file>        # force blob type
git hash-object -t tree <file>        # force tree type
git hash-object --no-filters          # don't apply filters
git hash-object --path=<path>         # apply filters for this path
git hash-object --literally           # allow any object type
```

### `git mktree` / `git write-tree` / `git read-tree`

```bash
# Create tree objects
git mktree                            # read ls-tree format from stdin, create tree
git mktree --missing                  # allow missing objects
git mktree -z                         # null-terminated input
git mktree --batch                    # process multiple trees

git write-tree                        # write index as tree object
git write-tree --missing-ok           # allow missing objects
git write-tree --prefix=<path>        # write subtree

git read-tree <tree-sha>              # read tree into index
git read-tree -m <base> <ours> <theirs>  # 3-way merge into index
git read-tree --reset <tree>          # reset index to tree
git read-tree --prefix=<dir>/ <tree>  # merge tree under subdir
```

### `git commit-tree`

```bash
git commit-tree <tree> -m "msg"       # create commit object
git commit-tree <tree> -p <parent> -m "msg"  # with parent
git commit-tree <tree> -p <p1> -p <p2> -m "msg"  # merge commit
git commit-tree -S <tree> -m "msg"    # signed commit
```

### `git for-each-ref`

```bash
git for-each-ref                      # all refs with info
git for-each-ref refs/heads/          # local branches only
git for-each-ref --sort=committerdate refs/heads/
git for-each-ref --sort=-version:refname refs/tags/  # version-sorted tags
git for-each-ref --format="%(refname:short) %(objectname:short)"
git for-each-ref --format="%(refname:short) %(upstream:short) %(upstream:trackshort)"
git for-each-ref --count=10 refs/heads/
git for-each-ref --merged=HEAD refs/heads/
git for-each-ref --no-merged=HEAD refs/heads/
git for-each-ref --contains=<sha>
git for-each-ref --points-at=<sha>
git for-each-ref --format="%(if)%(upstream)%(then)%(refname:short)%(end)"  # filter

# Format fields:
# objecttype, objectsize, objectname, refname
# refname:short, refname:lstrip=2, refname:rstrip=2
# upstream, upstream:short, upstream:trackshort
# push, push:short, push:trackshort
# HEAD (shows * if current)
# worktreepath
# subject, body, contents
# authorname, authoremail, authordate
# committername, committeremail, committerdate
# taggername, taggeremail, taggerdate
# version:refname (for semantic version sorting)
# if, then, else, end (conditionals)
# %(align:width,position)...%(end) (text alignment)
# %(pad:width) padding
```

### `git pack-refs`

```bash
git pack-refs                         # pack loose refs into packed-refs
git pack-refs --all                   # pack all refs
git pack-refs --no-prune              # don't prune loose refs after packing
git pack-refs --prune                 # prune (default)
```

### `git symbolic-ref`

```bash
git symbolic-ref HEAD                 # print what HEAD points to
git symbolic-ref HEAD refs/heads/main # set HEAD to point to branch
git symbolic-ref -d HEAD              # delete symbolic ref (detach)
git symbolic-ref --short HEAD         # print just branch name
git symbolic-ref -q HEAD              # quiet (no error if detached)
```

---

## Administration

### `git gc`

```bash
git gc                                # run garbage collection
git gc --auto                         # only if needed (check thresholds)
git gc --aggressive                   # more thorough optimization
git gc --prune=now                    # prune unreachable objects immediately
git gc --prune=2.weeks.ago            # prune older than 2 weeks (default)
git gc --no-prune                     # don't prune
git gc --keep-largest-pack            # keep largest packfile
git gc --quiet                        # suppress output
git gc --force                        # run even if another gc in progress
```

### `git fsck`

```bash
git fsck                              # check object integrity
git fsck --full                       # more thorough check
git fsck --strict                     # strict mode
git fsck --unreachable                # show unreachable objects
git fsck --lost-found                 # write unreachable objects to .git/lost-found/
git fsck --no-reflogs                 # don't check reflogs for reachability
git fsck --dangling                   # report dangling (unreachable) objects
git fsck --no-dangling                # don't report dangling
git fsck --connectivity-only          # only check connectivity (fast)
git fsck --name-objects               # show human-readable names
git fsck --verbose                    # verbose
git fsck --progress                   # show progress
```

### `git reflog`

```bash
git reflog                            # HEAD reflog
git reflog show                       # same
git reflog show HEAD                  # same, explicit
git reflog show main                  # specific branch
git reflog show --all                 # all reflogs
git reflog expire --expire=now --all  # expire all reflog entries
git reflog expire --expire=90.days refs/heads/main  # expire branch
git reflog delete HEAD@{5}            # delete specific entry
git reflog delete --rewrite main@{3}  # delete + rewrite subsequent
```

### `git worktree`

```bash
git worktree add <path> <branch>      # create linked worktree
git worktree add <path>               # create worktree for new branch
git worktree add -b <new> <path> <sha>  # create with new branch
git worktree add --detach <path> <sha>  # detached worktree
git worktree add --no-checkout <path>   # no checkout
git worktree add --lock <path>          # lock worktree
git worktree list                     # list all worktrees
git worktree list --porcelain         # machine readable
git worktree lock <path>              # prevent pruning
git worktree lock --reason "in use"   # with reason
git worktree unlock <path>            # allow pruning
git worktree move <worktree> <newpath>  # relocate worktree
git worktree remove <worktree>        # remove worktree
git worktree remove --force <worktree>  # remove even if dirty
git worktree prune                    # clean up stale worktrees
git worktree prune --dry-run          # preview
git worktree prune --expire=1.week    # expire old stale worktrees
git worktree repair                   # repair symlinks/paths
```

### `git submodule`

```bash
git submodule add <url> <path>        # add submodule
git submodule add -b main <url> <path>  # track specific branch
git submodule add --name <name> <url>   # custom name
git submodule init                    # init local config for submodules
git submodule init <path>             # init specific submodule
git submodule update                  # checkout correct commits
git submodule update --init           # init + update
git submodule update --init --recursive  # all nested submodules
git submodule update --remote         # fetch + update to latest
git submodule update --remote --merge # merge instead of checkout
git submodule update --remote --rebase  # rebase
git submodule update --jobs 4         # parallel update
git submodule sync                    # update remote URLs from .gitmodules
git submodule sync --recursive        # including nested
git submodule status                  # show submodule status
git submodule status --recursive      # including nested
git submodule summary                 # show summary of changes
git submodule foreach <command>       # run command in each submodule
git submodule foreach --recursive <cmd>  # including nested
git submodule deinit <path>           # unregister submodule
git submodule deinit --all            # unregister all
git submodule deinit --force <path>   # even if dirty
git submodule absorbgitdirs           # move submodule .git into parent's .git/modules
git submodule set-url <path> <url>    # change submodule URL
git submodule set-branch -b <branch> <path>  # set tracked branch
git submodule set-branch -d <path>    # remove branch setting
```

### `git notes`

```bash
git notes list                        # list all notes
git notes list <object>               # notes for specific object
git notes add -m "message" <sha>      # add note to commit
git notes add -m "message"            # add note to HEAD
git notes append -m "more" <sha>      # append to existing note
git notes edit <sha>                  # edit note in $EDITOR
git notes show <sha>                  # show note
git notes copy <src> <dst>            # copy note
git notes remove <sha>                # remove note
git notes remove --ignore-missing <sha>  # no error if none
git notes merge FETCH_HEAD            # merge notes refs
git notes merge --commit              # complete notes merge
git notes merge --abort               # abort notes merge
git notes prune                       # remove notes on unreachable objects
git notes get-ref                     # show active notes ref
git log --show-notes                  # show notes in log
git log --notes=custom                # show specific notes namespace

# Notes namespaces
GIT_NOTES_REF=refs/notes/custom git notes add -m "msg"  # custom namespace
git config notes.displayRef "refs/notes/*"  # show all notes namespaces in log
```

### `git bundle`

```bash
git bundle create repo.bundle HEAD    # bundle HEAD history
git bundle create repo.bundle --all   # all refs
git bundle create recent.bundle HEAD~10..HEAD  # recent commits only
git bundle verify repo.bundle         # verify bundle is complete
git bundle list-heads repo.bundle     # list bundled refs
git bundle unbundle repo.bundle       # extract to current repo
git clone repo.bundle new-repo        # clone from bundle
git fetch repo.bundle main:main       # fetch specific ref
```

---

*End of Part 2*
