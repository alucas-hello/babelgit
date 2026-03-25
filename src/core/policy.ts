import type { PolicyContext, PolicyDef, PolicyResult, EnforcementLevel } from '../types.js'
import { getCondition } from './policy-conditions.js'

/**
 * Evaluate all policies that match the given trigger and context.
 * Returns a PolicyResult for each matching policy.
 */
export async function evaluatePolicies(
  trigger: string,
  ctx: PolicyContext
): Promise<PolicyResult[]> {
  const policies = ctx.config.policies || []
  const results: PolicyResult[] = []

  for (const policy of policies) {
    if (!policyApplies(policy, trigger, ctx)) continue

    const conditionFn = getCondition(policy.condition)
    if (!conditionFn) {
      // Unknown condition — treat as failed for safety
      results.push({
        policy: policy.name,
        permitted: false,
        blocking: true,
        reason: `Unknown policy condition: ${policy.condition}`,
      })
      continue
    }

    const { passed, vars } = await conditionFn(ctx, policy.params || {})
    const enforcement: EnforcementLevel = policy.enforcement || 'hard'
    const blocking = computeBlocking(enforcement, ctx.caller, passed)

    results.push({
      policy: policy.name,
      permitted: passed,
      blocking,
      reason: passed ? undefined : interpolate(policy.deny, vars),
      suggestion: passed ? undefined : (policy.suggest ? interpolate(policy.suggest, vars) : undefined),
    })
  }

  return results
}

/**
 * Check whether a policy definition applies to this trigger + context.
 */
function policyApplies(policy: PolicyDef, trigger: string, ctx: PolicyContext): boolean {
  // Must be enabled
  if (policy.enabled === false) return false

  // Must match trigger
  if (!policy.on.includes(trigger)) return false

  // Check when.caller filter
  if (policy.when?.caller && policy.when.caller !== ctx.caller) return false

  // Check when.stage filter
  if (policy.when?.stage) {
    const stages = Array.isArray(policy.when.stage) ? policy.when.stage : [policy.when.stage]
    const currentStage = ctx.workItem?.stage
    if (currentStage && !stages.includes(currentStage)) return false
  }

  return true
}

/**
 * Determine whether a failed policy is blocking based on enforcement level and caller.
 */
function computeBlocking(enforcement: EnforcementLevel, caller: string, passed: boolean): boolean {
  if (passed) return false
  switch (enforcement) {
    case 'hard':
      return true
    case 'soft':
      // Soft blocks agents always but humans can override
      return caller === 'agent'
    case 'advisory':
      return false
    default:
      return true
  }
}

/**
 * Interpolate {var} placeholders in a template string with vars from condition evaluation.
 */
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return vars[key] !== undefined ? vars[key] : match
  })
}
