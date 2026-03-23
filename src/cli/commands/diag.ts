import { execa } from 'execa'
import { isGitRepo, getUserEmail } from '../../core/git.js'
import { configExists, loadConfig } from '../../core/config.js'
import { loadRunSession } from '../../core/checkpoint.js'
import { getCurrentWorkItem } from '../../core/state.js'
import { getEnforceStatus } from '../../core/enforce.js'
import chalk from 'chalk'

interface Check {
  name: string
  passed: boolean
  detail: string
  fix?: string
}

export async function runDiag(repoPath: string = process.cwd()): Promise<void> {
  console.log(`\n  ${chalk.bold('babel diag')} — checking your environment\n`)

  const checks: Check[] = []

  // 1. git installed and version >= 2.28
  checks.push(await checkGitVersion())

  // 2. node version >= 18
  checks.push(checkNodeVersion())

  // 3. In a git repo
  checks.push(await checkIsGitRepo(repoPath))

  // 4. babel.config.yml exists and is valid
  checks.push(await checkConfig(repoPath))

  // 5. git user configured
  checks.push(await checkGitUser(repoPath))

  // 6. No stale run session
  checks.push(await checkStaleRunSession(repoPath))

  // 7. Enforcement hooks
  checks.push(await checkEnforcement(repoPath))

  // 8. Integration credentials (if configured)
  const integrationChecks = await checkIntegrations(repoPath)
  checks.push(...integrationChecks)

  // Print results
  const width = Math.max(...checks.map(c => c.name.length)) + 2
  let allPassed = true

  for (const check of checks) {
    const icon = check.passed ? chalk.green('✓') : chalk.red('✗')
    const name = check.name.padEnd(width)
    const detail = check.passed ? chalk.dim(check.detail) : chalk.yellow(check.detail)
    console.log(`  ${icon} ${name} ${detail}`)
    if (!check.passed) {
      allPassed = false
      if (check.fix) {
        console.log(`    ${chalk.dim('Fix:')} ${check.fix}`)
      }
    }
  }

  console.log()
  if (allPassed) {
    console.log(`  ${chalk.green('Everything looks good.')}\n`)
  } else {
    const failures = checks.filter(c => !c.passed).length
    console.log(`  ${chalk.yellow(`${failures} issue(s) found.`)} Fix them and run 'babel diag' again.\n`)
    process.exit(1)
  }
}

async function checkGitVersion(): Promise<Check> {
  try {
    const result = await execa('git', ['--version'], { reject: false })
    const match = result.stdout.match(/(\d+)\.(\d+)/)
    if (match) {
      const major = parseInt(match[1])
      const minor = parseInt(match[2])
      const version = `${major}.${minor}`
      if (major > 2 || (major === 2 && minor >= 28)) {
        return { name: 'git version', passed: true, detail: `git ${version}` }
      }
      return {
        name: 'git version',
        passed: false,
        detail: `git ${version} — need >= 2.28`,
        fix: 'Update git: https://git-scm.com',
      }
    }
    return { name: 'git version', passed: false, detail: 'could not parse git version' }
  } catch {
    return {
      name: 'git installed',
      passed: false,
      detail: 'git not found',
      fix: 'Install git: https://git-scm.com',
    }
  }
}

function checkNodeVersion(): Check {
  const version = process.versions.node
  const major = parseInt(version.split('.')[0])
  if (major >= 18) {
    return { name: 'node version', passed: true, detail: `node ${version}` }
  }
  return {
    name: 'node version',
    passed: false,
    detail: `node ${version} — need >= 18`,
    fix: 'Update Node.js: https://nodejs.org',
  }
}

async function checkIsGitRepo(repoPath: string): Promise<Check> {
  const is = await isGitRepo(repoPath)
  if (is) return { name: 'git repository', passed: true, detail: repoPath }
  return {
    name: 'git repository',
    passed: false,
    detail: 'not a git repository',
    fix: "Run 'git init' to initialize a repository",
  }
}

async function checkConfig(repoPath: string): Promise<Check> {
  if (!(await configExists(repoPath))) {
    return {
      name: 'babel.config.yml',
      passed: false,
      detail: 'not found',
      fix: "Run 'babel init' to create it",
    }
  }
  try {
    await loadConfig(repoPath)
    return { name: 'babel.config.yml', passed: true, detail: 'valid' }
  } catch (err) {
    return {
      name: 'babel.config.yml',
      passed: false,
      detail: (err as Error).message,
      fix: "Run 'babel config validate' for details",
    }
  }
}

async function checkGitUser(repoPath: string): Promise<Check> {
  const email = await getUserEmail(repoPath)
  if (email && email !== 'unknown') {
    return { name: 'git user', passed: true, detail: email }
  }
  return {
    name: 'git user',
    passed: false,
    detail: 'git user.email not configured',
    fix: "Run: git config --global user.email 'you@example.com'",
  }
}

async function checkStaleRunSession(repoPath: string): Promise<Check> {
  const session = await loadRunSession(repoPath).catch(() => null)
  if (!session) return { name: 'run session', passed: true, detail: 'none open' }

  const workItem = await getCurrentWorkItem(repoPath).catch(() => null)
  const age = Math.round((Date.now() - new Date(session.started_at).getTime()) / 60000)

  return {
    name: 'run session',
    passed: false,
    detail: `stale session open for ${workItem?.id || '?'} (${age} minutes)`,
    fix: "Call a verdict: babel keep/refine/reject/ship",
  }
}

async function checkEnforcement(repoPath: string): Promise<Check> {
  const status = await getEnforceStatus(repoPath).catch(() => null)
  if (!status) {
    return {
      name: 'enforcement hooks',
      passed: false,
      detail: 'could not read .git/hooks',
    }
  }

  const conflicts = status.hooks.filter(h => h.conflict)

  if (status.active) {
    const installedNames = status.hooks.filter(h => h.installed).map(h => h.name)
    const detail = conflicts.length > 0
      ? `active (${installedNames.join(', ')}) — ${conflicts.length} hook(s) skipped (conflict)`
      : `active (${installedNames.join(', ')})`
    return { name: 'enforcement hooks', passed: true, detail }
  }

  return {
    name: 'enforcement hooks',
    passed: false,
    detail: 'not active — direct git operations are not blocked',
    fix: "Run 'babel enforce on' to enable",
  }
}

async function checkIntegrations(repoPath: string): Promise<Check[]> {
  const checks: Check[] = []
  const config = await loadConfig(repoPath).catch(() => null)
  if (!config) return checks

  if (config.integrations?.linear?.enabled) {
    const keyEnv = config.integrations.linear.api_key_env || 'LINEAR_API_KEY'
    const hasKey = !!process.env[keyEnv]
    checks.push({
      name: `Linear (${keyEnv})`,
      passed: hasKey,
      detail: hasKey ? 'API key found' : `${keyEnv} not set`,
      fix: hasKey ? undefined : `Set ${keyEnv} in your environment`,
    })
  }

  if (config.integrations?.github?.enabled) {
    const keyEnv = config.integrations.github.token_env || 'GITHUB_TOKEN'
    const hasKey = !!process.env[keyEnv]
    checks.push({
      name: `GitHub (${keyEnv})`,
      passed: hasKey,
      detail: hasKey ? 'token found' : `${keyEnv} not set`,
      fix: hasKey ? undefined : `Set ${keyEnv} in your environment`,
    })
  }

  return checks
}
