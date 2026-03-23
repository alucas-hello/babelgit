import chalk from 'chalk'

// ─── Git command display ──────────────────────────────────────────────────────

export function showGitCommand(cmd: string): void {
  console.log(chalk.dim(`  → ${cmd}`))
}

// ─── Status symbols ───────────────────────────────────────────────────────────

export const symbols = {
  check: chalk.green('✓'),
  cross: chalk.red('✗'),
  arrow: chalk.cyan('→'),
  dot: chalk.yellow('●'),
  line: chalk.dim('─'),
  refine: chalk.yellow('~'),
  start: chalk.cyan('▶'),
}

// ─── Divider ──────────────────────────────────────────────────────────────────

export function divider(): string {
  return chalk.dim('━'.repeat(54))
}

// ─── Success / error / info ───────────────────────────────────────────────────

export function success(msg: string): void {
  console.log(`\n${symbols.check} ${msg}`)
}

export function error(msg: string, detail?: string, fix?: string): void {
  console.error(`\n${symbols.cross} ${chalk.bold(msg)}`)
  if (detail) console.error(`\n  ${detail}`)
  if (fix) console.error(`\n  ${chalk.dim('Fix:')} ${fix}`)
}

export function info(msg: string): void {
  console.log(`\n  ${msg}`)
}

export function hint(msg: string): void {
  console.log(`  ${chalk.dim(msg)}`)
}

export function blocked(operation: string, reason: string, suggestion: string): void {
  console.error(`\n${symbols.cross} ${chalk.bold(`Operation blocked: ${operation}`)}`)
  console.error(`\n  ${chalk.bold('Reason:')} ${reason}`)
  console.error(`\n  ${chalk.dim('Fix:')} ${suggestion}`)
}

// ─── Headers ──────────────────────────────────────────────────────────────────

export function header(left: string, right?: string): void {
  console.log(divider())
  if (right) {
    console.log(`  ${left}  ${chalk.dim('●')}  ${right}`)
  } else {
    console.log(`  ${left}`)
  }
  console.log(divider())
}

export function section(title: string): void {
  console.log(`\n  ${chalk.bold(title)}`)
  console.log(`  ${'─'.repeat(45)}`)
}

// ─── Run session display ──────────────────────────────────────────────────────

export function showRunSession(
  workItemId: string,
  description: string,
  lockedCommit: string,
  lastCheckpoint: { verdict: string; sequence: number; notes: string; time: string } | null
): void {
  console.log('\n' + divider())
  console.log(`  ${chalk.bold('babel run')}  ${chalk.yellow('●')}  ${workItemId}: ${description}`)
  console.log(divider())
  console.log()
  console.log(`  Session open. Your code is locked at: ${chalk.cyan(lockedCommit)}`)
  console.log()
  console.log('  Do whatever you need to do:')
  console.log(chalk.dim('    → start your dev server'))
  console.log(chalk.dim('    → run your test suite'))
  console.log(chalk.dim('    → click through the app'))
  console.log(chalk.dim('    → review the diff'))
  console.log(chalk.dim('    → ask an AI to review it'))
  console.log()
  console.log('  When you\'re ready to call it:')
  console.log()
  console.log(`    ${chalk.green('babel keep')}   "notes"    ${chalk.dim('← this is solid, good recovery point')}`)
  console.log(`    ${chalk.yellow('babel refine')} "notes"    ${chalk.dim('← close, needs specific changes')}`)
  console.log(`    ${chalk.red('babel reject')} "reason"   ${chalk.dim('← wrong direction, revert to last keep')}`)
  console.log(`    ${chalk.cyan('babel ship')}   "notes"    ${chalk.dim('← ready for production')}`)
  console.log()
  if (lastCheckpoint) {
    console.log(
      `  Last verified checkpoint: ${lastCheckpoint.verdict} #${lastCheckpoint.sequence} — "${lastCheckpoint.notes}" (${lastCheckpoint.time})`
    )
  } else {
    console.log(`  ${chalk.dim('No checkpoints yet — this will be the first.')}`)
  }
  console.log(divider())
  console.log()
}

// ─── State display ────────────────────────────────────────────────────────────

export function showState(params: {
  workItemId: string
  description: string
  stage: string
  shipReady?: boolean
  branch: string
  uncommittedFiles: number
  commitsAhead: number
  lastSyncedMinutesAgo: number | null
  lastCheckpoint: { verdict: string; sequence: number; notes: string; minutesAgo: number } | null
  suggestedNext: string
}): void {
  const stageLabel: Record<string, string> = {
    in_progress: chalk.green('In Progress'),
    paused: chalk.yellow('Paused'),
    run_session_open: chalk.cyan('Run Session Open'),
    shipped: chalk.blue('Shipped'),
    stopped: chalk.red('Stopped'),
  }

  const statusLabel = params.shipReady
    ? chalk.magenta('Ship Ready')
    : stageLabel[params.stage] || params.stage

  console.log('\n' + divider())
  console.log(
    `  ${chalk.bold(params.workItemId)}  ${params.description}`
  )
  console.log(
    `  Status: ${statusLabel}  ${chalk.dim('●')}  branch: ${chalk.cyan(params.branch)}`
  )
  console.log(divider())

  section('Progress')
  const syncLabel =
    params.lastSyncedMinutesAgo === null
      ? 'unknown'
      : params.lastSyncedMinutesAgo < 60
        ? `${params.lastSyncedMinutesAgo} minutes ago`
        : `${Math.round(params.lastSyncedMinutesAgo / 60)} hours ago`

  console.log(`  Unsaved changes:    ${params.uncommittedFiles} files modified`)
  console.log(`  Saves since sync:   ${params.commitsAhead} commits ahead of base`)
  console.log(`  Last sync:          ${syncLabel}`)
  if (params.lastCheckpoint) {
    const cpTime =
      params.lastCheckpoint.minutesAgo < 60
        ? `${params.lastCheckpoint.minutesAgo} minutes ago`
        : `${Math.round(params.lastCheckpoint.minutesAgo / 60)}h ago`
    console.log(
      `  Last checkpoint:    ${params.lastCheckpoint.verdict} #${params.lastCheckpoint.sequence} — "${params.lastCheckpoint.notes}" (${cpTime})`
    )
  } else {
    console.log(`  Last checkpoint:    ${chalk.dim('none')}`)
  }

  section('Workflow')
  const workflowPosition = params.shipReady
    ? `In Progress → Run → ${chalk.bold('[Ship Ready]')}`
    : getWorkflowPosition(params.stage)
  console.log(`  You are here:  ${workflowPosition}`)
  console.log()
  console.log(`  Suggested next:  ${chalk.bold(params.suggestedNext)}`)
  console.log('\n' + divider() + '\n')
}

function getWorkflowPosition(stage: string): string {
  const stages: Record<string, string> = {
    in_progress: `${chalk.bold('[In Progress]')} → Run → Ship`,
    run_session_open: `In Progress → ${chalk.bold('[Run Session Open]')} → Verdict → Ship`,
    paused: `${chalk.bold('[Paused]')} → Continue → Run → Ship`,
    shipped: `Shipped ${chalk.green('✓')}`,
    stopped: `Stopped`,
  }
  return stages[stage] || stage
}

// ─── History display ──────────────────────────────────────────────────────────

export function showHistory(
  workItemId: string,
  description: string,
  startedAt: string,
  events: Array<{
    time: string
    type: 'keep' | 'refine' | 'reject' | 'ship' | 'start' | 'pause' | 'stop'
    notes: string
    caller: string
    commit?: string
    isAnchor?: boolean
    revertedTo?: string
  }>
): void {
  console.log('\n' + divider())
  console.log(`  ${chalk.bold(workItemId)}  ${description}`)
  console.log(`  Started: ${startedAt}  ${chalk.dim('●')}  ${events.length} events`)
  console.log(divider())
  console.log()

  for (const ev of events) {
    const icon: Record<string, string> = {
      keep: chalk.green('✓'),
      ship: chalk.cyan('✓'),
      refine: chalk.yellow('~'),
      reject: chalk.red('✗'),
      start: chalk.cyan('▶'),
      pause: chalk.yellow('⏸'),
      stop: chalk.red('■'),
    }

    const label: Record<string, string> = {
      keep: chalk.green('KEEP'),
      ship: chalk.cyan('SHIP'),
      refine: chalk.yellow('REFINE'),
      reject: chalk.red('REJECT'),
      start: chalk.cyan('START'),
      pause: chalk.yellow('PAUSE'),
      stop: chalk.red('STOP'),
    }

    console.log(
      `  ${ev.time}  ${icon[ev.type] || '?'} ${label[ev.type] || ev.type}    "${ev.notes}"`
    )
    console.log(`                    ${chalk.dim(ev.caller)}`)
    if (ev.commit) {
      const anchorNote = ev.isAnchor ? chalk.green('  ← recovery anchor') : ''
      console.log(`                    ${chalk.dim('commit:')} ${chalk.cyan(ev.commit)}${anchorNote}`)
    }
    if (ev.revertedTo) {
      console.log(`                    ${chalk.dim(`→ reverted to commit ${ev.revertedTo}`)}`)
    }
    console.log()
  }

  console.log(divider() + '\n')
}

// ─── No active work item ──────────────────────────────────────────────────────

export function showNoWorkItem(): void {
  console.log('\n' + divider())
  console.log(`  ${chalk.bold('No active work item')}`)
  console.log(divider())
  console.log()
  console.log(`  Start a new work item with: ${chalk.bold('babel start "description"')}`)
  console.log(`  Continue paused work with: ${chalk.bold('babel continue')}`)
  console.log()
  console.log(divider() + '\n')
}

// ─── Checkpoint created ───────────────────────────────────────────────────────

export function showCheckpointCreated(params: {
  verdict: string
  checkpointId: string
  notes: string
  commit: string
  isAnchor: boolean
  callerType: string
}): void {
  const verdictColor: Record<string, (s: string) => string> = {
    keep: chalk.green,
    refine: chalk.yellow,
    reject: chalk.red,
    ship: chalk.cyan,
  }
  const colorFn = verdictColor[params.verdict] || chalk.white

  console.log()
  console.log(`${symbols.check} ${colorFn(`Checkpoint created: ${params.checkpointId}`)}`)
  if (params.notes) console.log(`  ${chalk.dim('Notes:')} ${params.notes}`)
  console.log(`  ${chalk.dim('Commit:')} ${chalk.cyan(params.commit)}`)
  if (params.isAnchor) {
    console.log(`  ${chalk.green('← This is now the recovery anchor')}`)
  }
}
