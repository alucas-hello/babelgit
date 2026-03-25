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
import { loadCheckpoints } from '../../core/checkpoint.js'
import { runHooks, hooksFailed } from '../../core/hooks.js'
import { resolveRoute } from '../../core/workitem.js'
import { error, success, hint, info } from '../display.js'

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

  const route = resolveRoute(config, workItem.type)
  const mergeTargets = Array.isArray(route.merge_to) ? route.merge_to : [route.merge_to]

  // Human confirmation
  if (caller === 'human' && config.require_confirmation?.includes('ship')) {
    console.log()
    console.log(`  This will:`)
    for (const target of mergeTargets) {
      console.log(`    - Merge ${workItem.branch} → ${target}`)
      console.log(`    - Push to origin/${target}`)
    }
    console.log(`    - Delete branch: ${workItem.branch}`)
    console.log()
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `Ship "${workItem.description}" to ${mergeTargets.join(', ')}?`,
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
  // When branch_routes is active, use the first merge target as PR base
  if (config.integrations?.github && config.branch_routes) {
    config.integrations.github.pr_base_branch = mergeTargets[0]
  }
  if (config.integrations?.github?.enabled && config.integrations.github.ship_via_pr) {
    // Unconditional: a ship verdict checkpoint is always required before opening a PR.
    // This cannot be bypassed by config — a human must explicitly declare it ready.
    const checkpoints = await loadCheckpoints(workItem.id, repoPath)
    const hasShipVerdict = checkpoints.some(c => c.verdict === 'ship' && c.is_recovery_anchor)
    if (!hasShipVerdict) {
      error(
        'No ship verdict — PR blocked.',
        `A developer must explicitly declare this ready before a PR can be opened.`,
        `Run 'babel run' then 'babel ship "what makes this ready"' to declare it.`
      )
      process.exit(1)
    }

    const tokenEnv = config.integrations.github.token_env || 'GITHUB_TOKEN'
    if (!process.env[tokenEnv]) {
      error(
        `GitHub token not set — cannot open PR.`,
        `ship_via_pr requires ${tokenEnv} to be set in your environment.`,
        `Set the variable and retry: export ${tokenEnv}=your_token`
      )
      process.exit(1)
    }
    // Push feature branch to remote so GitHub can see the commits
    try {
      await push(workItem.branch!, repoPath)
    } catch (pushErr) {
      error('Failed to push branch to remote.', (pushErr as Error).message)
      process.exit(1)
    }

    const { IntegrationManager } = await import('../../integrations/index.js')
    const mgr = new IntegrationManager(config, repoPath)
    const prFields = await mgr.onShip(workItem)
    if (prFields.pr_url) {
      // PR created, awaiting review — set pr_open stage
      workItem.stage = 'pr_open'
      workItem.pr_url = prFields.pr_url
      workItem.pr_number = prFields.pr_number
      workItem.ship_ready = false
      await saveWorkItem(workItem, repoPath)
      console.log()
      success(`PR open: ${workItem.id} — "${workItem.description}"`)
      console.log(`\n  PR: ${prFields.pr_url}`)
      console.log(`  Merge when approved — branch stays until then.\n`)
    } else {
      // PR creation failed — branch is pushed but no PR was opened
      error(
        'GitHub PR creation failed.',
        'The branch was pushed but no PR was opened.',
        `Create it manually or check your token permissions: https://github.com`
      )
      process.exit(1)
    }
    return
  }

  const workBranch = workItem.branch!

  try {
    await fetchOrigin(repoPath)
  } catch {
    // No remote — OK for local repos
  }

  // Merge to each target branch sequentially
  const completedTargets: string[] = []
  for (const target of mergeTargets) {
    try {
      await checkoutBranch(target, repoPath)
    } catch (err) {
      if (completedTargets.length > 0) {
        error(
          `Failed to checkout target branch '${target}'.`,
          (err as Error).message,
          `Merge already completed to: ${completedTargets.join(', ')}. Resolve manually.`
        )
      } else {
        error(`Failed to checkout target branch '${target}'.`, (err as Error).message)
      }
      process.exit(1)
    }

    try {
      await pullBranch(target, repoPath)
    } catch {
      // No remote
    }

    try {
      await mergeNoFF(workBranch, `ship(${workItem.id}): ${workItem.description}`, repoPath)
    } catch (err) {
      if (completedTargets.length > 0) {
        error(
          `Merge to '${target}' failed.`,
          (err as Error).message,
          `Merge already completed to: ${completedTargets.join(', ')}. Resolve the conflict on '${target}' manually.`
        )
      } else {
        error(`Merge to '${target}' failed.`, (err as Error).message)
      }
      process.exit(1)
    }

    try {
      await push(target, repoPath)
    } catch {
      // No remote
    }

    completedTargets.push(target)
  }

  // Clean up branches (only after ALL merges succeed)
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
  for (const target of mergeTargets) {
    console.log(`  Merged: ${workBranch} → ${target}`)
  }
  console.log(`  Branch: deleted`)
  console.log()
  hint(`View history: babel history ${workItem.id}`)
  console.log()

  // Prompt human callers to update docs
  if (caller === 'human') {
    const { updateDocs } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'updateDocs',
        message: 'Would you like to update the docs?',
        default: false,
      },
    ])
    if (updateDocs) {
      console.log()
      console.log('  Docs worth updating:')
      console.log('    README.md              ← user-facing commands, features, status')
      console.log('    CLAUDE.md              ← working agreements, agent instructions')
      console.log('    docs/build/MVP-SPEC.md ← scope changes')
      console.log()
    }
  }
}
