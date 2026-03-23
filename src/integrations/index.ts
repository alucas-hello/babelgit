import type { BabelConfig, WorkItem, Checkpoint } from '../types.js'
import { LinearIntegration } from './linear.js'
import { GitHubIntegration } from './github.js'
import { saveWorkItem } from '../core/state.js'

/**
 * IntegrationManager coordinates all enabled integrations.
 * All methods are non-fatal — integration errors never block git operations.
 */
export class IntegrationManager {
  private linear?: LinearIntegration
  private github?: GitHubIntegration
  private repoPath: string
  private config: BabelConfig

  constructor(config: BabelConfig, repoPath: string = process.cwd()) {
    this.config = config
    this.repoPath = repoPath

    if (config.integrations?.linear?.enabled) {
      this.linear = new LinearIntegration(config.integrations.linear)
    }
    if (config.integrations?.github?.enabled) {
      this.github = new GitHubIntegration(config.integrations.github, repoPath)
    }
  }

  /** Called after babel start — links/creates external tickets and updates work item. */
  async onStart(workItem: WorkItem): Promise<WorkItem> {
    let updated = { ...workItem }

    if (this.linear?.isEnabled()) {
      try {
        const linearFields = await this.linear.onStart(workItem)
        if (Object.keys(linearFields).length > 0) {
          updated = { ...updated, ...linearFields }
          await saveWorkItem(updated, this.repoPath)
          if (linearFields.linear_issue_url) {
            console.log(`  Linear: ${linearFields.linear_issue_url}`)
          }
        }
      } catch {
        // Non-fatal
      }
    }

    return updated
  }

  /** Called after babel pause — creates draft PR if configured. */
  async onPause(workItem: WorkItem, notes?: string): Promise<WorkItem> {
    let updated = { ...workItem }

    if (this.github?.isEnabled()) {
      try {
        const ghFields = await this.github.onPause(workItem, notes)
        if (Object.keys(ghFields).length > 0) {
          updated = { ...updated, ...ghFields }
          await saveWorkItem(updated, this.repoPath)
          if (ghFields.pr_url) {
            console.log(`  GitHub PR: ${ghFields.pr_url}`)
          }
        }
      } catch {
        // Non-fatal
      }
    }

    return updated
  }

  /** Called after verdict — posts comments to Linear and GitHub PR. */
  async onCheckpoint(workItem: WorkItem, checkpoint: Checkpoint): Promise<void> {
    await Promise.allSettled([
      this.linear?.onCheckpoint(workItem, checkpoint),
      this.github?.onCheckpoint(workItem, checkpoint),
    ])
  }

  /** Called from babel ship — transitions Linear issue, creates/merges GitHub PR. */
  async onShip(workItem: WorkItem): Promise<void> {
    await Promise.allSettled([
      this.linear?.onShip(workItem),
      this.github
        ? this.github.onShip(workItem, this.config.integrations?.github?.pr_base_branch || this.config.base_branch)
        : undefined,
    ])
  }

  hasAnyEnabled(): boolean {
    return !!(this.linear?.isEnabled() || this.github?.isEnabled())
  }

  getLinear(): LinearIntegration | undefined {
    return this.linear
  }

  getGitHub(): GitHubIntegration | undefined {
    return this.github
  }
}
