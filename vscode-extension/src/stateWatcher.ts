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
  branch: string
  stage: string
  ship_ready?: boolean
  created_at: string
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

  get state(): BabelState | null {
    return this._currentState
  }

  get workspacePath(): string | undefined {
    return this.workspaceRoot
  }

  dispose(): void {
    this.watcher?.dispose()
    this._onDidChange.dispose()
  }
}
