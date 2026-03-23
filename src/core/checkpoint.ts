import { readFile, writeFile } from 'fs/promises'
import crypto from 'crypto'
import path from 'path'
import type { Checkpoint, RunSession, Verdict, CallerType } from '../types.js'
import { ensureBabelDir, getCheckpointPath, getRunSessionPath } from './state.js'

export function computeFilesystemHash(statusPorcelain: string): string {
  if (!statusPorcelain.trim()) return ''
  return crypto.createHash('sha256').update(statusPorcelain).digest('hex').slice(0, 16)
}

export async function loadCheckpoints(
  workItemId: string,
  repoPath: string = process.cwd()
): Promise<Checkpoint[]> {
  const filePath = getCheckpointPath(workItemId, repoPath)
  try {
    const raw = await readFile(filePath, 'utf-8')
    return JSON.parse(raw) as Checkpoint[]
  } catch {
    return []
  }
}

export async function appendCheckpoint(
  checkpoint: Checkpoint,
  repoPath: string = process.cwd()
): Promise<void> {
  await ensureBabelDir(repoPath)
  const filePath = getCheckpointPath(checkpoint.work_item_id, repoPath)
  const existing = await loadCheckpoints(checkpoint.work_item_id, repoPath)
  existing.push(checkpoint)
  await writeFile(filePath, JSON.stringify(existing, null, 2), 'utf-8')
}

export async function createCheckpoint(params: {
  workItemId: string
  verdict: Verdict
  notes: string
  calledBy: string
  callerType: CallerType
  gitCommit: string
  gitBranch: string
  filesystemHash: string
  repoPath?: string
}): Promise<Checkpoint> {
  const existing = await loadCheckpoints(params.workItemId, params.repoPath)
  const verdictCount = existing.filter(c => c.verdict === params.verdict).length + 1
  const id = `${params.workItemId}-${params.verdict}-${verdictCount}`

  const isAnchor = params.verdict === 'keep' || params.verdict === 'ship'

  // Find previous keep for reference
  const previousKeep = isAnchor
    ? existing.filter(c => c.is_recovery_anchor).pop()?.id
    : undefined

  const checkpoint: Checkpoint = {
    id,
    work_item_id: params.workItemId,
    verdict: params.verdict,
    notes: params.notes,
    called_at: new Date().toISOString(),
    called_by: params.calledBy,
    caller_type: params.callerType,
    git_commit: params.gitCommit,
    git_branch: params.gitBranch,
    filesystem_hash: params.filesystemHash,
    is_recovery_anchor: isAnchor,
    previous_keep: previousKeep,
  }

  await appendCheckpoint(checkpoint, params.repoPath)
  return checkpoint
}

export async function getLastRecoveryAnchor(
  workItemId: string,
  repoPath: string = process.cwd()
): Promise<Checkpoint | null> {
  const checkpoints = await loadCheckpoints(workItemId, repoPath)
  const anchors = checkpoints.filter(c => c.is_recovery_anchor)
  return anchors.length > 0 ? anchors[anchors.length - 1] : null
}

export async function getCheckpointSequence(
  workItemId: string,
  verdict: Verdict,
  repoPath: string = process.cwd()
): Promise<number> {
  const checkpoints = await loadCheckpoints(workItemId, repoPath)
  return checkpoints.filter(c => c.verdict === verdict).length
}

// ─── Run Session ──────────────────────────────────────────────────────────────

export async function writeRunSession(
  session: RunSession,
  repoPath: string = process.cwd()
): Promise<void> {
  await ensureBabelDir(repoPath)
  const sessionPath = getRunSessionPath(repoPath)
  await writeFile(sessionPath, JSON.stringify(session, null, 2), 'utf-8')
}

export async function loadRunSession(repoPath: string = process.cwd()): Promise<RunSession | null> {
  const sessionPath = getRunSessionPath(repoPath)
  try {
    const raw = await readFile(sessionPath, 'utf-8')
    return JSON.parse(raw) as RunSession
  } catch {
    return null
  }
}

export async function deleteRunSession(repoPath: string = process.cwd()): Promise<void> {
  const { unlink } = await import('fs/promises')
  const sessionPath = getRunSessionPath(repoPath)
  try {
    await unlink(sessionPath)
  } catch {
    // Already gone — fine
  }
}
