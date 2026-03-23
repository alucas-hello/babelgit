import { writeFile, readFile, chmod, unlink } from 'fs/promises'
import path from 'path'

// ─── Constants ────────────────────────────────────────────────────────────────

// Marker string embedded in every hook we install. Used to identify our hooks
// vs hooks the user already had. We never overwrite hooks we don't own.
export const BABEL_HOOK_MARKER = '# babelgit-enforce'

// The three hooks that cover the most impactful direct git operations.
// pre-commit: blocks git commit
// pre-push:   blocks git push
// pre-rebase: blocks git rebase (rebase doesn't trigger pre-commit)
const HOOK_NAMES = ['pre-commit', 'pre-push', 'pre-rebase'] as const

const HOOK_CONTENT = `#!/bin/sh
# babelgit-enforce
# Prevents direct git operations outside of babel.
# Managed by babel — do not edit manually.
# To disable: babel enforce off

if [ -z "$BABEL_ACTIVE" ]; then
  echo ""
  echo "  \\033[31m✗\\033[0m Direct git operation blocked."
  echo ""
  echo "  This repository uses babelgit for all git operations."
  echo "  Use babel commands instead of raw git."
  echo ""
  echo "  To disable enforcement: babel enforce off"
  echo ""
  exit 1
fi
`

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HookStatus {
  name: string
  installed: boolean   // true = babel hook is in place
  conflict: boolean    // true = a non-babel hook already exists here
}

export interface EnforceStatus {
  active: boolean      // true if at least one babel hook is installed
  hooks: HookStatus[]
}

// ─── Core functions ───────────────────────────────────────────────────────────

export async function getEnforceStatus(repoPath: string): Promise<EnforceStatus> {
  const hooksDir = path.join(repoPath, '.git', 'hooks')

  const hooks: HookStatus[] = await Promise.all(
    HOOK_NAMES.map(async name => {
      const hookPath = path.join(hooksDir, name)
      const content = await readFile(hookPath, 'utf-8').catch(() => null)
      if (!content) return { name, installed: false, conflict: false }
      const installed = content.includes(BABEL_HOOK_MARKER)
      const conflict = !installed
      return { name, installed, conflict }
    })
  )

  return {
    active: hooks.some(h => h.installed),
    hooks,
  }
}

export async function installHooks(
  repoPath: string
): Promise<{ installed: string[]; skipped: string[] }> {
  const hooksDir = path.join(repoPath, '.git', 'hooks')
  const installed: string[] = []
  const skipped: string[] = []

  for (const name of HOOK_NAMES) {
    const hookPath = path.join(hooksDir, name)
    const existing = await readFile(hookPath, 'utf-8').catch(() => null)

    if (existing !== null && !existing.includes(BABEL_HOOK_MARKER)) {
      // A hook exists that we don't own — leave it alone
      skipped.push(name)
      continue
    }

    await writeFile(hookPath, HOOK_CONTENT, 'utf-8')
    await chmod(hookPath, 0o755)
    installed.push(name)
  }

  return { installed, skipped }
}

export async function removeHooks(repoPath: string): Promise<string[]> {
  const hooksDir = path.join(repoPath, '.git', 'hooks')
  const removed: string[] = []

  for (const name of HOOK_NAMES) {
    const hookPath = path.join(hooksDir, name)
    const content = await readFile(hookPath, 'utf-8').catch(() => null)
    if (content?.includes(BABEL_HOOK_MARKER)) {
      await unlink(hookPath)
      removed.push(name)
    }
  }

  return removed
}
