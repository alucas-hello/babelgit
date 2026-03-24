import * as fs from 'fs'
import * as path from 'path'
import { loadConfig } from '../../core/config.js'
import { getCurrentWorkItem, getWorkItem } from '../../core/state.js'
import { loadCheckpoints } from '../../core/checkpoint.js'
import { timeAgoLabel, formatTimeShort } from '../../core/workitem.js'
import { showHistory, error, info } from '../display.js'
import type { Verdict } from '../../types.js'

export async function runHistory(
  workItemId?: string,
  opts: { json?: boolean; log?: boolean } = {},
  repoPath: string = process.cwd()
): Promise<void> {
  await loadConfig(repoPath).catch(err => {
    if (err.message === 'NO_CONFIG') {
      error('No babel.config.yml found.', undefined, "Run 'babel init' to set up babelgit.")
      process.exit(1)
    }
    throw err
  })

  let workItem
  if (workItemId) {
    workItem = await getWorkItem(workItemId, repoPath)
    if (!workItem) {
      error(`No work item found: ${workItemId}`)
      process.exit(1)
    }
  } else {
    workItem = await getCurrentWorkItem(repoPath)
  }

  if (!workItem) {
    info('No active work item. Pass a work item ID to view its history.')
    process.exit(0)
  }

  const checkpoints = await loadCheckpoints(workItem.id, repoPath)

  if (opts.json) {
    console.log(JSON.stringify({ work_item: workItem, checkpoints }, null, 2))
    return
  }

  if (opts.log) {
    const logPath = path.join(repoPath, '.babel', 'conversations', `${workItem.id}.md`)
    if (fs.existsSync(logPath)) {
      console.log(fs.readFileSync(logPath, 'utf8'))
    } else {
      info(`No conversation log for ${workItem.id}.`)
    }
    return
  }

  const startedAgo = timeAgoLabel(workItem.created_at)

  const events: Array<{
    time: string
    type: 'keep' | 'refine' | 'reject' | 'ship' | 'start' | 'pause' | 'stop'
    notes: string
    caller: string
    commit?: string
    isAnchor?: boolean
    revertedTo?: string
  }> = [
    {
      time: formatTimeShort(workItem.created_at),
      type: 'start',
      notes: workItem.description,
      caller: workItem.created_by,
    },
  ]

  for (const cp of checkpoints) {
    events.push({
      time: formatTimeShort(cp.called_at),
      type: cp.verdict as any,
      notes: cp.notes,
      caller: `${cp.caller_type}: ${cp.called_by}`,
      commit: cp.git_commit.slice(0, 7),
      isAnchor: cp.is_recovery_anchor,
    })
  }

  // Sort by time (they should already be in order, but just in case)
  events.sort((a, b) => a.time.localeCompare(b.time))

  showHistory(workItem.id, workItem.description, startedAgo, events)
}
