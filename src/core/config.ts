import { readFile, writeFile, access } from 'fs/promises'
import path from 'path'
import { parse, stringify } from 'yaml'
import { z } from 'zod'
import type { BabelConfig } from '../types.js'

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
    const result = ConfigSchema.parse(parsed)
    return result as BabelConfig
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('NO_CONFIG')
    }
    throw new Error(`Invalid babel.config.yml: ${(err as Error).message}`)
  }
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
