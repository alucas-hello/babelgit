import type { PolicyContext } from '../types.js'
import { matchesPattern, matchesGlob } from './config.js'
import { runCommand } from './scripts.js'

export type ConditionFn = (
  ctx: PolicyContext,
  params: Record<string, unknown>
) => Promise<{ passed: boolean; vars: Record<string, string> }>

const registry = new Map<string, ConditionFn>()

export function registerCondition(name: string, fn: ConditionFn): void {
  registry.set(name, fn)
}

export function getCondition(name: string): ConditionFn | undefined {
  return registry.get(name)
}

// ─── branch_is_protected ─────────────────────────────────────────────────────
// Returns passed=false when branch IS protected (i.e. operation is blocked)
registerCondition('branch_is_protected', async (ctx, _params) => {
  const isProtected = ctx.config.protected_branches.includes(ctx.branch)
  return {
    passed: !isProtected,
    vars: { branch: ctx.branch },
  }
})

// ─── branch_not_matching ─────────────────────────────────────────────────────
// Returns passed=false when branch doesn't match any of the permitted patterns
registerCondition('branch_not_matching', async (ctx, params) => {
  const patterns = (params.patterns as string[]) || []
  if (patterns.length === 0) return { passed: true, vars: {} as Record<string, string> }
  const matches = matchesPattern(ctx.branch, patterns)
  return {
    passed: matches,
    vars: { branch: ctx.branch, patterns: patterns.join(', ') } as Record<string, string>,
  }
})

// ─── no_active_work_item ─────────────────────────────────────────────────────
// Returns passed=false when there IS an active work item (blocks starting a new one)
registerCondition('no_active_work_item', async (ctx, _params) => {
  const workItems = ctx.workItems || {}
  const active = Object.values(workItems).find(wi => wi.stage === 'in_progress')
  const vars: Record<string, string> = active
    ? { active_wi_id: active.id, active_wi_description: active.description }
    : {}
  return { passed: !active, vars }
})

// ─── has_checkpoint ──────────────────────────────────────────────────────────
// Checks ctx.checkpoints for matching verdict/anchor/caller_type/min_count
registerCondition('has_checkpoint', async (ctx, params) => {
  const checkpoints = ctx.checkpoints || []
  const verdict = params.verdict as string | string[] | undefined
  const requireAnchor = params.anchor as boolean | undefined
  const callerType = params.caller_type as string | undefined
  const minCount = (params.min_count as number) ?? 1

  let matching = checkpoints
  if (verdict) {
    const verdicts = Array.isArray(verdict) ? verdict : [verdict]
    matching = matching.filter(c => verdicts.includes(c.verdict))
  }
  if (requireAnchor) {
    matching = matching.filter(c => c.is_recovery_anchor)
  }
  if (callerType) {
    matching = matching.filter(c => c.caller_type === callerType)
  }

  return {
    passed: matching.length >= minCount,
    vars: { checkpoint_count: String(matching.length) },
  }
})

// ─── no_open_run_session ─────────────────────────────────────────────────────
// Returns passed=true when there is NO open run session
registerCondition('no_open_run_session', async (ctx, _params) => {
  const hasOpen = ctx.runSession != null && ctx.runSession.status === 'open'
  return {
    passed: !hasOpen,
    vars: {},
  }
})

// ─── has_open_run_session ────────────────────────────────────────────────────
// Returns passed=true when there IS an open run session
registerCondition('has_open_run_session', async (ctx, _params) => {
  const hasOpen = ctx.runSession != null && ctx.runSession.status === 'open'
  return {
    passed: hasOpen,
    vars: {},
  }
})

// ─── always_deny ─────────────────────────────────────────────────────────────
registerCondition('always_deny', async (_ctx, _params) => {
  return { passed: false, vars: {} }
})

// ─── notes_empty ─────────────────────────────────────────────────────────────
// Returns passed=false when notes ARE empty (blocks when notes missing)
registerCondition('notes_empty', async (ctx, _params) => {
  const hasNotes = ctx.notes != null && ctx.notes.trim().length > 0
  return {
    passed: hasNotes,
    vars: {},
  }
})

// ─── commit_message_matches ──────────────────────────────────────────────────
registerCondition('commit_message_matches', async (ctx, params) => {
  const pattern = params.pattern as string
  const msg = ctx.commitMessage || ''
  if (!msg) return { passed: true, vars: {} as Record<string, string> }
  const regex = new RegExp(pattern)
  return {
    passed: regex.test(msg),
    vars: { pattern, message: msg } as Record<string, string>,
  }
})

// ─── no_files_matching ───────────────────────────────────────────────────────
// Returns passed=false when files DO match (blocks restricted files)
registerCondition('no_files_matching', async (ctx, params) => {
  const patterns = (params.patterns as string[]) || []
  const files = ctx.changedFiles || []
  const matched = files.filter(f =>
    patterns.some(pattern => matchesGlob(f, pattern) || f === pattern)
  )
  return {
    passed: matched.length === 0,
    vars: { matched_files: matched.join(', ') },
  }
})

// ─── files_coupled ───────────────────────────────────────────────────────────
// If files match if_changed, must also match must_also_change
registerCondition('files_coupled', async (ctx, params) => {
  const ifChanged = params.if_changed as string
  const mustAlso = params.must_also_change as string
  const files = ctx.changedFiles || []

  const hasSource = files.some(f => matchesGlob(f, ifChanged))
  if (!hasSource) return { passed: true, vars: {} as Record<string, string> }

  const hasRequired = files.some(f => matchesGlob(f, mustAlso))
  return {
    passed: hasRequired,
    vars: { if_changed: ifChanged, must_also_change: mustAlso } as Record<string, string>,
  }
})

// ─── script_passes ───────────────────────────────────────────────────────────
registerCondition('script_passes', async (ctx, params) => {
  const command = params.command as string
  const result = await runCommand(
    { name: 'policy-script', command, required: true, capture_output: true },
    ctx.repoPath,
    true // quiet
  )
  return {
    passed: result.passed,
    vars: {
      command,
      exit_code: String(result.exit_code),
      output: (result.stdout || result.stderr || '').trim(),
    },
  }
})

// ─── all_of ──────────────────────────────────────────────────────────────────
// Composite: all params.conditions must pass
registerCondition('all_of', async (ctx, params) => {
  const conditions = (params.conditions as Array<{ condition: string; params?: Record<string, unknown> }>) || []
  const allVars: Record<string, string> = {}

  for (const sub of conditions) {
    const fn = getCondition(sub.condition)
    if (!fn) {
      return { passed: false, vars: { error: `Unknown condition: ${sub.condition}` } }
    }
    const result = await fn(ctx, sub.params || {})
    Object.assign(allVars, result.vars)
    if (!result.passed) {
      return { passed: false, vars: allVars }
    }
  }

  return { passed: true, vars: allVars }
})

// ─── any_of ──────────────────────────────────────────────────────────────────
// Composite: at least one params.conditions must pass
registerCondition('any_of', async (ctx, params) => {
  const conditions = (params.conditions as Array<{ condition: string; params?: Record<string, unknown> }>) || []
  const allVars: Record<string, string> = {}

  for (const sub of conditions) {
    const fn = getCondition(sub.condition)
    if (!fn) continue
    const result = await fn(ctx, sub.params || {})
    Object.assign(allVars, result.vars)
    if (result.passed) {
      return { passed: true, vars: allVars }
    }
  }

  return { passed: false, vars: allVars }
})
