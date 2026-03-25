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
import { evaluatePolicies } from '../../core/policy.js'
import { showPolicyViolations } from '../display.js'
import { getCurrentBranch } from '../../core/git.js'
import { loadConfig as loadConfigForPolicy } from '../../core/config.js'
import { timeAgoLabel } from '../../core/workitem.js'
import { error, showCheckpointCreated, success, hint } from '../display.js'
import { appendConversationEntry } from '../../core/conversation.js'
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
  const caller = detectCallerType()

  // Evaluate policies for this verdict trigger
  const config = await loadConfigForPolicy(repoPath).catch(() => null)
  const currentBranch = await getCurrentBranch(repoPath).catch(() => 'unknown')

  // Build policy context — include synthesized policies for verdict checks
  if (config) {
    // Ensure we have the standard verdict policies synthesized
    ensureVerdictPolicies(config)

    const policyResults = await evaluatePolicies(verdict === 'ship' ? 'ship_verdict' : verdict, {
      trigger: verdict === 'ship' ? 'ship_verdict' : verdict,
      caller,
      branch: currentBranch,
      config,
      repoPath,
      workItem: workItem!,
      runSession: session,
      notes,
    })
    const blocked = policyResults.filter(r => r.blocking && !r.permitted)
    if (blocked.length > 0) {
      showPolicyViolations(blocked)
      process.exit(1)
    }
  } else {
    // Fallback: basic checks if config can't be loaded
    if (!session || session.status !== 'open') {
      error("No active run session.", undefined, "Run 'babel run' first to open a review session.")
      process.exit(1)
    }
    if (caller === 'agent' && verdict === 'ship') {
      error('Agents cannot declare a ship verdict.')
      process.exit(1)
    }
    if (caller === 'agent' && !notes) {
      error('Agents must provide notes when calling a verdict.')
      process.exit(1)
    }
  }

  if (!session || session.status !== 'open') {
    error("No active run session.", undefined, "Run 'babel run' first to open a review session.")
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

    await appendConversationEntry(repoPath, workItem.id, {
      event: 'verdict',
      timestamp: new Date().toISOString(),
      verdict: 'reject',
      notes,
      commit: revertTo.slice(0, 7),
    }).catch(() => {})

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

  await appendConversationEntry(repoPath, workItem.id, {
    event: 'verdict',
    timestamp: new Date().toISOString(),
    verdict,
    notes,
    commit: shortSha,
  }).catch(() => {})

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

/**
 * Ensure standard verdict policies are present (run session, agent-ship-denied, agent-notes-required).
 * These are always active — not configurable via babel.config.yml.
 */
function ensureVerdictPolicies(config: import('../../types.js').BabelConfig): void {
  if (!config.policies) config.policies = []
  const names = new Set(config.policies.map(p => p.name))

  if (!names.has('verdict-requires-run-session')) {
    config.policies.push({
      name: 'verdict-requires-run-session',
      on: ['keep', 'refine', 'reject', 'ship_verdict'],
      condition: 'has_open_run_session',
      deny: "No active run session.",
      suggest: "Run 'babel run' first to open a review session.",
    })
  }

  if (!names.has('agent-ship-denied')) {
    config.policies.push({
      name: 'agent-ship-denied',
      on: ['ship_verdict'],
      when: { caller: 'agent' },
      condition: 'always_deny',
      deny: 'Agents cannot declare a ship verdict. A human must review the work and call: babel ship "what makes this ready"',
      suggest: 'This restriction exists to ensure a human signs off before any PR is opened or merge happens.',
    })
  }

  if (!names.has('agent-notes-required')) {
    config.policies.push({
      name: 'agent-notes-required',
      on: ['keep', 'refine', 'reject', 'ship_verdict'],
      when: { caller: 'agent' },
      condition: 'notes_empty',
      deny: 'Agents must provide notes when calling a verdict.',
      suggest: 'Call with notes: babel_attest("<verdict>", "what you verified")',
    })
  }
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
