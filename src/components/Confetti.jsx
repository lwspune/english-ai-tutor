import { useEffect, useState } from 'react'
import { prefersReducedMotion } from '../lib/feedback'

const HUES = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#a855f7']

function makeParticles(count) {
  const seed = Date.now()
  return Array.from({ length: count }, (_, i) => ({
    key: `${seed}-${i}`,
    left: Math.random() * 100,
    delay: Math.random() * 200,
    hue: HUES[i % HUES.length],
    rotation: Math.random() * 360,
    duration: 1200 + Math.random() * 700,
    size: 6 + Math.floor(Math.random() * 6),
  }))
}

export default function Confetti({ active, count = 30, durationMs = 1800 }) {
  const [particles, setParticles] = useState(null)

  useEffect(() => {
    if (!active) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setParticles(null)
      return
    }
    if (prefersReducedMotion()) return
    setParticles(makeParticles(count))
    const t = setTimeout(() => setParticles(null), durationMs)
    return () => clearTimeout(t)
  }, [active, count, durationMs])

  if (!particles) return null

  return (
    <div
      data-testid="confetti"
      role="presentation"
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
    >
      {particles.map((p) => (
        <span
          key={p.key}
          className="absolute rounded-sm"
          style={{
            left: `${p.left}%`,
            top: '-12px',
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: p.hue,
            animation: `confetti-fall ${p.duration}ms ${p.delay}ms ease-out forwards`,
            transform: `rotate(${p.rotation}deg)`,
          }}
        />
      ))}
    </div>
  )
}
