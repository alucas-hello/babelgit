import * as vscode from 'vscode'
import { StateWatcher, CheckpointState, WorkItemState } from './stateWatcher'

// ─── shared helpers ──────────────────────────────────────────────────────────

function labelNode(key: string, value: string): TreeNode {
  return new TreeNode(`${key}: ${value}`, 'label', vscode.TreeItemCollapsibleState.None)
}

function formatStage(wi: WorkItemState): string {
  if (wi.ship_ready) return 'Ship Ready'
  const labels: Record<string, string> = {
    in_progress: 'In Progress',
    run_session_open: 'Run Session Open',
    paused: 'Paused',
    shipped: 'Shipped',
    stopped: 'Stopped',
  }
  return labels[wi.stage] ?? wi.stage
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

class TreeNode extends vscode.TreeItem {
  children?: TreeNode[]

  constructor(
    label: string,
    contextValue: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    description?: string
  ) {
    super(label, collapsibleState)
    this.contextValue = contextValue
    if (description) this.description = description

    if (contextValue === 'workItem') {
      this.iconPath = new vscode.ThemeIcon('circle-filled')
    } else if (contextValue === 'hint') {
      this.iconPath = new vscode.ThemeIcon('info')
    } else if (contextValue === 'section') {
      this.iconPath = new vscode.ThemeIcon('history')
    } else if (contextValue === 'action') {
      this.iconPath = new vscode.ThemeIcon('chevron-right')
    } else if (contextValue === 'pausedItem') {
      this.iconPath = new vscode.ThemeIcon('debug-pause')
    }
  }
}

// ─── Active Work ─────────────────────────────────────────────────────────────

export class ActiveWorkProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | null | void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  constructor(private watcher: StateWatcher) {
    watcher.onDidChange(() => this._onDidChangeTreeData.fire())
  }

  refresh(): void { this._onDidChangeTreeData.fire() }
  getTreeItem(el: TreeNode): vscode.TreeItem { return el }

  getChildren(element?: TreeNode): TreeNode[] {
    if (element) return element.children ?? []

    const wi = this.watcher.currentWorkItem
    if (!wi) {
      return [new TreeNode('No active work item', 'hint', vscode.TreeItemCollapsibleState.None)]
    }

    return [
      labelNode('ID', wi.id),
      labelNode('Status', formatStage(wi)),
      labelNode('Branch', wi.branch),
      labelNode('Started', formatDate(wi.created_at)),
      labelNode('Description', wi.description),
    ]
  }
}

// ─── Checkpoints ─────────────────────────────────────────────────────────────

export class CheckpointsProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | null | void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  constructor(private watcher: StateWatcher) {
    watcher.onDidChange(() => this._onDidChangeTreeData.fire())
  }

  refresh(): void { this._onDidChangeTreeData.fire() }
  getTreeItem(el: TreeNode): vscode.TreeItem { return el }

  getChildren(element?: TreeNode): TreeNode[] {
    if (element) return element.children ?? []

    const checkpoints = this.watcher.checkpoints
    if (checkpoints.length === 0) {
      return [new TreeNode('No checkpoints yet', 'hint', vscode.TreeItemCollapsibleState.None)]
    }

    const verdictIcons: Record<string, string> = {
      keep: '✓',
      ship: '✓',
      refine: '~',
      reject: '✗',
    }

    return checkpoints
      .slice()
      .reverse()
      .map((cp: CheckpointState) => {
        const icon = verdictIcons[cp.verdict] ?? '?'
        const anchor = cp.is_recovery_anchor ? ' ← anchor' : ''
        const label = `${icon} ${cp.verdict.toUpperCase()}${anchor}`
        const node = new TreeNode(label, 'checkpoint', vscode.TreeItemCollapsibleState.None, `"${cp.notes}"`)
        node.tooltip = `Commit: ${cp.git_commit.slice(0, 7)}\n${formatDate(cp.called_at)}`
        return node
      })
  }
}

// ─── Paused Work ─────────────────────────────────────────────────────────────

export class PausedWorkProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | null | void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  constructor(private watcher: StateWatcher) {
    watcher.onDidChange(() => this._onDidChangeTreeData.fire())
  }

  refresh(): void { this._onDidChangeTreeData.fire() }
  getTreeItem(el: TreeNode): vscode.TreeItem { return el }

  getChildren(element?: TreeNode): TreeNode[] {
    if (element) return element.children ?? []

    const state = this.watcher.state
    if (!state) {
      return [new TreeNode('No workspace state', 'hint', vscode.TreeItemCollapsibleState.None)]
    }

    const paused = Object.values(state.work_items).filter(wi => wi.stage === 'paused')
    if (paused.length === 0) {
      return [new TreeNode('No paused work items', 'hint', vscode.TreeItemCollapsibleState.None)]
    }

    return paused.map(wi => {
      const node = new TreeNode(wi.id, 'pausedItem', vscode.TreeItemCollapsibleState.None, wi.description)
      node.tooltip = `babel continue ${wi.id}`
      node.command = {
        command: 'babelgit.continueItem',
        title: 'Continue',
        arguments: [wi.id],
      }
      return node
    })
  }
}

// ─── Quick Actions ────────────────────────────────────────────────────────────

export class ActionsProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | null | void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  constructor(private watcher: StateWatcher) {
    watcher.onDidChange(() => this._onDidChangeTreeData.fire())
  }

  refresh(): void { this._onDidChangeTreeData.fire() }
  getTreeItem(el: TreeNode): vscode.TreeItem { return el }

  getChildren(element?: TreeNode): TreeNode[] {
    if (element) return element.children ?? []

    const wi = this.watcher.currentWorkItem
    const hasActive = !!wi
    const isRunSession = wi?.stage === 'run_session_open'
    const isShipReady = wi?.ship_ready

    const actions: Array<{ label: string; command: string; when: boolean }> = [
      { label: 'Start new work item',  command: 'babelgit.start',   when: !hasActive },
      { label: 'Save checkpoint',      command: 'babelgit.save',    when: hasActive && !isRunSession },
      { label: 'Sync with base',       command: 'babelgit.sync',    when: hasActive && !isRunSession },
      { label: 'Open run session',     command: 'babelgit.run',     when: hasActive && !isRunSession && !isShipReady },
      { label: 'Keep (verdict)',       command: 'babelgit.keep',    when: !!isRunSession },
      { label: 'Refine (verdict)',     command: 'babelgit.refine',  when: !!isRunSession },
      { label: 'Reject (verdict)',     command: 'babelgit.reject',  when: !!isRunSession },
      { label: 'Ship (verdict)',       command: 'babelgit.ship',    when: !!isRunSession },
      { label: 'Ship — deliver now',   command: 'babelgit.ship',    when: !!isShipReady && !isRunSession },
      { label: 'Pause work',           command: 'babelgit.pause',   when: hasActive && !isRunSession },
      { label: 'View history',         command: 'babelgit.history', when: hasActive },
    ]

    return actions
      .filter(a => a.when)
      .map(a => {
        const node = new TreeNode(a.label, 'action', vscode.TreeItemCollapsibleState.None)
        node.command = { command: a.command, title: a.label }
        return node
      })
  }
}
