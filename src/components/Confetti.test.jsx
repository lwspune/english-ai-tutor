import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import Confetti from './Confetti'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  delete window.matchMedia
})

describe('Confetti', () => {
  it('renders nothing when active=false', () => {
    const { container } = render(<Confetti active={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders particles when active=true', () => {
    render(<Confetti active={true} />)
    expect(screen.getByTestId('confetti')).toBeInTheDocument()
  })

  it('renders the requested number of particles', () => {
    render(<Confetti active={true} count={12} />)
    const container = screen.getByTestId('confetti')
    expect(container.querySelectorAll('span').length).toBe(12)
  })

  it('renders nothing when prefers-reduced-motion is set', () => {
    window.matchMedia = vi.fn(() => ({ matches: true }))
    const { container } = render(<Confetti active={true} />)
    expect(container.firstChild).toBeNull()
  })

  it('auto-removes after the specified duration', () => {
    render(<Confetti active={true} durationMs={1000} />)
    expect(screen.getByTestId('confetti')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1100)
    })
    expect(screen.queryByTestId('confetti')).toBeNull()
  })

  it('toggling active back to false hides confetti immediately', () => {
    const { rerender } = render(<Confetti active={true} />)
    expect(screen.getByTestId('confetti')).toBeInTheDocument()
    rerender(<Confetti active={false} />)
    expect(screen.queryByTestId('confetti')).toBeNull()
  })

  it('re-triggering active=true after dismissal shows confetti again', () => {
    const { rerender } = render(<Confetti active={true} durationMs={500} />)
    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(screen.queryByTestId('confetti')).toBeNull()
    rerender(<Confetti active={false} durationMs={500} />)
    rerender(<Confetti active={true} durationMs={500} />)
    expect(screen.getByTestId('confetti')).toBeInTheDocument()
  })
})
