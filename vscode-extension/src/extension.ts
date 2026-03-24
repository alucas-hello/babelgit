import * as vscode from 'vscode'
import { StateWatcher } from './stateWatcher'
import { BabelRunner } from './babelRunner'
import { StatusBarManager } from './statusBar'
import { ActiveWorkProvider, HistoryProvider, ActionsProvider, WatcherProvider } from './sidebarProvider'
import { HistoryPanel } from './historyPanel'
import { RunPanel } from './runPanel'

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
