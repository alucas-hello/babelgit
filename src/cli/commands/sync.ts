import { loadConfig } from '../../core/config.js'
import { getCurrentWorkItem } from '../../core/state.js'
import {
  fetchOrigin,
  rebase,
  merge,
  hasConflicts,
  getConflictingFiles,
  addAll,
  commit,
  hasUncommittedChanges,
} from '../../core/git.js'
import { error, success, info } from '../display.js'

export async function runSync(
  opts: { continue?: boolean } = {},
  repoPath: string = process.cwd()
): Promise<void> {
  const config = await loadConfig(repoPath).catch(err => {
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
      'Cannot sync during an open run session.',
      'Your snapshot is locked. Syncing would change the code state after locking.',
      'Call a verdict first (babel keep / refine / reject / ship), then sync.'
    )
    process.exit(1)
  }

  if (opts.continue) {
    // User resolved conflicts — continue rebase/merge
    if (config.sync_strategy === 'rebase') {
      const { rebaseContinue } = await import('../../core/git.js')
      await rebaseContinue(repoPath)
    }
    success('Sync resumed.')
    return
  }

  // Stash uncommitted changes if needed
  let stashed = false
  if (await hasUncommittedChanges(repoPath)) {
    // Auto-save before sync
    await addAll(repoPath)
    await commit(`save(${workItem.id}): pre-sync snapshot`, repoPath)
  }

  try {
    await fetchOrigin(repoPath)

    const onto = `origin/${config.base_branch}`

    if (config.sync_strategy === 'rebase') {
      await rebase(onto, repoPath)
    } else {
      await merge(onto, repoPath)
    }

    if (await hasConflicts(repoPath)) {
      const files = await getConflictingFiles(repoPath)
      console.log()
      error('Sync paused — conflicts found')
      console.log()
      console.log('  Conflicting files:')
      for (const f of files) console.log(`    ${f}`)
      console.log()
      console.log('  Resolve the conflicts, then run: babel sync --continue')
      console.log()
      process.exit(1)
    }

    console.log()
    success(`Synced with origin/${config.base_branch}`)
    console.log()
  } catch (err) {
    const msg = (err as Error).message || ''
    if (msg.includes('conflict') || msg.includes('CONFLICT')) {
      const files = await getConflictingFiles(repoPath)
      console.log()
      error('Sync paused — conflicts found')
      console.log()
      if (files.length > 0) {
        console.log('  Conflicting files:')
        for (const f of files) console.log(`    ${f}`)
      }
      console.log()
      console.log('  Resolve the conflicts, then run: babel sync --continue')
      console.log()
      process.exit(1)
    }
    error('Sync failed.', msg, 'Check your network connection and try again.')
    process.exit(1)
  }
}
