export type WorkflowStage =
  | 'todo'
  | 'in_progress'
  | 'paused'
  | 'run_session_open'
  | 'pr_open'
  | 'merged'
  | 'shipped'
  | 'stopped'

export type Verdict = 'keep' | 'refine' | 'reject' | 'ship'

export type CallerType = 'human' | 'agent'

export interface WorkItem {
  id: string
  description: string
  branch?: string
  stage: WorkflowStage
  created_at: string
  created_by: string
  planned_at?: string
  last_checkpoint?: Checkpoint
  paused_by?: string
  paused_at?: string
  paused_notes?: string
  ship_ready?: boolean
  // Integration fields
  linear_issue_id?: string
  linear_issue_url?: string
  linear_issue_key?: string
  pr_url?: string
  pr_number?: number
}

export interface Checkpoint {
  id: string
  work_item_id: string
  verdict: Verdict
  notes: string
  called_at: string
  called_by: string
  caller_type: CallerType
  git_commit: string
  git_branch: string
  filesystem_hash: string
  is_recovery_anchor: boolean
  previous_keep?: string
  // Automation results from run_commands
  automation_results?: AutomationResult[]
  refine_notes?: string
}

export interface AutomationResult {
  name: string
  passed: boolean
  exit_code: number
  duration_ms: number
  required: boolean
  stdout?: string
  stderr?: string
}

export interface RunSession {
  work_item_id: string
  started_at: string
  locked_commit: string
  locked_filesystem_hash: string
  status: 'open' | 'completed'
  automation_results?: AutomationResult[]
}

export interface BabelState {
  current_work_item_id?: string
  work_items: Record<string, WorkItem>
  next_local_id: number
}

// ─── Run command config ───────────────────────────────────────────────────────

export interface RunCommandConfig {
  name: string
  command: string
  background?: boolean
  required?: boolean
  capture_output?: boolean
  wait_for_output?: string
  timeout_ms?: number
  env?: Record<string, string>
}

// ─── Rules ────────────────────────────────────────────────────────────────────

export type RuleType =
  | 'commit_message_pattern'
  | 'path_restriction'
  | 'files_changed'
  | 'script'

export type RuleCaller = 'human' | 'agent' | 'any'

export interface BaseRule {
  name: string
  type: RuleType
  apply_to: string[]
  caller?: RuleCaller
  blocking?: boolean
  message?: string
}

export interface CommitMessagePatternRule extends BaseRule {
  type: 'commit_message_pattern'
  pattern: string
}

export interface PathRestrictionRule extends BaseRule {
  type: 'path_restriction'
  blocked_paths: string[]
}

export interface FilesChangedRule extends BaseRule {
  type: 'files_changed'
  if_changed: string
  require_also_changed: string
}

export interface ScriptRule extends BaseRule {
  type: 'script'
  command: string
  required_for?: string[]
}

export type Rule =
  | CommitMessagePatternRule
  | PathRestrictionRule
  | FilesChangedRule
  | ScriptRule

// ─── Integrations ─────────────────────────────────────────────────────────────

export interface LinearIntegrationConfig {
  enabled: boolean
  team_id?: string
  api_key_env?: string
  create_issue_on_start?: boolean
  transition_on_ship?: boolean
  ship_state?: string
  add_checkpoint_comments?: boolean
  label_in_progress?: string
}

export interface GitHubIntegrationConfig {
  enabled: boolean
  token_env?: string
  create_draft_pr_on_pause?: boolean
  ship_via_pr?: boolean
  pr_auto_merge?: boolean
  checkpoint_comments?: boolean
  pr_labels?: string[]
  pr_base_branch?: string
}

export interface IntegrationsConfig {
  linear?: LinearIntegrationConfig
  github?: GitHubIntegrationConfig
}

// ─── Main config ──────────────────────────────────────────────────────────────

export interface BabelConfig {
  version: number
  base_branch: string
  protected_branches: string[]
  branch_pattern: string
  work_item_id: {
    source: 'local' | 'jira' | 'linear'
    prefix: string
  }
  require_checkpoint_for: {
    pause: boolean
    ship: boolean
  }
  sync_strategy: 'rebase' | 'merge'
  agents: {
    permitted_branch_patterns: string[]
    require_attestation_before_pause: boolean
  }
  require_confirmation: string[]
  verdicts: {
    keep: string
    refine: string
    reject: string
    ship: string
  }
  keep_branch_after_ship?: boolean
  run_commands?: RunCommandConfig[]
  hooks?: {
    before_save?: string[]
    after_save?: string[]
    before_run?: string[]
    after_run?: string[]
    before_ship?: string[]
    after_ship?: string[]
    before_pause?: string[]
    after_pause?: string[]
  }
  rules?: Rule[]
  integrations?: IntegrationsConfig
}

export interface GovernanceCheck {
  operation: string
  branch?: string
  caller: CallerType
}

export interface GovernanceResult {
  permitted: boolean
  reason?: string
  suggestion?: string
}

// ─── MCP response types ───────────────────────────────────────────────────────

export interface StateResponse {
  work_item: WorkItem | null
  git: {
    uncommitted_files: number
    commits_ahead_of_base: number
    last_synced_minutes_ago: number | null
    has_conflicts: boolean
    current_branch: string
  }
  last_checkpoint: {
    verdict: Verdict
    sequence: number
    notes: string
    minutes_ago: number
    commit: string
    automation_results?: AutomationResult[]
    refine_notes?: string
  } | null
  run_session: RunSession | null
  permitted_operations: string[]
  blocked_operations: Record<string, string>
  suggested_next: string
  integrations?: {
    linear?: { issue_url?: string; issue_key?: string; status?: string }
    github?: { pr_url?: string; pr_number?: number }
  }
}
