import * as vscode from 'vscode'
import { StateWatcher, CheckpointState, WorkItemState, CheckpointGroup, GitStats } from './stateWatcher'

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

function stripWorkItemPrefix(text: string): string {
  return text.replace(/^WI-\d+\s*[:\-–]?\s*/i, '').trim()
}

function splitIntoLines(text: string, lineCount: number): string[] {
  const words = text.split(/\s+/)
  const targetLen = Math.ceil(text.length / lineCount)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    if (line.length > 0 && line.length >= targetLen && lines.length < lineCount - 1) {
      lines.push(line)
      line = word
    } else {
      line = line ? line + ' ' + word : word
    }
  }
  if (line) lines.push(line)
  return lines
}

function notesNodes(text: string, lineCount: number, notesPath: string): TreeNode[] {
  const cleaned = stripWorkItemPrefix(text)
  return splitIntoLines(cleaned, lineCount).map(l => {
    const node = new TreeNode(l, 'notesText', vscode.TreeItemCollapsibleState.None)
    node.tooltip = cleaned
    node.command = { command: 'babelgit.openNotes', title: 'Open notes', arguments: [notesPath] }
    return node
  })
}

function progressNode(stats: GitStats): TreeNode {
  const parts: string[] = []
  if (stats.filesChanged > 0) {
    parts.push(`${stats.filesChanged} file${stats.filesChanged !== 1 ? 's' : ''} (+${stats.insertions}/-${stats.deletions})`)
  }
  if (stats.commitsSinceCheckpoint > 0) {
    parts.push(`${stats.commitsSinceCheckpoint} commit${stats.commitsSinceCheckpoint !== 1 ? 's' : ''} since checkpoint`)
  }
  if (stats.minutesSinceCheckpoint !== null) {
    const mins = stats.minutesSinceCheckpoint
    const ago = mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ${mins % 60}m ago`
    parts.push(`last checkpoint ${ago}`)
  }

  const summary = parts.length > 0 ? parts.join(' · ') : 'no uncommitted changes'
  const node = new TreeNode(`Progress: ${summary}`, 'progress', vscode.TreeItemCollapsibleState.None)
  node.iconPath = new vscode.ThemeIcon(stats.filesChanged > 0 || stats.commitsSinceCheckpoint > 0 ? 'pulse' : 'check')
  return node
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

    const nodes = [
      labelNode('ID', wi.id),
      labelNode('Status', formatStage(wi)),
      labelNode('Branch', wi.branch),
      labelNode('Started', formatDate(wi.created_at)),
      labelNode('Description', wi.description),
    ]

    const stats = this.watcher.gitStats
    if (stats) {
      nodes.push(progressNode(stats))
    }

    const notes = this.watcher.workNotes
    const notesPath = this.watcher.workNotesPath
    if (notes && notesPath) {
      const [summary, lastChange] = notes.split(/\n---\n/)
      if (summary?.trim()) {
        const n = new TreeNode('Summary', 'notes', vscode.TreeItemCollapsibleState.Expanded)
        n.iconPath = new vscode.ThemeIcon('book')
        n.children = notesNodes(summary.trim(), 3, notesPath)
        nodes.push(n)
      }
      if (lastChange?.trim()) {
        const n = new TreeNode('Last change', 'notes', vscode.TreeItemCollapsibleState.Expanded)
        n.iconPath = new vscode.ThemeIcon('edit')
        n.children = notesNodes(lastChange.trim(), 2, notesPath)
        nodes.push(n)
      }
    }

    return nodes
  }
}

// ─── History ─────────────────────────────────────────────────────────────────

export class HistoryProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | null | void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  constructor(private watcher: StateWatcher) {
    watcher.onDidChange(() => this._onDidChangeTreeData.fire())
  }

  refresh(): void { this._onDidChangeTreeData.fire() }
  getTreeItem(el: TreeNode): vscode.TreeItem { return el }

  getChildren(element?: TreeNode): TreeNode[] {
    if (element) return element.children ?? []

    const groups = this.watcher.allCheckpointGroups
    if (groups.length === 0) {
      return [new TreeNode('No checkpoints yet', 'hint', vscode.TreeItemCollapsibleState.None)]
    }

    const currentId = this.watcher.currentWorkItem?.id
    const verdictIcons: Record<string, string> = { keep: '✓', ship: '✓', refine: '~', reject: '✗' }

    return groups.map((group: CheckpointGroup) => {
      const isActive = group.workItemId === currentId
      const label = isActive ? `${group.workItemId} (active)` : group.workItemId
      const groupNode = new TreeNode(
        label,
        'checkpointGroup',
        vscode.TreeItemCollapsibleState.Expanded,
        group.description
      )
      groupNode.iconPath = new vscode.ThemeIcon(isActive ? 'circle-filled' : 'circle-outline')

      groupNode.children = group.checkpoints
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

      return groupNode
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
