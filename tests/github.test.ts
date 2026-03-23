/**
 * GitHub integration tests.
 * Unit tests use mocked Octokit.
 * Live tests run against the real alucas-hello/babelgit repo using gh CLI token.
 *
 * Live tests are gated on GITHUB_LIVE_TEST=1 env var so they don't run in CI
 * unless explicitly enabled.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GitHubIntegration } from '../src/integrations/github.js'
import { execa } from 'execa'
import type { WorkItem, Checkpoint, GitHubIntegrationConfig } from '../src/types.js'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import simpleGit from 'simple-git'

const baseConfig: GitHubIntegrationConfig = {
  enabled: true,
  token_env: 'GITHUB_TOKEN',
  create_draft_pr_on_pause: true,
  ship_via_pr: false,
  pr_auto_merge: false,
  checkpoint_comments: true,
  pr_labels: [],
}

const workItem: WorkItem = {
  id: 'WI-001',
  description: 'test github integration',
  branch: 'feature/WI-001-test-github',
  stage: 'in_progress',
  created_at: new Date().toISOString(),
  created_by: 'test@example.com',
  pr_number: 1,
  pr_url: 'https://github.com/alucas-hello/babelgit/pull/1',
}

const checkpoint: Checkpoint = {
  id: 'WI-001-keep-1',
  work_item_id: 'WI-001',
  verdict: 'keep',
  notes: 'looking solid',
  called_at: new Date().toISOString(),
  called_by: 'test@example.com',
  caller_type: 'human',
  git_commit: 'abc123def456',
  git_branch: 'feature/WI-001-test-github',
  filesystem_hash: '',
  is_recovery_anchor: true,
}

// ─── Unit tests (mocked Octokit) ─────────────────────────────────────────────

describe('GitHubIntegration: isEnabled', () => {
  it('is disabled when token env var not set', () => {
    delete process.env.GITHUB_TOKEN
    const integration = new GitHubIntegration(baseConfig)
    expect(integration.isEnabled()).toBe(false)
  })

  it('is enabled when token env var is set', () => {
    process.env.GITHUB_TOKEN = 'test-token'
    const integration = new GitHubIntegration(baseConfig)
    expect(integration.isEnabled()).toBe(true)
    delete process.env.GITHUB_TOKEN
  })

  it('respects config.enabled = false', () => {
    process.env.GITHUB_TOKEN = 'test-token'
    const integration = new GitHubIntegration({ ...baseConfig, enabled: false })
    expect(integration.isEnabled()).toBe(false)
    delete process.env.GITHUB_TOKEN
  })
})

describe('GitHubIntegration: onPause (mocked)', () => {
  beforeEach(() => {
    process.env.GITHUB_TOKEN = 'test-token'
  })
  afterEach(() => {
    delete process.env.GITHUB_TOKEN
  })

  it('returns empty object when create_draft_pr_on_pause is false', async () => {
    const integration = new GitHubIntegration({
      ...baseConfig,
      create_draft_pr_on_pause: false,
    })
    const result = await integration.onPause(workItem, 'notes')
    expect(result).toEqual({})
  })

  it('returns empty object when not enabled', async () => {
    delete process.env.GITHUB_TOKEN
    const integration = new GitHubIntegration(baseConfig)
    const result = await integration.onPause(workItem, 'notes')
    expect(result).toEqual({})
  })
})

describe('GitHubIntegration: onCheckpoint (mocked)', () => {
  beforeEach(() => {
    process.env.GITHUB_TOKEN = 'test-token'
  })
  afterEach(() => {
    delete process.env.GITHUB_TOKEN
  })

  it('does nothing when work item has no pr_number', async () => {
    const integration = new GitHubIntegration(baseConfig)
    // Should not throw, just silently skip
    await expect(
      integration.onCheckpoint({ ...workItem, pr_number: undefined }, checkpoint)
    ).resolves.toBeUndefined()
  })

  it('does nothing when checkpoint_comments is false', async () => {
    const integration = new GitHubIntegration({
      ...baseConfig,
      checkpoint_comments: false,
    })
    await expect(
      integration.onCheckpoint(workItem, checkpoint)
    ).resolves.toBeUndefined()
  })
})

// ─── Live integration tests ───────────────────────────────────────────────────
// These run against the real alucas-hello/babelgit repo.
// Gate: GITHUB_LIVE_TEST=1

const isLive = process.env.GITHUB_LIVE_TEST === '1'

describe.skipIf(!isLive)('GitHub LIVE: PR operations against alucas-hello/babelgit', () => {
  let testBranch: string
  let testDir: string
  let prNumber: number | undefined
  let token: string

  beforeEach(async () => {
    // Get token from gh CLI
    const result = await execa('gh', ['auth', 'token'], { reject: false })
    token = result.stdout.trim()
    process.env.GITHUB_TOKEN = token

    // Clone the repo into a temp dir
    testDir = await mkdtemp(path.join(tmpdir(), 'babel-gh-live-'))
    const git = simpleGit(testDir)
    await execa('git', ['clone', 'https://github.com/alucas-hello/babelgit.git', testDir], {
      env: { ...process.env, GIT_ASKPASS: 'echo', GIT_USERNAME: 'x', GIT_PASSWORD: token },
    })

    // Create a test branch
    testBranch = `test/github-integration-${Date.now()}`
    await git.checkoutLocalBranch(testBranch)
    await writeFile(path.join(testDir, `test-${Date.now()}.txt`), 'live test\n')
    await git.add('.')
    await git.commit('test: live github integration test')
    await execa('git', ['push', 'origin', testBranch], {
      cwd: testDir,
      env: {
        ...process.env,
        GIT_ASKPASS: 'echo',
        GIT_USERNAME: 'x',
        GIT_PASSWORD: token,
      },
    })
  })

  afterEach(async () => {
    // Clean up: close PR if open, delete branch
    if (prNumber) {
      try {
        await execa('gh', ['pr', 'close', String(prNumber), '--delete-branch'], { reject: false })
      } catch {}
    } else {
      try {
        await execa('gh', ['api', `repos/alucas-hello/babelgit/git/refs/heads/${testBranch}`, '-X', 'DELETE'], {
          reject: false,
        })
      } catch {}
    }
    await rm(testDir, { recursive: true, force: true })
    delete process.env.GITHUB_TOKEN
  })

  it('creates a draft PR on pause', async () => {
    const integration = new GitHubIntegration(
      { ...baseConfig, create_draft_pr_on_pause: true },
      testDir
    )

    const wi: WorkItem = {
      id: 'WI-LIVE-001',
      description: 'live github integration test',
      branch: testBranch,
      stage: 'paused',
      created_at: new Date().toISOString(),
      created_by: 'test@example.com',
    }

    const result = await integration.onPause(wi, 'paused for live test')
    expect(result.pr_number).toBeDefined()
    expect(result.pr_url).toContain('github.com')
    prNumber = result.pr_number
  })

  it('posts a checkpoint comment to an existing PR', async () => {
    // First create a PR
    const prResult = await execa('gh', [
      'pr', 'create',
      '--title', 'test: live checkpoint comment',
      '--body', 'live test PR',
      '--head', testBranch,
      '--base', 'main',
      '--draft',
    ], { cwd: testDir })
    const prMatch = prResult.stdout.match(/\/pull\/(\d+)/)
    prNumber = prMatch ? parseInt(prMatch[1]) : undefined
    if (!prNumber) throw new Error('Could not create PR for test')

    const integration = new GitHubIntegration(
      { ...baseConfig, checkpoint_comments: true },
      testDir
    )

    const wi: WorkItem = {
      ...workItem,
      branch: testBranch,
      pr_number: prNumber,
      pr_url: `https://github.com/alucas-hello/babelgit/pull/${prNumber}`,
    }

    await integration.onCheckpoint(wi, checkpoint)

    // Verify comment was posted
    const comments = await execa('gh', ['api', `repos/alucas-hello/babelgit/issues/${prNumber}/comments`])
    const parsed = JSON.parse(comments.stdout) as Array<{ body: string }>
    const babelComment = parsed.find(c => c.body.includes('WI-001-keep-1'))
    expect(babelComment).toBeDefined()
    expect(babelComment?.body).toContain('✅ KEEP')
  })
})
