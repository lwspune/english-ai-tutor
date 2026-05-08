import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const RESET_URL = 'https://english-ai-tutor-mauve.vercel.app/reset-password'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
  const [linkError, setLinkError] = useState(null) // 'expired' | 'invalid' | null
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [resetSubmitting, setResetSubmitting] = useState(false)

  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes('error=')) {
      const params = new URLSearchParams(hash.slice(1))
      const code = params.get('error_code')
      setLinkError(code === 'otp_expired' ? 'expired' : 'invalid')
      return
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSubmitting(false)

    if (error) { setError(error.message); return }
    navigate('/student')
  }

  async function handleResetRequest(e) {
    e.preventDefault()
    setResetSubmitting(true)
    await supabase.auth.resetPasswordForEmail(resetEmail, { redirectTo: RESET_URL })
    setResetSubmitting(false)
    setResetSent(true)
  }

  if (linkError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-md p-8 w-full max-w-sm">
          <h1 className="text-xl font-bold text-slate-800 mb-2">
            {linkError === 'expired' ? 'Link expired' : 'Invalid link'}
          </h1>
          <p className="text-sm text-slate-500 mb-6">
            {linkError === 'expired'
              ? 'This link has expired. Enter your email and we\'ll send you a fresh one.'
              : 'This link is invalid or has already been used. Enter your email to request a new one.'}
          </p>

          {resetSent ? (
            <p className="text-sm text-green-700 bg-green-50 rounded-lg px-4 py-3">
              Check your inbox — we've sent a fresh link to your email.
            </p>
          ) : (
            <form onSubmit={handleResetRequest} className="space-y-4">
              <div>
                <label htmlFor="reset-email" className="block text-sm font-medium text-slate-700 mb-1">
                  Email
                </label>
                <input
                  id="reset-email"
                  type="email"
                  value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                  required
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  placeholder="you@school.com"
                  aria-label="Email"
                />
              </div>
              <button
                type="submit"
                disabled={resetSubmitting}
                className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                {resetSubmitting ? 'Sending…' : 'Send new link'}
              </button>
            </form>
          )}
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-md p-8 w-full max-w-sm text-center">
          <p className="text-slate-500 text-sm">Waiting for your reset link to be verified…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-md p-8 w-full max-w-sm">
        <h1 className="text-xl font-bold text-slate-800 mb-2">Set your password</h1>
        <p className="text-sm text-slate-500 mb-6">Choose a password you'll use to log in each time.</p>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="rp-password" className="block text-sm font-medium text-slate-700 mb-1">
              New password
            </label>
            <input
              id="rp-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              placeholder="At least 8 characters"
              aria-label="New password"
            />
          </div>
          <div>
            <label htmlFor="rp-confirm" className="block text-sm font-medium text-slate-700 mb-1">
              Confirm password
            </label>
            <input
              id="rp-confirm"
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              placeholder="Repeat your password"
              aria-label="Confirm password"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            {submitting ? 'Setting password…' : 'Set password'}
          </button>
        </form>
      </div>
    </div>
  )
}
