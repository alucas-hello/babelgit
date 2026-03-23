import type { BabelConfig } from '../types.js'
import { runCommand, RunCommandResult } from './scripts.js'
import chalk from 'chalk'

export type HookName =
  | 'before_save'
  | 'after_save'
  | 'before_run'
  | 'after_run'
  | 'before_ship'
  | 'after_ship'
  | 'before_pause'
  | 'after_pause'

export async function runHooks(
  hookName: HookName,
  config: BabelConfig,
  repoPath: string = process.cwd(),
  quiet = false
): Promise<RunCommandResult[]> {
  const hookCommands = (config.hooks as Record<string, string[]> | undefined)?.[hookName]
  if (!hookCommands || hookCommands.length === 0) return []

  if (!quiet) {
    console.log(`\n  ${chalk.dim(`[hook: ${hookName}]`)}`)
  }

  const results: RunCommandResult[] = []
  for (const cmd of hookCommands) {
    const result = await runCommand(
      {
        name: hookName,
        command: cmd,
        required: true,
        capture_output: false,
      },
      repoPath,
      quiet
    )
    results.push(result)
    if (!result.passed) break
  }
  return results
}

export function hooksFailed(results: RunCommandResult[]): RunCommandResult | null {
  return results.find(r => !r.passed) || null
}
