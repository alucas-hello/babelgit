import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  automationPassed,
  wiHasField,
  checkpointCallerIncludes,
  timeSinceLastCheckpoint,
  type PolicyContext,
} from '../../src/core/review-conditions.js'
import type { Checkpoint, AutomationResult } from '../../src/types.js'

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeCheckpoint(overrides: Partial<Checkpoint> = {}): Checkpoint {
  return {
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
    ...overrides,
  }
}

function makeAutomationResult(overrides: Partial<AutomationResult> = {}): AutomationResult {
  return {
    name: 'test-suite',
    passed: true,
    exit_code: 0,
    duration_ms: 1000,
    required: true,
    ...overrides,
  }
}

function makeContext(overrides: Partial<PolicyContext> = {}): PolicyContext {
  return {
    trigger: 'ship',
    caller: 'human',
    branch: 'feature/WI-001-test',
    config: {},
    repoPath: '/tmp',
    ...overrides,
  }
}

// ─── automation_passed ──────────────────────────────────────────────────────

describe('review-conditions: automation_passed', () => {
  it('passes when all automation results pass', async () => {
    const ctx = makeContext({
      runSession: {
        work_item_id: 'WI-001',
        started_at: new Date().toISOString(),
        locked_commit: 'abc123',
        locked_filesystem_hash: 'deadbeef',
        status: 'completed',
        automation_results: [
          makeAutomationResult({ name: 'lint', passed: true }),
          makeAutomationResult({ name: 'test', passed: true }),
        ],
      },
    })
    const result = await automationPassed(ctx, {})
    expect(result.passed).toBe(true)
    expect(result.vars.failed_count).toBe('0')
  })

  it('fails when some automation results fail', async () => {
    const ctx = makeContext({
      runSession: {
        work_item_id: 'WI-001',
        started_at: new Date().toISOString(),
        locked_commit: 'abc123',
        locked_filesystem_hash: 'deadbeef',
        status: 'completed',
        automation_results: [
          makeAutomationResult({ name: 'lint', passed: true }),
          makeAutomationResult({ name: 'test', passed: false, exit_code: 1 }),
          makeAutomationResult({ name: 'typecheck', passed: false, exit_code: 2 }),
        ],
      },
    })
    const result = await automationPassed(ctx, {})
    expect(result.passed).toBe(false)
    expect(result.vars.failed_count).toBe('2')
    expect(result.vars.failed_names).toBe('test, typecheck')
  })

  it('with required_only, ignores non-required failures', async () => {
    const ctx = makeContext({
      runSession: {
        work_item_id: 'WI-001',
        started_at: new Date().toISOString(),
        locked_commit: 'abc123',
        locked_filesystem_hash: 'deadbeef',
        status: 'completed',
        automation_results: [
          makeAutomationResult({ name: 'lint', passed: true, required: true }),
          makeAutomationResult({ name: 'optional-check', passed: false, required: false }),
        ],
      },
    })
    const result = await automationPassed(ctx, { required_only: true })
    expect(result.passed).toBe(true)
    expect(result.vars.failed_count).toBe('0')
  })

  it('with required_only, catches required failures', async () => {
    const ctx = makeContext({
      runSession: {
        work_item_id: 'WI-001',
        started_at: new Date().toISOString(),
        locked_commit: 'abc123',
        locked_filesystem_hash: 'deadbeef',
        status: 'completed',
        automation_results: [
          makeAutomationResult({ name: 'lint', passed: false, required: true }),
          makeAutomationResult({ name: 'optional-check', passed: false, required: false }),
        ],
      },
    })
    const result = await automationPassed(ctx, { required_only: true })
    expect(result.passed).toBe(false)
    expect(result.vars.failed_count).toBe('1')
    expect(result.vars.failed_names).toBe('lint')
  })

  it('falls back to checkpoint automation_results when no run session', async () => {
    const ctx = makeContext({
      checkpoints: [
        makeCheckpoint({
          automation_results: [
            makeAutomationResult({ name: 'test', passed: false }),
          ],
        }),
      ],
    })
    const result = await automationPassed(ctx, {})
    expect(result.passed).toBe(false)
    expect(result.vars.failed_count).toBe('1')
  })

  it('passes vacuously when no automation results exist', async () => {
    const ctx = makeContext({})
    const result = await automationPassed(ctx, {})
    expect(result.passed).toBe(true)
    expect(result.vars.failed_count).toBe('0')
  })
})

// ─── wi_has_field ───────────────────────────────────────────────────────────

describe('review-conditions: wi_has_field', () => {
  it('passes when field is present and truthy', async () => {
    const ctx = makeContext({
      workItem: {
        id: 'WI-001',
        description: 'test',
        stage: 'in_progress' as const,
        created_at: new Date().toISOString(),
        created_by: 'agent',
        pr_url: 'https://github.com/org/repo/pull/42',
      },
    })
    const result = await wiHasField(ctx, { field: 'pr_url' })
    expect(result.passed).toBe(true)
    expect(result.vars.field).toBe('pr_url')
  })

  it('fails when field is absent', async () => {
    const ctx = makeContext({
      workItem: {
        id: 'WI-001',
        description: 'test',
        stage: 'in_progress' as const,
        created_at: new Date().toISOString(),
        created_by: 'agent',
      },
    })
    const result = await wiHasField(ctx, { field: 'pr_url' })
    expect(result.passed).toBe(false)
  })

  it('fails when field is empty string', async () => {
    const ctx = makeContext({
      workItem: {
        id: 'WI-001',
        description: 'test',
        stage: 'in_progress' as const,
        created_at: new Date().toISOString(),
        created_by: 'agent',
        pr_url: '',
      },
    })
    const result = await wiHasField(ctx, { field: 'pr_url' })
    expect(result.passed).toBe(false)
  })

  it('fails when no work item exists', async () => {
    const ctx = makeContext({})
    const result = await wiHasField(ctx, { field: 'pr_url' })
    expect(result.passed).toBe(false)
  })

  it('fails when no field param is provided', async () => {
    const ctx = makeContext({
      workItem: {
        id: 'WI-001',
        description: 'test',
        stage: 'in_progress' as const,
        created_at: new Date().toISOString(),
        created_by: 'agent',
      },
    })
    const result = await wiHasField(ctx, {})
    expect(result.passed).toBe(false)
  })

  it('passes when pr_number is a non-zero number', async () => {
    const ctx = makeContext({
      workItem: {
        id: 'WI-001',
        description: 'test',
        stage: 'in_progress' as const,
        created_at: new Date().toISOString(),
        created_by: 'agent',
        pr_number: 42,
      },
    })
    const result = await wiHasField(ctx, { field: 'pr_number' })
    expect(result.passed).toBe(true)
  })
})

// ─── checkpoint_caller_includes ─────────────────────────────────────────────

describe('review-conditions: checkpoint_caller_includes', () => {
  it('passes when human checkpoint exists', async () => {
    const ctx = makeContext({
      checkpoints: [makeCheckpoint({ caller_type: 'human' })],
    })
    const result = await checkpointCallerIncludes(ctx, { caller_type: 'human' })
    expect(result.passed).toBe(true)
    expect(result.vars.found_count).toBe('1')
  })

  it('fails when looking for human but only agent checkpoints', async () => {
    const ctx = makeContext({
      checkpoints: [makeCheckpoint({ caller_type: 'agent' })],
    })
    const result = await checkpointCallerIncludes(ctx, { caller_type: 'human' })
    expect(result.passed).toBe(false)
    expect(result.vars.found_count).toBe('0')
  })

  it('filters by verdict when specified', async () => {
    const ctx = makeContext({
      checkpoints: [
        makeCheckpoint({ caller_type: 'human', verdict: 'refine' }),
        makeCheckpoint({ caller_type: 'human', verdict: 'keep' }),
      ],
    })
    const result = await checkpointCallerIncludes(ctx, {
      caller_type: 'human',
      verdict: ['keep', 'ship'],
    })
    expect(result.passed).toBe(true)
    expect(result.vars.found_count).toBe('1')
  })

  it('respects min_count', async () => {
    const ctx = makeContext({
      checkpoints: [
        makeCheckpoint({ caller_type: 'human', verdict: 'keep' }),
      ],
    })
    const result = await checkpointCallerIncludes(ctx, {
      caller_type: 'human',
      min_count: 2,
    })
    expect(result.passed).toBe(false)
    expect(result.vars.found_count).toBe('1')
    expect(result.vars.required_count).toBe('2')
  })

  it('passes min_count when enough checkpoints exist', async () => {
    const ctx = makeContext({
      checkpoints: [
        makeCheckpoint({ caller_type: 'human', id: 'cp-1' }),
        makeCheckpoint({ caller_type: 'human', id: 'cp-2' }),
        makeCheckpoint({ caller_type: 'agent', id: 'cp-3' }),
      ],
    })
    const result = await checkpointCallerIncludes(ctx, {
      caller_type: 'human',
      min_count: 2,
    })
    expect(result.passed).toBe(true)
    expect(result.vars.found_count).toBe('2')
  })

  it('defaults min_count to 1', async () => {
    const ctx = makeContext({
      checkpoints: [makeCheckpoint({ caller_type: 'agent' })],
    })
    const result = await checkpointCallerIncludes(ctx, { caller_type: 'agent' })
    expect(result.passed).toBe(true)
  })

  it('fails when no checkpoints exist', async () => {
    const ctx = makeContext({ checkpoints: [] })
    const result = await checkpointCallerIncludes(ctx, { caller_type: 'human' })
    expect(result.passed).toBe(false)
  })
})

// ─── time_since_last_checkpoint ─────────────────────────────────────────────

describe('review-conditions: time_since_last_checkpoint', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('passes when checkpoint is recent enough', async () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const ctx = makeContext({
      checkpoints: [makeCheckpoint({ called_at: fiveMinutesAgo })],
    })
    const result = await timeSinceLastCheckpoint(ctx, { max_minutes: 60 })
    expect(result.passed).toBe(true)
  })

  it('fails when checkpoint is too old', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    const ctx = makeContext({
      checkpoints: [makeCheckpoint({ called_at: twoDaysAgo })],
    })
    const result = await timeSinceLastCheckpoint(ctx, { max_minutes: 1440 })
    expect(result.passed).toBe(false)
    expect(parseInt(result.vars.minutes_ago)).toBeGreaterThan(1440)
  })

  it('fails when no checkpoints exist', async () => {
    const ctx = makeContext({ checkpoints: [] })
    const result = await timeSinceLastCheckpoint(ctx, { max_minutes: 60 })
    expect(result.passed).toBe(false)
    expect(result.vars.minutes_ago).toBe('never')
  })

  it('passes vacuously when max_minutes is not specified', async () => {
    const ctx = makeContext({ checkpoints: [] })
    const result = await timeSinceLastCheckpoint(ctx, {})
    expect(result.passed).toBe(true)
  })

  it('uses the latest checkpoint (last in array)', async () => {
    const oldCheckpoint = makeCheckpoint({
      id: 'cp-1',
      called_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    })
    const recentCheckpoint = makeCheckpoint({
      id: 'cp-2',
      called_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    })
    const ctx = makeContext({
      checkpoints: [oldCheckpoint, recentCheckpoint],
    })
    const result = await timeSinceLastCheckpoint(ctx, { max_minutes: 60 })
    expect(result.passed).toBe(true)
  })
})
