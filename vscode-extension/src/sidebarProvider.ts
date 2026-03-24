import * as vscode from 'vscode'
import { StateWatcher, CheckpointState, WorkItemState, CheckpointGroup, GitStats, WatchEvent, RemoteBranch } from './stateWatcher'

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
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

function formatAge(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
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
      // Show warning if there are uncommitted changes with no active WI
      const stats = this.watcher.gitStats
      if (stats && stats.filesChanged > 0) {
        const warning = new TreeNode(
          `⚠ ${stats.filesChanged} file${stats.filesChanged !== 1 ? 's' : ''} changed — no active work item`,
          'warning',
          vscode.TreeItemCollapsibleState.None
        )
        warning.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'))
        const start = new TreeNode('Start a work item', 'action', vscode.TreeItemCollapsibleState.None)
        start.iconPath = new vscode.ThemeIcon('plus')
        start.command = { command: 'babelgit.start', title: 'Start' }
        return [warning, start]
      }
      const hint = new TreeNode('No active work item', 'hint', vscode.TreeItemCollapsibleState.None)
      hint.iconPath = new vscode.ThemeIcon('info')
      const start = new TreeNode('Start a work item', 'action', vscode.TreeItemCollapsibleState.None)
      start.iconPath = new vscode.ThemeIcon('plus')
      start.command = { command: 'babelgit.start', title: 'Start' }
      return [hint, start]
    }

    const nodes = [
      labelNode('ID', wi.id),
      labelNode('Status', formatStage(wi)),
      labelNode('Branch', wi.branch ?? '—'),
      labelNode('Started', formatDate(wi.created_at)),
      labelNode('Description', wi.description),
    ]

    // Pause button inline
    const pauseNode = new TreeNode('Pause work', 'action', vscode.TreeItemCollapsibleState.None)
    pauseNode.iconPath = new vscode.ThemeIcon('debug-pause')
    pauseNode.command = { command: 'babelgit.pause', title: 'Pause' }
    nodes.push(pauseNode)

    const stats = this.watcher.gitStats
    if (stats) nodes.push(progressNode(stats))

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

// ─── Board (History) ──────────────────────────────────────────────────────────

interface BucketMeta {
  icon: string
  color: string
  expanded: boolean
}

const BUCKET_META: Record<string, BucketMeta> = {
  todo:             { icon: 'circle-outline',    color: 'charts.blue',   expanded: true  },
  in_progress:      { icon: 'circle-filled',     color: 'charts.blue',   expanded: true  },
  ship_ready:       { icon: 'git-merge',         color: 'charts.green',  expanded: true  },
  pr_open:          { icon: 'git-pull-request',  color: 'charts.purple', expanded: true  },
  run_session_open: { icon: 'circle-filled',     color: 'charts.yellow', expanded: true  },
  paused:           { icon: 'debug-pause',       color: 'charts.orange', expanded: true  },
  shipped:          { icon: 'pass',              color: 'charts.green',  expanded: false },
  stopped:          { icon: 'circle-slash',      color: 'charts.red',    expanded: false },
}

const VERDICT_ICONS: Record<string, string> = { keep: '✓', ship: '✓', refine: '~', reject: '✗' }

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

    const state = this.watcher.state
    const groups = this.watcher.allCheckpointGroups
    const verdicts = this.watcher.verdicts
    const remote = this.watcher.remoteBranches
    const githubBaseUrl = this.watcher.githubBaseUrl
    const workspacePath = this.watcher.workspacePath

    if (!state && groups.length === 0 && remote.length === 0) {
      const hint = new TreeNode('No work items yet', 'hint', vscode.TreeItemCollapsibleState.None)
      hint.iconPath = new vscode.ThemeIcon('info')
      return [hint]
    }

    const workItems = Object.values(state?.work_items ?? {})

    // Group items by stage
    const byStage: Record<string, WorkItemState[]> = {}
    for (const wi of workItems) {
      if (!byStage[wi.stage]) byStage[wi.stage] = []
      byStage[wi.stage].push(wi)
    }

    // Ordered bucket stages
    const stageOrder: string[] = ['todo', 'in_progress', 'ship_ready', 'pr_open', 'run_session_open', 'paused', 'shipped', 'stopped']

    // Label for shipped bucket uses config's verdicts.ship value
    const shipLabel = capitalize(verdicts.ship)

    const stageLabelMap: Record<string, string> = {
      todo:             'Todo',
      in_progress:      'In Progress',
      ship_ready:       'Ready to Merge',
      pr_open:          'PR Open',
      run_session_open: 'Review Open',
      paused:           'Paused',
      shipped:          shipLabel,
      stopped:          'Stopped',
    }

    const buckets: TreeNode[] = []

    // Separate ship_ready items out of in_progress for their own bucket
    const shipReadyItems = (byStage['in_progress'] ?? []).filter(w => w.ship_ready)
    const inProgressItems = (byStage['in_progress'] ?? []).filter(w => !w.ship_ready)
    byStage['in_progress'] = inProgressItems
    byStage['ship_ready'] = shipReadyItems

    for (const stage of stageOrder) {
      const items = (byStage[stage] ?? []).sort((a, b) => b.id.localeCompare(a.id))
      const meta = BUCKET_META[stage]

      // For in_progress, also add remote teammate branches
      const teamItems: RemoteBranch[] = stage === 'in_progress'
        ? remote.filter(r => !r.isLocal)
        : []

      if (items.length === 0 && teamItems.length === 0) continue

      const label = stageLabelMap[stage] ?? stage
      const collapsible = meta.expanded
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed

      const bucket = new TreeNode(
        `${label} (${items.length + teamItems.length})`,
        'bucket',
        collapsible
      )
      bucket.iconPath = new vscode.ThemeIcon(meta.icon, new vscode.ThemeColor(meta.color))

      const children: TreeNode[] = []

      // Your own items
      for (const wi of items) {
        const group = groups.find(g => g.workItemId === wi.id)
        children.push(this.buildWINode(wi, group, stage, verdicts, githubBaseUrl, workspacePath, state?.current_work_item_id ?? undefined))
      }

      // Teammate items (remote branches not in local state)
      for (const rb of teamItems) {
        const node = new TreeNode(rb.workItemId, 'historyGroup', vscode.TreeItemCollapsibleState.None, rb.description)
        node.iconPath = new vscode.ThemeIcon('person', new vscode.ThemeColor('charts.blue'))
        node.description = rb.description + '  (teammate)'
        node.tooltip = `Remote branch: ${rb.name}`
        children.push(node)
      }

      bucket.children = children
      buckets.push(bucket)
    }

    return buckets
  }

  private buildWINode(
    wi: WorkItemState,
    group: CheckpointGroup | undefined,
    stage: string,
    verdicts: { keep: string; refine: string; reject: string; ship: string },
    githubBaseUrl: string | null,
    workspacePath: string | undefined,
    currentWorkItemId?: string
  ): TreeNode {
    const isTodo = stage === 'todo'
    const isPaused = stage === 'paused'

    const collapsible = (isTodo || isPaused)
      ? vscode.TreeItemCollapsibleState.Expanded
      : vscode.TreeItemCollapsibleState.Collapsed

    const isDraft = wi.id.startsWith('DRAFT-')
    const displayId = isDraft ? `⏳ ${wi.id}` : wi.id

    const node = new TreeNode(displayId, 'historyGroup', collapsible, wi.description)
    node.description = wi.description
    const meta = BUCKET_META[stage] ?? { icon: 'circle-outline', color: 'foreground' }
    node.iconPath = isDraft
      ? new vscode.ThemeIcon('loading~spin', new vscode.ThemeColor('charts.yellow'))
      : new vscode.ThemeIcon(meta.icon, new vscode.ThemeColor(meta.color))
    if (isDraft) {
      node.tooltip = 'Pending ID reservation — will be assigned a permanent WI number when online'
    }

    // Route click: todo items open their spec file; everything else opens the detail panel
    if (workspacePath) {
      if (isTodo) {
        const notesPath = `${workspacePath}/.babel/notes/${wi.id}.md`
        node.command = { command: 'babelgit.openNotes', title: 'Open spec', arguments: [notesPath] }
      } else {
        node.command = { command: 'babelgit.openWorkItem', title: 'Open detail', arguments: [wi.id] }
      }
    }

    const children: TreeNode[] = []

    if (isTodo) {
      if (isDraft) {
        const waitNode = new TreeNode('Waiting for ID reservation…', 'label', vscode.TreeItemCollapsibleState.None)
        waitNode.iconPath = new vscode.ThemeIcon('loading~spin', new vscode.ThemeColor('charts.yellow'))
        waitNode.tooltip = 'The watcher will claim a permanent WI number when connectivity is restored.'
        children.push(waitNode)
      } else {
        const startNode = new TreeNode('Start work', 'action', vscode.TreeItemCollapsibleState.None)
        startNode.iconPath = new vscode.ThemeIcon('debug-start', new vscode.ThemeColor('charts.green'))
        startNode.command = { command: 'babelgit.startItem', title: 'Start', arguments: [wi.id] }
        children.push(startNode)

        const trashNode = new TreeNode('Trash', 'action', vscode.TreeItemCollapsibleState.None)
        trashNode.iconPath = new vscode.ThemeIcon('trash', new vscode.ThemeColor('list.errorForeground'))
        trashNode.command = { command: 'babelgit.deleteItem', title: 'Trash', arguments: [wi.id] }
        children.push(trashNode)
      }
    }

    if (stage === 'run_session_open' && currentWorkItemId !== wi.id) {
      const trashNode = new TreeNode('Trash', 'action', vscode.TreeItemCollapsibleState.None)
      trashNode.iconPath = new vscode.ThemeIcon('trash', new vscode.ThemeColor('list.errorForeground'))
      trashNode.command = { command: 'babelgit.deleteItem', title: 'Trash', arguments: [wi.id] }
      children.push(trashNode)
    }

    if (stage === 'pr_open' && wi.pr_url) {
      const prNode = new TreeNode('View PR →', 'action', vscode.TreeItemCollapsibleState.None)
      prNode.iconPath = new vscode.ThemeIcon('git-pull-request', new vscode.ThemeColor('charts.purple'))
      prNode.command = { command: 'vscode.open', title: 'View PR', arguments: [vscode.Uri.parse(wi.pr_url)] }
      prNode.tooltip = wi.pr_url
      children.push(prNode)
    }

    if (wi.ship_ready && stage !== 'shipped') {
      const mergeNode = new TreeNode('Merge to main →', 'action', vscode.TreeItemCollapsibleState.None)
      mergeNode.iconPath = new vscode.ThemeIcon('git-merge', new vscode.ThemeColor('charts.green'))
      mergeNode.command = { command: 'babelgit.ship', title: 'Merge to main' }
      mergeNode.tooltip = 'Ship verdict approved — run babel ship to merge this branch into main'
      children.push(mergeNode)
    }

    if (isPaused) {
      const continueNode = new TreeNode('Continue this work', 'action', vscode.TreeItemCollapsibleState.None)
      continueNode.iconPath = new vscode.ThemeIcon('debug-continue', new vscode.ThemeColor('charts.green'))
      continueNode.command = { command: 'babelgit.continueItem', title: 'Continue', arguments: [wi.id] }
      children.push(continueNode)
      if (wi.paused_notes) {
        const notesNode = new TreeNode(`"${wi.paused_notes}"`, 'label', vscode.TreeItemCollapsibleState.None)
        notesNode.iconPath = new vscode.ThemeIcon('comment')
        children.push(notesNode)
      }
    }

    // Checkpoints
    if (group && group.checkpoints.length > 0) {
      group.checkpoints.slice().reverse().forEach((cp: CheckpointState) => {
        const icon = VERDICT_ICONS[cp.verdict] ?? '?'
        const anchor = cp.is_recovery_anchor ? ' ⚓' : ''
        const cpNode = new TreeNode(
          `${icon} ${cp.verdict.toUpperCase()}${anchor}`,
          'checkpoint',
          vscode.TreeItemCollapsibleState.None
        )
        cpNode.tooltip = `Commit: ${cp.git_commit.slice(0, 7)}\n${formatDate(cp.called_at)}`
        cpNode.description = `"${cp.notes}"  ${formatAge(cp.called_at)}`
        children.push(cpNode)
      })
    }

    node.children = children
    return node
  }
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
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

    if (!this.watcher.isInitialized) {
      const node = new TreeNode('Initialize babel in this folder', 'action', vscode.TreeItemCollapsibleState.None)
      node.iconPath = new vscode.ThemeIcon('getting-started-setup')
      node.command = { command: 'babelgit.init', title: 'Initialize babel' }
      return [node]
    }

    const wi = this.watcher.currentWorkItem
    const hasActive = !!wi
    const isRunSession = wi?.stage === 'run_session_open'
    const isShipReady = wi?.ship_ready

    const actions: Array<{ label: string; command: string; icon: string; when: boolean }> = [
      { label: 'Start new work item', command: 'babelgit.start',   icon: 'plus',          when: !hasActive },
      { label: 'Save checkpoint',     command: 'babelgit.save',    icon: 'save',           when: hasActive && !isRunSession },
      { label: 'Sync with base',      command: 'babelgit.sync',    icon: 'sync',           when: hasActive && !isRunSession },
      { label: 'Open run session',    command: 'babelgit.run',     icon: 'play-circle',    when: hasActive && !isRunSession && !isShipReady },
      { label: 'Keep',                command: 'babelgit.keep',    icon: 'pass',           when: !!isRunSession },
      { label: 'Refine',              command: 'babelgit.refine',  icon: 'edit',           when: !!isRunSession },
      { label: 'Reject',              command: 'babelgit.reject',  icon: 'discard',        when: !!isRunSession },
      { label: 'Ship (verdict)',      command: 'babelgit.ship',    icon: 'rocket',         when: !!isRunSession },
      { label: 'Merge to main →',      command: 'babelgit.ship',    icon: 'git-merge',      when: !!isShipReady && !isRunSession },
      { label: 'View history',        command: 'babelgit.history', icon: 'history',        when: hasActive },
    ]

    return actions.filter(a => a.when).map(a => {
      const node = new TreeNode(a.label, 'action', vscode.TreeItemCollapsibleState.None)
      const isMerge = a.command === 'babelgit.ship' && !!isShipReady && !isRunSession
      node.iconPath = isMerge
        ? new vscode.ThemeIcon(a.icon, new vscode.ThemeColor('charts.green'))
        : new vscode.ThemeIcon(a.icon)
      node.command = { command: a.command, title: a.label }
      return node
    })
  }
}

// ─── Watcher ──────────────────────────────────────────────────────────────────

export class WatcherProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | null | void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  constructor(private watcher: StateWatcher) {
    watcher.onDidChange(() => this._onDidChangeTreeData.fire())
  }

  refresh(): void { this._onDidChangeTreeData.fire() }
  getTreeItem(el: TreeNode): vscode.TreeItem { return el }

  getChildren(element?: TreeNode): TreeNode[] {
    if (element) return element.children ?? []

    const status = this.watcher.watchStatus

    if (!status || !status.running) {
      const stoppedNode = new TreeNode('Watcher stopped', 'watcherStatus', vscode.TreeItemCollapsibleState.None)
      stoppedNode.iconPath = new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('charts.red'))

      const startNode = new TreeNode('Start watcher', 'action', vscode.TreeItemCollapsibleState.None)
      startNode.iconPath = new vscode.ThemeIcon('debug-start', new vscode.ThemeColor('charts.green'))
      startNode.command = { command: 'babelgit.watchStart', title: 'Start Watcher' }

      const infoNode = new TreeNode('File edits without a WI are not blocked', 'hint', vscode.TreeItemCollapsibleState.None)
      infoNode.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'))

      return [stoppedNode, startNode, infoNode]
    }

    const nodes: TreeNode[] = []

    // Status header
    const runningNode = new TreeNode('Watcher running', 'watcherStatus', vscode.TreeItemCollapsibleState.None)
    runningNode.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.green'))
    if (status.startedAt) runningNode.description = `since ${formatAge(status.startedAt)}`
    nodes.push(runningNode)

    // Last check
    if (status.lastCheck) {
      const secs = Math.round((Date.now() - new Date(status.lastCheck).getTime()) / 1000)
      const checkNode = new TreeNode(`Last check: ${secs}s ago`, 'label', vscode.TreeItemCollapsibleState.None)
      checkNode.iconPath = new vscode.ThemeIcon('clock')
      nodes.push(checkNode)
    }

    // Stop button
    const stopNode = new TreeNode('Stop watcher', 'action', vscode.TreeItemCollapsibleState.None)
    stopNode.iconPath = new vscode.ThemeIcon('debug-stop', new vscode.ThemeColor('charts.red'))
    stopNode.command = { command: 'babelgit.watchStop', title: 'Stop Watcher' }
    nodes.push(stopNode)

    // Recent alert events
    const events = this.watcher.watchEvents
    const alerts = events
      .filter((e: WatchEvent) => ['revert', 'ci_failure', 'external_commit', 'auto_save', 'error'].includes(e.type))
      .slice(-5)
      .reverse()

    if (alerts.length > 0) {
      const alertsHeader = new TreeNode(`Recent events (${alerts.length})`, 'section', vscode.TreeItemCollapsibleState.Expanded)
      alertsHeader.iconPath = new vscode.ThemeIcon('bell')
      alertsHeader.children = alerts.map((ev: WatchEvent) => {
        const icons: Record<string, string> = {
          revert: 'warning',
          ci_failure: 'error',
          external_commit: 'arrow-down',
          auto_save: 'save',
          error: 'bug',
        }
        const colors: Record<string, string> = {
          revert: 'list.warningForeground',
          ci_failure: 'list.errorForeground',
          external_commit: 'charts.blue',
          auto_save: 'charts.green',
          error: 'list.errorForeground',
        }
        const node = new TreeNode(ev.message, 'watchEvent', vscode.TreeItemCollapsibleState.None)
        node.iconPath = new vscode.ThemeIcon(icons[ev.type] ?? 'info', new vscode.ThemeColor(colors[ev.type] ?? 'foreground'))
        node.description = formatAge(ev.timestamp)
        node.tooltip = `${ev.type} · ${formatDate(ev.timestamp)}`
        return node
      })
      nodes.push(alertsHeader)
    }

    return nodes
  }
}
