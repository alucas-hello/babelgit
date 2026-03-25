import type { WorkItem } from '../types.js'
import { loadState, saveState } from './state.js'
import { notesAdd, notesShow, notesListForRef, notesPush, notesFetch } from './git.js'

const WORKITEM_NOTES_REF = 'babel-workitems'

export interface WorkItemStore {
  load(workItemId: string): Promise<WorkItem | null>
  save(workItem: WorkItem, anchorCommit: string): Promise<void>
  push(): Promise<void>
  fetch(): Promise<void>
}

// ─── LocalWIStore ────────────────────────────────────────────────────────────

export class LocalWIStore implements WorkItemStore {
  constructor(private repoPath: string = process.cwd()) {}

  async load(workItemId: string): Promise<WorkItem | null> {
    const state = await loadState(this.repoPath)
    return state.work_items[workItemId] || null
  }

  async save(workItem: WorkItem, _anchorCommit: string): Promise<void> {
    const state = await loadState(this.repoPath)
    state.work_items[workItem.id] = workItem
    await saveState(state, this.repoPath)
  }

  async push(): Promise<void> {
    // No-op for local store
  }

  async fetch(): Promise<void> {
    // No-op for local store
  }
}

// ─── NotesWIStore ────────────────────────────────────────────────────────────

export class NotesWIStore implements WorkItemStore {
  constructor(private repoPath: string = process.cwd()) {}

  async load(workItemId: string): Promise<WorkItem | null> {
    const commitShas = await notesListForRef(WORKITEM_NOTES_REF, this.repoPath)

    for (const sha of commitShas) {
      const content = await notesShow(WORKITEM_NOTES_REF, sha, this.repoPath)
      if (!content) continue
      try {
        const wi = JSON.parse(content) as WorkItem
        if (wi.id === workItemId) return wi
      } catch {
        // Malformed note — skip
      }
    }

    return null
  }

  async save(workItem: WorkItem, anchorCommit: string): Promise<void> {
    await notesAdd(WORKITEM_NOTES_REF, anchorCommit, JSON.stringify(workItem), this.repoPath)
  }

  async push(): Promise<void> {
    await notesPush(WORKITEM_NOTES_REF, this.repoPath)
  }

  async fetch(): Promise<void> {
    await notesFetch(WORKITEM_NOTES_REF, this.repoPath)
  }
}

// ─── DualWIStore ─────────────────────────────────────────────────────────────

export class DualWIStore implements WorkItemStore {
  private local: LocalWIStore
  private notes: NotesWIStore

  constructor(private repoPath: string = process.cwd()) {
    this.local = new LocalWIStore(repoPath)
    this.notes = new NotesWIStore(repoPath)
  }

  async load(workItemId: string): Promise<WorkItem | null> {
    const localWI = await this.local.load(workItemId)
    if (localWI) return localWI

    // Fall back to notes store
    try {
      return await this.notes.load(workItemId)
    } catch {
      return null
    }
  }

  async save(workItem: WorkItem, anchorCommit: string): Promise<void> {
    // Always write to local
    await this.local.save(workItem, anchorCommit)

    // Also write to notes (non-blocking, best-effort)
    try {
      await this.notes.save(workItem, anchorCommit)
    } catch {
      // Notes write failed — not fatal
    }
  }

  async push(): Promise<void> {
    await this.notes.push()
  }

  async fetch(): Promise<void> {
    await this.notes.fetch()
  }

  /** Hydrate local state from notes if work item is missing locally */
  async hydrateLocal(workItemId: string): Promise<void> {
    const localWI = await this.local.load(workItemId)
    if (localWI) return

    try {
      const notesWI = await this.notes.load(workItemId)
      if (notesWI) {
        const state = await loadState(this.repoPath)
        state.work_items[notesWI.id] = notesWI
        await saveState(state, this.repoPath)
      }
    } catch {
      // Notes unavailable — nothing to hydrate
    }
  }
}
