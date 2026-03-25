import { loadConfig } from '../../core/config.js'
import { loadState, getCurrentWorkItem } from '../../core/state.js'
import { getCurrentBranch } from '../../core/git.js'
import { loadCheckpoints, loadRunSession } from '../../core/checkpoint.js'
import { detectCallerType } from '../../core/governance.js'
import { evaluatePolicies } from '../../core/policy.js'
import { showPolicyViolations } from '../display.js'
import { error, success } from '../display.js'
import type { PolicyContext } from '../../types.js'
import chalk from 'chalk'

export async function runPolicyCheck(trigger?: string, repoPath: string = process.cwd()): Promise<void> {
  if (!trigger) {
    error('Usage: babel policy-check <trigger>', undefined, 'Example: babel policy-check save')
    process.exit(1)
  }

  const config = await loadConfig(repoPath).catch(err => {
    if (err.message === 'NO_CONFIG') {
      error('No babel.config.yml found.', undefined, "Run 'babel init' to set up babelgit.")
      process.exit(1)
    }
    throw err
  })

  const state = await loadState(repoPath)
  const workItem = await getCurrentWorkItem(repoPath).catch(() => undefined)
  const branch = await getCurrentBranch(repoPath).catch(() => 'unknown')
  const caller = detectCallerType()
  const checkpoints = workItem ? await loadCheckpoints(workItem.id, repoPath).catch(() => []) : []
  const runSession = await loadRunSession(repoPath).catch(() => null)

  const ctx: PolicyContext = {
    trigger,
    caller,
    branch,
    config,
    repoPath,
    workItem: workItem || undefined,
    workItems: state.work_items,
    checkpoints,
    runSession,
  }

  const results = await evaluatePolicies(trigger, ctx)

  console.log()
  console.log(`  ${chalk.bold('Policy check for trigger:')} ${chalk.cyan(trigger)}`)
  console.log(`  ${chalk.dim(`Caller: ${caller} | Branch: ${branch} | Policies: ${config.policies?.length || 0}`)}`)
  console.log()

  if (results.length === 0) {
    success('No policies matched this trigger.')
    console.log()
    return
  }

  const blocked = results.filter(r => r.blocking && !r.permitted)
  const warnings = results.filter(r => !r.blocking && !r.permitted)
  const passed = results.filter(r => r.permitted)

  if (passed.length > 0) {
    console.log(`  ${chalk.green('Passed:')}`)
    for (const r of passed) {
      console.log(`    ${chalk.green('✓')} ${r.policy}`)
    }
    console.log()
  }

  if (warnings.length > 0) {
    console.log(`  ${chalk.yellow('Warnings:')}`)
    showPolicyViolations(warnings)
  }

  if (blocked.length > 0) {
    console.log(`  ${chalk.red('Blocked:')}`)
    showPolicyViolations(blocked)
  }

  if (blocked.length > 0) {
    process.exit(1)
  }
}
