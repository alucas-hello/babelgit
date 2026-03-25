import { describe, it, expect } from 'vitest'
import { evaluatePolicies } from '../src/core/policy.js'
import { showPolicyViolations } from '../src/cli/display.js'
// Import to ensure conditions are registered
import '../src/core/policy-conditions.js'
import type { BabelConfig, PolicyContext, PolicyDef } from '../src/types.js'

const baseConfig: BabelConfig = {
  version: 1,
  base_branch: 'main',
  protected_branches: ['main'],
  branch_pattern: 'feature/{id}-{slug}',
  work_item_id: { source: 'local', prefix: 'WI' },
  require_checkpoint_for: { pause: false, ship: true },
  sync_strategy: 'rebase',
  agents: { permitted_branch_patterns: ['feature/*'], require_attestation_before_pause: false },
  require_confirmation: [],
  verdicts: { keep: 'keep', refine: 'refine', reject: 'reject', ship: 'ship' },
  rules: [],
  policies: [],
}

function makeCtx(config: BabelConfig, overrides: Partial<PolicyContext>): PolicyContext {
  return {
    trigger: 'save',
    caller: 'human',
    branch: 'feature/WI-001-test',
    config,
    repoPath: process.cwd(),
    ...overrides,
  }
}

describe('rules: commit_message_pattern', () => {
  it('passes when commit message matches pattern', async () => {
    const config: BabelConfig = {
      ...baseConfig,
      policies: [
        {
          name: 'conventional commits',
          on: ['save'],
          condition: 'commit_message_matches',
          params: { pattern: '^(feat|fix)\\(.+\\):' },
          deny: 'Commit message does not match required pattern.',
        },
      ],
    }
    const results = await evaluatePolicies('save', makeCtx(config, {
      commitMessage: 'feat(auth): add login',
    }))
    const blocking = results.filter(r => !r.permitted && r.blocking)
    expect(blocking).toHaveLength(0)
  })

  it('fails when commit message does not match', async () => {
    const config: BabelConfig = {
      ...baseConfig,
      policies: [
        {
          name: 'conventional commits',
          on: ['save'],
          condition: 'commit_message_matches',
          params: { pattern: '^(feat|fix)\\(.+\\):' },
          deny: 'Commit message does not match.',
        },
      ],
    }
    const results = await evaluatePolicies('save', makeCtx(config, {
      commitMessage: 'just a commit message',
    }))
    const failed = results.filter(r => !r.permitted)
    expect(failed).toHaveLength(1)
    expect(failed[0].policy).toBe('conventional commits')
    expect(failed[0].blocking).toBe(true)
  })

  it('only applies to configured operations', async () => {
    const config: BabelConfig = {
      ...baseConfig,
      policies: [
        {
          name: 'msg',
          on: ['save'],
          condition: 'commit_message_matches',
          params: { pattern: '^feat' },
          deny: 'Bad message.',
        },
      ],
    }
    // ship is not in on — should not evaluate
    const results = await evaluatePolicies('ship', makeCtx(config, {
      trigger: 'ship',
      commitMessage: 'bad message',
    }))
    expect(results.filter(r => r.policy === 'msg')).toHaveLength(0)
  })
})

describe('rules: path_restriction', () => {
  it('blocks agents from restricted paths', async () => {
    const config: BabelConfig = {
      ...baseConfig,
      policies: [
        {
          name: 'no config edits',
          on: ['save'],
          when: { caller: 'agent' },
          condition: 'no_files_matching',
          params: { patterns: ['package.json', '*.config.*'] },
          deny: 'Not permitted to modify restricted files: {matched_files}',
        },
      ],
    }
    const results = await evaluatePolicies('save', makeCtx(config, {
      caller: 'agent',
      changedFiles: ['src/index.ts', 'package.json'],
    }))
    const failed = results.filter(r => !r.permitted)
    expect(failed).toHaveLength(1)
    expect(failed[0].policy).toBe('no config edits')
  })

  it('does not block humans on restricted paths', async () => {
    const config: BabelConfig = {
      ...baseConfig,
      policies: [
        {
          name: 'no config edits',
          on: ['save'],
          when: { caller: 'agent' },
          condition: 'no_files_matching',
          params: { patterns: ['package.json'] },
          deny: 'Not permitted.',
        },
      ],
    }
    const results = await evaluatePolicies('save', makeCtx(config, {
      caller: 'human',
      changedFiles: ['package.json'],
    }))
    // Policy has when: caller: agent, so doesn't apply to humans
    expect(results.filter(r => r.policy === 'no config edits')).toHaveLength(0)
  })

  it('passes when no restricted files changed', async () => {
    const config: BabelConfig = {
      ...baseConfig,
      policies: [
        {
          name: 'no config edits',
          on: ['save'],
          condition: 'no_files_matching',
          params: { patterns: ['package.json'] },
          deny: 'Not permitted.',
        },
      ],
    }
    const results = await evaluatePolicies('save', makeCtx(config, {
      caller: 'agent',
      changedFiles: ['src/index.ts'],
    }))
    const failed = results.filter(r => !r.permitted)
    expect(failed).toHaveLength(0)
  })
})

describe('rules: files_changed', () => {
  it('passes when required companion file is changed', async () => {
    const config: BabelConfig = {
      ...baseConfig,
      policies: [
        {
          name: 'require tests',
          on: ['keep'],
          condition: 'files_coupled',
          params: { if_changed: 'src/**/*.ts', must_also_change: 'tests/**/*.test.ts' },
          deny: 'Must also change test files.',
        },
      ],
    }
    const results = await evaluatePolicies('keep', makeCtx(config, {
      trigger: 'keep',
      changedFiles: ['src/index.ts', 'tests/index.test.ts'],
    }))
    const failed = results.filter(r => !r.permitted)
    expect(failed).toHaveLength(0)
  })

  it('fails when trigger file changed but companion missing', async () => {
    const config: BabelConfig = {
      ...baseConfig,
      policies: [
        {
          name: 'require tests',
          on: ['keep'],
          condition: 'files_coupled',
          params: { if_changed: 'src/**/*.ts', must_also_change: 'tests/**/*.test.ts' },
          deny: 'Must also change test files.',
        },
      ],
    }
    const results = await evaluatePolicies('keep', makeCtx(config, {
      trigger: 'keep',
      changedFiles: ['src/index.ts'],
    }))
    expect(results.filter(r => !r.permitted)).toHaveLength(1)
  })

  it('does not trigger when trigger file not changed', async () => {
    const config: BabelConfig = {
      ...baseConfig,
      policies: [
        {
          name: 'require tests',
          on: ['keep'],
          condition: 'files_coupled',
          params: { if_changed: 'src/**/*.ts', must_also_change: 'tests/**/*.test.ts' },
          deny: 'Must also change test files.',
        },
      ],
    }
    const results = await evaluatePolicies('keep', makeCtx(config, {
      trigger: 'keep',
      changedFiles: ['docs/readme.md'],
    }))
    const failed = results.filter(r => !r.permitted)
    expect(failed).toHaveLength(0)
  })
})

describe('rules: script', () => {
  it('passes when script exits 0', async () => {
    const config: BabelConfig = {
      ...baseConfig,
      policies: [
        {
          name: 'check',
          on: ['keep'],
          condition: 'script_passes',
          params: { command: 'echo ok' },
          deny: 'Script failed.',
        },
      ],
    }
    const results = await evaluatePolicies('keep', makeCtx(config, { trigger: 'keep' }))
    expect(results.filter(r => !r.permitted)).toHaveLength(0)
  })

  it('fails when script exits non-zero', async () => {
    const config: BabelConfig = {
      ...baseConfig,
      policies: [
        {
          name: 'failing-check',
          on: ['keep'],
          condition: 'script_passes',
          params: { command: 'false' },
          deny: 'Script failed.',
        },
      ],
    }
    const results = await evaluatePolicies('keep', makeCtx(config, { trigger: 'keep' }))
    const failed = results.filter(r => !r.permitted)
    expect(failed).toHaveLength(1)
    expect(failed[0].policy).toBe('failing-check')
  })
})

describe('rules: formatViolations (showPolicyViolations)', () => {
  it('formats blocking violations with X', () => {
    // Capture console output
    const logs: string[] = []
    const origError = console.error
    const origLog = console.log
    console.error = (...args: unknown[]) => logs.push(args.join(' '))
    console.log = (...args: unknown[]) => logs.push(args.join(' '))

    showPolicyViolations([{ policy: 'test', permitted: false, blocking: true, reason: 'bad thing' }])

    console.error = origError
    console.log = origLog
    const output = logs.join('\n')
    expect(output).toContain('[test]')
    expect(output).toContain('bad thing')
  })

  it('formats non-blocking violations with warning', () => {
    const logs: string[] = []
    const origError = console.error
    const origLog = console.log
    console.error = (...args: unknown[]) => logs.push(args.join(' '))
    console.log = (...args: unknown[]) => logs.push(args.join(' '))

    showPolicyViolations([{ policy: 'test', permitted: false, blocking: false, reason: 'warning' }])

    console.error = origError
    console.log = origLog
    const output = logs.join('\n')
    expect(output).toContain('warning')
  })
})
