import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'

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

export class StateWatcher {
  private _onDidChange = new vscode.EventEmitter<void>()
  readonly onDidChange = this._onDidChange.event

  private watcher: vscode.FileSystemWatcher | undefined
  private _currentState: BabelState | null = null
  private _checkpoints: CheckpointState[] = []
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

    this._checkpoints = this.loadCheckpoints()
  }

  private loadCheckpoints(): CheckpointState[] {
    if (!this.workspaceRoot || !this._currentState?.current_work_item_id) return []

    const checkpointsDir = path.join(
      this.workspaceRoot,
      '.babel',
      'checkpoints',
      this._currentState.current_work_item_id
    )

    if (!fs.existsSync(checkpointsDir)) return []

    try {
      const files = fs.readdirSync(checkpointsDir).filter(f => f.endsWith('.json'))
      return files
        .map(f => {
          try {
            const raw = fs.readFileSync(path.join(checkpointsDir, f), 'utf8')
            return JSON.parse(raw) as CheckpointState
          } catch {
            return null
          }
        })
        .filter((c): c is CheckpointState => c !== null)
        .sort((a, b) => a.called_at.localeCompare(b.called_at))
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
