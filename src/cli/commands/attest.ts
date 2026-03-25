import { loadConfig } from '../../core/config.js'
import { getCurrentWorkItem } from '../../core/state.js'
import { notesPush, notesFetch } from '../../core/git.js'
import { loadCheckpoints } from '../../core/checkpoint.js'
import { DualCheckpointStore } from '../../core/checkpoint-store.js'
import { DualWIStore } from '../../core/workitem-store.js'
import { error, success, info, hint, section, divider } from '../display.js'
import { formatTimeShort } from '../../core/workitem.js'
import chalk from 'chalk'

const CHECKPOINT_REF = 'babel-checkpoints'
const WORKITEM_REF = 'babel-workitems'

export async function runAttest(
  opts: { pull?: boolean; status?: boolean; log?: boolean } = {},
  repoPath: string = process.cwd()
): Promise<void> {
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

  if (opts.pull) {
    await runAttestPull(repoPath, workItem.id)
    return
  }

  if (opts.status) {
    await runAttestStatus(repoPath, workItem.id)
    return
  }

  if (opts.log) {
    await runAttestLog(repoPath, workItem.id)
    return
  }

  // Default: push notes to remote
  await runAttestPush(repoPath, workItem.id)
}

async function runAttestPush(repoPath: string, workItemId: string): Promise<void> {
  try {
    await notesPush(CHECKPOINT_REF, repoPath)
  } catch (err) {
    error(
      'Failed to push checkpoint notes.',
      (err as Error).message,
      'Check that your remote supports git notes and you have push access.'
    )
    process.exit(1)
  }

  try {
    await notesPush(WORKITEM_REF, repoPath)
  } catch (err) {
    error(
      'Failed to push work item notes.',
      (err as Error).message,
      'Check that your remote supports git notes and you have push access.'
    )
    process.exit(1)
  }

  const checkpoints = await loadCheckpoints(workItemId, repoPath)

  console.log()
  success(`Attested: ${workItemId}`)
  console.log()
  console.log(`  Shared ${checkpoints.length} checkpoint(s) and work item metadata to remote.`)
  console.log(`  Namespace: refs/notes/${CHECKPOINT_REF}`)
  console.log(`  Namespace: refs/notes/${WORKITEM_REF}`)
  console.log()
  hint('Team members can pull with: babel attest --pull')
  console.log()
}

async function runAttestPull(repoPath: string, workItemId: string): Promise<void> {
  try {
    await notesFetch(CHECKPOINT_REF, repoPath)
  } catch {
    // No remote notes — OK
  }

  try {
    await notesFetch(WORKITEM_REF, repoPath)
  } catch {
    // No remote notes — OK
  }

  // Hydrate local state from notes
  const checkpointStore = new DualCheckpointStore(repoPath)
  await checkpointStore.hydrateLocal(workItemId)

  const wiStore = new DualWIStore(repoPath)
  await wiStore.hydrateLocal(workItemId)

  const checkpoints = await loadCheckpoints(workItemId, repoPath)

  console.log()
  success(`Fetched attestation data for ${workItemId}`)
  console.log()
  console.log(`  ${checkpoints.length} checkpoint(s) available locally.`)
  console.log()
}

async function runAttestStatus(repoPath: string, workItemId: string): Promise<void> {
  const checkpoints = await loadCheckpoints(workItemId, repoPath)

  // Try to load from notes to compare
  let notesCount = 0
  try {
    const { NotesCheckpointStore } = await import('../../core/checkpoint-store.js')
    const notesStore = new NotesCheckpointStore(repoPath)
    const notesCheckpoints = await notesStore.load(workItemId)
    notesCount = notesCheckpoints.length
  } catch {
    // Notes unavailable
  }

  console.log()
  console.log(divider())
  console.log(`  ${chalk.bold('Attestation Status')}  ${chalk.dim('●')}  ${workItemId}`)
  console.log(divider())
  console.log()
  console.log(`  Local checkpoints:   ${checkpoints.length}`)
  console.log(`  Shared (notes):      ${notesCount}`)

  const localOnly = checkpoints.length - notesCount
  if (localOnly > 0) {
    console.log(`  ${chalk.yellow(`${localOnly} checkpoint(s) local-only — run 'babel attest' to share`)}`)
  } else if (checkpoints.length > 0) {
    console.log(`  ${chalk.green('All checkpoints are shared.')}`)
  } else {
    console.log(`  ${chalk.dim('No checkpoints yet.')}`)
  }
  console.log()
}

async function runAttestLog(repoPath: string, workItemId: string): Promise<void> {
  // Load from notes store to show shared attestation chain
  let checkpoints: import('../../types.js').Checkpoint[] = []
  try {
    const { NotesCheckpointStore } = await import('../../core/checkpoint-store.js')
    const notesStore = new NotesCheckpointStore(repoPath)
    checkpoints = await notesStore.load(workItemId)
  } catch {
    checkpoints = []
  }

  if (checkpoints.length === 0) {
    // Fall back to local
    checkpoints = await loadCheckpoints(workItemId, repoPath)
    if (checkpoints.length === 0) {
      info(`No attestation history for ${workItemId}.`)
      return
    }
    console.log(chalk.dim('\n  (showing local checkpoints — no shared notes found)\n'))
  }

  console.log()
  console.log(divider())
  console.log(`  ${chalk.bold('Attestation Log')}  ${chalk.dim('●')}  ${workItemId}`)
  console.log(divider())
  console.log()

  for (const cp of checkpoints) {
    const verdictColor: Record<string, (s: string) => string> = {
      keep: chalk.green,
      refine: chalk.yellow,
      reject: chalk.red,
      ship: chalk.cyan,
    }
    const colorFn = verdictColor[cp.verdict] || chalk.white
    const anchorTag = cp.is_recovery_anchor ? chalk.green(' [anchor]') : ''

    console.log(`  ${formatTimeShort(cp.called_at)}  ${colorFn(cp.verdict.toUpperCase())}${anchorTag}`)
    console.log(`    "${cp.notes}"`)
    console.log(`    ${chalk.dim(`by ${cp.caller_type}: ${cp.called_by}  commit: ${cp.git_commit.slice(0, 7)}`)}`)
    console.log()
  }

  console.log(divider() + '\n')
}
