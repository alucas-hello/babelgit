import * as vscode from 'vscode'
import { StateWatcher, CheckpointState } from './stateWatcher'

export class SidebarProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | null | void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  constructor(private watcher: StateWatcher) {
    watcher.onDidChange(() => this._onDidChangeTreeData.fire())
  }

  refresh(): void {
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (element) {
      return element.children ?? []
    }

    const wi = this.watcher.currentWorkItem
    if (!wi) {
      return [new TreeNode('No active work item', 'hint', vscode.TreeItemCollapsibleState.None)]
    }

    const checkpoints = this.watcher.checkpoints
    const stageLabel = wi.ship_ready ? 'Ship Ready' : formatStage(wi.stage)

    const workItemNode = new TreeNode(
      wi.id,
      'workItem',
      vscode.TreeItemCollapsibleState.Expanded,
      wi.description
    )

    workItemNode.children = [
      labelNode('Status', stageLabel),
      labelNode('Branch', wi.branch),
      labelNode('Started', formatDate(wi.created_at)),
      ...checkpointSection(checkpoints),
    ]

    return [workItemNode]
  }
}

function labelNode(key: string, value: string): TreeNode {
  const node = new TreeNode(`${key}: ${value}`, 'label', vscode.TreeItemCollapsibleState.None)
  return node
}

function checkpointSection(checkpoints: CheckpointState[]): TreeNode[] {
  if (checkpoints.length === 0) {
    return [labelNode('Checkpoints', 'none')]
  }

  const sectionNode = new TreeNode(
    `Checkpoints (${checkpoints.length})`,
    'section',
    vscode.TreeItemCollapsibleState.Collapsed
  )

  sectionNode.children = checkpoints
    .slice()
    .reverse()
    .map(cp => {
      const verdictIcons: Record<string, string> = {
        keep: '✓',
        ship: '✓',
        refine: '~',
        reject: '✗',
      }
      const icon = verdictIcons[cp.verdict] ?? '?'
      const anchor = cp.is_recovery_anchor ? ' ← anchor' : ''
      const label = `${icon} ${cp.verdict.toUpperCase()}${anchor} — "${cp.notes}"`
      const node = new TreeNode(label, 'checkpoint', vscode.TreeItemCollapsibleState.None)
      node.description = formatDate(cp.called_at)
      node.tooltip = `Commit: ${cp.git_commit.slice(0, 7)}\n${formatDate(cp.called_at)}`
      return node
    })

  return [sectionNode]
}

function formatStage(stage: string): string {
  const labels: Record<string, string> = {
    in_progress: 'In Progress',
    run_session_open: 'Run Session Open',
    paused: 'Paused',
    shipped: 'Shipped',
    stopped: 'Stopped',
  }
  return labels[stage] ?? stage
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
    if (description) {
      this.description = description
    }

    if (contextValue === 'workItem') {
      this.iconPath = new vscode.ThemeIcon('circle-filled')
    } else if (contextValue === 'hint') {
      this.iconPath = new vscode.ThemeIcon('info')
    } else if (contextValue === 'section') {
      this.iconPath = new vscode.ThemeIcon('history')
    }
  }
}
