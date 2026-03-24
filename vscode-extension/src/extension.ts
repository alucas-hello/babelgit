import * as vscode from 'vscode'
import { StateWatcher } from './stateWatcher'
import { BabelRunner } from './babelRunner'
import { StatusBarManager } from './statusBar'
import { ActiveWorkProvider, HistoryProvider, ActionsProvider, WatcherProvider } from './sidebarProvider'
import { HistoryPanel } from './historyPanel'
import { RunPanel } from './runPanel'
import { WorkItemPanel } from './workItemPanel'
import { BoardPanel } from './boardPanel'

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('babelgit')
  const watcher = new StateWatcher()
  const runner = new BabelRunner(outputChannel)
  const statusBar = new StatusBarManager(watcher)
  const activeProvider = new ActiveWorkProvider(watcher)
  const historyProvider = new HistoryProvider(watcher)
  const actionsProvider = new ActionsProvider(watcher)
  const watcherProvider = new WatcherProvider(watcher)

  vscode.window.createTreeView('babelgitActive', { treeDataProvider: activeProvider })
  vscode.window.createTreeView('babelgitHistory', { treeDataProvider: historyProvider })
  vscode.window.createTreeView('babelgitActions', { treeDataProvider: actionsProvider })
  vscode.window.createTreeView('babelgitWatcher', { treeDataProvider: watcherProvider })

  const refreshAll = () => { watcher.refresh() }

  const cmd = (id: string, fn: (...args: unknown[]) => Promise<void>) =>
    vscode.commands.registerCommand(id, async (...args: unknown[]) => {
      try { await fn(...args) } catch { /* shown in output channel */ }
    })

  context.subscriptions.push(
    outputChannel,
    watcher,
    statusBar,

    cmd('babelgit.init', async () => {
      await runner.run(['init'])
      refreshAll()
    }),

    cmd('babelgit.start', async () => {
      const desc = await vscode.window.showInputBox({
        prompt: 'What are you working on?',
        placeHolder: 'fix login timeout on mobile',
      })
      if (!desc) return
      await runner.run(['start', desc])
      refreshAll()
    }),

    cmd('babelgit.save', async () => {
      const notes = await vscode.window.showInputBox({
        prompt: 'Notes for this save',
        placeHolder: 'auth flow working',
      })
      if (notes === undefined) return
      const args = notes ? ['save', notes] : ['save']
      await runner.run(args)
      refreshAll()
    }),

    cmd('babelgit.run', async () => {
      await runner.run(['run'])
      refreshAll()
      RunPanel.show(watcher, runner)
    }),

    cmd('babelgit.keep', async () => {
      const notes = await vscode.window.showInputBox({
        prompt: 'Keep — what did you verify?',
        placeHolder: 'tested on mobile, looks good',
      })
      if (notes === undefined) return
      const args = notes ? ['keep', notes] : ['keep']
      await runner.run(args)
      refreshAll()
    }),

    cmd('babelgit.refine', async () => {
      const notes = await vscode.window.showInputBox({
        prompt: 'Refine — what needs to change?',
        placeHolder: 'button alignment off on small screens',
      })
      if (notes === undefined) return
      const args = notes ? ['refine', notes] : ['refine']
      await runner.run(args)
      refreshAll()
    }),

    cmd('babelgit.reject', async () => {
      const reason = await vscode.window.showInputBox({
        prompt: 'Reject — why is this the wrong direction?',
        placeHolder: 'wrong approach entirely',
      })
      if (reason === undefined) return
      const args = reason ? ['reject', reason] : ['reject']
      await runner.run(args)
      refreshAll()
    }),

    cmd('babelgit.ship', async () => {
      const wi = watcher.currentWorkItem
      if (wi?.ship_ready) {
        await runner.run(['ship'])
      } else {
        const notes = await vscode.window.showInputBox({
          prompt: 'Ship — what makes this production-ready?',
          placeHolder: 'all tests pass, reviewed',
        })
        if (notes === undefined) return
        const args = notes ? ['ship', notes] : ['ship']
        await runner.run(args)
      }
      refreshAll()
    }),

    cmd('babelgit.sync', async () => {
      await runner.run(['sync'])
      refreshAll()
    }),

    cmd('babelgit.pause', async () => {
      const notes = await vscode.window.showInputBox({
        prompt: 'Pause — notes for the next person',
        placeHolder: 'left off on the auth middleware',
      })
      if (notes === undefined) return
      const args = notes ? ['pause', notes] : ['pause']
      await runner.run(args)
      refreshAll()
    }),

    cmd('babelgit.deleteItem', async (...args: unknown[]) => {
      const id = args[0] as string | undefined
      if (!id) return
      const wi = watcher.state?.work_items[id]
      const confirm = await vscode.window.showWarningMessage(
        `Trash "${wi?.description ?? id}"?`,
        { modal: true },
        'Trash it'
      )
      if (confirm !== 'Trash it') return
      // Write state directly — babel stop has an interactive y/N prompt we can't answer
      const fs = require('fs') as typeof import('fs')
      const path = require('path') as typeof import('path')
      const root = watcher.workspacePath
      if (root) {
        const statePath = path.join(root, '.babel', 'state.json')
        try {
          const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
          if (state.work_items[id]) {
            state.work_items[id].stage = 'stopped'
            state.work_items[id].ship_ready = false
          }
          if (state.current_work_item_id === id) delete state.current_work_item_id
          fs.writeFileSync(statePath, JSON.stringify(state, null, 2))
        } catch { /* ignore */ }
      }
      refreshAll()
    }),

    cmd('babelgit.continueItem', async (...args: unknown[]) => {
      const id = args[0] as string | undefined
      if (!id) return
      await runner.run(['continue', id])
      refreshAll()
    }),

    cmd('babelgit.startItem', async (...args: unknown[]) => {
      const id = args[0] as string | undefined
      if (!id) return
      await runner.run(['start', id])
      refreshAll()
      // Write agent inbox so the next Claude Code message picks this up
      const root = watcher.workspacePath
      if (root) {
        const fs = require('fs') as typeof import('fs')
        const path = require('path') as typeof import('path')
        const wi = watcher.state?.work_items[id]
        const inbox = {
          work_item_id: id,
          description: wi?.description ?? '',
          branch: wi?.branch ?? '',
          started_at: new Date().toISOString(),
          source: 'extension',
        }
        fs.writeFileSync(
          path.join(root, '.babel', 'agent-inbox.json'),
          JSON.stringify(inbox, null, 2)
        )
      }
      // Spawn or focus a claude terminal and trigger the UserPromptSubmit hook automatically
      const TERMINAL_NAME = 'Claude'
      const existing = vscode.window.terminals.find(
        t => t.name === TERMINAL_NAME && t.exitStatus === undefined
      )
      if (existing) {
        existing.show()
        // Small delay to ensure terminal is focused, then send newline to fire hook
        setTimeout(() => existing.sendText('\n'), 500)
      } else {
        const t = vscode.window.createTerminal({
          name: TERMINAL_NAME,
          shellPath: 'claude',
          cwd: watcher.workspacePath ?? undefined,
        })
        t.show()
        // Longer delay for claude to start up before sending trigger
        setTimeout(() => t.sendText('\n'), 3000)
      }
    }),

    cmd('babelgit.todoPush', async (...args: unknown[]) => {
      const id = args[0] as string | undefined
      if (!id) return
      await runner.run(['todo', 'push', id])
      refreshAll()
    }),

    cmd('babelgit.state', () => {
      refreshAll()
      return Promise.resolve()
    }),

    cmd('babelgit.history', async () => {
      HistoryPanel.show(watcher)
    }),

    cmd('babelgit.board', async () => {
      BoardPanel.show(watcher)
    }),

    cmd('babelgit.openWorkItem', async (...args: unknown[]) => {
      const id = args[0] as string | undefined
      if (!id) return
      const wi = watcher.state?.work_items[id]
      if (!wi) return
      const root = watcher.workspacePath
      if (!root) return
      if (wi.stage === 'run_session_open' && watcher.currentWorkItem?.id === id) {
        RunPanel.show(watcher, runner)
      } else {
        const group = watcher.allCheckpointGroups.find(g => g.workItemId === id)
        const checkpoints = group?.checkpoints ?? []
        WorkItemPanel.open(context, wi, checkpoints, root)
      }
    }),

    cmd('babelgit.openNotes', async (...args: unknown[]) => {
      const filePath = args[0] as string | undefined
      if (!filePath) return
      const uri = vscode.Uri.file(filePath)
      const doc = await vscode.workspace.openTextDocument(uri)
      await vscode.window.showTextDocument(doc)
    }),

    cmd('babelgit.watchStart', async () => {
      await runner.run(['watch', 'start'])
      refreshAll()
    }),

    cmd('babelgit.watchStop', async () => {
      await runner.run(['watch', 'stop'])
      refreshAll()
    }),
  )
}

export function deactivate(): void {
  // nothing — disposables handle cleanup
}
