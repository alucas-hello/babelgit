import inquirer from 'inquirer'
import { loadConfig } from '../../core/config.js'
import { getCurrentWorkItem, saveWorkItem } from '../../core/state.js'
import { getCurrentCommitSha, getShortSha, getStatusPorcelain, getUserEmail, resetHard } from '../../core/git.js'
import {
  loadRunSession,
  deleteRunSession,
  createCheckpoint,
  getLastRecoveryAnchor,
  computeFilesystemHash,
  loadCheckpoints,
} from '../../core/checkpoint.js'
import { detectCallerType } from '../../core/governance.js'
import { timeAgoLabel } from '../../core/workitem.js'
import { error, showCheckpointCreated, success, hint } from '../display.js'
import { formatAutomationSummary } from '../../core/scripts.js'
import type { Verdict, AutomationResult } from '../../types.js'
import chalk from 'chalk'

export async function runVerdict(verdict: Verdict, notes?: string, repoPath: string = process.cwd()): Promise<void> {
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

  const session = await loadRunSession(repoPath)
  if (!session || session.status !== 'open') {
    error("No active run session.", undefined, "Run 'babel run' first to open a review session.")
    process.exit(1)
  }

  const caller = detectCallerType()

  if (caller === 'agent' && !notes) {
    error(
      'Agents must provide notes when calling a verdict.',
      undefined,
      `Call with notes: babel_attest("${verdict}", "what you verified")`
    )
    process.exit(1)
  }

  // Show automation summary if run_commands were used
  if (session.automation_results && session.automation_results.length > 0) {
    const summary = formatAutomationSummary(session.automation_results as any)
    if (summary) {
      console.log(`\n  Automation: ${summary}`)
    }
  }

  // Check if code changed since session opened
  const currentCommit = await getCurrentCommitSha(repoPath)
  if (currentCommit !== session.locked_commit) {
    if (caller === 'human') {
      console.log()
      console.log('  ⚠  Your code changed since the run session was opened.')
      console.log(`     Session locked at: ${session.locked_commit.slice(0, 7)}`)
      console.log(`     Current HEAD:      ${currentCommit.slice(0, 7)}`)
      console.log()
      const { proceed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'proceed',
          message: 'Continue with the verdict? (checkpoint will record current commit)',
          default: false,
        },
      ])
      if (!proceed) {
        console.log('\n  Cancelled.\n')
        process.exit(0)
      }
    }
  }

  const shortSha = await getShortSha(currentCommit, repoPath)
  const statusOutput = await getStatusPorcelain(repoPath)
  const filesystemHash = computeFilesystemHash(statusOutput)
  const userEmail = await getUserEmail(repoPath)
  const automationResults = (session.automation_results || []) as AutomationResult[]

  // Handle reject: revert to last keep
  if (verdict === 'reject') {
    const lastAnchor = await getLastRecoveryAnchor(workItem.id, repoPath)
    const revertTo = lastAnchor?.git_commit || session.locked_commit

    console.log()
    console.log('  ⚠  Reverting to last recovery anchor:')
    console.log(`     Commit: ${revertTo.slice(0, 7)}`)
    if (lastAnchor) {
      console.log(`     Checkpoint: ${lastAnchor.verdict} — "${lastAnchor.notes}"`)
    }
    console.log()

    await resetHard(revertTo, repoPath)

    const checkpoint = await createCheckpoint({
      workItemId: workItem.id,
      verdict,
      notes: notes || '',
      calledBy: userEmail,
      callerType: caller,
      gitCommit: revertTo,
      gitBranch: workItem.branch!,
      filesystemHash,
      automationResults,
      repoPath,
    })

    await deleteRunSession(repoPath)

    workItem.stage = 'in_progress'
    workItem.last_checkpoint = checkpoint
    await saveWorkItem(workItem, repoPath)

    // Post to integrations
    await postCheckpointToIntegrations(workItem, checkpoint, repoPath)

    console.log()
    success(`Rejected and reverted to: ${revertTo.slice(0, 7)}`)
    if (notes) console.log(`  Reason: ${notes}`)
    console.log()
    return
  }

  // Create checkpoint for keep/refine/ship
  const checkpoint = await createCheckpoint({
    workItemId: workItem.id,
    verdict,
    notes: notes || '',
    calledBy: userEmail,
    callerType: caller,
    gitCommit: currentCommit,
    gitBranch: workItem.branch!,
    filesystemHash,
    automationResults,
    refineNotes: verdict === 'refine' ? notes : undefined,
    repoPath,
  })

  await deleteRunSession(repoPath)

  if (verdict === 'ship') {
    workItem.stage = 'in_progress'
    workItem.ship_ready = true
  } else {
    workItem.stage = 'in_progress'
  }
  workItem.last_checkpoint = checkpoint
  await saveWorkItem(workItem, repoPath)

  // Post to integrations
  await postCheckpointToIntegrations(workItem, checkpoint, repoPath)

  showCheckpointCreated({
    verdict,
    checkpointId: checkpoint.id,
    notes: notes || '',
    commit: shortSha,
    isAnchor: checkpoint.is_recovery_anchor,
    callerType: caller,
  })

  console.log()

  if (verdict === 'keep') {
    hint(`Continue working: babel save "notes" → babel run`)
    hint(`Ready to ship? babel ship`)
  } else if (verdict === 'refine') {
    if (notes) console.log(`  ${chalk.yellow('Refinement needed:')} ${notes}`)
    hint(`Fix what needs fixing: babel save "notes" → babel run`)
  } else if (verdict === 'ship') {
    hint(`Ship it: babel ship`)
  }

  console.log()
}

async function postCheckpointToIntegrations(
  workItem: import('../../types.js').WorkItem,
  checkpoint: import('../../types.js').Checkpoint,
  repoPath: string
): Promise<void> {
  try {
    const config = await loadConfig(repoPath)
    const { IntegrationManager } = await import('../../integrations/index.js')
    const mgr = new IntegrationManager(config, repoPath)
    await mgr.onCheckpoint(workItem, checkpoint)
  } catch {
    // Integration errors are non-fatal
  }
}
