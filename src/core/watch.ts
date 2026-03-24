/**
 * babel watch — persistent background daemon
 *
 * Watches the repo for:
 *   1. File edits with no active work item → reverts them
 *   2. CI failures on the current branch (GitHub, if configured)
 *   3. External commits from other contributors
 *
 * IPC via .babel/ files (extension and CLI both read these):
 *   .babel/watch.pid         — presence means daemon is running
 *   .babel/watch-status.json — current status snapshot
 *   .babel/watch-events.json — append-only event log (capped at 200)
 */

import * as fs from 'fs'
import * as path from 'path'
import { execSync, spawnSync } from 'child_process'

export type WatchEventType =
  | 'revert'
  | 'ci_failure'
  | 'external_commit'
  | 'started'
  | 'stopped'
  | 'error'

export interface WatchEvent {
  type: WatchEventType
  message: string
  file?: string
  timestamp: string
}

export interface WatchStatus {
  running: boolean
  pid: number
  started_at: string
  last_check: string
  alerts: WatchEvent[]
}

const MAX_EVENTS = 200
const CI_POLL_INTERVAL_MS = 60_000
const EXTERNAL_COMMIT_POLL_INTERVAL_MS = 30_000

// ─── Daemon entry point ───────────────────────────────────────────────────────

export async function runDaemon(repoPath: string): Promise<void> {
  const babelDir = path.join(repoPath, '.babel')
  const pidFile = path.join(babelDir, 'watch.pid')
  const statusFile = path.join(babelDir, 'watch-status.json')

  // Write PID so CLI can find and kill us
  fs.mkdirSync(babelDir, { recursive: true })
  fs.writeFileSync(pidFile, String(process.pid))

  const startedAt = new Date().toISOString()
  appendEvent(repoPath, { type: 'started', message: 'Watch daemon started', timestamp: startedAt })
  writeStatus(repoPath, { running: true, pid: process.pid, started_at: startedAt, last_check: startedAt, alerts: [] })

  // Cleanup on exit
  const cleanup = () => {
    try { fs.unlinkSync(pidFile) } catch { /* already gone */ }
    appendEvent(repoPath, { type: 'stopped', message: 'Watch daemon stopped', timestamp: new Date().toISOString() })
    writeStatus(repoPath, {
      running: false,
      pid: 0,
      started_at: startedAt,
      last_check: new Date().toISOString(),
      alerts: [],
    })
  }
  process.on('SIGTERM', () => { cleanup(); process.exit(0) })
  process.on('SIGINT', () => { cleanup(); process.exit(0) })
  process.on('exit', cleanup)

  // Track last known HEAD for external commit detection
  let lastKnownHead = getHead(repoPath)

  // ── File watcher ──
  let watcherReady = false
  try {
    // Brief startup delay so initial file events don't trigger false positives
    await sleep(500)
    watcherReady = true

    // Debounce map for spec sync — avoid hammering git on rapid writes
    const specSyncTimers = new Map<string, ReturnType<typeof setTimeout>>()

    const watcher = fs.watch(repoPath, { recursive: true }, (_event, filename) => {
      if (!watcherReady || !filename) return

      // Special case: .babel/notes/WI-XXX.md — sync spec to GitHub branch
      const notesMatch = filename.match(/^\.babel[/\\]notes[/\\]([A-Z]+-\d+)\.md$/)
      if (notesMatch) {
        const wiId = notesMatch[1]
        // Debounce: wait 3s after last write before syncing
        const existing = specSyncTimers.get(wiId)
        if (existing) clearTimeout(existing)
        specSyncTimers.set(wiId, setTimeout(() => {
          specSyncTimers.delete(wiId)
          syncSpecToGithub(repoPath, wiId)
        }, 3000))
        return
      }

      // Ignore .git/, other .babel/, node_modules/
      if (
        filename.startsWith('.git/') ||
        filename.startsWith('.babel/') ||
        filename.startsWith('node_modules/')
      ) return

      // Only care about tracked files
      if (!isTrackedFile(repoPath, filename)) return

      // If no active work item, revert
      const currentId = getCurrentWorkItemId(repoPath)
      if (!currentId) {
        const filePath = path.join(repoPath, filename)
        if (!fs.existsSync(filePath)) return // deletion — don't revert

        try {
          spawnSync('git', ['checkout', '--', filename], { cwd: repoPath })
          const event: WatchEvent = {
            type: 'revert',
            message: `Reverted ${filename} — no active work item`,
            file: filename,
            timestamp: new Date().toISOString(),
          }
          appendEvent(repoPath, event)
          updateStatusLastCheck(repoPath, event)
        } catch {
          appendEvent(repoPath, {
            type: 'error',
            message: `Could not revert ${filename}`,
            file: filename,
            timestamp: new Date().toISOString(),
          })
        }
      }
    })

    watcher.on('error', (err) => {
      appendEvent(repoPath, { type: 'error', message: `Watcher error: ${err.message}`, timestamp: new Date().toISOString() })
    })
  } catch (err) {
    appendEvent(repoPath, { type: 'error', message: `Could not start file watcher: ${(err as Error).message}`, timestamp: new Date().toISOString() })
  }

  // ── Polling loops ──
  setInterval(() => {
    try { pollExternalCommits(repoPath, lastKnownHead, (newHead) => { lastKnownHead = newHead }) } catch { /* ignore */ }
    updateStatusLastCheck(repoPath)
  }, EXTERNAL_COMMIT_POLL_INTERVAL_MS)

  setInterval(() => {
    try { pollCiStatus(repoPath) } catch { /* ignore */ }
  }, CI_POLL_INTERVAL_MS)

  // Keep alive
  await new Promise<void>(() => { /* run forever until signal */ })
}

// ─── Polling helpers ──────────────────────────────────────────────────────────

function pollExternalCommits(repoPath: string, lastHead: string, setHead: (h: string) => void): void {
  try {
    spawnSync('git', ['fetch', '--quiet'], { cwd: repoPath })
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoPath, encoding: 'utf8' }).trim()
    const remoteHead = execSync(`git rev-parse --verify origin/${currentBranch} 2>/dev/null || echo ""`, {
      cwd: repoPath, encoding: 'utf8', shell: '/bin/sh',
    }).trim()

    if (remoteHead && remoteHead !== lastHead) {
      const newCommits = execSync(
        `git log ${lastHead}..${remoteHead} --oneline 2>/dev/null || echo ""`,
        { cwd: repoPath, encoding: 'utf8', shell: '/bin/sh' }
      ).trim()

      if (newCommits) {
        const count = newCommits.split('\n').length
        const event: WatchEvent = {
          type: 'external_commit',
          message: `${count} new commit${count !== 1 ? 's' : ''} on ${currentBranch} from remote`,
          timestamp: new Date().toISOString(),
        }
        appendEvent(repoPath, event)
        updateStatusLastCheck(repoPath, event)
      }
      setHead(remoteHead)
    }
  } catch { /* network or git not available */ }
}

function pollCiStatus(repoPath: string): void {
  // Only run if GITHUB_TOKEN is set — avoids noise in non-GitHub repos
  const token = process.env.GITHUB_TOKEN
  if (!token) return

  try {
    const remoteUrl = execSync('git remote get-url origin 2>/dev/null || echo ""', {
      cwd: repoPath, encoding: 'utf8', shell: '/bin/sh',
    }).trim()

    const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/)
    if (!match) return

    const [, owner, repo] = match
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoPath, encoding: 'utf8' }).trim()

    const result = spawnSync('curl', [
      '-s', '-H', `Authorization: token ${token}`,
      '-H', 'Accept: application/vnd.github.v3+json',
      `https://api.github.com/repos/${owner}/${repo}/actions/runs?branch=${branch}&per_page=1`,
    ], { encoding: 'utf8' })

    if (result.status !== 0) return

    const data = JSON.parse(result.stdout)
    const run = data.workflow_runs?.[0]
    if (run?.conclusion === 'failure') {
      const event: WatchEvent = {
        type: 'ci_failure',
        message: `CI failed: ${run.name} on ${branch}`,
        timestamp: new Date().toISOString(),
      }
      appendEvent(repoPath, event)
      updateStatusLastCheck(repoPath, event)
    }
  } catch { /* ignore */ }
}

// ─── File I/O helpers ─────────────────────────────────────────────────────────

function getCurrentWorkItemId(repoPath: string): string | null {
  try {
    const statePath = path.join(repoPath, '.babel', 'state.json')
    if (!fs.existsSync(statePath)) return null
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    return state.current_work_item_id || null
  } catch {
    return null
  }
}

function isTrackedFile(repoPath: string, filename: string): boolean {
  try {
    const result = spawnSync('git', ['ls-files', '--error-unmatch', filename], {
      cwd: repoPath, encoding: 'utf8',
    })
    return result.status === 0
  } catch {
    return false
  }
}

function getHead(repoPath: string): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: repoPath, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

export function appendEvent(repoPath: string, event: WatchEvent): void {
  const eventsFile = path.join(repoPath, '.babel', 'watch-events.json')
  let events: WatchEvent[] = []
  try {
    if (fs.existsSync(eventsFile)) {
      events = JSON.parse(fs.readFileSync(eventsFile, 'utf8'))
    }
  } catch { /* start fresh */ }

  events.push(event)
  if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS)

  fs.writeFileSync(eventsFile, JSON.stringify(events, null, 2))
}

export function writeStatus(repoPath: string, status: WatchStatus): void {
  const statusFile = path.join(repoPath, '.babel', 'watch-status.json')
  fs.writeFileSync(statusFile, JSON.stringify(status, null, 2))
}

function updateStatusLastCheck(repoPath: string, alertEvent?: WatchEvent): void {
  const statusFile = path.join(repoPath, '.babel', 'watch-status.json')
  try {
    const status: WatchStatus = fs.existsSync(statusFile)
      ? JSON.parse(fs.readFileSync(statusFile, 'utf8'))
      : { running: true, pid: process.pid, started_at: new Date().toISOString(), last_check: '', alerts: [] }

    status.last_check = new Date().toISOString()
    if (alertEvent) {
      status.alerts = [...(status.alerts ?? []), alertEvent].slice(-10)
    }
    fs.writeFileSync(statusFile, JSON.stringify(status, null, 2))
  } catch { /* ignore */ }
}

export function getWatchStatus(repoPath: string): { running: boolean; pid?: number; status?: WatchStatus } {
  const pidFile = path.join(repoPath, '.babel', 'watch.pid')
  const statusFile = path.join(repoPath, '.babel', 'watch-status.json')

  if (!fs.existsSync(pidFile)) return { running: false }

  const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim())
  // Check if process is actually alive
  try {
    process.kill(pid, 0) // signal 0 = check existence only
  } catch {
    // Process is gone — clean up stale PID file
    try { fs.unlinkSync(pidFile) } catch { /* ignore */ }
    return { running: false }
  }

  let status: WatchStatus | undefined
  try {
    if (fs.existsSync(statusFile)) {
      status = JSON.parse(fs.readFileSync(statusFile, 'utf8'))
    }
  } catch { /* ignore */ }

  return { running: true, pid, status }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─── Spec sync ────────────────────────────────────────────────────────────────

function syncSpecToGithub(repoPath: string, wiId: string): void {
  try {
    const state = JSON.parse(fs.readFileSync(path.join(repoPath, '.babel', 'state.json'), 'utf8'))
    const wi = state.work_items?.[wiId]
    if (!wi || wi.stage !== 'todo' || !wi.branch) return

    const notesPath = path.join(repoPath, '.babel', 'notes', `${wiId}.md`)
    if (!fs.existsSync(notesPath)) return

    // Verify branch exists on remote
    const remoteCheck = spawnSync('git', ['ls-remote', '--exit-code', '--heads', 'origin', wi.branch], {
      cwd: repoPath, encoding: 'utf8',
    })
    if (remoteCheck.status !== 0) return // not pushed yet — skip silently

    // Use a temporary worktree to update the spec without touching current branch
    const worktreePath = path.join(repoPath, '.babel', `spec-sync-${wiId}`)
    try {
      // Remove stale worktree if it exists
      spawnSync('git', ['worktree', 'remove', '--force', worktreePath], { cwd: repoPath })

      const addResult = spawnSync('git', ['worktree', 'add', '--force', worktreePath, wi.branch], {
        cwd: repoPath, encoding: 'utf8',
      })
      if (addResult.status !== 0) return

      const specsDir = path.join(worktreePath, 'docs', 'specs')
      fs.mkdirSync(specsDir, { recursive: true })
      const specDest = path.join(specsDir, `${wiId}.md`)
      fs.copyFileSync(notesPath, specDest)

      spawnSync('git', ['add', specDest], { cwd: worktreePath })

      // Only commit if there are staged changes
      const diff = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: worktreePath })
      if (diff.status === 0) return // no changes

      spawnSync('git', ['commit', '-m', `spec(${wiId}): sync`], { cwd: worktreePath, encoding: 'utf8' })
      spawnSync('git', ['push', 'origin', wi.branch], { cwd: worktreePath, encoding: 'utf8' })

      appendEvent(repoPath, {
        type: 'started', // reuse 'started' type — no dedicated 'spec_sync' type
        message: `Synced spec for ${wiId} to GitHub`,
        file: `docs/specs/${wiId}.md`,
        timestamp: new Date().toISOString(),
      })
    } finally {
      spawnSync('git', ['worktree', 'remove', '--force', worktreePath], { cwd: repoPath })
    }
  } catch {
    // Non-fatal — spec sync is best-effort
  }
}
