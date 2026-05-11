const PREFS_KEY = 'feedback_prefs'
const DEFAULTS = { sound: true, haptics: true }

export function getPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function setPrefs(prefs) {
  const merged = { ...getPrefs(), ...prefs }
  localStorage.setItem(PREFS_KEY, JSON.stringify(merged))
  return merged
}

export function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return !!window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const VIBE_PATTERNS = {
  tap: 10,
  swoosh: 15,
  correct: [10, 40, 10],
  wrong: [50, 50, 50],
  celebrate: [10, 30, 10, 30, 60],
}

export function vibrate(type) {
  if (!getPrefs().haptics) return
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  const pattern = VIBE_PATTERNS[type] ?? VIBE_PATTERNS.tap
  navigator.vibrate(pattern)
}

const TONES = {
  tap: [{ freq: 320, durMs: 30 }],
  swoosh: [{ freq: 200, durMs: 60, type: 'sawtooth' }],
  correct: [
    { freq: 523.25, durMs: 80 },
    { freq: 659.25, durMs: 110 },
  ],
  wrong: [
    { freq: 220, durMs: 80, type: 'sawtooth' },
    { freq: 165, durMs: 130, type: 'sawtooth' },
  ],
  celebrate: [
    { freq: 523.25, durMs: 80 },
    { freq: 659.25, durMs: 80 },
    { freq: 783.99, durMs: 80 },
    { freq: 1046.5, durMs: 160 },
  ],
}

let ctx = null
function getAudioCtx() {
  if (ctx) return ctx
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  try {
    ctx = new AC()
    return ctx
  } catch {
    return null
  }
}

export function playSound(type) {
  if (!getPrefs().sound) return
  const ac = getAudioCtx()
  if (!ac) return
  const notes = TONES[type] ?? TONES.tap
  let t = ac.currentTime
  for (const note of notes) {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = note.type ?? 'sine'
    osc.frequency.value = note.freq
    const dur = note.durMs / 1000
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.15, t + 0.005)
    gain.gain.setValueAtTime(0.15, t + Math.max(dur - 0.02, 0.005))
    gain.gain.linearRampToValueAtTime(0, t + dur)
    osc.connect(gain).connect(ac.destination)
    osc.start(t)
    osc.stop(t + dur)
    t += dur
  }
}

export function feedback(type) {
  playSound(type)
  vibrate(type)
}

export function _resetForTests() {
  ctx = null
}
