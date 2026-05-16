import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const FADE_UP = (delayMs) => ({
  animation: 'fade-up 0.6s ease-out both',
  animationDelay: `${delayMs}ms`,
})

function IconWrap({ children }) {
  return (
    <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
      {children}
    </div>
  )
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  )
}

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

function RepeatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  )
}

const FEATURES = [
  {
    icon: MicIcon,
    title: 'Read aloud, get scored',
    body: 'Record yourself reading a passage. Whisper-grade transcription scores accuracy, pace (WPM), and phrasing in seconds.',
  },
  {
    icon: BookIcon,
    title: 'Targeted vocab drill',
    body: 'NDA-list words with synonyms, antonyms, and audio pronunciation. A Leitner spaced-repetition deck schedules reviews; words you skipped while reading come back as drill the next day.',
  },
  {
    icon: CheckIcon,
    title: 'Comprehension you can prove',
    body: '3–5 MCQs per passage, server-graded so you cannot peek. 80% mastery threshold — no faking your way through.',
  },
  {
    icon: RepeatIcon,
    title: 'Stumble-word repetition',
    body: 'Words you mispronounce or skip get surfaced as one-sentence drills. Read them aloud in context until they stop tripping you up.',
  },
]

export default function LandingPage() {
  const [searchParams] = useSearchParams()
  const source = searchParams.get('src')

  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [duplicate, setDuplicate] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setDuplicate(false)
    setSubmitting(true)
    const payload = source ? { email, source } : { email }
    const { error: insertError } = await supabase.from('waitlist_signups').insert(payload)
    setSubmitting(false)
    if (insertError) {
      if (insertError.code === '23505') {
        setDuplicate(true)
        setDone(true)
        return
      }
      setError("Something went wrong. Please try again, or email tutor@lwspune.in")
      return
    }
    setDone(true)
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 backdrop-blur bg-white/80 border-b border-slate-100 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center" aria-hidden="true">
              <BookIcon />
            </div>
            <p className="text-sm font-semibold text-slate-900 tracking-tight">English AI Tutor</p>
          </div>
          <Link
            to="/login"
            className="text-sm font-medium text-slate-600 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded px-2 py-1"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main>
        {/* Hero with soft radial gradient */}
        <section
          className="relative px-4 pt-14 pb-12 sm:pt-20 sm:pb-16 overflow-hidden"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 50% 0%, #eef2ff 0%, #ffffff 70%)',
          }}
        >
          <div className="max-w-3xl mx-auto text-center space-y-6" style={FADE_UP(0)}>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-slate-200 text-xs font-medium text-slate-600 shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Live in classroom use at LWS Pune
            </div>
            <h1 className="text-4xl sm:text-6xl font-bold text-slate-900 tracking-tight leading-[1.05]">
              English AI Tutor
              <br />
              <span className="text-indigo-600">for NDA aspirants</span>
            </h1>
            <p className="text-base sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
              Read passages aloud. Get instant feedback on accuracy, pace, vocabulary,
              and comprehension. Built around the NDA English syllabus &mdash; not a
              generic test-prep app.
            </p>
            <p className="text-sm text-slate-500">
              Opening for individual aspirants soon.
            </p>
          </div>
        </section>

        {/* Features */}
        <section className="px-4 pb-12 sm:pb-16">
          <div className="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4" style={FADE_UP(150)}>
            {FEATURES.map(f => {
              const Icon = f.icon
              return (
                <div
                  key={f.title}
                  className="group bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-indigo-200 transition-all duration-200"
                >
                  <IconWrap><Icon /></IconWrap>
                  <h2 className="text-base font-semibold text-slate-900 mb-1.5 tracking-tight">{f.title}</h2>
                  <p className="text-sm text-slate-600 leading-relaxed">{f.body}</p>
                </div>
              )
            })}
          </div>
        </section>

        {/* Waitlist CTA */}
        <section className="px-4 pb-16">
          <div
            className="max-w-3xl mx-auto rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-white p-6 sm:p-10 shadow-sm"
            style={FADE_UP(300)}
          >
            <div className="max-w-md">
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-2">
                Early access
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                Join the waitlist
              </h2>
              <p className="text-sm sm:text-base text-slate-600 mt-2 leading-relaxed">
                Launching when the waitlist hits 50. Early-access members get first access and a discount at launch.
              </p>
            </div>

            {done ? (
              <div className="mt-6 max-w-md bg-white rounded-2xl border border-emerald-200 px-5 py-4 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex-shrink-0 flex items-center justify-center mt-0.5" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div className="text-sm text-slate-700 leading-relaxed">
                  {duplicate ? (
                    <p>You're already on the list &mdash; we'll be in touch when we launch.</p>
                  ) : (
                    <p className="font-medium">You're on the list. Check your inbox when we launch.</p>
                  )}
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-6 max-w-md space-y-3">
                <label htmlFor="waitlist-email" className="block text-sm font-medium text-slate-700">
                  Email
                </label>
                <input
                  id="waitlist-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full bg-white text-slate-900 border border-slate-300 rounded-xl px-4 py-3 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-indigo-500 transition-shadow"
                  placeholder="you@email.com"
                />
                {error && (
                  <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-indigo-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-all min-h-[44px] shadow-sm hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                >
                  {submitting ? 'Adding you…' : 'Join the waitlist'}
                </button>
              </form>
            )}
          </div>
        </section>

        {/* Footer */}
        <footer className="px-4 pb-10 pt-2" style={FADE_UP(450)}>
          <div className="max-w-3xl mx-auto text-center text-xs text-slate-500 space-y-2">
            <p>
              Already in a participating class?{' '}
              <Link to="/login" className="text-indigo-600 hover:text-indigo-700 font-medium">
                Sign in with your class code
              </Link>
              .
            </p>
            <p className="text-slate-400">
              Built and run by <span className="font-medium text-slate-600">LWS Pune</span> &middot; Made in Pune
            </p>
          </div>
        </footer>
      </main>
    </div>
  )
}
