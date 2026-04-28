import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import WeeklySummaryModal from './WeeklySummaryModal'

const baseData = {
  passagesLastWeek: 4,
  accuracyLastWeek: 82,
  accuracyPrevWeek: 75,
  trend: 'up',
  weekLabel: 'Apr 20 – Apr 24',
}

describe('WeeklySummaryModal', () => {
  it('renders the week label', () => {
    render(<WeeklySummaryModal data={baseData} streak={5} onDismiss={vi.fn()} />)
    expect(screen.getByText('Apr 20 – Apr 24')).toBeInTheDocument()
  })

  it('renders passages read count', () => {
    render(<WeeklySummaryModal data={baseData} streak={5} onDismiss={vi.fn()} />)
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('renders accuracy percentage', () => {
    render(<WeeklySummaryModal data={baseData} streak={5} onDismiss={vi.fn()} />)
    expect(screen.getByText('82%')).toBeInTheDocument()
  })

  it('shows ↑ for up trend', () => {
    render(<WeeklySummaryModal data={baseData} streak={5} onDismiss={vi.fn()} />)
    expect(screen.getByText('↑')).toBeInTheDocument()
  })

  it('shows ↓ for down trend', () => {
    const data = { ...baseData, trend: 'down' }
    render(<WeeklySummaryModal data={data} streak={5} onDismiss={vi.fn()} />)
    expect(screen.getByText('↓')).toBeInTheDocument()
  })

  it('shows → for same trend', () => {
    const data = { ...baseData, trend: 'same' }
    render(<WeeklySummaryModal data={data} streak={5} onDismiss={vi.fn()} />)
    expect(screen.getByText('→')).toBeInTheDocument()
  })

  it('shows — when no accuracy data', () => {
    const data = { ...baseData, accuracyLastWeek: null, trend: null }
    render(<WeeklySummaryModal data={data} streak={5} onDismiss={vi.fn()} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders streak count', () => {
    render(<WeeklySummaryModal data={baseData} streak={7} onDismiss={vi.fn()} />)
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('calls onDismiss when Let\'s go! is clicked', () => {
    const onDismiss = vi.fn()
    render(<WeeklySummaryModal data={baseData} streak={5} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /let's go/i }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})
