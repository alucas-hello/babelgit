import { describe, it, expect, vi } from 'vitest'
import {
  runCommand,
  runAllCommands,
  hasRequiredFailure,
  serializeResults,
  formatAutomationSummary,
} from '../src/core/scripts.js'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), 'babel-scripts-test-'))
  try {
    return await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

describe('scripts: runCommand', () => {
  it('runs a passing command', async () => {
    await withTempDir(async dir => {
      const result = await runCommand({ name: 'echo', command: 'echo hello' }, dir, true)
      expect(result.passed).toBe(true)
      expect(result.exit_code).toBe(0)
    })
  })

  it('runs a failing command', async () => {
    await withTempDir(async dir => {
      const result = await runCommand({ name: 'fail', command: 'false' }, dir, true)
      expect(result.passed).toBe(false)
      expect(result.exit_code).not.toBe(0)
    })
  })

  it('captures stdout when capture_output is true', async () => {
    await withTempDir(async dir => {
      const result = await runCommand(
        { name: 'echo', command: 'echo captured', capture_output: true },
        dir,
        true
      )
      expect(result.passed).toBe(true)
      expect(result.stdout).toContain('captured')
    })
  })

  it('does not capture stdout when capture_output is false', async () => {
    await withTempDir(async dir => {
      const result = await runCommand(
        { name: 'echo', command: 'echo not-captured', capture_output: false },
        dir,
        true
      )
      expect(result.stdout).toBe('')
    })
  })

  it('records duration', async () => {
    await withTempDir(async dir => {
      const result = await runCommand({ name: 'echo', command: 'echo hi' }, dir, true)
      expect(result.duration_ms).toBeGreaterThanOrEqual(0)
    })
  })
})

describe('scripts: runAllCommands', () => {
  it('runs all commands in sequence', async () => {
    await withTempDir(async dir => {
      const results = await runAllCommands(
        [
          { name: 'a', command: 'echo a', required: true },
          { name: 'b', command: 'echo b', required: true },
        ],
        dir,
        true
      )
      expect(results).toHaveLength(2)
      expect(results.every(r => r.passed)).toBe(true)
    })
  })

  it('stops on first required failure', async () => {
    await withTempDir(async dir => {
      const results = await runAllCommands(
        [
          { name: 'pass', command: 'echo pass', required: false },
          { name: 'fail', command: 'false', required: true },
          { name: 'never', command: 'echo never', required: true },
        ],
        dir,
        true
      )
      // Should stop after fail — never command should not run
      expect(results).toHaveLength(2)
      expect(results[1].passed).toBe(false)
    })
  })

  it('continues past optional failures', async () => {
    await withTempDir(async dir => {
      const results = await runAllCommands(
        [
          { name: 'fail-optional', command: 'false', required: false },
          { name: 'pass', command: 'echo pass', required: true },
        ],
        dir,
        true
      )
      expect(results).toHaveLength(2)
    })
  })
})

describe('scripts: hasRequiredFailure', () => {
  it('returns null when all pass', () => {
    const results = [
      { name: 'a', command: 'echo a', passed: true, exit_code: 0, stdout: '', stderr: '', duration_ms: 1, required: true },
    ]
    expect(hasRequiredFailure(results)).toBeNull()
  })

  it('returns the first required failure', () => {
    const results = [
      { name: 'a', command: 'a', passed: false, exit_code: 1, stdout: '', stderr: '', duration_ms: 1, required: true },
    ]
    expect(hasRequiredFailure(results)?.name).toBe('a')
  })

  it('ignores optional failures', () => {
    const results = [
      { name: 'a', command: 'a', passed: false, exit_code: 1, stdout: '', stderr: '', duration_ms: 1, required: false },
    ]
    expect(hasRequiredFailure(results)).toBeNull()
  })
})

describe('scripts: serializeResults', () => {
  it('serializes results to plain objects', () => {
    const results = [
      { name: 'test', command: 'npm test', passed: true, exit_code: 0, stdout: 'ok', stderr: '', duration_ms: 100, required: true },
    ]
    const serialized = serializeResults(results)
    expect(serialized[0]).toMatchObject({ name: 'test', passed: true, exit_code: 0 })
  })
})
