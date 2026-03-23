import { describe, it, expect } from 'vitest'
import { toSlug, buildBranchName, isWorkItemId } from '../src/core/workitem.js'
import type { BabelConfig } from '../src/types.js'

const baseConfig: BabelConfig = {
  version: 1,
  base_branch: 'main',
  protected_branches: ['main'],
  branch_pattern: 'feature/{id}-{slug}',
  work_item_id: { source: 'local', prefix: 'WI' },
  require_checkpoint_for: { pause: false, ship: true },
  sync_strategy: 'rebase',
  agents: { permitted_branch_patterns: ['feature/*'], require_attestation_before_pause: true },
  require_confirmation: [],
  verdicts: { keep: 'keep', refine: 'refine', reject: 'reject', ship: 'ship' },
}

describe('workitem: toSlug', () => {
  it('converts description to slug', () => {
    expect(toSlug('Fix login timeout for mobile users')).toBe('fix-login-timeout-for-mobile-users')
  })

  it('removes special characters', () => {
    expect(toSlug('Fix bug: auth! (v2)')).toBe('fix-bug-auth-v2')
  })

  it('truncates to 40 chars', () => {
    const long = 'a'.repeat(50)
    expect(toSlug(long).length).toBeLessThanOrEqual(40)
  })

  it('handles extra whitespace', () => {
    expect(toSlug('  fix   bug  ')).toBe('fix-bug')
  })
})

describe('workitem: buildBranchName', () => {
  it('builds branch name from ID and description', () => {
    const name = buildBranchName('WI-001', 'fix login timeout', baseConfig)
    expect(name).toBe('feature/WI-001-fix-login-timeout')
  })
})

describe('workitem: isWorkItemId', () => {
  it('identifies valid work item IDs', () => {
    expect(isWorkItemId('WI-001')).toBe(true)
    expect(isWorkItemId('PROJ-123')).toBe(true)
    expect(isWorkItemId('ABC-999')).toBe(true)
  })

  it('rejects non-ID strings', () => {
    expect(isWorkItemId('fix login timeout')).toBe(false)
    expect(isWorkItemId('wi-001')).toBe(false)
    expect(isWorkItemId('WI001')).toBe(false)
  })
})
