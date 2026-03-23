import { loadConfig } from '../../core/config.js'
import { getCurrentWorkItem, saveWorkItem, setCurrentWorkItem } from '../../core/state.js'
import { addAll, commit, push, hasUncommittedChanges, getUserEmail } from '../../core/git.js'
import { detectCallerType, checkPauseRequirement } from '../../core/governance.js'
import { error, success, hint } from '../display.js'

export async function runPause(notes?: string, repoPath: string = process.cwd()): Promise<void> {
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

  if (workItem.stage !== 'in_progress') {
    error(`Cannot pause — work item is ${workItem.stage}.`)
    process.exit(1)
  }

  const caller = detectCallerType()

  // Governance check
  const govCheck = await checkPauseRequirement(workItem, config, caller, repoPath)
  if (!govCheck.permitted) {
    error('Operation blocked: pause', govCheck.reason, govCheck.suggestion)
    process.exit(1)
  }

  const userEmail = await getUserEmail(repoPath)

  // Commit any unsaved changes
  if (await hasUncommittedChanges(repoPath)) {
    await addAll(repoPath)
    await commit(
      `pause(${workItem.id}): ${notes || 'paused'}`,
      repoPath
    )
  }

  // Push to remote
  try {
    await push(workItem.branch, repoPath)
  } catch {
    // No remote — that's OK for local repos
  }

  // Update state
  const now = new Date().toISOString()
  workItem.stage = 'paused'
  workItem.paused_by = userEmail
  workItem.paused_at = now
  workItem.paused_notes = notes

  await saveWorkItem(workItem, repoPath)
  await setCurrentWorkItem(undefined, repoPath)

  // Integration callbacks (non-fatal)
  try {
    const { IntegrationManager } = await import('../../integrations/index.js')
    const mgr = new IntegrationManager(config, repoPath)
    await mgr.onPause(workItem, notes)
  } catch {
    // Non-fatal
  }

  console.log()
  success(`Work paused: ${workItem.id}`)
  console.log()
  console.log(`  "${workItem.description}"`)
  console.log(`  Branch pushed to origin/${workItem.branch}`)
  console.log()
  hint(`Resume later with: babel continue ${workItem.id}`)
  console.log()
}
