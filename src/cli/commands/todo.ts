import * as fs from 'fs'
import * as path from 'path'
import { spawnSync } from 'child_process'
import { loadConfig } from '../../core/config.js'
import { loadState, saveState, getNextLocalId, saveWorkItem } from '../../core/state.js'
import { getUserEmail, fetchOrigin } from '../../core/git.js'
import { buildBranchName, isWorkItemId } from '../../core/workitem.js'
import { error, success, info } from '../display.js'
import chalk from 'chalk'
import type { WorkItem } from '../../types.js'

export async function runTodo(
  action: string = 'create',
  args: string[] = [],
  repoPath: string = process.cwd()
): Promise<void> {
  switch (action) {
    case 'create': return createTodo(args[0], repoPath)
    case 'push':   return pushTodo(args[0], repoPath)
    case 'list':   return listTodos(repoPath)
    default:
      // Treat unknown action as the description (babel todo "my desc")
      return createTodo(action, repoPath)
  }
}

async function createTodo(description: string | undefined, repoPath: string): Promise<void> {
  const config = await loadConfig(repoPath).catch(err => {
    if (err.message === 'NO_CONFIG') {
      error('No babel.config.yml found.', undefined, "Run 'babel init' to set up babelgit.")
      process.exit(1)
    }
    throw err
  })

  if (!description?.trim()) {
    error('A description is required.', undefined, 'Usage: babel todo "what you plan to build"')
    process.exit(1)
  }

  description = description.trim()
  const id = await getNextLocalId(repoPath)
  const userEmail = await getUserEmail(repoPath)
  const now = new Date().toISOString()

  const workItem: WorkItem = {
    id,
    description,
    stage: 'todo',
    created_at: now,
    planned_at: now,
    created_by: userEmail,
  }

  await saveWorkItem(workItem, repoPath)

  // Create notes/spec file
  const notesDir = path.join(repoPath, '.babel', 'notes')
  fs.mkdirSync(notesDir, { recursive: true })
  const notesPath = path.join(notesDir, `${id}.md`)
  if (!fs.existsSync(notesPath)) {
    fs.writeFileSync(notesPath, `${id}: ${description}\n\n---\n\n`)
  }

  console.log()
  success(`Todo created: ${id}`)
  console.log()
  console.log(`  ${id}: ${description}`)
  console.log(chalk.dim(`  Stage: todo — no branch yet`))
  console.log()
  console.log(chalk.dim(`  When ready to start: babel start ${id}`))
  console.log(chalk.dim(`  Push spec to GitHub: babel todo push ${id}`))
  console.log()
}

async function pushTodo(idArg: string | undefined, repoPath: string): Promise<void> {
  if (!idArg || !isWorkItemId(idArg)) {
    error('A work item ID is required.', undefined, 'Usage: babel todo push WI-XXX')
    process.exit(1)
  }

  const id = idArg.toUpperCase()
  const config = await loadConfig(repoPath)
  const state = await loadState(repoPath)
  const wi = state.work_items[id]

  if (!wi) {
    error(`Work item ${id} not found.`)
    process.exit(1)
  }

  if (wi.stage !== 'todo') {
    error(`${id} is in '${wi.stage}' stage — only todo items can be pushed this way.`)
    process.exit(1)
  }

  const branchName = buildBranchName(id, wi.description, config)

  // Fetch to check if branch already exists on remote
  try { await fetchOrigin(repoPath) } catch { /* no remote — will fail on push */ }

  const checkRemote = spawnSync('git', ['ls-remote', '--exit-code', '--heads', 'origin', branchName], {
    cwd: repoPath, encoding: 'utf8',
  })

  // Branch already exists — re-sync spec via worktree
  if (checkRemote.status === 0) {
    if (!wi.branch) {
      wi.branch = branchName
      await saveWorkItem(wi, repoPath)
    }
    await syncSpecWorktree(repoPath, wi.id, branchName)
    return
  }

  // Initial push: create branch from base using a worktree, commit spec, push
  const base = config.base_branch
  const userEmail = await getUserEmail(repoPath)
  const startPoint = spawnSync('git', ['rev-parse', '--verify', `origin/${base}`], { cwd: repoPath }).status === 0
    ? `origin/${base}` : base

  const worktreePath = path.join(repoPath, '.babel', `spec-push-${id}`)
  try {
    // Clean up stale worktree if present
    spawnSync('git', ['worktree', 'remove', '--force', worktreePath], { cwd: repoPath })

    // Create branch + worktree in one step
    const addResult = spawnSync('git', ['worktree', 'add', '-b', branchName, worktreePath, startPoint], {
      cwd: repoPath, encoding: 'utf8',
    })
    if (addResult.status !== 0) throw new Error(addResult.stderr)

    // Write spec file
    const specsDir = path.join(worktreePath, 'docs', 'specs')
    fs.mkdirSync(specsDir, { recursive: true })
    const specPath = path.join(specsDir, `${id}.md`)
    const notesPath = path.join(repoPath, '.babel', 'notes', `${id}.md`)
    const specContent = fs.existsSync(notesPath)
      ? fs.readFileSync(notesPath, 'utf8')
      : `# ${id}: ${wi.description}\n\nStatus: todo\nPlanned: ${wi.planned_at ?? wi.created_at}\nAuthor: ${userEmail}\n`
    fs.writeFileSync(specPath, specContent)

    spawnSync('git', ['add', specPath], { cwd: worktreePath })
    const commitResult = spawnSync('git', [
      '-c', `user.email=${userEmail}`,
      'commit', '-m', `todo(${id}): ${wi.description}`,
    ], { cwd: worktreePath, encoding: 'utf8' })
    if (commitResult.status !== 0) throw new Error(commitResult.stderr)

    const pushResult = spawnSync('git', ['push', '-u', 'origin', branchName], {
      cwd: worktreePath, encoding: 'utf8',
    })
    if (pushResult.status !== 0) throw new Error(pushResult.stderr)

    // Update work item with branch
    wi.branch = branchName
    await saveWorkItem(wi, repoPath)

    console.log()
    success(`${id} pushed to GitHub`)
    console.log()
    console.log(`  Branch: ${chalk.cyan(branchName)}`)
    console.log(`  Spec:   docs/specs/${id}.md`)
    console.log(chalk.dim(`\n  GitHub branch list now shows this as a planned item.`))
    console.log(chalk.dim(`  Spec auto-syncs when updated. Manual sync: babel todo push ${id}`))
    console.log(chalk.dim(`  When ready: babel start ${id}\n`))

  } catch (err) {
    error(`Could not push todo branch: ${(err as Error).message}`)
    process.exit(1)
  } finally {
    spawnSync('git', ['worktree', 'remove', '--force', worktreePath], { cwd: repoPath })
  }
}

async function syncSpecWorktree(repoPath: string, id: string, branchName: string): Promise<void> {
  const worktreePath = path.join(repoPath, '.babel', `spec-sync-${id}`)
  try {
    spawnSync('git', ['worktree', 'remove', '--force', worktreePath], { cwd: repoPath })
    const addResult = spawnSync('git', ['worktree', 'add', '--force', worktreePath, branchName], {
      cwd: repoPath, encoding: 'utf8',
    })
    if (addResult.status !== 0) {
      // Try with origin/branch if local doesn't exist
      const addRemote = spawnSync('git', ['worktree', 'add', '--force', '-b', branchName, worktreePath, `origin/${branchName}`], {
        cwd: repoPath, encoding: 'utf8',
      })
      if (addRemote.status !== 0) throw new Error(addRemote.stderr)
    }

    const specsDir = path.join(worktreePath, 'docs', 'specs')
    fs.mkdirSync(specsDir, { recursive: true })
    const specDest = path.join(specsDir, `${id}.md`)
    const notesPath = path.join(repoPath, '.babel', 'notes', `${id}.md`)
    if (fs.existsSync(notesPath)) fs.copyFileSync(notesPath, specDest)

    spawnSync('git', ['add', specDest], { cwd: worktreePath })
    const diff = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: worktreePath })
    if (diff.status === 0) {
      info(`Spec for ${id} is already up to date.`)
      return
    }

    spawnSync('git', ['commit', '-m', `spec(${id}): sync`], { cwd: worktreePath })
    const pushResult = spawnSync('git', ['push', 'origin', branchName], { cwd: worktreePath, encoding: 'utf8' })
    if (pushResult.status !== 0) throw new Error(pushResult.stderr)

    console.log()
    success(`Spec for ${id} synced to GitHub`)
    console.log(chalk.dim(`  Branch: ${branchName}`))
    console.log(chalk.dim(`  File:   docs/specs/${id}.md\n`))
  } finally {
    spawnSync('git', ['worktree', 'remove', '--force', worktreePath], { cwd: repoPath })
  }
}

async function listTodos(repoPath: string): Promise<void> {
  const state = await loadState(repoPath).catch(() => null)
  if (!state) {
    error('No babel state found.', undefined, "Run 'babel init' first.")
    process.exit(1)
  }

  const todos = Object.values(state.work_items).filter(wi => wi.stage === 'todo')

  if (todos.length === 0) {
    console.log(chalk.dim('\n  No todo items.\n'))
    console.log(chalk.dim('  Plan something: babel todo "description"\n'))
    return
  }

  console.log(`\n  ${chalk.bold('Todo items')}\n`)
  for (const wi of todos) {
    const pushed = wi.branch ? chalk.cyan(' [pushed]') : ''
    console.log(`  ${chalk.bold(wi.id)}  ${wi.description}${pushed}`)
    console.log(chalk.dim(`    Planned: ${new Date(wi.planned_at ?? wi.created_at).toLocaleDateString()}`))
  }
  console.log()
}
