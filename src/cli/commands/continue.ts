import inquirer from 'inquirer'
import { loadConfig } from '../../core/config.js'
import { loadState, saveWorkItem, setCurrentWorkItem, findPausedWorkItems, findWorkItemByIdOrDescription } from '../../core/state.js'
import { fetchOrigin, checkoutBranch, pullBranch, localBranchExists, checkoutNewBranch, remoteExists, getUserEmail } from '../../core/git.js'
import { loadCheckpoints } from '../../core/checkpoint.js'
import { timeAgoLabel } from '../../core/workitem.js'
import { error, success, hint } from '../display.js'

export async function runContinue(workItemIdOrDesc?: string, repoPath: string = process.cwd()): Promise<void> {
  await loadConfig(repoPath).catch(err => {
    if (err.message === 'NO_CONFIG') {
      error('No babel.config.yml found.', undefined, "Run 'babel init' to set up babelgit.")
      process.exit(1)
    }
    throw err
  })

  const userEmail = await getUserEmail(repoPath)
  let workItem

  if (workItemIdOrDesc) {
    workItem = await findWorkItemByIdOrDescription(workItemIdOrDesc, repoPath)
    if (!workItem) {
      error(`No work item found matching: "${workItemIdOrDesc}"`)
      process.exit(1)
    }
  } else {
    // Find paused items
    const paused = await findPausedWorkItems(userEmail, repoPath)
    if (paused.length === 0) {
      error('No paused work items found.', undefined, "Run 'babel start' to begin a new work item.")
      process.exit(1)
    }
    if (paused.length === 1) {
      workItem = paused[0]
    } else {
      // Let user pick
      const { selected } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selected',
          message: 'Which work item would you like to continue?',
          choices: paused.map(wi => ({
            name: `${wi.id}: ${wi.description} ${wi.paused_at ? `(paused ${timeAgoLabel(wi.paused_at)})` : ''}`,
            value: wi.id,
          })),
        },
      ])
      const state = await loadState(repoPath)
      workItem = state.work_items[selected]
    }
  }

  if (!workItem) {
    error('Work item not found.')
    process.exit(1)
  }

  if (workItem.stage !== 'paused' && workItem.stage !== 'in_progress') {
    error(
      `Cannot continue work item "${workItem.id}" — it is ${workItem.stage}.`,
      undefined,
      workItem.stage === 'shipped' ? 'This work item has already shipped.' : undefined
    )
    process.exit(1)
  }

  try {
    await fetchOrigin(repoPath)
  } catch {
    // No remote — OK
  }

  // Check out the branch
  const localExists = await localBranchExists(workItem.branch, repoPath).catch(() => false)
  const remoteExists_ = await remoteExists(workItem.branch, repoPath).catch(() => false)

  if (localExists) {
    await checkoutBranch(workItem.branch, repoPath)
    if (remoteExists_) {
      await pullBranch(workItem.branch, repoPath)
    }
  } else if (remoteExists_) {
    await checkoutNewBranch(workItem.branch, `origin/${workItem.branch}`, repoPath)
  } else {
    error(`Branch '${workItem.branch}' not found locally or on remote.`)
    process.exit(1)
  }

  // Update state
  workItem.stage = 'in_progress'
  workItem.paused_by = undefined
  workItem.paused_at = undefined
  await saveWorkItem(workItem, repoPath)
  await setCurrentWorkItem(workItem.id, repoPath)

  // Load checkpoints for context
  const checkpoints = await loadCheckpoints(workItem.id, repoPath)
  const lastAnchor = checkpoints.filter(c => c.is_recovery_anchor).pop()

  console.log()
  success(`Continuing: ${workItem.id}`)
  console.log()
  console.log(`  "${workItem.description}"`)
  console.log(`  Branch: ${workItem.branch}`)
  if (workItem.paused_notes) {
    console.log(`  Paused notes: ${workItem.paused_notes}`)
  }
  if (lastAnchor) {
    console.log(`  Last checkpoint: ${lastAnchor.verdict} — "${lastAnchor.notes}"`)
  }
  console.log()
  hint(`Make your changes, then: babel save "notes"`)
  console.log()
}
