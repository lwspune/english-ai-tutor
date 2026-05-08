import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

const RESET_URL = 'https://english-ai-tutor-mauve.vercel.app/reset-password'

export default function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('signin')

  // sign-in fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // sign-up fields
  const [name, setName] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [grade, setGrade] = useState('')
  const [classCode, setClassCode] = useState('')
  const [signupDone, setSignupDone] = useState(false)

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // forgot password state
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)

  function switchMode(next) {
    setMode(next)
    setError('')
    setSignupDone(false)
    setForgotSent(false)
    setForgotEmail('')
  }

  async function handleForgotPassword(e) {
    e.preventDefault()
    setForgotLoading(true)
    await supabase.auth.resetPasswordForEmail(forgotEmail, { redirectTo: RESET_URL })
    setForgotLoading(false)
    setForgotSent(true)
  }

  async function handleSignIn(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) { setError(error.message); return }
    navigate('/')
  }

  async function handleSignUp(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data: valid } = await supabase.rpc('validate_class_code', { p_code: classCode.trim() })
    if (!valid) {
      setError('Invalid class code. Ask your teacher for the correct code.')
      setLoading(false)
      return
    }

    const { data, error } = await supabase.auth.signUp({
      email: signupEmail,
      password: signupPassword,
      options: {
        data: { full_name: name.trim(), role: 'student', grade },
      },
    })

    setLoading(false)
    if (error) { setError(error.message); return }
    if (!data.session) {
      // email confirmation required
      setSignupDone(true)
    }
    // if session exists, onAuthStateChange navigates automatically
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-md p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-slate-800 mb-1 text-center">English AI Tutor</h1>
        <p className="text-sm text-slate-500 text-center mb-6">
          Read aloud. Get AI feedback. Improve faster.
        </p>

        {/* Mode tabs */}
        <div className="flex rounded-lg bg-slate-100 p-1 mb-6">
          {['signin', 'signup'].map(m => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                mode === m ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {m === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-3 mb-4">
            {error}
          </div>
        )}

        {mode === 'forgot' ? (
          forgotSent ? (
            <div className="text-center space-y-3">
              <p className="text-green-700 bg-green-50 rounded-lg px-4 py-3 text-sm">
                Check your inbox — we've sent a reset link to your email.
              </p>
              <button
                onClick={() => switchMode('signin')}
                className="text-indigo-600 text-sm hover:underline focus-visible:outline-none focus-visible:underline"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <div>
              <h2 className="text-base font-semibold text-slate-800 mb-1">Forgot password</h2>
              <p className="text-sm text-slate-500 mb-4">Enter your email and we'll send you a reset link.</p>
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label htmlFor="forgot-email" className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input
                    id="forgot-email"
                    type="email"
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    required
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    placeholder="you@school.com"
                    aria-label="Email"
                  />
                </div>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  {forgotLoading ? 'Sending…' : 'Send reset link'}
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="w-full text-sm text-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:underline"
                >
                  Back to sign in
                </button>
              </form>
            </div>
          )
        ) : mode === 'signin' ? (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="you@school.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors min-h-[44px]"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
            <button
              type="button"
              onClick={() => switchMode('forgot')}
              className="w-full text-sm text-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:underline"
            >
              Forgot password?
            </button>
          </form>
        ) : signupDone ? (
          <div className="text-center space-y-3">
            <p className="text-green-600 font-medium text-sm">Account created!</p>
            <p className="text-slate-500 text-sm">Check your email to confirm your account, then sign in.</p>
            <button
              onClick={() => switchMode('signin')}
              className="text-indigo-600 text-sm hover:underline"
            >
              Go to Sign In
            </button>
          </div>
        ) : (
          <form onSubmit={handleSignUp} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Aarav Shah"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={signupEmail}
                onChange={e => setSignupEmail(e.target.value)}
                required
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="you@school.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                value={signupPassword}
                onChange={e => setSignupPassword(e.target.value)}
                required
                minLength={6}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="At least 6 characters"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Grade</label>
              <select
                value={grade}
                onChange={e => setGrade(e.target.value)}
                required
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="">Select grade</option>
                {[9, 10, 11, 12].map(g => (
                  <option key={g} value={g}>Grade {g}</option>
                ))}
                <option value="MBA">MBA</option>
              </select>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600">
              Ask your teacher for your class code. It's usually 6 characters.
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Class Code</label>
              <input
                type="text"
                value={classCode}
                onChange={e => setClassCode(e.target.value)}
                required
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono tracking-widest uppercase"
                placeholder="Ask your teacher"
                maxLength={10}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors min-h-[44px]"
            >
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>
        )}
      </div>

      <details className="w-full max-w-sm mt-4 text-sm text-slate-500">
        <summary className="cursor-pointer text-center hover:text-slate-700 focus-visible:outline-none focus-visible:underline">
          How does this work?
        </summary>
        <ol className="mt-3 space-y-2 bg-white rounded-xl border border-slate-200 px-5 py-4 list-decimal list-inside text-slate-600">
          <li>Pick a passage from your teacher's list.</li>
          <li>Read it aloud — we'll record you.</li>
          <li>Get instant feedback on accuracy, pace, and phrasing.</li>
        </ol>
      </details>
    </div>
  )
}
