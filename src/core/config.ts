import { readFile, writeFile, access } from 'fs/promises'
import path from 'path'
import { parse, stringify } from 'yaml'
import { z } from 'zod'
import type { BabelConfig, PolicyDef } from '../types.js'

const RunCommandSchema = z.object({
  name: z.string(),
  command: z.string(),
  background: z.boolean().optional(),
  required: z.boolean().default(true),
  capture_output: z.boolean().default(false),
  wait_for_output: z.string().optional(),
  timeout_ms: z.number().optional(),
  env: z.record(z.string()).optional(),
})

const RuleSchema = z.discriminatedUnion('type', [
  z.object({
    name: z.string(),
    type: z.literal('commit_message_pattern'),
    pattern: z.string(),
    apply_to: z.array(z.string()).default(['save']),
    caller: z.enum(['human', 'agent', 'any']).default('any'),
    blocking: z.boolean().default(true),
    message: z.string().optional(),
  }),
  z.object({
    name: z.string(),
    type: z.literal('path_restriction'),
    blocked_paths: z.array(z.string()),
    apply_to: z.array(z.string()).default(['save', 'ship']),
    caller: z.enum(['human', 'agent', 'any']).default('agent'),
    blocking: z.boolean().default(true),
    message: z.string().optional(),
  }),
  z.object({
    name: z.string(),
    type: z.literal('files_changed'),
    if_changed: z.string(),
    require_also_changed: z.string(),
    apply_to: z.array(z.string()).default(['keep', 'ship']),
    caller: z.enum(['human', 'agent', 'any']).default('any'),
    blocking: z.boolean().default(true),
    message: z.string().optional(),
  }),
  z.object({
    name: z.string(),
    type: z.literal('script'),
    command: z.string(),
    required_for: z.array(z.string()).optional(),
    apply_to: z.array(z.string()).default(['keep', 'ship']),
    caller: z.enum(['human', 'agent', 'any']).default('any'),
    blocking: z.boolean().default(true),
    message: z.string().optional(),
  }),
])

const LinearConfigSchema = z.object({
  enabled: z.boolean().default(false),
  team_id: z.string().optional(),
  api_key_env: z.string().default('LINEAR_API_KEY'),
  create_issue_on_start: z.boolean().default(true),
  transition_on_ship: z.boolean().default(true),
  ship_state: z.string().default('Done'),
  add_checkpoint_comments: z.boolean().default(true),
  label_in_progress: z.string().optional(),
})

const GitHubConfigSchema = z.object({
  enabled: z.boolean().default(false),
  token_env: z.string().default('GITHUB_TOKEN'),
  create_draft_pr_on_pause: z.boolean().default(false),
  ship_via_pr: z.boolean().default(false),
  pr_auto_merge: z.boolean().default(false),
  checkpoint_comments: z.boolean().default(true),
  pr_labels: z.array(z.string()).default([]),
  pr_base_branch: z.string().optional(),
})

const PolicyDefSchema = z.object({
  name: z.string(),
  on: z.array(z.string()),
  when: z.object({
    caller: z.enum(['human', 'agent']).optional(),
    stage: z.union([
      z.enum(['todo', 'in_progress', 'paused', 'run_session_open', 'pr_open', 'merged', 'shipped', 'stopped']),
      z.array(z.enum(['todo', 'in_progress', 'paused', 'run_session_open', 'pr_open', 'merged', 'shipped', 'stopped'])),
    ]).optional(),
  }).optional(),
  condition: z.string(),
  params: z.record(z.unknown()).optional(),
  enforcement: z.enum(['hard', 'soft', 'advisory']).optional(),
  deny: z.string(),
  suggest: z.string().optional(),
  enabled: z.boolean().optional(),
})

const HooksSchema = z.object({
  before_save: z.array(z.string()).default([]),
  after_save: z.array(z.string()).default([]),
  before_run: z.array(z.string()).default([]),
  after_run: z.array(z.string()).default([]),
  before_ship: z.array(z.string()).default([]),
  after_ship: z.array(z.string()).default([]),
  before_pause: z.array(z.string()).default([]),
  after_pause: z.array(z.string()).default([]),
}).default({})

const ConfigSchema = z.object({
  version: z.number(),
  base_branch: z.string().default('main'),
  protected_branches: z.array(z.string()).default(['main']),
  branch_pattern: z.string().default('feature/{id}-{slug}'),
  work_item_id: z
    .object({
      source: z.enum(['local', 'jira', 'linear']).default('local'),
      prefix: z.string().default('WI'),
    })
    .default({ source: 'local', prefix: 'WI' }),
  require_checkpoint_for: z
    .object({
      pause: z.boolean().default(false),
      ship: z.boolean().default(true),
    })
    .default({ pause: false, ship: true }),
  sync_strategy: z.enum(['rebase', 'merge']).default('rebase'),
  agents: z
    .object({
      permitted_branch_patterns: z.array(z.string()).default(['feature/*', 'fix/*']),
      require_attestation_before_pause: z.boolean().default(true),
    })
    .default({ permitted_branch_patterns: ['feature/*', 'fix/*'], require_attestation_before_pause: true }),
  require_confirmation: z.array(z.string()).default(['stop', 'ship']),
  verdicts: z
    .object({
      keep: z.string().default('keep'),
      refine: z.string().default('refine'),
      reject: z.string().default('reject'),
      ship: z.string().default('ship'),
    })
    .default({ keep: 'keep', refine: 'refine', reject: 'reject', ship: 'ship' }),
  keep_branch_after_ship: z.boolean().default(false),
  run_commands: z.array(RunCommandSchema).default([]),
  hooks: HooksSchema,
  rules: z.array(RuleSchema).default([]),
  policies: z.array(PolicyDefSchema).optional(),
  integrations: z
    .object({
      linear: LinearConfigSchema.optional(),
      github: GitHubConfigSchema.optional(),
    })
    .default({}),
})

export async function configExists(repoPath: string = process.cwd()): Promise<boolean> {
  try {
    await access(path.join(repoPath, 'babel.config.yml'))
    return true
  } catch {
    return false
  }
}

export async function loadConfig(repoPath: string = process.cwd()): Promise<BabelConfig> {
  const configPath = path.join(repoPath, 'babel.config.yml')
  try {
    const raw = await readFile(configPath, 'utf-8')
    const parsed = parse(raw)
    const result = ConfigSchema.parse(parsed) as BabelConfig
    // Synthesize policies from v1 shortcut fields
    result.policies = synthesizePolicies(result)
    return result
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('NO_CONFIG')
    }
    throw new Error(`Invalid babel.config.yml: ${(err as Error).message}`)
  }
}

/**
 * Synthesize PolicyDef[] from v1 config fields (protected_branches, agents, rules, etc.)
 * If an explicit policy with the same name exists in config.policies, the explicit one wins.
 */
function synthesizePolicies(config: BabelConfig): PolicyDef[] {
  const explicit = config.policies || []
  const explicitNames = new Set(explicit.map(p => p.name))
  const synthesized: PolicyDef[] = []

  const stateChangingOps = ['start', 'save', 'sync', 'pause', 'continue', 'stop', 'run', 'keep', 'refine', 'reject', 'ship_verdict', 'ship']

  // Always synthesize no-active-work-item check for start
  if (!explicitNames.has('no-active-work-item-check')) {
    synthesized.push({
      name: 'no-active-work-item-check',
      on: ['start'],
      condition: 'no_active_work_item',
      deny: "There is already an active work item: {active_wi_id} — \"{active_wi_description}\".",
      suggest: "Run 'babel pause' to pause current work, then start a new work item.",
    })
  }

  // protected_branches → branch-protection policy
  if (config.protected_branches.length > 0 && !explicitNames.has('branch-protection')) {
    synthesized.push({
      name: 'branch-protection',
      on: stateChangingOps,
      condition: 'branch_is_protected',
      deny: "Branch '{branch}' is protected and cannot be modified directly.",
      suggest: `Use 'babel ship' to merge your work into the protected branch through the proper workflow.`,
    })
  }

  // agents.permitted_branch_patterns → agent-branch-restriction
  if (config.agents.permitted_branch_patterns?.length > 0 && !explicitNames.has('agent-branch-restriction')) {
    synthesized.push({
      name: 'agent-branch-restriction',
      on: ['start'],
      when: { caller: 'agent' },
      condition: 'branch_not_matching',
      params: { patterns: config.agents.permitted_branch_patterns },
      deny: "Agents are not permitted to operate on branch '{branch}'.",
      suggest: `Permitted branch patterns: {patterns}. Create a new work item with 'babel_start()'.`,
    })
  }

  // require_checkpoint_for.ship → ship-requires-checkpoint
  if (config.require_checkpoint_for.ship && !explicitNames.has('ship-requires-checkpoint')) {
    synthesized.push({
      name: 'ship-requires-checkpoint',
      on: ['ship'],
      condition: 'has_checkpoint',
      params: { verdict: ['ship', 'keep'], anchor: true },
      deny: "No verified checkpoint. Run a review session first.",
      suggest: "Run 'babel run' and call a verdict ('babel keep' or 'babel ship'), then try 'babel ship' again.",
    })
  }

  // require_checkpoint_for.pause → pause-requires-checkpoint
  if (config.require_checkpoint_for.pause && !explicitNames.has('pause-requires-checkpoint')) {
    synthesized.push({
      name: 'pause-requires-checkpoint',
      on: ['pause'],
      condition: 'has_checkpoint',
      params: { anchor: true },
      deny: "babel.config.yml requires a verified checkpoint before pausing.",
      suggest: "Run 'babel run' and call 'babel keep' or 'babel ship', then try 'babel pause' again.",
    })
  }

  // agents.require_attestation_before_pause → agent-pause-requires-attestation
  if (config.agents.require_attestation_before_pause && !explicitNames.has('agent-pause-requires-attestation')) {
    synthesized.push({
      name: 'agent-pause-requires-attestation',
      on: ['pause'],
      when: { caller: 'agent' },
      condition: 'all_of',
      params: {
        conditions: [
          { condition: 'has_checkpoint', params: { min_count: 1 } },
          { condition: 'no_open_run_session', params: {} },
        ],
      },
      deny: "Agents must attest their work before pausing. Run a review session and close it with a verdict first.",
      suggest: "Call 'babel_run()' then 'babel_attest()' before pausing.",
    })
  }

  // Synthesize from rules entries
  if (config.rules?.length) {
    for (const rule of config.rules) {
      if (explicitNames.has(rule.name)) continue

      switch (rule.type) {
        case 'commit_message_pattern':
          synthesized.push({
            name: rule.name,
            on: rule.apply_to,
            when: rule.caller && rule.caller !== 'any' ? { caller: rule.caller as 'human' | 'agent' } : undefined,
            condition: 'commit_message_matches',
            params: { pattern: rule.pattern },
            enforcement: rule.blocking === false ? 'advisory' : 'hard',
            deny: rule.message || `Commit message does not match required pattern: ${rule.pattern}`,
          })
          break
        case 'path_restriction':
          synthesized.push({
            name: rule.name,
            on: rule.apply_to,
            when: rule.caller && rule.caller !== 'any' ? { caller: rule.caller as 'human' | 'agent' } : undefined,
            condition: 'no_files_matching',
            params: { patterns: rule.blocked_paths },
            enforcement: rule.blocking === false ? 'advisory' : 'hard',
            deny: rule.message || 'You are not permitted to modify restricted files: {matched_files}',
          })
          break
        case 'files_changed':
          synthesized.push({
            name: rule.name,
            on: rule.apply_to,
            when: rule.caller && rule.caller !== 'any' ? { caller: rule.caller as 'human' | 'agent' } : undefined,
            condition: 'files_coupled',
            params: { if_changed: rule.if_changed, must_also_change: rule.require_also_changed },
            enforcement: rule.blocking === false ? 'advisory' : 'hard',
            deny: rule.message || `When changing files matching '{if_changed}', you must also change files matching '{must_also_change}'.`,
          })
          break
        case 'script':
          synthesized.push({
            name: rule.name,
            on: rule.apply_to,
            when: rule.caller && rule.caller !== 'any' ? { caller: rule.caller as 'human' | 'agent' } : undefined,
            condition: 'script_passes',
            params: { command: rule.command },
            enforcement: rule.blocking === false ? 'advisory' : 'hard',
            deny: rule.message || `Rule script failed: ${rule.command} (exit {exit_code})`,
          })
          break
      }
    }
  }

  // Merge: explicit policies override synthesized ones
  return [...synthesized, ...explicit]
}

export async function writeConfig(config: Partial<BabelConfig>, repoPath: string = process.cwd()): Promise<void> {
  const configPath = path.join(repoPath, 'babel.config.yml')
  const yamlContent = [
    '# babel.config.yml',
    '# This file is the team\'s working agreement.',
    '# Commit it. Review changes to it. It applies equally to everyone.',
    '',
    stringify(config),
  ].join('\n')
  await writeFile(configPath, yamlContent, 'utf-8')
}

export function matchesPattern(branch: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (pattern === branch) return true
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2)
      if (branch.startsWith(prefix + '/')) return true
    }
    if (pattern === '*') return true
  }
  return false
}

export function matchesGlob(filePath: string, pattern: string): boolean {
  // Simple glob: supports *, ** and ?
  // /**/ matches zero or more path segments (e.g. src/**/*.ts matches src/index.ts)
  // Replace /**/ first with a placeholder (no * chars) to avoid the * → [^/]* pass corrupting it
  const regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\/\*\*\//g, '__GLOB_SEG__')  // /**/ → placeholder (slashes consumed)
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/__GLOB_SEG__/g, '/([^/]+/)*') // restore: zero or more path segments
  return new RegExp(`^${regexStr}$`).test(filePath)
}

export function validateConfig(config: unknown): { valid: boolean; errors: string[] } {
  const result = ConfigSchema.safeParse(config)
  if (result.success) return { valid: true, errors: [] }
  return {
    valid: false,
    errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
  }
}
