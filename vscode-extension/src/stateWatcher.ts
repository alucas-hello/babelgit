import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'

export interface GitStats {
  filesChanged: number
  insertions: number
  deletions: number
  commitsSinceCheckpoint: number
  minutesSinceCheckpoint: number | null
}

export interface WorkItemState {
  id: string
  description: string
  branch?: string
  stage: string
  ship_ready?: boolean
  created_at: string
  planned_at?: string
  paused_notes?: string
  pr_url?: string
  pr_number?: number
}

export interface BabelVerdicts {
  keep: string
  refine: string
  reject: string
  ship: string
}

export interface RemoteBranch {
  name: string        // full branch name e.g. feature/WI-011-description
  workItemId: string  // e.g. WI-011
  description: string // e.g. description
  isLocal: boolean    // whether we also have it locally
}

export interface CheckpointState {
  id: string
  verdict: string
  notes: string
  called_at: string
  is_recovery_anchor: boolean
  git_commit: string
}

export interface BabelState {
  current_work_item_id: string | null
  work_items: Record<string, WorkItemState>
}

export interface WatchEvent {
  type: 'revert' | 'ci_failure' | 'external_commit' | 'started' | 'stopped' | 'error'
  message: string
  file?: string
  timestamp: string
}

export interface CheckpointGroup {
  workItemId: string
  description: string
  checkpoints: CheckpointState[]
}

export class StateWatcher {
  private _onDidChange = new vscode.EventEmitter<void>()
  readonly onDidChange = this._onDidChange.event

  private watcher: vscode.FileSystemWatcher | undefined
  private _currentState: BabelState | null = null
  private _checkpoints: CheckpointState[] = []
  private _allCheckpointGroups: CheckpointGroup[] = []
  private _gitStats: GitStats | null = null
  private _remoteBranches: RemoteBranch[] = []
  private _verdicts: BabelVerdicts | null = null
  private _remoteRefreshTimer: ReturnType<typeof setInterval> | undefined
  private workspaceRoot: string | undefined

  constructor() {
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (this.workspaceRoot) {
      this.start()
    }
  }

  private start(): void {
    const pattern = new vscode.RelativePattern(this.workspaceRoot!, '.babel/**')
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern)

    const refresh = () => {
      this.refresh()
      this._onDidChange.fire()
    }

    this.watcher.onDidChange(refresh)
    this.watcher.onDidCreate(refresh)
    this.watcher.onDidDelete(refresh)

    this.refresh()
    this._verdicts = this.loadVerdicts()
    this.refreshRemoteBranches()
    // Poll remote branches every 60 seconds
    this._remoteRefreshTimer = setInterval(() => {
      this.refreshRemoteBranches()
      this._onDidChange.fire()
    }, 60_000)
  }

  refresh(): void {
    if (!this.workspaceRoot) return

    const statePath = path.join(this.workspaceRoot, '.babel', 'state.json')
    try {
      if (fs.existsSync(statePath)) {
        const raw = fs.readFileSync(statePath, 'utf8')
        this._currentState = JSON.parse(raw) as BabelState
      } else {
        this._currentState = null
      }
    } catch {
      this._currentState = null
    }

    this._allCheckpointGroups = this.loadAllCheckpoints()
    const currentId = this._currentState?.current_work_item_id
    this._checkpoints = currentId
      ? (this._allCheckpointGroups.find(g => g.workItemId === currentId)?.checkpoints ?? [])
      : []
    this._gitStats = this.loadGitStats()
  }

  private loadGitStats(): GitStats | null {
    if (!this.workspaceRoot) return null
    try {
      const opts = { cwd: this.workspaceRoot }

      // Uncommitted changes
      const shortstat = execSync('git diff --shortstat HEAD 2>/dev/null || echo ""', opts).toString().trim()
      let filesChanged = 0, insertions = 0, deletions = 0
      if (shortstat) {
        filesChanged = parseInt(shortstat.match(/(\d+) file/)?.[1] ?? '0')
        insertions  = parseInt(shortstat.match(/(\d+) insertion/)?.[1] ?? '0')
        deletions   = parseInt(shortstat.match(/(\d+) deletion/)?.[1] ?? '0')
      }

      // Commits since last checkpoint
      const lastCheckpoint = this._checkpoints[this._checkpoints.length - 1]
      let commitsSinceCheckpoint = 0
      let minutesSinceCheckpoint: number | null = null
      if (lastCheckpoint) {
        const count = execSync(
          `git rev-list ${lastCheckpoint.git_commit}..HEAD --count 2>/dev/null || echo "0"`, opts
        ).toString().trim()
        commitsSinceCheckpoint = parseInt(count) || 0
        minutesSinceCheckpoint = Math.floor(
          (Date.now() - new Date(lastCheckpoint.called_at).getTime()) / 60000
        )
      }

      return { filesChanged, insertions, deletions, commitsSinceCheckpoint, minutesSinceCheckpoint }
    } catch {
      return null
    }
  }

  private loadAllCheckpoints(): CheckpointGroup[] {
    if (!this.workspaceRoot) return []

    const checkpointsDir = path.join(this.workspaceRoot, '.babel', 'checkpoints')
    if (!fs.existsSync(checkpointsDir)) return []

    try {
      const files = fs.readdirSync(checkpointsDir).filter(f => f.endsWith('.json'))
      return files
        .map(f => {
          try {
            const workItemId = f.replace(/\.json$/, '')
            const raw = fs.readFileSync(path.join(checkpointsDir, f), 'utf8')
            const checkpoints = (JSON.parse(raw) as CheckpointState[])
              .sort((a, b) => a.called_at.localeCompare(b.called_at))
            const description = this._currentState?.work_items[workItemId]?.description ?? ''
            return { workItemId, description, checkpoints }
          } catch {
            return null
          }
        })
        .filter((g): g is CheckpointGroup => g !== null)
        .sort((a, b) => b.workItemId.localeCompare(a.workItemId)) // newest first
    } catch {
      return []
    }
  }

  get isInitialized(): boolean {
    if (!this.workspaceRoot) return false
    return fs.existsSync(path.join(this.workspaceRoot, '.babel', 'state.json'))
  }

  get currentWorkItem(): WorkItemState | null {
    if (!this._currentState?.current_work_item_id) return null
    return this._currentState.work_items[this._currentState.current_work_item_id] ?? null
  }

  get checkpoints(): CheckpointState[] {
    return this._checkpoints
  }

  get allCheckpointGroups(): CheckpointGroup[] {
    return this._allCheckpointGroups
  }

  get gitStats(): GitStats | null {
    return this._gitStats
  }

  get workNotes(): string | null {
    if (!this.workspaceRoot) return null
    const p = this.workNotesPath
    try {
      return p && fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim() : null
    } catch {
      return null
    }
  }

  get workNotesPath(): string | null {
    const id = this._currentState?.current_work_item_id
    if (!id || !this.workspaceRoot) return null
    return path.join(this.workspaceRoot, '.babel', 'notes', `${id}.md`)
  }

  get watchStatus(): { running: boolean; pid?: number; startedAt?: string; lastCheck?: string; alerts?: WatchEvent[] } | null {
    if (!this.workspaceRoot) return null
    try {
      const pidFile = path.join(this.workspaceRoot, '.babel', 'watch.pid')
      const statusFile = path.join(this.workspaceRoot, '.babel', 'watch-status.json')
      const running = fs.existsSync(pidFile)
      if (!running) return { running: false }
      const status = fs.existsSync(statusFile) ? JSON.parse(fs.readFileSync(statusFile, 'utf8')) : {}
      return { running: true, pid: status.pid, startedAt: status.started_at, lastCheck: status.last_check, alerts: status.alerts ?? [] }
    } catch { return null }
  }

  get watchEvents(): WatchEvent[] {
    if (!this.workspaceRoot) return []
    try {
      const eventsFile = path.join(this.workspaceRoot, '.babel', 'watch-events.json')
      if (!fs.existsSync(eventsFile)) return []
      return JSON.parse(fs.readFileSync(eventsFile, 'utf8')) as WatchEvent[]
    } catch { return [] }
  }

  get state(): BabelState | null {
    return this._currentState
  }

  get workspacePath(): string | undefined {
    return this.workspaceRoot
  }

  get githubBaseUrl(): string | null {
    if (!this.workspaceRoot) return null
    try {
      const remote = execSync('git remote get-url origin 2>/dev/null || echo ""', {
        cwd: this.workspaceRoot, encoding: 'utf8', shell: '/bin/sh',
      }).trim()
      const match = remote.match(/github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/)
      if (!match) return null
      return `https://github.com/${match[1]}`
    } catch { return null }
  }

  get verdicts(): BabelVerdicts {
    return this._verdicts ?? { keep: 'keep', refine: 'refine', reject: 'reject', ship: 'ship' }
  }

  get remoteBranches(): RemoteBranch[] {
    return this._remoteBranches
  }

  private loadVerdicts(): BabelVerdicts | null {
    if (!this.workspaceRoot) return null
    try {
      const configPath = path.join(this.workspaceRoot, 'babel.config.yml')
      if (!fs.existsSync(configPath)) return null
      const raw = fs.readFileSync(configPath, 'utf8')
      // Extract only the verdicts: block to avoid matching ship:/keep: in other sections
      const block = raw.match(/^verdicts:\s*\n((?:[ \t]+\S+:[ \t]*\S+\n?)+)/m)?.[1] ?? ''
      const keep  = block.match(/keep:\s*(\S+)/)?.[1] ?? 'keep'
      const refine = block.match(/refine:\s*(\S+)/)?.[1] ?? 'refine'
      const reject = block.match(/reject:\s*(\S+)/)?.[1] ?? 'reject'
      const ship  = block.match(/ship:\s*(\S+)/)?.[1] ?? 'ship'
      return { keep, refine, reject, ship }
    } catch { return null }
  }

  private refreshRemoteBranches(): void {
    if (!this.workspaceRoot) return
    try {
      const raw = execSync('git branch -r --format "%(refname:short)" 2>/dev/null', {
        cwd: this.workspaceRoot, encoding: 'utf8', timeout: 5000,
      }).trim()
      if (!raw) { this._remoteBranches = []; return }

      const localIds = new Set(Object.keys(this._currentState?.work_items ?? {}))
      const branches: RemoteBranch[] = []

      for (const ref of raw.split('\n').map(s => s.trim()).filter(Boolean)) {
        // Strip "origin/" prefix
        const branchName = ref.replace(/^origin\//, '')
        // Match feature/WI-XXX-* pattern
        const m = branchName.match(/^(?:feature|fix)\/([A-Z]+-\d+)-(.+)$/)
        if (!m) continue
        const [, workItemId, slug] = m
        const description = slug.replace(/-/g, ' ')
        const isLocal = localIds.has(workItemId)
        branches.push({ name: branchName, workItemId, description, isLocal })
      }

      this._remoteBranches = branches
    } catch {
      this._remoteBranches = []
    }
  }

  dispose(): void {
    if (this._remoteRefreshTimer) clearInterval(this._remoteRefreshTimer)
    this.watcher?.dispose()
    this._onDidChange.dispose()
  }
}
