/**
 * Integration tests for the full babelgit lifecycle.
 * These tests create a temporary git repository, run the full CLI lifecycle,
 * and verify the resulting git state.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import simpleGit from 'simple-git'

import { runInit } from '../src/cli/commands/init.js'
import { runSave } from '../src/cli/commands/save.js'
import { runRun } from '../src/cli/commands/run.js'
import { runVerdict } from '../src/cli/commands/verdict.js'
import { runState } from '../src/cli/commands/state.js'
import { runHistory } from '../src/cli/commands/history.js'
import { loadState, getCurrentWorkItem } from '../src/core/state.js'
import { loadCheckpoints, loadRunSession } from '../src/core/checkpoint.js'
import { writeConfig } from '../src/core/config.js'

// Helper: silence stdout/stderr for tests unless VERBOSE=1
let silenceOutput = !process.env.VERBOSE

function patchConsole() {
  if (!silenceOutput) return { restore: () => {} }
  const origLog = console.log
  const origErr = console.error
  console.log = () => {}
  console.error = () => {}
  return {
    restore: () => {
      console.log = origLog
      console.error = origErr
    },
  }
}

// Helper: create a temp git repo with initial commit
async function createTempRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'babelgit-test-'))
  const git = simpleGit(dir)
  await git.init()
  await git.addConfig('user.email', 'test@example.com')
  await git.addConfig('user.name', 'Test User')
  // Create initial commit so HEAD exists
  await writeFile(path.join(dir, 'README.md'), '# Test\n')
  await git.add('.')
  await git.commit('Initial commit')
  return dir
}

// Helper: run init without interactive prompts (write config directly)
async function setupRepo(dir: string, baseBranch = 'main') {
  const git = simpleGit(dir)
  // Rename current branch to match base_branch
  const current = await git.revparse(['--abbrev-ref', 'HEAD'])
  if (current.trim() !== baseBranch) {
    await git.branch(['-m', baseBranch])
  }

  await writeConfig(
    {
      version: 1,
      base_branch: baseBranch,
      protected_branches: [baseBranch],
      branch_pattern: 'feature/{id}-{slug}',
      work_item_id: { source: 'local', prefix: 'WI' },
      require_checkpoint_for: { pause: false, ship: true },
      sync_strategy: 'rebase',
      agents: { permitted_branch_patterns: ['feature/*', 'fix/*'], require_attestation_before_pause: false },
      require_confirmation: [],
      verdicts: { keep: 'keep', refine: 'refine', reject: 'reject', ship: 'ship' },
    },
    dir
  )

  // Init state
  const { ensureBabelDir, saveState } = await import('../src/core/state.js')
  await ensureBabelDir(dir)
  await saveState({ work_items: {}, next_local_id: 1 }, dir)

  // Add .babel/ to .gitignore
  await writeFile(path.join(dir, '.gitignore'), '.babel/\n')
  await git.add('.')
  await git.commit('chore: add babelgit config')
}

// Helper: simulate "babel start" without interactive prompts
async function startWorkItem(dir: string, description: string): Promise<string> {
  const { getNextLocalId, saveWorkItem, setCurrentWorkItem } = await import('../src/core/state.js')
  const { loadConfig } = await import('../src/core/config.js')
  const { buildBranchName } = await import('../src/core/workitem.js')
  const { checkoutNewBranch } = await import('../src/core/git.js')

  const config = await loadConfig(dir)
  const id = await getNextLocalId(dir)
  const branchName = buildBranchName(id, description, config)

  const git = simpleGit(dir)
  await git.checkoutLocalBranch(branchName)

  const workItem = {
    id,
    description,
    branch: branchName,
    stage: 'in_progress' as const,
    created_at: new Date().toISOString(),
    created_by: 'test@example.com',
  }
  await saveWorkItem(workItem, dir)
  await setCurrentWorkItem(id, dir)
  return id
}

describe('integration: full lifecycle', () => {
  let dir: string

  beforeEach(async () => {
    dir = await createTempRepo()
    await setupRepo(dir)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('save → run → keep creates checkpoint and clears run session', async () => {
    const p = patchConsole()
    try {
      await startWorkItem(dir, 'test the whole thing')

      // Create a file and save
      await writeFile(path.join(dir, 'feature.txt'), 'hello\n')
      await runSave('added a file', dir)

      // Open run session
      await runRun(dir)

      // Verify run session exists
      const session = await loadRunSession(dir)
      expect(session).not.toBeNull()
      expect(session!.status).toBe('open')

      const workItem = await getCurrentWorkItem(dir)
      expect(workItem!.stage).toBe('run_session_open')

      // Call keep verdict
      await runVerdict('keep', 'it works', dir)

      // Verify run session is gone
      const sessionAfter = await loadRunSession(dir)
      expect(sessionAfter).toBeNull()

      // Verify checkpoint was created
      const state = await loadState(dir)
      const wi = Object.values(state.work_items)[0]
      expect(wi.stage).toBe('in_progress')

      const checkpoints = await loadCheckpoints(wi.id, dir)
      expect(checkpoints.length).toBe(1)
      expect(checkpoints[0].verdict).toBe('keep')
      expect(checkpoints[0].notes).toBe('it works')
      expect(checkpoints[0].is_recovery_anchor).toBe(true)
    } finally {
      p.restore()
    }
  })

  it('reject reverts to last keep commit', async () => {
    const p = patchConsole()
    try {
      await startWorkItem(dir, 'test reject flow')
      const git = simpleGit(dir)

      // First: save and keep
      await writeFile(path.join(dir, 'v1.txt'), 'version 1\n')
      await runSave('version 1', dir)
      await runRun(dir)
      await runVerdict('keep', 'first keep', dir)

      const keepSha = await git.revparse(['HEAD'])

      // Now: save more changes and run session
      await writeFile(path.join(dir, 'v2.txt'), 'version 2 - bad direction\n')
      await runSave('version 2', dir)
      await runRun(dir)

      // Reject - should revert to keepSha
      await runVerdict('reject', 'wrong direction', dir)

      const currentSha = await git.revparse(['HEAD'])
      expect(currentSha.trim()).toBe(keepSha.trim())
    } finally {
      p.restore()
    }
  })

  it('state command returns correct stage', async () => {
    const p = patchConsole()
    try {
      const id = await startWorkItem(dir, 'test state command')

      let workItem = await getCurrentWorkItem(dir)
      expect(workItem!.stage).toBe('in_progress')

      await writeFile(path.join(dir, 'test.txt'), 'test\n')
      await runSave('test save', dir)
      await runRun(dir)

      workItem = await getCurrentWorkItem(dir)
      expect(workItem!.stage).toBe('run_session_open')
    } finally {
      p.restore()
    }
  })

  it('run session is blocked when one is already open', async () => {
    const p = patchConsole()
    try {
      await startWorkItem(dir, 'test double run')
      await writeFile(path.join(dir, 'test.txt'), 'test\n')
      await runSave('save', dir)
      await runRun(dir)

      // Second run should fail
      let threw = false
      const origExit = process.exit
      ;(process as any).exit = () => { threw = true; throw new Error('exit') }
      try {
        await runRun(dir)
      } catch {}
      ;(process as any).exit = origExit
      expect(threw).toBe(true)
    } finally {
      p.restore()
    }
  })
})

describe('integration: governance enforcement', () => {
  let dir: string

  beforeEach(async () => {
    dir = await createTempRepo()
    await setupRepo(dir)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('ship is blocked without a checkpoint when require_checkpoint_for.ship is true', async () => {
    const p = patchConsole()
    try {
      // Update config to require ship checkpoint
      await writeConfig(
        {
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
        },
        dir
      )
      await startWorkItem(dir, 'test ship governance')

      const { runShip } = await import('../src/cli/commands/ship.js')
      let threw = false
      const origExit = process.exit
      ;(process as any).exit = () => { threw = true; throw new Error('exit') }
      try {
        await runShip(dir)
      } catch {}
      ;(process as any).exit = origExit
      expect(threw).toBe(true)
    } finally {
      p.restore()
    }
  })
})
