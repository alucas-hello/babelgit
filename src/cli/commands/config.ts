import { readFile } from 'fs/promises'
import path from 'path'
import { parse, stringify } from 'yaml'
import { loadConfig, validateConfig, configExists } from '../../core/config.js'
import { error, success, info, divider } from '../display.js'
import chalk from 'chalk'

export async function runConfigShow(repoPath: string = process.cwd()): Promise<void> {
  if (!(await configExists(repoPath))) {
    error('No babel.config.yml found.', undefined, "Run 'babel init' to set up babelgit.")
    process.exit(1)
  }

  const config = await loadConfig(repoPath)

  console.log('\n' + divider())
  console.log(`  ${chalk.bold('Effective configuration')}`)
  console.log(divider())
  console.log()

  // Print key sections
  console.log(`  ${chalk.bold('Workflow')}`)
  console.log(`    Base branch:      ${chalk.cyan(config.base_branch)}`)
  console.log(`    Protected:        ${config.protected_branches.join(', ')}`)
  console.log(`    Branch pattern:   ${config.branch_pattern}`)
  console.log(`    Sync strategy:    ${config.sync_strategy}`)
  console.log()

  console.log(`  ${chalk.bold('Work Items')}`)
  console.log(`    ID source:        ${config.work_item_id.source}`)
  console.log(`    Prefix:           ${config.work_item_id.prefix}`)
  console.log()

  console.log(`  ${chalk.bold('Governance')}`)
  console.log(`    Checkpoint for pause:  ${config.require_checkpoint_for.pause}`)
  console.log(`    Checkpoint for ship:   ${config.require_checkpoint_for.ship}`)
  console.log(`    Human confirmation:    ${config.require_confirmation.join(', ') || 'none'}`)
  console.log()

  if (config.run_commands?.length) {
    console.log(`  ${chalk.bold('Run Commands')} (${config.run_commands.length})`)
    for (const cmd of config.run_commands) {
      const flags = [
        cmd.background ? 'background' : 'foreground',
        cmd.required !== false ? 'required' : 'optional',
      ].join(', ')
      console.log(`    ${cmd.name}: ${chalk.dim(cmd.command)}  [${flags}]`)
    }
    console.log()
  }

  if (config.hooks) {
    const activeHooks = Object.entries(config.hooks).filter(([, v]) => v && (v as string[]).length > 0)
    if (activeHooks.length > 0) {
      console.log(`  ${chalk.bold('Hooks')} (${activeHooks.length} active)`)
      for (const [name, cmds] of activeHooks) {
        console.log(`    ${name}: ${(cmds as string[]).join(', ')}`)
      }
      console.log()
    }
  }

  if (config.rules?.length) {
    console.log(`  ${chalk.bold('Rules')} (${config.rules.length})`)
    for (const rule of config.rules) {
      console.log(`    ${rule.name} [${rule.type}] → applies to: ${rule.apply_to.join(', ')} (${rule.caller || 'any'})`)
    }
    console.log()
  }

  if (config.integrations?.linear?.enabled) {
    console.log(`  ${chalk.bold('Linear')}`)
    const lin = config.integrations.linear
    const keyEnv = lin.api_key_env || 'LINEAR_API_KEY'
    const hasKey = !!process.env[keyEnv]
    console.log(`    Team:             ${lin.team_id || chalk.dim('not set')}`)
    console.log(`    API key env:      ${keyEnv} ${hasKey ? chalk.green('✓') : chalk.red('✗ not set')}`)
    console.log(`    Create on start:  ${lin.create_issue_on_start}`)
    console.log()
  }

  if (config.integrations?.github?.enabled) {
    console.log(`  ${chalk.bold('GitHub')}`)
    const gh = config.integrations.github
    const keyEnv = gh.token_env || 'GITHUB_TOKEN'
    const hasKey = !!process.env[keyEnv]
    console.log(`    Token env:        ${keyEnv} ${hasKey ? chalk.green('✓') : chalk.red('✗ not set')}`)
    console.log(`    Draft PR on pause: ${gh.create_draft_pr_on_pause}`)
    console.log(`    Ship via PR:       ${gh.ship_via_pr}`)
    console.log()
  }

  console.log(divider() + '\n')
}

export async function runConfigValidate(repoPath: string = process.cwd()): Promise<void> {
  if (!(await configExists(repoPath))) {
    error('No babel.config.yml found.', undefined, "Run 'babel init' to set up babelgit.")
    process.exit(1)
  }

  const configPath = path.join(repoPath, 'babel.config.yml')
  const raw = await readFile(configPath, 'utf-8').catch(() => {
    error('Could not read babel.config.yml.')
    process.exit(1)
    return ''
  })

  let parsed: unknown
  try {
    parsed = parse(raw)
  } catch (err) {
    error('babel.config.yml is not valid YAML.', (err as Error).message)
    process.exit(1)
  }

  const { valid, errors } = validateConfig(parsed)

  if (valid) {
    success('babel.config.yml is valid.')
    console.log()
    return
  }

  console.log()
  console.error(`${chalk.red('✗')} babel.config.yml has ${errors.length} error(s):\n`)
  for (const err of errors) {
    console.error(`  ${chalk.red('•')} ${err}`)
  }
  console.log()
  process.exit(1)
}
