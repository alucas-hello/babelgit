import { loadConfig } from '../../core/config.js'
import { getCurrentWorkItem, saveWorkItem } from '../../core/state.js'
import { addAll, commit, hasUncommittedChanges, getCurrentCommitSha, getShortSha } from '../../core/git.js'
import { runHooks, hooksFailed } from '../../core/hooks.js'
import { evaluateRules, formatViolations } from '../../core/rules.js'
import { detectCallerType } from '../../core/governance.js'
import { error, success, hint } from '../display.js'

export async function runSave(notes?: string, repoPath: string = process.cwd()): Promise<void> {
  await loadConfig(repoPath).catch(err => {
    if (err.message === 'NO_CONFIG') {
      error('No babel.config.yml found.', undefined, "Run 'babel init' to set up babelgit.")
      process.exit(1)
    }
    throw err
  })

  const workItem = await getCurrentWorkItem(repoPath)
  if (!workItem) {
    error('No active work item.', undefined, "Run 'babel start' to begin a work item.")
    process.exit(1)
  }

  if (workItem.stage !== 'in_progress') {
    error(
      `Cannot save — work item is ${workItem.stage}.`,
      undefined,
      workItem.stage === 'paused'
        ? "Run 'babel continue' to resume work first."
        : workItem.stage === 'run_session_open'
          ? "A run session is open. Call a verdict first (babel keep/refine/reject/ship)."
          : undefined
    )
    process.exit(1)
  }

  if (!(await hasUncommittedChanges(repoPath))) {
    console.log()
    console.log('  Nothing to save — no changes since last save.')
    console.log()
    process.exit(0)
  }

  // Load config for hooks + rules
  const config = await loadConfig(repoPath).catch(() => null)

  if (config) {
    // Evaluate rules for 'save'
    const caller = detectCallerType()
    const message_preview = notes ? `save(${workItem.id}): ${notes}` : ''
    const violations = await evaluateRules({
      operation: 'save',
      caller,
      config,
      repoPath,
      commitMessage: message_preview,
    })
    const blocking = violations.filter(v => v.blocking)
    if (blocking.length > 0) {
      console.log()
      console.error(`\n✗ Save blocked by rules:\n\n${formatViolations(blocking)}\n`)
      process.exit(1)
    }

    // before_save hooks
    const hookResults = await runHooks('before_save', config, repoPath)
    const fail = hooksFailed(hookResults)
    if (fail) {
      error(`before_save hook failed: ${fail.name}`, fail.stderr || fail.stdout)
      process.exit(1)
    }
  }

  const message = notes
    ? `save(${workItem.id}): ${notes}`
    : `save(${workItem.id}): ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`

  await addAll(repoPath)
  const sha = await commit(message, repoPath)
  const shortSha = sha ? sha.slice(0, 7) : await getShortSha('HEAD', repoPath)

  // after_save hooks (non-blocking)
  if (config) await runHooks('after_save', config, repoPath)

  console.log()
  success(`Saved: ${shortSha}`)
  console.log()
  console.log(`  Commit: ${shortSha}`)
  if (notes) console.log(`  Notes: ${notes}`)
  console.log()
  hint(`When ready to review: babel run`)
  console.log()
}
