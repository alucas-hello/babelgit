import { describe, it, expect } from 'vitest'

// ─── Local mock types (mirrors the PaC plan interfaces) ─────────────────────
// These are defined locally so the tests compile before Phase 1 is merged.

interface PolicyDef {
  name: string
  on: string[]
  when?: { caller?: string }
  condition: string
  params?: Record<string, unknown>
  enforcement?: 'hard' | 'soft' | 'advisory'
  deny: string
  suggest?: string
  enabled?: boolean
}

interface PolicyContext {
  trigger: string
  caller: string
  branch: string
  config: any
  repoPath: string
  workItem?: any
  workItems?: Record<string, any>
  commitMessage?: string
  changedFiles?: string[]
  checkpoints?: any[]
  runSession?: any
  notes?: string
}

interface PolicyResult {
  policy: string
  permitted: boolean
  blocking: boolean
  reason?: string
  suggestion?: string
}

// ─── Minimal policy engine implementation for testing ────────────────────────
// This mirrors what Phase 1 will provide. Once merged, these tests should
// import from the real module and this local implementation can be removed.

type ConditionFn = (
  ctx: PolicyContext,
  params: Record<string, unknown>,
) => Promise<{ passed: boolean; vars: Record<string, string> }>

const conditionRegistry: Record<string, ConditionFn> = {
  // branch_is_protected: condition passes (safe) when branch is NOT protected.
  // When the branch IS protected, condition fails and the deny message fires.
  branch_is_protected: async (ctx) => {
    const protectedBranches: string[] = ctx.config?.protected_branches ?? []
    const isProtected = protectedBranches.includes(ctx.branch)
    return { passed: !isProtected, vars: { branch: ctx.branch } }
  },

  // has_checkpoint: checks if any checkpoint exists with optional verdict filter
  has_checkpoint: async (ctx, params) => {
    const checkpoints = ctx.checkpoints ?? []
    const verdictFilter = params.verdict as string[] | undefined
    let matching = checkpoints
    if (verdictFilter?.length) {
      matching = matching.filter((c: any) => verdictFilter.includes(c.verdict))
    }
    return {
      passed: matching.length > 0,
      vars: { count: String(matching.length) },
    }
  },

  // branch_matches_pattern: checks if branch matches permitted patterns
  branch_matches_pattern: async (ctx, params) => {
    const patterns = params.patterns as string[] ?? []
    const matches = patterns.some(p => {
      if (p === ctx.branch) return true
      if (p.endsWith('/*') && ctx.branch.startsWith(p.slice(0, -2) + '/')) return true
      if (p === '*') return true
      return false
    })
    return { passed: matches, vars: { branch: ctx.branch } }
  },

  // caller_is_agent: true if the caller is an agent
  caller_is_agent: async (ctx) => {
    return { passed: ctx.caller === 'agent', vars: { caller: ctx.caller } }
  },

  // always_true / always_false for testing
  always_true: async () => ({ passed: true, vars: {} }),
  always_false: async () => ({ passed: false, vars: {} }),
}

function interpolateMessage(template: string, vars: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
  }
  return result
}

async function evaluatePolicy(
  policy: PolicyDef,
  ctx: PolicyContext,
): Promise<PolicyResult> {
  const conditionFn = conditionRegistry[policy.condition]
  if (!conditionFn) {
    return {
      policy: policy.name,
      permitted: true,
      blocking: false,
      reason: `Unknown condition: ${policy.condition}`,
    }
  }

  const { passed, vars } = await conditionFn(ctx, policy.params ?? {})
  const enforcement = policy.enforcement ?? 'hard'
  const blocking = !passed && enforcement !== 'advisory'

  return {
    policy: policy.name,
    permitted: passed,
    blocking,
    reason: passed ? undefined : interpolateMessage(policy.deny, vars),
    suggestion: !passed && policy.suggest ? interpolateMessage(policy.suggest, vars) : undefined,
  }
}

async function evaluatePolicies(
  policies: PolicyDef[],
  ctx: PolicyContext,
): Promise<PolicyResult[]> {
  const applicable = policies.filter(p => {
    // Skip disabled policies
    if (p.enabled === false) return false
    // Filter by trigger
    if (!p.on.includes(ctx.trigger)) return false
    // Filter by caller (when clause)
    if (p.when?.caller && p.when.caller !== ctx.caller) return false
    return true
  })

  return Promise.all(applicable.map(p => evaluatePolicy(p, ctx)))
}

// ─── Tests ──────────────────────────────────────────────────────────────────

const baseConfig = {
  version: 1,
  base_branch: 'main',
  protected_branches: ['main', 'production'],
  branch_pattern: 'feature/{id}-{slug}',
  agents: {
    permitted_branch_patterns: ['feature/*', 'fix/*'],
    require_attestation_before_pause: true,
  },
  require_checkpoint_for: { pause: false, ship: true },
}

describe('policy engine: trigger filtering', () => {
  const policy: PolicyDef = {
    name: 'test-trigger',
    on: ['save', 'ship'],
    condition: 'always_false',
    deny: 'blocked',
  }

  it('applies policy when trigger matches', async () => {
    const ctx: PolicyContext = {
      trigger: 'save',
      caller: 'human',
      branch: 'feature/WI-001-test',
      config: baseConfig,
      repoPath: '/tmp',
    }
    const results = await evaluatePolicies([policy], ctx)
    expect(results).toHaveLength(1)
    expect(results[0].permitted).toBe(false)
  })

  it('skips policy when trigger does not match', async () => {
    const ctx: PolicyContext = {
      trigger: 'run',
      caller: 'human',
      branch: 'feature/WI-001-test',
      config: baseConfig,
      repoPath: '/tmp',
    }
    const results = await evaluatePolicies([policy], ctx)
    expect(results).toHaveLength(0)
  })
})

describe('policy engine: caller filtering (when clause)', () => {
  const agentOnlyPolicy: PolicyDef = {
    name: 'agent-only',
    on: ['save'],
    when: { caller: 'agent' },
    condition: 'always_false',
    deny: 'agents blocked',
  }

  it('applies when caller matches', async () => {
    const ctx: PolicyContext = {
      trigger: 'save',
      caller: 'agent',
      branch: 'feature/WI-001-test',
      config: baseConfig,
      repoPath: '/tmp',
    }
    const results = await evaluatePolicies([agentOnlyPolicy], ctx)
    expect(results).toHaveLength(1)
  })

  it('skips when caller does not match', async () => {
    const ctx: PolicyContext = {
      trigger: 'save',
      caller: 'human',
      branch: 'feature/WI-001-test',
      config: baseConfig,
      repoPath: '/tmp',
    }
    const results = await evaluatePolicies([agentOnlyPolicy], ctx)
    expect(results).toHaveLength(0)
  })
})

describe('policy engine: enabled flag', () => {
  it('skips disabled policies', async () => {
    const policy: PolicyDef = {
      name: 'disabled-one',
      on: ['save'],
      condition: 'always_false',
      deny: 'should not fire',
      enabled: false,
    }
    const ctx: PolicyContext = {
      trigger: 'save',
      caller: 'human',
      branch: 'feature/WI-001-test',
      config: baseConfig,
      repoPath: '/tmp',
    }
    const results = await evaluatePolicies([policy], ctx)
    expect(results).toHaveLength(0)
  })

  it('includes policies with enabled: true', async () => {
    const policy: PolicyDef = {
      name: 'enabled-one',
      on: ['save'],
      condition: 'always_true',
      deny: 'should not fire',
      enabled: true,
    }
    const ctx: PolicyContext = {
      trigger: 'save',
      caller: 'human',
      branch: 'feature/WI-001-test',
      config: baseConfig,
      repoPath: '/tmp',
    }
    const results = await evaluatePolicies([policy], ctx)
    expect(results).toHaveLength(1)
    expect(results[0].permitted).toBe(true)
  })

  it('includes policies with no enabled field (default true)', async () => {
    const policy: PolicyDef = {
      name: 'default-enabled',
      on: ['save'],
      condition: 'always_true',
      deny: 'n/a',
    }
    const ctx: PolicyContext = {
      trigger: 'save',
      caller: 'human',
      branch: 'feature/WI-001-test',
      config: baseConfig,
      repoPath: '/tmp',
    }
    const results = await evaluatePolicies([policy], ctx)
    expect(results).toHaveLength(1)
  })
})

describe('policy engine: enforcement levels', () => {
  it('hard enforcement blocks when condition fails', async () => {
    const policy: PolicyDef = {
      name: 'hard-block',
      on: ['ship'],
      condition: 'always_false',
      enforcement: 'hard',
      deny: 'hard blocked',
    }
    const ctx: PolicyContext = {
      trigger: 'ship',
      caller: 'human',
      branch: 'feature/WI-001-test',
      config: baseConfig,
      repoPath: '/tmp',
    }
    const results = await evaluatePolicies([policy], ctx)
    expect(results[0].blocking).toBe(true)
    expect(results[0].permitted).toBe(false)
  })

  it('soft enforcement blocks when condition fails', async () => {
    const policy: PolicyDef = {
      name: 'soft-block',
      on: ['ship'],
      condition: 'always_false',
      enforcement: 'soft',
      deny: 'soft blocked',
    }
    const ctx: PolicyContext = {
      trigger: 'ship',
      caller: 'human',
      branch: 'feature/WI-001-test',
      config: baseConfig,
      repoPath: '/tmp',
    }
    const results = await evaluatePolicies([policy], ctx)
    expect(results[0].blocking).toBe(true)
    expect(results[0].permitted).toBe(false)
  })

  it('advisory never blocks even when condition fails', async () => {
    const policy: PolicyDef = {
      name: 'advisory-warn',
      on: ['ship'],
      condition: 'always_false',
      enforcement: 'advisory',
      deny: 'just a warning',
    }
    const ctx: PolicyContext = {
      trigger: 'ship',
      caller: 'human',
      branch: 'feature/WI-001-test',
      config: baseConfig,
      repoPath: '/tmp',
    }
    const results = await evaluatePolicies([policy], ctx)
    expect(results[0].blocking).toBe(false)
    expect(results[0].permitted).toBe(false)
    expect(results[0].reason).toBe('just a warning')
  })

  it('default enforcement is hard', async () => {
    const policy: PolicyDef = {
      name: 'default-hard',
      on: ['ship'],
      condition: 'always_false',
      deny: 'default blocks',
    }
    const ctx: PolicyContext = {
      trigger: 'ship',
      caller: 'human',
      branch: 'feature/WI-001-test',
      config: baseConfig,
      repoPath: '/tmp',
    }
    const results = await evaluatePolicies([policy], ctx)
    expect(results[0].blocking).toBe(true)
  })
})

describe('policy engine: message interpolation', () => {
  it('interpolates vars into deny message', async () => {
    const policy: PolicyDef = {
      name: 'interp-test',
      on: ['save'],
      condition: 'branch_is_protected',
      deny: 'Cannot operate on {branch}.',
      suggest: 'Use a feature branch instead of {branch}.',
    }
    const ctx: PolicyContext = {
      trigger: 'save',
      caller: 'human',
      branch: 'main',
      config: baseConfig,
      repoPath: '/tmp',
    }
    const results = await evaluatePolicies([policy], ctx)
    expect(results[0].reason).toBe('Cannot operate on main.')
    expect(results[0].suggestion).toBe('Use a feature branch instead of main.')
  })

  it('leaves message unchanged when no vars match', async () => {
    const policy: PolicyDef = {
      name: 'no-vars',
      on: ['save'],
      condition: 'always_false',
      deny: 'Static message, no placeholders.',
    }
    const ctx: PolicyContext = {
      trigger: 'save',
      caller: 'human',
      branch: 'feature/test',
      config: baseConfig,
      repoPath: '/tmp',
    }
    const results = await evaluatePolicies([policy], ctx)
    expect(results[0].reason).toBe('Static message, no placeholders.')
  })
})

describe('policy engine: synthesized v1 config policies', () => {
  it('protected_branches: branch_is_protected blocks commits to main', async () => {
    const policy: PolicyDef = {
      name: 'branch-protection',
      on: ['save', 'start'],
      condition: 'branch_is_protected',
      deny: 'Branch {branch} is protected.',
      suggest: 'Use babel ship to merge into {branch}.',
    }
    const ctx: PolicyContext = {
      trigger: 'save',
      caller: 'human',
      branch: 'main',
      config: baseConfig,
      repoPath: '/tmp',
    }
    const results = await evaluatePolicies([policy], ctx)
    expect(results).toHaveLength(1)
    expect(results[0].permitted).toBe(false)
    expect(results[0].blocking).toBe(true)
    expect(results[0].reason).toContain('main')
  })

  it('require_checkpoint_for.ship: blocks ship without checkpoint', async () => {
    const policy: PolicyDef = {
      name: 'require-checkpoint-for-ship',
      on: ['ship'],
      condition: 'has_checkpoint',
      params: { verdict: ['keep', 'ship'] },
      deny: 'A verified checkpoint is required before shipping.',
      suggest: "Run 'babel run' and call a verdict first.",
    }
    const ctx: PolicyContext = {
      trigger: 'ship',
      caller: 'human',
      branch: 'feature/WI-001-test',
      config: baseConfig,
      repoPath: '/tmp',
      checkpoints: [],
    }
    const results = await evaluatePolicies([policy], ctx)
    expect(results[0].permitted).toBe(false)
    expect(results[0].blocking).toBe(true)
  })

  it('require_checkpoint_for.ship: allows ship with checkpoint', async () => {
    const policy: PolicyDef = {
      name: 'require-checkpoint-for-ship',
      on: ['ship'],
      condition: 'has_checkpoint',
      params: { verdict: ['keep', 'ship'] },
      deny: 'A verified checkpoint is required before shipping.',
    }
    const ctx: PolicyContext = {
      trigger: 'ship',
      caller: 'human',
      branch: 'feature/WI-001-test',
      config: baseConfig,
      repoPath: '/tmp',
      checkpoints: [
        {
          id: 'WI-001-keep-1',
          work_item_id: 'WI-001',
          verdict: 'keep',
          notes: 'looks good',
          called_at: new Date().toISOString(),
          called_by: 'user@example.com',
          caller_type: 'human',
          git_commit: 'abc123',
          git_branch: 'feature/WI-001-test',
          filesystem_hash: 'deadbeef',
          is_recovery_anchor: true,
        },
      ],
    }
    const results = await evaluatePolicies([policy], ctx)
    expect(results[0].permitted).toBe(true)
  })

  it('agents.permitted_branch_patterns: blocks agent on wrong branch', async () => {
    const policy: PolicyDef = {
      name: 'agent-branch-restriction',
      on: ['save', 'start', 'run', 'ship'],
      when: { caller: 'agent' },
      condition: 'branch_matches_pattern',
      params: { patterns: ['feature/*', 'fix/*'] },
      deny: 'Agents are not permitted on branch {branch}.',
    }
    const ctx: PolicyContext = {
      trigger: 'save',
      caller: 'agent',
      branch: 'experiment/test',
      config: baseConfig,
      repoPath: '/tmp',
    }
    const results = await evaluatePolicies([policy], ctx)
    expect(results[0].permitted).toBe(false)
    expect(results[0].blocking).toBe(true)
    expect(results[0].reason).toContain('experiment/test')
  })

  it('agents.permitted_branch_patterns: allows agent on feature branch', async () => {
    const policy: PolicyDef = {
      name: 'agent-branch-restriction',
      on: ['save'],
      when: { caller: 'agent' },
      condition: 'branch_matches_pattern',
      params: { patterns: ['feature/*', 'fix/*'] },
      deny: 'Agents are not permitted on branch {branch}.',
    }
    const ctx: PolicyContext = {
      trigger: 'save',
      caller: 'agent',
      branch: 'feature/WI-001-test',
      config: baseConfig,
      repoPath: '/tmp',
    }
    const results = await evaluatePolicies([policy], ctx)
    expect(results[0].permitted).toBe(true)
  })

  it('agents.require_attestation_before_pause: blocks agent pause without checkpoint', async () => {
    // Synthesized as: on pause, if caller=agent and no checkpoints, block
    const policy: PolicyDef = {
      name: 'agent-attest-before-pause',
      on: ['pause'],
      when: { caller: 'agent' },
      condition: 'has_checkpoint',
      deny: 'Agents must attest work before pausing.',
      suggest: "Run 'babel run' then call a verdict first.",
    }
    const ctx: PolicyContext = {
      trigger: 'pause',
      caller: 'agent',
      branch: 'feature/WI-001-test',
      config: baseConfig,
      repoPath: '/tmp',
      checkpoints: [],
    }
    const results = await evaluatePolicies([policy], ctx)
    expect(results[0].permitted).toBe(false)
    expect(results[0].blocking).toBe(true)
  })
})
