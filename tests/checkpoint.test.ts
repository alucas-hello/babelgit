import { describe, it, expect } from 'vitest'
import { computeFilesystemHash } from '../src/core/checkpoint.js'

describe('checkpoint: computeFilesystemHash', () => {
  it('returns empty string for clean tree', () => {
    expect(computeFilesystemHash('')).toBe('')
    expect(computeFilesystemHash('  ')).toBe('')
  })

  it('returns a hash for dirty tree', () => {
    const hash = computeFilesystemHash('M  src/index.ts\n?? newfile.ts')
    expect(hash).toBeTruthy()
    expect(hash.length).toBe(16)
  })

  it('produces consistent hashes', () => {
    const status = 'M  src/foo.ts'
    expect(computeFilesystemHash(status)).toBe(computeFilesystemHash(status))
  })

  it('produces different hashes for different states', () => {
    const h1 = computeFilesystemHash('M  src/foo.ts')
    const h2 = computeFilesystemHash('M  src/bar.ts')
    expect(h1).not.toBe(h2)
  })
})
