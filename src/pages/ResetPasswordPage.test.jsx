import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ResetPasswordPage from './ResetPasswordPage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => mockNavigate,
}))

const { mockUpdateUser, mockOnAuthStateChange, mockResetPasswordForEmail } = vi.hoisted(() => ({
  mockUpdateUser: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
  mockResetPasswordForEmail: vi.fn(),
}))

let authStateCallback = null
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: mockOnAuthStateChange,
      updateUser: mockUpdateUser,
      resetPasswordForEmail: mockResetPasswordForEmail,
    },
  },
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <ResetPasswordPage />
    </MemoryRouter>
  )
}

function fireRecoveryEvent() {
  act(() => {
    authStateCallback('PASSWORD_RECOVERY', { user: { id: 'u1' } })
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  authStateCallback = null
  window.location.hash = ''
  mockOnAuthStateChange.mockImplementation((cb) => {
    authStateCallback = cb
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
})

describe('ResetPasswordPage', () => {
  it('shows a waiting state before PASSWORD_RECOVERY fires', () => {
    renderPage()
    expect(screen.getByText(/waiting/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument()
  })

  it('shows the password form once PASSWORD_RECOVERY fires', () => {
    renderPage()
    fireRecoveryEvent()
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
  })

  it('shows an error when passwords do not match', async () => {
    renderPage()
    fireRecoveryEvent()
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'different123' } })
    fireEvent.click(screen.getByRole('button', { name: /set password/i }))
    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument()
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it('shows an error when password is under 8 characters', async () => {
    renderPage()
    fireRecoveryEvent()
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'short' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: /set password/i }))
    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument()
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it('calls supabase.auth.updateUser with the new password on submit', async () => {
    mockUpdateUser.mockResolvedValue({ error: null })
    renderPage()
    fireRecoveryEvent()
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'newpassword1' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'newpassword1' } })
    fireEvent.click(screen.getByRole('button', { name: /set password/i }))
    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newpassword1' }))
  })

  it('navigates to /student on success', async () => {

    mockUpdateUser.mockResolvedValue({ error: null })
    renderPage()
    fireRecoveryEvent()
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: 'newpassword1' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'newpassword1' } })
    fireEvent.click(screen.getByRole('button', { name: /set password/i }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/student'))
  })
})

describe('ResetPasswordPage — expired link', () => {
  it('shows expired message when hash contains error_code=otp_expired', () => {
    window.location.hash = '#error=access_denied&error_code=otp_expired'
    renderPage()
    expect(screen.getByRole('heading', { name: /expired/i })).toBeInTheDocument()
    expect(screen.queryByText(/waiting/i)).not.toBeInTheDocument()
  })

  it('shows generic invalid message for other error codes', () => {
    window.location.hash = '#error=access_denied&error_code=bad_code_verifier'
    renderPage()
    expect(screen.getByRole('heading', { name: /invalid/i })).toBeInTheDocument()
  })

  it('shows an email input to request a new link in expired state', () => {
    window.location.hash = '#error=access_denied&error_code=otp_expired'
    renderPage()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send new link/i })).toBeInTheDocument()
  })

  it('calls resetPasswordForEmail with entered email on submit', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null })
    window.location.hash = '#error=access_denied&error_code=otp_expired'
    renderPage()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'student@test.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send new link/i }))
    await waitFor(() =>
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
        'student@test.com',
        expect.objectContaining({ redirectTo: expect.stringContaining('/reset-password') })
      )
    )
  })

  it('shows confirmation after successful reset request', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null })
    window.location.hash = '#error=access_denied&error_code=otp_expired'
    renderPage()
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'student@test.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send new link/i }))
    expect(await screen.findByText(/check your inbox/i)).toBeInTheDocument()
  })
})
