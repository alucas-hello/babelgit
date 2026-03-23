import { readFile, writeFile, mkdir, access } from 'fs/promises'
import path from 'path'
import inquirer from 'inquirer'
import { isGitRepo, getDefaultBranch } from '../../core/git.js'
import { configExists, writeConfig } from '../../core/config.js'
import { ensureBabelDir, saveState } from '../../core/state.js'
import { error, success, hint, info } from '../display.js'

export async function runInit(repoPath: string = process.cwd()): Promise<void> {
  // Must be a git repo
  if (!(await isGitRepo(repoPath))) {
    error(
      'No git repository found.',
      undefined,
      "Run this command from inside a git repository, or run 'git init' first."
    )
    process.exit(1)
  }

  // Check for existing config
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

  // Detect default branch
  const detectedBase = await getDefaultBranch(repoPath)

  // Interactive prompts
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'base_branch',
      message: 'Base branch (the branch everyone starts from)?',
      default: detectedBase,
    },
    {
      type: 'input',
      name: 'protected_branches',
      message: 'Protected branches (comma-separated)?',
      default: 'main',
      filter: (input: string) => input.split(',').map((s: string) => s.trim()).filter(Boolean),
    },
    {
      type: 'input',
      name: 'prefix',
      message: 'Work item ID prefix?',
      default: 'WI',
    },
  ])

  const config = {
    version: 1,
    base_branch: answers.base_branch,
    protected_branches: answers.protected_branches,
    branch_pattern: 'feature/{id}-{slug}',
    work_item_id: {
      source: 'local' as const,
      prefix: answers.prefix,
    },
    require_checkpoint_for: {
      pause: false,
      ship: true,
    },
    sync_strategy: 'rebase' as const,
    agents: {
      permitted_branch_patterns: ['feature/*', 'fix/*'],
      require_attestation_before_pause: true,
    },
    require_confirmation: ['stop', 'ship'],
    verdicts: {
      keep: 'keep',
      refine: 'refine',
      reject: 'reject',
      ship: 'ship',
    },
  }

  await writeConfig(config, repoPath)

  // Create .babel/ directory and initial state
  await ensureBabelDir(repoPath)
  await saveState({ work_items: {}, next_local_id: 1 }, repoPath)

  // Update .gitignore
  await updateGitignore(repoPath)

  console.log()
  success('babelgit initialized!')
  console.log()
  console.log('  Created:')
  console.log('    babel.config.yml   ← commit this to share with your team')
  console.log('    .babel/            ← local state (gitignored)')
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
