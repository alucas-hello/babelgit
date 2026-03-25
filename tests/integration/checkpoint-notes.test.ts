import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import simpleGit, { SimpleGit } from 'simple-git'

/**
 * Integration test for git notes round-trip.
 *
 * Uses real git operations — no mocking. Each test gets a fresh temp repo.
 */

interface CheckpointNote {
  id: string
  work_item_id: string
  verdict: string
  notes: string
  called_at: string
  called_by: string
  caller_type: string
  git_commit: string
}

async function writeCheckpointNote(
  git: SimpleGit,
  commitSha: string,
  checkpoint: CheckpointNote,
): Promise<void> {
  const json = JSON.stringify(checkpoint)
  // Use --force so we can append (overwrite) if a note already exists.
  // For appending multiple, we read existing and concat.
  try {
    const existing = await git.raw(['notes', '--ref=babel-checkpoints', 'show', commitSha])
    const merged = existing.trim() + '\n---\n' + json
    await git.raw(['notes', '--ref=babel-checkpoints', 'add', '-f', '-m', merged, commitSha])
  } catch {
    // No existing note — create new
    await git.raw(['notes', '--ref=babel-checkpoints', 'add', '-m', json, commitSha])
  }
}

async function readCheckpointNotes(
  git: SimpleGit,
  commitSha: string,
): Promise<CheckpointNote[]> {
  try {
    const raw = await git.raw(['notes', '--ref=babel-checkpoints', 'show', commitSha])
    // Notes may contain multiple checkpoints separated by ---
    const parts = raw.split('\n---\n').map(s => s.trim()).filter(Boolean)
    return parts.map(p => JSON.parse(p) as CheckpointNote)
  } catch {
    return []
  }
}

let tempDir: string
let git: SimpleGit

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), 'babel-notes-test-'))
  git = simpleGit(tempDir)
  await git.init()
  await git.addConfig('user.email', 'test@example.com')
  await git.addConfig('user.name', 'Test User')
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe('checkpoint notes: git notes round-trip', () => {
  it('writes and reads a checkpoint note', async () => {
    // Create a commit
    const filePath = path.join(tempDir, 'test.txt')
    await writeFile(filePath, 'hello', 'utf-8')
    await git.add('test.txt')
    const commitResult = await git.commit('initial commit')
    const sha = commitResult.commit

    const checkpoint: CheckpointNote = {
      id: 'WI-001-keep-1',
      work_item_id: 'WI-001',
      verdict: 'keep',
      notes: 'looks good',
      called_at: new Date().toISOString(),
      called_by: 'test@example.com',
      caller_type: 'human',
      git_commit: sha,
    }

    await writeCheckpointNote(git, sha, checkpoint)
    const notes = await readCheckpointNotes(git, sha)

    expect(notes).toHaveLength(1)
    expect(notes[0].id).toBe('WI-001-keep-1')
    expect(notes[0].verdict).toBe('keep')
    expect(notes[0].notes).toBe('looks good')
  })

  it('reads back valid JSON', async () => {
    const filePath = path.join(tempDir, 'test.txt')
    await writeFile(filePath, 'hello', 'utf-8')
    await git.add('test.txt')
    const commitResult = await git.commit('initial commit')
    const sha = commitResult.commit

    const checkpoint: CheckpointNote = {
      id: 'WI-002-ship-1',
      work_item_id: 'WI-002',
      verdict: 'ship',
      notes: 'ready to go with "quotes" and special chars: <>&',
      called_at: '2026-03-25T22:00:00.000Z',
      called_by: 'agent@example.com',
      caller_type: 'agent',
      git_commit: sha,
    }

    await writeCheckpointNote(git, sha, checkpoint)
    const notes = await readCheckpointNotes(git, sha)

    expect(notes).toHaveLength(1)
    // Verify round-trip integrity
    expect(notes[0]).toEqual(checkpoint)
  })

  it('appends multiple checkpoints to the same commit', async () => {
    const filePath = path.join(tempDir, 'test.txt')
    await writeFile(filePath, 'hello', 'utf-8')
    await git.add('test.txt')
    const commitResult = await git.commit('initial commit')
    const sha = commitResult.commit

    const cp1: CheckpointNote = {
      id: 'WI-001-refine-1',
      work_item_id: 'WI-001',
      verdict: 'refine',
      notes: 'needs changes',
      called_at: '2026-03-25T20:00:00.000Z',
      called_by: 'user@example.com',
      caller_type: 'human',
      git_commit: sha,
    }

    const cp2: CheckpointNote = {
      id: 'WI-001-keep-1',
      work_item_id: 'WI-001',
      verdict: 'keep',
      notes: 'now it is good',
      called_at: '2026-03-25T21:00:00.000Z',
      called_by: 'user@example.com',
      caller_type: 'human',
      git_commit: sha,
    }

    await writeCheckpointNote(git, sha, cp1)
    await writeCheckpointNote(git, sha, cp2)

    const notes = await readCheckpointNotes(git, sha)
    expect(notes).toHaveLength(2)
    expect(notes[0].verdict).toBe('refine')
    expect(notes[1].verdict).toBe('keep')
  })

  it('returns empty array for commit with no notes', async () => {
    const filePath = path.join(tempDir, 'test.txt')
    await writeFile(filePath, 'hello', 'utf-8')
    await git.add('test.txt')
    const commitResult = await git.commit('initial commit')
    const sha = commitResult.commit

    const notes = await readCheckpointNotes(git, sha)
    expect(notes).toEqual([])
  })

  it('notes survive across branches', async () => {
    // Create initial commit on main
    const filePath = path.join(tempDir, 'test.txt')
    await writeFile(filePath, 'hello', 'utf-8')
    await git.add('test.txt')
    const commitResult = await git.commit('initial commit')
    const sha = commitResult.commit

    // Attach a note on main
    const checkpoint: CheckpointNote = {
      id: 'WI-001-keep-1',
      work_item_id: 'WI-001',
      verdict: 'keep',
      notes: 'approved',
      called_at: new Date().toISOString(),
      called_by: 'test@example.com',
      caller_type: 'human',
      git_commit: sha,
    }
    await writeCheckpointNote(git, sha, checkpoint)

    // Create and switch to a feature branch
    await git.checkoutBranch('feature/test', 'HEAD')

    // Add another commit on the feature branch
    await writeFile(path.join(tempDir, 'feature.txt'), 'feature work', 'utf-8')
    await git.add('feature.txt')
    await git.commit('feature work')

    // Notes attached to the original commit should still be readable
    const notes = await readCheckpointNotes(git, sha)
    expect(notes).toHaveLength(1)
    expect(notes[0].id).toBe('WI-001-keep-1')

    // Switch back to main — notes still there
    await git.checkout('master').catch(() => git.checkout('main'))
    const notesOnMain = await readCheckpointNotes(git, sha)
    expect(notesOnMain).toHaveLength(1)
    expect(notesOnMain[0].verdict).toBe('keep')
  })

  it('preserves notes after additional commits', async () => {
    // First commit
    await writeFile(path.join(tempDir, 'a.txt'), 'a', 'utf-8')
    await git.add('a.txt')
    const first = await git.commit('first')
    const firstSha = first.commit

    // Attach note to first commit
    const checkpoint: CheckpointNote = {
      id: 'WI-001-keep-1',
      work_item_id: 'WI-001',
      verdict: 'keep',
      notes: 'first checkpoint',
      called_at: new Date().toISOString(),
      called_by: 'test@example.com',
      caller_type: 'human',
      git_commit: firstSha,
    }
    await writeCheckpointNote(git, firstSha, checkpoint)

    // More commits
    await writeFile(path.join(tempDir, 'b.txt'), 'b', 'utf-8')
    await git.add('b.txt')
    await git.commit('second')

    await writeFile(path.join(tempDir, 'c.txt'), 'c', 'utf-8')
    await git.add('c.txt')
    await git.commit('third')

    // Note on first commit should still be there
    const notes = await readCheckpointNotes(git, firstSha)
    expect(notes).toHaveLength(1)
    expect(notes[0].notes).toBe('first checkpoint')
  })
})
