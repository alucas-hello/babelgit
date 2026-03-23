/**
 * Linear integration tests — all HTTP calls are mocked.
 * Live credential tests will be done together with real API keys.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LinearClient, LinearIntegration } from '../src/integrations/linear.js'
import type { WorkItem, Checkpoint, LinearIntegrationConfig } from '../src/types.js'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockIssue = {
  id: 'issue-abc123',
  identifier: 'ENG-042',
  title: 'Fix login timeout',
  url: 'https://linear.app/company/issue/ENG-042',
  state: { name: 'In Progress' },
}

const baseConfig: LinearIntegrationConfig = {
  enabled: true,
  team_id: 'TEAM-001',
  api_key_env: 'LINEAR_API_KEY',
  create_issue_on_start: true,
  transition_on_ship: true,
  ship_state: 'Done',
  add_checkpoint_comments: true,
}

const workItem: WorkItem = {
  id: 'WI-001',
  description: 'fix login timeout',
  branch: 'feature/WI-001-fix-login-timeout',
  stage: 'in_progress',
  created_at: new Date().toISOString(),
  created_by: 'test@example.com',
  linear_issue_id: 'issue-abc123',
  linear_issue_url: mockIssue.url,
  linear_issue_key: 'ENG-042',
}

const checkpoint: Checkpoint = {
  id: 'WI-001-keep-1',
  work_item_id: 'WI-001',
  verdict: 'keep',
  notes: 'auth flow solid',
  called_at: new Date().toISOString(),
  called_by: 'test@example.com',
  caller_type: 'human',
  git_commit: 'abc123def456',
  git_branch: 'feature/WI-001-fix-login-timeout',
  filesystem_hash: '',
  is_recovery_anchor: true,
}

// ─── LinearClient unit tests (mocked fetch) ───────────────────────────────────

describe('LinearClient: createIssue', () => {
  let origFetch: typeof global.fetch

  beforeEach(() => {
    origFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          issueCreate: { issue: mockIssue },
        },
      }),
    }) as any
  })

  afterEach(() => {
    global.fetch = origFetch
  })

  it('sends correct GraphQL mutation', async () => {
    const client = new LinearClient('test-key')
    const issue = await client.createIssue({
      teamId: 'TEAM-001',
      title: 'Fix login timeout',
      description: 'Work item: WI-001',
    })

    expect(issue.id).toBe('issue-abc123')
    expect(issue.identifier).toBe('ENG-042')
    expect(global.fetch).toHaveBeenCalledOnce()

    const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse(callArgs[1].body)
    expect(body.query).toContain('issueCreate')
    expect(body.variables.teamId).toBe('TEAM-001')
  })

  it('throws on HTTP error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    }) as any

    const client = new LinearClient('bad-key')
    await expect(
      client.createIssue({ teamId: 'T', title: 'T' })
    ).rejects.toThrow('Linear API error: 401')
  })

  it('throws on GraphQL errors', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        errors: [{ message: 'Not authorized' }],
      }),
    }) as any

    const client = new LinearClient('test-key')
    await expect(
      client.createIssue({ teamId: 'T', title: 'T' })
    ).rejects.toThrow('Not authorized')
  })
})

describe('LinearClient: addComment', () => {
  let origFetch: typeof global.fetch

  beforeEach(() => {
    origFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { commentCreate: { comment: { id: 'c1' } } },
      }),
    }) as any
  })

  afterEach(() => {
    global.fetch = origFetch
  })

  it('posts comment with correct issue ID', async () => {
    const client = new LinearClient('test-key')
    await client.addComment('issue-abc123', 'Test comment')

    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    expect(body.variables.issueId).toBe('issue-abc123')
    expect(body.variables.body).toBe('Test comment')
  })
})

describe('LinearClient: getIssueByIdentifier', () => {
  let origFetch: typeof global.fetch

  beforeEach(() => {
    origFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { issues: { nodes: [mockIssue] } },
      }),
    }) as any
  })

  afterEach(() => {
    global.fetch = origFetch
  })

  it('returns issue by identifier', async () => {
    const client = new LinearClient('test-key')
    const issue = await client.getIssueByIdentifier('ENG-042')
    expect(issue?.identifier).toBe('ENG-042')
  })

  it('returns null when no match', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { issues: { nodes: [] } } }),
    }) as any
    const client = new LinearClient('test-key')
    const issue = await client.getIssueByIdentifier('ENG-999')
    expect(issue).toBeNull()
  })
})

// ─── LinearIntegration service tests ─────────────────────────────────────────

describe('LinearIntegration: isEnabled', () => {
  it('is disabled when API key env var not set', () => {
    delete process.env.LINEAR_API_KEY
    const integration = new LinearIntegration(baseConfig)
    expect(integration.isEnabled()).toBe(false)
  })

  it('is enabled when API key env var is set', () => {
    process.env.LINEAR_API_KEY = 'test-key'
    const integration = new LinearIntegration(baseConfig)
    expect(integration.isEnabled()).toBe(true)
    delete process.env.LINEAR_API_KEY
  })

  it('is disabled when config.enabled is false', () => {
    process.env.LINEAR_API_KEY = 'test-key'
    const integration = new LinearIntegration({ ...baseConfig, enabled: false })
    expect(integration.isEnabled()).toBe(false)
    delete process.env.LINEAR_API_KEY
  })
})

describe('LinearIntegration: onStart', () => {
  let origFetch: typeof global.fetch

  beforeEach(() => {
    process.env.LINEAR_API_KEY = 'test-key'
    origFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { issueCreate: { issue: mockIssue } } }),
    }) as any
  })

  afterEach(() => {
    delete process.env.LINEAR_API_KEY
    global.fetch = origFetch
  })

  it('creates a Linear issue and returns fields', async () => {
    const integration = new LinearIntegration(baseConfig)
    const wi: WorkItem = {
      id: 'WI-001',
      description: 'fix login timeout',
      branch: 'feature/WI-001-fix',
      stage: 'in_progress',
      created_at: new Date().toISOString(),
      created_by: 'test@example.com',
    }
    const fields = await integration.onStart(wi)
    expect(fields.linear_issue_id).toBe('issue-abc123')
    expect(fields.linear_issue_url).toBe(mockIssue.url)
    expect(fields.linear_issue_key).toBe('ENG-042')
  })

  it('links to existing issue when work item ID matches Linear identifier', async () => {
    // Override fetch to simulate getIssueByIdentifier returning the issue
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { issues: { nodes: [mockIssue] } } }),
    }) as any

    const integration = new LinearIntegration(baseConfig)
    const wi: WorkItem = {
      id: 'ENG-042', // Looks like a Linear identifier
      description: 'fix login timeout',
      branch: 'feature/ENG-042-fix',
      stage: 'in_progress',
      created_at: new Date().toISOString(),
      created_by: 'test@example.com',
    }
    const fields = await integration.onStart(wi)
    expect(fields.linear_issue_id).toBe('issue-abc123')
  })

  it('returns empty object when not enabled', async () => {
    delete process.env.LINEAR_API_KEY
    const integration = new LinearIntegration(baseConfig)
    const fields = await integration.onStart(workItem)
    expect(fields).toEqual({})
  })
})

describe('LinearIntegration: onCheckpoint', () => {
  let origFetch: typeof global.fetch
  let postedBody: string = ''

  beforeEach(() => {
    process.env.LINEAR_API_KEY = 'test-key'
    origFetch = global.fetch
    global.fetch = vi.fn().mockImplementation((_url, opts) => {
      postedBody = JSON.parse(opts.body).variables.body || ''
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: { commentCreate: { comment: { id: 'c1' } } } }),
      })
    }) as any
  })

  afterEach(() => {
    delete process.env.LINEAR_API_KEY
    global.fetch = origFetch
    postedBody = ''
  })

  it('posts a keep comment with correct format', async () => {
    const integration = new LinearIntegration(baseConfig)
    await integration.onCheckpoint(workItem, checkpoint)
    expect(postedBody).toContain('✓ KEEP')
    expect(postedBody).toContain('WI-001-keep-1')
    expect(postedBody).toContain('auth flow solid')
  })

  it('includes automation results in comment when present', async () => {
    const integration = new LinearIntegration(baseConfig)
    const cpWithAutomation: Checkpoint = {
      ...checkpoint,
      automation_results: [
        { name: 'tests', passed: true, exit_code: 0, duration_ms: 100, required: true },
      ],
    }
    await integration.onCheckpoint(workItem, cpWithAutomation)
    expect(postedBody).toContain('tests')
  })

  it('does nothing when work item has no linear_issue_id', async () => {
    const integration = new LinearIntegration(baseConfig)
    const wi = { ...workItem, linear_issue_id: undefined }
    await integration.onCheckpoint(wi, checkpoint)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})

describe('LinearIntegration: onShip', () => {
  let origFetch: typeof global.fetch

  beforeEach(() => {
    process.env.LINEAR_API_KEY = 'test-key'
    origFetch = global.fetch
  })

  afterEach(() => {
    delete process.env.LINEAR_API_KEY
    global.fetch = origFetch
  })

  it('transitions issue to ship state', async () => {
    const states = [
      { id: 'state-done', name: 'Done', type: 'completed' },
      { id: 'state-progress', name: 'In Progress', type: 'started' },
    ]
    let updateCalled = false

    global.fetch = vi.fn().mockImplementation((_url, opts) => {
      const body = JSON.parse(opts.body)
      if (body.query.includes('GetTeamStates')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { team: { states: { nodes: states } } } }),
        })
      }
      if (body.query.includes('issueUpdate')) {
        updateCalled = true
        expect(body.variables.stateId).toBe('state-done')
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { issueUpdate: { issue: { id: 'i', state: { name: 'Done' } } } } }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: {} }) })
    }) as any

    const integration = new LinearIntegration(baseConfig)
    await integration.onShip(workItem)
    expect(updateCalled).toBe(true)
  })

  it('does nothing when transition_on_ship is false', async () => {
    global.fetch = vi.fn() as any
    const integration = new LinearIntegration({ ...baseConfig, transition_on_ship: false })
    await integration.onShip(workItem)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
