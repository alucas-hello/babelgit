import { readFile, writeFile, mkdir, access } from 'fs/promises'
import path from 'path'
import type { BabelState, WorkItem } from '../types.js'

const BABEL_DIR = '.babel'
const STATE_FILE = 'state.json'
const COUNTER_FILE = 'counter.json'

export function getBabelDir(repoPath: string = process.cwd()): string {
  return path.join(repoPath, BABEL_DIR)
}

export function getStatePath(repoPath: string = process.cwd()): string {
  return path.join(repoPath, BABEL_DIR, STATE_FILE)
}

export function getRunSessionPath(repoPath: string = process.cwd()): string {
  return path.join(repoPath, BABEL_DIR, 'run-session.json')
}

export function getCheckpointPath(workItemId: string, repoPath: string = process.cwd()): string {
  return path.join(repoPath, BABEL_DIR, 'checkpoints', `${workItemId}.json`)
}

export async function ensureBabelDir(repoPath: string = process.cwd()): Promise<void> {
  const babelDir = getBabelDir(repoPath)
  await mkdir(path.join(babelDir, 'checkpoints'), { recursive: true })
}

const defaultState: BabelState = {
  work_items: {},
  next_local_id: 1,
}

export async function loadState(repoPath: string = process.cwd()): Promise<BabelState> {
  const statePath = getStatePath(repoPath)
  try {
    const raw = await readFile(statePath, 'utf-8')
    return JSON.parse(raw) as BabelState
  } catch {
    return { ...defaultState, work_items: {} }
  }
}

export async function saveState(state: BabelState, repoPath: string = process.cwd()): Promise<void> {
  await ensureBabelDir(repoPath)
  const statePath = getStatePath(repoPath)
  await writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8')
}

export async function getCurrentWorkItem(repoPath: string = process.cwd()): Promise<WorkItem | null> {
  const state = await loadState(repoPath)
  if (!state.current_work_item_id) return null
  return state.work_items[state.current_work_item_id] || null
}

export async function getWorkItem(id: string, repoPath: string = process.cwd()): Promise<WorkItem | null> {
  const state = await loadState(repoPath)
  return state.work_items[id] || null
}

export async function saveWorkItem(
  workItem: WorkItem,
  repoPath: string = process.cwd(),
  anchorCommit?: string
): Promise<void> {
  const state = await loadState(repoPath)
  state.work_items[workItem.id] = workItem
  await saveState(state, repoPath)

  // Also write to notes store if an anchor commit is provided (best-effort)
  if (anchorCommit) {
    try {
      const { NotesWIStore } = await import('./workitem-store.js')
      const notesStore = new NotesWIStore(repoPath)
      await notesStore.save(workItem, anchorCommit)
    } catch {
      // Notes write failed — not fatal, local is the source of truth
    }
  }
}

export async function setCurrentWorkItem(id: string | undefined, repoPath: string = process.cwd()): Promise<void> {
  const state = await loadState(repoPath)
  state.current_work_item_id = id
  await saveState(state, repoPath)
}

export async function getNextLocalId(repoPath: string = process.cwd()): Promise<string> {
  const state = await loadState(repoPath)
  const id = state.next_local_id
  state.next_local_id = id + 1
  await saveState(state, repoPath)
  return `WI-${String(id).padStart(3, '0')}`
}

export async function babelDirExists(repoPath: string = process.cwd()): Promise<boolean> {
  try {
    await access(path.join(repoPath, BABEL_DIR))
    return true
  } catch {
    return false
  }
}

export async function findPausedWorkItems(
  userEmail: string,
  repoPath: string = process.cwd()
): Promise<WorkItem[]> {
  const state = await loadState(repoPath)
  return Object.values(state.work_items).filter(
    wi => wi.stage === 'paused'
  )
}

export async function findWorkItemByIdOrDescription(
  query: string,
  repoPath: string = process.cwd()
): Promise<WorkItem | null> {
  const state = await loadState(repoPath)
  // Exact ID match
  if (state.work_items[query]) return state.work_items[query]
  // Fuzzy description match
  const lower = query.toLowerCase()
  const match = Object.values(state.work_items).find(
    wi => wi.description.toLowerCase().includes(lower) || wi.id.toLowerCase() === lower
  )
  return match || null
}
