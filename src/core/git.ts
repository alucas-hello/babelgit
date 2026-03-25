import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git'
import path from 'path'
import { showGitCommand } from '../cli/display.js'

export function createGit(repoPath: string = process.cwd()): SimpleGit {
  const options: Partial<SimpleGitOptions> = {
    baseDir: repoPath,
    binary: 'git',
    maxConcurrentProcesses: 6,
  }
  return simpleGit(options)
}

export async function isGitRepo(repoPath: string = process.cwd()): Promise<boolean> {
  try {
    const git = createGit(repoPath)
    await git.revparse(['--git-dir'])
    return true
  } catch {
    return false
  }
}

export async function getCurrentBranch(repoPath: string = process.cwd()): Promise<string> {
  const git = createGit(repoPath)
  return git.revparse(['--abbrev-ref', 'HEAD'])
}

export async function getCurrentCommitSha(repoPath: string = process.cwd()): Promise<string> {
  const git = createGit(repoPath)
  return git.revparse(['HEAD'])
}

export async function getShortSha(sha: string, repoPath: string = process.cwd()): Promise<string> {
  const git = createGit(repoPath)
  return git.revparse(['--short', sha])
}

export async function getUserEmail(repoPath: string = process.cwd()): Promise<string> {
  try {
    const git = createGit(repoPath)
    const result = await git.raw(['config', 'user.email'])
    return result.trim() || 'unknown'
  } catch {
    return 'unknown'
  }
}

export async function fetchOrigin(repoPath: string = process.cwd(), quiet = false): Promise<void> {
  const git = createGit(repoPath)
  if (!quiet) showGitCommand('git fetch origin')
  await git.fetch('origin')
}

export async function checkoutNewBranch(
  branchName: string,
  startPoint: string,
  repoPath: string = process.cwd(),
  quiet = false
): Promise<void> {
  const git = createGit(repoPath)
  if (!quiet) showGitCommand(`git checkout -b ${branchName} ${startPoint}`)
  await git.checkoutBranch(branchName, startPoint)
}

export async function checkoutBranch(
  branchName: string,
  repoPath: string = process.cwd(),
  quiet = false
): Promise<void> {
  const git = createGit(repoPath)
  if (!quiet) showGitCommand(`git checkout ${branchName}`)
  await git.checkout(branchName)
}

export async function addAll(repoPath: string = process.cwd(), quiet = false): Promise<void> {
  const git = createGit(repoPath)
  if (!quiet) showGitCommand('git add -A')
  await git.add(['-A'])
}

export async function commit(
  message: string,
  repoPath: string = process.cwd(),
  quiet = false
): Promise<string> {
  const git = createGit(repoPath)
  if (!quiet) showGitCommand(`git commit -m "${message}"`)
  const result = await git.commit(message)
  return result.commit
}

export async function push(
  branch: string,
  repoPath: string = process.cwd(),
  quiet = false
): Promise<void> {
  const git = createGit(repoPath)
  if (!quiet) showGitCommand(`git push origin ${branch}`)
  await git.push('origin', branch)
}

export async function pushWithUpstream(
  branch: string,
  repoPath: string = process.cwd(),
  quiet = false
): Promise<void> {
  const git = createGit(repoPath)
  if (!quiet) showGitCommand(`git push -u origin ${branch}`)
  await git.push(['origin', branch, '--set-upstream'])
}

export async function pullBranch(
  branch: string,
  repoPath: string = process.cwd(),
  quiet = false
): Promise<void> {
  const git = createGit(repoPath)
  if (!quiet) showGitCommand(`git pull origin ${branch}`)
  await git.pull('origin', branch)
}

export async function rebase(
  onto: string,
  repoPath: string = process.cwd(),
  quiet = false
): Promise<void> {
  const git = createGit(repoPath)
  if (!quiet) showGitCommand(`git rebase ${onto}`)
  await git.rebase([onto])
}

export async function merge(
  branch: string,
  repoPath: string = process.cwd(),
  quiet = false
): Promise<void> {
  const git = createGit(repoPath)
  if (!quiet) showGitCommand(`git merge ${branch}`)
  await git.merge([branch])
}

export async function mergeNoFF(
  branch: string,
  message: string,
  repoPath: string = process.cwd(),
  quiet = false
): Promise<void> {
  const git = createGit(repoPath)
  if (!quiet) showGitCommand(`git merge --no-ff ${branch} -m "${message}"`)
  await git.merge(['--no-ff', branch, '-m', message])
}

export async function deleteLocalBranch(
  branch: string,
  repoPath: string = process.cwd(),
  quiet = false
): Promise<void> {
  const git = createGit(repoPath)
  if (!quiet) showGitCommand(`git branch -d ${branch}`)
  await git.deleteLocalBranch(branch, true)
}

export async function deleteRemoteBranch(
  branch: string,
  repoPath: string = process.cwd(),
  quiet = false
): Promise<void> {
  const git = createGit(repoPath)
  if (!quiet) showGitCommand(`git push origin --delete ${branch}`)
  await git.push(['origin', '--delete', branch])
}

export async function resetHard(
  sha: string,
  repoPath: string = process.cwd(),
  quiet = false
): Promise<void> {
  const git = createGit(repoPath)
  if (!quiet) showGitCommand(`git reset --hard ${sha}`)
  await git.reset(['--hard', sha])
}

export async function getStatusPorcelain(repoPath: string = process.cwd()): Promise<string> {
  const git = createGit(repoPath)
  const result = await git.raw(['status', '--porcelain'])
  return result
}

export async function hasUncommittedChanges(repoPath: string = process.cwd()): Promise<boolean> {
  const status = await getStatusPorcelain(repoPath)
  return status.trim().length > 0
}

export async function getUncommittedFileCount(repoPath: string = process.cwd()): Promise<number> {
  const status = await getStatusPorcelain(repoPath)
  if (!status.trim()) return 0
  return status.trim().split('\n').length
}

export async function getCommitsAheadOfBase(
  baseBranch: string,
  repoPath: string = process.cwd()
): Promise<number> {
  try {
    const git = createGit(repoPath)
    const result = await git.raw(['rev-list', '--count', `origin/${baseBranch}..HEAD`])
    return parseInt(result.trim(), 10) || 0
  } catch {
    return 0
  }
}

export async function hasConflicts(repoPath: string = process.cwd()): Promise<boolean> {
  try {
    const git = createGit(repoPath)
    const result = await git.raw(['diff', '--name-only', '--diff-filter=U'])
    return result.trim().length > 0
  } catch {
    return false
  }
}

export async function remoteExists(
  remoteBranch: string,
  repoPath: string = process.cwd()
): Promise<boolean> {
  try {
    const git = createGit(repoPath)
    await git.raw(['ls-remote', '--exit-code', '--heads', 'origin', remoteBranch])
    return true
  } catch {
    return false
  }
}

export async function localBranchExists(
  branch: string,
  repoPath: string = process.cwd()
): Promise<boolean> {
  try {
    const git = createGit(repoPath)
    await git.raw(['rev-parse', '--verify', branch])
    return true
  } catch {
    return false
  }
}

export async function getDefaultBranch(repoPath: string = process.cwd()): Promise<string> {
  try {
    const git = createGit(repoPath)
    // Try to detect from remote HEAD
    const result = await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD'])
    const match = result.trim().match(/refs\/remotes\/origin\/(.+)/)
    if (match) return match[1]
  } catch {
    // Fallback to checking common names
  }
  try {
    const git = createGit(repoPath)
    await git.raw(['rev-parse', '--verify', 'main'])
    return 'main'
  } catch {
    return 'master'
  }
}

export async function getConflictingFiles(repoPath: string = process.cwd()): Promise<string[]> {
  try {
    const git = createGit(repoPath)
    const result = await git.raw(['diff', '--name-only', '--diff-filter=U'])
    return result.trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

export async function rebaseContinue(repoPath: string = process.cwd(), quiet = false): Promise<void> {
  const git = createGit(repoPath)
  if (!quiet) showGitCommand('git rebase --continue')
  await git.rebase(['--continue'])
}

export async function getLog(
  count: number,
  repoPath: string = process.cwd()
): Promise<Array<{ hash: string; message: string; date: string; author_email: string }>> {
  const git = createGit(repoPath)
  const log = await git.log({ maxCount: count })
  return log.all.map(l => ({
    hash: l.hash,
    message: l.message,
    date: l.date,
    author_email: l.author_email,
  }))
}

// ─── Git Notes ───────────────────────────────────────────────────────────────

export async function notesAdd(
  ref: string,
  commitSha: string,
  content: string,
  repoPath: string = process.cwd()
): Promise<void> {
  const git = createGit(repoPath)
  await git.raw(['notes', `--ref=${ref}`, 'add', '-f', '-m', content, commitSha])
}

export async function notesFetch(
  ref: string,
  repoPath: string = process.cwd()
): Promise<void> {
  const git = createGit(repoPath)
  await git.raw(['fetch', 'origin', `refs/notes/${ref}:refs/notes/${ref}`])
}

export async function notesPush(
  ref: string,
  repoPath: string = process.cwd()
): Promise<void> {
  const git = createGit(repoPath)
  await git.raw(['push', 'origin', `refs/notes/${ref}`])
}

export async function notesShow(
  ref: string,
  commitSha: string,
  repoPath: string = process.cwd()
): Promise<string | null> {
  try {
    const git = createGit(repoPath)
    const result = await git.raw(['notes', `--ref=${ref}`, 'show', commitSha])
    return result.trim()
  } catch {
    return null
  }
}

export async function notesListForRef(
  ref: string,
  repoPath: string = process.cwd()
): Promise<string[]> {
  try {
    const git = createGit(repoPath)
    const result = await git.raw(['notes', `--ref=${ref}`, 'list'])
    if (!result.trim()) return []
    return result.trim().split('\n').map(line => {
      // Each line: <note-sha> <commit-sha>
      const parts = line.trim().split(/\s+/)
      return parts[1] || ''
    }).filter(Boolean)
  } catch {
    return []
  }
}
