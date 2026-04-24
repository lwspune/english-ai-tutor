import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'

// Captures the onAuthStateChange callback so tests can fire auth events
let authStateCallback = null
let resolveProfile = null

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn((cb) => {
        authStateCallback = cb
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(() => new Promise((resolve) => { resolveProfile = resolve })),
    })),
  },
}))

function TestConsumer() {
  const { loading, profile, user } = useAuth()
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="profile">{profile ? profile.role : 'null'}</span>
      <span data-testid="user">{user ? user.id : 'null'}</span>
    </div>
  )
}

describe('AuthContext — sign-in loading state', () => {
  beforeEach(() => {
    authStateCallback = null
    resolveProfile = null
  })

  it('does not set loading=true on TOKEN_REFRESHED when profile is already loaded', async () => {
    render(<AuthProvider><TestConsumer /></AuthProvider>)

    // Sign in and resolve profile
    act(() => {
      authStateCallback('SIGNED_IN', { user: { id: 'user-123' } })
    })
    await act(async () => {
      resolveProfile({ data: { id: 'user-123', role: 'student' } })
    })
    expect(screen.getByTestId('loading').textContent).toBe('false')
    expect(screen.getByTestId('profile').textContent).toBe('student')

    // Tab regains focus — Supabase fires TOKEN_REFRESHED
    act(() => {
      authStateCallback('TOKEN_REFRESHED', { user: { id: 'user-123' } })
    })

    // loading must stay false — no page flash
    expect(screen.getByTestId('loading').textContent).toBe('false')
    expect(screen.getByTestId('profile').textContent).toBe('student')
  })

  it('sets loading=true while profile is being fetched after sign-in', async () => {
    render(<AuthProvider><TestConsumer /></AuthProvider>)

    // Wait for initial getSession (no session) to settle
    await act(async () => {})
    expect(screen.getByTestId('loading').textContent).toBe('false')
    expect(screen.getByTestId('profile').textContent).toBe('null')

    // Simulate a successful sign-in firing onAuthStateChange
    act(() => {
      authStateCallback('SIGNED_IN', { user: { id: 'user-123' } })
    })

    // Profile fetch is still pending — loading must be true so ProtectedRoute
    // shows a spinner instead of redirecting to /login
    expect(screen.getByTestId('loading').textContent).toBe('true')
    expect(screen.getByTestId('profile').textContent).toBe('null')

    // Now profile fetch resolves
    await act(async () => {
      resolveProfile({ data: { id: 'user-123', role: 'student' } })
    })

    expect(screen.getByTestId('loading').textContent).toBe('false')
    expect(screen.getByTestId('profile').textContent).toBe('student')
  })
})
