import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LandingPage from './LandingPage'

const { mockInsert, insertResult } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  insertResult: { current: { data: null, error: null } },
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table) => {
      if (table === 'waitlist_signups') {
        return {
          insert: (payload) => {
            mockInsert(payload)
            return Promise.resolve(insertResult.current)
          },
        }
      }
      return {}
    },
  },
}))

function renderAt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LandingPage />
    </MemoryRouter>
  )
}

beforeEach(() => {
  mockInsert.mockReset()
  insertResult.current = { data: null, error: null }
})

describe('LandingPage — hero + content', () => {
  it('shows the product name and a tagline targeting NDA aspirants', () => {
    renderAt()
    expect(screen.getByRole('heading', { name: /english ai tutor/i, level: 1 })).toBeInTheDocument()
    expect(screen.getAllByText(/nda/i).length).toBeGreaterThan(0)
  })

  it('shows a "Sign in" link to /login for existing students who already have a class code', () => {
    renderAt()
    const links = screen.getAllByRole('link', { name: /sign in/i })
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/login')
    }
  })

  it('shows the launch trigger ("launching when waitlist hits 50") rather than a date', () => {
    renderAt()
    expect(screen.getByText(/waitlist hits 50/i)).toBeInTheDocument()
  })

  it('attributes the build to LWS Pune (no personal byline)', () => {
    renderAt()
    expect(screen.getAllByText(/lws pune/i).length).toBeGreaterThan(0)
  })

  it('does not show pricing on the page', () => {
    renderAt()
    expect(screen.queryByText(/₹|\bRs\.?\b|\bINR\b/i)).not.toBeInTheDocument()
  })
})

describe('LandingPage — waitlist form', () => {
  it('renders an email field and a submit button', () => {
    renderAt()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /join the waitlist/i })).toBeInTheDocument()
  })

  it('calls waitlist_signups.insert with the email on submit', async () => {
    renderAt()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'aspirant@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /join the waitlist/i }))
    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'aspirant@example.com' })
      )
    })
  })

  it('captures the `src` URL param as the source field', async () => {
    renderAt('/?src=reddit')
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } })
    fireEvent.click(screen.getByRole('button', { name: /join the waitlist/i }))
    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'reddit' })
      )
    })
  })

  it('omits source field when no `src` param is given', async () => {
    renderAt('/')
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } })
    fireEvent.click(screen.getByRole('button', { name: /join the waitlist/i }))
    await waitFor(() => expect(mockInsert).toHaveBeenCalled())
    const payload = mockInsert.mock.calls[0][0]
    expect(payload.source ?? null).toBeNull()
  })

  it('shows a thank-you state on success', async () => {
    renderAt()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } })
    fireEvent.click(screen.getByRole('button', { name: /join the waitlist/i }))
    await waitFor(() => expect(screen.getByText(/you're on the list/i)).toBeInTheDocument())
  })

  it('shows a friendly "already on the list" message on duplicate email', async () => {
    insertResult.current = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
    renderAt()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } })
    fireEvent.click(screen.getByRole('button', { name: /join the waitlist/i }))
    await waitFor(() => expect(screen.getByText(/already on the list/i)).toBeInTheDocument())
  })

  it('shows a generic error for non-duplicate failures', async () => {
    insertResult.current = { data: null, error: { code: 'XX000', message: 'network down' } }
    renderAt()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } })
    fireEvent.click(screen.getByRole('button', { name: /join the waitlist/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })
})
