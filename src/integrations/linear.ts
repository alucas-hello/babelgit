import type { LinearIntegrationConfig, WorkItem, Checkpoint } from '../types.js'

export interface LinearIssue {
  id: string
  identifier: string   // e.g. "ENG-042"
  title: string
  url: string
  state?: { name: string }
}

export interface LinearCreateIssueInput {
  teamId: string
  title: string
  description?: string
}

export class LinearClient {
  private apiKey: string
  private baseUrl = 'https://api.linear.app/graphql'

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  private async gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.apiKey,
      },
      body: JSON.stringify({ query, variables }),
    })

    if (!response.ok) {
      throw new Error(`Linear API error: ${response.status} ${response.statusText}`)
    }

    const json = (await response.json()) as { data?: T; errors?: Array<{ message: string }> }
    if (json.errors?.length) {
      throw new Error(`Linear API error: ${json.errors.map(e => e.message).join(', ')}`)
    }
    return json.data as T
  }

  async createIssue(input: LinearCreateIssueInput): Promise<LinearIssue> {
    const data = await this.gql<{
      issueCreate: { issue: { id: string; identifier: string; title: string; url: string } }
    }>(
      `mutation CreateIssue($teamId: String!, $title: String!, $description: String) {
        issueCreate(input: { teamId: $teamId, title: $title, description: $description }) {
          issue { id identifier title url }
        }
      }`,
      { teamId: input.teamId, title: input.title, description: input.description }
    )
    return data.issueCreate.issue
  }

  async getIssue(issueId: string): Promise<LinearIssue> {
    const data = await this.gql<{
      issue: { id: string; identifier: string; title: string; url: string; state: { name: string } }
    }>(
      `query GetIssue($id: String!) {
        issue(id: $id) { id identifier title url state { name } }
      }`,
      { id: issueId }
    )
    return data.issue
  }

  async getIssueByIdentifier(identifier: string): Promise<LinearIssue | null> {
    const data = await this.gql<{
      issues: { nodes: Array<{ id: string; identifier: string; title: string; url: string; state: { name: string } }> }
    }>(
      `query GetIssueByIdentifier($filter: IssueFilter!) {
        issues(filter: $filter) {
          nodes { id identifier title url state { name } }
        }
      }`,
      { filter: { identifier: { eq: identifier } } }
    )
    return data.issues.nodes[0] ?? null
  }

  async addComment(issueId: string, body: string): Promise<void> {
    await this.gql(
      `mutation AddComment($issueId: String!, $body: String!) {
        commentCreate(input: { issueId: $issueId, body: $body }) {
          comment { id }
        }
      }`,
      { issueId, body }
    )
  }

  async getTeamStates(teamId: string): Promise<Array<{ id: string; name: string; type: string }>> {
    const data = await this.gql<{
      team: { states: { nodes: Array<{ id: string; name: string; type: string }> } }
    }>(
      `query GetTeamStates($teamId: String!) {
        team(id: $teamId) {
          states { nodes { id name type } }
        }
      }`,
      { teamId }
    )
    return data.team.states.nodes
  }

  async transitionIssue(issueId: string, stateId: string): Promise<void> {
    await this.gql(
      `mutation TransitionIssue($issueId: String!, $stateId: String!) {
        issueUpdate(id: $issueId, input: { stateId: $stateId }) {
          issue { id state { name } }
        }
      }`,
      { issueId, stateId }
    )
  }

  async getTeams(): Promise<Array<{ id: string; key: string; name: string }>> {
    const data = await this.gql<{
      teams: { nodes: Array<{ id: string; key: string; name: string }> }
    }>(
      `query GetTeams {
        teams { nodes { id key name } }
      }`
    )
    return data.teams.nodes
  }
}

// ─── Integration service ──────────────────────────────────────────────────────

export class LinearIntegration {
  private client: LinearClient
  private config: LinearIntegrationConfig

  constructor(config: LinearIntegrationConfig) {
    this.config = config
    const apiKey = process.env[config.api_key_env || 'LINEAR_API_KEY'] || ''
    this.client = new LinearClient(apiKey)
  }

  isEnabled(): boolean {
    return !!(
      this.config.enabled &&
      process.env[this.config.api_key_env || 'LINEAR_API_KEY']
    )
  }

  /** Called from babel start — creates a new issue or links to existing. */
  async onStart(workItem: WorkItem): Promise<Partial<WorkItem>> {
    if (!this.isEnabled()) return {}

    // If the work item ID looks like a Linear identifier (e.g. ENG-042), link it
    if (/^[A-Z]+-\d+$/.test(workItem.id)) {
      try {
        const issue = await this.client.getIssueByIdentifier(workItem.id)
        if (issue) {
          return {
            linear_issue_id: issue.id,
            linear_issue_url: issue.url,
            linear_issue_key: issue.identifier,
          }
        }
      } catch {
        // Identifier lookup failed — fall through to create
      }
    }

    if (!this.config.create_issue_on_start) return {}
    if (!this.config.team_id) return {}

    try {
      const issue = await this.client.createIssue({
        teamId: this.config.team_id,
        title: workItem.description,
        description: `Work item: ${workItem.id}\nBranch: ${workItem.branch}`,
      })
      return {
        linear_issue_id: issue.id,
        linear_issue_url: issue.url,
        linear_issue_key: issue.identifier,
      }
    } catch (err) {
      // Non-fatal — just don't link
      return {}
    }
  }

  /** Called from babel keep/refine/reject — adds a comment to the Linear issue. */
  async onCheckpoint(workItem: WorkItem, checkpoint: Checkpoint): Promise<void> {
    if (!this.isEnabled() || !this.config.add_checkpoint_comments) return
    if (!workItem.linear_issue_id) return

    const icons: Record<string, string> = {
      keep: '✓ KEEP',
      refine: '~ REFINE',
      reject: '✗ REJECT',
      ship: '🚀 SHIP',
    }

    const automationSummary = checkpoint.automation_results?.length
      ? '\n\n**Automation:**\n' +
        checkpoint.automation_results
          .map(r => `- ${r.passed ? '✓' : '✗'} ${r.name} (${r.duration_ms}ms)`)
          .join('\n')
      : ''

    const body = [
      `**${icons[checkpoint.verdict] || checkpoint.verdict}** checkpoint — ${checkpoint.id}`,
      checkpoint.notes ? `\n${checkpoint.notes}` : '',
      `\nCommit: \`${checkpoint.git_commit.slice(0, 7)}\``,
      automationSummary,
    ]
      .filter(Boolean)
      .join('')

    try {
      await this.client.addComment(workItem.linear_issue_id, body)
    } catch {
      // Non-fatal
    }
  }

  /** Called from babel ship — transitions the Linear issue to Done. */
  async onShip(workItem: WorkItem): Promise<void> {
    if (!this.isEnabled() || !this.config.transition_on_ship) return
    if (!workItem.linear_issue_id) return
    if (!this.config.team_id) return

    try {
      const states = await this.client.getTeamStates(this.config.team_id)
      const targetState = states.find(
        s => s.name.toLowerCase() === (this.config.ship_state || 'Done').toLowerCase()
      )
      if (targetState) {
        await this.client.transitionIssue(workItem.linear_issue_id, targetState.id)
      }
    } catch {
      // Non-fatal
    }
  }

  getIssueUrl(workItem: WorkItem): string | null {
    return workItem.linear_issue_url || null
  }
}
