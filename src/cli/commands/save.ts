import { loadConfig } from '../../core/config.js'
import { getCurrentWorkItem, saveWorkItem } from '../../core/state.js'
import { addAll, commit, hasUncommittedChanges, getCurrentCommitSha, getShortSha } from '../../core/git.js'
import { error, success, hint } from '../display.js'

export async function runSave(notes?: string, repoPath: string = process.cwd()): Promise<void> {
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

  if (workItem.stage !== 'in_progress') {
    error(
      `Cannot save — work item is ${workItem.stage}.`,
      undefined,
      workItem.stage === 'paused'
        ? "Run 'babel continue' to resume work first."
        : workItem.stage === 'run_session_open'
          ? "A run session is open. Call a verdict first (babel keep/refine/reject/ship)."
          : undefined
    )
    process.exit(1)
  }

  if (!(await hasUncommittedChanges(repoPath))) {
    console.log()
    console.log('  Nothing to save — no changes since last save.')
    console.log()
    process.exit(0)
  }

  const message = notes
    ? `save(${workItem.id}): ${notes}`
    : `save(${workItem.id}): ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`

  await addAll(repoPath)
  const sha = await commit(message, repoPath)
  const shortSha = sha ? sha.slice(0, 7) : await getShortSha('HEAD', repoPath)

  console.log()
  success(`Saved: ${shortSha}`)
  console.log()
  console.log(`  Commit: ${shortSha}`)
  if (notes) console.log(`  Notes: ${notes}`)
  console.log()
  hint(`When ready to review: babel run`)
  console.log()
}
