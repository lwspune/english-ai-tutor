import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FeedbackSettingsSheet from './FeedbackSettingsSheet'
import { getPrefs, setPrefs, _resetForTests } from '../lib/feedback'

beforeEach(() => {
  localStorage.clear()
  _resetForTests()
  navigator.vibrate = vi.fn()
})

afterEach(() => {
  localStorage.clear()
  _resetForTests()
  delete navigator.vibrate
  delete window.AudioContext
})

describe('FeedbackSettingsSheet', () => {
  it('renders sound and haptic toggles', () => {
    render(<FeedbackSettingsSheet onClose={vi.fn()} />)
    expect(screen.getByTestId('toggle-sound')).toBeInTheDocument()
    expect(screen.getByTestId('toggle-haptics')).toBeInTheDocument()
  })

  it('reflects current prefs on first render (both on)', () => {
    render(<FeedbackSettingsSheet onClose={vi.fn()} />)
    expect(screen.getByTestId('toggle-sound')).toBeChecked()
    expect(screen.getByTestId('toggle-haptics')).toBeChecked()
  })

  it('reflects current prefs on first render (sound off persisted)', () => {
    setPrefs({ sound: false })
    render(<FeedbackSettingsSheet onClose={vi.fn()} />)
    expect(screen.getByTestId('toggle-sound')).not.toBeChecked()
    expect(screen.getByTestId('toggle-haptics')).toBeChecked()
  })

  it('toggling sound persists to localStorage', () => {
    render(<FeedbackSettingsSheet onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('toggle-sound'))
    expect(getPrefs().sound).toBe(false)
  })

  it('toggling haptics persists to localStorage', () => {
    render(<FeedbackSettingsSheet onClose={vi.fn()} />)
    fireEvent.click(screen.getByTestId('toggle-haptics'))
    expect(getPrefs().haptics).toBe(false)
  })

  it('clicking Done calls onClose', () => {
    const onClose = vi.fn()
    render(<FeedbackSettingsSheet onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /done/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('clicking the backdrop closes the sheet', () => {
    const onClose = vi.fn()
    render(<FeedbackSettingsSheet onClose={onClose} />)
    fireEvent.click(screen.getByTestId('feedback-sheet-backdrop'))
    expect(onClose).toHaveBeenCalled()
  })

  it('clicking inside the sheet does not close it', () => {
    const onClose = vi.fn()
    render(<FeedbackSettingsSheet onClose={onClose} />)
    fireEvent.click(screen.getByRole('heading', { level: 2 }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('enabling haptics fires a sample vibrate so the user feels confirmation', () => {
    setPrefs({ haptics: false })
    render(<FeedbackSettingsSheet onClose={vi.fn()} />)
    navigator.vibrate.mockClear()
    fireEvent.click(screen.getByTestId('toggle-haptics'))
    expect(navigator.vibrate).toHaveBeenCalled()
  })

  it('disabling haptics does NOT fire a sample vibrate', () => {
    render(<FeedbackSettingsSheet onClose={vi.fn()} />)
    navigator.vibrate.mockClear()
    fireEvent.click(screen.getByTestId('toggle-haptics'))
    expect(navigator.vibrate).not.toHaveBeenCalled()
  })
})
