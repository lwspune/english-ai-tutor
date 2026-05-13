import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import WaitlistPage from './WaitlistPage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

const { rowsRef } = vi.hoisted(() => ({ rowsRef: { current: [] } }))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table) => {
      if (table === 'waitlist_signups') {
        return {
          select: () => ({
            order: () => Promise.resolve({ data: rowsRef.current, error: null }),
          }),
        }
      }
      return {}
    },
  },
}))

beforeEach(() => {
  mockNavigate.mockReset()
  rowsRef.current = []
})

describe('WaitlistPage', () => {
  it('renders the page header', async () => {
    render(<WaitlistPage />)
    await screen.findByRole('heading', { name: /waitlist/i })
  })

  it('shows an empty state when no signups exist', async () => {
    rowsRef.current = []
    render(<WaitlistPage />)
    await screen.findByText(/no signups yet/i)
  })

  it('renders one row per signup with email, source, and date', async () => {
    rowsRef.current = [
      { id: 'a', email: 'first@test.com', source: 'reddit', created_at: '2026-05-13T08:00:00Z' },
      { id: 'b', email: 'second@test.com', source: null, created_at: '2026-05-13T09:00:00Z' },
    ]
    render(<WaitlistPage />)
    await waitFor(() => {
      expect(screen.getByText('first@test.com')).toBeInTheDocument()
      expect(screen.getByText('second@test.com')).toBeInTheDocument()
    })
  })

  it('labels null source as "direct" so the column never reads as blank', async () => {
    rowsRef.current = [
      { id: 'a', email: 'organic@test.com', source: null, created_at: '2026-05-13T08:00:00Z' },
    ]
    render(<WaitlistPage />)
    await waitFor(() => {
      expect(screen.getByText('organic@test.com')).toBeInTheDocument()
    })
    expect(screen.getByTestId('source-cell-a')).toHaveTextContent(/direct/i)
  })

  it('renders the source-breakdown summary across all signups', async () => {
    rowsRef.current = [
      { id: 'a', email: 'a@x.com', source: 'reddit',   created_at: '2026-05-13T08:00:00Z' },
      { id: 'b', email: 'b@x.com', source: 'reddit',   created_at: '2026-05-13T08:00:00Z' },
      { id: 'c', email: 'c@x.com', source: 'telegram', created_at: '2026-05-13T08:00:00Z' },
      { id: 'd', email: 'd@x.com', source: null,       created_at: '2026-05-13T08:00:00Z' },
    ]
    render(<WaitlistPage />)
    await screen.findByText('a@x.com')
    const summary = screen.getByTestId('source-summary')
    expect(summary).toHaveTextContent(/reddit/i)
    expect(summary).toHaveTextContent(/2/)
    expect(summary).toHaveTextContent(/telegram/i)
    expect(summary).toHaveTextContent(/direct/i)
  })

  it('shows the total count', async () => {
    rowsRef.current = [
      { id: 'a', email: 'a@x.com', source: 'reddit',   created_at: '2026-05-13T08:00:00Z' },
      { id: 'b', email: 'b@x.com', source: 'reddit',   created_at: '2026-05-13T08:00:00Z' },
      { id: 'c', email: 'c@x.com', source: 'telegram', created_at: '2026-05-13T08:00:00Z' },
    ]
    render(<WaitlistPage />)
    await screen.findByText('a@x.com')
    expect(screen.getByTestId('total-count')).toHaveTextContent('3')
  })

  it('shows the launch trigger threshold (50) on the page', async () => {
    rowsRef.current = []
    render(<WaitlistPage />)
    await screen.findByText(/no signups yet/i)
    expect(screen.getAllByText(/50/).length).toBeGreaterThan(0)
  })
})
