import { loadConfig } from '../../core/config.js'
import { getCurrentWorkItem, saveWorkItem } from '../../core/state.js'
import { addAll, commit, hasUncommittedChanges, getCurrentCommitSha, getShortSha, getCurrentBranch } from '../../core/git.js'
import { runHooks, hooksFailed } from '../../core/hooks.js'
import { evaluatePolicies } from '../../core/policy.js'
import { detectCallerType } from '../../core/governance.js'
import { error, success, hint, showPolicyViolations } from '../display.js'
import { appendConversationEntry, getChangedFiles } from '../../core/conversation.js'

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
    // Evaluate policies for 'save'
    const caller = detectCallerType()
    const message_preview = notes ? `save(${workItem.id}): ${notes}` : ''
    const currentBranch = await getCurrentBranch(repoPath).catch(() => workItem.branch || 'unknown')
    const results = await evaluatePolicies('save', {
      trigger: 'save',
      caller,
      branch: currentBranch,
      config,
      repoPath,
      workItem,
      commitMessage: message_preview,
    })
    const blocked = results.filter(r => r.blocking && !r.permitted)
    if (blocked.length > 0) {
      console.error('\n✗ Save blocked by policies:')
      showPolicyViolations(blocked)
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

  const filesChanged = await getChangedFiles(repoPath)

  await addAll(repoPath)
  const sha = await commit(message, repoPath)
  const shortSha = sha ? sha.slice(0, 7) : await getShortSha('HEAD', repoPath)

  await appendConversationEntry(repoPath, workItem.id, {
    event: 'save',
    timestamp: new Date().toISOString(),
    notes,
    commit: shortSha,
    filesChanged,
  }).catch(() => {})

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
