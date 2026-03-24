/**
 * src/cli/commands/hook.ts
 *
 * babel hook-check-wi
 *
 * Pre-tool hook for Claude Code. Blocks Edit and Write tool calls when there
 * is no active work item in the current repo. Claude Code invokes this via
 * PreToolUse hooks configured in .claude/settings.json.
 *
 * Protocol:
 *   - stdin:   JSON tool input from Claude Code (ignored — we only check state)
 *   - stdout:  silence on success; message on block (shown to the agent)
 *   - exit 0:  allow the tool call
 *   - exit 2:  block the tool call (Claude Code treats non-zero as blocked)
 *
 * Install:
 *   babel hook install    ← writes the hook config to .claude/settings.json
 */

import * as fs from 'fs'
import * as path from 'path'

/**
 * Walk up from startDir looking for a directory that contains .babel/state.json.
 * Returns the repo root path, or null if not found.
 */
function findRepoRoot(startDir: string): string | null {
  let dir = startDir
  for (let i = 0; i < 20; i++) {
    if (fs.existsSync(path.join(dir, '.babel', 'state.json'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

export async function runHookCheckWi(): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd())

  // No babel state found — not a babelgit repo, let it through
  if (!repoRoot) {
    process.exit(0)
  }

  try {
    const statePath = path.join(repoRoot, '.babel', 'state.json')
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    const currentId: string | null = state.current_work_item_id ?? null

    if (currentId) {
      const wi = state.work_items?.[currentId]
      // Only in_progress allows edits — all other stages (paused, run_session_open, etc.) block
      if (wi?.stage === 'in_progress') {
        process.exit(0)
      }

      // Has a current item but it's not in an editable stage
      const stage: string = wi?.stage ?? 'unknown'
      console.log(`\n✗ Hook blocked: work item ${currentId} is in '${stage}' stage — not editable.\n`)
      if (stage === 'paused') {
        console.log(`  Resume work first:  babel continue ${currentId}\n`)
      } else if (stage === 'run_session_open') {
        console.log(`  Review is open. Call a verdict first:\n`)
        console.log(`  babel keep "notes"    ← solid, continue here`)
        console.log(`  babel reject "reason" ← wrong direction, revert\n`)
      }
      process.exit(2)
    }

    // No active work item
    console.log(`\n✗ Hook blocked: no active work item.\n`)
    console.log(`  You have no work item in progress. Start or resume one before editing files.\n`)
    console.log(`  babel start "description"   ← begin new work`)
    console.log(`  babel continue BBL-XXX      ← resume paused work`)
    console.log(`  babel todo "description"    ← plan it, start later\n`)
    process.exit(2)

  } catch {
    // Can't read state — let it through rather than blocking legitimate work
    process.exit(0)
  }
}

// ─── Hook install ─────────────────────────────────────────────────────────────

const HOOK_CONFIG = {
  PreToolUse: [
    {
      matcher: 'Edit|Write',
      hooks: [
        {
          type: 'command',
          command: 'babel hook-check-wi',
        },
      ],
    },
  ],
}

export async function runHookInstall(repoPath: string): Promise<void> {
  const claudeDir = path.join(repoPath, '.claude')
  const settingsPath = path.join(claudeDir, 'settings.json')

  fs.mkdirSync(claudeDir, { recursive: true })

  let settings: Record<string, unknown> = {}
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
    } catch {
      // Malformed — start fresh
    }
  }

  // Merge: don't clobber existing hooks for other tools
  const existingHooks = (settings.hooks as Record<string, unknown>) ?? {}
  settings.hooks = {
    ...existingHooks,
    ...HOOK_CONFIG,
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n')

  console.log()
  console.log(`✓ Hook installed: .claude/settings.json`)
  console.log()
  console.log(`  Claude Code will now block Edit and Write tool calls`)
  console.log(`  when there is no active work item in this repo.`)
  console.log()
  console.log(`  To remove:  babel hook uninstall`)
  console.log()
}

export async function runHookUninstall(repoPath: string): Promise<void> {
  const settingsPath = path.join(repoPath, '.claude', 'settings.json')

  if (!fs.existsSync(settingsPath)) {
    console.log(`\n  No .claude/settings.json found — nothing to remove.\n`)
    return
  }

  let settings: Record<string, unknown> = {}
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  } catch {
    console.log(`\n  Could not read .claude/settings.json.\n`)
    return
  }

  const hooks = settings.hooks as Record<string, unknown> | undefined
  if (hooks) {
    delete hooks.PreToolUse
    if (Object.keys(hooks).length === 0) delete settings.hooks
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n')
  console.log(`\n✓ Hook removed from .claude/settings.json\n`)
}
