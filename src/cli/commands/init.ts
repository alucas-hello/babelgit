import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import inquirer from 'inquirer'
import { isGitRepo, getDefaultBranch } from '../../core/git.js'
import { configExists, writeConfig } from '../../core/config.js'
import { ensureBabelDir, saveState } from '../../core/state.js'
import { installHooks } from '../../core/enforce.js'
import { error, success, hint, info } from '../display.js'
import type { BabelConfig } from '../../types.js'

// ─── Workflow templates ───────────────────────────────────────────────────────

const TEMPLATES: Record<string, (baseBranch: string, prefix: string) => Partial<BabelConfig>> = {
  solo: (baseBranch, prefix) => ({
    version: 1,
    base_branch: baseBranch,
    protected_branches: [baseBranch],
    branch_pattern: 'feature/{id}-{slug}',
    work_item_id: { source: 'local', prefix },
    require_checkpoint_for: { pause: false, ship: true },
    sync_strategy: 'rebase',
    agents: {
      permitted_branch_patterns: ['feature/*', 'fix/*'],
      require_attestation_before_pause: true,
    },
    require_confirmation: ['stop', 'ship'],
    verdicts: { keep: 'keep', refine: 'refine', reject: 'reject', ship: 'ship' },
  }),

  standard: (baseBranch, prefix) => ({
    version: 1,
    base_branch: baseBranch,
    protected_branches: [baseBranch, 'production'],
    branch_pattern: 'feature/{id}-{slug}',
    work_item_id: { source: 'local', prefix },
    require_checkpoint_for: { pause: true, ship: true },
    sync_strategy: 'rebase',
    agents: {
      permitted_branch_patterns: ['feature/*', 'fix/*'],
      require_attestation_before_pause: true,
    },
    require_confirmation: ['stop', 'ship'],
    verdicts: { keep: 'review', refine: 'refine', reject: 'reject', ship: 'ship' },
    rules: [
      {
        name: 'agents cannot modify config files',
        type: 'path_restriction' as const,
        caller: 'agent' as const,
        blocked_paths: ['*.config.*', 'package.json', '.env*', 'babel.config.yml'],
        apply_to: ['save', 'ship'],
        blocking: true,
      },
    ],
  }),

  cd: (baseBranch, prefix) => ({
    version: 1,
    base_branch: baseBranch,
    protected_branches: [baseBranch],
    branch_pattern: 'feature/{id}-{slug}',
    work_item_id: { source: 'local', prefix },
    require_checkpoint_for: { pause: false, ship: true },
    sync_strategy: 'rebase',
    agents: {
      permitted_branch_patterns: ['feature/*', 'fix/*'],
      require_attestation_before_pause: true,
    },
    require_confirmation: ['stop'],
    verdicts: { keep: 'ready', refine: 'refine', reject: 'reject', ship: 'deploy' },
    hooks: {
      before_ship: ['npm run build'],
    },
  }),

  enterprise: (baseBranch, prefix) => ({
    version: 1,
    base_branch: baseBranch,
    protected_branches: [baseBranch, 'staging', 'production'],
    branch_pattern: 'feature/{id}-{slug}',
    work_item_id: { source: 'local', prefix },
    require_checkpoint_for: { pause: true, ship: true },
    sync_strategy: 'merge',
    agents: {
      permitted_branch_patterns: ['feature/*'],
      require_attestation_before_pause: true,
    },
    require_confirmation: ['stop', 'ship'],
    verdicts: { keep: 'approved', refine: 'needs-changes', reject: 'rejected', ship: 'deploy' },
    rules: [
      {
        name: 'agents cannot modify config files',
        type: 'path_restriction' as const,
        caller: 'agent' as const,
        blocked_paths: ['*.config.*', 'package.json', '.env*', 'babel.config.yml', 'Dockerfile*'],
        apply_to: ['save', 'ship'],
        blocking: true,
      },
      {
        name: 'conventional commits required',
        type: 'commit_message_pattern' as const,
        pattern: '^(feat|fix|docs|test|refactor|chore|ci|perf)\\(.+\\):',
        apply_to: ['save'],
        caller: 'any' as const,
        blocking: true,
      },
    ],
  }),
}

const TEMPLATE_CHOICES = [
  {
    name: 'Solo / Small Team        (In Progress → Review → Done)',
    value: 'solo',
  },
  {
    name: 'Standard Agile           (In Progress → In Review → Testing → Done)',
    value: 'standard',
  },
  {
    name: 'Continuous Delivery      (In Progress → Ready → Deploy)',
    value: 'cd',
  },
  {
    name: 'Enterprise / Regulated   (In Progress → Peer Review → QA → Staging → Production)',
    value: 'enterprise',
  },
  {
    name: 'Custom (configure from scratch)',
    value: 'custom',
  },
]

export async function runInit(repoPath: string = process.cwd()): Promise<void> {
  if (!(await isGitRepo(repoPath))) {
    error(
      'No git repository found.',
      undefined,
      "Run this command from inside a git repository, or run 'git init' first."
    )
    process.exit(1)
  }

  if (await configExists(repoPath)) {
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: 'babel.config.yml already exists. Overwrite it?',
        default: false,
      },
    ])
    if (!overwrite) {
      info('Keeping existing babel.config.yml.')
      process.exit(0)
    }
  }

  const detectedBase = await getDefaultBranch(repoPath)

  // Template selection
  const { template } = await inquirer.prompt([
    {
      type: 'list',
      name: 'template',
      message: 'Choose a workflow template:',
      choices: TEMPLATE_CHOICES,
    },
  ])

  // Core settings
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'base_branch',
      message: 'Base branch (the branch everyone starts from)?',
      default: detectedBase,
    },
    {
      type: 'input',
      name: 'prefix',
      message: 'Work item ID prefix?',
      default: 'WI',
    },
  ])

  let config: Partial<BabelConfig>

  if (template === 'custom') {
    const custom = await inquirer.prompt([
      {
        type: 'input',
        name: 'protected_branches',
        message: 'Protected branches (comma-separated)?',
        default: answers.base_branch,
        filter: (input: string) => input.split(',').map((s: string) => s.trim()).filter(Boolean),
      },
      {
        type: 'list',
        name: 'sync_strategy',
        message: 'Sync strategy?',
        choices: ['rebase', 'merge'],
        default: 'rebase',
      },
    ])

    config = {
      version: 1,
      base_branch: answers.base_branch,
      protected_branches: custom.protected_branches,
      branch_pattern: 'feature/{id}-{slug}',
      work_item_id: { source: 'local', prefix: answers.prefix },
      require_checkpoint_for: { pause: false, ship: true },
      sync_strategy: custom.sync_strategy,
      agents: {
        permitted_branch_patterns: ['feature/*', 'fix/*'],
        require_attestation_before_pause: true,
      },
      require_confirmation: ['stop', 'ship'],
      verdicts: { keep: 'keep', refine: 'refine', reject: 'reject', ship: 'ship' },
    }
  } else {
    config = TEMPLATES[template](answers.base_branch, answers.prefix)
  }

  await writeConfig(config, repoPath)
  await ensureBabelDir(repoPath)
  await saveState({ work_items: {}, next_local_id: 1 }, repoPath)
  await updateGitignore(repoPath)

  // Install enforcement hooks by default
  const { installed: hooksInstalled, skipped: hooksSkipped } = await installHooks(repoPath)

  console.log()
  success('babelgit initialized!')
  console.log()
  console.log(`  Template: ${TEMPLATE_CHOICES.find(t => t.value === template)?.name}`)
  console.log()
  console.log('  Created:')
  console.log('    babel.config.yml   ← commit this to share with your team')
  console.log('    .babel/            ← local state (gitignored)')

  if (hooksInstalled.length > 0) {
    console.log(`    .git/hooks/        ← enforcement hooks installed (${hooksInstalled.join(', ')})`)
  }
  if (hooksSkipped.length > 0) {
    console.log()
    info(`Enforcement hooks skipped for ${hooksSkipped.join(', ')} — existing hooks found.`)
    info("Run 'babel enforce' to manage hooks manually.")
  }

  console.log()
  console.log('  Next step:')
  hint("babel start \"describe what you're working on\"")
  console.log()
}

async function updateGitignore(repoPath: string): Promise<void> {
  const gitignorePath = path.join(repoPath, '.gitignore')
  let content = ''
  try {
    content = await readFile(gitignorePath, 'utf-8')
  } catch {
    // File doesn't exist — create it
  }

  if (!content.includes('.babel/')) {
    const addition = content.endsWith('\n') || content === '' ? '.babel/\n' : '\n.babel/\n'
    await writeFile(gitignorePath, content + addition, 'utf-8')
  }
}
