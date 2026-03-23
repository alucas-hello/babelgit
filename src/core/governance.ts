import type { BabelConfig, GovernanceCheck, GovernanceResult, WorkItem, CallerType } from '../types.js'
import { matchesPattern } from './config.js'
import { loadCheckpoints } from './checkpoint.js'
import { loadRunSession } from './checkpoint.js'

export function detectCallerType(): CallerType {
  if (
    process.env.CLAUDE_CODE ||
    process.env.CURSOR_AGENT ||
    process.env.BABELGIT_AGENT ||
    process.env.CI
  ) {
    return 'agent'
  }
  return 'human'
}

export function checkBranchProtection(
  branch: string,
  config: BabelConfig,
  caller: CallerType
): GovernanceResult {
  if (config.protected_branches.includes(branch)) {
    return {
      permitted: false,
      reason: `Branch '${branch}' is protected and cannot be modified directly.`,
      suggestion: `Use 'babel ship' to merge your work into ${branch} through the proper workflow.`,
    }
  }
  return { permitted: true }
}

export function checkAgentBranchPermission(
  branch: string,
  config: BabelConfig,
  caller: CallerType
): GovernanceResult {
  if (caller !== 'agent') return { permitted: true }
  if (!config.agents.permitted_branch_patterns?.length) return { permitted: true }

  if (!matchesPattern(branch, config.agents.permitted_branch_patterns)) {
    return {
      permitted: false,
      reason: `Agents are not permitted to operate on branch '${branch}'.`,
      suggestion: `Permitted branch patterns: ${config.agents.permitted_branch_patterns.join(', ')}. Create a new work item with 'babel_start()'.`,
    }
  }
  return { permitted: true }
}

export async function checkShipRequirement(
  workItem: WorkItem,
  config: BabelConfig,
  repoPath: string = process.cwd()
): Promise<GovernanceResult> {
  if (!config.require_checkpoint_for.ship) return { permitted: true }

  const checkpoints = await loadCheckpoints(workItem.id, repoPath)
  const hasShipOrKeep = checkpoints.some(
    c => (c.verdict === 'ship' || c.verdict === 'keep') && c.is_recovery_anchor
  )

  if (!hasShipOrKeep) {
    return {
      permitted: false,
      reason: `babel.config.yml requires a verified checkpoint before shipping. You haven't run a review session for ${workItem.id} yet.`,
      suggestion: `Run 'babel run' and call a verdict ('babel keep' or 'babel ship'), then try 'babel ship' again.`,
    }
  }
  return { permitted: true }
}

export async function checkPauseRequirement(
  workItem: WorkItem,
  config: BabelConfig,
  caller: CallerType,
  repoPath: string = process.cwd()
): Promise<GovernanceResult> {
  // Check config-based pause requirement
  if (config.require_checkpoint_for.pause) {
    const checkpoints = await loadCheckpoints(workItem.id, repoPath)
    const hasAnchor = checkpoints.some(c => c.is_recovery_anchor)
    if (!hasAnchor) {
      return {
        permitted: false,
        reason: `babel.config.yml requires a verified checkpoint before pausing.`,
        suggestion: `Run 'babel run' and call 'babel keep' or 'babel ship', then try 'babel pause' again.`,
      }
    }
  }

  // Agent-specific: require attestation before pause
  if (caller === 'agent' && config.agents.require_attestation_before_pause) {
    const session = await loadRunSession(repoPath)
    const checkpoints = await loadCheckpoints(workItem.id, repoPath)
    // Agent must have called run + verdict recently (no open session, but has checkpoints)
    if (checkpoints.length === 0) {
      return {
        permitted: false,
        reason: `babel.config.yml requires agents to attest their work before pausing. No checkpoints found for ${workItem.id}.`,
        suggestion: `Call 'babel_run()' then 'babel_attest()' before pausing.`,
      }
    }
    if (session && session.status === 'open') {
      return {
        permitted: false,
        reason: `There is an open run session. Agents must close the session with a verdict before pausing.`,
        suggestion: `Call 'babel_attest()' to close the session, then 'babel_pause()'.`,
      }
    }
  }

  return { permitted: true }
}

export async function checkRunSession(repoPath: string = process.cwd()): Promise<GovernanceResult> {
  const session = await loadRunSession(repoPath)
  if (!session || session.status !== 'open') {
    return {
      permitted: false,
      reason: `No active run session found.`,
      suggestion: `Run 'babel run' to open a review session first.`,
    }
  }
  return { permitted: true }
}

export function checkNoExistingWorkItem(
  workItems: Record<string, import('../types.js').WorkItem>
): GovernanceResult {
  const active = Object.values(workItems).find(wi => wi.stage === 'in_progress')
  if (active) {
    return {
      permitted: false,
      reason: `There is already an active work item: ${active.id} — "${active.description}".`,
      suggestion: `Run 'babel pause' to pause current work, then start a new work item.`,
    }
  }
  return { permitted: true }
}
