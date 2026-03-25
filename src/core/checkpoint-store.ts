import { readFile, writeFile } from 'fs/promises'
import type { Checkpoint } from '../types.js'
import { ensureBabelDir, getCheckpointPath } from './state.js'
import { notesAdd, notesShow, notesListForRef, notesPush, notesFetch } from './git.js'

const CHECKPOINT_NOTES_REF = 'babel-checkpoints'

export interface CheckpointStore {
  load(workItemId: string): Promise<Checkpoint[]>
  append(checkpoint: Checkpoint): Promise<void>
  push(): Promise<void>
  fetch(): Promise<void>
}

// ─── LocalStore ──────────────────────────────────────────────────────────────

export class LocalCheckpointStore implements CheckpointStore {
  constructor(private repoPath: string = process.cwd()) {}

  async load(workItemId: string): Promise<Checkpoint[]> {
    const filePath = getCheckpointPath(workItemId, this.repoPath)
    try {
      const raw = await readFile(filePath, 'utf-8')
      return JSON.parse(raw) as Checkpoint[]
    } catch {
      return []
    }
  }

  async append(checkpoint: Checkpoint): Promise<void> {
    await ensureBabelDir(this.repoPath)
    const filePath = getCheckpointPath(checkpoint.work_item_id, this.repoPath)
    const existing = await this.load(checkpoint.work_item_id)
    existing.push(checkpoint)
    await writeFile(filePath, JSON.stringify(existing, null, 2), 'utf-8')
  }

  async push(): Promise<void> {
    // No-op for local store
  }

  async fetch(): Promise<void> {
    // No-op for local store
  }
}

// ─── NotesStore ──────────────────────────────────────────────────────────────

export class NotesCheckpointStore implements CheckpointStore {
  constructor(private repoPath: string = process.cwd()) {}

  async load(workItemId: string): Promise<Checkpoint[]> {
    const commitShas = await notesListForRef(CHECKPOINT_NOTES_REF, this.repoPath)
    const allCheckpoints: Checkpoint[] = []

    for (const sha of commitShas) {
      const content = await notesShow(CHECKPOINT_NOTES_REF, sha, this.repoPath)
      if (!content) continue
      try {
        const parsed = JSON.parse(content) as Checkpoint[]
        const matching = parsed.filter(c => c.work_item_id === workItemId)
        allCheckpoints.push(...matching)
      } catch {
        // Malformed note — skip
      }
    }

    return allCheckpoints
  }

  async append(checkpoint: Checkpoint): Promise<void> {
    const sha = checkpoint.git_commit
    // Read existing note on this commit (may have other checkpoints for same commit)
    const existing = await notesShow(CHECKPOINT_NOTES_REF, sha, this.repoPath)
    let checkpoints: Checkpoint[] = []
    if (existing) {
      try {
        checkpoints = JSON.parse(existing) as Checkpoint[]
      } catch {
        checkpoints = []
      }
    }
    checkpoints.push(checkpoint)
    await notesAdd(CHECKPOINT_NOTES_REF, sha, JSON.stringify(checkpoints), this.repoPath)
  }

  async push(): Promise<void> {
    await notesPush(CHECKPOINT_NOTES_REF, this.repoPath)
  }

  async fetch(): Promise<void> {
    await notesFetch(CHECKPOINT_NOTES_REF, this.repoPath)
  }
}

// ─── DualStore ───────────────────────────────────────────────────────────────

export class DualCheckpointStore implements CheckpointStore {
  private local: LocalCheckpointStore
  private notes: NotesCheckpointStore

  constructor(private repoPath: string = process.cwd()) {
    this.local = new LocalCheckpointStore(repoPath)
    this.notes = new NotesCheckpointStore(repoPath)
  }

  async load(workItemId: string): Promise<Checkpoint[]> {
    const localCheckpoints = await this.local.load(workItemId)
    if (localCheckpoints.length > 0) return localCheckpoints

    // Fall back to notes store
    try {
      return await this.notes.load(workItemId)
    } catch {
      return []
    }
  }

  async append(checkpoint: Checkpoint): Promise<void> {
    // Always write to local
    await this.local.append(checkpoint)

    // Also write to notes (non-blocking, best-effort)
    try {
      await this.notes.append(checkpoint)
    } catch {
      // Notes write failed — not fatal, local is the source of truth
    }
  }

  async push(): Promise<void> {
    await this.notes.push()
  }

  async fetch(): Promise<void> {
    await this.notes.fetch()
  }

  /** Hydrate local store from notes if local is empty */
  async hydrateLocal(workItemId: string): Promise<void> {
    const localCheckpoints = await this.local.load(workItemId)
    if (localCheckpoints.length > 0) return

    try {
      const notesCheckpoints = await this.notes.load(workItemId)
      if (notesCheckpoints.length > 0) {
        await ensureBabelDir(this.repoPath)
        const filePath = getCheckpointPath(workItemId, this.repoPath)
        await writeFile(filePath, JSON.stringify(notesCheckpoints, null, 2), 'utf-8')
      }
    } catch {
      // Notes unavailable — nothing to hydrate
    }
  }
}
