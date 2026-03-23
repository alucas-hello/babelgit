import * as fs from 'fs'
import * as path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import chalk from 'chalk'
import { getWatchStatus } from '../../core/watch.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export async function runWatch(action: string = 'status', repoPath: string = process.cwd()): Promise<void> {
  switch (action) {
    case 'start': return startWatcher(repoPath)
    case 'stop':  return stopWatcher(repoPath)
    case 'status': return showStatus(repoPath)
    default:
      console.error(chalk.red(`Unknown action: ${action}`))
      console.log(`  Usage: babel watch [start|stop|status]`)
      process.exit(1)
  }
}

async function startWatcher(repoPath: string): Promise<void> {
  const { running } = getWatchStatus(repoPath)
  if (running) {
    console.log(`  ${chalk.yellow('Watcher is already running.')} Use 'babel watch status' to check it.`)
    return
  }

  // Find the daemon entry point — dist/core/watch-daemon.js (compiled)
  // We resolve relative to this file's location
  const daemonPath = path.resolve(__dirname, '../../core/watch-daemon.js')

  const child = spawn(process.execPath, [daemonPath, repoPath], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, BABEL_ACTIVE: '1' },
  })
  child.unref()

  // Brief wait for PID file to appear
  await waitForPidFile(repoPath, 2000)

  const { running: now, pid } = getWatchStatus(repoPath)
  if (now) {
    console.log(`\n  ${chalk.green('✓ Watch daemon started')} (pid ${pid})`)
    console.log(chalk.dim(`\n  Watching for:`))
    console.log(chalk.dim(`    → file edits without an active work item (reverts automatically)`))
    console.log(chalk.dim(`    → external commits on your branch`))
    console.log(chalk.dim(`    → CI failures (requires GITHUB_TOKEN)\n`))
  } else {
    console.error(chalk.red('  Failed to start watcher. Check that babel is built (npm run build).'))
    process.exit(1)
  }
}

async function stopWatcher(repoPath: string): Promise<void> {
  const { running, pid } = getWatchStatus(repoPath)
  if (!running || !pid) {
    console.log(`  ${chalk.dim('Watcher is not running.')}`)
    return
  }

  try {
    process.kill(pid, 'SIGTERM')
    console.log(`  ${chalk.green('✓ Watch daemon stopped')} (was pid ${pid})`)
  } catch (err) {
    console.error(chalk.red(`  Could not stop watcher: ${(err as Error).message}`))
    process.exit(1)
  }
}

async function showStatus(repoPath: string): Promise<void> {
  const { running, pid, status } = getWatchStatus(repoPath)

  console.log(`\n  ${chalk.bold('babel watch')} — daemon status\n`)

  if (!running) {
    console.log(`  ${chalk.dim('○')} Not running`)
    console.log(chalk.dim(`\n  Start with: babel watch start\n`))
    return
  }

  console.log(`  ${chalk.green('●')} Running (pid ${pid})`)
  if (status?.started_at) {
    const mins = Math.round((Date.now() - new Date(status.started_at).getTime()) / 60000)
    console.log(`  Started: ${chalk.dim(mins < 60 ? `${mins}m ago` : `${Math.floor(mins/60)}h ${mins%60}m ago`)}`)
  }
  if (status?.last_check) {
    const secs = Math.round((Date.now() - new Date(status.last_check).getTime()) / 1000)
    console.log(`  Last check: ${chalk.dim(`${secs}s ago`)}`)
  }

  // Recent alerts
  const eventsFile = path.join(repoPath, '.babel', 'watch-events.json')
  if (fs.existsSync(eventsFile)) {
    try {
      const events = JSON.parse(fs.readFileSync(eventsFile, 'utf8'))
      const recent = events.filter((e: { type: string }) => ['revert', 'ci_failure', 'external_commit', 'error'].includes(e.type)).slice(-5)
      if (recent.length > 0) {
        console.log(`\n  Recent events:`)
        for (const ev of recent.reverse()) {
          const icon = ev.type === 'revert' ? chalk.red('⚠') : ev.type === 'ci_failure' ? chalk.red('✗') : chalk.yellow('↓')
          const age = Math.round((Date.now() - new Date(ev.timestamp).getTime()) / 60000)
          console.log(`    ${icon} ${ev.message} ${chalk.dim(`${age}m ago`)}`)
        }
      }
    } catch { /* ignore */ }
  }

  console.log()
}

async function waitForPidFile(repoPath: string, timeoutMs: number): Promise<void> {
  const pidFile = path.join(repoPath, '.babel', 'watch.pid')
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(pidFile)) return
    await new Promise(r => setTimeout(r, 100))
  }
}
