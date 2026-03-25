import type { CallerType } from '../types.js'

/**
 * Detect whether the current caller is a human or an AI agent.
 * Checks known environment variables set by AI coding tools.
 */
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

// ─── Legacy re-exports (deprecated — use evaluatePolicies instead) ───────────
// These are kept temporarily for any code that hasn't migrated yet.
// They will be removed in a future version.

export { evaluatePolicies } from './policy.js'
