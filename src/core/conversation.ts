import * as fs from 'fs'
import * as path from 'path'

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9]{20,}/g,
  /ghp_[A-Za-z0-9]{36}/g,
  /AKIA[A-Z0-9]{16}/g,
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g,
  /(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?[A-Za-z0-9\-._~+/]{8,}["']?/gi,
]

function scrubSecrets(text: string): string {
  let out = text
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, '[REDACTED]')
  }
  return out
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16).replace('T', ' ')
}

export interface SaveEntry {
  event: 'save'
  timestamp: string
  notes?: string
  commit: string
  filesChanged: string[]
}

export interface RunEntry {
  event: 'run'
  timestamp: string
  lockedCommit: string
}

export interface VerdictEntry {
  event: 'verdict'
  timestamp: string
  verdict: string
  notes?: string
  commit: string
}

export type ConversationEntry = SaveEntry | RunEntry | VerdictEntry

export async function appendConversationEntry(
  repoPath: string,
  workItemId: string,
  entry: ConversationEntry
): Promise<void> {
  const dir = path.join(repoPath, '.babel', 'conversations')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const filePath = path.join(dir, `${workItemId}.md`)
  const isNew = !fs.existsSync(filePath)

  let block: string

  if (entry.event === 'save') {
    const fileList = entry.filesChanged.length > 0
      ? entry.filesChanged.map(f => `- ${f}`).join('\n')
      : '_no file changes_'
    block = [
      `## ${formatTimestamp(entry.timestamp)} — Save`,
      '',
      entry.notes ? `**Notes:** ${scrubSecrets(entry.notes)}` : null,
      `**Commit:** ${entry.commit}`,
      '',
      '**Files changed:**',
      fileList,
    ].filter(l => l !== null).join('\n')
  } else if (entry.event === 'run') {
    block = [
      `## ${formatTimestamp(entry.timestamp)} — Review opened`,
      '',
      `**Locked at:** ${entry.lockedCommit}`,
    ].join('\n')
  } else {
    const verdictLabel = entry.verdict.toUpperCase()
    block = [
      `## ${formatTimestamp(entry.timestamp)} — ${verdictLabel}`,
      '',
      entry.notes ? `**Notes:** ${scrubSecrets(entry.notes)}` : null,
      `**Commit:** ${entry.commit}`,
    ].filter(l => l !== null).join('\n')
  }

  const header = isNew ? `# Conversation Log: ${workItemId}\n\n` : ''
  const separator = isNew ? '' : '\n\n---\n\n'
  fs.appendFileSync(filePath, `${header}${separator}${block}\n`)
}

export async function getChangedFiles(repoPath: string): Promise<string[]> {
  try {
    const { simpleGit } = await import('simple-git')
    const git = simpleGit(repoPath)
    const diff = await git.diff(['--cached', '--name-only'])
    const untracked = await git.raw(['ls-files', '--others', '--exclude-standard'])
    const files = [
      ...diff.split('\n'),
      ...untracked.split('\n'),
    ].map(f => f.trim()).filter(Boolean)
    return [...new Set(files)]
  } catch {
    return []
  }
}
