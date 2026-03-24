import inquirer from 'inquirer'
import { loadConfig } from '../../core/config.js'
import { getCurrentWorkItem, saveWorkItem, setCurrentWorkItem } from '../../core/state.js'
import { checkoutBranch, deleteLocalBranch, deleteRemoteBranch, remoteExists, getCurrentBranch } from '../../core/git.js'
import { detectCallerType } from '../../core/governance.js'
import { error, success, hint } from '../display.js'

export async function runStop(reason?: string, repoPath: string = process.cwd()): Promise<void> {
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

  const caller = detectCallerType()

  // Agents must provide a reason
  if (caller === 'agent' && !reason) {
    error('Agents must provide a reason when stopping.', undefined, "Pass a reason: babel stop 'reason'")
    process.exit(1)
  }

  // Human confirmation if required
  if (caller === 'human' && config.require_confirmation?.includes('stop')) {
    console.log()
    console.log(`  This will:`)
    console.log(`    - Abandon work item: ${workItem.id} — "${workItem.description}"`)
    console.log(`    - Delete branch: ${workItem.branch!}`)
    console.log(`    - Remove it from active work (history is preserved locally)`)
    console.log()
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to stop this work item?',
        default: false,
      },
    ])
    if (!confirm) {
      console.log('\n  Cancelled.\n')
      process.exit(0)
    }

    if (!reason) {
      const { stopReason } = await inquirer.prompt([
        {
          type: 'input',
          name: 'stopReason',
          message: 'Why are you stopping? (optional)',
        },
      ])
      reason = stopReason || undefined
    }
  }

  // Switch to base branch
  try {
    await checkoutBranch(config.base_branch, repoPath)
  } catch {
    // May already be on base branch or it doesn't exist
  }

  // Delete local branch
  try {
    await deleteLocalBranch(workItem.branch!, repoPath)
  } catch {
    // May not exist locally
  }

  // Delete remote branch if it exists
  try {
    const hasRemote = await remoteExists(workItem.branch!, repoPath)
    if (hasRemote) {
      await deleteRemoteBranch(workItem.branch!, repoPath)
    }
  } catch {
    // No remote or branch doesn't exist remotely
  }

  // Update state
  workItem.stage = 'stopped'
  if (reason) (workItem as any).stop_reason = reason
  await saveWorkItem(workItem, repoPath)
  await setCurrentWorkItem(undefined, repoPath)

  console.log()
  success(`Work item stopped: ${workItem.id}`)
  console.log()
  console.log(`  "${workItem.description}" — archived in local history`)
  if (reason) console.log(`  Reason: ${reason}`)
  console.log(`  Branch: deleted`)
  console.log()
  hint(`View history with: babel history ${workItem.id}`)
  console.log()
}
