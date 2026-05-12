import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import StumbleDrillCard from './StumbleDrillCard'

function renderCard(props) {
  return render(
    <MemoryRouter>
      <StumbleDrillCard {...props} />
    </MemoryRouter>,
  )
}

describe('StumbleDrillCard', () => {
  it('renders nothing when stumbleWords is empty', () => {
    const { container } = renderCard({ stumbleWords: [], sessionId: 'sess1' })
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when stumbleWords is undefined', () => {
    const { container } = renderCard({ sessionId: 'sess1' })
    expect(container.firstChild).toBeNull()
  })

  it('renders a Practise heading and one chip per stumble word', () => {
    renderCard({
      stumbleWords: [
        { word: 'fraudulent', occurrences: [{ sessionId: 'sess1', status: 'substitution' }] },
        { word: 'discriminate', occurrences: [{ sessionId: 'sess1', status: 'omission' }] },
      ],
      sessionId: 'sess1',
    })
    expect(screen.getByRole('heading', { name: /practise/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /fraudulent/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /discriminate/i })).toBeInTheDocument()
  })

  it('chip links to /student/drill/:sessionId/:wordIndex', () => {
    renderCard({
      stumbleWords: [
        { word: 'fraudulent', occurrences: [{ sessionId: 'sess1', status: 'substitution' }] },
        { word: 'discriminate', occurrences: [{ sessionId: 'sess1', status: 'omission' }] },
      ],
      sessionId: 'sess1',
    })
    expect(screen.getByRole('link', { name: /fraudulent/i })).toHaveAttribute(
      'href',
      '/student/drill/sess1/0',
    )
    expect(screen.getByRole('link', { name: /discriminate/i })).toHaveAttribute(
      'href',
      '/student/drill/sess1/1',
    )
  })

  it('shows a recurring badge on words appearing in 2+ sessions', () => {
    renderCard({
      stumbleWords: [
        {
          word: 'fraudulent',
          occurrences: [
            { sessionId: 's_old', status: 'substitution' },
            { sessionId: 'sess1', status: 'substitution' },
            { sessionId: 's_older', status: 'omission' },
          ],
        },
      ],
      sessionId: 'sess1',
    })
    // The chip should surface the recurrence count somehow — looking for ×3 or 3x or similar
    expect(screen.getByRole('link', { name: /fraudulent/i })).toHaveTextContent(/3/)
  })

  it('does not show a recurring badge on one-off stumbles', () => {
    renderCard({
      stumbleWords: [
        { word: 'fraudulent', occurrences: [{ sessionId: 'sess1', status: 'substitution' }] },
      ],
      sessionId: 'sess1',
    })
    const link = screen.getByRole('link', { name: /fraudulent/i })
    // The whole link's accessible name shouldn't contain digits at all for a 1-occurrence word
    expect(link.textContent).not.toMatch(/\d/)
  })
})
