import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import MilestoneList from './MilestoneList'

const ACCURACY_BEST = {
  id: 'm1',
  kind: 'personal_best_accuracy',
  achieved_at: '2026-05-07T10:00:00Z',
  payload: { score: 88, passage_id: 'p1' },
}
const STREAK_5 = {
  id: 'm2',
  kind: 'streak_5',
  achieved_at: '2026-05-08T10:00:00Z',
  payload: { streak: 5 },
}
const WORD_MASTERED = {
  id: 'm3',
  kind: 'word_mastered',
  achieved_at: '2026-05-05T10:00:00Z',
  payload: { word: 'abandon', word_id: 'w1' },
}
const COMP_ACED = {
  id: 'm4',
  kind: 'comprehension_aced',
  achieved_at: '2026-05-06T10:00:00Z',
  payload: { score: 100, passage_id: 'p1' },
}
const WPM_BEST = {
  id: 'm5',
  kind: 'personal_best_wpm',
  achieved_at: '2026-05-09T10:00:00Z',
  payload: { score: 165, passage_id: 'p1' },
}

describe('MilestoneList', () => {
  it('renders nothing when given an empty list', () => {
    const { container } = render(<MilestoneList milestones={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a list when milestones are present', () => {
    render(<MilestoneList milestones={[STREAK_5]} />)
    expect(screen.getByTestId('milestone-list')).toBeInTheDocument()
  })

  it('shows label for streak milestones', () => {
    render(<MilestoneList milestones={[STREAK_5]} />)
    expect(screen.getByText(/5-day streak/i)).toBeInTheDocument()
  })

  it('shows label for personal_best_accuracy with the score', () => {
    render(<MilestoneList milestones={[ACCURACY_BEST]} />)
    expect(screen.getByText(/new accuracy best/i)).toBeInTheDocument()
    expect(screen.getByText(/88%/)).toBeInTheDocument()
  })

  it('shows label for personal_best_wpm with the score', () => {
    render(<MilestoneList milestones={[WPM_BEST]} />)
    expect(screen.getByText(/new wpm best/i)).toBeInTheDocument()
    expect(screen.getByText(/165/)).toBeInTheDocument()
  })

  it('shows label for word_mastered with the word', () => {
    render(<MilestoneList milestones={[WORD_MASTERED]} />)
    expect(screen.getByText(/mastered/i)).toBeInTheDocument()
    expect(screen.getByText(/abandon/i)).toBeInTheDocument()
  })

  it('shows label for comprehension_aced with the score', () => {
    render(<MilestoneList milestones={[COMP_ACED]} />)
    expect(screen.getByText(/comprehension/i)).toBeInTheDocument()
    expect(screen.getByText(/100%/)).toBeInTheDocument()
  })

  it('renders each item with its date', () => {
    render(<MilestoneList milestones={[STREAK_5]} />)
    // Date format: "May 8" or similar locale-dependent — match the day token
    expect(screen.getByTestId('milestone-row-m2')).toHaveTextContent(/May/)
  })

  it('renders multiple milestones in given order', () => {
    render(<MilestoneList milestones={[STREAK_5, COMP_ACED, WORD_MASTERED]} />)
    const rows = screen.getAllByTestId(/^milestone-row-/)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveAttribute('data-testid', 'milestone-row-m2')
    expect(rows[1]).toHaveAttribute('data-testid', 'milestone-row-m4')
    expect(rows[2]).toHaveAttribute('data-testid', 'milestone-row-m3')
  })

  it('gracefully renders an unknown kind without crashing', () => {
    const unknown = { id: 'mx', kind: 'mystery', achieved_at: '2026-05-10T10:00:00Z', payload: {} }
    render(<MilestoneList milestones={[unknown]} />)
    expect(screen.getByTestId('milestone-row-mx')).toBeInTheDocument()
  })
})
