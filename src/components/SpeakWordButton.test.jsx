import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SpeakWordButton from './SpeakWordButton'

const originalSynth = window.speechSynthesis
const originalUtterance = window.SpeechSynthesisUtterance

function installSynth() {
  const speak = vi.fn()
  const cancel = vi.fn()
  window.speechSynthesis = { speak, cancel, speaking: false }
  window.SpeechSynthesisUtterance = function (text) {
    this.text = text
    this.lang = ''
    this.rate = 1
  }
  return { speak, cancel }
}

function removeSynth() {
  delete window.speechSynthesis
  delete window.SpeechSynthesisUtterance
}

beforeEach(() => {
  installSynth()
})

afterEach(() => {
  if (originalSynth) window.speechSynthesis = originalSynth
  if (originalUtterance) window.SpeechSynthesisUtterance = originalUtterance
})

describe('SpeakWordButton', () => {
  it('renders a button when speechSynthesis is available', () => {
    render(<SpeakWordButton word="fraudulent" />)
    expect(screen.getByRole('button', { name: /pronunciation of fraudulent/i })).toBeInTheDocument()
  })

  it('calls speechSynthesis.speak with the word on click', () => {
    const { speak } = installSynth()
    render(<SpeakWordButton word="fraudulent" />)
    fireEvent.click(screen.getByRole('button'))
    expect(speak).toHaveBeenCalledTimes(1)
    expect(speak.mock.calls[0][0].text).toBe('fraudulent')
  })

  it('cancels any in-flight utterance before speaking a new one', () => {
    const { speak, cancel } = installSynth()
    render(<SpeakWordButton word="fraudulent" />)
    fireEvent.click(screen.getByRole('button'))
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(speak).toHaveBeenCalledTimes(1)
  })

  it('renders nothing when speechSynthesis is unavailable', () => {
    removeSynth()
    const { container } = render(<SpeakWordButton word="fraudulent" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when word is empty', () => {
    const { container } = render(<SpeakWordButton word="" />)
    expect(container.firstChild).toBeNull()
  })
})
