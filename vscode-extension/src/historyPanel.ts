import * as vscode from 'vscode'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { StateWatcher, CheckpointState } from './stateWatcher'

interface GitCommit {
  sha: string
  shortSha: string
  message: string
  author: string
  date: string
}

export class HistoryPanel {
  private static panel: vscode.WebviewPanel | undefined

  static show(watcher: StateWatcher): void {
    const workspacePath = watcher.workspacePath
    if (!workspacePath) {
      vscode.window.showErrorMessage('No workspace folder open')
      return
    }

    if (HistoryPanel.panel) {
      HistoryPanel.panel.reveal()
      HistoryPanel.render(HistoryPanel.panel, watcher, workspacePath)
      return
    }

    const panel = vscode.window.createWebviewPanel(
      'babelgitHistory',
      'babelgit History',
      vscode.ViewColumn.One,
      { enableScripts: false }
    )

    HistoryPanel.panel = panel
    panel.onDidDispose(() => {
      HistoryPanel.panel = undefined
    })

    HistoryPanel.render(panel, watcher, workspacePath)
    watcher.onDidChange(() => {
      if (HistoryPanel.panel) {
        HistoryPanel.render(HistoryPanel.panel, watcher, workspacePath)
      }
    })
  }

  private static render(
    panel: vscode.WebviewPanel,
    watcher: StateWatcher,
    workspacePath: string
  ): void {
    const wi = watcher.currentWorkItem
    const checkpoints = watcher.checkpoints
    const commits = getGitLog(workspacePath)
    const checkpointsByCommit = indexCheckpoints(checkpoints)

    panel.title = wi ? `babelgit History — ${wi.id}` : 'babelgit History'
    panel.webview.html = buildHtml(wi, commits, checkpointsByCommit, checkpoints)
  }
}

function getGitLog(cwd: string): GitCommit[] {
  try {
    const out = execSync('git log --format="%H|%h|%s|%an|%ai" -40', { cwd, encoding: 'utf8' })
    return out
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const parts = line.split('|')
        return {
          sha: parts[0] ?? '',
          shortSha: parts[1] ?? '',
          message: parts[2] ?? '',
          author: parts[3] ?? '',
          date: parts[4] ? new Date(parts[4]).toLocaleString() : '',
        }
      })
  } catch {
    return []
  }
}

function getAllCheckpoints(workspacePath: string, workItemId: string): CheckpointState[] {
  const dir = path.join(workspacePath, '.babel', 'checkpoints', workItemId)
  if (!fs.existsSync(dir)) return []
  try {
    return fs
      .readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as CheckpointState
        } catch {
          return null
        }
      })
      .filter((c): c is CheckpointState => c !== null)
  } catch {
    return []
  }
}

function indexCheckpoints(checkpoints: CheckpointState[]): Map<string, CheckpointState> {
  const map = new Map<string, CheckpointState>()
  for (const cp of checkpoints) {
    map.set(cp.git_commit, cp)
  }
  return map
}

function buildHtml(
  wi: { id: string; description: string; branch: string } | null,
  commits: GitCommit[],
  checkpointsByCommit: Map<string, CheckpointState>,
  checkpoints: CheckpointState[]
): string {
  const verdictColor: Record<string, string> = {
    keep: '#4caf50',
    ship: '#00bcd4',
    refine: '#ff9800',
    reject: '#f44336',
  }

  const commitRows = commits
    .map(c => {
      const cp = checkpointsByCommit.get(c.sha)
      const badge = cp
        ? `<span class="badge" style="background:${verdictColor[cp.verdict] ?? '#888'}">${cp.verdict.toUpperCase()}${cp.is_recovery_anchor ? ' ⚓' : ''}</span>`
        : ''
      const notes = cp ? `<div class="cp-notes">"${escHtml(cp.notes)}"</div>` : ''
      return `
      <tr class="${cp ? 'has-checkpoint' : ''}">
        <td class="sha"><code>${escHtml(c.shortSha)}</code></td>
        <td class="msg">${escHtml(c.message)}${notes}</td>
        <td class="badge-cell">${badge}</td>
        <td class="meta">${escHtml(c.author)}</td>
        <td class="meta">${escHtml(c.date)}</td>
      </tr>`
    })
    .join('')

  const header = wi
    ? `<div class="header"><strong>${escHtml(wi.id)}</strong> — ${escHtml(wi.description)}<br><small>Branch: ${escHtml(wi.branch)} · ${checkpoints.length} checkpoint(s)</small></div>`
    : '<div class="header">No active work item</div>'

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>babelgit History</title>
<style>
  body { font-family: var(--vscode-font-family); font-size: 13px; color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px; }
  .header { margin-bottom: 16px; padding: 12px; background: var(--vscode-sideBar-background); border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--vscode-panel-border); color: var(--vscode-descriptionForeground); font-weight: normal; }
  td { padding: 5px 8px; border-bottom: 1px solid var(--vscode-panel-border); vertical-align: top; }
  tr.has-checkpoint { background: var(--vscode-list-hoverBackground); }
  .sha code { font-size: 11px; color: var(--vscode-textLink-foreground); }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 11px; font-weight: bold; color: #fff; }
  .badge-cell { white-space: nowrap; }
  .cp-notes { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 2px; font-style: italic; }
  .meta { color: var(--vscode-descriptionForeground); font-size: 11px; }
</style>
</head>
<body>
${header}
<table>
  <thead>
    <tr>
      <th>Commit</th>
      <th>Message</th>
      <th>Checkpoint</th>
      <th>Author</th>
      <th>Date</th>
    </tr>
  </thead>
  <tbody>
    ${commitRows || '<tr><td colspan="5" style="text-align:center;padding:20px">No commits found</td></tr>'}
  </tbody>
</table>
</body>
</html>`
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
