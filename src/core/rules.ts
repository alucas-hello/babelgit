import type {
  Rule,
  BabelConfig,
  CallerType,
  CommitMessagePatternRule,
  PathRestrictionRule,
  FilesChangedRule,
  ScriptRule,
} from '../types.js'
import { matchesGlob } from './config.js'
import { runCommand } from './scripts.js'

export interface RuleViolation {
  rule: string
  message: string
  blocking: boolean
}

export async function evaluateRules(params: {
  operation: string
  caller: CallerType
  config: BabelConfig
  repoPath?: string
  commitMessage?: string
  changedFiles?: string[]
}): Promise<RuleViolation[]> {
  const { operation, caller, config, repoPath = process.cwd() } = params
  if (!config.rules?.length) return []

  const applicable = config.rules.filter(rule => {
    // Must apply to this operation
    if (!rule.apply_to?.includes(operation)) return false
    // Must apply to this caller
    const ruleCaller = rule.caller ?? 'any'
    if (ruleCaller !== 'any' && ruleCaller !== caller) return false
    return true
  })

  const violations: RuleViolation[] = []

  for (const rule of applicable) {
    const violation = await evaluateRule(rule, params)
    if (violation) violations.push(violation)
  }

  return violations
}

async function evaluateRule(
  rule: Rule,
  params: {
    operation: string
    caller: CallerType
    repoPath?: string
    commitMessage?: string
    changedFiles?: string[]
  }
): Promise<RuleViolation | null> {
  const repoPath = params.repoPath || process.cwd()
  const blocking = rule.blocking !== false

  switch (rule.type) {
    case 'commit_message_pattern': {
      const r = rule as CommitMessagePatternRule
      const msg = params.commitMessage || ''
      if (!msg) return null
      const regex = new RegExp(r.pattern)
      if (!regex.test(msg)) {
        return {
          rule: r.name,
          message:
            r.message ||
            `Commit message does not match required pattern: ${r.pattern}\n  Got: "${msg}"`,
          blocking,
        }
      }
      return null
    }

    case 'path_restriction': {
      const r = rule as PathRestrictionRule
      const files = params.changedFiles || (await getChangedFiles(repoPath))
      const blocked = files.filter(f =>
        r.blocked_paths.some(pattern => matchesGlob(f, pattern) || f === pattern)
      )
      if (blocked.length > 0) {
        return {
          rule: r.name,
          message:
            r.message ||
            `${params.caller === 'agent' ? 'Agents are' : 'You are'} not permitted to modify these files:\n  ${blocked.join('\n  ')}`,
          blocking,
        }
      }
      return null
    }

    case 'files_changed': {
      const r = rule as FilesChangedRule
      const files = params.changedFiles || (await getChangedFiles(repoPath))
      const hasSource = files.some(f => matchesGlob(f, r.if_changed))
      if (!hasSource) return null // Rule doesn't apply if trigger files not changed
      const hasRequired = files.some(f => matchesGlob(f, r.require_also_changed))
      if (!hasRequired) {
        return {
          rule: r.name,
          message:
            r.message ||
            `When changing files matching '${r.if_changed}', you must also change files matching '${r.require_also_changed}'.`,
          blocking,
        }
      }
      return null
    }

    case 'script': {
      const r = rule as ScriptRule
      const result = await runCommand(
        { name: r.name, command: r.command, required: true, capture_output: true },
        repoPath,
        true // quiet
      )
      if (!result.passed) {
        return {
          rule: r.name,
          message:
            r.message ||
            `Rule script failed: ${r.command} (exit ${result.exit_code})\n  ${result.stdout || result.stderr || ''}`.trim(),
          blocking,
        }
      }
      return null
    }

    default:
      return null
  }
}

async function getChangedFiles(repoPath: string): Promise<string[]> {
  try {
    const { execa } = await import('execa')
    const result = await execa('git', ['diff', '--name-only', 'HEAD'], {
      cwd: repoPath,
      reject: false,
    })
    const staged = await execa('git', ['diff', '--cached', '--name-only'], {
      cwd: repoPath,
      reject: false,
    })
    const untracked = await execa('git', ['ls-files', '--others', '--exclude-standard'], {
      cwd: repoPath,
      reject: false,
    })
    const all = [result.stdout, staged.stdout, untracked.stdout]
      .join('\n')
      .split('\n')
      .map(f => f.trim())
      .filter(Boolean)
    return [...new Set(all)]
  } catch {
    return []
  }
}

export function formatViolations(violations: RuleViolation[]): string {
  return violations
    .map(v => `  ${v.blocking ? '✗' : '⚠'} [${v.rule}] ${v.message}`)
    .join('\n\n')
}
