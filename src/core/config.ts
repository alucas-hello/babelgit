import { readFile, writeFile, access } from 'fs/promises'
import path from 'path'
import { parse, stringify } from 'yaml'
import { z } from 'zod'
import type { BabelConfig } from '../types.js'

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
