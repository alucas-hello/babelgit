import { loadConfig } from '../../core/config.js'
import { getCurrentWorkItem, loadState, getWorkItem } from '../../core/state.js'
import {
  getUncommittedFileCount,
  getCommitsAheadOfBase,
  hasConflicts,
  getCurrentBranch,
} from '../../core/git.js'
import { loadCheckpoints, loadRunSession } from '../../core/checkpoint.js'
import { minutesAgo } from '../../core/workitem.js'
import { showState, showNoWorkItem, error } from '../display.js'
import type { StateResponse } from '../../types.js'

export async function runState(
  workItemId?: string,
  opts: { json?: boolean } = {},
  repoPath: string = process.cwd()
): Promise<void> {
  const config = await loadConfig(repoPath).catch(err => {
    if (err.message === 'NO_CONFIG') {
      error('No babel.config.yml found.', undefined, "Run 'babel init' to set up babelgit.")
      process.exit(1)
    }
    throw err
  })

  let workItem
  if (workItemId) {
    workItem = await getWorkItem(workItemId, repoPath)
    if (!workItem) {
      error(`No work item found: ${workItemId}`)
      process.exit(1)
    }
  } else {
    workItem = await getCurrentWorkItem(repoPath)
  }

  if (!workItem) {
    if (opts.json) {
      console.log(JSON.stringify({ work_item: null, suggested_next: 'babel start' }, null, 2))
    } else {
      showNoWorkItem()
    }
    return
  }

  const currentBranch = await getCurrentBranch(repoPath).catch(() => workItem!.branch)
  const uncommittedFiles = await getUncommittedFileCount(repoPath).catch(() => 0)
  const commitsAhead = await getCommitsAheadOfBase(config.base_branch, repoPath).catch(() => 0)
  const conflicts = await hasConflicts(repoPath).catch(() => false)
  const checkpoints = await loadCheckpoints(workItem.id, repoPath)
  const runSession = await loadRunSession(repoPath)

  const lastAnchor = checkpoints.filter(c => c.is_recovery_anchor).pop()
  const lastCheckpointDisplay = lastAnchor
    ? {
        verdict: lastAnchor.verdict,
        sequence: checkpoints.filter(c => c.verdict === lastAnchor.verdict && c.is_recovery_anchor).length,
        notes: lastAnchor.notes,
        minutesAgo: minutesAgo(lastAnchor.called_at),
      }
    : null

  // Determine permitted/blocked operations
  const permitted: string[] = []
  const blocked: Record<string, string> = {}

  if (workItem.stage === 'in_progress') {
    permitted.push('save', 'sync', 'run', 'pause', 'stop')
    if (config.require_checkpoint_for.ship && !lastAnchor) {
      blocked['ship'] = 'no verified checkpoint exists — call babel run then babel keep or babel ship verdict'
    } else {
      permitted.push('ship')
    }
  } else if (workItem.stage === 'run_session_open') {
    permitted.push('keep', 'refine', 'reject', 'ship')
    blocked['save'] = 'run session is open — call a verdict first'
    blocked['run'] = 'run session already open — call a verdict first'
  } else if (workItem.stage === 'paused') {
    permitted.push('continue')
  }

  let suggestedNext = 'babel run'
  if (workItem.stage === 'in_progress') {
    if (uncommittedFiles > 0) suggestedNext = 'babel save "notes"'
    else if (commitsAhead > 0) suggestedNext = 'babel run'
    else suggestedNext = 'babel save "notes"'
  } else if (workItem.stage === 'run_session_open') {
    suggestedNext = 'babel keep "notes"'
  } else if (workItem.stage === 'paused') {
    suggestedNext = `babel continue ${workItem.id}`
  }

  if (opts.json) {
    const response: StateResponse = {
      work_item: workItem,
      git: {
        uncommitted_files: uncommittedFiles,
        commits_ahead_of_base: commitsAhead,
        last_synced_minutes_ago: null,
        has_conflicts: conflicts,
        current_branch: currentBranch,
      },
      last_checkpoint: lastAnchor
        ? {
            verdict: lastAnchor.verdict,
            sequence: checkpoints.filter(c => c.verdict === lastAnchor.verdict && c.is_recovery_anchor).length,
            notes: lastAnchor.notes,
            minutes_ago: minutesAgo(lastAnchor.called_at),
            commit: lastAnchor.git_commit.slice(0, 7),
          }
        : null,
      run_session: runSession,
      permitted_operations: permitted,
      blocked_operations: blocked,
      suggested_next: suggestedNext,
    }
    console.log(JSON.stringify(response, null, 2))
    return
  }

  showState({
    workItemId: workItem.id,
    description: workItem.description,
    stage: workItem.stage,
    branch: workItem.branch,
    uncommittedFiles,
    commitsAhead,
    lastSyncedMinutesAgo: null,
    lastCheckpoint: lastCheckpointDisplay,
    suggestedNext,
  })
}
