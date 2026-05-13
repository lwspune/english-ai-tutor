import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const FEATURES = [
  {
    title: 'Read aloud, get scored',
    body: 'Record yourself reading a passage. Whisper-grade transcription scores accuracy, pace (WPM), and phrasing in seconds.',
  },
  {
    title: 'Targeted vocab drill',
    body: 'NDA-list words with synonyms, antonyms, and audio pronunciation. A Leitner spaced-repetition deck schedules reviews; words you skipped while reading come back as drill the next day.',
  },
  {
    title: 'Comprehension you can prove',
    body: '3–5 MCQs per passage, server-graded so you cannot peek. 80% mastery threshold — no faking your way through.',
  },
  {
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
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-800">English AI Tutor</p>
        <Link
          to="/login"
          className="text-sm text-indigo-600 hover:text-indigo-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
        >
          Sign in
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10 sm:py-16 space-y-12">
        <section className="text-center space-y-4">
          <h1 className="text-3xl sm:text-5xl font-bold text-slate-800 leading-tight">
            English AI Tutor for NDA aspirants
          </h1>
          <p className="text-base sm:text-lg text-slate-600 max-w-xl mx-auto">
            Read passages aloud. Get instant feedback on accuracy, pace, vocabulary, and comprehension.
            Built around the NDA English syllabus, not a generic test-prep app.
          </p>
          <p className="text-sm text-slate-500">
            Currently in private classroom use at <span className="font-medium text-slate-700">LWS Pune</span>.
            Opening for individual aspirants soon.
          </p>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FEATURES.map(f => (
            <div key={f.title} className="bg-white rounded-2xl border border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-slate-800 mb-1">{f.title}</h2>
              <p className="text-sm text-slate-600 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </section>

        <section className="bg-indigo-600 rounded-2xl p-6 sm:p-8 text-white space-y-4">
          <div>
            <p className="text-xs font-semibold text-indigo-200 uppercase tracking-wide mb-1">
              Early access
            </p>
            <h2 className="text-xl sm:text-2xl font-bold">Join the waitlist</h2>
            <p className="text-sm text-indigo-100 mt-1">
              Launching when the waitlist hits 50. Early-access members get first access and a discount at launch.
            </p>
          </div>
          {done ? (
            <div className="bg-white rounded-xl px-4 py-4 text-sm text-slate-700">
              {duplicate ? (
                <p>You're already on the list — we'll be in touch when we launch.</p>
              ) : (
                <p className="font-medium">You're on the list. Check your inbox when we launch.</p>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <label htmlFor="waitlist-email" className="block text-sm font-medium text-indigo-100">
                Email
              </label>
              <input
                id="waitlist-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full bg-white text-slate-800 rounded-lg px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                placeholder="you@email.com"
              />
              {error && (
                <div role="alert" className="text-sm text-red-100 bg-red-700/40 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-white text-indigo-700 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-50 disabled:opacity-60 transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                {submitting ? 'Adding you…' : 'Join the waitlist'}
              </button>
            </form>
          )}
        </section>

        <section className="text-center text-xs text-slate-400 space-y-1 pt-4">
          <p>
            Already in a participating class?{' '}
            <Link to="/login" className="text-indigo-600 hover:text-indigo-800 font-medium">
              Sign in with your class code
            </Link>
            .
          </p>
          <p>Built and run by <span className="font-medium text-slate-500">LWS Pune</span></p>
        </section>
      </main>
    </div>
  )
}
