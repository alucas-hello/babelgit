# babelgit — Process Diagrams

Visual explainers for the babelgit workflow as used in active development.

---

## 1. Work Item Lifecycle (State Machine)

```mermaid
stateDiagram-v2
    direction LR

    [*] --> todo : babel todo "desc"
    todo --> in_progress : babel start WI-XXX
    in_progress --> run_session_open : babel run
    run_session_open --> in_progress : babel keep\nbabel refine
    run_session_open --> in_progress : babel reject\n(reverts to last keep)
    run_session_open --> shipped : babel ship
    in_progress --> paused : babel pause
    paused --> in_progress : babel continue
    in_progress --> stopped : babel stop
    shipped --> [*]
    stopped --> [*]

    note right of todo
        ID reserved on GitHub
        Spec lives in .babel/notes/
        No code branch yet
    end note

    note right of run_session_open
        Snapshot locked at this commit
        Scripts run automatically
        Verdict creates checkpoint
    end note
```

---

## 2. The Enforcement Stack

Three independent layers, each catching what the others miss.

```mermaid
flowchart TD
    A[You or an AI agent\nattempt to edit a file]

    A --> B{Layer 1\nClaude Code PreToolUse hook\nbabel hook-check-wi}

    B -- "No active WI\nor wrong stage" --> C[❌ Tool call BLOCKED\nClear message shown\nAgent knows what to do]
    B -- "WI in_progress" --> D{Layer 2\ngit hooks\nbabel enforce}

    D -- "BABEL_ACTIVE not set\n= raw git call" --> E[❌ git commit blocked\ngit push blocked]
    D -- "BABEL_ACTIVE set\n= babel initiated" --> F{Layer 3\nWatch Daemon\nbabel watch}

    F -- "Edit lands but\nno active WI" --> G[❌ File silently reverted\ngit checkout - - file\nEvent logged]
    F -- "WI active" --> H[✅ Change lands]

    style C fill:#ff6b6b,color:#fff
    style E fill:#ff6b6b,color:#fff
    style G fill:#ff6b6b,color:#fff
    style H fill:#51cf66,color:#fff
```

---

## 3. ID Reservation Flow (`babel todo`)

```mermaid
flowchart TD
    A[babel todo 'description'] --> B[git fetch origin --prune\n8s timeout]

    B -- "fetch fails\nor no remote" --> C[DRAFT-hex ID\nno branch\nisDraft: true]
    B -- "fetch succeeds" --> D[Find highest WI number\non remote branches]

    D --> E[Try atomic push:\ngit push origin base→feature/WI-NNN-slug]

    E -- "push succeeds\nfirst writer wins" --> F[✅ WI-NNN reserved\nbranch exists on GitHub]
    E -- "rejected / already exists\nsomeone else claimed it" --> G[Increment N\nretry up to 10×]
    G --> E
    E -- "unexpected error\nauth / network" --> C

    C --> H[Item saved to state.json\nstage: todo\nid: DRAFT-xxx]
    F --> I[Item saved to state.json\nstage: todo\nbranch: feature/WI-NNN-slug]

    H --> J{Watch daemon\nevery 30s}
    J -- "still offline" --> J
    J -- "online" --> K[resolveDrafts\nclaims next available WI-NNN\nrenames state entry + notes file]
    K --> I
```

---

## 4. The Daily Development Loop

```mermaid
flowchart LR
    Plan["📋 babel todo\n'what to build'\n\nID reserved\nSpec file created"] -->
    Start["🚀 babel start WI-XXX\n\nBranch checked out\nStage: in_progress"]

    Start --> Work["💻 Write code\n\nbabel save 'notes'\ncheckpoints as you go"]

    Work --> Review["🔍 babel run\n\nSnapshot locked\nScripts execute\nStage: run_session_open"]

    Review --> Verdict{Verdict}

    Verdict -- "babel keep\nbabel refine" --> Work
    Verdict -- "babel reject" --> Revert["⏪ Reverts to\nlast keep checkpoint"]
    Revert --> Work
    Verdict -- "babel ship" --> Ship["✅ babel ship\n\nMerged to main\nBranch deleted\nStage: shipped"]
```

---

## 5. Component Architecture

```mermaid
flowchart TB
    subgraph User["You / AI Agent"]
        CLI["babel CLI\nbabel todo\nbabel start\nbabel save\nbabel run\nbabel ship"]
        CC["Claude Code\nEdit / Write tools"]
    end

    subgraph Enforcement["Enforcement"]
        Hook["PreToolUse Hook\n.claude/settings.json\nbabel hook-check-wi"]
        GitHooks["git hooks\npre-commit\npre-push\npre-rebase"]
    end

    subgraph State[".babel/ (local, gitignored)"]
        StateJSON["state.json\ncurrent WI\nall work items"]
        Notes[".babel/notes/WI-XXX.md\nliving spec files"]
        WatchFiles["watch.pid\nwatch-status.json\nwatch-events.json"]
    end

    subgraph Daemon["Watch Daemon (background)"]
        FileWatch["File watcher\nreverts edits with no WI"]
        SpecSync["Spec sync\nauto-pushes notes → GitHub"]
        DraftResolve["Draft resolver\nclaims WI-NNN when online"]
        CIPoll["CI poller\nalerts on failures"]
    end

    subgraph GitHub["GitHub (remote)"]
        Branches["feature/WI-XXX-* branches\n= the ticket board"]
        Specs["docs/specs/WI-XXX.md\n= spec committed to branch"]
    end

    subgraph VSCode["VSCode Extension"]
        Board["Board view\nstage buckets\ntodo actions"]
        QA["Quick Actions\ncontext commands"]
    end

    CC -->|"before Edit/Write"| Hook
    Hook -->|"reads"| StateJSON
    CLI -->|"reads/writes"| StateJSON
    CLI -->|"creates"| Notes
    CLI -->|"git ops via simple-git"| GitHooks
    CLI -->|"push reservation"| Branches
    Notes -->|"watched by"| Daemon
    Daemon -->|"reads"| StateJSON
    Daemon -->|"writes"| WatchFiles
    Daemon -->|"pushes via worktree"| Specs
    WatchFiles -->|"polled by"| VSCode
    StateJSON -->|"polled by"| VSCode
    Board -->|"runs babel commands"| CLI
```
