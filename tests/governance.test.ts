import { describe, it, expect } from 'vitest'
import { checkBranchProtection, checkAgentBranchPermission, detectCallerType } from '../src/core/governance.js'
import type { BabelConfig } from '../src/types.js'

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
}

describe('governance: branch protection', () => {
  it('blocks operations on protected branches', () => {
    const result = checkBranchProtection('main', baseConfig, 'human')
    expect(result.permitted).toBe(false)
    expect(result.reason).toContain('protected')
  })

  it('allows operations on non-protected branches', () => {
    const result = checkBranchProtection('feature/WI-001-test', baseConfig, 'human')
    expect(result.permitted).toBe(true)
  })

  it('blocks operations on production branch', () => {
    const result = checkBranchProtection('production', baseConfig, 'human')
    expect(result.permitted).toBe(false)
  })
})

describe('governance: agent branch permissions', () => {
  it('allows agents on permitted patterns', () => {
    const result = checkAgentBranchPermission('feature/WI-001-test', baseConfig, 'agent')
    expect(result.permitted).toBe(true)
  })

  it('blocks agents on non-permitted branches', () => {
    const result = checkAgentBranchPermission('experiment/test', baseConfig, 'agent')
    expect(result.permitted).toBe(false)
    expect(result.reason).toContain('not permitted')
  })

  it('allows humans on any branch', () => {
    const result = checkAgentBranchPermission('experiment/test', baseConfig, 'human')
    expect(result.permitted).toBe(true)
  })

  it('allows agents on fix/* branches', () => {
    const result = checkAgentBranchPermission('fix/WI-002-bug', baseConfig, 'agent')
    expect(result.permitted).toBe(true)
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
