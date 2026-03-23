import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, readFile, chmod, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import {
  getEnforceStatus,
  installHooks,
  removeHooks,
  BABEL_HOOK_MARKER,
} from '../src/core/enforce.js'

async function makeFakeRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'babel-enforce-test-'))
  await mkdir(path.join(dir, '.git', 'hooks'), { recursive: true })
  return dir
}

describe('enforce: getEnforceStatus', () => {
  it('reports inactive when no hooks exist', async () => {
    const dir = await makeFakeRepo()
    const status = await getEnforceStatus(dir)
    expect(status.active).toBe(false)
    expect(status.hooks.every(h => !h.installed && !h.conflict)).toBe(true)
  })

  it('reports active when babel hooks are installed', async () => {
    const dir = await makeFakeRepo()
    await installHooks(dir)
    const status = await getEnforceStatus(dir)
    expect(status.active).toBe(true)
    expect(status.hooks.filter(h => h.installed).length).toBeGreaterThan(0)
  })

  it('reports conflict when non-babel hook exists', async () => {
    const dir = await makeFakeRepo()
    const hookPath = path.join(dir, '.git', 'hooks', 'pre-commit')
    await writeFile(hookPath, '#!/bin/sh\nnpm run lint\n', 'utf-8')
    await chmod(hookPath, 0o755)

    const status = await getEnforceStatus(dir)
    const preCommit = status.hooks.find(h => h.name === 'pre-commit')!
    expect(preCommit.installed).toBe(false)
    expect(preCommit.conflict).toBe(true)
  })
})

describe('enforce: installHooks', () => {
  it('installs all hooks and marks them executable', async () => {
    const dir = await makeFakeRepo()
    const { installed, skipped } = await installHooks(dir)

    expect(installed).toEqual(['pre-commit', 'pre-push', 'pre-rebase'])
    expect(skipped).toEqual([])

    const content = await readFile(
      path.join(dir, '.git', 'hooks', 'pre-commit'),
      'utf-8'
    )
    expect(content).toContain(BABEL_HOOK_MARKER)
    expect(content).toContain('BABEL_ACTIVE')
  })

  it('skips hooks with existing non-babel content', async () => {
    const dir = await makeFakeRepo()
    const hookPath = path.join(dir, '.git', 'hooks', 'pre-commit')
    await writeFile(hookPath, '#!/bin/sh\nnpm run lint\n', 'utf-8')
    await chmod(hookPath, 0o755)

    const { installed, skipped } = await installHooks(dir)
    expect(skipped).toContain('pre-commit')
    expect(installed).not.toContain('pre-commit')

    // Original content untouched
    const content = await readFile(hookPath, 'utf-8')
    expect(content).toContain('npm run lint')
    expect(content).not.toContain(BABEL_HOOK_MARKER)
  })

  it('overwrites existing babel hooks (idempotent)', async () => {
    const dir = await makeFakeRepo()
    await installHooks(dir)
    const { installed } = await installHooks(dir)
    expect(installed).toEqual(['pre-commit', 'pre-push', 'pre-rebase'])
  })
})

describe('enforce: removeHooks', () => {
  it('removes installed babel hooks', async () => {
    const dir = await makeFakeRepo()
    await installHooks(dir)
    const removed = await removeHooks(dir)

    expect(removed).toEqual(['pre-commit', 'pre-push', 'pre-rebase'])
    expect(existsSync(path.join(dir, '.git', 'hooks', 'pre-commit'))).toBe(false)
  })

  it('does not remove non-babel hooks', async () => {
    const dir = await makeFakeRepo()
    const hookPath = path.join(dir, '.git', 'hooks', 'pre-commit')
    await writeFile(hookPath, '#!/bin/sh\nnpm run lint\n', 'utf-8')

    const removed = await removeHooks(dir)
    expect(removed).not.toContain('pre-commit')
    expect(existsSync(hookPath)).toBe(true)
  })

  it('returns empty array when no hooks installed', async () => {
    const dir = await makeFakeRepo()
    const removed = await removeHooks(dir)
    expect(removed).toEqual([])
  })
})
