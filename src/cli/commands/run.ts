import { loadConfig } from '../../core/config.js'
import { getCurrentWorkItem, saveWorkItem } from '../../core/state.js'
import { addAll, commit, getCurrentCommitSha, getShortSha, getStatusPorcelain, hasUncommittedChanges } from '../../core/git.js'
import { computeFilesystemHash, writeRunSession, loadRunSession, loadCheckpoints } from '../../core/checkpoint.js'
import { timeAgoLabel } from '../../core/workitem.js'
import { error, showRunSession } from '../display.js'

export async function runRun(repoPath: string = process.cwd()): Promise<void> {
  await loadConfig(repoPath).catch(err => {
    if (err.message === 'NO_CONFIG') {
      error('No babel.config.yml found.', undefined, "Run 'babel init' to set up babelgit.")
      process.exit(1)
    }
    throw err
  })

  const workItem = await getCurrentWorkItem(repoPath)
  if (!workItem) {
    error('No active work item.', undefined, "Run 'babel start' to begin a work item.")
    process.exit(1)
  }

  if (workItem.stage === 'run_session_open') {
    error(
      'A run session is already open.',
      undefined,
      "Call a verdict first: babel keep/refine/reject/ship"
    )
    process.exit(1)
  }

  if (workItem.stage !== 'in_progress') {
    error(`Cannot open a run session — work item is ${workItem.stage}.`)
    process.exit(1)
  }

  // Lock the snapshot: commit any uncommitted changes
  if (await hasUncommittedChanges(repoPath)) {
    await addAll(repoPath)
    await commit(`run-snapshot(${workItem.id}): pre-run state`, repoPath)
  }

  const lockedCommit = await getCurrentCommitSha(repoPath)
  const shortSha = await getShortSha(lockedCommit, repoPath)
  const statusOutput = await getStatusPorcelain(repoPath)
  const filesystemHash = computeFilesystemHash(statusOutput)

  const now = new Date().toISOString()
  await writeRunSession(
    {
      work_item_id: workItem.id,
      started_at: now,
      locked_commit: lockedCommit,
      locked_filesystem_hash: filesystemHash,
      status: 'open',
    },
    repoPath
  )

  // Update work item stage
  workItem.stage = 'run_session_open'
  await saveWorkItem(workItem, repoPath)

  // Find last checkpoint for display
  const checkpoints = await loadCheckpoints(workItem.id, repoPath)
  const lastAnchor = checkpoints.filter(c => c.is_recovery_anchor).pop()
  const verdictSeq = lastAnchor
    ? checkpoints.filter(c => c.verdict === lastAnchor.verdict && c.is_recovery_anchor).length
    : 0

  const lastCpDisplay = lastAnchor
    ? {
        verdict: lastAnchor.verdict,
        sequence: verdictSeq,
        notes: lastAnchor.notes,
        time: timeAgoLabel(lastAnchor.called_at),
      }
    : null

  showRunSession(workItem.id, workItem.description, shortSha, lastCpDisplay)
}
