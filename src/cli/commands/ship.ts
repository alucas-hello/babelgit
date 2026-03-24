import inquirer from 'inquirer'
import { loadConfig } from '../../core/config.js'
import { getCurrentWorkItem, saveWorkItem, setCurrentWorkItem } from '../../core/state.js'
import {
  fetchOrigin,
  checkoutBranch,
  pullBranch,
  mergeNoFF,
  push,
  deleteLocalBranch,
  deleteRemoteBranch,
  remoteExists,
} from '../../core/git.js'
import { checkShipRequirement, detectCallerType } from '../../core/governance.js'
import { runHooks, hooksFailed } from '../../core/hooks.js'
import { error, success, hint } from '../display.js'

export async function runShip(repoPath: string = process.cwd()): Promise<void> {
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
      'A run session is open.',
      undefined,
      "Call a verdict (babel ship/keep/refine/reject) before shipping."
    )
    process.exit(1)
  }

  const caller = detectCallerType()

  // Governance check: ship requirement
  const govCheck = await checkShipRequirement(workItem, config, repoPath)
  if (!govCheck.permitted) {
    error('Operation blocked: ship', govCheck.reason, govCheck.suggestion)
    process.exit(1)
  }

  // Human confirmation
  if (caller === 'human' && config.require_confirmation?.includes('ship')) {
    console.log()
    console.log(`  This will:`)
    console.log(`    - Merge ${workItem.branch} → ${config.base_branch}`)
    console.log(`    - Push to origin/${config.base_branch}`)
    console.log(`    - Delete branch: ${workItem.branch}`)
    console.log()
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `Ship "${workItem.description}" to ${config.base_branch}?`,
        default: true,
      },
    ])
    if (!confirm) {
      console.log('\n  Cancelled.\n')
      process.exit(0)
    }
  }

  // before_ship hooks
  const beforeHooks = await runHooks('before_ship', config, repoPath)
  const hookFail = hooksFailed(beforeHooks)
  if (hookFail) {
    error(`before_ship hook failed: ${hookFail.name}`, hookFail.stderr || hookFail.stdout)
    process.exit(1)
  }

  // GitHub PR path (if configured)
  if (config.integrations?.github?.enabled && config.integrations.github.ship_via_pr) {
    const { IntegrationManager } = await import('../../integrations/index.js')
    const mgr = new IntegrationManager(config, repoPath)
    await mgr.onShip(workItem)
    return
  }

  const workBranch = workItem.branch!

  try {
    await fetchOrigin(repoPath)
  } catch {
    // No remote — OK for local repos
  }

  // Checkout base and pull
  await checkoutBranch(config.base_branch, repoPath)

  try {
    await pullBranch(config.base_branch, repoPath)
  } catch {
    // No remote
  }

  // Merge work branch
  await mergeNoFF(workBranch, `ship(${workItem.id}): ${workItem.description}`, repoPath)

  // Push base branch
  try {
    await push(config.base_branch, repoPath)
  } catch {
    // No remote
  }

  // Clean up branches
  try {
    await deleteLocalBranch(workBranch, repoPath)
  } catch {
    // May already be gone
  }

  if (!config.keep_branch_after_ship) {
    try {
      const hasRemote = await remoteExists(workBranch, repoPath)
      if (hasRemote) {
        await deleteRemoteBranch(workBranch, repoPath)
      }
    } catch {
      // No remote
    }
  }

  // Update state
  workItem.stage = 'shipped'
  await saveWorkItem(workItem, repoPath)
  await setCurrentWorkItem(undefined, repoPath)

  // after_ship hooks (non-blocking)
  await runHooks('after_ship', config, repoPath).catch(() => {})

  // Integration callbacks
  try {
    const { IntegrationManager } = await import('../../integrations/index.js')
    const mgr = new IntegrationManager(config, repoPath)
    await mgr.onShip(workItem)
  } catch {
    // Non-fatal
  }

  console.log()
  success(`Shipped: ${workItem.id} — "${workItem.description}"`)
  console.log()
  console.log(`  Merged: ${workBranch} → ${config.base_branch}`)
  console.log(`  Branch: deleted`)
  console.log()
  hint(`View history: babel history ${workItem.id}`)
  console.log()
}
