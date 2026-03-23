import { execa } from 'execa'
import type { Subprocess } from 'execa'
import path from 'path'
import chalk from 'chalk'
import { showGitCommand } from '../cli/display.js'

export interface RunCommandConfig {
  name: string
  command: string
  background?: boolean
  required?: boolean
  capture_output?: boolean
  wait_for_output?: string
  timeout_ms?: number
  env?: Record<string, string>
}

export interface RunCommandResult {
  name: string
  command: string
  passed: boolean
  exit_code: number
  stdout: string
  stderr: string
  duration_ms: number
  required: boolean
}

// Registry of background processes started during a run session
const backgroundProcesses: Map<string, Subprocess> = new Map()

export async function runCommand(
  config: RunCommandConfig,
  repoPath: string = process.cwd(),
  quiet = false
): Promise<RunCommandResult> {
  const start = Date.now()

  if (!quiet) {
    console.log(`\n  ${chalk.bold('▶')} ${config.name}`)
    console.log(`  ${chalk.dim(`→ ${config.command}`)}`)
  }

  const [bin, ...args] = config.command.split(' ')
  const required = config.required !== false // default true

  try {
    const proc = execa(bin, args, {
      cwd: repoPath,
      env: { ...process.env, ...(config.env || {}) },
      reject: false,
      timeout: config.timeout_ms || 300_000, // 5 min default
    })

    if (config.background) {
      backgroundProcesses.set(config.name, proc as Subprocess)

      if (config.wait_for_output) {
        // Wait until the process emits the expected string, then detach
        await waitForOutput(proc as Subprocess, config.wait_for_output, config.timeout_ms || 30_000)
      } else {
        // Give it a moment to start
        await new Promise(r => setTimeout(r, 500))
      }

      if (!quiet) {
        console.log(`  ${chalk.green('✓')} ${config.name} started in background`)
      }

      return {
        name: config.name,
        command: config.command,
        passed: true,
        exit_code: 0,
        stdout: '',
        stderr: '',
        duration_ms: Date.now() - start,
        required,
      }
    }

    const result = await proc

    const passed = (result.exitCode ?? 0) === 0
    const duration = Date.now() - start

    if (!quiet) {
      if (passed) {
        console.log(`  ${chalk.green('✓')} ${config.name} ${chalk.dim(`(${duration}ms)`)}`)
      } else {
        console.log(`  ${chalk.red('✗')} ${config.name} ${chalk.dim(`(exit ${result.exitCode})`)}`)
        if (result.stdout) console.log(chalk.dim(indent(result.stdout, 4)))
        if (result.stderr) console.log(chalk.dim(indent(result.stderr, 4)))
      }
    }

    return {
      name: config.name,
      command: config.command,
      passed,
      exit_code: result.exitCode ?? 0,
      stdout: config.capture_output ? result.stdout : '',
      stderr: config.capture_output ? result.stderr : '',
      duration_ms: duration,
      required,
    }
  } catch (err) {
    const duration = Date.now() - start
    if (!quiet) {
      console.log(`  ${chalk.red('✗')} ${config.name} — ${(err as Error).message}`)
    }
    return {
      name: config.name,
      command: config.command,
      passed: false,
      exit_code: 1,
      stdout: '',
      stderr: (err as Error).message,
      duration_ms: duration,
      required,
    }
  }
}

export async function runAllCommands(
  commands: RunCommandConfig[],
  repoPath: string = process.cwd(),
  quiet = false
): Promise<RunCommandResult[]> {
  const results: RunCommandResult[] = []
  for (const cmd of commands) {
    const result = await runCommand(cmd, repoPath, quiet)
    results.push(result)
    // Stop on first required failure (foreground only)
    if (!result.passed && result.required && !cmd.background) {
      break
    }
  }
  return results
}

export function killBackgroundProcesses(): void {
  for (const [name, proc] of backgroundProcesses) {
    try {
      proc.kill('SIGTERM')
    } catch {
      // Already dead
    }
    backgroundProcesses.delete(name)
  }
}

export function hasRequiredFailure(results: RunCommandResult[]): RunCommandResult | null {
  return results.find(r => !r.passed && r.required && r.command) || null
}

export function formatAutomationSummary(results: RunCommandResult[]): string {
  if (results.length === 0) return ''
  const parts = results
    .filter(r => !r.command.includes('background') || !r.passed)
    .map(r => {
      const icon = r.passed ? chalk.green('✓') : chalk.red('✗')
      return `${icon} ${r.name}`
    })
  return parts.join('  |  ')
}

export function serializeResults(results: RunCommandResult[]): Record<string, unknown>[] {
  return results.map(r => ({
    name: r.name,
    passed: r.passed,
    exit_code: r.exit_code,
    duration_ms: r.duration_ms,
    required: r.required,
    ...(r.stdout ? { stdout: r.stdout.slice(0, 2000) } : {}),
    ...(r.stderr ? { stderr: r.stderr.slice(0, 500) } : {}),
  }))
}

function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces)
  return text
    .split('\n')
    .slice(0, 20)
    .map(l => `${pad}${l}`)
    .join('\n')
}

function waitForOutput(proc: Subprocess, needle: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for "${needle}" from process`))
    }, timeoutMs)

    const check = (chunk: Buffer | string) => {
      if (String(chunk).includes(needle)) {
        clearTimeout(timer)
        resolve()
      }
    }

    proc.stdout?.on('data', check)
    proc.stderr?.on('data', check)
    proc.on('exit', () => {
      clearTimeout(timer)
      resolve() // process exited before emitting needle — treat as started
    })
  })
}
