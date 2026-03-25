import { describe, it, expect } from 'vitest'

// ─── Local types for branch routing (Git Flow route resolution) ─────────────
// These mirror the planned branch_routes config structure from the PaC spec.

interface BranchRoute {
  type: string
  prefix: string
  merge_to: string | string[]
  pattern?: string
}

interface BranchRoutingConfig {
  base_branch: string
  branch_pattern: string
  branch_routes?: BranchRoute[]
  work_item_id: { source: string; prefix: string }
}

// ─── Minimal implementation for testing ─────────────────────────────────────

interface ResolvedRoute {
  prefix: string
  merge_to: string[]
  pattern: string
}

function resolveRoute(
  config: BranchRoutingConfig,
  type?: string,
): ResolvedRoute {
  const routes = config.branch_routes

  // No routes configured — fall back to base_branch
  if (!routes || routes.length === 0) {
    return {
      prefix: 'feature',
      merge_to: [config.base_branch],
      pattern: config.branch_pattern,
    }
  }

  // Type specified — find matching route
  if (type) {
    const route = routes.find(r => r.type === type)
    if (route) {
      return {
        prefix: route.prefix,
        merge_to: Array.isArray(route.merge_to) ? route.merge_to : [route.merge_to],
        pattern: route.pattern ?? config.branch_pattern,
      }
    }
    // Unknown type — fall back to base_branch
    return {
      prefix: 'feature',
      merge_to: [config.base_branch],
      pattern: config.branch_pattern,
    }
  }

  // No type specified — use first route
  const first = routes[0]
  return {
    prefix: first.prefix,
    merge_to: Array.isArray(first.merge_to) ? first.merge_to : [first.merge_to],
    pattern: first.pattern ?? config.branch_pattern,
  }
}

function toSlug(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40)
}

function buildBranchName(
  id: string,
  description: string,
  config: BranchRoutingConfig,
  type?: string,
): string {
  const route = resolveRoute(config, type)
  const slug = toSlug(description)
  const pattern = route.pattern
  return pattern
    .replace('{id}', id)
    .replace('{slug}', slug)
    .replace('{prefix}', route.prefix)
}

// ─── Tests ──────────────────────────────────────────────────────────────────

const baseConfig: BranchRoutingConfig = {
  base_branch: 'main',
  branch_pattern: 'feature/{id}-{slug}',
  work_item_id: { source: 'local', prefix: 'WI' },
}

describe('branch routing: resolveRoute with no branch_routes', () => {
  it('falls back to base_branch', () => {
    const route = resolveRoute(baseConfig)
    expect(route.merge_to).toEqual(['main'])
    expect(route.prefix).toBe('feature')
  })

  it('uses default branch_pattern', () => {
    const route = resolveRoute(baseConfig)
    expect(route.pattern).toBe('feature/{id}-{slug}')
  })
})

describe('branch routing: resolveRoute with type specified', () => {
  const config: BranchRoutingConfig = {
    ...baseConfig,
    branch_routes: [
      { type: 'feature', prefix: 'feature', merge_to: 'develop' },
      { type: 'hotfix', prefix: 'hotfix', merge_to: ['main', 'develop'] },
      { type: 'release', prefix: 'release', merge_to: 'main', pattern: 'release/{id}' },
    ],
  }

  it('resolves feature type correctly', () => {
    const route = resolveRoute(config, 'feature')
    expect(route.prefix).toBe('feature')
    expect(route.merge_to).toEqual(['develop'])
  })

  it('resolves hotfix type with multiple merge targets', () => {
    const route = resolveRoute(config, 'hotfix')
    expect(route.prefix).toBe('hotfix')
    expect(route.merge_to).toEqual(['main', 'develop'])
  })

  it('resolves release type with custom pattern', () => {
    const route = resolveRoute(config, 'release')
    expect(route.prefix).toBe('release')
    expect(route.pattern).toBe('release/{id}')
  })
})

describe('branch routing: resolveRoute with no type', () => {
  const config: BranchRoutingConfig = {
    ...baseConfig,
    branch_routes: [
      { type: 'feature', prefix: 'feature', merge_to: 'develop' },
      { type: 'hotfix', prefix: 'hotfix', merge_to: 'main' },
    ],
  }

  it('uses first route when no type specified', () => {
    const route = resolveRoute(config)
    expect(route.prefix).toBe('feature')
    expect(route.merge_to).toEqual(['develop'])
  })
})

describe('branch routing: resolveRoute with unknown type', () => {
  const config: BranchRoutingConfig = {
    ...baseConfig,
    branch_routes: [
      { type: 'feature', prefix: 'feature', merge_to: 'develop' },
    ],
  }

  it('falls back to base_branch for unknown type', () => {
    const route = resolveRoute(config, 'unknown-type')
    expect(route.merge_to).toEqual(['main'])
    expect(route.prefix).toBe('feature')
  })
})

describe('branch routing: merge_to can be string or array', () => {
  it('normalizes string merge_to to array', () => {
    const config: BranchRoutingConfig = {
      ...baseConfig,
      branch_routes: [
        { type: 'feature', prefix: 'feature', merge_to: 'develop' },
      ],
    }
    const route = resolveRoute(config, 'feature')
    expect(Array.isArray(route.merge_to)).toBe(true)
    expect(route.merge_to).toEqual(['develop'])
  })

  it('preserves array merge_to', () => {
    const config: BranchRoutingConfig = {
      ...baseConfig,
      branch_routes: [
        { type: 'hotfix', prefix: 'hotfix', merge_to: ['main', 'develop', 'staging'] },
      ],
    }
    const route = resolveRoute(config, 'hotfix')
    expect(route.merge_to).toEqual(['main', 'develop', 'staging'])
  })
})

describe('branch routing: buildBranchName with route pattern override', () => {
  const config: BranchRoutingConfig = {
    ...baseConfig,
    branch_pattern: 'feature/{id}-{slug}',
    branch_routes: [
      { type: 'feature', prefix: 'feat', merge_to: 'develop', pattern: '{prefix}/{id}-{slug}' },
      { type: 'release', prefix: 'release', merge_to: 'main', pattern: 'release/{id}' },
    ],
  }

  it('uses route pattern when available', () => {
    const name = buildBranchName('WI-001', 'add login page', config, 'feature')
    expect(name).toBe('feat/WI-001-add-login-page')
  })

  it('uses route pattern for release (no slug)', () => {
    const name = buildBranchName('WI-002', 'v1 release', config, 'release')
    expect(name).toBe('release/WI-002')
  })

  it('falls back to default pattern when no routes configured', () => {
    const simpleConfig: BranchRoutingConfig = {
      ...baseConfig,
      branch_routes: undefined,
    }
    const name = buildBranchName('WI-003', 'fix bug', simpleConfig)
    expect(name).toBe('feature/WI-003-fix-bug')
  })
})
