export type WorkflowStage =
  | 'in_progress'
  | 'paused'
  | 'run_session_open'
  | 'shipped'
  | 'stopped'

export type Verdict = 'keep' | 'refine' | 'reject' | 'ship'

export type CallerType = 'human' | 'agent'

export interface WorkItem {
  id: string
  description: string
  branch: string
  stage: WorkflowStage
  created_at: string
  created_by: string
  last_checkpoint?: Checkpoint
  paused_by?: string
  paused_at?: string
  paused_notes?: string
  ship_ready?: boolean
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
}

export interface RunSession {
  work_item_id: string
  started_at: string
  locked_commit: string
  locked_filesystem_hash: string
  status: 'open' | 'completed'
}

export interface BabelState {
  current_work_item_id?: string
  work_items: Record<string, WorkItem>
  next_local_id: number
}

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

// MCP response types
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
  } | null
  run_session: RunSession | null
  permitted_operations: string[]
  blocked_operations: Record<string, string>
  suggested_next: string
}
