import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getPrefs,
  setPrefs,
  vibrate,
  playSound,
  feedback,
  prefersReducedMotion,
  _resetForTests,
} from './feedback'

describe('getPrefs / setPrefs', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('returns defaults (both on) when nothing stored', () => {
    expect(getPrefs()).toEqual({ sound: true, haptics: true })
  })

  it('persists prefs across calls', () => {
    setPrefs({ sound: false })
    expect(getPrefs()).toEqual({ sound: false, haptics: true })
  })

  it('merges partial updates rather than replacing', () => {
    setPrefs({ sound: false })
    setPrefs({ haptics: false })
    expect(getPrefs()).toEqual({ sound: false, haptics: false })
  })

  it('returns defaults when localStorage has bad JSON', () => {
    localStorage.setItem('feedback_prefs', 'not-json')
    expect(getPrefs()).toEqual({ sound: true, haptics: true })
  })
})

describe('vibrate', () => {
  let vibrateMock
  beforeEach(() => {
    localStorage.clear()
    vibrateMock = vi.fn()
    navigator.vibrate = vibrateMock
  })
  afterEach(() => {
    localStorage.clear()
    delete navigator.vibrate
  })

  it('calls navigator.vibrate with the pattern when haptics on', () => {
    vibrate('tap')
    expect(vibrateMock).toHaveBeenCalledTimes(1)
    expect(vibrateMock.mock.calls[0][0]).toBeDefined()
  })

  it('passes an array pattern for correct/wrong/celebrate', () => {
    vibrate('correct')
    expect(Array.isArray(vibrateMock.mock.calls[0][0])).toBe(true)
  })

  it('no-op when haptics pref is off', () => {
    setPrefs({ haptics: false })
    vibrate('tap')
    expect(vibrateMock).not.toHaveBeenCalled()
  })

  it('no-op when navigator.vibrate is missing (iOS Safari case)', () => {
    delete navigator.vibrate
    expect(() => vibrate('tap')).not.toThrow()
  })

  it('unknown types fall back to tap pattern', () => {
    vibrate('made-up-type')
    expect(vibrateMock).toHaveBeenCalled()
  })
})

describe('playSound', () => {
  let oscMock, gainMock, ctxMock

  beforeEach(() => {
    localStorage.clear()
    _resetForTests()
    gainMock = {
      connect: vi.fn(),
      gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
    }
    oscMock = {
      connect: vi.fn(() => gainMock),
      type: '',
      frequency: { value: 0 },
      start: vi.fn(),
      stop: vi.fn(),
    }
    ctxMock = {
      currentTime: 0,
      createOscillator: vi.fn(() => oscMock),
      createGain: vi.fn(() => gainMock),
      destination: {},
    }
    window.AudioContext = function MockAudioContext() {
      return ctxMock
    }
  })

  afterEach(() => {
    localStorage.clear()
    _resetForTests()
    delete window.AudioContext
  })

  it('creates and schedules an oscillator when sound is on', () => {
    playSound('tap')
    expect(ctxMock.createOscillator).toHaveBeenCalled()
    expect(oscMock.start).toHaveBeenCalled()
    expect(oscMock.stop).toHaveBeenCalled()
  })

  it('plays multiple notes for multi-tone types (correct = 2 notes)', () => {
    playSound('correct')
    expect(ctxMock.createOscillator).toHaveBeenCalledTimes(2)
  })

  it('plays an arpeggio (>=3 notes) for celebrate', () => {
    playSound('celebrate')
    expect(ctxMock.createOscillator.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('no-op when sound pref is off', () => {
    setPrefs({ sound: false })
    playSound('tap')
    expect(ctxMock.createOscillator).not.toHaveBeenCalled()
  })

  it('no-op when AudioContext is missing', () => {
    delete window.AudioContext
    _resetForTests()
    expect(() => playSound('tap')).not.toThrow()
  })

  it('does NOT gate on prefers-reduced-motion (sound is not motion)', () => {
    window.matchMedia = vi.fn(() => ({ matches: true }))
    playSound('tap')
    expect(ctxMock.createOscillator).toHaveBeenCalled()
    delete window.matchMedia
  })
})

describe('feedback (combined)', () => {
  let vibrateMock, ctxMock

  beforeEach(() => {
    localStorage.clear()
    _resetForTests()
    vibrateMock = vi.fn()
    navigator.vibrate = vibrateMock

    const gainMock = {
      connect: vi.fn(),
      gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
    }
    const oscMock = {
      connect: vi.fn(() => gainMock),
      type: '',
      frequency: { value: 0 },
      start: vi.fn(),
      stop: vi.fn(),
    }
    ctxMock = {
      currentTime: 0,
      createOscillator: vi.fn(() => oscMock),
      createGain: vi.fn(() => gainMock),
      destination: {},
    }
    window.AudioContext = function MockAudioContext() {
      return ctxMock
    }
  })

  afterEach(() => {
    localStorage.clear()
    _resetForTests()
    delete navigator.vibrate
    delete window.AudioContext
  })

  it('fires both sound and haptic on a single call', () => {
    feedback('correct')
    expect(vibrateMock).toHaveBeenCalled()
    expect(ctxMock.createOscillator).toHaveBeenCalled()
  })

  it('respects individual prefs (sound off, haptics on)', () => {
    setPrefs({ sound: false })
    feedback('correct')
    expect(vibrateMock).toHaveBeenCalled()
    expect(ctxMock.createOscillator).not.toHaveBeenCalled()
  })

  it('respects individual prefs (haptics off, sound on)', () => {
    setPrefs({ haptics: false })
    feedback('correct')
    expect(vibrateMock).not.toHaveBeenCalled()
    expect(ctxMock.createOscillator).toHaveBeenCalled()
  })
})

describe('prefersReducedMotion', () => {
  afterEach(() => {
    delete window.matchMedia
  })

  it('returns true when matchMedia reports reduce', () => {
    window.matchMedia = vi.fn(() => ({ matches: true }))
    expect(prefersReducedMotion()).toBe(true)
  })

  it('returns false when matchMedia reports no-preference', () => {
    window.matchMedia = vi.fn(() => ({ matches: false }))
    expect(prefersReducedMotion()).toBe(false)
  })

  it('returns false when matchMedia is missing', () => {
    delete window.matchMedia
    expect(prefersReducedMotion()).toBe(false)
  })
})
