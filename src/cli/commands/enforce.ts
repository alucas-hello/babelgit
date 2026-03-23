import chalk from 'chalk'
import inquirer from 'inquirer'
import { getEnforceStatus, installHooks, removeHooks } from '../../core/enforce.js'
import { success, error, info, divider } from '../display.js'

export async function runEnforce(
  action: string | undefined,
  repoPath: string = process.cwd()
): Promise<void> {
  if (action && action !== 'on' && action !== 'off' && action !== 'status') {
    error(`Unknown action: ${action}`, undefined, "Usage: babel enforce [on|off|status]")
    process.exit(1)
  }

  const status = await getEnforceStatus(repoPath).catch(() => {
    error('Could not read git hooks.', undefined, 'Make sure you are in a git repository.')
    process.exit(1)
  })

  // ── Header ────────────────────────────────────────────────────────────────
  console.log()
  divider()
  console.log(`  ${chalk.bold('babel enforce')}`)
  divider()
  console.log()

  // ── What enforcement does ─────────────────────────────────────────────────
  console.log('  Git hooks are installed into .git/hooks/ to block direct git')
  console.log('  operations. Any git commit, push, or rebase not initiated by')
  console.log('  babel will be rejected — regardless of which tool tried it.')
  console.log()
  console.log(`  ${chalk.dim('Covered:')}  commit, push, rebase`)
  console.log(`  ${chalk.dim('Not covered:')}  fetch, checkout, pull (git has no hook points for these)`)
  console.log()

  // ── Current status ────────────────────────────────────────────────────────
  const statusLabel = status.active
    ? chalk.green('● ACTIVE')
    : chalk.dim('○ INACTIVE')
  console.log(`  Status: ${statusLabel}`)
  console.log()

  for (const hook of status.hooks) {
    const icon = hook.installed
      ? chalk.green('✓')
      : hook.conflict
        ? chalk.yellow('⚠')
        : chalk.dim('○')
    const label = hook.installed
      ? chalk.dim('installed')
      : hook.conflict
        ? chalk.yellow('conflict — existing hook, skipped')
        : chalk.dim('not installed')
    console.log(`    ${icon} ${hook.name.padEnd(16)} ${label}`)
  }

  const conflicts = status.hooks.filter(h => h.conflict)
  if (conflicts.length > 0) {
    console.log()
    console.log(`  ${chalk.yellow('⚠')} ${conflicts.length} hook(s) have existing non-babel content.`)
    console.log('    babel will not overwrite them. Manage those hooks manually')
    console.log('    or remove them first, then run babel enforce on.')
  }

  console.log()

  // ── Direct action ─────────────────────────────────────────────────────────
  if (action === 'on') {
    await enableEnforcement(repoPath)
    return
  }

  if (action === 'off') {
    await disableEnforcement(repoPath)
    return
  }

  if (action === 'status') {
    // Already printed above
    return
  }

  // ── Interactive prompt ────────────────────────────────────────────────────
  const choices = status.active
    ? [
        { name: 'Keep enforcement ACTIVE', value: 'keep' },
        { name: 'Turn enforcement OFF', value: 'off' },
      ]
    : [
        { name: 'Turn enforcement ON', value: 'on' },
        { name: 'Keep enforcement INACTIVE', value: 'keep' },
      ]

  const { choice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'choice',
      message: status.active
        ? 'Enforcement is ACTIVE. What would you like to do?'
        : 'Enforcement is INACTIVE. Turn it on?',
      choices,
    },
  ])

  if (choice === 'on') await enableEnforcement(repoPath)
  else if (choice === 'off') await disableEnforcement(repoPath)
  else info('No changes made.')
}

async function enableEnforcement(repoPath: string): Promise<void> {
  const { installed, skipped } = await installHooks(repoPath)

  if (installed.length > 0) {
    success(`Enforcement ACTIVE — hooks installed: ${installed.join(', ')}`)
  }
  if (skipped.length > 0) {
    console.log()
    console.log(`  ${chalk.yellow('⚠')} Skipped (existing hooks not owned by babel): ${skipped.join(', ')}`)
  }
  if (installed.length === 0) {
    info('No hooks were installed — all hook slots have existing content.')
  }
}

async function disableEnforcement(repoPath: string): Promise<void> {
  const removed = await removeHooks(repoPath)

  if (removed.length > 0) {
    success(`Enforcement INACTIVE — hooks removed: ${removed.join(', ')}`)
  } else {
    info('No babel hooks found to remove.')
  }
}
