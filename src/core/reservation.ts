/**
 * src/core/reservation.ts
 *
 * Pluggable work item ID reservation.
 *
 * For source: 'local' — reserves a WI number by atomically pushing a branch
 * to GitHub (first writer wins). If offline, returns a DRAFT-{hex} id so the
 * caller can park the item locally and resolve it later.
 *
 * Future sources: 'linear' and 'jira' will create issues via their APIs and
 * return those issue keys. The DRAFT fallback applies to all sources when the
 * external system is unreachable.
 *
 * Contract:
 *   - Returns { id, branch } on success (id is permanent, branch is pushed)
 *   - Returns { id: 'DRAFT-{hex}', branch: null } when offline/unavailable
 */

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { spawnSync } from 'child_process'
import { loadState, saveState } from './state.js'
import { buildBranchName } from './workitem.js'
import type { BabelConfig } from '../types.js'

export interface ReservationResult {
  id: string
  branch: string | null
  /** true if the ID is a temporary draft pending resolution */
  isDraft: boolean
}

/**
 * Reserve a work item ID based on config.work_item_id.source.
 *
 * For 'local': attempts to claim a branch on the remote. Retries up to
 * MAX_RETRIES times if the slot is already taken by a concurrent push.
 *
 * For 'linear' / 'jira': will call their APIs (not yet implemented — falls
 * through to local behaviour with a console note).
 */
export async function reserveWorkItemId(
  description: string,
  config: BabelConfig,
  repoPath: string
): Promise<ReservationResult> {
  const source = config.work_item_id.source

  if (source === 'linear' || source === 'jira') {
    // Placeholder — future integration will create an issue here and return
    // the external key (e.g. PROJ-123). Falls through to local for now.
    console.warn(`  [reservation] ${source} integration not yet active — using local ID`)
  }

  return reserveLocal(description, config, repoPath)
}

/**
 * Resolve all DRAFT-* items in state.json.
 * Called by the watch daemon when it detects connectivity, and on any
 * successful `babel todo push`.
 */
export async function resolveDrafts(repoPath: string, config: BabelConfig): Promise<void> {
  const state = await loadState(repoPath)
  const drafts = Object.values(state.work_items).filter(wi => wi.id.startsWith('DRAFT-') && wi.stage === 'todo')
  if (drafts.length === 0) return

  for (const wi of drafts) {
    try {
      const result = await reserveLocal(wi.description, config, repoPath)
      if (result.isDraft) continue // still offline — leave for next poll

      // Transition: rename state entry and notes file
      const newId = result.id
      const oldNotesPath = path.join(repoPath, '.babel', 'notes', `${wi.id}.md`)
      const newNotesPath = path.join(repoPath, '.babel', 'notes', `${newId}.md`)

      // Move notes file
      if (fs.existsSync(oldNotesPath)) {
        fs.renameSync(oldNotesPath, newNotesPath)
      }

      // Update state: remove old entry, add new one
      const newWi = { ...wi, id: newId, branch: result.branch ?? undefined }
      delete state.work_items[wi.id]
      state.work_items[newId] = newWi

      // Keep next_local_id ahead of the claimed number
      const claimedNum = parseInt(newId.replace(/^[A-Z]+-/, ''), 10)
      if (!isNaN(claimedNum) && claimedNum >= state.next_local_id) {
        state.next_local_id = claimedNum + 1
      }

      await saveState(state, repoPath)
      console.log(`  [reservation] Draft resolved: ${wi.id} → ${newId}`)
    } catch {
      // Non-fatal — try again next poll
    }
  }
}

// ─── Local reservation ────────────────────────────────────────────────────────

const MAX_RETRIES = 10

async function reserveLocal(
  description: string,
  config: BabelConfig,
  repoPath: string
): Promise<ReservationResult> {
  // Fetch remote to get current branch list
  const fetchResult = spawnSync('git', ['fetch', 'origin', '--prune'], {
    cwd: repoPath, encoding: 'utf8', timeout: 8000,
  })

  if (fetchResult.error || fetchResult.status !== 0) {
    // Offline or no remote — return a draft ID
    return { id: draftId(), branch: null, isDraft: true }
  }

  const state = await loadState(repoPath)

  // Find the highest WI number already claimed (locally + remotely)
  const highestRemote = getHighestRemoteWiNumber(repoPath, config.work_item_id.prefix)
  const startNum = Math.max(state.next_local_id, highestRemote + 1)

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const num = startNum + attempt
    const id = `${config.work_item_id.prefix}-${String(num).padStart(3, '0')}`
    const branch = buildBranchName(id, description, config)

    // Try to push an empty branch — this is the atomic reservation
    // We push the current HEAD (or base branch) as the initial commit
    const baseRef = getBestBase(config.base_branch, repoPath)
    const pushResult = spawnSync(
      'git',
      ['push', 'origin', `${baseRef}:refs/heads/${branch}`],
      { cwd: repoPath, encoding: 'utf8', timeout: 10000 }
    )

    if (pushResult.status === 0) {
      // Claimed. Update local counter.
      state.next_local_id = num + 1
      await saveState(state, repoPath)
      return { id, branch, isDraft: false }
    }

    const stderr = pushResult.stderr ?? ''
    if (
      stderr.includes('already exists') ||
      stderr.includes('rejected') ||
      stderr.includes('non-fast-forward')
    ) {
      // Someone else has this slot — try next number
      continue
    }

    // Unexpected error (auth failure, etc.) — treat as offline
    return { id: draftId(), branch: null, isDraft: true }
  }

  // Exhausted retries — treat as offline to not block the user
  return { id: draftId(), branch: null, isDraft: true }
}

function draftId(): string {
  return `DRAFT-${crypto.randomBytes(4).toString('hex')}`
}

function getHighestRemoteWiNumber(repoPath: string, prefix: string): number {
  try {
    const result = spawnSync('git', ['branch', '-r', '--format', '%(refname:short)'], {
      cwd: repoPath, encoding: 'utf8',
    })
    if (result.status !== 0) return 0

    let max = 0
    const pattern = new RegExp(`(?:feature|fix)\\/${prefix}-(\\d+)-`)
    for (const line of result.stdout.split('\n')) {
      const m = line.match(pattern)
      if (m) {
        const n = parseInt(m[1], 10)
        if (n > max) max = n
      }
    }
    return max
  } catch {
    return 0
  }
}

function getBestBase(baseBranch: string, repoPath: string): string {
  // Prefer origin/base so we don't push local uncommitted work
  const remote = spawnSync('git', ['rev-parse', '--verify', `origin/${baseBranch}`], {
    cwd: repoPath, encoding: 'utf8',
  })
  if (remote.status === 0) return `origin/${baseBranch}`

  const local = spawnSync('git', ['rev-parse', '--verify', baseBranch], {
    cwd: repoPath, encoding: 'utf8',
  })
  if (local.status === 0) return baseBranch

  return 'HEAD'
}
