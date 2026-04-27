import { describe, it, expect } from 'vitest'
import { WPM_TARGETS } from './wpmTargets'

describe('WPM_TARGETS', () => {
  it('includes MBA with a target of 180', () => {
    expect(WPM_TARGETS['MBA']).toBe(180)
  })

  it('still includes all high-school grades', () => {
    expect(WPM_TARGETS[9]).toBe(140)
    expect(WPM_TARGETS[10]).toBe(150)
    expect(WPM_TARGETS[11]).toBe(160)
    expect(WPM_TARGETS[12]).toBe(170)
  })
})
