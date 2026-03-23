#!/usr/bin/env node
import { Command } from 'commander'
import { runInit } from './commands/init.js'
import { runStart } from './commands/start.js'
import { runSave } from './commands/save.js'
import { runSync } from './commands/sync.js'
import { runPause } from './commands/pause.js'
import { runContinue } from './commands/continue.js'
import { runStop } from './commands/stop.js'
import { runRun } from './commands/run.js'
import { runVerdict } from './commands/verdict.js'
import { runState } from './commands/state.js'
import { runHistory } from './commands/history.js'
import { runShip } from './commands/ship.js'

const program = new Command()

program
  .name('babel')
  .description('A shared vocabulary for the lifecycle of code contributions')
  .version('0.1.0')

program
  .command('init')
  .description('Set up babelgit in a repository')
  .action(async () => {
    await runInit()
  })

program
  .command('start [id-or-description]')
  .description('Begin a new work item')
  .action(async (idOrDescription?: string) => {
    await runStart(idOrDescription)
  })

program
  .command('save [notes]')
  .description('Checkpoint progress locally')
  .action(async (notes?: string) => {
    await runSave(notes)
  })

program
  .command('sync')
  .description('Get current with the team')
  .option('--continue', 'Continue after resolving conflicts')
  .action(async (opts: { continue?: boolean }) => {
    await runSync(opts)
  })

program
  .command('pause [notes]')
  .description('Leave work in handoff-ready state')
  .action(async (notes?: string) => {
    await runPause(notes)
  })

program
  .command('continue [work-item-id]')
  .description('Resume paused work')
  .action(async (workItemId?: string) => {
    await runContinue(workItemId)
  })

program
  .command('stop [reason]')
  .description('Abandon work entirely')
  .action(async (reason?: string) => {
    await runStop(reason)
  })

program
  .command('run')
  .description('Open a review session; lock the snapshot')
  .action(async () => {
    await runRun()
  })

program
  .command('keep [notes]')
  .description('This is solid — create a recovery anchor checkpoint')
  .action(async (notes?: string) => {
    await runVerdict('keep', notes)
  })

program
  .command('refine [notes]')
  .description('Close, needs specific changes — checkpoint with notes')
  .action(async (notes?: string) => {
    await runVerdict('refine', notes)
  })

program
  .command('reject [reason]')
  .description('Wrong direction — revert to last keep')
  .action(async (reason?: string) => {
    await runVerdict('reject', reason)
  })

program
  .command('ship [notes]')
  .description('Deliver work to production')
  .action(async (notes?: string) => {
    // If there's a run session open, this is the verdict "ship"
    // Otherwise it's the ship command to merge
    const { loadRunSession } = await import('../core/checkpoint.js')
    const session = await loadRunSession()
    if (session && session.status === 'open') {
      await runVerdict('ship', notes)
    } else {
      await runShip()
    }
  })

program
  .command('state [work-item-id]')
  .description('Show current situation')
  .option('--json', 'Output as JSON')
  .action(async (workItemId?: string, opts?: { json?: boolean }) => {
    await runState(workItemId, opts || {})
  })

program
  .command('history [work-item-id]')
  .description('Show work item history and checkpoints')
  .option('--json', 'Output as JSON')
  .action(async (workItemId?: string, opts?: { json?: boolean }) => {
    await runHistory(workItemId, opts || {})
  })

program
  .command('mcp')
  .description('Start the MCP server for AI agent integration')
  .action(async () => {
    const { startMcpServer } = await import('../mcp/index.js')
    await startMcpServer()
  })

// Handle unknown commands
program.on('command:*', () => {
  console.error(`\n  Unknown command: ${program.args.join(' ')}`)
  console.error(`  Run 'babel --help' for available commands.\n`)
  process.exit(1)
})

program.parse(process.argv)
