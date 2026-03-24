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
  if (checkRemote.status === 0) {
    info(`Branch '${branchName}' already exists on origin.`)
    // Update branch field if not set
    if (!wi.branch) {
      wi.branch = branchName
      await saveWorkItem(wi, repoPath)
    }
    return
  }

  // Create branch from base, commit spec, push
  const base = config.base_branch
  const userEmail = await getUserEmail(repoPath)

  // Stash any current changes so we can safely create the branch
  const stashResult = spawnSync('git', ['stash', '--include-untracked', '-m', `babel-todo-push-stash-${id}`], {
    cwd: repoPath, encoding: 'utf8',
  })
  const stashed = stashResult.status === 0 && !stashResult.stdout.includes('No local changes')

  try {
    // Create branch from remote base or local base
    const startPoint = checkRemote.status !== 0
      ? (spawnSync('git', ['rev-parse', '--verify', `origin/${base}`], { cwd: repoPath }).status === 0
        ? `origin/${base}` : base)
      : base

    const checkoutResult = spawnSync('git', ['checkout', '-b', branchName, startPoint], {
      cwd: repoPath, encoding: 'utf8',
    })
    if (checkoutResult.status !== 0) {
      throw new Error(checkoutResult.stderr)
    }

    // Write spec file to docs/specs/
    const specsDir = path.join(repoPath, 'docs', 'specs')
    fs.mkdirSync(specsDir, { recursive: true })
    const specPath = path.join(specsDir, `${id}.md`)

    // Read from .babel/notes if it exists, else use description
    const notesPath = path.join(repoPath, '.babel', 'notes', `${id}.md`)
    const specContent = fs.existsSync(notesPath)
      ? fs.readFileSync(notesPath, 'utf8')
      : `# ${id}: ${wi.description}\n\nStatus: todo\nPlanned: ${wi.planned_at ?? wi.created_at}\nAuthor: ${userEmail}\n`

    fs.writeFileSync(specPath, specContent)

    spawnSync('git', ['add', specPath], { cwd: repoPath })
    const commitResult = spawnSync('git', [
      '-c', `user.email=${userEmail}`,
      'commit', '-m', `todo(${id}): ${wi.description}`,
    ], { cwd: repoPath, encoding: 'utf8' })
    if (commitResult.status !== 0) {
      throw new Error(commitResult.stderr)
    }

    const pushResult = spawnSync('git', ['push', '-u', 'origin', branchName], {
      cwd: repoPath, encoding: 'utf8',
    })
    if (pushResult.status !== 0) {
      throw new Error(pushResult.stderr)
    }

    // Update work item with branch
    wi.branch = branchName
    await saveWorkItem(wi, repoPath)

    // Return to previous branch
    const currentBranchResult = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: repoPath, encoding: 'utf8',
    })
    // Go back to whatever branch we were on before
    spawnSync('git', ['checkout', '-'], { cwd: repoPath })

    console.log()
    success(`${id} pushed to GitHub`)
    console.log()
    console.log(`  Branch: ${chalk.cyan(branchName)}`)
    console.log(`  Spec:   docs/specs/${id}.md`)
    console.log(chalk.dim(`\n  GitHub branch list now shows this as a planned item.`))
    console.log(chalk.dim(`  When ready: babel start ${id}\n`))

  } catch (err) {
    // Try to restore branch state
    spawnSync('git', ['checkout', '-'], { cwd: repoPath })
    error(`Could not push todo branch: ${(err as Error).message}`)
    process.exit(1)
  } finally {
    if (stashed) {
      spawnSync('git', ['stash', 'pop'], { cwd: repoPath })
    }
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
