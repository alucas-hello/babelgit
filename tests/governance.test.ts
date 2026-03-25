import { describe, it, expect } from 'vitest'
import { detectCallerType } from '../src/core/governance.js'
import { evaluatePolicies } from '../src/core/policy.js'
// Import to ensure conditions are registered
import '../src/core/policy-conditions.js'
import type { BabelConfig, PolicyContext } from '../src/types.js'

const baseConfig: BabelConfig = {
  version: 1,
  base_branch: 'main',
  protected_branches: ['main', 'production'],
  branch_pattern: 'feature/{id}-{slug}',
  work_item_id: { source: 'local', prefix: 'WI' },
  require_checkpoint_for: { pause: false, ship: true },
  sync_strategy: 'rebase',
  agents: {
    permitted_branch_patterns: ['feature/*', 'fix/*'],
    require_attestation_before_pause: true,
  },
  require_confirmation: ['stop', 'ship'],
  verdicts: { keep: 'keep', refine: 'refine', reject: 'reject', ship: 'ship' },
  policies: [
    {
      name: 'branch-protection',
      on: ['start', 'save', 'sync', 'pause', 'continue', 'stop', 'run', 'keep', 'refine', 'reject', 'ship_verdict', 'ship'],
      condition: 'branch_is_protected',
      deny: "Branch '{branch}' is protected and cannot be modified directly.",
      suggest: "Use 'babel ship' to merge your work into the protected branch through the proper workflow.",
    },
    {
      name: 'agent-branch-restriction',
      on: ['start'],
      when: { caller: 'agent' },
      condition: 'branch_not_matching',
      params: { patterns: ['feature/*', 'fix/*'] },
      deny: "Agents are not permitted to operate on branch '{branch}'.",
      suggest: "Permitted branch patterns: {patterns}. Create a new work item with 'babel_start()'.",
    },
  ],
}

function makeCtx(overrides: Partial<PolicyContext>): PolicyContext {
  return {
    trigger: 'save',
    caller: 'human',
    branch: 'feature/WI-001-test',
    config: baseConfig,
    repoPath: process.cwd(),
    ...overrides,
  }
}

describe('governance: branch protection', () => {
  it('blocks operations on protected branches', async () => {
    const results = await evaluatePolicies('save', makeCtx({ branch: 'main' }))
    const bp = results.find(r => r.policy === 'branch-protection')
    expect(bp).toBeDefined()
    expect(bp!.permitted).toBe(false)
    expect(bp!.reason).toContain('protected')
  })

  it('allows operations on non-protected branches', async () => {
    const results = await evaluatePolicies('save', makeCtx({ branch: 'feature/WI-001-test' }))
    const bp = results.find(r => r.policy === 'branch-protection')
    expect(bp).toBeDefined()
    expect(bp!.permitted).toBe(true)
  })

  it('blocks operations on production branch', async () => {
    const results = await evaluatePolicies('save', makeCtx({ branch: 'production' }))
    const bp = results.find(r => r.policy === 'branch-protection')
    expect(bp).toBeDefined()
    expect(bp!.permitted).toBe(false)
  })
})

describe('governance: agent branch permissions', () => {
  it('allows agents on permitted patterns', async () => {
    const results = await evaluatePolicies('start', makeCtx({ caller: 'agent', branch: 'feature/WI-001-test' }))
    const abr = results.find(r => r.policy === 'agent-branch-restriction')
    expect(abr).toBeDefined()
    expect(abr!.permitted).toBe(true)
  })

  it('blocks agents on non-permitted branches', async () => {
    const results = await evaluatePolicies('start', makeCtx({ caller: 'agent', branch: 'experiment/test' }))
    const abr = results.find(r => r.policy === 'agent-branch-restriction')
    expect(abr).toBeDefined()
    expect(abr!.permitted).toBe(false)
    expect(abr!.reason).toContain('not permitted')
  })

  it('allows humans on any branch', async () => {
    const results = await evaluatePolicies('start', makeCtx({ caller: 'human', branch: 'experiment/test' }))
    const abr = results.find(r => r.policy === 'agent-branch-restriction')
    // Policy has when: caller: 'agent', so it doesn't apply to humans
    expect(abr).toBeUndefined()
  })

  it('allows agents on fix/* branches', async () => {
    const results = await evaluatePolicies('start', makeCtx({ caller: 'agent', branch: 'fix/WI-002-bug' }))
    const abr = results.find(r => r.policy === 'agent-branch-restriction')
    expect(abr).toBeDefined()
    expect(abr!.permitted).toBe(true)
  })
})

describe('governance: caller detection', () => {
  it('detects human context by default', () => {
    delete process.env.CLAUDE_CODE
    delete process.env.CURSOR_AGENT
    delete process.env.BABELGIT_AGENT
    delete process.env.CI
    const caller = detectCallerType()
    expect(caller).toBe('human')
  })

  it('detects agent when BABELGIT_AGENT is set', () => {
    process.env.BABELGIT_AGENT = 'true'
    const caller = detectCallerType()
    expect(caller).toBe('agent')
    delete process.env.BABELGIT_AGENT
  })

  it('detects agent when CI is set', () => {
    process.env.CI = 'true'
    const caller = detectCallerType()
    expect(caller).toBe('agent')
    delete process.env.CI
  })
})
