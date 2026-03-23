import { Octokit } from '@octokit/rest'
import { execa } from 'execa'
import type { GitHubIntegrationConfig, WorkItem, Checkpoint } from '../types.js'

export interface PullRequest {
  number: number
  html_url: string
  state: string
  title: string
  draft: boolean
  mergeable?: boolean | null
}

export class GitHubIntegration {
  private octokit: Octokit
  private config: GitHubIntegrationConfig
  private repoPath: string

  constructor(config: GitHubIntegrationConfig, repoPath: string = process.cwd()) {
    this.config = config
    this.repoPath = repoPath
    const token = process.env[config.token_env || 'GITHUB_TOKEN'] || ''
    this.octokit = new Octokit({ auth: token || undefined })
  }

  isEnabled(): boolean {
    return !!(
      this.config.enabled &&
      process.env[this.config.token_env || 'GITHUB_TOKEN']
    )
  }

  private async getRepoInfo(): Promise<{ owner: string; repo: string }> {
    const result = await execa('git', ['remote', 'get-url', 'origin'], {
      cwd: this.repoPath,
      reject: false,
    })
    const url = result.stdout.trim()
    // Parse both HTTPS and SSH remote URLs
    const httpsMatch = url.match(/github\.com[/:]([^/]+)\/(.+?)(?:\.git)?$/)
    if (!httpsMatch) throw new Error(`Cannot parse GitHub remote URL: ${url}`)
    return { owner: httpsMatch[1], repo: httpsMatch[2] }
  }

  /** Called from babel pause — creates a draft PR. */
  async onPause(workItem: WorkItem, notes?: string): Promise<Partial<WorkItem>> {
    if (!this.isEnabled() || !this.config.create_draft_pr_on_pause) return {}

    try {
      const { owner, repo } = await this.getRepoInfo()
      const baseBranch = this.config.pr_base_branch || 'main'

      const body = buildPrBody(workItem, notes)

      const pr = await this.octokit.rest.pulls.create({
        owner,
        repo,
        title: `[${workItem.id}] ${workItem.description}`,
        head: workItem.branch,
        base: baseBranch,
        body,
        draft: true,
      })

      if (this.config.pr_labels?.length) {
        await this.octokit.rest.issues.addLabels({
          owner,
          repo,
          issue_number: pr.data.number,
          labels: this.config.pr_labels,
        }).catch(() => {}) // Non-fatal
      }

      return {
        pr_url: pr.data.html_url,
        pr_number: pr.data.number,
      }
    } catch (err) {
      // Non-fatal — log and continue
      return {}
    }
  }

  /** Called from babel ship (ship_via_pr mode) — creates a ready PR. */
  async onShip(workItem: WorkItem, baseBranch: string): Promise<void> {
    if (!this.isEnabled()) return

    try {
      const { owner, repo } = await this.getRepoInfo()

      // If we already have a PR, convert it from draft and mark ready
      if (workItem.pr_number) {
        await this.octokit.rest.pulls.update({
          owner,
          repo,
          pull_number: workItem.pr_number,
          draft: false,
        })

        if (this.config.pr_auto_merge) {
          await this.octokit.rest.pulls.merge({
            owner,
            repo,
            pull_number: workItem.pr_number,
            merge_method: 'squash',
            commit_title: `ship(${workItem.id}): ${workItem.description}`,
          })
        } else {
          console.log(`\n  PR ready for review: ${workItem.pr_url}`)
          console.log(`  Merge it when approved, then the branch will be cleaned up automatically.\n`)
        }
        return
      }

      // Create a new PR for ship
      const body = buildPrBody(workItem)
      const pr = await this.octokit.rest.pulls.create({
        owner,
        repo,
        title: `ship(${workItem.id}): ${workItem.description}`,
        head: workItem.branch,
        base: baseBranch,
        body,
        draft: false,
      })

      if (this.config.pr_labels?.length) {
        await this.octokit.rest.issues.addLabels({
          owner,
          repo,
          issue_number: pr.data.number,
          labels: this.config.pr_labels,
        }).catch(() => {})
      }

      if (this.config.pr_auto_merge) {
        await this.octokit.rest.pulls.merge({
          owner,
          repo,
          pull_number: pr.data.number,
          merge_method: 'squash',
          commit_title: `ship(${workItem.id}): ${workItem.description}`,
        })
        console.log(`\n  ✓ PR merged: ${pr.data.html_url}\n`)
      } else {
        console.log(`\n  PR created: ${pr.data.html_url}`)
        console.log(`  Merge it when approved.\n`)
      }
    } catch (err) {
      console.error(`  GitHub PR error: ${(err as Error).message}`)
      // Non-fatal in ship context — direct merge already happened
    }
  }

  /** Called from babel keep/refine/reject — posts checkpoint comment to open PR. */
  async onCheckpoint(workItem: WorkItem, checkpoint: Checkpoint): Promise<void> {
    if (!this.isEnabled() || !this.config.checkpoint_comments) return
    if (!workItem.pr_number) return

    try {
      const { owner, repo } = await this.getRepoInfo()
      const icons: Record<string, string> = {
        keep: '✅ KEEP',
        refine: '🔶 REFINE',
        reject: '❌ REJECT',
        ship: '🚀 SHIP',
      }

      const automationRows = checkpoint.automation_results?.length
        ? '\n\n| Check | Result | Duration |\n|---|---|---|\n' +
          checkpoint.automation_results
            .map(r => `| ${r.name} | ${r.passed ? '✅' : '❌'} | ${r.duration_ms}ms |`)
            .join('\n')
        : ''

      const body = [
        `### ${icons[checkpoint.verdict] || checkpoint.verdict} Checkpoint: \`${checkpoint.id}\``,
        '',
        checkpoint.notes ? `> ${checkpoint.notes}` : '',
        '',
        `**Commit:** \`${checkpoint.git_commit.slice(0, 7)}\` | **By:** ${checkpoint.called_by} (${checkpoint.caller_type})`,
        automationRows,
      ]
        .filter(s => s !== undefined)
        .join('\n')

      await this.octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: workItem.pr_number,
        body,
      })
    } catch {
      // Non-fatal
    }
  }

  async getPrStatus(workItem: WorkItem): Promise<{ state: string; checks_passing?: boolean } | null> {
    if (!this.isEnabled() || !workItem.pr_number) return null

    try {
      const { owner, repo } = await this.getRepoInfo()
      const pr = await this.octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: workItem.pr_number,
      })
      return {
        state: pr.data.state,
        checks_passing: pr.data.mergeable ?? undefined,
      }
    } catch {
      return null
    }
  }
}

function buildPrBody(workItem: WorkItem, pauseNotes?: string): string {
  const checkpointSummary = workItem.last_checkpoint
    ? `\n\n### Last Checkpoint\n- **Verdict:** ${workItem.last_checkpoint.verdict}\n- **Notes:** ${workItem.last_checkpoint.notes}\n- **Commit:** \`${workItem.last_checkpoint.git_commit.slice(0, 7)}\``
    : ''

  const linearLink = workItem.linear_issue_url
    ? `\n\n**Linear:** ${workItem.linear_issue_url}`
    : ''

  return [
    `## ${workItem.id}: ${workItem.description}`,
    '',
    pauseNotes ? `> ${pauseNotes}` : '',
    linearLink,
    checkpointSummary,
    '',
    '---',
    '_Created by [babelgit](https://github.com/alucas-hello/babelgit)_',
  ]
    .filter(s => s !== undefined)
    .join('\n')
}
