import { describe, it, expect } from 'vitest'
import { matchesPattern } from '../src/core/config.js'

describe('config: matchesPattern', () => {
  it('matches exact strings', () => {
    expect(matchesPattern('main', ['main', 'dev'])).toBe(true)
  })

  it('matches wildcard patterns', () => {
    expect(matchesPattern('feature/WI-001-test', ['feature/*'])).toBe(true)
  })

  it('does not match partial wildcards incorrectly', () => {
    expect(matchesPattern('notfeature/test', ['feature/*'])).toBe(false)
  })

  it('matches star wildcard', () => {
    expect(matchesPattern('any-branch', ['*'])).toBe(true)
  })

  it('returns false for no match', () => {
    expect(matchesPattern('experiment/test', ['feature/*', 'fix/*'])).toBe(false)
  })
})
