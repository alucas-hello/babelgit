import { spawnSync } from 'child_process'
import inquirer from 'inquirer'
import { loadConfig } from '../../core/config.js'
import { loadState, saveState, getNextLocalId, saveWorkItem, setCurrentWorkItem } from '../../core/state.js'
import { fetchOrigin, checkoutNewBranch, getCurrentBranch, getUserEmail, localBranchExists, remoteExists } from '../../core/git.js'
import { buildBranchName, isWorkItemId } from '../../core/workitem.js'
import { detectCallerType, checkNoExistingWorkItem, checkAgentBranchPermission } from '../../core/governance.js'
import { appendConversationEntry } from '../../core/conversation.js'
import { error, success, hint, info } from '../display.js'
import type { WorkItem, BabelConfig, BabelState } from '../../types.js'

export async function runStart(idOrDescription?: string, repoPath: string = process.cwd()): Promise<void> {
  const config = await loadConfig(repoPath).catch(err => {
    if (err.message === 'NO_CONFIG') {
      error(
        "No babel.config.yml found.",
        undefined,
        "Run 'babel init' to set up babelgit in this repository."
      )
      process.exit(1)
    }
    throw err
  })

  const state = await loadState(repoPath)
  const caller = detectCallerType()

  // Check no active work item
  const existingCheck = checkNoExistingWorkItem(state.work_items)
  if (!existingCheck.permitted) {
    error('Cannot start new work item', existingCheck.reason, existingCheck.suggestion)
    process.exit(1)
  }

  // Determine ID and description
  let id: string
  let description: string

  // Check if starting an existing todo item
  if (idOrDescription && isWorkItemId(idOrDescription)) {
    const existingWI = state.work_items[idOrDescription.toUpperCase()]
    if (existingWI?.stage === 'todo') {
      return startTodoItem(existingWI, config, state, repoPath)
    }
    // Treat as a new WI with explicit ID
    id = idOrDescription.toUpperCase()
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'description',
        message: `Description for ${id}?`,
        validate: (input: string) => input.trim().length > 0 || 'Description is required',
      },
    ])
    description = answers.description.trim()
  } else if (!idOrDescription) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'description',
        message: 'What are you working on?',
        validate: (input: string) => input.trim().length > 0 || 'Description is required',
      },
    ])
    description = answers.description.trim()
    id = await getNextLocalId(repoPath)
  } else {
    description = idOrDescription.trim()
    id = await getNextLocalId(repoPath)
  }

  const branchName = buildBranchName(id, description, config)

  // Check agent branch permission
  const agentCheck = checkAgentBranchPermission(branchName, config, caller)
  if (!agentCheck.permitted) {
    error('Branch not permitted for agents', agentCheck.reason, agentCheck.suggestion)
    process.exit(1)
  }

  const userEmail = await getUserEmail(repoPath)

  // Fetch and create branch
  try {
    await fetchOrigin(repoPath)
  } catch {
    // Might not have a remote — that's OK for local repos
    info('No remote found, skipping fetch.')
  }

  let startPoint = `origin/${config.base_branch}`
  const remoteBase = await remoteExists(config.base_branch, repoPath).catch(() => false)
  if (!remoteBase) {
    // Fallback to local base branch
    const localExists = await localBranchExists(config.base_branch, repoPath).catch(() => false)
    if (localExists) {
      startPoint = config.base_branch
    } else {
      // Use HEAD
      startPoint = 'HEAD'
    }
  }

  try {
    await checkoutNewBranch(branchName, startPoint, repoPath)
  } catch (err) {
    error(
      `Could not create branch '${branchName}'.`,
      (err as Error).message,
      'Make sure the branch name is valid and does not already exist.'
    )
    process.exit(1)
  }

  // Create work item
  const now = new Date().toISOString()
  let workItem: WorkItem = {
    id,
    description,
    branch: branchName,
    stage: 'in_progress',
    created_at: now,
    created_by: userEmail,
  }

  await saveWorkItem(workItem, repoPath)
  await setCurrentWorkItem(id, repoPath)

  await appendConversationEntry(repoPath, id, {
    event: 'start',
    timestamp: now,
    description,
    branch: branchName,
    createdBy: userEmail,
  })

  // Integration callbacks (non-fatal)
  try {
    const { IntegrationManager } = await import('../../integrations/index.js')
    const mgr = new IntegrationManager(config, repoPath)
    workItem = await mgr.onStart(workItem)
  } catch {
    // Non-fatal
  }

  console.log()
  success(`Work item started: ${id}`)
  console.log()
  console.log(`  ${id}: ${description}`)
  console.log(`  Branch: ${branchName}`)
  console.log()
  hint(`Make your changes, then: babel save "what you did"`)
  console.log()
}

async function startTodoItem(
  wi: WorkItem,
  config: BabelConfig,
  state: BabelState,
  repoPath: string
): Promise<void> {
  const branchName = wi.branch ?? buildBranchName(wi.id, wi.description, config)

  try {
    await fetchOrigin(repoPath)
  } catch { /* no remote */ }

  // Check if branch already exists on remote (from babel todo push)
  const remoteHasBranch = spawnSync('git', ['ls-remote', '--exit-code', '--heads', 'origin', branchName], {
    cwd: repoPath, encoding: 'utf8',
  }).status === 0

  if (remoteHasBranch) {
    // Check out the existing remote branch
    const result = spawnSync('git', ['checkout', '-b', branchName, `origin/${branchName}`], {
      cwd: repoPath, encoding: 'utf8',
    })
    if (result.status !== 0) {
      // Branch may already exist locally
      const localResult = spawnSync('git', ['checkout', branchName], { cwd: repoPath, encoding: 'utf8' })
      if (localResult.status !== 0) {
        error(`Could not checkout branch '${branchName}'.`, result.stderr)
        process.exit(1)
      }
    }
  } else {
    // Create new branch from base
    let startPoint = `origin/${config.base_branch}`
    const remoteBase = await remoteExists(config.base_branch, repoPath).catch(() => false)
    if (!remoteBase) {
      const localExists = await localBranchExists(config.base_branch, repoPath).catch(() => false)
      startPoint = localExists ? config.base_branch : 'HEAD'
    }
    try {
      await checkoutNewBranch(branchName, startPoint, repoPath)
    } catch (err) {
      error(`Could not create branch '${branchName}'.`, (err as Error).message)
      process.exit(1)
    }
  }

  // Transition stage and set branch
  wi.stage = 'in_progress'
  wi.branch = branchName
  await saveWorkItem(wi, repoPath)
  await setCurrentWorkItem(wi.id, repoPath)

  await appendConversationEntry(repoPath, wi.id, {
    event: 'start',
    timestamp: new Date().toISOString(),
    description: wi.description,
    branch: branchName,
    createdBy: wi.created_by,
  })

  console.log()
  success(`Work item started: ${wi.id}`)
  console.log()
  console.log(`  ${wi.id}: ${wi.description}`)
  console.log(`  Branch: ${branchName}`)
  console.log()
  hint(`Make your changes, then: babel save "what you did"`)
  console.log()
}
