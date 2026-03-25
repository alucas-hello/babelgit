/**
 * Review-focused policy condition functions.
 *
 * These will be merged into the main condition registry when all PaC phases
 * are combined. Each function has the same signature:
 *
 *   (ctx: PolicyContext, params: Record<string, unknown>) =>
 *     Promise<{ passed: boolean; vars: Record<string, string> }>
 */

import type { Checkpoint, AutomationResult, WorkItem, CallerType } from '../types.js'

// ─── Types (mirrors the PaC plan interfaces) ────────────────────────────────

export interface PolicyContext {
  trigger: string
  caller: string
  branch: string
  config: unknown
  repoPath: string
  workItem?: WorkItem & Record<string, unknown>
  workItems?: Record<string, WorkItem>
  commitMessage?: string
  changedFiles?: string[]
  checkpoints?: Checkpoint[]
  runSession?: {
    work_item_id: string
    started_at: string
    locked_commit: string
    locked_filesystem_hash: string
    status: 'open' | 'completed'
    automation_results?: AutomationResult[]
  }
  notes?: string
}

export type ConditionFn = (
  ctx: PolicyContext,
  params: Record<string, unknown>,
) => Promise<{ passed: boolean; vars: Record<string, string> }>

// ─── Condition: automation_passed ────────────────────────────────────────────

/**
 * Checks that automation results from the most recent run session all passed.
 *
 * params.required_only?: boolean — if true, only check results where required: true
 */
export const automationPassed: ConditionFn = async (ctx, params) => {
  const requiredOnly = params.required_only === true

  // Prefer run session results, fall back to latest checkpoint's results
  let results: AutomationResult[] | undefined

  if (ctx.runSession?.automation_results?.length) {
    results = ctx.runSession.automation_results
  } else if (ctx.checkpoints?.length) {
    // Get latest checkpoint with automation results
    for (let i = ctx.checkpoints.length - 1; i >= 0; i--) {
      if (ctx.checkpoints[i].automation_results?.length) {
        results = ctx.checkpoints[i].automation_results
        break
      }
    }
  }

  if (!results || results.length === 0) {
    // No automation results available — pass vacuously (nothing to fail)
    return { passed: true, vars: { failed_count: '0', failed_names: '' } }
  }

  const toCheck = requiredOnly ? results.filter(r => r.required) : results
  const failed = toCheck.filter(r => !r.passed)

  return {
    passed: failed.length === 0,
    vars: {
      failed_count: String(failed.length),
      failed_names: failed.map(r => r.name).join(', '),
    },
  }
}

// ─── Condition: wi_has_field ─────────────────────────────────────────────────

/**
 * Checks that a work item has a non-empty value for a specific field.
 *
 * params.field: string — the field name (e.g., 'pr_url', 'pr_number')
 */
export const wiHasField: ConditionFn = async (ctx, params) => {
  const field = params.field as string | undefined

  if (!field) {
    return { passed: false, vars: { field: String(field) } }
  }

  const workItem = ctx.workItem as Record<string, unknown> | undefined
  const value = workItem?.[field]
  const has = value !== undefined && value !== null && value !== '' && value !== 0

  return {
    passed: has,
    vars: { field },
  }
}

// ─── Condition: checkpoint_caller_includes ───────────────────────────────────

/**
 * Checks that at least one checkpoint was called by a specific caller type.
 *
 * params.caller_type: 'human' | 'agent'
 * params.verdict?: string[] — optional filter by verdict type
 * params.min_count?: number — minimum number of matching checkpoints (default 1)
 */
export const checkpointCallerIncludes: ConditionFn = async (ctx, params) => {
  const callerType = params.caller_type as CallerType
  const verdictFilter = params.verdict as string[] | undefined
  const minCount = (params.min_count as number) ?? 1

  const checkpoints = ctx.checkpoints ?? []

  let matching = checkpoints.filter(c => c.caller_type === callerType)

  if (verdictFilter && verdictFilter.length > 0) {
    matching = matching.filter(c => verdictFilter.includes(c.verdict))
  }

  return {
    passed: matching.length >= minCount,
    vars: {
      found_count: String(matching.length),
      required_count: String(minCount),
      caller_type: callerType,
    },
  }
}

// ─── Condition: time_since_last_checkpoint ───────────────────────────────────

/**
 * Checks whether the last checkpoint is within a time window.
 *
 * params.max_minutes?: number — maximum age in minutes
 */
export const timeSinceLastCheckpoint: ConditionFn = async (ctx, params) => {
  const maxMinutes = params.max_minutes as number | undefined

  if (maxMinutes === undefined || maxMinutes === null) {
    // No constraint specified — pass vacuously
    return { passed: true, vars: { minutes_ago: '0', max_minutes: 'none' } }
  }

  const checkpoints = ctx.checkpoints ?? []

  if (checkpoints.length === 0) {
    return {
      passed: false,
      vars: {
        minutes_ago: 'never',
        max_minutes: String(maxMinutes),
      },
    }
  }

  const latest = checkpoints[checkpoints.length - 1]
  const calledAt = new Date(latest.called_at).getTime()
  const now = Date.now()
  const minutesAgo = Math.round((now - calledAt) / 60000)

  return {
    passed: minutesAgo <= maxMinutes,
    vars: {
      minutes_ago: String(minutesAgo),
      max_minutes: String(maxMinutes),
    },
  }
}

// ─── Registry (for future integration into the main condition map) ──────────

export const reviewConditions: Record<string, ConditionFn> = {
  automation_passed: automationPassed,
  wi_has_field: wiHasField,
  checkpoint_caller_includes: checkpointCallerIncludes,
  time_since_last_checkpoint: timeSinceLastCheckpoint,
}
