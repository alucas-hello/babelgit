import * as vscode from 'vscode'
import { StateWatcher } from './stateWatcher'

export class StatusBarManager {
  private item: vscode.StatusBarItem

  constructor(private watcher: StateWatcher) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
    this.item.command = 'babelgit.state'
    this.update()
    watcher.onDidChange(() => this.update())
  }

  private update(): void {
    const wi = this.watcher.currentWorkItem

    if (!wi) {
      this.item.hide()
      return
    }

    const stageIcons: Record<string, string> = {
      in_progress: '$(circle-filled)',
      run_session_open: '$(eye)',
      paused: '$(debug-pause)',
      shipped: '$(check)',
      stopped: '$(stop)',
    }

    const icon = stageIcons[wi.stage] ?? '$(question)'
    const label = wi.ship_ready ? 'Ship Ready' : this.stageLabel(wi.stage)
    const shortId = wi.id.length > 12 ? wi.id.slice(0, 12) : wi.id

    this.item.text = `${icon} ${shortId}  ${label}`
    this.item.tooltip = `${wi.id}: ${wi.description}\nBranch: ${wi.branch}\nClick to refresh state`

    if (wi.ship_ready) {
      this.item.color = new vscode.ThemeColor('charts.purple')
    } else if (wi.stage === 'run_session_open') {
      this.item.color = new vscode.ThemeColor('charts.blue')
    } else if (wi.stage === 'in_progress') {
      this.item.color = new vscode.ThemeColor('charts.green')
    } else if (wi.stage === 'paused') {
      this.item.color = new vscode.ThemeColor('charts.yellow')
    } else {
      this.item.color = undefined
    }

    this.item.show()
  }

  private stageLabel(stage: string): string {
    const labels: Record<string, string> = {
      in_progress: 'In Progress',
      run_session_open: 'Run Session Open',
      paused: 'Paused',
      shipped: 'Shipped',
      stopped: 'Stopped',
    }
    return labels[stage] ?? stage
  }

  dispose(): void {
    this.item.dispose()
  }
}
