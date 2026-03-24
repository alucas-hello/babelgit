#!/usr/bin/env node
/**
 * scripts/agent-inbox-hook.js
 *
 * UserPromptSubmit hook for Claude Code.
 * Checks for .babel/agent-inbox.json in the repo root.
 * If found, injects a notification into the conversation so Claude
 * picks up the work item that was started from the VSCode extension.
 *
 * After injecting, renames the file to agent-inbox.processed.json
 * so it only fires once.
 *
 * Configured in .claude/settings.json:
 *   "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node scripts/agent-inbox-hook.js" }] }]
 */

const fs = require('fs')
const path = require('path')

function findRepoRoot(dir) {
  for (let i = 0; i < 20; i++) {
    if (fs.existsSync(path.join(dir, '.babel', 'state.json'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

const root = findRepoRoot(process.cwd())
if (!root) process.exit(0)

const inboxPath = path.join(root, '.babel', 'agent-inbox.json')
if (!fs.existsSync(inboxPath)) process.exit(0)

let inbox
try {
  inbox = JSON.parse(fs.readFileSync(inboxPath, 'utf8'))
} catch {
  process.exit(0)
}

// Rename before injecting so a crash doesn't re-fire it
const processedPath = path.join(root, '.babel', 'agent-inbox.processed.json')
try {
  fs.renameSync(inboxPath, processedPath)
} catch {
  process.exit(0)
}

const { work_item_id, description, branch } = inbox

// Write injection to stdout — Claude Code prepends this to the user's message
process.stdout.write(
  `\n[babelgit] Work item started from VSCode: ${work_item_id} — "${description}"` +
  (branch ? `\nBranch: ${branch}` : '') +
  `\nPlease begin implementation now.\n\n`
)
