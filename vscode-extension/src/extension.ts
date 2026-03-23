import * as vscode from 'vscode'
import { StateWatcher } from './stateWatcher'
import { BabelRunner } from './babelRunner'
import { StatusBarManager } from './statusBar'
import { SidebarProvider } from './sidebarProvider'
import { HistoryPanel } from './historyPanel'

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('babelgit')
  const watcher = new StateWatcher()
  const runner = new BabelRunner(outputChannel)
  const statusBar = new StatusBarManager(watcher)
  const sidebar = new SidebarProvider(watcher)

  vscode.window.createTreeView('babelgitWorkItem', {
    treeDataProvider: sidebar,
    showCollapseAll: true,
  })

  const cmd = (id: string, fn: () => Promise<void>) =>
    vscode.commands.registerCommand(id, async () => {
      try {
        await fn()
      } catch (err) {
        // Error already shown in output channel
      }
    })

  context.subscriptions.push(
    outputChannel,
    watcher,
    statusBar,

    cmd('babelgit.start', async () => {
      const desc = await vscode.window.showInputBox({
        prompt: 'What are you working on?',
        placeHolder: 'fix login timeout on mobile',
      })
      if (!desc) return
      await runner.run(['start', desc])
      watcher.refresh()
      sidebar.refresh()
    }),

    cmd('babelgit.save', async () => {
      const notes = await vscode.window.showInputBox({
        prompt: 'Notes for this save',
        placeHolder: 'auth flow working',
      })
      if (notes === undefined) return
      const args = notes ? ['save', notes] : ['save']
      await runner.run(args)
      watcher.refresh()
      sidebar.refresh()
    }),

    cmd('babelgit.run', async () => {
      await runner.run(['run'])
      watcher.refresh()
      sidebar.refresh()
    }),

    cmd('babelgit.keep', async () => {
      const notes = await vscode.window.showInputBox({
        prompt: 'Keep — what did you verify?',
        placeHolder: 'tested on mobile, looks good',
      })
      if (notes === undefined) return
      const args = notes ? ['keep', notes] : ['keep']
      await runner.run(args)
      watcher.refresh()
      sidebar.refresh()
    }),

    cmd('babelgit.refine', async () => {
      const notes = await vscode.window.showInputBox({
        prompt: 'Refine — what needs to change?',
        placeHolder: 'button alignment off on small screens',
      })
      if (notes === undefined) return
      const args = notes ? ['refine', notes] : ['refine']
      await runner.run(args)
      watcher.refresh()
      sidebar.refresh()
    }),

    cmd('babelgit.reject', async () => {
      const reason = await vscode.window.showInputBox({
        prompt: 'Reject — why is this the wrong direction?',
        placeHolder: 'wrong approach entirely',
      })
      if (reason === undefined) return
      const args = reason ? ['reject', reason] : ['reject']
      await runner.run(args)
      watcher.refresh()
      sidebar.refresh()
    }),

    cmd('babelgit.ship', async () => {
      const wi = watcher.currentWorkItem
      if (wi?.ship_ready) {
        // Delivery — no notes needed
        await runner.run(['ship'])
      } else {
        // Verdict — notes optional
        const notes = await vscode.window.showInputBox({
          prompt: 'Ship — what makes this production-ready?',
          placeHolder: 'all tests pass, reviewed',
        })
        if (notes === undefined) return
        const args = notes ? ['ship', notes] : ['ship']
        await runner.run(args)
      }
      watcher.refresh()
      sidebar.refresh()
    }),

    cmd('babelgit.sync', async () => {
      await runner.run(['sync'])
      watcher.refresh()
      sidebar.refresh()
    }),

    cmd('babelgit.pause', async () => {
      const notes = await vscode.window.showInputBox({
        prompt: 'Pause — notes for the next person',
        placeHolder: 'left off on the auth middleware',
      })
      if (notes === undefined) return
      const args = notes ? ['pause', notes] : ['pause']
      await runner.run(args)
      watcher.refresh()
      sidebar.refresh()
    }),

    cmd('babelgit.state', () => {
      watcher.refresh()
      sidebar.refresh()
      return Promise.resolve()
    }),

    cmd('babelgit.history', async () => {
      HistoryPanel.show(watcher)
    })
  )
}

export function deactivate(): void {
  // nothing — disposables handle cleanup
}
