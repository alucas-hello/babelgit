#!/usr/bin/env node
/**
 * sandbox/scripts/lifecycle-test.js
 *
 * Creates a fresh git repo and runs the full babel lifecycle end-to-end.
 * Uses the built dist/ — run `npm run build` first.
 *
 * Usage:
 *   node sandbox/scripts/lifecycle-test.js
 *   node sandbox/scripts/lifecycle-test.js --with-github   # also test GitHub draft PR
 *   node sandbox/scripts/lifecycle-test.js --verbose
 */
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { execa } from 'execa'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '..', '..')
const babelBin = path.join(rootDir, 'dist', 'cli', 'index.js')

const verbose = process.argv.includes('--verbose')
const withGitHub = process.argv.includes('--with-github')

function log(msg) {
  console.log(`  ${msg}`)
}

function step(msg) {
  console.log(`\n  ▶ ${msg}`)
}

async function babel(args, cwd, opts = {}) {
  const result = await execa('node', [babelBin, ...args.split(' ')], {
    cwd,
    env: { ...process.env, BABELGIT_AGENT: opts.agent ? 'true' : undefined },
    reject: false,
  })
  if (verbose) {
    if (result.stdout) console.log(result.stdout.split('\n').map(l => `    ${l}`).join('\n'))
    if (result.stderr) console.error(result.stderr.split('\n').map(l => `    ${l}`).join('\n'))
  }
  if (result.exitCode !== 0 && !opts.expectFailure) {
    console.error(`\n  ✗ babel ${args} exited ${result.exitCode}`)
    console.error(result.stdout)
    console.error(result.stderr)
    process.exit(1)
  }
  return result
}

async function git(args, cwd) {
  const result = await execa('git', args.split(' '), { cwd, reject: false })
  return result.stdout.trim()
}

async function run() {
  const dir = path.join(rootDir, 'sandbox', 'test-repos', `lifecycle-${Date.now()}`)
  await mkdir(dir, { recursive: true })

  log(`Test repo: ${dir}`)

  try {
    // ── Setup ──────────────────────────────────────────────────────────────
    step('Setting up git repo')
    await git('init', dir)
    await git('config user.email test@example.com', dir)
    await git('config user.name "Test User"', dir)
    await writeFile(path.join(dir, 'README.md'), '# Test\n')
    await git('add .', dir)
    await git('commit -m "Initial commit"', dir)
    await git('branch -m main', dir)
    log('✓ git repo initialized')

    // ── babel init ─────────────────────────────────────────────────────────
    step('babel init (writing config directly for non-interactive test)')
    await writeFile(path.join(dir, 'babel.config.yml'), `
version: 1
base_branch: main
protected_branches:
  - main
branch_pattern: "feature/{id}-{slug}"
work_item_id:
  source: local
  prefix: WI
require_checkpoint_for:
  pause: false
  ship: true
sync_strategy: rebase
agents:
  permitted_branch_patterns:
    - "feature/*"
  require_attestation_before_pause: false
require_confirmation: []
verdicts:
  keep: keep
  refine: refine
  reject: reject
  ship: ship
run_commands:
  - name: "echo test"
    command: "echo all tests passing"
    required: true
    capture_output: true
`.trim())
    await mkdir(path.join(dir, '.babel', 'checkpoints'), { recursive: true })
    await writeFile(
      path.join(dir, '.babel', 'state.json'),
      JSON.stringify({ work_items: {}, next_local_id: 1 })
    )
    await writeFile(path.join(dir, '.gitignore'), '.babel/\n')
    await git('add .', dir)
    await git('commit -m "chore: add babelgit"', dir)
    log('✓ config initialized')

    // ── babel start ────────────────────────────────────────────────────────
    step('babel start "test the whole thing"')
    await babel('start test the whole thing', dir)
    const branch = await git('rev-parse --abbrev-ref HEAD', dir)
    log(`✓ branch created: ${branch}`)

    // ── create a file and save ─────────────────────────────────────────────
    step('Creating file + babel save')
    await writeFile(path.join(dir, 'feature.txt'), 'hello world\n')
    await babel('save "added feature.txt"', dir)
    const saveLog = await git('log --oneline -1', dir)
    log(`✓ commit: ${saveLog}`)

    // ── babel run ──────────────────────────────────────────────────────────
    step('babel run (with run_commands)')
    await babel('run', dir)
    log('✓ run session opened, commands executed')

    // ── babel keep ─────────────────────────────────────────────────────────
    step('babel keep "it works"')
    await babel('keep "it works"', dir)
    log('✓ checkpoint created')

    // ── babel state ────────────────────────────────────────────────────────
    step('babel state --json')
    const stateResult = await babel('state --json', dir)
    const state = JSON.parse(stateResult.stdout.trim() || '{}')
    if (state.work_item?.stage !== 'in_progress') {
      throw new Error(`Expected in_progress, got ${state.work_item?.stage}`)
    }
    log(`✓ state: ${state.work_item.stage}, checkpoint: ${state.last_checkpoint?.verdict}`)

    // ── babel ship ─────────────────────────────────────────────────────────
    step('babel ship')
    await babel('ship', dir)
    log('✓ shipped')

    // ── verify git state ───────────────────────────────────────────────────
    step('Verifying git log and branch state')
    const gitLog = await git('log --oneline', dir)
    log(`git log:\n${gitLog.split('\n').map(l => `    ${l}`).join('\n')}`)

    const branches = await git('branch -a', dir)
    log(`branches:\n${branches.split('\n').map(l => `    ${l}`).join('\n')}`)

    const currentBranch = await git('rev-parse --abbrev-ref HEAD', dir)
    if (currentBranch !== 'main') {
      throw new Error(`Expected main branch after ship, got ${currentBranch}`)
    }

    // Feature branch should be gone
    if (branches.includes(`feature/`)) {
      throw new Error(`Feature branch still exists after ship: ${branches}`)
    }

    log('✓ clean git state — on main, feature branch gone')

    // ── babel history ──────────────────────────────────────────────────────
    step('babel history')
    await babel('history', dir)

    // ── ALL DONE ───────────────────────────────────────────────────────────
    console.log('\n  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('  ✓ Full lifecycle test passed')
    console.log('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  } catch (err) {
    console.error(`\n  ✗ Test failed: ${err.message}\n`)
    if (verbose) console.error(err.stack)
    process.exit(1)
  } finally {
    if (!process.argv.includes('--keep')) {
      await rm(dir, { recursive: true, force: true })
    }
  }
}

run()
