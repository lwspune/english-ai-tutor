import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import AudioPlayButton from './AudioPlayButton'

vi.mock('../lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        getPublicUrl: (path) => ({
          data: { publicUrl: `https://example.com/${path}` },
        }),
      }),
    },
  },
}))

let lastAudio
let lastAudioSrc
const originalAudio = globalThis.Audio

beforeEach(() => {
  lastAudio = null
  lastAudioSrc = null
  function MockAudio(src) {
    this.src = src
    this.play = vi.fn(() => Promise.resolve())
    this.pause = vi.fn()
    this.addEventListener = vi.fn((event, cb) => {
      if (event === 'ended') this._onEnded = cb
    })
    this.removeEventListener = vi.fn()
    lastAudio = this
    lastAudioSrc = src
  }
  globalThis.Audio = MockAudio
})

afterEach(() => {
  globalThis.Audio = originalAudio
})

describe('AudioPlayButton', () => {
  it('renders nothing when audioPath is null', () => {
    const { container } = render(<AudioPlayButton audioPath={null} word="Abandon" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when audioPath is undefined', () => {
    const { container } = render(<AudioPlayButton word="Abandon" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a button with descriptive aria-label', () => {
    render(<AudioPlayButton audioPath="pronunciation/abc.mp3" word="Abandon" />)
    const btn = screen.getByRole('button', { name: /play pronunciation of abandon/i })
    expect(btn).toBeInTheDocument()
  })

  it('clicking the button creates an Audio with the public URL and plays it', () => {
    render(<AudioPlayButton audioPath="pronunciation/abc.mp3" word="Abandon" />)
    fireEvent.click(screen.getByRole('button'))
    expect(lastAudioSrc).toBe('https://example.com/pronunciation/abc.mp3')
    expect(lastAudio.play).toHaveBeenCalled()
  })

  it('clicking again while playing pauses', async () => {
    render(<AudioPlayButton audioPath="pronunciation/abc.mp3" word="Abandon" />)
    const btn = screen.getByRole('button')
    fireEvent.click(btn)
    expect(lastAudio.play).toHaveBeenCalledTimes(1)
    fireEvent.click(btn)
    expect(lastAudio.pause).toHaveBeenCalledTimes(1)
  })

  it('aria-label flips to "Stop" while playing', async () => {
    render(<AudioPlayButton audioPath="pronunciation/abc.mp3" word="Abandon" />)
    const btn = screen.getByRole('button')
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-label', expect.stringMatching(/stop/i))
  })

  it('reverts to "Play" after the audio ends', () => {
    render(<AudioPlayButton audioPath="pronunciation/abc.mp3" word="Abandon" />)
    const btn = screen.getByRole('button')
    fireEvent.click(btn)
    act(() => { lastAudio._onEnded?.() })
    expect(btn).toHaveAttribute('aria-label', expect.stringMatching(/play/i))
  })
})
