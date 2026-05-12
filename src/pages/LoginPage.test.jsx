import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LoginPage from './LoginPage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => mockNavigate,
}))

vi.mock('../lib/AuthContext', () => ({
  useAuth: () => ({ signIn: vi.fn().mockResolvedValue({ error: null }) }),
}))

const { mockResetPasswordForEmail, mockSignUp, mockRpc } = vi.hoisted(() => ({
  mockResetPasswordForEmail: vi.fn(),
  mockSignUp: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
  mockRpc: vi.fn().mockResolvedValue({ data: true }),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: mockResetPasswordForEmail,
      signUp: mockSignUp,
    },
    rpc: mockRpc,
  },
}))

function renderPage() {
  return render(<MemoryRouter><LoginPage /></MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('LoginPage — tagline and onboarding context', () => {
  it('renders a tagline below the title', () => {
    renderPage()
    expect(screen.getByText(/read aloud\. get ai feedback\. improve faster\./i)).toBeInTheDocument()
  })

  it('does not show the class code helper hint on the Sign In tab', () => {
    renderPage()
    expect(screen.queryByText(/ask your teacher for your class code/i)).not.toBeInTheDocument()
  })

  it('shows the class code helper hint on the Sign Up tab', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /sign up/i }))
    expect(screen.getByText(/ask your teacher for your class code/i)).toBeInTheDocument()
  })

  it('shows a "How does this work?" disclosure that is collapsed by default', () => {
    renderPage()
    const summary = screen.getByText(/how does this work\?/i)
    expect(summary).toBeInTheDocument()
    // Native <details> open attribute reflects state
    expect(summary.closest('details')).not.toHaveAttribute('open')
  })

  it('expands the disclosure to reveal three steps when clicked', () => {
    renderPage()
    const summary = screen.getByText(/how does this work\?/i)
    fireEvent.click(summary)
    expect(summary.closest('details')).toHaveAttribute('open')
    expect(screen.getByText(/pick a passage/i)).toBeInTheDocument()
    expect(screen.getByText(/read it aloud/i)).toBeInTheDocument()
    expect(screen.getByText(/instant feedback/i)).toBeInTheDocument()
  })
})

describe('LoginPage — signup grade is optional', () => {
  function fillSignupAndSubmit({ grade } = {}) {
    fireEvent.click(screen.getByRole('button', { name: /sign up/i }))
    fireEvent.change(screen.getByPlaceholderText(/aarav shah/i), { target: { value: 'Test Student' } })
    fireEvent.change(screen.getByPlaceholderText(/you@school\.com/i), { target: { value: 'student@test.com' } })
    fireEvent.change(screen.getByPlaceholderText(/at least 6 characters/i), { target: { value: 'pw123456' } })
    if (grade) {
      fireEvent.change(screen.getByLabelText(/grade/i), { target: { value: grade } })
    }
    fireEvent.change(screen.getByPlaceholderText(/ask your teacher/i), { target: { value: 'ABC123' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
  }

  it('creates an account when grade is left unselected', async () => {
    renderPage()
    fillSignupAndSubmit()
    await waitFor(() => expect(mockSignUp).toHaveBeenCalled())
    const callArg = mockSignUp.mock.calls[0][0]
    expect(callArg.options.data.grade).toBeNull()
  })

  it('passes the selected grade through to signUp when chosen', async () => {
    renderPage()
    fillSignupAndSubmit({ grade: '11' })
    await waitFor(() => expect(mockSignUp).toHaveBeenCalled())
    const callArg = mockSignUp.mock.calls[0][0]
    expect(callArg.options.data.grade).toBe('11')
  })

  it('grade dropdown is not required', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /sign up/i }))
    const select = screen.getByLabelText(/grade/i)
    expect(select).not.toBeRequired()
  })
})

describe('LoginPage — forgot password', () => {
  it('shows a Forgot password link in sign-in mode', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /forgot password/i })).toBeInTheDocument()
  })

  it('clicking Forgot password shows the forgot password form', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /forgot password/i }))
    expect(screen.getByRole('heading', { name: /forgot password/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument()
  })

  it('calls resetPasswordForEmail with entered email on submit', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /forgot password/i }))
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'student@test.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() =>
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
        'student@test.com',
        expect.objectContaining({ redirectTo: expect.stringContaining('/reset-password') })
      )
    )
  })

  it('shows confirmation message after successful submit', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /forgot password/i }))
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'student@test.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }))
    expect(await screen.findByText(/check your inbox/i)).toBeInTheDocument()
  })

  it('Back to sign in returns to sign-in form', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /forgot password/i }))
    fireEvent.click(screen.getByRole('button', { name: /back to sign in/i }))
    expect(screen.queryByRole('heading', { name: /forgot password/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /forgot password/i })).toBeInTheDocument()
  })
})
