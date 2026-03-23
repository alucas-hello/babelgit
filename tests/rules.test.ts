import { describe, it, expect } from 'vitest'
import { evaluateRules, formatViolations } from '../src/core/rules.js'
import type { BabelConfig } from '../src/types.js'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import simpleGit from 'simple-git'

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
}

async function withTempRepo<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), 'babel-rules-test-'))
  const git = simpleGit(dir)
  await git.init()
  await git.addConfig('user.email', 'test@example.com')
  await git.addConfig('user.name', 'Test')
  await writeFile(path.join(dir, 'README.md'), '# test\n')
  await git.add('.')
  await git.commit('init')
  try {
    return await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

describe('rules: commit_message_pattern', () => {
  it('passes when commit message matches pattern', async () => {
    const config: BabelConfig = {
      ...baseConfig,
      rules: [
        {
          name: 'conventional commits',
          type: 'commit_message_pattern',
          pattern: '^(feat|fix)\\(.+\\):',
          apply_to: ['save'],
          caller: 'any',
          blocking: true,
        },
      ],
    }
    const violations = await evaluateRules({
      operation: 'save',
      caller: 'human',
      config,
      commitMessage: 'feat(auth): add login',
    })
    expect(violations).toHaveLength(0)
  })

  it('fails when commit message does not match', async () => {
    const config: BabelConfig = {
      ...baseConfig,
      rules: [
        {
          name: 'conventional commits',
          type: 'commit_message_pattern',
          pattern: '^(feat|fix)\\(.+\\):',
          apply_to: ['save'],
          caller: 'any',
          blocking: true,
        },
      ],
    }
    const violations = await evaluateRules({
      operation: 'save',
      caller: 'human',
      config,
      commitMessage: 'just a commit message',
    })
    expect(violations).toHaveLength(1)
    expect(violations[0].rule).toBe('conventional commits')
    expect(violations[0].blocking).toBe(true)
  })

  it('only applies to configured operations', async () => {
    const config: BabelConfig = {
      ...baseConfig,
      rules: [
        {
          name: 'msg',
          type: 'commit_message_pattern',
          pattern: '^feat',
          apply_to: ['save'],
          caller: 'any',
          blocking: true,
        },
      ],
    }
    // ship is not in apply_to — should not evaluate
    const violations = await evaluateRules({
      operation: 'ship',
      caller: 'human',
      config,
      commitMessage: 'bad message',
    })
    expect(violations).toHaveLength(0)
  })
})

describe('rules: path_restriction', () => {
  it('blocks agents from restricted paths', async () => {
    const config: BabelConfig = {
      ...baseConfig,
      rules: [
        {
          name: 'no config edits',
          type: 'path_restriction',
          blocked_paths: ['package.json', '*.config.*'],
          apply_to: ['save'],
          caller: 'agent',
          blocking: true,
        },
      ],
    }
    const violations = await evaluateRules({
      operation: 'save',
      caller: 'agent',
      config,
      changedFiles: ['src/index.ts', 'package.json'],
    })
    expect(violations).toHaveLength(1)
    expect(violations[0].rule).toBe('no config edits')
  })

  it('does not block humans on restricted paths', async () => {
    const config: BabelConfig = {
      ...baseConfig,
      rules: [
        {
          name: 'no config edits',
          type: 'path_restriction',
          blocked_paths: ['package.json'],
          apply_to: ['save'],
          caller: 'agent',
          blocking: true,
        },
      ],
    }
    const violations = await evaluateRules({
      operation: 'save',
      caller: 'human',
      config,
      changedFiles: ['package.json'],
    })
    expect(violations).toHaveLength(0)
  })

  it('passes when no restricted files changed', async () => {
    const config: BabelConfig = {
      ...baseConfig,
      rules: [
        {
          name: 'no config edits',
          type: 'path_restriction',
          blocked_paths: ['package.json'],
          apply_to: ['save'],
          caller: 'any',
          blocking: true,
        },
      ],
    }
    const violations = await evaluateRules({
      operation: 'save',
      caller: 'agent',
      config,
      changedFiles: ['src/index.ts'],
    })
    expect(violations).toHaveLength(0)
  })
})

describe('rules: files_changed', () => {
  it('passes when required companion file is changed', async () => {
    const config: BabelConfig = {
      ...baseConfig,
      rules: [
        {
          name: 'require tests',
          type: 'files_changed',
          if_changed: 'src/**/*.ts',
          require_also_changed: 'tests/**/*.test.ts',
          apply_to: ['keep'],
          caller: 'any',
          blocking: true,
        },
      ],
    }
    const violations = await evaluateRules({
      operation: 'keep',
      caller: 'human',
      config,
      changedFiles: ['src/index.ts', 'tests/index.test.ts'],
    })
    expect(violations).toHaveLength(0)
  })

  it('fails when trigger file changed but companion missing', async () => {
    const config: BabelConfig = {
      ...baseConfig,
      rules: [
        {
          name: 'require tests',
          type: 'files_changed',
          if_changed: 'src/**/*.ts',
          require_also_changed: 'tests/**/*.test.ts',
          apply_to: ['keep'],
          caller: 'any',
          blocking: true,
        },
      ],
    }
    const violations = await evaluateRules({
      operation: 'keep',
      caller: 'human',
      config,
      changedFiles: ['src/index.ts'],
    })
    expect(violations).toHaveLength(1)
  })

  it('does not trigger when trigger file not changed', async () => {
    const config: BabelConfig = {
      ...baseConfig,
      rules: [
        {
          name: 'require tests',
          type: 'files_changed',
          if_changed: 'src/**/*.ts',
          require_also_changed: 'tests/**/*.test.ts',
          apply_to: ['keep'],
          caller: 'any',
          blocking: true,
        },
      ],
    }
    // Only a docs file changed — rule doesn't trigger
    const violations = await evaluateRules({
      operation: 'keep',
      caller: 'human',
      config,
      changedFiles: ['docs/readme.md'],
    })
    expect(violations).toHaveLength(0)
  })
})

describe('rules: script', () => {
  it('passes when script exits 0', async () => {
    const config: BabelConfig = {
      ...baseConfig,
      rules: [
        {
          name: 'check',
          type: 'script',
          command: 'echo ok',
          apply_to: ['keep'],
          caller: 'any',
          blocking: true,
        },
      ],
    }
    const violations = await evaluateRules({ operation: 'keep', caller: 'human', config })
    expect(violations).toHaveLength(0)
  })

  it('fails when script exits non-zero', async () => {
    const config: BabelConfig = {
      ...baseConfig,
      rules: [
        {
          name: 'failing-check',
          type: 'script',
          command: 'false',
          apply_to: ['keep'],
          caller: 'any',
          blocking: true,
        },
      ],
    }
    const violations = await evaluateRules({ operation: 'keep', caller: 'human', config })
    expect(violations).toHaveLength(1)
    expect(violations[0].rule).toBe('failing-check')
  })
})

describe('rules: formatViolations', () => {
  it('formats blocking violations with X', () => {
    const output = formatViolations([{ rule: 'test', message: 'bad thing', blocking: true }])
    expect(output).toContain('✗')
    expect(output).toContain('[test]')
    expect(output).toContain('bad thing')
  })

  it('formats non-blocking violations with warning', () => {
    const output = formatViolations([{ rule: 'test', message: 'warning', blocking: false }])
    expect(output).toContain('⚠')
  })
})
