import * as fs from 'fs'
import * as path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import chalk from 'chalk'
import { getWatchStatus } from '../../core/watch.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export async function runWatch(action: string = 'status', repoPath: string = process.cwd()): Promise<void> {
  switch (action) {
    case 'start':     return startWatcher(repoPath)
    case 'stop':      return stopWatcher(repoPath)
    case 'status':    return showStatus(repoPath)
    case 'install':   return installLaunchd(repoPath)
    case 'uninstall': return uninstallLaunchd(repoPath)
    default:
      console.error(chalk.red(`Unknown action: ${action}`))
      console.log(`  Usage: babel watch [start|stop|status|install|uninstall]`)
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
  if (getLaunchdPlistPath(repoPath)) {
    console.log(`  ${chalk.yellow('Watcher is managed by launchd')} — it will restart if stopped.`)
    console.log(`  To remove permanently: ${chalk.bold('babel watch uninstall')}`)
    return
  }

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
  const plistPath = getLaunchdPlistPath(repoPath)

  console.log(`\n  ${chalk.bold('babel watch')} — daemon status\n`)

  if (plistPath) {
    console.log(`  ${chalk.cyan('⚙')} launchd agent installed ${chalk.dim(`(${path.basename(plistPath, '.plist')})`)}\n`)
  }

  if (!running) {
    console.log(`  ${chalk.dim('○')} Not running`)
    if (!plistPath) {
      console.log(chalk.dim(`\n  Start with: babel watch start`))
      console.log(chalk.dim(`  Persist across reboots: babel watch install\n`))
    } else {
      console.log(chalk.dim(`\n  launchd should restart it automatically. Check logs: .babel/watch-error.log\n`))
    }
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

// ─── launchd helpers ──────────────────────────────────────────────────────────

function repoSlug(repoPath: string): string {
  // Sanitize path into a valid launchd label segment
  return repoPath.replace(/^\//, '').replace(/[^a-zA-Z0-9]/g, '-')
}

function launchdLabel(repoPath: string): string {
  return `com.babelgit.watch.${repoSlug(repoPath)}`
}

function launchdPlistDir(): string {
  return path.join(process.env.HOME ?? '/tmp', 'Library', 'LaunchAgents')
}

/** Returns the plist path if the agent is currently installed, null otherwise. */
function getLaunchdPlistPath(repoPath: string): string | null {
  const p = path.join(launchdPlistDir(), `${launchdLabel(repoPath)}.plist`)
  return fs.existsSync(p) ? p : null
}

async function installLaunchd(repoPath: string): Promise<void> {
  const label = launchdLabel(repoPath)
  const plistDir = launchdPlistDir()
  const plistPath = path.join(plistDir, `${label}.plist`)

  if (fs.existsSync(plistPath)) {
    console.log(`  ${chalk.yellow('launchd agent already installed.')}`)
    console.log(`  To reinstall: babel watch uninstall && babel watch install`)
    return
  }

  const daemonPath = path.resolve(__dirname, '../../core/watch-daemon.js')
  if (!fs.existsSync(daemonPath)) {
    console.error(chalk.red(`  Daemon not found at ${daemonPath}. Run: npm run build`))
    process.exit(1)
  }

  // Inherit PATH from current env so git, node are findable
  const envPath = process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin'

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${daemonPath}</string>
    <string>${repoPath}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>${repoPath}</string>
  <key>StandardOutPath</key>
  <string>${path.join(repoPath, '.babel', 'watch.log')}</string>
  <key>StandardErrorPath</key>
  <string>${path.join(repoPath, '.babel', 'watch-error.log')}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${envPath}</string>
    <key>HOME</key>
    <string>${process.env.HOME ?? ''}</string>
  </dict>
</dict>
</plist>`

  fs.mkdirSync(plistDir, { recursive: true })
  fs.writeFileSync(plistPath, plist)

  // Load via launchctl
  const uid = process.getuid?.() ?? 501
  const { spawnSync } = await import('child_process')
  const result = spawnSync('launchctl', ['bootstrap', `gui/${uid}`, plistPath], { encoding: 'utf8' })

  if (result.status !== 0) {
    // Fallback to legacy load
    const fallback = spawnSync('launchctl', ['load', plistPath], { encoding: 'utf8' })
    if (fallback.status !== 0) {
      console.error(chalk.red(`  Failed to load agent: ${fallback.stderr || result.stderr}`))
      console.log(chalk.dim(`  Plist written to ${plistPath} — load manually with:`))
      console.log(chalk.dim(`  launchctl load ${plistPath}`))
      process.exit(1)
    }
  }

  // Wait for daemon to start
  await waitForPidFile(repoPath, 3000)
  const { running, pid } = getWatchStatus(repoPath)

  if (running) {
    console.log(`\n  ${chalk.green('✓ Watch daemon installed and running')} (pid ${pid})`)
  } else {
    console.log(`\n  ${chalk.green('✓ launchd agent installed')} — daemon starting…`)
  }
  console.log(chalk.dim(`  Label: ${label}`))
  console.log(chalk.dim(`  Auto-starts on login, restarts if it crashes.`))
  console.log(chalk.dim(`  Remove with: babel watch uninstall\n`))
}

async function uninstallLaunchd(repoPath: string): Promise<void> {
  const label = launchdLabel(repoPath)
  const plistPath = path.join(launchdPlistDir(), `${label}.plist`)

  if (!fs.existsSync(plistPath)) {
    console.log(`  ${chalk.dim('No launchd agent installed for this repo.')}`)
    return
  }

  const uid = process.getuid?.() ?? 501
  const { spawnSync } = await import('child_process')

  // Stop and unload
  spawnSync('launchctl', ['bootout', `gui/${uid}`, plistPath], { encoding: 'utf8' })
  // Fallback for older macOS
  spawnSync('launchctl', ['unload', plistPath], { encoding: 'utf8' })

  fs.unlinkSync(plistPath)

  console.log(`\n  ${chalk.green('✓ launchd agent removed')}`)
  console.log(chalk.dim(`  Watcher will no longer start automatically.`))
  console.log(chalk.dim(`  Run manually with: babel watch start\n`))
}

async function waitForPidFile(repoPath: string, timeoutMs: number): Promise<void> {
  const pidFile = path.join(repoPath, '.babel', 'watch.pid')
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(pidFile)) return
    await new Promise(r => setTimeout(r, 100))
  }
}
