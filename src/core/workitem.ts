import type { BabelConfig, BranchRoute } from '../types.js'

export function toSlug(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40)
}

export function buildBranchName(id: string, description: string, config: BabelConfig, patternOverride?: string): string {
  const slug = toSlug(description)
  const pattern = patternOverride || config.branch_pattern || 'feature/{id}-{slug}'
  return pattern.replace('{id}', id).replace('{slug}', slug).replace('{prefix}', config.work_item_id.prefix)
}

export function resolveRoute(config: BabelConfig, type?: string): BranchRoute {
  if (!config.branch_routes) {
    return {
      start_from: config.base_branch,
      merge_to: config.base_branch,
      pattern: config.branch_pattern || 'feature/{id}-{slug}',
    }
  }
  const key = type || Object.keys(config.branch_routes)[0]
  const route = config.branch_routes[key]
  if (!route) {
    return {
      start_from: config.base_branch,
      merge_to: config.base_branch,
      pattern: config.branch_pattern || 'feature/{id}-{slug}',
    }
  }
  return route
}

export function isWorkItemId(input: string): boolean {
  // Matches patterns like WI-001, PROJ-123, ABC-999
  return /^[A-Z]+-\d+$/.test(input)
}

export function minutesAgo(isoTimestamp: string): number {
  return Math.round((Date.now() - new Date(isoTimestamp).getTime()) / 60000)
}

export function timeAgoLabel(isoTimestamp: string): string {
  const mins = minutesAgo(isoTimestamp)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function formatTimeShort(isoTimestamp: string): string {
  const d = new Date(isoTimestamp)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
